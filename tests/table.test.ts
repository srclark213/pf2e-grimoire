import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import { extractFacets } from "../src/spellbook/facets.ts";
import { rankButtons } from "../src/spellbook/rank-buttons.ts";
import {
    actionGlyph,
    castsLeft,
    DEFAULT_SORT,
    gridRanks,
    normalizeColumns,
    normalizeSort,
    rankLabel,
    sortRows,
    splitRows,
    toggleSort,
} from "../src/spellbook/table.ts";
import { actor, cantrip, consumable, entry, slots, spell } from "./fixtures/spellbook.ts";

const save = (statistic: "fortitude" | "reflex" | "will") =>
    extractFacets({ defense: { save: { statistic, basic: false } } });

const rows = () =>
    aggregateSpells(
        actor([
            entry(
                "Spells",
                "spontaneous",
                [
                    spell("Fireball", { baseRank: 3, facets: save("reflex") }),
                    spell("Fear", { baseRank: 1, facets: save("will") }),
                    spell("Slow", { baseRank: 3, facets: save("fortitude") }),
                    spell("Disintegrate", { baseRank: 6, signature: true }),
                    cantrip("Ignition"),
                ],
                { slots: slots({ 1: { value: 1, max: 1 }, 3: { value: 1, max: 1 }, 6: { value: 1, max: 1 }, 7: { value: 1, max: 1 } }) },
            ),
        ]),
    );

const names = (list: { name: string }[]) => list.map((r) => r.name);

describe("sorting the spell table", () => {
    it("defaults to base rank then name, cantrips first", () => {
        expect(names(sortRows(rows(), DEFAULT_SORT))).toEqual(["Ignition", "Fear", "Fireball", "Slow", "Disintegrate"]);
    });

    it("sorts by name both ways", () => {
        expect(names(sortRows(rows(), { key: "name", dir: 1 }))).toEqual([
            "Disintegrate",
            "Fear",
            "Fireball",
            "Ignition",
            "Slow",
        ]);
        expect(names(sortRows(rows(), { key: "name", dir: -1 }))[0]).toBe("Slow");
    });

    it("sorts by save (Fortitude, Reflex, Will, then none), ties by rank and name", () => {
        expect(names(sortRows(rows(), { key: "save", dir: 1 }))).toEqual([
            "Slow",
            "Fireball",
            "Fear",
            "Ignition",
            "Disintegrate",
        ]);
    });

    it("flips direction on the same column and starts ascending on another", () => {
        expect(toggleSort({ key: "rank", dir: 1 }, "rank")).toEqual({ key: "rank", dir: -1 });
        expect(toggleSort({ key: "rank", dir: -1 }, "name")).toEqual({ key: "name", dir: 1 });
    });

    it("reads saved sort and column settings defensively", () => {
        expect(normalizeSort(undefined)).toEqual(DEFAULT_SORT);
        expect(normalizeSort({ key: "save", dir: -1 })).toEqual({ key: "save", dir: -1 });
        expect(normalizeSort({ key: "bogus", dir: 7 })).toEqual({ key: "rank", dir: 1 });
        expect(normalizeColumns(undefined)).toEqual({ rank: true, casts: true, from: true, cantrips: true });
        expect(normalizeColumns({ from: false, cantrips: false })).toEqual({
            rank: true,
            casts: true,
            from: false,
            cantrips: false,
        });
    });
});

describe("the rank grid", () => {
    it("runs from 1 to the highest rank a ranked spell can be cast at", () => {
        expect(gridRanks(rows())).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("isn't stretched by cantrips, which cast at the character's top rank", () => {
        const onlyLow = aggregateSpells(
            actor([
                entry("Spells", "spontaneous", [spell("Fear"), cantrip("Ignition", { rank: 7 })], {
                    slots: slots({ 1: { value: 1, max: 1 } }),
                }),
            ]),
        );
        expect(gridRanks(onlyLow)).toEqual([1]);
    });

    it("splits cantrips and focus spells from ranked spells", () => {
        const { autoHeightened, ranked } = splitRows(rows());
        expect(names(autoHeightened)).toEqual(["Ignition"]);
        expect(names(ranked)).toHaveLength(4);
        const disintegrate = ranked.find((r) => r.name === "Disintegrate")!;
        expect(rankButtons(disintegrate).map((b) => b.rank)).toEqual([6, 7]);
        expect(rankLabel(autoHeightened[0]!)).toBe("C");
        expect(rankLabel(disintegrate)).toBe("6");
    });
});

describe("action glyphs", () => {
    it("uses pf2e's action font characters", () => {
        expect(actionGlyph(["2"])).toBe("2");
        expect(actionGlyph(["reaction"])).toBe("R");
        expect(actionGlyph(["free"])).toBe("F");
        expect(actionGlyph(["1", "2", "3"])).toBe("1 – 3");
        expect(actionGlyph(["long"])).toBeNull();
        expect(actionGlyph([])).toBeNull();
    });
});

describe("casts left today", () => {
    const one = (row: ReturnType<typeof aggregateSpells>[number] | undefined) => castsLeft(row!);

    it("is unlimited for cantrips", () => {
        expect(one(rows().find((r) => r.name === "Ignition"))).toBeNull();
    });

    it("adds up a signature spell's slots at every rank it can use", () => {
        // Disintegrate (signature, base 6): one rank-6 slot and one rank-7 slot
        expect(one(rows().find((r) => r.name === "Disintegrate"))).toBe(2);
    });

    it("counts prepared copies, innate uses and focus points across sources", () => {
        const heal = spell("Heal", { id: "heal" });
        const [row] = aggregateSpells(
            actor(
                [
                    entry("Cleric", "prepared", [heal], {
                        slots: slots({
                            1: { prepared: [{ id: "heal", expended: false }, { id: "heal", expended: true }] },
                            2: { prepared: [{ id: "heal", expended: false }] },
                        }),
                    }),
                    entry("Innate", "innate", [spell("Heal", { id: "heal-i", uses: { value: 1, max: 1 } })]),
                ],
            ),
        );
        expect(castsLeft(row!)).toBe(3);
    });

    it("counts a wand as 1, scrolls by quantity, and a staff by charges over the cheapest cost", () => {
        const fireball = spell("Fireball", { baseRank: 3, rank: 3 });
        const [row] = aggregateSpells(
            actor([], {
                consumables: [
                    consumable("wand", fireball),
                    consumable("scroll", fireball, { quantity: 2 }),
                ],
                staves: [
                    {
                        id: "staff",
                        name: "Staff of Fire",
                        held: true,
                        preparedByMe: true,
                        preparedByOther: false,
                        charges: { value: 7, max: 7 },
                        list: {},
                        manual: false,
                        spells: [
                            { rank: 3, uuid: "u", spell: fireball, castable: true },
                            { rank: 4, uuid: "u", spell: { ...fireball, rank: 4 }, castable: true },
                        ],
                    },
                ],
            }),
        );
        // wand 1 + scrolls 2 + staff floor(7 / 3) = 2
        expect(castsLeft(row!)).toBe(5);
    });

    it("doesn't count a spent wand's overcharge", () => {
        const fireball = spell("Fireball", { baseRank: 3, rank: 3 });
        const [row] = aggregateSpells(
            actor([], { consumables: [consumable("wand", fireball, { uses: { value: 0, max: 1 } })] }),
        );
        expect(castsLeft(row!)).toBe(0);
    });
});
