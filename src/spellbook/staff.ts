/**
 * Staff spell lists. A pf2e staff is a weapon whose spells exist only as links in its description:
 *
 *   <li><strong>Cantrip</strong> @UUID[Compendium.pf2e.spells-srd.Item.Ignition]</li>
 *   <li><strong>2nd</strong> @UUID[…Breathe Fire], @UUID[…Floating Flame]</li>
 *
 * All 176 staves in pf2e 8.7.0 use this shape ("Cantrip" or "Cantrips", then "1st" … "10th"). Packs ship
 * name-form links (`Item.Fireball`); a built world has id-form links (`Item.sxQZ6yqTn0czJxVd{Fireball}`).
 */

/** One spell on a staff */
export interface StaffSpellRef {
    uuid: string;
    /** The link's label if it has one, otherwise the last part of a name-form uuid */
    name: string;
}

/** Spells by the rank the staff casts them at. Rank 0 holds the cantrips. */
export type StaffSpellList = Record<number, StaffSpellRef[]>;

const RANK_LABEL = String.raw`Cantrips?|(\d{1,2})(?:st|nd|rd|th)(?:\s+Rank)?`;
const TOKEN = new RegExp(
    [
        // A rank label in bold
        String.raw`<strong>\s*(?<label>${RANK_LABEL})\s*</strong>`,
        // A spell link, with an optional {label}
        String.raw`@UUID\[(?<uuid>[^\]]+)\](?:\{(?<name>[^}]*)\})?`,
        // The end of a list item or paragraph closes the current rank
        String.raw`(?<end></li>|</p>)`,
    ].join("|"),
    "gi",
);

/**
 * Reads a staff's spells from its description HTML. Links outside a rank label's list item or paragraph
 * (for example "functions as a Staff of Fire") are ignored. Duplicate links within a rank are dropped.
 */
export function parseStaffSpells(html: string): StaffSpellList {
    const list: StaffSpellList = {};
    let rank: number | null = null;

    for (const match of html.matchAll(TOKEN)) {
        const groups = match.groups ?? {};
        if (groups["label"] !== undefined) {
            const digits = /\d+/.exec(groups["label"]);
            rank = digits ? Number(digits[0]) : 0;
        } else if (groups["end"] !== undefined) {
            rank = null;
        } else if (groups["uuid"] !== undefined && rank !== null && rank <= 10) {
            const uuid = groups["uuid"].trim();
            if (!uuid.includes(".Item.")) continue;
            const spells = (list[rank] ??= []);
            if (spells.some((s) => s.uuid === uuid)) continue;
            spells.push({ uuid, name: groups["name"]?.trim() || uuid.slice(uuid.lastIndexOf(".") + 1) });
        }
    }
    return list;
}

/** True if the list has no spells at all */
export function isEmptyStaffList(list: StaffSpellList): boolean {
    return Object.values(list).every((spells) => spells.length === 0);
}

/** Every (rank, spell) pair in rank order, for display and casting */
export function staffEntries(list: StaffSpellList): { rank: number; spell: StaffSpellRef }[] {
    return Object.keys(list)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((rank) => (list[rank] ?? []).map((spell) => ({ rank, spell })));
}

/**
 * What the Grimoire keeps on a staff item, under `flags["pf2e-grimoire"].staff`.
 * Staff rules (GM Core p. 289, see PF2e Rules Notes): preparing sets charges to the preparer's highest spell
 * slot rank, replacing any left; one staff per person per day and one preparer per staff; a spell costs
 * charges equal to its rank, a cantrip costs none.
 */
export interface StaffData {
    spells: StaffSpellList;
    /** The player edited the list, so the description is no longer re-read */
    manual: boolean;
    charges: { value: number; max: number };
    /** Actor id of today's preparer, or null if nobody prepared it since their last rest */
    preparedBy: string | null;
    /** World time of the last preparation */
    preparedOn: number | null;
}

export const EMPTY_CHARGES = { value: 0, max: 0 } as const;

function toCount(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readSpellList(value: unknown): StaffSpellList {
    const list: StaffSpellList = {};
    if (!value || typeof value !== "object") return list;
    for (const [key, spells] of Object.entries(value)) {
        const rank = Number(key);
        if (!Number.isInteger(rank) || rank < 0 || rank > 10 || !Array.isArray(spells)) continue;
        const refs = spells.filter(
            (s): s is StaffSpellRef => typeof s?.uuid === "string" && typeof s?.name === "string",
        );
        if (refs.length > 0) list[rank] = refs.map(({ uuid, name }) => ({ uuid, name }));
    }
    return list;
}

/**
 * Reads a staff's Grimoire data. Unless the player edited the list by hand, the spells come from the
 * description every time, so a corrected description is picked up without any action.
 */
export function readStaffData(flag: unknown, descriptionHtml: string): StaffData {
    const raw = (flag && typeof flag === "object" ? flag : {}) as Record<string, unknown>;
    const manual = raw["manual"] === true;
    const charges = (raw["charges"] ?? {}) as Record<string, unknown>;
    return {
        spells: manual ? readSpellList(raw["spells"]) : parseStaffSpells(descriptionHtml),
        manual,
        charges: { value: toCount(charges["value"]), max: toCount(charges["max"]) },
        preparedBy: typeof raw["preparedBy"] === "string" ? raw["preparedBy"] : null,
        preparedOn: typeof raw["preparedOn"] === "number" ? raw["preparedOn"] : null,
    };
}

/** Preparing a staff: charges equal the preparer's highest slot rank, replacing whatever was left. */
export function prepareStaff(data: StaffData, actorId: string, highestSlotRank: number, now: number): StaffData {
    return {
        ...data,
        charges: { value: highestSlotRank, max: highestSlotRank },
        preparedBy: actorId,
        preparedOn: now,
    };
}

/** A staff someone else prepared, or this character prepared on an earlier day, loses its charges. */
export function unprepareStaff(data: StaffData): StaffData {
    return { ...data, charges: { ...EMPTY_CHARGES }, preparedBy: null, preparedOn: null };
}

/** Charges a staff spell costs: its rank, or nothing for a cantrip */
export function staffCost(rank: number): number {
    return Math.max(0, rank);
}

/** Spends charges, never below zero */
export function spendCharges(data: StaffData, amount: number): StaffData {
    return { ...data, charges: { ...data.charges, value: Math.max(0, data.charges.value - amount) } };
}

/** Adds charges (the prepared caster's slot boost raises the maximum too) */
export function addCharges(data: StaffData, amount: number): StaffData {
    return {
        ...data,
        charges: { value: data.charges.value + amount, max: data.charges.max + amount },
    };
}

/**
 * Which staves Rest for the Night prepares: none if the character has no spell slots, the only one if
 * exactly one is carried, otherwise the player is asked.
 */
export type RestPreparation = { type: "none" } | { type: "auto"; staffId: string } | { type: "ask"; staffIds: string[] };

export function restPreparation(staffIds: readonly string[], highestSlotRank: number): RestPreparation {
    if (highestSlotRank <= 0 || staffIds.length === 0) return { type: "none" };
    if (staffIds.length === 1) return { type: "auto", staffId: staffIds[0]! };
    return { type: "ask", staffIds: [...staffIds] };
}
