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

/** A wand or scroll the character carries, with the spell it holds */
export interface ConsumableSnapshot {
    /** The consumable item's id on the actor */
    id: string;
    name: string;
    category: "wand" | "scroll";
    /** The embedded spell, at the rank the item casts it */
    spell: SpellSnapshot;
    /** Wands: today's use. Scrolls: always 1 of 1. */
    uses: UsesSnapshot;
    quantity: number;
    /** Some spellcasting entry can cast it, or the character has Trick Magic Item */
    castable: boolean;
    /** Castable only through Trick Magic Item. pf2e can't cast an overcharge that way, so none is offered. */
    viaTrickMagicItem: boolean;
    /** Wands only: broken by an overcharge and not yet repaired */
    broken: boolean;
    /** Wands only: overcharged since the character last rested */
    overchargedToday: boolean;
}

/** A staff the character carries */
export interface StaffSnapshot {
    /** The staff (weapon) item's id */
    id: string;
    name: string;
    held: boolean;
    /** This character prepared it since their last rest */
    preparedByMe: boolean;
    /** Someone else prepared it, so this character can't cast from it today */
    preparedByOther: boolean;
    charges: UsesSnapshot;
}

export interface ActorSnapshot {
    /** The actor's id, used to tell who prepared a staff */
    id: string;
    level: number;
    /** The highest spell slot rank across prepared and spontaneous entries: a staff's daily charges */
    highestSlotRank: number;
    /** The focus pool, or null if the actor has none */
    focus: UsesSnapshot | null;
    entries: EntrySnapshot[];
    /** Identified wands and scrolls that hold a spell */
    consumables: ConsumableSnapshot[];
    /** Staves the character carries (not dropped) */
    staves: StaffSnapshot[];
}

/** What casting through an option spends, with what is left of it */
export type CastCost =
    | { type: "free" }
    | { type: "prepared-slot" }
    | { type: "slot"; value: number; max: number }
    | { type: "innate"; value: number; max: number }
    | { type: "focus"; value: number }
    | { type: "wand"; value: number; max: number }
    | { type: "scroll"; quantity: number }
    /** `destroys`: the wand was already overcharged today, so this destroys it with no spell */
    | { type: "overcharge"; destroys: boolean };

/** Why an option can't be cast right now */
export type UnavailableReason = "expended" | "no-slots" | "no-uses" | "no-focus" | "cannot-cast" | "broken";

/** One way to cast a spell right now, at one rank */
export interface CastOption {
    kind: SourceKind;
    /** The spellcasting entry id, or the wand or scroll item id */
    entryId: string;
    entryName: string;
    /** The spell item to cast (for wands and scrolls, the consumable item id) */
    spellId: string;
    rank: number;
    /** For prepared casters, which slot at `rank` is spent */
    slotIndex?: number;
    available: boolean;
    cost: CastCost;
    /** Set when `available` is false */
    reason?: UnavailableReason;
}

/** A spellcasting entry, wand or scroll that has this spell, shown as a badge on the row */
export interface SpellSource {
    /** The spellcasting entry id, or the wand or scroll item id */
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
    /** Spell item ids on the actor that this row merges. Spells inside wands and scrolls aren't listed. */
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
