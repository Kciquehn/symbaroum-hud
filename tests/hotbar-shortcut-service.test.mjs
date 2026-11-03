import assert from "node:assert/strict";
import test from "node:test";

const documents = new Map();
const warnings = [];
const renders = [];
const flags = {};
const removedFlags = [];
let currentActor = null;

// Model Foundry's recursive flag merge, path expansion and deletion keys.
function mergeFlag(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const parts = key.split(".");
    let parent = target;
    for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
    const leaf = parts.at(-1);
    if (leaf.startsWith("-=")) delete parent[leaf.slice(2)];
    else if (value && value.constructor === Object) {
      parent[leaf] = mergeFlag(parent[leaf] ?? {}, value);
    } else parent[leaf] = structuredClone(value);
  }
  return target;
}

const user = {
  id: "user",
  isGM: false,
  hotbar: { 1: "old-macro" },
  getFlag: (_scope, key) => flags[key],
  setFlag: async (_scope, key, value) => {
    flags[key] = mergeFlag(flags[key] ?? {}, value);
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
  assert.equal(flags.hotbarShortcuts.entries.find((entry) => entry.actorKey === "Actor.actor").shortcuts["1"], undefined);
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
  assert.equal(flags.hotbarShortcuts.entries.find((entry) => entry.actorKey === "Actor.actor"), undefined);
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

test("legacy UUID paths expanded by Foundry retain shortcuts through migration", async () => {
  currentActor = actor("legacy");
  flags.hotbarShortcuts = {
    version: 2,
    actors: { Actor: { legacy: { 1: { uuid: "Item.legacy", name: "Legacy" } } } }
  };
  assert.equal(HotbarShortcutService.get(1)?.uuid, "Item.legacy");
  await HotbarShortcutService.move(1, 2);
  assert.equal(HotbarShortcutService.get(1), null);
  assert.equal(HotbarShortcutService.get(2)?.uuid, "Item.legacy");
  assert.equal(flags.hotbarShortcuts.version, 3);
  assert.equal(flags.hotbarShortcuts.actors, undefined);
  await HotbarShortcutService.remove(2);
  assert.equal(HotbarShortcutService.get(2), null);
});

test("synthetic token actor UUIDs survive saving and reloading flags", async () => {
  currentActor = { ...actor("synthetic"), uuid: "Scene.scene.Token.token.Actor.synthetic" };
  const item = { uuid: "Item.token-item", name: "Token item", documentName: "Item", testUserPermission: () => true };
  documents.set(item.uuid, item);
  await HotbarShortcutService.assignDocumentDrop({ type: "Item", uuid: item.uuid }, 5);
  flags.hotbarShortcuts = structuredClone(flags.hotbarShortcuts);
  assert.equal(HotbarShortcutService.get(5)?.uuid, item.uuid);
  await HotbarShortcutService.remove(5);
  assert.equal(HotbarShortcutService.get(5), null);
});

test("a pending document drop remains assigned to the actor where it started", async () => {
  const first = actor("pending-first");
  currentActor = first;
  const resolve = globalThis.fromUuid;
  let finish;
  globalThis.fromUuid = () => new Promise((done) => { finish = done; });
  try {
    const pending = HotbarShortcutService.assignDocumentDrop({ type: "Item", uuid: "Item.pending" }, 1);
    await Promise.resolve();
    currentActor = actor("pending-second");
    finish({ uuid: "Item.pending", documentName: "Item", name: "Pending", testUserPermission: () => true });
    await pending;
    assert.equal(HotbarShortcutService.get(1), null);
    currentActor = first;
    assert.equal(HotbarShortcutService.get(1)?.uuid, "Item.pending");
  } finally { globalThis.fromUuid = resolve; }
});

test("concurrent drops retain both shortcuts", async () => {
  currentActor = actor("concurrent");
  for (const id of ["one", "two"]) documents.set(`Item.${id}`, { uuid: `Item.${id}`, documentName: "Item", name: id, testUserPermission: () => true });
  await Promise.all([
    HotbarShortcutService.assignDocumentDrop({ type: "Item", uuid: "Item.one" }, 1),
    HotbarShortcutService.assignDocumentDrop({ type: "Item", uuid: "Item.two" }, 2)
  ]);
  assert.equal(HotbarShortcutService.get(1)?.uuid, "Item.one");
  assert.equal(HotbarShortcutService.get(2)?.uuid, "Item.two");
});

test("non-executable ritual shortcuts open the Item sheet", async () => {
  currentActor = actor("ritual-reader");
  let opens = 0;
  documents.set("Item.ritual", {
    uuid: "Item.ritual", documentName: "Item", name: "Ritual", actor: currentActor,
    system: { isPower: true, hasScript: false }, testUserPermission: () => true,
    sheet: { render: async () => { opens++; } }
  });
  await HotbarShortcutService.assignDocumentDrop({ type: "Item", uuid: "Item.ritual" }, 1);
  await HotbarShortcutService.activate(1);
  assert.equal(opens, 1);
});

test("disabling the HUD disables document shortcut interception", () => {
  game.settings = { get: () => false };
  try { assert.equal(HotbarShortcutService.isEnabled(), false); }
  finally { delete game.settings; }
});
