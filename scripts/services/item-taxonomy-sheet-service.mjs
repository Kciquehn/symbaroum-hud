import { ITEM_TAXONOMY_DEFINITIONS } from "../data/item-taxonomy-categories.mjs";
import { openItemTaxonomyEditor } from "../applications/item-category-manager.mjs";
import { resolveItemTaxonomy } from "./item-taxonomy-service.mjs";

const ITEM_SHEET_RENDER_HOOKS = Object.freeze([
  "renderItemSheet",
  "renderAbilitySheet",
  "renderArmorSheet",
  "renderArtifactSheet",
  "renderBoonSheet",
  "renderBurdenSheet",
  "renderEquipmentSheet",
  "renderMysticalPowerSheet",
  "renderRitualSheet",
  "renderTraitSheet",
  "renderWeaponSheet"
]);

let hooksRegistered = false;
const CATEGORY_IDS = new Set(ITEM_TAXONOMY_DEFINITIONS.map(({ id }) => id));

export function registerItemTaxonomySheetHooks() {
  if (hooksRegistered || !globalThis.Hooks?.on) return;
  hooksRegistered = true;
  for (const hookName of ITEM_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, injectItemTaxonomyCategory);
  }
}

export function injectItemTaxonomyCategory(application, html, data = {}) {
  const root = htmlRoot(html);
  const item = application?.item ?? application?.document ?? data?.item;
  if (!root || !item || item.documentName !== "Item") return false;

  const bonus = root.querySelector('.sheet-body .tab[data-tab="bonus"] .bonus');
  if (!bonus || bonus.querySelector("[data-symbaroum-hud-item-category]")) return false;

  const taxonomy = resolveItemTaxonomy(item);
  const category = taxonomyCategoryText(taxonomy);
  const row = root.ownerDocument.createElement("div");
  row.className = "attribute symbaroum-hud-item-category";
  row.dataset.symbaroumHudItemCategory = "true";

  const inputId = `${item.id ?? "item"}-symbaroum-hud-category`;
  const label = root.ownerDocument.createElement("label");
  label.htmlFor = inputId;
  label.textContent = localize("SYMBAROUMHUD.ItemTaxonomy.Category", "Categoria");

  const control = globalThis.game?.user?.isGM
    ? categoryEditorButton(root.ownerDocument, item, category)
    : readonlyCategoryInput(root.ownerDocument, inputId, category);
  control.id = inputId;
  row.append(label, control);
  bonus.append(row);
  return true;
}

export function itemTaxonomyCategory(item) {
  const taxonomy = resolveItemTaxonomy(item);
  return Object.freeze({
    primary: taxonomy.primary,
    label: localizeCategory(taxonomy.primary),
    overridden: taxonomy.overridden === true
  });
}

function categoryEditorButton(document, item, category) {
  const button = document.createElement("button");
  button.type = "button";
  button.value = category;
  button.textContent = category;
  button.dataset.symbaroumHudItemCategoryEdit = "true";
  button.setAttribute("data-tooltip", localize(
    "SYMBAROUMHUD.ItemTaxonomy.GmHint",
    "Somente o Mestre pode editar as Categorias deste item."
  ));
  button.setAttribute("aria-label", `${localize("SYMBAROUMHUD.ItemCategoryManager.Edit", "Editar Categorias")}: ${category}`);
  button.addEventListener("click", async (event) => {
    event?.preventDefault?.();
    button.disabled = true;
    try {
      if (!await openItemTaxonomyEditor(item)) return;
      const next = taxonomyCategoryText(resolveItemTaxonomy(item));
      button.value = next;
      button.textContent = next;
      button.setAttribute("aria-label", `${localize("SYMBAROUMHUD.ItemCategoryManager.Edit", "Editar Categorias")}: ${next}`);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function readonlyCategoryInput(document, inputId, category) {
  const input = document.createElement("input");
  input.id = inputId;
  input.type = "text";
  input.value = category;
  input.readOnly = true;
  input.tabIndex = -1;
  input.setAttribute("aria-readonly", "true");
  input.setAttribute("data-tooltip", localize(
    "SYMBAROUMHUD.ItemTaxonomy.AutomaticHint",
    "Categoria identificada automaticamente pelo Symbaroum HUD."
  ));
  return input;
}

function localizeCategory(primary) {
  const normalized = String(primary || "item");
  const key = `SYMBAROUMHUD.ItemTaxonomy.Categories.${normalized}`;
  const translated = globalThis.game?.i18n?.localize?.(key);
  if (translated && translated !== key) return translated;
  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function taxonomyCategoryText(taxonomy) {
  const categories = (taxonomy?.tags ?? [])
    .filter((category) => CATEGORY_IDS.has(category))
    .map(localizeCategory);
  return categories.length ? categories.join(", ") : localizeCategory(taxonomy?.primary);
}

function localize(key, fallback) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : fallback;
}

function htmlRoot(html) {
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return null;
}
