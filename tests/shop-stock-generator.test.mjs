import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICIAL_SHOP_PRESET_BY_ID,
  OFFICIAL_SHOP_PRESETS,
  officialShopDescription
} from "../scripts/data/official-shop-presets.mjs";
import {
  defaultShopStockRule,
  generateOfficialShopStock,
  generateShopStockByCategories,
  matchesShopStockCategories,
  matchesShopStockPool,
  normalizeShopStockRules,
  resolveShopStockRule,
  seededRandom
} from "../scripts/services/shop-stock-generator.mjs";

const entries = [
  entry("Item.rope", "Corda", "equipment", ["equipment", "survival-items"]),
  entry("Item.grappling-hook", "Arpéu", "equipment", ["equipment", "survival-items"]),
  entry("Item.lantern", "Lanterna", "equipment", ["equipment", "survival-items"]),
  entry("Item.backpack", "Mochila", "equipment", ["equipment", "containers"]),
  entry("Item.pick", "Picareta", "equipment", ["equipment", "tools"]),
  entry("Item.lab", "Laboratório de Campo", "equipment", ["equipment", "tools", "specialized-tools"]),
  entry("Item.trap", "Armadilha", "equipment", ["equipment", "traps"]),
  entry("Item.sword", "Espada", "weapon", ["melee-weapons", "one-handed-weapons"]),
  entry("Item.bow", "Arco", "weapon", ["ranged-weapons", "projectile-weapons", "bows"]),
  entry("Item.armor", "Armadura Leve", "armor", ["armor", "light-armor"]),
  entry("Item.elixir", "Cura Herbal", "equipment", ["equipment", "alchemical-elixirs"]),
  entry("Item.wine", "Vinho", "equipment", ["equipment", "food-and-drink", "beverages"]),
  entry("Item.fish", "Truta", "equipment", ["equipment", "food-and-drink", "fish"]),
  entry("Item.curio", "Ídolo Antigo", "equipment", ["equipment", "curiosities"])
];

test("official shop catalog has unique, auditable presets", () => {
  assert.ok(OFFICIAL_SHOP_PRESETS.length >= 15);
  assert.equal(new Set(OFFICIAL_SHOP_PRESETS.map(({ id }) => id)).size, OFFICIAL_SHOP_PRESETS.length);
  for (const preset of OFFICIAL_SHOP_PRESETS) {
    assert.ok(preset.name);
    assert.ok(preset.location);
    assert.ok(preset.source.book);
    assert.ok(preset.source.section);
    assert.ok(preset.details.length >= 2, `${preset.name} precisa de informações oficiais ampliadas`);
    assert.match(officialShopDescription(preset), /Referência oficial:/);
    assert.ok(preset.categories.length, `${preset.name} precisa declarar as categorias vendidas`);
    assert.equal(
      preset.categories.some((category) => ["equipment", "services", "expenses", "service"].includes(category)),
      false,
      `${preset.name} não deve liberar uma categoria genérica que permita mercadorias alheias ao comércio`
    );
    assert.ok(preset.pools.length);
    assert.ok(preset.essentials.length, `${preset.name} precisa declarar itens essenciais`);
    assert.equal(new Set(preset.essentials.map(({ id }) => id)).size, preset.essentials.length);
    for (const essential of preset.essentials) {
      assert.ok(essential.id);
      assert.equal(essential.quantity.length, 2);
      assert.ok(
        essential.names.length || essential.references.length || essential.anyTags.length,
        `${preset.name}/${essential.id} precisa de um seletor de item`
      );
    }
  }
});

test("expedition stores always stock their available essential items before rotating stock", () => {
  const result = generateOfficialShopStock(entries, "marvaloms", { seed: "estoque-essencial" });
  const rope = result.stock.find(({ uuid }) => uuid === "Item.rope");
  const hook = result.stock.find(({ uuid }) => uuid === "Item.grappling-hook");
  assert.match(rope.pool, /^essential:/);
  assert.match(hook.pool, /^essential:/);
  assert.equal(result.stock.filter(({ uuid }) => uuid === "Item.rope").length, 1);
  assert.ok(rope.quantity >= 4 && rope.quantity <= 12);
  assert.ok(hook.quantity >= 2 && hook.quantity <= 6);
});

test("missing essentials are reported without blocking the rest of the generated stock", () => {
  const result = generateOfficialShopStock(
    entries.filter(({ uuid }) => !["Item.rope", "Item.grappling-hook", "Item.lantern"].includes(uuid)),
    "rope-and-axe",
    { seed: "estoque-incompleto" }
  );
  assert.ok(result.stock.length > 0);
  assert.ok(result.missingEssentials.includes("rope"));
  assert.ok(result.missingEssentials.includes("grappling-hook"));
  assert.ok(result.missingEssentials.includes("lantern"));
});

test("stock generation is deterministic for a given seed", () => {
  const first = generateOfficialShopStock(entries, "marvaloms", { seed: "ano-21-semana-4" });
  const second = generateOfficialShopStock(entries, "marvaloms", { seed: "ano-21-semana-4" });
  assert.deepEqual(first.stock, second.stock);
  assert.ok(first.stock.length > 0);
  assert.ok(first.stock.every(({ quantity }) => Number.isInteger(quantity) && quantity >= 1));
  assert.ok(first.stock.every(({ priceModifier }) => priceModifier >= 105 && priceModifier <= 120));
});

test("custom stock generation only includes the selected Categories", () => {
  const itemRules = {
    items: Object.fromEntries(entries.map(({ uuid }) => [uuid, {
      chance: 100,
      minimum: 1,
      maximum: 2
    }]))
  };
  const first = generateShopStockByCategories(entries, ["one-handed-weapons", "armor"], {
    seed: "armeiro-local",
    itemRules
  });
  const second = generateShopStockByCategories(entries, ["one-handed-weapons", "armor"], {
    seed: "armeiro-local",
    itemRules
  });
  assert.deepEqual(first, second);
  assert.deepEqual(new Set(first.map(({ uuid }) => uuid)), new Set(["Item.sword", "Item.armor"]));
  assert.ok(first.every(({ quantity }) => quantity >= 1 && quantity <= 2));
});

test("different seeds can produce different stock rotations", () => {
  const first = generateOfficialShopStock(entries, "queens-square-market", { seed: "one" });
  const second = generateOfficialShopStock(entries, "queens-square-market", { seed: "two" });
  assert.notDeepEqual(first.stock, second.stock);
});

test("category-based essentials are stable per seed and rotate between restocks", () => {
  const serviceEntries = [
    entry("SymbaroumHudService.lodging", "Hospedagem", "service", ["services", "service-hospitality"]),
    entry("SymbaroumHudService.guide", "Guia", "service", ["services", "service-contracts"]),
    entry("SymbaroumHudService.stabling", "Estábulo", "service", ["services", "service-travel"])
  ];
  const preset = {
    id: "test-services",
    price: [100, 100],
    essentials: [{
      id: "service",
      names: [],
      references: [],
      categories: [],
      anyTags: ["services"],
      quantity: [1, 1],
      random: true
    }],
    pools: []
  };
  const stable = generateOfficialShopStock(serviceEntries, preset, { seed: "semana-1" });
  assert.deepEqual(stable.stock, generateOfficialShopStock(serviceEntries, preset, { seed: "semana-1" }).stock);

  const rotations = new Set(
    Array.from({ length: 12 }, (_, index) =>
      generateOfficialShopStock(serviceEntries, preset, { seed: `semana-${index}` }).stock[0]?.uuid)
  );
  assert.ok(rotations.size > 1);
});

test("official virtual services participate in service-oriented stock pools", () => {
  const preset = {
    id: "test-inn",
    price: [100, 100],
    essentials: [],
    pools: [{
      id: "hospitality",
      categories: [],
      anyTags: ["service-hospitality"],
      allTags: [],
      excludeTags: [],
      picks: [1, 1],
      quantity: [2, 2],
      chance: 1,
      weight: 1
    }]
  };
  const result = generateOfficialShopStock([
    entry("SymbaroumHudService.inn-bath", "Banho", "service", ["services", "service-hospitality"]),
    entry("Item.rope", "Corda", "equipment", ["equipment", "survival-items"])
  ], preset, { seed: "estalagem" });

  assert.deepEqual(result.stock.map(({ uuid, quantity }) => ({ uuid, quantity })), [{
    uuid: "SymbaroumHudService.inn-bath",
    quantity: 2
  }]);
});

test("default availability keeps weapons scarce and consumables plentiful", () => {
  assert.deepEqual(defaultShopStockRule(entries.find(({ uuid }) => uuid === "Item.sword")), {
    chance: 55, minimum: 1, maximum: 2, customized: false
  });
  assert.deepEqual(defaultShopStockRule(entries.find(({ uuid }) => uuid === "Item.wine")), {
    chance: 90, minimum: 4, maximum: 16, customized: false
  });
  assert.deepEqual(defaultShopStockRule({
    uuid: "Item.relic",
    type: "equipment",
    taxonomyTags: ["artifacts", "minor-artifacts"]
  }), { chance: 18, minimum: 1, maximum: 1, customized: false });
});

test("per-item stock rules normalize and override category defaults", () => {
  const rules = normalizeShopStockRules({ items: {
    "Item.sword": { chance: 80, minimum: 2, maximum: 3 },
    "Item.invalid": { chance: 900, minimum: -2, maximum: 2000 }
  } });
  assert.deepEqual(rules.items["Item.sword"], {
    chance: 80, minimum: 2, maximum: 3, customized: true
  });
  assert.deepEqual(rules.items["Item.invalid"], {
    chance: 100, minimum: 1, maximum: 999, customized: true
  });
  assert.deepEqual(resolveShopStockRule(entries.find(({ uuid }) => uuid === "Item.sword"), rules), {
    chance: 80, minimum: 2, maximum: 3, customized: true
  });
});

test("generated stock obeys each item's appearance chance and quantity", () => {
  const preset = {
    id: "test-armory",
    price: [100, 100],
    essentials: [{
      id: "sword",
      names: ["Espada"],
      references: [],
      categories: ["weapon"],
      anyTags: [],
      quantity: [10, 10]
    }],
    pools: []
  };
  const absent = generateOfficialShopStock(entries, preset, {
    seed: "sem-espada",
    itemRules: { items: { "Item.sword": { chance: 0, minimum: 1, maximum: 1 } } }
  });
  assert.equal(absent.stock.some(({ uuid }) => uuid === "Item.sword"), false);
  assert.deepEqual(absent.missingEssentials, []);

  const present = generateOfficialShopStock(entries, preset, {
    seed: "uma-espada",
    itemRules: { items: { "Item.sword": { chance: 100, minimum: 1, maximum: 2 } } }
  });
  const sword = present.stock.find(({ uuid }) => uuid === "Item.sword");
  assert.ok(sword);
  assert.ok(sword.quantity >= 1 && sword.quantity <= 2);
});

test("stock pools respect category and exclusion constraints", () => {
  const pool = {
    categories: ["equipment"],
    anyTags: ["food-and-drink"],
    excludeTags: ["beverages"]
  };
  assert.equal(matchesShopStockPool(entries.find(({ uuid }) => uuid === "Item.fish"), pool), true);
  assert.equal(matchesShopStockPool(entries.find(({ uuid }) => uuid === "Item.wine"), pool), false);
  assert.equal(matchesShopStockPool(entries.find(({ uuid }) => uuid === "Item.sword"), pool), false);
});

test("official shop category allowlists block unrelated stock before pool selection", () => {
  const halls = OFFICIAL_SHOP_PRESET_BY_ID.get("halls-of-symbaroum");
  const inn = OFFICIAL_SHOP_PRESET_BY_ID.get("winged-ladle");
  const food = entry("Item.stew", "Ensopado", "equipment", ["equipment", "food-and-drink", "stews"]);
  const clothing = entry("Item.garb", "Trajes", "equipment", ["equipment", "clothing"]);
  const lodging = entry("SymbaroumHudService.city-lodging", "Estadia", "service", ["services", "service-hospitality"]);
  const ritual = entry("SymbaroumHudService.mystic-ritual", "Ritual místico", "service", ["services", "service-professionals"]);

  assert.equal(matchesShopStockCategories(food, halls.categories), true);
  assert.equal(matchesShopStockCategories(lodging, halls.categories), true);
  assert.equal(matchesShopStockCategories(clothing, halls.categories), false);
  assert.equal(matchesShopStockCategories(ritual, halls.categories), false);
  assert.equal(matchesShopStockCategories(food, inn.categories), true);
  assert.equal(matchesShopStockCategories(lodging, inn.categories), true);
  assert.equal(matchesShopStockCategories(clothing, inn.categories), false);
  assert.equal(matchesShopStockCategories(ritual, inn.categories), false);
});

test("inn stock generation never admits clothing or professional ritual services", () => {
  const inn = OFFICIAL_SHOP_PRESET_BY_ID.get("winged-ladle");
  const candidates = [
    entry("Item.stew", "Ensopado", "equipment", ["equipment", "food-and-drink", "stews"]),
    entry("Item.wine", "Vinho", "equipment", ["equipment", "food-and-drink", "beverages"]),
    entry("Item.garb", "Trajes", "equipment", ["equipment", "clothing"]),
    entry("SymbaroumHudService.city-lodging", "Estadia", "service", ["services", "service-hospitality"]),
    entry("SymbaroumHudService.mystic-ritual", "Ritual místico", "service", ["services", "service-professionals"])
  ];
  const result = generateOfficialShopStock(candidates, inn, { seed: "estalagem-oficial" });
  const uuids = new Set(result.stock.map(({ uuid }) => uuid));

  assert.equal(uuids.has("Item.garb"), false);
  assert.equal(uuids.has("SymbaroumHudService.mystic-ritual"), false);
  assert.ok([...uuids].every((uuid) => [
    "Item.stew", "Item.wine", "SymbaroumHudService.city-lodging"
  ].includes(uuid)));
});

test("unknown presets fail closed instead of generating arbitrary merchandise", () => {
  const result = generateOfficialShopStock(entries, "missing-preset", { seed: "test" });
  assert.equal(result.preset, null);
  assert.deepEqual(result.stock, []);
});

test("seeded random returns stable values in the unit interval", () => {
  const one = seededRandom("davokar");
  const two = seededRandom("davokar");
  const first = Array.from({ length: 5 }, () => one());
  assert.deepEqual(first, Array.from({ length: 5 }, () => two()));
  assert.ok(first.every((value) => value >= 0 && value < 1));
});

test("preset lookup exposes the source-backed Marvalom definition", () => {
  const preset = OFFICIAL_SHOP_PRESET_BY_ID.get("marvaloms");
  assert.equal(preset.location, "Forte do Cardo");
  assert.match(preset.source.section, /Marvalom/i);
});

function entry(uuid, name, type, taxonomyTags) {
  return { uuid, name, type, taxonomyTags };
}
