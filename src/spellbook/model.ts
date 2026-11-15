import type { SpellCategory } from "./categories.ts";
import type { SpellFacets } from "./facets.ts";

/**
 * Plain data shapes used by the spellbook logic. Nothing here touches Foundry, so the logic that
 * works on these types can be unit-tested in Node. `src/foundry/snapshot.ts` builds them from a real actor.
 */

/** The spellcasting entry kinds the Grimoire reads. Rituals and item-based entries are left out. */
export type EntryCategory = "prepared" | "spontaneous" | "innate" | "focus";

/** Every way the Grimoire can cast a spell. Phase 1 only produces the entry-based kinds. */
export type SourceKind =
    | "prepared"
    | "spontaneous"
    | "innate"
    | "focus"
    | "staff"
    | "staff+slot"
    | "wand"
    | "wand-overcharge"
    | "scroll";

export interface UsesSnapshot {
    value: number;
    max: number;
}

export interface SpellSnapshot {
    /** The spell item's id on the actor */
    id: string;
    uuid: string;
    name: string;
    img: string;
    /** Used to recognize the same spell in different entries */
    slug: string;
    /** The rank before heightening (pf2e's `baseRank`). Cantrips report 1. */
    baseRank: number;
    /** pf2e's `rank`: auto-heightened for cantrips and focus spells, `heightenedLevel` for repertoire spells */
    rank: number;
    isCantrip: boolean;
    isFocus: boolean;
    /** Spontaneous signature spell, or a flexible caster's collection spell */
    signature: boolean;
    /** Innate spell uses per day. Null when the spell has none recorded. */
    uses: UsesSnapshot | null;
    /** Filterable facts from the spell's data */
    facets: SpellFacets;
    /** The player's own tags, from the spell item's flags */
    tags: string[];
}

export interface PreparedSlotSnapshot {
    /** The spell item id prepared in this slot, or null for an empty slot */
    id: string | null;
    expended: boolean;
}

export interface SlotRankSnapshot {
    /** Remaining slots (spontaneous and flexible casters) */
    value: number;
    max: number;
    /** Slot contents (prepared casters) */
    prepared: PreparedSlotSnapshot[];
}

export interface EntrySnapshot {
    id: string;
    name: string;
    category: EntryCategory;
    /** Flexible preparation: signature ("collection") spells are cast from shared slots, like a spontaneous caster */
    isFlexible: boolean;
    sort: number;
    /** Indexed by rank, 0 (cantrips) through 10 */
    slots: SlotRankSnapshot[];
    spells: SpellSnapshot[];
}

export interface ActorSnapshot {
    level: number;
    /** The focus pool, or null if the actor has none */
    focus: UsesSnapshot | null;
    entries: EntrySnapshot[];
}

/** What casting through an option spends, with what is left of it */
export type CastCost =
    | { type: "free" }
    | { type: "prepared-slot" }
    | { type: "slot"; value: number; max: number }
    | { type: "innate"; value: number; max: number }
    | { type: "focus"; value: number };

/** Why an option can't be cast right now */
export type UnavailableReason = "expended" | "no-slots" | "no-uses" | "no-focus";

/** One way to cast a spell right now, at one rank */
export interface CastOption {
    kind: SourceKind;
    entryId: string;
    entryName: string;
    /** The spell item to cast */
    spellId: string;
    rank: number;
    /** For prepared casters, which slot at `rank` is spent */
    slotIndex?: number;
    available: boolean;
    cost: CastCost;
    /** Set when `available` is false */
    reason?: UnavailableReason;
}

/** A spellcasting entry that has this spell, shown as a badge on the row */
export interface SpellSource {
    entryId: string;
    entryName: string;
    kind: SourceKind;
    /** True if this source has at least one available cast option for the spell */
    available: boolean;
}

/** A spell as the Grimoire shows it: one row, however many entries have it */
export interface SpellRow {
    key: string;
    name: string;
    img: string;
    /** 0 for cantrips and focus spells (they auto-heighten), otherwise the lowest base rank among the merged spells */
    baseRank: number;
    isCantrip: boolean;
    isFocus: boolean;
    /** Filterable facts, from the first merged spell */
    facets: SpellFacets;
    /** Automatic categories from the rule table */
    categories: SpellCategory[];
    /** The player's own tags (GRIM-15), merged from every spell in the row */
    tags: string[];
    /** Spell item ids on the actor that this row merges */
    spellIds: string[];
    sources: SpellSource[];
    castOptions: CastOption[];
    /** True if at least one cast option is available */
    available: boolean;
}

export interface RankGroup {
    /** 0 is the cantrip and focus spell group */
    rank: number;
    rows: SpellRow[];
}
