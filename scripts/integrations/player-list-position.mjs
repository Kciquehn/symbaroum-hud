import { MODULE_ID, SETTINGS } from "../constants.mjs";

const POSITION_FLAG = "playerListPosition";
const HANDLE_CLASS = "symbaroum-hud-players-drag-handle";
let binding = null;
let positionUser = null;
let position = null;
let saveQueue = Promise.resolve();

// The native Players application is unframed and unpositioned. Move only its
// HUD presentation, without changing Foundry's application or player actions.
export function syncPlayerListPosition(root = globalThis.document?.getElementById("players")) {
  const enabled = game.settings.get(MODULE_ID, SETTINGS.ENABLED);
  if (binding && (!enabled || binding.root !== root || !root?.contains(binding.handle))) {
    binding.dispose();
    binding = null;
  }
  if (!root || !enabled) return;

  if (positionUser !== game.user) {
    positionUser = game.user;
    const saved = game.user?.getFlag?.(MODULE_ID, POSITION_FLAG);
    position = Number.isFinite(saved?.left) && Number.isFinite(saved?.top)
      ? { left: saved.left, top: saved.top }
      : null;
  }

  root.classList.add("symbaroum-hud-players-draggable");
  if (binding) {
    if (position && !binding.dragging()) position = applyPosition(root, position);
    return;
  }

  const handle = document.createElement("div");
  handle.className = HANDLE_CLASS;
  handle.innerHTML = '<i class="fa-solid fa-grip" aria-hidden="true"></i>';
  const label = game.i18n.localize("SYMBAROUMHUD.Actions.MovePlayers");
  handle.dataset.tooltip = label;
  handle.setAttribute("aria-label", label);
  root.prepend(handle);
  if (position) position = applyPosition(root, position);

  const controller = new AbortController();
  const options = { signal: controller.signal };
  let drag = null;

  function move(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    position = applyPosition(root, { left: drag.left + dx, top: drag.top + dy });
    event.preventDefault();
    event.stopPropagation();
  }

  function finish(event, cancelled = false) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    if (event && !cancelled) move(event);
    const completed = drag;
    drag = null;
    root.classList.remove("symbaroum-hud-players-dragging");
    if (handle.hasPointerCapture?.(completed.pointerId)) handle.releasePointerCapture(completed.pointerId);
    if (cancelled) {
      position = completed.previous;
      if (position) applyPosition(root, position);
      else clearPosition(root);
      return;
    }
    if (!completed.moved) return;
    const user = positionUser;
    const saved = { ...position };
    // Serialize rapid drags and retain the in-memory position while saving, so
    // hiding or rerendering the list cannot restore an older flag value.
    saveQueue = saveQueue.then(() => user.setFlag(MODULE_ID, POSITION_FLAG, saved)).catch((error) => {
      console.error(`${MODULE_ID} | Could not save player list position.`, error);
      globalThis.ui?.notifications?.error(game.i18n.localize("SYMBAROUMHUD.Actions.SavePlayerListPositionError"));
    });
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag) return;
    const rect = root.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      left: rect.left, top: rect.top, previous: position, moved: false
    };
    handle.setPointerCapture(event.pointerId);
    root.classList.add("symbaroum-hud-players-dragging");
    event.preventDefault();
    event.stopPropagation();
  }, options);
  handle.addEventListener("pointermove", move, options);
  handle.addEventListener("pointerup", (event) => finish(event), options);
  handle.addEventListener("pointercancel", (event) => finish(event, true), options);
  handle.addEventListener("lostpointercapture", (event) => finish(event, true), options);
  window.addEventListener("blur", () => finish(null, true), options);
  window.addEventListener("resize", () => {
    finish(null, true);
    if (position) position = applyPosition(root, position);
  }, options);

  binding = {
    root, handle, dragging: () => Boolean(drag),
    dispose: () => {
      finish(null, true);
      controller.abort();
      handle.remove();
      root.classList.remove("symbaroum-hud-players-draggable");
      clearPosition(root);
    }
  };
}

function applyPosition(root, desired) {
  const { width, height } = root.getBoundingClientRect();
  // Hidden lists have zero dimensions. Clamp when shown, preserving their
  // saved coordinates while hidden instead of measuring an empty rectangle.
  const next = width > 0 && height > 0 ? {
    left: Math.max(0, Math.min(desired.left, window.innerWidth - width)),
    top: Math.max(0, Math.min(desired.top, window.innerHeight - height))
  } : { ...desired };
  root.style.setProperty("--symbaroum-hud-players-left", `${next.left}px`);
  root.style.setProperty("--symbaroum-hud-players-top", `${next.top}px`);
  return next;
}

function clearPosition(root) {
  root.style.removeProperty("--symbaroum-hud-players-left");
  root.style.removeProperty("--symbaroum-hud-players-top");
}
