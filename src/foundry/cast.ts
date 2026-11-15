import type { CharacterPF2e } from "@actor";
import type { OneToTen } from "@module/data.ts";
import type { CastOption } from "../spellbook/model.ts";

/**
 * Casts a spell through pf2e's own spellcasting entry, which spends the slot, innate use or focus point
 * and posts the chat card. pf2e shows its own warning if the resource turns out to be spent.
 */
export async function castOption(actor: CharacterPF2e, option: CastOption): Promise<void> {
    const entry = actor.spellcasting.get(option.entryId);
    const spell = actor.items.get(option.spellId);
    if (!entry || !spell?.isOfType("spell")) {
        ui.notifications.error(game.i18n.localize("PF2EGrimoire.Error.SpellNotFound"));
        return;
    }
    await entry.cast(spell, { rank: option.rank as OneToTen, slotId: option.slotIndex });
}
