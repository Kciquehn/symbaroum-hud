import { MODULE_ID } from "../constants.mjs";
import {
  HOTBAR_SHORTCUT_DRAG_TYPE,
  HotbarShortcutService
} from "../services/hotbar-shortcut-service.mjs";

let listenerController = null;
let menuController = null;
let menuElement = null;

export function registerHotbarShortcutKeybindings() {
  for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
    game.keybindings.register(MODULE_ID, `activateShortcut${number}`, {
      name: game.i18n.format("SYMBAROUMHUD.Keybindings.ActivateShortcut", { number }),
      editable: [{ key: `Digit${number}` }],
      onDown: () => {
        const slot = ui.hotbar?.slots?.find((entry) => entry.key === number)?.slot;
        if (!slot || !HotbarShortcutService.get(slot)) return false;
        run(() => HotbarShortcutService.activate(slot));
        return true;
      },
      precedence: CONST.KEYBINDING_PRECEDENCE.DEFERRED
    });
  }
}

export function registerHotbarShortcuts() {
  Hooks.on("hotbarDrop", (hotbar, data, slot) => {
    return handleHotbarDrop(hotbar, data, slot);
  });

  Hooks.on("renderHotbar", (_application, element) => decorateHotbar(element));
}

export function refreshHotbarShortcuts(element = document.getElementById("hotbar")) {
  decorateHotbar(element);
}

function decorateHotbar(element) {
  const root = hotbarRoot(element);
  if (!root) return;

  listenerController?.abort();
  listenerController = new AbortController();
  const signal = listenerController.signal;
  closeMenu();

  const slots = root.querySelectorAll("#action-bar .slot[data-slot]");
  for (const slot of slots) {
    clearShortcutDecoration(slot);
  }

  if (!HotbarShortcutService.isEnabled()) return;

  for (const slot of slots) {
    const shortcut = HotbarShortcutService.get(slot.dataset.slot);
    if (!shortcut) continue;

    const liveDocument = resolveSync(shortcut.uuid);
    const name = liveDocument?.name ?? shortcut.name;
    const img = liveDocument?.img
      ?? liveDocument?.thumbnail
      ?? liveDocument?.texture?.src
      ?? shortcut.img;

    slot.classList.remove("open");
    slot.classList.add("full", "symbaroum-hud-document-shortcut");
    slot.dataset.symbaroumHudShortcut = "true";
    slot.dataset.tooltipText = name;
    slot.setAttribute("aria-label", name);
    slot.draggable = !game.settings.get("core", "hotbarLock");

    slot.querySelector(".symbaroum-hud-shortcut-icon")?.remove();
    const icon = document.createElement("img");
    icon.className = "slot-icon symbaroum-hud-shortcut-icon";
    slot.prepend(icon);
    icon.src = img;
    icon.alt = name;
  }

  root.addEventListener("click", (event) => {
    const slot = shortcutSlot(event.target, root);
    if (!slot) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run(() => HotbarShortcutService.activate(slot.dataset.slot, {
      openSheet: event.shiftKey
    }));
  }, { capture: true, signal });

  root.addEventListener("contextmenu", (event) => {
    const slot = shortcutSlot(event.target, root);
    if (!slot) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openMenu(slot.dataset.slot, event);
  }, { capture: true, signal });

  root.addEventListener("dragstart", (event) => {
    const slot = shortcutSlot(event.target, root);
    if (!slot) return;
    event.stopImmediatePropagation();

    if (game.settings.get("core", "hotbarLock")) {
      event.preventDefault();
      return;
    }

    const shortcut = HotbarShortcutService.get(slot.dataset.slot);
    if (!shortcut) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: HOTBAR_SHORTCUT_DRAG_TYPE,
      actorKey: HotbarShortcutService.activeActorKey(),
      slot: Number(slot.dataset.slot),
      uuid: shortcut.uuid
    }));
  }, { capture: true, signal });

  root.addEventListener("dragover", (event) => {
    const slot = hotbarSlot(event.target, root);
    if (!slot) return;

    const data = readDragData(event);
    if (!canHandleHotbarDrop(data, slot.dataset.slot)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = data?.type === HOTBAR_SHORTCUT_DRAG_TYPE ? "move" : "copy";
  }, { capture: true, signal });

  root.addEventListener("drop", (event) => {
    const slot = hotbarSlot(event.target, root);
    if (!slot) return;

    const data = readDragData(event);
    if (!canHandleHotbarDrop(data, slot.dataset.slot)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    handleHotbarDrop(ui.hotbar, data, slot.dataset.slot);
  }, { capture: true, signal });
}

function handleHotbarDrop(hotbar, data, slot) {
  if (!canHandleHotbarDrop(data, slot)) return;
  if (hotbar?.locked) return false;

  if (data?.type === HOTBAR_SHORTCUT_DRAG_TYPE) {
    run(() => HotbarShortcutService.move(data.slot, slot, {
      actorKey: data.actorKey
    }));
    return false;
  }

  if (data?.type === "Macro" && HotbarShortcutService.get(slot)) {
    run(() => HotbarShortcutService.assignMacroDrop(data, slot));
    return false;
  }

  run(() => HotbarShortcutService.assignDocumentDrop(data, slot));
  return false;
}

function canHandleHotbarDrop(data, slot) {
  return Boolean(
    HotbarShortcutService.isEnabled()
    && slot
    && (
      data?.type === HOTBAR_SHORTCUT_DRAG_TYPE
      || (data?.type === "Macro" && HotbarShortcutService.get(slot))
      || HotbarShortcutService.acceptsDocumentDrop(data)
    )
  );
}

function clearShortcutDecoration(slot) {
  const wasShortcut = slot.dataset.symbaroumHudShortcut === "true";
  if (!wasShortcut) return;

  slot.classList.remove("full", "symbaroum-hud-document-shortcut");
  slot.classList.add("open");
  delete slot.dataset.symbaroumHudShortcut;
  delete slot.dataset.tooltipText;
  slot.removeAttribute("aria-label");
  slot.draggable = false;
  slot.querySelector(".symbaroum-hud-shortcut-icon")?.remove();
}

function shortcutSlot(target, root) {
  const slot = target?.closest?.(".symbaroum-hud-document-shortcut[data-slot]");
  return slot && root.contains(slot) ? slot : null;
}

function hotbarSlot(target, root) {
  const slot = target?.closest?.("#action-bar .slot[data-slot]");
  return slot && root.contains(slot) ? slot : null;
}

function hotbarRoot(element) {
  if (element?.querySelectorAll) return element;
  if (element?.[0]?.querySelectorAll) return element[0];
  return null;
}

function readDragData(event) {
  try {
    return TextEditor.implementation.getDragEventData(event);
  } catch (_error) {
    try {
      return JSON.parse(event.dataTransfer?.getData("text/plain") ?? "{}");
    } catch {
      return {};
    }
  }
}

function openMenu(slot, event) {
  closeMenu();
  menuController = new AbortController();
  const signal = menuController.signal;
  const menu = document.createElement("div");
  menu.className = "symbaroum-hud-shortcut-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute(
    "aria-label",
    game.i18n.localize("SYMBAROUMHUD.Actions.ShortcutActions")
  );

  menu.append(
    menuButton("fa-pen-to-square", "SYMBAROUMHUD.Actions.OpenShortcut", () => {
      closeMenu();
      run(() => HotbarShortcutService.open(slot));
    }, signal),
    menuButton("fa-xmark", "SYMBAROUMHUD.Actions.RemoveShortcut", () => {
      closeMenu();
      run(() => HotbarShortcutService.remove(slot));
    }, signal)
  );

  document.body.appendChild(menu);
  menuElement = menu;

  const margin = 6;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(
    margin,
    Math.min(event.clientX, window.innerWidth - bounds.width - margin)
  )}px`;
  menu.style.top = `${Math.max(
    margin,
    Math.min(event.clientY, window.innerHeight - bounds.height - margin)
  )}px`;
  menu.querySelector("button")?.focus({ preventScroll: true });

  document.addEventListener("pointerdown", (pointerEvent) => {
    if (!menu.contains(pointerEvent.target)) closeMenu();
  }, { capture: true, signal });
  document.addEventListener("keydown", (keyEvent) => {
    if (keyEvent.key === "Escape") closeMenu();
  }, { signal });
  window.addEventListener("blur", closeMenu, { signal });
}

function menuButton(iconClass, labelKey, callback, signal) {
  const button = document.createElement("button");
  const icon = document.createElement("i");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  icon.className = `fa-solid ${iconClass}`;
  icon.setAttribute("aria-hidden", "true");
  button.append(icon, document.createTextNode(game.i18n.localize(labelKey)));
  button.addEventListener("click", callback, { signal });
  return button;
}

function closeMenu() {
  menuController?.abort();
  menuController = null;
  menuElement?.remove();
  menuElement = null;
}

function resolveSync(uuid) {
  try {
    return fromUuidSync(uuid);
  } catch {
    return null;
  }
}

function run(action) {
  void action().catch((error) => {
    console.error(`${MODULE_ID} | Hotbar shortcut action failed.`, error);
    ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
  });
}
