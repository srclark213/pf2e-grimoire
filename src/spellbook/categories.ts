import type { SpellFacets } from "./facets.ts";

export type SpellCategory =
    | "healing"
    | "damage"
    | "control"
    | "defense"
    | "buff"
    | "movement"
    | "detection"
    | "summoning"
    | "utility";

/** Conditions that hinder a target: a spell that links one of these counts as Control. */
const HINDERING_CONDITIONS = new Set([
    "blinded",
    "clumsy",
    "confused",
    "controlled",
    "dazzled",
    "deafened",
    "doomed",
    "drained",
    "enfeebled",
    "fascinated",
    "fatigued",
    "fleeing",
    "frightened",
    "grabbed",
    "immobilized",
    "off-guard",
    "paralyzed",
    "petrified",
    "prone",
    "restrained",
    "sickened",
    "slowed",
    "stunned",
    "stupefied",
    "unconscious",
]);

/** Conditions that help their target: linking one of these counts as Buff. */
const HELPFUL_CONDITIONS = new Set(["concealed", "hidden", "invisible", "quickened", "undetected"]);

interface CategoryRule {
    category: Exclude<SpellCategory, "utility">;
    /** What the rule looks at, for anyone tuning the table */
    why: string;
    test: (facets: SpellFacets) => boolean;
}

/**
 * THE category rule table. A spell gets every category whose rule matches; a spell matching none is Utility.
 * Order here is the order categories are listed in the filter bar.
 */
export const CATEGORY_RULES: readonly CategoryRule[] = [
    {
        category: "healing",
        why: "restores Hit Points (healing damage kind or the healing trait)",
        test: (f) => f.heals,
    },
    {
        category: "damage",
        why: "deals damage, and isn't primarily a healing spell (Heal and Harm stay under Healing)",
        test: (f) => f.damageTypes.length > 0 && !f.heals,
    },
    {
        category: "control",
        why: "links a hindering condition (frightened, slowed, prone…) or has the incapacitation trait",
        test: (f) => f.traits.includes("incapacitation") || f.conditions.some((c) => HINDERING_CONDITIONS.has(c)),
    },
    {
        category: "defense",
        why: "text grants a bonus to AC or saves, temporary Hit Points, resistance or a ward",
        test: (f) => f.effects.includes("protection"),
    },
    {
        category: "buff",
        why: "links a helpful condition (invisible, quickened, concealed…)",
        test: (f) => f.conditions.some((c) => HELPFUL_CONDITIONS.has(c)),
    },
    {
        category: "movement",
        why: "teleportation trait, or text grants a fly/climb/swim/burrow Speed or teleports",
        test: (f) => f.traits.includes("teleportation") || f.effects.includes("movement"),
    },
    {
        category: "detection",
        why: "detection, revelation, scrying or prediction trait",
        test: (f) => ["detection", "revelation", "scrying", "prediction"].some((t) => f.traits.includes(t)),
    },
    {
        category: "summoning",
        why: "summon trait",
        test: (f) => f.traits.includes("summon"),
    },
];

/** Every category, in filter-bar order */
export const ALL_CATEGORIES: readonly SpellCategory[] = [...CATEGORY_RULES.map((r) => r.category), "utility"];

export function categorize(facets: SpellFacets): SpellCategory[] {
    const matched = CATEGORY_RULES.filter((rule) => rule.test(facets)).map((rule) => rule.category);
    return matched.length > 0 ? matched : ["utility"];
}
