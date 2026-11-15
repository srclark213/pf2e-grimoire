import { DEFAULT_PRIORITY, type PriorityGroup } from "./cast-resolver.ts";

/**
 * Turns whatever is saved in the actor flag into a complete, valid priority list:
 * unknown entries and duplicates are dropped, and groups the save doesn't mention are appended
 * in default order (so groups added in later versions still appear).
 */
export function normalizePriority(saved: unknown): PriorityGroup[] {
    const result: PriorityGroup[] = [];
    if (Array.isArray(saved)) {
        for (const value of saved) {
            if (isPriorityGroup(value) && !result.includes(value)) result.push(value);
        }
    }
    for (const group of DEFAULT_PRIORITY) {
        if (!result.includes(group)) result.push(group);
    }
    return result;
}

/** Moves the group at `index` up (-1) or down (+1). Out-of-range moves return the list unchanged. */
export function movePriority(list: readonly PriorityGroup[], index: number, delta: -1 | 1): PriorityGroup[] {
    const target = index + delta;
    const result = [...list];
    if (index < 0 || index >= list.length || target < 0 || target >= list.length) return result;
    [result[index], result[target]] = [result[target]!, result[index]!];
    return result;
}

export function isDefaultPriority(list: readonly PriorityGroup[]): boolean {
    return list.length === DEFAULT_PRIORITY.length && list.every((g, i) => g === DEFAULT_PRIORITY[i]);
}

function isPriorityGroup(value: unknown): value is PriorityGroup {
    return typeof value === "string" && (DEFAULT_PRIORITY as readonly string[]).includes(value);
}
