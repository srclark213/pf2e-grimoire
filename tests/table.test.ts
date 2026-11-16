import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import { extractFacets } from "../src/spellbook/facets.ts";
import { rankButtons } from "../src/spellbook/rank-buttons.ts";
import {
    actionGlyph,
    DEFAULT_SORT,
    gridRanks,
    normalizeColumns,
    normalizeSort,
    rankLabel,
    normalizeCollapsedSections,
    sectionRows,
    sortRows,
    splitRows,
    toggleSection,
    toggleSort,
} from "../src/spellbook/table.ts";
import { actor, cantrip, entry, slots, spell } from "./fixtures/spellbook.ts";

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
        expect(normalizeColumns(undefined)).toEqual({ rank: true, from: true, cantrips: true });
        expect(normalizeColumns({ from: false, cantrips: false })).toEqual({ rank: true, from: false, cantrips: false });
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

describe("sections", () => {
    const named = (names: string[]) => names.map((n) => spell(n));
    const nameRows = (names: string[]) =>
        sortRows(
            aggregateSpells(actor([entry("Spells", "spontaneous", named(names), { slots: slots({ 1: { value: 1, max: 1 } }) })])),
            { key: "name", dir: 1 },
        );
    const summary = (sections: ReturnType<typeof sectionRows>) =>
        sections.map((s) => `${s.key}=${s.rows.map((r) => r.name).join(",")}`);

    it("makes one section per base rank when sorted by rank", () => {
        const sorted = sortRows(splitRows(rows()).ranked, DEFAULT_SORT);
        expect(summary(sectionRows(sorted, DEFAULT_SORT))).toEqual([
            "rank:1=Fear",
            "rank:3=Fireball,Slow",
            "rank:6=Disintegrate",
        ]);
    });

    it("makes save sections, with spells that have none last", () => {
        const sort = { key: "save", dir: 1 } as const;
        const sorted = sortRows(splitRows(rows()).ranked, sort);
        expect(summary(sectionRows(sorted, sort))).toEqual([
            "save:fortitude=Slow",
            "save:reflex=Fireball",
            "save:will=Fear",
            "save:none=Disintegrate",
        ]);
        expect(sectionRows(sorted, sort)[3]!.label).toEqual({ kind: "save", save: null });
    });

    it("groups names into letter ranges of about 3 to 5 spells", () => {
        const sections = sectionRows(
            nameRows([
                "Alarm", "Bane", "Bless", "Command", "Fear", "Fireball", "Fly", "Floating Flame", "Haste",
                "Heal", "Heroism", "Slow", "Sunburst", "Teleport",
            ]),
            { key: "name", dir: 1 },
        );
        expect(sections.map((s) => [s.key, s.rows.length])).toEqual([
            ["name:A-B", 3],
            ["name:C-F", 5],
            ["name:H", 3],
            ["name:S-T", 3],
        ]);
        expect(sections[1]!.label).toEqual({ kind: "letters", from: "C", to: "F" });
    });

    it("keeps a big letter on its own and folds a short last run into the one before", () => {
        const sections = sectionRows(
            nameRows(["Heal", "Haste", "Heroism", "Harm", "Hydraulic Push", "Hideous Laughter", "Zap"]),
            { key: "name", dir: 1 },
        );
        expect(sections.map((s) => [s.key, s.rows.length])).toEqual([["name:H-Z", 7]]);
    });

    it("toggles collapsed sections and reads saved ones defensively", () => {
        expect(toggleSection([], "rank:3")).toEqual(["rank:3"]);
        expect(toggleSection(["rank:3", "save:will"], "rank:3")).toEqual(["save:will"]);
        expect(normalizeCollapsedSections(["rank:1", 4, null])).toEqual(["rank:1"]);
        expect(normalizeCollapsedSections(undefined)).toEqual([]);
    });
});
