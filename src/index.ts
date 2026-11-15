import "./styles/grimoire.css";
import { MODULE_ID } from "./constants.ts";
import { openGrimoire, registerKeybinding, registerSheetButton } from "./launchers.ts";

Hooks.once("init", () => {
    const module = game.modules.get(MODULE_ID);
    if (module) {
        Object.assign(module, { api: { version: module.version, open: openGrimoire } });
    }
    registerKeybinding();
    registerSheetButton();
    console.log(`PF2e Grimoire | Initializing v${module?.version ?? "?"}`);
});

Hooks.once("ready", () => {
    if (game.system.id !== "pf2e") {
        console.warn("PF2e Grimoire | The pf2e system is not active; the module does nothing.");
    }
});
