import { describe, expect, it } from "vitest";
import { parseStaffSpells } from "../src/spellbook/staff.ts";
import {
    matchStaff,
    planImport,
    spellListFromEntry,
    type LegacyStaffEntry,
    type StaffItemRef,
} from "../src/spellbook/staves-import.ts";

const ID = {
    ignition: "Compendium.pf2e.spells-srd.Item.6DfLZBl8wKIV03Iq",
    breathe: "Compendium.pf2e.spells-srd.Item.y6rAdMK6EFlV6U0t",
    flame: "Compendium.pf2e.spells-srd.Item.2ZdHjnpEQJuqOYSG",
    fireball: "Compendium.pf2e.spells-srd.Item.sxQZ6yqTn0czJxVd",
};

/** Arvis's Staff of Fire (Greater) as PF2e Staves left it in the group's world */
const arvisEntry: LegacyStaffEntry = {
    entryId: "M42q4IBhTjX6urQI",
    name: "Staff of Fire (Greater)",
    staveID: "V21TCXnUy0X8FZ61",
    charges: 2,
    spells: [
        { id: "s1", name: "Ignition", uuid: ID.ignition, rank: 0 },
        { id: "s2", name: "Breathe Fire", uuid: ID.breathe, rank: 1 },
        { id: "s3", name: "Breathe Fire", uuid: ID.breathe, rank: 2 },
        { id: "s4", name: "Floating Flame", uuid: ID.flame, rank: 2 },
        { id: "s5", name: "Floating Flame", uuid: ID.flame, rank: 3 },
        { id: "s6", name: "Fireball", uuid: ID.fireball, rank: 3 },
    ],
};

const arvisStaff: StaffItemRef = {
    id: "ox53PVV1t0Hw1IgT",
    name: "Staff of Fire (Greater)",
    sourceId: "Actor.lWfun9M700tBeMAG.Item.V21TCXnUy0X8FZ61",
};

const description =
    "<ul><li><strong>Cantrip</strong> @UUID[" + ID.ignition + "]{Ignition}</li>" +
    "<li><strong>1st</strong> @UUID[" + ID.breathe + "]{Breathe Fire}</li>" +
    "<li><strong>2nd</strong> @UUID[" + ID.breathe + "]{Breathe Fire}, @UUID[" + ID.flame + "]{Floating Flame}</li>" +
    "<li><strong>3rd</strong> @UUID[" + ID.flame + "]{Floating Flame}, @UUID[" + ID.fireball + "]{Fireball}</li></ul>";

describe("matching a PF2e Staves entry to its staff", () => {
    const other: StaffItemRef = { id: "x", name: "Staff of Healing", sourceId: null };

    it("follows a stale staveID through the staff's sourceId", () => {
        expect(matchStaff(arvisEntry, [other, arvisStaff])).toBe(arvisStaff);
    });

    it("matches the staff's own id", () => {
        const kurth = { ...arvisEntry, staveID: "kRlBQGIEJkon7C0D", name: "Staff of Healing (Major)" };
        const staff = { id: "kRlBQGIEJkon7C0D", name: "Staff of Healing (Major)", sourceId: "Compendium.x" };
        expect(matchStaff(kurth, [staff])).toBe(staff);
    });

    it("falls back to a unique name, and gives up on ambiguity", () => {
        const noId = { ...arvisEntry, staveID: null };
        const renamed = { ...arvisStaff, sourceId: null };
        expect(matchStaff(noId, [renamed])).toBe(renamed);
        expect(matchStaff(noId, [renamed, { ...renamed, id: "twin" }])).toBeNull();
    });
});

describe("planning the import", () => {
    it("rebuilds the spell list by rank from the entry's spells", () => {
        const list = spellListFromEntry(arvisEntry);
        expect(Object.fromEntries(Object.entries(list).map(([r, s]) => [r, s.map((x) => x.name)]))).toEqual({
            0: ["Ignition"],
            1: ["Breathe Fire"],
            2: ["Breathe Fire", "Floating Flame"],
            3: ["Floating Flame", "Fireball"],
        });
    });

    it("keeps following the description when PF2e Staves had the same list, and carries charges over", () => {
        const plan = planImport([arvisEntry], [arvisStaff], () => parseStaffSpells(description));
        expect(plan.unmatched).toEqual([]);
        expect(plan.imports).toHaveLength(1);
        expect(plan.imports[0]).toMatchObject({ staff: arvisStaff, manual: false, charges: 2 });
    });

    it("keeps a customized PF2e Staves list as a hand edit", () => {
        const custom = { ...arvisEntry, spells: arvisEntry.spells.filter((s) => s.name !== "Fireball") };
        const plan = planImport([custom], [arvisStaff], () => parseStaffSpells(description));
        expect(plan.imports[0]!.manual).toBe(true);
    });

    it("leaves entries whose staff is gone, and drops spells with no compendium source", () => {
        const orphan = { ...arvisEntry, staveID: "gone", name: "Lost Staff" };
        const homebrew = {
            ...arvisEntry,
            spells: [...arvisEntry.spells, { id: "s7", name: "Homebrew", uuid: null, rank: 1 }],
        };
        const plan = planImport([orphan, homebrew], [arvisStaff], () => ({}));
        expect(plan.unmatched.map((e) => e.name)).toEqual(["Lost Staff"]);
        expect(plan.imports[0]!.spells[1]!.map((s) => s.name)).toEqual(["Breathe Fire"]);
    });
});
