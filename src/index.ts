import "./styles/grimoire.css";
import { MODULE_ID } from "./constants.ts";
import { registerCollapsedSetting, registerFilterSetting } from "./foundry/filter-store.ts";
import { registerViewSetting } from "./foundry/view-store.ts";
import { registerRestHook } from "./foundry/wands.ts";
import { registerKineticHooks, registerKineticSettings } from "./foundry/kinetic.ts";
import { openGrimoire, openKinetic, registerKeybinding, registerSheetButton } from "./launchers.ts";
import { registerQuenchTests } from "./quench/index.ts";

Hooks.once("init", () => {
    const module = game.modules.get(MODULE_ID);
    if (module) {
        Object.assign(module, { api: { version: module.version, open: openGrimoire, openKinetic } });
    }
    registerFilterSetting();
    registerCollapsedSetting();
    registerViewSetting();
    registerKeybinding();
    registerSheetButton();
    registerRestHook();
    registerKineticSettings();
    registerKineticHooks();
    registerQuenchTests();
    console.log(`PF2e Grimoire | Initializing v${module?.version ?? "?"}`);
});

Hooks.once("ready", () => {
    if (game.system.id !== "pf2e") {
        console.warn("PF2e Grimoire | The pf2e system is not active; the module does nothing.");
    }
});
