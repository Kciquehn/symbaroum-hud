import assert from "node:assert/strict";
import test from "node:test";

const hookCalls = [];
const dialogChoices = [];
const dialogConfigs = [];

globalThis.game = {
  user: { id: "user" },
  items: [],
  i18n: {
    localize: (key) => key,
    format: (key, data) => `${key}:${data.traits}`
  }
};
globalThis.ui = { notifications: { error: () => undefined, warn: () => undefined, info: () => undefined } };
globalThis.Hooks = {
  on: () => undefined,
  callAll: (...args) => hookCalls.push(args)
};
globalThis.foundry = {
  applications: {
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
  isAttributesStepComplete,
  isOccupationStepComplete,
  isRaceStepComplete,
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
        background: ""
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
  dialogChoices.push(CHARACTER_CREATION_MODES.MANUAL);

  assert.equal(
    await CharacterCreatorService.offer(blank),
    CHARACTER_CREATION_MODES.MANUAL
  );
  assert.equal(blank.flag("characterCreationMode"), CHARACTER_CREATION_MODES.MANUAL);
});

test("marks a creator request and opens the occupation book", async () => {
  const blank = actor({ id: "creator", uuid: "Actor.creator" });
  dialogChoices.push(CHARACTER_CREATION_MODES.CREATOR, "close");

  assert.equal(
    await CharacterCreatorService.offer(blank),
    CHARACTER_CREATION_MODES.CREATOR
  );
  assert.equal(blank.flag("characterCreationMode"), CHARACTER_CREATION_MODES.CREATOR);
  assert.match(dialogConfigs.at(-1).content, /symbaroum-hud-occupation-book/);
  assert.deepEqual(hookCalls.at(-1), [
    "symbaroum-hud.characterCreatorRequested",
    blank
  ]);
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
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /symbaroum-hud-creator-step-guide/);
  assert.match(content, /Guide\.Progress/);
  assert.doesNotMatch(content, /Guide\.Title/);
  assert.match(content, /input[^>]+name="occupation"/);
  assert.doesNotMatch(content, /Occupation\.IndexHint/);
  assert.equal((content.match(/data-occupation-id=/g) ?? []).length, 15);
  assert.match(content, /symbaroum-hud-archetype-introduction/);
  assert.match(content, /symbaroum-hud-occupation-details/);
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
  const content = dialogConfigs.at(-1).content;
  assert.match(content, /AttributesProgress/);
  assert.doesNotMatch(content, /Guide\.Title/);
  assert.match(content, /data-attribute-mode="typical"/);
  assert.match(content, /data-attribute-mode="point-buy"/);
  assert.equal((content.match(/data-attribute-card=/g) ?? []).length, 8);
  assert.equal((content.match(/data-typical-attribute=/g) ?? []).length, 8);
  assert.equal((content.match(/data-adjust-attribute=/g) ?? []).length, 16);
  assert.doesNotMatch(content, /Attributes\.RulesLabel/);
  assert.equal((content.match(/data-typical-value=/g) ?? []).length, 8);
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
    attributeDistribution: "point-buy",
    attributes: Object.fromEntries(CORE_ATTRIBUTES.map((attribute, index) => [
      attribute.id,
      distribution[index]
    ]))
  });
});

test("the third creator step presents all core races and their trait rules", async () => {
  const blank = actor({ id: "races", uuid: "Actor.races" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  await blank.setFlag("symbaroum-hud", "characterCreatorState", {
    version: 1, step: "attributes-complete", occupation: "wizard"
  });
  dialogChoices.push("close");

  await CharacterCreatorService.openRaceStep(blank);
  const content = dialogConfigs.at(-1).content;
  assert.equal(CORE_RACES.length, 5);
  assert.equal(Object.keys(CORE_RACE_TRAITS).length, 9);
  assert.match(content, /RaceProgress/);
  assert.doesNotMatch(content, /Guide\.Title/);
  assert.equal((content.match(/data-race-id=/g) ?? []).length, 5);
  assert.match(content, /name="race-choice-ambrian"/);
  assert.match(content, /name="race-optional-goblin-survivalInstinct"/);
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
