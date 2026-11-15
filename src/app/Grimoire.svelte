<script lang="ts">
    import type { CastOption, RankGroup } from "../spellbook/model.ts";
    import type { GrimoireState } from "./grimoire-state.svelte.ts";
    import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
    import type { RankButton } from "../spellbook/rank-buttons.ts";
    import { availableChips, filterGroups, type ChipGroup, type FilterState } from "../spellbook/filter.ts";
    import FilterBar from "./FilterBar.svelte";
    import PrioritySettings from "./PrioritySettings.svelte";
    import SourceMenu from "./SourceMenu.svelte";
    import SpellRowView from "./SpellRowView.svelte";
    import StaffBar from "./StaffBar.svelte";

    interface Props {
        grimoire: GrimoireState;
        openSpell: (spellId: string) => void;
        cast: (option: CastOption) => Promise<void>;
        savePriority: (priority: PriorityGroup[] | null) => Promise<void>;
        setFilter: (filter: FilterState) => void;
        setCollapsed: (collapsed: ChipGroup[]) => void;
        setTags: (spellIds: string[], tags: string[]) => Promise<void>;
        repairWand: (wandId: string) => Promise<void>;
        prepareStaff: (staffId: string) => Promise<void>;
    }

    const { grimoire, openSpell, cast, savePriority, setFilter, setCollapsed, setTags, repairWand, prepareStaff }: Props = $props();

    const allRows = $derived(grimoire.groups.flatMap((g) => g.rows));
    const visibleGroups = $derived(filterGroups(grimoire.groups, grimoire.filter));
    const shownCount = $derived(visibleGroups.reduce((n, g) => n + g.rows.length, 0));
    const chips = $derived(availableChips(allRows, grimoire.filter.chips));

    let showSettings = $state(false);

    let root: HTMLElement | undefined = $state();
    let menu: { x: number; y: number; button: RankButton } | null = $state(null);

    /** Opens the right-click source menu for a rank button, inside the window near the pointer. */
    function openMenu(event: MouseEvent, button: RankButton): void {
        if (!root) return;
        const bounds = root.getBoundingClientRect();
        const x = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - 240));
        const y = Math.max(0, event.clientY - bounds.top);
        menu = { x, y, button };
    }

    async function choose(option: CastOption): Promise<void> {
        menu = null;
        await cast(option);
    }

    const spellCount = $derived(grimoire.groups.reduce((n, g) => n + g.rows.length, 0));

    function rankLabel(group: RankGroup): string {
        if (group.rank > 0) return game.i18n.localize("PF2EGrimoire.Rank", { rank: group.rank });
        const hasFocus = group.rows.some((r) => r.isFocus);
        const hasCantrips = group.rows.some((r) => r.isCantrip && !r.isFocus);
        const key = hasFocus && hasCantrips ? "CantripsAndFocus" : hasFocus ? "FocusAtRank" : "CantripsAtRank";
        return game.i18n.localize(`PF2EGrimoire.${key}`, { rank: grimoire.cantripRank });
    }
</script>

<div class="grimoire" bind:this={root}>
    <header>
        <span class="summary">
            {game.i18n.localize("PF2EGrimoire.Summary", { spells: spellCount, entries: grimoire.entryCount })}
        </span>
        {#if grimoire.focus}
            <span
                class="focus"
                data-tooltip={game.i18n.localize("PF2EGrimoire.FocusPoints", {
                    value: grimoire.focus.value,
                    max: grimoire.focus.max,
                })}
            >
                {#each Array.from({ length: grimoire.focus.max }, (_, i) => i) as i (i)}
                    <i class={i < grimoire.focus.value ? "fa-solid fa-circle" : "fa-regular fa-circle"}></i>
                {/each}
            </span>
        {/if}
        <button
            type="button"
            class="settings-toggle"
            class:active={showSettings}
            aria-label={game.i18n.localize("PF2EGrimoire.Priority.Open")}
            data-tooltip={game.i18n.localize("PF2EGrimoire.Priority.Open")}
            onclick={() => (showSettings = !showSettings)}
        >
            <i class="fa-solid fa-sliders"></i>
        </button>
    </header>

    {#if showSettings}
        <PrioritySettings priority={grimoire.priority} save={savePriority} close={() => (showSettings = false)} />
    {/if}

    {#if grimoire.staves.length > 0}
        <StaffBar staves={grimoire.staves} prepare={prepareStaff} />
    {/if}

    {#if allRows.length > 0}
        <FilterBar
            filter={grimoire.filter}
            {chips}
            shown={shownCount}
            total={spellCount}
            collapsed={grimoire.collapsed}
            {setFilter}
            {setCollapsed}
        />
    {/if}

    <div class="groups">
        {#each visibleGroups as group (group.rank)}
            <section>
                <h3>
                    <span>{rankLabel(group)}</span>
                    <span class="count">{group.rows.length}</span>
                </h3>
                <ul>
                    {#each group.rows as row (row.key)}
                        <SpellRowView
                            {row}
                            priority={grimoire.priority}
                            {openSpell}
                            {cast}
                            {openMenu}
                            {setTags}
                            knownTags={chips.tag}
                        />
                    {/each}
                </ul>
            </section>
        {:else}
            <p class="empty">
                {game.i18n.localize(allRows.length > 0 ? "PF2EGrimoire.Filter.NoMatches" : "PF2EGrimoire.NoSpells")}
            </p>
        {/each}
    </div>

    {#if menu}
        <SourceMenu
            x={menu.x}
            y={menu.y}
            rank={menu.button.rank}
            options={menu.button.options}
            defaultOption={menu.button.available ? menu.button.option : null}
            {choose}
            repair={async (wandId) => {
                menu = null;
                await repairWand(wandId);
            }}
            close={() => (menu = null)}
        />
    {/if}
</div>

<style>
    .grimoire {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
    }
    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0 0.25rem 0.4rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    }
    .summary {
        flex: 1;
        opacity: 0.75;
        font-size: 0.85rem;
    }
    .focus {
        display: flex;
        gap: 0.2rem;
        color: #c7892b;
        font-size: 0.8rem;
    }
    .settings-toggle {
        all: unset;
        width: 1.6rem;
        height: 1.6rem;
        border-radius: 4px;
        text-align: center;
        line-height: 1.6rem;
        cursor: pointer;
        opacity: 0.75;
    }
    .settings-toggle:hover,
    .settings-toggle:focus-visible,
    .settings-toggle.active {
        opacity: 1;
        background: color-mix(in srgb, currentColor 15%, transparent);
    }
    .groups {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-top: 0.25rem;
    }
    h3 {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin: 0.6rem 0 0.2rem;
        padding: 0 0.25rem 0.1rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
        font-size: 1rem;
    }
    .count {
        font-size: 0.75rem;
        opacity: 0.6;
    }
    ul {
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .empty {
        opacity: 0.7;
        text-align: center;
    }
</style>
