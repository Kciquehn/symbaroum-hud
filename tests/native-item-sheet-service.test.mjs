import assert from "node:assert/strict";
import test from "node:test";

import {
  activateEmbeddedItemSheetActiveControls,
  renderEmbeddedItemSheet
} from "../scripts/services/native-item-sheet-service.mjs";

test("embedded Item sheets reuse the native template without an outer form", async () => {
  const originalFoundry = globalThis.foundry;
  let receivedData = null;
  globalThis.foundry = {
    applications: {
      handlebars: {
        async renderTemplate(_template, data) {
          receivedData = data;
          return `<form class="editable">
            <input name="name">
            <input name="system.novice.isActive" type="checkbox">
            <select name="system.novice.action"></select>
          </form>`;
        }
      }
    }
  };
  const item = {
    sheet: {
      options: { template: "systems/symbaroum/template/sheet/ability.hbs" },
      async getData() { return { item: { name: "Amoque" } }; }
    }
  };

  try {
    const html = await renderEmbeddedItemSheet(item, {
      enabledFields: ["system.novice.isActive"],
      isOwned: true
    });
    assert.doesNotMatch(html, /<\/?form/);
    assert.match(html, /<input disabled name="name">/);
    assert.match(html, /<input name="system\.novice\.isActive"/);
    assert.match(html, /<select disabled name="system\.novice\.action"/);
    assert.equal(receivedData.owner, false);
    assert.equal(receivedData.editable, false);
    assert.equal(receivedData.isOwned, true);
  } finally {
    globalThis.foundry = originalFoundry;
  }
});

test("native Ability checkboxes use the exact Mystical Power toggle component", () => {
  const iconClasses = new Set();
  const icon = {
    classList: {
      toggle: (name, active) => active ? iconClasses.add(name) : iconClasses.delete(name)
    }
  };
  let clickHandler = null;
  let dispatched = null;
  const button = {
    dataset: {},
    disabled: false,
    innerHTML: "",
    setAttribute(name, value) { this[name] = value; },
    querySelector: (selector) => selector === "i" ? icon : null,
    addEventListener: (_name, handler) => { clickHandler = handler; }
  };
  const label = { textContent: "Ativa", hidden: false };
  const wrapper = {
    decorated: null,
    querySelector(selector) {
      if (selector === "[data-native-ability-active-control]") return this.decorated;
      return selector.startsWith("label") ? label : null;
    },
    classList: { add: () => {} },
    append(element) { this.decorated = element; }
  };
  class FakeEvent {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles;
    }
  }
  const input = {
    id: "ability-system.novice.isActive",
    checked: true,
    disabled: false,
    hidden: false,
    closest: () => wrapper,
    dispatchEvent: (event) => { dispatched = event; },
    ownerDocument: {
      createElement: () => button,
      defaultView: { Event: FakeEvent }
    }
  };
  const host = { querySelectorAll: () => [input] };

  assert.equal(activateEmbeddedItemSheetActiveControls(host), true);
  assert.equal(button.className, "symbaroum-hud-ability-active-toggle");
  assert.equal(button.dataset.active, "true");
  assert.equal(button["aria-pressed"], "true");
  assert.equal(iconClasses.has("fa-square-check"), true);
  assert.equal(iconClasses.has("fa-square"), false);
  assert.equal(label.hidden, true);
  assert.equal(input.hidden, true);

  clickHandler();
  assert.equal(input.checked, false);
  assert.equal(button.dataset.active, "false");
  assert.equal(iconClasses.has("fa-square-check"), false);
  assert.equal(iconClasses.has("fa-square"), true);
  assert.equal(dispatched.type, "change");
  assert.equal(dispatched.bubbles, true);
});
