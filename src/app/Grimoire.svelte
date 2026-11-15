<script lang="ts">
    import type { CastOption, RankGroup } from "../spellbook/model.ts";
    import type { GrimoireState } from "./grimoire-state.svelte.ts";
    import SpellRowView from "./SpellRowView.svelte";

    const {
        state,
        openSpell,
        cast,
    }: { state: GrimoireState; openSpell: (spellId: string) => void; cast: (option: CastOption) => Promise<void> } =
        $props();

    const spellCount = $derived(state.groups.reduce((n, g) => n + g.rows.length, 0));

    function rankLabel(group: RankGroup): string {
        if (group.rank > 0) return game.i18n.localize("PF2EGrimoire.Rank", { rank: group.rank });
        const hasFocus = group.rows.some((r) => r.isFocus);
        const hasCantrips = group.rows.some((r) => r.isCantrip && !r.isFocus);
        const key = hasFocus && hasCantrips ? "CantripsAndFocus" : hasFocus ? "FocusAtRank" : "CantripsAtRank";
        return game.i18n.localize(`PF2EGrimoire.${key}`, { rank: state.cantripRank });
    }
</script>

<div class="grimoire">
    <header>
        <span class="summary">
            {game.i18n.localize("PF2EGrimoire.Summary", { spells: spellCount, entries: state.entryCount })}
        </span>
        {#if state.focus}
            <span
                class="focus"
                data-tooltip={game.i18n.localize("PF2EGrimoire.FocusPoints", {
                    value: state.focus.value,
                    max: state.focus.max,
                })}
            >
                {#each Array.from({ length: state.focus.max }, (_, i) => i) as i (i)}
                    <i class={i < state.focus.value ? "fa-solid fa-circle" : "fa-regular fa-circle"}></i>
                {/each}
            </span>
        {/if}
    </header>

    <div class="groups">
        {#each state.groups as group (group.rank)}
            <section>
                <h3>
                    <span>{rankLabel(group)}</span>
                    <span class="count">{group.rows.length}</span>
                </h3>
                <ul>
                    {#each group.rows as row (row.key)}
                        <SpellRowView {row} {openSpell} {cast} />
                    {/each}
                </ul>
            </section>
        {:else}
            <p class="empty">{game.i18n.localize("PF2EGrimoire.NoSpells")}</p>
        {/each}
    </div>
</div>

<style>
    .grimoire {
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
        opacity: 0.75;
        font-size: 0.85rem;
    }
    .focus {
        display: flex;
        gap: 0.2rem;
        color: #c7892b;
        font-size: 0.8rem;
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
