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
