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
