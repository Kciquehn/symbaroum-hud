import assert from "node:assert/strict";
import test from "node:test";

const hookCalls = [];
const dialogChoices = [];
const dialogConfigs = [];

globalThis.game = {
  user: { id: "user" },
  i18n: { localize: (key) => key }
};
globalThis.ui = { notifications: { error: () => undefined } };
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
          if (typeof choice !== "object") return choice;
          const button = config.buttons.find((entry) => entry.action === choice.action);
          return button.callback({}, {
            form: { elements: { occupation: { value: choice.occupation } } }
          });
        }
      }
    }
  },
  utils: { escapeHTML: (value) => String(value) }
};

const {
  CHARACTER_CREATION_MODES,
  CharacterCreatorService,
  isBlankPlayerActor,
  isOccupationStepComplete,
  shouldOfferCharacterCreator
} = await import("../scripts/services/character-creator-service.mjs");
const { CORE_OCCUPATIONS, OCCUPATION_ARCHETYPES } = await import(
  "../scripts/data/core-occupations.mjs"
);

function actor(overrides = {}) {
  const flags = new Map();
  const updates = [];
  return {
    id: "actor",
    uuid: "Actor.actor",
    name: "Novo Personagem",
    type: "player",
    items: [],
    system: {
      attributes: { accurate: { value: 10 } },
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
    flag: (key) => flags.get(key),
    updates,
    ...overrides
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
  assert.match(content, /input[^>]+name="occupation"/);
  assert.equal((content.match(/data-occupation-id=/g) ?? []).length, 15);
  assert.match(content, /symbaroum-hud-archetype-introduction/);
  assert.match(content, /symbaroum-hud-occupation-details/);
});

test("choosing an occupation writes it to the sheet and completes the first step", async () => {
  const blank = actor({ id: "occupation", uuid: "Actor.occupation" });
  await blank.setFlag("symbaroum-hud", "characterCreationMode", "creator");
  dialogChoices.push({ action: "choose-occupation", occupation: "wizard" });

  assert.equal(await CharacterCreatorService.openOccupationStep(blank), "wizard");
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
});
