import { describe, expect, it } from "vitest";
import {
    addCharges,
    isEmptyStaffList,
    parseStaffSpells,
    prepareStaff,
    readStaffData,
    restPreparation,
    spendCharges,
    staffCost,
    staffEntries,
    unprepareStaff,
    type StaffSpellList,
} from "../src/spellbook/staff.ts";
import { pf2eDescription } from "./fixtures/pf2e-spells.ts";

/** rank → spell names, which is what matters when reading a test */
function names(list: StaffSpellList): Record<number, string[]> {
    return Object.fromEntries(Object.entries(list).map(([rank, spells]) => [rank, spells.map((s) => s.name)]));
}

describe("staff description parser (pf2e pack data)", () => {
    it("reads Staff of Fire", () => {
        expect(names(parseStaffSpells(pf2eDescription("staff-of-fire")))).toEqual({
            0: ["Ignition"],
            1: ["Breathe Fire"],
        });
    });

    it("reads a Greater variant, with comma-separated links", () => {
        expect(names(parseStaffSpells(pf2eDescription("staff-of-fire-greater")))).toEqual({
            0: ["Ignition"],
            1: ["Breathe Fire"],
            2: ["Breathe Fire", "Floating Flame"],
            3: ["Floating Flame", "Fireball"],
        });
    });

    it("reads Staff of Healing (Major), with space-separated links on one line", () => {
        expect(names(parseStaffSpells(pf2eDescription("staff-of-healing-major")))).toEqual({
            0: ["Stabilize"],
            1: ["Heal"],
            2: ["Clear Mind", "Heal", "Sound Body"],
            3: ["Cleanse Affliction", "Heal"],
            4: ["Cleanse Affliction", "Clear Mind", "Sound Body"],
            5: ["Breath of Life", "Heal"],
        });
    });

    it("accepts the plural Cantrips label", () => {
        expect(names(parseStaffSpells(pf2eDescription("arboreal-staff")))[0]).toEqual(["Tangle Vine"]);
    });

    it("ignores links outside a rank list", () => {
        // "functions as a Staff of Fire (Greater)": an equipment link, not a spell list
        expect(isEmptyStaffList(parseStaffSpells(pf2eDescription("bountys-light")))).toBe(true);
        // Craft Requirements and similar paragraphs after the list don't belong to the last rank
        const list = parseStaffSpells(
            "<ul><li><strong>1st</strong> @UUID[Compendium.pf2e.spells-srd.Item.Heal]</li></ul>" +
                "<p>See also @UUID[Compendium.pf2e.spells-srd.Item.Fireball]</p>",
        );
        expect(names(list)).toEqual({ 1: ["Heal"] });
    });
});

describe("staff description parser (world data)", () => {
    // How the same description looks once Foundry has resolved the links to ids
    const world =
        "<p><strong>Activate</strong> Cast a Spell</p><ul>" +
        "<li><strong>Cantrip</strong> @UUID[Compendium.pf2e.spells-srd.Item.6DfLZBl8wKIV03Iq]{Ignition}</li>" +
        "<li><strong>2nd</strong> @UUID[Compendium.pf2e.spells-srd.Item.y6rAdMK6EFlV6U0t]{Breathe Fire}, " +
        "@UUID[Compendium.pf2e.spells-srd.Item.2ZdHjnpEQJuqOYSG]{Floating Flame}, " +
        "@UUID[Compendium.pf2e.spells-srd.Item.2ZdHjnpEQJuqOYSG]{Floating Flame}</li></ul>";

    it("uses link labels as names, keeps id uuids and drops duplicates", () => {
        const list = parseStaffSpells(world);
        expect(list[2]).toEqual([
            { uuid: "Compendium.pf2e.spells-srd.Item.y6rAdMK6EFlV6U0t", name: "Breathe Fire" },
            { uuid: "Compendium.pf2e.spells-srd.Item.2ZdHjnpEQJuqOYSG", name: "Floating Flame" },
        ]);
        expect(staffEntries(list).map((e) => `${e.rank}:${e.spell.name}`)).toEqual([
            "0:Ignition",
            "2:Breathe Fire",
            "2:Floating Flame",
        ]);
    });
});

describe("staff data and charges", () => {
    const html = pf2eDescription("staff-of-fire-greater");

    it("reads empty flags as an unprepared staff with spells from the description", () => {
        const data = readStaffData(undefined, html);
        expect(data).toMatchObject({ manual: false, charges: { value: 0, max: 0 }, preparedBy: null });
        expect(staffEntries(data.spells)).toHaveLength(6);
    });

    it("keeps a hand-edited list instead of re-reading the description", () => {
        const spells = { 1: [{ uuid: "Compendium.x.Item.a", name: "Custom" }] };
        const data = readStaffData({ manual: true, spells }, html);
        expect(data.spells).toEqual(spells);
    });

    it("sets charges to the highest slot rank on prepare, replacing what was left", () => {
        const used = { ...readStaffData(undefined, html), charges: { value: 2, max: 6 } };
        expect(prepareStaff(used, "actor1", 7, 100)).toMatchObject({
            charges: { value: 7, max: 7 },
            preparedBy: "actor1",
            preparedOn: 100,
        });
    });

    it("costs a spell's rank in charges, cantrips nothing, and never goes below zero", () => {
        const data = prepareStaff(readStaffData(undefined, html), "a", 3, 0);
        expect(staffCost(0)).toBe(0);
        expect(staffCost(2)).toBe(2);
        expect(spendCharges(data, 2).charges).toEqual({ value: 1, max: 3 });
        expect(spendCharges(data, 5).charges.value).toBe(0);
        expect(addCharges(data, 2).charges).toEqual({ value: 5, max: 5 });
        expect(unprepareStaff(data)).toMatchObject({ charges: { value: 0, max: 0 }, preparedBy: null });
    });

    it("prepares the only staff on rest, asks with several, and skips characters without slots", () => {
        expect(restPreparation(["s1"], 6)).toEqual({ type: "auto", staffId: "s1" });
        expect(restPreparation(["s1", "s2"], 6)).toEqual({ type: "ask", staffIds: ["s1", "s2"] });
        expect(restPreparation([], 6)).toEqual({ type: "none" });
        expect(restPreparation(["s1"], 0)).toEqual({ type: "none" });
    });
});
