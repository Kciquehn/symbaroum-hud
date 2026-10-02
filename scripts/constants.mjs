export const MODULE_ID = "symbaroum-hud";
export const IND_RESOURCES_ID = "symbaroum-ind-resources";
export const SUPPORTED_ACTOR_TYPES = new Set(["player", "monster"]);

export const SETTINGS = Object.freeze({
  ENABLED: "enabled",
  THEME: "theme",
  SELECTION_MODE: "selectionMode",
  SHOW_IND_RESOURCES: "showIndResources",
  SHOW_WEAPON_READINESS_BUTTON: "showWeaponReadinessButton",
  HIDE_PLAYERS: "hidePlayers",
  COLLAPSED: "collapsed",
  STORAGE_VIEW_MODE: "storageViewMode",
  SHOP_DEFINITIONS: "shopDefinitions",
  SERVICE_DEFINITIONS: "serviceDefinitions",
  SHOP_PRICE_MODIFIERS: "shopPriceModifiers",
  SHOP_STOCK_RULES: "shopStockRules",
  GENERAL_STORE_OPEN: "generalStoreOpen",
  COMPENDIUM_BROWSER_SOURCES: "compendiumBrowserSources",
  COMPENDIUM_BROWSER_FOLDER_ACCESS: "compendiumBrowserFolderAccess",
  COMPENDIUM_BROWSER_ORIGIN_ACCESS: "compendiumBrowserOriginAccess",
  PDF_TEMPLATE_PATH: "pdfTemplatePath",
  SIMPLIFIED_HUD_MODE: "simplifiedHudMode"
});

export const SIMPLIFIED_HUD_MODES = Object.freeze({
  FULL: "full",
  MINIMAL: "minimal",
  HIDDEN: "hidden"
});

export const THEMES = Object.freeze({
  CLASSIC: "classic",
  SIMPLIFIED: "simplified"
});

export const SELECTION_MODES = Object.freeze({
  CONTROLLED: "controlled",
  COMBAT: "combat",
  CHARACTER: "character"
});

export const STORAGE_VIEW_MODES = Object.freeze({
  GRID: "grid",
  LIST: "list"
});
