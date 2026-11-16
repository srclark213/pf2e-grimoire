import type { CharacterPF2e } from "@actor";
import type { FeatPF2e, ItemPF2e } from "@item";
import { MODULE_ID } from "../constants.ts";
import { reflowsPerDay, slotLevelOf, type CatalogImpulse, type OwnedImpulse } from "../kinetic/reflow.ts";
import { costOf } from "./kinetic-snapshot.ts";

const REFLOWED_FLAG = "reflowed";
const IMPULSE_PACK = "pf2e.feats-srd";

const t = (key: string, data?: Record<string, unknown>) => game.i18n.localize(`PF2EGrimoire.Kinetic.${key}`, data);

let catalogPromise: Promise<CatalogImpulse[]> | null = null;

/** Every impulse feat in pf2e's feat compendium. Loaded once: about 115 documents out of the whole pack. */
export function loadImpulseCatalog(): Promise<CatalogImpulse[]> {
    catalogPromise ??= (async () => {
        const pack = game.packs.get(IMPULSE_PACK);
        if (!pack) return [];
        const index = await pack.getIndex({ fields: ["system.traits.value"] });
        const ids = index
            .filter((entry) => {
                const traits = foundry.utils.getProperty(entry, "system.traits.value");
                return Array.isArray(traits) && traits.includes("impulse");
            })
            .map((entry) => entry._id);
        const docs = (await pack.getDocuments({ _id__in: ids })) as unknown as FeatPF2e[];
        return docs.map((doc) => ({
            uuid: doc.uuid,
            name: doc.name,
            img: doc.img,
            level: doc.level,
            rarity: doc.rarity,
            traits: [...doc.system.traits.value],
            cost: costOf(doc as never),
            description: doc.system.description.value,
        }));
    })().catch((error: unknown) => {
        catalogPromise = null;
        throw error;
    });
    return catalogPromise;
}

function itemLevel(item: ItemPF2e): number | null {
    const level = (item as { level?: unknown }).level;
    return typeof level === "number" ? level : null;
}

/** The kineticist's impulse feats, with the slot each one fills */
export function ownedImpulses(actor: CharacterPF2e): OwnedImpulse[] {
    return actor.itemTypes.feat
        .filter((feat) => feat.system.traits.value.includes("impulse" as never))
        .map((feat) => {
            const granters: ItemPF2e[] = [];
            for (
                let granter = actor.items.get(feat.flags.pf2e?.grantedBy?.id ?? "");
                granter && !granters.includes(granter);
                granter = actor.items.get(granter.flags.pf2e?.grantedBy?.id ?? "")
            ) {
                granters.push(granter);
            }
            const location = typeof feat._source.system.location === "string" ? feat._source.system.location : null;
            const slotLevel = Math.min(
                actor.level,
                slotLevelOf(location, granters.flatMap((g) => itemLevel(g) ?? []), feat.level),
            );
            const classSlot = /^class-(\d+)$/.exec(location ?? "");
            const slotLabel = classSlot
                ? t("Manage.ClassSlot", { level: classSlot[1] })
                : granters[0]
                  ? t("Manage.GrantedBy", { name: granters[0].name })
                  : location
                    ? location
                    : t("Manage.NoSlot");
            return {
                id: feat.id,
                name: feat.name,
                img: feat.img,
                level: feat.level,
                traits: [...feat.system.traits.value],
                cost: costOf(feat as never),
                description: feat.system.description.value,
                sourceUuid: feat.sourceId ?? null,
                slotLevel,
                slotLabel,
                granted: granters.length > 0,
            };
        })
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, game.i18n.lang));
}

export interface ReflowStatus {
    perDay: number;
    /** Swaps made since the last Rest for the Night, e.g. "Tidal Hands → Hail of Splinters" */
    today: string[];
}

export function reflowStatus(actor: CharacterPF2e): ReflowStatus {
    const slugs = actor.itemTypes.feat.map((f) => f.slug ?? "");
    const today = actor.getFlag(MODULE_ID, REFLOWED_FLAG);
    return {
        perDay: reflowsPerDay(slugs),
        today: Array.isArray(today) ? today.filter((s): s is string => typeof s === "string") : [],
    };
}

/**
 * Replaces one impulse feat with another, in the same feat slot or under the same granting feature. For a
 * granted impulse (a gate's chosen impulse, Expand the Portal...), the granter's grant and its choice are
 * pointed at the new feat first: deleting a feat its granter still lists can cascade to the granter itself.
 */
export async function reflowImpulse(actor: CharacterPF2e, oldId: string, newUuid: string): Promise<void> {
    const old = actor.items.get(oldId);
    if (!old?.isOfType("feat")) return;
    const replacement = await fromUuid(newUuid);
    if (!(replacement instanceof Item)) {
        ui.notifications.error(t("Manage.NotFound"));
        return;
    }

    const items = game.items as unknown as { fromCompendium(doc: unknown): Record<string, unknown> };
    const source = items.fromCompendium(replacement) as {
        system: { location?: unknown };
        flags: Record<string, Record<string, unknown> | undefined>;
    };
    source.system.location = old._source.system.location ?? null;
    const grantedBy = old.flags.pf2e?.grantedBy;
    if (grantedBy) source.flags.pf2e = { ...(source.flags.pf2e ?? {}), grantedBy: { ...grantedBy } };

    const [created] = (await actor.createEmbeddedDocuments("Item", [source as never])) as ItemPF2e[];
    if (!created) return;

    const granter = grantedBy ? actor.items.get(grantedBy.id) : null;
    if (granter) {
        // Read the granter's source: its prepared flags are rebuilt from its rules on every data prep.
        const flags = (granter._source.flags.pf2e ?? {}) as Record<string, unknown>;
        const grants = (flags.itemGrants ?? {}) as Record<string, { id: string }>;
        const selections = (flags.rulesSelections ?? {}) as Record<string, unknown>;
        const update: Record<string, unknown> = {};
        // The grant's key is also its GrantItem rule's `flag`, so only the id changes.
        for (const [key, grant] of Object.entries(grants)) {
            if (grant.id === old.id) update[`flags.pf2e.itemGrants.${key}.id`] = created.id;
        }
        const oldSource = old.sourceId;
        if (oldSource) {
            for (const [key, value] of Object.entries(selections)) {
                if (value === oldSource) update[`flags.pf2e.rulesSelections.${key}`] = newUuid;
            }
            // The choice itself lives on the ChoiceSet rule (e.g. a gate's "impulseOne").
            const rules = foundry.utils.deepClone(granter._source.system.rules) as { key: string; selection?: unknown }[];
            let rulesChanged = false;
            for (const rule of rules) {
                if (rule.key === "ChoiceSet" && rule.selection === oldSource) {
                    rule.selection = newUuid;
                    rulesChanged = true;
                }
            }
            if (rulesChanged) update["system.rules"] = rules;
        }
        if (Object.keys(update).length > 0) await granter.update(update);
        await old.update({ "flags.pf2e.-=grantedBy": null } as never);
    }
    await actor.deleteEmbeddedDocuments("Item", [old.id]);

    const { today } = reflowStatus(actor);
    await actor.setFlag(MODULE_ID, REFLOWED_FLAG, [...today, `${old.name} → ${created.name}`]);
    ui.notifications.info(t("Manage.Swapped", { old: old.name, new: created.name }));
}

/** Daily preparations: Reflow Elements is available again */
export async function resetReflow(actor: CharacterPF2e): Promise<void> {
    if (actor.getFlag(MODULE_ID, REFLOWED_FLAG) !== undefined) await actor.unsetFlag(MODULE_ID, REFLOWED_FLAG);
}
