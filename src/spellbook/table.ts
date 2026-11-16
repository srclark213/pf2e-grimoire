import type { ActionKey, SpellDefense } from "./facets.ts";
import type { SpellRow } from "./model.ts";

/**
 * The spell table: one line per spell, sortable, with each rank's button in its own column so a rank-5
 * button always sits in the same place.
 */

export type SortKey = "name" | "rank" | "save";
export interface SortState {
    key: SortKey;
    dir: 1 | -1;
}
/** Base rank, then name: higher-rank spells collect at the bottom, as the old grouped list had them. */
export const DEFAULT_SORT: SortState = { key: "rank", dir: 1 };

/** Columns the player can hide, and the cantrip group's open state */
export type OptionalColumn = "rank" | "casts" | "from" | "cantrips";
export interface ColumnState {
    rank: boolean;
    /** Casts left today */
    casts: boolean;
    from: boolean;
    /** The cantrip and focus spell group is expanded */
    cantrips: boolean;
}
export const DEFAULT_COLUMNS: ColumnState = { rank: true, casts: true, from: true, cantrips: true };

const SAVE_ORDER: (SpellDefense | null)[] = ["fortitude", "reflex", "will", "ac", null];

function saveIndex(row: SpellRow): number {
    return SAVE_ORDER.indexOf(row.facets.defense);
}

/** Sorts rows by the chosen column; ties fall back to base rank, then name. */
export function sortRows(rows: readonly SpellRow[], sort: SortState): SpellRow[] {
    const byName = (a: SpellRow, b: SpellRow) => a.name.localeCompare(b.name);
    const byRank = (a: SpellRow, b: SpellRow) => a.baseRank - b.baseRank;
    const primary = { name: byName, rank: byRank, save: (a: SpellRow, b: SpellRow) => saveIndex(a) - saveIndex(b) }[
        sort.key
    ];
    return [...rows].sort((a, b) => primary(a, b) * sort.dir || byRank(a, b) || byName(a, b));
}

/** Clicking a header: the same column flips direction, another column starts ascending. */
export function toggleSort(sort: SortState, key: SortKey): SortState {
    return sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 };
}

export function normalizeSort(saved: unknown): SortState {
    const raw = (saved && typeof saved === "object" ? saved : {}) as Partial<SortState>;
    const key = raw.key === "name" || raw.key === "rank" || raw.key === "save" ? raw.key : DEFAULT_SORT.key;
    return { key, dir: raw.dir === -1 ? -1 : 1 };
}

export function normalizeColumns(saved: unknown): ColumnState {
    const raw = (saved && typeof saved === "object" ? saved : {}) as Partial<ColumnState>;
    return {
        rank: raw.rank !== false,
        casts: raw.casts !== false,
        from: raw.from !== false,
        cantrips: raw.cantrips !== false,
    };
}

/** Cantrips and focus spells (always cast at the character's top rank) apart from everything else */
export function splitRows(rows: readonly SpellRow[]): { autoHeightened: SpellRow[]; ranked: SpellRow[] } {
    return {
        autoHeightened: rows.filter((r) => r.baseRank === 0),
        ranked: rows.filter((r) => r.baseRank > 0),
    };
}

/**
 * The rank grid's columns, 1 up to the highest rank any ranked spell can be cast at. Cantrips and focus
 * spells live in their own group with a single button, so they don't stretch the grid to the top rank.
 */
export function gridRanks(rows: readonly SpellRow[]): number[] {
    let highest = 1;
    for (const row of rows) {
        if (row.baseRank === 0) continue;
        for (const option of row.castOptions) highest = Math.max(highest, option.rank);
    }
    return Array.from({ length: highest }, (_, i) => i + 1);
}

/** The label in the rank column and on a cantrip or focus spell's button: C, F or the rank */
export function rankLabel(row: SpellRow): string {
    if (row.baseRank > 0) return String(row.baseRank);
    return row.isCantrip ? "C" : "F";
}

/**
 * pf2e's action font characters ("1", "2", "3", "R", "F"; a range like "1 – 3"), or null for spells that
 * take longer than a turn, which are shown with a clock instead.
 */
export function actionGlyph(actions: readonly ActionKey[]): string | null {
    if (actions.length === 0 || actions.includes("long")) return null;
    const char = (key: ActionKey) => (key === "reaction" ? "R" : key === "free" ? "F" : key);
    if (actions.length === 1) return char(actions[0]!);
    return `${char(actions[0]!)} – ${char(actions.at(-1)!)}`;
}

/**
 * How many more times today the spell can be cast, across all its sources; null means without limit
 * (cantrips, free casts, staff cantrips). Options drawing on the same pool count once: a staff that lists a
 * spell at two ranks gives charges / the cheaper cost, and a spontaneous rank's slots count once however
 * many ways reach them. Only what a click could cast counts, so wand overcharge and staff + slot don't.
 */
export function castsLeft(row: SpellRow): number | null {
    const pools = new Map<string, number>();
    for (const option of row.castOptions) {
        if (!option.available || option.kind === "wand-overcharge" || option.kind === "staff+slot") continue;
        const cost = option.cost;
        let key: string;
        let count: number;
        switch (cost.type) {
            case "free":
                return null;
            case "prepared-slot":
                key = `prepared:${option.entryId}:${option.rank}:${option.slotIndex ?? 0}`;
                count = 1;
                break;
            case "slot":
                key = `slot:${option.entryId}:${option.rank}`;
                count = cost.value;
                break;
            case "innate":
                key = `innate:${option.entryId}:${option.spellId}`;
                count = cost.value;
                break;
            case "focus":
                key = "focus";
                count = cost.value;
                break;
            case "wand":
                key = `item:${option.entryId}`;
                count = 1;
                break;
            case "scroll":
                key = `item:${option.entryId}`;
                count = cost.quantity;
                break;
            case "staff":
                if (cost.charges === 0) return null;
                key = `staff:${option.entryId}`;
                count = Math.floor(cost.value / cost.charges);
                break;
            default:
                continue;
        }
        pools.set(key, Math.max(pools.get(key) ?? 0, count));
    }
    let total = 0;
    for (const count of pools.values()) total += count;
    return total;
}
