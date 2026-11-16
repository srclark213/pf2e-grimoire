import type { CharacterPF2e } from "@actor";
import type { ChatMessagePF2e } from "@module/chat-message/document.ts";
import type { EffectSource } from "@item/effect/data.ts";
import { MODULE_ID } from "../constants.ts";
import { infusionTarget } from "../kinetic/impulses.ts";
import type { ActionCost, KineticState } from "../kinetic/model.ts";
import { applyUse, normalizeState, type Notice, type UsedItem } from "../kinetic/state.ts";
import { AURA_SLUG, combatStamp, costOf, isKineticist, kineticEffects, type AbilityLike } from "./kinetic-snapshot.ts";

const AUTOMATION = "kineticAutomation";

export function registerKineticSettings(): void {
    game.settings.register(MODULE_ID, AUTOMATION, {
        name: "PF2EGrimoire.Kinetic.Setting.Automation.Name",
        hint: "PF2EGrimoire.Kinetic.Setting.Automation.Hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
    });
}

function automationOn(): boolean {
    return game.settings.get(MODULE_ID, AUTOMATION) as boolean;
}

const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.Kinetic.${key}`, data);

function abilityItem(actor: CharacterPF2e, itemId: string): AbilityLike | null {
    const item = actor.items.get(itemId);
    return item?.isOfType("action", "feat") ? (item as AbilityLike) : null;
}

/**
 * Uses an impulse, infusion or Channel Elements the way the sheet does (pf2e's action card, which also counts
 * down any frequency), and applies its self-effect right away rather than leaving an Apply button in chat.
 * The chat hook below then updates the overflow, infusion and Channel Elements state.
 */
export async function useKineticItem(actor: CharacterPF2e, itemId: string, event: Event | null = null): Promise<void> {
    const item = abilityItem(actor, itemId);
    if (!item) return;
    const message = (await game.pf2e.rollItemMacro(item.uuid, event)) as ChatMessagePF2e | null;
    if (message && item.system.selfEffect) await applySelfEffect(actor, item, message);
}

/** pf2e's "Apply effect" button from a self-effect card, done for the user. A new stance replaces the old one. */
async function applySelfEffect(actor: CharacterPF2e, item: AbilityLike, message: ChatMessagePF2e): Promise<void> {
    const uuid = item.system.selfEffect?.uuid;
    const effect = uuid ? await fromUuid(uuid) : null;
    if (!effect || !(effect as { isOfType?: (t: string) => boolean }).isOfType?.("effect")) return;
    const source = (effect as unknown as { toObject(): EffectSource }).toObject();

    // Don't stack a second copy (e.g. Channel Elements when the aura is somehow still on).
    if (actor.itemTypes.effect.some((e) => e.sourceId === uuid)) return;

    if (item.system.traits.value.includes("stance" as never)) {
        const stances = kineticEffects(actor).filter((e) => e.stance);
        if (stances.length > 0) {
            await actor.deleteEmbeddedDocuments(
                "Item",
                stances.map((s) => s.id),
            );
        }
    }

    const effectTraits = (CONFIG.PF2E as unknown as { effectTraits: Record<string, string> }).effectTraits ?? {};
    const traits = item.system.traits.value.filter((trait) => trait in effectTraits);
    const merged = foundry.utils.mergeObject(source, {
        _id: null,
        system: {
            context: {
                origin: {
                    actor: actor.uuid,
                    token: message.token?.uuid ?? null,
                    item: item.uuid,
                    spellcasting: null,
                    rollOptions: item.getOriginData().rollOptions,
                },
                target: { actor: actor.uuid, token: actor.getActiveTokens(true, true).at(0)?.uuid ?? null },
                roll: null,
            },
            traits: { value: traits },
        },
    } as never);
    await actor.createEmbeddedDocuments("Item", [merged]);

    // Replace the card's "Apply effect" button with a note, as pf2e does when the button is clicked.
    const container = document.createElement("div");
    container.innerHTML = message.content;
    const button = container.querySelector("button[data-action=applyEffect]");
    if (button) {
        const note = document.createElement("span");
        note.classList.add("effect-applied");
        note.textContent = t("EffectApplied", { effect: effect.name });
        button.replaceWith(note);
        await message.update({ content: container.innerHTML });
    }
}

/** Ends the kinetic aura and, with it, any stance impulse */
export async function deactivateAura(actor: CharacterPF2e): Promise<string[]> {
    const ending = kineticEffects(actor).filter((e) => e.aura || e.stance);
    if (ending.length > 0) {
        await actor.deleteEmbeddedDocuments(
            "Item",
            ending.map((e) => e.id),
        );
    }
    return ending.filter((e) => e.stance).map((e) => e.name);
}

export async function removeEffect(actor: CharacterPF2e, effectId: string): Promise<void> {
    const effect = actor.items.get(effectId);
    if (!effect) return;
    if (effect.slug === AURA_SLUG) {
        await deactivateAura(actor);
    } else {
        await effect.delete();
    }
}

export async function blastAttack(
    actor: CharacterPF2e,
    params: { element: string; melee: boolean; mapIncreases: number; event: Event | null },
): Promise<void> {
    const blast = new game.pf2e.ElementalBlast(actor);
    const damageType = selectedDamageType(blast, params.element);
    if (!damageType) return;
    await blast.attack({
        element: params.element as never,
        damageType: damageType as never,
        melee: params.melee,
        mapIncreases: params.mapIncreases,
        event: params.event,
    } as never);
}

export async function blastDamage(
    actor: CharacterPF2e,
    params: { element: string; melee: boolean; critical: boolean; event: Event | null },
): Promise<void> {
    const blast = new game.pf2e.ElementalBlast(actor);
    const damageType = selectedDamageType(blast, params.element);
    if (!damageType) return;
    await blast.damage({
        element: params.element as never,
        damageType: damageType as never,
        melee: params.melee,
        outcome: params.critical ? "criticalSuccess" : "success",
        event: params.event,
    } as never);
}

function selectedDamageType(
    blast: InstanceType<typeof game.pf2e.ElementalBlast>,
    element: string,
): string | null {
    const config = blast.configs.find((c) => c.element === element);
    return config?.damageTypes.find((d) => d.selected)?.value ?? config?.damageTypes[0]?.value ?? null;
}

export async function setBlastDamageType(actor: CharacterPF2e, element: string, damageType: string): Promise<void> {
    await new game.pf2e.ElementalBlast(actor).setDamageType({ element, damageType } as never);
}

/** Switches Elemental Blast between 1 and 2 actions, the same toggle as the sheet's */
export async function setBlastCost(actor: CharacterPF2e, itemId: string, cost: 1 | 2): Promise<void> {
    await actor.toggleRollOption("elemental-blast", "action-cost", itemId, true, String(cost));
}

async function saveState(actor: CharacterPF2e, state: KineticState): Promise<void> {
    await actor.update({
        [`flags.${MODULE_ID}.kinetic`]: foundry.data.operators.ForcedReplacement.create(state),
    } as never);
}

/** Drops a primed infusion (the player changed their mind) */
export async function clearInfusion(actor: CharacterPF2e): Promise<void> {
    const state = normalizeState(actor.getFlag(MODULE_ID, "kinetic"));
    await saveState(actor, { ...state, infusion: null });
}

/** Forgets this round's overflow, for when it was used by mistake */
export async function clearOverflow(actor: CharacterPF2e): Promise<void> {
    const state = normalizeState(actor.getFlag(MODULE_ID, "kinetic"));
    await saveState(actor, { ...state, overflow: null });
}

/**
 * What a chat message says the kineticist just did, or null if it isn't an action (damage rolls, saves against
 * their impulses, rerolls...).
 */
export function classifyMessage(message: ChatMessagePF2e, actor: CharacterPF2e): UsedItem | null {
    const context = message.flags.pf2e?.context as { type?: string; options?: string[]; isReroll?: boolean } | undefined;
    const type = context?.type;
    if (context?.isReroll) return null;
    if (type && !["self-effect", "attack-roll", "spell-cast", "skill-check"].includes(type)) return null;

    const item = message.item;
    const isOurs = !!item && item.actor?.uuid === actor.uuid;

    if (isOurs && item.isOfType("action", "feat")) {
        const ability = item as AbilityLike;
        const traits = ability.system.traits.value as string[];
        const base = {
            itemId: ability.id,
            name: ability.name,
            cost: costOf(ability),
            overflow: traits.includes("overflow"),
            stance: traits.includes("stance"),
        };
        if (ability.slug === "elemental-blast") {
            // Only the attack roll is the action; the sheet's card for the blast item is just information.
            if (type !== "attack-roll") return null;
            const costOption = context?.options?.find((o) => o.startsWith("action:cost:"));
            const cost = (costOption?.split(":")[2] ?? "1") as ActionCost;
            return { ...base, kind: "blast", cost };
        }
        if (ability.slug === "channel-elements") return { ...base, kind: "channel" };
        if (traits.includes("infusion")) {
            return { ...base, kind: "infusion", infusion: infusionTarget(ability.system.description.value) };
        }
        if (traits.includes("impulse")) return { ...base, kind: "impulse" };
        if (base.cost === "passive") return null;
        return { ...base, kind: "other" };
    }

    // Strikes, spells and skill actions are actions too: they waste a primed infusion.
    const isAction =
        type === "attack-roll" ||
        type === "spell-cast" ||
        (type === "skill-check" && !!context?.options?.some((o) => o.startsWith("action:")));
    if (!isAction) return null;
    return { kind: "other", itemId: item?.id ?? "", name: item?.name ?? message.flavor ?? "", cost: "1", overflow: false, stance: false };
}

function noticeText(notice: Notice): string {
    switch (notice.key) {
        case "ChainContinues":
            return t("Notice.ChainContinues", { blasts: notice.blasts, max: notice.max });
        case "ChainEnded":
            return t("Notice.ChainEnded", { blasts: notice.blasts });
        default:
            return t(`Notice.${notice.key}`, notice);
    }
}

/**
 * Watches the kineticist's own chat cards, so the state follows play whether an ability was used from the
 * dashboard, the sheet, or a macro. Only the message's author acts on it, so it happens once.
 */
export function registerKineticHooks(): void {
    Hooks.on("createChatMessage", (...args: unknown[]) => {
        const message = args[0] as ChatMessagePF2e;
        if (message.author?.id !== game.user.id || !automationOn()) return;
        const actor = message.actor;
        if (!isKineticist(actor) || !actor.isOwner) return;
        const used = classifyMessage(message, actor);
        if (!used) return;
        void onUse(actor, used);
    });
}

async function onUse(actor: CharacterPF2e, used: UsedItem): Promise<void> {
    const state = normalizeState(actor.getFlag(MODULE_ID, "kinetic"));
    const outcome = applyUse(state, used, combatStamp());
    if (JSON.stringify(outcome.state) !== JSON.stringify(state)) await saveState(actor, outcome.state);

    for (const notice of outcome.notices) {
        const text = noticeText(notice);
        if (notice.key === "InfusionWasted" || notice.key === "OverflowTwice") ui.notifications.warn(text);
        else ui.notifications.info(text);
    }

    if (outcome.deactivateAura) {
        const stances = await deactivateAura(actor);
        ui.notifications.info(
            stances.length > 0 ? t("Notice.AuraEndedWithStances", { stances: stances.join(", ") }) : t("Notice.AuraEnded"),
        );
    }
}
