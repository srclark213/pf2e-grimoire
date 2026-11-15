import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SpellSystemSource } from "../../src/spellbook/facets.ts";

const SPELLS = fileURLToPath(new URL("../../vendor/pf2e/packs/pf2e/spells/spells/", import.meta.url));

/** Loads a spell's `system` data from the pinned pf2e submodule, e.g. pf2eSpell("rank-3/fireball"). */
export function pf2eSpell(path: string): SpellSystemSource & { level: { value: number } } {
    const source = JSON.parse(readFileSync(`${SPELLS}${path}.json`, "utf8")) as { system: never };
    return source.system;
}

const EQUIPMENT = fileURLToPath(new URL("../../vendor/pf2e/packs/pf2e/equipment/", import.meta.url));

/** Loads an equipment item's description HTML from the pinned pf2e submodule, e.g. "staff-of-fire". */
export function pf2eDescription(slug: string): string {
    const source = JSON.parse(readFileSync(`${EQUIPMENT}${slug}.json`, "utf8")) as {
        system: { description: { value: string } };
    };
    return source.system.description.value;
}
