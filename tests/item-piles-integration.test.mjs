import assert from "node:assert/strict";
import test from "node:test";

const notifications = {
  info: [],
  warn: [],
  error: []
};
const chatMessages = [];

globalThis.game = {
  user: { id: "user-1" },
  modules: new Map([["item-piles", { active: true }]]),
  i18n: {
    localize: (key) => key,
    format: (key, data) => `${key}:${data.actor ?? ""}:${data.item ?? ""}`
  },
  itempiles: {
    API: {
      createItemPile: async () => true
    }
  }
};

globalThis.ui = {
  notifications: {
    info: (msg) => notifications.info.push(msg),
    warn: (msg) => notifications.warn.push(msg),
    error: (msg) => notifications.error.push(msg)
  }
};

globalThis.ChatMessage = {
  getSpeaker: ({ actor }) => ({ actor: actor?.id, alias: actor?.name }),
  create: async (msg) => chatMessages.push(msg)
};
globalThis.fromUuid = async () => ({ documentName: "Token", actor: { id: "pile" } });

globalThis.canvas = {
  scene: { id: "scene-1" },
  grid: { size: 100 },
  tokens: {
    controlled: [],
    placeables: []
  }
};

const { ItemPilesIntegration } = await import("../scripts/integrations/item-piles.mjs");

test("ItemPilesIntegration detects active module and api", () => {
  assert.equal(ItemPilesIntegration.active, true);
  assert.notEqual(ItemPilesIntegration.api, null);
});

test("findActorToken finds matching token in placeables or controlled", () => {
  const actor = { id: "actor-1", uuid: "Actor.1", name: "Elric" };
  const mockToken = { id: "token-1", actor: { id: "actor-1" }, x: 200, y: 300 };
  globalThis.canvas.tokens.placeables = [mockToken];

  const found = ItemPilesIntegration.findActorToken(actor);
  assert.equal(found?.id, "token-1");
});

test("getDropPosition computes coordinates adjacent to the token", () => {
  const actor = { id: "actor-1", uuid: "Actor.1", name: "Elric" };
  const mockToken = { id: "token-1", actor: { id: "actor-1" }, x: 200, y: 300 };
  globalThis.canvas.tokens.placeables = [mockToken];

  const pos = ItemPilesIntegration.getDropPosition(actor);
  assert.deepEqual(pos, { x: 300, y: 300, sceneId: "scene-1" });
});

test("dropItem creates an empty pile and delegates transfer without a second item deletion", async () => {
  chatMessages.length = 0;
  notifications.info.length = 0;
  let pileCreatedWith = null;
  let itemDeleted = false;

  globalThis.game.itempiles.API.createItemPile = async (args) => {
    pileCreatedWith = args;
    return { tokenUuid: "Scene.scene.Token.pile" };
  };
  globalThis.game.itempiles.API.transferItems = async (_source, _target, items) => [{ item: { _id: items[0] }, quantity: 1 }];

  const item = {
    id: "item-sword-1",
    name: "Iron Broadsword",
    img: "icons/weapons/swords/sword-iron.webp",
    toObject: () => ({ id: "item-sword-1", name: "Iron Broadsword" }),
    delete: async () => { itemDeleted = true; }
  };

  const actor = {
    id: "actor-1",
    uuid: "Actor.1",
    name: "Elric",
    testUserPermission: () => true,
    items: [item]
  };
  actor.items.get = (id) => (id === item.id ? item : null);

  const success = await ItemPilesIntegration.dropItem(actor, item);
  assert.equal(success, true);
  assert.equal(itemDeleted, false);
  assert.deepEqual(pileCreatedWith.items, []);
  assert.equal(pileCreatedWith.sceneId, "scene-1");
  assert.notEqual(pileCreatedWith, null);
  assert.equal(chatMessages.length, 1);
  assert.ok(chatMessages[0].content.includes("Iron Broadsword"));
  assert.ok(chatMessages[0].content.includes("Elric"));
  assert.equal(notifications.info.length, 1);
});

test("concurrent drops cannot create two destinations for the same inventory item", async () => {
  let piles = 0;
  const item = { id: "concurrent", name: "Sword" };
  const actor = { id: "a", uuid: "Actor.a", items: new Map([[item.id, item]]), testUserPermission: () => true };
  game.itempiles.API.createItemPile = async () => { piles++; return { tokenUuid: "Scene.s.Token.t" }; };
  game.itempiles.API.transferItems = async () => [{ item: {}, quantity: 1 }];
  const results = await Promise.all([ItemPilesIntegration.dropItem(actor, item), ItemPilesIntegration.dropItem(actor, item)]);
  assert.equal(piles, 1);
  assert.deepEqual(results, [true, false]);
});

test("an aborted Item Piles transfer preserves the source and does not announce a drop", async () => {
  let deletions = 0;
  const item = { id: "abort", name: "Sword", delete: async () => { deletions++; } };
  const actor = { id: "a", items: new Map([[item.id, item]]), testUserPermission: () => true };
  game.itempiles.API.createItemPile = async () => ({ tokenUuid: "Scene.s.Token.t" });
  game.itempiles.API.transferItems = async () => false;
  const chats = chatMessages.length;
  assert.equal(await ItemPilesIntegration.dropItem(actor, item), false);
  assert.equal(deletions, 0);
  assert.equal(chatMessages.length, chats);
});

test("an Observer cannot discard an item", async () => {
  let creates = 0;
  game.itempiles.API.createItemPile = async () => { creates++; return true; };
  const actor = { id: "observer", testUserPermission: () => false };
  assert.equal(await ItemPilesIntegration.dropItem(actor, { id: "item" }), false);
  assert.equal(creates, 0);
});
