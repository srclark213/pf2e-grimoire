import type { CharacterPF2e } from "@actor";
import type { ItemPF2e } from "@item";
import { flushSync, mount, unmount } from "svelte";
import { MODULE_ID } from "../constants.ts";
import { castOption } from "../foundry/cast.ts";
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
    #refreshSoon = foundry.utils.debounce(() => this.#refresh(), 50);

    constructor({ actor, ...options }: GrimoireAppOptions) {
        super({ ...options, id: GrimoireApp.idFor(actor) });
        this.actor = actor;
    }

    override get title(): string {
        return game.i18n.localize("PF2EGrimoire.WindowTitle", { actor: this.actor.name });
    }

    protected override async _renderHTML(): Promise<null> {
        this.#refresh();
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

    /** Saves the character's source priority in its flags; null resets it to the default. */
    async #savePriority(priority: PriorityGroup[] | null): Promise<void> {
        if (priority) {
            await this.actor.setFlag(MODULE_ID, "priority", priority);
        } else {
            await this.actor.unsetFlag(MODULE_ID, "priority");
        }
    }

    /** Re-reads the actor and replaces the window's state. */
    #refresh(): void {
        const snapshot = snapshotActor(this.actor);
        this.#state.actorName = this.actor.name;
        this.#state.entryCount = snapshot.entries.length;
        this.#state.cantripRank = cantripRank(snapshot.level);
        this.#state.focus = snapshot.focus?.max ? snapshot.focus : null;
        this.#state.priority = normalizePriority(this.actor.getFlag(MODULE_ID, "priority"));
        this.#state.groups = groupByRank(aggregateSpells(snapshot));
    }
}
