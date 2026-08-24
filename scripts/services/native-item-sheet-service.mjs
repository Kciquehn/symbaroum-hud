/**
 * Render a real system Item sheet inside another application without creating
 * a second Foundry window. The returned markup remains read-only except for
 * explicitly allowed fields handled by the host application.
 */
export async function renderEmbeddedItemSheet(item, {
  cssClass = "locked",
  enabledFields = [],
  isOwned = false
} = {}) {
  const sheet = item?.sheet;
  const renderTemplate = globalThis.foundry?.applications?.handlebars?.renderTemplate;
  if (!sheet?.getData || !renderTemplate) return "";

  const data = await sheet.getData();
  data.owner = false;
  data.editable = false;
  data.isOwned = Boolean(isOwned);
  data.cssClass = cssClass;

  const template = sheet.options?.template ?? "systems/symbaroum/template/sheet/ability.hbs";
  let rendered = String(await renderTemplate(template, data))
    .replace(/^\s*<form\b[^>]*>/i, "")
    .replace(/<\/form>\s*$/i, "")
    .replace(/<(input|select|textarea)\b/gi, "<$1 disabled");

  for (const fieldName of enabledFields) {
    const escapedName = escapeRegExp(String(fieldName));
    rendered = rendered.replace(
      new RegExp(`<input disabled(?=[^>]*\\bname=["']${escapedName}["'])`, "gi"),
      "<input"
    );
  }
  return rendered;
}

/** Bind the tabs which normally belong to the standalone Symbaroum sheet. */
export function activateEmbeddedItemSheetTabs(host, {
  onSelect = null,
  selectedTab = "description",
  signal = undefined
} = {}) {
  if (!host?.querySelectorAll) return false;
  const tabs = [...host.querySelectorAll(".sheet-tabs [data-tab]")];
  const panels = [...host.querySelectorAll(".sheet-body > .tab[data-tab]")];
  if (!tabs.length || !panels.length) return false;

  const activate = (tabId) => {
    const resolvedId = tabs.some((tab) => tab.dataset.tab === tabId)
      ? tabId
      : tabs[0].dataset.tab;
    for (const tab of tabs) {
      const active = tab.dataset.tab === resolvedId;
      tab.classList.toggle("active", active);
      tab.setAttribute("role", "tab");
      tab.setAttribute("tabindex", active ? "0" : "-1");
      tab.setAttribute("aria-selected", String(active));
    }
    for (const panel of panels) {
      const active = panel.dataset.tab === resolvedId;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    }
    onSelect?.(resolvedId);
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab.dataset.tab), { signal });
    tab.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      activate(tab.dataset.tab);
    }, { signal });
  }
  activate(selectedTab);
  return true;
}

/**
 * Replace the native checkbox presentation with the same toggle button used by
 * the HUD Mystical Powers panel. The original checkbox remains the source of
 * truth and still emits the change event handled by the host application.
 */
export function activateEmbeddedItemSheetActiveControls(host, {
  signal = undefined
} = {}) {
  if (!host?.querySelectorAll) return false;
  const controls = [...host.querySelectorAll(
    '.sheet-body .active input[name^="system."][name$=".isActive"]'
  )];
  if (!controls.length) return false;

  for (const input of controls) {
    const wrapper = input.closest(".active");
    if (!wrapper || wrapper.querySelector("[data-native-ability-active-control]")) continue;

    const label = wrapper.querySelector(`label[for="${escapeSelector(input.id)}"]`)
      ?? wrapper.querySelector("label");
    const button = input.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "symbaroum-hud-ability-active-toggle";
    button.dataset.nativeAbilityActiveControl = "true";
    button.disabled = input.disabled;
    button.innerHTML = `
      <span>${escapeHtml(label?.textContent?.trim() || "Ativa")}</span>
      <i class="fa-solid" aria-hidden="true"></i>
    `;

    const synchronize = () => {
      const active = Boolean(input.checked);
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
      button.querySelector("i")?.classList.toggle("fa-square-check", active);
      button.querySelector("i")?.classList.toggle("fa-square", !active);
    };

    button.addEventListener("click", () => {
      if (button.disabled || input.disabled) return;
      input.checked = !input.checked;
      synchronize();
      const EventClass = input.ownerDocument?.defaultView?.Event ?? globalThis.Event;
      input.dispatchEvent(new EventClass("change", { bubbles: true }));
    }, { signal });

    wrapper.classList.add("symbaroum-hud-native-active-control");
    if (label) label.hidden = true;
    input.hidden = true;
    wrapper.append(button);
    synchronize();
  }
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeSelector(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value ?? ""));
  return String(value ?? "").replace(/["\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
