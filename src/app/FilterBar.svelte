<script lang="ts">
    import {
        CHIP_GROUPS,
        chipId,
        isEmptyFilter,
        toggleChip,
        type ChipGroup,
        type FilterState,
    } from "../spellbook/filter.ts";

    interface Props {
        filter: FilterState;
        chips: Record<ChipGroup, string[]>;
        shown: number;
        total: number;
        setFilter: (filter: FilterState) => void;
    }

    const { filter, chips, shown, total, setFilter }: Props = $props();

    let showTraits = $state(false);

    const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

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

    const visibleGroups = $derived(
        CHIP_GROUPS.filter((g) => chips[g].length > 0 && (g !== "trait" || showTraits)),
    );
    const traitCount = $derived(chips.trait.length);
    const selectedTraits = $derived(filter.chips.filter((c) => c.startsWith("trait:")).length);
</script>

<div class="filter-bar">
    <div class="search-row">
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
            class="clear"
            disabled={isEmptyFilter(filter)}
            data-tooltip={t("Filter.Clear")}
            aria-label={t("Filter.Clear")}
            onclick={() => setFilter({ search: "", chips: [] })}
        >
            <i class="fa-solid fa-filter-circle-xmark"></i>
        </button>
    </div>

    {#each visibleGroups as group (group)}
        <div class="chip-row">
            <span class="group-label">{t(`Filter.Group.${group}`)}</span>
            <div class="chips">
                {#each chips[group] as value (value)}
                    {@const id = chipId(group, value)}
                    <button
                        type="button"
                        class="chip"
                        class:on={filter.chips.includes(id)}
                        aria-pressed={filter.chips.includes(id)}
                        data-group={group}
                        data-tooltip={tooltip(group, value)}
                        onclick={() => setFilter(toggleChip(filter, id))}
                    >
                        {#if group === "action" && ACTION_GLYPHS[value]}
                            <span class="action-glyph">{ACTION_GLYPHS[value]}</span>
                        {:else}
                            {label(group, value)}
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    {/each}

    {#if traitCount > 0}
        <button type="button" class="more" onclick={() => (showTraits = !showTraits)}>
            {showTraits ? t("Filter.HideTraits") : t("Filter.ShowTraits", { count: traitCount })}
            {#if !showTraits && selectedTraits > 0}
                <span class="selected-note">{t("Filter.SelectedTraits", { count: selectedTraits })}</span>
            {/if}
        </button>
    {/if}
</div>

<style>
    .filter-bar {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 0.4rem 0.25rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    }
    .search-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
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
    .clear {
        all: unset;
        width: 1.6rem;
        height: 1.6rem;
        border-radius: 4px;
        text-align: center;
        line-height: 1.6rem;
        cursor: pointer;
    }
    .clear:hover:not(:disabled),
    .clear:focus-visible {
        background: color-mix(in srgb, currentColor 15%, transparent);
    }
    .clear:disabled {
        opacity: 0.3;
        cursor: default;
    }
    .chip-row {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
    }
    .group-label {
        flex: none;
        width: 4.5rem;
        font-size: 0.7rem;
        opacity: 0.65;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
    }
    .chip {
        all: unset;
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
    .chip .action-glyph {
        font-size: 0.9rem;
    }
    .more {
        all: unset;
        align-self: flex-start;
        font-size: 0.75rem;
        opacity: 0.75;
        cursor: pointer;
        text-decoration: underline dotted;
    }
    .selected-note {
        margin-left: 0.3rem;
        color: #c7892b;
    }
</style>
