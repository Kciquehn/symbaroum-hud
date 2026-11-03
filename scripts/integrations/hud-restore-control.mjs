import { MODULE_ID, SETTINGS, SIMPLIFIED_HUD_MODES } from "../constants.mjs";

export function syncHudRestoreControl(container = globalThis.ui?.controls?.element) {
  const root = typeof HTMLElement !== "undefined" && container instanceof HTMLElement
    ? container
    : container?.[0];
  const list = root?.querySelector("menu.flexcol")
    || root?.querySelector("menu")
    || root?.querySelector("#scene-controls")
    || root?.querySelector("ol.main-controls")
    || root?.querySelector("ol");
  if (!list) return;

  const existing = list.querySelector(".symbaroum-hud-restore-control");
  const empty = game.settings.get(MODULE_ID, SETTINGS.ENABLED)
    && game.settings.get(MODULE_ID, SETTINGS.SIMPLIFIED_HUD_MODE) === SIMPLIFIED_HUD_MODES.EMPTY;
  if (!empty) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const item = document.createElement("li");
  item.className = "symbaroum-hud-restore-control";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control ui-control icon fa-solid fa-table-cells-large";
  button.dataset.action = "restore-symba-hud";
  const label = game.i18n.localize("SYMBAROUMHUD.SimplifiedMode.Restore");
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await game.settings.set(MODULE_ID, SETTINGS.SIMPLIFIED_HUD_MODE, SIMPLIFIED_HUD_MODES.FULL);
  });
  item.appendChild(button);
  list.appendChild(item);
}
