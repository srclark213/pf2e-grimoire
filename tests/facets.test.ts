import { describe, expect, it } from "vitest";
import { extractFacets, linkedConditions, parseActions } from "../src/spellbook/facets.ts";
import { pf2eSpell } from "./fixtures/pf2e-spells.ts";

describe("extractFacets on real pf2e spells", () => {
    it("Fireball: basic Reflex, fire, 2 actions, 20-foot burst at 500 feet", () => {
        expect(extractFacets(pf2eSpell("rank-3/fireball"))).toMatchObject({
            defense: "reflex",
            basicSave: true,
            isAttack: false,
            damageTypes: ["fire"],
            heals: false,
            actions: ["2"],
            rangeFeet: 500,
            area: { type: "burst", size: 20 },
        });
    });

    it("Heal: heals, damages with vitality, basic Fortitude, 1 to 3 actions", () => {
        const facets = extractFacets(pf2eSpell("rank-1/heal"));
        expect(facets).toMatchObject({
            defense: "fortitude",
            basicSave: true,
            heals: true,
            damageTypes: ["vitality"],
            actions: ["1", "2", "3"],
            range: "varies",
            rangeFeet: null,
        });
        expect(facets.traits).toContain("healing");
    });

    it("Fear: non-basic Will, no damage, links frightened and fleeing", () => {
        expect(extractFacets(pf2eSpell("rank-1/fear"))).toMatchObject({
            defense: "will",
            basicSave: false,
            damageTypes: [],
            heals: false,
            actions: ["2"],
            rangeFeet: 30,
            conditions: ["frightened", "fleeing"],
        });
    });

    it("Electric Arc: basic Reflex electricity cantrip", () => {
        const facets = extractFacets(pf2eSpell("cantrip/electric-arc"));
        expect(facets).toMatchObject({ defense: "reflex", basicSave: true, damageTypes: ["electricity"], actions: ["2"] });
        expect(facets.traits).toContain("cantrip");
    });

    it("Force Barrage: no defense, force damage, variable actions", () => {
        expect(extractFacets(pf2eSpell("rank-1/force-barrage"))).toMatchObject({
            defense: null,
            damageTypes: ["force"],
            actions: ["1", "2", "3"],
        });
    });
});

describe("extractFacets edge cases", () => {
    it("treats attack spells as targeting AC", () => {
        expect(extractFacets({ traits: { value: ["attack", "fire"] } })).toMatchObject({ defense: "ac", isAttack: true });
    });

    it("accepts damage kinds as a Set, as on an actor's prepared spell", () => {
        const facets = extractFacets({ damage: { a: { type: "vitality", kinds: new Set(["damage", "healing"]) } } });
        expect(facets).toMatchObject({ heals: true, damageTypes: ["vitality"] });
    });

    it("reads passive defenses", () => {
        expect(extractFacets({ defense: { passive: { statistic: "will-dc" } } }).defense).toBe("will");
    });

    it("copes with missing data", () => {
        expect(extractFacets({})).toEqual({
            defense: null,
            basicSave: false,
            isAttack: false,
            damageTypes: [],
            heals: false,
            actions: [],
            traits: [],
            range: null,
            rangeFeet: null,
            area: null,
            conditions: [],
            effects: [],
        });
    });
});

describe("parseActions", () => {
    it.each([
        ["1", ["1"]],
        ["2", ["2"]],
        ["1 to 3", ["1", "2", "3"]],
        ["2 to 3", ["2", "3"]],
        ["1 or 2", ["1", "2"]],
        ["reaction", ["reaction"]],
        ["free", ["free"]],
        ["10 minutes", ["long"]],
        ["1 hour", ["long"]],
        ["", []],
    ])("%s", (time, expected) => {
        expect(parseActions(time)).toEqual(expected);
    });
});

describe("linkedConditions", () => {
    it("finds each linked condition once", () => {
        const html =
            "@UUID[Compendium.pf2e.conditionitems.Item.Off-Guard] and @UUID[Compendium.pf2e.conditionitems.Item.Off-Guard]{off-guard}";
        expect(linkedConditions(html)).toEqual(["off-guard"]);
    });
});
