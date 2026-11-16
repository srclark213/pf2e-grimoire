import type { CharacterPF2e } from "@actor";
import type { ConsumablePF2e } from "@item";
import { MODULE_ID } from "../constants.ts";
import { resetReflow } from "./reflow.ts";
import { prepareStavesOnRest } from "./staves.ts";
import {
    OVERCHARGE_DC,
    canOvercharge,
    overchargeOutcome,
    overchargeStep,
    readWandState,
} from "../spellbook/overcharge.ts";

const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

function findWand(actor: CharacterPF2e, wandId: string): ConsumablePF2e<CharacterPF2e> | null {
    const item = actor.items.get(wandId);
    return item?.isOfType("consumable") && item.category === "wand" ? item : null;
}

async function chatNote(actor: CharacterPF2e, content: string): Promise<void> {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${content}</p>` });
}

/**
 * Overcharges a wand after confirmation (GM Core p. 282): casts its spell again, rolls the DC 10 flat check
 * to chat, then marks the wand broken on a success or destroys it on a failure. A second overcharge the same
 * day destroys the wand with no spell and no check.
 */
export async function overchargeWand(actor: CharacterPF2e, wandId: string): Promise<void> {
    const wand = findWand(actor, wandId);
    if (!wand) {
        ui.notifications.error(t("Error.SpellNotFound"));
        return;
    }
    const state = readWandState(wand.flags[MODULE_ID]);
    if (!canOvercharge(state, wand.uses.value)) return;

    const step = overchargeStep(state);
    const names = { wand: wand.name, spell: wand.embeddedSpell?.name ?? wand.name, dc: OVERCHARGE_DC };
    const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("Overcharge.Title"), icon: "fa-solid fa-bolt" },
        content: `<p>${t(step.type === "destroy" ? "Overcharge.ConfirmRepeat" : "Overcharge.Confirm", names)}</p>`,
    });
    if (!confirmed) return;

    if (step.type === "destroy") {
        await chatNote(actor, t("Overcharge.RepeatDestroyed", { ...names, actor: actor.name }));
        await wand.delete();
        return;
    }

    await wand.castEmbeddedSpell();
    const roll = await new Roll("1d20").evaluate();
    const outcome = overchargeOutcome(roll.total);
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: t(outcome === "broken" ? "Overcharge.Success" : "Overcharge.Failure", names),
    });
    if (outcome === "broken") {
        await wand.update({
            [`flags.${MODULE_ID}.broken`]: true,
            [`flags.${MODULE_ID}.overchargedOn`]: game.time.worldTime,
        });
    } else {
        await wand.delete();
    }
}

/**
 * Clears a wand's broken mark. The overcharge stays recorded until rest, so overcharging the repaired wand
 * again the same day still destroys it.
 */
export async function repairWand(actor: CharacterPF2e, wandId: string): Promise<void> {
    const wand = findWand(actor, wandId);
    if (!wand) return;
    await wand.update({ [`flags.${MODULE_ID}.broken`]: null });
    ui.notifications.info(t("Overcharge.Repaired", { wand: wand.name }));
}

/**
 * On pf2e's Rest for the Night:
 * - wands: pf2e refills their uses itself (GRIM-16). This clears the Grimoire's overcharged-today mark so
 *   tomorrow's overcharge is a normal one. Broken wands stay broken.
 * - staves: the character's staff is prepared for the new day (GRIM-22).
 */
export function registerRestHook(): void {
    Hooks.on("pf2e.restForTheNight", (...args: unknown[]) => {
        const actor = args[0] as CharacterPF2e | undefined;
        if (!actor?.isOwner || !actor.isOfType("character")) return;
        const updates = actor.itemTypes.consumable
            .filter((item) => item.category === "wand" && readWandState(item.flags[MODULE_ID]).overchargedToday)
            .map((item) => ({ _id: item.id, [`flags.${MODULE_ID}.overchargedOn`]: null }));
        if (updates.length > 0) void actor.updateEmbeddedDocuments("Item", updates);
        void prepareStavesOnRest(actor);
        void resetReflow(actor);
    });
}
