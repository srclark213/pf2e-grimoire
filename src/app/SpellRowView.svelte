<script lang="ts">
    import { badgeLabel } from "../spellbook/labels.ts";
    import type { CastOption, SpellRow } from "../spellbook/model.ts";
    import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
    import { rankButtons, type RankButton } from "../spellbook/rank-buttons.ts";
    import { addTag, removeTag } from "../spellbook/tags.ts";

    interface Props {
        row: SpellRow;
        priority: PriorityGroup[];
        openSpell: (spellId: string) => void;
        cast: (option: CastOption) => Promise<void>;
        openMenu: (event: MouseEvent, button: RankButton) => void;
        setTags: (spellIds: string[], tags: string[]) => Promise<void>;
        /** Every tag on this character, for suggestions */
        knownTags: string[];
    }

    const { row, priority, openSpell, cast, openMenu, setTags, knownTags }: Props = $props();

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
        const key = available ? "PF2EGrimoire.CastAt" : "PF2EGrimoire.SpentAt";
        return game.i18n.localize(key, { rank: option.rank, source: option.entryName });
    }

    /** Wand and scroll names are long ("Wand of Teleport (Rank 6)"), so their badge shows the kind. */
    function isItem(kind: string): boolean {
        return kind === "wand" || kind === "scroll";
    }

    function kindLabel(kind: string, badge = false): string {
        return game.i18n.localize(`PF2EGrimoire.${badge ? "Badge" : "Kind"}.${kind}`);
    }
</script>

<li class="spell-row">
    <div class="main" class:unavailable={!row.available}>
    <button type="button" class="spell-name" onclick={() => openSpell(row.spellIds[0] ?? row.sources[0]?.entryId ?? "")}>
        <img src={row.img} alt="" />
        <span>{row.name}</span>
        {#each row.tags as tag (tag)}
            <span class="tag">#{tag}</span>
        {/each}
    </button>
    {#if row.spellIds.length > 0}
    <button
        type="button"
        class="tag-toggle"
        class:active={editingTags || row.tags.length > 0}
        aria-label={game.i18n.localize("PF2EGrimoire.Tags.Edit")}
        data-tooltip={game.i18n.localize("PF2EGrimoire.Tags.Edit")}
        onclick={() => (editingTags = !editingTags)}
    >
        <i class="fa-solid fa-tag"></i>
    </button>
    {/if}
    <div class="ranks">
        {#each buttons as button (button.rank)}
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
        {/each}
    </div>
    <ul class="badges">
        {#each row.sources as source (source.entryId)}
            <li
                class="badge"
                class:spent={!source.available}
                data-kind={source.kind}
                data-tooltip={`${source.entryName} (${kindLabel(source.kind)})`}
            >
                {isItem(source.kind) ? kindLabel(source.kind, true) : badgeLabel(source.entryName)}
            </li>
        {/each}
    </ul>
    </div>
    {#if editingTags}
        <form class="tag-editor" onsubmit={onAddTag}>
            {#each row.tags as tag (tag)}
                <button
                    type="button"
                    class="removable"
                    aria-label={game.i18n.localize("PF2EGrimoire.Tags.Remove", { tag })}
                    onclick={() => setTags(row.spellIds, removeTag(row.tags, tag))}
                >
                    #{tag} <i class="fa-solid fa-xmark"></i>
                </button>
            {/each}
            <input
                type="text"
                list={listId}
                placeholder={game.i18n.localize("PF2EGrimoire.Tags.Add")}
                aria-label={game.i18n.localize("PF2EGrimoire.Tags.Add")}
                bind:value={tagInput}
                maxlength="32"
            />
            <datalist id={listId}>
                {#each knownTags.filter((t) => !row.tags.includes(t)) as tag (tag)}
                    <option value={tag}></option>
                {/each}
            </datalist>
            <button type="button" class="done" onclick={() => (editingTags = false)}>
                {game.i18n.localize("PF2EGrimoire.Tags.Done")}
            </button>
        </form>
    {/if}
</li>

<style>
    .spell-row {
        padding: 0.2rem 0.25rem;
        border-radius: 4px;
    }
    .main {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .tag,
    .removable {
        flex: none;
        padding: 0 0.3rem;
        border-radius: 3px;
        background: color-mix(in srgb, #3e9a6a 25%, transparent);
        font-size: 0.7rem;
        line-height: 1.3rem;
        white-space: nowrap;
    }
    .tag-toggle {
        all: unset;
        flex: none;
        width: 1.3rem;
        text-align: center;
        font-size: 0.75rem;
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
    .tag-editor {
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
    .spell-row:hover {
        background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .unavailable {
        opacity: 0.45;
    }
    .spell-name {
        all: unset;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex: 1;
        min-width: 0;
        cursor: pointer;
    }
    .spell-name:focus-visible {
        outline: 1px solid currentColor;
        border-radius: 3px;
    }
    .spell-name span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .spell-name img {
        width: 24px;
        height: 24px;
        flex: none;
        border: none;
        border-radius: 3px;
    }
    .ranks {
        display: flex;
        gap: 0.2rem;
        flex: none;
    }
    .rank {
        all: unset;
        box-sizing: border-box;
        min-width: 1.5rem;
        height: 1.5rem;
        padding: 0 0.3rem;
        border: 1px solid color-mix(in srgb, currentColor 45%, transparent);
        border-radius: 4px;
        background: color-mix(in srgb, currentColor 10%, transparent);
        font-size: 0.8rem;
        font-weight: bold;
        line-height: 1.4rem;
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
        cursor: default;
    }
    .rank.spent {
        border-style: dashed;
        background: transparent;
        opacity: 0.55;
        text-decoration: line-through;
    }
    .badges {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .badge {
        --badge: #7a7a7a;
        padding: 0 0.4rem;
        border: 1px solid var(--badge);
        border-radius: 999px;
        background: color-mix(in srgb, var(--badge) 22%, transparent);
        font-size: 0.75rem;
        line-height: 1.35rem;
        white-space: nowrap;
    }
    .badge.spent {
        border-style: dashed;
        background: transparent;
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
    .badge[data-kind="scroll"] {
        --badge: #a08a4c;
    }
</style>
