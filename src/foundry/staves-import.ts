import type { CharacterPF2e } from "@actor";
import { planImport, type LegacyStaffEntry, type StaffItemRef } from "../spellbook/staves-import.ts";
import { carriedStaves, highestSlotRank, isStaff, readStaff, writeStaff } from "./staves.ts";

const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.${key}`, data);

const LEGACY_SCOPE = "pf2e-staves";

/** The character's PF2e Staves entries: spellcasting entries of type "charge" with that module's flags */
export function legacyStaffEntries(actor: CharacterPF2e): LegacyStaffEntry[] {
    return actor.itemTypes.spellcastingEntry.flatMap((entry) => {
        const flags = entry.flags[LEGACY_SCOPE] as { staveID?: unknown; charges?: unknown } | undefined;
        if ((entry.system.prepared.value as string) !== "charge" || !flags) return [];
        const spells = actor.itemTypes.spell
            .filter((spell) => spell.system.location.value === entry.id)
            .map((spell) => ({
                id: spell.id,
                name: spell.name,
                uuid: spell.sourceId ?? null,
                rank: spell.isCantrip ? 0 : (spell.system.location.heightenedLevel ?? spell.baseRank),
            }));
        return [
            {
                entryId: entry.id,
                name: entry.name,
                staveID: typeof flags.staveID === "string" ? flags.staveID : null,
                charges: typeof flags.charges === "number" ? flags.charges : 0,
                spells,
            },
        ];
    });
}

/**
 * Moves the character's PF2e Staves staves into the Grimoire after confirmation: each staff keeps its spell
 * list and today's charges, prepared by this character, and the old spellcasting entry and its spells are
 * deleted. Entries whose staff can't be found are left alone.
 */
export async function importLegacyStaves(actor: CharacterPF2e): Promise<void> {
    const entries = legacyStaffEntries(actor);
    if (entries.length === 0) return;
    const staves = actor.itemTypes.weapon.filter(isStaff);
    const refs: StaffItemRef[] = staves.map((s) => ({ id: s.id, name: s.name, sourceId: s.sourceId ?? null }));
    const plan = planImport(entries, refs, (id) => readStaff(staves.find((s) => s.id === id)!).spells);

    const lines = plan.imports.map((i) => `<li>${t("Import.Line", { staff: i.staff.name, charges: i.charges })}</li>`);
    const missing = plan.unmatched.map((e) => `<li>${t("Import.Missing", { entry: e.name })}</li>`);
    const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("Import.Title") },
        content:
            `<p>${t("Import.Intro", { actor: actor.name })}</p><ul>${lines.join("")}${missing.join("")}</ul>` +
            `<p>${t("Import.Warning")}</p>`,
    });
    if (!confirmed || plan.imports.length === 0) return;

    const highest = highestSlotRank(actor);
    const now = game.time.worldTime;
    for (const item of plan.imports) {
        const staff = staves.find((s) => s.id === item.staff.id)!;
        await writeStaff(staff, {
            ...readStaff(staff),
            spells: item.spells,
            manual: item.manual,
            charges: { value: item.charges, max: Math.max(item.charges, highest) },
            preparedBy: actor.id,
            preparedOn: now,
        });
    }
    const deletions = plan.imports.flatMap((i) => [i.entry.entryId, ...i.entry.spells.map((s) => s.id)]);
    await actor.deleteEmbeddedDocuments("Item", deletions);
    ui.notifications.info(t("Import.Done", { count: plan.imports.length, actor: actor.name }));
    if (carriedStaves(actor).length === 0) ui.notifications.warn(t("Import.NoneCarried"));
}
