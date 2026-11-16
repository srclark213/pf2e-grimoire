<script lang="ts">
    import { SECTIONS, plainText, type Block, type ImpulseRow, type Warning } from "../kinetic/impulses.ts";
    import type { KineticActions } from "./kinetic-state.svelte.ts";
    import { ELEMENT_ICONS, costGlyph, elementLabel, t } from "./kinetic-ui.ts";

    interface Props {
        rows: ImpulseRow[];
        actions: KineticActions;
    }

    const { rows, actions }: Props = $props();

    const sections = $derived(
        SECTIONS.map((section) => ({ section, rows: rows.filter((r) => r.section === section) })).filter(
            (s) => s.rows.length > 0,
        ),
    );

    let expanded: string | null = $state(null);
    let busy = $state(false);

    function blockText(block: Block): string {
        return t(`Block.${block.key}`);
    }

    function warningText(warning: Warning): string {
        switch (warning.key) {
            case "EndsStances":
            case "ReplacesStance":
                return t(`Warning.${warning.key}`, { names: warning.names });
            case "WastesInfusion":
                return t("Warning.WastesInfusion", { infusion: warning.infusion });
            default:
                return t(`Warning.${warning.key}`);
        }
    }

    async function use(row: ImpulseRow, event: Event): Promise<void> {
        if (busy) return;
        if (row.blocks.length > 0) {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: row.item.name },
                content: `<p>${row.blocks.map(blockText).join("</p><p>")}</p><p>${t("Block.UseAnyway")}</p>`,
                rejectClose: false,
            });
            if (!confirmed) return;
        }
        busy = true;
        try {
            await actions.use(row.item.id, event);
        } finally {
            busy = false;
        }
    }
</script>

{#each sections as { section, rows: sectionRows } (section)}
    <section class="impulses">
        <h3>
            {t(`Section.${section}`)}
            {#if section === "overflow"}
                <span class="section-hint">{t("Section.overflowHint")}</span>
            {:else if section === "stance"}
                <span class="section-hint">{t("Section.stanceHint")}</span>
            {/if}
        </h3>
        <ul>
            {#each sectionRows as row (row.item.id)}
                <li
                    class:blocked={row.blocks.length > 0}
                    class:highlight-infusion={row.highlight === "infusion"}
                    class:highlight-channel={row.highlight === "channel"}
                >
                    <div class="line">
                        <span class="action-glyph glyph">{costGlyph(row.item.cost)}</span>
                        <button type="button" class="name" onclick={() => actions.openItem(row.item.id)}>
                            {row.item.name}
                        </button>
                        <span class="elements">
                            {#each row.elements as element (element)}
                                <i class="fa-solid {ELEMENT_ICONS[element]} {element}" data-tooltip={elementLabel(element)}></i>
                            {/each}
                        </span>
                        {#if row.composite}
                            <span class="badge composite" data-tooltip={t("Badge.CompositeHint")}>{t("Badge.Composite")}</span>
                        {/if}
                        {#if row.overflow}
                            <span class="badge overflow" data-tooltip={t("Badge.OverflowHint")}>{t("Badge.Overflow")}</span>
                        {/if}
                        <span class="spacer"></span>
                        {#each row.blocks as block (block.key)}
                            <i class="fa-solid fa-ban block-icon" data-tooltip={blockText(block)} aria-label={blockText(block)}></i>
                        {/each}
                        {#each row.warnings as warning (warning.key)}
                            <i
                                class="fa-solid fa-triangle-exclamation warn-icon"
                                data-tooltip={warningText(warning)}
                                aria-label={warningText(warning)}
                            ></i>
                        {/each}
                        <button
                            type="button"
                            class="expand"
                            aria-expanded={expanded === row.item.id}
                            aria-label={t("Impulse.Details")}
                            onclick={() => (expanded = expanded === row.item.id ? null : row.item.id)}
                        >
                            <i class="fa-solid {expanded === row.item.id ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        </button>
                        <button type="button" class="use" disabled={busy} onclick={(event) => use(row, event)}>
                            {t("Impulse.Use")}
                        </button>
                    </div>
                    {#if row.summary.damage.length > 0 || row.summary.save || row.summary.area}
                        <div class="summary">
                            {#if row.summary.damage.length > 0}<span>{row.summary.damage.join(", ")}</span>{/if}
                            {#if row.summary.save}<span>{row.summary.save}</span>{/if}
                            {#if row.summary.area}<span>{row.summary.area}</span>{/if}
                        </div>
                    {/if}
                    {#if row.highlight === "channel"}
                        <div class="callout channel">{t("Impulse.FreeWithChannel")}</div>
                    {:else if row.highlight === "infusion"}
                        <div class="callout infusion">{t("Impulse.Infused")}</div>
                    {/if}
                    {#if expanded === row.item.id}
                        <div class="details">
                            {#each row.warnings as warning (warning.key)}
                                <p class="warning-line"><i class="fa-solid fa-triangle-exclamation"></i> {warningText(warning)}</p>
                            {/each}
                            <p>{plainText(row.item.description)}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    </section>
{/each}

<style>
    h3 {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        margin: 0 0 0.25rem;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.75;
        border: none;
    }
    .section-hint {
        text-transform: none;
        letter-spacing: 0;
        font-weight: normal;
        font-size: 0.75rem;
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
    li.blocked {
        opacity: 0.55;
    }
    li.highlight-infusion {
        border-color: #9b59b6;
        background: color-mix(in srgb, #9b59b6 12%, transparent);
    }
    li.highlight-channel {
        border-color: var(--kinetic-accent, #3a86c8);
        background: color-mix(in srgb, var(--kinetic-accent, #3a86c8) 12%, transparent);
    }
    .line {
        display: flex;
        align-items: center;
        gap: 0.35rem;
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
        gap: 0.2rem;
        font-size: 0.75rem;
    }
    .air { color: #7fb3d5; }
    .earth { color: #9b7b4f; }
    .fire { color: #d8622b; }
    .metal { color: #8d969f; }
    .water { color: #3a86c8; }
    .wood { color: #5f9a43; }
    .badge {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 0 0.3rem;
        border-radius: 3px;
        white-space: nowrap;
    }
    .badge.overflow {
        background: color-mix(in srgb, var(--kinetic-danger, #b8473b) 25%, transparent);
        color: var(--kinetic-danger, #b8473b);
        font-weight: bold;
    }
    .badge.composite {
        background: color-mix(in srgb, currentColor 12%, transparent);
    }
    .spacer {
        flex: 1;
    }
    .block-icon {
        color: var(--kinetic-danger, #b8473b);
        font-size: 0.8rem;
    }
    .warn-icon {
        color: var(--kinetic-warn, #c7892b);
        font-size: 0.8rem;
    }
    .expand {
        all: unset;
        width: 1.3rem;
        text-align: center;
        cursor: pointer;
        opacity: 0.6;
        font-size: 0.75rem;
    }
    .expand:hover,
    .expand:focus-visible {
        opacity: 1;
    }
    .use {
        flex: none;
        width: auto;
        height: 1.5rem;
        padding: 0 0.6rem;
        font-size: 0.8rem;
        line-height: 1;
    }
    .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 0 0.6rem;
        padding-left: 1.65rem;
        font-size: 0.75rem;
        opacity: 0.8;
    }
    .summary span + span::before {
        content: "·";
        margin-right: 0.6rem;
        opacity: 0.6;
    }
    .callout {
        margin: 0.15rem 0 0 1.65rem;
        font-size: 0.75rem;
        font-weight: bold;
    }
    .callout.channel {
        color: var(--kinetic-accent, #3a86c8);
    }
    .callout.infusion {
        color: #9b59b6;
    }
    .details {
        margin: 0.3rem 0 0.1rem 1.65rem;
        font-size: 0.8rem;
        line-height: 1.35;
    }
    .details p {
        margin: 0 0 0.3rem;
    }
    .warning-line {
        color: var(--kinetic-warn, #c7892b);
        font-weight: bold;
    }
</style>
