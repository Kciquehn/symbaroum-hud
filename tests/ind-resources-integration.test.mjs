import assert from "node:assert/strict";
import test from "node:test";

const storedItems = [];
const withdrawnItems = [];
const droppedItems = new Map();
const reloadedQuivers = [];
const deletedItems = [];
const moneyDialogs = [];
const maneuverRolls = [];
const warnings = [];
const recoveredAmmo = [];
let confirmations = 0;

globalThis.game = {
  user: { id: "user" },
  i18n: {
    localize: (key) => ({
      "SYMBAROUMHUD.Storage.Inventory": "Inventário",
      "SYMBAROUMHUD.Storage.Pockets": "Bolsos"
    })[key] ?? key
  },
  settings: {
    settings: new Map([
      ["symbaroum-ind-resources.quiverCapacity", {}]
    ]),
    get: (_scope, key) => key === "quiverCapacity" ? 15 : null
  },
  modules: new Map([
    ["symbaroum-ind-resources", { active: true }]
  ]),
  tenebreResources: {
    rations: {
      getState: () => ({ quantity: 3, usesRemaining: 2, usesPerUnit: 4 }),
      consumeDay: async () => "rations"
    },
    encumbrance: {
      calculateLoad: () => ({
        currentLoad: 11,
        capacity: 10,
        defensePenalty: 1,
        isOverloaded: true,
        isImmobilized: false
      })
    },
    ammo: {
      getTrackedHits: () => ({ ammoHit: 4, ammoHits: {} }),
      recover: async (actor) => {
        recoveredAmmo.push(actor.id);
        return "recover-ammo";
      },
      reloadQuiverPrompt: async (actor, quiver) => {
        reloadedQuivers.push([actor.id, quiver.id]);
        return "reload-quiver";
      }
    },
    hunger: {
      hasHunger: () => true
    },
    weaponReadiness: {
      isEnabled: () => true,
      getEligibleWeapons: () => [
        { id: "sword", name: "Espada" },
        { id: "shield", name: "Escudo" }
      ],
      getDrawnWeapons: () => [{ name: "Espada" }],
      open: async () => "readiness"
    },
    maneuvers: {
      getActiveEffects: () => [{ name: "Guarda" }],
      isEnabled: () => true,
      list: () => [
        {
          id: "grapple",
          icon: "fa-fist-raised",
          labelKey: "TENEBRE.Maneuvers.Grapple",
          noteKeys: ["TENEBRE.Maneuvers.GrappleNote"]
        }
      ],
      execute: async (actor, maneuverId) => {
        maneuverRolls.push([actor.id, maneuverId]);
        return "maneuver";
      }
    },
    ritualBrowser: {
      isRitualistAbility: (item) => item?.id === "ritualist",
      isEnabled: () => true,
      open: async () => "rituals"
    },
    rest: {
      openRestDialog: async () => "rest"
    },
    statusEffects: {
      open: async () => "effects"
    },
    money: {
      open: async (actor) => {
        moneyDialogs.push(actor.id);
        return "money";
      }
    },
    containers: {
      getContainers: (actor) => Array.from(actor.items.values())
        .filter((item) => item.isContainer),
      getStoredItems: (actor, container) => Array.from(actor.items.values())
        .filter((item) => item.storedIn === container.id),
      getContainerCapacityLabel: (actor, container) => {
        const used = Array.from(actor.items.values())
          .filter((item) => item.storedIn === container.id).length;
        return `${used}/10`;
      },
      isContainer: (item) => Boolean(item.isContainer),
      isStored: (item) => Boolean(item.storedIn),
      canAttemptStoreItem: (item) => {
        return ["equipment", "weapon", "armor", "artifact"].includes(item.type)
          && !item.isContainer
          && !item.storedIn;
      },
      storeItemInContainerPrompt: async (actor, item, container) => {
        storedItems.push([actor.id, item.id, container.id]);
        return "stored";
      },
      withdrawItemPrompt: async (actor, item) => {
        withdrawnItems.push([actor.id, item.id]);
        return "withdrawn";
      }
    }
  }
};
globalThis.ui = {
  notifications: {
    warn: (message) => warnings.push(message)
  }
};
globalThis.Item = {
  implementation: {
    fromDropData: async (data) => droppedItems.get(data.uuid) ?? null
  }
};
globalThis.confirm = () => {
  confirmations += 1;
  return true;
};
globalThis.canvas = {
  tokens: {
    controlled: [{ actor: { uuid: "Actor.actor" } }]
  }
};

const { IndResourcesIntegration } = await import("../scripts/integrations/ind-resources.mjs");

test("normalizes the public Ind Resources API into HUD context", () => {
  const backpack = {
    id: "backpack",
    name: "Mochila",
    img: "backpack.webp",
    type: "equipment",
    system: { number: 1, state: "equipped" },
    isContainer: true
  };
  const torch = {
    id: "torch",
    uuid: "Actor.actor.Item.torch",
    name: "Tocha",
    img: "torch.webp",
    type: "equipment",
    system: { number: 2, state: "other" },
    storedIn: backpack.id,
    testUserPermission: () => true,
    sheet: { render: async () => "torch-sheet" }
  };
  const quiver = {
    id: "quiver",
    uuid: "Actor.actor.Item.quiver",
    name: "Aljava de Caçador",
    img: "quiver.webp",
    type: "equipment",
    system: { number: 1, state: "equipped" },
    getFlag: (_scope, key) => key === "loadedAmmo"
      ? [{ name: "Flechas", quantity: 7 }]
      : undefined
  };
  const arrows = {
    id: "arrows",
    uuid: "Actor.actor.Item.arrows",
    name: "Flechas Regulares",
    img: "arrows.webp",
    type: "equipment",
    system: { number: 12, state: "other" },
    getFlag: (_scope, key) => key === "isAmmo"
      ? true
      : undefined
  };
  const sword = {
    id: "sword",
    uuid: "Actor.actor.Item.sword",
    name: "Espada",
    img: "sword.webp",
    type: "weapon",
    system: { number: 1, isWeapon: true }
  };
  const dagger = {
    id: "dagger",
    uuid: "Actor.actor.Item.dagger",
    name: "Adaga",
    img: "dagger.webp",
    type: "equipment",
    system: { number: 1, isWeapon: true },
    storedIn: backpack.id
  };
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    items: new Map([
      [quiver.id, quiver],
      [arrows.id, arrows],
      [backpack.id, backpack],
      [torch.id, torch],
      [sword.id, sword],
      [dagger.id, dagger]
    ])
  };
  const context = IndResourcesIntegration.context(actor);

  assert.equal(context.active, true);
  assert.equal(context.hungry, true);
  assert.deepEqual(context.rations, {
    quantity: 3,
    usesRemaining: 2,
    usesPerUnit: 4
  });
  assert.deepEqual(context.load, {
    current: 11,
    capacity: 10,
    penalty: 1,
    overloaded: true,
    immobilized: false
  });
  assert.equal(context.ammoHits, 4);
  assert.deepEqual(context.ammoRecovery, { count: 4 });
  assert.deepEqual(context.readiness, {
    drawn: 1,
    total: 2,
    icon: "/systems/symbaroum/asset/image/weapon.png"
  });
  assert.deepEqual(context.quiver, {
    id: "quiver",
    storageId: "__quiver:quiver",
    uuid: "Actor.actor.Item.quiver",
    name: "Aljava de Caçador",
    img: "quiver.webp",
    quantity: 1,
    loaded: 7,
    capacity: 15,
    remaining: 8,
    loadedItems: [{
      id: "loaded-0",
      uuid: null,
      containerId: "__quiver:quiver",
      draggable: false,
      virtual: true,
      name: "Flechas",
      img: "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
      quantity: 7
    }],
    availableAmmo: [{
      id: "arrows",
      uuid: "Actor.actor.Item.arrows",
      containerId: null,
      draggable: true,
      name: "Flechas Regulares",
      img: "arrows.webp",
      quantity: 12
    }]
  });
  assert.deepEqual(context.storage, {
    mode: "inventory",
    containerSelected: false,
    quiverSelected: false,
    inventoryActive: true,
    hasContainers: true,
    hasQuiver: true,
    pockets: false,
    id: null,
    name: "Inventário",
    img: null,
    capacity: null,
    quiver: context.quiver,
    quivers: [{
      id: "quiver",
      storageId: "__quiver:quiver",
      name: context.quiver.name,
      img: "quiver.webp",
      loaded: 7,
      capacity: 15,
      active: false
    }],
    items: [{
      id: "arrows",
      uuid: "Actor.actor.Item.arrows",
      containerId: null,
      draggable: true,
      name: "Flechas Regulares",
      img: "arrows.webp",
      quantity: 12
    }],
    containers: [{
      id: "backpack",
      name: "Mochila",
      img: "backpack.webp",
      capacity: "2/10",
      active: false
    }]
  });

  const backpackContext = IndResourcesIntegration.context(actor, {
    containerId: backpack.id
  });
  assert.equal(backpackContext.storage.mode, "container");
  assert.equal(backpackContext.storage.containerSelected, true);
  assert.equal(backpackContext.storage.quiverSelected, false);
  assert.equal(backpackContext.storage.name, "Mochila");
  assert.deepEqual(backpackContext.storage.items, [{
    id: "torch",
    uuid: "Actor.actor.Item.torch",
    containerId: "backpack",
    draggable: true,
    name: "Tocha",
    img: "torch.webp",
    quantity: 2
  }]);

  const quiverStorageContext = IndResourcesIntegration.context(actor, {
    containerId: "__quiver"
  });
  assert.equal(quiverStorageContext.storage.mode, "quiver");
  assert.equal(quiverStorageContext.storage.containerSelected, false);
  assert.equal(quiverStorageContext.storage.quiverSelected, true);
  assert.equal(quiverStorageContext.storage.name, "Aljava de Caçador");
  assert.deepEqual(quiverStorageContext.storage.items, context.quiver.availableAmmo);
  assert.deepEqual(context.drawnWeapons, ["Espada"]);
  assert.deepEqual(context.maneuvers, ["Guarda"]);
  assert.equal(context.actions.rest, true);
  assert.equal(context.actions.ammoRecovery, true);
  assert.equal(context.actions.quiverReload, true);
  assert.equal(context.actions.readiness, true);
  assert.equal(context.actions.maneuvers, true);
});

test("lists and executes maneuvers through the public Ind Resources API", async () => {
  assert.deepEqual(IndResourcesIntegration.maneuvers(), [{
    id: "grapple",
    icon: "fa-fist-raised",
    label: "TENEBRE.Maneuvers.Grapple",
    notes: ["TENEBRE.Maneuvers.GrappleNote"]
  }]);

  assert.equal(
    await IndResourcesIntegration.executeManeuver({ id: "actor", type: "player" }, "grapple"),
    "maneuver"
  );
  assert.deepEqual(maneuverRolls.at(-1), ["actor", "grapple"]);
});

test("delegates ammunition recovery to Ind Resources", async () => {
  assert.equal(
    await IndResourcesIntegration.recoverAmmo({ id: "actor", type: "player" }),
    "recover-ammo"
  );
  assert.equal(recoveredAmmo.at(-1), "actor");
});

test("omits quiver information when the actor does not possess one", () => {
  const context = IndResourcesIntegration.context({
    id: "actor",
    uuid: "Actor.actor",
    items: new Map()
  });

  assert.equal(context.quiver, null);
  assert.deepEqual(context.storage, {
    mode: "inventory",
    containerSelected: false,
    quiverSelected: false,
    inventoryActive: true,
    hasContainers: false,
    hasQuiver: false,
    pockets: true,
    id: null,
    name: "Inventário",
    img: null,
    capacity: null,
    quiver: null,
    quivers: [],
    containers: [],
    items: []
  });
});

test("opens only an item exposed by the selected Ind Resources storage", async () => {
  const backpack = {
    id: "backpack",
    name: "Mochila",
    isContainer: true
  };
  const item = {
    id: "torch",
    uuid: "Actor.actor.Item.torch",
    name: "Tocha",
    type: "equipment",
    storedIn: backpack.id,
    testUserPermission: () => true,
    sheet: { render: async (force) => force ? "torch-sheet" : null }
  };
  const looseItem = {
    id: "rope",
    uuid: "Actor.actor.Item.rope",
    name: "Corda",
    type: "equipment",
    system: { number: 1 },
    testUserPermission: () => true,
    sheet: { render: async (force) => force ? "rope-sheet" : null }
  };
  const actor = {
    id: "actor",
    items: new Map([
      [backpack.id, backpack],
      [item.id, item],
      [looseItem.id, looseItem]
    ])
  };

  assert.equal(
    await IndResourcesIntegration.openStorageItem(actor, backpack.id, item.id),
    "torch-sheet"
  );
  assert.equal(
    await IndResourcesIntegration.openStorageItem(actor, null, looseItem.id),
    "rope-sheet"
  );
  assert.equal(
    await IndResourcesIntegration.storeInContainer(
      actor,
      looseItem.id,
      backpack.id
    ),
    "stored"
  );
  assert.deepEqual(storedItems.at(-1), ["actor", "rope", "backpack"]);
  assert.equal(
    await IndResourcesIntegration.withdrawFromContainer(
      actor,
      item.id,
      backpack.id
    ),
    "withdrawn"
  );
  assert.deepEqual(withdrawnItems.at(-1), ["actor", "torch"]);
});

test("deletes an item exposed by the selected inventory view after confirmation", async () => {
  const item = {
    id: "water",
    uuid: "Actor.actor.Item.water",
    name: "Ãgua do CrepÃºsculo",
    type: "equipment",
    system: { number: 1 },
    delete: async () => {
      deletedItems.push("water");
      return "deleted";
    }
  };
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    items: new Map([[item.id, item]])
  };

  const result = await IndResourcesIntegration.deleteStorageItem(actor, null, item.id);

  assert.equal(result, "deleted");
  assert.equal(confirmations > 0, true);
  assert.deepEqual(deletedItems.at(-1), "water");
});

test("does not delete items outside the selected storage view", async () => {
  const backpack = {
    id: "backpack",
    name: "Mochila",
    isContainer: true
  };
  const stored = {
    id: "stored-water",
    uuid: "Actor.actor.Item.stored-water",
    name: "Ãgua guardada",
    type: "equipment",
    storedIn: backpack.id,
    delete: async () => deletedItems.push("stored-water")
  };
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    items: new Map([
      [backpack.id, backpack],
      [stored.id, stored]
    ])
  };
  const deletedBefore = deletedItems.length;

  await IndResourcesIntegration.deleteStorageItem(actor, null, stored.id);

  assert.equal(deletedItems.length, deletedBefore);
});

test("deletes sidebar containers and quivers after confirmation", async () => {
  const backpack = {
    id: "backpack-delete",
    name: "Mochila",
    type: "equipment",
    system: { number: 1 },
    isContainer: true,
    delete: async () => {
      deletedItems.push("backpack-delete");
      return "deleted-backpack";
    }
  };
  const quiver = {
    id: "quiver-delete",
    name: "Aljava",
    type: "equipment",
    system: { number: 1 },
    delete: async () => {
      deletedItems.push("quiver-delete");
      return "deleted-quiver";
    }
  };
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    items: new Map([
      [backpack.id, backpack],
      [quiver.id, quiver]
    ])
  };

  assert.equal(
    await IndResourcesIntegration.deleteStorageContainer(actor, backpack.id),
    "deleted-backpack"
  );
  assert.equal(
    await IndResourcesIntegration.deleteStorageContainer(actor, quiver.id),
    "deleted-quiver"
  );
  assert.deepEqual(deletedItems.slice(-2), ["backpack-delete", "quiver-delete"]);
});

test("does not delete regular items through the sidebar container action", async () => {
  const item = {
    id: "regular-item",
    name: "Corda",
    type: "equipment",
    system: { number: 1 },
    delete: async () => deletedItems.push("regular-item")
  };
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    items: new Map([[item.id, item]])
  };
  const deletedBefore = deletedItems.length;

  await IndResourcesIntegration.deleteStorageContainer(actor, item.id);

  assert.equal(deletedItems.length, deletedBefore);
});

test("lists every quiver and every Ind Resources container in the storage sidebar", () => {
  const backpack = {
    id: "backpack",
    name: "Mochila",
    img: "backpack.webp",
    type: "equipment",
    system: { number: 1 },
    isContainer: true
  };
  const coinPurse = {
    id: "coin-purse",
    name: "Bolsa de Moedas",
    img: "coin-purse.webp",
    type: "equipment",
    system: { number: 1 },
    isContainer: true
  };
  const activeQuiver = {
    id: "active-quiver",
    uuid: "Actor.actor.Item.active-quiver",
    name: "Aljava Principal",
    img: "active-quiver.webp",
    type: "equipment",
    system: { number: 1, state: "equipped" },
    getFlag: () => []
  };
  const spareQuiver = {
    id: "spare-quiver",
    uuid: "Actor.actor.Item.spare-quiver",
    name: "Aljava Reserva",
    img: "spare-quiver.webp",
    type: "equipment",
    system: { number: 1, state: "other" },
    getFlag: () => []
  };
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    items: new Map([
      [backpack.id, backpack],
      [coinPurse.id, coinPurse],
      [activeQuiver.id, activeQuiver],
      [spareQuiver.id, spareQuiver]
    ])
  };

  const context = IndResourcesIntegration.context(actor, {
    containerId: "__quiver:spare-quiver"
  });

  assert.deepEqual(
    context.storage.containers.map((container) => container.name),
    ["Mochila", "Bolsa de Moedas"]
  );
  assert.deepEqual(
    context.storage.quivers.map((quiver) => [quiver.storageId, quiver.name, quiver.active]),
    [
      ["__quiver:active-quiver", "Aljava Principal", false],
      ["__quiver:spare-quiver", "Aljava Reserva", true]
    ]
  );
  assert.equal(context.storage.quiverSelected, true);
  assert.equal(context.storage.name, "Aljava Reserva");
});

test("copies a dropped world Item into the actor inventory without changing its source", async () => {
  const sourceData = {
    _id: "world-item",
    name: "Corda",
    type: "equipment",
    system: { number: 1 }
  };
  const worldItem = {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(sourceData)
  };
  droppedItems.set("Item.world-item", worldItem);

  const creations = [];
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    createEmbeddedDocuments: async (type, data) => {
      creations.push({ type, data });
      return data;
    }
  };

  await IndResourcesIntegration.importInventoryItem(actor, {
    type: "Item",
    uuid: "Item.world-item"
  });

  assert.deepEqual(creations, [{
    type: "Item",
    data: [sourceData]
  }]);
  assert.deepEqual(sourceData, {
    _id: "world-item",
    name: "Corda",
    type: "equipment",
    system: { number: 1 }
  });
});

test("imports only dropped weapon Items through the HUD attacks drop target", async () => {
  const weaponData = {
    _id: "world-sword",
    name: "Espada Longa",
    type: "weapon",
    system: { number: 1, isWeapon: true }
  };
  const ropeData = {
    _id: "rope-for-attacks",
    name: "Corda",
    type: "equipment",
    system: { number: 1 }
  };
  droppedItems.set("Item.world-sword", {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(weaponData),
    ...weaponData
  });
  droppedItems.set("Item.rope-for-attacks", {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(ropeData),
    ...ropeData
  });

  const creations = [];
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    createEmbeddedDocuments: async (type, data) => {
      creations.push({ type, data });
      return data;
    }
  };

  assert.equal(IndResourcesIntegration.isWeaponItem(droppedItems.get("Item.world-sword")), true);
  assert.equal(IndResourcesIntegration.isWeaponItem(droppedItems.get("Item.rope-for-attacks")), false);

  await IndResourcesIntegration.importWeaponItem(actor, {
    type: "Item",
    uuid: "Item.world-sword"
  });
  await IndResourcesIntegration.importWeaponItem(actor, {
    type: "Item",
    uuid: "Item.rope-for-attacks"
  });

  assert.deepEqual(creations, [{
    type: "Item",
    data: [weaponData]
  }]);
  assert.equal(warnings.at(-1), "SYMBAROUMHUD.Notifications.OnlyWeapons");
});

test("imports only dropped ritual Items through the HUD rituals drop target", async () => {
  const ritualData = {
    _id: "world-ritual",
    name: "Círculo de Proteção",
    type: "ritual",
    system: { isRitual: true }
  };
  const abilityData = {
    _id: "not-a-ritual",
    name: "Alquimia",
    type: "ability",
    system: { isPower: true }
  };
  droppedItems.set("Item.world-ritual", {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(ritualData),
    ...ritualData
  });
  droppedItems.set("Item.not-a-ritual", {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(abilityData),
    ...abilityData
  });

  const creations = [];
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    createEmbeddedDocuments: async (type, data) => {
      creations.push({ type, data });
      return data;
    }
  };

  assert.equal(IndResourcesIntegration.isRitualItem(droppedItems.get("Item.world-ritual")), true);
  assert.equal(IndResourcesIntegration.isRitualItem(droppedItems.get("Item.not-a-ritual")), false);

  await IndResourcesIntegration.importRitualItem(actor, {
    type: "Item",
    uuid: "Item.world-ritual"
  });
  await IndResourcesIntegration.importRitualItem(actor, {
    type: "Item",
    uuid: "Item.not-a-ritual"
  });

  assert.deepEqual(creations, [{
    type: "Item",
    data: [ritualData]
  }]);
  assert.equal(warnings.at(-1), "SYMBAROUMHUD.Notifications.OnlyRituals");
});

test("imports only dropped mystical power Items through the HUD mystical powers drop target", async () => {
  const mysticalPowerData = {
    _id: "world-mystical-power",
    name: "Brimstone Cascade",
    type: "mysticalPower",
    system: { isPower: true, isMysticalPower: true }
  };
  const abilityData = {
    _id: "not-a-mystical-power",
    name: "Alquimia",
    type: "ability",
    system: { isPower: true }
  };
  droppedItems.set("Item.world-mystical-power", {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(mysticalPowerData),
    ...mysticalPowerData
  });
  droppedItems.set("Item.not-a-mystical-power", {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(abilityData),
    ...abilityData
  });

  const creations = [];
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    createEmbeddedDocuments: async (type, data) => {
      creations.push({ type, data });
      return data;
    }
  };

  assert.equal(
    IndResourcesIntegration.isMysticalPowerItem(droppedItems.get("Item.world-mystical-power")),
    true
  );
  assert.equal(
    IndResourcesIntegration.isMysticalPowerItem(droppedItems.get("Item.not-a-mystical-power")),
    false
  );

  await IndResourcesIntegration.importMysticalPowerItem(actor, {
    type: "Item",
    uuid: "Item.world-mystical-power"
  });
  await IndResourcesIntegration.importMysticalPowerItem(actor, {
    type: "Item",
    uuid: "Item.not-a-mystical-power"
  });

  assert.deepEqual(creations, [{
    type: "Item",
    data: [mysticalPowerData]
  }]);
  assert.equal(warnings.at(-1), "SYMBAROUMHUD.Notifications.OnlyMysticalPowers");
});

test("imports dropped world Items directly into a selected backpack", async () => {
  const backpack = {
    id: "backpack",
    name: "Mochila",
    isContainer: true
  };
  const sourceData = {
    _id: "rope",
    name: "Corda",
    type: "equipment",
    system: { number: 1 }
  };
  const worldItem = {
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(sourceData)
  };
  droppedItems.set("Item.rope", worldItem);

  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    items: new Map([[backpack.id, backpack]]),
    createEmbeddedDocuments: async (_type, data) => {
      const created = data.map((source) => ({
        id: source._id,
        uuid: `Actor.actor.Item.${source._id}`,
        documentName: "Item",
        parent: { uuid: "Actor.actor" },
        ...source
      }));
      for (const item of created) actor.items.set(item.id, item);
      return created;
    }
  };

  assert.equal(
    await IndResourcesIntegration.importItemInContainer(
      actor,
      { type: "Item", uuid: "Item.rope" },
      backpack.id
    ),
    "stored"
  );
  assert.deepEqual(storedItems.at(-1), ["actor", "rope", "backpack"]);
});

test("imports only arrows or bolts when dropped on the quiver", async () => {
  const quiver = {
    id: "quiver",
    name: "Aljava",
    type: "equipment",
    system: { number: 1, state: "equipped" }
  };
  const sourceData = {
    _id: "arrows",
    name: "Flechas Regulares",
    type: "equipment",
    system: { number: 12 }
  };
  const arrowItem = {
    ...sourceData,
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => structuredClone(sourceData)
  };
  droppedItems.set("Item.arrows", arrowItem);

  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    items: new Map([[quiver.id, quiver]]),
    createEmbeddedDocuments: async (_type, data) => {
      const created = data.map((source) => ({
        id: source._id,
        uuid: `Actor.actor.Item.${source._id}`,
        documentName: "Item",
        parent: { uuid: "Actor.actor" },
        ...source
      }));
      for (const item of created) actor.items.set(item.id, item);
      return created;
    }
  };

  assert.equal(
    await IndResourcesIntegration.importQuiverAmmo(
      actor,
      { type: "Item", uuid: "Item.arrows" },
      quiver.id
    ),
    "reload-quiver"
  );
  assert.deepEqual(reloadedQuivers.at(-1), ["actor", "quiver"]);
  assert.equal(actor.items.has("arrows"), true);

  const reloadsBeforeInvalidDrop = reloadedQuivers.length;
  droppedItems.set("Item.rope-not-ammo", {
    _id: "rope-not-ammo",
    name: "Corda",
    type: "equipment",
    system: { number: 1 },
    documentName: "Item",
    parent: null,
    testUserPermission: () => true,
    toObject: () => ({
      _id: "rope-not-ammo",
      name: "Corda",
      type: "equipment",
      system: { number: 1 }
    })
  });

  await IndResourcesIntegration.importQuiverAmmo(
    actor,
    { type: "Item", uuid: "Item.rope-not-ammo" },
    quiver.id
  );

  assert.equal(reloadedQuivers.length, reloadsBeforeInvalidDrop);
  assert.equal(actor.items.has("rope-not-ammo"), false);
});

test("does not duplicate an Item already embedded in the selected actor", async () => {
  const ownedItem = {
    documentName: "Item",
    parent: { uuid: "Actor.actor" },
    testUserPermission: () => true,
    toObject: () => ({ name: "Corda", type: "equipment" })
  };
  droppedItems.set("Actor.actor.Item.rope", ownedItem);

  let creations = 0;
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    isOwner: true,
    createEmbeddedDocuments: async () => {
      creations += 1;
    }
  };

  await IndResourcesIntegration.importInventoryItem(actor, {
    type: "Item",
    uuid: "Actor.actor.Item.rope"
  });

  assert.equal(creations, 0);
});

test("delegates actions to Ind Resources instead of duplicating rules", async () => {
  const quiver = {
    id: "quiver",
    name: "Aljava",
    type: "equipment",
    system: { number: 1, state: "equipped" }
  };
  const actor = {
    id: "actor",
    uuid: "Actor.actor",
    items: new Map([[quiver.id, quiver]])
  };
  assert.equal(await IndResourcesIntegration.execute("rations", actor), "rations");
  assert.equal(await IndResourcesIntegration.execute("rest", actor), "rest");
  assert.equal(await IndResourcesIntegration.reloadQuiver(actor, quiver.id), "reload-quiver");
  assert.equal(await IndResourcesIntegration.execute("readiness", actor), "readiness");
  assert.equal(await IndResourcesIntegration.execute("rituals", actor), "rituals");
  assert.equal(await IndResourcesIntegration.execute("effects", actor), "effects");
  assert.equal(await IndResourcesIntegration.openMoney(actor), "money");
  assert.deepEqual(reloadedQuivers.at(-1), ["actor", "quiver"]);
  assert.deepEqual(moneyDialogs.at(-1), "actor");
});

test("detects the Ritualist ability through the public Ind Resources API", () => {
  assert.equal(
    IndResourcesIntegration.isRitualistAbility({ id: "ritualist", name: "Outra coisa", type: "ability" }),
    true
  );
  assert.equal(
    IndResourcesIntegration.isRitualistAbility({
      id: "other",
      name: "Nome personalizado",
      type: "ability",
      system: { reference: "ritualist" }
    }),
    false,
    "the active public integration remains authoritative"
  );
  assert.equal(
    IndResourcesIntegration.isRitualistAbility({ id: "other", name: "Ritualista", type: "ability" }),
    false
  );

  const indResourcesModule = game.modules.get("symbaroum-ind-resources");
  indResourcesModule.active = false;
  try {
    assert.equal(
      IndResourcesIntegration.isRitualistAbility({
        id: "other",
        name: "Nome personalizado",
        type: "ability",
        system: { reference: "ritualist" }
      }),
      true,
      "the canonical system reference is the standalone fallback"
    );
  } finally {
    indResourcesModule.active = true;
  }
});
