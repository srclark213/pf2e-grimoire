/**
 * Plain-data shapes for the Kinetic Gate dashboard. The Foundry side (src/foundry/kinetic-snapshot.ts) reads a
 * kineticist into a KineticSnapshot; everything under src/kinetic/ works on these shapes only, so it can be unit
 * tested without Foundry.
 */

/** pf2e's kinetic elements */
export const ELEMENTS = ["air", "earth", "fire", "metal", "water", "wood"] as const;
export type Element = (typeof ELEMENTS)[number];

/** An action's cost: 1–3 actions, a reaction, a free action, or none (a passive feat) */
export type ActionCost = "1" | "2" | "3" | "reaction" | "free" | "passive";

/** Where a combat stands, so per-round and per-turn state can expire. Null outside combat. */
export interface CombatStamp {
    combat: string;
    round: number;
    turn: number;
}

/** An impulse, infusion or Channel Elements: a feat or action item the kineticist can use */
export interface KineticItemSnapshot {
    id: string;
    name: string;
    img: string;
    slug: string;
    traits: string[];
    cost: ActionCost;
    /** Feat level, or null for actions */
    level: number | null;
    /** Description HTML, unenriched (pf2e source syntax: @Damage, @Check, @Template, @UUID) */
    description: string;
    /** The effect pf2e applies to the user when it is used (stances, Channel Elements, Weapon Infusion...) */
    selfEffect: string | null;
}

export interface BlastDamageType {
    value: string;
    label: string;
    selected: boolean;
}

/** One element's Elemental Blast, as pf2e's ElementalBlast prepares it */
export interface BlastSnapshot {
    element: string;
    label: string;
    img: string;
    damageTypes: BlastDamageType[];
    /** "Range 30 ft." or "Range increment 50 ft." */
    range: string;
    /** Attack modifiers at MAP 0, 1 and 2 */
    melee: [string, string, string];
    ranged: [string, string, string];
    /** Damage formulas for the selected damage type at the current action cost */
    formula: { melee: { hit: string; crit: string }; ranged: { hit: string; crit: string } };
}

/** An effect on the kineticist that the dashboard shows: the aura, stances and other impulse effects */
export interface KineticEffectSnapshot {
    id: string;
    name: string;
    img: string;
    slug: string;
    /** Ends when the kinetic aura deactivates */
    stance: boolean;
    /** The kinetic aura itself */
    aura: boolean;
}

/** A primed infusion, waiting for the impulse it modifies */
export interface PrimedInfusion {
    itemId: string;
    name: string;
    /** What the next action must be for the infusion to apply */
    target: InfusionTarget;
    /** Where the combat stood when it was primed: it lapses once the turn passes */
    at: CombatStamp | null;
    /** Chain Infusion: how many blasts the chain has made so far, of at most `max` */
    chain: { blasts: number; max: number } | null;
}

export type InfusionTarget = "blast" | "impulse";

/** Dashboard state kept in the actor's flags, so every client and the sheet agree */
export interface KineticState {
    /** The round an overflow impulse was last used in (one per round) */
    overflow: CombatStamp | null;
    infusion: PrimedInfusion | null;
    /** Channel Elements was just used: its free 1-action blast or stance is still available */
    channel: CombatStamp | null | false;
}

export const EMPTY_STATE: KineticState = { overflow: null, infusion: null, channel: false };

export interface KineticSnapshot {
    actorName: string;
    level: number;
    /** Elements the kineticist channels, in gate order */
    elements: string[];
    aura: { active: boolean; radius: number };
    /** Gate junctions, e.g. { element: "air", kind: "aura" } */
    junctions: { element: string; kind: string }[];
    impulse: { dc: number | null; modifier: number | null };
    /** The Channel Elements action, if the character has it */
    channel: KineticItemSnapshot | null;
    blast: { itemId: string; cost: 1 | 2; configs: BlastSnapshot[] } | null;
    /** Every impulse except Elemental Blast */
    impulses: KineticItemSnapshot[];
    infusions: KineticItemSnapshot[];
    effects: KineticEffectSnapshot[];
    now: CombatStamp | null;
    state: KineticState;
}
