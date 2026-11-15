import { describe, expect, it } from "vitest";
import { isEmptyStaffList, parseStaffSpells, staffEntries, type StaffSpellList } from "../src/spellbook/staff.ts";
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
