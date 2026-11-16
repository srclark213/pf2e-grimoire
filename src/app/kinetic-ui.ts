import type { ActionCost } from "../kinetic/model.ts";

export const t = (key: string, data?: Record<string, unknown>): string =>
    game.i18n.localize(`PF2EGrimoire.Kinetic.${key}`, data);

export const ELEMENT_ICONS: Record<string, string> = {
    air: "fa-wind",
    earth: "fa-mountain",
    fire: "fa-fire",
    metal: "fa-gear",
    water: "fa-droplet",
    wood: "fa-leaf",
};

export function elementLabel(element: string): string {
    const traits = (CONFIG.PF2E as unknown as { effectTraits: Record<string, string> }).effectTraits;
    return game.i18n.localize(traits[element] ?? element);
}

export function traitLabel(trait: string): string {
    const traits = (CONFIG.PF2E as unknown as { actionTraits: Record<string, string> }).actionTraits;
    return game.i18n.localize(traits[trait] ?? trait);
}

/** pf2e's action font characters: "1", "2", "3", "R", "F" */
export function costGlyph(cost: ActionCost): string {
    if (cost === "reaction") return "R";
    if (cost === "free") return "F";
    if (cost === "passive") return "";
    return cost;
}
