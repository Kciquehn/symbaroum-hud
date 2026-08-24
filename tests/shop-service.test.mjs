import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = { user: { id: "player", isGM: true } };

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

test("exposes supported item categories with exact or ranged prices in the shop", () => {
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
  assert.equal(isPurchasableShopEntry({
    documentClass: "Service",
    type: "service",
    id: "guide",
    name: "Guia",
    cost: "1 táler"
  }), true);
  assert.equal(isPurchasableShopEntry({
    documentClass: "Service",
    type: "service",
    id: "oracle",
    name: "Oráculo",
    cost: "Favores ou xelins",
    priceMode: "negotiated"
  }), true);
});

test("charges a GM-approved negotiated service price without inventing a catalog value", async () => {
  const actor = mockActor({ thaler: 20, shilling: 0, orteg: 0 });
  const service = negotiatedService("jorlamar", "Preço normal +20%");
  const result = await ShopService.purchaseCart(actor, [{
    source: service,
    quantity: 1,
    priceOverride: { raw: "12 táleres", ortegs: 1_200 }
  }]);

  assert.equal(result.ok, true);
  assert.equal(result.totalOrtegs, 1_200);
  assert.deepEqual(actor.system.money, { thaler: 8, shilling: 0, orteg: 0 });
  assert.equal(result.services[0].priceLabel, "12 táleres");
});

test("records an approved favor or barter without deducting money", async () => {
  const actor = mockActor({ thaler: 1, shilling: 2, orteg: 3 });
  const service = negotiatedService("agdala", "Favores, comida, afeto ou xelins");
  const result = await ShopService.purchaseCart(actor, [{
    source: service,
    quantity: 1,
    priceOverride: { raw: "Favor ou escambo", ortegs: 0 }
  }]);

  assert.equal(result.ok, true);
  assert.equal(result.totalOrtegs, 0);
  assert.deepEqual(actor.system.money, { thaler: 1, shilling: 2, orteg: 3 });
  assert.equal(result.services[0].priceLabel, "Favor ou escambo");
});

test("rejects a negotiated service without an explicit GM price override", async () => {
  const actor = mockActor({ thaler: 5, shilling: 0, orteg: 0 });
  const result = await ShopService.purchaseCart(actor, [{
    source: negotiatedService("commission", "Até 25%"),
    quantity: 1
  }]);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalidPrice");
  assert.equal(actor.updates.length, 0);
});

test("does not accept a client-supplied negotiated price from a non-GM", async () => {
  const actor = mockActor({ thaler: 5, shilling: 0, orteg: 0 });
  game.user.isGM = false;
  try {
    const result = await ShopService.purchaseCart(actor, [{
      source: negotiatedService("oracle", "A combinar"),
      quantity: 1,
      priceOverride: { raw: "1 ortega", ortegs: 1 }
    }]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "permission");
    assert.equal(actor.updates.length, 0);
  } finally {
    game.user.isGM = true;
  }
});

test("purchases a persistent service without creating a fake actor Item", async () => {
  const actor = mockActor({ thaler: 2, shilling: 0, orteg: 0 });
  const service = {
    id: "bodyguard",
    uuid: "SymbaroumHudService.bodyguard",
    documentClass: "Service",
    type: "service",
    name: "Guarda-costas",
    img: "icons/svg/coins.svg",
    description: "Proteção contratada.",
    category: "contracts",
    cost: "1 xelim",
    unit: "day",
    fulfillment: "temporary",
    source: "Livro"
  };

  const result = await ShopService.purchaseCart(actor, [{ source: service, quantity: 3 }], {
    storeName: "Marvalom"
  });

  assert.equal(result.ok, true);
  assert.equal(result.totalOrtegs, 30);
  assert.equal(actor.created.length, 0);
  assert.deepEqual(actor.system.money, { thaler: 1, shilling: 7, orteg: 0 });
  assert.equal(result.services.length, 1);
  assert.equal(result.services[0].name, "Guarda-costas");
  assert.equal(result.services[0].quantity, 3);
  assert.equal(result.services[0].storeName, "Marvalom");
  assert.equal(actor.flags["symbaroum-hud"].services.length, 1);
});

test("instant services spend money but do not remain on the actor", async () => {
  const actor = mockActor({ thaler: 0, shilling: 1, orteg: 0 });
  const service = {
    id: "bath",
    documentClass: "Service",
    type: "service",
    name: "Banho",
    cost: "3 ortegas",
    category: "hospitality",
    unit: "purchase",
    fulfillment: "instant"
  };
  const result = await ShopService.purchaseCart(actor, [{ source: service, quantity: 1 }]);

  assert.equal(result.ok, true);
  assert.equal(result.services.length, 0);
  assert.equal(actor.created.length, 0);
  assert.deepEqual(actor.system.money, { thaler: 0, shilling: 0, orteg: 7 });
  assert.equal(actor.flags["symbaroum-hud"], undefined);
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

test("accepts a validated merchant price override when checking out a cart", async () => {
  const actor = mockActor({ thaler: 1, shilling: 0, orteg: 0 });
  const source = mockItem("Espada em promoção", "weapon", "1 táler");
  const result = await ShopService.purchaseCart(actor, [{
    source,
    amount: 1,
    quantity: 1,
    priceOverride: {
      raw: "5 xelins",
      ortegs: 50,
      modifier: 50
    }
  }]);

  assert.equal(result.ok, true);
  assert.equal(result.totalOrtegs, 50);
  assert.deepEqual(actor.system.money, { thaler: 0, shilling: 5, orteg: 0 });
  assert.equal(actor.created[0].system.cost, "5 xelins");
  assert.equal(actor.created[0].flags["symbaroum-hud"].shopPurchase.modifier, 50);
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

test("checks out a complete cart in one money update and one item batch", async () => {
  const actor = mockActor({ thaler: 2, shilling: 0, orteg: 0 });
  const dagger = mockItem("Adaga", "weapon", "5 xelins");
  const rope = mockItem("Corda", "equipment", "2 xelins");

  const result = await ShopService.purchaseCart(actor, [
    { source: dagger, quantity: 2 },
    { source: rope, quantity: 1 }
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.totalOrtegs, 120);
  assert.deepEqual(actor.system.money, { thaler: 0, shilling: 8, orteg: 0 });
  assert.equal(actor.updates.length, 1);
  assert.equal(actor.creationBatches.length, 1);
  assert.equal(actor.created.length, 2);
  assert.equal(actor.created[0].system.number, 2);
  assert.equal(actor.created[0].flags["symbaroum-hud"].shopPurchase.quantity, 2);
  assert.equal(actor.created[1].system.number, 1);
});

test("rejects an unaffordable cart before changing money or inventory", async () => {
  const actor = mockActor({ thaler: 0, shilling: 5, orteg: 0 });
  const result = await ShopService.purchaseCart(actor, [
    { source: mockItem("Espada", "weapon", "1 táler"), quantity: 1 },
    { source: mockItem("Corda", "equipment", "2 xelins"), quantity: 1 }
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "insufficient");
  assert.equal(actor.updates.length, 0);
  assert.equal(actor.created.length, 0);
});

test("refunds the entire cart if its item batch cannot be created", async () => {
  const actor = mockActor({ thaler: 3, shilling: 0, orteg: 0 }, { failCreation: true });

  await assert.rejects(
    ShopService.purchaseCart(actor, [
      { source: mockItem("Espada", "weapon", "1 táler"), quantity: 1 },
      { source: mockItem("Corda", "equipment", "2 xelins"), quantity: 2 }
    ]),
    /creation failed/
  );
  assert.deepEqual(actor.system.money, { thaler: 3, shilling: 0, orteg: 0 });
  assert.equal(actor.updates.length, 2);
  assert.equal(actor.created.length, 0);
});

test("checks out character-creation grants for free and charges only selected shop items", async () => {
  const actor = mockActor({ thaler: 0, shilling: 0, orteg: 0 });
  const armor = mockItem("Armadura Leve", "armor", "1 táler");
  const rope = mockItem("Corda", "equipment", "2 xelins");

  const result = await ShopService.purchaseCart(actor, [
    { source: rope, quantity: 2 }
  ], {
    balanceOverride: 500,
    complimentary: [{ source: armor, quantity: 1, reason: "Equipamento inicial" }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.totalOrtegs, 40);
  assert.deepEqual(actor.system.money, { thaler: 4, shilling: 6, orteg: 0 });
  assert.equal(actor.created.length, 2);
  assert.equal(actor.created[0].name, "Armadura Leve");
  assert.deepEqual(actor.created[0].flags["symbaroum-hud"].characterCreatorGrant, {
    quantity: 1,
    reason: "Equipamento inicial"
  });
  assert.equal(actor.created[1].name, "Corda");
  assert.equal(actor.created[1].system.number, 2);
});

function mockActor(money, { failCreation = false } = {}) {
  const actor = {
    id: `actor-${Math.random()}`,
    system: { money: { ...money } },
    flags: {},
    updates: [],
    created: [],
    creationBatches: [],
    testUserPermission: () => true,
    async update(update) {
      this.updates.push(update);
      this.system.money = {
        thaler: update["system.money.thaler"],
        shilling: update["system.money.shilling"],
        orteg: update["system.money.orteg"]
      };
      if (Object.hasOwn(update, "flags.symbaroum-hud.services")) {
        this.flags["symbaroum-hud"] ??= {};
        this.flags["symbaroum-hud"].services = update["flags.symbaroum-hud.services"];
      }
      return this;
    },
    getFlag(moduleId, key) {
      return this.flags[moduleId]?.[key];
    },
    async createEmbeddedDocuments(documentName, entries) {
      assert.equal(documentName, "Item");
      if (failCreation) throw new Error("creation failed");
      this.creationBatches.push(entries);
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

function negotiatedService(id, cost) {
  return {
    id,
    uuid: `SymbaroumHudService.${id}`,
    documentClass: "Service",
    type: "service",
    name: id,
    description: "Preço definido pela regra oficial e confirmado pelo Mestre.",
    category: "professionals",
    cost,
    priceMode: "negotiated",
    unit: "purchase",
    fulfillment: "consumable",
    source: "Livro oficial"
  };
}
