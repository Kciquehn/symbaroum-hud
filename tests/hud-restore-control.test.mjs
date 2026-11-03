import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_ID, SETTINGS, SIMPLIFIED_HUD_MODES } from "../scripts/constants.mjs";
import { syncHudRestoreControl } from "../scripts/integrations/hud-restore-control.mjs";
import { getSimplifiedHudMode, registerSettings } from "../scripts/settings.mjs";
import { registerSceneControlsHooks } from "../scripts/hooks.mjs";

class Element extends EventTarget {
  constructor(tag = "div") {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.classList = { toggle() {} };
  }
  appendChild(child) { child.parent = this; this.children.push(child); }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  querySelector(selector) {
    return this.children.find((child) => selector.startsWith(".") ? child.className === selector.slice(1)
      : child.tagName === selector.split(".")[0].toUpperCase()) ?? null;
  }
}

function fixture(t, { mode = SIMPLIFIED_HUD_MODES.EMPTY, enabled = true, legacy = false } = {}) {
  const originals = Object.fromEntries(["game", "document", "ui", "HTMLElement", "Hooks"].map((key) => [key, globalThis[key]]));
  const settings = new Map([[SETTINGS.ENABLED, enabled], [SETTINGS.SIMPLIFIED_HUD_MODE, mode]]);
  const registered = new Map();
  const listeners = new Map();
  const writes = [];
  let refreshes = 0;
  const root = new Element();
  const list = new Element(legacy ? "ol" : "menu");
  const players = new Element("li");
  players.className = "symbaroum-hud-players-control";
  players.appendChild(new Element("button"));
  list.appendChild(players);
  root.appendChild(list);
  globalThis.game = {
    settings: {
      register: (_scope, key, data) => registered.set(key, data),
      get: (_scope, key) => settings.get(key),
      set: async (scope, key, value) => {
        assert.equal(scope, MODULE_ID);
        writes.push({ key, value });
        settings.set(key, value);
        registered.get(key)?.onChange?.(value);
      }
    },
    i18n: { localize: (key) => key }
  };
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    body: Object.assign(new Element(), { classList: { toggle() {}, contains: () => false } }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => []
  };
  globalThis.ui = { controls: { element: legacy ? [root] : root } };
  globalThis.HTMLElement = Element;
  globalThis.Hooks = { on: (hook, callback) => listeners.set(hook, callback) };
  registerSettings(() => refreshes++);
  t.after(() => Object.assign(globalThis, originals));
  return { root, list, settings, registered, listeners, writes, refreshes: () => refreshes };
}

test("saved mode accepts all four modes and invalid values fall back to Full", (t) => {
  const f = fixture(t);
  assert.deepEqual(Object.values(SIMPLIFIED_HUD_MODES), ["full", "minimal", "hidden", "empty"]);
  for (const mode of Object.values(SIMPLIFIED_HUD_MODES)) {
    f.settings.set(SETTINGS.SIMPLIFIED_HUD_MODE, mode);
    assert.equal(getSimplifiedHudMode(), mode);
  }
  f.settings.set(SETTINGS.SIMPLIFIED_HUD_MODE, "bad-value");
  assert.equal(getSimplifiedHudMode(), SIMPLIFIED_HUD_MODES.FULL);
  const setting = f.registered.get(SETTINGS.SIMPLIFIED_HUD_MODE);
  assert.equal(setting.scope, "client");
  assert.equal(setting.config, false);
  assert.equal(setting.default, SIMPLIFIED_HUD_MODES.FULL);
});

test("Empty adds one native-size restore button after the players control, including repeated renders", (t) => {
  const f = fixture(t);
  syncHudRestoreControl();
  syncHudRestoreControl();
  assert.equal(f.list.children.length, 2);
  const restore = f.list.children[1];
  assert.equal(restore.className, "symbaroum-hud-restore-control");
  const button = restore.querySelector("button");
  assert.equal(button.dataset.action, "restore-symba-hud");
  assert.match(button.className, /ui-control/);
  assert.equal(button.attributes.get("aria-label"), "SYMBAROUMHUD.SimplifiedMode.Restore");
  assert.equal(f.writes.length, 0, "rendering must never persist settings");
});

test("restore button returns directly to Full and refreshes immediately", async (t) => {
  const f = fixture(t);
  syncHudRestoreControl();
  const button = f.list.children[1].querySelector("button");
  const event = new Event("click", { cancelable: true });
  button.dispatchEvent(event);
  await Promise.resolve();
  assert.equal(event.defaultPrevented, true);
  assert.equal(getSimplifiedHudMode(), SIMPLIFIED_HUD_MODES.FULL);
  assert.deepEqual(f.writes, [{ key: SETTINGS.SIMPLIFIED_HUD_MODE, value: SIMPLIFIED_HUD_MODES.FULL }]);
  assert.equal(f.list.children.length, 1);
  assert.equal(f.refreshes(), 1);
});

test("mode changes add and remove the return control without reloading", (t) => {
  const f = fixture(t, { mode: SIMPLIFIED_HUD_MODES.HIDDEN });
  syncHudRestoreControl();
  assert.equal(f.list.children.length, 1);
  f.settings.set(SETTINGS.SIMPLIFIED_HUD_MODE, SIMPLIFIED_HUD_MODES.EMPTY);
  f.registered.get(SETTINGS.SIMPLIFIED_HUD_MODE).onChange();
  assert.equal(f.list.children.length, 2);
  f.settings.set(SETTINGS.SIMPLIFIED_HUD_MODE, SIMPLIFIED_HUD_MODES.MINIMAL);
  f.registered.get(SETTINGS.SIMPLIFIED_HUD_MODE).onChange();
  assert.equal(f.list.children.length, 1);
});

test("disabling the HUD removes the control and enabling restores a saved Empty mode", (t) => {
  const f = fixture(t);
  syncHudRestoreControl();
  f.settings.set(SETTINGS.ENABLED, false);
  f.registered.get(SETTINGS.ENABLED).onChange();
  assert.equal(f.list.children.length, 1);
  f.settings.set(SETTINGS.ENABLED, true);
  f.registered.get(SETTINGS.ENABLED).onChange();
  assert.equal(f.list.children.length, 2);
});

test("native scene control rerenders and canvas changes retain the return button in saved Empty mode", (t) => {
  const f = fixture(t);
  registerSceneControlsHooks();
  f.listeners.get("renderSceneControls")({}, f.root);
  f.listeners.get("canvasReady")();
  assert.equal(f.list.children.filter((child) => child.className === "symbaroum-hud-restore-control").length, 1);
  f.list.children[1].remove();
  f.listeners.get("renderSceneControls")({}, f.root);
  assert.equal(f.list.children[1].className, "symbaroum-hud-restore-control");
  assert.equal(f.writes.length, 0);
});

test("legacy controls wrappers support the return button without altering saved settings", (t) => {
  const f = fixture(t, { legacy: true });
  syncHudRestoreControl();
  assert.equal(f.list.children[1].className, "symbaroum-hud-restore-control");
  assert.equal(f.writes.length, 0);
});

test("no return button is added in Full, Minimal, Hidden or disabled states", (t) => {
  const f = fixture(t);
  for (const mode of [SIMPLIFIED_HUD_MODES.FULL, SIMPLIFIED_HUD_MODES.MINIMAL, SIMPLIFIED_HUD_MODES.HIDDEN]) {
    f.settings.set(SETTINGS.SIMPLIFIED_HUD_MODE, mode);
    syncHudRestoreControl();
    assert.equal(f.list.children.length, 1);
  }
  f.settings.set(SETTINGS.SIMPLIFIED_HUD_MODE, SIMPLIFIED_HUD_MODES.EMPTY);
  f.settings.set(SETTINGS.ENABLED, false);
  syncHudRestoreControl();
  assert.equal(f.list.children.length, 1);
});
