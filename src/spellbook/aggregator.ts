import { isAutoPickable } from "./cast-resolver.ts";
import { categorize } from "./categories.ts";
import { canOvercharge } from "./overcharge.ts";
import { uniqueTags } from "./tags.ts";
import type {
    ActorSnapshot,
    CastOption,
    ConsumableSnapshot,
    EntrySnapshot,
    RankGroup,
    SourceKind,
    SpellRow,
    SpellSnapshot,
    UnavailableReason,
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
            row.tags = uniqueTags([...row.tags, ...spell.tags]);
            if (!autoHeightens(spell)) {
                fixedRanks.set(row.key, [...(fixedRanks.get(row.key) ?? []), spell.baseRank]);
            }
            row.castOptions.push(...castOptionsFor(actor, entry, spell));
        }
    }

    // Wands and scrolls join the row of the spell they hold, as sources of their own.
    for (const item of actor.consumables) {
        const row = getOrCreateRow(rows, item.spell);
        row.sources.push({ entryId: item.id, entryName: item.name, kind: item.category, available: false });
        if (!autoHeightens(item.spell)) {
            fixedRanks.set(row.key, [...(fixedRanks.get(row.key) ?? []), item.spell.baseRank]);
        }
        row.castOptions.push(...consumableOptions(item));
    }

    const result = [...rows.values()];
    for (const row of result) {
        // Cantrips and focus spells auto-heighten, so they group together as rank 0. A spell that is
        // also known as a regular spell somewhere keeps that spell's base rank.
        const ranks = fixedRanks.get(row.key);
        row.baseRank = ranks ? Math.min(...ranks) : 0;
        row.castOptions.sort((a, b) => a.rank - b.rank);
        // Overcharging is a last resort, so it doesn't make a row or badge look ready to cast.
        const ready = row.castOptions.filter((o) => o.available && isAutoPickable(o));
        row.available = ready.length > 0;
        for (const source of row.sources) {
            source.available = ready.some((o) => o.entryId === source.entryId);
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
        facets: spell.facets,
        categories: categorize(spell.facets),
        tags: [],
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
    const free = { ...base, rank: spell.rank, available: true, cost: { type: "free" } } as const;

    switch (entry.category) {
        case "focus": {
            // Focus cantrips are free; other focus spells need a focus point. Both auto-heighten.
            if (spell.isCantrip) return [free];
            const points = actor.focus?.value ?? 0;
            return [
                withReason(
                    { ...base, rank: spell.rank, available: points > 0, cost: { type: "focus", value: points } },
                    "no-focus",
                ),
            ];
        }
        case "innate": {
            // Matches pf2e's sheet: an innate spell is expended when it has no uses left.
            if (spell.isCantrip) return [free];
            const uses = spell.uses ?? { value: 0, max: 0 };
            return [
                withReason(
                    { ...base, rank: spell.rank, available: uses.value > 0, cost: { type: "innate", ...uses } },
                    "no-uses",
                ),
            ];
        }
        case "spontaneous":
            if (spell.isCantrip) return [free];
            if (spell.signature) return signatureOptions(entry, spell, base);
            return [slotOption(entry, spell.rank, base)];
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

function withReason(option: CastOption, reason: UnavailableReason): CastOption {
    return option.available ? option : { ...option, reason };
}

/** A prepared spell can be cast once per slot it occupies, at that slot's rank. */
function preparedOptions(entry: EntrySnapshot, spell: SpellSnapshot, base: OptionBase): CastOption[] {
    const options: CastOption[] = [];
    entry.slots.forEach((slotRank, rank) => {
        slotRank.prepared.forEach((slot, slotIndex) => {
            if (slot.id !== spell.id) return;
            if (rank === 0) {
                options.push({ ...base, rank: spell.rank, slotIndex, available: true, cost: { type: "free" } });
            } else {
                const option: CastOption = {
                    ...base,
                    rank,
                    slotIndex,
                    available: !slot.expended,
                    cost: { type: "prepared-slot" },
                };
                options.push(withReason(option, "expended"));
            }
        });
    });
    return options;
}

/** A signature spell can be cast from any slot rank at or above its base rank that the entry has slots in. */
function signatureOptions(entry: EntrySnapshot, spell: SpellSnapshot, base: OptionBase): CastOption[] {
    const options: CastOption[] = [];
    for (let rank = Math.max(1, spell.baseRank); rank <= MAX_RANK; rank++) {
        if ((entry.slots[rank]?.max ?? 0) > 0) options.push(slotOption(entry, rank, base));
    }
    return options;
}

/**
 * A wand casts its spell once a day; a scroll casts it once and is used up. Both cast at the item's rank.
 * Once a wand's use is spent, it also offers an overcharge, which only the right-click menu casts.
 */
function consumableOptions(item: ConsumableSnapshot): CastOption[] {
    const base = { entryId: item.id, entryName: item.name, spellId: item.id, rank: item.spell.rank } as const;
    if (item.category === "scroll") {
        const option: CastOption = {
            ...base,
            kind: "scroll",
            available: item.castable,
            cost: { type: "scroll", quantity: item.quantity },
        };
        return [withReason(option, "cannot-cast")];
    }
    const reason: UnavailableReason | undefined = item.broken
        ? "broken"
        : !item.castable
          ? "cannot-cast"
          : item.uses.value > 0
            ? undefined
            : "no-uses";
    const option: CastOption = {
        ...base,
        kind: "wand",
        available: !reason,
        cost: { type: "wand", ...item.uses },
    };
    const options: CastOption[] = [reason ? { ...option, reason } : option];
    if (item.castable && !item.viaTrickMagicItem && canOvercharge(item, item.uses.value)) {
        options.push({
            ...base,
            kind: "wand-overcharge",
            available: true,
            cost: { type: "overcharge", destroys: item.overchargedToday },
        });
    }
    return options;
}

/** Casting from a spontaneous (or flexible) caster's shared slots at a rank */
function slotOption(entry: EntrySnapshot, rank: number, base: OptionBase): CastOption {
    const value = entry.slots[rank]?.value ?? 0;
    const max = entry.slots[rank]?.max ?? 0;
    return withReason({ ...base, rank, available: value > 0, cost: { type: "slot", value, max } }, "no-slots");
}
