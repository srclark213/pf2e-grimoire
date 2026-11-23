<script lang="ts">
    import type { BlastStatus } from "../kinetic/impulses.ts";
    import type { KineticSnapshot, PrimedInfusion } from "../kinetic/model.ts";
    import type { KineticActions } from "./kinetic-state.svelte.ts";
    import { t } from "./kinetic-ui.ts";

    interface Props {
        blast: NonNullable<KineticSnapshot["blast"]>;
        status: BlastStatus;
        infusion: PrimedInfusion | null;
        actions: KineticActions;
    }

    const { blast, status, infusion, actions }: Props = $props();

    const dormant = $derived(status.blocks.some((b) => b.key === "AuraDormant"));
    const chain = $derived(infusion?.chain ?? null);

    let busy = $state(false);

    async function run(fn: () => Promise<void>): Promise<void> {
        if (busy) return;
        busy = true;
        try {
            await fn();
        } finally {
            busy = false;
        }
    }
</script>

<section class="blasts" class:dormant class:infused={status.infused}>
    <header>
        <h3>
            {t("Blast.Header")}
            <button
                type="button"
                class="share"
                aria-label={t("Share")}
                data-tooltip={t("Share")}
                onclick={() => run(() => actions.share(blast.itemId))}
            >
                <i class="fa-solid fa-comment"></i>
            </button>
        </h3>
        <div class="cost" role="radiogroup" aria-label={t("Blast.Cost")}>
            {#each [1, 2] as const as cost (cost)}
                <button
                    type="button"
                    role="radio"
                    aria-checked={blast.cost === cost}
                    class:selected={blast.cost === cost}
                    disabled={busy || dormant}
                    data-tooltip={t(cost === 1 ? "Blast.OneAction" : "Blast.TwoActions")}
                    onclick={() => run(() => actions.setBlastCost(cost))}
                >
                    <span class="action-glyph">{cost}</span>
                </button>
            {/each}
        </div>
    </header>

    {#if dormant}
        <p class="note dormant-note"><i class="fa-solid fa-lock"></i> {t("Blast.Dormant")}</p>
    {/if}
    {#if status.channel === "free"}
        <p class="note channel-note"><i class="fa-solid fa-hurricane"></i> {t("Blast.ChannelFree")}</p>
    {:else if status.channel === "needs-one-action"}
        <p class="note channel-note">
            <i class="fa-solid fa-hurricane"></i>
            {t("Blast.ChannelNeedsOne")}
            <button type="button" class="link" disabled={busy} onclick={() => run(() => actions.setBlastCost(1))}>
                {t("Blast.SwitchToOne")}
            </button>
        </p>
    {/if}
    {#if status.infused && infusion}
        <p class="note infused-note">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            {chain && chain.blasts > 0
                ? t("Blast.ChainNext", { next: chain.blasts + 1, max: chain.max })
                : t("Blast.Infused", { name: infusion.name })}
        </p>
    {/if}

    {#each blast.configs as config (config.element)}
        <article class="blast {config.element}">
            <div class="title">
                <img src={config.img} alt="" />
                <div class="name">
                    <strong>{config.label}</strong>
                    <span>{config.range}</span>
                </div>
                <div class="types" role="radiogroup" aria-label={t("Blast.DamageType")}>
                    {#each config.damageTypes as type (type.value)}
                        <button
                            type="button"
                            role="radio"
                            aria-checked={type.selected}
                            class:selected={type.selected}
                            disabled={busy}
                            onclick={() => run(() => actions.setDamageType(config.element, type.value))}
                        >
                            {type.label}
                        </button>
                    {/each}
                </div>
            </div>

            {#if chain && chain.blasts > 0}
                {@const mapIncreases = Math.min(2, chain.blasts)}
                <div class="row chain">
                    <span class="label"><i class="fa-solid fa-link"></i> {t("Blast.Chain")}</span>
                    <button
                        type="button"
                        class="attack chain-attack"
                        disabled={busy || dormant}
                        onclick={(event) => run(() => actions.blastAttack(config.element, false, mapIncreases, event))}
                    >
                        {t("Blast.ChainAttack", { next: chain.blasts + 1, max: chain.max, modifier: config.ranged[mapIncreases] })}
                    </button>
                </div>
            {/if}

            {#each [true, false] as melee (melee)}
                {@const maps = melee ? config.melee : config.ranged}
                {@const formula = melee ? config.formula.melee : config.formula.ranged}
                <div class="row">
                    <span class="label">{t(melee ? "Blast.Melee" : "Blast.Ranged")}</span>
                    {#each maps as modifier, index (index)}
                        <button
                            type="button"
                            class="attack"
                            class:first={index === 0}
                            disabled={busy || dormant}
                            onclick={(event) => run(() => actions.blastAttack(config.element, melee, index, event))}
                        >
                            {index === 0 ? modifier : modifier.split(" ")[0]}
                        </button>
                    {/each}
                    <button
                        type="button"
                        class="damage"
                        disabled={busy || dormant}
                        data-tooltip={t("Blast.Damage")}
                        onclick={(event) => run(() => actions.blastDamage(config.element, melee, false, event))}
                    >
                        {formula.hit}
                    </button>
                    <button
                        type="button"
                        class="damage crit"
                        disabled={busy || dormant}
                        data-tooltip={t("Blast.Critical", { formula: formula.crit })}
                        onclick={(event) => run(() => actions.blastDamage(config.element, melee, true, event))}
                    >
                        {t("Blast.Crit")}
                    </button>
                </div>
            {/each}
        </article>
    {/each}
</section>

<style>
    .blasts {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    h3 {
        margin: 0;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.75;
        border: none;
    }
    .share {
        all: unset;
        margin-left: 0.3rem;
        font-size: 0.75rem;
        cursor: pointer;
        opacity: 0.6;
    }
    .share:hover,
    .share:focus-visible {
        opacity: 1;
    }
    .cost,
    .types {
        display: inline-flex;
        border-radius: 4px;
        overflow: hidden;
        border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    }
    .cost button,
    .types button {
        all: unset;
        padding: 0 0.45rem;
        height: 1.5rem;
        line-height: 1.5rem;
        font-size: 0.8rem;
        cursor: pointer;
        opacity: 0.65;
    }
    .cost button.selected,
    .types button.selected {
        opacity: 1;
        font-weight: bold;
        background: color-mix(in srgb, var(--kinetic-accent, #3a86c8) 30%, transparent);
    }
    .cost button:disabled,
    .types button:disabled {
        cursor: default;
    }
    .note {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.8rem;
        padding: 0.2rem 0.4rem;
        border-radius: 4px;
    }
    .dormant-note {
        background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .channel-note {
        background: color-mix(in srgb, var(--kinetic-accent, #3a86c8) 15%, transparent);
    }
    .infused-note {
        background: color-mix(in srgb, #9b59b6 18%, transparent);
    }
    .link {
        all: unset;
        cursor: pointer;
        text-decoration: underline;
    }
    .blast {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.4rem 0.5rem;
        border-radius: 6px;
        border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
        border-left: 4px solid var(--element, currentColor);
    }
    .infused .blast {
        box-shadow: 0 0 0 2px color-mix(in srgb, #9b59b6 60%, transparent);
    }
    .dormant .blast {
        opacity: 0.6;
    }
    .air { --element: #7fb3d5; }
    .earth { --element: #9b7b4f; }
    .fire { --element: #d8622b; }
    .metal { --element: #8d969f; }
    .water { --element: #3a86c8; }
    .wood { --element: #5f9a43; }
    .title {
        display: flex;
        align-items: center;
        gap: 0.45rem;
    }
    .title img {
        width: 2rem;
        height: 2rem;
        border: none;
        border-radius: 4px;
    }
    .name {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .name span {
        font-size: 0.75rem;
        opacity: 0.7;
    }
    .row {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .row .label {
        width: 4rem;
        font-size: 0.75rem;
        opacity: 0.75;
    }
    .row button {
        width: auto;
        height: 1.6rem;
        padding: 0 0.4rem;
        font-size: 0.8rem;
        line-height: 1;
        white-space: nowrap;
    }
    .attack.first {
        font-weight: bold;
    }
    .damage {
        margin-left: auto;
    }
    .damage + .damage {
        margin-left: 0;
    }
    .chain .label {
        color: #9b59b6;
        width: auto;
    }
    .chain-attack {
        flex: 1;
        border-color: #9b59b6;
        background: color-mix(in srgb, #9b59b6 20%, transparent);
    }
</style>
