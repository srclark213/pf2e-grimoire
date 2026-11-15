<script lang="ts">
    import type { StaffSnapshot } from "../spellbook/model.ts";

    interface Props {
        staves: StaffSnapshot[];
        /** PF2e Staves entries still on the character */
        legacyCount: number;
        prepare: (staffId: string) => Promise<void>;
        importLegacy: () => Promise<void>;
    }

    const { staves, legacyCount, prepare, importLegacy }: Props = $props();

    async function onImport(): Promise<void> {
        if (busy) return;
        busy = true;
        try {
            await importLegacy();
        } finally {
            busy = false;
        }
    }

    const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

    let busy = $state(false);

    async function onPrepare(staffId: string): Promise<void> {
        if (busy) return;
        busy = true;
        try {
            await prepare(staffId);
        } finally {
            busy = false;
        }
    }

    function status(staff: StaffSnapshot): string {
        if (staff.preparedByMe) return t("Staff.Charges", { value: staff.charges.value, max: staff.charges.max });
        if (staff.preparedByOther) return t("Staff.PreparedByOther");
        return t("Staff.NotPrepared");
    }
</script>

<ul class="staff-bar">
    {#if legacyCount > 0}
        <li class="legacy">
            <i class="fa-solid fa-circle-info"></i>
            <span>{t("Import.Notice", { count: legacyCount })}</span>
            <button type="button" class="import" disabled={busy} onclick={onImport}>{t("Import.Button")}</button>
        </li>
    {/if}
    {#each staves as staff (staff.id)}
        <li class="staff" class:prepared={staff.preparedByMe}>
            <i class="fa-solid fa-staff-snake icon"></i>
            <span class="name">{staff.name}</span>
            {#if !staff.held}
                <i
                    class="fa-solid fa-hand warn"
                    data-tooltip={t("Staff.NotHeld")}
                    aria-label={t("Staff.NotHeld")}
                ></i>
            {/if}
            <span class="charges">
                {#if staff.preparedByMe}
                    <i class="fa-solid fa-bolt"></i>
                {/if}
                {status(staff)}
            </span>
            <button
                type="button"
                class="action"
                disabled={busy}
                data-tooltip={t(staff.preparedByMe ? "Staff.Reprepare" : "Staff.Prepare")}
                aria-label={t(staff.preparedByMe ? "Staff.Reprepare" : "Staff.Prepare")}
                onclick={() => onPrepare(staff.id)}
            >
                <i class="fa-solid fa-sun"></i>
            </button>
        </li>
    {/each}
</ul>

<style>
    .staff-bar {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        margin: 0;
        padding: 0.3rem 0.25rem;
        list-style: none;
        border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    }
    .staff {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
    }
    .legacy {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0.3rem;
        border-radius: 4px;
        background: color-mix(in srgb, #4a7fc1 20%, transparent);
        font-size: 0.8rem;
    }
    .legacy span {
        flex: 1;
    }
    .import {
        flex: none;
        width: auto;
        height: 1.5rem;
        padding: 0 0.5rem;
        font-size: 0.8rem;
        line-height: 1;
    }
    .icon {
        width: 1rem;
        text-align: center;
        color: #8c6a3f;
    }
    .name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .warn {
        color: #c7892b;
        font-size: 0.75rem;
    }
    .charges {
        font-size: 0.8rem;
        opacity: 0.7;
        white-space: nowrap;
    }
    .prepared .charges {
        opacity: 1;
        color: #c7892b;
        font-weight: bold;
    }
    .action {
        all: unset;
        width: 1.5rem;
        height: 1.5rem;
        border-radius: 4px;
        text-align: center;
        line-height: 1.5rem;
        cursor: pointer;
        opacity: 0.7;
    }
    .action:hover:not(:disabled),
    .action:focus-visible {
        opacity: 1;
        background: color-mix(in srgb, currentColor 15%, transparent);
    }
    .action:disabled {
        opacity: 0.3;
        cursor: default;
    }
</style>
