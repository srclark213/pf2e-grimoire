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
export type SpellEffect = "protection" | "movement";

const EFFECT_PATTERNS: Record<SpellEffect, RegExp> = {
    // "+1 circumstance bonus to AC", "bonus to saving throws", "10 temporary Hit Points", "resistance 5", "ward"
    protection:
        /bonus to (?:your |its |their )?(?:AC|Armor Class|saving throws|saves)|temporary Hit Points|\bresistance (?:\d|equal|to)|\bwards?\b/i,
    // "a fly Speed", "climb Speed", "teleport", "transport yourself"
    movement: /\b(?:fly|climb|swim|burrow) Speed\b|\bteleport|\btransports? (?:yourself|you|the target)\b/i,
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
    const heals = damageEntries.some((d) => kindsOf(d.kinds).includes("healing")) || traits.includes("healing");
    // Heal and Harm hurt undead or the living too: count that type as damage as well.
    for (const d of damageEntries) {
        const kinds = kindsOf(d.kinds);
        if (kinds.includes("healing") && kinds.includes("damage") && d.type && !damageTypes.includes(d.type)) {
            damageTypes.push(d.type);
        }
    }

    const description = system.description?.value ?? "";
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
export function linkedConditions(html: string): string[] {
    const found = [...html.matchAll(/conditionitems\.Item\.([A-Za-z-]+)/g)].map((m) => m[1]!.toLowerCase());
    return unique(found);
}

function kindsOf(kinds: Iterable<string> | null | undefined, fallback: string[] = []): string[] {
    return kinds ? Array.from(kinds) : fallback;
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}
