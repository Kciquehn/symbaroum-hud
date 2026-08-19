import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { getSetting } from "../settings.mjs";
import { ActorService } from "../services/actor-service.mjs";
import {
  isPurchasableShopEntry,
  parseShopPrice,
  selectShopPrice,
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
const OWNER = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
const RESULT_BATCH_SIZE = 75;
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

const CATEGORY_BY_ID = new Map(BROWSER_CATEGORIES.map((entry) => [entry.id, entry]));
const SHOP_CATEGORY_IDS = new Set(["all", "weapon", "armor", "equipment"]);
export const SHOP_BROWSER_CATEGORIES = Object.freeze(
  BROWSER_CATEGORIES.filter((entry) => SHOP_CATEGORY_IDS.has(entry.id))
);

const TYPE_LABELS = Object.freeze({
  ability: "SYMBAROUMHUD.CompendiumBrowser.Types.Ability",
  armor: "SYMBAROUMHUD.CompendiumBrowser.Types.Armor",
  artifact: "SYMBAROUMHUD.CompendiumBrowser.Types.Artifact",
  boon: "SYMBAROUMHUD.CompendiumBrowser.Types.Boon",
  burden: "SYMBAROUMHUD.CompendiumBrowser.Types.Burden",
  equipment: "SYMBAROUMHUD.CompendiumBrowser.Types.Equipment",
  mysticalPower: "SYMBAROUMHUD.CompendiumBrowser.Types.MysticalPower",
  ritual: "SYMBAROUMHUD.CompendiumBrowser.Types.Ritual",
  trait: "SYMBAROUMHUD.CompendiumBrowser.Types.Trait",
  weapon: "SYMBAROUMHUD.CompendiumBrowser.Types.Weapon",
  monster: "SYMBAROUMHUD.CompendiumBrowser.Types.Monster"
});

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

  #actor = null;
  #category = "all";
  #excludedOrigins = new Set();
  #excludedSources = new Set();
  #filtersOpen = false;
  #listenerController = null;
  #lockedCategory = null;
  #mode = "browser";
  #onSelect = null;
  #query = "";
  #resultLimit = RESULT_BATCH_SIZE;
  #selected = new Set();
  #selection = null;
  #selectionResolved = false;

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
    this.#lockedCategory = this.#validLockedCategory(lockedCategory);
    this.#category = this.#validCategory(category) ? category : (this.#lockedCategory ?? "all");
    this.#selection = selection;
    this.#onSelect = onSelect;
  }

  static open({ actor = null, category = "all", lockedCategory = null, mode = "browser" } = {}) {
    if (!this.#instance) this.#instance = new this({ actor, category, lockedCategory, mode });
    else {
      this.#instance.#actor = actor;
      this.#instance.#mode = mode === "shop" ? "shop" : "browser";
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
    if (this.#instance?.rendered) void this.#instance.render({ force: true });
  }

  async _prepareContext() {
    const originIndex = await this.#contentOriginIndex({ waitForFull: false });
    const descriptors = sourceDescriptors();
    const enabled = configuredSources();
    const activeSources = descriptors.filter((source) => {
      if (enabled[source.id] === false) return false;
      return this.#mode !== "shop" || source.documentClass === "Item";
    });
    const entries = (await Promise.all(
      activeSources.map((source) => this.#loadSource(source, originIndex))
    )).flat()
      .map((entry) => ({
        ...entry,
        originLabel: game.i18n.localize(contentOriginDefinition(entry.origin).label)
      }));
    const shopActive = this.#mode === "shop";
    const browsableEntries = shopActive ? entries.filter(isPurchasableShopEntry) : entries;
    const categoryEntries = dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      category: this.#category,
      query: this.#query,
      excludedOrigins: this.#excludedOrigins,
      excludedSources: this.#excludedSources
    }));
    const availableBeforeSourceFilter = dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      category: this.#category,
      query: this.#query,
      excludedOrigins: this.#excludedOrigins
    }));
    const availableBeforeOriginFilter = dedupeBrowserEntries(filterBrowserEntries(browsableEntries, {
      category: this.#category,
      query: this.#query,
      excludedSources: this.#excludedSources
    }));
    const sourceCounts = countBy(availableBeforeSourceFilter, "sourceId");
    const originCounts = countBy(availableBeforeOriginFilter, "origin");
    const canAdd = Boolean(this.#actor && ActorService.canUpdate(this.#actor));
    const selectionSummary = this.#selectionSummary();
    const balance = ShopService.balance(this.#actor);
    const categories = (shopActive ? SHOP_BROWSER_CATEGORIES : BROWSER_CATEGORIES)
      .filter((entry) => !this.#lockedCategory || entry.id === this.#lockedCategory);

    return {
      actor: this.#actor ? { id: this.#actor.id, name: this.#actor.name } : null,
      canAdd,
      categories: categories.map((entry) => ({
        ...entry,
        label: game.i18n.localize(entry.label),
        active: entry.id === this.#category
      })),
      entries: categoryEntries.slice(0, this.#resultLimit).map((entry) => {
        const price = parseShopPrice(entry.cost);
        return {
          ...entry,
          selected: this.#selected.has(entry.uuid),
          subtitle: game.i18n.localize(TYPE_LABELS[entry.type] ?? entry.type),
          canAdd: !shopActive && canAdd && entry.documentClass === "Item",
          canBuy: shopActive && canAdd && Boolean(price) && balance.total >= (price?.ortegs ?? Infinity),
          priceLabel: price?.raw ?? ""
        };
      }),
      hasEntries: categoryEntries.length > 0,
      hasMore: categoryEntries.length > this.#resultLimit,
      renderedCount: Math.min(this.#resultLimit, categoryEntries.length),
      filters: {
        open: this.#filtersOpen
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
      shop: {
        active: shopActive,
        balance,
        actorName: this.#actor?.name ?? "",
        weaponOnly: shopActive && this.#lockedCategory === "weapon"
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
      const loading = Promise.resolve(worldEntries(source, originIndex));
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
    let searchTimeout = null;

    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target || !root.contains(target)) {
        if (this.#filtersOpen && !event.target.closest("[data-browser-filter-panel]")) {
          this.#setFiltersOpen(root, false);
        }
        return;
      }
      event.preventDefault();
      void this.#onAction(target);
    }, { signal });

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !this.#filtersOpen) return;
      const toggle = root.querySelector("[data-action='toggle-filters']");
      this.#setFiltersOpen(root, false);
      toggle?.focus?.();
    }, { signal });

    root.addEventListener("input", (event) => {
      if (!event.target.matches("[data-browser-search]")) return;
      this.#query = event.target.value;
      this.#resultLimit = RESULT_BATCH_SIZE;
      globalThis.clearTimeout(searchTimeout);
      searchTimeout = globalThis.setTimeout(() => void this.render({ force: true }), 180);
    }, { signal });

    root.addEventListener("change", (event) => {
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
      const selected = event.target.closest("[data-browser-select]");
      if (!selected) return;
      if (selected.checked) this.#selected.add(selected.value);
      else this.#selected.delete(selected.value);
      this.#enforceMaximum(selected.value);
      void this.render({ force: true });
    }, { signal });

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

  async #onAction(target) {
    const action = target.dataset.action;
    if (action === "toggle-filters") {
      return this.#setFiltersOpen(target.closest(".symbaroum-hud-browser-shell"), !this.#filtersOpen);
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
    if (action === "load-more") {
      this.#resultLimit += RESULT_BATCH_SIZE;
      return this.render({ force: true });
    }
    if (action === "configure-sources") return this.#configureSources();
    if (action === "open-document") return this.#openDocument(target.dataset.uuid);
    if (action === "add-document") return this.#addDocument(target.dataset.uuid);
    if (action === "buy-document") return this.#buyDocument(target.dataset.uuid);
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
    const document = await fromUuid(uuid);
    if (!document) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Unavailable"));
      return;
    }
    document.sheet?.render(true);
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

    const document = await fromUuid(uuid);
    const price = parseShopPrice(document?.system?.cost);
    if (!document || document.documentName !== "Item" || !price) {
      return this.#notifyPurchaseFailure(document ? "invalidPrice" : "unavailable");
    }

    const selectedPrice = await this.#confirmPurchase(document, price);
    if (!selectedPrice) return null;

    try {
      const result = await ShopService.purchase(this.#actor, document, {
        amount: selectedPrice.amount
      });
      if (!result.ok) return this.#notifyPurchaseFailure(result.reason);
      ui.notifications?.info(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.Bought", {
        item: document.name,
        price: result.price.raw,
        actor: this.#actor.name
      }));
      return this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Shop purchase failed.`, error);
      return this.#notifyPurchaseFailure("failed");
    }
  }

  async #confirmPurchase(document, price) {
    const balance = ShopService.balance(this.#actor);
    const unitValue = price.ortegs / price.amount;
    const affordableMaximum = Math.min(
      price.maximumAmount,
      Math.floor(balance.total / unitValue)
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
      <p>${escapeHtml(game.i18n.format("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfirmText", {
        item: document.name,
        price: price.raw
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
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.ConfirmTitle") },
      position: { width: 430 },
      content,
      buttons: [
        {
          action: "buy",
          icon: "fa-solid fa-cart-shopping",
          label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Buy"),
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

  #notifyPurchaseFailure(reason) {
    const keys = {
      permission: "SYMBAROUMHUD.CompendiumBrowser.Shop.NoPermission",
      unavailable: "SYMBAROUMHUD.CompendiumBrowser.Shop.Unavailable",
      invalidPrice: "SYMBAROUMHUD.CompendiumBrowser.Shop.InvalidPrice",
      insufficient: "SYMBAROUMHUD.CompendiumBrowser.Shop.Insufficient",
      failed: "SYMBAROUMHUD.CompendiumBrowser.Shop.Failed"
    };
    ui.notifications?.warn(game.i18n.localize(keys[reason] ?? keys.failed));
    return null;
  }

  async #configureSources() {
    const sources = sourceDescriptors();
    const current = configuredSources();
    const content = `<form class="symbaroum-hud-browser-source-config">
      <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.SourceConfigHint"))}</p>
      <div>${sources.map((source) => `<label>
        <input type="checkbox" name="source" value="${escapeHtml(source.id)}" ${current[source.id] === false ? "" : "checked"}>
        <span>${escapeHtml(source.label)}</span>
        <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.WorldSource"))}</small>
      </label>`).join("")}</div>
    </form>`;
    const result = await DialogV2.wait({
      classes: ["symbaroum-hud-browser-source-dialog"],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.ConfigureSources") },
      position: { width: 520, height: 580 },
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
            return Object.fromEntries(sources.map((source) => [source.id, checked.has(source.id)]));
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
    if (!result) return;
    await game.settings.set(MODULE_ID, SETTINGS.COMPENDIUM_BROWSER_SOURCES, result);
    this.#excludedSources.clear();
    SymbaroumCompendiumBrowser.invalidate();
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
      && (!this.#lockedCategory || category === this.#lockedCategory);
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

export function registerCompendiumBrowserHooks() {
  const invalidateWorld = (document) => {
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
  Hooks.on("renderItemDirectory", (_application, element) => {
    injectItemDirectoryBrowserButton(element);
    hideObserverOnlyDirectoryEntries(element, game.items);
  });
  Hooks.on("renderActorDirectory", (_application, element) => {
    hideObserverOnlyDirectoryEntries(element, game.actors);
  });
}

export function shouldHideBrowserDocumentFromDirectory(document, user = game.user) {
  if (!document || !user || user.isGM) return false;
  if (typeof document.testUserPermission === "function") {
    return document.testUserPermission(user, OBSERVER)
      && !document.testUserPermission(user, OWNER);
  }
  const ownership = document.ownership ?? {};
  const level = Number(ownership[user.id] ?? ownership.default ?? 0);
  return level >= OBSERVER && level < OWNER;
}

function hideObserverOnlyDirectoryEntries(element, collection) {
  if (game.user?.isGM) return;
  const root = element instanceof globalThis.HTMLElement ? element : element?.[0];
  if (!root?.querySelectorAll) return;

  const candidates = root.querySelectorAll(
    ".directory-item.document, [data-document-id], [data-entry-id]"
  );
  for (const entry of candidates) {
    const id = entry.dataset.documentId ?? entry.dataset.entryId ?? entry.dataset.itemId;
    const document = id ? collection?.get?.(id) : null;
    if (shouldHideBrowserDocumentFromDirectory(document)) entry.remove();
  }

  const folders = [...root.querySelectorAll(".directory-item.folder")].reverse();
  for (const folder of folders) {
    if (!folder.querySelector(".directory-item.document, [data-document-id]")) folder.remove();
  }
}

function injectItemDirectoryBrowserButton(element) {
  const root = element instanceof globalThis.HTMLElement ? element : element?.[0];
  if (!root?.querySelector) return;
  const headerActions = root.querySelector(".directory-header .header-actions");
  if (!headerActions || root.querySelector("[data-symbaroum-hud-browser-directory]")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "symbaroum-hud-directory-browser-action";
  wrapper.dataset.symbaroumHudBrowserDirectory = "true";

  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i><span></span>';
  button.querySelector("span").textContent = game.i18n.localize(
    "SYMBAROUMHUD.CompendiumBrowser.OpenButton"
  );
  button.setAttribute("aria-label", game.i18n.localize(
    "SYMBAROUMHUD.CompendiumBrowser.OpenButton"
  ));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    SymbaroumCompendiumBrowser.open({ actor: null });
  });

  wrapper.append(button);
  headerActions.after(wrapper);
}

export function filterBrowserEntries(entries, {
  category = "all",
  query = "",
  excludedOrigins = new Set(),
  excludedSources = new Set()
} = {}) {
  const definition = CATEGORY_BY_ID.get(category) ?? CATEGORY_BY_ID.get("all");
  const search = normalizeSearch(query);
  return entries.filter((entry) => {
    if (excludedOrigins.has(entry.origin)) return false;
    if (excludedSources.has(entry.sourceId)) return false;
    if (definition.documentClass && entry.documentClass !== definition.documentClass) return false;
    if (definition.types?.length && !definition.types.includes(entry.type)) return false;
    if (search && !normalizeSearch(`${entry.name} ${entry.reference ?? ""} ${entry.cost ?? ""} ${entry.originLabel ?? ""} ${entry.sourceLabel}`).includes(search)) return false;
    return true;
  }).sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang, { sensitivity: "base" }));
}

function category(id, icon, label, documentClass = null, types = []) {
  return Object.freeze({ id, icon, label, documentClass, types: Object.freeze(types) });
}

function configuredSources() {
  try {
    return getSetting(SETTINGS.COMPENDIUM_BROWSER_SOURCES) ?? {};
  } catch (_error) {
    return {};
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

function worldEntries(source, originIndex) {
  const collection = source.documentClass === "Item" ? game.items : game.actors;
  return collectionValues(collection)
    .filter((document) => canObserve(document))
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
  return {
    uuid,
    documentId: id,
    name: document.name,
    img: document.img || (source.documentClass === "Actor" ? "icons/svg/mystery-man.svg" : "icons/svg/item-bag.svg"),
    type,
    documentClass: source.documentClass,
    reference: document.system?.reference ?? "",
    cost: document.system?.cost ?? "",
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

function canObserve(document) {
  if (game.user?.isGM) return true;
  if (typeof document.testUserPermission === "function") {
    return document.testUserPermission(game.user, OBSERVER);
  }
  return document.visible !== false;
}

function countBy(entries, field) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry[field], (counts.get(entry[field]) ?? 0) + 1);
  return counts;
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
