import { DEFAULT_PRIORITY, orderByPriority, resolveCast, type PriorityGroup } from "./cast-resolver.ts";
import type { CastOption, SpellRow } from "./model.ts";

/** One [n] button on a spell row */
export interface RankButton {
    rank: number;
    /** True if a plain click can cast the spell at this rank right now */
    available: boolean;
    /** The option a plain click casts (when unavailable, a representative option for the tooltip) */
    option: CastOption;
    /** Every way to cast the spell at this rank, available or not, in priority order (the right-click menu) */
    options: CastOption[];
    /** Casts left at this rank, out of how many there were today; null when unlimited (cantrips, free casts) */
    casts: { left: number; max: number } | null;
    /** "low" at 2 casts left, "last" at 1, once some have been used; null otherwise */
    warning: CastWarning | null;
}

export type CastWarning = "low" | "last";

/**
 * How many more times the spell can be cast at one rank, out of how many there were today. Options that
 * draw on the same pool count once (a rank's spontaneous slots, the focus pool, a staff's charges). Only
 * what a click could cast counts, so wand overcharge and staff + slot don't.
 */
export function castsAtRank(options: readonly CastOption[]): { left: number; max: number } | null {
    const pools = new Map<string, { left: number; max: number }>();
    for (const option of options) {
        if (option.kind === "wand-overcharge" || option.kind === "staff+slot") continue;
        const cost = option.cost;
        let key: string;
        let left: number;
        let max: number;
        switch (cost.type) {
            case "free":
                return null;
            case "prepared-slot":
                key = `prepared:${option.entryId}:${option.rank}:${option.slotIndex ?? 0}`;
                left = option.available ? 1 : 0;
                max = 1;
                break;
            case "slot":
            case "innate":
            case "wand":
                key = `${cost.type}:${option.entryId}:${cost.type === "innate" ? option.spellId : option.rank}`;
                left = option.available ? cost.value : 0;
                max = cost.max;
                break;
            case "focus":
                key = "focus";
                left = option.available ? cost.value : 0;
                max = cost.max;
                break;
            case "scroll":
                key = `scroll:${option.entryId}`;
                left = option.available ? cost.quantity : 0;
                max = cost.quantity;
                break;
            case "staff":
                if (cost.charges === 0) return null;
                key = `staff:${option.entryId}`;
                left = option.available ? Math.floor(cost.value / cost.charges) : 0;
                max = Math.floor(cost.max / cost.charges);
                break;
            default:
                continue;
        }
        const pool = pools.get(key);
        pools.set(key, { left: Math.max(pool?.left ?? 0, left), max: Math.max(pool?.max ?? 0, max) });
    }
    let left = 0;
    let max = 0;
    for (const pool of pools.values()) {
        left += pool.left;
        max += pool.max;
    }
    return { left, max };
}

/**
 * Warns when a rank is running out: yellow at 2 casts left, red at 1. Only once some have been used, so a
 * single prepared copy, a wand's one daily use or a lone scroll aren't flagged from the start.
 */
export function castWarning(casts: { left: number; max: number } | null): CastWarning | null {
    if (!casts || casts.left <= 0 || casts.left >= casts.max) return null;
    if (casts.left === 1) return "last";
    if (casts.left === 2) return "low";
    return null;
}

/**
 * One button per rank the row has cast options at, lowest first. Ranks where every option is spent
 * still get a (disabled) button, so the player can see what they used up.
 * A click casts the option the cast resolver picks with the character's priority order.
 */
export function rankButtons(row: SpellRow, priority: readonly PriorityGroup[] = DEFAULT_PRIORITY): RankButton[] {
    const byRank = new Map<number, CastOption[]>();
    for (const option of row.castOptions) {
        const list = byRank.get(option.rank) ?? [];
        list.push(option);
        byRank.set(option.rank, list);
    }

    return [...byRank.entries()]
        .sort(([a], [b]) => a - b)
        .map(([rank, options]) => {
            const picked = resolveCast(options, priority);
            const ordered = orderByPriority(options, priority);
            const casts = castsAtRank(options);
            return {
                rank,
                available: !!picked,
                option: picked ?? ordered[0]!,
                options: ordered,
                casts,
                warning: castWarning(casts),
            };
        });
}
