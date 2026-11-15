import { staffEntries, type StaffSpellList } from "./staff.ts";

/**
 * One-time import from the PF2e Staves module, which the Grimoire replaces (decided 2026-11-15).
 * PF2e Staves turns each staff into a spellcasting entry of type "charge", with real spell items in it and
 * `flags["pf2e-staves"] = { staveID, charges }`. `staveID` can be stale: it may be the id of the item the
 * staff was copied from, which then only survives in the staff's `sourceId`.
 */

/** A PF2e Staves spellcasting entry, read off the actor */
export interface LegacyStaffEntry {
    entryId: string;
    name: string;
    staveID: string | null;
    charges: number;
    spells: LegacyStaffSpell[];
}

export interface LegacyStaffSpell {
    /** The spell item's id, so it can be deleted with the entry */
    id: string;
    name: string;
    /** The compendium spell it came from, or null if it has none */
    uuid: string | null;
    /** The rank it sits at in the staff list: 0 for cantrips, else its heightened rank */
    rank: number;
}

/** A staff item the character has */
export interface StaffItemRef {
    id: string;
    name: string;
    sourceId: string | null;
}

/** Finds the staff a PF2e Staves entry belongs to: by id, then by copied-from id, then by name. */
export function matchStaff(entry: LegacyStaffEntry, staves: readonly StaffItemRef[]): StaffItemRef | null {
    const id = entry.staveID;
    if (id) {
        const direct = staves.find((s) => s.id === id);
        if (direct) return direct;
        const copied = staves.find((s) => s.sourceId === id || s.sourceId?.endsWith(`.Item.${id}`));
        if (copied) return copied;
    }
    const named = staves.filter((s) => s.name === entry.name);
    return named.length === 1 ? named[0]! : null;
}

/** The entry's spells as a staff list. Spells without a compendium source can't be cast later and are dropped. */
export function spellListFromEntry(entry: LegacyStaffEntry): StaffSpellList {
    const list: StaffSpellList = {};
    for (const spell of [...entry.spells].sort((a, b) => a.rank - b.rank)) {
        if (!spell.uuid) continue;
        const atRank = (list[spell.rank] ??= []);
        if (!atRank.some((s) => s.uuid === spell.uuid)) atRank.push({ uuid: spell.uuid, name: spell.name });
    }
    return list;
}

/** True if two lists have the same spells at the same ranks, ignoring order and names */
export function sameSpellList(a: StaffSpellList, b: StaffSpellList): boolean {
    const key = (list: StaffSpellList) =>
        staffEntries(list)
            .map((e) => `${e.rank}:${e.spell.uuid}`)
            .sort()
            .join("|");
    return key(a) === key(b);
}

export interface StaffImport {
    entry: LegacyStaffEntry;
    staff: StaffItemRef;
    spells: StaffSpellList;
    /** The list differs from what the description says, so it is kept as a hand edit */
    manual: boolean;
    charges: number;
}

export interface ImportPlan {
    imports: StaffImport[];
    /** Entries whose staff can't be found: left in place */
    unmatched: LegacyStaffEntry[];
}

/**
 * Works out what importing does. `describedSpells` is what the Grimoire would read from each staff's
 * description; when PF2e Staves had the same list, the staff keeps following its description.
 */
export function planImport(
    entries: readonly LegacyStaffEntry[],
    staves: readonly StaffItemRef[],
    describedSpells: (staffId: string) => StaffSpellList,
): ImportPlan {
    const plan: ImportPlan = { imports: [], unmatched: [] };
    for (const entry of entries) {
        const staff = matchStaff(entry, staves);
        if (!staff) {
            plan.unmatched.push(entry);
            continue;
        }
        const spells = spellListFromEntry(entry);
        plan.imports.push({
            entry,
            staff,
            spells,
            manual: !sameSpellList(spells, describedSpells(staff.id)),
            charges: Math.max(0, Math.floor(entry.charges)),
        });
    }
    return plan;
}
