/**
 * Wand overcharge rules (GM Core p. 282). After a wand's daily use is spent, it can be activated once more:
 * cast the spell, then roll a DC 10 flat check. On a success the wand is broken; on a failure it is
 * destroyed. Overcharging a wand that was already overcharged that day destroys it, even if it was repaired
 * in between, and no spell is cast.
 *
 * pf2e has no broken state for wands (they have no HP, see GRIM-16), so the Grimoire keeps both pieces of
 * daily state in the wand's flags. Rest clears `overchargedOn`; only a repair clears `broken`.
 */

export const OVERCHARGE_DC = 10;

export interface WandState {
    broken: boolean;
    /** Overcharged since the character last rested */
    overchargedToday: boolean;
}

/** What one overcharge attempt does */
export type OverchargeStep =
    /** The normal case: cast the spell, then roll the flat check */
    | { type: "cast-then-check" }
    /** A second overcharge the same day: the wand is destroyed with no spell and no check */
    | { type: "destroy" };

export type OverchargeOutcome = "broken" | "destroyed";

/** Reads the Grimoire's flags on a wand. Missing or null values mean an intact, not yet overcharged wand. */
export function readWandState(flags: unknown): WandState {
    const raw = (flags && typeof flags === "object" ? flags : {}) as Record<string, unknown>;
    return {
        broken: raw["broken"] === true,
        overchargedToday: typeof raw["overchargedOn"] === "number",
    };
}

/**
 * Whether a wand can be overcharged right now: its daily use is spent and it isn't broken.
 * A broken wand can't be activated at all until it is repaired.
 */
export function canOvercharge(state: WandState, usesLeft: number): boolean {
    return !state.broken && usesLeft <= 0;
}

export function overchargeStep(state: WandState): OverchargeStep {
    return state.overchargedToday ? { type: "destroy" } : { type: "cast-then-check" };
}

/** The flat check result: meeting the DC is a success (the wand breaks), anything lower destroys it. */
export function overchargeOutcome(flatCheck: number): OverchargeOutcome {
    return flatCheck >= OVERCHARGE_DC ? "broken" : "destroyed";
}
