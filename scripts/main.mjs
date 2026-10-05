import { MODULE_ID } from "./constants.mjs";
import { applyHudTheme, applyPlayerListVisibility, registerSettings } from "./settings.mjs";
import { SymbaroumHud } from "./applications/symbaroum-hud.mjs";
import { registerRefreshHooks, registerSceneControlsHooks } from "./hooks.mjs";
import {
  registerHotbarShortcutKeybindings,
  registerHotbarShortcuts
} from "./integrations/hotbar-shortcuts.mjs";
import { ContextService } from "./services/context-service.mjs";
import { registerCharacterCreatorHooks } from "./services/character-creator-service.mjs";
import { HotbarShortcutService } from "./services/hotbar-shortcut-service.mjs";
import {
  CharacterPdfExportService,
  registerCharacterPdfExportHooks
} from "./services/character-pdf-export-service.mjs";

let hud = null;

Hooks.once("init", () => {
  if (!("alternatives" in globalThis)) globalThis.alternatives = [];
  registerHotbarShortcutKeybindings();
  registerSettings(() => {
    if (game.ready) Hooks.callAll(`${MODULE_ID}.refresh`);
  });
});

Hooks.once("setup", () => {
  hud = new SymbaroumHud();
  HotbarShortcutService.setActorResolver(() => hud?.actor ?? null);
  registerHotbarShortcuts();
  registerCharacterCreatorHooks();
  registerCharacterPdfExportHooks();
  registerRefreshHooks(hud);
  registerSceneControlsHooks();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = Object.freeze({
      get hud() {
        return hud;
      },
      getActor: () => hud?.actor ?? null,
      getContext: (actor = hud?.actor) => ContextService.build(actor),
      exportActorPdf: (actor = hud?.actor) => CharacterPdfExportService.export(actor),
      refresh: () => Hooks.callAll(`${MODULE_ID}.refresh`)
    });
  }
});

Hooks.once("ready", () => {
  if (game.system.id !== "symbaroum") {
    console.warn(`${MODULE_ID} | This module supports only the Symbaroum system.`);
    return;
  }

  applyPlayerListVisibility();
  applyHudTheme();
  void hud.render();
});
