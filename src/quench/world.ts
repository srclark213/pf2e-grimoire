import type { CharacterPF2e } from "@actor";
import type { ItemPF2e, SpellcastingEntryPF2e } from "@item";
import { castOption } from "../foundry/cast.ts";
import { loadStaffSpells } from "../foundry/staves.ts";
import { snapshotActor } from "../foundry/snapshot.ts";
import { aggregateSpells } from "../spellbook/aggregator.ts";
import type { CastOption, SpellRow } from "../spellbook/model.ts";
import { rankButtons } from "../spellbook/rank-buttons.ts";

/**
 * Throwaway characters and items for the in-world tests, built from pf2e's own compendiums so the tests see
 * the data a real world has (condition links by id, inline damage, embedded scroll spells...).
 */

const PREFIX = "Grimoire Test";

/** A spell's source data from pf2e's compendium, by name */
export async function compendiumSpell(name: string): Promise<Record<string, any>> {
    return (await compendiumDoc("pf2e.spells-srd", name)).toObject() as Record<string, any>;
}

export async function compendiumDoc(packId: string, name: string): Promise<ItemPF2e> {
    const pack = game.packs.get(packId);
    if (!pack) throw new Error(`No compendium ${packId}`);
    const index = await pack.getIndex();
    const entry = index.find((e) => e.name === name);
    if (!entry) throw new Error(`No "${name}" in ${packId}`);
    return (await pack.getDocument(entry._id!)) as unknown as ItemPF2e;
}

export class TestWorld {
    readonly actors: CharacterPF2e[] = [];
    readonly #started = Date.now();

    async character(name: string): Promise<CharacterPF2e> {
        const actor = (await Actor.create({ name: `${PREFIX}: ${name}`, type: "character" })) as unknown as CharacterPF2e;
        this.actors.push(actor);
        return actor;
    }

    /** Deletes the test characters and the chat cards they posted */
    async cleanUp(): Promise<void> {
        const ids = new Set(this.actors.map((a) => a.id));
        const messages = game.messages.contents.filter(
            (m) => m.timestamp >= this.#started && !!m.speaker.actor && ids.has(m.speaker.actor),
        );
        if (messages.length > 0) await ChatMessage.deleteDocuments(messages.map((m) => m.id));
        for (const actor of this.actors) await actor.delete();
        this.actors.length = 0;
    }
}

type Preparation = "prepared" | "spontaneous" | "innate" | "focus";

export async function addEntry(
    actor: CharacterPF2e,
    name: string,
    prepared: Preparation,
    options: { tradition?: string; slots?: Record<number, { max: number; value?: number }> } = {},
): Promise<SpellcastingEntryPF2e<CharacterPF2e>> {
    const slots: Record<string, unknown> = {};
    for (const [rank, slot] of Object.entries(options.slots ?? {})) {
        slots[`slot${rank}`] = { max: slot.max, value: slot.value ?? slot.max, prepared: [] };
    }
    const [entry] = await actor.createEmbeddedDocuments("Item", [
        {
            name,
            type: "spellcastingEntry",
            system: {
                prepared: { value: prepared },
                tradition: { value: options.tradition ?? "arcane" },
                ability: { value: "int" },
                slots,
            },
        } as never,
    ]);
    return entry as unknown as SpellcastingEntryPF2e<CharacterPF2e>;
}

export async function addSpell(
    actor: CharacterPF2e,
    entry: SpellcastingEntryPF2e<CharacterPF2e>,
    name: string,
    location: Record<string, unknown> = {},
): Promise<ItemPF2e<CharacterPF2e>> {
    const source = await compendiumSpell(name);
    source.system.location = { ...source.system.location, value: entry.id, ...location };
    const [spell] = await actor.createEmbeddedDocuments("Item", [source as never]);
    return spell as unknown as ItemPF2e<CharacterPF2e>;
}

/** Puts a spell in the next prepared slot of a rank */
export async function prepareInSlot(
    entry: SpellcastingEntryPF2e<CharacterPF2e>,
    spellId: string,
    rank: number,
): Promise<void> {
    const key = `slot${rank as 1}` as const;
    const prepared = [...(entry.system.slots[key]?.prepared ?? []), { id: spellId, expended: false }];
    await entry.update({ [`system.slots.${key}.prepared`]: prepared, [`system.slots.${key}.max`]: prepared.length });
}

/** A scroll or wand holding a compendium spell, the way pf2e's own item creator builds one */
export async function addSpellConsumable(
    actor: CharacterPF2e,
    type: "scroll" | "wand",
    spellName: string,
    rank: number,
): Promise<ItemPF2e<CharacterPF2e>> {
    const spell = await compendiumSpell(spellName);
    const uuid = (CONFIG.PF2E.spellcastingItems as Record<string, { compendiumUuids: Record<number, string> }>)[type]
        ?.compendiumUuids[rank];
    const base = uuid ? ((await fromUuid(uuid)) as unknown as ItemPF2e | null) : null;
    if (!base) throw new Error(`No ${type} base item for rank ${rank}`);
    const source = base.toObject() as Record<string, any>;
    delete source._id;
    source.name = `${type} of ${spellName} (Rank ${rank})`;
    source.system.spell = foundry.utils.mergeObject(
        spell,
        { _id: foundry.utils.randomID(), system: { location: { value: null, heightenedLevel: rank } } },
        { inplace: false },
    );
    const [item] = await actor.createEmbeddedDocuments("Item", [source as never]);
    return item as unknown as ItemPF2e<CharacterPF2e>;
}

/** A staff from pf2e's equipment compendium, held in both hands */
export async function addStaff(actor: CharacterPF2e, name: string): Promise<ItemPF2e<CharacterPF2e>> {
    const source = (await compendiumDoc("pf2e.equipment-srd", name)).toObject() as Record<string, any>;
    source.system.equipped = { carryType: "held", handsHeld: 2 };
    const [staff] = await actor.createEmbeddedDocuments("Item", [source as never]);
    return staff as unknown as ItemPF2e<CharacterPF2e>;
}

/** The Grimoire's row for a spell, built exactly as the window builds it */
export async function rowFor(actor: CharacterPF2e, name: string): Promise<SpellRow | undefined> {
    await loadStaffSpells(actor);
    return aggregateSpells(snapshotActor(actor)).find((r) => r.name === name);
}

/** Clicks the spell's rank button, as the window does */
export async function clickRank(actor: CharacterPF2e, name: string, rank: number): Promise<CastOption> {
    const row = await rowFor(actor, name);
    if (!row) throw new Error(`No row for ${name}`);
    const button = rankButtons(row).find((b) => b.rank === rank);
    if (!button) throw new Error(`No rank ${rank} button for ${name}`);
    if (!button.available) throw new Error(`The rank ${rank} button for ${name} isn't available`);
    await castOption(actor, button.option);
    return button.option;
}

/** Waits for something a hook does without awaiting (Rest for the Night's follow-up updates) */
export async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (!check()) {
        if (Date.now() > end) throw new Error("Timed out waiting");
        await new Promise((r) => setTimeout(r, 50));
    }
}

/** Runs something with a function temporarily replaced (dialogs, dice) */
export async function withStub<T extends object, K extends keyof T>(
    target: T,
    key: K,
    replacement: T[K],
    run: () => Promise<void>,
): Promise<void> {
    const original = target[key];
    target[key] = replacement;
    try {
        await run();
    } finally {
        target[key] = original;
    }
}
