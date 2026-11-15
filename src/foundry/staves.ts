import type { CharacterPF2e } from "@actor";
import type { WeaponPF2e } from "@item";
import { MODULE_ID } from "../constants.ts";
import type { StaffSnapshot } from "../spellbook/model.ts";
import {
    prepareStaff,
    readStaffData,
    restPreparation,
    unprepareStaff,
    type StaffData,
} from "../spellbook/staff.ts";

const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

const STAFF_FLAG = `flags.${MODULE_ID}.staff`;

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

export function snapshotStaves(actor: CharacterPF2e): StaffSnapshot[] {
    return carriedStaves(actor).map((staff) => {
        const data = readStaff(staff);
        const preparedByMe = data.preparedBy === actor.id;
        return {
            id: staff.id,
            name: staff.name,
            held: staff.isHeld,
            preparedByMe,
            preparedByOther: data.preparedBy !== null && !preparedByMe,
            charges: preparedByMe ? { ...data.charges } : { value: 0, max: 0 },
        };
    });
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
