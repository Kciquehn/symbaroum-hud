import { IND_RESOURCES_ID, MODULE_ID } from "./constants.mjs";

export function registerRefreshHooks(hud) {
  const refresh = foundry.utils.debounce(() => {
    if (game.ready) void hud.render();
  }, 20);

  for (const hook of [
    "canvasReady",
    "renderHotbar",
    "controlToken",
    "createActor",
    "deleteActor",
    "createCombat",
    "updateCombat",
    "deleteCombat",
    "createCombatant",
    "updateCombatant",
    "deleteCombatant"
  ]) {
    Hooks.on(hook, refresh);
  }

  Hooks.on("updateActor", (actor) => {
    if (sameActor(actor, hud.actor)) refresh();
  });

  for (const hook of [
    "createItem",
    "updateItem",
    "deleteItem",
    "createActiveEffect",
    "updateActiveEffect",
    "deleteActiveEffect"
  ]) {
    Hooks.on(hook, (document) => {
      if (sameActor(document?.parent, hud.actor)) refresh();
    });
  }

  Hooks.on("updateUser", (user, changes) => {
    if (user?.id === game.user?.id && Object.hasOwn(changes ?? {}, "character")) {
      refresh();
    }
  });

  Hooks.on(`${IND_RESOURCES_ID}.settingsChanged`, refresh);
  Hooks.on(`${IND_RESOURCES_ID}.weaponReadinessChanged`, refresh);
  Hooks.on(`${MODULE_ID}.refresh`, refresh);
}

function sameActor(left, right) {
  const leftKey = left?.uuid ?? left?.id;
  const rightKey = right?.uuid ?? right?.id;
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}
