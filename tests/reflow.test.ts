import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ActionCost } from "../src/kinetic/model.ts";
import {
    buildCatalog,
    catalogFit,
    filterCatalog,
    reflowBlock,
    reflowChoices,
    reflowsPerDay,
    slotLevelOf,
    type CatalogImpulse,
    type OwnedImpulse,
} from "../src/kinetic/reflow.ts";

const KINETICIST = fileURLToPath(new URL("../vendor/pf2e/packs/pf2e/feats/class/kineticist/", import.meta.url));

interface FeatSource {
    _id: string;
    name: string;
    img: string;
    system: {
        description: { value: string };
        traits: { value: string[]; rarity: string };
        actionType: { value: string };
        actions: { value: number | null };
        level: { value: number };
    };
}

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : name.endsWith(".json") ? [path] : [];
    });
}

const CATALOG: CatalogImpulse[] = walk(KINETICIST)
    .map((path) => JSON.parse(readFileSync(path, "utf8")) as FeatSource)
    .filter((s) => s.system.traits.value.includes("impulse"))
    .map((s) => ({
        uuid: `Compendium.pf2e.feats-srd.Item.${s._id}`,
        name: s.name,
        img: s.img,
        level: s.system.level.value,
        rarity: s.system.traits.rarity,
        traits: s.system.traits.value,
        cost: (s.system.actionType.value === "action"
            ? String(s.system.actions.value ?? 1)
            : s.system.actionType.value) as ActionCost,
        description: s.system.description.value,
    }));

function catalogImpulse(name: string): CatalogImpulse {
    const found = CATALOG.find((c) => c.name === name);
    if (!found) throw new Error(`No impulse named ${name}`);
    return found;
}

function owned(name: string, slotLevel: number): OwnedImpulse {
    const c = catalogImpulse(name);
    return {
        id: name,
        name,
        img: "",
        level: c.level,
        traits: c.traits,
        cost: c.cost,
        description: c.description,
        sourceUuid: c.uuid,
        slotLevel,
        slotLabel: "",
        granted: false,
    };
}

// Shaun: water and air, level 14
const SHAUN = ["water", "air"];
const SHAUN_OWNS = [owned("Tidal Hands", 1), owned("Four Winds", 1), owned("Winter Sleet", 4), owned("Rising Hurricane", 6)];

describe("reflowBlock", () => {
    it("allows only single-element, non-composite impulses", () => {
        expect(reflowBlock(catalogImpulse("Tidal Hands").traits)).toBeNull();
        expect(reflowBlock(catalogImpulse("Rising Hurricane").traits)).toBe("Composite");
        expect(reflowBlock(["impulse", "kineticist", "primal"])).toBe("NoElement");
        expect(reflowBlock(["impulse", "air", "water"])).toBe("SeveralElements");
    });
});

describe("reflowsPerDay", () => {
    it("is one with Reflow Elements and two with Double Reflow", () => {
        expect(reflowsPerDay([])).toBe(0);
        expect(reflowsPerDay(["reflow-elements"])).toBe(1);
        expect(reflowsPerDay(["reflow-elements", "double-reflow"])).toBe(2);
    });
});

describe("catalogFit", () => {
    it("needs every element of a composite impulse, and any one of a single-element impulse", () => {
        expect(catalogFit(catalogImpulse("Rising Hurricane").traits, SHAUN)).toBe("composite");
        expect(catalogFit(catalogImpulse("Rising Hurricane").traits, ["air"])).toBeNull();
        expect(catalogFit(catalogImpulse("Tidal Hands").traits, SHAUN)).toBe("element");
        expect(catalogFit(catalogImpulse("Tidal Hands").traits, ["fire"])).toBeNull();
        expect(catalogFit(["impulse", "kineticist"], ["fire"])).toBe("any");
    });
});

describe("buildCatalog for an air and water kineticist", () => {
    const catalog = buildCatalog(CATALOG, SHAUN, 14, SHAUN_OWNS);

    it("only lists impulses their gates allow", () => {
        for (const entry of catalog) {
            if (entry.fit === "composite") expect(entry.elements.every((e) => SHAUN.includes(e))).toBe(true);
            if (entry.fit === "element") expect(entry.elements.some((e) => SHAUN.includes(e))).toBe(true);
        }
        expect(catalog.some((e) => e.elements.includes("fire") && e.fit !== "composite")).toBe(false);
        expect(catalog.length).toBeGreaterThan(20);
    });

    it("marks owned and too-high impulses, sorted by level", () => {
        expect(catalog.find((e) => e.impulse.name === "Tidal Hands")?.owned).toBe(true);
        expect(catalog.filter((e) => e.tooHigh).every((e) => e.impulse.level > 14)).toBe(true);
        const levels = catalog.map((e) => e.impulse.level);
        expect(levels).toEqual([...levels].sort((a, b) => a - b));
    });

    it("filters by search, element and owned", () => {
        const water = filterCatalog(catalog, { search: "", elements: ["water"], hideOwned: true });
        expect(water.every((e) => !e.owned && (e.fit === "any" || e.elements.includes("water")))).toBe(true);
        expect(filterCatalog(catalog, { search: "tidal", elements: [], hideOwned: false }).map((e) => e.impulse.name)).toEqual([
            "Tidal Hands",
        ]);
    });
});

describe("reflowChoices", () => {
    const catalog = buildCatalog(CATALOG, SHAUN, 14, SHAUN_OWNS);

    it("offers unowned water impulses no higher than the slot", () => {
        const choices = reflowChoices(owned("Winter Sleet", 4), catalog);
        expect(choices.length).toBeGreaterThan(0);
        for (const choice of choices) {
            expect(choice.elements).toEqual(["water"]);
            expect(choice.impulse.level).toBeLessThanOrEqual(4);
            expect(choice.owned).toBe(false);
            expect(choice.impulse.traits).not.toContain("composite");
        }
        expect(choices.map((c) => c.impulse.name)).not.toContain("Tidal Hands");
    });

    it("a level-1 gate slot only takes level-1 impulses", () => {
        expect(reflowChoices(owned("Four Winds", 1), catalog).every((c) => c.impulse.level === 1)).toBe(true);
    });

    it("offers nothing for a composite impulse", () => {
        expect(reflowChoices(owned("Rising Hurricane", 6), catalog)).toEqual([]);
    });
});

describe("slotLevelOf", () => {
    it("reads class feat slots, else the granter's level, else the feat's own", () => {
        expect(slotLevelOf("class-4", [], 2)).toBe(4);
        expect(slotLevelOf(null, [1], 1)).toBe(1);
        expect(slotLevelOf(null, [5, 9], 4)).toBe(9);
        expect(slotLevelOf(null, [], 6)).toBe(6);
    });
});
