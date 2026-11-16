import type { KineticSnapshot } from "../kinetic/model.ts";
import type { CatalogImpulse, OwnedImpulse } from "../kinetic/reflow.ts";
import type { ReflowStatus } from "../foundry/reflow.ts";
import type { RollDataLookup } from "../kinetic/summary.ts";

/** Reactive state shared between KineticApp and its Svelte components. The app replaces it on actor changes. */
export class KineticState {
    snapshot: KineticSnapshot | null = $state.raw(null);
    /** Resolves inline-roll data paths for impulse summaries */
    lookup: RollDataLookup | undefined = $state.raw(undefined);
    /** The kineticist's impulse feats and the slots they fill */
    owned: OwnedImpulse[] = $state.raw([]);
    reflow: ReflowStatus = $state.raw({ perDay: 0, today: [] });
    /** pf2e's impulse feats, loaded the first time the Impulses tab opens */
    catalog: CatalogImpulse[] | null = $state.raw(null);
}

/** What the dashboard can ask the app to do */
export interface KineticActions {
    use: (itemId: string, event: Event) => Promise<void>;
    openItem: (itemId: string) => void;
    dismissAura: () => Promise<void>;
    removeEffect: (effectId: string) => Promise<void>;
    clearInfusion: () => Promise<void>;
    clearOverflow: () => Promise<void>;
    blastAttack: (element: string, melee: boolean, mapIncreases: number, event: Event) => Promise<void>;
    blastDamage: (element: string, melee: boolean, critical: boolean, event: Event) => Promise<void>;
    setDamageType: (element: string, damageType: string) => Promise<void>;
    setBlastCost: (cost: 1 | 2) => Promise<void>;
    loadCatalog: () => Promise<void>;
    openUuid: (uuid: string) => Promise<void>;
    reflow: (oldId: string, newUuid: string) => Promise<void>;
}
