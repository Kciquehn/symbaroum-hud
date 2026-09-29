import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { getSetting } from "../settings.mjs";
import { ActorService } from "../services/actor-service.mjs";
import { resolveItemTaxonomy } from "../services/item-taxonomy-service.mjs";
import {
  ITEM_TAXONOMY_DEFINITIONS,
  canonicalTaxonomyCategoryId
} from "../data/item-taxonomy-categories.mjs";
import {
  OFFICIAL_SHOP_PRESET_BY_ID,
  OFFICIAL_SHOP_PRESETS,
  officialShopDescription
} from "../data/official-shop-presets.mjs";
import {
  findServiceDefinition,
  isServiceDefinition,
  isServiceUuid,
  normalizeCustomServices,
  removeCustomService,
  SERVICE_CATEGORIES,
  serviceCatalog,
  serviceBrowserEntries,
  serviceTaxonomyContext,
  serviceUuid,
  upsertCustomService
} from "../services/service-contract-service.mjs";
import {
  defaultShopStockRule,
  generateOfficialShopStock,
  generateShopStockByCategories,
  normalizeShopStockSize,
  matchesShopStockCategories,
  normalizeShopStockRules,
  resolveShopStockRule
} from "../services/shop-stock-generator.mjs";
import {
  isPurchasableShopEntry,
  moneyFromOrtegs,
  parseShopPrice,
  selectShopPrice,
  SHOP_MONEY_VALUES,
  ShopService
} from "../services/shop-service.mjs";
import {
  CONTENT_ORIGINS,
  UNKNOWN_CONTENT_ORIGIN,
  buildContentOriginIndex,
  contentOriginDefinition,
  resolveContentOrigin,
  staticContentOriginIndex
} from "../services/content-origin-service.mjs";

const ApplicationV2 = foundry.applications.api.ApplicationV2;
const DialogV2 = foundry.applications.api.DialogV2;
const OBSERVER = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? 2;
const BROWSER_OWNERSHIP_FLAG = "browserObserverPreviousDefault";
const DEFAULT_SHOP_IMAGE = "icons/svg/mystery-man.svg";
const RESULT_BATCH_SIZE = 75;
const DOCUMENT_PROMOTION_DELAYS = Object.freeze([0, 45, 110, 220, 420, 700]);
const DOCUMENT_PROMOTION_JOBS = new WeakMap();
let synchronizingBrowserOwnership = false;
const SUPPORTED_ITEM_TYPES = new Set([
  "ability",
  "armor",
  "artifact",
  "boon",
  "burden",
  "equipment",
  "mysticalPower",
  "ritual",
  "trait",
  "weapon"
]);

export const BROWSER_CATEGORIES = Object.freeze([
  category("all", "fa-book-open", "SYMBAROUMHUD.CompendiumBrowser.Categories.All"),
  category("ability", "fa-hand-fist", "SYMBAROUMHUD.CompendiumBrowser.Categories.Abilities", "Item", ["ability"]),
  category("mysticalPower", "fa-sparkles", "SYMBAROUMHUD.CompendiumBrowser.Categories.MysticalPowers", "Item", ["mysticalPower"]),
  category("ritual", "fa-book-skull", "SYMBAROUMHUD.CompendiumBrowser.Categories.Rituals", "Item", ["ritual"]),
  category("trait", "fa-person-rays", "SYMBAROUMHUD.CompendiumBrowser.Categories.Traits", "Item", ["trait"]),
  category("boon", "fa-circle-up", "SYMBAROUMHUD.CompendiumBrowser.Categories.Boons", "Item", ["boon"]),
  category("burden", "fa-circle-down", "SYMBAROUMHUD.CompendiumBrowser.Categories.Burdens", "Item", ["burden"]),
  category("weapon", "fa-sword", "SYMBAROUMHUD.CompendiumBrowser.Categories.Weapons", "Item", ["weapon"]),
  category("armor", "fa-shield-halved", "SYMBAROUMHUD.CompendiumBrowser.Categories.Armors", "Item", ["armor"]),
  category("equipment", "fa-backpack", "SYMBAROUMHUD.CompendiumBrowser.Categories.Equipment", "Item", ["equipment"]),
  category("artifact", "fa-gem", "SYMBAROUMHUD.CompendiumBrowser.Categories.Artifacts", "Item", ["artifact"]),
  category("monster", "fa-dragon", "SYMBAROUMHUD.CompendiumBrowser.Categories.Monsters", "Actor", ["monster"])
]);

const SHOP_TAXONOMY_ICONS = Object.freeze({
  "melee-weapons": "fa-khanda",
  "one-handed-weapons": "fa-sword",
  "short-weapons": "fa-knife",
  "long-weapons": "fa-staff",
  "unarmed-attacks": "fa-hand-fist",
  "heavy-weapons": "fa-hammer",
  shields: "fa-shield",
  "ranged-weapons": "fa-crosshairs",
  "projectile-weapons": "fa-bullseye",
  bows: "fa-bow-arrow",
  crossbows: "fa-crosshairs",
  arrows: "fa-arrows-left-right",
  "throwing-weapons": "fa-baseball",
  "siege-weapons": "fa-dungeon",
  "alchemical-weapons": "fa-bomb",
  armor: "fa-shield-halved",
  "light-armor": "fa-vest",
  "medium-armor": "fa-vest-patches",
  "heavy-armor": "fa-shield",
  "alchemical-elixirs": "fa-flask",
  equipment: "fa-backpack",
  constructions: "fa-house-chimney",
  transport: "fa-horse",
  containers: "fa-box-open",
  "farm-animals": "fa-cow",
  income: "fa-coins",
  clothing: "fa-shirt",
  expenses: "fa-receipt",
  services: "fa-handshake",
  tools: "fa-screwdriver-wrench",
  "specialized-tools": "fa-toolbox",
  "medical-supplies": "fa-kit-medical",
  artifacts: "fa-gem",
  "minor-artifacts": "fa-ring",
  "mystical-treasures": "fa-gem",
  traps: "fa-skull-crossbones",
  "food-and-drink": "fa-utensils",
  beverages: "fa-mug-hot",
  meat: "fa-drumstick-bite",
  teas: "fa-mug-saucer",
  stews: "fa-bowl-food",
  porridges: "fa-bowl-rice",
  fish: "fa-fish",
  desserts: "fa-ice-cream",
  soups: "fa-bowl-food",
  pies: "fa-pie",
  "tobacco-utensils": "fa-smoking",
  "tobacco-types": "fa-leaf",
  "musical-instruments": "fa-music",
  "trade-goods": "fa-scale-balanced",
  curiosities: "fa-eye",
  "survival-items": "fa-compass"
});

const SHOP_VIRTUAL_WEAPON_CATEGORY = category(
  "weapon",
  "fa-sword",
  "SYMBAROUMHUD.CompendiumBrowser.Categories.Weapons",
  "Item",
  ["weapon"],
  { shop: true }
);

export const SHOP_BROWSER_CATEGORIES = Object.freeze([
  category("all", "fa-book-open", "SYMBAROUMHUD.CompendiumBrowser.Categories.All", null, [], { shop: true }),
  SHOP_VIRTUAL_WEAPON_CATEGORY,
  ...ITEM_TAXONOMY_DEFINITIONS
    .filter((definition) => definition.group !== "documents")
    .map((definition) => category(
      definition.id,
      SHOP_TAXONOMY_ICONS[definition.id] ?? "fa-tag",
      definition.label,
      "Item",
      [],
      {
        shop: true,
        taxonomyTag: definition.id,
        parentId: definition.parent
          ?? (["melee-weapons", "ranged-weapons", "siege-weapons"].includes(definition.id) ? "weapon" : null)
      }
    )),
  ...SERVICE_CATEGORIES.map((definition) => category(
    `service-${definition.id}`,
    definition.icon,
    definition.label,
    "Service",
    ["service"],
    { shop: true, taxonomyTag: `service-${definition.id}`, parentId: "services" }
  ))
]);

const CATEGORY_BY_ID = new Map(
  [...BROWSER_CATEGORIES, ...SHOP_BROWSER_CATEGORIES].map((entry) => [entry.id, entry])
);
const SHOP_CATEGORY_IDS = new Set(SHOP_BROWSER_CATEGORIES.map((entry) => entry.id));
const CREATE_SHOP_LOCATION_VALUE = "__create_shop_location__";
const SHOP_PURCHASE_MODIFIER_CATEGORIES = Object.freeze(
  ITEM_TAXONOMY_DEFINITIONS
    .filter(({ group }) => group !== "documents")
    .map(({ id, label, parent }) => Object.freeze({
      id,
      label,
      parent,
      icon: SHOP_TAXONOMY_ICONS[id] ?? "fa-tag"
    }))
);
const SHOP_STOCK_GENERATOR_CATEGORIES = Object.freeze([
  ...SHOP_PURCHASE_MODIFIER_CATEGORIES,
  ...SERVICE_CATEGORIES.map(({ id, label, icon }) => Object.freeze({
    id: `service-${id}`,
    label,
    parent: "services",
    icon
  }))
]);
const DEFAULT_SHOP_PRICE_MODIFIER = Object.freeze({
  purchase: 100,
  useCategoryModifiers: false,
  categories: Object.freeze({})
});
const SHOP_STOCK_SIZE_I18N_SUFFIX = Object.freeze({
  small: "Small",
  medium: "Medium",
  large: "Large"
});

const CATEGORY_LABELS = Object.freeze({
  ability: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Ability",
  armor: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Armor",
  artifact: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Artifact",
  boon: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Boon",
  burden: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Burden",
  equipment: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Equipment",
  mysticalPower: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.MysticalPower",
  ritual: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Ritual",
  trait: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Trait",
  weapon: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Weapon",
  monster: "SYMBAROUMHUD.CompendiumBrowser.CategoryLabels.Monster",
  service: "SYMBAROUMHUD.Services.Service"
});

export function isGeneralStoreOpen() {
  return getSetting(SETTINGS.GENERAL_STORE_OPEN) !== false;
}

/**
 * A Symbaroum-native browser for documents imported into the world.
 * Its interaction pattern is inspired by the MIT-licensed dnd5e Compendium Browser,
 * while all indexing, document types, templates, and styling are implemented here.
 */
export class SymbaroumCompendiumBrowser extends ApplicationV2 {
  static #instance = null;
  static #originIndex = null;
  static #originIndexPromise = null;
  static #staticOriginIndex = null;
  static #sourceCache = new Map();
  static #invalidationRenderTimeout = null;

  #actor = null;
  #cart = new Map();
  #category = "all";
  #excludedOrigins = new Set();
  #excludedSources = new Set();
  #excludedTaxonomies = new Set();
  #expandedFilterSections = new Set();
  #filtersOpen = false;
  #listenerController = null;
  #lockedCategory = null;
  #mode = "browser";
  #onSelect = null;
  #query = "";
  #resultLimit = RESULT_BATCH_SIZE;
  #searchRenderTimeout = null;
  #selected = new Set();
  #selection = null;
  #selectionResolved = false;
  #shopMenuOpen = false;
  #activeShopId = "general";
  #shopDraftId = null;
  #shopDraftSavedName = "";
  #shopDraftName = "";
  #shopDraftSavedImage = DEFAULT_SHOP_IMAGE;
  #shopDraftImage = DEFAULT_SHOP_IMAGE;
  #shopDraftSavedImageScale = 100;
  #shopDraftImageScale = 100;
  #shopDraftSavedImageX = 50;
  #shopDraftImageX = 50;
  #shopDraftSavedImageY = 50;
  #shopDraftImageY = 50;
  #shopImageEditing = false;
  #shopDraftSavedDescription = "";
  #shopDraftDescription = "";
  #shopDraftSavedOpen = true;
  #shopDraftOpen = true;
  #shopDraftSavedCategories = [];
  #shopDraftCategories = [];
  #shopDraftSavedStock = [];
  #shopDraftStock = [];
  #shopSavePromise = null;
  #shopSaveTimeout = null;
  #shopStockMode = false;
  #shopStockSection = "items";
  #shopGeneratorCategories = new Set();
  #shopGeneratorReplace = true;
  #shopDraftSavedStockPresetId = "";
  #shopDraftStockPresetId = "";
  #shopView = "catalog";

  static DEFAULT_OPTIONS = {
    id: "symbaroum-hud-compendium-browser",
    classes: ["symbaroum-hud-compendium-browser"],
    window: {
      title: "SYMBAROUMHUD.CompendiumBrowser.Title",
      icon: "fa-solid fa-book-open",
      minimizable: true,
      resizable: true
    },
    position: {
      width: 960,
      height: 720
    }
  };

  constructor({
    actor = null,
    category = "all",
    lockedCategory = null,
    mode = "browser",
    selection = null,
    onSelect = null
  } = {}) {
    super();
    this.#actor = actor;
    this.#mode = mode === "shop" ? "shop" : "browser";
    this.#activeShopId = this.#mode === "shop" ? null : "general";
    this.#shopView = this.#mode === "shop" ? "directory" : "catalog";
    this.#lockedCategory = this.#validLockedCategory(lockedCategory);
    this.#category = this.#validCategory(category) ? category : (this.#lockedCategory ?? "all");
    this.#selection = selection;
    this.#onSelect = onSelect;
  }

  render(options = {}) {
    globalThis.clearTimeout(this.#searchRenderTimeout);
    this.#searchRenderTimeout = null;
    if (SymbaroumCompendiumBrowser.#invalidationRenderTimeout !== null) {
      globalThis.clearTimeout(SymbaroumCompendiumBrowser.#invalidationRenderTimeout);
      SymbaroumCompendiumBrowser.#invalidationRenderTimeout = null;
    }
    return super.render(options);
  }

  static open({ actor = null, category = "all", lockedCategory = null, mode = "browser" } = {}) {
    if (!this.#instance) this.#instance = new this({ actor, category, lockedCategory, mode });
    else {
      const nextMode = mode === "shop" ? "shop" : "browser";
      const previousActor = this.#instance.#actor?.uuid ?? this.#instance.#actor?.id ?? null;
      const nextActor = actor?.uuid ?? actor?.id ?? null;
      if (previousActor !== nextActor || this.#instance.#mode !== nextMode) {
        this.#instance.#cart.clear();
      }
      this.#instance.#actor = actor;
      this.#instance.#mode = nextMode;
      this.#instance.#activeShopId = nextMode === "shop" ? null : "general";
      this.#instance.#shopView = nextMode === "shop" ? "directory" : "catalog";
      this.#instance.#shopImageEditing = false;
      this.#instance.#lockedCategory = this.#instance.#validLockedCategory(lockedCategory);
      this.#instance.#category = this.#instance.#validCategory(category)
        ? category
        : (this.#instance.#lockedCategory ?? "all");
    }
    void this.#instance.render({ force: true }).then(() => this.#instance?.bringToFront?.());
    return this.#instance;
  }

  static openShop({ actor, category = "all", lockCategory = false } = {}) {
    return this.open({
      actor,
      category,
      lockedCategory: lockCategory ? category : null,
      mode: "shop"
    });
  }

  static select({ actor = null, category = "all", min = 1, max = 1 } = {}) {
    return new Promise((resolve) => {
      const browser = new this({
        actor,
        category,
        selection: { min, max },
        onSelect: resolve
      });
      void browser.render({ force: true });
    });
  }

  static invalidate({ origins = true, sourceIds = null } = {}) {
    if (origins) {
      this.#originIndex = null;
      this.#originIndexPromise = null;
    }
    if (sourceIds) sourceIds.forEach((sourceId) => this.#sourceCache.delete(sourceId));
    else this.#sourceCache.clear();
    this.#scheduleInvalidationRender();
  }

  static #scheduleInvalidationRender() {
    if (!this.#instance?.rendered) return;
    globalThis.clearTimeout(this.#invalidationRenderTimeout);
    this.#invalidationRenderTimeout = globalThis.setTimeout(() => {
      this.#invalidationRenderTimeout = null;
      if (this.#instance?.rendered) void this.#instance.render({ force: true });
    }, 40);
  }

  static handleGeneralStoreAvailabilityChanged(open = isGeneralStoreOpen()) {
    if (!open && this.#instance?.#activeShopId === "general") this.#instance.#cart.clear();
    if (this.#instance?.rendered && this.#instance.#mode === "shop") {
      this.#scheduleInvalidationRender();
    }
  }

  static handleShopDefinitionsChanged() {
    const instance = this.#instance;
    if (!instance?.rendered || instance.#mode !== "shop") return;
    if (!game.user?.isGM && instance.#activeShopId
      && !shopIsAvailableAtActiveLocation(
        getSetting(SETTINGS.SHOP_DEFINITIONS),
        instance.#activeShopId
      )) {
      instance.#cart.clear();
      instance.#activeShopId = null;
      instance.#shopView = "directory";
      instance.#shopMenuOpen = false;
    }
    if (instance.#shopView === "create" && !game.user?.isGM) {
      const store = configuredShopDefinitions().find((entry) => entry.id === instance.#activeShopId);
      if (store) {
        instance.#shopDraftSavedName = store.name;
        instance.#shopDraftName = store.name;
        instance.#shopDraftSavedImage = store.img;
        instance.#shopDraftImage = store.img;
        instance.#shopDraftSavedImageScale = store.imageScale;
        instance.#shopDraftImageScale = store.imageScale;
        instance.#shopDraftSavedImageX = store.imageX;
        instance.#shopDraftImageX = store.imageX;
        instance.#shopDraftSavedImageY = store.imageY;
        instance.#shopDraftImageY = store.imageY;
        instance.#shopDraftSavedDescription = store.description;
        instance.#shopDraftDescription = store.description;
        instance.#shopDraftSavedOpen = store.open;
        instance.#shopDraftOpen = store.open;
        instance.#shopDraftSavedCategories = [...(store.categories ?? [])];
        instance.#shopDraftCategories = [...(store.categories ?? [])];
        instance.#shopDraftSavedStockPresetId = store.stockPresetId ?? "";
        instance.#shopDraftStockPresetId = store.stockPresetId ?? "";
        instance.#shopDraftSavedStock = cloneShopStock(store.stock);
        instance.#shopDraftStock = cloneShopStock(store.stock);
      }
    }
    this.#scheduleInvalidationRender();
  }

  async _prepareContext() {
    const shopActive = this.#mode === "shop";
    const shopDirectoryActive = shopActive && this.#shopView === "directory";
    const originIndex = shopDirectoryActive
      ? null
      : await this.#contentOriginIndex({ waitForFull: false });
    const descriptors = sourceDescriptors();
    const enabled = configuredSources();
    const activeSources = descriptors.filter((source) => {
      if (enabled[source.id] === false) return false;
      return this.#mode !== "shop" || source.documentClass === "Item";
    });
    const sourceEntries = shopDirectoryActive ? [] : await Promise.all(
      activeSources.map((source) => this.#loadSource(source, originIndex))
    );
    const serviceEntries = shopActive && !shopDirectoryActive
      ? serviceBrowserEntries(configuredServiceDefinitions()).map(prepareBrowserEntry)
      : [];
    const entries = filterEntriesByPlayerOriginAccess(
      [...sourceEntries.flat(), ...serviceEntries],
      game.user,
      configuredOriginAccess()
    );
    const shopConfiguration = shopActive
      ? configuredShopConfiguration()
      : normalizeShopConfiguration();
    const customStores = shopConfiguration.stores;
    const activeLocation = shopConfiguration.locations
      .find(({ id }) => id === shopConfiguration.activeLocationId) ?? null;
    const locationConfigured = shopConfiguration.locations.length > 0;
    const shopAvailableAtLocation = !locationConfigured
      || Boolean(activeLocation?.shopIds.includes(this.#activeShopId));
    const generalStoreOpen = !shopActive || isGeneralStoreOpen();
    const customShopActive = shopActive && this.#shopView === "create";
    const activeShopOpen = shopDirectoryActive
      ? true
      : (customShopActive ? this.#shopDraftOpen : generalStoreOpen)
        && (Boolean(game.user?.isGM) || shopAvailableAtLocation);
    const allShopEntries = shopActive
      ? (activeShopOpen ? entries.filter(isPurchasableShopEntry) : [])
      : entries;
    const stockByUuid = new Map(this.#shopDraftStock.map((line) => [line.uuid, line]));
    const managingStock = customShopActive && Boolean(game.user?.isGM) && this.#shopStockMode;
    const stockManagerEntries = managingStock
      ? filterStockManagerEntries(
        allShopEntries,
        this.#shopStockSection,
        [...this.#shopGeneratorCategories]
      )
      : allShopEntries;
    const browsableEntries = customShopActive && !managingStock
      ? allShopEntries.filter((entry) => stockByUuid.has(entry.uuid))
      : stockManagerEntries;
    const categoryEntries = dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      category: this.#category,
      query: this.#query,
      excludedOrigins: this.#excludedOrigins,
      excludedSources: this.#excludedSources,
      excludedTaxonomies: this.#excludedTaxonomies
    }));
    const availableBeforeSourceFilter = dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      category: this.#category,
      query: this.#query,
      excludedOrigins: this.#excludedOrigins,
      excludedTaxonomies: this.#excludedTaxonomies,
      sort: false
    }));
    const availableBeforeOriginFilter = dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      category: this.#category,
      query: this.#query,
      excludedSources: this.#excludedSources,
      excludedTaxonomies: this.#excludedTaxonomies,
      sort: false
    }));
    const availableBeforeTaxonomyFilter = dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      category: this.#category,
      query: this.#query,
      excludedOrigins: this.#excludedOrigins,
      excludedSources: this.#excludedSources,
      sort: false
    }));
    const sourceCounts = countBy(availableBeforeSourceFilter, "sourceId");
    const originCounts = countBy(availableBeforeOriginFilter, "origin");
    const taxonomyCounts = countTaxonomyTags(availableBeforeTaxonomyFilter);
    const canAdd = Boolean(this.#actor && ActorService.canUpdate(this.#actor));
    const selectionSummary = this.#selectionSummary();
    const balance = ShopService.balance(this.#actor);
    const cartTotal = this.#cartTotal();
    const cartRemaining = Math.max(0, balance.total - cartTotal);
    const activeShopPricing = shopActive
      ? configuredShopPriceModifier(customShopActive ? this.#activeShopId : "general")
      : normalizeShopPriceModifier(DEFAULT_SHOP_PRICE_MODIFIER);
    const categoryUniverse = shopActive ? dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      excludedOrigins: this.#excludedOrigins,
      excludedSources: this.#excludedSources,
      excludedTaxonomies: this.#excludedTaxonomies,
      sort: false
    })) : [];
    const categories = (shopActive ? SHOP_BROWSER_CATEGORIES : BROWSER_CATEGORIES)
      .filter((entry) => !shopActive || shopCategoryAllowedByLock(entry.id, this.#lockedCategory))
      .map((entry) => ({
        ...entry,
        count: shopActive ? countMatchingCategory(categoryUniverse, entry) : null
      }))
      .filter((entry) => !shopActive || entry.id === "all" || entry.count > 0 || entry.id === this.#category);

    const allShopDirectoryStores = shopActive ? [
      {
        id: "general",
        name: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Title"),
        description: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.GeneralStoreDescription"),
        img: DEFAULT_SHOP_IMAGE,
        open: generalStoreOpen,
        general: true,
        hasImage: false,
        icon: "fa-store",
        stockCount: null
      },
      ...customStores.map((store) => ({
        ...store,
        general: false,
        hasImage: Boolean(store.img && store.img !== DEFAULT_SHOP_IMAGE),
        imageStyle: shopImageStyle(store),
        icon: store.icon || "fa-store",
        stockCount: store.stock.length
      }))
    ] : [];
    const shopDirectoryStores = sortShopDirectoryStores(allShopDirectoryStores.filter((store) => (
      !locationConfigured
      || Boolean(activeLocation?.shopIds.includes(store.id))
      || (Boolean(game.user?.isGM) && !activeLocation)
    )));
    const menuStores = Boolean(game.user?.isGM)
      ? allShopDirectoryStores
      : shopDirectoryStores;

    return {
      actor: this.#actor ? { id: this.#actor.id, name: this.#actor.name } : null,
      canAdd,
      categories: categories.map((entry) => ({
        ...entry,
        label: game.i18n.localize(entry.label),
        active: entry.id === this.#category,
        depth: shopActive ? shopCategoryDepth(entry.id) : 0,
        hasChildren: shopActive && categories.some((candidate) => candidate.parentId === entry.id),
        visible: !shopActive || shopCategoryVisible(entry.id, this.#category)
      })),
      entries: categoryEntries.slice(0, this.#resultLimit).map((entry) => {
        const price = parseShopPrice(entry.cost);
        const negotiatedPrice = entry.documentClass === "Service"
          && entry.priceMode === "negotiated";
        const stockLine = stockByUuid.get(entry.uuid);
        const purchaseModifier = combinedShopPurchaseModifier(
          shopPurchaseModifier(activeShopPricing, entry),
          customShopActive ? stockLine?.priceModifier : 100
        );
        const minimumPrice = applyShopPurchaseModifier(
          selectShopPrice(price, price?.amount),
          purchaseModifier
        );
        const cartLine = this.#cart.get(entry.uuid);
        const nextUnitPrice = cartLine?.price?.ortegs
          ?? minimumPrice?.ortegs
          ?? (negotiatedPrice ? 0 : Infinity);
        const stockQuantity = stockLine?.quantity;
        const stockRemaining = customShopActive
          ? stockLine?.unlimited
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, Number(stockQuantity ?? 0) - Number(cartLine?.quantity ?? 0))
          : null;
        return {
          ...entry,
          service: entry.documentClass === "Service",
          selected: this.#selected.has(entry.uuid),
          subtitle: browserEntryCategoryLabel(entry),
          canAdd: !shopActive && canAdd && entry.documentClass === "Item",
          canBuy: shopActive && canAdd && (Boolean(price) || (negotiatedPrice && game.user?.isGM))
            && cartRemaining >= nextUnitPrice
            && (!customShopActive || stockRemaining > 0),
          inCartQuantity: cartLine?.quantity ?? 0,
          priceLabel: negotiatedPrice
            ? entry.cost
            : modifiedShopPriceLabel(price, purchaseModifier),
          purchaseModifier,
          stockConfigured: stockByUuid.has(entry.uuid),
          stockQuantity: stockQuantity ?? 0,
          stockRemaining,
          stockUnlimited: Boolean(stockLine?.unlimited),
          stockRemainingLabel: stockLine?.unlimited
            ? game.i18n.localize("SYMBAROUMHUD.Services.Unlimited")
            : String(stockRemaining ?? 0),
          stockPriceModifier: stockLine?.priceModifier ?? 100
        };
      }),
      hasEntries: categoryEntries.length > 0,
      hasMore: categoryEntries.length > this.#resultLimit,
      renderedCount: Math.min(this.#resultLimit, categoryEntries.length),
      filters: {
        open: this.#filtersOpen,
        sections: {
          taxonomies: this.#expandedFilterSections.has("taxonomies"),
          origins: this.#expandedFilterSections.has("origins"),
          sources: this.#expandedFilterSections.has("sources")
        }
      },
      query: this.#query,
      resultCount: categoryEntries.length,
      origins: [...CONTENT_ORIGINS, contentOriginDefinition(UNKNOWN_CONTENT_ORIGIN)].map((origin) => ({
        id: origin.id,
        label: game.i18n.localize(origin.label),
        checked: !this.#excludedOrigins.has(origin.id),
        count: originCounts.get(origin.id) ?? 0
      })),
      sources: activeSources.map((source) => ({
        id: source.id,
        label: source.label,
        checked: !this.#excludedSources.has(source.id),
        count: sourceCounts.get(source.id) ?? 0
      })),
      filterTaxonomies: [
        ...ITEM_TAXONOMY_DEFINITIONS,
        ...SERVICE_CATEGORIES.map(({ id, label }) => ({ id: `service-${id}`, label }))
      ].map(({ id, label }) => ({
        id,
        label: game.i18n.localize(label),
        checked: !this.#excludedTaxonomies.has(id),
        count: taxonomyCounts.get(id) ?? 0
      })).filter(({ count }) => count > 0),
      shop: {
        active: shopActive,
        view: this.#shopView,
        directory: shopActive ? {
          active: shopDirectoryActive,
          stores: shopDirectoryStores,
          canCreate: Boolean(game.user?.isGM),
          canManageAvailability: Boolean(game.user?.isGM),
          empty: shopDirectoryStores.length === 0
        } : null,
        builder: shopActive ? {
          active: this.#shopView === "create",
          id: this.#shopDraftId,
          name: this.#shopDraftName,
          img: this.#shopDraftImage,
          imageStyle: shopImageStyle({
            imageScale: this.#shopDraftImageScale,
            imageX: this.#shopDraftImageX,
            imageY: this.#shopDraftImageY
          }),
          imageEditing: this.#shopImageEditing,
          description: this.#shopDraftDescription,
          saved: Boolean(this.#shopDraftId),
          editable: Boolean(game.user?.isGM),
          visible: customShopActive && (activeShopOpen || Boolean(game.user?.isGM)),
          managingStock,
          stockSection: {
            id: this.#shopStockSection,
            items: this.#shopStockSection === "items",
            services: this.#shopStockSection === "services"
          },
          generator: {
            presets: OFFICIAL_SHOP_PRESETS.map((preset) => ({
              id: preset.id,
              name: preset.name,
              location: preset.location,
              selected: preset.id === this.#shopDraftStockPresetId
            })),
            official: Boolean(this.#shopDraftStockPresetId),
            categories: SHOP_STOCK_GENERATOR_CATEGORIES.map((category) => ({
              id: category.id,
              label: game.i18n.localize(category.label),
              icon: category.icon,
              depth: shopCategoryDepth(category.id),
              checked: this.#shopGeneratorCategories.has(category.id)
            })),
            replace: this.#shopGeneratorReplace,
            selectedCount: this.#shopGeneratorCategories.size
          },
          stockCount: this.#shopDraftStock.length
        } : null,
        open: activeShopOpen,
        closed: shopActive && !shopDirectoryActive && !activeShopOpen,
        showClosedNotice: shopActive && !shopDirectoryActive && !activeShopOpen
          && (!customShopActive || !game.user?.isGM),
        showAvailabilityToggle: shopActive && !shopDirectoryActive,
        canManageAvailability: shopActive && Boolean(game.user?.isGM),
        canConfigurePricing: shopActive && !shopDirectoryActive && Boolean(game.user?.isGM)
          && (!customShopActive || Boolean(this.#shopDraftId)),
        location: shopActive ? {
          configured: locationConfigured,
          active: Boolean(activeLocation),
          id: activeLocation?.id ?? "",
          name: activeLocation?.name ?? "",
          canManage: Boolean(game.user?.isGM),
          options: shopConfiguration.locations.map((location) => ({
            id: location.id,
            name: location.name,
            active: location.id === activeLocation?.id
          }))
        } : null,
        balance,
        actorName: this.#actor?.name ?? "",
        weaponOnly: shopActive && this.#lockedCategory === "weapon",
        menu: shopActive ? {
          open: this.#shopMenuOpen,
          stores: menuStores.map((store) => ({
            ...store,
            active: store.id === this.#activeShopId,
            icon: store.icon || "fa-store"
          })),
          canCreate: Boolean(game.user?.isGM)
        } : null,
        cart: shopActive ? {
          items: [...this.#cart.values()].map((line) => ({
            uuid: line.uuid,
            name: line.source.name,
            img: line.source.img || "icons/svg/item-bag.svg",
            quantity: line.quantity,
            unitPrice: line.price.raw,
            subtotal: shopMoneyLabel(line.price.ortegs * line.quantity),
            service: isServiceDefinition(line.source)
          })),
          count: [...this.#cart.values()].reduce((total, line) => total + line.quantity, 0),
          empty: this.#cart.size === 0,
          total: moneyFromOrtegs(cartTotal),
          totalLabel: shopMoneyLabel(cartTotal),
          remaining: moneyFromOrtegs(cartRemaining),
          canCheckout: canAdd && this.#cart.size > 0 && cartTotal <= balance.total
        } : null
      },
      selection: !shopActive && this.#selection ? {
        active: true,
        count: this.#selected.size,
        valid: selectionSummary.valid,
        summary: selectionSummary.summary
      } : null
    };
  }

  async _renderHTML(context) {
    return foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/compendium-browser.hbs`,
      context
    );
  }

  _replaceHTML(result, content) {
    const currentSearch = content.querySelector?.("[data-browser-search]");
    const restoreSearchFocus = Boolean(
      currentSearch && currentSearch === globalThis.document?.activeElement
    );
    const selectionStart = currentSearch?.selectionStart ?? this.#query.length;
    const selectionEnd = currentSearch?.selectionEnd ?? selectionStart;
    const selectionDirection = currentSearch?.selectionDirection ?? "none";

    this.#listenerController?.abort();
    content.innerHTML = result;
    this.#activateListeners(content);

    if (restoreSearchFocus) {
      const nextSearch = content.querySelector("[data-browser-search]");
      nextSearch?.focus?.({ preventScroll: true });
      if (typeof nextSearch?.setSelectionRange === "function") {
        const max = nextSearch.value.length;
        nextSearch.setSelectionRange(
          Math.min(selectionStart, max),
          Math.min(selectionEnd, max),
          selectionDirection
        );
      }
    }
  }

  _onClose(options) {
    globalThis.clearTimeout(this.#searchRenderTimeout);
    this.#searchRenderTimeout = null;
    globalThis.clearTimeout(this.#shopSaveTimeout);
    this.#shopSaveTimeout = null;
    if (this.#shopDraftHasChanges() && this.#shopDraftName.trim()) void this.#saveShop();
    this.#listenerController?.abort();
    this.#listenerController = null;
    if (SymbaroumCompendiumBrowser.#instance === this) SymbaroumCompendiumBrowser.#instance = null;
    if (this.#selection && !this.#selectionResolved) this.#onSelect?.(null);
    return super._onClose(options);
  }

  async #contentOriginIndex({ waitForFull = true } = {}) {
    if (SymbaroumCompendiumBrowser.#originIndex) {
      return SymbaroumCompendiumBrowser.#originIndex;
    }
    if (!SymbaroumCompendiumBrowser.#originIndexPromise) {
      SymbaroumCompendiumBrowser.#originIndexPromise = buildContentOriginIndex()
        .then((index) => {
          SymbaroumCompendiumBrowser.#originIndex = index;
          SymbaroumCompendiumBrowser.#sourceCache.clear();
          SymbaroumCompendiumBrowser.#scheduleInvalidationRender();
          return index;
        })
        .catch((error) => {
          console.warn(`${MODULE_ID} | Could not finish the content-origin index.`, error);
          SymbaroumCompendiumBrowser.#originIndexPromise = null;
          return SymbaroumCompendiumBrowser.#staticOriginIndex ??= staticContentOriginIndex();
        });
    }
    if (waitForFull) return SymbaroumCompendiumBrowser.#originIndexPromise;
    return SymbaroumCompendiumBrowser.#staticOriginIndex ??= staticContentOriginIndex();
  }

  async #loadSource(source, originIndex) {
    if (!SymbaroumCompendiumBrowser.#sourceCache.has(source.id)) {
      const loading = Promise.resolve(worldEntries(source, originIndex))
        .then((entries) => entries.map(prepareBrowserEntry));
      SymbaroumCompendiumBrowser.#sourceCache.set(source.id, loading.catch((error) => {
        SymbaroumCompendiumBrowser.#sourceCache.delete(source.id);
        console.warn(`${MODULE_ID} | Could not index source ${source.id}.`, error);
        return [];
      }));
    }
    return SymbaroumCompendiumBrowser.#sourceCache.get(source.id);
  }

  #activateListeners(root) {
    this.#listenerController = new AbortController();
    const signal = this.#listenerController.signal;

    root.addEventListener("pointerdown", () => this.bringToFront?.(), { signal });

    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target || !root.contains(target)) {
        this.#closeShopStockContextMenu(root);
        if (this.#filtersOpen && !event.target.closest("[data-browser-filter-panel]")) {
          this.#setFiltersOpen(root, false);
        }
        if (this.#shopMenuOpen && !event.target.closest("[data-shop-switcher]")) {
          this.#shopMenuOpen = false;
          void this.render({ force: true });
        }
        return;
      }
      event.preventDefault();
      this.#closeShopStockContextMenu(root);
      void this.#onAction(target);
    }, { signal });

    root.addEventListener("contextmenu", (event) => {
      const store = event.target.closest("[data-shop-directory-id]");
      if (store && root.contains(store)) {
        if (this.#mode !== "shop" || this.#shopView !== "directory" || !game.user?.isGM) return;
        if (store.dataset.general === "true" || store.dataset.shopDirectoryId === "general") return;
        event.preventDefault();
        this.#openShopDirectoryContextMenu(root, store.dataset.shopDirectoryId, event);
        return;
      }
      const entry = event.target.closest("[data-browser-uuid]");
      if (!entry || !root.contains(entry)) return;
      if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return;
      if (!this.#shopStockLine(entry.dataset.browserUuid)) return;
      event.preventDefault();
      this.#openShopStockContextMenu(root, entry.dataset.browserUuid, event);
    }, { signal });

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (this.#closeShopStockContextMenu(root)) return;
      if (this.#shopMenuOpen) {
        this.#shopMenuOpen = false;
        void this.render({ force: true });
        return;
      }
      if (this.#filtersOpen) {
        const toggle = root.querySelector("[data-action='toggle-filters']");
        this.#setFiltersOpen(root, false);
        toggle?.focus?.();
        return;
      }
      if (this.#shopImageEditing) {
        this.#shopImageEditing = false;
        void this.render({ force: true });
      }
    }, { signal });

    root.addEventListener("input", (event) => {
      if (event.target.matches("[data-shop-name]")) {
        this.#shopDraftName = event.target.value;
        this.#scheduleShopAutoSave();
        return;
      }
      if (event.target.matches("[data-shop-description]")) {
        this.#shopDraftDescription = event.target.value;
        this.#scheduleShopAutoSave();
        return;
      }
      if (!event.target.matches("[data-browser-search]")) return;
      this.#query = event.target.value;
      this.#resultLimit = RESULT_BATCH_SIZE;
      globalThis.clearTimeout(this.#searchRenderTimeout);
      this.#searchRenderTimeout = globalThis.setTimeout(() => {
        this.#searchRenderTimeout = null;
        void this.render({ force: true });
      }, 180);
    }, { signal });

    root.addEventListener("change", (event) => {
      if (event.target.matches("[data-stock-generator-preset]")) {
        this.#shopDraftStockPresetId = normalizeShopStockPresetId(event.target.value);
        this.#scheduleShopAutoSave();
        this.#resultLimit = RESULT_BATCH_SIZE;
        void this.render({ force: true });
        return;
      }
      if (event.target.matches("[data-stock-generator-category]")) {
        if (event.target.checked) this.#shopGeneratorCategories.add(event.target.value);
        else this.#shopGeneratorCategories.delete(event.target.value);
        this.#shopDraftCategories = normalizeShopGenerationCategories([...this.#shopGeneratorCategories]);
        this.#scheduleShopAutoSave();
        root.querySelector("[data-stock-generator-selected-count]")?.replaceChildren(
          document.createTextNode(String(this.#shopGeneratorCategories.size))
        );
        this.#resultLimit = RESULT_BATCH_SIZE;
        void this.render({ force: true });
        return;
      }
      if (event.target.matches("[data-stock-generator-replace]")) {
        this.#shopGeneratorReplace = event.target.checked;
        return;
      }
      const location = event.target.closest("[data-shop-location-select]");
      if (location && game.user?.isGM) {
        const configuration = configuredShopConfiguration();
        if (location.value === CREATE_SHOP_LOCATION_VALUE) {
          location.value = configuration.activeLocationId ?? "";
          void this.#configureShopLocations({ focusNew: true });
          return;
        }
        this.#cart.clear();
        this.#activeShopId = null;
        this.#shopView = "directory";
        void game.settings.set(
          MODULE_ID,
          SETTINGS.SHOP_DEFINITIONS,
          replaceShopLocations(configuration, configuration.locations, location.value)
        );
        return;
      }
      const stockQuantity = event.target.closest("[data-shop-stock-quantity]");
      if (stockQuantity) {
        void this.#setShopStock(stockQuantity.dataset.uuid, stockQuantity.value);
        return;
      }
      const origin = event.target.closest("[data-browser-origin]");
      if (origin) {
        if (origin.checked) this.#excludedOrigins.delete(origin.value);
        else this.#excludedOrigins.add(origin.value);
        this.#resultLimit = RESULT_BATCH_SIZE;
        void this.render({ force: true });
        return;
      }
      const source = event.target.closest("[data-browser-source]");
      if (source) {
        if (source.checked) this.#excludedSources.delete(source.value);
        else this.#excludedSources.add(source.value);
        this.#resultLimit = RESULT_BATCH_SIZE;
        void this.render({ force: true });
        return;
      }
      const taxonomy = event.target.closest("[data-browser-taxonomy]");
      if (taxonomy) {
        if (taxonomy.checked) this.#excludedTaxonomies.delete(taxonomy.value);
        else this.#excludedTaxonomies.add(taxonomy.value);
        this.#resultLimit = RESULT_BATCH_SIZE;
        void this.render({ force: true });
        return;
      }
      const selected = event.target.closest("[data-browser-select]");
      if (!selected) return;
      if (selected.checked) this.#selected.add(selected.value);
      else this.#selected.delete(selected.value);
      this.#enforceMaximum(selected.value);
      void this.render({ force: true });
    }, { signal });

    this.#activateShopImageEditor(root, signal);

    root.addEventListener("dragstart", (event) => {
      if (this.#mode === "shop") return event.preventDefault();
      const entry = event.target.closest("[data-browser-uuid]");
      if (!entry || !event.dataTransfer) return;
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: entry.dataset.documentClass,
        uuid: entry.dataset.browserUuid
      }));
      event.dataTransfer.effectAllowed = "copy";
    }, { signal });
  }

  #closeShopStockContextMenu(root) {
    const menu = root.querySelector?.("[data-shop-stock-context-menu], [data-shop-directory-context-menu]");
    menu?.remove();
    return Boolean(menu);
  }

  #openShopStockContextMenu(root, uuid, event) {
    this.#closeShopStockContextMenu(root);
    const host = root.querySelector?.(".symbaroum-hud-browser-shell") ?? root;
    const menu = document.createElement("div");
    menu.className = "symbaroum-hud-shop-stock-context-menu";
    menu.dataset.shopStockContextMenu = "";
    menu.setAttribute("role", "menu");

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "stock-remove";
    button.dataset.uuid = uuid;
    button.setAttribute("role", "menuitem");
    const label = game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockRemove");
    button.setAttribute("aria-label", label);

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-trash-can";
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    host.append(menu);
    menu.append(button);

    const bounds = host.getBoundingClientRect();
    const margin = 6;
    const left = Math.max(margin, Math.min(
      event.clientX - bounds.left,
      bounds.width - menu.offsetWidth - margin
    ));
    const top = Math.max(margin, Math.min(
      event.clientY - bounds.top,
      bounds.height - menu.offsetHeight - margin
    ));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    button.focus({ preventScroll: true });
  }

  #openShopDirectoryContextMenu(root, shopId, event) {
    this.#closeShopStockContextMenu(root);
    const store = configuredShopDefinitions().find(({ id }) => id === shopId);
    if (!store) return;
    const host = root.querySelector?.(".symbaroum-hud-browser-shell") ?? root;
    const menu = document.createElement("div");
    menu.className = "symbaroum-hud-shop-stock-context-menu";
    menu.dataset.shopDirectoryContextMenu = "";
    menu.setAttribute("role", "menu");

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "delete-shop";
    button.dataset.shopId = store.id;
    button.setAttribute("role", "menuitem");
    const label = game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.DeleteStore");
    button.setAttribute("aria-label", `${label}: ${store.name}`);

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-trash-can";
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    button.append(icon, text);
    host.append(menu);
    menu.append(button);

    const bounds = host.getBoundingClientRect();
    const margin = 6;
    menu.style.left = `${Math.max(margin, Math.min(
      event.clientX - bounds.left,
      bounds.width - menu.offsetWidth - margin
    ))}px`;
    menu.style.top = `${Math.max(margin, Math.min(
      event.clientY - bounds.top,
      bounds.height - menu.offsetHeight - margin
    ))}px`;
    button.focus({ preventScroll: true });
  }

  #activateShopImageEditor(root, signal) {
    if (!game.user?.isGM || this.#shopView !== "create" || !this.#shopImageEditing) return;
    const editor = root.querySelector("[data-shop-image-editor]");
    const surface = editor?.querySelector("[data-shop-image-surface]");
    if (!editor || !surface) return;

    let drag = null;
    let wheelSaveTimeout = null;
    const applyPreview = () => {
      editor.setAttribute("style", shopImageStyle({
        imageScale: this.#shopDraftImageScale,
        imageX: this.#shopDraftImageX,
        imageY: this.#shopDraftImageY
      }));
    };
    const applySettings = (settings) => {
      const normalized = normalizeShopImageSettings(settings);
      this.#shopDraftImageScale = normalized.imageScale;
      this.#shopDraftImageX = normalized.imageX;
      this.#shopDraftImageY = normalized.imageY;
      applyPreview();
    };
    const finishDrag = (event) => {
      if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
      if (surface.hasPointerCapture?.(drag.pointerId)) surface.releasePointerCapture(drag.pointerId);
      drag = null;
      editor.removeAttribute("data-dragging");
      this.#scheduleShopAutoSave(0);
    };

    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      surface.setPointerCapture?.(event.pointerId);
      drag = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        imageX: this.#shopDraftImageX,
        imageY: this.#shopDraftImageY,
        width: Math.max(1, surface.clientWidth),
        height: Math.max(1, surface.clientHeight)
      };
      editor.setAttribute("data-dragging", "true");
    }, { signal });

    surface.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      applySettings({
        imageScale: this.#shopDraftImageScale,
        imageX: drag.imageX + (((event.clientX - drag.startClientX) / drag.width) * 100),
        imageY: drag.imageY + (((event.clientY - drag.startClientY) / drag.height) * 100)
      });
    }, { signal });

    surface.addEventListener("pointerup", finishDrag, { signal });
    surface.addEventListener("pointercancel", finishDrag, { signal });
    surface.addEventListener("wheel", (event) => {
      event.preventDefault();
      applySettings({
        imageScale: this.#shopDraftImageScale + (event.deltaY < 0 ? 5 : -5),
        imageX: this.#shopDraftImageX,
        imageY: this.#shopDraftImageY
      });
      globalThis.clearTimeout(wheelSaveTimeout);
      wheelSaveTimeout = globalThis.setTimeout(() => this.#scheduleShopAutoSave(0), 300);
    }, { signal, passive: false });
    signal.addEventListener("abort", () => globalThis.clearTimeout(wheelSaveTimeout), { once: true });

    surface.addEventListener("keydown", (event) => {
      const changes = {
        ArrowLeft: { imageX: this.#shopDraftImageX + 2 },
        ArrowRight: { imageX: this.#shopDraftImageX - 2 },
        ArrowUp: { imageY: this.#shopDraftImageY + 2 },
        ArrowDown: { imageY: this.#shopDraftImageY - 2 },
        "+": { imageScale: this.#shopDraftImageScale + 5 },
        "=": { imageScale: this.#shopDraftImageScale + 5 },
        "-": { imageScale: this.#shopDraftImageScale - 5 }
      };
      const change = changes[event.key];
      if (!change) return;
      event.preventDefault();
      applySettings({
        imageScale: change.imageScale ?? this.#shopDraftImageScale,
        imageX: change.imageX ?? this.#shopDraftImageX,
        imageY: change.imageY ?? this.#shopDraftImageY
      });
      this.#scheduleShopAutoSave();
    }, { signal });
  }

  async #onAction(target) {
    const action = target.dataset.action;
    if (action === "toggle-filters") {
      return this.#setFiltersOpen(target.closest(".symbaroum-hud-browser-shell"), !this.#filtersOpen);
    }
    if (action === "toggle-filter-section") {
      const section = String(target.dataset.filterSection ?? "");
      if (!section) return null;
      if (this.#expandedFilterSections.has(section)) this.#expandedFilterSections.delete(section);
      else this.#expandedFilterSections.add(section);
      return this.render({ force: true });
    }
    if (action === "toggle-shop-menu") {
      this.#shopMenuOpen = !this.#shopMenuOpen;
      this.#filtersOpen = false;
      return this.render({ force: true });
    }
    if (action === "show-shop-directory") {
      if (this.#mode !== "shop") return null;
      await this.#flushShopAutoSave();
      this.#shopMenuOpen = false;
      this.#filtersOpen = false;
      this.#cart.clear();
      this.#activeShopId = null;
      this.#shopStockMode = false;
      this.#shopStockSection = "items";
      this.#shopImageEditing = false;
      this.#shopView = "directory";
      this.#category = this.#lockedCategory ?? "all";
      this.#query = "";
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "select-shop") {
      await this.#flushShopAutoSave();
      this.#shopMenuOpen = false;
      const shopId = target.dataset.shopId;
      if (!game.user?.isGM && !shopIsAvailableAtActiveLocation(
        getSetting(SETTINGS.SHOP_DEFINITIONS),
        shopId
      )) return this.#notifyPurchaseFailure("location");
      if (shopId !== this.#activeShopId) this.#cart.clear();
      this.#shopStockMode = false;
      this.#shopStockSection = "items";
      this.#shopImageEditing = false;
      if (shopId === "general") {
        this.#activeShopId = "general";
        this.#shopView = "catalog";
      } else {
        const store = configuredShopDefinitions().find((entry) => entry.id === shopId);
        if (!store) return null;
        this.#activeShopId = store.id;
        this.#shopDraftId = store.id;
        this.#shopDraftSavedName = store.name;
        this.#shopDraftName = store.name;
        this.#shopDraftSavedImage = store.img;
        this.#shopDraftImage = store.img;
        this.#shopDraftSavedImageScale = store.imageScale;
        this.#shopDraftImageScale = store.imageScale;
        this.#shopDraftSavedImageX = store.imageX;
        this.#shopDraftImageX = store.imageX;
        this.#shopDraftSavedImageY = store.imageY;
        this.#shopDraftImageY = store.imageY;
        this.#shopDraftSavedDescription = store.description;
        this.#shopDraftDescription = store.description;
        this.#shopDraftSavedOpen = store.open;
        this.#shopDraftOpen = store.open;
        this.#shopDraftSavedCategories = [...(store.categories ?? [])];
        this.#shopDraftCategories = [...(store.categories ?? [])];
        this.#shopDraftSavedStockPresetId = store.stockPresetId ?? "";
        this.#shopDraftStockPresetId = store.stockPresetId ?? "";
        this.#shopDraftSavedStock = cloneShopStock(store.stock);
        this.#shopDraftStock = cloneShopStock(store.stock);
        this.#shopView = "create";
        this.#category = "all";
      }
      return this.render({ force: true });
    }
    if (action === "create-shop") {
      if (this.#mode !== "shop" || !game.user?.isGM) return null;
      await this.#flushShopAutoSave();
      this.#shopMenuOpen = false;
      this.#filtersOpen = false;
      this.#activeShopId = null;
      this.#shopDraftId = null;
      this.#shopDraftSavedName = "";
      this.#shopDraftName = "";
      this.#shopDraftSavedImage = DEFAULT_SHOP_IMAGE;
      this.#shopDraftImage = DEFAULT_SHOP_IMAGE;
      this.#shopDraftSavedImageScale = 100;
      this.#shopDraftImageScale = 100;
      this.#shopDraftSavedImageX = 50;
      this.#shopDraftImageX = 50;
      this.#shopDraftSavedImageY = 50;
      this.#shopDraftImageY = 50;
      this.#shopDraftSavedDescription = "";
      this.#shopDraftDescription = "";
      this.#shopDraftSavedOpen = true;
      this.#shopDraftOpen = true;
      this.#shopDraftSavedCategories = [];
      this.#shopDraftCategories = [];
      this.#shopDraftSavedStockPresetId = "";
      this.#shopDraftStockPresetId = "";
      this.#shopDraftSavedStock = [];
      this.#shopDraftStock = [];
      this.#shopStockMode = false;
      this.#shopStockSection = "items";
      this.#shopImageEditing = false;
      this.#shopView = "create";
      return this.render({ force: true });
    }
    if (action === "toggle-directory-store") {
      if (this.#mode !== "shop" || this.#shopView !== "directory" || !game.user?.isGM) return null;
      const shopId = String(target.dataset.shopId ?? "").trim();
      if (shopId === "general") {
        await game.settings.set(MODULE_ID, SETTINGS.GENERAL_STORE_OPEN, !isGeneralStoreOpen());
      } else {
        const current = getSetting(SETTINGS.SHOP_DEFINITIONS);
        const next = toggleShopDefinitionAvailability(current, shopId);
        await game.settings.set(MODULE_ID, SETTINGS.SHOP_DEFINITIONS, next);
      }
      return this.render({ force: true });
    }
    if (action === "delete-shop") return this.#deleteShop(target.dataset.shopId);
    if (action === "delete-active-location") return this.#deleteActiveLocation();
    if (action === "toggle-stock-manager") {
      if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return null;
      this.#shopStockMode = !this.#shopStockMode;
      if (this.#shopStockMode) {
        this.#shopStockSection = "items";
        this.#shopGeneratorCategories = new Set(this.#shopDraftCategories);
        this.#shopGeneratorReplace = true;
      }
      this.#filtersOpen = false;
      this.#query = "";
      this.#category = "all";
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "select-stock-section") {
      if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM || !this.#shopStockMode) return null;
      const section = target.dataset.stockSection === "services" ? "services" : "items";
      if (section === this.#shopStockSection) return null;
      this.#shopStockSection = section;
      this.#filtersOpen = false;
      this.#query = "";
      this.#category = "all";
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "generate-shop-stock") return this.#generateShopStock();
    if (action === "generate-shop-stock-inline") {
      return this.#generateShopStock({
        presetId: this.#shopDraftStockPresetId,
        categories: [...this.#shopGeneratorCategories],
        replace: this.#shopGeneratorReplace
      });
    }
    if (action === "configure-stock-rules") return this.#configureStockRules();
    if (action === "create-service") return this.#editServiceDefinition();
    if (action === "toggle-stock-unlimited") {
      return this.#toggleShopStockUnlimited(target.dataset.uuid);
    }
    if (action === "stock-add") return this.#setShopStock(target.dataset.uuid, 1);
    if (action === "stock-increase") {
      return this.#setShopStock(target.dataset.uuid, this.#shopStockQuantity(target.dataset.uuid) + 1);
    }
    if (action === "stock-decrease") {
      return this.#setShopStock(target.dataset.uuid, this.#shopStockQuantity(target.dataset.uuid) - 1);
    }
    if (action === "stock-remove") return this.#removeShopStock(target.dataset.uuid);
    if (action === "choose-shop-image") return this.#chooseShopImage();
    if (action === "toggle-shop-image-editor") {
      if (!game.user?.isGM || this.#shopView !== "create") return null;
      this.#shopImageEditing = !this.#shopImageEditing;
      return this.render({ force: true });
    }
    if (action === "toggle-general-store") {
      if (this.#mode !== "shop" || !game.user?.isGM) return null;
      const open = !isGeneralStoreOpen();
      this.#shopMenuOpen = false;
      if (!open) this.#cart.clear();
      await game.settings.set(MODULE_ID, SETTINGS.GENERAL_STORE_OPEN, open);
      return this.render({ force: true });
    }
    if (action === "toggle-custom-store") {
      if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return null;
      this.#shopDraftOpen = !this.#shopDraftOpen;
      if (!this.#shopDraftOpen) this.#cart.clear();
      this.#scheduleShopAutoSave(0);
      return this.render({ force: true });
    }
    if (action === "category") {
      this.#category = target.dataset.category;
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "clear-search") {
      this.#query = "";
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "toggle-all-sources") {
      const descriptors = sourceDescriptors().filter((source) => configuredSources()[source.id] !== false);
      if (this.#excludedSources.size) this.#excludedSources.clear();
      else descriptors.forEach((source) => this.#excludedSources.add(source.id));
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "toggle-all-origins") {
      const origins = [...CONTENT_ORIGINS.map(({ id }) => id), UNKNOWN_CONTENT_ORIGIN];
      if (this.#excludedOrigins.size) this.#excludedOrigins.clear();
      else origins.forEach((origin) => this.#excludedOrigins.add(origin));
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "toggle-all-taxonomies") {
      const taxonomies = [
        ...ITEM_TAXONOMY_DEFINITIONS.map(({ id }) => id),
        ...SERVICE_CATEGORIES.map(({ id }) => `service-${id}`)
      ];
      if (this.#excludedTaxonomies.size) this.#excludedTaxonomies.clear();
      else taxonomies.forEach((taxonomy) => this.#excludedTaxonomies.add(taxonomy));
      this.#resultLimit = RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "load-more") {
      this.#resultLimit += RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "configure-sources") return this.#configureSources();
    if (action === "configure-shop-locations") return this.#configureShopLocations();
    if (action === "generate-official-shops") return this.#generateOfficialShops();
    if (action === "configure-shop-pricing") return this.#configureShopPricing();
    if (action === "open-document") return this.#openDocument(target.dataset.uuid);
    if (action === "add-document") return this.#addDocument(target.dataset.uuid);
    if (action === "buy-document") return this.#buyDocument(target.dataset.uuid);
    if (action === "cart-increase") return this.#changeCartQuantity(target.dataset.uuid, 1);
    if (action === "cart-decrease") return this.#changeCartQuantity(target.dataset.uuid, -1);
    if (action === "cart-remove") return this.#removeCartItem(target.dataset.uuid);
    if (action === "cart-clear") return this.#clearCart();
    if (action === "cart-checkout") return this.#checkoutCart();
    if (action === "confirm-selection") return this.#confirmSelection();
  }

  #setFiltersOpen(root, open) {
    this.#filtersOpen = Boolean(open);
    const panel = root?.querySelector?.("[data-browser-filter-panel]");
    const toggle = root?.querySelector?.("[data-action='toggle-filters']");
    if (panel) panel.hidden = !this.#filtersOpen;
    if (toggle) {
      toggle.dataset.active = String(this.#filtersOpen);
      toggle.setAttribute("aria-expanded", String(this.#filtersOpen));
    }
  }

  async #openDocument(uuid) {
    if (isServiceUuid(uuid)) return this.#openServiceDefinition(uuid);
    const document = await fromUuid(uuid);
    if (!document) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Unavailable"));
      return;
    }
    const sheet = document.sheet;
    if (!sheet?.render) return;
    const renderResult = sheet.render(true);
    keepBrowserDocumentSheetOnTop(sheet);
    if (typeof renderResult?.then === "function") {
      try {
        await renderResult;
      } finally {
        keepBrowserDocumentSheetOnTop(sheet);
      }
    }
  }

  async #addDocument(uuid) {
    if (!this.#actor || !ActorService.canUpdate(this.#actor)) return;
    const document = await fromUuid(uuid);
    if (!document || document.documentName !== "Item") {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Unavailable"));
      return;
    }
    const data = document.toObject();
    delete data._id;
    delete data.folder;
    delete data.ownership;
    delete data.sort;
    delete data._stats;
    await this.#actor.createEmbeddedDocuments("Item", [data]);
    ui.notifications?.info(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Added", {
      item: document.name,
      actor: this.#actor.name
    }));
  }

  async #buyDocument(uuid) {
    if (this.#mode !== "shop" || !this.#actor || !ActorService.canUpdate(this.#actor)) {
      return this.#notifyPurchaseFailure("permission");
    }
    if (!this.#activeShopIsOpen()) return this.#notifyPurchaseFailure("closed");

    const existing = this.#cart.get(uuid);
    if (this.#shopView === "create"
      && this.#shopStockAvailable(uuid) <= Number(existing?.quantity ?? 0)) {
      return this.#notifyPurchaseFailure("outOfStock");
    }

    const document = isServiceUuid(uuid)
      ? findServiceDefinition(uuid, configuredServiceDefinitions())
      : await fromUuid(uuid);
    const negotiatedPrice = isServiceDefinition(document) && document?.priceMode === "negotiated";
    const price = parseShopPrice(isServiceDefinition(document) ? document?.cost : document?.system?.cost);
    if (!document || (!isServiceDefinition(document) && document.documentName !== "Item")
      || (!price && !negotiatedPrice)) {
      return this.#notifyPurchaseFailure(document ? "invalidPrice" : "unavailable");
    }
    if (negotiatedPrice && !game.user?.isGM) {
      return this.#notifyPurchaseFailure("negotiated");
    }

    const pricing = configuredShopPriceModifier(
      this.#shopView === "create" ? this.#activeShopId : "general"
    );
    const purchaseModifier = combinedShopPurchaseModifier(
      shopPurchaseModifier(
        pricing,
        isServiceDefinition(document)
          ? serviceTaxonomyContext(document)
          : resolveItemTaxonomy(document)
      ),
      this.#shopView === "create" ? this.#shopStockLine(uuid)?.priceModifier : 100
    );
    const selectedBasePrice = existing?.basePrice
      ?? (negotiatedPrice
        ? await this.#confirmNegotiatedPurchase(document)
        : price.ranged
        ? await this.#confirmPurchase(document, price, purchaseModifier)
        : selectShopPrice(price));
    const selectedPrice = existing?.price
      ?? (negotiatedPrice
        ? selectedBasePrice
        : applyShopPurchaseModifier(selectedBasePrice, purchaseModifier));
    if (!selectedPrice) return null;

    const nextQuantity = (existing?.quantity ?? 0) + 1;
    const nextTotal = this.#cartTotal() + selectedPrice.ortegs;
    if (nextTotal > ShopService.balance(this.#actor).total) {
      return this.#notifyPurchaseFailure("insufficient");
    }
    this.#cart.set(uuid, {
      uuid,
      source: document,
      basePrice: selectedBasePrice,
      price: selectedPrice,
      quantity: nextQuantity
    });
    return this.render({ force: true });
  }

  #changeCartQuantity(uuid, delta) {
    if (this.#mode !== "shop") return null;
    if (!this.#activeShopIsOpen()) return this.#notifyPurchaseFailure("closed");
    const line = this.#cart.get(uuid);
    if (!line) return null;
    const quantity = line.quantity + Number(delta);
    if (quantity <= 0) return this.#removeCartItem(uuid);
    if (!Number.isSafeInteger(quantity) || quantity > 999) return null;
    if (delta > 0 && this.#shopView === "create" && quantity > this.#shopStockAvailable(uuid)) {
      return this.#notifyPurchaseFailure("outOfStock");
    }
    if (delta > 0 && this.#cartTotal() + line.price.ortegs > ShopService.balance(this.#actor).total) {
      return this.#notifyPurchaseFailure("insufficient");
    }
    this.#cart.set(uuid, { ...line, quantity });
    return this.render({ force: true });
  }

  #removeCartItem(uuid) {
    this.#cart.delete(uuid);
    return this.render({ force: true });
  }

  #clearCart() {
    this.#cart.clear();
    return this.render({ force: true });
  }

  #shopStockQuantity(uuid) {
    return this.#shopStockLine(uuid)?.quantity ?? 0;
  }

  #shopStockAvailable(uuid) {
    const line = this.#shopStockLine(uuid);
    return line?.unlimited ? Number.MAX_SAFE_INTEGER : line?.quantity ?? 0;
  }

  #shopStockLine(uuid) {
    return this.#shopDraftStock.find((line) => line.uuid === uuid) ?? null;
  }

  #setShopStock(uuid, value) {
    if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return null;
    const parsed = Number(value);
    if (!uuid || !Number.isFinite(parsed)) return null;
    const quantity = Math.max(0, Math.min(99999, Math.trunc(parsed)));
    const existing = this.#shopStockLine(uuid);
    const stock = this.#shopDraftStock.filter((line) => line.uuid !== uuid);
    stock.push({
      ...existing,
      uuid,
      quantity,
      ...(isServiceUuid(uuid) && !existing ? { unlimited: true } : {})
    });
    this.#shopDraftStock = normalizeShopStock(stock);
    this.#scheduleShopAutoSave(0);
    return this.render({ force: true });
  }

  #toggleShopStockUnlimited(uuid) {
    if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return null;
    const existing = this.#shopStockLine(uuid);
    if (!existing || !isServiceUuid(uuid)) return null;
    this.#shopDraftStock = normalizeShopStock([
      ...this.#shopDraftStock.filter((line) => line.uuid !== uuid),
      { ...existing, unlimited: !existing.unlimited }
    ]);
    this.#scheduleShopAutoSave(0);
    return this.render({ force: true });
  }

  #removeShopStock(uuid) {
    if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return null;
    this.#shopDraftStock = this.#shopDraftStock.filter((line) => line.uuid !== uuid);
    this.#cart.delete(uuid);
    this.#scheduleShopAutoSave(0);
    return this.render({ force: true });
  }

  async #deleteShop(shopId) {
    if (this.#mode !== "shop" || this.#shopView !== "directory" || !game.user?.isGM) return null;
    const id = String(shopId ?? "").trim();
    if (!id || id === "general") return null;
    const store = configuredShopDefinitions().find((entry) => entry.id === id);
    if (!store) return null;
    const confirmed = await DialogV2.wait({
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.DeleteStore") },
      content: `<p>${escapeHtml(game.i18n.format(
        "SYMBAROUMHUD.CompendiumBrowser.Shop.DeleteStoreConfirm",
        { name: store.name }
      ))}</p>`,
      buttons: [
        {
          action: "delete",
          icon: "fa-solid fa-trash-can",
          label: game.i18n.localize("Delete"),
          callback: () => true
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          default: true,
          callback: () => false
        }
      ],
      close: () => false,
      rejectClose: false
    });
    if (!confirmed) return null;
    await game.settings.set(
      MODULE_ID,
      SETTINGS.SHOP_DEFINITIONS,
      removeShopDefinition(getSetting(SETTINGS.SHOP_DEFINITIONS), id)
    );
    await game.settings.set(
      MODULE_ID,
      SETTINGS.SHOP_PRICE_MODIFIERS,
      removeShopPriceModifier(getSetting(SETTINGS.SHOP_PRICE_MODIFIERS), id)
    );
    this.#cart.clear();
    return this.render({ force: true });
  }

  async #deleteActiveLocation() {
    if (this.#mode !== "shop" || this.#shopView !== "directory" || !game.user?.isGM) return null;
    const configuration = configuredShopConfiguration();
    const location = configuration.locations.find(({ id }) => id === configuration.activeLocationId);
    if (!location) return null;
    const confirmed = await DialogV2.wait({
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.RemoveLocation") },
      content: `<p>${escapeHtml(game.i18n.format(
        "SYMBAROUMHUD.CompendiumBrowser.Shop.DeleteLocationConfirm",
        { name: location.name }
      ))}</p>`,
      buttons: [
        {
          action: "delete",
          icon: "fa-solid fa-trash-can",
          label: game.i18n.localize("Delete"),
          callback: () => true
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          default: true,
          callback: () => false
        }
      ],
      close: () => false,
      rejectClose: false
    });
    if (!confirmed) return null;
    await game.settings.set(
      MODULE_ID,
      SETTINGS.SHOP_DEFINITIONS,
      removeShopLocation(configuration, location.id)
    );
    this.#cart.clear();
    this.#activeShopId = null;
    return this.render({ force: true });
  }

  async #openServiceDefinition(uuid) {
    const service = findServiceDefinition(uuid, configuredServiceDefinitions());
    if (!service) return this.#notifyPurchaseFailure("unavailable");
    const category = SERVICE_CATEGORIES.find(({ id }) => id === service.category);
    const specialExplorerLicense = service.id === "explorer-license";
    const content = specialExplorerLicense
      ? explorerLicensePreview(service, category)
      : `<article class="symbaroum-hud-service-preview">
      <header>
        <img src="${escapeHtml(service.img)}" alt="">
        <span><strong>${escapeHtml(service.name)}</strong>
          <small><i class="fa-solid ${escapeHtml(category?.icon ?? "fa-bell-concierge")}"></i>
            ${escapeHtml(game.i18n.localize(category?.label ?? "SYMBAROUMHUD.Services.Categories.Other"))}</small></span>
      </header>
      <p>${escapeHtml(service.description)}</p>
      <dl>
        <div><dt>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Price"))}</dt><dd>${escapeHtml(service.cost)}</dd></div>
        <div><dt>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Unit"))}</dt><dd>${escapeHtml(localizedServiceUnit(service.unit))}</dd></div>
        <div><dt>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.RecordType"))}</dt><dd>${escapeHtml(localizedServiceFulfillment(service.fulfillment))}</dd></div>
        ${service.source ? `<div><dt>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Source"))}</dt><dd>${escapeHtml(service.source)}</dd></div>` : ""}
      </dl>
    </article>`;
    const editable = Boolean(game.user?.isGM);
    const result = await DialogV2.wait({
      classes: ["symbaroum-hud-service-dialog"],
      window: { title: service.name },
      position: specialExplorerLicense ? { width: 760, height: 720 } : { width: 520 },
      content,
      buttons: [
        ...(editable ? [{
          action: "edit",
          icon: "fa-solid fa-pen",
          label: game.i18n.localize("SYMBAROUMHUD.Services.Edit"),
          callback: () => "edit"
        }] : []),
        {
          action: "close",
          label: game.i18n.localize("Close"),
          default: true,
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false
    });
    if (result === "edit") return this.#editServiceDefinition(service);
    return null;
  }

  async #editServiceDefinition(existing = null) {
    if (this.#mode !== "shop" || !game.user?.isGM) return null;
    const service = existing ?? null;
    const officialOverride = Boolean(service?.official);
    const restoresOfficial = Boolean(service && !service.official
      && serviceCatalog().some((candidate) => candidate.id === service.id && candidate.official));
    const categoryOptions = SERVICE_CATEGORIES.map(({ id, label }) => `
      <option value="${id}" ${service?.category === id ? "selected" : ""}>${escapeHtml(game.i18n.localize(label))}</option>`).join("");
    const unitOptions = [
      "purchase", "use", "person", "legOrWheel", "creature", "wagon", "hour",
      "day", "night", "week", "month", "year", "journey", "session"
    ]
      .map((id) => `<option value="${id}" ${service?.unit === id ? "selected" : ""}>${escapeHtml(localizedServiceUnit(id))}</option>`).join("");
    const fulfillmentOptions = ["instant", "consumable", "temporary", "permanent"]
      .map((id) => `<option value="${id}" ${service?.fulfillment === id ? "selected" : ""}>${escapeHtml(localizedServiceFulfillment(id))}</option>`).join("");
    const priceModeOptions = ["fixed", "negotiated"]
      .map((id) => `<option value="${id}" ${service?.priceMode === id ? "selected" : ""}>${escapeHtml(game.i18n.localize(
        `SYMBAROUMHUD.Services.PriceModes.${id === "negotiated" ? "Negotiated" : "Fixed"}`
      ))}</option>`).join("");
    const content = `<form class="symbaroum-hud-service-editor">
      <header><i class="fa-solid fa-bell-concierge"></i><span>
        <strong>${escapeHtml(game.i18n.localize(service ? "SYMBAROUMHUD.Services.Edit" : "SYMBAROUMHUD.Services.Create"))}</strong>
        <small>${escapeHtml(game.i18n.localize(officialOverride
          ? "SYMBAROUMHUD.Services.OfficialOverrideHint"
          : "SYMBAROUMHUD.Services.EditorHint"))}</small>
      </span></header>
      <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Name"))}</span>
        <input type="text" name="name" value="${escapeHtml(service?.name ?? "")}" maxlength="120" required></label>
      <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Image"))}</span>
        <input type="text" name="img" value="${escapeHtml(service?.img ?? "icons/svg/coins.svg")}" maxlength="1000"></label>
      <label class="symbaroum-hud-service-editor-description"><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Description"))}</span>
        <textarea name="description" maxlength="4000">${escapeHtml(service?.description ?? "")}</textarea></label>
      <div class="symbaroum-hud-service-editor-grid">
        <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Category"))}</span><select name="category">${categoryOptions}</select></label>
        <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.PriceMode"))}</span><select name="priceMode">${priceModeOptions}</select></label>
        <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Price"))}</span>
          <input type="text" name="cost" value="${escapeHtml(service?.cost ?? "1 ortega")}" maxlength="80" required>
          <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.PriceHint"))}</small></label>
        <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Unit"))}</span><select name="unit">${unitOptions}</select></label>
        <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.RecordType"))}</span><select name="fulfillment">${fulfillmentOptions}</select></label>
      </div>
      <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.PricingNote"))}</span>
        <textarea name="pricingNote" maxlength="1000">${escapeHtml(service?.pricingNote ?? "")}</textarea></label>
      <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Services.Source"))}</span>
        <input type="text" name="source" value="${escapeHtml(service?.source ?? "")}" maxlength="240"></label>
    </form>`;
    const result = await DialogV2.wait({
      classes: ["symbaroum-hud-service-editor-dialog"],
      window: { title: game.i18n.localize(service ? "SYMBAROUMHUD.Services.Edit" : "SYMBAROUMHUD.Services.Create") },
      position: { width: 620 },
      content,
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-floppy-disk",
          label: game.i18n.localize("Save"),
          default: true,
          callback: (_event, button) => {
            const form = button.form;
            const candidate = {
              id: service?.id ?? createServiceDefinitionId(),
              name: form.elements.name.value,
              img: form.elements.img.value,
              description: form.elements.description.value,
              category: form.elements.category.value,
              cost: form.elements.cost.value,
              priceMode: form.elements.priceMode.value,
              pricingNote: form.elements.pricingNote.value,
              unit: form.elements.unit.value,
              fulfillment: form.elements.fulfillment.value,
              offerKind: service?.offerKind ?? "service",
              itemCategories: service?.itemCategories ?? ["services"],
              origin: service?.origin ?? "unknown",
              source: form.elements.source.value
            };
            const validPrice = candidate.priceMode === "negotiated"
              ? Boolean(String(candidate.cost ?? "").trim())
              : Boolean(parseShopPrice(candidate.cost));
            return validPrice ? { action: "save", service: candidate } : { action: "invalid" };
          }
        },
        ...(service && !officialOverride ? [{
          action: "delete",
          icon: "fa-solid fa-trash-can",
          label: game.i18n.localize(restoresOfficial
            ? "SYMBAROUMHUD.Services.RestoreOfficial"
            : "Delete"),
          callback: () => ({ action: "delete", service })
        }] : []),
        { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null }
      ],
      close: () => null,
      rejectClose: false
    });
    // DialogV2 may return the action id when a button callback returns null.
    // Only structured results below represent a deliberate save/delete choice.
    if (!result || typeof result !== "object") return null;
    if (result.action === "invalid") {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.Services.InvalidPrice"));
      return this.#editServiceDefinition(service);
    }
    if (result.action === "delete") {
      const uuid = serviceUuid(service.id);
      await game.settings.set(
        MODULE_ID,
        SETTINGS.SERVICE_DEFINITIONS,
        removeCustomService(configuredServiceDefinitions(), service.id)
      );
      if (!restoresOfficial) {
        await game.settings.set(
          MODULE_ID,
          SETTINGS.SHOP_DEFINITIONS,
          removeShopStockReference(getSetting(SETTINGS.SHOP_DEFINITIONS), uuid)
        );
        this.#shopDraftStock = this.#shopDraftStock.filter((line) => line.uuid !== uuid);
        this.#shopDraftSavedStock = this.#shopDraftSavedStock.filter((line) => line.uuid !== uuid);
        this.#cart.delete(uuid);
      }
      this.#scheduleShopAutoSave(0);
      return this.render({ force: true });
    }
    await game.settings.set(
      MODULE_ID,
      SETTINGS.SERVICE_DEFINITIONS,
      upsertCustomService(configuredServiceDefinitions(), result.service)
    );
    const uuid = serviceUuid(result.service.id);
    if (this.#shopView === "create" && !this.#shopStockLine(uuid)) {
      this.#shopDraftStock = normalizeShopStock([
        ...this.#shopDraftStock,
        { uuid, quantity: 1, unlimited: true }
      ]);
      this.#scheduleShopAutoSave(0);
    }
    return this.render({ force: true });
  }

  async #generateShopStock(choice = null) {
    if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return null;
    if (!choice) {
      const presetOptions = OFFICIAL_SHOP_PRESETS.map((preset) => `
        <option value="${escapeHtml(preset.id)}" ${preset.id === this.#shopDraftStockPresetId ? "selected" : ""}>${escapeHtml(preset.name)} — ${escapeHtml(preset.location)}</option>`).join("");
      const content = `<form class="symbaroum-hud-shop-generator-form">
        <header>
          <i class="fa-solid fa-dice" aria-hidden="true"></i>
          <span><strong>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerator"))}</strong>
            <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGeneratorHint"))}</small></span>
        </header>
        <label>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockConfiguration"))}</span>
          <select name="preset" required>${presetOptions}</select>
          <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockConfigurationHint"))}</small>
        </label>
        <label>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockSizeTitle"))}</span>
          <select name="stockSize">
            <option value="small">${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockSizeSmall"))}</option>
            <option value="medium" selected>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockSizeMedium"))}</option>
            <option value="large">${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockSizeLarge"))}</option>
          </select>
          <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockSizeHint"))}</small>
        </label>
        <label class="symbaroum-hud-shop-generator-check">
          <input type="checkbox" name="replace" checked>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ReplaceStock"))}</span>
        </label>
        <label class="symbaroum-hud-shop-generator-check">
          <input type="checkbox" name="applyIdentity" ${this.#shopDraftId ? "" : "checked"}>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ApplyOfficialIdentity"))}</span>
        </label>
      </form>`;
      choice = await DialogV2.wait({
        classes: ["symbaroum-hud-shop-generator-dialog"],
        window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerator") },
        position: { width: 560 },
        content,
        buttons: [
          {
            action: "generate",
            icon: "fa-solid fa-dice",
            label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.GenerateStock"),
            default: true,
            callback: (_event, button) => ({
              presetId: button.form.elements.preset.value,
              stockSize: button.form.elements.stockSize.value,
              replace: button.form.elements.replace.checked,
              applyIdentity: button.form.elements.applyIdentity.checked
            })
          },
          { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null }
        ],
        close: () => null,
        rejectClose: false
      });
    }
    if (!choice || typeof choice !== "object") return null;

    if (!choice.stockSize) {
      const stockSize = await this.#requestShopStockSize();
      if (!stockSize) return null;
      choice = { ...choice, stockSize };
    }

    const entries = await this.#shopGeneratorEntries();
    if (!choice.presetId && Array.isArray(choice.categories)) {
      const categories = [...new Set(choice.categories)].filter(Boolean);
      if (!categories.length) {
        ui.notifications?.warn(game.i18n.localize(
          "SYMBAROUMHUD.CompendiumBrowser.Shop.SelectGenerationCategory"
        ));
        return null;
      }
      const stock = generateShopStockByCategories(entries, categories, {
        random: Math.random,
        itemRules: configuredShopStockRules(),
        stockSize: choice.stockSize
      });
      if (!stock.length) {
        ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerationEmpty"));
        return null;
      }
      this.#shopDraftStock = normalizeShopStock(choice.replace
        ? stock
        : mergeGeneratedShopStock(this.#shopDraftStock, stock));
      this.#shopStockSection = "items";
      this.#category = "all";
      this.#query = "";
      this.#scheduleShopAutoSave(0);
      ui.notifications?.info(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerated", {
        count: stock.length,
        store: this.#shopDraftName,
        missing: ""
      }));
      return this.render({ force: true });
    }
    const result = generateOfficialShopStock(entries, choice.presetId, {
      random: Math.random,
      itemRules: configuredShopStockRules(),
      stockSize: choice.stockSize
    });
    if (!result.preset || !result.stock.length) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerationEmpty"));
      return null;
    }
    this.#shopDraftStock = normalizeShopStock(choice.replace
      ? result.stock
      : mergeGeneratedShopStock(this.#shopDraftStock, result.stock));
    if (choice.applyIdentity) {
      this.#shopDraftName = result.preset.name;
      this.#shopDraftDescription = officialShopDescription(result.preset);
    }
    this.#shopDraftStockPresetId = result.preset.id;
    this.#shopStockSection = "items";
    this.#category = "all";
    this.#query = "";
    this.#scheduleShopAutoSave(0);
    const missing = [
      result.missingEssentials.length
        ? game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerationMissingEssentials", {
          count: result.missingEssentials.length
        })
        : "",
      result.missingPools.length
        ? game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerationMissing", {
          count: result.missingPools.length
        })
        : ""
    ].filter(Boolean).join("");
    ui.notifications?.info(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.StockGenerated", {
      count: result.stock.length,
      store: result.preset.name,
      missing
    }));
    return this.render({ force: true });
  }

  async #requestShopStockSize() {
    const options = ["small", "medium", "large"];
    const content = `<section class="symbaroum-hud-shop-stock-size-dialog">
      <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockSizeHint"))}</p>
      <div>${options.map((id) => `<article>
        <strong>${escapeHtml(game.i18n.localize(`SYMBAROUMHUD.CompendiumBrowser.Shop.StockSize${SHOP_STOCK_SIZE_I18N_SUFFIX[id]}`))}</strong>
        <small>${escapeHtml(game.i18n.localize(`SYMBAROUMHUD.CompendiumBrowser.Shop.StockSize${SHOP_STOCK_SIZE_I18N_SUFFIX[id]}Hint`))}</small>
      </article>`).join("")}</div>
    </section>`;
    const selected = await DialogV2.wait({
      classes: ["symbaroum-hud-shop-stock-size-window"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockSizeTitle") },
      position: { width: 520 },
      content,
      buttons: options.map((id) => ({
        action: id,
        icon: id === "small" ? "fa-solid fa-basket-shopping" : id === "large" ? "fa-solid fa-warehouse" : "fa-solid fa-store",
        label: game.i18n.localize(`SYMBAROUMHUD.CompendiumBrowser.Shop.StockSize${SHOP_STOCK_SIZE_I18N_SUFFIX[id]}`),
        default: id === "medium",
        callback: () => id
      })),
      close: () => null,
      rejectClose: false
    });
    return selected ? normalizeShopStockSize(selected).id : null;
  }

  async #shopGeneratorEntries() {
    const originIndex = await this.#contentOriginIndex({ waitForFull: true });
    const enabled = configuredSources();
    const descriptors = sourceDescriptors().filter((source) => (
      source.documentClass === "Item" && enabled[source.id] !== false
    ));
    const entries = [
      ...(await Promise.all(descriptors.map((source) => this.#loadSource(source, originIndex)))).flat(),
      ...serviceBrowserEntries(configuredServiceDefinitions())
    ].filter(isPurchasableShopEntry);
    return dedupeBrowserEntries(entries);
  }

  async #configureStockRules() {
    if (this.#mode !== "shop" || this.#shopView !== "create" || !game.user?.isGM) return null;
    const entries = await this.#shopGeneratorEntries();
    const configured = configuredShopStockRules();
    const categoryLabels = new Map([
      ...ITEM_TAXONOMY_DEFINITIONS.map((definition) => [
        definition.id,
        game.i18n.localize(definition.label)
      ]),
      ...SERVICE_CATEGORIES.map((definition) => [
        `service-${definition.id}`,
        game.i18n.localize(definition.label)
      ])
    ]);
    const groups = new Map();
    for (const entry of entries) {
      const category = entry.taxonomyPrimary || entry.type || "equipment";
      const rows = groups.get(category) ?? [];
      rows.push({ entry, rule: resolveShopStockRule(entry, configured) });
      groups.set(category, rows);
    }
    const groupMarkup = [...groups.entries()]
      .sort(([left], [right]) => String(categoryLabels.get(left) ?? left)
        .localeCompare(String(categoryLabels.get(right) ?? right)))
      .map(([category, rows], index) => `<details ${index === 0 ? "open" : ""}>
        <summary><span>${escapeHtml(categoryLabels.get(category)
          ?? game.i18n.localize(CATEGORY_LABELS[category] ?? category))}</span><small>${rows.length}</small></summary>
        <div>${rows.sort((left, right) => left.entry.name.localeCompare(right.entry.name)).map(({ entry, rule }) => `
          <div class="symbaroum-hud-shop-stock-rule-row" data-stock-rule-row data-uuid="${escapeHtml(entry.uuid)}">
            <img src="${escapeHtml(entry.img || "icons/svg/item-bag.svg")}" alt="">
            <span><strong>${escapeHtml(entry.name)}</strong>${rule.customized
              ? `<small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.CustomStockRule"))}</small>`
              : ""}</span>
            <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockChance"))}</span>
              <b><input type="number" data-stock-chance value="${rule.chance}" min="0" max="100" step="1" required>%</b></label>
            <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockMinimum"))}</span>
              <input type="number" data-stock-minimum value="${rule.minimum}" min="1" max="999" step="1" required></label>
            <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockMaximum"))}</span>
              <input type="number" data-stock-maximum value="${rule.maximum}" min="1" max="999" step="1" required></label>
          </div>`).join("")}</div>
      </details>`).join("");
    const content = `<form class="symbaroum-hud-shop-stock-rules-form">
      <header>
        <i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i>
        <span><strong>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfigureStockRules"))}</strong>
          <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfigureStockRulesHint"))}</small></span>
      </header>
      <div class="symbaroum-hud-shop-stock-rule-headings">
        <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockItem"))}</span>
        <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockChance"))}</span>
        <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockMinimum"))}</span>
        <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.StockMaximum"))}</span>
      </div>
      <section>${groupMarkup}</section>
    </form>`;
    const result = await DialogV2.wait({
      classes: ["symbaroum-hud-shop-stock-rules-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfigureStockRules") },
      position: { width: 860, height: 760 },
      content,
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("Save"),
          default: true,
          callback: (_event, button) => {
            const byUuid = new Map(entries.map((entry) => [entry.uuid, entry]));
            const items = Object.fromEntries([...button.form.querySelectorAll("[data-stock-rule-row]")]
              .map((row) => [row.dataset.uuid, {
                chance: row.querySelector("[data-stock-chance]").value,
                minimum: row.querySelector("[data-stock-minimum]").value,
                maximum: row.querySelector("[data-stock-maximum]").value
              }])
              .filter(([uuid, rule]) => {
                const defaults = defaultShopStockRule(byUuid.get(uuid));
                return Number(rule.chance) !== defaults.chance
                  || Number(rule.minimum) !== defaults.minimum
                  || Number(rule.maximum) !== defaults.maximum;
              }));
            return { reset: false, items };
          }
        },
        {
          action: "reset",
          icon: "fa-solid fa-arrow-rotate-left",
          label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.RestoreStockDefaults"),
          callback: () => ({ reset: true, items: {} })
        },
        { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null }
      ],
      close: () => null,
      rejectClose: false
    });
    if (!result) return null;
    await game.settings.set(
      MODULE_ID,
      SETTINGS.SHOP_STOCK_RULES,
      result.reset ? { version: 1, items: {} } : normalizeShopStockRules({ items: result.items })
    );
    return null;
  }

  #activeShopIsOpen() {
    const open = this.#shopView === "create" ? this.#shopDraftOpen : isGeneralStoreOpen();
    if (!open || game.user?.isGM) return open;
    return shopIsAvailableAtActiveLocation(
      getSetting(SETTINGS.SHOP_DEFINITIONS),
      this.#activeShopId
    );
  }

  async #consumeShopStock(lines) {
    const shopId = this.#activeShopId;
    if (!shopId || shopId === "general") return;
    const consumed = normalizeShopStockConsumptions(lines.map((line) => ({
      uuid: line.source?.uuid ?? line.uuid,
      quantity: line.quantity
    })));
    if (!consumed.length) return;

    this.#shopDraftStock = consumeShopStock(this.#shopDraftStock, consumed);
    this.#shopDraftSavedStock = cloneShopStock(this.#shopDraftStock);
    if (game.user?.isGM) {
      const definitions = consumeShopDefinitionStock(
        getSetting(SETTINGS.SHOP_DEFINITIONS),
        shopId,
        consumed
      );
      await game.settings.set(MODULE_ID, SETTINGS.SHOP_DEFINITIONS, definitions);
      return;
    }
    game.socket?.emit?.(`module.${MODULE_ID}`, {
      type: "consume-shop-stock",
      shopId,
      lines: consumed
    });
  }

  #cartTotal() {
    let total = 0;
    for (const line of this.#cart.values()) {
      total += line.price.ortegs * line.quantity;
      if (!Number.isSafeInteger(total)) return Number.MAX_SAFE_INTEGER;
    }
    return total;
  }

  async #checkoutCart() {
    if (this.#mode !== "shop" || !this.#actor || !ActorService.canUpdate(this.#actor)) {
      return this.#notifyPurchaseFailure("permission");
    }
    if (!this.#activeShopIsOpen()) return this.#notifyPurchaseFailure("closed");
    if (!this.#cart.size) return null;
    if (this.#shopView === "create") {
      for (const line of this.#cart.values()) {
        if (line.quantity > this.#shopStockAvailable(line.uuid)) {
          return this.#notifyPurchaseFailure("outOfStock");
        }
      }
    }

    try {
      const purchases = [];
      for (const line of this.#cart.values()) {
        const source = isServiceUuid(line.uuid)
          ? findServiceDefinition(line.uuid, configuredServiceDefinitions())
          : await fromUuid(line.uuid);
        if (!source) return this.#notifyPurchaseFailure("unavailable");
        purchases.push({
          source,
          amount: line.basePrice?.amount,
          priceOverride: line.price,
          quantity: line.quantity
        });
      }
      const storeName = this.#shopView === "create"
        ? this.#shopDraftName
        : game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Title");
      const result = await ShopService.purchaseCart(this.#actor, purchases, { storeName });
      if (!result.ok) return this.#notifyPurchaseFailure(result.reason);
      const count = result.lines.reduce((total, line) => total + line.quantity, 0);
      await this.#postPurchaseChatMessage(result);
      if (this.#shopView === "create") await this.#consumeShopStock(result.lines);
      this.#cart.clear();
      ui.notifications?.info(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.CartPurchased", {
        count,
        price: shopMoneyLabel(result.totalOrtegs),
        actor: this.#actor.name
      }));
      return this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Shop cart checkout failed.`, error);
      return this.#notifyPurchaseFailure("failed");
    }
  }

  async #postPurchaseChatMessage(result) {
    try {
      const storeName = this.#shopView === "create"
        ? this.#shopDraftName
        : game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Title");
      let createdItemIndex = 0;
      const lines = result.lines.map((line) => {
        const item = line.kind === "item"
          ? result.items?.[createdItemIndex++] ?? line.source
          : line.source;
        return {
          name: item?.name ?? line.source?.name ?? "",
          uuid: line.kind === "item" ? item?.uuid ?? line.source?.uuid ?? "" : "",
          img: item?.img ?? line.source?.img ?? "icons/svg/item-bag.svg",
          quantity: line.quantity,
          subtotalLabel: shopMoneyLabel(line.subtotalOrtegs),
          service: line.kind === "service"
        };
      });
      const content = renderShopPurchaseChatMessage({
        title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ChatTitle"),
        buyerLabel: game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.ChatBuyer", {
          actor: this.#actor.name
        }),
        storeLabel: game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.ChatStore", {
          store: storeName
        }),
        totalLabel: game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.ChatTotal", {
          price: shopMoneyLabel(result.totalOrtegs)
        }),
        lines
      });
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker?.({ actor: this.#actor }) ?? {
          actor: this.#actor.id,
          alias: this.#actor.name
        },
        content
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not post the completed shop purchase to chat.`, error);
    }
  }

  async #confirmPurchase(document, price, purchaseModifier = 100) {
    const balance = ShopService.balance(this.#actor);
    const available = Math.max(0, balance.total - this.#cartTotal());
    const unitValue = Math.max(1, (price.ortegs / price.amount) * purchaseModifier / 100);
    const affordableMaximum = Math.min(
      price.maximumAmount,
      Math.floor(available / unitValue)
    );
    const unitLabel = price.raw.replace(/^(\d+)(?:\s*[-–—]\s*\d+)?\s*/, "");
    const rangeControl = price.ranged ? `<label class="symbaroum-hud-shop-price-choice">
      <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ChoosePrice"))}</span>
      <span class="symbaroum-hud-shop-price-input">
        <input type="number" name="priceAmount" value="${price.amount}"
          min="${price.amount}" max="${affordableMaximum}" step="1" required>
        <strong>${escapeHtml(unitLabel)}</strong>
      </span>
      <small>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.RangeQualityHint", {
        minimum: price.amount,
        maximum: price.maximumAmount,
        unit: unitLabel
      }))}</small>
    </label>` : "";
    const content = `<form class="symbaroum-hud-shop-confirm">
      <img src="${escapeHtml(document.img || "icons/svg/item-bag.svg")}" alt="">
      <p>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.CartPriceText", {
        item: document.name,
        price: modifiedShopPriceLabel(price, purchaseModifier)
      }))}</p>
      ${rangeControl}
      <small>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.CurrentBalance", {
        thaler: balance.thaler,
        shilling: balance.shilling,
        orteg: balance.orteg
      }))}</small>
    </form>`;
    return DialogV2.wait({
      classes: ["symbaroum-hud-shop-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.CartPriceTitle") },
      position: { width: 430 },
      content,
      buttons: [
        {
          action: "buy",
          icon: "fa-solid fa-cart-shopping",
          label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.AddToCart"),
          default: true,
          callback: (_event, button) => selectShopPrice(
            price,
            price.ranged ? button.form.elements.priceAmount.value : price.amount
          )
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          callback: () => false
        }
      ],
      close: () => false,
      rejectClose: false
    });
  }

  async #confirmNegotiatedPurchase(document) {
    const balance = ShopService.balance(this.#actor);
    const available = Math.max(0, balance.total - this.#cartTotal());
    const note = document.pricingNote || document.description || document.cost;
    const content = `<form class="symbaroum-hud-shop-confirm symbaroum-hud-shop-negotiated-price">
      <img src="${escapeHtml(document.img || "icons/svg/coins.svg")}" alt="">
      <p>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.NegotiatedPriceText", {
        item: document.name,
        rule: document.cost
      }))}</p>
      ${note ? `<small class="symbaroum-hud-shop-negotiated-note">${escapeHtml(note)}</small>` : ""}
      <fieldset>
        <legend>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.NegotiatedPriceAmount"))}</legend>
        <label><input type="number" name="thaler" value="0" min="0" step="1">
          <span>${escapeHtml(game.i18n.localize("MONEY.THALER"))}</span></label>
        <label><input type="number" name="shilling" value="0" min="0" step="1">
          <span>${escapeHtml(game.i18n.localize("MONEY.SHILLING"))}</span></label>
        <label><input type="number" name="orteg" value="0" min="0" step="1">
          <span>${escapeHtml(game.i18n.localize("MONEY.ORTEG"))}</span></label>
      </fieldset>
      <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.NegotiatedPriceBarterHint"))}</small>
      <small>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.CurrentBalance", {
        thaler: balance.thaler,
        shilling: balance.shilling,
        orteg: balance.orteg
      }))}</small>
    </form>`;
    return DialogV2.wait({
      classes: ["symbaroum-hud-shop-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.NegotiatedPriceTitle") },
      position: { width: 460 },
      content,
      buttons: [
        {
          action: "buy",
          icon: "fa-solid fa-cart-shopping",
          label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.AddToCart"),
          default: true,
          callback: (_event, button) => {
            const thaler = Math.max(0, Math.trunc(Number(button.form.elements.thaler.value) || 0));
            const shilling = Math.max(0, Math.trunc(Number(button.form.elements.shilling.value) || 0));
            const orteg = Math.max(0, Math.trunc(Number(button.form.elements.orteg.value) || 0));
            const total = thaler * SHOP_MONEY_VALUES.thaler
              + shilling * SHOP_MONEY_VALUES.shilling
              + orteg;
            if (!Number.isSafeInteger(total) || total > available) return false;
            return Object.freeze({
              raw: total === 0
                ? game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.BarterOrFavor")
                : shopMoneyLabel(total),
              amount: total,
              denomination: "orteg",
              ortegs: total,
              sourceRaw: document.cost
            });
          }
        },
        { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => false }
      ],
      close: () => false,
      rejectClose: false
    });
  }

  #notifyPurchaseFailure(reason) {
    const keys = {
      permission: "SYMBAROUMHUD.CompendiumBrowser.Shop.NoPermission",
      closed: "SYMBAROUMHUD.CompendiumBrowser.Shop.ClosedPurchase",
      unavailable: "SYMBAROUMHUD.CompendiumBrowser.Shop.Unavailable",
      outOfStock: "SYMBAROUMHUD.CompendiumBrowser.Shop.OutOfStock",
      invalidPrice: "SYMBAROUMHUD.CompendiumBrowser.Shop.InvalidPrice",
      invalidQuantity: "SYMBAROUMHUD.CompendiumBrowser.Shop.InvalidQuantity",
      negotiated: "SYMBAROUMHUD.CompendiumBrowser.Shop.NegotiatedRequiresGM",
      insufficient: "SYMBAROUMHUD.CompendiumBrowser.Shop.Insufficient",
      failed: "SYMBAROUMHUD.CompendiumBrowser.Shop.Failed",
      location: "SYMBAROUMHUD.CompendiumBrowser.Shop.LocationUnavailable"
    };
    ui.notifications?.warn(game.i18n.localize(keys[reason] ?? keys.failed));
    return null;
  }

  async #saveShop() {
    if (this.#mode !== "shop" || !game.user?.isGM || this.#shopView !== "create") return null;
    const name = this.#shopDraftName.trim();
    if (!name || !this.#shopDraftHasChanges()) return null;
    if (this.#shopSavePromise) {
      await this.#shopSavePromise;
      return this.#shopDraftHasChanges() ? this.#saveShop() : null;
    }

    const id = this.#shopDraftId ?? createShopDefinitionId();
    const img = this.#shopDraftImage;
    const description = this.#shopDraftDescription.trim();
    let current = null;
    try {
      current = getSetting(SETTINGS.SHOP_DEFINITIONS);
    } catch (_error) {
      current = null;
    }
    const definitions = upsertShopDefinition(current, {
      id,
      name,
      icon: "fa-store",
      img,
      imageScale: this.#shopDraftImageScale,
      imageX: this.#shopDraftImageX,
      imageY: this.#shopDraftImageY,
      description,
      open: this.#shopDraftOpen,
      categories: this.#shopDraftCategories,
      stockPresetId: this.#shopDraftStockPresetId,
      stock: this.#shopDraftStock
    });
    try {
      this.#shopSavePromise = game.settings.set(
        MODULE_ID,
        SETTINGS.SHOP_DEFINITIONS,
        definitions
      );
      await this.#shopSavePromise;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not save shop definition.`, error);
      ui.notifications?.error(game.i18n.localize(
        "SYMBAROUMHUD.CompendiumBrowser.Shop.StoreSaveFailed"
      ));
      return null;
    } finally {
      this.#shopSavePromise = null;
    }

    this.#shopDraftId = id;
    this.#shopDraftSavedName = name;
    this.#shopDraftSavedImage = img;
    this.#shopDraftSavedImageScale = this.#shopDraftImageScale;
    this.#shopDraftSavedImageX = this.#shopDraftImageX;
    this.#shopDraftSavedImageY = this.#shopDraftImageY;
    this.#shopDraftSavedDescription = description;
    this.#shopDraftSavedOpen = this.#shopDraftOpen;
    this.#shopDraftSavedCategories = [...this.#shopDraftCategories];
    this.#shopDraftSavedStockPresetId = this.#shopDraftStockPresetId;
    this.#shopDraftSavedStock = cloneShopStock(this.#shopDraftStock);
    this.#activeShopId = id;
    return null;
  }

  #shopDraftHasChanges() {
    return shopDraftHasChanges({
      name: this.#shopDraftName,
      img: this.#shopDraftImage,
      imageScale: this.#shopDraftImageScale,
      imageX: this.#shopDraftImageX,
      imageY: this.#shopDraftImageY,
      description: this.#shopDraftDescription,
      open: this.#shopDraftOpen,
      categories: this.#shopDraftCategories,
      stockPresetId: this.#shopDraftStockPresetId,
      stock: this.#shopDraftStock
    }, {
      name: this.#shopDraftSavedName,
      img: this.#shopDraftSavedImage,
      imageScale: this.#shopDraftSavedImageScale,
      imageX: this.#shopDraftSavedImageX,
      imageY: this.#shopDraftSavedImageY,
      description: this.#shopDraftSavedDescription,
      open: this.#shopDraftSavedOpen,
      categories: this.#shopDraftSavedCategories,
      stockPresetId: this.#shopDraftSavedStockPresetId,
      stock: this.#shopDraftSavedStock
    });
  }

  #scheduleShopAutoSave(delay = 650) {
    globalThis.clearTimeout(this.#shopSaveTimeout);
    this.#shopSaveTimeout = null;
    if (!this.#shopDraftName.trim() || !this.#shopDraftHasChanges()) return;
    this.#shopSaveTimeout = globalThis.setTimeout(() => {
      this.#shopSaveTimeout = null;
      void this.#saveShop();
    }, delay);
  }

  async #flushShopAutoSave() {
    globalThis.clearTimeout(this.#shopSaveTimeout);
    this.#shopSaveTimeout = null;
    if (this.#shopDraftName.trim() && this.#shopDraftHasChanges()) {
      await this.#saveShop();
    } else if (this.#shopSavePromise) {
      await this.#shopSavePromise;
    }
  }

  #chooseShopImage() {
    if (!game.user?.isGM || this.#shopView !== "create") return null;
    const FilePicker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation
      ?? globalThis.FilePicker;
    if (!FilePicker) {
      ui.notifications?.warn(game.i18n.localize(
        "SYMBAROUMHUD.CompendiumBrowser.Shop.ImagePickerUnavailable"
      ));
      return null;
    }
    const picker = new FilePicker({
      type: "image",
      displayMode: "tiles",
      current: this.#shopDraftImage,
      callback: (path) => {
        const image = String(path ?? "").trim();
        if (!image) return;
        this.#shopDraftImage = image;
        this.#scheduleShopAutoSave(0);
        void this.render({ force: true });
      }
    });
    picker.render();
    return picker;
  }

  async #generateOfficialShops() {
    if (this.#mode !== "shop" || this.#shopView !== "directory" || !game.user?.isGM) return null;
    const configuration = configuredShopConfiguration();
    const location = configuration.locations.find(({ id }) => id === configuration.activeLocationId);
    if (!location) {
      ui.notifications?.warn(game.i18n.localize(
        "SYMBAROUMHUD.CompendiumBrowser.Shop.SelectLocationForOfficialStores"
      ));
      return null;
    }
    const existingIds = new Set(configuration.stores.map(({ id }) => id));
    const presetsByLocation = new Map();
    for (const preset of OFFICIAL_SHOP_PRESETS) {
      const group = officialShopLocationGroup(preset.location);
      if (!presetsByLocation.has(group)) presetsByLocation.set(group, []);
      presetsByLocation.get(group).push(preset);
    }
    const choices = [...presetsByLocation.entries()].map(([group, presets]) => {
      const cards = presets.map((preset) => {
        const id = officialShopDefinitionId(location.id, preset.id);
        const exists = existingIds.has(id);
        return `<label data-existing="${exists}">
          <input type="checkbox" name="officialShop" value="${escapeHtml(preset.id)}" ${exists ? "disabled" : ""}>
          <i class="fa-solid ${escapeHtml(preset.icon || "fa-store")}" aria-hidden="true"></i>
          <span><strong>${escapeHtml(preset.name)}</strong>
            <small>${escapeHtml(preset.location)} · ${escapeHtml(preset.source?.book ?? "")}</small></span>
          ${exists ? `<em>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.AlreadyGenerated"))}</em>` : ""}
        </label>`;
      }).join("");
      return `<section class="symbaroum-hud-official-shops-group">
        <header>
          <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
          <strong>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.OfficialStoresFromLocation", {
            location: group
          }))}</strong>
          <small>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.OfficialStoreCount", {
            count: presets.length
          }))}</small>
        </header>
        <div>${cards}</div>
      </section>`;
    }).join("");
    // DialogV2 already renders its contents inside a form. Using another form here
    // causes the browser to discard the nested element and breaks the entire card layout.
    const content = `<section class="symbaroum-hud-official-shops-form">
      <header>
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span><strong>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.GenerateOfficialStores"))}</strong>
          <small>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.GenerateOfficialStoresHint", {
            location: location.name
          }))}</small></span>
      </header>
      <div class="symbaroum-hud-official-shops-list">${choices}</div>
    </section>`;
    const selected = await DialogV2.wait({
      classes: ["symbaroum-hud-official-shops-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.GenerateOfficialStores") },
      position: { width: 720, height: 760 },
      content,
      buttons: [
        {
          action: "generate",
          icon: "fa-solid fa-wand-magic-sparkles",
          label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.GenerateSelectedStores"),
          default: true,
          callback: (_event, button) => [...button.form.querySelectorAll('input[name="officialShop"]:checked')]
            .map((input) => input.value)
        },
        { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null }
      ],
      close: () => null,
      rejectClose: false
    });
    if (!selected) return null;
    if (!selected.length) {
      ui.notifications?.warn(game.i18n.localize(
        "SYMBAROUMHUD.CompendiumBrowser.Shop.SelectOfficialStore"
      ));
      return null;
    }
    const selectedPresets = OFFICIAL_SHOP_PRESETS.filter(({ id }) => selected.includes(id));
    let next = configuration;
    const generatedIds = [];
    for (const preset of selectedPresets) {
      const id = officialShopDefinitionId(location.id, preset.id);
      if (existingIds.has(id)) continue;
      generatedIds.push(id);
      next = upsertShopDefinition(next, {
        id,
        name: preset.name,
        icon: preset.icon || "fa-store",
        img: DEFAULT_SHOP_IMAGE,
        description: officialShopDescription(preset),
        open: true,
        categories: preset.categories,
        stockPresetId: preset.id,
        stock: []
      });
    }
    if (!generatedIds.length) return null;
    next = replaceShopLocations(next, next.locations.map((entry) => entry.id === location.id
      ? { ...entry, shopIds: [...new Set([...entry.shopIds, ...generatedIds])] }
      : entry), location.id);
    await game.settings.set(MODULE_ID, SETTINGS.SHOP_DEFINITIONS, next);
    ui.notifications?.info(game.i18n.format(
      "SYMBAROUMHUD.CompendiumBrowser.Shop.OfficialStoresGenerated",
      { count: generatedIds.length, location: location.name }
    ));
    return this.render({ force: true });
  }

  async #configureShopLocations({ focusNew = false } = {}) {
    if (this.#mode !== "shop" || !game.user?.isGM) return null;
    await this.#flushShopAutoSave();
    const configuration = configuredShopConfiguration();
    const stores = [{
      id: "general",
      name: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Title"),
      icon: "fa-shop"
    }, ...configuration.stores];
    const newLocationId = createShopLocationId();
    const shopChoices = (selected = []) => stores.map((store) => `<label>
      <input type="checkbox" data-location-shop value="${escapeHtml(store.id)}"
        ${selected.includes(store.id) ? "checked" : ""}>
      <i class="fa-solid ${escapeHtml(store.icon || "fa-store")}" aria-hidden="true"></i>
      <span>${escapeHtml(store.name)}</span>
    </label>`).join("");
    const locationRow = (location, { fresh = false } = {}) => `<fieldset class="symbaroum-hud-shop-location-row"
      data-shop-location-row data-location-id="${escapeHtml(location.id)}" ${fresh ? "data-new-shop-location" : ""}>
      <header>
        <label><span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.LocationName"))}</span>
          <input type="text" data-location-name value="${escapeHtml(location.name)}"
            maxlength="80" placeholder="${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.LocationNamePlaceholder"))}">
        </label>
        <label class="symbaroum-hud-shop-location-active">
          <input type="radio" name="activeLocation" value="${escapeHtml(location.id)}"
            ${configuration.activeLocationId === location.id ? "checked" : ""}>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ActivateLocation"))}</span>
        </label>
        ${fresh ? "" : `<label class="symbaroum-hud-shop-location-remove">
          <input type="checkbox" data-location-remove>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.RemoveLocation"))}</span>
        </label>`}
      </header>
      <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.LocationStoresHint"))}</p>
      <div>${shopChoices(location.shopIds)}</div>
    </fieldset>`;
    const content = `<form class="symbaroum-hud-shop-locations-form">
      <header>
        <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i>
        <span><strong>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfigureLocations"))}</strong>
          <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.LocationsHint"))}</small></span>
      </header>
      <label class="symbaroum-hud-shop-no-active-location">
        <input type="radio" name="activeLocation" value=""
          ${configuration.activeLocationId ? "" : "checked"}>
        <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.NoActiveLocation"))}</span>
      </label>
      <section>
        ${configuration.locations.map((location) => locationRow(location)).join("")}
        ${locationRow({ id: newLocationId, name: "", shopIds: [] }, { fresh: true })}
      </section>
    </form>`;
    const result = await DialogV2.wait({
      classes: ["symbaroum-hud-shop-locations-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfigureLocations") },
      position: { width: 720, height: 720 },
      content,
      render: (_event, dialog) => {
        if (!focusNew) return;
        const field = dialog.element?.querySelector?.("[data-new-shop-location] [data-location-name]");
        field?.scrollIntoView?.({ block: "center" });
        field?.focus?.();
      },
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("Save"),
          default: true,
          callback: (_event, button) => {
            const rows = [...button.form.querySelectorAll("[data-shop-location-row]")];
            const locations = rows.flatMap((row) => {
              if (row.querySelector("[data-location-remove]")?.checked) return [];
              const name = row.querySelector("[data-location-name]")?.value?.trim();
              if (!name) return [];
              return [{
                id: row.dataset.locationId,
                name,
                shopIds: [...row.querySelectorAll("[data-location-shop]:checked")]
                  .map((input) => input.value)
              }];
            });
            return {
              locations,
              activeLocationId: button.form.querySelector('input[name="activeLocation"]:checked')?.value ?? null
            };
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false
    });
    if (!result) return null;
    const next = replaceShopLocations(configuration, result.locations, result.activeLocationId);
    await game.settings.set(MODULE_ID, SETTINGS.SHOP_DEFINITIONS, next);
    this.#cart.clear();
    this.#activeShopId = null;
    this.#shopView = "directory";
    return this.render({ force: true });
  }

  async #configureShopPricing() {
    if (this.#mode !== "shop" || !game.user?.isGM || this.#shopView === "directory") return null;
    const shopId = this.#shopView === "create" ? this.#activeShopId : "general";
    if (!shopId) return null;
    const pricing = configuredShopPriceModifier(shopId);
    const shopName = this.#shopView === "create"
      ? this.#shopDraftName
      : game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Title");
    const categoryIds = new Set(SHOP_PURCHASE_MODIFIER_CATEGORIES.map(({ id }) => id));
    const effectiveParent = ({ parent }) => categoryIds.has(parent) ? parent : null;
    const categoryParents = new Set(SHOP_PURCHASE_MODIFIER_CATEGORIES
      .map(effectiveParent)
      .filter(Boolean));
    const categoryRows = SHOP_PURCHASE_MODIFIER_CATEGORIES.map((category) => {
      const { id, label, icon } = category;
      const parent = effectiveParent(category);
      const hasChildren = categoryParents.has(id);
      return `<div class="symbaroum-hud-shop-pricing-tree-row" data-pricing-category-row
        data-pricing-category-id="${id}" data-pricing-parent-id="${parent ?? ""}"
        data-depth="${shopCategoryDepth(id)}" ${parent ? "hidden" : ""}>
        ${hasChildren ? `<button type="button" class="symbaroum-hud-shop-pricing-tree-toggle"
          data-pricing-category-toggle aria-expanded="false"
          aria-label="${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ExpandPriceCategory"))}">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>` : `<span class="symbaroum-hud-shop-pricing-tree-spacer" aria-hidden="true"></span>`}
        <label class="symbaroum-hud-shop-pricing-row">
          <span><i class="fa-solid ${icon}" aria-hidden="true"></i> ${escapeHtml(game.i18n.localize(label))}</span>
          <span><input type="number" name="modifier-${id}" value="${pricing.categories[id] ?? 100}"
            min="10" max="300" step="5" required><b>%</b></span>
        </label>
      </div>`;
    }).join("");
    const content = `<form class="symbaroum-hud-shop-pricing-form">
      <header>
        <i class="fa-solid fa-coins" aria-hidden="true"></i>
        <span><strong>${escapeHtml(shopName)}</strong><small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.PricingHint"))}</small></span>
      </header>
      <label class="symbaroum-hud-shop-pricing-row symbaroum-hud-shop-pricing-general">
        <span><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> ${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.GeneralPurchaseModifier"))}</span>
        <span><input type="number" name="purchase" value="${pricing.purchase}"
          min="10" max="300" step="5" required><b>%</b></span>
      </label>
      <label class="symbaroum-hud-shop-pricing-toggle">
        <input type="checkbox" name="useCategoryModifiers" ${pricing.useCategoryModifiers ? "checked" : ""}>
        <span><strong>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ModifiersByCategory"))}</strong>
          <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ModifiersByCategoryHint"))}</small></span>
      </label>
      <section class="symbaroum-hud-shop-pricing-categories">
        ${categoryRows}
      </section>
      <p><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.PricingExplanation"))}</p>
    </form>`;
    const result = await DialogV2.wait({
      classes: ["symbaroum-hud-shop-pricing-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfigurePricing") },
      position: { width: 520 },
      content,
      render: (_event, dialog) => bindShopPricingTree(dialog.element),
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("Save"),
          default: true,
          callback: (_event, button) => ({
            purchase: button.form.elements.purchase.value,
            useCategoryModifiers: button.form.elements.useCategoryModifiers.checked,
            categories: Object.fromEntries(SHOP_PURCHASE_MODIFIER_CATEGORIES.map(({ id }) => [
              id,
              button.form.elements[`modifier-${id}`].value
            ]).filter(([, value]) => normalizeShopModifierPercentage(value) !== 100))
          })
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false
    });
    if (!result) return null;
    const current = getSetting(SETTINGS.SHOP_PRICE_MODIFIERS);
    await game.settings.set(
      MODULE_ID,
      SETTINGS.SHOP_PRICE_MODIFIERS,
      upsertShopPriceModifier(current, shopId, result)
    );
    this.#cart.clear();
    return this.render({ force: true });
  }

  async #configureSources() {
    const sources = sourceDescriptors();
    const current = configuredSources();
    const folderAccess = configuredFolderAccess();
    const originAccess = configuredOriginAccess();
    const originOptions = [...CONTENT_ORIGINS, contentOriginDefinition(UNKNOWN_CONTENT_ORIGIN)];
    const folderGroups = browserFolderGroups();
    const canConfigurePlayers = Boolean(game.user?.isGM);
    const content = `<div class="symbaroum-hud-browser-source-config">
      <section class="symbaroum-hud-browser-personal-sources">
        <h3>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.PersonalSources"))}</h3>
        <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.SourceConfigHint"))}</p>
        <div class="symbaroum-hud-browser-source-list">${sources.map((source) => `<label>
          <input type="checkbox" name="source" value="${escapeHtml(source.id)}" ${current[source.id] === false ? "" : "checked"}>
          <span>${escapeHtml(source.label)}</span>
          <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.WorldSource"))}</small>
        </label>`).join("")}</div>
      </section>
      ${canConfigurePlayers ? `<section class="symbaroum-hud-browser-origin-access">
        <header>
          <h3>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.PlayerOriginAccess"))}</h3>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.GameMasterOnly"))}</span>
        </header>
        <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.PlayerOriginAccessHint"))}</p>
        <div class="symbaroum-hud-browser-origin-access-list">
          ${originOptions.map((origin) => `<label>
            <input type="checkbox" name="originAccess" value="${escapeHtml(origin.id)}"
              ${!originAccess.configured || originAccess.originIds.includes(origin.id) ? "checked" : ""}>
            <i class="fa-solid fa-book-bookmark" aria-hidden="true"></i>
            <span>${escapeHtml(game.i18n.localize(origin.label))}</span>
          </label>`).join("")}
        </div>
      </section>
      <section class="symbaroum-hud-browser-folder-access">
        <header>
          <h3>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.PlayerFolderAccess"))}</h3>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.GameMasterOnly"))}</span>
        </header>
        <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.PlayerFolderAccessHint"))}</p>
        <div class="symbaroum-hud-browser-folder-groups">
          ${folderGroups.map((group) => `<fieldset>
            <legend><i class="fa-solid ${group.icon}" aria-hidden="true"></i> ${escapeHtml(group.label)}</legend>
            ${group.rows.length ? group.rows.map((row) => `<div class="symbaroum-hud-browser-folder-row"
              style="--folder-depth: ${row.depth}" data-folder-tree-row data-folder-id="${escapeHtml(row.id)}"
              data-folder-parent-id="${escapeHtml(row.parentId ?? "")}" ${row.depth > 0 ? "hidden" : ""}>
              ${row.hasChildren ? `<button type="button" data-folder-tree-toggle aria-expanded="false"
                aria-label="${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.ExpandFolder"))}">
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </button>` : '<span class="symbaroum-hud-browser-folder-toggle-spacer"></span>'}
              <label>
                <input type="checkbox" name="folderAccess" value="${escapeHtml(row.id)}"
                  ${folderAccess.folderIds.includes(row.id) ? "checked" : ""}>
                <i class="fa-solid ${row.root ? "fa-box-open" : "fa-folder"}" aria-hidden="true"></i>
                <span>${escapeHtml(row.name)}</span>
                <small>${row.count}</small>
              </label>
            </div>`).join("") : `<p class="symbaroum-hud-browser-no-folders">${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.NoWorldFolders"))}</p>`}
          </fieldset>`).join("")}
        </div>
      </section>` : ""}
    </div>`;
    const result = await DialogV2.wait({
      classes: ["symbaroum-hud-browser-source-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.ConfigureSources") },
      position: { width: canConfigurePlayers ? 680 : 520, height: canConfigurePlayers ? 700 : 420 },
      content,
      buttons: [
        {
          action: "save",
          icon: "fa-solid fa-check",
          label: game.i18n.localize("Save"),
          default: true,
          callback: (_event, button) => {
            const checked = new Set([...button.form.querySelectorAll('input[name="source"]:checked')]
              .map((input) => input.value));
            const selectedFolders = [...button.form.querySelectorAll('input[name="folderAccess"]:checked')]
              .map((input) => input.value);
            const selectedOrigins = [...button.form.querySelectorAll('input[name="originAccess"]:checked')]
              .map((input) => input.value);
            return {
              sources: Object.fromEntries(sources.map((source) => [source.id, checked.has(source.id)])),
              folderAccess: canConfigurePlayers ? {
                configured: true,
                folderIds: selectedFolders
              } : null,
              originAccess: canConfigurePlayers ? {
                configured: true,
                originIds: selectedOrigins
              } : null
            };
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => bindBrowserFolderTree(dialog.element)
    });
    if (!result) return;
    let ownershipChanges = null;
    if (canConfigurePlayers && result.folderAccess && result.originAccess) {
      ui.notifications?.info(game.i18n.localize(
        "SYMBAROUMHUD.CompendiumBrowser.ApplyingFolderAccess"
      ));
      try {
        ownershipChanges = await synchronizeBrowserObserverAccess(
          result.folderAccess,
          result.originAccess,
          await this.#contentOriginIndex({ waitForFull: true })
        );
      } catch (error) {
        console.error(`${MODULE_ID} | Could not synchronize browser Observer ownership.`, error);
        ui.notifications?.error(game.i18n.localize(
          "SYMBAROUMHUD.CompendiumBrowser.FolderAccessFailed"
        ));
        return;
      }
    }
    await game.settings.set(MODULE_ID, SETTINGS.COMPENDIUM_BROWSER_SOURCES, result.sources);
    if (canConfigurePlayers && result.folderAccess) {
      await game.settings.set(MODULE_ID, SETTINGS.COMPENDIUM_BROWSER_FOLDER_ACCESS, result.folderAccess);
      await game.settings.set(MODULE_ID, SETTINGS.COMPENDIUM_BROWSER_ORIGIN_ACCESS, result.originAccess);
      ui.notifications?.info(game.i18n.format(
        "SYMBAROUMHUD.CompendiumBrowser.FolderAccessSaved",
        ownershipChanges
      ));
    }
    this.#excludedSources.clear();
    SymbaroumCompendiumBrowser.invalidate();
    ui.items?.render?.();
    ui.actors?.render?.();
  }

  #enforceMaximum(changedUuid) {
    const max = Number(this.#selection?.max ?? 0);
    if (!max || this.#selected.size <= max) return;
    for (const uuid of this.#selected) {
      if (uuid === changedUuid) continue;
      this.#selected.delete(uuid);
      if (this.#selected.size <= max) break;
    }
  }

  #validCategory(category) {
    return CATEGORY_BY_ID.has(category)
      && (this.#mode !== "shop" || SHOP_CATEGORY_IDS.has(category))
      && (!this.#lockedCategory || shopCategoryAllowedByLock(category, this.#lockedCategory));
  }

  #validLockedCategory(category) {
    return this.#mode === "shop" && category !== "all" && SHOP_CATEGORY_IDS.has(category)
      ? category
      : null;
  }

  #selectionSummary() {
    const count = this.#selected.size;
    const min = Number(this.#selection?.min ?? 0);
    const max = Number(this.#selection?.max ?? Infinity);
    return {
      valid: count >= min && count <= max,
      summary: game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.SelectionSummary", {
        count,
        min,
        max: Number.isFinite(max) ? max : "∞"
      })
    };
  }

  async #confirmSelection() {
    if (!this.#selectionSummary().valid) return;
    this.#selectionResolved = true;
    this.#onSelect?.(new Set(this.#selected));
    await this.close();
  }
}

export function explorerLicensePreview(service, category = null) {
  const t = (key) => escapeHtml(game.i18n.localize(`SYMBAROUMHUD.Services.ExplorerLicense.${key}`));
  const categoryLabel = escapeHtml(game.i18n.localize(
    category?.label ?? "SYMBAROUMHUD.Services.Categories.Permits"
  ));
  const rows = [
    ["Single", "2 táleres", "9 táleres"],
    ["TwoToFive", "10 táleres", "50 táleres"],
    ["SixToEight", "25 táleres", "90 táleres"],
    ["NineToTen", "55 táleres", "180 táleres"],
    ["Unlimited", "—", "450 táleres"]
  ].map(([label, month, year]) => `<tr><th>${t(label)}</th><td>${month}</td><td>${year}</td></tr>`).join("");
  const additions = [
    ["Gathering", "3–10 táleres"],
    ["Harvesting", "5–12 táleres"],
    ["Exploring", t("FivePerPerson")],
    ["Wagons", t("FivePerWagon")],
    ["Incompetence", "5–15 táleres"],
    ["Intentions", "5–50 táleres"],
    ["Other", "1–50 táleres"]
  ].map(([label, value]) => `<tr><th>${t(label)}</th><td>${value}</td></tr>`).join("");
  return `<article class="symbaroum-hud-service-preview symbaroum-hud-explorer-license-preview">
    <header>
      <span class="symbaroum-hud-explorer-license-seal"><i class="fa-solid fa-scroll" aria-hidden="true"></i></span>
      <span><small>${t("OfficialDocument")}</small><strong>${escapeHtml(service.name)}</strong>
        <em><i class="fa-solid ${escapeHtml(category?.icon ?? "fa-scroll")}" aria-hidden="true"></i> ${categoryLabel}</em></span>
    </header>
    <section class="symbaroum-hud-explorer-license-intro">
      <p>${t("Introduction")}</p>
      <aside><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i><span><strong>${t("RequiredTitle")}</strong>${t("RequiredText")}</span></aside>
    </section>
    <div class="symbaroum-hud-explorer-license-columns">
      <section>
        <h3><i class="fa-solid fa-stamp" aria-hidden="true"></i> ${t("HowToObtain")}</h3>
        <ul><li>${t("IssuerYndaros")}</li><li>${t("IssuerThistleHold")}</li><li>${t("GroupRule")}</li></ul>
      </section>
      <section>
        <h3><i class="fa-solid fa-list-check" aria-hidden="true"></i> ${t("HowItWorks")}</h3>
        <ol><li>${t("StepRegister")}</li><li>${t("StepAssess")}</li><li>${t("StepCarry")}</li></ol>
      </section>
    </div>
    <section class="symbaroum-hud-explorer-license-prices">
      <h3><i class="fa-solid fa-users" aria-hidden="true"></i> ${t("BaseCost")}</h3>
      <table><thead><tr><th>${t("CoveredPeople")}</th><th>${t("PerMonth")}</th><th>${t("PerYear")}</th></tr></thead><tbody>${rows}</tbody></table>
      <small>${t("BaseCostHint")}</small>
    </section>
    <section class="symbaroum-hud-explorer-license-prices">
      <h3><i class="fa-solid fa-coins" aria-hidden="true"></i> ${t("Additions")}</h3>
      <table class="symbaroum-hud-explorer-license-additions"><tbody>${additions}</tbody></table>
      <small>${t("AdditionsHint")}</small>
    </section>
    <aside class="symbaroum-hud-explorer-license-warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span><strong>${t("WithoutLicense")}</strong>${t("WithoutLicenseText")}</span></aside>
    <footer><i class="fa-solid fa-bookmark" aria-hidden="true"></i> ${escapeHtml(service.source)}</footer>
  </article>`;
}

export function registerCompendiumBrowserHooks() {
  const invalidateWorld = (document) => {
    if (synchronizingBrowserOwnership) return;
    if (document?.parent) return;
    const documentName = document?.documentName;
    if (!["Item", "Actor"].includes(documentName)) return;
    SymbaroumCompendiumBrowser.invalidate({
      origins: false,
      sourceIds: [`world:${documentName}`]
    });
  };
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActor", "updateActor", "deleteActor"]) {
    Hooks.on(hook, invalidateWorld);
  }
  for (const hook of ["createCompendium", "updateCompendium", "deleteCompendium"]) {
    Hooks.on(hook, () => SymbaroumCompendiumBrowser.invalidate());
  }
  Hooks.on(`${MODULE_ID}.browserFolderAccessChanged`, () => {
    SymbaroumCompendiumBrowser.invalidate({ origins: false });
    ui.items?.render?.();
    ui.actors?.render?.();
  });
  Hooks.on(`${MODULE_ID}.browserOriginAccessChanged`, () => {
    SymbaroumCompendiumBrowser.invalidate({ origins: false });
    ui.items?.render?.();
    ui.actors?.render?.();
  });
  Hooks.on(`${MODULE_ID}.itemTaxonomyUpdated`, () => {
    SymbaroumCompendiumBrowser.invalidate({
      origins: false,
      sourceIds: ["world:Item"]
    });
  });
  Hooks.on(`${MODULE_ID}.shopDefinitionsChanged`, () => {
    SymbaroumCompendiumBrowser.handleShopDefinitionsChanged();
  });
  Hooks.on(`${MODULE_ID}.serviceDefinitionsChanged`, () => {
    SymbaroumCompendiumBrowser.handleShopDefinitionsChanged();
  });
  Hooks.on(`${MODULE_ID}.generalStoreAvailabilityChanged`, (open) => {
    SymbaroumCompendiumBrowser.handleGeneralStoreAvailabilityChanged(open);
  });
  Hooks.on("renderItemDirectory", (_application, element) => {
    injectItemDirectoryBrowserButton(element);
  });
  game.socket?.on?.(`module.${MODULE_ID}`, async (payload) => {
    if (payload?.type !== "consume-shop-stock" || !isPrimaryActiveGM()) return;
    const shopId = String(payload.shopId ?? "").trim();
    const lines = normalizeShopStockConsumptions(payload.lines);
    if (!shopId || shopId === "general" || !lines.length) return;
    try {
      const definitions = consumeShopDefinitionStock(
        getSetting(SETTINGS.SHOP_DEFINITIONS),
        shopId,
        lines
      );
      await game.settings.set(MODULE_ID, SETTINGS.SHOP_DEFINITIONS, definitions);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not consume custom shop stock.`, error);
    }
  });
}

function isPrimaryActiveGM() {
  if (!game.user?.isGM) return false;
  const activeGMs = collectionValues(game.users)
    .filter((user) => user?.isGM && user?.active !== false)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return !activeGMs.length || activeGMs[0].id === game.user.id;
}

function injectItemDirectoryBrowserButton(element) {
  const root = element instanceof globalThis.HTMLElement ? element : element?.[0];
  if (!root?.querySelector) return;
  const headerActions = root.querySelector(".directory-header .header-actions");
  if (!headerActions || root.querySelector("[data-symbaroum-hud-browser-directory]")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "symbaroum-hud-directory-browser-action";
  wrapper.dataset.symbaroumHudBrowserDirectory = "true";

  const browserButton = document.createElement("button");
  browserButton.type = "button";
  browserButton.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i><span></span>';
  browserButton.querySelector("span").textContent = game.i18n.localize(
    "SYMBAROUMHUD.CompendiumBrowser.OpenButton"
  );
  browserButton.setAttribute("aria-label", game.i18n.localize(
    "SYMBAROUMHUD.CompendiumBrowser.OpenButton"
  ));
  browserButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    SymbaroumCompendiumBrowser.open({ actor: null });
  });

  const shopButton = document.createElement("button");
  shopButton.type = "button";
  shopButton.innerHTML = '<i class="fa-solid fa-shop" aria-hidden="true"></i><span></span>';
  shopButton.querySelector("span").textContent = game.i18n.localize(
    "SYMBAROUMHUD.CompendiumBrowser.Shop.OpenButton"
  );
  shopButton.setAttribute("aria-label", game.i18n.localize(
    "SYMBAROUMHUD.CompendiumBrowser.Shop.OpenButton"
  ));
  shopButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const actor = game.modules.get(MODULE_ID)?.api?.getActor?.()
      ?? ActorService.resolve(getSetting(SETTINGS.SELECTION_MODE));
    SymbaroumCompendiumBrowser.openShop({ actor });
  });

  wrapper.append(browserButton, shopButton);
  headerActions.after(wrapper);
}

export function filterBrowserEntries(entries, {
  category = "all",
  query = "",
  excludedOrigins = new Set(),
  excludedSources = new Set(),
  excludedTaxonomies = new Set(),
  sort = true
} = {}) {
  const definition = CATEGORY_BY_ID.get(category) ?? CATEGORY_BY_ID.get("all");
  const search = normalizeSearch(query);
  const excludedTaxonomyList = [...excludedTaxonomies];
  const filtered = entries.filter((entry) => {
    if (excludedOrigins.has(entry.origin)) return false;
    if (excludedSources.has(entry.sourceId)) return false;
    if (excludedTaxonomyList.some((category) => entry.taxonomyTags?.includes(category))) return false;
    if (definition.documentClass && entry.documentClass !== definition.documentClass) return false;
    if (definition.documentTypes?.length && !definition.documentTypes.includes(entry.type)) return false;
    if (definition.taxonomyTag && !entry.taxonomyTags?.includes(definition.taxonomyTag)) return false;
    if (search && !(entry.searchText ?? browserEntrySearchText(entry)).includes(search)) return false;
    return true;
  });
  return sort
    ? filtered.sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" }))
    : filtered;
}

export function filterStockManagerEntries(entries, section = "items", categories = null) {
  const services = section === "services";
  const sectionEntries = entries.filter((entry) => services
    ? entry.documentClass === "Service"
    : entry.documentClass !== "Service");
  if (!Array.isArray(categories)) return sectionEntries;
  if (!categories.length) return [];
  return sectionEntries.filter((entry) => matchesShopStockCategories(entry, categories));
}

function prepareBrowserEntry(entry) {
  const prepared = {
    ...entry,
    originLabel: game.i18n.localize(contentOriginDefinition(entry.origin).label)
  };
  prepared.searchText = browserEntrySearchText(prepared);
  return prepared;
}

function browserEntrySearchText(entry) {
  return normalizeSearch(`${entry.name} ${entry.reference ?? ""} ${entry.cost ?? ""} ${entry.originLabel ?? ""} ${entry.sourceLabel ?? ""}`);
}

function category(id, icon, label, documentClass = null, documentTypes = [], {
  shop = false,
  taxonomyTag = null,
  parentId = null
} = {}) {
  return Object.freeze({
    id,
    icon,
    label,
    documentClass,
    documentTypes: Object.freeze(documentTypes),
    shop,
    taxonomyTag,
    parentId
  });
}

function countMatchingCategory(entries, definition) {
  if (definition.id === "all") return entries.length;
  return entries.reduce((count, entry) => count + (entryMatchesCategory(entry, definition) ? 1 : 0), 0);
}

function entryMatchesCategory(entry, definition) {
  if (definition.documentClass && entry.documentClass !== definition.documentClass) return false;
  if (definition.documentTypes?.length && !definition.documentTypes.includes(entry.type)) return false;
  if (definition.taxonomyTag && !entry.taxonomyTags?.includes(definition.taxonomyTag)) return false;
  return true;
}

function shopCategoryAllowedByLock(categoryId, lockedCategory) {
  if (!lockedCategory) return true;
  return categoryId !== "all" && shopCategoryIsDescendantOrSelf(categoryId, lockedCategory);
}

function shopCategoryVisible(categoryId, activeCategory) {
  const definition = CATEGORY_BY_ID.get(categoryId);
  if (!definition?.parentId) return true;
  return definition.parentId === activeCategory
    || shopCategoryIsDescendantOrSelf(activeCategory, definition.parentId);
}

function shopCategoryIsDescendantOrSelf(categoryId, ancestorId) {
  let current = CATEGORY_BY_ID.get(categoryId);
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    if (current.id === ancestorId) return true;
    visited.add(current.id);
    current = CATEGORY_BY_ID.get(current.parentId);
  }
  return false;
}

function shopCategoryDepth(categoryId) {
  let depth = 0;
  let current = CATEGORY_BY_ID.get(categoryId);
  const visited = new Set();
  while (current?.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    depth += 1;
    current = CATEGORY_BY_ID.get(current.parentId);
  }
  return depth;
}

function configuredSources() {
  try {
    return getSetting(SETTINGS.COMPENDIUM_BROWSER_SOURCES) ?? {};
  } catch (_error) {
    return {};
  }
}

export function normalizeShopPriceModifier(value = null) {
  const purchase = normalizeShopModifierPercentage(value?.purchase);
  const sourceCategories = value?.categories && typeof value.categories === "object"
    ? value.categories
    : {};
  const validCategories = new Set(SHOP_PURCHASE_MODIFIER_CATEGORIES.map(({ id }) => id));
  const categories = {};
  for (const [rawId, percentage] of Object.entries(sourceCategories)) {
    const id = canonicalTaxonomyCategoryId(rawId);
    if (!validCategories.has(id) || (rawId !== id && Object.hasOwn(sourceCategories, id))) continue;
    const normalized = normalizeShopModifierPercentage(percentage);
    if (normalized !== 100) categories[id] = normalized;
  }
  const hasCategories = Object.keys(categories).length > 0;
  if (!hasCategories && value?.useTypeModifiers === true && value?.types && typeof value.types === "object") {
    const legacy = {
      "melee-weapons": value.types.weapon,
      "ranged-weapons": value.types.weapon,
      "siege-weapons": value.types.weapon,
      armor: value.types.armor,
      equipment: value.types.equipment
    };
    for (const [id, percentage] of Object.entries(legacy)) {
      const normalized = normalizeShopModifierPercentage(percentage);
      if (normalized !== 100) categories[id] = normalized;
    }
  }
  return {
    purchase,
    useCategoryModifiers: value?.useCategoryModifiers === true || value?.useTypeModifiers === true,
    categories
  };
}

export function normalizeShopPriceModifiers(value = null) {
  const source = value?.shops && typeof value.shops === "object" ? value.shops : {};
  const shops = {};
  for (const [rawId, modifier] of Object.entries(source)) {
    const id = String(rawId ?? "").trim();
    if (!id || ["__proto__", "prototype", "constructor"].includes(id)) continue;
    shops[id] = normalizeShopPriceModifier(modifier);
  }
  return { version: 2, shops };
}

export function upsertShopPriceModifier(value, shopId, modifier) {
  const id = String(shopId ?? "").trim();
  const normalized = normalizeShopPriceModifiers(value);
  if (!id || ["__proto__", "prototype", "constructor"].includes(id)) return normalized;
  return {
    version: 2,
    shops: {
      ...normalized.shops,
      [id]: normalizeShopPriceModifier(modifier)
    }
  };
}

export function removeShopPriceModifier(value, shopId) {
  const id = String(shopId ?? "").trim();
  const normalized = normalizeShopPriceModifiers(value);
  if (!id || id === "general") return normalized;
  const shops = { ...normalized.shops };
  delete shops[id];
  return { version: 2, shops };
}

export function shopPurchaseModifier(modifier, item = null) {
  const normalized = normalizeShopPriceModifier(modifier);
  if (!normalized.useCategoryModifiers) return normalized.purchase;
  const primary = item?.taxonomyPrimary ?? item?.primary ?? null;
  const tags = Array.isArray(item)
    ? item
    : Array.isArray(item?.taxonomyTags)
      ? item.taxonomyTags
      : Array.isArray(item?.tags)
        ? item.tags
        : typeof item === "string"
          ? [item]
          : [];
  const configured = tags
    .filter((tag) => Object.hasOwn(normalized.categories, tag))
    .sort((left, right) => {
      const depth = shopCategoryDepth(right) - shopCategoryDepth(left);
      if (depth) return depth;
      if (left === primary) return -1;
      if (right === primary) return 1;
      return left.localeCompare(right);
    });
  return configured.length ? normalized.categories[configured[0]] : normalized.purchase;
}

export function applyShopPurchaseModifier(price, percentage = 100) {
  if (!price) return null;
  const modifier = normalizeShopModifierPercentage(percentage);
  const sourceDenomination = price.denomination
    ?? parseShopPrice(price.sourceRaw ?? price.raw)?.denomination
    ?? "orteg";
  const roundingUnit = SHOP_MONEY_VALUES[sourceDenomination] ?? SHOP_MONEY_VALUES.orteg;
  const adjustedOrtegs = Number(price.ortegs) * modifier / 100;
  const ortegs = Math.max(roundingUnit, Math.round(adjustedOrtegs / roundingUnit) * roundingUnit);
  if (!Number.isSafeInteger(ortegs)) return null;
  return Object.freeze({
    raw: shopMoneyLabel(ortegs),
    amount: ortegs,
    denomination: "orteg",
    ortegs,
    sourceRaw: price.sourceRaw ?? price.raw,
    modifier
  });
}

export function combinedShopPurchaseModifier(...values) {
  const combined = values.reduce((total, value) => (
    total * normalizeShopModifierPercentage(value) / 100
  ), 100);
  return normalizeShopModifierPercentage(combined);
}

function normalizeShopModifierPercentage(value) {
  const percentage = Math.round(Number(value));
  if (!Number.isFinite(percentage)) return 100;
  return Math.max(10, Math.min(300, percentage));
}

function configuredShopPriceModifier(shopId) {
  try {
    const pricing = normalizeShopPriceModifiers(getSetting(SETTINGS.SHOP_PRICE_MODIFIERS));
    return pricing.shops[shopId] ?? normalizeShopPriceModifier(DEFAULT_SHOP_PRICE_MODIFIER);
  } catch (_error) {
    return normalizeShopPriceModifier(DEFAULT_SHOP_PRICE_MODIFIER);
  }
}

function modifiedShopPriceLabel(price, percentage = 100) {
  if (!price) return "";
  const minimum = applyShopPurchaseModifier(selectShopPrice(price, price.amount), percentage);
  const maximum = applyShopPurchaseModifier(selectShopPrice(price, price.maximumAmount), percentage);
  if (!minimum || !maximum) return "";
  return minimum.ortegs === maximum.ortegs
    ? minimum.raw
    : `${minimum.raw} – ${maximum.raw}`;
}

function normalizeShopGenerationCategories(value = null) {
  const valid = new Set(SHOP_STOCK_GENERATOR_CATEGORIES.map(({ id }) => id));
  return [...new Set(Array.isArray(value) ? value : [])]
    .map((category) => canonicalTaxonomyCategoryId(category))
    .filter((category) => valid.has(category))
    .filter((category, index, values) => values.indexOf(category) === index)
    .sort();
}

export function normalizeShopDefinitions(value = null) {
  const stores = Array.isArray(value) ? value : value?.stores;
  if (!Array.isArray(stores)) return [];
  const upgradeOfficialDescriptions = !Array.isArray(value) && Number(value?.version ?? 0) < 4;
  const ids = new Set();
  return stores.flatMap((store) => {
    const id = String(store?.id ?? "").trim();
    const name = String(store?.name ?? "").trim();
    if (!id || !name || id === "general" || ids.has(id)) return [];
    ids.add(id);
    const image = normalizeShopImageSettings(store);
    let description = String(store?.description ?? "").trim();
    if (upgradeOfficialDescriptions) {
      const preset = OFFICIAL_SHOP_PRESETS.find((entry) => id.endsWith(`-${entry.id}`));
      if (preset) {
        const legacyDescription = `${preset.description}\n\n${preset.location} · ${preset.source?.book ?? ""}`;
        if (!description || description === preset.description || description === legacyDescription) {
          description = officialShopDescription(preset);
        }
      }
    }
    return [{
      id,
      name,
      icon: String(store?.icon ?? "").trim(),
      img: String(store?.img ?? DEFAULT_SHOP_IMAGE).trim() || DEFAULT_SHOP_IMAGE,
      ...image,
      description,
      open: store?.open !== false,
      ...(normalizeShopStockPresetId(store?.stockPresetId, id) ? {
        stockPresetId: normalizeShopStockPresetId(store.stockPresetId, id)
      } : {}),
      ...(normalizeShopGenerationCategories(store?.categories).length
        ? { categories: normalizeShopGenerationCategories(store.categories) }
        : {}),
      stock: normalizeShopStock(store?.stock)
    }];
  });
}

export function normalizeShopConfiguration(value = null) {
  const stores = normalizeShopDefinitions(value);
  const validShopIds = new Set(["general", ...stores.map(({ id }) => id)]);
  const sourceLocations = Array.isArray(value?.locations) ? value.locations : [];
  const ids = new Set();
  const locations = sourceLocations.flatMap((location) => {
    const id = String(location?.id ?? "").trim();
    const name = String(location?.name ?? "").trim();
    if (!id || !name || ids.has(id)) return [];
    ids.add(id);
    return [{
      id,
      name,
      shopIds: [...new Set(Array.isArray(location?.shopIds) ? location.shopIds : [])]
        .map((shopId) => String(shopId ?? "").trim())
        .filter((shopId) => validShopIds.has(shopId))
    }];
  });
  const requestedActiveId = String(value?.activeLocationId ?? "").trim();
  const activeLocationId = locations.some(({ id }) => id === requestedActiveId)
    ? requestedActiveId
    : null;
  return { version: 4, stores, locations, activeLocationId };
}

export function replaceShopLocations(value, locations, activeLocationId = null) {
  const configuration = normalizeShopConfiguration({
    ...normalizeShopConfiguration(value),
    locations,
    activeLocationId
  });
  return configuration;
}

export function removeShopLocation(value, locationId) {
  const configuration = normalizeShopConfiguration(value);
  const id = String(locationId ?? "").trim();
  if (!id || !configuration.locations.some((location) => location.id === id)) return configuration;
  return replaceShopLocations(
    configuration,
    configuration.locations.filter((location) => location.id !== id),
    configuration.activeLocationId === id ? null : configuration.activeLocationId
  );
}

export function removeShopDefinition(value, shopId) {
  const configuration = normalizeShopConfiguration(value);
  const id = String(shopId ?? "").trim();
  if (!id || id === "general") return configuration;
  return normalizeShopConfiguration({
    ...configuration,
    stores: configuration.stores.filter((store) => store.id !== id),
    locations: configuration.locations.map((location) => ({
      ...location,
      shopIds: location.shopIds.filter((entry) => entry !== id)
    }))
  });
}

export function shopIsAvailableAtActiveLocation(value, shopId) {
  const configuration = normalizeShopConfiguration(value);
  if (!configuration.locations.length) return true;
  const active = configuration.locations.find(({ id }) => id === configuration.activeLocationId);
  return Boolean(active?.shopIds.includes(String(shopId ?? "").trim()));
}

export function normalizeShopStock(value = null) {
  if (!Array.isArray(value)) return [];
  const lines = new Map();
  for (const line of value) {
    const uuid = String(line?.uuid ?? "").trim();
    const quantity = Math.trunc(Number(line?.quantity));
    if (!uuid || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 99999) continue;
    const current = lines.get(uuid);
    const priceModifier = normalizeShopModifierPercentage(line?.priceModifier ?? current?.priceModifier ?? 100);
    const pool = String(line?.pool ?? current?.pool ?? "").trim();
    lines.set(uuid, {
      uuid,
      quantity,
      ...(line?.unlimited === true ? { unlimited: true } : {}),
      ...(priceModifier !== 100 ? { priceModifier } : {}),
      ...(pool ? { pool } : {})
    });
  }
  return [...lines.values()]
    .sort((left, right) => left.uuid.localeCompare(right.uuid));
}

function mergeGeneratedShopStock(current, generated) {
  const lines = new Map(normalizeShopStock(current).map((line) => [line.uuid, line]));
  for (const line of normalizeShopStock(generated)) {
    const existing = lines.get(line.uuid);
    lines.set(line.uuid, {
      ...existing,
      ...line,
      quantity: Math.min(99999, (existing?.quantity ?? 0) + line.quantity)
    });
  }
  return [...lines.values()];
}

function cloneShopStock(stock) {
  return normalizeShopStock(stock).map((line) => ({ ...line }));
}

function normalizeShopStockConsumptions(value = null) {
  if (!Array.isArray(value)) return [];
  const quantities = new Map();
  for (const line of value) {
    const uuid = String(line?.uuid ?? "").trim();
    const quantity = Math.trunc(Number(line?.quantity));
    if (!uuid || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99999) continue;
    quantities.set(uuid, Math.min(99999, (quantities.get(uuid) ?? 0) + quantity));
  }
  return [...quantities.entries()].map(([uuid, quantity]) => ({ uuid, quantity }));
}

export function consumeShopStock(stock, consumptions) {
  const consumed = new Map(normalizeShopStockConsumptions(consumptions)
    .map((line) => [line.uuid, line.quantity]));
  return normalizeShopStock(stock).map((line) => ({
    ...line,
    quantity: line.unlimited
      ? line.quantity
      : Math.max(0, line.quantity - (consumed.get(line.uuid) ?? 0))
  }));
}

export function consumeShopDefinitionStock(value, shopId, consumptions) {
  const id = String(shopId ?? "").trim();
  const configuration = normalizeShopConfiguration(value);
  return {
    ...configuration,
    stores: configuration.stores.map((store) => (
      store.id === id ? { ...store, stock: consumeShopStock(store.stock, consumptions) } : store
    ))
  };
}

export function removeShopStockReference(value, uuid) {
  const configuration = normalizeShopConfiguration(value);
  const key = String(uuid ?? "").trim();
  if (!key) return configuration;
  return {
    ...configuration,
    stores: configuration.stores.map((store) => ({
      ...store,
      stock: store.stock.filter((line) => line.uuid !== key)
    }))
  };
}

export function upsertShopDefinition(value, store) {
  const configuration = normalizeShopConfiguration(value);
  const id = String(store?.id ?? "").trim();
  const name = String(store?.name ?? "").trim();
  if (!id || !name || id === "general") {
    return configuration;
  }
  const image = normalizeShopImageSettings(store);
  const next = {
    id,
    name,
    icon: String(store?.icon ?? "fa-store").trim() || "fa-store",
    img: String(store?.img ?? DEFAULT_SHOP_IMAGE).trim() || DEFAULT_SHOP_IMAGE,
    ...image,
    description: String(store?.description ?? "").trim(),
    open: store?.open !== false,
    ...(normalizeShopStockPresetId(store?.stockPresetId, id) ? {
      stockPresetId: normalizeShopStockPresetId(store.stockPresetId, id)
    } : {}),
    ...(normalizeShopGenerationCategories(store?.categories).length
      ? { categories: normalizeShopGenerationCategories(store.categories) }
      : {}),
    stock: normalizeShopStock(store?.stock)
  };
  const existed = configuration.stores.some((entry) => entry.id === id);
  const locations = !existed && configuration.activeLocationId
    ? configuration.locations.map((location) => location.id === configuration.activeLocationId
      ? { ...location, shopIds: [...new Set([...location.shopIds, id])] }
      : location)
    : configuration.locations;
  return {
    ...configuration,
    stores: [...configuration.stores.filter((entry) => entry.id !== id), next],
    locations
  };
}

export function toggleShopDefinitionAvailability(value, shopId) {
  const configuration = normalizeShopConfiguration(value);
  const id = String(shopId ?? "").trim();
  const store = configuration.stores.find((entry) => entry.id === id);
  if (!store) return configuration;
  return upsertShopDefinition(configuration, { ...store, open: !store.open });
}

export function sortShopDirectoryStores(stores = []) {
  return [...stores].sort((left, right) => {
    if (left?.general !== right?.general) return left?.general ? -1 : 1;
    if ((left?.open !== false) !== (right?.open !== false)) return left?.open !== false ? -1 : 1;
    return 0;
  });
}

export function shopDraftHasChanges(draft, saved = "") {
  if (typeof draft !== "object" || draft === null) {
    return String(draft ?? "").trim() !== String(saved ?? "").trim();
  }
  const baseline = typeof saved === "object" && saved !== null ? saved : {};
  if (["name", "img", "description"].some((field) => (
    String(draft[field] ?? "").trim() !== String(baseline[field] ?? "").trim()
  ))) return true;
  const draftImage = normalizeShopImageSettings(draft);
  const savedImage = normalizeShopImageSettings(baseline);
  if (["imageScale", "imageX", "imageY"].some((field) => draftImage[field] !== savedImage[field])) {
    return true;
  }
  if ((draft.open !== false) !== (baseline.open !== false)) return true;
  if (normalizeShopStockPresetId(draft.stockPresetId)
    !== normalizeShopStockPresetId(baseline.stockPresetId)) return true;
  if (JSON.stringify(normalizeShopGenerationCategories(draft.categories))
    !== JSON.stringify(normalizeShopGenerationCategories(baseline.categories))) return true;
  return JSON.stringify(normalizeShopStock(draft.stock))
    !== JSON.stringify(normalizeShopStock(baseline.stock));
}

export function normalizeShopImageSettings(value = null) {
  return {
    imageScale: boundedInteger(value?.imageScale, 100, 250, 100),
    imageX: boundedInteger(value?.imageX, 0, 100, 50),
    imageY: boundedInteger(value?.imageY, 0, 100, 50)
  };
}

function shopImageStyle(value = null) {
  const image = normalizeShopImageSettings(value);
  return `--shop-image-scale: ${(image.imageScale / 100).toFixed(2)}; --shop-image-x: ${image.imageX}%; --shop-image-y: ${image.imageY}%;`;
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function createShopDefinitionId() {
  const random = globalThis.foundry?.utils?.randomID?.(16)
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `shop-${random}`;
}

function createShopLocationId() {
  const random = globalThis.foundry?.utils?.randomID?.(16)
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `location-${random}`;
}

function createServiceDefinitionId() {
  const random = globalThis.foundry?.utils?.randomID?.(16)
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `custom-${random}`;
}

function officialShopDefinitionId(locationId, presetId) {
  const location = String(locationId ?? "location").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const preset = String(presetId ?? "shop").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `official-${location}-${preset}`.slice(0, 180);
}

export function officialShopLocationGroup(location) {
  const parts = String(location ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || String(location ?? "").trim() || "Symbaroum";
}

export function normalizeShopStockPresetId(value, storeId = "") {
  const requested = String(value ?? "").trim();
  if (OFFICIAL_SHOP_PRESET_BY_ID.has(requested)) return requested;
  const id = String(storeId ?? "").trim();
  return OFFICIAL_SHOP_PRESETS.find((preset) => id.endsWith(`-${preset.id}`))?.id ?? "";
}

function configuredShopDefinitions() {
  return configuredShopConfiguration().stores;
}

function configuredShopConfiguration() {
  try {
    return normalizeShopConfiguration(getSetting(SETTINGS.SHOP_DEFINITIONS));
  } catch (_error) {
    return normalizeShopConfiguration();
  }
}

function configuredShopStockRules() {
  try {
    return normalizeShopStockRules(getSetting(SETTINGS.SHOP_STOCK_RULES));
  } catch (_error) {
    return normalizeShopStockRules();
  }
}

function configuredServiceDefinitions() {
  try {
    return normalizeCustomServices(getSetting(SETTINGS.SERVICE_DEFINITIONS));
  } catch (_error) {
    return normalizeCustomServices();
  }
}

function configuredFolderAccess() {
  try {
    return normalizeFolderAccess(getSetting(SETTINGS.COMPENDIUM_BROWSER_FOLDER_ACCESS));
  } catch (_error) {
    return normalizeFolderAccess();
  }
}

function configuredOriginAccess() {
  try {
    return normalizeOriginAccess(getSetting(SETTINGS.COMPENDIUM_BROWSER_ORIGIN_ACCESS));
  } catch (_error) {
    return normalizeOriginAccess();
  }
}

export function normalizeOriginAccess(value = null) {
  const valid = new Set([...CONTENT_ORIGINS.map(({ id }) => id), UNKNOWN_CONTENT_ORIGIN]);
  return {
    configured: value?.configured === true,
    originIds: [...new Set(Array.isArray(value?.originIds)
      ? value.originIds.filter((id) => typeof id === "string" && valid.has(id))
      : [])]
  };
}

export function canBrowseContentOrigin(
  origin,
  user = game.user,
  access = configuredOriginAccess()
) {
  if (user?.isGM) return true;
  const normalized = normalizeOriginAccess(access);
  return !normalized.configured || normalized.originIds.includes(origin || UNKNOWN_CONTENT_ORIGIN);
}

export function filterEntriesByPlayerOriginAccess(
  entries,
  user = game.user,
  access = configuredOriginAccess()
) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => canBrowseContentOrigin(entry?.origin, user, access));
}

export function normalizeFolderAccess(value = null) {
  return {
    configured: value?.configured === true,
    folderIds: [...new Set(Array.isArray(value?.folderIds)
      ? value.folderIds.filter((id) => typeof id === "string" && id)
      : [])]
  };
}

export function canBrowseWorldDocument(
  document,
  user = game.user,
  access = configuredFolderAccess(),
  folders = game.folders
) {
  if (!document || !user) return false;
  if (user.isGM) return true;
  const normalized = normalizeFolderAccess(access);
  if (normalized.configured) return canBrowseConfiguredFolder(document, normalized, folders);
  return canObserve(document, user);
}

export function canBrowseConfiguredFolder(
  document,
  access = configuredFolderAccess(),
  folders = game.folders
) {
  const normalized = normalizeFolderAccess(access);
  if (!normalized.configured) return false;
  const selected = new Set(normalized.folderIds);
  const documentName = document.documentName ?? document.constructor?.documentName;
  let folderId = folderDocumentId(document.folder);
  if (!folderId) return selected.has(`root:${documentName}`);

  const visited = new Set();
  while (folderId && !visited.has(folderId)) {
    if (selected.has(folderId)) return true;
    visited.add(folderId);
    folderId = folderDocumentId(collectionGet(folders, folderId)?.folder
      ?? collectionGet(folders, folderId)?.parent);
  }
  return false;
}

export function browserObserverOwnershipUpdate(document, allowed, observerLevel = OBSERVER) {
  if (!document?.id) return null;
  const moduleFlags = document.flags?.[MODULE_ID] ?? {};
  const managed = Object.hasOwn(moduleFlags, BROWSER_OWNERSHIP_FLAG);
  const currentDefault = Number(document.ownership?.default ?? 0);
  const previousDefault = managed
    ? Number(moduleFlags[BROWSER_OWNERSHIP_FLAG] ?? 0)
    : currentDefault;
  const clearManagedFlag = `flags.${MODULE_ID}.-=${BROWSER_OWNERSHIP_FLAG}`;

  if (allowed) {
    if (currentDefault >= observerLevel) {
      return managed && currentDefault > observerLevel
        ? { action: "released", update: { _id: document.id, [clearManagedFlag]: null } }
        : null;
    }
    return {
      action: "granted",
      update: {
        _id: document.id,
        "ownership.default": observerLevel,
        ...(!managed ? {
          [`flags.${MODULE_ID}.${BROWSER_OWNERSHIP_FLAG}`]: currentDefault
        } : {})
      }
    };
  }

  if (!managed) return null;
  if (currentDefault !== observerLevel) {
    return { action: "released", update: { _id: document.id, [clearManagedFlag]: null } };
  }
  return {
    action: "restored",
    update: {
      _id: document.id,
      "ownership.default": Number.isFinite(previousDefault) ? previousDefault : 0,
      [clearManagedFlag]: null
    }
  };
}

export async function synchronizeBrowserObserverAccess(
  access,
  originAccess = configuredOriginAccess(),
  originIndex = staticContentOriginIndex()
) {
  if (!game.user?.isGM) throw new Error("Only a Game Master can configure browser ownership.");
  const normalized = normalizeFolderAccess(access);
  const summary = { granted: 0, restored: 0 };
  synchronizingBrowserOwnership = true;
  try {
    for (const [documentName, collection] of [["Item", game.items], ["Actor", game.actors]]) {
      const planned = collectionValues(collection)
        .map((document) => browserObserverOwnershipUpdate(
          document,
          canBrowseConfiguredFolder(document, normalized)
            && canBrowseContentOrigin(resolveContentOrigin(document, {
              index: originIndex,
              sourceId: `world:${documentName}`
            }), { isGM: false }, originAccess)
        ))
        .filter(Boolean);
      summary.granted += planned.filter(({ action }) => action === "granted").length;
      summary.restored += planned.filter(({ action }) => action === "restored").length;
      await applyBrowserOwnershipUpdates(documentName, collection, planned.map(({ update }) => update));
    }
  } finally {
    synchronizingBrowserOwnership = false;
  }
  return summary;
}

async function applyBrowserOwnershipUpdates(documentName, collection, updates) {
  if (!updates.length) return;
  const documentClass = collection?.documentClass
    ?? globalThis.CONFIG?.[documentName]?.documentClass
    ?? collectionValues(collection)[0]?.constructor;
  if (typeof documentClass?.updateDocuments === "function") {
    for (let index = 0; index < updates.length; index += 100) {
      await documentClass.updateDocuments(updates.slice(index, index + 100));
    }
    return;
  }
  for (const update of updates) {
    const document = collectionGet(collection, update._id);
    if (!document?.update) throw new Error(`Could not update ${documentName} ${update._id}.`);
    const { _id: _discarded, ...changes } = update;
    await document.update(changes);
  }
}

function sourceDescriptors() {
  const sources = [];
  if (game.items) sources.push({
    id: "world:Item",
    kind: "world",
    documentClass: "Item",
    label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.WorldItems")
  });
  if (game.actors) sources.push({
    id: "world:Actor",
    kind: "world",
    documentClass: "Actor",
    label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.WorldActors")
  });
  return sources.sort((left, right) => left.label.localeCompare(right.label, game.i18n.lang, { sensitivity: "base" }));
}

function browserFolderGroups() {
  return [
    browserFolderGroup("Item", "fa-suitcase", "SYMBAROUMHUD.CompendiumBrowser.WorldItems", game.items),
    browserFolderGroup("Actor", "fa-users", "SYMBAROUMHUD.CompendiumBrowser.WorldActors", game.actors)
  ];
}

function browserFolderGroup(documentName, icon, label, collection) {
  const folders = collectionValues(game.folders)
    .filter((folder) => folder.type === documentName);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map();
  for (const folder of folders) {
    const parentId = folderDocumentId(folder.folder ?? folder.parent);
    const effectiveParent = parentId && folderById.has(parentId) ? parentId : null;
    if (!children.has(effectiveParent)) children.set(effectiveParent, []);
    children.get(effectiveParent).push(folder);
  }
  for (const values of children.values()) values.sort(compareFolders);

  const directCounts = new Map();
  let rootCount = 0;
  for (const document of collectionValues(collection)) {
    const folderId = folderDocumentId(document.folder);
    if (folderId) directCounts.set(folderId, (directCounts.get(folderId) ?? 0) + 1);
    else rootCount += 1;
  }

  const rows = [];
  if (rootCount) rows.push({
    id: `root:${documentName}`,
    name: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.RootDocuments"),
    depth: 0,
    count: rootCount,
    root: true,
    parentId: null,
    hasChildren: false
  });
  const append = (parentId, depth) => {
    for (const folder of children.get(parentId) ?? []) {
      rows.push({
        id: folder.id,
        name: folder.name,
        depth,
        count: countFolderDocuments(folder.id, children, directCounts),
        root: false,
        parentId,
        hasChildren: Boolean(children.get(folder.id)?.length)
      });
      append(folder.id, depth + 1);
    }
  };
  append(null, 0);

  return {
    documentName,
    icon,
    label: game.i18n.localize(label),
    rows
  };
}

function bindBrowserFolderTree(element) {
  bindCollapsibleTree(element, {
    rowSelector: "[data-folder-tree-row]",
    toggleSelector: "[data-folder-tree-toggle]",
    idDataset: "folderId",
    parentDataset: "folderParentId"
  });
}

function bindShopPricingTree(element) {
  bindCollapsibleTree(element, {
    rowSelector: "[data-pricing-category-row]",
    toggleSelector: "[data-pricing-category-toggle]",
    idDataset: "pricingCategoryId",
    parentDataset: "pricingParentId"
  });
}

function bindCollapsibleTree(element, { rowSelector, toggleSelector, idDataset, parentDataset }) {
  const root = element?.querySelector ? element : element?.[0];
  if (!root?.querySelectorAll) return;
  const rows = [...root.querySelectorAll(rowSelector)];
  const childrenOf = (parentId) => rows.filter((row) => row.dataset[parentDataset] === parentId);
  const collapseBranch = (row) => {
    for (const child of childrenOf(row.dataset[idDataset])) {
      child.hidden = true;
      collapseBranch(child);
    }
    const toggle = row.querySelector(toggleSelector);
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.querySelector("i")?.classList.remove("fa-chevron-down");
    toggle?.querySelector("i")?.classList.add("fa-chevron-right");
  };
  for (const toggle of root.querySelectorAll(toggleSelector)) {
    toggle.addEventListener("click", () => {
      const row = toggle.closest(rowSelector);
      if (!row) return;
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      if (expanded) collapseBranch(row);
      else {
        for (const child of childrenOf(row.dataset[idDataset])) child.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
        toggle.querySelector("i")?.classList.remove("fa-chevron-right");
        toggle.querySelector("i")?.classList.add("fa-chevron-down");
      }
    });
  }
}

function worldEntries(source, originIndex) {
  const collection = source.documentClass === "Item" ? game.items : game.actors;
  return collectionValues(collection)
    .filter((document) => canBrowseWorldDocument(document))
    .map((document) => browserEntry(document, source, originIndex))
    .filter(Boolean);
}

function browserEntry(document, source, originIndex) {
  const type = document.type;
  if (source.documentClass === "Item" && !SUPPORTED_ITEM_TYPES.has(type)) return null;
  if (source.documentClass === "Actor" && type !== "monster") return null;
  const id = document.id ?? document._id;
  const uuid = document.uuid ?? (source.kind === "compendium"
    ? `Compendium.${source.id}.${id}`
    : `${source.documentClass}.${id}`);
  if (!uuid || !document.name) return null;
  const taxonomy = source.documentClass === "Item" ? resolveItemTaxonomy(document) : null;
  return {
    uuid,
    documentId: id,
    name: document.name,
    img: document.img || (source.documentClass === "Actor" ? "icons/svg/mystery-man.svg" : "icons/svg/item-bag.svg"),
    type,
    documentClass: source.documentClass,
    reference: document.system?.reference ?? "",
    cost: document.system?.cost ?? "",
    taxonomyPrimary: taxonomy?.primary ?? null,
    taxonomyTags: taxonomy?.tags ?? [],
    origin: resolveContentOrigin({
      id,
      type,
      documentName: source.documentClass,
      folder: document.folder,
      flags: document.flags,
      _stats: document._stats
    }, {
      index: originIndex,
      sourceId: source.id
    }),
    sourceId: source.id,
    sourceLabel: source.label
  };
}

export function dedupeBrowserEntries(entries) {
  const byDocument = new Map();
  for (const entry of entries) {
    const key = entry.documentId ? `${entry.documentClass}:${entry.documentId}` : entry.uuid;
    const previous = byDocument.get(key);
    if (!previous || sourcePriority(entry) < sourcePriority(previous)) byDocument.set(key, entry);
  }
  return [...byDocument.values()];
}

function sourcePriority(entry) {
  if (entry.sourceId?.startsWith("world:")) return 0;
  return 1;
}

function canObserve(document, user = game.user) {
  if (user?.isGM) return true;
  if (typeof document.testUserPermission === "function") {
    return document.testUserPermission(user, OBSERVER);
  }
  return document.visible !== false;
}

function folderDocumentId(folder) {
  if (!folder) return null;
  return typeof folder === "string" ? folder : (folder.id ?? folder._id ?? null);
}

function collectionGet(collection, id) {
  if (!collection || !id) return null;
  if (typeof collection.get === "function") return collection.get(id);
  return collectionValues(collection).find((entry) => (entry.id ?? entry._id) === id) ?? null;
}

function compareFolders(left, right) {
  const sortDifference = Number(left.sort ?? 0) - Number(right.sort ?? 0);
  return sortDifference || left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" });
}

function countFolderDocuments(folderId, children, directCounts) {
  let count = directCounts.get(folderId) ?? 0;
  for (const child of children.get(folderId) ?? []) {
    count += countFolderDocuments(child.id, children, directCounts);
  }
  return count;
}

function countBy(entries, field) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry[field], (counts.get(entry[field]) ?? 0) + 1);
  return counts;
}

function countTaxonomyTags(entries) {
  const counts = new Map();
  for (const entry of entries) {
    for (const category of new Set(entry.taxonomyTags ?? [])) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return counts;
}

function browserEntryCategoryLabel(entry) {
  const primary = entry?.taxonomyPrimary;
  const itemCategory = ITEM_TAXONOMY_DEFINITIONS.find(({ id }) => id === primary);
  if (itemCategory) return game.i18n.localize(itemCategory.label);
  const serviceCategory = SERVICE_CATEGORIES.find(({ id }) => `service-${id}` === primary);
  if (serviceCategory) return game.i18n.localize(serviceCategory.label);
  return game.i18n.localize(CATEGORY_LABELS[entry?.type] ?? entry?.type ?? "");
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(game.i18n.lang)
    .trim();
}

function collectionValues(collection) {
  if (!collection) return [];
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Array.from(collection);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderShopPurchaseChatMessage({
  title = "",
  buyerLabel = "",
  storeLabel = "",
  totalLabel = "",
  lines = []
} = {}) {
  const entries = Array.from(lines).map((line) => {
    const uuid = escapeHtml(line?.uuid);
    const name = escapeHtml(line?.name);
    const item = uuid
      ? `<a class="content-link" data-link data-uuid="${uuid}"><i class="fa-solid fa-suitcase"></i>${name}</a>`
      : `<strong><i class="fa-solid ${line?.service ? "fa-bell-concierge" : "fa-suitcase"}"></i>${name}</strong>`;
    return `<li>
      <img src="${escapeHtml(line?.img || "icons/svg/item-bag.svg")}" alt="">
      <span>${item}<small>${escapeHtml(line?.subtotalLabel)}</small></span>
      <b>×${Math.max(1, Number.parseInt(line?.quantity, 10) || 1)}</b>
    </li>`;
  }).join("");
  return `<section class="symbaroum-hud-shop-chat-card">
    <header><i class="fa-solid fa-basket-shopping"></i><strong>${escapeHtml(title)}</strong></header>
    <p>${escapeHtml(buyerLabel)}</p>
    <small>${escapeHtml(storeLabel)}</small>
    <ul>${entries}</ul>
    <footer><i class="fa-solid fa-coins"></i><strong>${escapeHtml(totalLabel)}</strong></footer>
  </section>`;
}

function localizedServiceUnit(unit) {
  const key = String(unit ?? "purchase");
  const suffix = key.charAt(0).toUpperCase() + key.slice(1);
  return game.i18n.localize(`SYMBAROUMHUD.Services.Units.${suffix}`);
}

function localizedServiceFulfillment(fulfillment) {
  const key = String(fulfillment ?? "instant");
  const suffix = key.charAt(0).toUpperCase() + key.slice(1);
  return game.i18n.localize(`SYMBAROUMHUD.Services.Fulfillment.${suffix}`);
}

function shopMoneyLabel(value) {
  const money = moneyFromOrtegs(value);
  const parts = [];
  if (money.thaler) parts.push(`${money.thaler} ${game.i18n.localize("MONEY.THALER")}`);
  if (money.shilling) parts.push(`${money.shilling} ${game.i18n.localize("MONEY.SHILLING")}`);
  if (money.orteg || !parts.length) parts.push(`${money.orteg} ${game.i18n.localize("MONEY.ORTEG")}`);
  return parts.join(" · ");
}

export function promoteBrowserDocumentSheet(sheet) {
  const element = sheet?.element?.[0] ?? sheet?.element;
  if (element?.classList) {
    element.classList.add("symbaroum-hud-browser-document-preview");
    sheet.bringToFront?.();
    return true;
  }
  return false;
}

export function keepBrowserDocumentSheetOnTop(sheet) {
  if (!sheet || (typeof sheet !== "object" && typeof sheet !== "function")) return false;
  const previous = DOCUMENT_PROMOTION_JOBS.get(sheet);
  previous?.timeouts?.forEach((timeout) => globalThis.clearTimeout?.(timeout));

  const token = {};
  const timeouts = DOCUMENT_PROMOTION_DELAYS.map((delay, index) => globalThis.setTimeout(() => {
    const active = DOCUMENT_PROMOTION_JOBS.get(sheet);
    if (active?.token !== token) return;
    promoteBrowserDocumentSheet(sheet);
    if (index === DOCUMENT_PROMOTION_DELAYS.length - 1) DOCUMENT_PROMOTION_JOBS.delete(sheet);
  }, delay));
  DOCUMENT_PROMOTION_JOBS.set(sheet, { token, timeouts });
  return true;
}
