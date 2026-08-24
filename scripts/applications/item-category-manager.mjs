import { MODULE_ID, SETTINGS } from "../constants.mjs";
import {
  ITEM_TAXONOMY_CATEGORY_BY_ID,
  ITEM_TAXONOMY_DEFINITIONS
} from "../data/item-taxonomy-categories.mjs";
import {
  normalizeCategoryOverrides,
  resolveItemTaxonomy,
  setItemTaxonomyCategories
} from "../services/item-taxonomy-service.mjs";
import {
  normalizeCustomServices,
  removeCustomService,
  serviceCatalog,
  upsertCustomService
} from "../services/service-contract-service.mjs";

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2 ?? class {};
const CATEGORY_IDS = new Set(ITEM_TAXONOMY_DEFINITIONS.map(({ id }) => id));

export class ItemCategoryManagerApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "symbaroum-hud-item-category-manager",
    classes: ["symbaroum-hud-item-category-manager-application"],
    window: {
      title: "SYMBAROUMHUD.ItemCategoryManager.Title",
      icon: "fa-solid fa-tags",
      minimizable: true,
      resizable: true
    },
    position: { width: 980, height: 760 }
  };

  #listenerController = null;

  async _prepareContext() {
    const worldItems = collectionValues(globalThis.game?.items)
      .filter((item) => item?.documentName === "Item")
      .map((item) => itemCategoryRow(item));
    const serviceAssets = serviceAssetCategoryRows(configuredServiceDefinitions());
    const items = [...worldItems, ...serviceAssets]
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang, {
        sensitivity: "base"
      }));
    const typeCounts = new Map();
    for (const { type, typeLabel } of items) {
      const current = typeCounts.get(type) ?? { id: type, label: typeLabel, count: 0 };
      current.count += 1;
      typeCounts.set(type, current);
    }
    const types = [...typeCounts.values()]
      .sort((left, right) => left.label.localeCompare(right.label, game.i18n.lang));
    return {
      items,
      types,
      count: items.length,
      manualCount: items.filter(({ manual }) => manual).length,
      automaticCount: items.filter(({ manual }) => !manual).length
    };
  }

  async _renderHTML(context) {
    return foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/item-category-manager.hbs`,
      context
    );
  }

  _replaceHTML(result, content) {
    this.#listenerController?.abort();
    content.innerHTML = result;
    this.#activateListeners(content);
  }

  _onClose(options) {
    this.#listenerController?.abort();
    this.#listenerController = null;
    return super._onClose?.(options);
  }

  #activateListeners(root) {
    this.#listenerController = new AbortController();
    const signal = this.#listenerController.signal;
    const query = root.querySelector("[data-item-category-search]");
    const type = root.querySelector("[data-item-category-type]");
    const mode = root.querySelector("[data-item-category-mode]");
    const refresh = () => filterItemCategoryRows(root, {
      query: query?.value,
      type: type?.value,
      mode: mode?.value
    });
    query?.addEventListener("input", refresh, { signal });
    type?.addEventListener("change", refresh, { signal });
    mode?.addEventListener("change", refresh, { signal });
    root.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      event.preventDefault();
      if (action.dataset.action === "open-item") {
        const item = worldItem(action.dataset.entryId);
        if (!item) return;
        item.sheet?.render?.(true);
        return;
      }
      if (action.dataset.action !== "edit-categories") return;
      const changed = action.dataset.entryKind === "service-asset"
        ? await openServiceAssetTaxonomyEditor(action.dataset.entryId)
        : await openItemTaxonomyEditor(worldItem(action.dataset.entryId));
      if (changed) await this.render({ force: true });
    }, { signal });
    refresh();
  }
}

export async function openItemTaxonomyEditor(item) {
  if (!globalThis.game?.user?.isGM || !item || item.documentName !== "Item") return false;
  const taxonomy = resolveItemTaxonomy(item);
  const override = normalizeCategoryOverrides(item?.flags?.[MODULE_ID]?.itemTaxonomyOverride);
  const selected = new Set(override?.mode === "replace"
    ? override.categories
    : (taxonomy.tags ?? []).filter((category) => CATEGORY_IDS.has(category)));
  const result = await waitForCategoryEditor({
    name: item.name,
    img: item.img || "icons/svg/item-bag.svg",
    selected
  });
  if (!result) return false;
  try {
    await setItemTaxonomyCategories(item, result.action === "automatic" ? null : result.categories);
    globalThis.ui?.notifications?.info?.(game.i18n.format(
      "SYMBAROUMHUD.ItemCategoryManager.Saved",
      { name: item.name }
    ));
    return true;
  } catch (error) {
    globalThis.ui?.notifications?.error?.(game.i18n.localize("SYMBAROUMHUD.ItemTaxonomy.SaveFailed"));
    console.error(`${MODULE_ID} | Failed to update Item Categories.`, error);
    return false;
  }
}

/**
 * Opens the same multi-Category editor for an official persistent virtual
 * asset. The official catalog is immutable: only a custom service override is
 * written to the world setting, and restoring removes that override entirely.
 */
export async function openServiceAssetTaxonomyEditor(serviceId) {
  if (!globalThis.game?.user?.isGM) return false;
  const official = officialServiceAsset(serviceId);
  if (!official) return false;
  const configured = configuredServiceDefinitions();
  const effective = serviceCatalog(configured).find(({ id }) => id === official.id) ?? official;
  const result = await waitForCategoryEditor({
    name: effective.name,
    img: effective.img || "icons/svg/coins.svg",
    selected: new Set(effective.itemCategories ?? [])
  });
  if (!result) return false;
  try {
    const next = result.action === "automatic"
      ? removeCustomService(configured, official.id)
      : upsertCustomService(configured, {
        ...effective,
        official: false,
        officialBase: true,
        itemCategories: result.categories
      });
    await globalThis.game.settings.set(MODULE_ID, SETTINGS.SERVICE_DEFINITIONS, next);
    globalThis.ui?.notifications?.info?.(game.i18n.format(
      "SYMBAROUMHUD.ItemCategoryManager.Saved",
      { name: effective.name }
    ));
    return true;
  } catch (error) {
    globalThis.ui?.notifications?.error?.(game.i18n.localize("SYMBAROUMHUD.ItemTaxonomy.SaveFailed"));
    console.error(`${MODULE_ID} | Failed to update persistent asset Categories.`, error);
    return false;
  }
}

export function filterItemCategoryRows(root, { query = "", type = "all", mode = "all" } = {}) {
  const search = normalizeSearch(query);
  let visible = 0;
  for (const row of root?.querySelectorAll?.("[data-item-category-entry]") ?? []) {
    const matches = (!search || row.dataset.search?.includes(search))
      && (type === "all" || row.dataset.type === type)
      && (mode === "all" || row.dataset.mode === mode);
    row.hidden = !matches;
    if (matches) visible += 1;
  }
  const count = root?.querySelector?.("[data-item-category-visible]");
  if (count) count.textContent = String(visible);
  const empty = root?.querySelector?.("[data-item-category-empty]");
  if (empty) empty.hidden = visible > 0;
  return visible;
}

function itemCategoryRow(item) {
  const taxonomy = resolveItemTaxonomy(item);
  const categories = (taxonomy.tags ?? [])
    .filter((category) => CATEGORY_IDS.has(category))
    .map((id) => ({ id, label: localizeCategory(id) }));
  return {
    id: item.id ?? item._id,
    uuid: item.uuid,
    kind: "world-item",
    canOpen: true,
    name: item.name,
    img: item.img || "icons/svg/item-bag.svg",
    type: item.type,
    typeLabel: localizeItemType(item.type),
    categories,
    categoryText: categories.map(({ label }) => label).join(", "),
    manual: taxonomy.overridden === true,
    mode: taxonomy.overridden === true ? "manual" : "automatic",
    searchText: normalizeSearch(`${item.name} ${item.type} ${categories.map(({ label }) => label).join(" ")}`)
  };
}

export function serviceAssetCategoryRows(custom = null) {
  const overrides = normalizeCustomServices(custom).services;
  const overrideIds = new Set(overrides.map(({ id }) => id));
  const effective = new Map(serviceCatalog(custom).map((service) => [service.id, service]));
  return serviceCatalog()
    .filter(({ offerKind, fulfillment }) => offerKind === "asset" && fulfillment === "permanent")
    .map((official) => serviceAssetCategoryRow(effective.get(official.id) ?? official, {
      official,
      manual: overrideIds.has(official.id)
    }));
}

function serviceAssetCategoryRow(service, { official, manual }) {
  const categories = (service.itemCategories ?? [])
    .filter((category) => CATEGORY_IDS.has(category))
    .map((id) => ({ id, label: localizeCategory(id) }));
  const type = serviceAssetType(official);
  const typeLabel = localizeServiceAssetType(type);
  return {
    id: service.id,
    uuid: `SymbaroumHudService.${service.id}`,
    kind: "service-asset",
    canOpen: false,
    name: service.name,
    img: service.img || "icons/svg/coins.svg",
    type,
    typeLabel,
    categories,
    categoryText: categories.map(({ label }) => label).join(", "),
    manual,
    mode: manual ? "manual" : "automatic",
    searchText: normalizeSearch(`${service.name} ${typeLabel} ${service.source ?? ""} ${categories.map(({ label }) => label).join(" ")}`)
  };
}

function serviceAssetType(service) {
  if (service.id?.startsWith("construction-") || service.id?.startsWith("thistle-property-")) {
    return "service-construction";
  }
  if (service.id?.startsWith("transport-")) return "service-transport";
  if (service.id?.startsWith("farm-")) return "service-farm-animal";
  return "service-asset";
}

function localizeServiceAssetType(type) {
  const suffix = {
    "service-construction": "Construction",
    "service-transport": "Transport",
    "service-farm-animal": "FarmAnimal",
    "service-asset": "PersistentAsset"
  }[type] ?? "PersistentAsset";
  const key = `SYMBAROUMHUD.ItemCategoryManager.AssetTypes.${suffix}`;
  const translated = game.i18n.localize(key);
  return translated && translated !== key ? translated : suffix;
}

function officialServiceAsset(serviceId) {
  return serviceCatalog().find(({ id, offerKind, fulfillment }) => (
    id === serviceId && offerKind === "asset" && fulfillment === "permanent"
  )) ?? null;
}

function configuredServiceDefinitions() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, SETTINGS.SERVICE_DEFINITIONS) ?? null;
  } catch (_error) {
    return null;
  }
}

async function waitForCategoryEditor({ name, img, selected }) {
  const groups = categoryEditorGroups(selected);
  const content = `<section class="symbaroum-hud-item-category-editor">
    <header>
      <img src="${escapeHtml(img)}" alt="">
      <span><strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.ItemCategoryManager.EditorHint"))}</small></span>
    </header>
    <div class="symbaroum-hud-item-category-editor-groups">${groups}</div>
  </section>`;
  return DialogV2.wait({
    classes: ["symbaroum-hud-item-category-editor-dialog"],
    window: {
      title: game.i18n.format("SYMBAROUMHUD.ItemCategoryManager.EditTitle", { name })
    },
    position: { width: 720, height: 720 },
    content,
    buttons: [
      {
        action: "save",
        icon: "fa-solid fa-floppy-disk",
        label: game.i18n.localize("SYMBAROUMHUD.ItemCategoryManager.Save"),
        default: true,
        callback: (_event, button) => ({
          action: "save",
          categories: [...button.form.querySelectorAll('input[name="itemCategory"]:checked')]
            .map((input) => input.value)
        })
      },
      {
        action: "automatic",
        icon: "fa-solid fa-wand-magic-sparkles",
        label: game.i18n.localize("SYMBAROUMHUD.ItemCategoryManager.RestoreAutomatic"),
        callback: () => ({ action: "automatic" })
      },
      { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null }
    ],
    close: () => null,
    rejectClose: false
  });
}

function categoryEditorGroups(selected) {
  const definitions = new Map();
  for (const definition of ITEM_TAXONOMY_DEFINITIONS) {
    if (!definitions.has(definition.group)) definitions.set(definition.group, []);
    definitions.get(definition.group).push(definition);
  }
  return [...definitions.entries()].map(([group, categories]) => `<section>
    <h3>${escapeHtml(game.i18n.localize(`SYMBAROUMHUD.ItemCategoryManager.Groups.${group}`))}</h3>
    <div>${categories.map((category) => `<label style="--category-depth:${categoryDepth(category.id)}">
      <input type="checkbox" name="itemCategory" value="${escapeHtml(category.id)}" ${selected.has(category.id) ? "checked" : ""}>
      <span>${escapeHtml(localizeCategory(category.id))}</span>
    </label>`).join("")}</div>
  </section>`).join("");
}

function categoryDepth(id) {
  let depth = 0;
  let current = ITEM_TAXONOMY_CATEGORY_BY_ID.get(id);
  const visited = new Set();
  while (current?.parent && !visited.has(current.parent)) {
    visited.add(current.parent);
    depth += 1;
    current = ITEM_TAXONOMY_CATEGORY_BY_ID.get(current.parent);
  }
  return depth;
}

function localizeCategory(id) {
  const key = `SYMBAROUMHUD.ItemTaxonomy.Categories.${id}`;
  const translated = game.i18n.localize(key);
  return translated && translated !== key ? translated : id;
}

function localizeItemType(type) {
  const key = `TYPES.Item.${type}`;
  const translated = game.i18n.localize(key);
  return translated && translated !== key ? translated : String(type ?? "");
}

function worldItem(id) {
  return globalThis.game?.items?.get?.(id)
    ?? collectionValues(globalThis.game?.items).find((item) => (item.id ?? item._id) === id)
    ?? null;
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return [...collection.values()];
  return Object.values(collection);
}

function normalizeSearch(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(globalThis.game?.i18n?.lang ?? "pt-BR").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}
