import { describe, expect, it } from "vitest";
import { badgeLabel, cantripRank } from "../src/spellbook/labels.ts";

describe("badgeLabel", () => {
    it("drops a trailing 'Spells'", () => {
        expect(badgeLabel("Divine Prepared Spells")).toBe("Divine Prepared");
        expect(badgeLabel("Focus spells")).toBe("Focus");
    });

    it("keeps names without it, and never returns an empty label", () => {
        expect(badgeLabel("Apparition Magic")).toBe("Apparition Magic");
        expect(badgeLabel("Spells")).toBe("Spells");
    });
});

describe("cantripRank", () => {
    it("is half the level rounded up, at least 1", () => {
        expect([0, 1, 2, 5, 20].map(cantripRank)).toEqual([1, 1, 1, 3, 10]);
    });
});
