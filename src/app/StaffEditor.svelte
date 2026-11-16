<script lang="ts" module>
    import type { StaffSpellList, StaffSpellRef } from "../spellbook/staff.ts";

    /** What the editor can do to a staff, provided by the app */
    export interface StaffEditorActions {
        save: (staffId: string, list: StaffSpellList) => Promise<void>;
        reset: (staffId: string) => Promise<void>;
        readDrop: (event: DragEvent) => Promise<StaffSpellRef | null>;
    }
</script>

<script lang="ts">
    import type { StaffSnapshot } from "../spellbook/model.ts";
    import { addStaffSpell, moveStaffSpell, removeStaffSpell, staffEntries } from "../spellbook/staff.ts";

    interface Props {
        staff: StaffSnapshot;
        actions: StaffEditorActions;
        close: () => void;
    }

    const { staff, actions, close }: Props = $props();

    const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

    const RANKS = Array.from({ length: 11 }, (_, i) => i);
    const ranks = $derived(
        Object.keys(staff.list)
            .map(Number)
            .sort((a, b) => a - b),
    );
    /** The rank a dropped spell is added at: one above the highest listed by default */
    let dropRank = $state(1);
    let dragOver = $state(false);

    $effect(() => {
        const highest = staffEntries(staff.list).at(-1)?.rank ?? 0;
        dropRank = Math.min(10, Math.max(1, highest));
    });

    const rankLabel = (rank: number) => (rank === 0 ? t("Editor.Cantrip") : t("Editor.Rank", { rank }));

    async function onDrop(event: DragEvent): Promise<void> {
        event.preventDefault();
        dragOver = false;
        const spell = await actions.readDrop(event);
        if (spell) await actions.save(staff.id, addStaffSpell(staff.list, dropRank, spell));
    }
</script>

<div class="staff-editor">
    {#each ranks as rank (rank)}
        <div class="rank-row">
            <span class="rank-label">{rankLabel(rank)}</span>
            <ul class="spells">
                {#each staff.list[rank] ?? [] as spell (spell.uuid)}
                    <li class="spell">
                        <span class="name">{spell.name}</span>
                        <select
                            aria-label={t("Editor.MoveTo", { spell: spell.name })}
                            data-tooltip={t("Editor.MoveTo", { spell: spell.name })}
                            value={rank}
                            onchange={(event) =>
                                actions.save(
                                    staff.id,
                                    moveStaffSpell(staff.list, rank, Number(event.currentTarget.value), spell.uuid),
                                )}
                        >
                            {#each RANKS as option (option)}
                                <option value={option}>{option === 0 ? "C" : option}</option>
                            {/each}
                        </select>
                        <button
                            type="button"
                            class="remove"
                            aria-label={t("Editor.Remove", { spell: spell.name })}
                            data-tooltip={t("Editor.Remove", { spell: spell.name })}
                            onclick={() => actions.save(staff.id, removeStaffSpell(staff.list, rank, spell.uuid))}
                        >
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {:else}
        <p class="hint">{t("Editor.Empty")}</p>
    {/each}

    <div
        class="drop"
        class:over={dragOver}
        role="region"
        aria-label={t("Editor.Drop")}
        ondragover={(event) => {
            event.preventDefault();
            dragOver = true;
        }}
        ondragleave={() => (dragOver = false)}
        ondrop={onDrop}
    >
        <i class="fa-solid fa-file-import"></i>
        <span>{t("Editor.Drop")}</span>
        <select bind:value={dropRank} aria-label={t("Editor.Drop")}>
            {#each RANKS as option (option)}
                <option value={option}>{rankLabel(option)}</option>
            {/each}
        </select>
    </div>

    <footer>
        <span class="hint">{t(staff.manual ? "Editor.Manual" : "Editor.FromDescription")}</span>
        {#if staff.manual}
            <button type="button" onclick={() => actions.reset(staff.id)}>{t("Editor.Reset")}</button>
        {/if}
        <button type="button" onclick={close}>{t("Editor.Done")}</button>
    </footer>
</div>

<style>
    .staff-editor {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin: 0.1rem 0 0.3rem 1.4rem;
        padding: 0.4rem;
        border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
        border-radius: 4px;
        font-size: 0.8rem;
    }
    .rank-row {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
    }
    .rank-label {
        flex: none;
        width: 4rem;
        opacity: 0.7;
    }
    .spells {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .spell {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        padding: 0 0.15rem 0 0.4rem;
        border-radius: 999px;
        background: color-mix(in srgb, #8c6a3f 25%, transparent);
    }
    .spell select {
        width: 2.4rem;
        height: 1.3rem;
        padding: 0;
        font-size: 0.75rem;
    }
    .remove {
        all: unset;
        width: 1.1rem;
        text-align: center;
        cursor: pointer;
        opacity: 0.7;
    }
    .remove:hover,
    .remove:focus-visible {
        opacity: 1;
    }
    .drop {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.3rem 0.4rem;
        border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
        border-radius: 4px;
        opacity: 0.8;
    }
    .drop.over {
        opacity: 1;
        border-color: #c7892b;
        background: color-mix(in srgb, #c7892b 15%, transparent);
    }
    .drop span {
        flex: 1;
    }
    .drop select {
        width: auto;
        height: 1.5rem;
    }
    footer {
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    footer .hint {
        flex: 1;
    }
    footer button {
        flex: none;
        width: auto;
        height: 1.5rem;
        padding: 0 0.5rem;
        line-height: 1;
        font-size: 0.8rem;
    }
    .hint {
        margin: 0;
        opacity: 0.65;
    }
</style>
