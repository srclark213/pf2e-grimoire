import { describe, expect, it } from "vitest";
import { aggregateSpells } from "../src/spellbook/aggregator.ts";
import type { StaffSnapshot, StaffSpellSnapshot } from "../src/spellbook/model.ts";
import { rankButtons } from "../src/spellbook/rank-buttons.ts";
import { boostSlots, canBoostStaff } from "../src/spellbook/staff.ts";
import { actor, cantrip, entry, slots, spell } from "./fixtures/spellbook.ts";

function listed(rank: number, name: string, overrides: Partial<StaffSpellSnapshot> = {}): StaffSpellSnapshot {
    const base = rank === 0 ? cantrip(name) : spell(name, { baseRank: 1, rank });
    return { rank, uuid: `Compendium.pf2e.spells-srd.Item.${name}`, spell: base, castable: true, ...overrides };
}

function staff(spells: StaffSpellSnapshot[], overrides: Partial<StaffSnapshot> = {}): StaffSnapshot {
    return {
        id: "staff-1",
        name: "Staff of Fire (Greater)",
        held: true,
        preparedByMe: true,
        preparedByOther: false,
        charges: { value: 3, max: 7 },
        spells,
        list: {},
        manual: false,
        ...overrides,
    };
}

const fireStaff = (overrides: Partial<StaffSnapshot> = {}) =>
    staff([listed(0, "Ignition"), listed(1, "Breathe Fire"), listed(2, "Breathe Fire")], overrides);

describe("staff spells as sources", () => {
    it("gives each listed rank a cast option on one row with one Staff badge", () => {
        const rows = aggregateSpells(actor([], { staves: [fireStaff()] }));
        const breathe = rows.find((r) => r.name === "Breathe Fire")!;
        expect(breathe.sources).toEqual([
            { entryId: "staff-1", entryName: "Staff of Fire (Greater)", kind: "staff", available: true },
        ]);
        expect(breathe.baseRank).toBe(1);
        expect(rankButtons(breathe).map((b) => [b.rank, b.option.cost])).toEqual([
            [1, { type: "staff", charges: 1, value: 3 }],
            [2, { type: "staff", charges: 2, value: 3 }],
        ]);
        expect(breathe.castOptions[1]).toMatchObject({
            kind: "staff",
            spellUuid: "Compendium.pf2e.spells-srd.Item.Breathe Fire",
            staffRank: 2,
        });
    });

    it("casts staff cantrips for free, at the character's cantrip rank, grouped with cantrips", () => {
        const rows = aggregateSpells(actor([], { staves: [fireStaff({ charges: { value: 0, max: 7 } })] }));
        const ignition = rows.find((r) => r.name === "Ignition")!;
        expect(ignition.baseRank).toBe(0);
        expect(ignition.castOptions[0]).toMatchObject({
            rank: 3,
            available: true,
            cost: { type: "staff", charges: 0, value: 0 },
        });
    });

    it("needs enough charges", () => {
        const rows = aggregateSpells(actor([], { staves: [fireStaff({ charges: { value: 1, max: 7 } })] }));
        const options = rows.find((r) => r.name === "Breathe Fire")!.castOptions;
        expect(options.map((o) => [o.rank, o.available, o.reason])).toEqual([
            [1, true, undefined],
            [2, false, "no-charges"],
        ]);
    });

    it("needs the staff prepared by this character today", () => {
        const rows = aggregateSpells(
            actor([], { staves: [fireStaff({ preparedByMe: false, preparedByOther: true, charges: { value: 0, max: 0 } })] }),
        );
        expect(rows.every((r) => r.castOptions.every((o) => o.reason === "not-prepared"))).toBe(true);
        expect(rows.every((r) => !r.available)).toBe(true);
    });

    it("needs an entry that can cast the spell", () => {
        const rows = aggregateSpells(actor([], { staves: [staff([listed(3, "Fireball", { castable: false })])] }));
        expect(rows[0]!.castOptions[0]).toMatchObject({ available: false, reason: "cannot-cast" });
    });

    it("comes after slots in the default priority", () => {
        const fireball = spell("Fireball", { baseRank: 3 });
        const rows = aggregateSpells(
            actor([entry("Druid", "spontaneous", [fireball], { slots: slots({ 3: { value: 1, max: 1 } }) })], {
                staves: [staff([listed(3, "Fireball", { spell: fireball })])],
            }),
        );
        const [button] = rankButtons(rows[0]!);
        expect(button!.options.map((o) => o.kind)).toEqual(["spontaneous", "staff", "staff+slot"]);
        expect(button!.option.kind).toBe("spontaneous");
    });
});

describe("spontaneous staff + slot", () => {
    const sorcerer = (slotsByRank: Parameters<typeof slots>[0]) =>
        entry("Apparition", "spontaneous", [], { slots: slots(slotsByRank) });
    const optionsFor = (staffRank: number, slotsByRank: Parameters<typeof slots>[0], over: Partial<StaffSnapshot> = {}) =>
        aggregateSpells(
            actor([sorcerer(slotsByRank)], { staves: [staff([listed(staffRank, "Heal")], over)] }),
        )[0]!.castOptions.filter((o) => o.kind === "staff+slot");

    it("costs 1 charge plus the lowest slot left at or above the spell's rank, at the staff rank", () => {
        const [option] = optionsFor(3, { 2: { value: 2, max: 2 }, 3: { value: 0, max: 2 }, 4: { value: 1, max: 2 } });
        expect(option).toMatchObject({
            available: true,
            rank: 3,
            staffRank: 3,
            slotEntryId: "apparition-entry",
            slotRank: 4,
            cost: { type: "staff+slot", value: 3, slotRank: 4, slotEntryName: "Apparition" },
        });
    });

    it("is never picked by a click", () => {
        const rows = aggregateSpells(
            actor([sorcerer({ 3: { value: 1, max: 1 } })], {
                staves: [staff([listed(3, "Heal")], { charges: { value: 2, max: 7 } })],
            }),
        );
        const [button] = rankButtons(rows[0]!);
        // The staff alone needs 3 charges, so only staff + slot could cast it; a click still won't.
        expect(button!.available).toBe(false);
        expect(button!.options.find((o) => o.kind === "staff+slot")?.available).toBe(true);
    });

    it("needs a slot left, a charge, and the staff prepared", () => {
        expect(optionsFor(3, { 3: { value: 0, max: 2 } })[0]).toMatchObject({ available: false, reason: "no-slots" });
        expect(optionsFor(3, { 3: { value: 1, max: 2 } }, { charges: { value: 0, max: 7 } })[0]?.reason).toBe(
            "no-charges",
        );
        expect(optionsFor(3, { 3: { value: 1, max: 2 } }, { preparedByMe: false })[0]?.reason).toBe("not-prepared");
    });

    it("isn't offered for rank 1 spells, cantrips, or casters without slots that high", () => {
        expect(optionsFor(1, { 1: { value: 3, max: 3 } })).toEqual([]);
        expect(optionsFor(0, { 1: { value: 3, max: 3 } })).toEqual([]);
        expect(optionsFor(5, { 3: { value: 3, max: 3 } })).toEqual([]);
    });
});

describe("prepared caster slot boost", () => {
    const fireball = spell("Fireball", { id: "fb", baseRank: 3 });
    const heal = spell("Heal", { id: "heal", baseRank: 1 });

    it("offers unexpended prepared slots, highest rank first, with the prepared spell", () => {
        const druid = entry("Druid", "prepared", [fireball, heal], {
            slots: slots({
                1: { prepared: [{ id: "heal", expended: false }, { id: null, expended: false }] },
                3: { prepared: [{ id: "fb", expended: false }, { id: "fb", expended: true }] },
            }),
        });
        expect(boostSlots([druid])).toEqual([
            { entryId: "druid-entry", entryName: "Druid", rank: 3, slotIndex: 0, spellName: "Fireball" },
            { entryId: "druid-entry", entryName: "Druid", rank: 1, slotIndex: 0, spellName: "Heal" },
        ]);
    });

    it("offers a flexible caster's remaining slots, and never spontaneous slots", () => {
        const flexible = entry("Flexible", "prepared", [], {
            isFlexible: true,
            slots: slots({ 2: { value: 1, max: 2 }, 4: { value: 0, max: 1 } }),
        });
        const sorcerer = entry("Sorcerer", "spontaneous", [], { slots: slots({ 5: { value: 3, max: 3 } }) });
        expect(boostSlots([flexible, sorcerer]).map((s) => [s.entryName, s.rank, s.slotIndex])).toEqual([
            ["Flexible", 2, null],
        ]);
    });

    it("is available once a day, on a staff the character prepared", () => {
        const one = [{ entryId: "e", entryName: "E", rank: 1, slotIndex: 0, spellName: null }];
        expect(canBoostStaff(true, false, one)).toBe(true);
        expect(canBoostStaff(true, true, one)).toBe(false);
        expect(canBoostStaff(false, false, one)).toBe(false);
        expect(canBoostStaff(true, false, [])).toBe(false);
    });
});
