export const MODULE_ID = "symbaroum-hud";
export const IND_RESOURCES_ID = "symbaroum-ind-resources";
export const SUPPORTED_ACTOR_TYPES = new Set(["player", "monster"]);

export const SETTINGS = Object.freeze({
  ENABLED: "enabled",
  SELECTION_MODE: "selectionMode",
  SHOW_IND_RESOURCES: "showIndResources",
  SHOW_WEAPON_READINESS_BUTTON: "showWeaponReadinessButton",
  HIDE_PLAYERS: "hidePlayers",
  COLLAPSED: "collapsed",
  STORAGE_VIEW_MODE: "storageViewMode",
  COMPENDIUM_BROWSER_SOURCES: "compendiumBrowserSources"
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
