<script lang="ts">
    import type { CastOption, SpellRow } from "../spellbook/model.ts";
    import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
    import type { RankButton } from "../spellbook/rank-buttons.ts";
    import {
        gridRanks,
        sectionRows,
        splitRows,
        type ColumnState,
        type Section,
        type SortKey,
        type SortState,
    } from "../spellbook/table.ts";
    import SpellRowView from "./SpellRowView.svelte";

    interface Props {
        /** Already filtered and sorted */
        rows: SpellRow[];
        /** Every row before filtering, so the rank grid doesn't jump as filters change */
        allRows: SpellRow[];
        priority: PriorityGroup[];
        sort: SortState;
        columns: ColumnState;
        setSort: (key: SortKey) => void;
        /** The rank cantrips and focus spells heighten to */
        cantripRank: number;
        toggleCantrips: () => void;
        /** Section keys the player collapsed */
        collapsed: string[];
        toggleSection: (key: string) => void;
        openSpell: (spellId: string) => void;
        cast: (option: CastOption) => Promise<void>;
        openMenu: (event: MouseEvent, button: RankButton) => void;
        setTags: (spellIds: string[], tags: string[]) => Promise<void>;
        knownTags: string[];
    }

    const {
        rows,
        allRows,
        priority,
        sort,
        columns,
        setSort,
        cantripRank,
        toggleCantrips,
        collapsed,
        toggleSection,
        openSpell,
        cast,
        openMenu,
        setTags,
        knownTags,
    }: Props = $props();

    const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);
    const groups = $derived(splitRows(rows));
    const sections = $derived(sectionRows(groups.ranked, sort));

    function sectionTitle(section: Section): string {
        const label = section.label;
        switch (label.kind) {
            case "rank":
                return t("Rank", { rank: label.rank });
            case "save":
                return label.save ? t(`Defense.${label.save}`) : t("Table.NoSave");
            case "letters":
                return label.from === label.to ? label.from : `${label.from}–${label.to}`;
        }
    }
    const hasFocus = $derived(groups.autoHeightened.some((r) => r.isFocus));
    const hasCantrips = $derived(groups.autoHeightened.some((r) => !r.isFocus));
    const groupTitle = $derived(
        t(hasFocus && hasCantrips ? "CantripsAndFocus" : hasFocus ? "FocusAtRank" : "CantripsAtRank", {
            rank: cantripRank,
        }),
    );

    const ranks = $derived(gridRanks(allRows));
    const template = $derived(
        [
            columns.rank ? "1.5rem" : "",
            "minmax(9rem, 1fr)",
            "2.4rem",
            `calc(${ranks.length} * 1.45rem + ${ranks.length - 1} * 0.15rem)`,
            columns.from ? "minmax(4rem, 8.5rem)" : "",
        ]
            .filter(Boolean)
            .join(" "),
    );

    function sortIcon(key: SortKey): string {
        if (sort.key !== key) return "fa-solid fa-sort";
        return sort.dir === 1 ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";
    }
</script>

<div
    class="spell-table"
    role="table"
    style:--grimoire-columns={template}
    style:--grimoire-rank-columns={`repeat(${ranks.length}, 1.45rem)`}
>
    <div class="head" role="row">
        {#if columns.rank}
            <button type="button" class="sort center" role="columnheader" onclick={() => setSort("rank")}>
                <span data-tooltip={t("Table.RankHint")}>{t("Table.Rank")}</span>
                <i class={sortIcon("rank")}></i>
            </button>
        {/if}
        <button type="button" class="sort" role="columnheader" onclick={() => setSort("name")}>
            {t("Table.Spell")} <i class={sortIcon("name")}></i>
        </button>
        <button type="button" class="sort center" role="columnheader" onclick={() => setSort("save")}>
            {t("Table.Save")} <i class={sortIcon("save")}></i>
        </button>
        <span class="rank-heads" role="columnheader" data-tooltip={t("Table.CastHint")}>
            {#each ranks as rank (rank)}
                <span>{rank}</span>
            {/each}
        </span>
        {#if columns.from}
            <span class="from" role="columnheader">{t("Table.From")}</span>
        {/if}
    </div>
    {#if groups.autoHeightened.length > 0}
        <button
            type="button"
            class="group-toggle"
            aria-expanded={columns.cantrips}
            onclick={toggleCantrips}
        >
            <i class={columns.cantrips ? "fa-solid fa-caret-down" : "fa-solid fa-caret-right"}></i>
            <span class="group-title">{groupTitle}</span>
            <span class="group-count">{groups.autoHeightened.length}</span>
        </button>
        {#if columns.cantrips}
            {#each groups.autoHeightened as row (row.key)}
                <SpellRowView {row} {priority} {ranks} {columns} {openSpell} {cast} {openMenu} {setTags} {knownTags} />
            {/each}
        {/if}
    {/if}
    {#each sections as section (section.key)}
        {@const open = !collapsed.includes(section.key)}
        <button
            type="button"
            class="group-toggle section"
            aria-expanded={open}
            onclick={() => toggleSection(section.key)}
        >
            <i class={open ? "fa-solid fa-caret-down" : "fa-solid fa-caret-right"}></i>
            <span class="group-title">{sectionTitle(section)}</span>
            <span class="group-count">{section.rows.length}</span>
        </button>
        {#if open}
            {#each section.rows as row (row.key)}
                <SpellRowView {row} {priority} {ranks} {columns} {openSpell} {cast} {openMenu} {setTags} {knownTags} />
            {/each}
        {/if}
    {/each}
</div>

<style>
    .head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: grid;
        grid-template-columns: var(--grimoire-columns);
        align-items: center;
        column-gap: 0.4rem;
        padding: 0.2rem 0.25rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 25%, transparent);
        background: var(--color-cool-5-90, var(--color-bg, #1f1f24));
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        opacity: 0.85;
    }
    .sort {
        all: unset;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        min-width: 0;
        white-space: nowrap;
        cursor: pointer;
    }
    .sort.center {
        justify-content: center;
    }
    .sort i {
        font-size: 0.65rem;
        opacity: 0.6;
    }
    .sort:hover i,
    .sort:focus-visible i {
        opacity: 1;
    }
    .rank-heads {
        display: grid;
        grid-template-columns: var(--grimoire-rank-columns);
        gap: 0.15rem;
        text-align: center;
    }
    .from {
        white-space: nowrap;
    }
    .group-toggle {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        width: 100%;
        padding: 0.3rem 0.35rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
        font-size: 0.8rem;
        cursor: pointer;
    }
    .group-toggle:hover,
    .group-toggle:focus-visible {
        background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .group-toggle i {
        width: 0.7rem;
        opacity: 0.7;
    }
    .group-title {
        flex: 1;
        font-weight: bold;
    }
    .group-count {
        font-size: 0.75rem;
        opacity: 0.6;
    }
    .group-toggle.section {
        padding-top: 0.25rem;
        padding-bottom: 0.25rem;
        background: color-mix(in srgb, currentColor 4%, transparent);
        font-size: 0.78rem;
    }
</style>
