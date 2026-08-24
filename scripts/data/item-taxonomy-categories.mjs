function category(id, { parent = null, group = "equipment", source = "core" } = {}) {
  return Object.freeze({
    id,
    parent,
    group,
    source,
    label: `SYMBAROUMHUD.ItemTaxonomy.Categories.${id}`
  });
}

/**
 * Hierarchy taken from the merchandise and treasure tables in the official
 * Core Rulebook, Advanced Player's Guide and Game Master's Guide.
 */
export const ITEM_TAXONOMY_DEFINITIONS = Object.freeze([
  category("melee-weapons", { group: "weapons" }),
  category("one-handed-weapons", { parent: "melee-weapons", group: "weapons" }),
  category("short-weapons", { parent: "melee-weapons", group: "weapons" }),
  category("long-weapons", { parent: "melee-weapons", group: "weapons" }),
  category("unarmed-attacks", { parent: "melee-weapons", group: "weapons" }),
  category("heavy-weapons", { parent: "melee-weapons", group: "weapons" }),
  category("shields", { parent: "melee-weapons", group: "weapons" }),

  category("ranged-weapons", { group: "weapons" }),
  category("projectile-weapons", { parent: "ranged-weapons", group: "weapons" }),
  category("bows", { parent: "projectile-weapons", group: "weapons" }),
  category("crossbows", { parent: "projectile-weapons", group: "weapons" }),
  category("arrows", { parent: "projectile-weapons", group: "weapons" }),
  category("throwing-weapons", { parent: "ranged-weapons", group: "weapons" }),
  category("siege-weapons", { group: "weapons", source: "apg" }),
  category("alchemical-weapons", { group: "weapons", source: "apg" }),

  category("armor"),
  category("light-armor", { parent: "armor" }),
  category("medium-armor", { parent: "armor" }),
  category("heavy-armor", { parent: "armor" }),
  category("alchemical-elixirs"),
  category("equipment"),
  category("constructions"),
  category("transport"),
  category("containers", { source: "apg" }),
  category("farm-animals"),
  category("income"),
  category("clothing", { source: "apg" }),
  category("expenses"),
  category("services"),
  category("tools", { source: "apg" }),
  category("specialized-tools", { parent: "tools", source: "apg" }),
  category("medical-supplies", { parent: "equipment", source: "core" }),
  category("artifacts", { source: "gmg" }),
  category("minor-artifacts", { parent: "artifacts", source: "apg" }),
  category("mystical-treasures", { parent: "artifacts", source: "gmg" }),
  category("traps", { source: "gmg" }),

  category("food-and-drink", { source: "apg" }),
  category("beverages", { parent: "food-and-drink", source: "apg" }),
  category("meat", { parent: "food-and-drink", source: "apg" }),
  category("teas", { parent: "beverages", source: "apg" }),
  category("stews", { parent: "food-and-drink", source: "apg" }),
  category("porridges", { parent: "food-and-drink", source: "apg" }),
  category("fish", { parent: "food-and-drink", source: "apg" }),
  category("desserts", { parent: "food-and-drink", source: "apg" }),
  category("soups", { parent: "food-and-drink", source: "apg" }),
  category("pies", { parent: "food-and-drink", source: "apg" }),

  category("tobacco-utensils", { source: "apg" }),
  category("tobacco-types", { source: "apg" }),
  category("musical-instruments", { source: "apg" }),
  category("trade-goods", { source: "apg" }),
  category("curiosities", { source: "gmg" }),
  category("survival-items", { source: "apg" }),

  category("ability", { group: "documents" }),
  category("mystical-power", { group: "documents" }),
  category("ritual", { group: "documents" }),
  category("trait", { group: "documents" }),
  category("boon", { group: "documents" }),
  category("burden", { group: "documents" }),
  category("item", { group: "documents" })
]);

export const ITEM_TAXONOMY_CATEGORY_IDS = Object.freeze(
  ITEM_TAXONOMY_DEFINITIONS.map((entry) => entry.id)
);

export const ITEM_TAXONOMY_CATEGORY_BY_ID = new Map(
  ITEM_TAXONOMY_DEFINITIONS.map((entry) => [entry.id, entry])
);

// Keep saved worlds compatible after equivalent official merchandise
// headings are consolidated into a single Category.
export const ITEM_TAXONOMY_CATEGORY_ALIASES = Object.freeze({
  "expedition-gear": "survival-items"
});

export function canonicalTaxonomyCategoryId(id) {
  const raw = String(id ?? "").trim();
  return ITEM_TAXONOMY_CATEGORY_ALIASES[raw] ?? raw;
}

export function taxonomyCategoryAncestors(id) {
  const result = [];
  const visited = new Set();
  let current = ITEM_TAXONOMY_CATEGORY_BY_ID.get(id);
  while (current?.parent && !visited.has(current.parent)) {
    visited.add(current.parent);
    result.unshift(current.parent);
    current = ITEM_TAXONOMY_CATEGORY_BY_ID.get(current.parent);
  }
  return result;
}
