import { IND_RESOURCES_ID, MODULE_ID, SETTINGS } from "./constants.mjs";
import { applyPlayerListVisibility } from "./settings.mjs";

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

export function registerSceneControlsHooks() {
  function injectPlayersButton(container) {
    if (!game.settings?.get?.(MODULE_ID, SETTINGS.ENABLED)) return;

    const root = typeof HTMLElement !== "undefined" && container instanceof HTMLElement
      ? container
      : container?.[0] || (typeof ui !== "undefined" ? ui.controls?.element : null);
    if (!root) return;

    const list = root.querySelector("menu.flexcol")
      || root.querySelector("menu")
      || root.querySelector("#scene-controls")
      || root.querySelector("ol.main-controls")
      || root.querySelector("ol")
      || (root.id === "scene-controls" ? root.querySelector("menu, ol") : null);
    if (!list) return;

    let controlItem = list.querySelector(".symbaroum-hud-players-control");
    if (!controlItem) {
      controlItem = document.createElement("li");
      controlItem.className = "symbaroum-hud-players-control";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "control ui-control icon fa-solid fa-users";
      button.dataset.action = "toggle-symba-players";
      controlItem.appendChild(button);

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const currentlyHidden = document.body.classList.contains("symbaroum-hud-hide-players");
        const nextHidden = !currentlyHidden;
        await game.settings.set(MODULE_ID, SETTINGS.HIDE_PLAYERS, nextHidden);
        applyPlayerListVisibility(nextHidden);
      });

      list.appendChild(controlItem);
    }

    const isHidden = typeof document !== "undefined" && document.body?.classList.contains("symbaroum-hud-hide-players");
    const button = controlItem.querySelector("button") || controlItem;
    const icon = button.querySelector("i") || button;
    if (button.tagName === "BUTTON") {
      button.className = `control ui-control icon fa-solid ${isHidden ? "fa-users-slash" : "fa-users"}`;
      button.setAttribute("aria-pressed", isHidden ? "false" : "true");
    } else if (icon) {
      icon.className = `fa-solid ${isHidden ? "fa-users-slash" : "fa-users"}`;
    }
    const tooltipKey = isHidden ? "SYMBAROUMHUD.Actions.ShowPlayers" : "SYMBAROUMHUD.Actions.HidePlayers";
    const label = game.i18n?.localize?.(tooltipKey) ?? (isHidden ? "Mostrar Jogadores" : "Ocultar Jogadores");
    button.dataset.tooltip = label;
    button.setAttribute("aria-label", label);
  }

  Hooks.on("renderSceneControls", (controlsApp, html) => {
    injectPlayersButton(html);
  });

  Hooks.on("canvasReady", () => {
    injectPlayersButton();
  });
}
