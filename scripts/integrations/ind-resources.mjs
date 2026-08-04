import { IND_RESOURCES_ID } from "../constants.mjs";

const QUIVER_STORAGE_ID = "__quiver";
const QUIVER_STORAGE_PREFIX = `${QUIVER_STORAGE_ID}:`;

export class IndResourcesIntegration {
  static get active() {
    return Boolean(game.modules.get(IND_RESOURCES_ID)?.active && game.tenebreResources);
  }

  static get api() {
    return this.active ? game.tenebreResources : null;
  }

  static context(actor, { containerId = null } = {}) {
    const api = this.api;
    if (!api || !actor) return { active: false };

    const rations = safeCall(() => api.rations?.getState?.(actor));
    const load = safeCall(() => api.encumbrance?.calculateLoad?.(actor));
    const readinessEnabled = Boolean(
      safeCall(() => api.weaponReadiness?.isEnabled?.())
      && typeof api.weaponReadiness?.open === "function"
    );
    const readinessWeapons = readinessEnabled
      ? safeCall(() => api.weaponReadiness?.getEligibleWeapons?.(actor)) ?? []
      : [];
    const drawn = readinessEnabled
      ? safeCall(() => api.weaponReadiness?.getDrawnWeapons?.(actor)) ?? []
      : [];
    const maneuvers = safeCall(() => api.maneuvers?.getActiveEffects?.(actor)) ?? [];
    const trackedHits = safeCall(() => api.ammo?.getTrackedHits?.(actor));
    const recoverableAmmo = number(trackedHits?.ammoHit ?? trackedHits);
    const quivers = quiverContexts(actor);
    const quiver = quivers[0] ?? null;
    const storage = storageContext(api.containers, actor, containerId, quivers);

    return {
      active: true,
      hungry: Boolean(safeCall(() => api.hunger?.hasHunger?.(actor))),
      rations: rations
        ? {
            quantity: number(rations.quantity),
            usesRemaining: number(rations.usesRemaining),
            usesPerUnit: number(rations.usesPerUnit)
          }
        : null,
      load: normalizeLoad(load),
      ammoHits: recoverableAmmo,
      ammoRecovery: recoverableAmmo > 0
        && typeof api.ammo?.recover === "function"
        && settingEnabled("enableAmmoRecovery", true)
        && settingEnabled("enableHitTracking", true)
        && settingEnabled("showAmmoRecoveryHud", true)
        ? {
            count: recoverableAmmo
          }
        : null,
      quiver,
      storage,
      readiness: readinessEnabled
        && settingEnabled("showWeaponReadinessButton", true)
        && readinessWeapons.length > 0
        ? {
            drawn: drawn.length,
            total: readinessWeapons.length,
            icon: "/systems/symbaroum/asset/image/weapon.png"
          }
        : null,
      drawnWeapons: Array.from(drawn, normalizeReadinessWeapon).filter((weapon) => weapon.name),
      maneuvers: Array.from(maneuvers, (effect) => effect?.name ?? effect?.label).filter(Boolean),
      actions: {
        rest: typeof api.rest?.openRestDialog === "function",
        ammoRecovery: recoverableAmmo > 0 && typeof api.ammo?.recover === "function",
        quiverReload: Boolean(quivers.length && typeof api.ammo?.reloadQuiverPrompt === "function"),
        readiness: readinessEnabled,
        maneuvers: Boolean(
          safeCall(() => api.maneuvers?.isEnabled?.()) !== false
          && typeof api.maneuvers?.execute === "function"
          && this.maneuvers().length > 0
        ),
        rituals: Boolean(api.ritualBrowser?.isEnabled?.() && typeof api.ritualBrowser?.open === "function"),
        effects: typeof api.statusEffects?.open === "function" && hasControlledActor(actor)
      }
    };
  }

  static async openStorageItem(actor, containerId, itemId) {
    const containers = this.api?.containers;
    if (!containers || !actor || !itemId) return;

    const storage = storageContext(
      containers,
      actor,
      containerId || null,
      quiverContexts(actor)
    );
    const selectedId = storage?.id ?? null;
    if (!storage?.quiverSelected && selectedId !== (containerId || null)) {
      return notifyUnavailable();
    }
    if (!storage.items.some((item) => item.id === itemId)) return notifyUnavailable();

    const item = actorItems(actor).find((candidate) => candidate?.id === itemId);
    if (!item || !canObserve(item) || !item.sheet) return notifyUnavailable();

    return item.sheet.render(true);
  }

  static async deleteStorageItem(actor, containerId, itemId) {
    const containers = this.api?.containers;
    if (!containers || !actor?.isOwner || !itemId) return notifyUnavailable();

    const storage = storageContext(containers, actor, containerId || null, quiverContexts(actor));
    const selectedId = storage?.id ?? null;
    if (!storage?.quiverSelected && selectedId !== (containerId || null)) {
      return notifyUnavailable();
    }
    if (!storage.items.some((item) => item.id === itemId && !item.virtual)) {
      return notifyUnavailable();
    }

    const item = actorItems(actor).find((candidate) => candidate?.id === itemId);
    if (!item || !canObserve(item)) return notifyUnavailable();

    const confirmed = await confirmItemDeletion(item);
    if (!confirmed) return;

    return deleteItemDocument(actor, item);
  }

  static async deleteStorageContainer(actor, itemId) {
    const containers = this.api?.containers;
    if (!containers || !actor?.isOwner || !itemId) return notifyUnavailable();

    const item = actorItems(actor).find((candidate) => candidate?.id === itemId);
    if (!item || !canObserve(item)) return notifyUnavailable();

    const isContainer = Boolean(safeCall(() => containers.isContainer?.(item)));
    if (!isContainer && !isQuiver(item)) return notifyUnavailable();

    const confirmed = await confirmItemDeletion(item);
    if (!confirmed) return;

    const result = await deleteItemDocument(actor, item);
    await containers.recoverOrphanedStoredItems?.(actor);
    return result;
  }

  static async reloadQuiver(actor, quiverId = null) {
    const api = this.api;
    if (!api || !actor || typeof api.ammo?.reloadQuiverPrompt !== "function") return;

    const quiver = findQuiverItem(actor, quiverId);
    if (!quiver) return notifyUnavailable();

    return api.ammo.reloadQuiverPrompt(actor, quiver);
  }

  static async openMoney(actor) {
    const money = this.api?.money;
    if (!actor || typeof money?.open !== "function") return notifyMoneyUnavailable();
    return money.open(actor);
  }

  static async recoverAmmo(actor) {
    const ammo = this.api?.ammo;
    if (!actor || typeof ammo?.recover !== "function") return notifyUnavailable();
    return ammo.recover(actor);
  }

  static maneuvers() {
    const maneuvers = safeCall(() => this.api?.maneuvers?.list?.()) ?? [];
    return Array.from(maneuvers)
      .filter((maneuver) => maneuver?.id)
      .map((maneuver) => ({
        id: String(maneuver.id),
        icon: String(maneuver.icon ?? "fa-dice-d20"),
        label: game.i18n.localize(maneuver.labelKey ?? maneuver.nameKey ?? maneuver.id),
        notes: Array.from(maneuver.noteKeys ?? [])
          .map((key) => game.i18n.localize(key))
          .filter(Boolean)
      }));
  }

  static async executeManeuver(actor, maneuverId) {
    const maneuvers = this.api?.maneuvers;
    if (!actor || !maneuverId || typeof maneuvers?.execute !== "function") return notifyUnavailable();
    return maneuvers.execute(actor, maneuverId);
  }

  static isRitualistAbility(item) {
    const checker = this.api?.ritualBrowser?.isRitualistAbility;
    if (typeof checker === "function") {
      return Boolean(safeCall(() => checker(item)));
    }

    if (item?.type !== "ability") return false;
    if (normalizeText(item.system?.reference) === "ritualist") return true;
    return ["ritualista", "ritualist"].includes(normalizeText(item.name));
  }

  static async storeInContainer(actor, itemId, containerId) {
    const containers = this.api?.containers;
    if (
      !containers
      || !actor
      || !itemId
      || !containerId
      || typeof containers.storeItemInContainerPrompt !== "function"
    ) {
      return;
    }

    const inventory = storageContext(containers, actor, null);
    if (!inventory?.items.some((item) => item.id === itemId)) {
      return notifyUnavailable();
    }

    const item = actorItems(actor).find((candidate) => candidate?.id === itemId);
    const container = Array.from(
      safeCall(() => containers.getContainers(actor)) ?? []
    ).find((candidate) => candidate?.id === containerId);
    if (!item || !container) return notifyUnavailable();

    return containers.storeItemInContainerPrompt(actor, item, container);
  }

  static async importItemInContainer(actor, dropData, containerId) {
    if (!this.api?.containers || !containerId) return;

    const item = await importItemForStorage(actor, dropData);
    if (!item?.id) return notifyUnavailable();

    return this.storeInContainer(actor, item.id, containerId);
  }

  static isQuiverCompatibleItem(item) {
    return isQuiverCompatibleAmmo(item);
  }

  static isWeaponItem(item) {
    return isWeapon(item);
  }

  static async importWeaponItem(actor, dropData) {
    const item = await itemFromDropData(dropData);
    if (!isWeapon(item)) return notifyOnlyWeapons();
    return importItemForStorage(actor, dropData, item);
  }

  static isRitualItem(item) {
    return isRitual(item);
  }

  static async importRitualItem(actor, dropData) {
    const item = await itemFromDropData(dropData);
    if (!isRitual(item)) return notifyOnlyRituals();
    return importItemForStorage(actor, dropData, item);
  }

  static isMysticalPowerItem(item) {
    return isMysticalPower(item);
  }

  static async importMysticalPowerItem(actor, dropData) {
    const item = await itemFromDropData(dropData);
    if (!isMysticalPower(item)) return notifyOnlyMysticalPowers();
    return importItemForStorage(actor, dropData, item);
  }

  static async dropInventoryItemOnQuiver(actor, itemId, quiverId = null) {
    const item = actorItems(actor).find((candidate) => candidate?.id === itemId);
    if (!isQuiverCompatibleAmmo(item)) return notifyUnavailable();

    return this.reloadQuiver(actor, quiverId);
  }

  static async importQuiverAmmo(actor, dropData, quiverId = null) {
    const item = await itemFromDropData(dropData);
    if (!isQuiverCompatibleAmmo(item)) return notifyUnavailable();

    const importedItem = await importItemForStorage(actor, dropData, item);
    if (!importedItem) return;

    return this.reloadQuiver(actor, quiverId);
  }

  static async withdrawFromContainer(actor, itemId, containerId) {
    const containers = this.api?.containers;
    if (
      !containers
      || !actor
      || !itemId
      || !containerId
      || typeof containers.withdrawItemPrompt !== "function"
    ) {
      return;
    }

    const container = Array.from(
      safeCall(() => containers.getContainers(actor)) ?? []
    ).find((candidate) => candidate?.id === containerId);
    const item = container
      ? Array.from(
          safeCall(() => containers.getStoredItems(actor, container)) ?? []
        ).find((candidate) => candidate?.id === itemId)
      : null;
    if (!item || !container) return notifyUnavailable();

    return containers.withdrawItemPrompt(actor, item);
  }

  static async importInventoryItem(actor, dropData) {
    return importItemForStorage(actor, dropData);
  }

  static async execute(action, actor) {
    const api = this.api;
    if (!api || !actor) return;

    switch (action) {
      case "rations":
        return api.rations?.consumeDay?.(actor);
      case "rest":
        return api.rest?.openRestDialog?.(actor);
      case "readiness":
        return api.weaponReadiness?.open?.(actor);
      case "rituals":
        return api.ritualBrowser?.open?.(actor);
      case "effects":
        if (!hasControlledActor(actor)) {
          ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.SelectActorToken"));
          return;
        }
        return api.statusEffects?.open?.();
    }
  }
}

function safeCall(callback) {
  try {
    return callback();
  } catch (error) {
    console.warn("symbaroum-hud | Symbaroum Ind Resources integration could not read a resource.", error);
    return null;
  }
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function normalizeLoad(load) {
  if (!load || typeof load !== "object") return null;
  return {
    current: number(load.currentLoad ?? load.current ?? load.total ?? load.load),
    capacity: number(load.capacity ?? load.max),
    penalty: number(load.defensePenalty ?? load.penalty),
    overloaded: Boolean(load.isOverloaded ?? load.overloaded),
    immobilized: Boolean(load.isImmobilized)
  };
}

function storageContext(containers, actor, selectedId, quivers = []) {
  if (
    !containers
    || typeof containers.getContainers !== "function"
    || typeof containers.getStoredItems !== "function"
  ) {
    return null;
  }

  const normalized = Array.from(
    safeCall(() => containers.getContainers(actor)) ?? []
  ).map((container) => normalizeContainer(containers, actor, container));
  const selectedQuiver = findSelectedQuiver(quivers, selectedId);
  const quiverSelected = Boolean(selectedQuiver);
  const selected = normalized.find((container) => container.id === selectedId) ?? null;
  const inventory = normalizeInventory(containers, actor);

  return {
    mode: quiverSelected ? "quiver" : selected ? "container" : "inventory",
    containerSelected: Boolean(selected),
    quiverSelected,
    inventoryActive: !selected && !quiverSelected,
    hasContainers: normalized.length > 0,
    hasQuiver: quivers.length > 0,
    pockets: normalized.length === 0,
    id: quiverSelected ? selectedQuiver.storageId : selected?.id ?? null,
    name: quiverSelected
      ? selectedQuiver.name
      : selected?.name ?? game.i18n.localize("SYMBAROUMHUD.Storage.Inventory"),
    img: quiverSelected ? selectedQuiver.img : selected?.img ?? null,
    capacity: selected?.capacity ?? null,
    quiver: selectedQuiver ?? quivers[0] ?? null,
    quivers: quivers.map((quiver) => ({
      id: quiver.id,
      storageId: quiver.storageId,
      name: quiver.name,
      img: quiver.img,
      loaded: quiver.loaded,
      capacity: quiver.capacity,
      active: quiver.storageId === selectedQuiver?.storageId
    })),
    items: quiverSelected ? selectedQuiver.availableAmmo : selected?.items ?? inventory,
    containers: normalized.map((container) => ({
      id: container.id,
      name: container.name,
      img: container.img,
      capacity: container.capacity,
      active: container.id === selected?.id
    }))
  };
}

function normalizeContainer(containers, actor, container) {
  const capacity = safeCall(
    () => containers.getContainerCapacityLabel?.(actor, container)
  );
  const items = Array.from(
    safeCall(() => containers.getStoredItems(actor, container)) ?? []
  )
    .filter((item) => !isWeapon(item))
    .map((item) => normalizeStorageItem(item, container.id, true));

  return {
    id: container.id,
    name: container.name,
    img: container.img ?? "icons/svg/item-bag.svg",
    capacity: capacity === null || capacity === undefined ? null : String(capacity),
    items
  };
}

function normalizeInventory(containers, actor) {
  if (
    typeof containers.isContainer !== "function"
    || typeof containers.isStored !== "function"
    || typeof containers.canAttemptStoreItem !== "function"
  ) {
    return [];
  }

  return actorItems(actor)
    .filter((item) => {
      return !safeCall(() => containers.isContainer(item))
        && !safeCall(() => containers.isStored(item))
        && !isQuiver(item)
        && !isWeapon(item)
        && Boolean(safeCall(() => containers.canAttemptStoreItem(item)));
    })
    .map((item) => normalizeStorageItem(item, null, true));
}

function normalizeStorageItem(item, containerId, draggable) {
  return {
    id: item.id,
    uuid: item.uuid,
    containerId,
    draggable,
    name: item.name,
    img: item.img
      ?? item.thumbnail
      ?? item.texture?.src
      ?? "icons/svg/item-bag.svg",
    quantity: Math.max(0, number(item?.system?.number ?? 1))
  };
}

function normalizeReadinessWeapon(weapon) {
  return {
    id: weapon?.id ?? null,
    uuid: weapon?.uuid ?? null,
    name: weapon?.name ?? null
  };
}

function hasControlledActor(actor) {
  return (globalThis.canvas?.tokens?.controlled ?? [])
    .some((token) => token.actor?.uuid === actor?.uuid);
}

function canObserve(document) {
  return typeof document?.testUserPermission !== "function"
    || document.testUserPermission(game.user, "OBSERVER");
}

function isItemDropData(data) {
  return data?.type === "Item" || data?.documentName === "Item";
}

function isWeapon(item) {
  return item?.type === "weapon" || Boolean(item?.system?.isWeapon);
}

function isRitual(item) {
  return item?.type === "ritual" || Boolean(item?.system?.isRitual);
}

function isMysticalPower(item) {
  return item?.type === "mysticalPower"
    || item?.type === "mystical-power"
    || Boolean(item?.system?.isMysticalPower);
}

async function itemFromDropData(dropData) {
  if (!isItemDropData(dropData)) return null;

  const ItemClass = globalThis.Item?.implementation ?? CONFIG.Item?.documentClass;
  if (typeof ItemClass?.fromDropData !== "function") return null;

  const item = await ItemClass.fromDropData(dropData);
  return item?.documentName === "Item" && canObserve(item) ? item : null;
}

async function importItemForStorage(actor, dropData, resolvedItem = null) {
  if (!actor?.isOwner || !isItemDropData(dropData)) return notifyUnavailable();

  const item = resolvedItem ?? await itemFromDropData(dropData);
  if (!item) return notifyUnavailable();
  if (item.parent?.uuid === actor.uuid) return item;

  if (typeof actor.createEmbeddedDocuments !== "function") {
    return notifyUnavailable();
  }

  const created = await actor.createEmbeddedDocuments("Item", [item.toObject()]);
  return Array.isArray(created) ? created[0] ?? null : created ?? null;
}

async function deleteItemDocument(actor, item) {
  if (typeof item.delete === "function") return item.delete();
  if (typeof actor.deleteEmbeddedDocuments === "function") {
    return actor.deleteEmbeddedDocuments("Item", [item.id]);
  }
  return notifyUnavailable();
}

async function confirmItemDeletion(item) {
  const message = game.i18n.localize("SYMBAROUMHUD.Storage.DeleteItemConfirm");
  const title = game.i18n.localize("SYMBAROUMHUD.Storage.DeleteItem");

  if (typeof globalThis.Dialog?.confirm === "function") {
    return globalThis.Dialog.confirm({
      title,
      content: `<p>${message}</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
  }

  if (typeof globalThis.confirm === "function") {
    return globalThis.confirm(`${message}\n\n${item.name ?? ""}`.trim());
  }

  return false;
}

function notifyUnavailable() {
  ui.notifications.warn(
    game.i18n.localize("SYMBAROUMHUD.Notifications.StorageUnavailable")
  );
}

function notifyMoneyUnavailable() {
  ui.notifications.warn(
    game.i18n.localize("SYMBAROUMHUD.Notifications.MoneyUnavailable")
  );
}

function notifyOnlyWeapons() {
  ui.notifications.warn(
    game.i18n.localize("SYMBAROUMHUD.Notifications.OnlyWeapons")
  );
}

function notifyOnlyRituals() {
  ui.notifications.warn(
    game.i18n.localize("SYMBAROUMHUD.Notifications.OnlyRituals")
  );
}

function notifyOnlyMysticalPowers() {
  ui.notifications.warn(
    game.i18n.localize("SYMBAROUMHUD.Notifications.OnlyMysticalPowers")
  );
}

function findQuiverItem(actor, id = null) {
  const quivers = findQuiverItems(actor);
  if (id) return quivers.find((item) => item.id === id) ?? null;
  return quivers[0] ?? null;
}

function findQuiverItems(actor) {
  const quivers = actorItems(actor)
    .filter((item) => isQuiver(item) && itemQuantity(item) > 0);
  return [
    ...quivers.filter(isActiveOrEquipped),
    ...quivers.filter((item) => !isActiveOrEquipped(item))
  ];
}

function quiverContexts(actor) {
  return findQuiverItems(actor).map((quiver) => quiverContext(actor, quiver));
}

function findSelectedQuiver(quivers, selectedId) {
  if (!quivers.length) return null;
  if (selectedId === QUIVER_STORAGE_ID) return quivers[0];
  if (!selectedId) return null;
  return quivers.find((quiver) => {
    return quiver.storageId === selectedId
      || quiver.id === selectedId
      || `${QUIVER_STORAGE_PREFIX}${quiver.id}` === selectedId;
  }) ?? null;
}

function quiverContext(actor, quiver) {
  if (!quiver) return null;
  const loaded = quiverLoadedTotal(quiver);
  const capacity = quiverCapacity();
  const storageId = `${QUIVER_STORAGE_PREFIX}${quiver.id}`;
  const availableAmmo = looseAmmoItems(actor).map((item) => (
    normalizeStorageItem(item, null, true)
  ));

  return {
    id: quiver.id,
    storageId,
    uuid: quiver.uuid,
    name: quiver.name,
    img: quiver.img ?? "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
    quantity: itemQuantity(quiver),
    loaded,
    capacity,
    remaining: Math.max(0, capacity - loaded),
    loadedItems: quiverLoadedEntries(quiver).map((entry, index) => ({
      id: `loaded-${index}`,
      uuid: entry.sourceUuid ?? null,
      containerId: storageId,
      draggable: false,
      virtual: true,
      name: entry.name ?? game.i18n.localize("SYMBAROUMHUD.Storage.LoadedAmmo"),
      img: entry.img ?? "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
      quantity: Math.max(0, number(entry.quantity))
    })),
    availableAmmo
  };
}

function actorItems(actor) {
  return Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
}

function isQuiver(item) {
  if (item?.type !== "equipment") return false;
  const name = String(item.name ?? "").toLocaleLowerCase();
  return name.includes("aljava") || name.includes("quiver");
}

function looseAmmoItems(actor) {
  return actorItems(actor).filter((item) => {
    return itemQuantity(item) > 0 && !isQuiver(item) && isAmmo(item);
  });
}

function isAmmo(item) {
  if (item?.type !== "equipment") return false;
  if (Boolean(itemFlag(item, "isAmmo"))) return true;
  if (itemFlag(item, "ammoType")) return true;

  const name = String(item.name ?? "").toLocaleLowerCase();
  return [
    "flecha",
    "flechas",
    "virote",
    "virotes",
    "arrow",
    "arrows",
    "bolt",
    "bolts",
    "ammunition",
    "municao",
    "munição",
    "projectile",
    "projetil",
    "projétil"
  ].some((term) => name.includes(term));
}

function isQuiverCompatibleAmmo(item) {
  if (!item || item.type !== "equipment" || isQuiver(item) || itemQuantity(item) <= 0) {
    return false;
  }
  if (Boolean(itemFlag(item, "isAmmo")) || itemFlag(item, "ammoType")) return true;

  const name = String(item.name ?? "").toLocaleLowerCase();
  return [
    "flecha",
    "flechas",
    "virote",
    "virotes",
    "arrow",
    "arrows",
    "bolt",
    "bolts"
  ].some((term) => name.includes(term));
}

function itemQuantity(item) {
  return number(item?.system?.number);
}

function isActiveOrEquipped(item) {
  const state = String(item?.system?.state ?? "").toLocaleLowerCase();
  return state === "active" || state === "equipped";
}

function quiverLoadedTotal(quiver) {
  return quiverLoadedEntries(quiver)
    .reduce((total, entry) => total + number(entry?.quantity), 0);
}

function quiverLoadedEntries(quiver) {
  const loadedAmmo = itemFlag(quiver, "loadedAmmo");
  if (Array.isArray(loadedAmmo) && loadedAmmo.length) return loadedAmmo;

  const usesRemaining = itemFlag(quiver, "usesRemaining");
  if (usesRemaining === undefined || usesRemaining === null) return [];

  return [{
    id: "legacy",
    name: game.i18n.localize("SYMBAROUMHUD.Storage.LoadedAmmo"),
    img: "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
    quantity: number(usesRemaining)
  }];
}

function quiverCapacity() {
  try {
    const key = `${IND_RESOURCES_ID}.quiverCapacity`;
    if (!game.settings?.settings?.has?.(key)) return 12;
    return Math.max(1, number(game.settings.get(IND_RESOURCES_ID, "quiverCapacity")) || 12);
  } catch (_error) {
    return 12;
  }
}

function settingEnabled(key, fallback) {
  try {
    const settingKey = `${IND_RESOURCES_ID}.${key}`;
    if (!game.settings?.settings?.has?.(settingKey)) return fallback;
    return Boolean(game.settings.get(IND_RESOURCES_ID, key));
  } catch (_error) {
    return fallback;
  }
}

function itemFlag(item, key) {
  return item?.getFlag?.(IND_RESOURCES_ID, key)
    ?? item?.flags?.[IND_RESOURCES_ID]?.[key];
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}
