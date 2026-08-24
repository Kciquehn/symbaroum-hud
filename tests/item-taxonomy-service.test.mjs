import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWorldItem,
  ITEM_TAXONOMY_VERSION,
  itemHasTaxonomyTag,
  normalizeCategoryOverrides,
  resolveItemTaxonomy,
  setItemTaxonomyCategories,
  synchronizeWorldItemTaxonomy
} from "../scripts/services/item-taxonomy-service.mjs";
import { OFFICIAL_ITEM_CATEGORY_ASSIGNMENT_COUNT } from "../scripts/data/official-item-category-assignments.mjs";

function item(name, type = "equipment", system = {}, flags = {}) {
  return { id: name.toLowerCase().replace(/\W+/g, "-"), name, type, system, flags };
}

test("wine follows the official Food and Drink hierarchy", () => {
  const taxonomy = classifyWorldItem(item("Garrafa de vinho tinto", "equipment"), {
    folderPath: "Symbaroum - GAJ - Itens / GAJ - Equipamentos / 1 Comidas e Bebidas"
  });
  assert.equal(taxonomy.primary, "beverages");
  for (const tag of ["food-and-drink", "beverages", "alcoholic", "consumable", "equipment", "shop"]) {
    assert.ok(taxonomy.tags.includes(tag), tag);
  }
  assert.ok(taxonomy.basis.includes("official-folder"));
});

test("a meat pie receives both applicable official table tags", () => {
  const taxonomy = classifyWorldItem(item("Torta de carne"), {
    folderPath: "GAJ - Equipamentos / 1 Comidas e Bebidas"
  });
  assert.equal(taxonomy.primary, "pies");
  assert.ok(taxonomy.tags.includes("food-and-drink"));
  assert.ok(taxonomy.tags.includes("pies"));
  assert.ok(taxonomy.tags.includes("prepared-food"));
  assert.equal(taxonomy.tags.includes("beverages"), false);
});

test("official alchemical folders and descriptions produce multiple precise tags", () => {
  const antidote = classifyWorldItem(item("Antídoto Forte"), {
    folderPath: "Symbaroum - Itens / Elixires Alquímicos"
  });
  assert.equal(antidote.primary, "alchemical-elixirs");
  for (const tag of ["alchemical-elixirs", "alchemical", "antidote", "consumable"]) {
    assert.ok(antidote.tags.includes(tag), tag);
  }

  const blueDrops = classifyWorldItem(item("Gotas Azuis", "equipment", {
    description: "Gotas Azuis funciona como um antídoto fraco e neutraliza drogas."
  }), { folderPath: "Symbaroum - Itens / Equipamentos" });
  for (const tag of ["alchemical-elixirs", "alchemical", "antidote", "drug"]) {
    assert.ok(blueDrops.tags.includes(tag), tag);
  }
  assert.ok(blueDrops.basis.includes("official-description"));
});

test("waybread follows the official Alchemical Elixirs table", () => {
  const document = item("Pão de viagem");
  document.id = "pZRbyyX2FrEHM0xr";
  const taxonomy = classifyWorldItem(document, {
    folderPath: "Symbaroum - Itens / Elixires Alquímicos"
  });
  for (const tag of [
    "alchemical-elixirs", "alchemical", "consumable", "food-and-drink",
    "survival-items"
  ]) {
    assert.ok(taxonomy.tags.includes(tag), tag);
  }
});

test("official identities correct ambiguous mechanics without relying on translated names", () => {
  const bow = item("Arco de Cavalaria", "weapon", { reference: "1handed" });
  bow.id = "UL9hwMy9EI18vCdo";
  const bowTaxonomy = classifyWorldItem(bow);
  for (const tag of ["bows", "projectile-weapons", "ranged-weapons"]) {
    assert.ok(bowTaxonomy.tags.includes(tag), tag);
  }
  assert.equal(bowTaxonomy.tags.includes("one-handed-weapons"), false);
  assert.equal(bowTaxonomy.tags.includes("melee-weapons"), false);

  const horn = item("Copo de Chifre");
  horn.id = "AgUiqfl0xvdoxpd9";
  const hornTaxonomy = classifyWorldItem(horn);
  assert.ok(hornTaxonomy.tags.includes("containers"));
  assert.equal(hornTaxonomy.tags.includes("musical-instruments"), false);
});

test("the curated official matrix covers the imported merchandise catalog", () => {
  assert.ok(OFFICIAL_ITEM_CATEGORY_ASSIGNMENT_COUNT >= 180);
});

test("native weapon and armor data determine their mechanical subcategories", () => {
  const bow = classifyWorldItem(item("Arco", "weapon", { reference: "ranged" }));
  assert.equal(bow.primary, "bows");
  for (const tag of ["bows", "projectile-weapons", "ranged-weapons"]) {
    assert.ok(bow.tags.includes(tag), tag);
  }

  const plate = classifyWorldItem(item("Armadura Pesada", "armor", {
    baseProtection: "1d8",
    impeding: 4
  }));
  assert.equal(plate.primary, "heavy-armor");
  assert.ok(plate.tags.includes("armor"));
  assert.ok(plate.tags.includes("heavy-armor"));
});

test("Greater Artifacts remain distinct from the Mystical Treasures table", () => {
  const taxonomy = classifyWorldItem(item("A Lanterna da Salamandra"), {
    folderPath: "Symbaroum - Itens / Artefatos Superiores"
  });
  assert.equal(taxonomy.primary, "artifacts");
  assert.ok(taxonomy.tags.includes("artifacts"));
  assert.equal(taxonomy.tags.includes("mystical-treasures"), false);
  assert.ok(taxonomy.tags.includes("mystical"));
});

test("curated exclusions win over loose names and native weapon fields", () => {
  const vesa = item("Copo de Vesa");
  vesa.id = "cTTLahVle3FDrdvp";
  const vesaTaxonomy = classifyWorldItem(vesa);
  assert.ok(vesaTaxonomy.tags.includes("non-alcoholic"));
  assert.equal(vesaTaxonomy.tags.includes("alcoholic"), false);

  const firetube = item("Tubo de Fogo Alquímico, Portátil", "weapon", { reference: "heavy" });
  firetube.id = "UOuleO8eTNy7HoMk";
  const firetubeTaxonomy = classifyWorldItem(firetube);
  for (const tag of ["heavy-weapons", "melee-weapons", "projectile-weapons", "ranged-weapons", "alchemical-weapons"]) {
    assert.ok(firetubeTaxonomy.tags.includes(tag), tag);
  }

  const poisonManual = item("Manual de Venenos", "equipment", {
    description: "Manual para preparar venenos alquímicos consumíveis."
  });
  poisonManual.id = "FMWP0vnyPzqB7od8";
  const manualTaxonomy = classifyWorldItem(poisonManual);
  assert.ok(manualTaxonomy.tags.includes("specialized-tools"));
  for (const tag of ["alchemical-elixirs", "alchemical", "consumable", "poison"]) {
    assert.equal(manualTaxonomy.tags.includes(tag), false, tag);
  }
});

test("official mechanical variants keep only the categories their rules support", () => {
  const groundPot = item("Pote de Ruptura (no chão)");
  groundPot.id = "xEHxF78Z9pO1vlOl";
  const groundPotTaxonomy = classifyWorldItem(groundPot);
  assert.ok(groundPotTaxonomy.tags.includes("siege-weapons"));
  assert.ok(groundPotTaxonomy.tags.includes("alchemical-weapons"));
  assert.equal(groundPotTaxonomy.tags.includes("traps"), false);

  const buriedPot = item("Pote de Ruptura (enterrado)");
  buriedPot.id = "RmGT5eV8yhcn9Edh";
  assert.ok(classifyWorldItem(buriedPot).tags.includes("traps"));

  const steelCircle = item("Círculo de Aço", "weapon", { reference: "ranged" });
  steelCircle.id = "q4teNj0ZJliRWchW";
  const circleTaxonomy = classifyWorldItem(steelCircle, { folderPath: "Artefatos Superiores" });
  assert.ok(circleTaxonomy.tags.includes("throwing-weapons"));
  assert.equal(circleTaxonomy.tags.includes("projectile-weapons"), false);

  const livingChain = item("Corrente Viva");
  livingChain.id = "yzMSNGDukYWfv4Qx";
  const chainTaxonomy = classifyWorldItem(livingChain, { folderPath: "Artefatos Superiores" });
  assert.ok(chainTaxonomy.tags.includes("traps"));
  assert.ok(chainTaxonomy.tags.includes("melee-weapons"));
});

test("canonical merchandise table headings win over secondary food facets", () => {
  const stew = item("Carne com batata");
  stew.id = "auYHhueBfbULEhlV";
  assert.equal(classifyWorldItem(stew).primary, "stews");

  const meatPie = item("Torta de carne");
  meatPie.id = "E522AWZVX170oYH0";
  assert.equal(classifyWorldItem(meatPie).primary, "pies");

  const platter = item("Bandeja de cortes");
  platter.id = "RpksPVVzbh5nvrRg";
  const platterTaxonomy = classifyWorldItem(platter);
  assert.equal(platterTaxonomy.primary, "desserts");
  assert.ok(platterTaxonomy.tags.includes("meat"));

  const ingredient = item("Ingrediente culinário");
  ingredient.id = "N2nopfvcRwQ3dWwq";
  const ingredientTaxonomy = classifyWorldItem(ingredient);
  assert.equal(ingredientTaxonomy.primary, "trade-goods");
  assert.ok(ingredientTaxonomy.tags.includes("food-and-drink"));
});

test("ordinary supplies receive useful overlapping tags", () => {
  const bandages = classifyWorldItem(item("Bandagens"));
  assert.ok(bandages.tags.includes("equipment"));

  const saffron = classifyWorldItem(item("Açafrão, uma caixa"));
  for (const tag of ["ingredient", "trade-goods"]) {
    assert.ok(saffron.tags.includes(tag), tag);
  }
  assert.equal(saffron.tags.includes("food-and-drink"), false);
});

test("saved current taxonomy is used by tag checks", () => {
  const document = item("Teste");
  document.flags["symbaroum-hud"] = {
    itemTaxonomy: { version: ITEM_TAXONOMY_VERSION, primary: "food-and-drink", tags: ["food-and-drink"], basis: [] }
  };
  assert.equal(itemHasTaxonomyTag(document, "food-and-drink"), true);
  assert.equal(itemHasTaxonomyTag(document, "melee-weapons"), false);
});

test("a GM category override wins without discarding the automatic taxonomy", () => {
  const document = item("Garrafa de vinho tinto");
  document.flags["symbaroum-hud"] = {
    itemTaxonomy: { version: ITEM_TAXONOMY_VERSION, primary: "beverages", tags: ["beverages", "food-and-drink"], basis: [] },
    itemTaxonomyOverride: "trade-good"
  };
  const taxonomy = resolveItemTaxonomy(document);
  assert.equal(taxonomy.primary, "trade-goods");
  assert.equal(taxonomy.automaticPrimary, "beverages");
  assert.equal(taxonomy.overridden, true);
  assert.ok(taxonomy.tags.includes("trade-goods"));
  assert.ok(taxonomy.tags.includes("food-and-drink"));
});

test("legacy manual categories are migrated without losing the override", () => {
  const document = item("Caixa de mercadorias");
  document.flags["symbaroum-hud"] = { itemTaxonomyOverride: "trade-good" };
  const taxonomy = resolveItemTaxonomy(document);
  assert.equal(taxonomy.primary, "trade-goods");
  assert.equal(taxonomy.overridden, true);
});

test("legacy expedition gear is merged into the survival and expedition Category", () => {
  const document = item("Equipamento de campo");
  document.flags["symbaroum-hud"] = {
    itemTaxonomyOverride: {
      version: 1,
      mode: "replace",
      categories: ["expedition-gear", "survival-items"]
    }
  };
  const taxonomy = resolveItemTaxonomy(document);
  assert.deepEqual(taxonomy.manualCategories, ["survival-items"]);
  assert.ok(taxonomy.tags.includes("survival-items"));
  assert.equal(taxonomy.tags.includes("expedition-gear"), false);
});

test("a manual Category set can classify the same Item in several store Categories", () => {
  const document = item("Arma versátil", "weapon", { reference: "1handed" });
  document.flags["symbaroum-hud"] = {
    itemTaxonomy: classifyWorldItem(document),
    itemTaxonomyOverride: {
      version: 1,
      mode: "replace",
      categories: ["one-handed-weapons", "long-weapons"]
    }
  };
  const taxonomy = resolveItemTaxonomy(document);
  assert.equal(taxonomy.overridden, true);
  assert.equal(taxonomy.overrideMode, "replace");
  assert.deepEqual(taxonomy.manualCategories, ["long-weapons", "one-handed-weapons"]);
  for (const category of ["one-handed-weapons", "long-weapons", "melee-weapons"]) {
    assert.ok(taxonomy.tags.includes(category), category);
  }
});

test("Category override normalization removes invalid and duplicate Categories", () => {
  assert.deepEqual(normalizeCategoryOverrides({
    mode: "replace",
    categories: ["long-weapons", "invalid", "long-weapons", "one-handed-weapons"]
  }), {
    mode: "replace",
    categories: ["long-weapons", "one-handed-weapons"]
  });
});

test("saving Item Categories persists the multi-Category world flag", async () => {
  const document = item("Arma versátil", "weapon");
  document.documentName = "Item";
  document.setFlag = async (scope, key, value) => {
    document.flags[scope] ??= {};
    document.flags[scope][key] = value;
  };
  document.unsetFlag = async () => {};
  await setItemTaxonomyCategories(document, ["long-weapons", "one-handed-weapons"]);
  assert.deepEqual(document.flags["symbaroum-hud"].itemTaxonomyOverride, {
    version: 1,
    mode: "replace",
    categories: ["long-weapons", "one-handed-weapons"]
  });
  const taxonomy = resolveItemTaxonomy(document);
  assert.ok(taxonomy.tags.includes("long-weapons"));
  assert.ok(taxonomy.tags.includes("one-handed-weapons"));
});

test("GM synchronization persists only missing or outdated taxonomy in batches", async () => {
  const current = item("Arco", "weapon", { reference: "ranged" });
  current.flags["symbaroum-hud"] = { itemTaxonomy: classifyWorldItem(current) };
  const missing = item("Vinho", "equipment");
  const batches = [];
  const result = await synchronizeWorldItemTaxonomy({
    items: [current, missing],
    user: { isGM: true },
    ItemClass: { updateDocuments: async (updates) => batches.push(updates) },
    batchSize: 1
  });
  assert.deepEqual(result, { scanned: 2, updated: 1, skipped: false });
  assert.equal(batches.length, 1);
  assert.equal(batches[0][0]._id, missing.id);
  assert.equal(batches[0][0]["flags.symbaroum-hud.itemTaxonomy"].version, ITEM_TAXONOMY_VERSION);
});

test("players never mutate the world taxonomy", async () => {
  const result = await synchronizeWorldItemTaxonomy({
    items: [item("Arco", "weapon", { reference: "ranged" })],
    user: { isGM: false },
    ItemClass: { updateDocuments: async () => assert.fail("must not update") }
  });
  assert.deepEqual(result, { scanned: 0, updated: 0, skipped: true });
});
