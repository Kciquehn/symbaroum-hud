import assert from "node:assert/strict";
import test from "node:test";

import {
  MODULE_ID,
  SETTINGS,
  THEMES
} from "../scripts/constants.mjs";
import {
  applyHudTheme,
  getTheme,
  registerSettings
} from "../scripts/settings.mjs";

test("HUD theme is a hidden client setting with simplified as its default always", () => {
  const originalGame = globalThis.game;
  const registered = new Map();
  globalThis.game = {
    settings: {
      register(moduleId, key, data) {
        assert.equal(moduleId, MODULE_ID);
        registered.set(key, data);
      },
      get: () => false
    }
  };

  try {
    registerSettings(() => {});
    const setting = registered.get(SETTINGS.THEME);
    assert.ok(setting, "Setting for HUD theme must be registered");
    assert.equal(setting.scope, "client");
    assert.equal(setting.config, false);
    assert.equal(setting.type, String);
    assert.equal(setting.default, THEMES.SIMPLIFIED);
    assert.equal(setting.choices, undefined);
    assert.equal(typeof setting.onChange, "function");
  } finally {
    globalThis.game = originalGame;
  }
});

test("getTheme returns simplified by default and always resolves simplified", () => {
  const originalGame = globalThis.game;
  let activeTheme = THEMES.CLASSIC;
  globalThis.game = {
    settings: {
      get: (_moduleId, key) => key === SETTINGS.THEME ? activeTheme : false
    }
  };

  try {
    assert.equal(getTheme(), THEMES.SIMPLIFIED);
    activeTheme = THEMES.SIMPLIFIED;
    assert.equal(getTheme(), THEMES.SIMPLIFIED);
    activeTheme = "unknown-theme";
    assert.equal(getTheme(), THEMES.SIMPLIFIED);
  } finally {
    globalThis.game = originalGame;
  }
});

test("applyHudTheme updates document body and hud element dataset and classes to simplified", () => {
  const originalDocument = globalThis.document;
  const originalGame = globalThis.game;

  const mockBody = {
    dataset: {},
    classList: {
      tokens: new Set(),
      toggle(name, value) {
        if (value) this.tokens.add(name);
        else this.tokens.delete(name);
      },
      contains(name) {
        return this.tokens.has(name);
      }
    }
  };

  const mockHud = {
    dataset: {},
    classList: {
      tokens: new Set(),
      toggle(name, value) {
        if (value) this.tokens.add(name);
        else this.tokens.delete(name);
      },
      contains(name) {
        return this.tokens.has(name);
      }
    }
  };

  globalThis.document = {
    body: mockBody,
    getElementById(id) {
      return id === "symbaroum-hud" ? mockHud : null;
    }
  };

  globalThis.game = {
    settings: {
      get: () => THEMES.SIMPLIFIED
    }
  };

  try {
    applyHudTheme();
    assert.equal(mockBody.dataset.symbaroumHudTheme, THEMES.SIMPLIFIED);
    assert.equal(mockHud.dataset.symbaTheme, THEMES.SIMPLIFIED);
    assert.equal(mockHud.classList.contains("symbaroum-hud--simplified"), true);
    assert.equal(mockHud.classList.contains("symbaroum-hud--classic"), false);

    applyHudTheme(THEMES.CLASSIC);
    assert.equal(mockBody.dataset.symbaroumHudTheme, THEMES.SIMPLIFIED);
    assert.equal(mockHud.dataset.symbaTheme, THEMES.SIMPLIFIED);
    assert.equal(mockHud.classList.contains("symbaroum-hud--simplified"), true);
    assert.equal(mockHud.classList.contains("symbaroum-hud--classic"), false);
  } finally {
    globalThis.document = originalDocument;
    globalThis.game = originalGame;
  }
});

test("simplified HUD template contains character name header without cycle arrows", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const template = fs.readFileSync(path.resolve("templates/hud.hbs"), "utf8");

  const simplifiedPart = template.substring(
    template.indexOf("{{#if isSimplified}}"),
    template.lastIndexOf("{{#if hasStatusSummary}}")
  );
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-portrait-card"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-character-name"));
  assert.ok(!simplifiedPart.includes('data-action="previous-actor"'));
  assert.ok(!simplifiedPart.includes('data-action="next-actor"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-owned-actor-picker"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-character-resources"));
  assert.ok(simplifiedPart.includes('data-action="modify-vitality"'));
  assert.ok(simplifiedPart.includes('data-action="modify-corruption"'));
  assert.ok(simplifiedPart.includes('data-action="set-actor"'));
  assert.ok(simplifiedPart.includes('data-action="rest"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-attributes"));
  assert.ok(simplifiedPart.includes('data-action="roll-attribute"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-actions-btn"));
  assert.ok(simplifiedPart.includes('data-action="toggle-simplified-actions"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-actions-panel"));
  assert.ok(simplifiedPart.includes('data-action="close-simplified-actions"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-action-list"));
  assert.ok(simplifiedPart.includes('data-action="roll-weapon"'));
  assert.ok(simplifiedPart.includes('data-action="use-ability"'));
  assert.ok(simplifiedPart.includes('data-action="use-mystical-power"'));

  const actionsPanelPart = simplifiedPart.substring(
    simplifiedPart.indexOf("symbaroum-hud-simplified-actions-panel")
  );
  assert.ok(!actionsPanelPart.includes("{{#unless ../actions.attributes}}disabled{{/unless}}"));
  assert.ok(!actionsPanelPart.includes("{{#unless ../attacks.canUse}}disabled{{/unless}}"));
  assert.ok(actionsPanelPart.includes("{{#unless canUse}}disabled{{/unless}}"));
});

test("simplified HUD template contains inventory button and inventory panel with wealth bar and controls", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const template = fs.readFileSync(path.resolve("templates/hud.hbs"), "utf8");

  const simplifiedPart = template.substring(
    template.indexOf("{{#if isSimplified}}"),
    template.lastIndexOf("{{#if hasStatusSummary}}")
  );

  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-inventory-btn"));
  assert.ok(simplifiedPart.includes('data-action="toggle-simplified-inventory"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-inventory-panel"));
  assert.ok(simplifiedPart.includes('data-action="close-simplified-inventory"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-wealth-bar"));
  assert.ok(simplifiedPart.includes('data-action="open-money"'));
  assert.ok(simplifiedPart.includes('data-action="open-shop"'));
  assert.ok(simplifiedPart.includes('data-action="toggle-armor-equip"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-item-img-btn"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-item-name-btn"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-inventory-grid"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-inventory-col"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-col-section"));
  assert.ok(simplifiedPart.includes('data-action="use-item"'));
  assert.ok(simplifiedPart.includes('data-action="open-item"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-load-track"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-load-fill"));
});

test("simplified HUD template contains container expansion, stored items, withdraw action, and drag-and-drop", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const template = fs.readFileSync(path.resolve("templates/hud.hbs"), "utf8");

  const simplifiedPart = template.substring(
    template.indexOf("{{#if isSimplified}}"),
    template.lastIndexOf("{{#if hasStatusSummary}}")
  );

  assert.ok(simplifiedPart.includes('data-action="toggle-simplified-container"'));
  assert.ok(simplifiedPart.includes('data-action="withdraw-from-container"'));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-container-group"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-container-children"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-stored-item-row"));
  assert.ok(simplifiedPart.includes('data-storage-draggable="true"'));
  assert.ok(simplifiedPart.includes('data-storage-drop-container='));
  assert.ok(simplifiedPart.includes('data-storage-inventory-drop="true"'));
});

test("simplifiedInventoryContext builds 3 columns correctly without error", async () => {
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class {}
      }
    }
  };
  globalThis.game = {
    i18n: {
      lang: "pt-BR",
      localize: (key) => key
    }
  };

  const { simplifiedInventoryContext } = await import("../scripts/applications/symbaroum-hud.mjs");

  const mockActor = {
    id: "actor-1",
    uuid: "Actor.actor-1",
    system: {
      money: { thaler: 5, shilling: 12, orteg: 3 },
      weapons: [
        { id: "wpn-1", name: "Espada Longa", uuid: "Item.wpn-1", damage: { displayTextShort: "1D8" } }
      ],
      armors: [
        { id: "arm-1", name: "Armadura de Couro", uuid: "Item.arm-1", displayTextShort: "1D4", isActive: true }
      ]
    },
    items: [
      { id: "wpn-1", name: "Espada Longa", type: "weapon", uuid: "Item.wpn-1" },
      { id: "arm-1", name: "Armadura de Couro", type: "armor", uuid: "Item.arm-1" },
      { id: "cnt-1", name: "Mochila de Couro", type: "equipment", uuid: "Item.cnt-1", system: { isContainer: true } },
      { id: "item-stored", name: "Tocha", type: "equipment", uuid: "Item.item-stored", flags: { "symbaroum-ind-resources": { storedIn: "cnt-1" } } },
      { id: "item-cantil", name: "Cantil", type: "equipment", uuid: "Item.item-cantil" },
      { id: "item-bedroll", name: "Saco de Dormir", type: "equipment", uuid: "Item.item-bedroll" },
      { id: "item-gen", name: "Corda de Seda", type: "equipment", uuid: "Item.item-gen" }
    ]
  };

  const context = simplifiedInventoryContext(mockActor, { canRollActor: true });

  assert.equal(context.isEmpty, false);
  assert.equal(context.money.thaler, 5);
  assert.equal(context.money.shilling, 12);
  assert.equal(context.money.orteg, 3);

  // Column 1: Weapons & Shields, Armors
  assert.equal(context.column1.hasWeapons, true);
  assert.equal(context.column1.weapons.length, 1);
  assert.equal(context.column1.weapons[0].id, "wpn-1");
  assert.equal(context.column1.hasArmors, true);
  assert.equal(context.column1.armors.length, 1);
  assert.equal(context.column1.armors[0].id, "arm-1");

  // Column 2: Containers
  assert.equal(context.column2.hasContainers, true);
  assert.equal(context.column2.containers.length, 1);
  assert.equal(context.column2.containers[0].id, "cnt-1");
  assert.equal(context.column2.containers[0].name, "Mochila de Couro");
  assert.equal(context.column2.containers[0].items.length, 1);
  assert.equal(context.column2.containers[0].items[0].id, "item-stored");

  // Column 3: General inventory (Cantil, Saco de Dormir, Corda de Seda - NOT Mochila, NOT Tocha, NOT Espada, NOT Armadura)
  assert.equal(context.column3.hasItems, true);
  const col3Ids = context.column3.items.map((i) => i.id);
  assert.ok(col3Ids.includes("item-cantil"), "Cantil should be in Column 3 (general inventory)");
  assert.ok(col3Ids.includes("item-bedroll"), "Saco de Dormir should be in Column 3 (general inventory)");
  assert.ok(col3Ids.includes("item-gen"), "Corda de Seda should be in Column 3 (general inventory)");
  assert.ok(!col3Ids.includes("wpn-1"), "Weapon should not be in Column 3");
  assert.ok(!col3Ids.includes("arm-1"), "Armor should not be in Column 3");
  assert.ok(!col3Ids.includes("cnt-1"), "Container should not be in Column 3");
});

test("simplifiedInventoryContext resolves uses for Pão de viagem and other items with uses", async () => {
  const { simplifiedInventoryContext, resolveItemUses } = await import("../scripts/applications/symbaroum-hud.mjs");

  const actorWithoutFlags = {
    id: "actor-2",
    items: [
      { id: "item-pao", name: "Pão de viagem", type: "equipment", system: { number: 1 } },
      { id: "item-corda", name: "Corda", type: "equipment", system: { number: 1 } },
      { id: "item-potion", name: "Poção de Vida", type: "equipment", system: { uses: { value: 2, max: 3 } } }
    ]
  };

  assert.equal(resolveItemUses({ name: "Pão de viagem", system: { number: 1 } }, actorWithoutFlags), "4/4");
  assert.equal(resolveItemUses({ name: "Corda", system: { number: 1 } }, actorWithoutFlags), null);
  assert.equal(resolveItemUses({ name: "Poção de Vida", system: { uses: { value: 2, max: 3 } } }, actorWithoutFlags), "2/3");

  // Actor with custom ration flag (e.g. 3 uses remaining on travelBread)
  const actorWithRationFlag = {
    id: "actor-3",
    getFlag: (scope, key) => {
      if (scope === "symbaroum-ind-resources" && key === "rations") {
        return { usesRemaining: 3, quantity: 1 };
      }
      return null;
    },
    items: [
      { id: "item-pao-2", name: "Pão de viagem", type: "equipment", system: { number: 1 } }
    ]
  };

  assert.equal(resolveItemUses({ name: "Pão de viagem", system: { number: 1 } }, actorWithRationFlag), "3/4");

  const context = simplifiedInventoryContext(actorWithRationFlag, { canRollActor: true });
  assert.equal(context.column3.hasItems, true);
  const paoItem = context.column3.items.find((i) => i.id === "item-pao-2");
  assert.ok(paoItem, "Pão de viagem should be present in Column 3");
  assert.equal(paoItem.uses, "3/4");
});

test("simplifiedInventoryContext puts loose arrows in Inventário and treats Aljava as a 12-arrow quiver container", async () => {
  const { simplifiedInventoryContext, isAmmoItem, isQuiverItem } = await import("../scripts/applications/symbaroum-hud.mjs");

  assert.equal(isAmmoItem({ name: "Flechas" }), true);
  assert.equal(isAmmoItem({ name: "Virote" }), true);
  assert.equal(isAmmoItem({ name: "Arco Longo" }), false);
  assert.equal(isQuiverItem({ name: "Aljava de Couro" }), true);
  assert.equal(isQuiverItem({ name: "Mochila" }), false);

  const mockActor = {
    id: "actor-archer",
    uuid: "Actor.actor-archer",
    system: {
      weapons: [
        { id: "bow-1", name: "Arco Curto", uuid: "Item.bow-1", damage: { displayTextShort: "1D6" } }
      ]
    },
    items: [
      { id: "bow-1", name: "Arco Curto", type: "weapon", uuid: "Item.bow-1" },
      { id: "quiver-1", name: "Aljava de Couro", type: "equipment", uuid: "Item.quiver-1", system: { number: 1 }, flags: { "symbaroum-ind-resources": { loadedAmmo: [{ id: "l1", name: "Flechas", quantity: 5 }] } } },
      { id: "loose-arrows", name: "Flechas", type: "equipment", uuid: "Item.loose-arrows", system: { number: 15 } }
    ]
  };

  const context = simplifiedInventoryContext(mockActor, { canRollActor: true });

  // 1. Column 1 (Weapons): only the bow, NOT the arrows or quiver
  assert.equal(context.column1.hasWeapons, true);
  assert.equal(context.column1.weapons.length, 1);
  assert.equal(context.column1.weapons[0].id, "bow-1");

  // 2. Column 2 (Containers): Aljava is a quiver container with capacity 5/12
  assert.equal(context.column2.hasContainers, true);
  const quiver = context.column2.containers.find((c) => c.id === "quiver-1");
  assert.ok(quiver, "Aljava should be in Column 2 containers");
  assert.equal(quiver.isQuiver, true);
  assert.equal(quiver.capacity, "5/12");
  assert.equal(quiver.canReloadQuiver, true);
  assert.equal(quiver.items.length, 1);
  assert.equal(quiver.items[0].quantity, 5);

  // 3. Column 3 (Inventário): loose arrows appear in Inventário
  assert.equal(context.column3.hasItems, true);
  const looseArrows = context.column3.items.find((i) => i.id === "loose-arrows");
  assert.ok(looseArrows, "Loose arrows must appear in Column 3 (Inventário)");
  assert.equal(looseArrows.quantity, 15);
});

test("simplifiedPowersContext includes all abilities, mystical powers, rituals, and traits with tiers", async () => {
  const { simplifiedPowersContext } = await import("../scripts/applications/symbaroum-hud.mjs");

  const mockActor = {
    id: "actor-mage",
    uuid: "Actor.actor-mage",
    items: [
      {
        id: "ab-1",
        name: "Homem-de-Armas",
        system: {
          isPower: true,
          novice: { isActive: true, action: "passive", description: "Armadura passiva" },
          adept: { isActive: false },
          master: { isActive: false }
        }
      },
      {
        id: "pow-1",
        name: "Anátema Larval",
        type: "mysticalPower",
        system: {
          isPower: true,
          novice: { isActive: true },
          adept: { isActive: true, action: "active", description: "Causa dano larval" },
          master: { isActive: false }
        }
      },
      {
        id: "rit-1",
        name: "Círculo de Proteção",
        type: "ritual",
        system: {
          description: "Cria um círculo místico"
        }
      },
      {
        id: "trait-1",
        name: "Visão Noturna",
        type: "trait",
        system: {
          isPower: true,
          novice: { isActive: true, action: "passive" }
        }
      }
    ]
  };

  const context = simplifiedPowersContext(mockActor, { canRollActor: true });
  assert.equal(context.isEmpty, false);
  assert.equal(context.hasAbilities, true);
  assert.equal(context.hasMysticalPowers, true);
  assert.equal(context.hasRituals, true);
  assert.equal(context.hasTraits, true);

  assert.equal(context.abilities.length, 1);
  assert.equal(context.abilities[0].name, "Homem-de-Armas");
  assert.equal(context.abilities[0].tier, "novice");

  assert.equal(context.mysticalPowers.length, 1);
  assert.equal(context.mysticalPowers[0].name, "Anátema Larval");
  assert.equal(context.mysticalPowers[0].tier, "adept");

  assert.equal(context.rituals.length, 1);
  assert.equal(context.rituals[0].name, "Círculo de Proteção");

  assert.equal(context.traits.length, 1);
  assert.equal(context.traits[0].name, "Visão Noturna");

  // Check PF2e multi-column structure
  assert.equal(context.hasColumn1, true);
  assert.equal(context.hasColumn2, true);
  assert.equal(context.column1.sections.length, 2); // Habilidades and Traços
  assert.equal(context.column2.sections.length, 2); // Poderes Místicos and Rituais

  // Test card selection
  const selectedContext = simplifiedPowersContext(mockActor, { canRollActor: true, selectedItemId: "pow-1" });
  assert.ok(selectedContext.selectedCard);
  assert.equal(selectedContext.selectedCard.name, "Anátema Larval");
  assert.equal(selectedContext.selectedCard.description, "Causa dano larval");
  assert.equal(selectedContext.selectedCard.actorName, undefined); // mockActor name is undefined so it's undefined
});

test("simplified HUD template includes active effects strip above portrait card", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const template = fs.readFileSync(path.resolve("templates/hud.hbs"), "utf8");

  const simplifiedPart = template.substring(
    template.indexOf("{{#if isSimplified}}"),
    template.lastIndexOf("{{#if hasStatusSummary}}")
  );

  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-effects-strip"));
  assert.ok(simplifiedPart.includes("symbaroum-hud-simplified-effect"));
  assert.ok(simplifiedPart.includes('data-action="open-effect-menu"'));
  assert.ok(simplifiedPart.includes('data-effect-id="{{id}}"'));
});

test("simplified HUD stylesheet styles hotbar action bar and positions right controls to the right of slots", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const css = fs.readFileSync(path.resolve("styles/symbaroum-hud.css"), "utf8");

  assert.match(css, /body\[data-symbaroum-hud-theme="simplified"\] #hotbar #action-bar/);
  assert.match(css, /#symbaroum-hud\.symbaroum-hud--simplified #hotbar #hotbar-controls-right/);
  assert.match(css, /margin-left:\s*16px/);
  assert.match(css, /#hotbar #hotbar-page-controls/);
  assert.match(css, /#hotbar #hotbar-controls-right button\.ui-control/);
});

test("simplified HUD template uses open-item action and draggable items for abilities, powers, and traits, and stylesheet enforces containment", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const template = fs.readFileSync(path.resolve("templates/hud.hbs"), "utf8");
  const css = fs.readFileSync(path.resolve("styles/symbaroum-hud.css"), "utf8");

  const powersPanelStart = template.indexOf('symbaroum-hud-simplified-powers-panel');
  const powersPart = template.substring(powersPanelStart, powersPanelStart + 3500);

  assert.ok(powersPart.includes('class="symbaroum-hud-simplified-pf2-item'));
  assert.ok(powersPart.includes('data-action="open-item"'));
  assert.ok(powersPart.includes('draggable="true" data-ability-draggable="true"'));
  assert.ok(!powersPart.includes('data-action="select-power-card"'));

  assert.match(css, /button\.symbaroum-hud-simplified-pf2-item\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /button\.symbaroum-hud-simplified-pf2-item\s*\{[^}]*min-height:\s*38px/);
  assert.match(css, /\.symbaroum-hud-simplified-pf2-img\s*\{[^}]*box-sizing:\s*border-box/);
});

test("simplified HUD sidebar contains toggle-players button and stylesheet styles players close button and control overflow", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const template = fs.readFileSync(path.resolve("templates/hud.hbs"), "utf8");
  const css = fs.readFileSync(path.resolve("styles/symbaroum-hud.css"), "utf8");

  const sidebarStart = template.indexOf('class="symbaroum-hud-simplified-sidebar"');
  assert.ok(sidebarStart > -1, "Simplified sidebar must exist in template");
  const sidebarPart = template.substring(sidebarStart, sidebarStart + 2500);

  assert.ok(sidebarPart.includes('data-action="toggle-players"'), "Sidebar must have toggle-players button");
  assert.ok(sidebarPart.includes('fa-users'), "Sidebar toggle-players must render fa-users / fa-users-slash icon");

  assert.match(css, /#scene-controls[\s\S]*overflow:\s*visible\s*!important/);
  assert.match(css, /#players \.symbaroum-hud-players-close-btn/);
  assert.match(css, /\.symbaroum-hud-simplified-sidebar\s*\{[^}]*min-height:\s*168px/);
});

test("simplified HUD info bar chips are sized equally and aligned with action buttons below", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const css = fs.readFileSync(path.resolve("styles/symbaroum-hud.css"), "utf8");

  assert.match(css, /#symbaroum-hud \.symbaroum-hud-simplified-info-bar\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*calc\(\(100% - 12px\) \/ 3\)\)/);
  assert.match(css, /#symbaroum-hud button\.symbaroum-hud-simplified-info-chip\s*\{[^}]*width:\s*100%/);
});




