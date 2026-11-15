<script lang="ts">
    import type { CastOption, RankGroup } from "../spellbook/model.ts";
    import type { GrimoireState } from "./grimoire-state.svelte.ts";
    import type { RankButton } from "../spellbook/rank-buttons.ts";
    import SourceMenu from "./SourceMenu.svelte";
    import SpellRowView from "./SpellRowView.svelte";

    const {
        grimoire,
        openSpell,
        cast,
    }: { grimoire: GrimoireState; openSpell: (spellId: string) => void; cast: (option: CastOption) => Promise<void> } =
        $props();

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
    </header>

    <div class="groups">
        {#each grimoire.groups as group (group.rank)}
            <section>
                <h3>
                    <span>{rankLabel(group)}</span>
                    <span class="count">{group.rows.length}</span>
                </h3>
                <ul>
                    {#each group.rows as row (row.key)}
                        <SpellRowView {row} {openSpell} {cast} {openMenu} />
                    {/each}
                </ul>
            </section>
        {:else}
            <p class="empty">{game.i18n.localize("PF2EGrimoire.NoSpells")}</p>
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
