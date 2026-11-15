<script lang="ts">
    import type { CastOption } from "../spellbook/model.ts";

    interface Props {
        x: number;
        y: number;
        rank: number;
        options: CastOption[];
        /** The option a plain click would cast, marked in the list */
        defaultOption: CastOption | null;
        choose: (option: CastOption) => void;
        close: () => void;
    }

    const { x, y, rank, options, defaultOption, choose, close }: Props = $props();

    let menu: HTMLElement | undefined = $state();

    $effect(() => {
        menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
        const onPointer = (event: PointerEvent) => {
            if (menu && !menu.contains(event.target as Node)) close();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                close();
            }
        };
        document.addEventListener("pointerdown", onPointer, true);
        document.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("pointerdown", onPointer, true);
            document.removeEventListener("keydown", onKey, true);
        };
    });

    const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

    function costText(option: CastOption): string {
        const cost = option.cost;
        switch (cost.type) {
            case "free":
                return t("Cost.Free");
            case "prepared-slot":
                return t("Cost.PreparedSlot", { rank: option.rank });
            case "slot":
                return t("Cost.Slot", { rank: option.rank, value: cost.value, max: cost.max });
            case "innate":
                return t("Cost.Innate", { value: cost.value, max: cost.max });
            case "focus":
                return t("Cost.Focus", { value: cost.value });
            case "wand":
                return t("Cost.Wand", { value: cost.value, max: cost.max });
            case "scroll":
                return t("Cost.Scroll", { quantity: cost.quantity });
        }
    }
</script>

<div class="source-menu" role="menu" bind:this={menu} style:left="{x}px" style:top="{y}px">
    <header>{t("CastAtRank", { rank })}</header>
    {#each options as option, i (i)}
        <button
            type="button"
            role="menuitem"
            disabled={!option.available}
            class:default={option === defaultOption}
            onclick={() => choose(option)}
        >
            <span class="source">{option.entryName}</span>
            <span class="cost">{costText(option)}</span>
            {#if !option.available && option.reason}
                <span class="reason">{t(`Reason.${option.reason}`, { rank: option.rank })}</span>
            {:else if option === defaultOption}
                <span class="reason">{t("DefaultPick")}</span>
            {/if}
        </button>
    {/each}
</div>

<style>
    .source-menu {
        position: absolute;
        z-index: 10;
        min-width: 14rem;
        max-width: 20rem;
        padding: 0.25rem;
        border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
        border-radius: 6px;
        background: var(--color-cool-5, #1f1f24);
        box-shadow: 0 4px 16px rgb(0 0 0 / 45%);
        color: var(--color-text-primary, #e8e8e8);
    }
    header {
        padding: 0.15rem 0.4rem 0.3rem;
        font-size: 0.75rem;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    button {
        all: unset;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0 0.75rem;
        width: 100%;
        padding: 0.3rem 0.4rem;
        border-radius: 4px;
        cursor: pointer;
    }
    button:hover:not(:disabled),
    button:focus-visible {
        background: color-mix(in srgb, currentColor 14%, transparent);
    }
    button:disabled {
        cursor: default;
        opacity: 0.5;
    }
    button.default .source {
        font-weight: bold;
    }
    .cost {
        font-size: 0.85em;
        text-align: right;
        opacity: 0.85;
    }
    .reason {
        grid-column: 1 / -1;
        font-size: 0.75em;
        opacity: 0.75;
        font-style: italic;
    }
</style>
