import { MODULE_ID } from "../constants.ts";
import {
    DEFAULT_COLUMNS,
    DEFAULT_SORT,
    normalizeCollapsedSections,
    normalizeColumns,
    normalizeSort,
    type ColumnState,
    type SortState,
} from "../spellbook/table.ts";

const SETTING = "tableView";

export interface TableView {
    sort: SortState;
    columns: ColumnState;
    /** Section keys the player collapsed, e.g. "rank:3" */
    collapsed: string[];
}

/** The spell table's sort and hidden columns: one layout for every character, in this browser. */
export function registerViewSetting(): void {
    game.settings.register(MODULE_ID, SETTING, {
        name: "PF2EGrimoire.Settings.TableView",
        scope: "client",
        config: false,
        type: Object,
        default: { sort: DEFAULT_SORT, columns: DEFAULT_COLUMNS, collapsed: [] },
    });
}

export function loadView(): TableView {
    const raw = (game.settings.get(MODULE_ID, SETTING) ?? {}) as Partial<TableView>;
    return {
        sort: normalizeSort(raw.sort),
        columns: normalizeColumns(raw.columns),
        collapsed: normalizeCollapsedSections(raw.collapsed),
    };
}

export async function saveView(view: TableView): Promise<void> {
    await game.settings.set(MODULE_ID, SETTING, view);
}
