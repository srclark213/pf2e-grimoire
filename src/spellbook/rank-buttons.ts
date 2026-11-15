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
            return { rank, available: !!picked, option: picked ?? ordered[0]!, options: ordered };
        });
}
