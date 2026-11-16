<script lang="ts">
    import { badgeLabel } from "../spellbook/labels.ts";
    import type { CastOption, SpellRow } from "../spellbook/model.ts";
    import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
    import { rankButtons, type RankButton } from "../spellbook/rank-buttons.ts";
    import { actionGlyph, buttonColumn, rankLabel, type ColumnState } from "../spellbook/table.ts";
    import { addTag, removeTag } from "../spellbook/tags.ts";

    interface Props {
        row: SpellRow;
        priority: PriorityGroup[];
        /** The rank grid's columns (0 = cantrips and focus spells) */
        ranks: number[];
        columns: ColumnState;
        openSpell: (spellId: string) => void;
        cast: (option: CastOption) => Promise<void>;
        openMenu: (event: MouseEvent, button: RankButton) => void;
        setTags: (spellIds: string[], tags: string[]) => Promise<void>;
        /** Every tag on this character, for suggestions */
        knownTags: string[];
    }

    const { row, priority, ranks, columns, openSpell, cast, openMenu, setTags, knownTags }: Props = $props();

    const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

    let editingTags = $state(false);
    let tagInput = $state("");
    const listId = $derived(`grimoire-tags-${row.key}`);

    async function onAddTag(event: SubmitEvent): Promise<void> {
        event.preventDefault();
        const next = addTag(row.tags, tagInput);
        tagInput = "";
        if (next.length !== row.tags.length) await setTags(row.spellIds, next);
    }

    const buttons = $derived(rankButtons(row, priority));
    /** The button in each grid column, if the spell can be cast there */
    const byColumn = $derived(new Map(buttons.map((b) => [buttonColumn(row, b), b])));
    const glyph = $derived(actionGlyph(row.facets.actions));
    const isLong = $derived(row.facets.actions.includes("long"));
    const save = $derived(row.facets.defense ? t(`Defense.Short.${row.facets.defense}`) : "");
    const label = $derived(rankLabel(row));

    let casting = $state(false);

    async function onCast(option: CastOption): Promise<void> {
        if (casting) return;
        casting = true;
        try {
            await cast(option);
        } finally {
            casting = false;
        }
    }

    function buttonTooltip(option: CastOption, available: boolean): string {
        return t(available ? "CastAt" : "SpentAt", { rank: option.rank, source: option.entryName });
    }

    function isItem(kind: string): boolean {
        return kind === "wand" || kind === "scroll" || kind === "staff";
    }

    function kindLabel(kind: string, badge = false): string {
        return t(`${badge ? "Badge" : "Kind"}.${kind}`);
    }
</script>

<div class="spell-row" class:unavailable={!row.available} role="row">
    {#if columns.rank}
        <span class="cell base-rank" role="cell">{label}</span>
    {/if}
    <span class="cell name-cell" role="cell">
        <button
            type="button"
            class="spell-name"
            onclick={() => openSpell(row.spellIds[0] ?? row.sources[0]?.entryId ?? "")}
        >
            <img src={row.img} alt="" />
            <span class="name">{row.name}</span>
            {#if glyph}
                <span class="action-glyph glyph">{glyph}</span>
            {:else if isLong}
                <i class="fa-regular fa-clock glyph" data-tooltip={t("Action.long")}></i>
            {/if}
            {#each row.tags as tag (tag)}
                <span class="tag">#{tag}</span>
            {/each}
        </button>
        {#if row.spellIds.length > 0}
            <button
                type="button"
                class="tag-toggle"
                class:active={editingTags}
                aria-label={t("Tags.Edit")}
                data-tooltip={t("Tags.Edit")}
                onclick={() => (editingTags = !editingTags)}
            >
                <i class="fa-solid fa-tag"></i>
            </button>
        {/if}
    </span>
    <span class="cell save" role="cell">{save}</span>
    <span class="cell ranks" role="cell">
        {#each ranks as column (column)}
            {@const button = byColumn.get(column)}
            {#if button}
                <button
                    type="button"
                    class="rank"
                    aria-disabled={!button.available || casting}
                    class:spent={!button.available}
                    data-tooltip={buttonTooltip(button.option, button.available)}
                    onclick={() => button.available && onCast(button.option)}
                    oncontextmenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openMenu(event, button);
                    }}
                >
                    {button.rank}
                </button>
            {:else}
                <span class="rank-gap"></span>
            {/if}
        {/each}
    </span>
    {#if columns.from}
        <span class="cell badges" role="cell">
            {#each row.sources as source (source.entryId)}
                <span
                    class="badge"
                    class:spent={!source.available}
                    data-kind={source.kind}
                    data-tooltip={`${source.entryName} (${kindLabel(source.kind)})`}
                >
                    {isItem(source.kind) ? kindLabel(source.kind, true) : badgeLabel(source.entryName)}
                </span>
            {/each}
        </span>
    {/if}
    {#if editingTags}
        <form class="tag-editor" onsubmit={onAddTag}>
            {#each row.tags as tag (tag)}
                <button
                    type="button"
                    class="removable"
                    aria-label={t("Tags.Remove", { tag })}
                    onclick={() => setTags(row.spellIds, removeTag(row.tags, tag))}
                >
                    #{tag} <i class="fa-solid fa-xmark"></i>
                </button>
            {/each}
            <input
                type="text"
                list={listId}
                placeholder={t("Tags.Add")}
                aria-label={t("Tags.Add")}
                bind:value={tagInput}
                maxlength="32"
            />
            <datalist id={listId}>
                {#each knownTags.filter((tag) => !row.tags.includes(tag)) as tag (tag)}
                    <option value={tag}></option>
                {/each}
            </datalist>
            <button type="button" class="done" onclick={() => (editingTags = false)}>{t("Tags.Done")}</button>
        </form>
    {/if}
</div>

<style>
    .spell-row {
        display: grid;
        grid-template-columns: var(--grimoire-columns);
        align-items: center;
        column-gap: 0.4rem;
        min-height: 1.9rem;
        padding: 0.1rem 0.25rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
    }
    .spell-row:hover {
        background: color-mix(in srgb, currentColor 7%, transparent);
    }
    .cell {
        min-width: 0;
    }
    .unavailable .name-cell,
    .unavailable .base-rank,
    .unavailable .save {
        opacity: 0.45;
    }
    .base-rank,
    .save {
        font-size: 0.8rem;
        text-align: center;
        opacity: 0.8;
    }
    .name-cell {
        display: flex;
        align-items: center;
        gap: 0.2rem;
    }
    .spell-name {
        all: unset;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        cursor: pointer;
    }
    .spell-name:focus-visible {
        outline: 1px solid currentColor;
        border-radius: 3px;
    }
    .spell-name img {
        width: 22px;
        height: 22px;
        flex: none;
        border: none;
        border-radius: 3px;
    }
    .name {
        flex: 0 1 auto;
        min-width: 3rem;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .glyph {
        flex: none;
        font-size: 0.85rem;
        opacity: 0.7;
    }
    .tag {
        flex: none;
        padding: 0 0.3rem;
        border-radius: 3px;
        background: color-mix(in srgb, #3e9a6a 25%, transparent);
        font-size: 0.7rem;
        line-height: 1.25rem;
    }
    .tag-toggle {
        all: unset;
        flex: none;
        width: 1.2rem;
        text-align: center;
        font-size: 0.7rem;
        opacity: 0;
        cursor: pointer;
    }
    .spell-row:hover .tag-toggle,
    .tag-toggle:focus-visible,
    .tag-toggle.active {
        opacity: 0.6;
    }
    .tag-toggle:hover {
        opacity: 1;
    }
    .ranks {
        display: grid;
        grid-template-columns: var(--grimoire-rank-columns);
        gap: 0.15rem;
    }
    .rank {
        all: unset;
        box-sizing: border-box;
        width: 100%;
        height: 1.4rem;
        border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
        border-radius: 4px;
        background: color-mix(in srgb, currentColor 10%, transparent);
        font-size: 0.75rem;
        font-weight: bold;
        line-height: 1.3rem;
        text-align: center;
        cursor: pointer;
    }
    .rank:hover:not(.spent) {
        background: color-mix(in srgb, currentColor 25%, transparent);
    }
    .rank:focus-visible {
        outline: 1px solid currentColor;
    }
    .rank.spent {
        border-style: dashed;
        background: transparent;
        opacity: 0.5;
        text-decoration: line-through;
        cursor: default;
    }
    .badges {
        display: flex;
        gap: 0.2rem;
        overflow: hidden;
    }
    .badge {
        --badge: #7a7a7a;
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0 0.35rem;
        border: 1px solid var(--badge);
        border-radius: 999px;
        background: color-mix(in srgb, var(--badge) 22%, transparent);
        font-size: 0.7rem;
        line-height: 1.25rem;
        white-space: nowrap;
    }
    .badge.spent {
        border-style: dashed;
        background: transparent;
        opacity: 0.6;
    }
    .badge[data-kind="prepared"] {
        --badge: #4a7fc1;
    }
    .badge[data-kind="spontaneous"] {
        --badge: #9256c4;
    }
    .badge[data-kind="innate"] {
        --badge: #3e9a6a;
    }
    .badge[data-kind="focus"] {
        --badge: #c7892b;
    }
    .badge[data-kind="wand"] {
        --badge: #b5523b;
    }
    .badge[data-kind="staff"] {
        --badge: #8c6a3f;
    }
    .badge[data-kind="scroll"] {
        --badge: #a08a4c;
    }
    .tag-editor {
        grid-column: 1 / -1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem;
        margin: 0.25rem 0 0.15rem 1.9rem;
    }
    .removable {
        all: unset;
        padding: 0 0.3rem;
        border-radius: 3px;
        background: color-mix(in srgb, #3e9a6a 25%, transparent);
        font-size: 0.75rem;
        line-height: 1.4rem;
        cursor: pointer;
    }
    .tag-editor input {
        flex: 1;
        min-width: 8rem;
        height: 1.6rem;
    }
    .tag-editor .done {
        flex: none;
        width: auto;
        height: 1.6rem;
        line-height: 1;
        font-size: 0.8rem;
    }
</style>
