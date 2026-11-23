import type { CharacterPF2e } from "@actor";
import type { ItemPF2e } from "@item";
import { flushSync, mount, unmount } from "svelte";
import { MODULE_ID } from "../constants.ts";
import {
    blastAttack,
    blastDamage,
    clearInfusion,
    clearOverflow,
    deactivateAura,
    removeEffect,
    setBlastCost,
    setBlastDamageType,
    useKineticItem,
} from "../foundry/kinetic.ts";
import { shareItem, shareUuid } from "../foundry/share.ts";
import { rollDataLookup, snapshotKineticist } from "../foundry/kinetic-snapshot.ts";
import { loadImpulseCatalog, ownedImpulses, reflowImpulse, reflowStatus } from "../foundry/reflow.ts";
import Kinetic from "./Kinetic.svelte";
import { KineticState, type KineticActions } from "./kinetic-state.svelte.ts";

const { ApplicationV2 } = foundry.applications.api;

interface KineticAppOptions extends DeepPartial<fa.ApplicationConfiguration> {
    actor: CharacterPF2e;
}

/** The Kinetic Gate dashboard: one per kineticist, a Svelte root inside an ApplicationV2 frame. */
export class KineticApp extends ApplicationV2 {
    static override DEFAULT_OPTIONS: DeepPartial<fa.ApplicationConfiguration> = {
        classes: [MODULE_ID, `${MODULE_ID}-kinetic`],
        window: { icon: "fa-solid fa-wind", resizable: true },
        position: { width: 560, height: 720 },
    };

    static open(actor: CharacterPF2e): KineticApp {
        const existing = foundry.applications.instances.get(KineticApp.idFor(actor));
        if (existing instanceof KineticApp) {
            if (existing.minimized) void existing.maximize();
            existing.bringToFront();
            return existing;
        }
        const app = new KineticApp({ actor });
        void app.render({ force: true });
        return app;
    }

    static idFor(actor: CharacterPF2e): string {
        return `${MODULE_ID}-kinetic-${actor.uuid.replaceAll(".", "-")}`;
    }

    readonly actor: CharacterPF2e;

    #state = new KineticState();
    #component: Record<string, unknown> | null = null;
    #hookIds: [string, number][] = [];
    #refreshSoon = foundry.utils.debounce(() => void this.#refresh(), 50);

    constructor({ actor, ...options }: KineticAppOptions) {
        super({ ...options, id: KineticApp.idFor(actor) });
        this.actor = actor;
    }

    override get title(): string {
        return game.i18n.localize("PF2EGrimoire.Kinetic.WindowTitle", { actor: this.actor.name });
    }

    protected override async _renderHTML(): Promise<null> {
        await this.#refresh();
        return null;
    }

    protected override _replaceHTML(_result: unknown, content: HTMLElement, options: fa.ApplicationRenderOptions): void {
        if (!options.isFirstRender) return;
        const actor = this.actor;
        const actions: KineticActions = {
            use: (itemId, event) => useKineticItem(actor, itemId, event),
            share: (itemId) => shareItem(actor, itemId),
            shareUuid: (uuid) => shareUuid(actor, uuid),
            openItem: (itemId) => void actor.items.get(itemId)?.sheet.render(true),
            dismissAura: async () => void (await deactivateAura(actor)),
            removeEffect: (effectId) => removeEffect(actor, effectId),
            clearInfusion: () => clearInfusion(actor),
            clearOverflow: () => clearOverflow(actor),
            blastAttack: (element, melee, mapIncreases, event) =>
                blastAttack(actor, { element, melee, mapIncreases, event }),
            blastDamage: (element, melee, critical, event) => blastDamage(actor, { element, melee, critical, event }),
            setDamageType: (element, damageType) => setBlastDamageType(actor, element, damageType),
            setBlastCost: async (cost) => {
                const itemId = this.#state.snapshot?.blast?.itemId;
                if (itemId) await setBlastCost(actor, itemId, cost);
            },
            loadCatalog: async () => {
                if (this.#state.catalog) return;
                this.#state.catalog = await loadImpulseCatalog();
            },
            openUuid: async (uuid) => {
                const doc = (await fromUuid(uuid)) as { sheet?: { render(force: boolean): unknown } } | null;
                doc?.sheet?.render(true);
            },
            reflow: (oldId, newUuid) => reflowImpulse(actor, oldId, newUuid),
        };
        this.#component = mount(Kinetic, { target: content, props: { kinetic: this.#state, actions } });
        flushSync();
    }

    protected override async _onFirstRender(
        context: fa.ApplicationRenderContext,
        options: fa.ApplicationRenderOptions,
    ): Promise<void> {
        await super._onFirstRender(context, options);
        this.#on("updateActor", (actor: CharacterPF2e) => {
            if (actor.uuid === this.actor.uuid) this.#refreshSoon();
        });
        for (const hook of ["createItem", "updateItem", "deleteItem"]) {
            this.#on(hook, (item: ItemPF2e) => {
                if (item.actor?.uuid === this.actor.uuid) this.#refreshSoon();
            });
        }
        // Per-round and per-turn state (overflow, infusions) expires as combat moves on.
        for (const hook of ["updateCombat", "deleteCombat", "combatStart"]) {
            this.#on(hook, () => this.#refreshSoon());
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

    async #refresh(): Promise<void> {
        this.#state.snapshot = await snapshotKineticist(this.actor);
        this.#state.lookup = rollDataLookup(this.actor);
        this.#state.owned = ownedImpulses(this.actor);
        this.#state.reflow = reflowStatus(this.actor);
    }
}
