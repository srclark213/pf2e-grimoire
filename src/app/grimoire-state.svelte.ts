import { DEFAULT_PRIORITY, type PriorityGroup } from "../spellbook/cast-resolver.ts";
import { DEFAULT_COLLAPSED, EMPTY_FILTER, type ChipGroup, type FilterState } from "../spellbook/filter.ts";
import type { RankGroup, StaffSnapshot, UsesSnapshot } from "../spellbook/model.ts";
import type { BoostSlot } from "../spellbook/staff.ts";
import { DEFAULT_COLUMNS, DEFAULT_SORT } from "../spellbook/table.ts";
import type { TableView } from "../foundry/view-store.ts";

/** Reactive state shared between GrimoireApp and its Svelte components. The app replaces it on actor changes. */
export class GrimoireState {
    actorName = $state("");
    groups: RankGroup[] = $state.raw([]);
    entryCount = $state(0);
    /** The rank cantrips and focus spells heighten to */
    cantripRank = $state(1);
    focus: UsesSnapshot | null = $state.raw(null);
    /** Staves the character carries */
    staves: StaffSnapshot[] = $state.raw([]);
    /** The table's sort and hidden columns (this browser, every character) */
    view: TableView = $state.raw({ sort: DEFAULT_SORT, columns: DEFAULT_COLUMNS, collapsed: [] });
    /** Slots a prepared caster could expend into a staff today, and whether today's boost is used */
    boost: { slots: BoostSlot[]; used: boolean } = $state.raw({ slots: [], used: false });
    /** PF2e Staves entries still on the character, waiting to be imported */
    legacyStaves = $state(0);
    /** The character's source priority order, from its flags */
    priority: PriorityGroup[] = $state.raw([...DEFAULT_PRIORITY]);
    /** This user's current search and chips for this character */
    filter: FilterState = $state.raw({ ...EMPTY_FILTER });
    /** Filter-bar chip rows this user has collapsed */
    collapsed: ChipGroup[] = $state.raw([...DEFAULT_COLLAPSED]);
}
