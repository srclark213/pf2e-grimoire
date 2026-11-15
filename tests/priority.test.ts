import { describe, expect, it } from "vitest";
import { DEFAULT_PRIORITY } from "../src/spellbook/cast-resolver.ts";
import { isDefaultPriority, movePriority, normalizePriority } from "../src/spellbook/priority.ts";

describe("normalizePriority", () => {
    it("uses the default when nothing is saved", () => {
        expect(normalizePriority(undefined)).toEqual([...DEFAULT_PRIORITY]);
        expect(normalizePriority("nonsense")).toEqual([...DEFAULT_PRIORITY]);
    });

    it("keeps a saved order", () => {
        const saved = ["wand", "slot", "focus", "innate", "staff", "scroll"];
        expect(normalizePriority(saved)).toEqual(saved);
    });

    it("drops unknown entries and duplicates, and appends missing groups in default order", () => {
        expect(normalizePriority(["innate", "bogus", "innate", 7, "wand"])).toEqual([
            "innate",
            "wand",
            "slot",
            "focus",
            "staff",
            "scroll",
        ]);
    });
});

describe("movePriority", () => {
    it("moves a group up or down", () => {
        expect(movePriority(["slot", "focus", "innate"], 2, -1)).toEqual(["slot", "innate", "focus"]);
        expect(movePriority(["slot", "focus", "innate"], 0, 1)).toEqual(["focus", "slot", "innate"]);
    });

    it("ignores moves past either end", () => {
        expect(movePriority(["slot", "focus"], 0, -1)).toEqual(["slot", "focus"]);
        expect(movePriority(["slot", "focus"], 1, 1)).toEqual(["slot", "focus"]);
    });
});

describe("isDefaultPriority", () => {
    it("recognizes the default order", () => {
        expect(isDefaultPriority([...DEFAULT_PRIORITY])).toBe(true);
        expect(isDefaultPriority(movePriority(DEFAULT_PRIORITY, 0, 1))).toBe(false);
    });
});
