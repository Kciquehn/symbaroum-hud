import { ActorService } from "./actor-service.mjs";
import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { actorTransactions, ActorTransactionError } from "./actor-transaction-service.mjs";
import {
  createPurchasedServiceRecords,
  findServiceDefinition,
  isServiceDefinition,
  normalizeServiceRecords
} from "./service-contract-service.mjs";

export const SHOP_ITEM_TYPES = new Set(["weapon", "armor", "equipment"]);

export const SHOP_MONEY_VALUES = Object.freeze({
  thaler: 100,
  shilling: 10,
  orteg: 1
});

const MAX_CART_QUANTITY = 999;
const PRICE_UNITS = Object.freeze({
  taler: "thaler",
  taleres: "thaler",
  talers: "thaler",
  thaler: "thaler",
  thalers: "thaler",
  xelim: "shilling",
  xelins: "shilling",
  shilling: "shilling",
  shillings: "shilling",
  orteg: "orteg",
  ortegs: "orteg",
  ortega: "orteg",
  ortegas: "orteg"
});

export function parseShopPrice(value) {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const match = normalized.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?\s+([a-z]+)\.?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const maximumAmount = Number(match[2] ?? match[1]);
  const denomination = PRICE_UNITS[match[3]];
  if (!Number.isSafeInteger(amount) || amount <= 0
    || !Number.isSafeInteger(maximumAmount) || maximumAmount < amount
    || !denomination) return null;
  const ortegs = amount * SHOP_MONEY_VALUES[denomination];
  const maximumOrtegs = maximumAmount * SHOP_MONEY_VALUES[denomination];
  if (!Number.isSafeInteger(ortegs) || !Number.isSafeInteger(maximumOrtegs)) return null;

  return Object.freeze({
    raw,
    amount,
    maximumAmount,
    denomination,
    ortegs,
    maximumOrtegs,
    ranged: maximumAmount > amount
  });
}

export function selectShopPrice(price, amount = null) {
  if (!price) return null;
  const selected = amount == null && !price.ranged ? price.amount : Number(amount);
  if (!Number.isSafeInteger(selected)
    || selected < price.amount
    || selected > price.maximumAmount) return null;
  const ortegs = selected * SHOP_MONEY_VALUES[price.denomination];
  if (!Number.isSafeInteger(ortegs)) return null;
  return Object.freeze({
    raw: price.raw.replace(/^(\d+)(?:\s*[-–—]\s*\d+)?/, String(selected)),
    amount: selected,
    denomination: price.denomination,
    ortegs,
    sourceRaw: price.raw
  });
}

export function moneyToOrtegs(money = {}) {
  const total = nonNegativeInteger(money.thaler) * SHOP_MONEY_VALUES.thaler
    + nonNegativeInteger(money.shilling) * SHOP_MONEY_VALUES.shilling
    + nonNegativeInteger(money.orteg) * SHOP_MONEY_VALUES.orteg;
  return Number.isSafeInteger(total) ? total : Number.MAX_SAFE_INTEGER;
}

export function moneyFromOrtegs(value) {
  const total = nonNegativeInteger(value);
  return Object.freeze({
    thaler: Math.floor(total / SHOP_MONEY_VALUES.thaler),
    shilling: Math.floor((total % SHOP_MONEY_VALUES.thaler) / SHOP_MONEY_VALUES.shilling),
    orteg: total % SHOP_MONEY_VALUES.shilling
  });
}

export function isPurchasableShopEntry(entry) {
  const negotiatedService = isServiceDefinition(entry) && entry?.priceMode === "negotiated";
  return Boolean(
    ((entry?.documentClass === "Item" && SHOP_ITEM_TYPES.has(entry.type))
      || isServiceDefinition(entry))
    && (negotiatedService || parseShopPrice(entry.cost ?? entry.system?.cost))
  );
}

export class ShopService {
  static balance(actor) {
    const total = moneyToOrtegs(actor?.system?.money ?? {});
    return Object.freeze({ total, ...moneyFromOrtegs(total) });
  }

  static async purchase(actor, source, { amount = null } = {}) {
    const result = await this.purchaseCart(actor, [{ source, amount, quantity: 1 }]);
    if (!result.ok) return result;
    return Object.freeze({
      ...result,
      item: result.items[0] ?? null,
      price: result.lines[0].price
    });
  }

  static async purchaseCart(actor, purchases = [], {
    balanceOverride = null,
    complimentary = [],
    storeName = ""
  } = {}) {
    if (!actor || !ActorService.canUpdate(actor)) return purchaseFailure("permission");
    if (!Array.isArray(purchases) || !Array.isArray(complimentary)) return purchaseFailure("unavailable");
    if (!globalThis.game.user.isGM && (balanceOverride != null || complimentary.length || purchases.some((entry) => entry?.priceOverride != null))) {
      return purchaseFailure("permission");
    }
    try {
      const result = await actorTransactions.execute(actor, "shop.purchase", {
        purchases: purchases.map((entry) => ({ ...entry, source: sourceReference(entry?.source) })),
        complimentary: complimentary.map((entry) => ({ ...entry, source: sourceReference(entry?.source) })),
        balanceOverride, storeName
      });
      if (!result.ok) return result;
      return Object.freeze({
        ...result,
        items: Object.freeze(result.items.map((item) => actor.items?.get?.(item._id ?? item.id) ?? item)),
        lines: Object.freeze(result.lines.map((line, index) => ({ ...line, source: purchases[index]?.source }))),
        complimentary: Object.freeze(result.complimentary.map((line, index) => ({ ...line, source: complimentary[index]?.source })))
      });
    } catch (error) {
      if (error instanceof ActorTransactionError) return purchaseFailure(error.code);
      throw error;
    }
  }
}

async function purchaseAsAuthority(actor, data, user) {
  const { balanceOverride = null, storeName = "" } = data;
  if (!Array.isArray(data.purchases) || !Array.isArray(data.complimentary)) return purchaseFailure("unavailable");
  if (!user.isGM && (balanceOverride != null || data.complimentary.length || data.purchases.some((entry) => entry?.priceOverride != null))) {
    return purchaseFailure("permission");
  }
  if (balanceOverride != null && (!Number.isSafeInteger(balanceOverride) || balanceOverride < 0)) return purchaseFailure("invalidPrice");
  const purchases = await resolvePurchases(data.purchases, user);
  const complimentary = await resolvePurchases(data.complimentary, user);
  if (!purchases || !complimentary) return purchaseFailure("unavailable");
  const normalized = normalizeCartPurchases(purchases, { allowEmpty: complimentary.length > 0, user });
  if (!normalized.ok) return purchaseFailure(normalized.reason);
  const normalizedComplimentary = normalizeComplimentaryItems(complimentary);
  if (!normalizedComplimentary.ok) return purchaseFailure(normalizedComplimentary.reason);
  if (!normalized.lines.length && !normalizedComplimentary.lines.length) {
    return purchaseFailure("unavailable");
  }
  const originalTotal = moneyToOrtegs(actor.system?.money ?? {});
  const currentTotal = balanceOverride == null
    ? originalTotal
    : nonNegativeInteger(balanceOverride);
  if (currentTotal < normalized.totalOrtegs) {
    return purchaseFailure("insufficient", {
      totalOrtegs: normalized.totalOrtegs,
      balance: moneyFromOrtegs(currentTotal)
    });
  }

  const nextTotal = currentTotal - normalized.totalOrtegs;
  const originalMoney = moneyFromOrtegs(originalTotal);
  const nextMoney = moneyFromOrtegs(nextTotal);
  const existingServices = normalizeServiceRecords(
    actor?.getFlag?.(MODULE_ID, "services") ?? actor?.flags?.[MODULE_ID]?.services
  );
  const serviceLines = normalized.lines.filter(({ kind }) => kind === "service");
  const purchasedServices = createPurchasedServiceRecords(serviceLines, { storeName });
  const actorUpdate = actorMoneyUpdate(nextMoney);
  if (purchasedServices.length) {
    actorUpdate[`flags.${MODULE_ID}.services`] = [...existingServices, ...purchasedServices];
  }
  const paid = await actor.update(actorUpdate);
  if (!paid) return purchaseFailure("paymentFailed");

  try {
    const itemLines = normalized.lines.filter(({ kind }) => kind === "item");
    const itemData = [
      ...normalizedComplimentary.lines.flatMap(({ source, quantity, reason }) => (
        itemCopies(source, quantity, (count) => complimentaryItemData(source, count, reason))
      )),
      ...itemLines.flatMap(({ source, price, quantity }) => (
        itemCopies(source, quantity, (count) => purchasedItemData(source, price, count))
      ))
    ];
    const created = itemData.length
      ? await actor.createEmbeddedDocuments("Item", itemData)
      : [];
    if (!Array.isArray(created) || created.length !== itemData.length) {
      const ids = Array.from(created ?? [], (item) => item.id ?? item._id).filter(Boolean);
      if (ids.length) {
        // Remove only documents from this batch before refunding a partial creation.
        if (typeof actor.deleteEmbeddedDocuments !== "function") throw new ActorTransactionError("rollbackFailed");
        try { await actor.deleteEmbeddedDocuments("Item", ids); }
        catch (error) { throw new ActorTransactionError("rollbackFailed"); }
      }
      throw new ActorTransactionError("creationIncomplete");
    }
    return Object.freeze({
      ok: true,
      reason: null,
      items: Object.freeze(Array.from(created ?? [], (item) => item.toObject?.() ?? structuredClone(item))),
      services: Object.freeze(purchasedServices),
      lines: normalized.lines.map(({ source, ...line }) => ({ ...line, sourceUuid: source.uuid })),
      complimentary: normalizedComplimentary.lines.map(({ source, ...line }) => ({ ...line, sourceUuid: source.uuid })),
      totalOrtegs: normalized.totalOrtegs,
      balance: nextMoney
    });
  } catch (error) {
    // Refunding while partial items remain would grant them for free.
    if (error instanceof ActorTransactionError && error.code === "rollbackFailed") throw error;
    try {
      const restored = await actor.update({
        ...actorMoneyUpdate(originalMoney),
        ...(purchasedServices.length
          ? { [`flags.${MODULE_ID}.services`]: existingServices }
          : {})
      });
      if (!restored) throw new ActorTransactionError("rollbackFailed");
    } catch (rollbackError) {
      console.error("symbaroum-hud | Shop purchase rollback failed.", rollbackError);
      throw new ActorTransactionError("rollbackFailed");
    }
    throw error;
  }
}

function normalizeCartPurchases(purchases, { allowEmpty = false, user = globalThis.game?.user } = {}) {
  const entries = Array.from(purchases ?? []);
  if (!entries.length && !allowEmpty) return { ok: false, reason: "unavailable" };

  const lines = [];
  let totalOrtegs = 0;
  for (const purchase of entries) {
    const source = purchase?.source;
    const service = isServiceDefinition(source);
    const item = Boolean(
      source
      && (!source.documentName || source.documentName === "Item")
      && source.documentClass !== "Service"
      && SHOP_ITEM_TYPES.has(source.type)
    );
    if (!service && !item) {
      return { ok: false, reason: "unavailable" };
    }
    const quantity = Number(purchase.quantity ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
      return { ok: false, reason: "invalidQuantity" };
    }
    const negotiated = service && source.priceMode === "negotiated";
    if (negotiated && !user?.isGM) {
      return { ok: false, reason: "permission" };
    }
    const sourcePrice = negotiated
      ? null
      : selectShopPrice(
        parseShopPrice(service ? source.cost : source.system?.cost),
        purchase.amount
      );
    if (!negotiated && !sourcePrice) return { ok: false, reason: "invalidPrice" };
    const price = normalizePriceOverride(purchase.priceOverride, sourcePrice, {
      allowZero: negotiated,
      sourceRaw: service ? source.cost : source.system?.cost
    });
    if (!price) return { ok: false, reason: "invalidPrice" };
    const subtotalOrtegs = price.ortegs * quantity;
    if (!Number.isSafeInteger(subtotalOrtegs) || subtotalOrtegs < 0
      || (!negotiated && subtotalOrtegs === 0)) {
      return { ok: false, reason: "invalidPrice" };
    }
    totalOrtegs += subtotalOrtegs;
    if (!Number.isSafeInteger(totalOrtegs)) return { ok: false, reason: "invalidPrice" };
    lines.push(Object.freeze({
      source,
      price,
      quantity,
      subtotalOrtegs,
      kind: service ? "service" : "item"
    }));
  }

  return Object.freeze({
    ok: true,
    reason: null,
    lines: Object.freeze(lines),
    totalOrtegs
  });
}

function normalizePriceOverride(value, sourcePrice, { allowZero = false, sourceRaw = "" } = {}) {
  if (value == null) return sourcePrice;
  const ortegs = Number(value?.ortegs);
  if (!Number.isSafeInteger(ortegs) || ortegs < (allowZero ? 0 : 1)) return null;
  const modifier = Number(value?.modifier);
  return Object.freeze({
    raw: String(value?.raw ?? `${ortegs} ortegas`).trim() || `${ortegs} ortegas`,
    amount: ortegs,
    denomination: "orteg",
    ortegs,
    sourceRaw: sourcePrice?.sourceRaw ?? sourcePrice?.raw ?? String(sourceRaw ?? ""),
    ...(Number.isFinite(modifier) ? { modifier } : {})
  });
}

function normalizeComplimentaryItems(items) {
  const lines = [];
  for (const entry of Array.from(items ?? [])) {
    const source = entry?.source;
    if (!source || (source.documentName && source.documentName !== "Item") || !SHOP_ITEM_TYPES.has(source.type)) {
      return { ok: false, reason: "unavailable" };
    }
    const quantity = Number(entry.quantity ?? 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) {
      return { ok: false, reason: "invalidQuantity" };
    }
    lines.push(Object.freeze({ source, quantity, reason: String(entry.reason ?? "") }));
  }
  return Object.freeze({ ok: true, reason: null, lines: Object.freeze(lines) });
}

function purchasedItemData(source, price, quantity = 1) {
  const data = source.toObject();
  delete data._id;
  delete data.folder;
  delete data.ownership;
  delete data.sort;
  delete data._stats;
  data.flags ??= {};
  data.flags.core ??= {};
  data.flags.core.sourceId ??= source.uuid;
  data.flags[MODULE_ID] ??= {};
  data.flags[MODULE_ID].shopPurchase = {
    price: price.raw,
    amount: price.amount,
    denomination: price.denomination,
    sourcePrice: price.sourceRaw,
    ...(Number.isFinite(price.modifier) ? { modifier: price.modifier } : {})
  };
  if (quantity > 1) data.flags[MODULE_ID].shopPurchase.quantity = quantity;
  data.system ??= {};
  data.system.cost = price.raw;
  const sourceQuantity = Math.max(1, nonNegativeInteger(source.system?.number ?? data.system.number ?? 1));
  data.system.number = Math.min(Number.MAX_SAFE_INTEGER, sourceQuantity * quantity);
  if (source.type === "armor") delete data.system.number;
  return data;
}

function complimentaryItemData(source, quantity = 1, reason = "") {
  const data = source.toObject();
  delete data._id;
  delete data.folder;
  delete data.ownership;
  delete data.sort;
  delete data._stats;
  data.flags ??= {};
  data.flags.core ??= {};
  data.flags.core.sourceId ??= source.uuid;
  data.flags[MODULE_ID] ??= {};
  data.flags[MODULE_ID].characterCreatorGrant = { quantity, reason };
  data.system ??= {};
  data.system.number = quantity;
  if (source.type === "armor") delete data.system.number;
  return data;
}

function actorMoneyUpdate(money) {
  return {
    "system.money.thaler": money.thaler,
    "system.money.shilling": money.shilling,
    "system.money.orteg": money.orteg
  };
}

function purchaseFailure(reason, details = {}) {
  return Object.freeze({ ok: false, reason, ...details });
}

function itemCopies(source, quantity, createData) {
  return source.type === "armor" ? Array.from({ length: quantity }, () => createData(1)) : [createData(quantity)];
}

function sourceReference(source) {
  if (!source) return null;
  return {
    uuid: source.uuid,
    ...(globalThis.game?.user?.isGM ? { snapshot: source.toObject?.() ?? structuredClone(source), documentName: source.documentName } : {})
  };
}

async function resolvePurchases(entries, user) {
  const result = [];
  for (const entry of entries) {
    const ref = entry?.source;
    if (!ref) return null;
    let source;
    if (ref.snapshot && user.isGM) {
      const snapshot = structuredClone(ref.snapshot);
      source = { ...snapshot, uuid: ref.uuid, documentName: ref.documentName, toObject: () => structuredClone(snapshot) };
    } else {
      if (ref.snapshot || typeof ref.uuid !== "string") return null;
      if (ref.uuid.startsWith("SymbaroumHudService.")) {
        source = findServiceDefinition(ref.uuid, globalThis.game.settings.get(MODULE_ID, SETTINGS.SERVICE_DEFINITIONS));
      } else {
        source = await globalThis.fromUuid?.(ref.uuid);
        if (!source?.testUserPermission?.(user, "OBSERVER")) return null;
      }
    }
    if (!source) return null;
    result.push({ ...entry, source });
  }
  return result;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

actorTransactions.register("shop.purchase", purchaseAsAuthority);
