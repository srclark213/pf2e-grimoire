<script lang="ts">
    import { onMount } from "svelte";
    import type { ReflowStatus } from "../foundry/reflow.ts";
    import { elementsOf } from "../kinetic/impulses.ts";
    import {
        buildCatalog,
        filterCatalog,
        reflowBlock,
        reflowChoices,
        type CatalogEntry,
        type CatalogImpulse,
        type OwnedImpulse,
    } from "../kinetic/reflow.ts";
    import { levelLookup, readableText, summarizeImpulse, type RollDataLookup } from "../kinetic/summary.ts";
    import type { KineticActions } from "./kinetic-state.svelte.ts";
    import { ELEMENT_ICONS, costGlyph, elementLabel, t } from "./kinetic-ui.ts";

    interface Props {
        elements: string[];
        level: number;
        owned: OwnedImpulse[];
        catalog: CatalogImpulse[] | null;
        reflow: ReflowStatus;
        lookup: RollDataLookup | undefined;
        actions: KineticActions;
    }

    const { elements, level, owned, catalog, reflow, lookup, actions }: Props = $props();

    let search = $state("");
    let shownElements: string[] = $state([]);
    let hideOwned = $state(false);
    let swapping: OwnedImpulse | null = $state(null);
    let expanded: string | null = $state(null);
    let busy = $state(false);
    let loadError = $state(false);

    onMount(() => {
        actions.loadCatalog().catch(() => (loadError = true));
    });

    const left = $derived(Math.max(0, reflow.perDay - reflow.today.length));
    const entries = $derived(catalog ? buildCatalog(catalog, elements, level, owned) : []);
    // The swap target may have been replaced already (or deleted from the sheet).
    const target = $derived(swapping ? (owned.find((o) => o.id === swapping!.id) ?? null) : null);
    const shown = $derived(
        target
            ? filterCatalog(reflowChoices(target, entries), { search, elements: [], hideOwned: true })
            : filterCatalog(entries, { search, elements: shownElements, hideOwned }),
    );
    const byLevel = $derived(
        Object.entries(Object.groupBy(shown, (e: CatalogEntry) => String(e.impulse.level))).sort(
            ([a], [b]) => Number(a) - Number(b),
        ) as [string, CatalogEntry[]][],
    );
    const summaryLookup = $derived(lookup ?? levelLookup(level));

    function toggleElement(element: string): void {
        shownElements = shownElements.includes(element)
            ? shownElements.filter((e) => e !== element)
            : [...shownElements, element];
    }

    function blockText(impulse: OwnedImpulse): string | null {
        const block = reflowBlock(impulse.traits);
        return block ? t(`Manage.Block.${block}`) : null;
    }

    function summary(description: string): string {
        const s = summarizeImpulse(description, summaryLookup);
        return [s.damage.join(", "), s.save, s.area].filter(Boolean).join(" · ");
    }

    async function swapIn(entry: CatalogEntry): Promise<void> {
        if (!target || busy) return;
        const question =
            left > 0
                ? t("Manage.Confirm", { old: target.name, new: entry.impulse.name, left, perDay: reflow.perDay })
                : t("Manage.ConfirmNoneLeft", { old: target.name, new: entry.impulse.name });
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: t("Manage.ConfirmTitle") },
            content: `<p>${question}</p>`,
            rejectClose: false,
        });
        if (!confirmed) return;
        busy = true;
        try {
            await actions.reflow(target.id, entry.impulse.uuid);
            swapping = null;
        } finally {
            busy = false;
        }
    }
</script>

<div class="manage">
    <section class="reflow" class:none-left={reflow.perDay > 0 && left === 0}>
        <i class="fa-solid fa-arrows-rotate"></i>
        <div class="reflow-text">
            {#if reflow.perDay > 0}
                <strong>{t("Manage.ReflowLeft", { left, perDay: reflow.perDay })}</strong>
                <span>{t("Manage.ReflowHint")}</span>
                {#each reflow.today as swap (swap)}
                    <span class="swap">{swap}</span>
                {/each}
            {:else}
                <strong>{t("Manage.NoReflow")}</strong>
                <span>{t("Manage.NoReflowHint")}</span>
            {/if}
        </div>
    </section>

    <section>
        <h3>{t("Manage.Yours")}</h3>
        <ul class="owned">
            {#each owned as impulse (impulse.id)}
                {@const block = blockText(impulse)}
                <li class:target={target?.id === impulse.id}>
                    <span class="action-glyph glyph">{costGlyph(impulse.cost)}</span>
                    <button type="button" class="name" onclick={() => actions.openItem(impulse.id)}>{impulse.name}</button>
                    <span class="elements">
                        {#each elementsOf(impulse.traits) as element (element)}
                            <i class="fa-solid {ELEMENT_ICONS[element]} {element}" data-tooltip={elementLabel(element)}></i>
                        {/each}
                    </span>
                    <span class="spacer"></span>
                    <span class="slot" data-tooltip={t("Manage.SlotHint", { level: impulse.slotLevel })}>
                        {impulse.slotLabel}
                    </span>
                    <button
                        type="button"
                        class="reflow-button"
                        class:active={target?.id === impulse.id}
                        disabled={!!block || busy}
                        data-tooltip={block ?? t("Manage.ReflowButtonHint", { level: impulse.slotLevel })}
                        onclick={() => (swapping = target?.id === impulse.id ? null : impulse)}
                    >
                        <i class="fa-solid fa-arrows-rotate"></i>
                        {t(target?.id === impulse.id ? "Manage.Cancel" : "Manage.Reflow")}
                    </button>
                </li>
            {:else}
                <li class="empty">{t("Manage.NoneOwned")}</li>
            {/each}
        </ul>
    </section>

    <section class="catalog">
        {#if target}
            <div class="banner">
                <i class="fa-solid fa-arrows-rotate"></i>
                <div class="banner-text">
                    <strong>{t("Manage.Reflowing", { name: target.name })}</strong>
                    <span>
                        {t("Manage.ReflowingHint", {
                            element: elementLabel(elementsOf(target.traits)[0] ?? ""),
                            level: target.slotLevel,
                        })}
                    </span>
                </div>
                <button type="button" class="mini" aria-label={t("Manage.Cancel")} onclick={() => (swapping = null)}>
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        {:else}
            <h3>{t("Manage.Catalog")}</h3>
        {/if}

        <div class="filters">
            <input type="search" placeholder={t("Manage.Search")} bind:value={search} />
            {#if !target}
                {#each elements as element (element)}
                    <button
                        type="button"
                        class="chip {element}"
                        class:on={shownElements.includes(element)}
                        aria-pressed={shownElements.includes(element)}
                        onclick={() => toggleElement(element)}
                    >
                        <i class="fa-solid {ELEMENT_ICONS[element]}"></i>
                        {elementLabel(element)}
                    </button>
                {/each}
                <label class="hide-owned">
                    <input type="checkbox" bind:checked={hideOwned} />
                    {t("Manage.HideOwned")}
                </label>
            {/if}
        </div>

        {#if loadError}
            <p class="note">{t("Manage.LoadError")}</p>
        {:else if !catalog}
            <p class="note"><i class="fa-solid fa-spinner fa-spin"></i> {t("Manage.Loading")}</p>
        {:else if shown.length === 0}
            <p class="note">{t(target ? "Manage.NoChoices" : "Manage.NoMatches")}</p>
        {/if}

        {#each byLevel as [lvl, group] (lvl)}
            <h4>{t("Manage.Level", { level: lvl })}</h4>
            <ul class="entries">
                {#each group as entry (entry.impulse.uuid)}
                    {@const traits = entry.impulse.traits}
                    {@const line = summary(entry.impulse.description)}
                    <li class:owned={entry.owned} class:too-high={entry.tooHigh}>
                        <div class="line">
                            <span class="action-glyph glyph">{costGlyph(entry.impulse.cost)}</span>
                            <button type="button" class="name" onclick={() => actions.openUuid(entry.impulse.uuid)}>
                                {entry.impulse.name}
                            </button>
                            <span class="elements">
                                {#each entry.elements as element (element)}
                                    <i class="fa-solid {ELEMENT_ICONS[element]} {element}" data-tooltip={elementLabel(element)}></i>
                                {/each}
                                {#if entry.fit === "any"}
                                    <span class="badge" data-tooltip={t("Manage.AnyElementHint")}>{t("Manage.AnyElement")}</span>
                                {/if}
                            </span>
                            {#if traits.includes("composite")}<span class="badge">{t("Badge.Composite")}</span>{/if}
                            {#if traits.includes("stance")}<span class="badge">{t("Section.stance")}</span>{/if}
                            {#if traits.includes("overflow")}<span class="badge overflow">{t("Badge.Overflow")}</span>{/if}
                            {#if entry.impulse.rarity !== "common"}
                                <span class="badge rarity {entry.impulse.rarity}">{entry.impulse.rarity}</span>
                            {/if}
                            <span class="spacer"></span>
                            {#if entry.owned}
                                <span class="have"><i class="fa-solid fa-check"></i> {t("Manage.Owned")}</span>
                            {/if}
                            <button
                                type="button"
                                class="expand"
                                aria-expanded={expanded === entry.impulse.uuid}
                                aria-label={t("Impulse.Details")}
                                onclick={() => (expanded = expanded === entry.impulse.uuid ? null : entry.impulse.uuid)}
                            >
                                <i class="fa-solid {expanded === entry.impulse.uuid ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                            </button>
                            {#if target}
                                <button type="button" class="swap-in" disabled={busy} onclick={() => swapIn(entry)}>
                                    {t("Manage.SwapIn")}
                                </button>
                            {/if}
                        </div>
                        {#if line}<div class="summary">{line}</div>{/if}
                        {#if expanded === entry.impulse.uuid}
                            <p class="details">{readableText(entry.impulse.description, summaryLookup)}</p>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/each}
    </section>
</div>

<style>
    .manage {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    h3 {
        margin: 0 0 0.25rem;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.75;
        border: none;
    }
    h4 {
        margin: 0.4rem 0 0.2rem;
        font-size: 0.8rem;
        opacity: 0.7;
        border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
    }
    .reflow {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.45rem 0.6rem;
        border-radius: 6px;
        border: 1px solid color-mix(in srgb, var(--kinetic-accent, #3a86c8) 60%, transparent);
        background: color-mix(in srgb, var(--kinetic-accent, #3a86c8) 10%, transparent);
    }
    .reflow > i {
        font-size: 1.3rem;
        color: var(--kinetic-accent, #3a86c8);
    }
    .reflow.none-left {
        border-color: color-mix(in srgb, currentColor 20%, transparent);
        background: color-mix(in srgb, currentColor 5%, transparent);
    }
    .reflow.none-left > i {
        color: inherit;
        opacity: 0.5;
    }
    .reflow-text {
        display: flex;
        flex-direction: column;
        font-size: 0.8rem;
    }
    .reflow-text strong {
        font-size: 0.95rem;
    }
    .reflow-text span {
        opacity: 0.8;
    }
    .reflow-text .swap {
        opacity: 1;
        font-style: italic;
    }
    ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }
    li {
        padding: 0.25rem 0.4rem;
        border-radius: 5px;
        border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
    }
    .owned > li,
    .line {
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }
    li.target {
        border-color: var(--kinetic-accent, #3a86c8);
        background: color-mix(in srgb, var(--kinetic-accent, #3a86c8) 12%, transparent);
    }
    li.owned {
        opacity: 0.6;
    }
    li.too-high {
        opacity: 0.45;
    }
    li.empty {
        opacity: 0.7;
        border: none;
    }
    .glyph {
        width: 1.3rem;
        text-align: center;
    }
    .name {
        all: unset;
        font-weight: bold;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .name:hover,
    .name:focus-visible {
        text-decoration: underline;
    }
    .elements {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        font-size: 0.75rem;
    }
    .air { --element: #7fb3d5; }
    .earth { --element: #9b7b4f; }
    .fire { --element: #d8622b; }
    .metal { --element: #8d969f; }
    .water { --element: #3a86c8; }
    .wood { --element: #5f9a43; }
    .elements i {
        color: var(--element);
    }
    .spacer {
        flex: 1;
    }
    .slot {
        font-size: 0.75rem;
        opacity: 0.7;
        white-space: nowrap;
    }
    .reflow-button,
    .swap-in {
        flex: none;
        width: auto;
        height: 1.5rem;
        padding: 0 0.5rem;
        font-size: 0.8rem;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
    }
    .reflow-button.active,
    .swap-in {
        border-color: var(--kinetic-accent, #3a86c8);
        background: color-mix(in srgb, var(--kinetic-accent, #3a86c8) 25%, transparent);
    }
    .banner {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.6rem;
        margin-bottom: 0.3rem;
        border-radius: 6px;
        border-left: 4px solid var(--kinetic-accent, #3a86c8);
        background: color-mix(in srgb, var(--kinetic-accent, #3a86c8) 15%, transparent);
    }
    .banner-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        font-size: 0.85rem;
    }
    .banner-text span {
        opacity: 0.8;
        font-size: 0.8rem;
    }
    .mini,
    .expand {
        all: unset;
        width: 1.3rem;
        text-align: center;
        cursor: pointer;
        opacity: 0.6;
        font-size: 0.75rem;
    }
    .mini:hover,
    .expand:hover,
    .mini:focus-visible,
    .expand:focus-visible {
        opacity: 1;
    }
    .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem;
        margin-bottom: 0.2rem;
    }
    .filters input[type="search"] {
        flex: 1;
        min-width: 8rem;
        height: 1.6rem;
    }
    .chip {
        flex: none;
        width: auto;
        height: 1.6rem;
        padding: 0 0.5rem;
        font-size: 0.8rem;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        opacity: 0.7;
    }
    .chip i {
        color: var(--element);
    }
    .chip.on {
        opacity: 1;
        font-weight: bold;
        background: color-mix(in srgb, var(--element) 25%, transparent);
    }
    .hide-owned {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        font-size: 0.8rem;
    }
    .badge {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 0 0.3rem;
        border-radius: 3px;
        white-space: nowrap;
        background: color-mix(in srgb, currentColor 12%, transparent);
    }
    .badge.overflow {
        color: var(--kinetic-danger, #b8473b);
        background: color-mix(in srgb, var(--kinetic-danger, #b8473b) 20%, transparent);
    }
    .badge.uncommon {
        color: #c45500;
    }
    .badge.rare {
        color: #0c1466;
    }
    .have {
        font-size: 0.75rem;
        white-space: nowrap;
    }
    .summary {
        padding-left: 1.65rem;
        font-size: 0.75rem;
        opacity: 0.8;
    }
    .details {
        margin: 0.3rem 0 0.1rem 1.65rem;
        font-size: 0.8rem;
        line-height: 1.35;
    }
    .note {
        margin: 0.3rem 0;
        font-size: 0.8rem;
        opacity: 0.75;
    }
</style>
