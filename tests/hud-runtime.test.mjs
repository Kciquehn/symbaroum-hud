import assert from "node:assert/strict";
import test from "node:test";

globalThis.foundry = { applications: { api: { ApplicationV2: class {
  async render() { return this; }
} } } };
globalThis.canvas = { tokens: { controlled: [] } };
globalThis.ui = { hotbar: { render: async () => {} } };
globalThis.game = {
  user: { id: "player", isGM: false },
  actors: [], modules: new Map(),
  settings: { get: (_scope, key) => key === "enabled" ? true : key === "selectionMode" ? "character" : false },
  i18n: { lang: "en", localize: (key) => key, format: (key) => key }
};
const { SymbaroumHud } = await import("../scripts/applications/symbaroum-hud.mjs");

test("HUD clears the displayed actor when Observer access is revoked", async () => {
  let permitted = true;
  const actor = { id: "a", uuid: "Actor.a", type: "player", testUserPermission: () => permitted };
  game.user.character = actor;
  game.actors = [actor];
  const hud = new SymbaroumHud();
  await hud.render();
  assert.equal(hud.actor, actor);
  permitted = false;
  await hud.render();
  assert.equal(hud.actor, null);
});

test("HUD clears a character removed from the user's assignment", async () => {
  const actor = { id: "a", uuid: "Actor.a", type: "player", testUserPermission: () => true };
  game.user.character = actor;
  game.actors = [actor];
  const hud = new SymbaroumHud();
  await hud.render();
  game.user.character = null;
  game.actors = [];
  await hud.render();
  assert.equal(hud.actor, null);
});

test("HUD corruption includes long-term corruption in the displayed total and bar", async () => {
  const actor = {
    id: "a", uuid: "Actor.a", name: "Hero", type: "player", items: [], effects: [],
    testUserPermission: () => true,
    system: { health: { toughness: { value: 10, max: 10 }, corruption: { temporary: 1, longterm: 4, permanent: 2, max: 10 } } }
  };
  game.user.character = actor;
  game.actors = [actor];
  const hud = new SymbaroumHud();
  await hud.render();
  const context = await hud._prepareContext();
  assert.equal(context.actor.corruption.total, 7);
  assert.equal(context.actor.corruption.longterm, 4);
  assert.equal(context.actor.corruption.percent, 70);
});
