import { describe, expect, it } from "vitest";
import { aggregateSpells, groupByRank } from "../src/spellbook/aggregator.ts";
import { extractFacets } from "../src/spellbook/facets.ts";
import {
    availableChips,
    EMPTY_FILTER,
    filterGroups,
    normalizeFilter,
    rowMatches,
    toggleChip,
    type FilterState,
} from "../src/spellbook/filter.ts";
import type { SpellRow } from "../src/spellbook/model.ts";
import { actor, cantrip, entry, spell } from "./fixtures/spellbook.ts";
import { pf2eSpell } from "./fixtures/pf2e-spells.ts";

/** An animist-like character with real pf2e spell data, spread over two entries */
function rows(): SpellRow[] {
    const real = (name: string, path: string, overrides = {}) =>
        spell(name, { facets: extractFacets(pf2eSpell(path)), baseRank: pf2eSpell(path).level.value, ...overrides });
    return aggregateSpells(
        actor([
            entry("Prepared", "prepared", [
                real("Fireball", "rank-3/fireball"),
                real("Fear", "rank-1/fear"),
                real("Heal", "rank-1/heal", { id: "heal-a" }),
            ]),
            entry("Apparition Spells", "spontaneous", [
                real("Heal", "rank-1/heal", { id: "heal-b" }),
                real("Force Barrage", "rank-1/force-barrage"),
                cantrip("Electric Arc", { facets: extractFacets(pf2eSpell("cantrip/electric-arc")) }),
            ]),
        ]),
    );
}

const names = (list: SpellRow[], filter: FilterState) => list.filter((r) => rowMatches(r, filter)).map((r) => r.name);

describe("rowMatches", () => {
    it("passes everything with an empty filter", () => {
        expect(names(rows(), EMPTY_FILTER)).toHaveLength(5);
    });

    it("searches names, ignoring case", () => {
        expect(names(rows(), { search: "fire", chips: [] })).toEqual(["Fireball"]);
    });

    it("Will + Fire: chips in different groups must all match", () => {
        expect(names(rows(), { search: "", chips: ["defense:will"] })).toEqual(["Fear"]);
        expect(names(rows(), { search: "", chips: ["damage:fire"] })).toEqual(["Fireball"]);
        expect(names(rows(), { search: "", chips: ["defense:will", "damage:fire"] })).toEqual([]);
        expect(names(rows(), { search: "", chips: ["defense:reflex", "damage:fire"] })).toEqual(["Fireball"]);
    });

    it("chips in the same group widen the match", () => {
        expect(names(rows(), { search: "", chips: ["damage:fire", "damage:electricity"] }).sort()).toEqual([
            "Electric Arc",
            "Fireball",
        ]);
    });

    it("filters by action cost, matching variable-action spells on any of their costs", () => {
        expect(names(rows(), { search: "", chips: ["action:1"] }).sort()).toEqual(["Force Barrage", "Heal"]);
    });

    it("filters by category", () => {
        expect(names(rows(), { search: "", chips: ["category:healing"] })).toEqual(["Heal"]);
        expect(names(rows(), { search: "", chips: ["category:control"] })).toEqual(["Fear"]);
    });

    it("combines search and chips", () => {
        expect(names(rows(), { search: "heal", chips: ["category:damage"] })).toEqual([]);
    });
});

describe("filterGroups", () => {
    it("drops rank groups left empty", () => {
        const groups = groupByRank(rows());
        const filtered = filterGroups(groups, { search: "", chips: ["damage:fire"] });
        expect(filtered.map((g) => [g.rank, g.rows.map((r) => r.name)])).toEqual([[3, ["Fireball"]]]);
    });
});

describe("availableChips", () => {
    it("offers only values the character's spells have, in a stable order", () => {
        const chips = availableChips(rows());
        expect(chips.defense).toEqual(["fortitude", "reflex", "will"]);
        expect(chips.damage).toEqual(["electricity", "fire", "force", "vitality"]);
        expect(chips.action).toEqual(["1", "2", "3"]);
        expect(chips.category).toEqual(["healing", "damage", "control"]);
        expect(chips.trait).not.toContain("concentrate");
        expect(chips.trait).toContain("mental");
    });

    it("keeps a selected chip even when no spell has it", () => {
        expect(availableChips(rows(), ["damage:cold"]).damage).toContain("cold");
    });
});

describe("toggleChip and normalizeFilter", () => {
    it("toggles a chip on and off", () => {
        const on = toggleChip(EMPTY_FILTER, "defense:will");
        expect(on.chips).toEqual(["defense:will"]);
        expect(toggleChip(on, "defense:will").chips).toEqual([]);
    });

    it("repairs saved filters", () => {
        expect(normalizeFilter(undefined)).toEqual(EMPTY_FILTER);
        expect(normalizeFilter({ search: "fi", chips: ["damage:fire", "bogus:x", 3, "damage:fire"] })).toEqual({
            search: "fi",
            chips: ["damage:fire"],
        });
    });
});
