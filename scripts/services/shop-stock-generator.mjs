import { OFFICIAL_SHOP_PRESET_BY_ID } from "../data/official-shop-presets.mjs";
import { canonicalTaxonomyCategoryId } from "../data/item-taxonomy-categories.mjs";

export const SHOP_STOCK_SIZES = Object.freeze({
  small: Object.freeze({ id: "small", maximumItems: 8 }),
  medium: Object.freeze({ id: "medium", maximumItems: 18 }),
  large: Object.freeze({ id: "large", maximumItems: 35 })
});

export function normalizeShopStockSize(value) {
  const id = String(value ?? "").trim().toLowerCase();
  return SHOP_STOCK_SIZES[id] ?? SHOP_STOCK_SIZES.medium;
}

export function generateOfficialShopStock(entries, presetOrId, {
  seed = `${Date.now()}`,
  random = null,
  itemRules = null,
  stockSize = "medium"
} = {}) {
  const preset = typeof presetOrId === "string"
    ? OFFICIAL_SHOP_PRESET_BY_ID.get(presetOrId)
    : presetOrId;
  if (!preset?.id || !Array.isArray(preset.pools)) {
    return Object.freeze({
      preset: null,
      seed: String(seed),
      stock: Object.freeze([]),
      missingPools: Object.freeze([]),
      missingEssentials: Object.freeze([])
    });
  }

  const rng = typeof random === "function" ? random : seededRandom(seed);
  const rulesEnabled = itemRules !== null && itemRules !== undefined;
  const configuredRules = rulesEnabled ? normalizeShopStockRules(itemRules) : null;
  const documents = normalizeGeneratorEntries(entries)
    .filter((entry) => matchesShopStockCategories(entry, preset.categories))
    .filter((entry) => !entry.shopIds.length || entry.shopIds.includes(preset.id))
    .map((entry) => ({
      ...entry,
      stockRule: rulesEnabled ? resolveShopStockRule(entry, configuredRules) : null
    }));
  const available = new Set(documents
    .filter((entry) => !entry.stockRule || rng() <= entry.stockRule.chance / 100)
    .map(({ uuid }) => uuid));
  const selected = new Set();
  const stock = new Map();
  const missingPools = [];
  const missingEssentials = [];

  for (const essential of preset.essentials ?? []) {
    const matching = documents.filter((entry) => matchesEssential(entry, essential));
    const candidates = matching
      .filter((entry) => available.has(entry.uuid) && !selected.has(entry.uuid))
      .sort((left, right) => {
        const score = essentialMatchScore(right, essential) - essentialMatchScore(left, essential);
        return score || left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid);
      });
    const choice = candidates.length
      ? (essential.random
        ? candidates[Math.floor(rng() * candidates.length)]
        : candidates[0])
      : null;
    if (!choice) {
      if (!matching.length) missingEssentials.push(essential.id);
      continue;
    }
    selected.add(choice.uuid);
    stock.set(choice.uuid, {
      uuid: choice.uuid,
      quantity: generatedQuantity(choice, essential.quantity, rng),
      priceModifier: steppedInteger(
        essential.price?.[0] ?? preset.price?.[0],
        essential.price?.[1] ?? preset.price?.[1],
        5,
        rng
      ),
      pool: `essential:${essential.id}`
    });
  }

  for (const pool of preset.pools) {
    if (rng() > clamp(Number(pool.chance ?? 1), 0, 1)) continue;
    const candidates = documents.filter((entry) => (
      available.has(entry.uuid) && !selected.has(entry.uuid) && matchesPool(entry, pool)
    ));
    const desired = randomInteger(pool.picks?.[0], pool.picks?.[1], rng);
    if (!candidates.length) {
      if (desired > 0) missingPools.push(pool.id);
      continue;
    }
    const pickCount = Math.min(desired, candidates.length);
    for (let index = 0; index < pickCount; index += 1) {
      const choice = takeWeighted(candidates, pool, rng);
      if (!choice) break;
      selected.add(choice.uuid);
      const quantity = generatedQuantity(choice, pool.quantity, rng);
      const priceModifier = steppedInteger(
        pool.price?.[0] ?? preset.price?.[0],
        pool.price?.[1] ?? preset.price?.[1],
        5,
        rng
      );
      stock.set(choice.uuid, {
        uuid: choice.uuid,
        quantity,
        priceModifier,
        pool: pool.id
      });
    }
  }

  const size = normalizeShopStockSize(stockSize);
  const generatedStock = [...stock.values()];
  const essentialCount = generatedStock.filter(({ pool }) => String(pool).startsWith("essential:"))
    .length;
  const limitedStock = generatedStock.slice(0, Math.max(size.maximumItems, essentialCount));
  return Object.freeze({
    preset,
    seed: String(seed),
    stockSize: size.id,
    stock: Object.freeze(limitedStock.sort((left, right) => left.uuid.localeCompare(right.uuid))),
    missingPools: Object.freeze(missingPools),
    missingEssentials: Object.freeze(missingEssentials)
  });
}

export function generateShopStockByCategories(entries, categories = [], {
  seed = `${Date.now()}`,
  random = null,
  itemRules = null,
  price = [95, 105],
  stockSize = "medium"
} = {}) {
  const selectedCategories = [...new Set(Array.isArray(categories) ? categories : [])]
    .map((category) => canonicalTaxonomyCategoryId(category))
    .filter(Boolean);
  if (!selectedCategories.length) return Object.freeze([]);
  const rng = typeof random === "function" ? random : seededRandom(seed);
  const configuredRules = normalizeShopStockRules(itemRules);
  const candidates = normalizeGeneratorEntries(entries)
    .filter((entry) => matchesShopStockCategories(entry, selectedCategories))
    .map((entry) => ({ ...entry, stockRule: resolveShopStockRule(entry, configuredRules) }))
    .filter((entry) => rng() <= entry.stockRule.chance / 100);
  shuffleInPlace(candidates, rng);
  const size = normalizeShopStockSize(stockSize);
  const stock = candidates
    .slice(0, size.maximumItems)
    .map((entry) => ({
      uuid: entry.uuid,
      quantity: generatedQuantity(entry, [1, 1], rng),
      priceModifier: steppedInteger(price?.[0], price?.[1], 5, rng),
      pool: `category:${selectedCategories.find((category) => entryMatchesCategory(entry, category)) ?? "custom"}`
    }))
    .sort((left, right) => left.uuid.localeCompare(right.uuid));
  return Object.freeze(stock);
}

export function normalizeShopStockRules(value = null) {
  const source = value?.items && typeof value.items === "object" ? value.items : {};
  const items = {};
  for (const [uuid, rule] of Object.entries(source)) {
    const id = String(uuid ?? "").trim();
    if (!id || !rule || typeof rule !== "object") continue;
    items[id] = normalizeStockRule(rule, { chance: 70, minimum: 1, maximum: 4 });
  }
  return Object.freeze({ version: 1, items: Object.freeze(items) });
}

export function defaultShopStockRule(entry) {
  const tags = new Set(entry?.taxonomyTags ?? []);
  if (tags.has("minor-artifacts")) return stockRule(18, 1, 1);
  if (tags.has("artifacts")) return stockRule(8, 1, 1);
  if (tags.has("siege-weapons")) return stockRule(15, 1, 1);
  if (tags.has("heavy-armor")) return stockRule(25, 1, 1);
  if (tags.has("medium-armor")) return stockRule(35, 1, 1);
  if (tags.has("light-armor") || entry?.type === "armor") return stockRule(50, 1, 2);
  if (tags.has("arrows")) return stockRule(90, 5, 20);
  if (entry?.type === "weapon") return stockRule(55, 1, 2);
  if (tags.has("constructions") || tags.has("transport")) return stockRule(25, 1, 1);
  if (tags.has("farm-animals")) return stockRule(45, 1, 4);
  if (tags.has("curiosities")) return stockRule(25, 1, 2);
  if (tags.has("alchemical-elixirs")) return stockRule(60, 1, 4);
  if (tags.has("food-and-drink")) return stockRule(90, 4, 16);
  if (tags.has("services") || tags.has("expenses")) return stockRule(100, 1, 8);
  if (tags.has("tobacco-types")) return stockRule(75, 2, 10);
  if (tags.has("clothing")) return stockRule(75, 1, 5);
  if (tags.has("trade-goods")) return stockRule(65, 2, 10);
  if (tags.has("survival-items") || tags.has("containers") || tags.has("tools")) {
    return stockRule(78, 1, 6);
  }
  return stockRule(70, 1, 5);
}

export function resolveShopStockRule(entry, value = null) {
  const defaults = defaultShopStockRule(entry);
  const normalized = normalizeShopStockRules(value);
  const override = normalized.items[String(entry?.uuid ?? "").trim()];
  return Object.freeze(override ? { ...defaults, ...override, customized: true } : defaults);
}

export function seededRandom(seed = "symbaroum") {
  let state = hashSeed(String(seed));
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function matchesShopStockPool(entry, pool) {
  return matchesPool(normalizeGeneratorEntry(entry), pool);
}

export function matchesShopStockCategories(entry, categories = []) {
  const allowed = Array.isArray(categories)
    ? [...new Set(categories.map((category) => canonicalTaxonomyCategoryId(category)).filter(Boolean))]
    : [];
  if (!allowed.length) return true;
  const normalized = normalizeGeneratorEntry(entry);
  return allowed.some((category) => entryMatchesCategory(normalized, category));
}

function normalizeGeneratorEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const unique = new Map();
  for (const source of entries) {
    const entry = normalizeGeneratorEntry(source);
    if (!entry.uuid || !["weapon", "armor", "equipment", "service"].includes(entry.type)) continue;
    if (!unique.has(entry.uuid)) unique.set(entry.uuid, entry);
  }
  return [...unique.values()];
}

function normalizeGeneratorEntry(entry) {
  return {
    ...entry,
    uuid: String(entry?.uuid ?? "").trim(),
    name: String(entry?.name ?? "").trim(),
    reference: String(entry?.reference ?? "").trim(),
    type: String(entry?.type ?? "").trim(),
    shopIds: [...new Set((Array.isArray(entry?.shopIds) ? entry.shopIds : [])
      .map((shopId) => String(shopId ?? "").trim())
      .filter(Boolean))],
    taxonomyTags: [...new Set((Array.isArray(entry?.taxonomyTags) ? entry.taxonomyTags : [])
      .map((category) => canonicalTaxonomyCategoryId(category)))]
  };
}

function generatedQuantity(entry, fallback, rng) {
  const range = entry?.stockRule
    ? [entry.stockRule.minimum, entry.stockRule.maximum]
    : fallback;
  return triangularInteger(range?.[0], range?.[1], rng);
}

function stockRule(chance, minimum, maximum) {
  return Object.freeze({ chance, minimum, maximum, customized: false });
}

function normalizeStockRule(value, fallback) {
  const chance = clamp(Math.round(Number(value?.chance)), 0, 100);
  const minimum = clamp(Math.trunc(Number(value?.minimum)), 1, 999);
  const maximum = clamp(Math.trunc(Number(value?.maximum)), minimum, 999);
  return Object.freeze({
    chance: Number.isFinite(Number(value?.chance)) ? chance : fallback.chance,
    minimum: Number.isFinite(Number(value?.minimum)) ? minimum : fallback.minimum,
    maximum: Number.isFinite(Number(value?.maximum)) ? maximum : fallback.maximum,
    customized: true
  });
}

function matchesEssential(entry, essential) {
  if (!entry?.uuid || !essential) return false;
  const categories = selectorCategories(essential);
  if (categories.length && !categories.some((category) => entryMatchesCategory(entry, category))) return false;
  const names = new Set((essential.names ?? []).map(normalizeIdentifier).filter(Boolean));
  const references = new Set((essential.references ?? []).map(normalizeIdentifier).filter(Boolean));
  const tags = new Set(entry.taxonomyTags ?? []);
  const anyTags = Array.isArray(essential.anyTags) ? essential.anyTags : [];
  const named = names.has(normalizeIdentifier(entry.name));
  const referenced = references.has(normalizeIdentifier(entry.reference));
  const tagged = anyTags.some((tag) => tags.has(tag));
  return named || referenced || tagged;
}

function essentialMatchScore(entry, essential) {
  const references = new Set((essential.references ?? []).map(normalizeIdentifier).filter(Boolean));
  const names = new Set((essential.names ?? []).map(normalizeIdentifier).filter(Boolean));
  if (references.has(normalizeIdentifier(entry.reference))) return 3;
  if (names.has(normalizeIdentifier(entry.name))) return 2;
  return 1;
}

function matchesPool(entry, pool) {
  if (!entry?.uuid || !pool) return false;
  const tags = new Set(entry.taxonomyTags ?? []);
  const categories = selectorCategories(pool);
  const anyTags = Array.isArray(pool.anyTags) ? pool.anyTags : [];
  const allTags = Array.isArray(pool.allTags) ? pool.allTags : [];
  const excluded = Array.isArray(pool.excludeTags) ? pool.excludeTags : [];
  if (categories.length && !categories.some((category) => entryMatchesCategory(entry, category))) return false;
  if (allTags.some((tag) => !tags.has(tag))) return false;
  if (anyTags.length && !anyTags.some((tag) => tags.has(tag))) return false;
  if (excluded.some((tag) => tags.has(tag))) return false;
  return Boolean(categories.length || anyTags.length || allTags.length);
}

function selectorCategories(selector) {
  if (Array.isArray(selector?.categories)) return selector.categories;
  // Compatibility with stock presets saved before categories became the only public classification.
  return Array.isArray(selector?.types) ? selector.types : [];
}

function entryMatchesCategory(entry, category) {
  const canonical = canonicalTaxonomyCategoryId(category);
  if ((entry.taxonomyTags ?? []).includes(canonical)) return true;
  if (canonical === "weapon") return entry.type === "weapon";
  if (canonical === "armor") return entry.type === "armor";
  if (canonical === "equipment") return entry.type === "equipment";
  if (canonical === "service") return entry.type === "service";
  return false;
}

function takeWeighted(candidates, pool, rng) {
  if (!candidates.length) return null;
  const weights = candidates.map((entry) => {
    const tags = new Set(entry.taxonomyTags ?? []);
    const matches = (pool.anyTags ?? []).filter((tag) => tags.has(tag)).length;
    return Math.max(0.01, Number(pool.weight ?? 1) + matches);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = rng() * total;
  let selectedIndex = candidates.length - 1;
  for (let index = 0; index < weights.length; index += 1) {
    target -= weights[index];
    if (target <= 0) {
      selectedIndex = index;
      break;
    }
  }
  return candidates.splice(selectedIndex, 1)[0] ?? null;
}

function randomInteger(minimum, maximum, rng) {
  const min = Math.max(0, Math.trunc(Number(minimum) || 0));
  const max = Math.max(min, Math.trunc(Number(maximum) || min));
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffleInPlace(values, rng) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

function triangularInteger(minimum, maximum, rng) {
  const min = Math.max(0, Math.trunc(Number(minimum) || 0));
  const max = Math.max(min, Math.trunc(Number(maximum) || min));
  if (min === max) return min;
  return Math.max(min, Math.min(max, Math.round(min + ((rng() + rng()) / 2) * (max - min))));
}

function steppedInteger(minimum, maximum, step, rng) {
  const min = Math.max(10, Math.trunc(Number(minimum) || 100));
  const max = Math.max(min, Math.trunc(Number(maximum) || min));
  const safeStep = Math.max(1, Math.trunc(Number(step) || 1));
  const steps = Math.floor((max - min) / safeStep);
  return min + Math.floor(rng() * (steps + 1)) * safeStep;
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeIdentifier(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}
