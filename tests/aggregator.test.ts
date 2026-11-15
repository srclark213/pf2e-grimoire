import { describe, expect, it } from "vitest";
import { aggregateSpells, groupByRank } from "../src/spellbook/aggregator.ts";
import { actor, cantrip, entry, slots, spell } from "./fixtures/spellbook.ts";

function row(rows: ReturnType<typeof aggregateSpells>, name: string) {
    const found = rows.find((r) => r.name === name);
    if (!found) throw new Error(`no row for ${name}`);
    return found;
}

describe("merging", () => {
    it("shows a spell that is in two entries as one row with two sources", () => {
        const heal1 = spell("Heal", { id: "heal-a" });
        const heal2 = spell("Heal", { id: "heal-b" });
        const rows = aggregateSpells(
            actor([
                entry("Animist Prepared", "prepared", [heal1], {
                    slots: slots({ 1: { max: 1, prepared: [{ id: "heal-a", expended: false }] } }),
                }),
                entry("Apparition Spells", "spontaneous", [heal2], { slots: slots({ 1: { max: 2, value: 2 } }) }),
            ]),
        );

        expect(rows).toHaveLength(1);
        const heal = row(rows, "Heal");
        expect(heal.sources.map((s) => s.kind)).toEqual(["prepared", "spontaneous"]);
        expect(heal.spellIds).toEqual(["heal-a", "heal-b"]);
        expect(heal.castOptions.map((o) => o.kind)).toEqual(["prepared", "spontaneous"]);
    });

    it("marks each source available only if that source can cast the spell", () => {
        const rows = aggregateSpells(
            actor([
                entry("Animist Prepared", "prepared", [spell("Heal", { id: "heal-a" })], {
                    slots: slots({ 1: { max: 1, prepared: [{ id: "heal-a", expended: true }] } }),
                }),
                entry("Apparition Spells", "spontaneous", [spell("Heal", { id: "heal-b" })], {
                    slots: slots({ 1: { max: 2, value: 1 } }),
                }),
            ]),
        );
        expect(row(rows, "Heal").sources.map((s) => [s.entryName, s.available])).toEqual([
            ["Animist Prepared", false],
            ["Apparition Spells", true],
        ]);
    });

    it("lists an entry once as a source even if it holds the spell twice", () => {
        const low = spell("Fear", { id: "fear-1", rank: 1 });
        const high = spell("Fear", { id: "fear-3", rank: 3 });
        const rows = aggregateSpells(
            actor([entry("Bard", "spontaneous", [low, high], { slots: slots({ 1: { max: 3, value: 3 }, 3: { max: 2, value: 2 } }) })]),
        );

        const fear = row(rows, "Fear");
        expect(fear.sources).toHaveLength(1);
        expect(fear.castOptions.map((o) => o.rank)).toEqual([1, 3]);
    });

    it("leaves out entries the snapshot doesn't include and sorts rows by rank then name", () => {
        const rows = aggregateSpells(
            actor([
                entry("Wizard", "prepared", [spell("Fireball", { baseRank: 3 }), spell("Alarm"), cantrip("Shield")]),
            ]),
        );
        expect(rows.map((r) => r.name)).toEqual(["Shield", "Alarm", "Fireball"]);
    });
});

describe("prepared casters", () => {
    const missile = spell("Force Barrage", { id: "fb" });
    const wizard = (expended: boolean[]) =>
        entry("Wizard", "prepared", [missile], {
            slots: slots({ 1: { max: 2, prepared: expended.map((e) => ({ id: "fb", expended: e })) } }),
        });

    it("gives one option per prepared slot, and an expended slot is unavailable", () => {
        const rows = aggregateSpells(actor([wizard([false, true])]));
        const options = row(rows, "Force Barrage").castOptions;
        expect(options.map((o) => [o.slotIndex, o.available])).toEqual([
            [0, true],
            [1, false],
        ]);
    });

    it("dims a spell whose slots are all expended", () => {
        expect(row(aggregateSpells(actor([wizard([true, true])])), "Force Barrage").available).toBe(false);
    });

    it("dims a spell that is in the spellbook but not prepared", () => {
        const rows = aggregateSpells(actor([entry("Wizard", "prepared", [missile])]));
        const fb = row(rows, "Force Barrage");
        expect(fb.castOptions).toEqual([]);
        expect(fb.available).toBe(false);
        expect(fb.sources).toHaveLength(1);
    });

    it("casts a spell prepared in a higher slot at that slot's rank", () => {
        const rows = aggregateSpells(
            actor([
                entry("Cleric", "prepared", [spell("Heal", { id: "heal" })], {
                    slots: slots({ 3: { max: 1, prepared: [{ id: "heal", expended: false }] } }),
                }),
            ]),
        );
        expect(row(rows, "Heal").castOptions[0]?.rank).toBe(3);
        expect(row(rows, "Heal").baseRank).toBe(1);
    });

    it("keeps prepared cantrips available at their heightened rank", () => {
        const rows = aggregateSpells(
            actor([
                entry("Wizard", "prepared", [cantrip("Shield", { id: "shield", rank: 3 })], {
                    slots: slots({ 0: { max: 5, prepared: [{ id: "shield", expended: true }] } }),
                }),
            ]),
        );
        const shield = row(rows, "Shield");
        expect(shield.baseRank).toBe(0);
        expect(shield.castOptions).toMatchObject([{ rank: 3, available: true }]);
    });
});

describe("spontaneous casters", () => {
    it("is available while slots of the spell's rank are left", () => {
        const fear = spell("Fear");
        const withSlots = (value: number) =>
            entry("Sorcerer", "spontaneous", [fear], { slots: slots({ 1: { max: 3, value } }) });
        expect(row(aggregateSpells(actor([withSlots(1)])), "Fear").available).toBe(true);
        expect(row(aggregateSpells(actor([withSlots(0)])), "Fear").available).toBe(false);
    });

    it("gives a signature spell an option at every slotted rank at or above its base rank", () => {
        const heal = spell("Heal", { signature: true });
        const rows = aggregateSpells(
            actor([
                entry("Oracle", "spontaneous", [heal], {
                    slots: slots({ 1: { max: 3, value: 0 }, 2: { max: 3, value: 2 }, 3: { max: 2, value: 1 } }),
                }),
            ]),
        );
        const options = row(rows, "Heal").castOptions;
        expect(options.map((o) => [o.rank, o.available])).toEqual([
            [1, false],
            [2, true],
            [3, true],
        ]);
    });

    it("never offers a signature spell below its base rank", () => {
        const fireball = spell("Fireball", { baseRank: 3, rank: 3, signature: true });
        const rows = aggregateSpells(
            actor([
                entry("Sorcerer", "spontaneous", [fireball], {
                    slots: slots({ 1: { max: 4, value: 4 }, 3: { max: 3, value: 3 }, 4: { max: 1, value: 1 } }),
                }),
            ]),
        );
        expect(row(rows, "Fireball").castOptions.map((o) => o.rank)).toEqual([3, 4]);
    });

    it("keeps cantrips available", () => {
        const rows = aggregateSpells(actor([entry("Sorcerer", "spontaneous", [cantrip("Daze")])]));
        expect(row(rows, "Daze").available).toBe(true);
    });
});

describe("flexible casters", () => {
    const flexible = (spells: ReturnType<typeof spell>[]) =>
        entry("Flexible Cleric", "prepared", spells, {
            isFlexible: true,
            slots: slots({
                0: { max: 5, prepared: [{ id: "light-id", expended: false }] },
                1: { max: 3, value: 1 },
                2: { max: 2, value: 0 },
            }),
        });

    it("casts collection spells from shared slots like signature spells", () => {
        const rows = aggregateSpells(actor([flexible([spell("Bless", { signature: true })])]));
        expect(row(rows, "Bless").castOptions.map((o) => [o.rank, o.available])).toEqual([
            [1, true],
            [2, false],
        ]);
    });

    it("dims spells that aren't in today's collection", () => {
        const rows = aggregateSpells(actor([flexible([spell("Bane")])]));
        expect(row(rows, "Bane").available).toBe(false);
    });

    it("still uses prepared slots for cantrips", () => {
        const rows = aggregateSpells(actor([flexible([cantrip("Light", { id: "light-id" })])]));
        expect(row(rows, "Light").available).toBe(true);
    });
});

describe("innate spells", () => {
    it("is unavailable once its uses are spent", () => {
        const make = (value: number) =>
            actor([entry("Elf Magic", "innate", [spell("Faerie Fire", { uses: { value, max: 1 } })])]);
        expect(row(aggregateSpells(make(1)), "Faerie Fire").available).toBe(true);
        expect(row(aggregateSpells(make(0)), "Faerie Fire").available).toBe(false);
    });

    it("treats innate cantrips as unlimited", () => {
        const rows = aggregateSpells(actor([entry("Gnome", "innate", [cantrip("Prestidigitation")])]));
        expect(row(rows, "Prestidigitation").available).toBe(true);
    });
});

describe("focus spells", () => {
    const focusEntry = entry("Domain Spells", "focus", [
        spell("Fire Ray", { isFocus: true, rank: 3 }),
        cantrip("Shielding Strike", { isFocus: true, rank: 3 }),
    ]);

    it("needs a focus point, and auto-heightens", () => {
        const empty = aggregateSpells(actor([focusEntry], { focus: { value: 0, max: 1 } }));
        const full = aggregateSpells(actor([focusEntry], { focus: { value: 1, max: 1 } }));
        expect(row(empty, "Fire Ray").available).toBe(false);
        expect(row(full, "Fire Ray").castOptions).toMatchObject([{ rank: 3, available: true }]);
        expect(row(full, "Fire Ray").isFocus).toBe(true);
    });

    it("groups focus spells with cantrips, since both auto-heighten", () => {
        const rows = aggregateSpells(actor([focusEntry, entry("Wizard", "prepared", [spell("Alarm")])]));
        expect(groupByRank(rows).map((g) => [g.rank, g.rows.map((r) => r.name)])).toEqual([
            [0, ["Fire Ray", "Shielding Strike"]],
            [1, ["Alarm"]],
        ]);
    });

    it("keeps the base rank of a spell that is also known as a regular spell", () => {
        const rows = aggregateSpells(
            actor([
                entry("Domain Spells", "focus", [spell("Heal", { id: "heal-focus", isFocus: true, rank: 3 })]),
                entry("Cleric", "prepared", [spell("Heal", { id: "heal-slot" })]),
            ]),
        );
        expect(row(rows, "Heal").baseRank).toBe(1);
    });

    it("lets focus cantrips be cast with an empty pool", () => {
        const empty = aggregateSpells(actor([focusEntry], { focus: { value: 0, max: 1 } }));
        expect(row(empty, "Shielding Strike").available).toBe(true);
    });
});

describe("groupByRank", () => {
    it("puts cantrips first and skips empty ranks", () => {
        const rows = aggregateSpells(
            actor([entry("Wizard", "prepared", [spell("Fireball", { baseRank: 3 }), cantrip("Shield"), spell("Alarm")])]),
        );
        expect(groupByRank(rows).map((g) => [g.rank, g.rows.map((r) => r.name)])).toEqual([
            [0, ["Shield"]],
            [1, ["Alarm"]],
            [3, ["Fireball"]],
        ]);
    });
});
