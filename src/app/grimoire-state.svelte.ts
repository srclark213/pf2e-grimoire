import { DEFAULT_PRIORITY, type PriorityGroup } from "../spellbook/cast-resolver.ts";
import type { RankGroup, UsesSnapshot } from "../spellbook/model.ts";

/** Reactive state shared between GrimoireApp and its Svelte components. The app replaces it on actor changes. */
export class GrimoireState {
    actorName = $state("");
    groups: RankGroup[] = $state.raw([]);
    entryCount = $state(0);
    /** The rank cantrips and focus spells heighten to */
    cantripRank = $state(1);
    focus: UsesSnapshot | null = $state.raw(null);
    /** The character's source priority order, from its flags */
    priority: PriorityGroup[] = $state.raw([...DEFAULT_PRIORITY]);
}
