import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  time: { worldTime: 1_000 },
  i18n: {
    localize: (key) => key
  }
};

const {
  actorServiceRecords,
  addActorServiceRecords,
  createPurchasedServiceRecords,
  findServiceDefinition,
  normalizeCustomServices,
  removeCustomService,
  removeActorService,
  serviceBrowserEntries,
  serviceCatalog,
  serviceUuid,
  upsertCustomService,
  useActorService
} = await import("../scripts/services/service-contract-service.mjs");

test("official services have unique shop identities and source metadata", () => {
  const catalog = serviceCatalog();
  assert.ok(catalog.length >= 15);
  assert.equal(new Set(catalog.map(({ id }) => id)).size, catalog.length);
  assert.ok(catalog.every(({ name, cost, category, source }) => name && cost && category && source));
  const entries = serviceBrowserEntries();
  assert.ok(entries.every((entry) => entry.documentClass === "Service"));
  assert.ok(entries.filter(({ offerKind }) => offerKind === "service")
    .every((entry) => entry.taxonomyTags.includes("services")));
  assert.ok(entries.filter(({ offerKind }) => offerKind === "asset")
    .every((entry) => !entry.taxonomyTags.includes("services")));
});

test("the expanded official catalog keeps every service and asset id unique", () => {
  const catalog = serviceCatalog();
  const ids = catalog.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("explorer-license-individual-year"));
  assert.ok(ids.includes("thistle-exclusive-lodging"));
  assert.ok(ids.includes("farm-pig"));
  assert.ok(ids.includes("construction-castle"));
});

test("official wage and lifestyle references are available as non-Item purchases", () => {
  const expected = [
    ["urban-manual-laborer", "1 ortega", "day"],
    ["army-soldier-wage", "1 ortega", "week"],
    ["infantry-mercenary", "1 xelim", "day"],
    ["mounted-mercenary", "10 xelins", "day"],
    ["noble-lifestyle", "100 táleres", "day"]
  ];

  for (const [id, cost, unit] of expected) {
    const definition = findServiceDefinition(serviceUuid(id));
    assert.ok(definition, `Missing official wage or lifestyle offer: ${id}`);
    assert.equal(definition.cost, cost, `${id} cost`);
    assert.equal(definition.unit, unit, `${id} unit`);
    assert.equal(definition.fulfillment, "temporary", `${id} fulfillment`);
  }
});

test("official Thistle Hold and Karvosti tariffs keep exact duration-specific offers", () => {
  const tariffs = [
    ["thistle-exclusive-lodging", "1 táler", "night"],
    ["thistle-good-lodging", "2 xelins", "night"],
    ["thistle-good-lodging-week", "1 táler", "week"],
    ["thistle-good-lodging-month", "4 táleres", "month"],
    ["thistle-common-lodging", "1 xelim", "night"],
    ["thistle-common-lodging-week", "5 xelins", "week"],
    ["thistle-common-lodging-month", "2 táleres", "month"],
    ["thistle-simple-lodging", "5 ortegas", "night"],
    ["thistle-simple-lodging-week", "2 xelins", "week"],
    ["thistle-simple-lodging-month", "1 táler", "month"],
    ["thistle-rent-pleasant-week", "2 táleres", "week"],
    ["thistle-rent-pleasant", "10 táleres", "month"],
    ["thistle-rent-common-week", "1 táler", "week"],
    ["thistle-rent-common", "4 táleres", "month"],
    ["thistle-rent-simple-week", "5 xelins", "week"],
    ["thistle-rent-simple", "2 táleres", "month"],
    ["karvosti-pilgrim-camp", "3 ortegas", "night"],
    ["karvosti-pilgrim-camp-week", "1 xelim", "week"],
    ["karvosti-pilgrim-camp-month", "4 xelins", "month"],
    ["karvosti-market-space", "5 ortegas", "night"],
    ["karvosti-market-space-week", "2 xelins", "week"],
    ["karvosti-market-space-month", "8 xelins", "month"],
    ["karvosti-victorious-hawk", "1 táler", "night"],
    ["karvosti-victorious-hawk-week", "5 táleres", "week"],
    ["karvosti-victorious-hawk-month", "15 táleres", "month"],
    ["karvosti-fortress-room", "2-9 xelins", "night"],
    ["karvosti-fortress-room-week", "1-6 táleres", "week"],
    ["karvosti-fortress-room-month", "4-15 táleres", "month"],
    ["karvosti-cave-lodging", "1 xelim", "night"],
    ["karvosti-braddokkugru", "2-5 ortegas", "night"]
  ];

  for (const [id, cost, unit] of tariffs) {
    const definition = findServiceDefinition(serviceUuid(id));
    assert.ok(definition, `Missing official tariff: ${id}`);
    assert.equal(definition.cost, cost, `${id} cost`);
    assert.equal(definition.unit, unit, `${id} unit`);
    assert.equal(definition.fulfillment, "temporary", `${id} fulfillment`);
  }
});

test("official lodging, banquet, campaign and fee offers also belong to expenses", () => {
  const expenseIds = [
    "rural-lodging", "city-lodging", "rural-barn-lodging",
    "rural-banquet", "urban-banquet",
    "field-life-knight", "field-life-mounted-knight", "field-life-infantry",
    "noble-lifestyle",
    "road-toll", "thistle-hold-entry-toll",
    "explorer-license-gathering", "explorer-license-harvesting",
    "explorer-license-exploration", "explorer-license-wagon",
    "explorer-license-incompetence", "explorer-license-intentions",
    "explorer-license-other", "thistle-hold-trade-tax",
    "thistle-exclusive-lodging", "thistle-good-lodging-week",
    "thistle-common-lodging-month", "thistle-rent-pleasant-week",
    "karvosti-pilgrim-camp-month", "karvosti-market-space-week",
    "karvosti-victorious-hawk-month", "karvosti-fortress-room",
    "karvosti-fortress-room-week", "karvosti-fortress-room-month",
    "karvosti-cave-lodging", "karvosti-braddokkugru", "karvosti-braddokkugru-barter",
    "karvosti-baiaga-communal-barter", "barbarity-inn"
  ];

  for (const id of expenseIds) {
    const definition = findServiceDefinition(serviceUuid(id));
    assert.ok(definition, `Missing expense definition: ${id}`);
    assert.ok(definition.itemCategories.includes("services"), `${id} is a service`);
    assert.ok(definition.itemCategories.includes("expenses"), `${id} is an expense`);
  }

  const browserEntries = serviceBrowserEntries();
  for (const id of expenseIds) {
    const entry = browserEntries.find((candidate) => candidate.id === id);
    assert.ok(entry.taxonomyTags.includes("expenses"), `${id} exposes the expenses filter`);
  }
});

test("official farm animals and transports retain all of their item Categories", () => {
  const pig = findServiceDefinition(serviceUuid("farm-pig"));
  assert.equal(pig.name, "Porco");
  assert.equal(pig.cost, "1 táler");
  assert.equal(pig.category, "assets");
  assert.equal(pig.offerKind, "asset");
  assert.equal(pig.fulfillment, "permanent");
  assert.deepEqual(pig.itemCategories, ["farm-animals"]);

  const horse = findServiceDefinition(serviceUuid("transport-light-riding-horse"));
  assert.equal(horse.offerKind, "asset");
  assert.deepEqual(horse.itemCategories, ["farm-animals", "transport"]);
});

test("official negotiated offers preserve their rule instead of inventing a fixed price", () => {
  const expected = [
    ["expedition-guide-adjusted", "1 táler + Vigilante + Mateiro"],
    ["informant-dark-davokar-loot-share", "4–5% do saque"],
    ["thistle-hold-trade-tax", "10% do valor de mercado"],
    ["treasury-sale-commission", "Até 25% do valor da venda"],
    ["queen-legation-archive-testimony", "Testemunho valioso"],
    ["agdala-divination", "Favores, comida, afeto ou xelins"],
    ["dodramos-oracle", "Favores, comida, afeto ou xelins"],
    ["karvosti-braddokkugru-barter", "Comida, arma ou objeto brilhante"],
    ["karvosti-baiaga-communal-barter", "Troca equivalente"],
    ["karvosti-edrafin-favor", "Favor"],
    ["karvosti-jorlamar-forge", "Preço normal +20%"]
  ];
  for (const [id, cost] of expected) {
    const definition = findServiceDefinition(serviceUuid(id));
    assert.equal(definition.priceMode, "negotiated", id);
    assert.equal(definition.cost, cost, id);
    assert.ok(definition.pricingNote, `${id} explains how to establish its price`);
  }
  assert.equal(findServiceDefinition(serviceUuid("karvosti-baiaga-communal-meal")).cost, "3 xelins");
});

test("the official castle is exposed as a purchasable permanent asset", () => {
  const castle = findServiceDefinition(serviceUuid("construction-castle"));
  assert.equal(castle.name, "Castelo");
  assert.equal(castle.cost, "10000 táleres");
  assert.equal(castle.offerKind, "asset");
  assert.equal(castle.fulfillment, "permanent");
  assert.deepEqual(castle.itemCategories, ["constructions"]);

  const [record] = createPurchasedServiceRecords([
    purchaseLine("construction-castle")
  ], { worldTime: 1_000 });
  assert.equal(record.serviceId, "construction-castle");
  assert.equal(record.offerKind, "asset");
  assert.equal(record.expiresAt, 0);
});

test("browser entries include every item Category used by expanded assets", () => {
  const entries = serviceBrowserEntries();
  const pig = entries.find(({ id }) => id === "farm-pig");
  assert.equal(pig.taxonomyPrimary, "farm-animals");
  assert.ok(pig.taxonomyTags.includes("service-assets"));
  assert.ok(pig.taxonomyTags.includes("farm-animals"));

  const horse = entries.find(({ id }) => id === "transport-light-riding-horse");
  assert.ok(horse.taxonomyTags.includes("farm-animals"));
  assert.ok(horse.taxonomyTags.includes("transport"));
});

test("custom persistent-asset Categories expose their inherited shop filters", () => {
  const pig = findServiceDefinition(serviceUuid("farm-pig"));
  const custom = upsertCustomService(null, {
    ...pig,
    official: false,
    itemCategories: ["bows"]
  });
  const entry = serviceBrowserEntries(custom).find(({ id }) => id === "farm-pig");
  assert.equal(entry.taxonomyPrimary, "bows");
  assert.ok(entry.taxonomyTags.includes("bows"));
  assert.ok(entry.taxonomyTags.includes("projectile-weapons"));
  assert.ok(entry.taxonomyTags.includes("ranged-weapons"));
});

test("night and year services calculate their duration and expire at the boundary", async () => {
  const nightDefinition = findServiceDefinition(serviceUuid("thistle-exclusive-lodging"));
  const yearDefinition = findServiceDefinition(serviceUuid("explorer-license-individual-year"));
  assert.equal(nightDefinition.unit, "night");
  assert.equal(yearDefinition.unit, "year");

  const start = 1_000;
  const [night, year] = createPurchasedServiceRecords([
    purchaseLine("thistle-exclusive-lodging"),
    purchaseLine("explorer-license-individual-year")
  ], { worldTime: start });
  assert.equal(night.expiresAt, start + 86_400);
  assert.equal(year.expiresAt, start + 31_536_000);

  const actor = mockActor();
  await addActorServiceRecords(actor, [night, year]);
  const beforeNightEnds = actorServiceRecords(actor, { worldTime: night.expiresAt - 1 });
  assert.equal(beforeNightEnds.find(({ serviceId }) => serviceId === night.serviceId).status, "active");
  const whenNightEnds = actorServiceRecords(actor, { worldTime: night.expiresAt });
  assert.equal(whenNightEnds.find(({ serviceId }) => serviceId === night.serviceId).status, "expired");
  assert.equal(whenNightEnds.find(({ serviceId }) => serviceId === year.serviceId).status, "active");
  const whenYearEnds = actorServiceRecords(actor, { worldTime: year.expiresAt });
  assert.equal(whenYearEnds.find(({ serviceId }) => serviceId === year.serviceId).status, "expired");
});

test("Thistle Hold entry toll follows the official per-leg-or-wheel rule", () => {
  const toll = findServiceDefinition(serviceUuid("thistle-hold-entry-toll"));
  assert.equal(toll.name, "Pedágio de entrada em Forte do Cardo");
  assert.equal(toll.cost, "1 xelim");
  assert.equal(toll.unit, "legOrWheel");
  assert.equal(toll.fulfillment, "instant");
  assert.equal(toll.origin, "core-rulebook");
  assert.match(toll.description, /2 xelins/);
  assert.match(toll.description, /10%/);
});

test("Explorer's License is a distinct official service with a readable document identity", () => {
  const license = findServiceDefinition(serviceUuid("explorer-license"));
  assert.equal(license.name, "Licença de Explorador");
  assert.equal(license.category, "permits");
  assert.equal(license.img, "icons/svg/book.svg");
  assert.equal(license.origin, "core-rulebook");
  assert.match(license.description, /mensal ou anual/);
  assert.match(license.description, /tamanho, dos objetivos e da composição/);
});

test("custom services can be safely created and resolved by their virtual UUID", () => {
  const custom = upsertCustomService(null, {
    id: "ferry",
    name: "Travessia de balsa",
    cost: "2 xelins",
    category: "travel",
    unit: "person",
    fulfillment: "consumable"
  });
  assert.equal(normalizeCustomServices(custom).services.length, 1);
  const resolved = findServiceDefinition(serviceUuid("ferry"), custom);
  assert.equal(resolved.name, "Travessia de balsa");
  assert.equal(resolved.uuid, "SymbaroumHudService.ferry");
  assert.equal(resolved.documentClass, "Service");
});

test("a custom service may override an official service without mutating the official catalog", () => {
  const official = serviceCatalog().find(({ official: isOfficial }) => isOfficial);
  const custom = upsertCustomService(null, {
    ...official,
    official: false,
    name: `${official.name} personalizado`,
    cost: "2 táleres"
  });
  const overridden = findServiceDefinition(serviceUuid(official.id), custom);
  assert.equal(overridden.name, `${official.name} personalizado`);
  assert.equal(overridden.official, false);

  const restored = findServiceDefinition(
    serviceUuid(official.id),
    removeCustomService(custom, official.id)
  );
  assert.equal(restored.name, official.name);
  assert.equal(restored.official, true);
});

test("an official asset Category override never freezes its bundled rules or provenance", () => {
  const official = findServiceDefinition(serviceUuid("farm-pig"));
  const custom = upsertCustomService(null, {
    ...official,
    official: false,
    officialBase: true,
    name: "Nome antigo que não deve prevalecer",
    cost: "999 táleres",
    itemCategories: ["farm-animals", "transport"]
  });
  const effective = findServiceDefinition(serviceUuid("farm-pig"), custom);
  assert.equal(effective.name, official.name);
  assert.equal(effective.cost, official.cost);
  assert.equal(effective.source, official.source);
  assert.equal(effective.official, true);
  assert.deepEqual(effective.itemCategories, ["farm-animals", "transport"]);
});

test("instant services leave no actor record while consumables and contracts do", () => {
  const instant = createPurchasedServiceRecords([line({
    id: "bath",
    fulfillment: "instant",
    unit: "purchase"
  })]);
  assert.deepEqual(instant, []);

  const records = createPurchasedServiceRecords([
    line({ id: "passage", fulfillment: "consumable", unit: "use" }, 2),
    line({ id: "guide", fulfillment: "temporary", unit: "week" }, 3)
  ], { storeName: "Porto", worldTime: 1_000 });
  assert.equal(records.length, 2);
  assert.equal(records[0].remaining, 2);
  assert.equal(records[1].expiresAt, 1_000 + (3 * 604_800));
  assert.equal(records[1].storeName, "Porto");
});

test("actor service records can be used, completed, and removed without Items", async () => {
  const actor = mockActor();
  const [record] = createPurchasedServiceRecords([
    line({ id: "passage", fulfillment: "consumable", unit: "use" }, 2)
  ]);
  await addActorServiceRecords(actor, [record]);
  assert.equal(actorServiceRecords(actor)[0].remaining, 2);

  await useActorService(actor, record.id);
  assert.equal(actorServiceRecords(actor)[0].remaining, 1);
  await useActorService(actor, record.id);
  assert.equal(actorServiceRecords(actor)[0].status, "completed");
  assert.equal(await removeActorService(actor, record.id), true);
  assert.deepEqual(actorServiceRecords(actor), []);
});

function line({ id, fulfillment, unit }, quantity = 1) {
  return {
    source: {
      id,
      name: id,
      cost: "1 xelim",
      category: "other",
      fulfillment,
      unit
    },
    quantity,
    subtotalOrtegs: 10 * quantity,
    price: { raw: "1 xelim" }
  };
}

function purchaseLine(serviceId, quantity = 1) {
  const source = findServiceDefinition(serviceUuid(serviceId));
  assert.ok(source, `Missing catalog definition: ${serviceId}`);
  return {
    source,
    quantity,
    subtotalOrtegs: 10 * quantity,
    price: { raw: source.cost }
  };
}

function mockActor() {
  return {
    flags: {},
    getFlag(moduleId, key) {
      return this.flags[moduleId]?.[key];
    },
    async update(update) {
      this.flags["symbaroum-hud"] ??= {};
      this.flags["symbaroum-hud"].services = update["flags.symbaroum-hud.services"];
      return this;
    }
  };
}
