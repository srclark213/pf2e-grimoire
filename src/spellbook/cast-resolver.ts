import type { CastOption, SourceKind } from "./model.ts";

/** What the per-character priority order ranks. Prepared and spontaneous slots count as one group. */
export type PriorityGroup = "slot" | "focus" | "innate" | "staff" | "wand" | "scroll";

/**
 * Slots first (the user's choice), then the renewable focus pool, then once-a-day innate uses,
 * then items. Players reorder this per character in GRIM-11.
 */
export const DEFAULT_PRIORITY: readonly PriorityGroup[] = ["slot", "focus", "innate", "staff", "wand", "scroll"];

const GROUP_OF: Record<SourceKind, PriorityGroup | null> = {
    prepared: "slot",
    spontaneous: "slot",
    focus: "focus",
    innate: "innate",
    staff: "staff",
    wand: "wand",
    scroll: "scroll",
    // Risky or doubly-costly: only ever cast when the player picks them from the right-click menu.
    "wand-overcharge": null,
    "staff+slot": null,
};

/** True for options a click may pick on its own. Wand overcharge and staff + slot never are. */
export function isAutoPickable(option: CastOption): boolean {
    return GROUP_OF[option.kind] !== null;
}

/**
 * Picks the option a plain click casts: the available, auto-pickable option whose group comes first
 * in the priority order. Ties keep the incoming order (spellcasting-entry order). Null if none qualify.
 */
export function resolveCast(
    options: readonly CastOption[],
    priority: readonly PriorityGroup[] = DEFAULT_PRIORITY,
): CastOption | null {
    const rankOf = (option: CastOption): number => {
        const group = GROUP_OF[option.kind];
        const index = group ? priority.indexOf(group) : -1;
        // Groups missing from a saved priority list go last rather than being dropped.
        return index === -1 ? priority.length : index;
    };

    let best: CastOption | null = null;
    for (const option of options) {
        if (!option.available || !isAutoPickable(option)) continue;
        if (!best || rankOf(option) < rankOf(best)) best = option;
    }
    return best;
}
