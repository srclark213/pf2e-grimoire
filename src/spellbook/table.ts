import type { ActionKey, SpellDefense } from "./facets.ts";
import type { SpellRow } from "./model.ts";
import type { RankButton } from "./rank-buttons.ts";

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

/** Columns the player can hide */
export type OptionalColumn = "rank" | "from";
export interface ColumnState {
    rank: boolean;
    from: boolean;
}
export const DEFAULT_COLUMNS: ColumnState = { rank: true, from: true };

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
    return { rank: raw.rank !== false, from: raw.from !== false };
}

/**
 * The rank grid's columns: 0 (cantrips and focus spells, which heighten on their own) then 1 up to the
 * highest rank any row can be cast at.
 */
export function gridRanks(rows: readonly SpellRow[]): number[] {
    let highest = 1;
    for (const row of rows) {
        if (row.baseRank === 0) continue;
        for (const option of row.castOptions) highest = Math.max(highest, option.rank);
    }
    return Array.from({ length: highest + 1 }, (_, i) => i);
}

/** The grid column a button belongs in: cantrips and focus spells go in column 0 whatever rank they cast at. */
export function buttonColumn(row: SpellRow, button: RankButton): number {
    return row.baseRank === 0 ? 0 : button.rank;
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
