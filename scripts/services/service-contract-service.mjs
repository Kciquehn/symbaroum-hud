import { MODULE_ID } from "../constants.mjs";
import { OFFICIAL_SERVICES } from "../data/official-services.mjs";
import { OFFICIAL_SERVICE_EXPANSIONS } from "../data/official-service-expansions.mjs";
import { OFFICIAL_PURCHASABLE_ASSETS } from "../data/official-purchasable-assets.mjs";
import {
  ITEM_TAXONOMY_CATEGORY_IDS,
  taxonomyCategoryAncestors
} from "../data/item-taxonomy-categories.mjs";

export const SERVICE_UUID_PREFIX = "SymbaroumHudService.";
export const SERVICE_CATEGORIES = Object.freeze([
  { id: "hospitality", icon: "fa-bed", label: "SYMBAROUMHUD.Services.Categories.Hospitality" },
  { id: "travel", icon: "fa-route", label: "SYMBAROUMHUD.Services.Categories.Travel" },
  { id: "professionals", icon: "fa-user-tie", label: "SYMBAROUMHUD.Services.Categories.Professionals" },
  { id: "contracts", icon: "fa-file-signature", label: "SYMBAROUMHUD.Services.Categories.Contracts" },
  { id: "permits", icon: "fa-scroll", label: "SYMBAROUMHUD.Services.Categories.Permits" },
  { id: "fees", icon: "fa-receipt", label: "SYMBAROUMHUD.Services.Categories.Fees" },
  { id: "information", icon: "fa-book-open-reader", label: "SYMBAROUMHUD.Services.Categories.Information" },
  { id: "assets", icon: "fa-horse-head", label: "SYMBAROUMHUD.Services.Categories.Assets" },
  { id: "other", icon: "fa-bell-concierge", label: "SYMBAROUMHUD.Services.Categories.Other" }
]);

const CATEGORY_IDS = new Set(SERVICE_CATEGORIES.map(({ id }) => id));
const ITEM_CATEGORY_IDS = new Set(ITEM_TAXONOMY_CATEGORY_IDS);
const UNIT_IDS = new Set([
  "purchase", "use", "person", "legOrWheel", "creature", "wagon", "hour",
  "day", "night", "week", "month", "year", "journey", "session"
]);
const FULFILLMENT_IDS = new Set(["instant", "consumable", "temporary", "permanent"]);
const PRICE_MODE_IDS = new Set(["fixed", "negotiated"]);
const MAX_RECORDS = 200;

export function serviceUuid(id) {
  return `${SERVICE_UUID_PREFIX}${String(id ?? "").trim()}`;
}

export function serviceIdFromUuid(uuid) {
  const value = String(uuid ?? "");
  return value.startsWith(SERVICE_UUID_PREFIX) ? value.slice(SERVICE_UUID_PREFIX.length) : null;
}

export function isServiceUuid(uuid) {
  return Boolean(serviceIdFromUuid(uuid));
}

export function normalizeServiceDefinition(value, { official = false } = {}) {
  const id = cleanId(value?.id);
  const name = cleanText(value?.name, 120);
  const cost = cleanText(value?.cost, 80);
  if (!id || !name || !cost) return null;
  const category = CATEGORY_IDS.has(value?.category) ? value.category : "other";
  const unit = UNIT_IDS.has(value?.unit) ? value.unit : "purchase";
  const fulfillment = FULFILLMENT_IDS.has(value?.fulfillment) ? value.fulfillment : "instant";
  const priceMode = PRICE_MODE_IDS.has(value?.priceMode) ? value.priceMode : "fixed";
  return Object.freeze({
    id,
    name,
    img: cleanText(value?.img, 1_000) || "icons/svg/coins.svg",
    description: cleanText(value?.description, 4_000),
    category,
    cost,
    priceMode,
    pricingNote: cleanText(value?.pricingNote, 1_000),
    unit,
    fulfillment,
    offerKind: value?.offerKind === "asset" ? "asset" : "service",
    shopIds: Object.freeze([...new Set((Array.isArray(value?.shopIds) ? value.shopIds : [])
      .map((shopId) => cleanId(shopId))
      .filter(Boolean))]),
    itemCategories: Object.freeze(normalizeItemCategories(value?.itemCategories)),
    origin: cleanText(value?.origin, 100) || "unknown",
    source: cleanText(value?.source, 240),
    officialBase: value?.officialBase === true,
    official: official || value?.official === true
  });
}

export function normalizeCustomServices(value = null) {
  const source = Array.isArray(value) ? value : value?.services;
  if (!Array.isArray(source)) return { version: 1, services: [] };
  const ids = new Set();
  const services = [];
  for (const candidate of source) {
    const normalized = normalizeServiceDefinition(candidate);
    if (!normalized || ids.has(normalized.id)) continue;
    ids.add(normalized.id);
    services.push(normalized);
  }
  return { version: 1, services };
}

export function serviceCatalog(custom = null) {
  const customServices = normalizeCustomServices(custom).services;
  const customById = new Map(customServices.map((entry) => [entry.id, entry]));
  const officialServices = [...OFFICIAL_SERVICES, ...OFFICIAL_SERVICE_EXPANSIONS, ...OFFICIAL_PURCHASABLE_ASSETS]
    .map((entry) => normalizeServiceDefinition(entry, { official: true }))
    .filter(Boolean);
  const officialIds = new Set(officialServices.map(({ id }) => id));
  const mergedOfficial = officialServices.flatMap((entry) => {
    const override = customById.get(entry.id);
    if (!override) return [entry];
    if (!override.officialBase) return [];
    // Category edits to bundled assets are intentionally narrow overrides.
    // Always retain the current bundled name, price, rule text and source so
    // a future module update is not frozen behind an old copied definition.
    return [Object.freeze({
      ...entry,
      itemCategories: Object.freeze([...override.itemCategories]),
      officialBase: true
    })];
  });
  return [
    ...mergedOfficial,
    ...customServices.filter(({ id, officialBase }) => !officialBase || !officialIds.has(id))
  ];
}

export function findServiceDefinition(uuidOrId, custom = null) {
  const id = serviceIdFromUuid(uuidOrId) ?? cleanId(uuidOrId);
  const entry = serviceCatalog(custom).find((candidate) => candidate.id === id);
  return entry ? Object.freeze({
    ...entry,
    uuid: serviceUuid(entry.id),
    documentClass: "Service",
    type: "service"
  }) : null;
}

export function upsertCustomService(value, service) {
  const current = normalizeCustomServices(value);
  const normalized = normalizeServiceDefinition(service);
  if (!normalized || normalized.official) return current;
  return {
    version: 1,
    services: [...current.services.filter(({ id }) => id !== normalized.id), normalized]
  };
}

export function removeCustomService(value, serviceId) {
  const current = normalizeCustomServices(value);
  const id = cleanId(serviceId);
  return { version: 1, services: current.services.filter((entry) => entry.id !== id) };
}

export function serviceBrowserEntries(custom = null) {
  return serviceCatalog(custom).map((service) => {
    const taxonomy = serviceTaxonomyContext(service);
    return {
      ...service,
      uuid: serviceUuid(service.id),
      documentClass: "Service",
      type: "service",
      reference: service.source,
      sourceId: "services",
      sourceLabel: service.official || service.officialBase
        ? globalThis.game?.i18n?.localize?.("SYMBAROUMHUD.Services.OfficialCatalog") ?? "Catálogo oficial"
        : globalThis.game?.i18n?.localize?.("SYMBAROUMHUD.Services.CustomCatalog") ?? "Serviços personalizados",
      taxonomyPrimary: taxonomy.taxonomyPrimary,
      taxonomyTags: taxonomy.taxonomyTags
    };
  });
}

export function serviceTaxonomyContext(service) {
  const itemCategories = normalizeItemCategories(service?.itemCategories);
  const taxonomyCategories = [...new Set(itemCategories.flatMap((category) => [
    ...taxonomyCategoryAncestors(category),
    category
  ]))];
  const asset = service?.offerKind === "asset";
  return Object.freeze({
    taxonomyPrimary: itemCategories[0] ?? (asset ? "service-assets" : `service-${service?.category ?? "other"}`),
    taxonomyTags: Object.freeze([...new Set(asset
      ? ["service-assets", ...taxonomyCategories]
      : ["services", `service-${service?.category ?? "other"}`, ...taxonomyCategories])])
  });
}

export function isServiceDefinition(value) {
  return Boolean(value && (
    value.documentClass === "Service"
    || value.type === "service"
    || isServiceUuid(value.uuid)
  ));
}

export function actorServiceRecords(actor, { worldTime = globalThis.game?.time?.worldTime ?? 0 } = {}) {
  const raw = actor?.getFlag?.(MODULE_ID, "services") ?? actor?.flags?.[MODULE_ID]?.services;
  return normalizeServiceRecords(raw).map((record) => serviceRecordContext(record, worldTime));
}

export function normalizeServiceRecords(value = null) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_RECORDS).flatMap((entry) => {
    const id = cleanId(entry?.id);
    const serviceId = cleanId(entry?.serviceId);
    const name = cleanText(entry?.name, 120);
    if (!id || !serviceId || !name) return [];
    const fulfillment = FULFILLMENT_IDS.has(entry?.fulfillment) ? entry.fulfillment : "consumable";
    const unit = UNIT_IDS.has(entry?.unit) ? entry.unit : "purchase";
    const quantity = positiveInteger(entry?.quantity, 1);
    const remaining = Math.min(quantity, nonNegativeInteger(entry?.remaining, quantity));
    return [{
      id,
      serviceId,
      name,
      img: cleanText(entry?.img, 1_000) || "icons/svg/coins.svg",
      description: cleanText(entry?.description, 4_000),
      category: CATEGORY_IDS.has(entry?.category) ? entry.category : "other",
      offerKind: entry?.offerKind === "asset" ? "asset" : "service",
      itemCategories: normalizeItemCategories(entry?.itemCategories),
      fulfillment,
      unit,
      quantity,
      remaining,
      purchasedAt: nonNegativeNumber(entry?.purchasedAt),
      expiresAt: nonNegativeNumber(entry?.expiresAt),
      storeName: cleanText(entry?.storeName, 120),
      priceOrtegs: nonNegativeInteger(entry?.priceOrtegs),
      priceLabel: cleanText(entry?.priceLabel, 120),
      source: cleanText(entry?.source, 240),
      status: entry?.status === "completed" ? "completed" : "active"
    }];
  });
}

export function createPurchasedServiceRecords(lines, {
  storeName = "",
  worldTime = globalThis.game?.time?.worldTime ?? 0
} = {}) {
  return Array.from(lines ?? []).flatMap((line) => {
    const service = normalizeServiceDefinition(line?.source, { official: line?.source?.official === true });
    if (!service || service.fulfillment === "instant") return [];
    const quantity = positiveInteger(line?.quantity, 1);
    const purchasedAt = nonNegativeNumber(worldTime);
    return [{
      id: createRecordId(),
      serviceId: service.id,
      name: service.name,
      img: service.img,
      description: service.description,
      category: service.category,
      offerKind: service.offerKind,
      itemCategories: service.itemCategories,
      fulfillment: service.fulfillment,
      unit: service.unit,
      quantity,
      remaining: service.fulfillment === "consumable" ? quantity : 1,
      purchasedAt,
      expiresAt: service.fulfillment === "temporary"
        ? purchasedAt + durationSeconds(service.unit, quantity)
        : 0,
      storeName: cleanText(storeName, 120),
      priceOrtegs: nonNegativeInteger(line?.subtotalOrtegs),
      priceLabel: cleanText(
        quantity > 1 ? `${line?.price?.raw ?? ""} × ${quantity}` : line?.price?.raw,
        120
      ),
      source: service.source,
      status: "active"
    }];
  });
}

export async function addActorServiceRecords(actor, records) {
  if (!actor?.update) return [];
  const current = normalizeServiceRecords(
    actor?.getFlag?.(MODULE_ID, "services") ?? actor?.flags?.[MODULE_ID]?.services
  );
  const added = normalizeServiceRecords(records);
  const next = [...current, ...added].slice(-MAX_RECORDS);
  await actor.update({ [`flags.${MODULE_ID}.services`]: next });
  return added;
}

export async function useActorService(actor, recordId) {
  return updateActorServiceRecords(actor, recordId, (record) => {
    if (record.status !== "active") return record;
    if (record.fulfillment === "consumable") {
      const remaining = Math.max(0, record.remaining - 1);
      return { ...record, remaining, status: remaining ? "active" : "completed" };
    }
    return { ...record, status: "completed" };
  });
}

export async function removeActorService(actor, recordId) {
  if (!actor?.update) return false;
  const current = normalizeServiceRecords(
    actor?.getFlag?.(MODULE_ID, "services") ?? actor?.flags?.[MODULE_ID]?.services
  );
  const next = current.filter(({ id }) => id !== recordId);
  if (next.length === current.length) return false;
  await actor.update({ [`flags.${MODULE_ID}.services`]: next });
  return true;
}

function serviceRecordContext(record, worldTime) {
  const expired = record.status === "active" && record.expiresAt > 0 && worldTime >= record.expiresAt;
  const status = expired ? "expired" : record.status;
  const secondsRemaining = record.expiresAt > 0 ? Math.max(0, record.expiresAt - worldTime) : 0;
  return {
    ...record,
    status,
    active: status === "active",
    expired,
    canUse: status === "active" && ["consumable", "temporary"].includes(record.fulfillment),
    remainingLabel: record.fulfillment === "consumable"
      ? `${record.remaining}/${record.quantity}`
      : record.fulfillment === "temporary"
        ? durationRemainingLabel(secondsRemaining)
        : "",
    unitLabel: localizeUnit(record.unit),
    fulfillmentLabel: localizeFulfillment(record.fulfillment),
    statusLabel: globalThis.game?.i18n?.localize?.(
      status === "active"
        ? "SYMBAROUMHUD.Services.Status.Active"
        : status === "expired"
          ? "SYMBAROUMHUD.Services.Status.Expired"
          : "SYMBAROUMHUD.Services.Status.Completed"
    ) ?? status
  };
}

async function updateActorServiceRecords(actor, recordId, transform) {
  if (!actor?.update) return null;
  const current = normalizeServiceRecords(
    actor?.getFlag?.(MODULE_ID, "services") ?? actor?.flags?.[MODULE_ID]?.services
  );
  let changed = null;
  const next = current.map((record) => {
    if (record.id !== recordId) return record;
    changed = transform(record);
    return changed;
  });
  if (!changed) return null;
  await actor.update({ [`flags.${MODULE_ID}.services`]: next });
  return serviceRecordContext(changed, globalThis.game?.time?.worldTime ?? 0);
}

function durationSeconds(unit, quantity) {
  const units = {
    hour: 3_600,
    day: 86_400,
    night: 86_400,
    week: 604_800,
    month: 2_592_000,
    year: 31_536_000
  };
  return (units[unit] ?? 0) * positiveInteger(quantity, 1);
}

function durationRemainingLabel(seconds) {
  const i18n = globalThis.game?.i18n;
  if (seconds >= 31_536_000) return `${Math.ceil(seconds / 31_536_000)} ${i18n?.localize?.("SYMBAROUMHUD.Services.Units.Year") ?? "ano(s)"}`;
  if (seconds >= 2_592_000) return `${Math.ceil(seconds / 2_592_000)} ${i18n?.localize?.("SYMBAROUMHUD.Services.Units.Month") ?? "mês(es)"}`;
  if (seconds >= 604_800) return `${Math.ceil(seconds / 604_800)} ${i18n?.localize?.("SYMBAROUMHUD.Services.Units.Week") ?? "semana(s)"}`;
  if (seconds >= 86_400) return `${Math.ceil(seconds / 86_400)} ${i18n?.localize?.("SYMBAROUMHUD.Services.Units.Day") ?? "dia(s)"}`;
  return i18n?.localize?.("SYMBAROUMHUD.Services.LessThanDay") ?? "menos de um dia";
}

function localizeUnit(unit) {
  const key = unit.charAt(0).toUpperCase() + unit.slice(1);
  return globalThis.game?.i18n?.localize?.(`SYMBAROUMHUD.Services.Units.${key}`) ?? unit;
}

function localizeFulfillment(fulfillment) {
  const key = fulfillment.charAt(0).toUpperCase() + fulfillment.slice(1);
  return globalThis.game?.i18n?.localize?.(`SYMBAROUMHUD.Services.Fulfillment.${key}`) ?? fulfillment;
}

function createRecordId() {
  return globalThis.foundry?.utils?.randomID?.(16)
    ?? `service-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function cleanId(value) {
  return cleanText(value, 100).replace(/[^A-Za-z0-9._-]/g, "-");
}

function cleanText(value, maximum = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normalizeItemCategories(value) {
  return [...new Set(Array.isArray(value) ? value : [])]
    .map((category) => String(category ?? "").trim())
    .filter((category) => ITEM_CATEGORY_IDS.has(category))
    .sort();
}

function positiveInteger(value, fallback = 1) {
  const number = Math.trunc(Number(value));
  return Number.isSafeInteger(number) && number > 0 ? Math.min(99999, number) : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Math.trunc(Number(value));
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, number) : fallback;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
