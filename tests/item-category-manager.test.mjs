import assert from "node:assert/strict";
import test from "node:test";

let configuredServices = { version: 1, services: [] };

class MockDialogV2 {
  static result = null;
  static options = null;

  static async wait(options) {
    this.options = options;
    return this.result;
  }
}

globalThis.foundry = {
  applications: { api: { ApplicationV2: class {}, DialogV2: MockDialogV2 } }
};
globalThis.game = {
  items: [],
  user: { isGM: true },
  settings: {
    get: () => configuredServices,
    set: async (_moduleId, _key, value) => {
      configuredServices = value;
      return value;
    }
  },
  i18n: {
    lang: "pt-BR",
    localize: (key) => key,
    format: (key) => key
  }
};

const {
  ItemCategoryManagerApplication,
  filterItemCategoryRows,
  openServiceAssetTaxonomyEditor,
  serviceAssetCategoryRows
} = await import(
  "../scripts/applications/item-category-manager.mjs"
);
const {
  serviceBrowserEntries,
  serviceCatalog
} = await import("../scripts/services/service-contract-service.mjs");

test("Item Category manager filters by search, document type, and classification mode", () => {
  const rows = [
    row("espada arma de uma mao", "weapon", "manual"),
    row("corda equipamento sobrevivencia", "equipment", "automatic"),
    row("arco arma a distancia", "weapon", "automatic")
  ];
  const count = { textContent: "" };
  const empty = { hidden: false };
  const root = {
    querySelectorAll: () => rows,
    querySelector: (selector) => selector.includes("visible") ? count : empty
  };

  assert.equal(filterItemCategoryRows(root, { query: "arma", type: "weapon", mode: "manual" }), 1);
  assert.deepEqual(rows.map(({ hidden }) => hidden), [false, true, true]);
  assert.equal(count.textContent, "1");
  assert.equal(empty.hidden, true);
});

test("Item Category manager lists every official persistent asset with type and Categories", async () => {
  configuredServices = { version: 1, services: [] };
  globalThis.game.items = [worldEquipment()];
  const rows = serviceAssetCategoryRows(configuredServices);
  assert.equal(rows.length, 31);
  assert.ok(rows.every(({ kind, canOpen, img, name, type, categories, mode }) => (
    kind === "service-asset"
    && canOpen === false
    && img
    && name
    && type.startsWith("service-")
    && categories.length > 0
    && mode === "automatic"
  )));

  const pig = rows.find(({ id }) => id === "farm-pig");
  assert.equal(pig.type, "service-farm-animal");
  assert.deepEqual(pig.categories.map(({ id }) => id), ["farm-animals"]);
  const horse = rows.find(({ id }) => id === "transport-light-riding-horse");
  assert.equal(horse.type, "service-transport");
  assert.deepEqual(horse.categories.map(({ id }) => id), ["farm-animals", "transport"]);
  const castle = rows.find(({ id }) => id === "construction-castle");
  assert.equal(castle.type, "service-construction");

  const context = await new ItemCategoryManagerApplication()._prepareContext();
  assert.equal(context.count, 32);
  assert.equal(context.automaticCount, 32);
  assert.equal(context.manualCount, 0);
  assert.equal(context.types.reduce((total, { count }) => total + count, 0), 32);
  assert.equal(context.types.find(({ id }) => id === "equipment").count, 1);
  assert.equal(context.types.find(({ id }) => id === "service-farm-animal").count, 9);
  globalThis.game.items = [];
});

test("editing an official persistent asset stores a custom multi-Category override without mutating official data", async () => {
  configuredServices = { version: 1, services: [] };
  MockDialogV2.result = {
    action: "save",
    categories: ["farm-animals", "transport"]
  };

  assert.equal(await openServiceAssetTaxonomyEditor("farm-pig"), true);
  assert.equal(configuredServices.services.length, 1);
  assert.equal(configuredServices.services[0].id, "farm-pig");
  assert.equal(configuredServices.services[0].official, false);
  assert.equal(configuredServices.services[0].officialBase, true);
  assert.deepEqual(configuredServices.services[0].itemCategories, ["farm-animals", "transport"]);

  const officialPig = serviceCatalog().find(({ id }) => id === "farm-pig");
  assert.deepEqual(officialPig.itemCategories, ["farm-animals"]);
  const overriddenPig = serviceCatalog(configuredServices).find(({ id }) => id === "farm-pig");
  assert.equal(overriddenPig.official, true);
  assert.deepEqual(overriddenPig.itemCategories, ["farm-animals", "transport"]);
  const browserPig = serviceBrowserEntries(configuredServices).find(({ id }) => id === "farm-pig");
  assert.equal(browserPig.sourceLabel, "SYMBAROUMHUD.Services.OfficialCatalog");
  assert.ok(browserPig.taxonomyTags.includes("farm-animals"));
  assert.ok(browserPig.taxonomyTags.includes("transport"));

  const row = serviceAssetCategoryRows(configuredServices).find(({ id }) => id === "farm-pig");
  assert.equal(row.manual, true);
  assert.equal(row.mode, "manual");
  assert.match(row.searchText, /transport/);
});

test("restoring an official persistent asset removes its override and returns to official Categories", async () => {
  MockDialogV2.result = { action: "automatic" };
  assert.equal(await openServiceAssetTaxonomyEditor("farm-pig"), true);
  assert.deepEqual(configuredServices, { version: 1, services: [] });

  const pig = serviceAssetCategoryRows(configuredServices).find(({ id }) => id === "farm-pig");
  assert.equal(pig.manual, false);
  assert.equal(pig.mode, "automatic");
  assert.deepEqual(pig.categories.map(({ id }) => id), ["farm-animals"]);
});

test("persistent asset editor rejects non-GM users and non-asset service ids", async () => {
  configuredServices = { version: 1, services: [] };
  globalThis.game.user.isGM = false;
  assert.equal(await openServiceAssetTaxonomyEditor("farm-pig"), false);
  globalThis.game.user.isGM = true;
  assert.equal(await openServiceAssetTaxonomyEditor("bath-inn"), false);
  assert.deepEqual(configuredServices, { version: 1, services: [] });
});

function row(search, type, mode) {
  return { dataset: { search, type, mode }, hidden: false };
}

function worldEquipment() {
  return {
    id: "world-rope",
    uuid: "Item.world-rope",
    documentName: "Item",
    name: "Corda",
    img: "icons/svg/item-bag.svg",
    type: "equipment",
    flags: {
      "symbaroum-hud": {
        itemTaxonomy: {
          version: 3,
          primary: "equipment",
          tags: ["equipment"],
          basis: ["system-type"]
        }
      }
    }
  };
}
