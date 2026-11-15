import { describe, expect, it } from "vitest";
import { ALL_CATEGORIES, CATEGORY_RULES, categorize } from "../src/spellbook/categories.ts";
import { extractFacets } from "../src/spellbook/facets.ts";
import { pf2eSpell } from "./fixtures/pf2e-spells.ts";

const categoriesOf = (path: string) => categorize(extractFacets(pf2eSpell(path)));

describe("categorize real pf2e spells", () => {
    it.each([
        ["rank-1/heal", ["healing"]],
        ["rank-3/fireball", ["damage"]],
        ["cantrip/electric-arc", ["damage"]],
        ["rank-1/fear", ["control"]],
        ["cantrip/shield", ["defense"]],
        ["rank-1/mystic-armor", ["defense"]],
        ["rank-4/fly", ["movement"]],
        ["cantrip/detect-magic", ["detection"]],
        ["rank-1/summon-animal", ["summoning"]],
    ])("%s → %j", (path, expected) => {
        expect(categoriesOf(path)).toEqual(expected);
    });

    it("gives a spell several categories when several rules match", () => {
        expect(categoriesOf("rank-2/invisibility")).toContain("buff");
    });

    it("falls back to Utility", () => {
        expect(categorize(extractFacets({ traits: { value: ["concentrate", "manipulate"] } }))).toEqual(["utility"]);
    });
});

describe("the rule table", () => {
    it("keeps one rule per category, with Utility as the fallback listed last", () => {
        const categories = CATEGORY_RULES.map((r) => r.category);
        expect(new Set(categories).size).toBe(categories.length);
        expect(ALL_CATEGORIES.at(-1)).toBe("utility");
        for (const rule of CATEGORY_RULES) expect(rule.why.length).toBeGreaterThan(0);
    });
});
