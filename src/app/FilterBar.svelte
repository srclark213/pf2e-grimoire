<script lang="ts">
    import {
        CHIP_GROUPS,
        chipId,
        isEmptyFilter,
        parseChip,
        toggleChip,
        toggleCollapsed,
        type ChipGroup,
        type ChipId,
        type FilterState,
    } from "../spellbook/filter.ts";
    import type { ColumnState, OptionalColumn } from "../spellbook/table.ts";

    interface Props {
        filter: FilterState;
        chips: Record<ChipGroup, string[]>;
        shown: number;
        total: number;
        /** Rows in the filter panel showing only their selected chips */
        collapsed: ChipGroup[];
        columns: ColumnState;
        setFilter: (filter: FilterState) => void;
        setCollapsed: (collapsed: ChipGroup[]) => void;
        setColumn: (column: OptionalColumn, shown: boolean) => void;
    }

    const { filter, chips, shown, total, collapsed, columns, setFilter, setCollapsed, setColumn }: Props = $props();

    const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

    /** Which dropdown is open under the toolbar */
    let open: "filters" | "columns" | null = $state(null);
    const toggle = (panel: "filters" | "columns") => (open = open === panel ? null : panel);

    /** Localizes a pf2e config label if pf2e has one, otherwise title-cases the slug. */
    function pf2eLabel(table: Record<string, string> | undefined, value: string): string {
        const key = table?.[value];
        if (key) return game.i18n.localize(key);
        return value.replace(/(^|-)(\w)/g, (_, dash: string, c: string) => (dash ? " " : "") + c.toUpperCase());
    }

    const ACTION_GLYPHS: Record<string, string> = { "1": "1", "2": "2", "3": "3", reaction: "R", free: "F" };

    function label(group: ChipGroup, value: string): string {
        switch (group) {
            case "defense":
                return t(`Defense.${value}`);
            case "damage":
                return pf2eLabel(CONFIG.PF2E.damageTypes as Record<string, string>, value);
            case "action":
                return value === "long" ? t("Action.long") : "";
            case "category":
                return t(`Category.${value}`);
            case "trait":
                return pf2eLabel(CONFIG.PF2E.spellTraits as Record<string, string>, value);
            case "tag":
                return value;
        }
    }

    function tooltip(group: ChipGroup, value: string): string | undefined {
        if (group === "action") return t(`Action.${value}`);
        return undefined;
    }

    const groups = $derived(CHIP_GROUPS.filter((g) => chips[g].length > 0));

    /** The chips a row shows: all of them when open, only the selected ones when collapsed. */
    function shownValues(group: ChipGroup): string[] {
        if (!collapsed.includes(group)) return chips[group];
        return chips[group].filter((value) => filter.chips.includes(chipId(group, value)));
    }

    const active = $derived(filter.chips.map((id) => ({ id, ...parseChip(id) })));
</script>

{#snippet chipContent(group: ChipGroup, value: string)}
    {#if group === "action" && ACTION_GLYPHS[value]}
        <span class="action-glyph">{ACTION_GLYPHS[value]}</span>
    {:else}
        {label(group, value)}
    {/if}
{/snippet}

<div class="filter-bar">
    <div class="toolbar">
        <input
            type="search"
            placeholder={t("Filter.Search")}
            aria-label={t("Filter.Search")}
            value={filter.search}
            oninput={(event) => setFilter({ ...filter, search: event.currentTarget.value })}
        />
        <span class="count">{t("Filter.Count", { shown, total })}</span>
        <button
            type="button"
            class="tool"
            class:active={open === "filters"}
            aria-expanded={open === "filters"}
            onclick={() => toggle("filters")}
        >
            <i class="fa-solid fa-filter"></i>
            {filter.chips.length > 0 ? t("Filter.ButtonCount", { count: filter.chips.length }) : t("Filter.Button")}
        </button>
        <button
            type="button"
            class="tool icon"
            class:active={open === "columns"}
            aria-expanded={open === "columns"}
            aria-label={t("Table.Columns")}
            data-tooltip={t("Table.Columns")}
            onclick={() => toggle("columns")}
        >
            <i class="fa-solid fa-table-columns"></i>
        </button>
        <button
            type="button"
            class="tool icon"
            disabled={isEmptyFilter(filter)}
            data-tooltip={t("Filter.Clear")}
            aria-label={t("Filter.Clear")}
            onclick={() => setFilter({ search: "", chips: [] })}
        >
            <i class="fa-solid fa-filter-circle-xmark"></i>
        </button>
    </div>

    {#if active.length > 0}
        <div class="active">
            {#each active as chip (chip.id)}
                <button
                    type="button"
                    class="chip on"
                    aria-label={t("Filter.Remove")}
                    data-tooltip={t("Filter.Remove")}
                    onclick={() => setFilter(toggleChip(filter, chip.id as ChipId))}
                >
                    {@render chipContent(chip.group, chip.value)}
                    <i class="fa-solid fa-xmark"></i>
                </button>
            {/each}
        </div>
    {/if}

    {#if open === "columns"}
        <div class="panel columns">
            <label>
                <input
                    type="checkbox"
                    checked={columns.rank}
                    onchange={(event) => setColumn("rank", event.currentTarget.checked)}
                />
                {t("Table.ShowRank")}
            </label>
            <label>
                <input
                    type="checkbox"
                    checked={columns.from}
                    onchange={(event) => setColumn("from", event.currentTarget.checked)}
                />
                {t("Table.ShowFrom")}
            </label>
        </div>
    {/if}

    {#if open === "filters"}
        <div class="panel">
            {#each groups as group (group)}
                {@const isCollapsed = collapsed.includes(group)}
                {@const values = shownValues(group)}
                {@const groupName = t(`Filter.Group.${group}`)}
                <div class="chip-row">
                    <button
                        type="button"
                        class="group-label"
                        aria-expanded={!isCollapsed}
                        data-tooltip={t(isCollapsed ? "Filter.Expand" : "Filter.Collapse", { group: groupName })}
                        onclick={() => setCollapsed(toggleCollapsed(collapsed, group))}
                    >
                        <i class={isCollapsed ? "fa-solid fa-caret-right" : "fa-solid fa-caret-down"}></i>
                        {groupName}
                    </button>
                    <div class="chips">
                        {#each values as value (value)}
                            {@const id = chipId(group, value)}
                            <button
                                type="button"
                                class="chip"
                                class:on={filter.chips.includes(id)}
                                aria-pressed={filter.chips.includes(id)}
                                data-tooltip={tooltip(group, value)}
                                onclick={() => setFilter(toggleChip(filter, id))}
                            >
                                {@render chipContent(group, value)}
                            </button>
                        {/each}
                        {#if isCollapsed && chips[group].length > values.length}
                            <button
                                type="button"
                                class="more"
                                onclick={() => setCollapsed(toggleCollapsed(collapsed, group))}
                            >
                                {t("Filter.HiddenCount", { count: chips[group].length - values.length })}
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .filter-bar {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.4rem 0.25rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    }
    .toolbar {
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }
    input[type="search"] {
        flex: 1;
        min-width: 0;
        height: 1.8rem;
    }
    .count {
        font-size: 0.75rem;
        opacity: 0.7;
        white-space: nowrap;
    }
    .tool {
        all: unset;
        display: flex;
        align-items: center;
        gap: 0.3rem;
        height: 1.7rem;
        padding: 0 0.5rem;
        border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
        border-radius: 4px;
        font-size: 0.8rem;
        white-space: nowrap;
        cursor: pointer;
    }
    .tool.icon {
        justify-content: center;
        width: 1.7rem;
        padding: 0;
        border-color: transparent;
    }
    .tool:hover:not(:disabled),
    .tool:focus-visible,
    .tool.active {
        background: color-mix(in srgb, currentColor 15%, transparent);
    }
    .tool:disabled {
        opacity: 0.3;
        cursor: default;
    }
    .active {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
    }
    .panel {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.4rem;
        border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
        border-radius: 4px;
        max-height: 14rem;
        overflow-y: auto;
    }
    .panel.columns {
        flex-direction: row;
        gap: 1rem;
        font-size: 0.8rem;
    }
    .panel.columns label {
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }
    .chip-row {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
    }
    .group-label {
        all: unset;
        flex: none;
        width: 5rem;
        font-size: 0.7rem;
        opacity: 0.65;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        white-space: nowrap;
        cursor: pointer;
    }
    .group-label i {
        width: 0.6rem;
    }
    .group-label:hover,
    .group-label:focus-visible {
        opacity: 1;
    }
    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
    }
    .chip {
        all: unset;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0 0.5rem;
        border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
        border-radius: 999px;
        font-size: 0.75rem;
        line-height: 1.35rem;
        white-space: nowrap;
        cursor: pointer;
    }
    .chip:hover,
    .chip:focus-visible {
        background: color-mix(in srgb, currentColor 12%, transparent);
    }
    .chip.on {
        border-color: #c7892b;
        background: color-mix(in srgb, #c7892b 35%, transparent);
        font-weight: bold;
    }
    .chip i {
        font-size: 0.65rem;
    }
    .chip .action-glyph {
        font-size: 0.9rem;
    }
    .more {
        all: unset;
        font-size: 0.7rem;
        line-height: 1.35rem;
        opacity: 0.6;
        cursor: pointer;
        text-decoration: underline dotted;
    }
    .more:hover,
    .more:focus-visible {
        opacity: 1;
    }
</style>
