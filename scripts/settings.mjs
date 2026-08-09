import {
  MODULE_ID,
  SELECTION_MODES,
  SETTINGS,
  STORAGE_VIEW_MODES
} from "./constants.mjs";

export function registerSettings(onChange) {
  game.settings.register(MODULE_ID, SETTINGS.ENABLED, {
    name: "SYMBAROUMHUD.Settings.Enabled.Name",
    hint: "SYMBAROUMHUD.Settings.Enabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      applyPlayerListVisibility();
      onChange();
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.SELECTION_MODE, {
    name: "SYMBAROUMHUD.Settings.SelectionMode.Name",
    hint: "SYMBAROUMHUD.Settings.SelectionMode.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      [SELECTION_MODES.CONTROLLED]: "SYMBAROUMHUD.Settings.SelectionMode.Controlled",
      [SELECTION_MODES.COMBAT]: "SYMBAROUMHUD.Settings.SelectionMode.Combat",
      [SELECTION_MODES.CHARACTER]: "SYMBAROUMHUD.Settings.SelectionMode.Character"
    },
    default: SELECTION_MODES.CONTROLLED,
    onChange
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_IND_RESOURCES, {
    name: "SYMBAROUMHUD.Settings.ShowIndResources.Name",
    hint: "SYMBAROUMHUD.Settings.ShowIndResources.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_WEAPON_READINESS_BUTTON, {
    name: "SYMBAROUMHUD.Settings.ShowWeaponReadinessButton.Name",
    hint: "SYMBAROUMHUD.Settings.ShowWeaponReadinessButton.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange
  });

  game.settings.register(MODULE_ID, SETTINGS.HIDE_PLAYERS, {
    name: "SYMBAROUMHUD.Settings.HidePlayers.Name",
    hint: "SYMBAROUMHUD.Settings.HidePlayers.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (hidden) => {
      applyPlayerListVisibility(hidden);
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.COLLAPSED, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.STORAGE_VIEW_MODE, {
    scope: "client",
    config: false,
    type: String,
    default: STORAGE_VIEW_MODES.GRID
  });
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function getStorageViewMode() {
  return getSetting(SETTINGS.STORAGE_VIEW_MODE) === STORAGE_VIEW_MODES.LIST
    ? STORAGE_VIEW_MODES.LIST
    : STORAGE_VIEW_MODES.GRID;
}

export function applyPlayerListVisibility(hidden = getSetting(SETTINGS.HIDE_PLAYERS)) {
  const enabled = getSetting(SETTINGS.ENABLED);
  document.body?.classList.toggle("symbaroum-hud-hide-players", Boolean(enabled && hidden));
}
