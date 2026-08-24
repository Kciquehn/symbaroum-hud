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
  browserObserverOwnershipUpdate,
  canBrowseConfiguredFolder,
  canBrowseWorldDocument,
  dedupeBrowserEntries,
  explorerLicensePreview,
  filterBrowserEntries,
  filterStockManagerEntries,
  keepBrowserDocumentSheetOnTop,
  consumeShopDefinitionStock,
  consumeShopStock,
  applyShopPurchaseModifier,
  combinedShopPurchaseModifier,
  normalizeFolderAccess,
  normalizeShopConfiguration,
  normalizeShopImageSettings,
  normalizeShopPriceModifier,
  normalizeShopPriceModifiers,
  normalizeShopDefinitions,
  normalizeShopStock,
  officialShopLocationGroup,
  promoteBrowserDocumentSheet,
  replaceShopLocations,
  removeShopLocation,
  removeShopDefinition,
  removeShopPriceModifier,
  renderShopPurchaseChatMessage,
  shopIsAvailableAtActiveLocation,
  shopDraftHasChanges,
  shopPurchaseModifier,
  sortShopDirectoryStores,
  toggleShopDefinitionAvailability,
  upsertShopPriceModifier,
  upsertShopDefinition
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

test("shop exposes the official merchandise table hierarchy", () => {
  const ids = SHOP_BROWSER_CATEGORIES.map(({ id }) => id);
  for (const id of [
    "all", "weapon", "melee-weapons", "bows", "siege-weapons", "armor",
    "alchemical-elixirs", "containers", "food-and-drink", "beverages",
    "musical-instruments", "trade-goods", "survival-items"
  ]) assert.ok(ids.includes(id), id);
  assert.equal(ids.includes("expedition-gear"), false);
  assert.equal(SHOP_BROWSER_CATEGORIES.find(({ id }) => id === "bows")?.parentId, "projectile-weapons");
  assert.equal(SHOP_BROWSER_CATEGORIES.some(({ id }) => id === "ability"), false);
});

test("stock manager separates Foundry items from virtual services", () => {
  const offers = [
    { uuid: "Item.rope", documentClass: "Item" },
    { uuid: "Service.toll", documentClass: "Service" },
    { uuid: "Item.sword", documentClass: "Item" }
  ];

  assert.deepEqual(
    filterStockManagerEntries(offers, "items").map(({ uuid }) => uuid),
    ["Item.rope", "Item.sword"]
  );
  assert.deepEqual(
    filterStockManagerEntries(offers, "services").map(({ uuid }) => uuid),
    ["Service.toll"]
  );
});

test("stock manager only lists merchandise from the Categories selected for the store", () => {
  const offers = [
    {
      uuid: "Item.sword",
      documentClass: "Item",
      type: "weapon",
      taxonomyTags: ["melee-weapons", "one-handed-weapons"]
    },
    {
      uuid: "Item.armor",
      documentClass: "Item",
      type: "armor",
      taxonomyTags: ["armor", "light-armor"]
    },
    {
      uuid: "Item.rope",
      documentClass: "Item",
      type: "equipment",
      taxonomyTags: ["equipment", "survival-items"]
    },
    {
      uuid: "Service.guide",
      documentClass: "Service",
      type: "service",
      taxonomyTags: ["services", "service-guides"]
    }
  ];

  assert.deepEqual(
    filterStockManagerEntries(offers, "items", ["melee-weapons"]).map(({ uuid }) => uuid),
    ["Item.sword"]
  );
  assert.deepEqual(
    filterStockManagerEntries(offers, "items", ["armor", "survival-items"]).map(({ uuid }) => uuid),
    ["Item.armor", "Item.rope"]
  );
  assert.deepEqual(filterStockManagerEntries(offers, "items", []), []);
  assert.deepEqual(
    filterStockManagerEntries(offers, "services", ["service-guides"]).map(({ uuid }) => uuid),
    ["Service.guide"]
  );
});

test("official stores are grouped by their city while preserving specific districts", () => {
  assert.equal(officialShopLocationGroup("Forte do Cardo"), "Forte do Cardo");
  assert.equal(officialShopLocationGroup("Praça Antiga, Forte do Cardo"), "Forte do Cardo");
  assert.equal(officialShopLocationGroup("Karvosti"), "Karvosti");
});

test("quick shop availability toggle preserves stock and location assignments", () => {
  const configuration = {
    version: 4,
    stores: [{
      id: "marvalom",
      name: "Marvalom",
      open: true,
      stock: [{ uuid: "Item.rope", quantity: 4, priceModifier: 110 }]
    }],
    locations: [{ id: "thistle-hold", name: "Forte do Cardo", shopIds: ["marvalom"] }],
    activeLocationId: "thistle-hold"
  };

  const closed = toggleShopDefinitionAvailability(configuration, "marvalom");
  assert.equal(closed.stores[0].open, false);
  assert.deepEqual(closed.stores[0].stock, configuration.stores[0].stock);
  assert.deepEqual(closed.locations[0].shopIds, ["marvalom"]);
  assert.equal(closed.activeLocationId, "thistle-hold");

  const reopened = toggleShopDefinitionAvailability(closed, "marvalom");
  assert.equal(reopened.stores[0].open, true);
});

test("shop directory keeps the general store first and lists open stores before closed stores", () => {
  const stores = [
    { id: "closed-a", open: false },
    { id: "open-a", open: true },
    { id: "general", general: true, open: false },
    { id: "closed-b", open: false },
    { id: "open-b", open: true }
  ];

  assert.deepEqual(
    sortShopDirectoryStores(stores).map(({ id }) => id),
    ["general", "open-a", "open-b", "closed-a", "closed-b"]
  );
  assert.deepEqual(stores.map(({ id }) => id), ["closed-a", "open-a", "general", "closed-b", "open-b"]);
});

test("Explorer's License opens a dedicated rules reference instead of the generic service card", () => {
  const content = explorerLicensePreview({
    id: "explorer-license",
    name: "Licença de Explorador",
    source: "Livro Básico — Licença de Explorador"
  }, { icon: "fa-scroll", label: "SYMBAROUMHUD.Services.Categories.Permits" });
  assert.match(content, /symbaroum-hud-explorer-license-preview/);
  assert.match(content, /2 táleres/);
  assert.match(content, /450 táleres/);
  assert.match(content, /5–50 táleres/);
  assert.match(content, /Livro Básico/);
});

test("shop purchase chat summarizes items safely", () => {
  const content = renderShopPurchaseChatMessage({
    title: "Compra realizada",
    buyerLabel: "Teste comprou:",
    storeLabel: "Loja: Marvalom",
    totalLabel: "Total pago: 1 táler",
    lines: [{
      name: "Corda <forte>",
      uuid: "Actor.hero.Item.rope",
      img: "icons/rope.webp",
      quantity: 2,
      subtotalLabel: "1 táler"
    }]
  });

  assert.match(content, /Compra realizada/);
  assert.match(content, /data-uuid="Actor\.hero\.Item\.rope"/);
  assert.match(content, /Corda &lt;forte&gt;/);
  assert.match(content, /×2/);
  assert.match(content, /Total pago: 1 táler/);
});

test("shop price modifiers support general and official-category purchase percentages", () => {
  const pricing = normalizeShopPriceModifier({
    purchase: 125,
    useCategoryModifiers: true,
    categories: { "food-and-drink": 115, beverages: 80, "survival-items": 150 }
  });
  assert.equal(shopPurchaseModifier(pricing, ["equipment", "food-and-drink", "beverages"]), 80);
  assert.equal(shopPurchaseModifier(pricing, ["equipment", "survival-items"]), 150);
  assert.equal(shopPurchaseModifier(pricing, ["equipment", "clothing"]), 125);
  assert.equal(shopPurchaseModifier({ purchase: 125 }, ["food-and-drink"]), 125);
  const adjusted = applyShopPurchaseModifier({ raw: "2 táleres", ortegs: 200 }, 125);
  assert.equal(adjusted.amount, 300);
  assert.equal(adjusted.denomination, "orteg");
  assert.equal(adjusted.ortegs, 300);
  assert.equal(adjusted.sourceRaw, "2 táleres");
  assert.equal(adjusted.modifier, 125);
  assert.equal(
    applyShopPurchaseModifier({ raw: "5 xelins", ortegs: 50 }, 95).ortegs,
    50,
    "preços em xelins devem continuar em xelins inteiros"
  );
  assert.equal(
    applyShopPurchaseModifier({ raw: "7 ortegas", ortegs: 7 }, 125).ortegs,
    9,
    "preços em ortegas preservam a precisão da menor moeda"
  );
  assert.equal(combinedShopPurchaseModifier(120, 90), 108);
});

test("legacy expedition shop settings migrate to the unified survival Category", () => {
  const pricing = normalizeShopPriceModifier({
    purchase: 100,
    useCategoryModifiers: true,
    categories: { "expedition-gear": 135 }
  });
  assert.deepEqual(pricing.categories, { "survival-items": 135 });

  const stores = normalizeShopDefinitions({
    version: 4,
    stores: [{
      id: "expedition-supplies",
      name: "Suprimentos",
      categories: ["expedition-gear", "survival-items"]
    }]
  });
  assert.deepEqual(stores[0].categories, ["survival-items"]);
});

test("shop price settings are isolated per merchant and safely normalized", () => {
  const saved = upsertShopPriceModifier(null, "general", { purchase: 75 });
  const next = upsertShopPriceModifier(saved, "merchant-one", {
    purchase: 120,
    useCategoryModifiers: true,
    categories: { "melee-weapons": 150, beverages: 85 }
  });
  const normalized = normalizeShopPriceModifiers(next);
  assert.equal(normalized.shops.general.purchase, 75);
  assert.equal(normalized.shops["merchant-one"].purchase, 120);
  assert.equal(normalized.shops["merchant-one"].categories["melee-weapons"], 150);
  assert.equal(normalized.shops["merchant-one"].categories.beverages, 85);
  assert.equal(normalized.version, 2);
});

test("legacy per-type shop prices migrate to the matching official categories", () => {
  const normalized = normalizeShopPriceModifier({
    purchase: 110,
    useTypeModifiers: true,
    types: { weapon: 125, armor: 90, equipment: 105 }
  });
  assert.equal(normalized.useCategoryModifiers, true);
  assert.equal(normalized.categories["melee-weapons"], 125);
  assert.equal(normalized.categories["ranged-weapons"], 125);
  assert.equal(normalized.categories["siege-weapons"], 125);
  assert.equal(normalized.categories.armor, 90);
  assert.equal(normalized.categories.equipment, 105);
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

test("shop taxonomy categories filter by inherited official tags", () => {
  const merchandise = [
    { ...entries[3], taxonomyTags: ["ranged-weapons", "projectile-weapons", "bows"] },
    entry("Item.wine", "Vinho", "equipment", "Item", "world:Item", "Itens do Mundo", "advanced-players-guide", "Guia Avançado do Jogador", "", "1 táler", ["food-and-drink", "beverages"])
  ];
  assert.deepEqual(
    filterBrowserEntries(merchandise, { category: "ranged-weapons" }).map(({ name }) => name),
    ["Espada"]
  );
  assert.deepEqual(
    filterBrowserEntries(merchandise, { category: "beverages" }).map(({ name }) => name),
    ["Vinho"]
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

test("browser uses the official category as its single item classification filter", () => {
  const merchandise = [
    {
      ...entries[3],
      taxonomyPrimary: "one-handed-weapons",
      taxonomyTags: ["melee-weapons", "one-handed-weapons"]
    },
    {
      ...entry("Item.wine", "Vinho", "equipment", "Item", "world:Item", "Itens do Mundo", "core-rulebook", "Livro Básico"),
      taxonomyPrimary: "beverages",
      taxonomyTags: ["equipment", "food-and-drink", "beverages"]
    }
  ];
  assert.deepEqual(
    filterBrowserEntries(merchandise, { excludedTaxonomies: new Set(["one-handed-weapons"]) })
      .map(({ name }) => name),
    ["Vinho"]
  );
  assert.deepEqual(
    filterBrowserEntries(merchandise, { excludedTaxonomies: new Set(["food-and-drink"]) })
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

test("browser facet scans can skip repeated sorting and reuse prepared search text", () => {
  const unsorted = [
    { ...entries[1], name: "Zeta", searchText: "atalho preparado" },
    { ...entries[2], name: "Alfa", searchText: "outro indice" }
  ];
  assert.deepEqual(
    filterBrowserEntries(unsorted, { query: "atalho", sort: false }).map(({ name }) => name),
    ["Zeta"]
  );
  assert.deepEqual(
    filterBrowserEntries(unsorted, { sort: false }).map(({ name }) => name),
    ["Zeta", "Alfa"]
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

test("GM folder configuration grants browser access without Observer ownership", () => {
  const folders = new Map([
    ["official", { id: "official", folder: null }],
    ["abilities", { id: "abilities", folder: { id: "official" } }]
  ]);
  const item = {
    documentName: "Item",
    folder: { id: "abilities" },
    testUserPermission: () => false
  };
  const access = { configured: true, folderIds: ["official"] };
  assert.equal(canBrowseWorldDocument(item, { id: "player", isGM: false }, access, folders), true);
});

test("folder configuration excludes world documents outside the selected folder tree", () => {
  const folders = new Map([
    ["official", { id: "official", folder: null }],
    ["private", { id: "private", folder: null }]
  ]);
  const item = {
    documentName: "Item",
    folder: { id: "private" },
    testUserPermission: () => true
  };
  const access = { configured: true, folderIds: ["official"] };
  assert.equal(canBrowseWorldDocument(item, { id: "player", isGM: false }, access, folders), false);
});

test("documents without a folder require their explicit root access option", () => {
  const item = { documentName: "Item", folder: null };
  assert.equal(canBrowseConfiguredFolder(item, {
    configured: true,
    folderIds: ["root:Item"]
  }, new Map()), true);
  assert.equal(canBrowseConfiguredFolder(item, {
    configured: true,
    folderIds: []
  }, new Map()), false);
});

test("unconfigured folder access preserves Foundry Observer permissions", () => {
  const item = {
    documentName: "Item",
    folder: null,
    testUserPermission: (_user, level) => level <= 2
  };
  assert.equal(canBrowseWorldDocument(item, { id: "player", isGM: false }, null, new Map()), true);
});

test("folder access settings are normalized and deduplicated", () => {
  assert.deepEqual(normalizeFolderAccess({
    configured: true,
    folderIds: ["official", "official", null, ""]
  }), {
    configured: true,
    folderIds: ["official"]
  });
});

test("the shop switcher normalizes future world stores", () => {
  assert.deepEqual(normalizeShopDefinitions({ stores: [
    { id: "blacksmith", name: "Ferreiro", icon: "fa-hammer" },
    { id: "blacksmith", name: "Duplicada" },
    { id: "general", name: "Não substitui a Loja Geral" },
    { id: "", name: "Inválida" }
  ] }), [
    { id: "blacksmith", name: "Ferreiro", icon: "fa-hammer", img: "icons/svg/mystery-man.svg", imageScale: 100, imageX: 50, imageY: 50, description: "", open: true, stock: [] }
  ]);
});

test("legacy generated official shops receive the expanded source-backed description", () => {
  const [store] = normalizeShopDefinitions({
    version: 3,
    stores: [{
      id: "official-thistle-hold-marvaloms",
      name: "Marvalom’s",
      description: "Loja lendária para caçadores de tesouros e exploradores. Mantém equipamento de expedição e uma seleção menor de armas, normalmente acima do preço comum.\n\nForte do Cardo · Livro Básico — O Mundo de Symbaroum"
    }]
  });
  assert.match(store.description, /modelo de loja/i);
  assert.match(store.description, /Referência oficial:/);
});

test("saving a new shop adds it to the world shop directory", () => {
  assert.deepEqual(upsertShopDefinition({
    version: 1,
    stores: [{ id: "alchemist", name: "Alquimista", icon: "fa-flask" }]
  }, {
    id: "blacksmith",
    name: "  Ferreiro  ",
    icon: "fa-hammer"
  }), {
    version: 4,
    stores: [
      { id: "alchemist", name: "Alquimista", icon: "fa-flask", img: "icons/svg/mystery-man.svg", imageScale: 100, imageX: 50, imageY: 50, description: "", open: true, stock: [] },
      { id: "blacksmith", name: "Ferreiro", icon: "fa-hammer", img: "icons/svg/mystery-man.svg", imageScale: 100, imageX: 50, imageY: 50, description: "", open: true, stock: [] }
    ],
    locations: [],
    activeLocationId: null
  });
});

test("commercial locations normalize their shops and restrict the active player destination", () => {
  const configuration = normalizeShopConfiguration({
    stores: [
      { id: "blacksmith", name: "Ferreiro" },
      { id: "alchemist", name: "Alquimista" }
    ],
    locations: [
      { id: "thistle-hold", name: "Forte do Cardo", shopIds: ["general", "blacksmith", "missing", "blacksmith"] },
      { id: "duplicate", name: "Duplicado", shopIds: ["alchemist"] },
      { id: "duplicate", name: "Ignorado", shopIds: [] }
    ],
    activeLocationId: "thistle-hold"
  });
  assert.deepEqual(configuration.locations, [
    { id: "thistle-hold", name: "Forte do Cardo", shopIds: ["general", "blacksmith"] },
    { id: "duplicate", name: "Duplicado", shopIds: ["alchemist"] }
  ]);
  assert.equal(configuration.activeLocationId, "thistle-hold");
  assert.equal(shopIsAvailableAtActiveLocation(configuration, "blacksmith"), true);
  assert.equal(shopIsAvailableAtActiveLocation(configuration, "alchemist"), false);
});

test("worlds without configured locations preserve the existing store directory", () => {
  assert.equal(shopIsAvailableAtActiveLocation({ stores: [] }, "general"), true);
  assert.equal(shopIsAvailableAtActiveLocation({ stores: [{ id: "smith", name: "Ferreiro" }] }, "smith"), true);
});

test("replacing locations keeps stores and clears an invalid active location", () => {
  const next = replaceShopLocations({
    stores: [{ id: "smith", name: "Ferreiro" }]
  }, [{ id: "yndaros", name: "Yndaros", shopIds: ["smith"] }], "missing");
  assert.equal(next.version, 4);
  assert.equal(next.activeLocationId, null);
  assert.equal(next.stores[0].id, "smith");
});

test("deleting a commercial location preserves its stores and clears it when active", () => {
  const next = removeShopLocation({
    stores: [{ id: "smith", name: "Ferreiro" }],
    locations: [
      { id: "thistle-hold", name: "Forte do Cardo", shopIds: ["smith"] },
      { id: "yndaros", name: "Yndaros", shopIds: ["general"] }
    ],
    activeLocationId: "thistle-hold"
  }, "thistle-hold");
  assert.deepEqual(next.stores.map(({ id }) => id), ["smith"]);
  assert.deepEqual(next.locations, [
    { id: "yndaros", name: "Yndaros", shopIds: ["general"] }
  ]);
  assert.equal(next.activeLocationId, null);
});

test("a new store is automatically assigned to the active location", () => {
  const next = upsertShopDefinition({
    stores: [],
    locations: [{ id: "thistle-hold", name: "Forte do Cardo", shopIds: [] }],
    activeLocationId: "thistle-hold"
  }, { id: "marvalom", name: "Marvalom" });
  assert.deepEqual(next.locations[0].shopIds, ["marvalom"]);
});

test("saving an existing shop updates it without duplicating the menu entry", () => {
  assert.deepEqual(upsertShopDefinition({
    version: 1,
    stores: [
      { id: "blacksmith", name: "Ferreiro", icon: "fa-store" },
      { id: "alchemist", name: "Alquimista", icon: "fa-flask" }
    ]
  }, {
    id: "blacksmith",
    name: "Ferreiro de Yndaros",
    icon: "fa-hammer"
  }).stores, [
    { id: "alchemist", name: "Alquimista", icon: "fa-flask", img: "icons/svg/mystery-man.svg", imageScale: 100, imageX: 50, imageY: 50, description: "", open: true, stock: [] },
    { id: "blacksmith", name: "Ferreiro de Yndaros", icon: "fa-hammer", img: "icons/svg/mystery-man.svg", imageScale: 100, imageX: 50, imageY: 50, description: "", open: true, stock: [] }
  ]);
});

test("shop image framing is normalized and participates in draft changes", () => {
  assert.deepEqual(normalizeShopImageSettings({ imageScale: 400, imageX: -10, imageY: 72.4 }), {
    imageScale: 250,
    imageX: 0,
    imageY: 72
  });
  assert.equal(shopDraftHasChanges(
    { name: "Loja", imageScale: 135, imageX: 30, imageY: 65 },
    { name: "Loja", imageScale: 100, imageX: 50, imageY: 50 }
  ), true);
});

test("custom shop stock is normalized, deduplicated, and starts empty", () => {
  assert.deepEqual(normalizeShopStock(null), []);
  assert.deepEqual(normalizeShopStock([
    { uuid: "Item.sword", quantity: 2 },
    { uuid: "Item.sword", quantity: 5 },
    { uuid: "Item.rope", quantity: 0 },
    { uuid: "", quantity: 4 },
    { uuid: "Item.invalid", quantity: -1 }
  ]), [
    { uuid: "Item.rope", quantity: 0 },
    { uuid: "Item.sword", quantity: 5 }
  ]);
});

test("generated stock preserves its per-item price variation", () => {
  assert.deepEqual(normalizeShopStock([
    { uuid: "Item.rope", quantity: 4, priceModifier: 115, pool: "expedition" },
    { uuid: "Item.sword", quantity: 1, priceModifier: 100 }
  ]), [
    { uuid: "Item.rope", quantity: 4, priceModifier: 115, pool: "expedition" },
    { uuid: "Item.sword", quantity: 1 }
  ]);
});

test("each custom shop keeps its own open or closed state", () => {
  assert.equal(normalizeShopDefinitions({ stores: [
    { id: "open-shop", name: "Aberta" },
    { id: "closed-shop", name: "Fechada", open: false }
  ] })[0].open, true);
  assert.equal(normalizeShopDefinitions({ stores: [
    { id: "closed-shop", name: "Fechada", open: false }
  ] })[0].open, false);
  assert.equal(shopDraftHasChanges({ name: "Loja", open: false }, { name: "Loja", open: true }), true);
});

test("deleting a custom shop also removes it from locations and pricing", () => {
  const configuration = removeShopDefinition({
    stores: [
      { id: "blacksmith", name: "Ferreiro" },
      { id: "inn", name: "Estalagem" }
    ],
    locations: [{ id: "thistle-hold", name: "Forte do Cardo", shopIds: ["general", "blacksmith", "inn"] }],
    activeLocationId: "thistle-hold"
  }, "blacksmith");
  assert.deepEqual(configuration.stores.map(({ id }) => id), ["inn"]);
  assert.deepEqual(configuration.locations[0].shopIds, ["general", "inn"]);
  assert.deepEqual(removeShopDefinition(configuration, "general"), configuration);

  assert.deepEqual(removeShopPriceModifier({
    shops: { general: { purchase: 90 }, blacksmith: { purchase: 120 }, inn: { purchase: 100 } }
  }, "blacksmith"), {
    version: 2,
    shops: {
      general: { purchase: 90, useCategoryModifiers: false, categories: {} },
      inn: { purchase: 100, useCategoryModifiers: false, categories: {} }
    }
  });
});

test("purchases consume only the configured custom shop stock", () => {
  assert.deepEqual(consumeShopStock([
    { uuid: "Item.sword", quantity: 5 },
    { uuid: "Item.rope", quantity: 1 }
  ], [
    { uuid: "Item.sword", quantity: 2 },
    { uuid: "Item.unknown", quantity: 4 }
  ]), [
    { uuid: "Item.rope", quantity: 1 },
    { uuid: "Item.sword", quantity: 3 }
  ]);

  const definitions = consumeShopDefinitionStock({ stores: [{
    id: "blacksmith",
    name: "Ferreiro",
    stock: [{ uuid: "Item.sword", quantity: 2 }]
  }] }, "blacksmith", [{ uuid: "Item.sword", quantity: 1 }]);
  assert.equal(definitions.version, 4);
  assert.deepEqual(definitions.stores[0].stock, [{ uuid: "Item.sword", quantity: 1 }]);
});

test("shop drafts detect pending name, image, and description changes", () => {
  assert.equal(shopDraftHasChanges("", ""), false);
  assert.equal(shopDraftHasChanges("  ", ""), false);
  assert.equal(shopDraftHasChanges("Ferreiro", "Ferreiro"), false);
  assert.equal(shopDraftHasChanges(" Ferreiro ", "Ferreiro"), false);
  assert.equal(shopDraftHasChanges("Ferreiro de Yndaros", "Ferreiro"), true);
  assert.equal(shopDraftHasChanges("Nova Loja", ""), true);
  assert.equal(shopDraftHasChanges({
    name: "Ferreiro",
    img: "merchant.webp",
    description: "Armas de qualidade."
  }, {
    name: "Ferreiro",
    img: "merchant.webp",
    description: "Armas de qualidade."
  }), false);
  assert.equal(shopDraftHasChanges({
    name: "Ferreiro",
    img: "merchant-new.webp",
    description: "Armas de qualidade."
  }, {
    name: "Ferreiro",
    img: "merchant.webp",
    description: "Armas de qualidade."
  }), true);
  assert.equal(shopDraftHasChanges({
    name: "Ferreiro",
    img: "merchant.webp",
    description: "Agora também vende armaduras."
  }, {
    name: "Ferreiro",
    img: "merchant.webp",
    description: "Armas de qualidade."
  }), true);
});

test("item sheets opened from the browser are promoted above the shop", () => {
  let promoted = false;
  let className = "";
  const sheet = {
    element: {
      classList: {
        add: (value) => { className = value; }
      }
    },
    bringToFront: () => { promoted = true; }
  };
  assert.equal(promoteBrowserDocumentSheet(sheet), true);
  assert.equal(promoted, true);
  assert.equal(className, "symbaroum-hud-browser-document-preview");
});

test("an item sheet is promoted throughout the shop click render race", () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const callbacks = [];
  let promotions = 0;
  globalThis.setTimeout = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };
  globalThis.clearTimeout = () => undefined;
  try {
    const sheet = {
      element: { classList: { add: () => undefined } },
      bringToFront: () => { promotions += 1; }
    };
    assert.equal(keepBrowserDocumentSheetOnTop(sheet), true);
    callbacks.forEach((callback) => callback());
    assert.equal(promotions, 6);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("selected browser documents receive real Observer ownership", () => {
  assert.deepEqual(browserObserverOwnershipUpdate({
    id: "ability",
    ownership: { default: 0 },
    flags: {}
  }, true), {
    action: "granted",
    update: {
      _id: "ability",
      "ownership.default": 2,
      "flags.symbaroum-hud.browserObserverPreviousDefault": 0
    }
  });
});

test("deselected browser documents restore only module-managed ownership", () => {
  assert.deepEqual(browserObserverOwnershipUpdate({
    id: "ability",
    ownership: { default: 2 },
    flags: { "symbaroum-hud": { browserObserverPreviousDefault: 0 } }
  }, false), {
    action: "restored",
    update: {
      _id: "ability",
      "ownership.default": 0,
      "flags.symbaroum-hud.-=browserObserverPreviousDefault": null
    }
  });
  assert.equal(browserObserverOwnershipUpdate({
    id: "manual-observer",
    ownership: { default: 2 },
    flags: {}
  }, false), null);
});

function entry(uuid, name, type, documentClass, sourceId, sourceLabel, origin, originLabel, reference = "", cost = "", taxonomyTags = []) {
  return { uuid, name, type, documentClass, sourceId, sourceLabel, origin, originLabel, reference, cost, taxonomyTags };
}
