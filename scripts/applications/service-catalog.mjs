import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { contentOriginDefinition } from "../services/content-origin-service.mjs";
import {
  normalizeCustomServices,
  SERVICE_CATEGORIES,
  serviceCatalog
} from "../services/service-contract-service.mjs";

const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2 ?? class {};
const CATEGORY_BY_ID = new Map(SERVICE_CATEGORIES.map((entry) => [entry.id, entry]));

export class ServiceCatalogApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "symbaroum-hud-service-catalog",
    classes: ["symbaroum-hud-service-catalog-application"],
    window: {
      title: "SYMBAROUMHUD.ServiceCatalog.Title",
      icon: "fa-solid fa-bell-concierge",
      minimizable: true,
      resizable: true
    },
    position: { width: 900, height: 700 }
  };

  #listenerController = null;

  async _prepareContext() {
    const custom = normalizeCustomServices(
      game.settings.get(MODULE_ID, SETTINGS.SERVICE_DEFINITIONS)
    );
    const services = serviceCatalog(custom).map((service) => {
      const category = CATEGORY_BY_ID.get(service.category);
      return {
        ...service,
        categoryLabel: game.i18n.localize(category?.label ?? "SYMBAROUMHUD.Services.Categories.Other"),
        categoryIcon: category?.icon ?? "fa-bell-concierge",
        unitLabel: serviceUnitLabel(service.unit),
        fulfillmentLabel: serviceFulfillmentLabel(service.fulfillment),
        originLabel: game.i18n.localize(contentOriginDefinition(service.origin).label),
        catalogLabel: game.i18n.localize(service.official
          ? "SYMBAROUMHUD.Services.OfficialCatalog"
          : "SYMBAROUMHUD.Services.CustomCatalog"),
        searchText: normalizeSearch([
          service.name,
          service.description,
          service.cost,
          service.source,
          game.i18n.localize(category?.label ?? ""),
          game.i18n.localize(contentOriginDefinition(service.origin).label)
        ].join(" "))
      };
    }).sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang, {
      sensitivity: "base"
    }));
    return {
      services,
      count: services.length,
      officialCount: services.filter(({ official }) => official).length,
      customCount: services.filter(({ official }) => !official).length,
      categories: SERVICE_CATEGORIES.map((category) => ({
        ...category,
        label: game.i18n.localize(category.label),
        count: services.filter((service) => service.category === category.id).length
      })).filter(({ count }) => count > 0)
    };
  }

  async _renderHTML(context) {
    return foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/service-catalog.hbs`,
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
    const query = root.querySelector("[data-service-catalog-search]");
    const category = root.querySelector("[data-service-catalog-category]");
    const source = root.querySelector("[data-service-catalog-source]");
    const refresh = () => filterServiceCatalog(root, {
      query: query?.value,
      category: category?.value,
      source: source?.value
    });
    query?.addEventListener("input", refresh, { signal });
    category?.addEventListener("change", refresh, { signal });
    source?.addEventListener("change", refresh, { signal });
    refresh();
  }
}

export function filterServiceCatalog(root, { query = "", category = "all", source = "all" } = {}) {
  const search = normalizeSearch(query);
  let visible = 0;
  for (const card of root?.querySelectorAll?.("[data-service-catalog-entry]") ?? []) {
    const matches = (!search || card.dataset.search?.includes(search))
      && (category === "all" || card.dataset.category === category)
      && (source === "all" || card.dataset.catalog === source);
    card.hidden = !matches;
    if (matches) visible += 1;
  }
  const count = root?.querySelector?.("[data-service-catalog-visible]");
  if (count) count.textContent = String(visible);
  const empty = root?.querySelector?.("[data-service-catalog-empty]");
  if (empty) empty.hidden = visible > 0;
  return visible;
}

function serviceUnitLabel(unit) {
  const key = String(unit ?? "purchase");
  const suffix = key.charAt(0).toUpperCase() + key.slice(1);
  return game.i18n.localize(`SYMBAROUMHUD.Services.Units.${suffix}`);
}

function serviceFulfillmentLabel(fulfillment) {
  const key = String(fulfillment ?? "instant");
  const suffix = key.charAt(0).toUpperCase() + key.slice(1);
  return game.i18n.localize(`SYMBAROUMHUD.Services.Fulfillment.${suffix}`);
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(globalThis.game?.i18n?.lang ?? "pt-BR")
    .trim();
}
