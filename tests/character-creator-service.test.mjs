import assert from "node:assert/strict";
import test from "node:test";

const hookCalls = [];
const dialogChoices = [];

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
        wait: async () => dialogChoices.shift() ?? "close"
      }
    }
  },
  utils: { escapeHTML: (value) => String(value) }
};

const {
  CHARACTER_CREATION_MODES,
  CharacterCreatorService,
  isBlankPlayerActor,
  shouldOfferCharacterCreator
} = await import("../scripts/services/character-creator-service.mjs");

function actor(overrides = {}) {
  let mode = null;
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
    getFlag: () => mode,
    setFlag: async (_scope, _key, value) => {
      mode = value;
    },
    mode: () => mode,
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
  assert.equal(blank.mode(), CHARACTER_CREATION_MODES.MANUAL);
});

test("marks a creator request and opens the prototype introduction", async () => {
  const blank = actor({ id: "creator", uuid: "Actor.creator" });
  dialogChoices.push(CHARACTER_CREATION_MODES.CREATOR, "close");

  assert.equal(
    await CharacterCreatorService.offer(blank),
    CHARACTER_CREATION_MODES.CREATOR
  );
  assert.equal(blank.mode(), CHARACTER_CREATION_MODES.CREATOR);
  assert.deepEqual(hookCalls.at(-1), [
    "symbaroum-hud.characterCreatorRequested",
    blank
  ]);
});
