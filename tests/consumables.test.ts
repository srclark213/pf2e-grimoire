import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import { rankButtons } from "../src/spellbook/rank-buttons.ts";
import { actor, consumable, entry, slots, spell } from "./fixtures/spellbook.ts";

const haste = spell("Haste", { baseRank: 3 });
const teleport = spell("Teleport", { baseRank: 6 });

describe("wands and scrolls as sources", () => {
    it("joins the row of a spell the character already knows, with its own badge", () => {
        const rows = aggregateSpells(
            actor([entry("Arcane", "spontaneous", [haste], { slots: slots({ 3: { value: 1, max: 2 } }) })], {
                consumables: [consumable("scroll", haste)],
            }),
        );
        expect(rows).toHaveLength(1);
        const row = rows[0]!;
        expect(row.sources.map((s) => [s.entryName, s.kind])).toEqual([
            ["Arcane", "spontaneous"],
            ["Scroll of Haste (Rank 3)", "scroll"],
        ]);
        // Wands and scrolls hold their own copy of the spell, so tags stay on the known spell only.
        expect(row.spellIds).toEqual(["haste-id"]);
    });

    it("gives a spell only found on an item its own row at the item's rank", () => {
        const [row] = aggregateSpells(actor([], { consumables: [consumable("wand", teleport)] }));
        expect(row).toMatchObject({ name: "Teleport", baseRank: 6, spellIds: [], available: true });
        expect(row!.castOptions).toEqual([
            {
                kind: "wand",
                entryId: "wand-teleport-id",
                entryName: "Wand of Teleport (Rank 6)",
                spellId: "wand-teleport-id",
                rank: 6,
                available: true,
                cost: { type: "wand", value: 1, max: 1 },
            },
        ]);
    });

    it("casts a heightened scroll at the scroll's rank, not the spell's base rank", () => {
        const heal = spell("Heal", { baseRank: 1, rank: 3 });
        const [row] = aggregateSpells(actor([], { consumables: [consumable("scroll", heal, { quantity: 2 })] }));
        expect(row!.baseRank).toBe(1);
        expect(rankButtons(row!).map((b) => b.rank)).toEqual([3]);
        expect(row!.castOptions[0]!.cost).toEqual({ type: "scroll", quantity: 2 });
    });

    it("marks a wand whose daily use is spent as unavailable", () => {
        const [row] = aggregateSpells(
            actor([], { consumables: [consumable("wand", teleport, { uses: { value: 0, max: 1 } })] }),
        );
        expect(row!.castOptions[0]).toMatchObject({ available: false, reason: "no-uses" });
        expect(row!.available).toBe(false);
        expect(row!.sources[0]!.available).toBe(false);
    });

    it("marks items whose spell the character can't cast as unavailable", () => {
        const [row] = aggregateSpells(
            actor([], {
                consumables: [consumable("wand", teleport, { castable: false }), consumable("scroll", teleport, { castable: false })],
            }),
        );
        expect(row!.castOptions.map((o) => [o.kind, o.available, o.reason])).toEqual([
            ["wand", false, "cannot-cast"],
            ["scroll", false, "cannot-cast"],
        ]);
    });

    it("prefers a slot, then the wand, then the scroll, by default", () => {
        const rows = aggregateSpells(
            actor([entry("Arcane", "spontaneous", [haste], { slots: slots({ 3: { value: 1, max: 1 } }) })], {
                consumables: [consumable("scroll", haste), consumable("wand", haste)],
            }),
        );
        const [button] = rankButtons(rows[0]!);
        expect(button!.option.kind).toBe("spontaneous");
        expect(button!.options.map((o) => o.kind)).toEqual(["spontaneous", "wand", "scroll"]);

        const noSlots = aggregateSpells(
            actor([entry("Arcane", "spontaneous", [haste], { slots: slots({ 3: { value: 0, max: 1 } }) })], {
                consumables: [consumable("scroll", haste), consumable("wand", haste)],
            }),
        );
        expect(rankButtons(noSlots[0]!)[0]!.option.kind).toBe("wand");
    });
});
