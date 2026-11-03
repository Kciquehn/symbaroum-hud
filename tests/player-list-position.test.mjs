import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_ID, SETTINGS } from "../scripts/constants.mjs";
import { syncPlayerListPosition } from "../scripts/integrations/player-list-position.mjs";
import { applyPlayerListVisibility } from "../scripts/settings.mjs";
import { registerSceneControlsHooks } from "../scripts/hooks.mjs";

class Element extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.dataset = {};
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, value = !classes.has(name)) => value ? classes.add(name) : classes.delete(name)
    };
    const styles = new Map();
    this.style = {
      setProperty: (key, value) => styles.set(key, value),
      removeProperty: (key) => styles.delete(key),
      getPropertyValue: (key) => styles.get(key) ?? ""
    };
  }
  setAttribute() {}
  prepend(child) { child.parent = this; this.children.unshift(child); }
  appendChild(child) { child.parent = this; this.children.push(child); }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  contains(child) { return this.children.includes(child); }
  querySelector(selector) { return this.children.find((child) => `.${child.className}` === selector) ?? null; }
  setPointerCapture(id) { this.pointerId = id; }
  hasPointerCapture(id) { return this.pointerId === id; }
  releasePointerCapture(id) {
    this.pointerId = null;
    pointer(this, "lostpointercapture", 0, 0, { pointerId: id });
  }
  getBoundingClientRect() {
    if (document.body.classList.contains("symbaroum-hud-hide-players")) return { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: parseFloat(this.style.getPropertyValue("--symbaroum-hud-players-left") || "65"),
      top: parseFloat(this.style.getPropertyValue("--symbaroum-hud-players-top") || "50"),
      width: 260, height: 150
    };
  }
}

function pointer(handle, type, x, y, extra = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1, button: 0, ...extra });
  handle.dispatchEvent(event);
  return event;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, { saved, role = 1 } = {}) {
  const originals = Object.fromEntries(["game", "document", "window", "HTMLElement", "Hooks"].map((key) => [key, globalThis[key]]));
  const root = new Element();
  root.id = "players";
  let currentRoot = root;
  const writes = [];
  const flags = { playerListPosition: saved };
  const settings = new Map([[SETTINGS.ENABLED, true], [SETTINGS.HIDE_PLAYERS, false]]);
  globalThis.game = {
    user: {
      id: "user", role, isGM: role === 4,
      getFlag: (scope, key) => { assert.equal(scope, MODULE_ID); return flags[key]; },
      setFlag: async (scope, key, value) => {
        assert.equal(scope, MODULE_ID);
        writes.push({ key, value });
        flags[key] = structuredClone(value);
      }
    },
    settings: { get: (_scope, key) => settings.get(key), set: async (_scope, key, value) => settings.set(key, value) },
    i18n: { localize: (key) => key }
  };
  globalThis.document = {
    body: new Element(), createElement: () => new Element(),
    getElementById: (id) => id === "players" ? currentRoot : null,
    querySelector: () => null, querySelectorAll: () => []
  };
  globalThis.window = Object.assign(new EventTarget(), { innerWidth: 1000, innerHeight: 800 });
  globalThis.HTMLElement = Element;
  t.after(async () => {
    await tick();
    settings.set(SETTINGS.ENABLED, false);
    syncPlayerListPosition(currentRoot);
    Object.assign(globalThis, originals);
  });
  syncPlayerListPosition(root);
  return {
    root, writes, flags, settings,
    handle: () => currentRoot.querySelector(".symbaroum-hud-players-drag-handle"),
    replace: () => { currentRoot = new Element(); currentRoot.id = "players"; return currentRoot; }
  };
}

test("drag saves once on release and hide/show restores the user's position", async (t) => {
  const f = fixture(t);
  const handle = f.handle();
  pointer(handle, "pointerdown", 75, 55);
  pointer(handle, "pointermove", 375, 255);
  assert.equal(f.root.getBoundingClientRect().left, 365);
  assert.equal(f.root.getBoundingClientRect().top, 250);
  assert.equal(f.writes.length, 0, "moving must not write user data");
  pointer(handle, "pointerup", 375, 255);
  await tick();
  assert.deepEqual(f.flags.playerListPosition, { left: 365, top: 250 });
  assert.equal(f.writes.length, 1);
  applyPlayerListVisibility(true);
  applyPlayerListVisibility(false);
  syncPlayerListPosition();
  assert.equal(f.root.getBoundingClientRect().left, 365);
  assert.equal(f.root.getBoundingClientRect().top, 250);
  assert.equal(f.handle(), handle, "repeated sync must not duplicate the handle or listeners");
  await tick();
  assert.equal(f.writes.length, 1, "rendering and visibility must not persist data");
});

test("restores saved flags after reload and survives native root or content replacement", (t) => {
  const f = fixture(t, { saved: { left: 420, top: 310 } });
  f.handle().remove();
  syncPlayerListPosition();
  assert.ok(f.handle());
  const oldHandle = f.handle();
  const next = f.replace();
  syncPlayerListPosition(next);
  assert.deepEqual(next.getBoundingClientRect(), { left: 420, top: 310, width: 260, height: 150 });
  pointer(oldHandle, "pointerdown", 0, 0);
  pointer(oldHandle, "pointerup", 100, 100);
  assert.equal(f.writes.length, 0, "listeners on replaced nodes must be removed");
});

test("clamps dragging and restored positions after viewport resize without writing during render", async (t) => {
  const f = fixture(t, { saved: { left: 900, top: 900 } });
  assert.equal(f.root.getBoundingClientRect().left, 740);
  assert.equal(f.root.getBoundingClientRect().top, 650);
  applyPlayerListVisibility(true);
  window.innerWidth = 500;
  window.innerHeight = 400;
  window.dispatchEvent(new Event("resize"));
  applyPlayerListVisibility(false);
  assert.equal(f.root.getBoundingClientRect().left, 240);
  assert.equal(f.root.getBoundingClientRect().top, 250);
  assert.equal(f.writes.length, 0);
  pointer(f.handle(), "pointerdown", 250, 260);
  pointer(f.handle(), "pointerup", -1000, -1000);
  await tick();
  assert.deepEqual(f.flags.playerListPosition, { left: 0, top: 0 });
});

test("clicks, secondary buttons and other pointers cannot move or save the list", async (t) => {
  const f = fixture(t);
  pointer(f.handle(), "pointerdown", 80, 60, { button: 2 });
  pointer(f.handle(), "pointerup", 200, 200);
  pointer(f.handle(), "pointerdown", 80, 60);
  pointer(f.handle(), "pointermove", 200, 200, { pointerId: 2 });
  pointer(f.handle(), "pointerup", 81, 61);
  await tick();
  assert.equal(f.writes.length, 0);
  assert.equal(f.root.getBoundingClientRect().left, 65);
});

test("cancellation, lost capture and window blur restore the prior position without saving", async (t) => {
  const f = fixture(t, { saved: { left: 300, top: 200 } });
  for (const cause of ["pointercancel", "lostpointercapture", "blur"]) {
    pointer(f.handle(), "pointerdown", 310, 210);
    pointer(f.handle(), "pointermove", 510, 410);
    if (cause === "blur") window.dispatchEvent(new Event("blur"));
    else pointer(f.handle(), cause, 510, 410);
    assert.equal(f.root.getBoundingClientRect().left, 300);
    assert.equal(f.root.classList.contains("symbaroum-hud-players-dragging"), false);
  }
  await tick();
  assert.equal(f.writes.length, 0);
});

test("disabling the HUD cleans up dragging and re-enabling installs only one handle", async (t) => {
  const f = fixture(t);
  const oldHandle = f.handle();
  pointer(oldHandle, "pointerdown", 80, 60);
  pointer(oldHandle, "pointermove", 180, 160);
  f.settings.set(SETTINGS.ENABLED, false);
  syncPlayerListPosition();
  assert.equal(f.handle(), null);
  assert.equal(f.root.style.getPropertyValue("--symbaroum-hud-players-left"), "");
  pointer(oldHandle, "pointerup", 180, 160);
  f.settings.set(SETTINGS.ENABLED, true);
  syncPlayerListPosition();
  syncPlayerListPosition();
  assert.equal(f.root.children.filter((child) => child.className === "symbaroum-hud-players-drag-handle").length, 1);
  await tick();
  assert.equal(f.writes.length, 0);
});

test("rapid drags and hide/show retain the latest position while flag writes are pending", async (t) => {
  const f = fixture(t);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const setFlag = game.user.setFlag;
  game.user.setFlag = async (...args) => { await pending; return setFlag(...args); };
  pointer(f.handle(), "pointerdown", 75, 55);
  pointer(f.handle(), "pointerup", 175, 155);
  await tick();
  applyPlayerListVisibility(true);
  applyPlayerListVisibility(false);
  assert.equal(f.root.getBoundingClientRect().left, 165);
  pointer(f.handle(), "pointerdown", 175, 155);
  pointer(f.handle(), "pointerup", 375, 355);
  const next = f.replace();
  syncPlayerListPosition(next);
  assert.equal(next.getBoundingClientRect().left, 365);
  assert.equal(f.writes.length, 0);
  release();
  await tick();
  assert.deepEqual(f.writes.map(({ value }) => value), [{ left: 165, top: 150 }, { left: 365, top: 350 }]);
  assert.deepEqual(f.flags.playerListPosition, { left: 365, top: 350 });
});

test("GM, player and trusted player store separate positions on their own user flags", async (t) => {
  for (const role of [4, 1, 2]) {
    await t.test(`role ${role}`, async (t) => {
      const f = fixture(t, { role });
      pointer(f.handle(), "pointerdown", 75, 55);
      pointer(f.handle(), "pointerup", 275, 155);
      await tick();
      assert.deepEqual(f.flags.playerListPosition, { left: 265, top: 150 });
    });
  }
});

test("malformed flags fall back to the existing default placement", (t) => {
  const f = fixture(t, { saved: { left: "200px", top: Infinity } });
  assert.equal(f.root.getBoundingClientRect().left, 65);
  assert.equal(f.root.getBoundingClientRect().top, 50);
  assert.equal(f.writes.length, 0);
});

test("both native v13 Players and legacy PlayerList render hooks restore the drag handle", (t) => {
  const f = fixture(t, { saved: { left: 400, top: 220 } });
  const listeners = new Map();
  globalThis.Hooks = { on: (hook, callback) => listeners.set(hook, callback) };
  registerSceneControlsHooks();
  for (const hook of ["renderPlayers", "renderPlayerList"]) {
    const next = f.replace();
    listeners.get(hook)({}, next);
    assert.ok(f.handle());
    assert.equal(next.getBoundingClientRect().left, 400);
    assert.equal(next.getBoundingClientRect().top, 220);
  }
  assert.equal(f.writes.length, 0);
});
