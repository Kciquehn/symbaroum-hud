import assert from "node:assert/strict";
import test from "node:test";

const warnings = [];
const chatMessages = [];
globalThis.game = {
  user: { id: "user" },
  i18n: {
    localize: (key) => key,
    format: (key, data) => `${key}:${data.name}`
  },
  settings: { get: () => "publicroll" },
  symbaroum: { config: { expCosts: { power: { novice: 10 } } } }
};
globalThis.foundry = {
  applications: {
    handlebars: {
      renderTemplate: async (_path, data) => JSON.stringify(data)
    }
  },
  utils: {
    deepClone: (value) => structuredClone(value),
    escapeHTML: (value) => String(value),
    getProperty: (object, property) => property.split(".")
      .reduce((value, key) => value?.[key], object)
  }
};
Math.clamp ??= (value, min, max) => Math.min(max, Math.max(min, value));
globalThis.ui = {
  notifications: {
    warn: (message) => warnings.push(message)
  }
};
globalThis.ChatMessage = {
  create: async (message) => chatMessages.push(message),
  getWhisperRecipients: () => ["gm"]
};
globalThis.CONFIG = {
  statusEffects: [{ id: "dead", img: "dead.webp" }]
};
globalThis.canvas = { tokens: { controlled: [] } };

const { ActorService, hasPowerLevels } = await import("../scripts/services/actor-service.mjs");

test("monster traits expose their novice, adept and master levels", () => {
  assert.equal(hasPowerLevels({
    type: "trait",
    system: { isPower: true, isTrait: true, hasLevels: true }
  }), true);
  assert.equal(hasPowerLevels({
    type: "trait",
    system: { isPower: true, isTrait: true }
  }), true);
});

test("boons, burdens and marker traits remain level-less", () => {
  assert.equal(hasPowerLevels({
    type: "boon",
    system: { isPower: true, isBoon: true, hasLevels: false }
  }), false);
  assert.equal(hasPowerLevels({
    type: "burden",
    system: { isPower: true, isBurden: true }
  }), false);
  assert.equal(hasPowerLevels({
    type: "trait",
    system: { isPower: true, isTrait: true, hasLevels: true, marker: true }
  }), false);
});

function actor({ owner = true } = {}) {
  const calls = [];
  const power = {
    id: "power",
    type: "ability",
    system: {
      isPower: true,
      hasScript: true,
      reference: "power",
      novice: { isActive: true, action: "A" }
    },
    update: async (changes) => calls.push(["item-update", changes])
  };
  const trait = {
    id: "trait",
    type: "trait",
    system: {
      isPower: true,
      hasScript: true,
      isTrait: true,
      novice: { isActive: true, action: "A" }
    },
    update: async (changes) => calls.push(["trait-update", changes])
  };
  const ritual = {
    id: "known-ritual",
    type: "ritual",
    name: "Known Ritual",
    system: {
      isRitual: true,
      reference: "knownritual"
    }
  };
  const effect = {
    id: "effect",
    delete: async () => calls.push(["delete-effect", "effect"])
  };
  return {
    id: "actor",
    name: "Hero",
    img: "hero.webp",
    hasPlayerOwner: true,
    uuid: "Actor.actor",
    type: "player",
    system: {
      attributes: { strong: { total: 12 } },
      experience: {
        total: 10,
        spent: 3,
        available: 7,
        artifactrr: 0
      },
      health: {
        toughness: {
          value: 6,
          max: 10
        },
        corruption: {
          temporary: 4,
          permanent: 1,
          threshold: 6,
          value: 5,
          max: 10
        }
      },
      weapons: [{ id: "weapon", name: "Sword" }]
    },
    items: new Map([
      ["power", power],
      ["trait", trait],
      ["known-ritual", ritual]
    ]),
    effects: new Map([["effect", effect]]),
    testUserPermission: (_user, permission) => permission === "OBSERVER" || owner,
    rollAttribute: async (attribute) => calls.push(["attribute", attribute]),
    rollArmor: async () => calls.push(["armor"]),
    rollWeapon: async (weapon) => calls.push(["weapon", weapon.id]),
    usePower: async (item) => calls.push(["power", item.id]),
    createEmbeddedDocuments: async (type, data) => {
      calls.push(["create", type, data]);
      return data.map((source, index) => ({ id: `created-${index}`, ...source }));
    },
    update: async (changes) => calls.push(["update", changes]),
    calls
  };
}

test("a controlled token overrides the configured selection mode for the GM", () => {
  const controlled = actor();
  controlled.id = "controlled";
  controlled.uuid = "Actor.controlled";
  const combat = actor();
  combat.id = "combat";
  combat.uuid = "Actor.combat";
  const assigned = actor();
  assigned.id = "assigned";
  assigned.uuid = "Actor.assigned";
  const originalUser = game.user;
  const originalCombat = game.combat;
  const originalControlled = canvas.tokens.controlled;

  game.user = { ...originalUser, isGM: true, character: assigned };
  game.combat = { combatant: { actor: combat } };
  canvas.tokens.controlled = [{ actor: controlled }];

  try {
    assert.equal(ActorService.resolve("combat"), controlled);
    assert.equal(ActorService.resolve("character"), controlled);
  } finally {
    game.user = originalUser;
    game.combat = originalCombat;
    canvas.tokens.controlled = originalControlled;
  }
});

test("players continue to follow the configured selection mode", () => {
  const controlled = actor();
  const combat = actor();
  combat.id = "combat";
  const originalUser = game.user;
  const originalCombat = game.combat;
  const originalControlled = canvas.tokens.controlled;

  game.user = { ...originalUser, isGM: false };
  game.combat = { combatant: { actor: combat } };
  canvas.tokens.controlled = [{ actor: controlled }];

  try {
    assert.equal(ActorService.resolve("combat"), combat);
  } finally {
    game.user = originalUser;
    game.combat = originalCombat;
    canvas.tokens.controlled = originalControlled;
  }
});

test("owned actor actions delegate to the native Symbaroum methods", async () => {
  const owned = actor();
  await ActorService.rollAttribute(owned, "strong");
  await ActorService.rollArmor(owned);
  await ActorService.rollWeapon(owned, "weapon");
  await ActorService.usePower(owned, "power");

  assert.deepEqual(owned.calls, [
    ["attribute", "strong"],
    ["armor"],
    ["weapon", "weapon"],
    ["power", "power"]
  ]);
});

test("recovery uses the same failed-death-roll reset as the native sheet", async () => {
  const owned = actor();
  await ActorService.recoverDeath(owned);

  assert.deepEqual(owned.calls, [
    ["update", { "system.nbrOfFailedDeathRoll": 0 }]
  ]);
});

test("effect removal delegates to the embedded Active Effect document", async () => {
  const owned = actor();
  await ActorService.removeEffect(owned, "effect");

  assert.deepEqual(owned.calls, [["delete-effect", "effect"]]);
});

test("ability level activation updates the embedded item document", async () => {
  const owned = actor();
  await ActorService.setAbilityLevelActive(owned, "power", "novice", true);

  assert.deepEqual(owned.calls, [
    ["item-update", { "system.novice.isActive": true }]
  ]);
});

test("trait-like items can be used but cannot be activated as ability levels", async () => {
  const owned = actor();
  await ActorService.usePower(owned, "trait");
  await ActorService.setAbilityLevelActive(owned, "trait", "novice", true);

  assert.deepEqual(owned.calls, [["power", "trait"]]);
});

test("world ability picker lists only accessible unowned abilities", () => {
  const owned = actor();
  game.items = [
    {
      id: "alchemy",
      name: "Alquimia",
      type: "ability",
      system: { reference: "alchemy" },
      testUserPermission: () => true
    },
    {
      id: "known",
      name: "Known",
      type: "ability",
      system: { reference: "power" },
      testUserPermission: () => true
    },
    {
      id: "hidden",
      name: "Hidden",
      type: "ability",
      system: { reference: "hidden" },
      testUserPermission: () => false
    }
  ];

  assert.deepEqual(
    ActorService.availableWorldAbilities(owned).map((item) => item.id),
    ["alchemy"]
  );
});

test("buying a world ability copies it as an active novice embedded item", async () => {
  warnings.length = 0;
  const owned = actor();
  owned.system.experience.available = 10;
  game.items = [
    {
      id: "alchemy",
      name: "Alquimia",
      type: "ability",
      img: "alchemy.webp",
      system: {
        reference: "alchemy",
        novice: { isActive: false },
        adept: { isActive: true },
        master: { isActive: true }
      },
      testUserPermission: () => true,
      toObject: () => ({
        _id: "alchemy",
        name: "Alquimia",
        type: "ability",
        img: "alchemy.webp",
        system: {
          reference: "alchemy",
          novice: { isActive: false },
          adept: { isActive: true },
          master: { isActive: true }
        }
      })
    }
  ];

  const created = await ActorService.buyWorldAbility(owned, "alchemy");

  assert.equal(created.id, "created-0");
  assert.deepEqual(owned.calls, [
    [
      "create",
      "Item",
      [
        {
          name: "Alquimia",
          type: "ability",
          img: "alchemy.webp",
          system: {
            reference: "alchemy",
            novice: { isActive: true },
            adept: { isActive: false },
            master: { isActive: false }
          }
        }
      ]
    ]
  ]);
});

test("buying a world ability requires enough available XP", async () => {
  warnings.length = 0;
  const owned = actor();
  owned.system.experience.available = 0;
  game.items = [
    {
      id: "alchemy",
      name: "Alquimia",
      type: "ability",
      system: { reference: "alchemy" },
      testUserPermission: () => true,
      toObject: () => ({
        name: "Alquimia",
        type: "ability",
        system: { reference: "alchemy" }
      })
    }
  ];

  await ActorService.buyWorldAbility(owned, "alchemy");

  assert.deepEqual(owned.calls, []);
  assert.equal(warnings.at(-1), "SYMBAROUMHUD.Notifications.NotEnoughExperience");
});

test("world ritual picker lists only accessible unowned rituals", () => {
  const owned = actor();
  game.items = [
    {
      id: "ritual",
      name: "Ritual Novo",
      type: "ritual",
      system: { isRitual: true, reference: "newritual" },
      testUserPermission: () => true
    },
    {
      id: "known",
      name: "Known Ritual",
      type: "ritual",
      system: { isRitual: true, reference: "knownritual" },
      testUserPermission: () => true
    },
    {
      id: "hidden",
      name: "Hidden Ritual",
      type: "ritual",
      system: { isRitual: true, reference: "hiddenritual" },
      testUserPermission: () => false
    }
  ];

  assert.deepEqual(
    ActorService.availableWorldRituals(owned).map((item) => item.id),
    ["ritual"]
  );
});

test("buying a world ritual copies it as an embedded item", async () => {
  warnings.length = 0;
  const owned = actor();
  game.items = [
    {
      id: "ritual",
      name: "Ritual Novo",
      type: "ritual",
      img: "ritual.webp",
      system: { isRitual: true, reference: "newritual" },
      testUserPermission: () => true,
      toObject: () => ({
        _id: "ritual",
        name: "Ritual Novo",
        type: "ritual",
        img: "ritual.webp",
        system: { isRitual: true, reference: "newritual" }
      })
    }
  ];

  const created = await ActorService.buyWorldRitual(owned, "ritual");

  assert.equal(created.id, "created-0");
  assert.deepEqual(owned.calls, [
    [
      "create",
      "Item",
      [
        {
          name: "Ritual Novo",
          type: "ritual",
          img: "ritual.webp",
          system: { isRitual: true, reference: "newritual" }
        }
      ]
    ]
  ]);
});

test("imports dropped traits, boons and burdens into the actor", async () => {
  warnings.length = 0;
  const owned = actor();
  const droppedItems = new Map([
    ["Item.trait", { name: "Trait", type: "trait", system: { isTrait: true } }],
    ["Item.boon", { name: "Boon", type: "boon", system: { isBoon: true } }],
    ["Item.burden", { name: "Burden", type: "burden", system: { isBurden: true } }],
    ["Item.ability", { name: "Ability", type: "ability", system: { isPower: true } }]
  ]);
  const previousItem = globalThis.Item;
  globalThis.Item = {
    implementation: {
      fromDropData: async ({ uuid }) => {
        const source = droppedItems.get(uuid);
        return source
          ? {
              ...source,
              documentName: "Item",
              parent: null,
              testUserPermission: () => true,
              toObject: () => ({ _id: uuid, ...structuredClone(source) })
            }
          : null;
      }
    }
  };

  try {
    await ActorService.importTraitLikeItem(owned, { type: "Item", uuid: "Item.trait" });
    await ActorService.importTraitLikeItem(owned, { type: "Item", uuid: "Item.boon" });
    await ActorService.importTraitLikeItem(owned, { type: "Item", uuid: "Item.burden" });
    await ActorService.importTraitLikeItem(owned, { type: "Item", uuid: "Item.ability" });
  } finally {
    if (previousItem === undefined) delete globalThis.Item;
    else globalThis.Item = previousItem;
  }

  const importedTypes = owned.calls
    .filter(([action]) => action === "create")
    .map(([, , data]) => data[0].type);
  assert.deepEqual(importedTypes, ["trait", "boon", "burden"]);
  assert.equal(warnings.at(-1), "SYMBAROUMHUD.Notifications.OnlyTraits");
});

test("passive or unscripted powers cannot be used as HUD abilities", async () => {
  const owned = actor();
  const passive = {
    id: "passive",
    system: {
      isPower: true,
      hasScript: true,
      novice: { isActive: true, action: "P" }
    }
  };
  const unscripted = {
    id: "unscripted",
    system: {
      isPower: true,
      hasScript: false,
      novice: { isActive: true, action: "A" }
    }
  };
  owned.items.set(passive.id, passive);
  owned.items.set(unscripted.id, unscripted);

  await ActorService.usePower(owned, "passive");
  await ActorService.usePower(owned, "unscripted");

  assert.deepEqual(owned.calls, []);
});

test("reroll cost uses the native Symbaroum experience and permanent corruption fields", async () => {
  chatMessages.length = 0;
  const owned = actor();
  await ActorService.payRerollCost(owned, "experience");
  await ActorService.payRerollCost(owned, "corruption");

  assert.deepEqual(owned.calls, [
    ["update", { "system.experience.artifactrr": 1 }],
    ["update", { "system.health.corruption.permanent": 2 }]
  ]);
  assert.equal(chatMessages.length, 2);
  assert.equal(chatMessages[0].speaker.actor, "actor");
});

test("reroll cost does not spend XP when none is available", async () => {
  warnings.length = 0;
  const owned = actor();
  owned.system.experience.available = 0;
  await ActorService.payRerollCost(owned, "experience");

  assert.deepEqual(owned.calls, []);
  assert.equal(warnings.at(-1), "SYMBAROUMHUD.Notifications.NoAvailableExperience");
});

test("vitality adjustments are clamped between zero and the actor maximum", async () => {
  const owned = actor();
  await ActorService.adjust(owned, "system.health.toughness.value", 10);
  await ActorService.adjust(owned, "system.health.toughness.value", -10);

  assert.deepEqual(owned.calls, [
    ["update", { "system.health.toughness.value": 10 }],
    ["update", { "system.health.toughness.value": 0 }]
  ]);
});

test("damage through the HUD applies the native dead condition and posts to chat at zero vitality", async () => {
  warnings.length = 0;
  chatMessages.length = 0;
  const owned = actor();
  owned.system.health.toughness.value = 3;
  owned.addCondition = async (condition) => owned.calls.push(["condition", condition]);

  await ActorService.adjust(owned, "system.health.toughness.value", -3);

  assert.deepEqual(owned.calls, [
    ["update", { "system.health.toughness.value": 0 }],
    ["condition", "dead"]
  ]);
  assert.equal(warnings.at(-1), "EFFECT.StatusDead");
  assert.equal(chatMessages.length, 1);
  const content = JSON.parse(chatMessages[0].content);
  assert.equal(content.introText, "CHAT.DEAD:Hero");
  assert.equal(content.finalText, "HeroCOMBAT.CHAT_DAMAGE_DYING");
  assert.equal(content.subImg, "dead.webp");
});

test("healing or adjusting an actor already at zero does not repeat the death message", async () => {
  warnings.length = 0;
  chatMessages.length = 0;
  const owned = actor();
  owned.system.health.toughness.value = 0;
  owned.addCondition = async (condition) => owned.calls.push(["condition", condition]);

  await ActorService.adjust(owned, "system.health.toughness.value", -3);
  await ActorService.adjust(owned, "system.health.toughness.value", 3);

  assert.deepEqual(owned.calls, [
    ["update", { "system.health.toughness.value": 3 }]
  ]);
  assert.equal(chatMessages.length, 0);
  assert.equal(warnings.length, 0);
});

test("temporary corruption is clamped between zero and the remaining maximum", async () => {
  const owned = actor();
  await ActorService.adjust(owned, "system.health.corruption.temporary", 10);
  await ActorService.adjust(owned, "system.health.corruption.temporary", -10);

  assert.deepEqual(owned.calls, [
    ["update", { "system.health.corruption.temporary": 9 }],
    ["update", { "system.health.corruption.temporary": 0 }]
  ]);
});

test("temporary corruption gained through the HUD announces a crossed threshold", async () => {
  chatMessages.length = 0;
  const owned = actor();

  await ActorService.adjust(owned, "system.health.corruption.temporary", 1);

  assert.equal(chatMessages.length, 1);
  const content = JSON.parse(chatMessages[0].content);
  assert.equal(content.introText, "HeroCORRUPTION.CHAT_INTRO");
  assert.equal(content.finalText, "HeroCORRUPTION.CHAT_THRESHOLD");
  assert.equal(content.subImg, "icons/magic/acid/dissolve-arm-flesh.webp");
});

test("temporary corruption gained through the HUD warns one point before a threshold", async () => {
  chatMessages.length = 0;
  const owned = actor();
  owned.system.health.corruption.temporary = 3;
  owned.system.health.corruption.value = 4;

  await ActorService.adjust(owned, "system.health.corruption.temporary", 1);

  assert.equal(chatMessages.length, 1);
  const content = JSON.parse(chatMessages[0].content);
  assert.equal(content.finalText, "HeroCORRUPTION.CHAT_WARNING");
  assert.equal(content.subImg, "icons/magic/air/wind-vortex-swirl-purple.webp");
});

test("temporary corruption gained through the HUD announces the corruption maximum", async () => {
  chatMessages.length = 0;
  const owned = actor();
  owned.system.health.corruption.temporary = 8;
  owned.system.health.corruption.value = 9;

  await ActorService.adjust(owned, "system.health.corruption.temporary", 1);

  assert.equal(chatMessages.length, 1);
  const content = JSON.parse(chatMessages[0].content);
  assert.equal(content.finalText, "HeroCORRUPTION.CHAT_MAX");
  assert.equal(content.subImg, "icons/creatures/unholy/demon-horned-winged-laughing.webp");
});

test("reducing temporary corruption does not create a threshold message", async () => {
  chatMessages.length = 0;
  const owned = actor();

  await ActorService.adjust(owned, "system.health.corruption.temporary", -1);

  assert.equal(chatMessages.length, 0);
});

test("lists each accessible actor once for HUD cycling", () => {
  const current = actor();
  current.uuid = "Actor.current";
  const companion = actor();
  companion.id = "companion";
  companion.uuid = "Actor.companion";
  game.actors = [current, companion];

  assert.deepEqual(
    ActorService.accessibleActors(current).map((entry) => entry.uuid),
    ["Actor.current", "Actor.companion"]
  );
  assert.deepEqual(
    ActorService.accessibleActors(companion).map((entry) => entry.uuid),
    ["Actor.current", "Actor.companion"]
  );
});

test("observer actions do not roll or use another user's actor", async () => {
  warnings.length = 0;
  const observed = actor({ owner: false });
  await ActorService.rollAttribute(observed, "strong");
  await ActorService.rollArmor(observed);
  await ActorService.rollWeapon(observed, "weapon");
  await ActorService.usePower(observed, "power");
  await ActorService.removeEffect(observed, "effect");

  assert.deepEqual(observed.calls, []);
  assert.equal(warnings.length, 5);
});
