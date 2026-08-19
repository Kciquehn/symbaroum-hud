import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = { user: { id: "player" } };

const {
  ShopService,
  isPurchasableShopEntry,
  moneyFromOrtegs,
  moneyToOrtegs,
  parseShopPrice,
  selectShopPrice
} = await import("../scripts/services/shop-service.mjs");

test("parses exact Portuguese and English Symbaroum prices", () => {
  assert.deepEqual(parseShopPrice("5 táleres"), {
    raw: "5 táleres",
    amount: 5,
    maximumAmount: 5,
    denomination: "thaler",
    ortegs: 500,
    maximumOrtegs: 500,
    ranged: false
  });
  assert.equal(parseShopPrice("10 xelins").ortegs, 100);
  assert.equal(parseShopPrice("7 ortegas").ortegs, 7);
  assert.equal(parseShopPrice("2 shillings").ortegs, 20);
  assert.equal(parseShopPrice("1 thaler").ortegs, 100);
});

test("parses price ranges and rejects invalid or alternative prices", () => {
  assert.deepEqual(parseShopPrice("1-4 ortegas"), {
    raw: "1-4 ortegas",
    amount: 1,
    maximumAmount: 4,
    denomination: "orteg",
    ortegs: 1,
    maximumOrtegs: 4,
    ranged: true
  });
  assert.equal(parseShopPrice("2–5 táleres").maximumOrtegs, 500);
  assert.equal(parseShopPrice(""), null);
  assert.equal(parseShopPrice("0 táleres"), null);
  assert.equal(parseShopPrice("10-1 xelins"), null);
  assert.equal(parseShopPrice("8/12 táleres"), null);
  assert.equal(parseShopPrice("a combinar"), null);
});

test("validates the amount selected inside a price range", () => {
  const range = parseShopPrice("1-4 ortegas");
  assert.deepEqual(selectShopPrice(range, 3), {
    raw: "3 ortegas",
    amount: 3,
    denomination: "orteg",
    ortegs: 3,
    sourceRaw: "1-4 ortegas"
  });
  assert.equal(selectShopPrice(range, 0), null);
  assert.equal(selectShopPrice(range, 5), null);
  assert.equal(selectShopPrice(range, 2.5), null);
  assert.equal(selectShopPrice(range), null);
});

test("converts the native three denominations without losing value", () => {
  assert.equal(moneyToOrtegs({ thaler: 3, shilling: 4, orteg: 7 }), 347);
  assert.deepEqual(moneyFromOrtegs(347), { thaler: 3, shilling: 4, orteg: 7 });
});

test("exposes supported item types with exact or ranged prices in the shop", () => {
  assert.equal(isPurchasableShopEntry({
    documentClass: "Item",
    type: "weapon",
    cost: "5 táleres"
  }), true);
  assert.equal(isPurchasableShopEntry({
    documentClass: "Item",
    type: "ability",
    cost: "5 táleres"
  }), false);
  assert.equal(isPurchasableShopEntry({
    documentClass: "Item",
    type: "equipment",
    cost: "1-5 xelins"
  }), true);
});

test("purchases an item and automatically spends the actor money", async () => {
  const actor = mockActor({ thaler: 1, shilling: 0, orteg: 0 });
  const source = mockItem("Kit", "equipment", "5 xelins");

  const result = await ShopService.purchase(actor, source);

  assert.equal(result.ok, true);
  assert.deepEqual(actor.system.money, { thaler: 0, shilling: 5, orteg: 0 });
  assert.equal(actor.created.length, 1);
  assert.equal(actor.created[0].name, "Kit");
  assert.equal(actor.created[0].flags.core.sourceId, source.uuid);
  assert.equal("_id" in actor.created[0], false);
});

test("does not create an item when the actor cannot afford it", async () => {
  const actor = mockActor({ thaler: 0, shilling: 2, orteg: 0 });
  const result = await ShopService.purchase(actor, mockItem("Arco", "weapon", "5 táleres"));

  assert.equal(result.ok, false);
  assert.equal(result.reason, "insufficient");
  assert.deepEqual(actor.system.money, { thaler: 0, shilling: 2, orteg: 0 });
  assert.equal(actor.created.length, 0);
});

test("purchases a ranged-price item using the player's selected quality", async () => {
  const actor = mockActor({ thaler: 0, shilling: 1, orteg: 0 });
  const source = mockItem("Camisa", "equipment", "1-4 ortegas");

  const result = await ShopService.purchase(actor, source, { amount: 3 });

  assert.equal(result.ok, true);
  assert.equal(result.price.raw, "3 ortegas");
  assert.deepEqual(actor.system.money, { thaler: 0, shilling: 0, orteg: 7 });
  assert.equal(actor.created[0].system.cost, "3 ortegas");
  assert.deepEqual(actor.created[0].flags["symbaroum-hud"].shopPurchase, {
    price: "3 ortegas",
    amount: 3,
    denomination: "orteg",
    sourcePrice: "1-4 ortegas"
  });
});

test("rejects a ranged-price purchase outside the item's limits", async () => {
  const actor = mockActor({ thaler: 1, shilling: 0, orteg: 0 });
  const source = mockItem("Camisa", "equipment", "1-4 ortegas");

  const result = await ShopService.purchase(actor, source, { amount: 5 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalidPrice");
  assert.deepEqual(actor.system.money, { thaler: 1, shilling: 0, orteg: 0 });
  assert.equal(actor.created.length, 0);
});

test("refunds the exact money when item creation fails", async () => {
  const actor = mockActor({ thaler: 2, shilling: 0, orteg: 0 }, { failCreation: true });

  await assert.rejects(
    ShopService.purchase(actor, mockItem("Espada", "weapon", "1 táler")),
    /creation failed/
  );
  assert.deepEqual(actor.system.money, { thaler: 2, shilling: 0, orteg: 0 });
  assert.equal(actor.updates.length, 2);
});

test("serializes simultaneous purchases so money cannot be overspent", async () => {
  const actor = mockActor({ thaler: 1, shilling: 0, orteg: 0 });
  const source = mockItem("Luneta", "equipment", "1 táler");
  const results = await Promise.all([
    ShopService.purchase(actor, source),
    ShopService.purchase(actor, source)
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === "insufficient").length, 1);
  assert.deepEqual(actor.system.money, { thaler: 0, shilling: 0, orteg: 0 });
  assert.equal(actor.created.length, 1);
});

function mockActor(money, { failCreation = false } = {}) {
  const actor = {
    id: `actor-${Math.random()}`,
    system: { money: { ...money } },
    updates: [],
    created: [],
    testUserPermission: () => true,
    async update(update) {
      this.updates.push(update);
      this.system.money = {
        thaler: update["system.money.thaler"],
        shilling: update["system.money.shilling"],
        orteg: update["system.money.orteg"]
      };
      return this;
    },
    async createEmbeddedDocuments(documentName, entries) {
      assert.equal(documentName, "Item");
      if (failCreation) throw new Error("creation failed");
      this.created.push(...entries);
      return entries;
    }
  };
  actor.uuid = `Actor.${actor.id}`;
  return actor;
}

function mockItem(name, type, cost) {
  return {
    id: name.toLowerCase(),
    uuid: `Item.${name.toLowerCase()}`,
    documentName: "Item",
    name,
    type,
    system: { cost, number: 1, state: "other" },
    toObject: () => ({
      _id: name.toLowerCase(),
      name,
      type,
      system: { cost, number: 1, state: "other" },
      ownership: { default: 0 },
      sort: 10,
      _stats: { modifiedTime: 1 }
    })
  };
}
