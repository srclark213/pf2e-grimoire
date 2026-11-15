<script lang="ts">
    import { badgeLabel } from "../spellbook/labels.ts";
    import type { CastOption, SpellRow } from "../spellbook/model.ts";
    import { rankButtons, type RankButton } from "../spellbook/rank-buttons.ts";

    interface Props {
        row: SpellRow;
        openSpell: (spellId: string) => void;
        cast: (option: CastOption) => Promise<void>;
        openMenu: (event: MouseEvent, button: RankButton) => void;
    }

    const { row, openSpell, cast, openMenu }: Props = $props();

    const buttons = $derived(rankButtons(row));
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

    function kindLabel(kind: string): string {
        return game.i18n.localize(`PF2EGrimoire.Kind.${kind}`);
    }
</script>

<li class="spell-row" class:unavailable={!row.available}>
    <button type="button" class="spell-name" onclick={() => openSpell(row.spellIds[0] ?? "")}>
        <img src={row.img} alt="" />
        <span>{row.name}</span>
    </button>
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
                {badgeLabel(source.entryName)}
            </li>
        {/each}
    </ul>
</li>

<style>
    .spell-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.2rem 0.25rem;
        border-radius: 4px;
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
</style>
