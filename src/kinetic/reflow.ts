import { elementsOf } from "./impulses.ts";
import type { ActionCost } from "./model.ts";

/**
 * Impulse management: the catalog of impulses a kineticist's gates allow, and Reflow Elements' daily swap
 * ("replace one of your impulse feats with a different impulse feat that has the same elemental trait...
 * only impulse feats that have exactly one elemental trait, not composite impulse feats or feats that vary
 * by element. This follows the same rules as retraining"). Pure: src/foundry/reflow.ts supplies the data.
 */

/** An impulse feat from the compendium */
export interface CatalogImpulse {
    uuid: string;
    name: string;
    img: string;
    level: number;
    rarity: string;
    traits: string[];
    cost: ActionCost;
    description: string;
}

/** An impulse feat the kineticist has */
export interface OwnedImpulse {
    id: string;
    name: string;
    img: string;
    level: number;
    traits: string[];
    cost: ActionCost;
    description: string;
    /** The compendium impulse it was made from */
    sourceUuid: string | null;
    /** The highest level a replacement may be: the feat slot's level, or the level of what granted it */
    slotLevel: number;
    /** e.g. "Class feat (level 4)" or the granting feature's name */
    slotLabel: string;
    granted: boolean;
}

export type ReflowBlock = "Composite" | "NoElement" | "SeveralElements";

/** Can this impulse be reflowed? Only feats with exactly one element trait that aren't composite. */
export function reflowBlock(traits: readonly string[]): ReflowBlock | null {
    if (traits.includes("composite")) return "Composite";
    const elements = elementsOf(traits);
    if (elements.length === 0) return "NoElement";
    if (elements.length > 1) return "SeveralElements";
    return null;
}

/** How many impulses Reflow Elements swaps per day: none, one, or two with Double Reflow */
export function reflowsPerDay(featureSlugs: readonly string[]): number {
    if (featureSlugs.includes("double-reflow")) return 2;
    if (featureSlugs.includes("reflow-elements")) return 1;
    return 0;
}

export type CatalogFit = "element" | "composite" | "any";

/**
 * Does the kineticist's set of elements allow this impulse? Single-element impulses need that element,
 * composite impulses need every element they list, and impulses with no element work with any.
 */
export function catalogFit(traits: readonly string[], elements: readonly string[]): CatalogFit | null {
    const own = elementsOf(traits);
    if (own.length === 0) return "any";
    if (traits.includes("composite")) return own.every((e) => elements.includes(e)) ? "composite" : null;
    return own.some((e) => elements.includes(e)) ? "element" : null;
}

export interface CatalogEntry {
    impulse: CatalogImpulse;
    elements: string[];
    fit: CatalogFit;
    owned: boolean;
    /** Above the character's level */
    tooHigh: boolean;
}

function ownedKeys(owned: readonly OwnedImpulse[]): { uuids: Set<string>; names: Set<string> } {
    return {
        uuids: new Set(owned.flatMap((o) => (o.sourceUuid ? [o.sourceUuid] : []))),
        names: new Set(owned.map((o) => o.name.toLowerCase())),
    };
}

/** Every impulse the kineticist's elements allow, sorted by level then name */
export function buildCatalog(
    catalog: readonly CatalogImpulse[],
    elements: readonly string[],
    level: number,
    owned: readonly OwnedImpulse[],
): CatalogEntry[] {
    const keys = ownedKeys(owned);
    return catalog
        .flatMap((impulse) => {
            const fit = catalogFit(impulse.traits, elements);
            if (!fit) return [];
            return [
                {
                    impulse,
                    elements: elementsOf(impulse.traits),
                    fit,
                    owned: keys.uuids.has(impulse.uuid) || keys.names.has(impulse.name.toLowerCase()),
                    tooHigh: impulse.level > level,
                },
            ];
        })
        .sort((a, b) => a.impulse.level - b.impulse.level || a.impulse.name.localeCompare(b.impulse.name));
}

/**
 * What an owned impulse can be reflowed into: a different, unowned impulse feat with the same single element
 * trait (so not composite and not element-less), no higher than the slot it fills.
 */
export function reflowChoices(target: OwnedImpulse, catalog: readonly CatalogEntry[]): CatalogEntry[] {
    if (reflowBlock(target.traits)) return [];
    const element = elementsOf(target.traits)[0]!;
    return catalog.filter(
        (entry) =>
            !entry.owned &&
            entry.impulse.uuid !== target.sourceUuid &&
            entry.impulse.level <= target.slotLevel &&
            reflowBlock(entry.impulse.traits) === null &&
            entry.elements[0] === element,
    );
}

export interface CatalogFilter {
    search: string;
    /** Elements to show; empty shows all */
    elements: string[];
    hideOwned: boolean;
}

export function filterCatalog(entries: readonly CatalogEntry[], filter: CatalogFilter): CatalogEntry[] {
    const search = filter.search.trim().toLowerCase();
    return entries.filter(
        (entry) =>
            (!search || entry.impulse.name.toLowerCase().includes(search)) &&
            (filter.elements.length === 0 ||
                entry.fit === "any" ||
                entry.elements.some((e) => filter.elements.includes(e))) &&
            !(filter.hideOwned && entry.owned),
    );
}

/** The level a replacement may reach: a "class-N" feat slot's N, else the highest level among its granters */
export function slotLevelOf(location: string | null, granterLevels: readonly number[], featLevel: number): number {
    const slot = /^[a-z]+-(\d+)$/.exec(location ?? "");
    if (slot) return Number(slot[1]);
    if (granterLevels.length > 0) return Math.max(...granterLevels);
    return featLevel;
}
