import type { CharacterPF2e } from "@actor";
import type { OneToTen } from "@module/data.ts";
import type { CastOption } from "../spellbook/model.ts";
import { overchargeWand } from "./wands.ts";

/**
 * Casts a spell through pf2e's own spellcasting entry, which spends the slot, innate use or focus point
 * and posts the chat card. Wands and scrolls go through pf2e's consumable path instead. pf2e shows its own warning if the resource turns out to be spent.
 */
export async function castOption(actor: CharacterPF2e, option: CastOption): Promise<void> {
    if (option.kind === "wand-overcharge") return overchargeWand(actor, option.entryId);
    if (option.kind === "wand" || option.kind === "scroll") {
        // pf2e's consume() casts the embedded spell (or runs Trick Magic Item), then spends the wand's
        // daily use or uses up the scroll.
        const item = actor.items.get(option.entryId);
        if (!item?.isOfType("consumable")) {
            ui.notifications.error(game.i18n.localize("PF2EGrimoire.Error.SpellNotFound"));
            return;
        }
        await item.consume();
        return;
    }

    const entry = actor.spellcasting.get(option.entryId);
    const spell = actor.items.get(option.spellId);
    if (!entry || !spell?.isOfType("spell")) {
        ui.notifications.error(game.i18n.localize("PF2EGrimoire.Error.SpellNotFound"));
        return;
    }
    await entry.cast(spell, { rank: option.rank as OneToTen, slotId: option.slotIndex });
}
