import { DEFAULT_PRIORITY, type PriorityGroup } from "../spellbook/cast-resolver.ts";
import { DEFAULT_COLLAPSED, EMPTY_FILTER, type ChipGroup, type FilterState } from "../spellbook/filter.ts";
import type { RankGroup, StaffSnapshot, UsesSnapshot } from "../spellbook/model.ts";

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
    /** PF2e Staves entries still on the character, waiting to be imported */
    legacyStaves = $state(0);
    /** The character's source priority order, from its flags */
    priority: PriorityGroup[] = $state.raw([...DEFAULT_PRIORITY]);
    /** This user's current search and chips for this character */
    filter: FilterState = $state.raw({ ...EMPTY_FILTER });
    /** Filter-bar chip rows this user has collapsed */
    collapsed: ChipGroup[] = $state.raw([...DEFAULT_COLLAPSED]);
}
