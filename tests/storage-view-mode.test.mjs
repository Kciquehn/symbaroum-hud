import assert from "node:assert/strict";
import test from "node:test";

import {
  MODULE_ID,
  SETTINGS,
  STORAGE_VIEW_MODES
} from "../scripts/constants.mjs";
import {
  getStorageViewMode,
  registerSettings
} from "../scripts/settings.mjs";

test("storage view mode is a hidden client preference with grid as its default", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.STORAGE_VIEW_MODE);
    assert.equal(setting.scope, "client");
    assert.equal(setting.config, false);
    assert.equal(setting.type, String);
    assert.equal(setting.default, STORAGE_VIEW_MODES.GRID);
  } finally {
    globalThis.game = originalGame;
  }
});

test("the editable PDF template is a restricted world setting", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.PDF_TEMPLATE_PATH);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, true);
    assert.equal(setting.restricted, true);
    assert.equal(setting.type, String);
    assert.equal(setting.default, "");
  } finally {
    globalThis.game = originalGame;
  }
});

test("the GM service catalog is registered as a restricted module menu", () => {
  const originalGame = globalThis.game;
  let menu = null;
  globalThis.game = {
    settings: {
      register: () => {},
      registerMenu(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        if (key === "serviceCatalog") menu = data;
      },
      get: () => false
    }
  };
  try {
    registerSettings(() => {});
    assert.equal(menu.restricted, true);
    assert.equal(menu.name, "SYMBAROUMHUD.Settings.ServiceCatalog.Name");
    assert.equal(typeof menu.type, "function");
  } finally {
    globalThis.game = originalGame;
  }
});

test("the GM Item Category manager is registered as a restricted module menu", () => {
  const originalGame = globalThis.game;
  let menu = null;
  globalThis.game = {
    settings: {
      register: () => {},
      registerMenu(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        if (key === "itemCategoryManager") menu = data;
      },
      get: () => false
    }
  };
  try {
    registerSettings(() => {});
    assert.equal(menu.restricted, true);
    assert.equal(menu.name, "SYMBAROUMHUD.Settings.ItemCategoryManager.Name");
    assert.equal(typeof menu.type, "function");
  } finally {
    globalThis.game = originalGame;
  }
});

test("player list hiding is enabled by default", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.HIDE_PLAYERS);
    assert.equal(setting.scope, "client");
    assert.equal(setting.config, true);
    assert.equal(setting.type, Boolean);
    assert.equal(setting.default, true);
  } finally {
    globalThis.game = originalGame;
  }
});

test("HUD collapsing is a hidden client preference disabled by default", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.COLLAPSED);
    assert.equal(setting.scope, "client");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Boolean);
    assert.equal(setting.default, false);
  } finally {
    globalThis.game = originalGame;
  }
});

test("the separate weapon readiness button is disabled by default", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.SHOW_WEAPON_READINESS_BUTTON);
    assert.equal(setting.scope, "client");
    assert.equal(setting.config, true);
    assert.equal(setting.type, Boolean);
    assert.equal(setting.default, false);
    assert.equal(typeof setting.onChange, "function");
  } finally {
    globalThis.game = originalGame;
  }
});

test("compendium browser folder access is a hidden world setting controlled by the GM", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.COMPENDIUM_BROWSER_FOLDER_ACCESS);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Object);
    assert.deepEqual(setting.default, { configured: false, folderIds: [] });
  } finally {
    globalThis.game = originalGame;
  }
});

test("compendium browser book access is a hidden world setting controlled by the GM", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.COMPENDIUM_BROWSER_ORIGIN_ACCESS);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Object);
    assert.deepEqual(setting.default, { configured: false, originIds: [] });
  } finally {
    globalThis.game = originalGame;
  }
});

test("custom shop definitions are stored as hidden world data", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.SHOP_DEFINITIONS);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Object);
    assert.deepEqual(setting.default, {
      version: 4,
      stores: [],
      locations: [],
      activeLocationId: null
    });
  } finally {
    globalThis.game = originalGame;
  }
});

test("custom service definitions are stored as hidden world data", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.SERVICE_DEFINITIONS);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Object);
    assert.deepEqual(setting.default, { version: 1, services: [] });
  } finally {
    globalThis.game = originalGame;
  }
});

test("general store availability is hidden world data and starts open", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.GENERAL_STORE_OPEN);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Boolean);
    assert.equal(setting.default, true);
  } finally {
    globalThis.game = originalGame;
  }
});

test("shop price modifiers are hidden world data", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.SHOP_PRICE_MODIFIERS);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Object);
    assert.deepEqual(setting.default, { version: 1, shops: {} });
  } finally {
    globalThis.game = originalGame;
  }
});

test("per-item stock availability is hidden world data", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.SHOP_STOCK_RULES);
    assert.equal(setting.scope, "world");
    assert.equal(setting.config, false);
    assert.equal(setting.type, Object);
    assert.deepEqual(setting.default, { version: 1, items: {} });
  } finally {
    globalThis.game = originalGame;
  }
});

test("storage view mode accepts list and safely falls back to grid", () => {
  const originalGame = globalThis.game;
  let storedMode = STORAGE_VIEW_MODES.LIST;
  globalThis.game = {
    settings: {
      get: (_moduleId, key) => key === SETTINGS.STORAGE_VIEW_MODE ? storedMode : false
    }
  };

  try {
    assert.equal(getStorageViewMode(), STORAGE_VIEW_MODES.LIST);
    storedMode = "unsupported";
    assert.equal(getStorageViewMode(), STORAGE_VIEW_MODES.GRID);
  } finally {
    globalThis.game = originalGame;
  }
});
