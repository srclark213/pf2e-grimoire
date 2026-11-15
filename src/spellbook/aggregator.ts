import type {
    ActorSnapshot,
    CastOption,
    EntrySnapshot,
    RankGroup,
    SourceKind,
    SpellRow,
    SpellSnapshot,
} from "./model.ts";

const MAX_RANK = 10;

/**
 * Turns every spell in every non-ritual spellcasting entry into one row per distinct spell.
 * Each row lists the entries that have the spell and every way it can be cast right now.
 */
export function aggregateSpells(actor: ActorSnapshot): SpellRow[] {
    const rows = new Map<string, SpellRow>();
    /** Base ranks of the merged spells that don't auto-heighten, per row */
    const fixedRanks = new Map<string, number[]>();
    const entries = [...actor.entries].sort((a, b) => a.sort - b.sort);

    for (const entry of entries) {
        const kind: SourceKind = entry.category;
        for (const spell of entry.spells) {
            const row = getOrCreateRow(rows, spell);
            if (!row.spellIds.includes(spell.id)) row.spellIds.push(spell.id);
            if (!row.sources.some((s) => s.entryId === entry.id)) {
                row.sources.push({ entryId: entry.id, entryName: entry.name, kind, available: false });
            }
            row.isFocus ||= spell.isFocus;
            if (!autoHeightens(spell)) {
                fixedRanks.set(row.key, [...(fixedRanks.get(row.key) ?? []), spell.baseRank]);
            }
            row.castOptions.push(...castOptionsFor(actor, entry, spell));
        }
    }

    const result = [...rows.values()];
    for (const row of result) {
        // Cantrips and focus spells auto-heighten, so they group together as rank 0. A spell that is
        // also known as a regular spell somewhere keeps that spell's base rank.
        const ranks = fixedRanks.get(row.key);
        row.baseRank = ranks ? Math.min(...ranks) : 0;
        row.castOptions.sort((a, b) => a.rank - b.rank);
        row.available = row.castOptions.some((o) => o.available);
        for (const source of row.sources) {
            source.available = row.castOptions.some((o) => o.entryId === source.entryId && o.available);
        }
    }
    return result.sort((a, b) => a.baseRank - b.baseRank || a.name.localeCompare(b.name));
}

/** Groups rows by base rank, cantrips and focus spells (rank 0) first. Empty ranks are left out. */
export function groupByRank(rows: SpellRow[]): RankGroup[] {
    const groups = new Map<number, SpellRow[]>();
    for (const row of rows) {
        const list = groups.get(row.baseRank) ?? [];
        list.push(row);
        groups.set(row.baseRank, list);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([rank, list]) => ({ rank, rows: list.sort((a, b) => a.name.localeCompare(b.name)) }));
}

function getOrCreateRow(rows: Map<string, SpellRow>, spell: SpellSnapshot): SpellRow {
    const key = spell.slug;
    const existing = rows.get(key);
    if (existing) return existing;

    const row: SpellRow = {
        key,
        name: spell.name,
        img: spell.img,
        baseRank: 0,
        isCantrip: spell.isCantrip,
        isFocus: spell.isFocus,
        spellIds: [],
        sources: [],
        castOptions: [],
        available: false,
    };
    rows.set(key, row);
    return row;
}

/** Cantrips and focus spells are cast at half the character's level rather than from a slot rank. */
function autoHeightens(spell: SpellSnapshot): boolean {
    return spell.isCantrip || spell.isFocus;
}

function castOptionsFor(actor: ActorSnapshot, entry: EntrySnapshot, spell: SpellSnapshot): CastOption[] {
    const base = { kind: entry.category, entryId: entry.id, entryName: entry.name, spellId: spell.id } as const;

    switch (entry.category) {
        case "focus": {
            // Focus cantrips are free; other focus spells need a focus point. Both auto-heighten.
            const available = spell.isCantrip || (actor.focus?.value ?? 0) > 0;
            return [{ ...base, rank: spell.rank, available }];
        }
        case "innate": {
            // Matches pf2e's sheet: an innate spell is expended when it has no uses left.
            const available = spell.isCantrip || (spell.uses?.value ?? 0) > 0;
            return [{ ...base, rank: spell.rank, available }];
        }
        case "spontaneous":
            if (spell.isCantrip) return [{ ...base, rank: spell.rank, available: true }];
            if (spell.signature) return signatureOptions(entry, spell, base);
            return [{ ...base, rank: spell.rank, available: slotsLeft(entry, spell.rank) }];
        case "prepared":
            // Flexible casters cast their signature (collection) spells from shared slots, like spontaneous casters.
            // Their cantrips are prepared normally.
            if (entry.isFlexible && !spell.isCantrip) {
                return spell.signature ? signatureOptions(entry, spell, base) : [];
            }
            return preparedOptions(entry, spell, base);
    }
}

type OptionBase = Pick<CastOption, "kind" | "entryId" | "entryName" | "spellId">;

/** A prepared spell can be cast once per slot it occupies, at that slot's rank. */
function preparedOptions(entry: EntrySnapshot, spell: SpellSnapshot, base: OptionBase): CastOption[] {
    const options: CastOption[] = [];
    entry.slots.forEach((slotRank, rank) => {
        slotRank.prepared.forEach((slot, slotIndex) => {
            if (slot.id !== spell.id) return;
            if (rank === 0) {
                options.push({ ...base, rank: spell.rank, slotIndex, available: true });
            } else {
                options.push({ ...base, rank, slotIndex, available: !slot.expended });
            }
        });
    });
    return options;
}

/** A signature spell can be cast from any slot rank at or above its base rank that the entry has slots in. */
function signatureOptions(entry: EntrySnapshot, spell: SpellSnapshot, base: OptionBase): CastOption[] {
    const options: CastOption[] = [];
    for (let rank = Math.max(1, spell.baseRank); rank <= MAX_RANK; rank++) {
        if ((entry.slots[rank]?.max ?? 0) > 0) {
            options.push({ ...base, rank, available: slotsLeft(entry, rank) });
        }
    }
    return options;
}

function slotsLeft(entry: EntrySnapshot, rank: number): boolean {
    return (entry.slots[rank]?.value ?? 0) > 0;
}
