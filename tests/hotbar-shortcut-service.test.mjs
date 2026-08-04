import assert from "node:assert/strict";
import test from "node:test";

const documents = new Map();
const warnings = [];
const renders = [];
const flags = {};
const removedFlags = [];
let currentActor = null;

const user = {
  id: "user",
  isGM: false,
  hotbar: { 1: "old-macro" },
  getFlag: (_scope, key) => flags[key],
  setFlag: async (_scope, key, value) => {
    const current = flags[key];
    flags[key] = current && typeof current === "object"
      && value && typeof value === "object"
      ? { ...current, ...value }
      : value;
  },
  unsetFlag: async (_scope, key) => {
    removedFlags.push(key);
    const parts = key.split(".");
    const leaf = parts.pop();
    let current = flags;
    for (const part of parts) {
      current = current?.[part];
      if (!current || typeof current !== "object") return;
    }
    delete current[leaf];
  },
  assignHotbarMacro: async (macro, slot, { fromSlot } = {}) => {
    if (macro) user.hotbar[slot] = macro.id;
    else delete user.hotbar[slot];
    if (fromSlot) delete user.hotbar[fromSlot];
  }
};

globalThis.game = {
  user,
  release: { generation: 13 },
  macros: new Map(),
  i18n: { localize: (key) => key }
};
globalThis.ui = {
  hotbar: { render: async () => renders.push("render") },
  notifications: {
    warn: (message) => warnings.push(message)
  }
};
globalThis.fromUuid = async (uuid) => documents.get(uuid) ?? null;

const { HotbarShortcutService } = await import(
  "../scripts/services/hotbar-shortcut-service.mjs"
);

HotbarShortcutService.setActorResolver(() => currentActor);

function actor(id = "actor") {
  const calls = [];
  return {
    id,
    uuid: `Actor.${id}`,
    type: "player",
    items: new Map(),
    system: { weapons: [{ id: "weapon" }] },
    testUserPermission: () => true,
    rollWeapon: async (weapon) => calls.push(["weapon", weapon.id]),
    usePower: async (power) => calls.push(["power", power.id]),
    calls
  };
}

test("document drops become per-user shortcuts without creating a macro", async () => {
  const owner = actor("actor");
  currentActor = owner;
  const weapon = {
    id: "weapon",
    uuid: "Actor.actor.Item.weapon",
    name: "Espada",
    img: "espada.webp",
    documentName: "Item",
    actor: owner,
    system: { isWeapon: true },
    testUserPermission: () => true
  };
  documents.set(weapon.uuid, weapon);

  await HotbarShortcutService.assignDocumentDrop({
    type: "Item",
    uuid: weapon.uuid
  }, 1);

  assert.equal(user.hotbar[1], undefined);
  assert.deepEqual(HotbarShortcutService.get(1), {
    uuid: weapon.uuid,
    type: "Item",
    name: "Espada",
    img: "espada.webp"
  });
  assert.equal(renders.length, 1);
});

test("document shortcuts are scoped to the active HUD actor", async () => {
  const firstActor = documents.get("Actor.actor.Item.weapon").actor;
  const companion = actor("companion");
  const shield = {
    id: "shield",
    uuid: "Actor.companion.Item.shield",
    name: "Escudo",
    img: "escudo.webp",
    documentName: "Item",
    actor: companion,
    system: {},
    testUserPermission: () => true
  };
  documents.set(shield.uuid, shield);

  currentActor = companion;
  assert.equal(HotbarShortcutService.get(1), null);

  await HotbarShortcutService.assignDocumentDrop({
    type: "Item",
    uuid: shield.uuid
  }, 1);

  assert.equal(HotbarShortcutService.get(1)?.name, "Escudo");
  currentActor = firstActor;
  assert.equal(HotbarShortcutService.get(1)?.name, "Espada");
  currentActor = companion;
  assert.equal(HotbarShortcutService.get(1)?.name, "Escudo");
});

test("moving a document shortcut clears its original slot", async () => {
  currentActor = documents.get("Actor.actor.Item.weapon").actor;
  await HotbarShortcutService.move(1, 2);

  assert.equal(HotbarShortcutService.get(1), null);
  assert.equal(HotbarShortcutService.get(2)?.name, "Espada");
  assert.equal(flags.hotbarShortcuts.actors["Actor.actor"]["1"], undefined);
});

test("clicking a weapon shortcut delegates to the owning Symbaroum actor", async () => {
  const weapon = documents.get("Actor.actor.Item.weapon");
  currentActor = weapon.actor;
  await HotbarShortcutService.activate(2);
  assert.deepEqual(weapon.actor.calls, [["weapon", "weapon"]]);
});

test("clicking a weapon shortcut accepts native weapon item types", async () => {
  const owner = actor("native-weapon-owner");
  currentActor = owner;
  const weapon = {
    id: "weapon",
    uuid: "Actor.native-weapon-owner.Item.weapon",
    name: "Espada",
    img: "espada.webp",
    documentName: "Item",
    type: "weapon",
    actor: owner,
    system: {},
    testUserPermission: () => true
  };
  documents.set(weapon.uuid, weapon);

  await HotbarShortcutService.assignDocumentDrop({
    type: "Item",
    uuid: weapon.uuid
  }, 3);
  await HotbarShortcutService.activate(3);

  assert.deepEqual(owner.calls, [["weapon", "weapon"]]);
});

test("removing a shortcut does not delete its source document", async () => {
  currentActor = documents.get("Actor.actor.Item.weapon").actor;
  await HotbarShortcutService.remove(2);
  assert.equal(HotbarShortcutService.get(2), null);
  assert.equal(flags.hotbarShortcuts.actors["Actor.actor"], undefined);
  assert.ok(documents.has("Actor.actor.Item.weapon"));
});

test("clicking an ability shortcut uses the owning actor power", async () => {
  const owner = actor("ability-owner");
  currentActor = owner;
  const ability = {
    id: "ability",
    uuid: "Actor.actor.Item.ability",
    name: "Amoque",
    img: "amoque.webp",
    documentName: "Item",
    actor: owner,
    system: {
      isPower: true,
      hasScript: true,
      novice: { isActive: true, action: "A" }
    },
    testUserPermission: () => true
  };
  owner.items.set(ability.id, ability);
  documents.set(ability.uuid, ability);

  await HotbarShortcutService.assignDocumentDrop({
    type: "Item",
    uuid: ability.uuid
  }, 3);
  await HotbarShortcutService.activate(3);

  assert.deepEqual(owner.calls, [["power", "ability"]]);
  assert.equal(HotbarShortcutService.get(3)?.name, "Amoque");
});

test("inaccessible documents are rejected", async () => {
  currentActor = actor("hidden-owner");
  const hidden = {
    uuid: "Actor.hidden",
    name: "Oculto",
    documentName: "Actor",
    testUserPermission: () => false
  };
  documents.set(hidden.uuid, hidden);

  await HotbarShortcutService.assignDocumentDrop({
    type: "Actor",
    uuid: hidden.uuid
  }, 2);

  assert.equal(HotbarShortcutService.get(2), null);
  assert.equal(warnings.at(-1), "SYMBAROUMHUD.Notifications.ShortcutUnavailable");
});

test("GM users keep the native Foundry hotbar behavior", async () => {
  user.isGM = true;
  currentActor = actor("gm-actor");
  const item = {
    uuid: "Actor.gm-actor.Item.item",
    name: "Item do Mestre",
    documentName: "Item",
    actor: currentActor,
    testUserPermission: () => true
  };
  documents.set(item.uuid, item);
  const previousHotbar = { ...user.hotbar };
  const previousFlag = flags.hotbarShortcuts;

  assert.equal(HotbarShortcutService.acceptsDocumentDrop({
    type: "Item",
    uuid: item.uuid
  }), false);

  await HotbarShortcutService.assignDocumentDrop({
    type: "Item",
    uuid: item.uuid
  }, 4);

  assert.deepEqual(user.hotbar, previousHotbar);
  assert.equal(flags.hotbarShortcuts, previousFlag);
  assert.equal(HotbarShortcutService.get(4), null);
  user.isGM = false;
});
