import {
  MODULE_ID,
  SELECTION_MODES,
  SETTINGS,
  STORAGE_VIEW_MODES,
  THEMES
} from "./constants.mjs";
import { ServiceCatalogApplication } from "./applications/service-catalog.mjs";
import { ItemCategoryManagerApplication } from "./applications/item-category-manager.mjs";

export function registerSettings(onChange) {
  game.settings.registerMenu?.(MODULE_ID, "itemCategoryManager", {
    name: "SYMBAROUMHUD.Settings.ItemCategoryManager.Name",
    hint: "SYMBAROUMHUD.Settings.ItemCategoryManager.Hint",
    label: "SYMBAROUMHUD.Settings.ItemCategoryManager.Label",
    icon: "fa-solid fa-tags",
    type: ItemCategoryManagerApplication,
    restricted: true
  });

  game.settings.registerMenu?.(MODULE_ID, "serviceCatalog", {
    name: "SYMBAROUMHUD.Settings.ServiceCatalog.Name",
    hint: "SYMBAROUMHUD.Settings.ServiceCatalog.Hint",
    label: "SYMBAROUMHUD.Settings.ServiceCatalog.Label",
    icon: "fa-solid fa-bell-concierge",
    type: ServiceCatalogApplication,
    restricted: true
  });

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

  game.settings.register(MODULE_ID, SETTINGS.THEME, {
    name: "SYMBAROUMHUD.Settings.Theme.Name",
    hint: "SYMBAROUMHUD.Settings.Theme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      [THEMES.CLASSIC]: "SYMBAROUMHUD.Settings.Theme.Classic",
      [THEMES.SIMPLIFIED]: "SYMBAROUMHUD.Settings.Theme.Simplified"
    },
    default: THEMES.CLASSIC,
    onChange: (theme) => {
      applyHudTheme(theme);
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

  game.settings.register(MODULE_ID, SETTINGS.COMPENDIUM_BROWSER_SOURCES, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOP_DEFINITIONS, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      version: 4,
      stores: [],
      locations: [],
      activeLocationId: null
    },
    onChange: () => Hooks.callAll(`${MODULE_ID}.shopDefinitionsChanged`)
  });

  game.settings.register(MODULE_ID, SETTINGS.SERVICE_DEFINITIONS, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      version: 1,
      services: []
    },
    onChange: () => Hooks.callAll(`${MODULE_ID}.serviceDefinitionsChanged`)
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOP_PRICE_MODIFIERS, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      version: 1,
      shops: {}
    },
    onChange: () => Hooks.callAll(`${MODULE_ID}.shopDefinitionsChanged`)
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOP_STOCK_RULES, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      version: 1,
      items: {}
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.GENERAL_STORE_OPEN, {
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: (open) => Hooks.callAll(`${MODULE_ID}.generalStoreAvailabilityChanged`, open)
  });

  game.settings.register(MODULE_ID, SETTINGS.COMPENDIUM_BROWSER_FOLDER_ACCESS, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      configured: false,
      folderIds: []
    },
    onChange: () => Hooks.callAll(`${MODULE_ID}.browserFolderAccessChanged`)
  });

  game.settings.register(MODULE_ID, SETTINGS.COMPENDIUM_BROWSER_ORIGIN_ACCESS, {
    scope: "world",
    config: false,
    type: Object,
    default: {
      configured: false,
      originIds: []
    },
    onChange: () => Hooks.callAll(`${MODULE_ID}.browserOriginAccessChanged`)
  });

  game.settings.register(MODULE_ID, SETTINGS.PDF_TEMPLATE_PATH, {
    name: "SYMBAROUMHUD.Settings.PdfTemplatePath.Name",
    hint: "SYMBAROUMHUD.Settings.PdfTemplatePath.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    default: ""
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

  const controlBtn = typeof document !== "undefined"
    ? document.querySelector(".symbaroum-hud-players-control button, button.symbaroum-hud-players-control, .symbaroum-hud-players-control")
    : null;
  if (controlBtn) {
    if (controlBtn.tagName === "BUTTON") {
      controlBtn.className = `control ui-control layer icon fa-solid ${hidden ? "fa-users-slash" : "fa-users"}`;
      controlBtn.setAttribute("aria-pressed", hidden ? "false" : "true");
    } else {
      const icon = controlBtn.querySelector("i");
      if (icon) icon.className = `fa-solid ${hidden ? "fa-users-slash" : "fa-users"}`;
    }
    const tooltipKey = hidden ? "SYMBAROUMHUD.Actions.ShowPlayers" : "SYMBAROUMHUD.Actions.HidePlayers";
    const label = game.i18n?.localize?.(tooltipKey) ?? (hidden ? "Mostrar Jogadores" : "Ocultar Jogadores");
    controlBtn.dataset.tooltip = label;
    controlBtn.setAttribute("aria-label", label);
    controlBtn.closest("li")?.classList.toggle("active", !hidden);
  }
}

export function getTheme() {
  const theme = getSetting(SETTINGS.THEME);
  return theme === THEMES.SIMPLIFIED ? THEMES.SIMPLIFIED : THEMES.CLASSIC;
}

export function applyHudTheme(theme = getTheme()) {
  const normalized = theme === THEMES.SIMPLIFIED ? THEMES.SIMPLIFIED : THEMES.CLASSIC;
  if (typeof document !== "undefined") {
    if (document.body) {
      document.body.dataset.symbaroumHudTheme = normalized;
    }
    const hudElement = document.getElementById("symbaroum-hud");
    if (hudElement) {
      hudElement.dataset.symbaTheme = normalized;
      hudElement.classList.toggle("symbaroum-hud--classic", normalized === THEMES.CLASSIC);
      hudElement.classList.toggle("symbaroum-hud--simplified", normalized === THEMES.SIMPLIFIED);
    }
  }
}
