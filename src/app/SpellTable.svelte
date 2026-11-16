<script lang="ts">
    import type { CastOption, SpellRow } from "../spellbook/model.ts";
    import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
    import type { RankButton } from "../spellbook/rank-buttons.ts";
    import { gridRanks, type ColumnState, type SortKey, type SortState } from "../spellbook/table.ts";
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
        openSpell: (spellId: string) => void;
        cast: (option: CastOption) => Promise<void>;
        openMenu: (event: MouseEvent, button: RankButton) => void;
        setTags: (spellIds: string[], tags: string[]) => Promise<void>;
        knownTags: string[];
    }

    const { rows, allRows, priority, sort, columns, setSort, openSpell, cast, openMenu, setTags, knownTags }: Props =
        $props();

    const t = (key: string) => game.i18n.localize(`PF2EGrimoire.${key}`);

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
                <span>{rank === 0 ? "C" : rank}</span>
            {/each}
        </span>
        {#if columns.from}
            <span class="from" role="columnheader">{t("Table.From")}</span>
        {/if}
    </div>
    {#each rows as row (row.key)}
        <SpellRowView {row} {priority} {ranks} {columns} {openSpell} {cast} {openMenu} {setTags} {knownTags} />
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
</style>
