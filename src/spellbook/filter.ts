import { ALL_CATEGORIES } from "./categories.ts";
import type { RankGroup, SpellRow } from "./model.ts";

/** The chip groups in the filter bar, in display order */
export const CHIP_GROUPS = ["defense", "damage", "action", "category", "trait", "tag"] as const;
export type ChipGroup = (typeof CHIP_GROUPS)[number];

/** A chip is `group:value`, e.g. "defense:will" or "damage:fire" */
export type ChipId = `${ChipGroup}:${string}`;

export interface FilterState {
    search: string;
    chips: ChipId[];
}

export const EMPTY_FILTER: FilterState = { search: "", chips: [] };

/** Traits on nearly every spell: not worth a chip. */
const HIDDEN_TRAITS = new Set(["concentrate", "manipulate", "cantrip", "focus"]);

const DEFENSE_ORDER = ["fortitude", "reflex", "will", "ac"];
const ACTION_ORDER = ["1", "2", "3", "reaction", "free", "long"];

/** The values a row has for each chip group */
export function rowValues(row: SpellRow): Record<ChipGroup, string[]> {
    return {
        defense: row.facets.defense ? [row.facets.defense] : [],
        damage: row.facets.damageTypes,
        action: row.facets.actions,
        category: row.categories,
        trait: row.facets.traits.filter((t) => !HIDDEN_TRAITS.has(t)),
        tag: row.tags,
    };
}

export function chipId(group: ChipGroup, value: string): ChipId {
    return `${group}:${value}`;
}

export function parseChip(chip: ChipId): { group: ChipGroup; value: string } {
    const index = chip.indexOf(":");
    return { group: chip.slice(0, index) as ChipGroup, value: chip.slice(index + 1) };
}

/**
 * A row passes when its name contains the search text and, for every chip group with selected chips,
 * it has at least one of them. So chips in different groups narrow (Will AND Fire) while chips in the
 * same group widen (Fire OR Cold).
 */
export function rowMatches(row: SpellRow, filter: FilterState): boolean {
    const search = filter.search.trim().toLocaleLowerCase();
    if (search && !row.name.toLocaleLowerCase().includes(search)) return false;

    const selected = new Map<ChipGroup, Set<string>>();
    for (const chip of filter.chips) {
        const { group, value } = parseChip(chip);
        const values = selected.get(group) ?? new Set<string>();
        values.add(value);
        selected.set(group, values);
    }
    if (selected.size === 0) return true;

    const values = rowValues(row);
    for (const [group, wanted] of selected) {
        if (!values[group].some((v) => wanted.has(v))) return false;
    }
    return true;
}

/** Applies the filter to rank groups, dropping groups left empty. */
export function filterGroups(groups: readonly RankGroup[], filter: FilterState): RankGroup[] {
    if (isEmptyFilter(filter)) return [...groups];
    return groups
        .map((group) => ({ rank: group.rank, rows: group.rows.filter((row) => rowMatches(row, filter)) }))
        .filter((group) => group.rows.length > 0);
}

export function isEmptyFilter(filter: FilterState): boolean {
    return filter.search.trim() === "" && filter.chips.length === 0;
}

/** Adds the chip if absent, removes it if present. */
export function toggleChip(filter: FilterState, chip: ChipId): FilterState {
    const chips = filter.chips.includes(chip) ? filter.chips.filter((c) => c !== chip) : [...filter.chips, chip];
    return { ...filter, chips };
}

/**
 * The chips worth offering for these rows: only values at least one spell has, in a stable order.
 * Selected chips are always kept so the player can turn them off.
 */
export function availableChips(rows: readonly SpellRow[], selected: readonly ChipId[] = []): Record<ChipGroup, string[]> {
    const found: Record<ChipGroup, Set<string>> = {
        defense: new Set(),
        damage: new Set(),
        action: new Set(),
        category: new Set(),
        trait: new Set(),
        tag: new Set(),
    };
    for (const row of rows) {
        const values = rowValues(row);
        for (const group of CHIP_GROUPS) for (const v of values[group]) found[group].add(v);
    }
    for (const chip of selected) {
        const { group, value } = parseChip(chip);
        found[group]?.add(value);
    }

    const byOrder = (order: readonly string[]) => (a: string, b: string) =>
        (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b);
    return {
        defense: [...found.defense].sort(byOrder(DEFENSE_ORDER)),
        damage: [...found.damage].sort(),
        action: [...found.action].sort(byOrder(ACTION_ORDER)),
        category: [...found.category].sort(byOrder(ALL_CATEGORIES)),
        trait: [...found.trait].sort(),
        tag: [...found.tag].sort((a, b) => a.localeCompare(b)),
    };
}

/** Repairs a saved filter (from client settings) into a valid one. */
export function normalizeFilter(saved: unknown): FilterState {
    if (!saved || typeof saved !== "object") return { ...EMPTY_FILTER };
    const raw = saved as { search?: unknown; chips?: unknown };
    const search = typeof raw.search === "string" ? raw.search : "";
    const chips = Array.isArray(raw.chips)
        ? raw.chips.filter(
              (c): c is ChipId =>
                  typeof c === "string" && (CHIP_GROUPS as readonly string[]).includes(c.split(":")[0] ?? ""),
          )
        : [];
    return { search, chips: [...new Set(chips)] };
}
