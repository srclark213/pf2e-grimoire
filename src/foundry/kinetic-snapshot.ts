import type { ActorPF2e, CharacterPF2e } from "@actor";
import type { AbilityItemPF2e, FeatPF2e, ItemPF2e } from "@item";
import { MODULE_ID } from "../constants.ts";
import type {
    ActionCost,
    BlastSnapshot,
    CombatStamp,
    KineticEffectSnapshot,
    KineticItemSnapshot,
    KineticSnapshot,
} from "../kinetic/model.ts";
import { normalizeState } from "../kinetic/state.ts";
import type { RollDataLookup } from "../kinetic/summary.ts";

export const AURA_SLUG = "effect-kinetic-aura";

export function isKineticist(actor: Maybe<ActorPF2e>): actor is CharacterPF2e {
    if (!actor || actor.type !== "character") return false;
    const character = actor as CharacterPF2e;
    return character.class?.slug === "kineticist" || !!character.flags.pf2e?.kineticist;
}

type AbilityLike = AbilityItemPF2e<CharacterPF2e> | FeatPF2e<CharacterPF2e>;

/** The kineticist's actions and feats that have a trait, and an action cost (passive feats aren't usable) */
function usable(actor: CharacterPF2e, trait: string): AbilityLike[] {
    return [...actor.itemTypes.action, ...actor.itemTypes.feat].filter(
        (item) => item.system.traits.value.includes(trait as never) && costOf(item) !== "passive",
    ) as AbilityLike[];
}

export function costOf(item: AbilityLike): ActionCost {
    const cost = item.actionCost;
    if (!cost) return "passive";
    if (cost.type === "action") return String(cost.value ?? 1) as ActionCost;
    return cost.type;
}

export function snapshotItem(item: AbilityLike): KineticItemSnapshot {
    return {
        id: item.id,
        name: item.name,
        img: item.img,
        slug: item.slug ?? "",
        traits: [...item.system.traits.value],
        cost: costOf(item),
        level: item.isOfType("feat") ? item.level : null,
        description: item.system.description.value,
        selfEffect: item.system.selfEffect?.uuid ?? null,
    };
}

export function combatStamp(): CombatStamp | null {
    const combat = game.combat;
    if (!combat?.started) return null;
    return { combat: combat.id, round: combat.round, turn: combat.turn ?? 0 };
}

/** Reads inline-roll data paths ("actor.level") from the actor's roll data */
export function rollDataLookup(actor: CharacterPF2e): RollDataLookup {
    const data = actor.getRollData();
    return (path) => {
        const value = foundry.utils.getProperty(data, path);
        return typeof value === "number" || typeof value === "string" ? value : undefined;
    };
}

/** The item id at the end of an embedded item's uuid */
function idFromUuid(uuid: unknown): string | null {
    if (typeof uuid !== "string") return null;
    return /\.Item\.([^.]+)$/.exec(uuid)?.[1] ?? null;
}

/** Effects the dashboard shows: the aura, gate junction auras, stances, and effects from the kineticist's own impulses */
export function kineticEffects(actor: CharacterPF2e): KineticEffectSnapshot[] {
    const kineticItems = new Map(
        [...usable(actor, "impulse"), ...usable(actor, "infusion"), ...usable(actor, "aura")].map((i) => [i.id, i]),
    );
    const selfEffects = new Set<string>(
        [...kineticItems.values()].flatMap((i) => (i.system.selfEffect?.uuid ? [i.system.selfEffect.uuid] : [])),
    );

    return actor.itemTypes.effect.flatMap((effect) => {
        const originItem = kineticItems.get(idFromUuid(effect.system.context?.origin?.item) ?? "");
        const fromOurs = !!originItem || selfEffects.has(effect.sourceId ?? "");
        const aura = effect.slug === AURA_SLUG;
        const stance =
            !aura &&
            (effect.slug?.startsWith("stance-") ||
                !!originItem?.system.traits.value.includes("stance" as never) ||
                [...kineticItems.values()].some(
                    (i) => i.system.traits.value.includes("stance" as never) && i.system.selfEffect?.uuid === effect.sourceId,
                ));
        const junction = effect.slug?.startsWith("effect-aura-junction") ?? false;
        if (!aura && !stance && !junction && !fromOurs) return [];
        return [{ id: effect.id, name: effect.name, img: effect.img, slug: effect.slug ?? "", stance: !!stance, aura }];
    });
}

async function snapshotBlasts(actor: CharacterPF2e): Promise<KineticSnapshot["blast"]> {
    const item = actor.itemTypes.action.find((a) => a.slug === "elemental-blast");
    if (!item) return null;
    const blast = new game.pf2e.ElementalBlast(actor);
    const configs: BlastSnapshot[] = [];
    for (const config of blast.configs.filter((c) => c.ready)) {
        const damageType = config.damageTypes.find((d) => d.selected)?.value ?? config.damageTypes[0]?.value;
        if (!damageType) continue;
        const formula = async (melee: boolean, outcome: "success" | "criticalSuccess") =>
            (await blast
                .damage({ element: config.element, damageType, melee, outcome, getFormula: true })
                .catch(() => null)) ?? "";
        configs.push({
            element: config.element,
            label: game.i18n.localize(config.label),
            img: config.img,
            damageTypes: config.damageTypes.map((d) => ({ value: d.value, label: d.label, selected: d.selected })),
            range: config.range.label,
            melee: [config.maps.melee.map0, config.maps.melee.map1, config.maps.melee.map2],
            ranged: [config.maps.ranged.map0, config.maps.ranged.map1, config.maps.ranged.map2],
            formula: {
                melee: { hit: await formula(true, "success"), crit: await formula(true, "criticalSuccess") },
                ranged: { hit: await formula(false, "success"), crit: await formula(false, "criticalSuccess") },
            },
        });
    }
    return { itemId: item.id, cost: blast.actionCost, configs };
}

export async function snapshotKineticist(actor: CharacterPF2e): Promise<KineticSnapshot> {
    const kineticist = actor.flags.pf2e?.kineticist as
        | { elements?: { value: string }[]; auraRadius?: number }
        | undefined;
    const options = actor.rollOptions.all;
    const junctions = Object.keys(options)
        .map((option) => /^junction:([a-z]+):([a-z-]+)$/.exec(option))
        .filter((m): m is RegExpExecArray => !!m)
        .map((m) => ({ element: m[1]!, kind: m[2]! }));
    const impulse = actor.getStatistic("impulse");
    const channel = actor.itemTypes.action.find((a) => a.slug === "channel-elements");

    return {
        actorName: actor.name,
        level: actor.level,
        elements: (kineticist?.elements ?? []).map((e) => e.value),
        aura: {
            active: actor.itemTypes.effect.some((e) => e.slug === AURA_SLUG),
            radius: kineticist?.auraRadius ?? 10,
        },
        junctions,
        impulse: { dc: impulse?.dc.value ?? null, modifier: impulse?.check.mod ?? null },
        channel: channel ? snapshotItem(channel) : null,
        blast: await snapshotBlasts(actor),
        impulses: usable(actor, "impulse")
            .filter((i) => i.slug !== "elemental-blast")
            .map(snapshotItem)
            .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang)),
        infusions: usable(actor, "infusion").map(snapshotItem),
        effects: kineticEffects(actor),
        now: combatStamp(),
        state: normalizeState(actor.getFlag(MODULE_ID, "kinetic")),
    };
}

export type { AbilityLike, ItemPF2e };
