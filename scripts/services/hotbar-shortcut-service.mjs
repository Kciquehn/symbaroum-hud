import { MODULE_ID } from "../constants.mjs";
import { assignHotbarMacro } from "../compat/hotbar.mjs";
import { ActorService } from "./actor-service.mjs";

const FLAG = "hotbarShortcuts";
const FALLBACK_ICON = "icons/svg/item-bag.svg";
const FLAG_VERSION = 2;
const GLOBAL_ACTOR_KEY = "__global__";

let actorResolver = () => null;

export const HOTBAR_SHORTCUT_DRAG_TYPE = `${MODULE_ID}.HotbarShortcut`;

export class HotbarShortcutService {
  static setActorResolver(resolver) {
    actorResolver = typeof resolver === "function" ? resolver : () => null;
  }

  static activeActorKey() {
    return actorKey(actorResolver());
  }

  static isEnabled(user = game.user) {
    return !user?.isGM;
  }

  static all(user = game.user, { actorKey: key = this.activeActorKey() } = {}) {
    if (!this.isEnabled(user)) return {};
    const state = flagState(user?.getFlag?.(MODULE_ID, FLAG));
    return state.actors[key] ?? {};
  }

  static get(slot, user = game.user, options = {}) {
    const key = slotKey(slot);
    return key ? this.all(user, options)[key] ?? null : null;
  }

  static acceptsDocumentDrop(data) {
    return Boolean(
      this.isEnabled()
      && data
      && data.type !== "Macro"
      && data.type !== HOTBAR_SHORTCUT_DRAG_TYPE
      && typeof data.uuid === "string"
      && data.uuid
    );
  }

  static async assignDocumentDrop(data, slot) {
    const key = slotKey(slot);
    if (!key || !this.acceptsDocumentDrop(data)) return;

    const document = await fromUuid(data.uuid);
    if (!document || !canObserve(document)) {
      return notify("SYMBAROUMHUD.Notifications.ShortcutUnavailable");
    }

    const actorKey = this.activeActorKey();
    const shortcuts = { ...this.all(game.user, { actorKey }) };
    shortcuts[key] = shortcutData(document, data);
    await assignHotbarMacro(game.user, null, Number(key));
    await this.#persist(shortcuts, { actorKey });
  }

  static async assignMacroDrop(data, slot) {
    const key = slotKey(slot);
    if (!this.isEnabled() || !key || data?.type !== "Macro") return;

    const MacroClass = foundry.documents.Macro.implementation;
    let macro = await fromUuid(data.uuid);
    if (!macro || macro.documentName !== "Macro") return;
    if (!game.macros.has(macro.id)) {
      macro = await MacroClass.create(macro.toObject());
    }

    const actorKey = this.activeActorKey();
    const shortcuts = { ...this.all(game.user, { actorKey }) };
    delete shortcuts[key];
    await this.#persist(shortcuts, { actorKey, render: false });
    await assignHotbarMacro(game.user, macro, Number(key), { fromSlot: data.slot });
    await this.#render();
  }

  static async move(sourceSlot, targetSlot, {
    actorKey: key = this.activeActorKey()
  } = {}) {
    const sourceKey = slotKey(sourceSlot);
    const targetKey = slotKey(targetSlot);
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;

    const shortcuts = { ...this.all(game.user, { actorKey: key }) };
    const source = shortcuts[sourceKey];
    if (!source) return;

    const targetShortcut = shortcuts[targetKey];
    if (targetShortcut) shortcuts[sourceKey] = targetShortcut;
    else delete shortcuts[sourceKey];
    shortcuts[targetKey] = source;

    const targetMacroId = game.user.hotbar?.[targetKey];
    const targetMacro = targetMacroId ? game.macros.get(targetMacroId) : null;
    if (targetMacro) {
      await assignHotbarMacro(game.user, targetMacro, Number(sourceKey), {
        fromSlot: Number(targetKey)
      });
    } else {
      await assignHotbarMacro(game.user, null, Number(targetKey));
    }

    await this.#persist(shortcuts, { actorKey: key });
  }

  static async remove(slot) {
    const key = slotKey(slot);
    if (!key) return;

    const actorKey = this.activeActorKey();
    const shortcuts = { ...this.all(game.user, { actorKey }) };
    if (!shortcuts[key]) return;
    delete shortcuts[key];
    await this.#persist(shortcuts, { actorKey });
  }

  static async activate(slot, { openSheet = false } = {}) {
    const shortcut = this.get(slot);
    if (!shortcut) return;

    const document = await fromUuid(shortcut.uuid);
    if (!document || !canObserve(document)) {
      return notify("SYMBAROUMHUD.Notifications.ShortcutUnavailable");
    }
    if (openSheet || document.documentName !== "Item" || !document.actor) {
      return this.#openDocument(document);
    }

    if (document.system?.isWeapon) {
      return ActorService.rollWeapon(document.actor, document.id);
    }
    if (document.system?.isArmor) {
      return ActorService.rollArmor(document.actor);
    }
    if (document.system?.isPower) {
      return ActorService.usePower(document.actor, document.id);
    }
    return this.#openDocument(document);
  }

  static async open(slot) {
    const shortcut = this.get(slot);
    if (!shortcut) return;

    const document = await fromUuid(shortcut.uuid);
    if (!document || !canObserve(document)) {
      return notify("SYMBAROUMHUD.Notifications.ShortcutUnavailable");
    }
    return this.#openDocument(document);
  }

  static async #openDocument(document) {
    if (!document.sheet) return notify("SYMBAROUMHUD.Notifications.ShortcutUnavailable");
    return document.sheet.render(true);
  }

  static async #persist(shortcuts, { actorKey: key = this.activeActorKey(), render = true } = {}) {
    const state = flagState(game.user?.getFlag?.(MODULE_ID, FLAG));
    const actors = { ...state.actors };

    if (Object.keys(shortcuts).length) actors[key] = shortcuts;
    else delete actors[key];

    await game.user.setFlag(MODULE_ID, FLAG, {
      version: FLAG_VERSION,
      actors
    });
    if (render) await this.#render();
  }

  static async #render() {
    return ui.hotbar?.render({ force: true });
  }
}

function slotKey(slot) {
  const value = Number(slot);
  return Number.isInteger(value) && value >= 1 && value <= 50 ? String(value) : null;
}

function actorKey(actor) {
  return actor?.uuid ?? actor?.id ?? GLOBAL_ACTOR_KEY;
}

function flagState(value) {
  if (!value || typeof value !== "object") {
    return { version: FLAG_VERSION, actors: {} };
  }

  if (value.actors && typeof value.actors === "object") {
    return {
      version: FLAG_VERSION,
      actors: Object.fromEntries(
        Object.entries(value.actors)
          .map(([key, shortcuts]) => [key, shortcutsBySlot(shortcuts)])
          .filter(([, shortcuts]) => Object.keys(shortcuts).length)
      )
    };
  }

  const legacyShortcuts = shortcutsBySlot(value);
  return {
    version: FLAG_VERSION,
    actors: Object.keys(legacyShortcuts).length
      ? { [GLOBAL_ACTOR_KEY]: legacyShortcuts }
      : {}
  };
}

function shortcutsBySlot(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([slot, shortcut]) => slotKey(slot) && shortcut?.uuid)
  );
}

function canObserve(document) {
  return typeof document.testUserPermission !== "function"
    || document.testUserPermission(game.user, "OBSERVER");
}

function shortcutData(document, dropData) {
  return {
    uuid: document.uuid,
    type: document.documentName ?? dropData.type,
    name: document.name ?? game.i18n.localize("Document"),
    img: document.img
      ?? document.thumbnail
      ?? document.texture?.src
      ?? dropData.img
      ?? FALLBACK_ICON
  };
}

function notify(key) {
  ui.notifications.warn(game.i18n.localize(key));
}
