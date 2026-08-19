import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  i18n: {
    lang: "pt-BR",
    localize: (key) => key,
    format: (key) => key
  }
};
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      DialogV2: class {}
    }
  }
};

const {
  BROWSER_CATEGORIES,
  SHOP_BROWSER_CATEGORIES,
  dedupeBrowserEntries,
  filterBrowserEntries,
  shouldHideBrowserDocumentFromDirectory
} = await import(
  "../scripts/applications/compendium-browser.mjs"
);

const entries = [
  entry("Actor.monster", "Abominação", "monster", "Actor", "world:Actor", "Atores do Mundo", "monster-codex", "Códice de Monstros"),
  entry("Item.ability", "Amoque", "ability", "Item", "world:Item", "Itens do Mundo", "core-rulebook", "Livro Básico", "berserker"),
  entry("Compendium.core.power", "Cascata de Enxofre", "mysticalPower", "Item", "core.items", "Compêndio", "core-rulebook", "Livro Básico", "brimstonecascade"),
  entry("Compendium.core.weapon", "Espada", "weapon", "Item", "core.items", "Compêndio", "advanced-players-guide", "Guia Avançado do Jogador")
];

test("browser exposes every supported Symbaroum category", () => {
  assert.deepEqual(
    BROWSER_CATEGORIES.map(({ id }) => id),
    ["all", "ability", "mysticalPower", "ritual", "trait", "boon", "burden", "weapon", "armor", "equipment", "artifact", "monster"]
  );
});

test("shop keeps the browser layout but only exposes merchandise categories", () => {
  assert.deepEqual(
    SHOP_BROWSER_CATEGORIES.map(({ id }) => id),
    ["all", "weapon", "armor", "equipment"]
  );
});

test("browser filters by category without mixing document classes", () => {
  assert.deepEqual(
    filterBrowserEntries(entries, { category: "ability" }).map(({ name }) => name),
    ["Amoque"]
  );
  assert.deepEqual(
    filterBrowserEntries(entries, { category: "monster" }).map(({ name }) => name),
    ["Abominação"]
  );
});

test("browser search is accent-insensitive and includes references", () => {
  assert.deepEqual(
    filterBrowserEntries(entries, { query: "abominacao" }).map(({ name }) => name),
    ["Abominação"]
  );
  assert.deepEqual(
    filterBrowserEntries(entries, { query: "brimstone" }).map(({ name }) => name),
    ["Cascata de Enxofre"]
  );
});

test("browser excludes deselected sources", () => {
  assert.deepEqual(
    filterBrowserEntries(entries, { excludedSources: new Set(["world:Item", "world:Actor"]) })
      .map(({ name }) => name),
    ["Cascata de Enxofre", "Espada"]
  );
});

test("browser filters by original source book independently from storage source", () => {
  assert.deepEqual(
    filterBrowserEntries(entries, { excludedOrigins: new Set(["core-rulebook", "monster-codex"]) })
      .map(({ name }) => name),
    ["Espada"]
  );
});

test("browser search includes the localized source-book tag", () => {
  assert.deepEqual(
    filterBrowserEntries(entries, { query: "guia avancado" }).map(({ name }) => name),
    ["Espada"]
  );
});

test("browser search also finds an indexed item by its displayed price", () => {
  const pricedEntries = [
    entry("Item.oil", "Óleo de Lâmpada", "equipment", "Item", "world:Item", "Itens do Mundo", "core-rulebook", "Livro Básico", "oil", "1 ortega")
  ];
  assert.deepEqual(
    filterBrowserEntries(pricedEntries, { query: "1 ortega" }).map(({ name }) => name),
    ["Óleo de Lâmpada"]
  );
});

test("browser deduplicates world and compendium copies by original document id", () => {
  const compendium = {
    ...entries[1],
    uuid: "Compendium.core.sameId",
    documentId: "sameId",
    sourceId: "core.items"
  };
  const world = { ...entries[1], uuid: "Item.sameId", documentId: "sameId" };
  assert.deepEqual(dedupeBrowserEntries([compendium, world]).map(({ uuid }) => uuid), ["Item.sameId"]);
});

test("players only see Observer library items inside the compendium browser", () => {
  const observerItem = {
    testUserPermission: (_user, level) => level <= 2
  };
  assert.equal(shouldHideBrowserDocumentFromDirectory(observerItem, { id: "player", isGM: false }), true);
  assert.equal(shouldHideBrowserDocumentFromDirectory(observerItem, { id: "gm", isGM: true }), false);
});

test("owned world items remain visible in the regular Item directory", () => {
  const ownedItem = {
    testUserPermission: (_user, level) => level <= 3
  };
  assert.equal(shouldHideBrowserDocumentFromDirectory(ownedItem, { id: "player", isGM: false }), false);
});

function entry(uuid, name, type, documentClass, sourceId, sourceLabel, origin, originLabel, reference = "", cost = "") {
  return { uuid, name, type, documentClass, sourceId, sourceLabel, origin, originLabel, reference, cost };
}
