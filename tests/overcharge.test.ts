import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import { rankButtons } from "../src/spellbook/rank-buttons.ts";
import {
    OVERCHARGE_DC,
    canOvercharge,
    overchargeOutcome,
    overchargeStep,
    readWandState,
} from "../src/spellbook/overcharge.ts";
import { actor, consumable, spell } from "./fixtures/spellbook.ts";

describe("overcharge state machine", () => {
    it("reads flags defensively", () => {
        expect(readWandState(undefined)).toEqual({ broken: false, overchargedToday: false });
        expect(readWandState({ broken: null, overchargedOn: null })).toEqual({ broken: false, overchargedToday: false });
        expect(readWandState({ broken: true, overchargedOn: 3600 })).toEqual({ broken: true, overchargedToday: true });
    });

    it("only allows overcharging an intact wand whose daily use is spent", () => {
        expect(canOvercharge({ broken: false, overchargedToday: false }, 1)).toBe(false);
        expect(canOvercharge({ broken: false, overchargedToday: false }, 0)).toBe(true);
        expect(canOvercharge({ broken: true, overchargedToday: true }, 0)).toBe(false);
        // Repaired after today's overcharge: allowed, but it will destroy the wand.
        expect(canOvercharge({ broken: false, overchargedToday: true }, 0)).toBe(true);
    });

    it("casts then checks the first time, and destroys without a spell the second time that day", () => {
        expect(overchargeStep({ broken: false, overchargedToday: false })).toEqual({ type: "cast-then-check" });
        expect(overchargeStep({ broken: false, overchargedToday: true })).toEqual({ type: "destroy" });
    });

    it("breaks the wand on a flat check of 10 or more and destroys it below that", () => {
        expect(OVERCHARGE_DC).toBe(10);
        expect(overchargeOutcome(10)).toBe("broken");
        expect(overchargeOutcome(20)).toBe("broken");
        expect(overchargeOutcome(9)).toBe("destroyed");
        expect(overchargeOutcome(1)).toBe("destroyed");
    });
});

describe("overcharge in the spell list", () => {
    const haste = spell("Haste", { baseRank: 3 });
    const rowFor = (overrides: Parameters<typeof consumable>[2]) =>
        aggregateSpells(actor([], { consumables: [consumable("wand", haste, overrides)] }))[0]!;

    it("is not offered while the daily use is left", () => {
        expect(rowFor({}).castOptions.map((o) => o.kind)).toEqual(["wand"]);
    });

    it("is offered in the menu once the use is spent, but never picked by a click", () => {
        const row = rowFor({ uses: { value: 0, max: 1 } });
        const [button] = rankButtons(row);
        expect(button!.available).toBe(false);
        expect(button!.options.map((o) => [o.kind, o.available])).toEqual([
            ["wand", false],
            ["wand-overcharge", true],
        ]);
        expect(button!.options[1]!.cost).toEqual({ type: "overcharge", destroys: false });
        // The row and its badge read as spent: overcharging is a last resort.
        expect(row.available).toBe(false);
        expect(row.sources[0]!.available).toBe(false);
    });

    it("warns that a second overcharge the same day destroys the wand", () => {
        const row = rowFor({ uses: { value: 0, max: 1 }, overchargedToday: true });
        expect(row.castOptions[1]!.cost).toEqual({ type: "overcharge", destroys: true });
    });

    it("shows a broken wand as unavailable, with no overcharge, even after rest refills it", () => {
        const row = rowFor({ uses: { value: 1, max: 1 }, broken: true, overchargedToday: true });
        expect(row.castOptions).toEqual([expect.objectContaining({ kind: "wand", available: false, reason: "broken" })]);
    });

    it("is not offered for a wand only usable through Trick Magic Item", () => {
        const row = rowFor({ uses: { value: 0, max: 1 }, viaTrickMagicItem: true });
        expect(row.castOptions.map((o) => o.kind)).toEqual(["wand"]);
    });
});
