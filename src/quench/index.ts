import { MODULE_ID } from "../constants.ts";
import { castingBatch, categoriesBatch, stavesBatch, type BatchContext } from "./batches.ts";

interface Quench {
    registerBatch(key: string, fn: (context: BatchContext) => void, options?: { displayName?: string }): void;
}

/**
 * In-world integration tests, run from Quench's window (the flask in the scene controls) when the Quench
 * module is active. They create throwaway "Grimoire Test" characters and delete them afterwards, so run
 * them in a test world, not the group's real one.
 */
export function registerQuenchTests(): void {
    Hooks.once("quenchReady", (...args: unknown[]) => {
        const quench = args[0] as Quench;
        quench.registerBatch(`${MODULE_ID}.categories`, categoriesBatch, {
            displayName: "PF2e Grimoire: categories from the live compendium",
        });
        quench.registerBatch(`${MODULE_ID}.casting`, castingBatch, {
            displayName: "PF2e Grimoire: casting from slots, focus, innate, scrolls and wands",
        });
        quench.registerBatch(`${MODULE_ID}.staves`, stavesBatch, { displayName: "PF2e Grimoire: staves" });
    });
}
