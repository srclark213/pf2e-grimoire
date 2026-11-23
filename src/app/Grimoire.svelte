<script lang="ts">
    import type { CastOption, SpellRow } from "../spellbook/model.ts";
    import type { GrimoireState } from "./grimoire-state.svelte.ts";
    import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
    import type { RankButton } from "../spellbook/rank-buttons.ts";
    import { availableChips, rowMatches, type ChipGroup, type FilterState } from "../spellbook/filter.ts";
    import { sortRows, type OptionalColumn, type SortKey } from "../spellbook/table.ts";
    import FilterBar from "./FilterBar.svelte";
    import PrioritySettings from "./PrioritySettings.svelte";
    import SourceMenu from "./SourceMenu.svelte";
    import SpellTable from "./SpellTable.svelte";
    import StaffBar from "./StaffBar.svelte";
    import type { StaffEditorActions } from "./StaffEditor.svelte";

    interface Props {
        grimoire: GrimoireState;
        openSpell: (spellId: string) => void;
        shareSpell: (row: SpellRow) => Promise<void>;
        cast: (option: CastOption) => Promise<void>;
        savePriority: (priority: PriorityGroup[] | null) => Promise<void>;
        setFilter: (filter: FilterState) => void;
        setCollapsed: (collapsed: ChipGroup[]) => void;
        setTags: (spellIds: string[], tags: string[]) => Promise<void>;
        repairWand: (wandId: string) => Promise<void>;
        prepareStaff: (staffId: string) => Promise<void>;
        importLegacyStaves: () => Promise<void>;
        boostStaff: (staffId: string) => Promise<void>;
        staffEditor: StaffEditorActions;
        setSort: (key: SortKey) => void;
        setColumn: (column: OptionalColumn, shown: boolean) => void;
        toggleSection: (key: string) => void;
    }

    const { grimoire, openSpell, shareSpell, cast, savePriority, setFilter, setCollapsed, setTags, repairWand, prepareStaff, importLegacyStaves, boostStaff, staffEditor, setSort, setColumn, toggleSection }: Props = $props();

    const allRows = $derived(grimoire.groups.flatMap((g) => g.rows));
    const visibleRows = $derived(
        sortRows(
            allRows.filter((row) => rowMatches(row, grimoire.filter)),
            grimoire.view.sort,
        ),
    );
    const shownCount = $derived(visibleRows.length);
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

    const spellCount = $derived(allRows.length);
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

    {#if grimoire.staves.length > 0 || grimoire.legacyStaves > 0}
        <StaffBar
            staves={grimoire.staves}
            legacyCount={grimoire.legacyStaves}
            prepare={prepareStaff}
            importLegacy={importLegacyStaves}
            boost={grimoire.boost}
            {boostStaff}
            editor={staffEditor}
        />
    {/if}

    {#if allRows.length > 0}
        <FilterBar
            filter={grimoire.filter}
            {chips}
            shown={shownCount}
            total={spellCount}
            collapsed={grimoire.collapsed}
            columns={grimoire.view.columns}
            {setFilter}
            {setCollapsed}
            {setColumn}
        />
    {/if}

    <div class="groups">
        {#if visibleRows.length > 0}
            <SpellTable
                rows={visibleRows}
                {allRows}
                priority={grimoire.priority}
                sort={grimoire.view.sort}
                columns={grimoire.view.columns}
                {setSort}
                cantripRank={grimoire.cantripRank}
                toggleCantrips={() => setColumn("cantrips", !grimoire.view.columns.cantrips)}
                collapsed={grimoire.view.collapsed}
                {toggleSection}
                {openSpell}
                {shareSpell}
                {cast}
                {openMenu}
                {setTags}
                knownTags={chips.tag}
            />
        {:else}
            <p class="empty">
                {game.i18n.localize(allRows.length > 0 ? "PF2EGrimoire.Filter.NoMatches" : "PF2EGrimoire.NoSpells")}
            </p>
        {/if}
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
    }
    .empty {
        opacity: 0.7;
        text-align: center;
    }
</style>
