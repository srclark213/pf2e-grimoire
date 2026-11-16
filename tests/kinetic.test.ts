import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { blastStatus, impulseRows, infusionTarget, plainText } from "../src/kinetic/impulses.ts";
import type { ActionCost, KineticItemSnapshot, KineticSnapshot, KineticState } from "../src/kinetic/model.ts";
import { EMPTY_STATE } from "../src/kinetic/model.ts";
import { applyUse, liveInfusion, normalizeState, overflowUsed, type UsedItem } from "../src/kinetic/state.ts";
import { levelLookup, resolveFormula, summarizeImpulse } from "../src/kinetic/summary.ts";

const KINETICIST = fileURLToPath(new URL("../vendor/pf2e/packs/pf2e/feats/class/kineticist/", import.meta.url));
const ACTIONS = fileURLToPath(new URL("../vendor/pf2e/packs/pf2e/actions/class/kineticist/", import.meta.url));

interface FeatSource {
    name: string;
    system: {
        slug?: string;
        description: { value: string };
        traits: { value: string[] };
        actionType: { value: string };
        actions: { value: number | null };
        level?: { value: number };
    };
}

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : name.endsWith(".json") ? [path] : [];
    });
}

const SOURCES: FeatSource[] = [...walk(KINETICIST), ...walk(ACTIONS)].map(
    (path) => JSON.parse(readFileSync(path, "utf8")) as FeatSource,
);

function source(name: string): FeatSource {
    const found = SOURCES.find((s) => s.name === name);
    if (!found) throw new Error(`No kineticist source named ${name}`);
    return found;
}

function costOf(s: FeatSource): ActionCost {
    const type = s.system.actionType.value;
    if (type === "action") return String(s.system.actions.value ?? 1) as ActionCost;
    return type as ActionCost;
}

function item(name: string): KineticItemSnapshot {
    const s = source(name);
    return {
        id: s.name.toLowerCase().replaceAll(" ", "-"),
        name: s.name,
        img: "",
        slug: s.name.toLowerCase().replaceAll(" ", "-"),
        traits: s.system.traits.value,
        cost: costOf(s),
        level: s.system.level?.value ?? null,
        description: s.system.description.value,
        selfEffect: null,
    };
}

const COMBAT = { combat: "c1", round: 2, turn: 1 };

function snapshot(overrides: Partial<KineticSnapshot> = {}): KineticSnapshot {
    return {
        actorName: "Shaun",
        level: 14,
        elements: ["water", "air"],
        aura: { active: true, radius: 10 },
        junctions: [],
        impulse: { dc: 33, modifier: 25 },
        channel: null,
        blast: { itemId: "blast", cost: 2, configs: [] },
        impulses: ["Tidal Hands", "Winter Sleet", "Rising Hurricane", "Deflecting Wave", "Four Winds"].map(item),
        infusions: ["Chain Infusion", "Pacifying Infusion"].map(item),
        effects: [],
        now: COMBAT,
        state: { ...EMPTY_STATE },
        ...overrides,
    };
}

function used(kind: UsedItem["kind"], overrides: Partial<UsedItem> = {}): UsedItem {
    return { kind, itemId: kind, name: kind, cost: "1", overflow: false, stance: false, ...overrides };
}

describe("resolveFormula", () => {
    it("resolves level formulas to dice", () => {
        expect(resolveFormula("(floor((@actor.level -1)/2)+1)d8[bludgeoning]", levelLookup(14))).toBe("7d8 bludgeoning");
        expect(resolveFormula("(floor((@actor.level -6)/3)+2)d6[bludgeoning]", levelLookup(14))).toBe("4d6 bludgeoning");
    });

    it("looks up other roll data, and drops what it can't find", () => {
        const lookup = (path: string) => (path === "actor.level" ? 14 : path.endsWith("thermalNimbus") ? "fire" : undefined);
        expect(resolveFormula("(floor(@actor.level/2))[@actor.flags.system.kineticist.thermalNimbus]", lookup)).toBe("7 fire");
        expect(resolveFormula("(floor(@actor.level/2))[@actor.flags.system.kineticist.thermalNimbus]", levelLookup(14))).toBe("7");
    });

    it("keeps flat parts and persistent damage", () => {
        expect(resolveFormula("(2d6+4)[fire]", levelLookup(5))).toBe("2d6 + 4 fire");
        expect(resolveFormula("4d6[persistent,bleed]", levelLookup(5))).toBe("4d6 persistent bleed");
        expect(resolveFormula("max(1,floor(@actor.level/2))d6[cold]", levelLookup(7))).toBe("3d6 cold");
    });
});

describe("summarizeImpulse on real impulses", () => {
    it("Tidal Hands: 7d8 bludgeoning, basic Reflex, cone at level 14", () => {
        expect(summarizeImpulse(source("Tidal Hands").system.description.value, levelLookup(14))).toEqual({
            damage: ["7d8 bludgeoning"],
            save: "basic Reflex",
            area: "15-foot cones",
        });
    });

    it("Rising Hurricane uses the template's own label", () => {
        expect(summarizeImpulse(source("Rising Hurricane").system.description.value, levelLookup(14))).toMatchObject({
            damage: ["4d6 bludgeoning"],
            save: "basic Fortitude",
            area: "30-foot diameter",
        });
    });

    it("leaves no unresolved @actor or @item references in any impulse's damage", () => {
        const impulses = SOURCES.filter((s) => s.system.traits.value.includes("impulse"));
        expect(impulses.length).toBeGreaterThan(100);
        for (const impulse of impulses) {
            for (const level of [1, 10, 20]) {
                const { damage } = summarizeImpulse(impulse.system.description.value, levelLookup(level));
                for (const formula of damage) {
                    expect(formula, `${impulse.name} at ${level}: ${formula}`).not.toMatch(/@|floor|ceil|\(|\)/);
                }
            }
        }
    });
});

describe("infusionTarget", () => {
    it("Chain Infusion modifies an Elemental Blast and chains up to five blasts", () => {
        expect(infusionTarget(source("Chain Infusion").system.description.value)).toEqual({ target: "blast", chain: 5 });
    });

    it("Pacifying Infusion modifies any impulse", () => {
        expect(infusionTarget(source("Pacifying Infusion").system.description.value)).toEqual({
            target: "impulse",
            chain: null,
        });
    });

    it("every infusion in pf2e names a target", () => {
        const infusions = SOURCES.filter((s) => s.system.traits.value.includes("infusion"));
        expect(infusions.map((s) => s.name).sort()).toEqual(
            expect.arrayContaining(["Chain Infusion", "Two-Element Infusion", "Weapon Infusion"]),
        );
        for (const infusion of infusions) {
            expect(plainText(infusion.system.description.value), infusion.name).toMatch(/next action/i);
        }
        expect(infusionTarget(source("Weapon Infusion").system.description.value).target).toBe("blast");
        expect(infusionTarget(source("Two-Element Infusion").system.description.value).target).toBe("blast");
    });
});

describe("applyUse: overflow", () => {
    it("an overflow impulse ends the aura and marks the round", () => {
        const out = applyUse(EMPTY_STATE, used("impulse", { name: "Tidal Hands", overflow: true }), COMBAT);
        expect(out.deactivateAura).toBe(true);
        expect(out.notices).toEqual([{ key: "Overflow", item: "Tidal Hands" }]);
        expect(overflowUsed(out.state, COMBAT)).toBe(true);
        expect(overflowUsed(out.state, { ...COMBAT, round: 3 })).toBe(false);
    });

    it("warns about a second overflow in one round", () => {
        const state: KineticState = { ...EMPTY_STATE, overflow: { ...COMBAT, turn: 1 } };
        const out = applyUse(state, used("impulse", { name: "Glacial Prison", overflow: true }), COMBAT);
        expect(out.notices).toEqual([{ key: "OverflowTwice", item: "Glacial Prison" }]);
    });
});

describe("applyUse: infusions", () => {
    const prime = (target: "blast" | "impulse", chain: number | null = null) =>
        applyUse(EMPTY_STATE, used("infusion", { name: "Infusion", infusion: { target, chain } }), COMBAT).state;

    it("an impulse infusion applies to the next impulse", () => {
        const out = applyUse(prime("impulse"), used("impulse", { name: "Tidal Hands" }), COMBAT);
        expect(out.notices).toEqual([{ key: "InfusionApplied", infusion: "Infusion", item: "Tidal Hands" }]);
        expect(out.state.infusion).toBeNull();
    });

    it("a blast infusion is wasted on another impulse, or on any other action", () => {
        expect(applyUse(prime("blast"), used("impulse", { name: "Tidal Hands" }), COMBAT).notices[0]?.key).toBe(
            "InfusionWasted",
        );
        expect(applyUse(prime("impulse"), used("other", { name: "Stride" }), COMBAT).notices[0]?.key).toBe(
            "InfusionWasted",
        );
        expect(applyUse(prime("impulse"), used("channel"), COMBAT).notices[0]?.key).toBe("InfusionWasted");
    });

    it("lapses when the turn passes", () => {
        const state = prime("blast");
        expect(liveInfusion(state, COMBAT)).not.toBeNull();
        expect(liveInfusion(state, { ...COMBAT, turn: 2 })).toBeNull();
        expect(liveInfusion(state, null)).toBeNull();
        expect(applyUse(state, used("blast"), { ...COMBAT, turn: 2 }).notices).toEqual([]);
    });

    it("Chain Infusion counts blasts until five, then ends", () => {
        let state = prime("blast", 5);
        for (let blast = 1; blast <= 4; blast++) {
            const out = applyUse(state, used("blast"), COMBAT);
            expect(out.notices).toEqual([{ key: "ChainContinues", blasts: blast, max: 5 }]);
            state = out.state;
        }
        const last = applyUse(state, used("blast"), COMBAT);
        expect(last.notices).toEqual([{ key: "ChainEnded", blasts: 5 }]);
        expect(last.state.infusion).toBeNull();
    });

    it("a chain that already hit ends quietly when you do something else", () => {
        const state = applyUse(prime("blast", 5), used("blast"), COMBAT).state;
        const out = applyUse(state, used("impulse", { name: "Tidal Hands" }), COMBAT);
        expect(out.notices).toEqual([]);
        expect(out.state.infusion).toBeNull();
    });
});

describe("applyUse: Channel Elements", () => {
    it("a 1-action blast or stance rides along; a 2-action blast doesn't", () => {
        const state = applyUse(EMPTY_STATE, used("channel"), COMBAT).state;
        expect(applyUse(state, used("blast", { name: "Blast" }), COMBAT).notices).toEqual([
            { key: "ChannelRider", item: "Blast" },
        ]);
        expect(applyUse(state, used("impulse", { stance: true, name: "Winter Sleet" }), COMBAT).notices).toEqual([
            { key: "ChannelRider", item: "Winter Sleet" },
        ]);
        expect(applyUse(state, used("blast", { cost: "2" }), COMBAT).notices).toEqual([]);
        expect(applyUse(state, used("blast"), COMBAT).state.channel).toBe(false);
    });
});

describe("normalizeState", () => {
    it("tolerates missing or broken flags", () => {
        expect(normalizeState(undefined)).toEqual(EMPTY_STATE);
        expect(normalizeState({ overflow: 3, infusion: { itemId: 1 }, channel: "x" })).toEqual(EMPTY_STATE);
    });
});

describe("impulseRows", () => {
    it("sorts impulses into stance, overflow, reaction and other sections", () => {
        const rows = impulseRows(snapshot());
        const section = (name: string) => rows.find((r) => r.item.name === name)?.section;
        expect(section("Winter Sleet")).toBe("stance");
        expect(section("Tidal Hands")).toBe("overflow");
        expect(section("Deflecting Wave")).toBe("reaction");
        expect(section("Four Winds")).toBe("impulse");
        expect(rows.find((r) => r.item.name === "Rising Hurricane")).toMatchObject({
            composite: true,
            overflow: true,
            elements: ["air", "water"],
        });
    });

    it("blocks everything while the aura is dormant", () => {
        const rows = impulseRows(snapshot({ aura: { active: false, radius: 10 } }));
        expect(rows.every((r) => r.blocks.some((b) => b.key === "AuraDormant"))).toBe(true);
        expect(blastStatus(snapshot({ aura: { active: false, radius: 10 } })).blocks).toEqual([{ key: "AuraDormant" }]);
    });

    it("blocks a second overflow and warns that overflow ends the stance", () => {
        const rows = impulseRows(
            snapshot({
                state: { ...EMPTY_STATE, overflow: COMBAT },
                effects: [{ id: "e", name: "Stance: Winter Sleet", img: "", slug: "stance-winter-sleet", stance: true, aura: false }],
            }),
        );
        const tidal = rows.find((r) => r.item.name === "Tidal Hands")!;
        expect(tidal.blocks).toEqual([{ key: "OverflowUsed" }]);
        expect(tidal.warnings).toEqual([{ key: "EndsAura" }, { key: "EndsStances", names: "Stance: Winter Sleet" }]);
        expect(rows.find((r) => r.item.name === "Four Winds")!.blocks).toEqual([]);
    });

    it("highlights what a primed infusion applies to, and warns where it would be wasted", () => {
        const pacifying = applyUse(
            EMPTY_STATE,
            used("infusion", { name: "Pacifying Infusion", infusion: { target: "impulse", chain: null } }),
            COMBAT,
        ).state;
        expect(impulseRows(snapshot({ state: pacifying })).every((r) => r.highlight === "infusion")).toBe(true);

        const chain = applyUse(
            EMPTY_STATE,
            used("infusion", { name: "Chain Infusion", infusion: { target: "blast", chain: 5 } }),
            COMBAT,
        ).state;
        const rows = impulseRows(snapshot({ state: chain }));
        expect(rows.every((r) => r.warnings.some((w) => w.key === "WastesInfusion"))).toBe(true);
        expect(blastStatus(snapshot({ state: chain })).infused).toBe(true);
    });

    it("after Channel Elements, highlights 1-action stances and asks for a 1-action blast", () => {
        const state = applyUse(EMPTY_STATE, used("channel"), COMBAT).state;
        const rows = impulseRows(snapshot({ state }));
        expect(rows.filter((r) => r.highlight === "channel").map((r) => r.item.name)).toEqual(["Winter Sleet"]);
        expect(blastStatus(snapshot({ state })).channel).toBe("needs-one-action");
        expect(blastStatus(snapshot({ state, blast: { itemId: "b", cost: 1, configs: [] } })).channel).toBe("free");
    });
});
