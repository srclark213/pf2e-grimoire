<script lang="ts">
    import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
    import { isDefaultPriority, movePriority } from "../spellbook/priority.ts";

    interface Props {
        priority: PriorityGroup[];
        save: (priority: PriorityGroup[] | null) => Promise<void>;
        close: () => void;
    }

    const { priority, save, close }: Props = $props();

    const t = (key: string) => game.i18n.localize(`PF2EGrimoire.${key}`);

    let saving = $state(false);

    async function apply(next: PriorityGroup[] | null): Promise<void> {
        if (saving) return;
        saving = true;
        try {
            await save(next);
        } finally {
            saving = false;
        }
    }
</script>

<div class="priority-settings">
    <header>
        <span>{t("Priority.Title")}</span>
        <button type="button" class="icon" aria-label={t("Priority.Close")} onclick={close}>
            <i class="fa-solid fa-xmark"></i>
        </button>
    </header>
    <p class="hint">{t("Priority.Hint")}</p>
    <ol>
        {#each priority as group, i (group)}
            <li>
                <span class="position">{i + 1}</span>
                <span class="label">{t(`Priority.Group.${group}`)}</span>
                <button
                    type="button"
                    class="icon"
                    aria-label={t("Priority.MoveUp")}
                    disabled={i === 0 || saving}
                    onclick={() => apply(movePriority(priority, i, -1))}
                >
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button
                    type="button"
                    class="icon"
                    aria-label={t("Priority.MoveDown")}
                    disabled={i === priority.length - 1 || saving}
                    onclick={() => apply(movePriority(priority, i, 1))}
                >
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </li>
        {/each}
    </ol>
    <button type="button" class="reset" disabled={isDefaultPriority(priority) || saving} onclick={() => apply(null)}>
        {t("Priority.Reset")}
    </button>
</div>

<style>
    .priority-settings {
        margin: 0.25rem 0 0.5rem;
        padding: 0.4rem 0.5rem;
        border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
        border-radius: 6px;
        background: color-mix(in srgb, currentColor 5%, transparent);
    }
    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
    }
    .hint {
        margin: 0.2rem 0 0.4rem;
        font-size: 0.8rem;
        opacity: 0.75;
    }
    ol {
        margin: 0;
        padding: 0;
        list-style: none;
    }
    li {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.1rem 0;
    }
    .position {
        width: 1.2rem;
        opacity: 0.6;
        text-align: right;
    }
    .label {
        flex: 1;
    }
    button.icon {
        all: unset;
        width: 1.4rem;
        height: 1.4rem;
        border-radius: 4px;
        text-align: center;
        line-height: 1.4rem;
        cursor: pointer;
    }
    button.icon:hover:not(:disabled),
    button.icon:focus-visible {
        background: color-mix(in srgb, currentColor 15%, transparent);
    }
    button:disabled {
        opacity: 0.35;
        cursor: default;
    }
    .reset {
        margin-top: 0.4rem;
        width: 100%;
    }
</style>
