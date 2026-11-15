import type { CharacterPF2e } from "@actor";
import type { SpellPF2e } from "@item";
import { extractFacets, type SpellSystemSource } from "../spellbook/facets.ts";
import type { ActorSnapshot, EntryCategory, EntrySnapshot, SlotRankSnapshot, SpellSnapshot } from "../spellbook/model.ts";

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
        level: actor.level,
        focus: focus ? { value: focus.value, max: focus.max } : null,
        entries,
    };
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
    };
}
