import { MODULE_ID } from "../constants.ts";
import { normalizeFilter, type FilterState } from "../spellbook/filter.ts";

const SETTING = "filters";

/**
 * The last filter per character is kept in a client setting (this browser, this user), keyed by actor UUID.
 * Unlike an actor flag, changing it doesn't update the actor document for every connected client.
 */
export function registerFilterSetting(): void {
    game.settings.register(MODULE_ID, SETTING, {
        name: "PF2EGrimoire.Settings.Filters",
        scope: "client",
        config: false,
        type: Object,
        default: {},
    });
}

function all(): Record<string, unknown> {
    const value = game.settings.get(MODULE_ID, SETTING) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function loadFilter(actorUuid: string): FilterState {
    return normalizeFilter(all()[actorUuid]);
}

export async function saveFilter(actorUuid: string, filter: FilterState): Promise<void> {
    const filters = { ...all() };
    if (filter.search.trim() === "" && filter.chips.length === 0) {
        delete filters[actorUuid];
    } else {
        filters[actorUuid] = filter;
    }
    await game.settings.set(MODULE_ID, SETTING, filters);
}
