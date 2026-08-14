import assert from "node:assert/strict";
import test from "node:test";

const hookCalls = [];
const dialogChoices = [];
const dialogConfigs = [];

globalThis.game = {
  user: { id: "user" },
  items: [],
  symbaroum: { config: {
    expCosts: { power: { novice: 10, adept: 20, nocost: [] } },
    BONUS_FIELDS: [{ name: "system.bonus.defense", label: "Defense" }]
  } },
  i18n: {
    localize: (key) => key,
    format: (key, data) => `${key}:${data.traits}`
  }
};
globalThis.ui = { notifications: { error: () => undefined, warn: () => undefined, info: () => undefined } };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
globalThis.Hooks = {
  on: () => undefined,
  callAll: (...args) => hookCalls.push(args)
};
globalThis.foundry = {
  applications: {
    handlebars: {
      renderTemplate: async (_template, data) => `<form class="${data.cssClass}"><div class="ability">
        <div class="sheet-header"><img src="${data.item.img}"><input name="name" value="${data.item.name}"></div>
        <div class="sheet-tabs">${["description", "novice", "adept", "master", "bonus"].map((tab) => `<b class="item" data-tab="${tab}">${tab}</b>`).join("")}</div>
        <div class="sheet-body">${["description", "novice", "adept", "master", "bonus"].map((tab) => `<div class="tab" data-tab="${tab}">${tab === "bonus" ? "Defense 2" : data.system[tab]?.description ?? data.system.description}</div>`).join("")}</div>
      </div></form>`
    },
    api: {
      DialogV2: {
        wait: async (config) => {
          dialogConfigs.push(config);
          const choice = dialogChoices.shift() ?? "close";
          if (choice === "close") return null;
          if (typeof choice !== "object") return choice;
          const button = config.buttons.find((entry) => entry.action === choice.action);
          const values = choice.form ?? { occupation: choice.occupation };
          const elements = Object.fromEntries(Object.entries(values).map(([name, value]) => [
            name,
            typeof value === "boolean" ? { checked: value, value: "on" } : { value }
          ]));
          elements.namedItem = (name) => elements[name] ?? null;
          return button.callback({}, {
            form: { elements }
          });
        }
      }
    }
  },
  utils: {
    escapeHTML: (value) => String(value),
    deepClone: (value) => structuredClone(value)
  }
};

const {
  CHARACTER_CREATION_MODES,
  CharacterCreatorService,
  isBlankPlayerActor,
  isAbilitiesStepComplete,
  isAttributesStepComplete,
  isEquipmentStepComplete,
  isFriendsStepComplete,
  isOccupationStepComplete,
  isRaceStepComplete,
  isContactsPreparationRequired,
  isPersonalityStepComplete,
  isShadowStepComplete,
  startingThalerForExperience,
  shouldOfferCharacterCreator
} = await import("../scripts/services/character-creator-service.mjs");
const { CORE_OCCUPATIONS, OCCUPATION_ARCHETYPES } = await import(
  "../scripts/data/core-occupations.mjs"
);
const {
  CORE_ATTRIBUTES,
  TYPICAL_ATTRIBUTE_VALUES,
  availableTypicalValues,
  isValidPointBuyDistribution,
  isValidTypicalDistribution
} = await import("../scripts/data/core-attributes.mjs");
const { CORE_RACES, CORE_RACE_TRAITS } = await import("../scripts/data/core-races.mjs");
const {
  ABILITY_DISTRIBUTION_MODES,
  abilityRankCost,
  abilitySelectionCost,
  abilitySelectionLimits,
  isValidAbilitySelection
} = await import("../scripts/data/character-creation-abilities.mjs");

function worldAbility(id, name = `Ability ${id}`, permission = () => true) {
  const data = {
    _id: id,
    id,
    name,
    type: "ability",
    img: `icons/${id}.webp`,
    system: {
      reference: id,
      description: `General ${id}`,
      bonus: { defense: 2 },
      novice: { isActive: false, action: "Active", description: `Novice ${id}` },
      adept: { isActive: false, action: "Active", description: `Adept ${id}` },
      master: { isActive: false, action: "Active", description: `Master ${id}` }
    }
  };
  const document = {
    ...data,
    testUserPermission: permission,
    toObject: () => structuredClone(data)
  };
  document.sheet = {
    options: { template: "systems/symbaroum/template/sheet/ability.hbs" },
    getData: async () => ({ item: document, system: structuredClone(data.system), cssClass: "editable", owner: true, editable: true, isOwned: false })
  };
  return document;
}

function worldMysticalPower(id, name = `Power ${id}`, permission = () => true) {
  const source = worldAbility(id, name, permission);
  const data = source.toObject();
  data.type = "mysticalPower";
  return { ...data, testUserPermission: permission, toObject: () => structuredClone(data) };
}

function worldRitual(id, name = `Ritual ${id}`, permission = () => true) {
  const data = {
    _id: id,
    id,
    name,
    type: "ritual",
    img: `icons/${id}.webp`,
    system: { reference: id, description: `Ritual description ${id}` }
  };
  return { ...data, testUserPermission: permission, toObject: () => structuredClone(data) };
}

function worldEquipment(id, name, type, system, permission = () => true, extras = {}) {
  const data = {
    _id: id,
    id,
    name,
    type,
    img: `icons/${id}.webp`,
    system,
    ...extras
  };
  return { ...data, testUserPermission: permission, toObject: () => structuredClone(data) };
}

function actor(overrides = {}) {
  const flags = new Map();
  const updates = [];
  const items = overrides.items ?? [];
  return {
    id: "actor",
    uuid: "Actor.actor",
    name: "Novo Personagem",
    type: "player",
    items,
    system: {
      attributes: Object.fromEntries([
        "accurate", "cunning", "discreet", "persuasive",
        "quick", "resolute", "strong", "vigilant"
      ].map((id) => [id, { value: 10 }])),
      bio: {
        race: "",
        occupation: "",
        shadow: "",
        quote: "",
        age: "",
        height: "",
        weight: "",
        appearance: "",
        background: "",
        personalGoal: ""
      },
      notes: ""
    },
    testUserPermission: () => true,
    getFlag: (_scope, key) => flags.get(key),
    setFlag: async (_scope, key, value) => {
      flags.set(key, value);
    },
    update: async (changes) => updates.push(changes),
    createEmbeddedDocuments: async (_type, documents) => {
      const created = documents.map((document, index) => ({ id: `created-${items.length + index}`, ...document }));
      items.push(...created);
      return created;
    },
    flag: (key) => flags.get(key),
    updates,
    ...overrides,
    items
  };
}

test("recognizes a new Symbaroum player sheet without treating default attributes as content", () => {
  assert.equal(isBlankPlayerActor(actor()), true);
  assert.equal(isBlankPlayerActor(actor({ type: "monster" })), false);
  assert.equal(isBlankPlayerActor(actor({ items: [{ id: "item" }] })), false);
  assert.equal(isBlankPlayerActor(actor({
    system: { bio: { race: "Humano" }, notes: "" }
  })), false);
});

test("offers the creator only to an owner who has not already chosen", async () => {
  const blank = actor();
  assert.equal(shouldOfferCharacterCreator(blank), true);
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "manual");
  assert.equal(shouldOfferCharacterCreator(blank), false);
  assert.equal(shouldOfferCharacterCreator(actor({
    testUserPermission: () => false
  })), false);
});

test("remembers the manual character creation choice", async () => {
  const blank = actor({ id: "manual", uuid: "Actor.manual" });
  let sheetCloseCount = 0;
  const sheet = { close: async () => { sheetCloseCount += 1; } };
  dialogChoices.push(CHARACTER_CREATION_MODES.MANUAL);

  assert.equal(
    await CharacterCreatorService.offer(blank, sheet),
    CHARACTER_CREATION_MODES.MANUAL
  );
  assert.equal(blank.flag("characterCreationMode"), CHARACTER_CREATION_MODES.MANUAL);
  assert.equal(sheetCloseCount, 0);
});

test("closes the original Actor sheet, marks a creator request and opens the occupation book", async () => {
  const blank = actor({ id: "creator", uuid: "Actor.creator" });
  let sheetCloseCount = 0;
  const order = [];
  const originalSetFlag = blank.setFlag.bind(blank);
  blank.setFlag = async (...args) => {
    order.push(`flag:${args[1]}`);
    return originalSetFlag(...args);
  };
  const sheet = { close: async () => { sheetCloseCount += 1; order.push("close"); } };
  dialogChoices.push(CHARACTER_CREATION_MODES.CREATOR, "close");

  assert.equal(
    await CharacterCreatorService.offer(blank, sheet),
    CHARACTER_CREATION_MODES.CREATOR
  );
  assert.equal(blank.flag("characterCreationMode"), CHARACTER_CREATION_MODES.CREATOR);
  assert.equal(sheetCloseCount, 1);
  assert.deepEqual(order.slice(0, 2), ["close", "flag:characterCreationMode"]);
  assert.ok(dialogConfigs.at(-2).classes.includes("symbaroum-hud-character-creator-choice-dialog"));
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-occupation-book/);
  assert.deepEqual(hookCalls.at(-1), [
    "symbaroum-hud.characterCreatorRequested",
    blank
  ]);
});

test("closes an Actor sheet before resuming an unfinished creator", async () => {
  const blank = actor({ id: "creator-resume", uuid: "Actor.creator-resume" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", CHARACTER_CREATION_MODES.CREATOR);
  let sheetCloseCount = 0;
  const sheet = { close: async () => { sheetCloseCount += 1; } };
  dialogChoices.push("close");

  await CharacterCreatorService.handleSheet(blank, sheet);

  assert.equal(sheetCloseCount, 1);
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-occupation-book/);
});

test("the core occupation book contains all fifteen occupations in three archetypes", () => {
  assert.equal(CORE_OCCUPATIONS.length, 15);
  assert.deepEqual(OCCUPATION_ARCHETYPES.map((entry) => entry.id), [
    "warrior",
    "mystic",
    "rogue"
  ]);
  for (const archetype of OCCUPATION_ARCHETYPES) {
    assert.match(archetype.label, /\.Name$/);
    assert.match(archetype.summary, /\.Summary$/);
    assert.equal(
      CORE_OCCUPATIONS.filter((entry) => entry.archetype === archetype.id).length,
      5
    );
  }
  for (const occupation of CORE_OCCUPATIONS) {
    assert.match(occupation.art, /^modules\/symbaroum-corerules\/images\/pictures\/.+\.webp$/);
    assert.match(occupation.quote, /\.Quote$/);
    assert.match(occupation.attributes, /\.Attributes$/);
    assert.match(occupation.races, /\.Races$/);
    assert.match(occupation.abilities, /\.Abilities$/);
  }
});

test("the first creator step explains the process and exposes a detailed occupation selector", async () => {
  const blank = actor({ id: "guided", uuid: "Actor.guided" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  dialogChoices.push("close");

  await CharacterCreatorService.openOccupationStep(blank);
  assert.deepEqual(dialogConfigs.at(-1).position, { width: 1060, height: 680 });
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /symbaroum-hud-creator-step-guide/);
  assert.match(content, /Guide\.Progress/);
  assert.doesNotMatch(content, /Guide\.Title/);
  assert.match(content, /input[^>]+name="occupation"/);
  assert.doesNotMatch(content, /Occupation\.IndexHint/);
  assert.equal((content.match(/data-occupation-id=/g) ?? []).length, 16);
  assert.match(content, /symbaroum-hud-occupation-chapter-banner/);
  assert.match(content, /symbaroum-hud-occupation-journal-card/);
  assert.match(content, /symbaroum-hud-occupation-facts/);
  assert.match(content, /data-occupation-id="custom"/);
  assert.match(content, /symbaroum-hud-custom-occupation-page/);
  assert.match(content, /name="customOccupationName"/);
  assert.match(content, /modules\/symbaroum-corerules\/images\/pictures\/duelist-arch\.webp/);
});

test("suggested occupation Abilities link to original accessible world sheets", async () => {
  const blank = actor({ id: "occupation-links", uuid: "Actor.occupation-links" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  const previousItems = game.items;
  const previousLocalize = game.i18n.localize;
  const permissionLevels = [];
  game.items = [
    worldAbility("berserker-sheet", "Amoque", (_user, level) => {
      permissionLevels.push(level);
      return level === 2;
    }),
    worldAbility("hidden-recovery", "Recuperação", () => false)
  ];
  game.i18n.localize = (key) => key.endsWith("Occupations.berserker.Abilities")
    ? "Amoque, Recuperação"
    : key;
  dialogChoices.push("close");

  try {
    await CharacterCreatorService.openOccupationStep(blank);
  } finally {
    game.items = previousItems;
    game.i18n.localize = previousLocalize;
  }

  const content = dialogConfigs.at(-1).content;
  assert.match(content, /data-open-occupation-ability="berserker-sheet"/);
  assert.match(content, /symbaroum-hud-occupation-ability-link/);
  assert.doesNotMatch(content, /data-open-occupation-ability="hidden-recovery"/);
  assert.match(content, />Recuperação<\/span>/);
  assert.match(content, /<\/button>, <span>Recuperação<\/span>/);
  assert.doesNotMatch(content, /symbaroum-hud-occupation-ability-separator/);
  assert.deepEqual(permissionLevels, [2]);
});

test("choosing an occupation writes it to the sheet and completes the first step", async () => {
  const blank = actor({ id: "occupation", uuid: "Actor.occupation" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  dialogChoices.push(
    { action: "choose-occupation", occupation: "wizard" },
    "close"
  );

  assert.equal(await CharacterCreatorService.openOccupationStep(blank), null);
  assert.deepEqual(blank.updates, [{
    "system.bio.occupation": "SYMBAROUMHUD.CharacterCreator.Occupations.wizard.Name"
  }]);
  assert.equal(isOccupationStepComplete(blank), true);
  assert.deepEqual(blank.flag("characterCreatorState"), {
    version: 1,
    step: "occupation-complete",
    archetype: "mystic",
    occupation: "wizard"
  });
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-attributes-book/);
});

test("a custom occupation saves its name and editable concept in creator state", async () => {
  const blank = actor({ id: "custom-occupation", uuid: "Actor.custom-occupation" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  const occupationDialog = dialogConfigs.length;
  dialogChoices.push({
    action: "choose-occupation",
    form: {
      occupation: "custom",
      customOccupationName: "Explorador de Ruínas",
      customOccupationQuote: "Toda porta antiga esconde uma resposta.",
      customOccupationSummary: "Investiga ruínas e sobrevive aos seus perigos.",
      customOccupationAttributes: "Astuto 13+, Vigilante 11+",
      customOccupationRaces: "Qualquer raça",
      customOccupationAbilities: "Acrobacias, Mestre do Saber"
    }
  }, "close");

  assert.equal(await CharacterCreatorService.openOccupationStep(blank), null);
  assert.deepEqual(blank.updates, [{
    "system.bio.occupation": "Explorador de Ruínas"
  }]);
  assert.deepEqual(blank.flag("characterCreatorState"), {
    version: 1,
    step: "occupation-complete",
    archetype: "custom",
    occupation: "custom",
    customOccupation: {
      name: "Explorador de Ruínas",
      quote: "Toda porta antiga esconde uma resposta.",
      summary: "Investiga ruínas e sobrevive aos seus perigos.",
      attributes: "Astuto 13+, Vigilante 11+",
      races: "Qualquer raça",
      abilities: "Acrobacias, Mestre do Saber"
    }
  });
  assert.match(dialogConfigs[occupationDialog].content, /data-occupation-page="custom"/);
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-attributes-book/);
});

test("the second creator step offers typical distribution and point buy", async () => {
  const blank = actor({ id: "attributes", uuid: "Actor.attributes" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "occupation-complete",
    archetype: "mystic",
    occupation: "wizard"
  });
  dialogChoices.push("close");

  await CharacterCreatorService.openAttributesStep(blank);
  assert.deepEqual(dialogConfigs.at(-1).position, { width: 1060, height: 680 });
  assert.equal(dialogConfigs.at(-1).buttons.some((button) => button.action === "defer-attributes"), true);
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /AttributesProgress/);
  assert.doesNotMatch(content, /Guide\.Title/);
  assert.match(content, /data-attribute-mode="typical"/);
  assert.match(content, /data-attribute-mode="point-buy"/);
  assert.equal((content.match(/data-attribute-card=/g) ?? []).length, 8);
  assert.equal((content.match(/data-typical-attribute=/g) ?? []).length, 8);
  assert.equal((content.match(/data-adjust-attribute=/g) ?? []).length, 16);
  assert.equal((content.match(/name="points-[^"]+" value="5"/g) ?? []).length, 8);
  assert.doesNotMatch(content, /Attributes\.RulesLabel/);
  assert.equal((content.match(/data-typical-value=/g) ?? []).length, 8);
  assert.match(content, /symbaroum-hud-attribute-occupation-recommendation/);
  assert.match(content, /Occupations\.wizard\.Name/);
  assert.match(content, /Occupations\.wizard\.Attributes/);
});

test("custom occupation Attribute recommendations appear in the Attribute step", async () => {
  const blank = actor({ id: "custom-attribute-hint", uuid: "Actor.custom-attribute-hint" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "occupation-complete",
    archetype: "custom",
    occupation: "custom",
    customOccupation: { name: "Batedor", attributes: "Vigilante 13+, Discreto 11+" }
  });
  dialogChoices.push("close");

  await CharacterCreatorService.openAttributesStep(blank);
  const content = dialogConfigs.at(-1).content;
  assert.match(content, />Batedor</);
  assert.match(content, /Vigilante 13\+, Discreto 11\+/);
});

test("validates the two official Attribute distribution methods", () => {
  assert.equal(CORE_ATTRIBUTES.length, 8);
  assert.equal(isValidTypicalDistribution(TYPICAL_ATTRIBUTE_VALUES), true);
  assert.equal(isValidTypicalDistribution([5, 7, 9, 10, 10, 11, 14, 14]), false);
  assert.equal(isValidPointBuyDistribution([10, 10, 10, 10, 10, 10, 10, 10]), true);
  assert.equal(isValidPointBuyDistribution([15, 15, 10, 10, 10, 10, 5, 5]), false);
  assert.equal(isValidPointBuyDistribution([5, 7, 9, 10, 10, 11, 13, 15]), true);
});

test("typical distribution only offers values not assigned to another Attribute", () => {
  assert.deepEqual(availableTypicalValues([15, 13, "", "", "", "", "", ""], 2), [5, 7, 9, 10, 11]);
  assert.deepEqual(availableTypicalValues([10, "", "", "", "", "", "", ""], 1), [5, 7, 9, 10, 11, 13, 15]);
  assert.deepEqual(availableTypicalValues([10, 10, "", "", "", "", "", ""], 2), [5, 7, 9, 11, 13, 15]);
});

test("saving point-buy Attributes writes the native Symbaroum fields", async () => {
  const blank = actor({ id: "save-attributes", uuid: "Actor.save-attributes" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "occupation-complete",
    archetype: "warrior",
    occupation: "knight"
  });
  const distribution = [10, 13, 5, 7, 11, 15, 10, 9];
  dialogChoices.push({
    action: "choose-attributes",
    form: {
      attributeDistributionMode: "point-buy",
      ...Object.fromEntries(CORE_ATTRIBUTES.map((attribute, index) => [
        `points-${attribute.id}`,
        distribution[index]
      ]))
    }
  });

  assert.deepEqual(await CharacterCreatorService.openAttributesStep(blank), distribution);
  assert.deepEqual(blank.updates, [Object.fromEntries(CORE_ATTRIBUTES.map((attribute, index) => [
    `system.attributes.${attribute.id}.value`,
    distribution[index]
  ]))]);
  assert.equal(isAttributesStepComplete(blank), true);
  assert.deepEqual(blank.flag("characterCreatorState"), {
    version: 1,
    step: "attributes-complete",
    archetype: "warrior",
    occupation: "knight",
    attributesDeferred: false,
    attributeDistribution: "point-buy",
    attributes: Object.fromEntries(CORE_ATTRIBUTES.map((attribute, index) => [
      attribute.id,
      distribution[index]
    ]))
  });
});

test("Attributes can be deferred until after Abilities and are then required again", async () => {
  const blank = actor({ id: "deferred-attributes", uuid: "Actor.deferred-attributes" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "occupation-complete",
    archetype: "mystic",
    occupation: "wizard"
  });

  const firstDialog = dialogConfigs.length;
  dialogChoices.push({ action: "defer-attributes" }, "close");
  assert.equal(
    await CharacterCreatorService.openAttributesStep(blank),
    "attributes-deferred"
  );
  assert.equal(dialogConfigs[firstDialog].buttons.some((button) => button.action === "defer-attributes"), true);
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-race-book/);
  assert.equal(blank.flag("characterCreatorState").attributesDeferred, true);
  assert.equal(isAttributesStepComplete(blank), true);

  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    ...blank.flag("characterCreatorState"),
    step: "abilities-complete",
    abilities: [{ id: "mystical-power" }]
  });
  assert.equal(isAbilitiesStepComplete(blank), true);
  assert.equal(isAttributesStepComplete(blank), false);

  const distribution = [10, 13, 5, 7, 11, 15, 10, 9];
  const returnDialog = dialogConfigs.length;
  dialogChoices.push({
    action: "choose-attributes",
    form: {
      attributeDistributionMode: "point-buy",
      ...Object.fromEntries(CORE_ATTRIBUTES.map((attribute, index) => [
        `points-${attribute.id}`,
        distribution[index]
      ]))
    }
  }, "close");

  assert.deepEqual(await CharacterCreatorService.openAttributesStep(blank), distribution);
  assert.equal(dialogConfigs[returnDialog].buttons.some((button) => button.action === "defer-attributes"), false);
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-shadow-book/);
  assert.equal(blank.flag("characterCreatorState").step, "abilities-complete");
  assert.equal(blank.flag("characterCreatorState").attributesDeferred, false);
  assert.deepEqual(blank.flag("characterCreatorState").abilities, [{ id: "mystical-power" }]);
  assert.equal(isAttributesStepComplete(blank), true);
});

test("the third creator step presents all core races and their trait rules", async () => {
  const blank = actor({ id: "races", uuid: "Actor.races" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "attributes-complete", occupation: "wizard"
  });
  const previous = game.items;
  game.items = Object.values(CORE_RACE_TRAITS).map((trait) => {
    const item = worldEquipment(`trait-${trait.id}`, `Original ${trait.id}`, trait.type, {
      reference: trait.id,
      description: `Original description ${trait.id}`
    });
    item.sheet = { render: () => undefined };
    return item;
  });
  dialogChoices.push("close");

  try {
    await CharacterCreatorService.openRaceStep(blank);
  } finally {
    game.items = previous;
  }
  assert.deepEqual(dialogConfigs.at(-1).position, { width: 1060, height: 680 });
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /changeling\.webp[^>]+object-position:50% 8%/);
  assert.equal(CORE_RACES.length, 5);
  assert.equal(Object.keys(CORE_RACE_TRAITS).length, 9);
  assert.match(content, /RaceProgress/);
  assert.doesNotMatch(content, /Guide\.Title/);
  assert.doesNotMatch(content, /\.Family/);
  assert.equal((content.match(/data-race-id=/g) ?? []).length, 5);
  assert.equal((content.match(/class="symbaroum-hud-race-art"/g) ?? []).length, 5);
  assert.equal((content.match(/data-race-lore="history"/g) ?? []).length, 5);
  assert.ok(content.indexOf("Entries.ambrian.Lore.history.Paragraph1") < content.indexOf("name=\"race-choice-ambrian\""));
  assert.ok(CORE_RACES.every((race) => race.art.endsWith(".webp") && race.lore.length >= 2));
  assert.match(content, /name="race-choice-ambrian"/);
  assert.match(content, /name="race-optional-goblin-survivalInstinct"/);
  assert.equal((content.match(/data-open-race-trait=/g) ?? []).length, 12);
  assert.doesNotMatch(content, /Traits\.contacts\.Description/);
  assert.doesNotMatch(content, /Traits\.robust\.Description/);
  assert.match(content, /data-open-race-trait="contacts"/);
  assert.match(content, /data-open-race-trait="robust"/);
});

test("racial Trait cards open an accessible original world item sheet", async () => {
  const blank = actor({ id: "race-trait-open", uuid: "Actor.race-trait-open" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "attributes-complete" });
  const rendered = [];
  const contacts = worldEquipment("contacts", "Contatos", "boon", { reference: "contacts" });
  contacts.sheet = { render: (force) => rendered.push(force) };
  const previous = game.items;
  game.items = [contacts];
  dialogChoices.push("close");
  try {
    await CharacterCreatorService.openRaceStep(blank);
    const config = dialogConfigs.at(-1);
    assert.match(config.content, /data-open-race-trait="contacts"/);
    assert.doesNotMatch(config.content, /data-open-race-trait="contacts" disabled/);
  } finally {
    game.items = previous;
  }
  assert.deepEqual(rendered, []);
});

test("a human racial choice is added as a native boon", async () => {
  const blank = actor({ id: "ambrian", uuid: "Actor.ambrian" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "attributes-complete" });
  dialogChoices.push({ action: "choose-race", form: { race: "ambrian", "race-choice-ambrian": "contacts" } });

  assert.equal(await CharacterCreatorService.openRaceStep(blank), "ambrian");
  assert.equal(blank.items.length, 1);
  assert.equal(blank.items[0].type, "boon");
  assert.equal(blank.items[0].system.level, 1);
  assert.deepEqual(blank.updates.at(-1), { "system.bio.race": "SYMBAROUMHUD.CharacterCreator.Race.Entries.ambrian.Name" });
  assert.equal(isRaceStepComplete(blank), true);
  assert.equal(isContactsPreparationRequired(blank), true);
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-contacts-book/);
});

test("Contacts opens a unique preparation page between Race and Abilities", async () => {
  const blank = actor({ id: "contacts-guide", uuid: "Actor.contacts-guide" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "race-complete",
    race: "ambrian",
    raceTraits: ["contacts"]
  });
  dialogChoices.push("close");

  await CharacterCreatorService.openContactsStep(blank);
  const config = dialogConfigs.at(-1);
  assert.deepEqual(config.position, { width: 1060, height: 680 });
  assert.match(config.content, /symbaroum-hud-contacts-book/);
  assert.match(config.content, /name="contactsNetwork"/);
  assert.match(config.content, /name="contactsRelationship"/);
  assert.equal((config.content.match(/name="contactName-/g) ?? []).length, 4);
  assert.match(config.content, /Contacts\.InPlay\.Declare/);
  assert.equal(config.buttons.some((button) => button.action === "creator-previous-step"), true);
  assert.equal(isContactsPreparationRequired(blank), true);
  assert.equal(await CharacterCreatorService.openAbilitiesStep(blank), null);
});

test("saving Contacts records the network and NPCs in native Notes without erasing existing text", async () => {
  const blank = actor({ id: "contacts-save", uuid: "Actor.contacts-save" });
  blank.system.notes = "<p>Anotação anterior.</p>";
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "race-complete",
    race: "ambrian",
    raceTraits: ["contacts"]
  });
  dialogChoices.push({ action: "choose-contacts", form: {
    contactsNetwork: "Igreja do Sol em Yndaros",
    contactsRelationship: "Serviu como escriba do templo durante a juventude.",
    "contactName-0": "Irmã Alésia",
    "contactRole-0": "Sacerdotisa",
    "contactLocation-0": "Templo do Sol",
    contactsAccess: "Notícias do clero e abrigo discreto.",
    contactsComplications: "Espera ajuda para proteger peregrinos."
  } }, "close");

  const contacts = await CharacterCreatorService.openContactsStep(blank);
  assert.equal(contacts.network, "Igreja do Sol em Yndaros");
  assert.deepEqual(contacts.people, [{
    name: "Irmã Alésia",
    role: "Sacerdotisa",
    location: "Templo do Sol"
  }]);
  assert.deepEqual(blank.flag("characterCreatorState").contacts, contacts);
  const notesUpdate = blank.updates.find((update) => "system.notes" in update);
  assert.match(notesUpdate["system.notes"], /Anotação anterior/);
  assert.match(notesUpdate["system.notes"], /Igreja do Sol em Yndaros/);
  assert.match(notesUpdate["system.notes"], /Irmã Alésia/);
  assert.match(notesUpdate["system.notes"], /symbaroum-hud:contacts:start/);
  assert.equal(isContactsPreparationRequired(blank), false);
  assert.deepEqual(hookCalls.at(-1), [
    "symbaroum-hud.characterCreatorTraitPrepared",
    blank,
    { trait: "contacts", contacts }
  ]);
});

test("goblin adds mandatory burdens and records its optional trait as an Ability choice", async () => {
  const blank = actor({ id: "goblin", uuid: "Actor.goblin" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "attributes-complete" });
  dialogChoices.push({
    action: "choose-race",
    form: { race: "goblin", "race-optional-goblin-survivalInstinct": true }
  });

  assert.equal(await CharacterCreatorService.openRaceStep(blank), "goblin");
  assert.deepEqual(blank.items.map((item) => item.type), ["burden", "burden", "trait"]);
  assert.equal(blank.items[2].system.novice.isActive, true);
  assert.deepEqual(blank.flag("characterCreatorState").raceTraits, ["shortLived", "pariah", "survivalInstinct"]);
  assert.deepEqual(blank.flag("characterCreatorState").abilityCostTraits, ["survivalInstinct"]);
});

test("validates both official Ability distributions and discounts optional racial traits", () => {
  assert.deepEqual(abilitySelectionLimits(ABILITY_DISTRIBUTION_MODES.FIVE_NOVICE, 1), {
    novice: 4, adept: 0, occupied: 1
  });
  assert.deepEqual(abilitySelectionLimits(ABILITY_DISTRIBUTION_MODES.MIXED, 1), {
    novice: 1, adept: 1, occupied: 1
  });
  assert.equal(isValidAbilitySelection([
    { id: "a", rank: "novice" }, { id: "b", rank: "novice" },
    { id: "c", rank: "novice" }, { id: "d", rank: "novice" }
  ], ABILITY_DISTRIBUTION_MODES.FIVE_NOVICE, 1), true);
  assert.equal(isValidAbilitySelection([
    { id: "a", rank: "novice" }, { id: "b", rank: "novice" }
  ], ABILITY_DISTRIBUTION_MODES.FIVE_NOVICE, 1), false);
  assert.equal(isValidAbilitySelection([
    { id: "a", rank: "novice" }, { id: "a", rank: "adept" }
  ], ABILITY_DISTRIBUTION_MODES.MIXED), false);
  assert.equal(abilityRankCost("novice"), 10);
  assert.equal(abilityRankCost("adept"), 30);
  assert.equal(abilityRankCost("master"), 60);
  assert.equal(abilitySelectionCost([{ id: "a", rank: "master" }, { id: "b", rank: "novice" }]), 70);
  assert.equal(isValidAbilitySelection([
    { id: "a", rank: "master" }, { id: "b", rank: "novice" }
  ], ABILITY_DISTRIBUTION_MODES.EXPERIENCE, 1, { experienceBudget: 80 }), true);
  assert.equal(isValidAbilitySelection([
    { id: "a", rank: "master" }, { id: "b", rank: "novice" }
  ], ABILITY_DISTRIBUTION_MODES.EXPERIENCE, 1, { experienceBudget: 79 }), false);
});

test("the fourth creator step provides search, full Ability reading and both distributions", async () => {
  const blank = actor({ id: "abilities", uuid: "Actor.abilities" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "race-complete", race: "ambrian"
  });
  const previous = game.items;
  game.items = [worldAbility("a", "Acrobatics"), worldAbility("b", "Alchemy")];
  dialogChoices.push("close");
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  assert.deepEqual(dialogConfigs.at(-1).position, { width: 1140, height: 700 });
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /AbilitiesProgress/);
  assert.match(content, /data-ability-mode="experience" data-active="true"/);
  assert.match(content, /name="abilityExperienceBudget" value="50"/);
  assert.match(content, /<strong data-experience-remaining>50<\/strong>/);
  assert.ok(
    content.indexOf("data-experience-remaining") < content.indexOf('name="abilityExperienceBudget"'),
    "Remaining XP must be emphasized above the total XP input"
  );
  assert.match(content, /data-ability-mode="five-novice"/);
  assert.match(content, /data-ability-mode="mixed"/);
  assert.match(content, /data-ability-search/);
  assert.equal((content.match(/data-creation-ability-id=/g) ?? []).length, 2);
  assert.equal((content.match(/data-creation-ability-page=/g) ?? []).length, 2);
  assert.equal((content.match(/class="symbaroum sheet item symbaroum-hud-native-ability-sheet"/g) ?? []).length, 2);
  assert.equal((content.match(/class="sheet-tabs"/g) ?? []).length, 2);
  assert.equal((content.match(/data-tab="bonus"/g) ?? []).length, 4);
  assert.match(content, /<input disabled name="name" value="Acrobatics">/);
  assert.match(content, /Defense 2/);
  assert.match(content, /Novice a/);
  assert.match(content, /Adept a/);
  assert.match(content, /Master a/);
  assert.match(content, /data-rank="master"/);
});

test("mystical tradition Abilities open an adapted book chapter before their native sheet", async () => {
  const blank = actor({ id: "traditions", uuid: "Actor.traditions" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "race-complete", race: "ambrian"
  });
  const traditions = [
    ["witchcraft", "Bruxaria"],
    ["sorcery", "Feitiçaria"],
    ["wizardry", "Magismo"],
    ["theurgy", "Teurgia"]
  ].map(([reference, name]) => {
    const ability = worldAbility(reference, name);
    ability.system.reference = reference;
    return ability;
  });
  const previous = game.items;
  game.items = traditions;
  dialogChoices.push("close");
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  const content = dialogConfigs.at(-1).content;
  for (const [reference, name] of [["witchcraft", "Bruxaria"], ["sorcery", "Feitiçaria"], ["wizardry", "Magismo"], ["theurgy", "Teurgia"]]) {
    assert.match(content, new RegExp(`data-mystical-tradition="${reference}"`));
    const chapter = content.indexOf(`data-mystical-tradition="${reference}"`);
    const sheet = content.indexOf("symbaroum-hud-native-ability-sheet", chapter);
    assert.ok(chapter < sheet, `${name} chapter must appear before the native Ability sheet`);
  }
  assert.equal((content.match(/symbaroum-hud-mystical-tradition-page/g) ?? []).length, 4);
  assert.match(content, /Traditions\.PurchaseExplanation/);
  assert.match(content, /Traditions\.CorruptionHeading/);
  assert.match(content, /Traditions\.AbilityHeading/);
  assert.match(content, /data-tradition-fallback-src=/);
  assert.doesNotMatch(content, /\bonerror\s*=/i);
});

test("the HUD Ability browser reuses the creator book with the character available XP", async () => {
  const blank = actor({ id: "ability-browser", uuid: "Actor.ability-browser" });
  blank.system.experience = { total: 50, spent: 30, available: 20 };
  const acrobatics = worldAbility("acrobatics", "Acrobacias");
  acrobatics.system.reference = "acrobatics";
  const previous = game.items;
  game.items = [acrobatics];
  const firstDialog = dialogConfigs.length;
  dialogChoices.push({
    action: "buy-abilities",
    form: {
      abilitySelections: JSON.stringify([{ id: "acrobatics", rank: "novice" }])
    }
  });
  let created;
  try {
    created = await CharacterCreatorService.openAbilityBrowser(blank);
  } finally {
    game.items = previous;
  }

  const config = dialogConfigs[firstDialog];
  assert.ok(config.classes.includes("symbaroum-hud-ability-browser-dialog"));
  assert.match(config.content, /data-ability-browser="true"/);
  assert.match(config.content, /BrowserHeading/);
  assert.match(config.content, /value="20" min="0" step="1" readonly/);
  assert.doesNotMatch(config.content, /data-ability-mode="five-novice"/);
  assert.equal(created.length, 1);
  assert.equal(created[0].name, "Acrobacias");
  assert.equal(created[0].system.novice.isActive, true);
  assert.equal(created[0].system.adept.isActive, false);
});

test("the HUD Ability browser can buy an accessible Mystical Power through its generic Ability page", async () => {
  const genericPower = worldAbility("mystical-power", "Poder Místico");
  genericPower.system.reference = "mysticalpower";
  const knownGenericPower = worldAbility("known-mystical-power", "Poder Místico");
  knownGenericPower.system.reference = "mysticalpower";
  const flame = worldMysticalPower("flame", "Alma de Fogo");
  const blank = actor({
    id: "power-browser",
    uuid: "Actor.power-browser",
    items: [knownGenericPower]
  });
  blank.system.experience = { total: 50, spent: 10, available: 40 };
  const previous = game.items;
  game.items = [genericPower, flame];
  dialogChoices.push({
    action: "buy-abilities",
    form: {
      abilitySelections: JSON.stringify([{
        id: "mystical-power",
        rank: "novice",
        kind: "mysticalPower",
        choiceId: "flame"
      }])
    }
  });
  try {
    await CharacterCreatorService.openAbilityBrowser(blank);
  } finally {
    game.items = previous;
  }

  assert.ok(blank.items.find((item) => item.name === "Alma de Fogo"));
  assert.equal(blank.items.filter((item) => item.name === "Poder Místico").length, 1);
});

test("the Ability list includes world documents shared with the player as Observer", async () => {
  const blank = actor({ id: "observer-abilities", uuid: "Actor.observer-abilities" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "race-complete" });
  const permissionLevels = [];
  const previous = game.items;
  game.items = [
    worldAbility("observer", "Observer Ability", (_user, level) => { permissionLevels.push(level); return level === 2; }),
    worldAbility("hidden", "Hidden Ability", () => false)
  ];
  dialogChoices.push("close");
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /Observer Ability/);
  assert.doesNotMatch(content, /Hidden Ability/);
  assert.deepEqual(permissionLevels, [2]);
});

test("occupation recommendations are pinned and tagged at the top of the Ability index", async () => {
  const blank = actor({ id: "recommended-abilities", uuid: "Actor.recommended-abilities" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "race-complete", occupation: "ranger", race: "ambrian"
  });
  const previousItems = game.items;
  const previousLocalize = game.i18n.localize;
  game.items = [
    worldAbility("alchemy", "Alquimia"),
    worldAbility("sixth-sense", "Sexto Sentido"),
    worldAbility("acrobatics", "Acrobacias"),
    worldAbility("marksman", "Atirador")
  ];
  game.i18n.localize = (key) => {
    if (key.endsWith("Occupations.ranger.Name")) return "Patrulheiro";
    if (key.endsWith("Occupations.ranger.Abilities")) return "Acrobacias, Atirador, Saber de Bestas, Sexto Sentido";
    return key;
  };
  dialogChoices.push("close");

  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previousItems;
    game.i18n.localize = previousLocalize;
  }

  const content = dialogConfigs.at(-1).content;
  const acrobatics = content.indexOf('data-creation-ability-id="acrobatics"');
  const marksman = content.indexOf('data-creation-ability-id="marksman"');
  const sixthSense = content.indexOf('data-creation-ability-id="sixth-sense"');
  const alchemy = content.indexOf('data-creation-ability-id="alchemy"');
  assert.ok(acrobatics < marksman && marksman < sixthSense && sixthSense < alchemy);
  assert.equal((content.match(/data-occupation-recommended="true"/g) ?? []).length, 3);
  assert.equal((content.match(/<small><i class="fa-solid fa-compass"[^>]*><\/i>Patrulheiro<\/small>/g) ?? []).length, 3);
});

test("Poder Místico and Ritualista list every accessible world choice as Observer", async () => {
  const blank = actor({ id: "special-choices", uuid: "Actor.special-choices" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "race-complete" });
  const mysticalAbility = worldAbility("mystical-ability", "Poder Místico");
  mysticalAbility.system.reference = "mysticalpower";
  const ritualist = worldAbility("ritualist-ability", "Ritualista");
  ritualist.system.reference = "ritualist";
  const permissionLevels = [];
  const previous = game.items;
  game.items = [
    mysticalAbility,
    ritualist,
    worldMysticalPower("power-visible", "Cascata de Enxofre", (_user, level) => {
      permissionLevels.push(["power", level]);
      return level === 2;
    }),
    worldMysticalPower("power-hidden", "Poder Oculto", () => false),
    worldRitual("ritual-visible", "Interrogatório Telepático", (_user, level) => {
      permissionLevels.push(["ritual", level]);
      return level === 2;
    }),
    worldRitual("ritual-hidden", "Ritual Oculto", () => false)
  ];
  dialogChoices.push("close");
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /Cascata de Enxofre/);
  assert.match(content, /Interrogatório Telepático/);
  assert.match(content, /data-choice-type="mysticalPower"/);
  assert.match(content, /data-open-creation-item="power-visible"/);
  assert.doesNotMatch(content, /ReadMysticalPower/);
  assert.match(content, /data-select-ritual="ritual-visible"/);
  assert.match(content, /data-open-creation-item="ritual-visible"/);
  assert.doesNotMatch(content, /Ritual description ritual-visible/);
  assert.doesNotMatch(content, /<details>/);
  assert.doesNotMatch(content, /Poder Oculto/);
  assert.doesNotMatch(content, /Ritual Oculto/);
  assert.deepEqual(permissionLevels, [["power", 2], ["ritual", 2]]);
});

test("different mystical powers can occupy separate Ability selections", () => {
  assert.equal(isValidAbilitySelection([
    { id: "mystical-ability", rank: "novice", choiceId: "power-a" },
    { id: "mystical-ability", rank: "novice", choiceId: "power-b" }
  ], ABILITY_DISTRIBUTION_MODES.EXPERIENCE, 0, { experienceBudget: 20 }), true);
  assert.equal(isValidAbilitySelection([
    { id: "mystical-ability", rank: "novice", choiceId: "power-a" },
    { id: "mystical-ability", rank: "adept", choiceId: "power-a" }
  ], ABILITY_DISTRIBUTION_MODES.EXPERIENCE, 0, { experienceBudget: 40 }), false);
});

test("saving five Novice choices creates native Abilities without spending XP", async () => {
  const blank = actor({ id: "five-abilities", uuid: "Actor.five-abilities" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "race-complete", race: "goblin", abilityCostTraits: ["survivalInstinct"]
  });
  const abilities = ["a", "b", "c", "d"].map((id) => worldAbility(id));
  const previous = game.items;
  game.items = abilities;
  dialogChoices.push({
    action: "choose-abilities",
    form: {
      abilityDistributionMode: "five-novice",
      abilitySelections: JSON.stringify(abilities.map(({ id }) => ({ id, rank: "novice" })))
    }
  });
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  assert.equal(blank.items.length, 4);
  assert.equal(blank.items.every((item) => item.system.novice.isActive), true);
  assert.equal(blank.items.every((item) => !item.system.adept.isActive && !item.system.master.isActive), true);
  assert.deepEqual(blank.updates.at(-1), { "system.bonus.experience.value": 50 });
  assert.equal(isAbilitiesStepComplete(blank), true);
  assert.equal(blank.flag("characterCreatorState").abilityDistribution, "five-novice");
});

test("saving the mixed distribution activates its Adept Ability at both required levels", async () => {
  const blank = actor({ id: "mixed-abilities", uuid: "Actor.mixed-abilities" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "race-complete" });
  const abilities = [worldAbility("a"), worldAbility("b"), worldAbility("c")];
  const previous = game.items;
  game.items = abilities;
  dialogChoices.push({
    action: "choose-abilities",
    form: {
      abilityDistributionMode: "mixed",
      abilitySelections: JSON.stringify([
        { id: "a", rank: "novice" }, { id: "b", rank: "novice" }, { id: "c", rank: "adept" }
      ])
    }
  });
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  const adept = blank.items.find((item) => item.id === "c" || item._id === "c" || item.name === "Ability c");
  assert.equal(adept.system.novice.isActive, true);
  assert.equal(adept.system.adept.isActive, true);
  assert.equal(adept.system.master.isActive, false);
  assert.deepEqual(blank.updates.at(-1), { "system.bonus.experience.value": 50 });
  assert.equal(isAbilitiesStepComplete(blank), true);
});

test("XP purchase is the primary mode and records spent and remaining experience", async () => {
  const blank = actor({ id: "xp-abilities", uuid: "Actor.xp-abilities" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "race-complete" });
  const abilities = [worldAbility("a"), worldAbility("b")];
  const previous = game.items;
  game.items = abilities;
  dialogChoices.push({
    action: "choose-abilities",
    form: {
      abilityDistributionMode: "experience",
      abilityExperienceBudget: 80,
      abilitySelections: JSON.stringify([
        { id: "a", rank: "novice" }, { id: "b", rank: "master" }
      ])
    }
  });
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  const master = blank.items.find((item) => item.name === "Ability b");
  assert.equal(master.system.novice.isActive, true);
  assert.equal(master.system.adept.isActive, true);
  assert.equal(master.system.master.isActive, true);
  assert.deepEqual(blank.updates.at(-1), {
    "system.experience.total": 80,
    "system.bonus.experience.value": 0
  });
  assert.equal(blank.flag("characterCreatorState").abilityDistribution, "experience");
  assert.equal(blank.flag("characterCreatorState").abilityExperienceBudget, 80);
  assert.equal(blank.flag("characterCreatorState").abilityExperienceSpent, 70);
});

test("buying mystical powers creates the chosen native powers without duplicating the generic Ability", async () => {
  const blank = actor({ id: "mystical-powers", uuid: "Actor.mystical-powers" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "race-complete" });
  const mysticalAbility = worldAbility("mystical-ability", "Poder Místico");
  mysticalAbility.system.reference = "mysticalpower";
  const previous = game.items;
  game.items = [mysticalAbility, worldMysticalPower("power-a"), worldMysticalPower("power-b")];
  dialogChoices.push({
    action: "choose-abilities",
    form: {
      abilityDistributionMode: "experience",
      abilityExperienceBudget: 40,
      abilitySelections: JSON.stringify([
        { id: "mystical-ability", rank: "novice", kind: "mysticalPower", choiceId: "power-a" },
        { id: "mystical-ability", rank: "adept", kind: "mysticalPower", choiceId: "power-b" }
      ])
    }
  });
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  assert.deepEqual(blank.items.map((item) => item.type), ["mysticalPower", "mysticalPower"]);
  assert.equal(blank.items.some((item) => item.name === "Poder Místico"), false);
  assert.equal(blank.items[0].system.novice.isActive, true);
  assert.equal(blank.items[0].system.adept.isActive, false);
  assert.equal(blank.items[1].system.adept.isActive, true);
  assert.equal(blank.flag("characterCreatorState").abilityExperienceSpent, 40);
});

test("Ritualista automatically adds the number of selected rituals allowed by its rank", async () => {
  const blank = actor({ id: "ritualist", uuid: "Actor.ritualist" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "race-complete" });
  const ritualist = worldAbility("ritualist-ability", "Ritualista");
  ritualist.system.reference = "ritualist";
  const previous = game.items;
  game.items = [ritualist, worldRitual("ritual-a"), worldRitual("ritual-b"), worldRitual("ritual-c")];
  dialogChoices.push({
    action: "choose-abilities",
    form: {
      abilityDistributionMode: "experience",
      abilityExperienceBudget: 30,
      abilitySelections: JSON.stringify([{
        id: "ritualist-ability",
        rank: "adept",
        kind: "ritualist",
        ritualIds: ["ritual-a", "ritual-b", "ritual-c"]
      }])
    }
  });
  try {
    await CharacterCreatorService.openAbilitiesStep(blank);
  } finally {
    game.items = previous;
  }
  assert.deepEqual(blank.items.map((item) => item.type), ["ability", "ritual", "ritual", "ritual"]);
  assert.equal(blank.items[0].system.novice.isActive, true);
  assert.equal(blank.items[0].system.adept.isActive, true);
  assert.deepEqual(blank.flag("characterCreatorState").abilities[0].ritualNames, [
    "Ritual ritual-a", "Ritual ritual-b", "Ritual ritual-c"
  ]);
});

test("the fifth creator step explains Shadows with principles and examples", async () => {
  const blank = actor({ id: "shadow-guide", uuid: "Actor.shadow-guide" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "abilities-complete"
  });
  dialogChoices.push("close");
  await CharacterCreatorService.openShadowStep(blank);
  assert.deepEqual(dialogConfigs.at(-1).position, { width: 1060, height: 690 });
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /symbaroum-hud-shadow-book/);
  assert.match(content, /SYMBAROUMHUD\.CharacterCreator\.Guide\.ShadowProgress/);
  assert.match(content, /data-shadow-tone="nature"/);
  assert.match(content, /data-shadow-tone="civilization"/);
  assert.match(content, /data-shadow-tone="corrupted"/);
  assert.match(content, /symbaroum-hud-shadow-index/);
  assert.match(content, /data-shadow-page-id="nature"/);
  assert.match(content, /data-shadow-page-id="civilization"/);
  assert.match(content, /data-shadow-page-id="darkness"/);
  assert.match(content, /data-shadow-page="nature"/);
  assert.match(content, /assets\/shadows\/nature\.webp/);
  assert.match(content, /assets\/shadows\/civilization\.webp/);
  assert.match(content, /assets\/shadows\/darkness\.webp/);
  assert.match(content, /data-shadow-example=/);
  assert.match(content, /textarea name="shadow"/);
  assert.equal(isAbilitiesStepComplete(blank), true);
  assert.equal(isShadowStepComplete(blank), false);
});

test("completed creator steps can be reviewed backward and forward from the step marker", async () => {
  const blank = actor({ id: "creator-navigation", uuid: "Actor.creator-navigation" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "abilities-complete",
    occupation: "wizard",
    attributes: {},
    race: "ambrian",
    abilities: []
  });
  const firstDialog = dialogConfigs.length;
  dialogChoices.push(
    { action: "creator-previous-step" },
    { action: "creator-previous-step" },
    { action: "creator-next-step" },
    "close"
  );

  await CharacterCreatorService.openShadowStep(blank);
  const opened = dialogConfigs.slice(firstDialog);
  assert.match(opened[0].content, /symbaroum-hud-shadow-book/);
  assert.match(opened[1].content, /symbaroum-hud-abilities-book/);
  assert.match(opened[2].content, /symbaroum-hud-race-book/);
  assert.match(opened[3].content, /symbaroum-hud-abilities-book/);
  assert.equal(opened[2].buttons.some((button) => button.action === "creator-next-step"), true);
  assert.match(opened[2].content, /data-creator-navigation="previous"/);
  assert.match(opened[2].content, /data-creator-navigation="next"/);
});

test("editing an earlier creator step preserves the furthest completed step", async () => {
  const blank = actor({ id: "creator-review-save", uuid: "Actor.creator-review-save" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1,
    step: "abilities-complete",
    occupation: "wizard",
    race: "ambrian",
    abilities: []
  });
  dialogChoices.push(
    { action: "creator-previous-step" },
    { action: "creator-previous-step" },
    { action: "creator-previous-step" },
    { action: "creator-previous-step" },
    { action: "choose-occupation", occupation: "knight" },
    "close"
  );

  await CharacterCreatorService.openShadowStep(blank);
  assert.equal(blank.flag("characterCreatorState").step, "abilities-complete");
  assert.equal(blank.flag("characterCreatorState").occupation, "knight");
});

test("saving the Shadow writes the native biography field and completes step five", async () => {
  const blank = actor({ id: "shadow-save", uuid: "Actor.shadow-save" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "abilities-complete", abilities: [{ id: "a" }]
  });
  dialogChoices.push({
    action: "choose-shadow",
    form: { shadow: "  Prateada como uma lâmina sob a lua.  " }
  });
  assert.equal(
    await CharacterCreatorService.openShadowStep(blank),
    "Prateada como uma lâmina sob a lua."
  );
  assert.deepEqual(blank.updates.at(-1), {
    "system.bio.shadow": "Prateada como uma lâmina sob a lua."
  });
  assert.equal(blank.flag("characterCreatorState").step, "shadow-complete");
  assert.equal(blank.flag("characterCreatorState").abilities[0].id, "a");
  assert.equal(isShadowStepComplete(blank), true);
  assert.deepEqual(hookCalls.at(-1), [
    "symbaroum-hud.characterCreatorStepCompleted",
    blank,
    { step: "shadow", shadow: "Prateada como uma lâmina sob a lua." }
  ]);
});

test("starting money grants one thaler for every complete ten XP", () => {
  assert.equal(startingThalerForExperience(0), 0);
  assert.equal(startingThalerForExperience(50), 5);
  assert.equal(startingThalerForExperience(70), 7);
  assert.equal(startingThalerForExperience(79), 7);
});

test("the sixth creator step maps learned Abilities to compatible accessible equipment", async () => {
  const twinAttack = worldAbility("twin", "Ataque Gêmeo");
  twinAttack.system.reference = "twinattack";
  twinAttack.system.novice.isActive = true;
  twinAttack.system.adept.isActive = true;
  const marksman = worldAbility("marksman", "Atirador");
  marksman.system.reference = "marksman";
  const blank = actor({ id: "equipment-guide", uuid: "Actor.equipment-guide", items: [twinAttack, marksman] });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "shadow-complete", abilityExperienceBudget: 70
  });
  const permissions = [];
  const previous = game.items;
  game.items = [
    worldEquipment("one-handed", "Arma de Uma Mão", "weapon", { reference: "1handed" }, (_user, level) => { permissions.push(level); return true; }),
    worldEquipment("short", "Arma Curta", "weapon", { reference: "short" }),
    worldEquipment("crossbow", "Besta", "weapon", { reference: "crossbow" }),
    worldEquipment("bow", "Arco", "weapon", { reference: "bow" }),
    worldEquipment("quiver", "Aljava", "equipment", { reference: "quiver" }),
    worldEquipment("ammo", "Flechas/Virotes", "equipment", { reference: "ammo" }, () => true, {
      flags: { "symbaroum-ind-resources": { isAmmo: true, ammoType: "ammo" } }
    }),
    worldEquipment("light-armor", "Armadura Leve", "armor", { reference: "lightarmor", baseProtection: "1d4" }),
    worldEquipment("hidden-bow", "Arco oculto", "weapon", { reference: "ranged" }, () => false),
    worldEquipment("camp", "Equipamento de Acampar", "equipment", { reference: "campingEquipment", description: "Contém: Corda" })
  ];
  dialogChoices.push("close");
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }
  assert.deepEqual(dialogConfigs.at(-1).position, { width: 1060, height: 690 });
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /symbaroum-hud-equipment-book/);
  assert.match(content, /Passo 6|EquipmentProgress/);
  assert.match(content, /symbaroum-hud-equipment-official-text/);
  assert.match(content, /OfficialIntroductionBeforeCamp/);
  assert.match(content, /symbaroum-hud-equipment-ability-rewards/);
  assert.match(content, /AbilityGrantLead/);
  assert.match(content, /GrantedByAbility/);
  assert.match(content, /Arma de Uma Mão/);
  assert.match(content, /Besta/);
  assert.match(content, /Arco/);
  assert.match(content, /Aljava/);
  assert.match(content, /Flechas\/Virotes/);
  assert.match(content, /name="equipmentGrant-marksman-0" value="crossbow"/);
  assert.match(content, /name="equipmentGrant-marksman-0" value="bow"/);
  assert.match(content, /Armadura Leve/);
  assert.match(content, /×2/);
  assert.match(content, /data-open-equipment-item="camp"/);
  assert.match(content, /data-open-equipment-item="one-handed"/);
  assert.match(content, /data-open-equipment-item="light-armor"/);
  assert.doesNotMatch(content, /symbaroum-hud-equipment-automatic-grant/);
  assert.doesNotMatch(content, /symbaroum-hud-equipment-camping/);
  assert.doesNotMatch(content, /symbaroum-hud-equipment-starting-rules/);
  assert.doesNotMatch(content, /<select[^>]+equipmentGrant-/);
  assert.match(content, /Equipamento de Acampar/);
  assert.match(content, />7<\/strong>/);
  assert.doesNotMatch(content, /Arco oculto/);
  assert.equal(permissions.includes(2), true);
  assert.equal(isShadowStepComplete(blank), true);
  assert.equal(isEquipmentStepComplete(blank), false);
});

test("an Ability-granted armor identifies its source and replaces the basic Light Armor", async () => {
  const manAtArms = worldAbility("man-at-arms", "Homem de Armas");
  manAtArms.system.reference = "manatarms";
  const blank = actor({ id: "ability-armor", uuid: "Actor.ability-armor", items: [manAtArms] });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "shadow-complete"
  });
  const previous = game.items;
  game.items = [
    worldEquipment("medium-armor", "Armadura Média", "armor", {
      reference: "mediumarmor", baseProtection: "1d6"
    }),
    worldEquipment("light-armor", "Armadura Leve", "armor", {
      reference: "lightarmor", baseProtection: "1d4"
    }),
    worldEquipment("camp", "Equipamento de Acampar", "equipment", {
      reference: "campingEquipment"
    })
  ];
  const firstDialog = dialogConfigs.length;
  dialogChoices.push({ action: "choose-equipment", form: {} });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }

  const content = dialogConfigs[firstDialog].content;
  assert.match(content, /Armadura Média/);
  assert.match(content, /GrantedByAbility/);
  assert.match(content, /ArmorAlreadyGranted/);
  assert.doesNotMatch(content, /data-open-equipment-item="light-armor"/);
  assert.ok(blank.items.find((item) => item.name === "Armadura Média"));
  assert.equal(blank.items.some((item) => item.name === "Armadura Leve"), false);
});

test("Marksman imports the chosen Bow plus a quiver and ten arrows or bolts", async () => {
  const marksman = worldAbility("marksman", "Atirador");
  marksman.system.reference = "marksman";
  const blank = actor({ id: "equipment-save", uuid: "Actor.equipment-save", items: [marksman] });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "shadow-complete", abilityExperienceBudget: 70, shadow: "Prateada"
  });
  const bow = worldEquipment("bow", "Arco", "weapon", {
    reference: "bow", state: "other", number: 1
  });
  const crossbow = worldEquipment("crossbow", "Besta", "weapon", {
    reference: "crossbow", state: "other", number: 1
  });
  const quiver = worldEquipment("quiver", "Aljava", "equipment", {
    reference: "quiver", state: "other", number: 1
  });
  const ammunition = worldEquipment("ammo", "Flechas/Virotes", "equipment", {
    reference: "ammo", state: "other", number: 1
  });
  const camp = worldEquipment("camp", "Equipamento de Acampar", "equipment", {
    reference: "campingEquipment", description: "Contém: Corda", state: "equipped", number: 1
  }, () => true, { flags: { "symbaroum-ind-resources": { isContainer: true } } });
  const lightArmor = worldEquipment("light-armor", "Armadura Leve", "armor", {
    reference: "lightarmor", baseProtection: "1d4", state: "other", number: 1
  });
  const previous = game.items;
  game.items = [bow, crossbow, quiver, ammunition, lightArmor, camp];
  dialogChoices.push({
    action: "choose-equipment",
    form: { "equipmentGrant-marksman-0": "bow" }
  });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }
  const createdBow = blank.items.find((item) => item.name === "Arco");
  const createdCamp = blank.items.find((item) => item.name === "Equipamento de Acampar");
  assert.ok(createdBow);
  assert.equal(blank.items.some((item) => item.name === "Besta"), false);
  assert.ok(blank.items.find((item) => item.name === "Aljava"));
  assert.equal(blank.items.find((item) => item.name === "Flechas/Virotes")?.system.number, 10);
  assert.ok(createdCamp);
  assert.ok(blank.items.find((item) => item.name === "Armadura Leve"));
  assert.equal(blank.items.some((item) => item.name === "Adaga"), false);
  assert.equal(createdCamp.system.description, "Contém: Corda");
  assert.equal(createdCamp.flags["symbaroum-ind-resources"].isContainer, true);
  assert.deepEqual(blank.updates.at(-1), { "system.money.thaler": 7 });
  assert.equal(blank.flag("characterCreatorState").step, "equipment-complete");
  assert.equal(blank.flag("characterCreatorState").startingExperience, 70);
  assert.equal(blank.flag("characterCreatorState").startingThaler, 7);
  assert.equal(isEquipmentStepComplete(blank), true);
});

test("Marksman imports the configured Crossbow when that option is chosen", async () => {
  const marksman = worldAbility("marksman-crossbow", "Atirador");
  marksman.system.reference = "marksman";
  const blank = actor({ id: "equipment-crossbow", uuid: "Actor.equipment-crossbow", items: [marksman] });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "shadow-complete" });
  const previous = game.items;
  game.items = [
    worldEquipment("crossbow", "Besta", "weapon", { reference: "crossbow" }),
    worldEquipment("bow", "Arco", "weapon", { reference: "bow" }),
    worldEquipment("quiver", "Aljava", "equipment", { reference: "quiver" }),
    worldEquipment("ammo", "Flechas/Virotes", "equipment", { reference: "ammo" }, () => true, {
      flags: {
        "symbaroum-ind-resources": {
          isAmmo: true,
          ammoType: "ammo"
        }
      }
    }),
    worldEquipment("light-armor", "Armadura Leve", "armor", { reference: "lightarmor", baseProtection: "1d4" }),
    worldEquipment("camp", "Equipamento de Acampar", "equipment", { reference: "campingEquipment" })
  ];
  dialogChoices.push({ action: "choose-equipment", form: { "equipmentGrant-marksman-0": "crossbow" } });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }
  assert.ok(blank.items.find((item) => item.name === "Besta"));
  assert.equal(blank.items.some((item) => item.name === "Arco"), false);
  assert.ok(blank.items.find((item) => item.name === "Aljava"));
  assert.equal(blank.items.find((item) => item.name === "Flechas/Virotes")?.system.number, 10);
});

test("existing camping equipment is not duplicated when the equipment step is confirmed", async () => {
  const existingCamp = worldEquipment("owned-camp", "Equipamento de Acampar", "equipment", {
    reference: "campingEquipment", description: "Contém: Corda", state: "equipped", number: 1
  });
  const blank = actor({ id: "equipment-camp", uuid: "Actor.equipment-camp", items: [existingCamp] });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "shadow-complete" });
  const previous = game.items;
  game.items = [
    worldEquipment("staff", "Bordão", "weapon", { reference: "long" }),
    worldEquipment("dagger", "Adaga", "weapon", { reference: "short" }),
    worldEquipment("light-armor", "Armadura Leve", "armor", { reference: "lightarmor", baseProtection: "1d4" })
  ];
  dialogChoices.push({ action: "choose-equipment", form: {
    "equipmentGrant-basicweapon-0": "staff"
  } });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }
  assert.equal(blank.items.filter((item) => item.name === "Equipamento de Acampar").length, 1);
  assert.deepEqual(blank.updates.at(-1), { "system.money.thaler": 5 });
});

test("a character without weapon or armor grants chooses an official weapon combination and light armor", async () => {
  const blank = actor({ id: "basic-equipment", uuid: "Actor.basic-equipment" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "shadow-complete" });
  const previous = game.items;
  game.items = [
    worldEquipment("staff", "Bordão", "weapon", { reference: "long" }),
    worldEquipment("sword", "Espada", "weapon", { reference: "1handed" }),
    worldEquipment("bow", "Arco", "weapon", { reference: "bow" }),
    worldEquipment("dagger", "Adaga", "weapon", { reference: "short" }),
    worldEquipment("quiver", "Aljava", "equipment", { reference: "quiver" }),
    worldEquipment("ammo", "Flechas/Virotes", "equipment", { reference: "ammo" }, () => true, {
      flags: { "symbaroum-ind-resources": { isAmmo: true, ammoType: "ammo" } }
    }),
    worldEquipment("light-armor", "Armadura Leve", "armor", { reference: "lightarmor", baseProtection: "1d4" }),
    worldEquipment("camp", "Equipamento de Acampar", "equipment", { reference: "campingEquipment" })
  ];
  const firstDialog = dialogConfigs.length;
  dialogChoices.push({ action: "choose-equipment", form: {
    "equipmentGrant-basicweapon-0": "bow"
  } });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }

  const content = dialogConfigs[firstDialog].content;
  assert.match(content, /equipmentGrant-basicweapon-0/);
  assert.match(content, /StaffCombination/);
  assert.match(content, /OneHandedCombination/);
  assert.match(content, /RangedCombination/);
  assert.deepEqual(
    blank.items.filter((item) => ["weapon", "armor"].includes(item.type)).map((item) => item.name).sort(),
    ["Arco", "Adaga", "Armadura Leve"].sort()
  );
  assert.ok(blank.items.find((item) => item.name === "Aljava"));
  const arrows = blank.items.find((item) => item.name === "Flechas/Virotes");
  assert.ok(arrows);
  assert.equal(arrows.system.number, 10);
  assert.equal(arrows.flags["symbaroum-ind-resources"].isAmmo, true);
});

test("the Bow combination recognizes the official regular arrows and bolts item name", async () => {
  const blank = actor({ id: "regular-ammo-equipment", uuid: "Actor.regular-ammo-equipment" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "shadow-complete" });
  const previous = game.items;
  game.items = [
    worldEquipment("bow", "Arco", "weapon", { reference: "bow" }),
    worldEquipment("dagger", "Adaga", "weapon", { reference: "short" }),
    worldEquipment("quiver", "Aljava", "equipment", { reference: "quiver" }),
    worldEquipment("ammo", "Flechas/Virotes - Regulares", "equipment", { reference: "regular-ammunition" }),
    worldEquipment("light-armor", "Armadura Leve", "armor", { reference: "lightarmor", baseProtection: "1d4" }),
    worldEquipment("camp", "Equipamento de Acampar", "equipment", { reference: "campingEquipment" })
  ];
  const firstDialog = dialogConfigs.length;
  dialogChoices.push({ action: "choose-equipment", form: {
    "equipmentGrant-basicweapon-0": "bow"
  } });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }
  const content = dialogConfigs[firstDialog].content;
  assert.match(content, /value="bow" required data-equipment-grant >/);
  assert.ok(blank.items.find((item) => item.name === "Arco"));
  assert.ok(blank.items.find((item) => item.name === "Aljava"));
  assert.equal(blank.items.find((item) => item.name === "Flechas/Virotes - Regulares")?.system.number, 10);
});

test("starting combinations import the configured named weapons from the world", async () => {
  const blank = actor({ id: "category-equipment", uuid: "Actor.category-equipment" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "shadow-complete" });
  const previous = game.items;
  game.items = [
    worldEquipment("generic-long", "Long Weapon", "weapon", { reference: "long" }),
    worldEquipment("specific-staff", "Bordão", "weapon", { reference: "long", quality: "configured" }),
    worldEquipment("generic-short", "Short Weapon", "weapon", { reference: "short" }),
    worldEquipment("specific-dagger", "Adaga", "weapon", { reference: "short", quality: "configured" }),
    worldEquipment("light-armor-category", "Light Armor", "armor", { reference: "lightarmor", baseProtection: "1d4" }),
    worldEquipment("camp-category", "Camping Equipment", "equipment", { reference: "campingEquipment" })
  ];
  const firstDialog = dialogConfigs.length;
  dialogChoices.push({ action: "choose-equipment", form: {
    "equipmentGrant-basicweapon-0": "staff"
  } });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }

  const content = dialogConfigs[firstDialog].content;
  assert.match(content, /StaffCombination/);
  assert.doesNotMatch(content, /<select[^>]+equipmentGrant-/);
  assert.deepEqual(
    blank.items.filter((item) => ["weapon", "armor"].includes(item.type)).map((item) => item.name).sort(),
    ["Bordão", "Adaga", "Light Armor"].sort()
  );
  assert.equal(blank.items.some((item) => ["Long Weapon", "Short Weapon"].includes(item.name)), false);
  assert.equal(blank.items.find((item) => item.name === "Bordão")?.system.quality, "configured");
});

test("the sword combination imports the configured Sword and Dagger items", async () => {
  const blank = actor({ id: "sword-equipment", uuid: "Actor.sword-equipment" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "shadow-complete" });
  const previous = game.items;
  game.items = [
    worldEquipment("staff", "Bordão", "weapon", { reference: "long" }),
    worldEquipment("sword", "Espada", "weapon", { reference: "1handed", quality: "configured" }),
    worldEquipment("dagger", "Adaga", "weapon", { reference: "short", quality: "configured" }),
    worldEquipment("bow", "Arco", "weapon", { reference: "bow" }),
    worldEquipment("quiver", "Aljava", "equipment", { reference: "quiver" }),
    worldEquipment("ammo", "Flechas/Virotes", "equipment", { reference: "ammo" }),
    worldEquipment("light-armor", "Armadura Leve", "armor", { reference: "lightarmor", baseProtection: "1d4" }),
    worldEquipment("camp", "Equipamento de Acampar", "equipment", { reference: "campingEquipment" })
  ];
  dialogChoices.push({ action: "choose-equipment", form: { "equipmentGrant-basicweapon-0": "sword" } });
  try {
    await CharacterCreatorService.openEquipmentStep(blank);
  } finally {
    game.items = previous;
  }
  assert.ok(blank.items.find((item) => item.name === "Espada"));
  assert.ok(blank.items.find((item) => item.name === "Adaga"));
  assert.equal(blank.items.find((item) => item.name === "Espada")?.system.quality, "configured");
});

test("the seventh creator step guides personality and background through native sheet fields", async () => {
  const blank = actor({ id: "personality-guide", uuid: "Actor.personality-guide" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "equipment-complete" });
  dialogChoices.push("close");

  await CharacterCreatorService.openPersonalityStep(blank);
  const config = dialogConfigs.at(-1);
  assert.deepEqual(config.position, { width: 1060, height: 700 });
  assert.match(config.content, /symbaroum-hud-personality-book/);
  assert.match(config.content, /PersonalityProgress/);
  assert.match(config.content, /name="personalityName"/);
  assert.match(config.content, /name="personalityAppearance"/);
  assert.match(config.content, /name="personalityBackground"/);
  assert.match(config.content, /name="personalityGoal"/);
  assert.equal(isEquipmentStepComplete(blank), true);
  assert.equal(isPersonalityStepComplete(blank), false);
});

test("saving personality and background writes every official biography field", async () => {
  const blank = actor({ id: "personality-save", uuid: "Actor.personality-save" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "equipment-complete", equipment: [{ itemName: "Arco" }]
  });
  dialogChoices.push({ action: "choose-personality", form: {
    personalityName: "Rabuja",
    personalityQuote: "Você me ajudou, irei ajudar você.",
    personalityAge: "30 anos",
    personalityHeight: "2,04 m",
    personalityWeight: "130 kg",
    personalityAppearance: "Alta, magrela e de humor seco.",
    personalityBackground: "Foi criada por uma companhia teatral.",
    personalityGoal: "Encontrar quem lhe ensinou magia."
  } });

  const result = await CharacterCreatorService.openPersonalityStep(blank);
  assert.equal(result.characterName, "Rabuja");
  assert.deepEqual(blank.updates.at(-1), {
    name: "Rabuja",
    "system.bio.quote": "Você me ajudou, irei ajudar você.",
    "system.bio.age": "30 anos",
    "system.bio.height": "2,04 m",
    "system.bio.weight": "130 kg",
    "system.bio.appearance": "Alta, magrela e de humor seco.",
    "system.bio.background": "Foi criada por uma companhia teatral.",
    "system.bio.personalGoal": "Encontrar quem lhe ensinou magia."
  });
  assert.equal(blank.flag("characterCreatorState").step, "personality-complete");
  assert.deepEqual(blank.flag("characterCreatorState").equipment, [{ itemName: "Arco" }]);
  assert.equal(isPersonalityStepComplete(blank), true);
});

test("the eighth creator step mirrors the official friends and group fields", async () => {
  const blank = actor({ id: "friends-guide", uuid: "Actor.friends-guide" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", { version: 1, step: "personality-complete" });
  dialogChoices.push("close");

  await CharacterCreatorService.openFriendsStep(blank);
  const config = dialogConfigs.at(-1);
  assert.deepEqual(config.position, { width: 1060, height: 690 });
  assert.match(config.content, /symbaroum-hud-friends-book/);
  assert.match(config.content, /FriendsProgress/);
  assert.equal((config.content.match(/data-friend-row=/g) ?? []).length, 5);
  assert.match(config.content, /name="friendName-0"/);
  assert.match(config.content, /name="friendRace-0"/);
  assert.match(config.content, /name="friendOccupation-0"/);
  assert.match(config.content, /name="friendPlayer-0"/);
  assert.match(config.content, /name="groupName"/);
  assert.match(config.content, /name="groupGoal"/);
  assert.doesNotMatch(config.content, /name="groupGoal" required/);
  assert.match(config.content, /Friends\.Optional/);
  assert.equal(isPersonalityStepComplete(blank), true);
  assert.equal(isFriendsStepComplete(blank), false);
});

test("the optional friends and group step can be completed without any fields", async () => {
  const blank = actor({ id: "friends-skip", uuid: "Actor.friends-skip" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "personality-complete"
  });
  dialogChoices.push({ action: "choose-friends", form: {} });

  const result = await CharacterCreatorService.openFriendsStep(blank);
  assert.deepEqual(result, { companions: [], group: { name: "", goal: "" } });
  assert.equal(blank.flag("characterCreatorState").step, "friends-complete");
  assert.equal(isFriendsStepComplete(blank), true);
});

test("friends and group are saved as structured actor creation data", async () => {
  const blank = actor({ id: "friends-save", uuid: "Actor.friends-save" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "personality-complete", personality: { characterName: "Rabuja" }
  });
  dialogChoices.push({ action: "choose-friends", form: {
    "friendName-0": "Gerobai",
    "friendRace-0": "Ambriano",
    "friendOccupation-0": "Duelista",
    "friendPlayer-0": "Adem",
    "friendName-1": "Yulma",
    "friendRace-1": "Goblin",
    "friendOccupation-1": "Batedora",
    "friendPlayer-1": "Rodina",
    groupName: "Companhia Teatral da Pomba Branca",
    groupGoal: "Escapar da fúria do Barão Flagros"
  } });

  const result = await CharacterCreatorService.openFriendsStep(blank);
  assert.equal(result.companions.length, 2);
  assert.deepEqual(result.group, {
    name: "Companhia Teatral da Pomba Branca",
    goal: "Escapar da fúria do Barão Flagros"
  });
  assert.equal(blank.flag("characterCreatorState").step, "friends-complete");
  assert.deepEqual(blank.flag("characterCreatorState").personality, { characterName: "Rabuja" });
  assert.deepEqual(blank.flag("characterCreatorState").friendsGroup, result);
  assert.equal(isFriendsStepComplete(blank), true);
});
