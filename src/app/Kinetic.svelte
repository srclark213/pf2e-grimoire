<script lang="ts">
    import { blastStatus, impulseRows, infusionTarget } from "../kinetic/impulses.ts";
    import { channelRiderOpen, liveInfusion, overflowUsed } from "../kinetic/state.ts";
    import BlastPanel from "./BlastPanel.svelte";
    import { levelLookup } from "../kinetic/summary.ts";
    import ImpulseList from "./ImpulseList.svelte";
    import ManageImpulses from "./ManageImpulses.svelte";
    import type { KineticActions, KineticState } from "./kinetic-state.svelte.ts";
    import { ELEMENT_ICONS, costGlyph, elementLabel, t } from "./kinetic-ui.ts";

    interface Props {
        kinetic: KineticState;
        actions: KineticActions;
    }

    const { kinetic, actions }: Props = $props();

    const snapshot = $derived(kinetic.snapshot);
    const rows = $derived(snapshot ? impulseRows(snapshot, kinetic.lookup) : []);
    const blast = $derived(snapshot ? blastStatus(snapshot) : null);
    const infusion = $derived(snapshot ? liveInfusion(snapshot.state, snapshot.now) : null);
    const channelOpen = $derived(snapshot ? channelRiderOpen(snapshot.state, snapshot.now) : false);
    const usedOverflow = $derived(snapshot ? overflowUsed(snapshot.state, snapshot.now) : false);
    const effects = $derived(snapshot?.effects.filter((e) => !e.aura) ?? []);

    let busy = $state(false);
    let view: "play" | "manage" = $state("play");

    async function run(fn: () => Promise<void>): Promise<void> {
        if (busy) return;
        busy = true;
        try {
            await fn();
        } finally {
            busy = false;
        }
    }

    function infusionHint(description: string): string {
        const { target, chain } = infusionTarget(description);
        if (chain) return t("Infusion.ChainHint", { max: chain });
        return t(target === "blast" ? "Infusion.TargetBlast" : "Infusion.TargetImpulse");
    }
</script>

{#if snapshot}
    <div class="kinetic">
        <div class="tabs" role="tablist">
            {#each ["play", "manage"] as const as tab (tab)}
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === tab}
                    class:active={view === tab}
                    onclick={() => (view = tab)}
                >
                    <i class="fa-solid {tab === 'play' ? 'fa-hurricane' : 'fa-book-open'}"></i>
                    {t(`Tab.${tab}`)}
                </button>
            {/each}
        </div>
        {#if view === "manage"}
            <div class="scroll">
                <ManageImpulses
                    elements={snapshot.elements}
                    level={snapshot.level}
                    owned={kinetic.owned}
                    catalog={kinetic.catalog}
                    reflow={kinetic.reflow}
                    lookup={kinetic.lookup}
                    {actions}
                />
            </div>
        {:else}
        <section class="gate" class:active={snapshot.aura.active}>
            <div class="aura">
                <i class="fa-solid fa-hurricane aura-icon"></i>
                <div class="aura-text">
                    <strong>
                        {snapshot.aura.active
                            ? t("Aura.Active", { radius: snapshot.aura.radius })
                            : t("Aura.Dormant")}
                    </strong>
                    <span class="elements">
                        {#each snapshot.elements as element (element)}
                            <span class="element {element}">
                                <i class="fa-solid {ELEMENT_ICONS[element] ?? 'fa-circle'}"></i>
                                {elementLabel(element)}
                            </span>
                        {/each}
                    </span>
                </div>
                {#if snapshot.aura.active}
                    <button
                        type="button"
                        class="gate-button dismiss"
                        disabled={busy}
                        data-tooltip={t("Aura.DismissHint")}
                        onclick={() => run(actions.dismissAura)}
                    >
                        <i class="fa-solid fa-power-off"></i>
                        {t("Aura.Dismiss")}
                    </button>
                {:else if snapshot.channel}
                    {@const channel = snapshot.channel}
                    <button
                        type="button"
                        class="gate-button channel"
                        disabled={busy}
                        data-tooltip={t("Aura.ChannelHint")}
                        onclick={(event) => run(() => actions.use(channel.id, event))}
                    >
                        <span class="action-glyph">{costGlyph(channel.cost)}</span>
                        {channel.name}
                    </button>
                {/if}
            </div>
            <div class="stats">
                {#if snapshot.impulse.modifier !== null}
                    <span>{t("Impulse.Attack", { modifier: snapshot.impulse.modifier >= 0 ? `+${snapshot.impulse.modifier}` : snapshot.impulse.modifier })}</span>
                {/if}
                {#if snapshot.impulse.dc !== null}
                    <span>{t("Impulse.DC", { dc: snapshot.impulse.dc })}</span>
                {/if}
                {#each snapshot.junctions as junction (`${junction.element}:${junction.kind}`)}
                    <span class="junction" data-tooltip={t("Junction.Hint")}>
                        <i class="fa-solid {ELEMENT_ICONS[junction.element] ?? 'fa-circle'}"></i>
                        {t(`Junction.${junction.kind}`)}
                    </span>
                {/each}
                <span class="spacer"></span>
                {#if snapshot.now}
                    <span
                        class="overflow-pill"
                        class:used={usedOverflow}
                        data-tooltip={t(usedOverflow ? "Overflow.UsedHint" : "Overflow.ReadyHint")}
                    >
                        <i class="fa-solid fa-burst"></i>
                        {t(usedOverflow ? "Overflow.Used" : "Overflow.Ready")}
                        {#if usedOverflow}
                            <button
                                type="button"
                                class="mini"
                                aria-label={t("Overflow.Clear")}
                                data-tooltip={t("Overflow.Clear")}
                                onclick={() => run(actions.clearOverflow)}
                            >
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        {/if}
                    </span>
                {/if}
            </div>
        </section>

        {#if infusion}
            <div class="banner infusion">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <div class="banner-text">
                    {#if infusion.chain && infusion.chain.blasts > 0}
                        <strong>{t("Banner.Chain", { blasts: infusion.chain.blasts, max: infusion.chain.max })}</strong>
                        <span>{t("Banner.ChainHint")}</span>
                    {:else}
                        <strong>{t("Banner.Primed", { name: infusion.name })}</strong>
                        <span>{t(infusion.target === "blast" ? "Banner.NextBlast" : "Banner.NextImpulse")}</span>
                    {/if}
                </div>
                <button
                    type="button"
                    class="mini"
                    aria-label={t("Banner.Drop")}
                    data-tooltip={t("Banner.Drop")}
                    onclick={() => run(actions.clearInfusion)}
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        {/if}

        {#if channelOpen && snapshot.aura.active}
            <div class="banner channel">
                <i class="fa-solid fa-hurricane"></i>
                <div class="banner-text">
                    <strong>{t("Banner.Channel")}</strong>
                    <span>{t("Banner.ChannelHint")}</span>
                </div>
            </div>
        {/if}

        {#if effects.length > 0}
            <ul class="effects">
                {#each effects as effect (effect.id)}
                    <li class:stance={effect.stance}>
                        <img src={effect.img} alt="" />
                        <span>{effect.name}</span>
                        {#if effect.stance}
                            <i class="fa-solid fa-link stance-link" data-tooltip={t("Effect.StanceHint")}></i>
                        {/if}
                        <button
                            type="button"
                            class="mini"
                            aria-label={t("Effect.Remove")}
                            data-tooltip={t("Effect.Remove")}
                            onclick={() => run(() => actions.removeEffect(effect.id))}
                        >
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}

        <div class="scroll">
            {#if snapshot.blast && blast}
                <BlastPanel blast={snapshot.blast} status={blast} {infusion} {actions} />
            {/if}

            {#if snapshot.infusions.length > 0}
                <section class="infusions">
                    <h3>{t("Infusion.Header")}</h3>
                    <ul>
                        {#each snapshot.infusions as item (item.id)}
                            <li class:primed={infusion?.itemId === item.id}>
                                <button
                                    type="button"
                                    class="infusion-button"
                                    disabled={busy}
                                    data-tooltip={infusionHint(item.description)}
                                    onclick={(event) => run(() => actions.use(item.id, event))}
                                >
                                    <span class="action-glyph">{costGlyph(item.cost)}</span>
                                    <span class="name">{item.name}</span>
                                    <span class="hint">{infusionHint(item.description)}</span>
                                </button>
                                <button
                                    type="button"
                                    class="mini"
                                    aria-label={t("Share")}
                                    data-tooltip={t("Share")}
                                    onclick={() => run(() => actions.share(item.id))}
                                >
                                    <i class="fa-solid fa-comment"></i>
                                </button>
                            </li>
                        {/each}
                    </ul>
                </section>
            {/if}

            <ImpulseList {rows} lookup={kinetic.lookup ?? levelLookup(snapshot.level)} {actions} />
        </div>
        {/if}
    </div>
{/if}

<style>
    .kinetic {
        --kinetic-accent: #3a86c8;
        --kinetic-warn: #c7892b;
        --kinetic-danger: #b8473b;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        height: 100%;
        min-height: 0;
    }
    .tabs {
        display: flex;
        gap: 0.25rem;
        border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    }
    .tabs button {
        all: unset;
        padding: 0.2rem 0.7rem;
        font-size: 0.85rem;
        cursor: pointer;
        opacity: 0.65;
        border-bottom: 2px solid transparent;
    }
    .tabs button.active {
        opacity: 1;
        font-weight: bold;
        border-bottom-color: var(--kinetic-accent);
    }
    .tabs button:focus-visible {
        outline: 1px solid currentColor;
    }
    .scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-right: 0.15rem;
    }
    .gate {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0.5rem 0.6rem;
        border-radius: 6px;
        border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
        background: color-mix(in srgb, currentColor 5%, transparent);
    }
    .gate.active {
        border-color: color-mix(in srgb, var(--kinetic-accent) 70%, transparent);
        background: color-mix(in srgb, var(--kinetic-accent) 12%, transparent);
    }
    .aura {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }
    .aura-icon {
        font-size: 1.8rem;
        opacity: 0.35;
    }
    .active .aura-icon {
        opacity: 1;
        color: var(--kinetic-accent);
        animation: kinetic-spin 6s linear infinite;
    }
    @keyframes kinetic-spin {
        to {
            transform: rotate(-360deg);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .active .aura-icon {
            animation: none;
        }
    }
    .aura-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
    }
    .aura-text strong {
        font-size: 1.05rem;
    }
    .elements {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        font-size: 0.8rem;
    }
    .element {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        padding: 0 0.35rem;
        border-radius: 3px;
        background: color-mix(in srgb, var(--element) 25%, transparent);
    }
    .element i {
        color: var(--element);
    }
    .air { --element: #7fb3d5; }
    .earth { --element: #9b7b4f; }
    .fire { --element: #d8622b; }
    .metal { --element: #8d969f; }
    .water { --element: #3a86c8; }
    .wood { --element: #5f9a43; }
    .gate-button {
        flex: none;
        width: auto;
        height: 2rem;
        padding: 0 0.7rem;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-weight: bold;
    }
    .gate-button.channel {
        background: var(--kinetic-accent);
        color: white;
        border-color: transparent;
    }
    .stats {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem 0.7rem;
        font-size: 0.8rem;
    }
    .stats > span:not(.spacer):not(.overflow-pill) {
        opacity: 0.8;
    }
    .junction i {
        opacity: 0.7;
    }
    .spacer {
        flex: 1;
    }
    .overflow-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    }
    .overflow-pill.used {
        border-color: var(--kinetic-danger);
        color: var(--kinetic-danger);
        font-weight: bold;
    }
    .banner {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.6rem;
        border-radius: 6px;
        border-left: 4px solid var(--banner);
        background: color-mix(in srgb, var(--banner) 15%, transparent);
    }
    .banner > i {
        color: var(--banner);
    }
    .banner.infusion {
        --banner: #9b59b6;
    }
    .banner.channel {
        --banner: var(--kinetic-accent);
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
    .effects {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
    }
    .effects li {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.1rem 0.15rem 0.1rem 0.1rem;
        border-radius: 4px;
        font-size: 0.8rem;
        background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .effects li.stance {
        background: color-mix(in srgb, var(--kinetic-accent) 18%, transparent);
    }
    .effects img {
        width: 1.25rem;
        height: 1.25rem;
        border: none;
        border-radius: 3px;
    }
    .stance-link {
        font-size: 0.7rem;
        opacity: 0.7;
    }
    .mini {
        all: unset;
        width: 1.2rem;
        height: 1.2rem;
        border-radius: 3px;
        text-align: center;
        line-height: 1.2rem;
        font-size: 0.75rem;
        cursor: pointer;
        opacity: 0.6;
    }
    .mini:hover,
    .mini:focus-visible {
        opacity: 1;
        background: color-mix(in srgb, currentColor 15%, transparent);
    }
    h3 {
        margin: 0 0 0.25rem;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.75;
        border: none;
    }
    .infusions ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }
    .infusions li {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .infusion-button {
        flex: 1;
        min-width: 0;
        height: auto;
        min-height: 1.8rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        text-align: left;
        padding: 0.1rem 0.5rem;
    }
    .infusion-button .name {
        font-weight: bold;
        white-space: nowrap;
    }
    .infusion-button .hint {
        flex: 1;
        min-width: 0;
        opacity: 0.7;
        font-size: 0.75rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .primed .infusion-button {
        border-color: #9b59b6;
        background: color-mix(in srgb, #9b59b6 20%, transparent);
    }
</style>
