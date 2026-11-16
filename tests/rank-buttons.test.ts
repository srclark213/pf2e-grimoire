import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import { castWarning, rankButtons } from "../src/spellbook/rank-buttons.ts";
import { actor, cantrip, entry, slots, spell } from "./fixtures/spellbook.ts";

function buttonsFor(snapshot: Parameters<typeof aggregateSpells>[0], name: string) {
    const row = aggregateSpells(snapshot).find((r) => r.name === name);
    if (!row) throw new Error(`no row for ${name}`);
    return rankButtons(row);
}

describe("rankButtons", () => {
    it("gives a prepared spell one button per slot rank, and clicks the unexpended slot", () => {
        const heal = spell("Heal", { id: "heal" });
        const buttons = buttonsFor(
            actor([
                entry("Cleric", "prepared", [heal], {
                    slots: slots({
                        1: { max: 2, prepared: [{ id: "heal", expended: true }, { id: "heal", expended: false }] },
                        3: { max: 1, prepared: [{ id: "heal", expended: true }] },
                    }),
                }),
            ]),
            "Heal",
        );
        expect(buttons.map((b) => [b.rank, b.available, b.option.slotIndex])).toEqual([
            [1, true, 1],
            [3, false, 0],
        ]);
    });

    it("gives a spontaneous spell a button at its rank", () => {
        const buttons = buttonsFor(
            actor([entry("Bard", "spontaneous", [spell("Fear")], { slots: slots({ 1: { max: 3, value: 0 } }) })]),
            "Fear",
        );
        expect(buttons.map((b) => [b.rank, b.available])).toEqual([[1, false]]);
    });

    it("gives a signature spell a button for each slotted rank", () => {
        const buttons = buttonsFor(
            actor([
                entry("Oracle", "spontaneous", [spell("Heal", { signature: true })], {
                    slots: slots({ 1: { max: 3, value: 3 }, 2: { max: 3, value: 3 }, 3: { max: 2, value: 2 } }),
                }),
            ]),
            "Heal",
        );
        expect(buttons.map((b) => b.rank)).toEqual([1, 2, 3]);
    });

    it("gives cantrips and focus spells one button at their heightened rank", () => {
        const snapshot = actor(
            [
                entry("Wizard", "spontaneous", [cantrip("Daze", { rank: 3 })]),
                entry("Focus", "focus", [spell("Fire Ray", { isFocus: true, rank: 3 })]),
            ],
            { focus: { value: 1, max: 2 } },
        );
        expect(buttonsFor(snapshot, "Daze").map((b) => [b.rank, b.available])).toEqual([[3, true]]);
        expect(buttonsFor(snapshot, "Fire Ray").map((b) => [b.rank, b.available])).toEqual([[3, true]]);
    });

    it("merges sources at the same rank into one button that clicks the first available source", () => {
        const buttons = buttonsFor(
            actor([
                entry("Animist Prepared", "prepared", [spell("Heal", { id: "heal-a" })], {
                    sort: 1,
                    slots: slots({ 1: { max: 1, prepared: [{ id: "heal-a", expended: true }] } }),
                }),
                entry("Apparition Spells", "spontaneous", [spell("Heal", { id: "heal-b" })], {
                    sort: 2,
                    slots: slots({ 1: { max: 2, value: 1 } }),
                }),
            ]),
            "Heal",
        );
        expect(buttons).toHaveLength(1);
        expect(buttons[0]?.options).toHaveLength(2);
        expect(buttons[0]?.option.entryName).toBe("Apparition Spells");
    });

    it("clicks a slot before an innate use, whatever the entry order", () => {
        const buttons = buttonsFor(
            actor([
                entry("Elf Magic", "innate", [spell("Fear", { id: "fear-innate", uses: { value: 1, max: 1 } })], {
                    sort: 1,
                }),
                entry("Sorcerer", "spontaneous", [spell("Fear", { id: "fear-slot" })], {
                    sort: 2,
                    slots: slots({ 1: { max: 3, value: 3 } }),
                }),
            ]),
            "Fear",
        );
        expect(buttons[0]?.option.kind).toBe("spontaneous");
    });

    it("doesn't list an unprepared spellbook spell at all", () => {
        expect(() => buttonsFor(actor([entry("Wizard", "prepared", [spell("Alarm")], { slots: slots() })]), "Alarm")).toThrow(
            "no row for Alarm",
        );
    });
});

describe("running-low warnings", () => {
    const fireball = spell("Fireball", { id: "fb", baseRank: 3 });
    const buttonAt = (slotsByRank: Parameters<typeof slots>[0], rank = 3) =>
        rankButtons(
            aggregateSpells(actor([entry("Spells", "spontaneous", [fireball], { slots: slots(slotsByRank) })]))[0]!,
        ).find((b) => b.rank === rank)!;

    it("counts a spontaneous rank's slots and warns at 2 (low) and 1 (last) once some are used", () => {
        expect(buttonAt({ 3: { value: 4, max: 4 } })).toMatchObject({ casts: { left: 4, max: 4 }, warning: null });
        expect(buttonAt({ 3: { value: 3, max: 4 } }).warning).toBeNull();
        expect(buttonAt({ 3: { value: 2, max: 4 } }).warning).toBe("low");
        expect(buttonAt({ 3: { value: 1, max: 4 } }).warning).toBe("last");
        expect(buttonAt({ 3: { value: 0, max: 4 } }).warning).toBeNull();
    });

    it("doesn't flag something that only ever had one or two uses until one is spent", () => {
        expect(buttonAt({ 3: { value: 2, max: 2 } }).warning).toBeNull();
        expect(buttonAt({ 3: { value: 1, max: 2 } }).warning).toBe("last");
        expect(castWarning({ left: 1, max: 1 })).toBeNull();
    });

    it("counts every prepared copy at the rank", () => {
        const prepared = entry("Druid", "prepared", [fireball], {
            slots: slots({
                3: {
                    prepared: [
                        { id: "fb", expended: false },
                        { id: "fb", expended: true },
                        { id: "fb", expended: false },
                    ],
                },
            }),
        });
        const [button] = rankButtons(aggregateSpells(actor([prepared]))[0]!);
        expect(button).toMatchObject({ casts: { left: 2, max: 3 }, warning: "low" });
    });

    it("adds separate pools together, and leaves cantrips alone", () => {
        const both = aggregateSpells(
            actor([
                entry("Spells", "spontaneous", [fireball], { slots: slots({ 3: { value: 1, max: 3 } }) }),
                entry("Innate", "innate", [spell("Fireball", { id: "fb-i", baseRank: 3, uses: { value: 1, max: 1 } })]),
            ]),
        );
        expect(rankButtons(both[0]!)[0]).toMatchObject({ casts: { left: 2, max: 4 }, warning: "low" });

        const cantripRow = aggregateSpells(actor([entry("Spells", "spontaneous", [cantrip("Ignition")])]))[0]!;
        expect(rankButtons(cantripRow)[0]).toMatchObject({ casts: null, warning: null });
    });
});
