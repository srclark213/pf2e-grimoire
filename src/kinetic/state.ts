import type { ActionCost, CombatStamp, InfusionTarget, KineticState, PrimedInfusion } from "./model.ts";
import { EMPTY_STATE } from "./model.ts";

/**
 * The rules for what using a kineticist ability does to the dashboard's state: overflow (one per round, ends the
 * aura), infusions (modify the next action only), Chain Infusion's run of blasts, and Channel Elements' free
 * 1-action blast or stance. Pure: the Foundry hook (src/foundry/kinetic.ts) feeds it each use it sees in chat.
 */

export type UsedKind = "channel" | "blast" | "impulse" | "infusion" | "other";

export interface UsedItem {
    kind: UsedKind;
    itemId: string;
    name: string;
    cost: ActionCost;
    overflow: boolean;
    stance: boolean;
    /** For infusions: what they modify, and Chain Infusion's blast limit */
    infusion?: { target: InfusionTarget; chain: number | null };
}

export type Notice =
    | { key: "InfusionApplied"; infusion: string; item: string }
    | { key: "InfusionWasted"; infusion: string; item: string }
    | { key: "ChainContinues"; blasts: number; max: number }
    | { key: "ChainEnded"; blasts: number }
    | { key: "Overflow"; item: string }
    | { key: "OverflowTwice"; item: string }
    | { key: "ChannelRider"; item: string };

export interface UseOutcome {
    state: KineticState;
    /** An overflow impulse was used: the kinetic aura (and with it any stance impulse) ends */
    deactivateAura: boolean;
    notices: Notice[];
}

export function normalizeState(raw: unknown): KineticState {
    if (!raw || typeof raw !== "object") return { ...EMPTY_STATE };
    const value = raw as Partial<KineticState>;
    return {
        overflow: isStamp(value.overflow) ? value.overflow : null,
        infusion: isInfusion(value.infusion) ? value.infusion : null,
        channel: value.channel === null || isStamp(value.channel) ? value.channel : false,
    };
}

export function sameStamp(a: CombatStamp | null, b: CombatStamp | null): boolean {
    if (!a || !b) return a === b;
    return a.combat === b.combat && a.round === b.round && a.turn === b.turn;
}

/** True when an overflow impulse was already used this round of the current combat */
export function overflowUsed(state: KineticState, now: CombatStamp | null): boolean {
    return !!now && !!state.overflow && state.overflow.combat === now.combat && state.overflow.round === now.round;
}

/** The primed infusion, unless its turn has passed (or combat started or ended since) */
export function liveInfusion(state: KineticState, now: CombatStamp | null): PrimedInfusion | null {
    const infusion = state.infusion;
    if (!infusion) return null;
    return sameStamp(infusion.at, now) ? infusion : null;
}

/** True right after Channel Elements, while its free 1-action blast or stance is still available */
export function channelRiderOpen(state: KineticState, now: CombatStamp | null): boolean {
    return state.channel !== false && sameStamp(state.channel, now);
}

/** Can this use ride along with Channel Elements? A 1-action Elemental Blast or 1-action stance impulse. */
export function ridesChannel(used: Pick<UsedItem, "kind" | "cost" | "stance">): boolean {
    return used.cost === "1" && (used.kind === "blast" || (used.kind === "impulse" && used.stance));
}

/** Applies one use of an ability to the state. */
export function applyUse(state: KineticState, used: UsedItem, now: CombatStamp | null): UseOutcome {
    const notices: Notice[] = [];
    const infusion = liveInfusion(state, now);
    const next: KineticState = { ...state, infusion: null, channel: false };
    let deactivateAura = false;

    // Whatever this is, an infusion waiting for it either applies or is wasted.
    if (infusion) {
        const chainRunning = !!infusion.chain && infusion.chain.blasts > 0;
        const matches = used.kind === "blast" || (used.kind === "impulse" && infusion.target === "impulse");
        if (matches && infusion.chain && used.kind === "blast") {
            const blasts = infusion.chain.blasts + 1;
            if (blasts < infusion.chain.max) {
                next.infusion = { ...infusion, chain: { ...infusion.chain, blasts } };
                notices.push({ key: "ChainContinues", blasts, max: infusion.chain.max });
            } else {
                notices.push({ key: "ChainEnded", blasts });
            }
        } else if (chainRunning) {
            // The chain already happened; moving on simply ends it.
        } else if (matches) {
            notices.push({ key: "InfusionApplied", infusion: infusion.name, item: used.name });
        } else {
            notices.push({ key: "InfusionWasted", infusion: infusion.name, item: used.name });
        }
    }

    switch (used.kind) {
        case "infusion":
            next.infusion = {
                itemId: used.itemId,
                name: used.name,
                target: used.infusion?.target ?? "impulse",
                at: now,
                chain: used.infusion?.chain ? { blasts: 0, max: used.infusion.chain } : null,
            };
            break;
        case "channel":
            next.channel = now;
            break;
        case "blast":
        case "impulse":
            if (channelRiderOpen(state, now) && ridesChannel(used)) {
                notices.push({ key: "ChannelRider", item: used.name });
            }
            if (used.overflow) {
                notices.push({ key: overflowUsed(state, now) ? "OverflowTwice" : "Overflow", item: used.name });
                next.overflow = now;
                deactivateAura = true;
            }
            break;
        case "other":
            break;
    }

    return { state: next, deactivateAura, notices };
}

function isStamp(value: unknown): value is CombatStamp {
    return (
        !!value &&
        typeof value === "object" &&
        typeof (value as CombatStamp).combat === "string" &&
        typeof (value as CombatStamp).round === "number" &&
        typeof (value as CombatStamp).turn === "number"
    );
}

function isInfusion(value: unknown): value is PrimedInfusion {
    if (!value || typeof value !== "object") return false;
    const infusion = value as PrimedInfusion;
    return (
        typeof infusion.itemId === "string" &&
        typeof infusion.name === "string" &&
        (infusion.target === "blast" || infusion.target === "impulse") &&
        (infusion.at === null || isStamp(infusion.at))
    );
}
