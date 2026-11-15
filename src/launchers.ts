import type { ActorPF2e, CharacterPF2e } from "@actor";
import type { ApplicationV1HeaderButton } from "@client/appv1/api/application-v1.d.mts";
import { GrimoireApp } from "./app/grimoire-app.ts";
import { MODULE_ID } from "./constants.ts";

function isCharacter(actor: Maybe<ActorPF2e>): actor is CharacterPF2e {
    return !!actor && actor.type === "character";
}

/** Opens the Grimoire for a character. Exposed as `game.modules.get("pf2e-grimoire").api.open`. */
export function openGrimoire(actor: Maybe<ActorPF2e>): GrimoireApp | null {
    if (!isCharacter(actor)) {
        ui.notifications.warn(game.i18n.localize("PF2EGrimoire.Warning.NotCharacter"));
        return null;
    }
    return GrimoireApp.open(actor);
}

/**
 * Adds a Grimoire button to character sheet headers.
 * pf2e's character sheet is still an ApplicationV1 sheet, so this uses the V1 header-button hook.
 * The hook is the core ActorSheet one: pf2e's own class names may be minified in its build.
 */
export function registerSheetButton(): void {
    Hooks.on("getActorSheetHeaderButtons", (...args: unknown[]) => {
        const [sheet, buttons] = args as [{ actor: ActorPF2e }, ApplicationV1HeaderButton[]];
        const actor = sheet.actor;
        if (!isCharacter(actor) || !actor.isOwner) return;
        buttons.unshift({
            label: game.i18n.localize("PF2EGrimoire.SheetButton"),
            class: `${MODULE_ID}-open`,
            icon: "fa-solid fa-book-sparkles",
            onclick: () => GrimoireApp.open(actor),
        });
    });
}

/** The character a keybinding acts on: the one controlled token's actor, else the user's assigned character. */
function keybindingActor(): ActorPF2e | null {
    const controlled = canvas.ready ? canvas.tokens.controlled : [];
    const tokenActor: ActorPF2e | null = controlled.length === 1 ? (controlled[0]?.actor ?? null) : null;
    if (isCharacter(tokenActor)) return tokenActor;
    return game.user.character ?? null;
}

export function registerKeybinding(): void {
    game.keybindings.register(MODULE_ID, "open", {
        name: "PF2EGrimoire.Keybinding.Open.Name",
        hint: "PF2EGrimoire.Keybinding.Open.Hint",
        editable: [{ key: "KeyG", modifiers: ["Shift"] }],
        onDown: (): boolean => {
            openGrimoire(keybindingActor());
            return true;
        },
    });
}
