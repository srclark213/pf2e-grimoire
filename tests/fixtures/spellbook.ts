import { extractFacets } from "../../src/spellbook/facets.ts";
import type { ActorSnapshot, EntrySnapshot, SlotRankSnapshot, SpellSnapshot } from "../../src/spellbook/model.ts";

/** Builders for snapshots shaped like what the adapter reads off a pf2e actor. */

export function spell(name: string, overrides: Partial<SpellSnapshot> = {}): SpellSnapshot {
    const slug = name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
    const baseRank = overrides.baseRank ?? 1;
    return {
        id: overrides.id ?? `${slug}-id`,
        uuid: `Actor.a1.Item.${overrides.id ?? `${slug}-id`}`,
        name,
        img: "icons/svg/book.svg",
        slug,
        baseRank,
        rank: baseRank,
        isCantrip: false,
        isFocus: false,
        signature: false,
        uses: null,
        facets: extractFacets({}),
        tags: [],
        ...overrides,
    };
}

export function cantrip(name: string, overrides: Partial<SpellSnapshot> = {}): SpellSnapshot {
    return spell(name, { baseRank: 1, rank: 3, isCantrip: true, ...overrides });
}

/** Slots by rank: `{ 1: { max: 3, value: 2 } }`. Unlisted ranks have no slots. */
export function slots(byRank: Record<number, Partial<SlotRankSnapshot>> = {}): SlotRankSnapshot[] {
    return Array.from({ length: 11 }, (_, rank) => ({ value: 0, max: 0, prepared: [], ...byRank[rank] }));
}

export function entry(
    name: string,
    category: EntrySnapshot["category"],
    spells: SpellSnapshot[],
    overrides: Partial<EntrySnapshot> = {},
): EntrySnapshot {
    return {
        id: `${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-entry`,
        name,
        category,
        isFlexible: false,
        sort: 0,
        slots: slots(),
        spells,
        ...overrides,
    };
}

export function actor(entries: EntrySnapshot[], overrides: Partial<ActorSnapshot> = {}): ActorSnapshot {
    return { level: 5, focus: null, entries, ...overrides };
}
