/**
 * Derives the filterable facts about a spell from its pf2e system data.
 * Works on the plain `system` object (an actor's prepared spell or a compendium source), so it is
 * unit-tested against real pf2e pack files.
 */

/** The parts of pf2e's spell `system` data the extractor reads */
export interface SpellSystemSource {
    defense?: {
        save?: { statistic?: string; basic?: boolean } | null;
        passive?: { statistic?: string } | null;
    } | null;
    /** `kinds` is an array in pack data but a Set on a prepared (actor-owned) spell */
    damage?: Record<string, { type?: string | null; kinds?: Iterable<string> | null } | null> | null;
    time?: { value?: string | null } | null;
    traits?: { value?: string[] | null } | null;
    range?: { value?: string | null } | null;
    area?: { type?: string | null; value?: number | null } | null;
    description?: { value?: string | null } | null;
}

/** What the spell is resisted with */
export type SpellDefense = "fortitude" | "reflex" | "will" | "ac";

/** Action costs a spell can take. A variable-cost spell ("1 to 3") has several. */
export type ActionKey = "1" | "2" | "3" | "reaction" | "free" | "long";

export interface SpellFacets {
    /** The save or defense the spell targets, or null if none (buffs, utility) */
    defense: SpellDefense | null;
    /** A basic save (damage halves on success) */
    basicSave: boolean;
    /** Has the attack trait (a spell attack roll against AC) */
    isAttack: boolean;
    /** Damage types it deals, e.g. ["fire"]. Healing-only entries are left out. */
    damageTypes: string[];
    /** Restores Hit Points */
    heals: boolean;
    actions: ActionKey[];
    traits: string[];
    /** The range text as written ("30 feet", "touch", "varies"), or null */
    range: string | null;
    /** Range in feet when it is a plain distance, otherwise null */
    rangeFeet: number | null;
    area: { type: string; size: number } | null;
    /** Conditions the description links to, as slugs ("frightened", "off-guard") */
    conditions: string[];
    /** Effects spotted in the description text, for the category rules */
    effects: SpellEffect[];
}

/**
 * Effects recognized from description wording. pf2e has no structured data for these,
 * so they are best-effort matches on the rules text.
 */
export type SpellEffect = "protection" | "movement" | "bonus";

const EFFECT_PATTERNS: Record<SpellEffect, RegExp> = {
    // "+1 circumstance bonus to AC", "bonus to saving throws", "resistance 5", "You ward a creature", "wards
    // against". Temporary Hit Points alone don't count: too many offensive spells and forms hand out a few.
    // A bare "ward" doesn't either: "ward off the omen", "wards on a door", "Ward Domain".
    protection:
        /bonus to (?:your |its |their )?(?:AC|Armor Class|saving throws|saves)|\bresistance (?:\d|equal|to)|\bwards? (?:(?:a|an|the|one|each) )?(?:creature|willing|ally|allies|yourself|you)\b|\bwards? against\b/i,
    // "a fly Speed", "climb Speed", "teleport", "transport yourself"
    movement: /\b(?:fly|climb|swim|burrow) Speed\b|\bteleport|\btransports? (?:yourself|you|the target)\b/i,
    // "+1 status bonus to attack rolls, Perception checks…", "circumstance bonus to Athletics", "bonus to Speed"
    bonus: /\b(?:status|circumstance) bonus (?:of \+?\d+ )?(?:to|on) (?:your |its |their |the target's |the creature's |all )?(?:attack|damage|Perception|skill|checks|Speeds?|Strikes|Athletics|Acrobatics|Stealth|Diplomacy|Deception|Intimidation)/i,
};

const SAVES = new Set(["fortitude", "reflex", "will"]);

export function extractFacets(system: SpellSystemSource): SpellFacets {
    const traits = [...(system.traits?.value ?? [])];
    const isAttack = traits.includes("attack");

    const damageEntries = Object.values(system.damage ?? {}).filter((d): d is NonNullable<typeof d> => !!d);
    const damageTypes = unique(
        damageEntries
            .filter((d) => {
                const kinds = kindsOf(d.kinds, ["damage"]);
                return kinds.includes("damage") && !kinds.includes("healing");
            })
            .map((d) => d.type)
            .filter((t): t is string => !!t),
    );
    const description = system.description?.value ?? "";
    // Many spells (incarnate spells, auras, riders) only roll damage from an inline @Damage link in the text.
    const inline = inlineDamage(description);
    for (const type of inline.types) if (!damageTypes.includes(type)) damageTypes.push(type);

    const heals =
        damageEntries.some((d) => kindsOf(d.kinds).includes("healing")) ||
        traits.includes("healing") ||
        (damageEntries.length === 0 && inline.heals);
    // Heal and Harm hurt undead or the living too: count that type as damage as well.
    for (const d of damageEntries) {
        const kinds = kindsOf(d.kinds);
        if (kinds.includes("healing") && kinds.includes("damage") && d.type && !damageTypes.includes(d.type)) {
            damageTypes.push(d.type);
        }
    }

    const text = description.replace(/<[^>]+>/g, " ");
    const effects = (Object.keys(EFFECT_PATTERNS) as SpellEffect[]).filter((e) => EFFECT_PATTERNS[e].test(text));

    const rangeText = system.range?.value?.trim() || null;
    const feet = rangeText?.match(/^(\d+)\s*(?:feet|foot|ft)/i);

    const area =
        system.area?.type && typeof system.area.value === "number"
            ? { type: system.area.type, size: system.area.value }
            : null;

    return {
        defense: defenseOf(system, isAttack),
        basicSave: !!system.defense?.save?.basic,
        isAttack,
        damageTypes,
        heals,
        actions: parseActions(system.time?.value ?? ""),
        traits,
        range: rangeText,
        rangeFeet: feet ? Number(feet[1]) : null,
        area,
        conditions: linkedConditions(description),
        effects,
    };
}

function defenseOf(system: SpellSystemSource, isAttack: boolean): SpellDefense | null {
    const save = system.defense?.save?.statistic;
    if (save && SAVES.has(save)) return save as SpellDefense;
    const passive = system.defense?.passive?.statistic?.replace(/-dc$/, "");
    if (passive && (SAVES.has(passive) || passive === "ac")) return passive as SpellDefense;
    return isAttack ? "ac" : null;
}

/** Reads pf2e's cast time: "1", "2", "1 to 3", "1 or 2", "reaction", "free", "1 minute"… */
export function parseActions(time: string): ActionKey[] {
    const value = time.trim().toLowerCase();
    if (!value) return [];
    if (value === "reaction") return ["reaction"];
    if (value === "free") return ["free"];
    if (/minute|hour|day|round/.test(value)) return ["long"];

    const range = value.match(/^([123])\s*(?:to|-)\s*([123])$/);
    if (range) {
        const keys: ActionKey[] = [];
        for (let n = Number(range[1]); n <= Number(range[2]); n++) keys.push(String(n) as ActionKey);
        return keys;
    }
    const either = value.match(/^([123])\s*or\s*([123])$/);
    if (either) return unique([either[1], either[2]] as ActionKey[]);
    if (/^[123]$/.test(value)) return [value as ActionKey];
    return [];
}

/** Condition slugs from @UUID links to pf2e's condition compendium */
/**
 * pf2e's condition item ids. The pf2e source writes condition links by name ("Item.Frightened"), but the
 * built compendium a live world reads rewrites them to these ids ("Item.TBSHQspnbcqxsmjL").
 */
const CONDITION_IDS: Record<string, string> = {
    XgEqL1kFApUbl5Z2: "blinded",
    "6dNUvdb1dhToNDj3": "broken",
    i3OJZU2nk64Df3xm: "clumsy",
    DmAIPqOBomZ7H95W: "concealed",
    yblD8fOR1J8rDwEQ: "confused",
    "9qGBRpbX9NEwtAAr": "controlled",
    zXZjC8HLaRoLR17U: "cursebound",
    TkIyaNPgTZFBCCuh: "dazzled",
    "9PR9y0bi4JPKnHPR": "deafened",
    "3uh1r86TzbQvosxv": "doomed",
    "4D2KBtexWXa6oUMR": "drained",
    yZRUzMqrMmfLu0V1: "dying",
    D5mg6Tc7Jzrj6ro7: "encumbered",
    MIRkyAjyBeXivMa7: "enfeebled",
    AdPVz7rbaVSRxHFg: "fascinated",
    HL2l2VRSaQHu9lUw: "fatigued",
    sDPxOjQ9kx2RZE8D: "fleeing",
    v66R7FdOf11l94im: "friendly",
    TBSHQspnbcqxsmjL: "frightened",
    kWc1fhmv9LBiTuei: "grabbed",
    v44P3WUcU1j0115l: "helpful",
    iU0fEDdBp3rXpTMC: "hidden",
    ud7gTLwPeklzYSXG: "hostile",
    eIcWbB5o3pP6OIMe: "immobilized",
    fuG8dgthlDWfWjIA: "indifferent",
    zJxUflt9np0q4yML: "invisible",
    "1wQY3JYyhMYeeV2G": "observed",
    AJh5ex99aV6VTggg: "off-guard",
    "6uEgoh53GbXuHpTF": "paralyzed",
    lDVqvLKA6eF3Df60: "persistent-damage",
    dTwPJuKgBQCMxixg: "petrified",
    j91X7x0XSomq8d60: "prone",
    nlCjDvLMf2EkV2dl: "quickened",
    VcDeM8A5oI6VqhbM: "restrained",
    fesd1n5eVhpCSS18: "sickened",
    xYTAsEpcJE1Ccni3: "slowed",
    dfCMdR4wnpbYNTix: "stunned",
    e1XGnhKNSQIm5IXg: "stupefied",
    fBnFDH2MTzgFijKf: "unconscious",
    VRSef5y1LmL2Hkjf: "undetected",
    I1ffBVISxLr2gC4u: "unfriendly",
    "9evPzg9E6muFcoSk": "unnoticed",
    Yl48xTdMh3aeQYL2: "wounded",
};

/** Conditions the description links to, by id or by name, as slugs ("frightened", "off-guard") */
export function linkedConditions(html: string): string[] {
    const found = [...html.matchAll(/conditionitems\.Item\.([A-Za-z0-9-]+)/g)].map(
        (m) => CONDITION_IDS[m[1]!] ?? m[1]!.toLowerCase(),
    );
    return unique(found);
}

const DAMAGE_TYPES = new Set([
    "acid",
    "bleed",
    "bludgeoning",
    "cold",
    "electricity",
    "fire",
    "force",
    "mental",
    "piercing",
    "poison",
    "slashing",
    "sonic",
    "spirit",
    "vitality",
    "void",
    "untyped",
]);

/**
 * Damage types and healing rolled by inline @Damage links, e.g. "@Damage[4d6[persistent,bleed]]" or
 * "@Damage[(2d6+4)[fire]|options:area-damage]". The brackets nest, so this walks them rather than using a regex.
 */
export function inlineDamage(html: string): { types: string[]; heals: boolean } {
    const types: string[] = [];
    let heals = false;
    for (let start = html.indexOf("@Damage["); start !== -1; start = html.indexOf("@Damage[", start + 1)) {
        let depth = 0;
        let end = start + "@Damage".length;
        for (; end < html.length; end++) {
            if (html[end] === "[") depth++;
            else if (html[end] === "]" && --depth === 0) break;
        }
        const formula = html.slice(start + "@Damage[".length, end).split("|")[0]!;
        for (const [, tags] of formula.matchAll(/\[([a-z,-]+)\]/g)) {
            for (const tag of tags!.split(",")) {
                if (tag === "healing") heals = true;
                else if (DAMAGE_TYPES.has(tag) && !types.includes(tag)) types.push(tag);
            }
        }
    }
    return { types, heals };
}

function kindsOf(kinds: Iterable<string> | null | undefined, fallback: string[] = []): string[] {
    return kinds ? Array.from(kinds) : fallback;
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}
