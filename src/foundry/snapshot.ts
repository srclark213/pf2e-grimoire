import type { CharacterPF2e } from "@actor";
import type { SpellPF2e } from "@item";
import { MODULE_ID } from "../constants.ts";
import { readWandState } from "../spellbook/overcharge.ts";
import { highestSlotRank, snapshotStaves } from "./staves.ts";
import { extractFacets, type SpellSystemSource } from "../spellbook/facets.ts";
import { readTags } from "../spellbook/tags.ts";
import type {
    ActorSnapshot,
    ConsumableSnapshot,
    EntryCategory,
    EntrySnapshot,
    SlotRankSnapshot,
    SpellSnapshot,
} from "../spellbook/model.ts";

const CATEGORIES: readonly EntryCategory[] = ["prepared", "spontaneous", "innate", "focus"];

/** Reads the parts of a pf2e character the spellbook logic needs into plain data. */
export function snapshotActor(actor: CharacterPF2e): ActorSnapshot {
    const entries: EntrySnapshot[] = [];
    for (const entry of actor.spellcasting.regular) {
        const category = entry.category as EntryCategory;
        if (!CATEGORIES.includes(category) || !entry.spells) continue;

        const slots: SlotRankSnapshot[] = [];
        for (let rank = 0; rank <= 10; rank++) {
            const slot = entry.system.slots[`slot${rank as 0}`];
            slots.push({
                value: slot?.value ?? 0,
                max: slot?.max ?? 0,
                prepared: (slot?.prepared ?? []).map((p) => ({ id: p.id ?? null, expended: !!p.expended })),
            });
        }

        entries.push({
            id: entry.id,
            name: entry.name,
            category,
            isFlexible: entry.isFlexible,
            sort: entry.sort,
            slots,
            spells: entry.spells.contents.filter((s) => !s.isRitual).map(snapshotSpell),
        });
    }

    const focus = actor.system.resources.focus;
    return {
        id: actor.id,
        level: actor.level,
        highestSlotRank: highestSlotRank(actor),
        focus: focus ? { value: focus.value, max: focus.max } : null,
        entries,
        consumables: snapshotConsumables(actor),
        staves: snapshotStaves(actor, snapshotSpell),
    };
}

/** Identified wands and scrolls that hold a spell. Unidentified ones would give the spell away. */
function snapshotConsumables(actor: CharacterPF2e): ConsumableSnapshot[] {
    const trickMagicItem = actor.itemTypes.feat.some((feat) => feat.slug === "trick-magic-item");
    const result: ConsumableSnapshot[] = [];
    for (const item of actor.itemTypes.consumable) {
        const category = item.category;
        if (category !== "wand" && category !== "scroll") continue;
        const spell = item.embeddedSpell;
        if (!spell || !item.isIdentified) continue;
        const natively = actor.spellcasting.canCastConsumable(item);
        result.push({
            id: item.id,
            name: item.name,
            category,
            spell: snapshotSpell(spell),
            uses: { value: item.uses.value, max: item.uses.max },
            quantity: item.quantity,
            castable: natively || trickMagicItem,
            viaTrickMagicItem: !natively && trickMagicItem,
            ...readWandState(category === "wand" ? item.flags[MODULE_ID] : null),
        });
    }
    return result;
}

function snapshotSpell(spell: SpellPF2e): SpellSnapshot {
    const uses = spell.system.location.uses;
    return {
        id: spell.id,
        uuid: spell.uuid,
        name: spell.name,
        img: spell.img,
        slug: spell.slug ?? spell.name.slugify(),
        baseRank: spell.baseRank,
        rank: spell.rank,
        isCantrip: spell.isCantrip,
        isFocus: spell.isFocusSpell,
        signature: !!spell.system.location.signature,
        uses: uses ? { value: uses.value ?? 0, max: uses.max ?? 0 } : null,
        facets: extractFacets(spell.system as unknown as SpellSystemSource),
        tags: readTags(spell.getFlag(MODULE_ID, "tags")),
    };
}
