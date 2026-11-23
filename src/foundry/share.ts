import type { CharacterPF2e } from "@actor";
import type { ItemPF2e, SpellPF2e } from "@item";
import type { ChatMessagePF2e } from "@module/chat-message/document.ts";
import { MODULE_ID } from "../constants.ts";
import type { SpellRow } from "../spellbook/model.ts";
import { loadStaffSpells, staffSpell } from "./staves.ts";

/**
 * "Send to chat": posts an item's card, as pf2e's sheet does, without casting or using it. Nothing is spent,
 * and the card carries a flag so the Kinetic Gate's chat tracking doesn't take it for a use.
 */

const SHARED_FLAG = "shared";

/** True for cards posted with "send to chat" */
export function isShared(message: ChatMessagePF2e): boolean {
    return !!foundry.utils.getProperty(message, `flags.${MODULE_ID}.${SHARED_FLAG}`);
}

async function post(item: ItemPF2e, data?: Record<string, unknown>): Promise<void> {
    const toMessage = item.toMessage.bind(item) as (
        event: null,
        options: { create: false; data?: Record<string, unknown> },
    ) => Promise<ChatMessagePF2e | undefined>;
    const message = await toMessage(null, { create: false, data });
    if (!message) return;
    const source = message.toObject() as Record<string, unknown>;
    foundry.utils.setProperty(source, `flags.${MODULE_ID}.${SHARED_FLAG}`, true);
    await ChatMessage.create(source as never);
}

/** Posts one of the character's own items: an impulse, infusion, action or feat */
export async function shareItem(actor: CharacterPF2e, itemId: string): Promise<void> {
    const item = actor.items.get(itemId);
    if (item) await post(item);
}

/** Posts a compendium item as if the character had it (e.g. an impulse they're browsing) */
export async function shareUuid(actor: CharacterPF2e, uuid: string): Promise<void> {
    const doc = (await fromUuid(uuid)) as ItemPF2e | null;
    if (!doc) return;
    const temp = new CONFIG.Item.documentClass(doc.toObject() as never, { parent: actor } as never) as ItemPF2e;
    await post(temp);
}

/**
 * Posts a Grimoire row's spell card at its base rank (cantrips and focus spells heighten on their own). The row
 * may come from the character's own spells, a staff's list, or a wand or scroll.
 */
export async function shareSpell(actor: CharacterPF2e, row: SpellRow): Promise<void> {
    const castRank = row.isCantrip || row.isFocus ? undefined : row.baseRank;
    const data = castRank ? { castRank } : undefined;

    const owned = row.spellIds.map((id) => actor.items.get(id)).find((i) => i?.isOfType("spell"));
    if (owned) return post(owned, data);

    for (const option of row.castOptions) {
        const source = actor.items.get(option.entryId);
        if (!source) continue;
        if (source.isOfType("consumable")) {
            const spell = source.embeddedSpell as SpellPF2e | null;
            if (spell) return post(spell, data);
        }
        if (source.isOfType("weapon") && option.spellUuid) {
            await loadStaffSpells(actor);
            const spell = staffSpell(actor, source as never, option.spellUuid, option.staffRank ?? 0);
            if (spell) return post(spell, data);
        }
    }
    ui.notifications.error(game.i18n.localize("PF2EGrimoire.Error.SpellNotFound"));
}
