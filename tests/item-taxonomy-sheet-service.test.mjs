import assert from "node:assert/strict";
import test from "node:test";
import { ITEM_TAXONOMY_VERSION } from "../scripts/services/item-taxonomy-service.mjs";

globalThis.game = {
  user: { isGM: false },
  i18n: {
    localize: (key) => ({
      "SYMBAROUMHUD.ItemTaxonomy.Category": "Categoria",
      "SYMBAROUMHUD.ItemTaxonomy.AutomaticHint": "Categoria automática",
      "SYMBAROUMHUD.ItemTaxonomy.Categories.beverages": "Bebidas",
      "SYMBAROUMHUD.ItemTaxonomy.Categories.food-and-drink": "Comida e Bebida",
      "SYMBAROUMHUD.ItemTaxonomy.Categories.trade-goods": "Bens de Troca",
      "SYMBAROUMHUD.ItemTaxonomy.Categories.bows": "Arcos"
    })[key] ?? key,
    format: (key, data) => key === "SYMBAROUMHUD.ItemTaxonomy.AutomaticOption"
      ? `Automática (${data.category})`
      : key
  }
};

const {
  injectItemTaxonomyCategory,
  itemTaxonomyCategory
} = await import("../scripts/services/item-taxonomy-sheet-service.mjs");

test("returns the localized primary category stored on an item", () => {
  const item = taxonomyItem("beverages");
  assert.deepEqual(itemTaxonomyCategory(item), {
    primary: "beverages",
    label: "Bebidas",
    overridden: false
  });
});

test("adds Category as the final read-only field in the native Bonus tab", () => {
  const bonus = fakeElement("div");
  bonus.querySelector = () => null;
  const document = { createElement: (tagName) => fakeElement(tagName) };
  const root = {
    ownerDocument: document,
    querySelector: (selector) => selector.includes('data-tab="bonus"') ? bonus : null
  };

  const inserted = injectItemTaxonomyCategory({ item: taxonomyItem("beverages") }, root);

  assert.equal(inserted, true);
  assert.equal(bonus.children.length, 1);
  const row = bonus.children[0];
  assert.equal(row.className, "attribute symbaroum-hud-item-category");
  assert.equal(row.dataset.symbaroumHudItemCategory, "true");
  assert.equal(row.children[0].textContent, "Categoria");
  assert.equal(row.children[1].value, "Bebidas");
  assert.equal(row.children[1].readOnly, true);
  assert.equal(row.children[1].attributes["aria-readonly"], "true");
});

test("does not duplicate Category when more than one compatible render hook fires", () => {
  const bonus = fakeElement("div");
  bonus.querySelector = (selector) => selector.includes("data-symbaroum-hud-item-category")
    ? bonus.children[0] ?? null
    : null;
  const root = {
    ownerDocument: { createElement: (tagName) => fakeElement(tagName) },
    querySelector: (selector) => selector.includes('data-tab="bonus"') ? bonus : null
  };
  const app = { item: taxonomyItem("bows") };

  assert.equal(injectItemTaxonomyCategory(app, root), true);
  assert.equal(injectItemTaxonomyCategory(app, root), false);
  assert.equal(bonus.children.length, 1);
});

test("a GM edits the same multi-Category set used by the global manager", () => {
  game.user.isGM = true;
  const bonus = fakeElement("div");
  bonus.querySelector = () => null;
  const root = {
    ownerDocument: { createElement: (tagName) => fakeElement(tagName) },
    querySelector: (selector) => selector.includes('data-tab="bonus"') ? bonus : null
  };
  const item = taxonomyItem("beverages");
  item.flags["symbaroum-hud"].itemTaxonomyOverride = {
    version: 1,
    mode: "replace",
    categories: ["beverages", "trade-goods"]
  };

  injectItemTaxonomyCategory({ item }, root);
  const button = bonus.children[0].children[1];
  assert.equal(button.tagName, "button");
  assert.equal(button.type, "button");
  assert.equal(button.dataset.symbaroumHudItemCategoryEdit, "true");
  assert.match(button.value, /Bebidas/);
  assert.match(button.value, /Bens de Troca/);
  assert.equal(typeof button.listeners.click, "function");
  game.user.isGM = false;
});

function taxonomyItem(primary) {
  return {
    id: "item-id",
    documentName: "Item",
    type: primary === "bows" ? "weapon" : "equipment",
    flags: {
      "symbaroum-hud": {
        itemTaxonomy: { version: ITEM_TAXONOMY_VERSION, primary, tags: [primary], basis: ["system-type"] }
      }
    },
    system: {}
  };
}

function fakeElement(tagName) {
  return {
    tagName,
    className: "",
    dataset: {},
    attributes: {},
    children: [],
    listeners: {},
    append(...children) {
      this.children.push(...children);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }
  };
}
