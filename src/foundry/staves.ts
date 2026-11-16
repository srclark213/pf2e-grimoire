import type { CharacterPF2e } from "@actor";
import type { ItemPF2e, SpellcastingEntryPF2e, SpellPF2e, WeaponPF2e } from "@item";
import { MODULE_ID } from "../constants.ts";
import type { SpellSnapshot, StaffSnapshot, StaffSpellSnapshot } from "../spellbook/model.ts";
import {
    addCharges,
    prepareStaff,
    type BoostSlot,
    readStaffData,
    restPreparation,
    spendCharges,
    staffCost,
    staffEntries,
    unprepareStaff,
    type StaffData,
} from "../spellbook/staff.ts";

const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

const STAFF_FLAG = `flags.${MODULE_ID}.staff`;
/** Actor flag: world time of today's staff slot boost. Rest clears it. */
const BOOST_FLAG = "staffBoostUsedOn";

/** Whether the character already expended a slot into a staff since their last rest */
export function boostUsedToday(actor: CharacterPF2e): boolean {
    return typeof actor.getFlag(MODULE_ID, BOOST_FLAG) === "number";
}

/**
 * The prepared caster's once-a-day staff boost: asks which slot to expend, expends it, and adds charges
 * equal to its rank to the staff (raising the day's maximum too).
 */
export async function boostStaff(actor: CharacterPF2e, staffId: string, slots: readonly BoostSlot[]): Promise<void> {
    const staff = carriedStaves(actor).find((s) => s.id === staffId);
    if (!staff || slots.length === 0 || boostUsedToday(actor)) return;
    const data = readStaff(staff);
    if (data.preparedBy !== actor.id) return;

    const options = slots
        .map((slot, i) => {
            const label = t(slot.spellName ? "Boost.SlotWithSpell" : "Boost.Slot", {
                rank: slot.rank,
                spell: slot.spellName ?? "",
                entry: slot.entryName,
            });
            return `<label><input type="radio" name="slot" value="${i}"${i === 0 ? " checked" : ""}> ${label}</label>`;
        })
        .join("<br>");
    const chosen: unknown = await foundry.applications.api.DialogV2.prompt({
        window: { title: t("Boost.Title") },
        content: `<p>${t("Boost.Hint", { staff: staff.name })}</p><p>${options}</p>`,
        ok: {
            label: t("Boost.Confirm"),
            callback: (_event: unknown, button: HTMLButtonElement) =>
                (button.form?.elements.namedItem("slot") as RadioNodeList | null)?.value ?? "",
        },
        rejectClose: false,
    });
    const slot = typeof chosen === "string" && chosen !== "" ? slots[Number(chosen)] : undefined;
    if (!slot) return;

    const entry = actor.items.get(slot.entryId);
    if (!entry?.isOfType("spellcastingEntry")) return;
    if (slot.slotIndex !== null) {
        await entry.setSlotExpendedState(slot.rank as 1, slot.slotIndex, true);
    } else {
        const key = `slot${slot.rank as 1}` as const;
        const left = entry.system.slots[key]?.value ?? 0;
        if (left <= 0) return;
        await entry.update({ [`system.slots.${key}.value`]: left - 1 });
    }
    await writeStaff(staff, addCharges(readStaff(staff), slot.rank));
    await actor.setFlag(MODULE_ID, BOOST_FLAG, game.time.worldTime);
    ui.notifications.info(t("Boost.Done", { staff: staff.name, charges: slot.rank }));
}

/** A weapon with the staff trait */
export function isStaff(item: unknown): item is WeaponPF2e<CharacterPF2e> {
    const doc = item as WeaponPF2e<CharacterPF2e> | null;
    return !!doc?.isOfType?.("weapon") && doc.system.traits.value.includes("staff");
}

/** Staves the character has on them: anything but dropped */
export function carriedStaves(actor: CharacterPF2e): WeaponPF2e<CharacterPF2e>[] {
    return actor.itemTypes.weapon.filter((w) => isStaff(w) && w.system.equipped.carryType !== "dropped");
}

export function readStaff(staff: WeaponPF2e): StaffData {
    const flags = staff.flags[MODULE_ID] as Record<string, unknown> | undefined;
    return readStaffData(flags?.["staff"], staff.system.description.value);
}

export async function writeStaff(staff: WeaponPF2e, data: StaffData): Promise<void> {
    await staff.update({ [STAFF_FLAG]: data });
}

/** The highest spell slot rank across the character's prepared and spontaneous entries */
export function highestSlotRank(actor: CharacterPF2e): number {
    let highest = 0;
    for (const entry of actor.spellcasting.regular) {
        if (!entry.isPrepared && !entry.isSpontaneous) continue;
        for (let rank = 10; rank > highest; rank--) {
            if ((entry.system.slots[`slot${rank as 1}`]?.max ?? 0) > 0) {
                highest = rank;
                break;
            }
        }
    }
    return highest;
}

/** Compendium spell data by uuid, loaded once per session. Null means the uuid didn't resolve to a spell. */
const spellSources = new Map<string, object | null>();

/** Loads the spell data every carried staff refers to, so the snapshot can stay synchronous. */
export async function loadStaffSpells(actor: CharacterPF2e): Promise<void> {
    const uuids = new Set(
        carriedStaves(actor).flatMap((staff) => staffEntries(readStaff(staff).spells).map((e) => e.spell.uuid)),
    );
    await Promise.all(
        [...uuids]
            .filter((uuid) => !spellSources.has(uuid))
            .map(async (uuid) => {
                const doc = (await fromUuid(uuid).catch(() => null)) as ItemPF2e | null;
                spellSources.set(uuid, doc?.isOfType?.("spell") ? doc.toObject() : null);
            }),
    );
}

/**
 * A temporary spell owned by the character, as the staff casts it: at the staff rank, or for a cantrip at
 * the character's cantrip rank. pf2e builds wand and scroll spells the same way.
 */
export function staffSpell(
    actor: CharacterPF2e,
    staff: WeaponPF2e<CharacterPF2e>,
    uuid: string,
    staffRank: number,
): SpellPF2e<CharacterPF2e> | null {
    const source = spellSources.get(uuid);
    if (!source) return null;
    const data = foundry.utils.deepClone(source) as { system: { location: Record<string, unknown> } };
    data.system.location = { value: null, heightenedLevel: staffRank > 0 ? staffRank : null };
    return new CONFIG.Item.documentClass(data as never, { parent: actor, parentItem: staff } as never) as SpellPF2e<
        CharacterPF2e
    >;
}

/**
 * The entry that casts a staff spell: a prepared or spontaneous entry whose tradition or list has the
 * spell, with the highest DC (as pf2e does for wands and scrolls).
 */
export function staffCastingEntry(
    actor: CharacterPF2e,
    spell: SpellPF2e<CharacterPF2e>,
    staff: WeaponPF2e<CharacterPF2e>,
): SpellcastingEntryPF2e<CharacterPF2e> | null {
    let best: SpellcastingEntryPF2e<CharacterPF2e> | null = null;
    for (const entry of actor.spellcasting.regular) {
        if (!entry.statistic || !entry.canCast(spell, { origin: staff })) continue;
        if (!best || entry.statistic.dc.value > (best.statistic?.dc.value ?? 0)) best = entry;
    }
    return best;
}

export function snapshotStaves(
    actor: CharacterPF2e,
    toSpell: (spell: SpellPF2e<CharacterPF2e>) => SpellSnapshot,
): StaffSnapshot[] {
    return carriedStaves(actor).map((staff) => {
        const data = readStaff(staff);
        const preparedByMe = data.preparedBy === actor.id;
        const spells: StaffSpellSnapshot[] = [];
        for (const { rank, spell: ref } of staffEntries(data.spells)) {
            const spell = staffSpell(actor, staff, ref.uuid, rank);
            if (!spell) continue;
            spells.push({
                rank,
                uuid: ref.uuid,
                spell: toSpell(spell),
                castable: !!staffCastingEntry(actor, spell, staff),
            });
        }
        return {
            id: staff.id,
            name: staff.name,
            held: staff.isHeld,
            preparedByMe,
            preparedByOther: data.preparedBy !== null && !preparedByMe,
            charges: preparedByMe ? { ...data.charges } : { value: 0, max: 0 },
            spells,
        };
    });
}

/**
 * Casts a spell from a staff the character prepared: spends charges equal to its rank on the staff
 * (cantrips are free), or 1 charge plus a spontaneous slot, then posts the spell through the best entry.
 * Warns, but still casts, when the staff isn't held.
 */
export async function castFromStaff(
    actor: CharacterPF2e,
    staffId: string,
    uuid: string,
    staffRank: number,
    /** A spontaneous caster's slot spent with 1 charge instead of the full cost */
    slot: { entryId: string; rank: number } | null = null,
): Promise<void> {
    const staff = carriedStaves(actor).find((s) => s.id === staffId);
    const spell = staff ? staffSpell(actor, staff, uuid, staffRank) : null;
    if (!staff || !spell) {
        ui.notifications.error(t("Error.SpellNotFound"));
        return;
    }
    const data = readStaff(staff);
    const charges = slot ? 1 : staffCost(staffRank);
    if (data.preparedBy !== actor.id) {
        ui.notifications.warn(t("Reason.not-prepared"));
        return;
    }
    if (data.charges.value < charges) {
        ui.notifications.warn(t("Reason.no-charges"));
        return;
    }
    const entry = staffCastingEntry(actor, spell, staff);
    if (!entry) {
        ui.notifications.warn(t("Reason.cannot-cast"));
        return;
    }
    if (!staff.isHeld) ui.notifications.warn(t("Staff.NotHeld"));

    if (slot) {
        const slotEntry = actor.items.get(slot.entryId);
        const key = `slot${slot.rank as 1}` as const;
        const left = slotEntry?.isOfType("spellcastingEntry") ? (slotEntry.system.slots[key]?.value ?? 0) : 0;
        if (!slotEntry || left <= 0) {
            ui.notifications.warn(t("Reason.no-slots", { rank: slot.rank }));
            return;
        }
        await slotEntry.update({ [`system.slots.${key}.value`]: left - 1 });
    }
    if (charges > 0) await writeStaff(staff, spendCharges(data, charges));
    spell.system.location.value = entry.id;
    await entry.cast(spell, { consume: false, rank: spell.rank });
}

/**
 * Prepares a staff for the character: charges equal their highest slot rank. Only one staff per person per
 * day, so any other staff they prepared loses its charges.
 */
export async function prepareStaffFor(actor: CharacterPF2e, staffId: string): Promise<void> {
    const staff = carriedStaves(actor).find((s) => s.id === staffId);
    if (!staff) return;
    const rank = highestSlotRank(actor);
    if (rank <= 0) {
        ui.notifications.warn(t("Staff.NoSlots", { actor: actor.name }));
        return;
    }
    for (const other of carriedStaves(actor)) {
        if (other.id !== staff.id && readStaff(other).preparedBy === actor.id) {
            await writeStaff(other, unprepareStaff(readStaff(other)));
        }
    }
    await writeStaff(staff, prepareStaff(readStaff(staff), actor.id, rank, game.time.worldTime));
    ui.notifications.info(t("Staff.Prepared", { staff: staff.name, charges: rank }));
}

/** Asks which carried staff to prepare after a rest. Resolves to a staff id, or null for none. */
async function askWhichStaff(actor: CharacterPF2e, staffIds: string[]): Promise<string | null> {
    const staves = staffIds.map((id) => actor.items.get(id)).filter((s) => !!s);
    const options = staves
        .map(
            (s, i) =>
                `<label><input type="radio" name="staff" value="${s.id}"${i === 0 ? " checked" : ""}> ${s.name}</label>`,
        )
        .join("<br>");
    const content =
        `<p>${t("Staff.ChooseHint", { actor: actor.name })}</p><p>${options}<br>` +
        `<label><input type="radio" name="staff" value=""> ${t("Staff.ChooseNone")}</label></p>`;
    const result: unknown = await foundry.applications.api.DialogV2.prompt({
        window: { title: t("Staff.ChooseTitle") },
        content,
        ok: {
            label: t("Staff.Prepare"),
            callback: (_event: unknown, button: HTMLButtonElement) =>
                (button.form?.elements.namedItem("staff") as RadioNodeList | null)?.value ?? "",
        },
        rejectClose: false,
    });
    return typeof result === "string" && result ? result : null;
}

/**
 * On Rest for the Night: staves this character prepared lose their charges (a new day), then the only
 * carried staff is prepared automatically, or the player picks one when they carry several.
 */
export async function prepareStavesOnRest(actor: CharacterPF2e): Promise<void> {
    if (actor.getFlag(MODULE_ID, BOOST_FLAG) != null) await actor.unsetFlag(MODULE_ID, BOOST_FLAG);
    const staves = carriedStaves(actor);
    for (const staff of staves) {
        if (readStaff(staff).preparedBy === actor.id) await writeStaff(staff, unprepareStaff(readStaff(staff)));
    }
    const plan = restPreparation(
        staves.map((s) => s.id),
        highestSlotRank(actor),
    );
    if (plan.type === "auto") {
        await prepareStaffFor(actor, plan.staffId);
    } else if (plan.type === "ask") {
        const chosen = await askWhichStaff(actor, plan.staffIds);
        if (chosen) await prepareStaffFor(actor, chosen);
    }
}
