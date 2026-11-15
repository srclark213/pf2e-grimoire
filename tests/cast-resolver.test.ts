import { describe, expect, it } from "vitest";
import { DEFAULT_PRIORITY, isAutoPickable, orderByPriority, resolveCast } from "../src/spellbook/cast-resolver.ts";
import type { CastOption, SourceKind } from "../src/spellbook/model.ts";

function option(kind: SourceKind, overrides: Partial<CastOption> = {}): CastOption {
    return {
        kind,
        entryId: `${kind}-entry`,
        entryName: kind,
        spellId: `${kind}-spell`,
        rank: 2,
        available: true,
        cost: { type: "free" },
        ...overrides,
    };
}

describe("resolveCast", () => {
    it("follows the default order: slot, focus, innate, staff, wand, scroll", () => {
        expect(DEFAULT_PRIORITY).toEqual(["slot", "focus", "innate", "staff", "wand", "scroll"]);
        const all = [option("scroll"), option("wand"), option("staff"), option("innate"), option("focus"), option("spontaneous")];
        const picks: SourceKind[] = [];
        let remaining = all;
        for (;;) {
            const pick = resolveCast(remaining);
            if (!pick) break;
            picks.push(pick.kind);
            remaining = remaining.filter((o) => o !== pick);
        }
        expect(picks).toEqual(["spontaneous", "focus", "innate", "staff", "wand", "scroll"]);
    });

    it("treats prepared and spontaneous slots as one group, keeping entry order between them", () => {
        const prepared = option("prepared");
        const spontaneous = option("spontaneous");
        expect(resolveCast([spontaneous, prepared])).toBe(spontaneous);
        expect(resolveCast([prepared, spontaneous])).toBe(prepared);
    });

    it("skips unavailable options", () => {
        const spentSlot = option("prepared", { available: false });
        const innate = option("innate");
        expect(resolveCast([spentSlot, innate])).toBe(innate);
    });

    it("uses a custom priority order", () => {
        const slot = option("prepared");
        const wand = option("wand");
        expect(resolveCast([slot, wand], ["wand", "slot"])).toBe(wand);
    });

    it("puts groups missing from a custom order last instead of dropping them", () => {
        const innate = option("innate");
        expect(resolveCast([innate], ["slot"])).toBe(innate);
        const slot = option("spontaneous");
        expect(resolveCast([innate, slot], ["slot"])).toBe(slot);
    });

    it("never auto-picks wand overcharge or staff + slot, even when nothing else is left", () => {
        const overcharge = option("wand-overcharge");
        const staffSlot = option("staff+slot");
        expect(resolveCast([overcharge, staffSlot])).toBeNull();
        expect(resolveCast([overcharge, staffSlot], ["wand", "staff"])).toBeNull();
        expect(isAutoPickable(overcharge)).toBe(false);
        expect(isAutoPickable(staffSlot)).toBe(false);
        expect(isAutoPickable(option("wand"))).toBe(true);
    });

    it("returns null when nothing is available", () => {
        expect(resolveCast([])).toBeNull();
        expect(resolveCast([option("prepared", { available: false })])).toBeNull();
    });
});

describe("orderByPriority", () => {
    it("lists options in priority order with manual-only options last, keeping entry order for ties", () => {
        const a = option("innate");
        const b = option("wand-overcharge");
        const c = option("prepared", { entryId: "p1" });
        const d = option("spontaneous", { entryId: "s1" });
        const e = option("wand");
        expect(orderByPriority([a, b, c, d, e]).map((o) => o.kind)).toEqual([
            "prepared",
            "spontaneous",
            "innate",
            "wand",
            "wand-overcharge",
        ]);
    });

    it("keeps unavailable options in the list", () => {
        const spent = option("prepared", { available: false });
        expect(orderByPriority([option("innate"), spent])[0]).toBe(spent);
    });
});
