import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import { rankButtons } from "../src/spellbook/rank-buttons.ts";
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

    it("gives an unprepared spell no buttons", () => {
        expect(buttonsFor(actor([entry("Wizard", "prepared", [spell("Alarm")])]), "Alarm")).toEqual([]);
    });
});
