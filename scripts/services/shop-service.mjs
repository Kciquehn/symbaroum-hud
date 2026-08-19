import { ActorService } from "./actor-service.mjs";
import { MODULE_ID } from "../constants.mjs";

export const SHOP_ITEM_TYPES = new Set(["weapon", "armor", "equipment"]);

export const SHOP_MONEY_VALUES = Object.freeze({
  thaler: 100,
  shilling: 10,
  orteg: 1
});

const PURCHASE_LOCKS = new Map();
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
  return Boolean(
    entry?.documentClass === "Item"
    && SHOP_ITEM_TYPES.has(entry.type)
    && parseShopPrice(entry.cost)
  );
}

export class ShopService {
  static balance(actor) {
    const total = moneyToOrtegs(actor?.system?.money ?? {});
    return Object.freeze({ total, ...moneyFromOrtegs(total) });
  }

  static async purchase(actor, source, { amount = null } = {}) {
    if (!actor || !ActorService.canUpdate(actor)) return purchaseFailure("permission");
    if (!source || source.documentName !== "Item" || !SHOP_ITEM_TYPES.has(source.type)) {
      return purchaseFailure("unavailable");
    }

    const price = selectShopPrice(parseShopPrice(source.system?.cost), amount);
    if (!price) return purchaseFailure("invalidPrice");
    const lockKey = actor.uuid ?? actor.id;
    if (!lockKey) return purchaseFailure("unavailable");

    return enqueuePurchase(lockKey, async () => {
      const currentTotal = moneyToOrtegs(actor.system?.money ?? {});
      if (currentTotal < price.ortegs) {
        return purchaseFailure("insufficient", { price, balance: moneyFromOrtegs(currentTotal) });
      }

      const nextTotal = currentTotal - price.ortegs;
      const originalMoney = moneyFromOrtegs(currentTotal);
      const nextMoney = moneyFromOrtegs(nextTotal);
      await actor.update(actorMoneyUpdate(nextMoney));

      try {
        const created = await actor.createEmbeddedDocuments("Item", [purchasedItemData(source, price)]);
        return Object.freeze({
          ok: true,
          reason: null,
          item: created?.[0] ?? null,
          price,
          balance: nextMoney
        });
      } catch (error) {
        try {
          await actor.update(actorMoneyUpdate(originalMoney));
        } catch (rollbackError) {
          console.error("symbaroum-hud | Shop purchase rollback failed.", rollbackError);
        }
        throw error;
      }
    });
  }
}

function purchasedItemData(source, price) {
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
    sourcePrice: price.sourceRaw
  };
  data.system ??= {};
  data.system.cost = price.raw;
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

function enqueuePurchase(key, operation) {
  const previous = PURCHASE_LOCKS.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  PURCHASE_LOCKS.set(key, current);
  return current.finally(() => {
    if (PURCHASE_LOCKS.get(key) === current) PURCHASE_LOCKS.delete(key);
  });
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}
