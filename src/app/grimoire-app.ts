import type { CharacterPF2e } from "@actor";
import type { ItemPF2e } from "@item";
import { flushSync, mount, unmount } from "svelte";
import { MODULE_ID } from "../constants.ts";
import { castOption } from "../foundry/cast.ts";
import { loadStaffSpells, prepareStaffFor } from "../foundry/staves.ts";
import { repairWand } from "../foundry/wands.ts";
import { loadCollapsed, loadFilter, saveCollapsed, saveFilter } from "../foundry/filter-store.ts";
import type { ChipGroup, FilterState } from "../spellbook/filter.ts";
import { snapshotActor } from "../foundry/snapshot.ts";
import { aggregateSpells, groupByRank } from "../spellbook/aggregator.ts";
import { cantripRank } from "../spellbook/labels.ts";
import type { CastOption } from "../spellbook/model.ts";
import type { PriorityGroup } from "../spellbook/cast-resolver.ts";
import { normalizePriority } from "../spellbook/priority.ts";
import Grimoire from "./Grimoire.svelte";
import { GrimoireState } from "./grimoire-state.svelte.ts";

const { ApplicationV2 } = foundry.applications.api;

interface GrimoireAppOptions extends DeepPartial<fa.ApplicationConfiguration> {
    actor: CharacterPF2e;
}

/** The Grimoire window: one per actor, a Svelte root inside an ApplicationV2 frame. */
export class GrimoireApp extends ApplicationV2 {
    static override DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        classes: [MODULE_ID],
        window: { icon: "fa-solid fa-book-sparkles", resizable: true },
        position: { width: 480, height: 640 },
    };

    /** Opens the Grimoire for an actor, or brings its window forward if it is already open. */
    static open(actor: CharacterPF2e): GrimoireApp {
        const existing = foundry.applications.instances.get(GrimoireApp.idFor(actor));
        if (existing instanceof GrimoireApp) {
            if (existing.minimized) void existing.maximize();
            existing.bringToFront();
            return existing;
        }
        const app = new GrimoireApp({ actor });
        void app.render({ force: true });
        return app;
    }

    static idFor(actor: CharacterPF2e): string {
        return `${MODULE_ID}-${actor.uuid.replaceAll(".", "-")}`;
    }

    readonly actor: CharacterPF2e;

    #state = new GrimoireState();
    #component: Record<string, unknown> | null = null;
    #hookIds: [string, number][] = [];
    #refreshSoon = foundry.utils.debounce(() => void this.#refresh(), 50);
    #saveFilterSoon = foundry.utils.debounce(() => void saveFilter(this.actor.uuid, this.#state.filter), 400);

    constructor({ actor, ...options }: GrimoireAppOptions) {
        super({ ...options, id: GrimoireApp.idFor(actor) });
        this.actor = actor;
        this.#state.filter = loadFilter(actor.uuid);
        this.#state.collapsed = loadCollapsed();
    }

    override get title(): string {
        return game.i18n.localize("PF2EGrimoire.WindowTitle", { actor: this.actor.name });
    }

    protected override async _renderHTML(): Promise<null> {
        await this.#refresh();
        return null;
    }

    protected override _replaceHTML(_result: unknown, content: HTMLElement, options: fa.ApplicationRenderOptions): void {
        if (options.isFirstRender) {
            this.#component = mount(Grimoire, {
                target: content,
                props: {
                    grimoire: this.#state,
                    openSpell: (spellId: string) => this.#openSpell(spellId),
                    cast: (option: CastOption) => castOption(this.actor, option),
                    savePriority: (priority: PriorityGroup[] | null) => this.#savePriority(priority),
                    setFilter: (filter: FilterState) => this.#setFilter(filter),
                    setCollapsed: (collapsed: ChipGroup[]) => this.#setCollapsed(collapsed),
                    setTags: (spellIds: string[], tags: string[]) => this.#setTags(spellIds, tags),
                    repairWand: (wandId: string) => repairWand(this.actor, wandId),
                    prepareStaff: (staffId: string) => prepareStaffFor(this.actor, staffId),
                },
            });
            flushSync();
        }
    }

    protected override async _onFirstRender(
        context: fa.ApplicationRenderContext,
        options: fa.ApplicationRenderOptions,
    ): Promise<void> {
        await super._onFirstRender(context, options);
        const isOurs = (item: ItemPF2e) => item.actor?.uuid === this.actor.uuid;
        this.#on("updateActor", (actor: CharacterPF2e) => {
            if (actor.uuid === this.actor.uuid) this.#refreshSoon();
        });
        for (const hook of ["createItem", "updateItem", "deleteItem"]) {
            this.#on(hook, (item: ItemPF2e) => {
                if (isOurs(item)) this.#refreshSoon();
            });
        }
    }

    protected override _onClose(options: fa.ApplicationClosingOptions): void {
        super._onClose(options);
        for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
        this.#hookIds = [];
        if (this.#component) void unmount(this.#component);
        this.#component = null;
    }

    #on<T extends unknown[]>(hook: string, fn: (...args: T) => void): void {
        this.#hookIds.push([hook, Hooks.on(hook, fn as (...args: unknown[]) => void)]);
    }

    /** Opens a spell's item sheet. */
    #openSpell(spellId: string): void {
        void this.actor.items.get(spellId)?.sheet.render(true);
    }

    /** Saves a row's tags on every spell item the row merges, so they survive one copy being removed. */
    async #setTags(spellIds: string[], tags: string[]): Promise<void> {
        const path = `flags.${MODULE_ID}.tags`;
        await this.actor.updateEmbeddedDocuments(
            "Item",
            spellIds.map((_id) => ({ _id, [path]: tags })),
        );
    }

    /** Applies a new filter now and remembers it for this character shortly after. */
    #setFilter(filter: FilterState): void {
        this.#state.filter = filter;
        this.#saveFilterSoon();
    }

    /** Collapses or expands filter rows now and remembers the layout for every character. */
    #setCollapsed(collapsed: ChipGroup[]): void {
        this.#state.collapsed = collapsed;
        void saveCollapsed(collapsed);
    }

    /** Saves the character's source priority in its flags; null resets it to the default. */
    async #savePriority(priority: PriorityGroup[] | null): Promise<void> {
        if (priority) {
            await this.actor.setFlag(MODULE_ID, "priority", priority);
        } else {
            await this.actor.unsetFlag(MODULE_ID, "priority");
        }
    }

    /** Re-reads the actor and replaces the window's state. */
    async #refresh(): Promise<void> {
        // Staff spells live in compendiums; load any new ones before reading the actor.
        await loadStaffSpells(this.actor);
        const snapshot = snapshotActor(this.actor);
        this.#state.actorName = this.actor.name;
        this.#state.entryCount = snapshot.entries.length;
        this.#state.cantripRank = cantripRank(snapshot.level);
        this.#state.focus = snapshot.focus?.max ? snapshot.focus : null;
        this.#state.staves = snapshot.staves;
        this.#state.priority = normalizePriority(this.actor.getFlag(MODULE_ID, "priority"));
        this.#state.groups = groupByRank(aggregateSpells(snapshot));
    }
}
