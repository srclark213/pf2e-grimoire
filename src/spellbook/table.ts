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
export type OptionalColumn = "rank" | "from" | "cantrips";
export interface ColumnState {
    rank: boolean;
    from: boolean;
    /** The cantrip and focus spell group is expanded */
    cantrips: boolean;
}
export const DEFAULT_COLUMNS: ColumnState = { rank: true, from: true, cantrips: true };

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
    return { rank: raw.rank !== false, from: raw.from !== false, cantrips: raw.cantrips !== false };
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

/** A collapsible section of the table, following the sort: a base rank, a save, or a run of letters */
export interface Section {
    /** Stable id for remembering whether it's collapsed, e.g. "rank:3", "save:will", "name:A-C" */
    key: string;
    label: SectionLabel;
    rows: SpellRow[];
}

export type SectionLabel =
    | { kind: "rank"; rank: number }
    | { kind: "save"; save: SpellDefense | null }
    | { kind: "letters"; from: string; to: string };

/** Letters per name section: grow a range until it holds this many spells... */
const MIN_PER_LETTER_SECTION = 3;
/** ...without going past this many, unless a single letter has more */
const MAX_PER_LETTER_SECTION = 5;

function initial(name: string): string {
    const first = name.normalize("NFD").charAt(0).toUpperCase();
    return /[A-Z]/.test(first) ? first : "#";
}

/**
 * Splits already-sorted rows into sections for the current sort, keeping their order:
 * - rank: one section per base rank
 * - save: Fortitude, Reflex, Will, AC, then spells with no save
 * - name: runs of consecutive initials holding about 3 to 5 spells ("A–C", "M"); a short last run joins
 *   the one before it
 */
export function sectionRows(rows: readonly SpellRow[], sort: SortState): Section[] {
    if (sort.key === "rank" || sort.key === "save") {
        const sections: Section[] = [];
        for (const row of rows) {
            const id = sort.key === "rank" ? String(row.baseRank) : (row.facets.defense ?? "none");
            const key = `${sort.key}:${id}`;
            let section = sections.at(-1);
            if (section?.key !== key) {
                const label: SectionLabel =
                    sort.key === "rank" ? { kind: "rank", rank: row.baseRank } : { kind: "save", save: row.facets.defense };
                section = { key, label, rows: [] };
                sections.push(section);
            }
            section.rows.push(row);
        }
        return sections;
    }

    // By name: group by initial, then merge neighbouring initials into ranges of a readable size.
    const byInitial: { letter: string; rows: SpellRow[] }[] = [];
    for (const row of rows) {
        const letter = initial(row.name);
        const last = byInitial.at(-1);
        if (last?.letter === letter) last.rows.push(row);
        else byInitial.push({ letter, rows: [row] });
    }
    const runs: { letters: string[]; rows: SpellRow[] }[] = [];
    for (const group of byInitial) {
        const current = runs.at(-1);
        const fits =
            current &&
            current.rows.length < MIN_PER_LETTER_SECTION &&
            current.rows.length + group.rows.length <= MAX_PER_LETTER_SECTION;
        if (fits) {
            current.letters.push(group.letter);
            current.rows.push(...group.rows);
        } else {
            runs.push({ letters: [group.letter], rows: [...group.rows] });
        }
    }
    const last = runs.at(-1);
    const beforeLast = runs.at(-2);
    if (last && beforeLast && last.rows.length < MIN_PER_LETTER_SECTION) {
        beforeLast.letters.push(...last.letters);
        beforeLast.rows.push(...last.rows);
        runs.pop();
    }
    return runs.map((run) => {
        const letters = [...run.letters].sort();
        const from = letters[0]!;
        const to = letters.at(-1)!;
        const key = from === to ? `name:${from}` : `name:${from}-${to}`;
        return { key, label: { kind: "letters", from, to }, rows: run.rows };
    });
}

/** Collapsing or expanding one section */
export function toggleSection(collapsed: readonly string[], key: string): string[] {
    return collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key];
}

export function normalizeCollapsedSections(saved: unknown): string[] {
    return Array.isArray(saved) ? saved.filter((k): k is string => typeof k === "string") : [];
}
