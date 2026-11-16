import type { CharacterPF2e } from "@actor";
import { MODULE_ID } from "../constants.ts";
import { castOption } from "../foundry/cast.ts";
import { prepareStaffFor, readStaff } from "../foundry/staves.ts";
import { categorize } from "../spellbook/categories.ts";
import { extractFacets, type SpellSystemSource } from "../spellbook/facets.ts";
import {
    TestWorld,
    addEntry,
    addSpell,
    addSpellConsumable,
    addStaff,
    clickRank,
    compendiumSpell,
    prepareInSlot,
    rowFor,
    waitFor,
    withStub,
} from "./world.ts";

/* The parts of Quench's batch context these tests use (mocha + chai) */
type Suite = (name: string, fn: () => void) => void;
type Test = (name: string, fn: () => Promise<void> | void) => void;
type Hook = (fn: () => Promise<void> | void) => void;
export interface BatchContext {
    describe: Suite;
    it: Test;
    before: Hook;
    after: Hook;
    expect: Chai.ExpectStatic;
}

const staffOf = (actor: CharacterPF2e, id: string) => actor.items.get(id)!;
const restForTheNight = (actor: CharacterPF2e) =>
    (game.pf2e.actions as unknown as Record<string, (o: object) => Promise<unknown>>)["restForTheNight"]!({
        actors: [actor],
        skipDialog: true,
    });

/**
 * Categories against the compendium a live world loads. The unit tests read pf2e's source JSON, which
 * links conditions by name; the built compendium links them by id, which once hid every condition.
 */
export function categoriesBatch({ describe, it, expect }: BatchContext): void {
    const categoriesOf = async (name: string) =>
        categorize(extractFacets((await compendiumSpell(name)).system as SpellSystemSource));

    describe("Categories from the live compendium", () => {
        it("puts Fear in Control (a condition linked by id)", async () => {
            expect(await categoriesOf("Fear")).to.include("control");
        });
        it("puts Incarnate Ancient Specter in Control and Damage (inline @Damage)", async () => {
            expect(await categoriesOf("Incarnate Ancient Specter")).to.include.members(["control", "damage"]);
        });
        it("puts Heroism in Buff", async () => {
            expect(await categoriesOf("Heroism")).to.include("buff");
        });
        it("puts Invisibility in Buff (a helpful condition linked by id)", async () => {
            expect(await categoriesOf("Invisibility")).to.include("buff");
        });
        it("keeps Suspended Retribution and Moon Frenzy out of Defense", async () => {
            expect(await categoriesOf("Suspended Retribution")).not.to.include("defense");
            expect(await categoriesOf("Moon Frenzy")).not.to.include("defense");
        });
        it("puts Fireball in Damage", async () => {
            expect(await categoriesOf("Fireball")).to.include("damage");
        });
    });
}

/** Each kind of cast, clicked the way the window clicks it, spends what it should */
export function castingBatch({ describe, it, before, after, expect }: BatchContext): void {
    const world = new TestWorld();
    after(() => world.cleanUp());

    describe("Prepared slots", () => {
        let actor: CharacterPF2e;
        before(async () => {
            actor = await world.character("Prepared");
        });

        it("hides a spellbook spell that isn't prepared", async () => {
            const entry = await addEntry(actor, "Wizard", "prepared", { slots: { 1: { max: 0 } } });
            await addSpell(actor, entry, "Grease");
            expect(await rowFor(actor, "Grease")).to.be.undefined;
        });

        it("expends the slot when a prepared spell is cast", async () => {
            const entry = await addEntry(actor, "Wizard Two", "prepared");
            const spell = await addSpell(actor, entry, "Force Barrage");
            await prepareInSlot(entry, spell.id, 1);
            await clickRank(actor, "Force Barrage", 1);
            const fresh = actor.items.get(entry.id) as typeof entry;
            expect(fresh.system.slots.slot1.prepared[0]?.expended).to.equal(true);
            expect((await rowFor(actor, "Force Barrage"))?.available).to.equal(false);
        });
    });

    describe("Spontaneous slots", () => {
        it("spends one slot of the clicked rank, heightening a signature spell", async () => {
            const actor = await world.character("Spontaneous");
            const entry = await addEntry(actor, "Sorcerer", "spontaneous", {
                slots: { 1: { max: 3 }, 2: { max: 2 } },
            });
            await addSpell(actor, entry, "Fear", { signature: true });
            await clickRank(actor, "Fear", 2);
            const fresh = actor.items.get(entry.id) as typeof entry;
            expect(fresh.system.slots.slot2.value).to.equal(1);
            expect(fresh.system.slots.slot1.value).to.equal(3);
        });
    });

    describe("Innate and focus spells", () => {
        it("spends an innate use", async () => {
            const actor = await world.character("Innate");
            const entry = await addEntry(actor, "Elf Magic", "innate", { tradition: "arcane" });
            const spell = await addSpell(actor, entry, "Fear", { uses: { value: 1, max: 1 } });
            await clickRank(actor, "Fear", 1);
            const fresh = actor.items.get(spell.id) as unknown as { system: { location: { uses?: { value: number } } } };
            expect(fresh.system.location.uses?.value).to.equal(0);
        });

        it("spends a focus point", async () => {
            const actor = await world.character("Focus");
            await actor.createEmbeddedDocuments("Item", [
                {
                    name: "Focus Pool",
                    type: "effect",
                    system: {
                        rules: [{ key: "ActiveEffectLike", mode: "upgrade", path: "system.resources.focus.max", value: 1 }],
                    },
                } as never,
            ]);
            await actor.update({ "system.resources.focus.value": 1 });
            const entry = await addEntry(actor, "Wizard Focus", "focus");
            await addSpell(actor, entry, "Force Bolt");
            const row = await rowFor(actor, "Force Bolt");
            await castOption(actor, row!.castOptions[0]!);
            expect(actor.system.resources.focus.value).to.equal(0);
        });
    });

    describe("Scrolls and wands", () => {
        let actor: CharacterPF2e;
        before(async () => {
            actor = await world.character("Consumables");
            await addEntry(actor, "Wizard", "prepared", { slots: { 1: { max: 1 } } });
        });

        it("uses up a scroll", async () => {
            const scroll = await addSpellConsumable(actor, "scroll", "Fear", 1);
            await clickRank(actor, "Fear", 1);
            expect(actor.items.get(scroll.id)).to.be.undefined;
        });

        it("spends a wand's daily use", async () => {
            const wand = await addSpellConsumable(actor, "wand", "Grease", 1);
            await clickRank(actor, "Grease", 1);
            const fresh = actor.items.get(wand.id) as unknown as { uses: { value: number } };
            expect(fresh.uses.value).to.equal(0);
        });

        it("overcharges a spent wand: a 20 on the flat check leaves it broken", async () => {
            const row = await rowFor(actor, "Grease");
            const overcharge = row!.castOptions.find((o) => o.kind === "wand-overcharge");
            expect(overcharge, "an overcharge option").to.exist;
            const dialogs = foundry.applications.api.DialogV2 as unknown as { confirm: () => Promise<boolean> };
            await withStub(dialogs, "confirm", async () => true, () =>
                // randomUniform near 0 rolls the d20's highest face
                withStub(CONFIG.Dice, "randomUniform", () => 0.001, () => castOption(actor, overcharge!)),
            );
            const wand = actor.items.get(overcharge!.entryId)!;
            expect(wand.getFlag(MODULE_ID, "broken")).to.equal(true);
            expect(wand.getFlag(MODULE_ID, "overchargedOn")).to.be.a("number");
        });

        it("clears the overcharged-today mark on Rest for the Night, but the wand stays broken", async () => {
            const wand = actor.itemTypes.consumable.find((i) => i.category === "wand")!;
            await restForTheNight(actor);
            await waitFor(() => actor.items.get(wand.id)?.getFlag(MODULE_ID, "overchargedOn") == null);
            expect(actor.items.get(wand.id)!.getFlag(MODULE_ID, "broken")).to.equal(true);
        });
    });
}

/** Staves: preparing, spending charges, the spontaneous slot + charge, and the rest flow */
export function stavesBatch({ describe, it, before, after, expect }: BatchContext): void {
    const world = new TestWorld();
    after(() => world.cleanUp());

    let actor: CharacterPF2e;
    let staffId: string;
    let sorcererId: string;
    before(async () => {
        actor = await world.character("Staff");
        const sorcerer = await addEntry(actor, "Sorcerer", "spontaneous", {
            tradition: "arcane",
            slots: { 1: { max: 3 }, 2: { max: 3 }, 3: { max: 2 } },
        });
        sorcererId = sorcerer.id;
        staffId = (await addStaff(actor, "Staff of Fire")).id;
    });

    describe("Staff of Fire on a 3rd-rank sorcerer", () => {
        it("reads the staff's spells from its description", async () => {
            const spells = readStaff(staffOf(actor, staffId) as never).spells;
            expect(JSON.stringify(spells)).to.include("Breathe Fire").and.include("Ignition");
        });

        it("isn't castable until prepared", async () => {
            const row = await rowFor(actor, "Breathe Fire");
            expect(row?.available ?? false).to.equal(false);
        });

        it("prepares with charges equal to the highest slot rank", async () => {
            await prepareStaffFor(actor, staffId);
            const data = readStaff(staffOf(actor, staffId) as never);
            expect(data.preparedBy).to.equal(actor.id);
            expect(data.charges).to.deep.equal({ value: 3, max: 3 });
        });

        it("spends one charge for a 1st-rank spell", async () => {
            await clickRank(actor, "Breathe Fire", 1);
            expect(readStaff(staffOf(actor, staffId) as never).charges.value).to.equal(2);
        });

        it("casts a staff cantrip for free", async () => {
            const row = await rowFor(actor, "Ignition");
            const staffCast = row!.castOptions.find((o) => o.kind === "staff");
            await castOption(actor, staffCast!);
            expect(readStaff(staffOf(actor, staffId) as never).charges.value).to.equal(2);
        });

        it("refills on Rest for the Night, and resets the spontaneous slots", async () => {
            await restForTheNight(actor);
            await waitFor(() => readStaff(staffOf(actor, staffId) as never).charges.value === 3);
            const sorcerer = actor.items.get(sorcererId) as unknown as { system: { slots: Record<string, { value: number }> } };
            expect(sorcerer.system.slots["slot1"]!.value).to.equal(3);
        });
    });
}
