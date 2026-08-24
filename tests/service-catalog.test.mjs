import assert from "node:assert/strict";
import test from "node:test";

globalThis.foundry = {
  applications: { api: { ApplicationV2: class {} } }
};
globalThis.game = {
  i18n: { lang: "pt-BR", localize: (key) => key }
};

const { filterServiceCatalog } = await import("../scripts/applications/service-catalog.mjs");

test("service catalog combines text, category, and catalog filters", () => {
  const cards = [
    card("guarda costas contrato", "contracts", "official"),
    card("balsa viagem", "travel", "custom")
  ];
  const count = { textContent: "" };
  const empty = { hidden: true };
  const root = {
    querySelectorAll: () => cards,
    querySelector: (selector) => selector.includes("visible") ? count : empty
  };
  assert.equal(filterServiceCatalog(root, {
    query: "guarda",
    category: "contracts",
    source: "official"
  }), 1);
  assert.equal(cards[0].hidden, false);
  assert.equal(cards[1].hidden, true);
  assert.equal(count.textContent, "1");
  assert.equal(empty.hidden, true);

  assert.equal(filterServiceCatalog(root, { query: "inexistente" }), 0);
  assert.equal(empty.hidden, false);
});

function card(search, category, catalog) {
  return { dataset: { search, category, catalog }, hidden: false };
}
