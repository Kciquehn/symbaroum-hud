import { MODULE_ID } from "../constants.mjs";
import {
  ITEM_TAXONOMY_CATEGORY_IDS,
  canonicalTaxonomyCategoryId,
  taxonomyCategoryAncestors
} from "../data/item-taxonomy-categories.mjs";
import { officialItemCategoryAdjustment } from "../data/official-item-category-assignments.mjs";

export const ITEM_TAXONOMY_VERSION = 4;
export const ITEM_TAXONOMY_OVERRIDE_VERSION = 1;
export const ITEM_TAXONOMY_FLAG = `flags.${MODULE_ID}.itemTaxonomy`;
export const ITEM_TAXONOMY_OVERRIDE_FLAG = `flags.${MODULE_ID}.itemTaxonomyOverride`;
export const ITEM_TAXONOMY_CATEGORIES = ITEM_TAXONOMY_CATEGORY_IDS;

const SHOP_ITEM_TYPES = new Set(["armor", "equipment", "weapon"]);
const CATEGORY_SET = new Set(ITEM_TAXONOMY_CATEGORY_IDS);
const LEGACY_CATEGORY_ALIASES = Object.freeze({
  "greater-artifact": "artifacts", artifact: "minor-artifacts",
  beverage: "beverages", food: "food-and-drink", elixir: "alchemical-elixirs",
  ammunition: "arrows", armor: "armor", clothing: "clothing",
  "musical-instrument": "musical-instruments", trap: "traps", tool: "tools",
  container: "containers", "trade-good": "trade-goods",
  "adventuring-gear": "survival-items", "expedition-gear": "survival-items", tobacco: "tobacco-types",
  equipment: "equipment", ability: "ability", "mystical-power": "mystical-power",
  ritual: "ritual", trait: "trait", boon: "boon", burden: "burden", item: "item"
});

// Specific official table rows win, while their parents remain filterable tags.
const PRIMARY_PRIORITY = Object.freeze([
  "mystical-treasures", "minor-artifacts", "artifacts",
  "alchemical-weapons",
  "bows", "crossbows", "arrows", "throwing-weapons", "siege-weapons",
  "one-handed-weapons", "short-weapons", "long-weapons", "unarmed-attacks",
  "heavy-weapons", "shields", "light-armor", "medium-armor", "heavy-armor",
  "alchemical-elixirs", "trade-goods",
  // Table 21 headings are canonical. Ingredient facets such as meat or fish
  // remain filterable, but do not replace Ensopado, Torta or Sobremesa as the
  // category displayed for that official row.
  "teas", "stews", "porridges", "desserts", "soups", "pies",
  "beverages", "meat", "fish", "food-and-drink",
  "tobacco-utensils", "tobacco-types", "musical-instruments",
  "curiosities", "survival-items", "medical-supplies",
  "constructions", "transport", "containers",
  "farm-animals", "income", "clothing", "expenses", "services",
  "specialized-tools", "tools", "traps",
  "projectile-weapons", "ranged-weapons", "melee-weapons", "armor",
  "equipment", "ability", "mystical-power", "ritual", "trait", "boon",
  "burden", "item"
]);

const CLOTHING = /\b(gown|robe|garb|rags|pants|shirt|scarf|cloak|coat|cap|hat|mask|boots|skirt|tunic|dress|beca|traje|trapos|calca|camisa|cachecol|capa|casaco|chapeu|mascara|botas|saia|tunica|vestido)\b/;
const CONTAINERS = /^(pouch|quiver|barrel|chest|box|coin purse|waterskin|basket|drinking horn|vial|pitcher|backpack|sack|knapsack|algibeira|aljava|barril|bau|caixa de rape|caixa decorada|bolsa de moedas|caneca|cantil|cesta|copo de chifre|copo de vidro|jarro de barro|mochila|saco)(\b|$)/;
const MUSICAL_INSTRUMENTS = /\b(lute|horn|spinet|flute|bagpipe|mouth harp|hurdy gurdy|fiddle|drum|whistle|alaude|chifre|corneta|espineta|flauta|gaita|harpa|realejo|violino|tambor|apito)\b/;
const TOBACCO_UTENSILS = /\b(pipe|snuff box|tobacco pouch|cachimbo|caixa de rape|bolsa de tabaco)\b/;
const TOBACCO_TYPES = /\b(snuff|tobacco|longbottom leaf|dream snuff|rape|tabaco|folha amarga|folha do fundo|fumo)\b/;
const TRAPS = /\b(trap|snare|mine|armadilha|mina alquimica|fosso|pit trap)\b/;
const SPECIALIZED_TOOLS = /\b(cartographer|cheating kit|climbing kit|disguise kit|excavation kit|field laboratory|field library|forgery kit|smithy|surgeon kit|surgical instruments|thieves tools|weapon maintenance|cartograf|instrumentos de cartografo|equipamento de escalada|ferramentas de escavacao|kit de trapaca|kit de escalada|kit de disfarce|kit de escavacao|laboratorio de campo|biblioteca de campo|kit de falsificacao|ferraria|kit de cirurgiao|instrumentos cirurgicos|gazuas|manutencao de arma)\b/;
const TOOLS = /\b(artisan tool|chain|hammer|mining pick|scythe|shovel|sledgehammer|needle and thread|whetstone|ferramenta de artesao|corrente|martelo|picareta|foice|pa|marreta|agulha e linha|pedra de amolar)\b/;
const SURVIVAL = /\b(field equipment|camping|bedroll|tent|blanket|snow shoes|cooking pan|grappling hook|rope ladder|rope|fishing|flint and steel|torch|lantern|lamp oil|firewood|equipamento de acampar|saco de dormir|tenda|cobertor|sapatos de neve|frigideira|arpeu|escada de corda|corda|pesca|anzol|pederneira|tocha|lanterna|oleo de lampada|lenha)\b/;
const TRADE_GOODS = /\b(copper|iron|gold|silver|silk|cotton fabric|tar|saffron|cinnamon|cardamom|cumin|clove|turmeric|spices|ginger|mint|sugar|grain|salt|vegetable oil|vinegar|honey|cobre|ferro|ouro|prata|seda|tecido de algodao|alcatrao|acafrao|canela|cardamomo|cominho|cravo|curcuma|especiarias|gengibre|menta|acucar|graos|sal|oleo vegetal|vinagre|mel)\b/;
const CONSTRUCTIONS = /^(croft|farm|watch tower( wood| stone)?|fort( wood| stone)?|estate|keep|castle|cabana|sitio|fazenda|torre de vigia( de madeira| de pedra)?|forte( de madeira| de pedra)?|propriedade|fortaleza|castelo)\b/;
const TRANSPORT = /\b(canoe|cart|galley|mule|riding horse|rowing boat|river boat|sleigh|wagon|canoa|carroca|galera|mula|cavalo de montaria|barco a remo|barco fluvial|treno|vagao)\b/;
const FARM_ANIMALS = /\b(bull|chicken|cow|dog|donkey|ox|pig|rooster|sheep|touro|galinha|vaca|cao|cachorro|burro|boi|porco|galo|ovelha)\b/;
const SERVICES = /^(bath|bodyguard|cartographer|medicus|mystic ritual|toll|laundry|banho|guarda costas|cartografo|medico|ritual mistico|pedagio|lavanderia)\b/;
const INCOME = /^(artisan|knight|laborer|medicus|sellsword|rider|artesao|cavaleiro|trabalhador|medico|mercenario)\b/;
const EXPENSES = /^(common room|private room|stable|camp life|feast|banquet|alojamento|quarto comum|quarto privado|estabulo|vida no acampamento|festa|banquete)\b/;
const SIEGE_WEAPONS = /\b(ballista|catapult|trebuchet|stationary firetube|missile battery|breaching pot|balista|catapulta|trabuco|tubo de fogo (alquimico )?estacionario|bateria de misseis|pote de ruptura)\b/;
const AMMUNITION = /\b(arrow|arrows|bolt|bolts|flecha|flechas|virote|virotes)\b/;
const BOWS = /\b(bow|longbow|shortbow|arco|arco longo|arco curto)\b/;
const CROSSBOWS = /\b(crossbow|arbalest|besta|arbalesta)\b/;
const SHIELD_EQUIPMENT = /\b(buckler|steel shield|broquel|escudo de aco)\b/;
const THROWING_WEAPON_NAMES = /\b(spear sling|lanca funda)\b/;
const BEVERAGES = /\b(ale|beer|brew|wine|must|fermented|ludendrink|blot|mead|cider|milk|water|juice|cerveja|vinho|fermentad|hidromel|sidra|leite|agua|suco|caldo negro|blackbrew|vesa)\b/;
const TEAS = /\b(tea|cha)\b/;
const MEAT = /\b(meat|bacon|sausage|ham|poultry|venison|carne|linguica|salsicha|presunto|aves|veado)\b/;
const STEWS = /\b(stew|ensopado|cozido)\b/;
const PORRIDGES = /\b(porridge|mingau|papa)\b/;
const FISH = /\b(fish|trout|salmon|herring|eel|peixe|truta|salmao|arenque|enguia)\b/;
const DESSERTS = /\b(dessert|cake|cookie|sweet|candy|pudding|pastry|sobremesa|bolo|biscoito|doce|pudim|confeito)\b/;
const SOUPS = /\b(soup|broth|sopa|caldo)\b/;
const PIES = /\b(pie|tart|torta|empada)\b/;
const FOOD_INGREDIENTS = /\b(sugar|grain|salt|vegetable oil|vinegar|honey|saffron|spice|acucar|graos|sal|oleo vegetal|vinagre|mel|acafrao|especiaria)\b/;

const ELIXIR_GROUPS = Object.freeze([
  group("antidote", /\b(antidote|antidoto)\b/, /\b(funciona como um antidoto|works as an antidote)\b/),
  group("poison", /\b(poison|veneno|drone dew|orvalho do zangao|choking spores|esporos sufocantes)\b/),
  group("healing", /\b(herbal cure|cura herbal|elixir of life|elixir da vida|holy water|agua benta|healing spider|aranha curativa)\b/),
  group("bomb", /\b(bomb|mine|thunder ball|flash powder|bomba|mina|esfera trovao|po luminoso)\b/),
  group("alchemical-ammunition", /\b(homing arrow|stun bolt|flecha certeira|raio atordoante)\b/),
  group("alchemical-creature", /\b(homunculus|homunculo|thorn beasties|bestas espinhosas)\b/),
  group("drug", /\b(spirit friend|amigo espiritual|wild chew|goma selvagem|dream snuff|rape dos sonhos|blue drops|gotas azuis|terato|truth serum|soro da verdade)\b/),
  group("transformative", /\b(transform|transformacao|purple sap|seiva purpura)\b/)
]);

export function classifyWorldItem(item, { folderPath = worldFolderPath(item?.folder) } = {}) {
  const type = String(item?.type ?? "");
  const originalName = item?.flags?.babele?.originalName ?? item?.flags?.babele?.originalPayload?.name ?? "";
  const name = normalize(`${item?.name ?? ""} ${originalName}`);
  const description = normalize(item?.system?.description ?? item?.flags?.babele?.originalPayload?.description ?? "");
  const folder = normalize(Array.isArray(folderPath) ? folderPath.join(" / ") : folderPath);
  const tags = new Set();
  const basis = new Set(["system-type"]);

  const documentCategory = typeTag(type);
  if (documentCategory) addCategory(tags, documentCategory);
  if (SHOP_ITEM_TYPES.has(type)) tags.add("shop");
  if (type === "weapon") classifyWeapon({ item, name, tags, basis });
  if (type === "armor") classifyArmor(item, tags);
  if (type === "equipment") classifyEquipment({ name, description, folder, tags, basis });
  classifyArtifacts({ item, folder, tags, basis });
  applyOfficialItemAdjustment(item, tags, basis);
  return freezeTaxonomy(tags, basis, type);
}

export function itemHasTaxonomyTag(item, tag) {
  const taxonomy = resolveItemTaxonomy(item);
  return Array.isArray(taxonomy?.tags) && taxonomy.tags.includes(tag);
}

export function resolveItemTaxonomy(item) {
  const saved = item?.flags?.[MODULE_ID]?.itemTaxonomy;
  const automatic = saved?.version === ITEM_TAXONOMY_VERSION ? saved : classifyWorldItem(item);
  const override = normalizeCategoryOverrides(item?.flags?.[MODULE_ID]?.itemTaxonomyOverride);
  if (!override) return automatic;
  const tags = new Set(override.mode === "replace" ? [] : (automatic.tags ?? []));
  for (const category of override.categories) addCategory(tags, category);
  const primary = override.mode === "extend"
    ? override.categories[0]
    : PRIMARY_PRIORITY.find((tag) => tags.has(tag)) ?? automatic.primary;
  return Object.freeze({
    ...automatic,
    primary,
    tags: Object.freeze([...tags].sort()),
    basis: Object.freeze([...new Set([...(automatic.basis ?? []), "manual-override"])].sort()),
    automaticPrimary: automatic.primary,
    manualCategories: Object.freeze([...override.categories]),
    overrideMode: override.mode,
    overridden: true
  });
}

export function normalizeCategoryOverrides(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const categories = normalizeCategoryList(value.categories);
    if (value.mode === "replace" || Array.isArray(value.categories)) {
      return Object.freeze({ mode: "replace", categories: Object.freeze(categories) });
    }
  }
  const legacy = normalizeCategoryOverride(value);
  return legacy
    ? Object.freeze({ mode: "extend", categories: Object.freeze([legacy]) })
    : null;
}

export async function setItemTaxonomyCategories(item, categories = null) {
  if (!item || item.documentName !== "Item") throw new TypeError("A world Item is required.");
  if (categories === null) {
    await item.unsetFlag(MODULE_ID, "itemTaxonomyOverride");
  } else {
    await item.setFlag(MODULE_ID, "itemTaxonomyOverride", {
      version: ITEM_TAXONOMY_OVERRIDE_VERSION,
      mode: "replace",
      categories: normalizeCategoryList(categories)
    });
  }
  const taxonomy = resolveItemTaxonomy(item);
  globalThis.Hooks?.callAll?.(`${MODULE_ID}.itemTaxonomyUpdated`, {
    itemId: item.id ?? item._id,
    categories: taxonomy.tags,
    manual: categories !== null
  });
  return taxonomy;
}

export async function synchronizeWorldItemTaxonomy({
  items = globalThis.game?.items,
  user = globalThis.game?.user,
  ItemClass = globalThis.Item,
  batchSize = 100
} = {}) {
  if (!user?.isGM || typeof ItemClass?.updateDocuments !== "function") return { scanned: 0, updated: 0, skipped: true };
  const documents = collectionValues(items);
  const updates = [];
  for (const item of documents) {
    const taxonomy = classifyWorldItem(item);
    const previous = item?.flags?.[MODULE_ID]?.itemTaxonomy;
    if (stableTaxonomy(previous) === stableTaxonomy(taxonomy)) continue;
    updates.push({ _id: item.id ?? item._id, [ITEM_TAXONOMY_FLAG]: taxonomy });
  }
  for (let index = 0; index < updates.length; index += batchSize) await ItemClass.updateDocuments(updates.slice(index, index + batchSize));
  if (updates.length) {
    globalThis.Hooks?.callAll?.(`${MODULE_ID}.itemTaxonomyUpdated`, {
      scanned: documents.length, updated: updates.length, version: ITEM_TAXONOMY_VERSION
    });
  }
  return { scanned: documents.length, updated: updates.length, skipped: false };
}

function classifyWeapon({ item, name, tags, basis }) {
  if (SIEGE_WEAPONS.test(name)) {
    addCategory(tags, "siege-weapons");
    basis.add("official-name");
    return;
  }
  if (THROWING_WEAPON_NAMES.test(name)) {
    addCategory(tags, "throwing-weapons");
    basis.add("official-name");
    return;
  }
  const reference = normalize(item?.system?.reference);
  const category = ({
    "1handed": "one-handed-weapons", heavy: "heavy-weapons", long: "long-weapons",
    ranged: CROSSBOWS.test(name) ? "crossbows" : BOWS.test(name) ? "bows" : "projectile-weapons",
    shield: "shields", short: "short-weapons", thrown: "throwing-weapons",
    unarmed: "unarmed-attacks"
  })[reference];
  addCategory(tags, category ?? "melee-weapons");
  basis.add("system-data");
}

function classifyArmor(item, tags) {
  const protection = normalize(item?.system?.baseProtection);
  if (protection === "1d4") addCategory(tags, "light-armor");
  else if (protection === "1d6") addCategory(tags, "medium-armor");
  else if (protection === "1d8") addCategory(tags, "heavy-armor");
  else addCategory(tags, "armor");
  if (item?.system?.impeding === 0) tags.add("flexible-armor");
}

function classifyEquipment({ name, description, folder, tags, basis }) {
  addCategory(tags, "equipment");
  const officialFoodFolder = /comidas e bebidas|food and drink/.test(folder);
  const officialElixirFolder = /[ae]lixires alquimicos|alchemical elixirs/.test(folder);
  if (officialElixirFolder) {
    addCategory(tags, "alchemical-elixirs");
    add(tags, "consumable", "alchemical");
    basis.add("official-folder");
  }
  for (const { tag, namePattern, descriptionPattern } of ELIXIR_GROUPS) {
    const nameMatch = namePattern.test(name);
    const descriptionMatch = descriptionPattern?.test(description) ?? false;
    if (!nameMatch && !descriptionMatch) continue;
    addCategory(tags, "alchemical-elixirs");
    add(tags, "consumable", "alchemical", tag);
    basis.add(nameMatch ? "official-name" : "official-description");
  }
  if (officialFoodFolder) {
    addCategory(tags, "food-and-drink");
    add(tags, "consumable", "prepared-food");
    basis.add("official-folder");
  }
  classifyFood(name, tags, officialFoodFolder);

  const nameRules = [
    [AMMUNITION, "arrows"], [SHIELD_EQUIPMENT, "shields"],
    [CONSTRUCTIONS, "constructions"], [TRANSPORT, "transport"],
    [FARM_ANIMALS, "farm-animals"], [CLOTHING, "clothing"], [CONTAINERS, "containers"],
    [SERVICES, "services"], [EXPENSES, "expenses"], [INCOME, "income"],
    [SPECIALIZED_TOOLS, "specialized-tools"], [TOOLS, "tools"], [TRAPS, "traps"],
    [TOBACCO_UTENSILS, "tobacco-utensils"], [TOBACCO_TYPES, "tobacco-types"],
    [MUSICAL_INSTRUMENTS, "musical-instruments"], [TRADE_GOODS, "trade-goods"],
    [SURVIVAL, "survival-items"]
  ];
  for (const [pattern, category] of nameRules) {
    if (!pattern.test(name)) continue;
    addCategory(tags, category);
    basis.add("official-name");
  }
  if (FOOD_INGREDIENTS.test(name)) tags.add("ingredient");
  if (/curiosidades|curiosities/.test(folder)) {
    addCategory(tags, "curiosities");
    basis.add("official-folder");
  }
  if (/armadilhas|traps/.test(folder)) {
    addCategory(tags, "traps");
    basis.add("official-folder");
  }
}

function classifyFood(name, tags, isFood) {
  if (!isFood) return;
  addCategory(tags, "food-and-drink");
  tags.add("consumable");
  const matches = [
    [TEAS, "teas"], [BEVERAGES, "beverages"], [MEAT, "meat"], [STEWS, "stews"],
    [PORRIDGES, "porridges"], [FISH, "fish"], [DESSERTS, "desserts"],
    [SOUPS, "soups"], [PIES, "pies"]
  ];
  for (const [pattern, category] of matches) if (pattern.test(name)) addCategory(tags, category);
  if (/\b(ale|beer|brew|wine|must|fermented|mead|cider|cerveja|vinho|fermentad|hidromel|sidra)\b/.test(name)) tags.add("alcoholic");
  else if (tags.has("beverages")) tags.add("non-alcoholic");
  if (FOOD_INGREDIENTS.test(name)) tags.add("ingredient");
}

function classifyArtifacts({ item, folder, tags, basis }) {
  if (/artefatos superiores|greater artifacts|superior artifacts/.test(folder)) {
    // Mystical Treasures (GMG Table 32) and Greater Artifacts (Table 33) are
    // separate merchandise tables. Greater Artifacts therefore belong only
    // to the broad Artifact category unless their own rules add another one.
    addCategory(tags, "artifacts");
    tags.add("mystical");
    basis.add("official-folder");
  } else if (/artefatos|artifacts/.test(folder) || item?.system?.isArtifact === true) {
    addCategory(tags, "minor-artifacts");
    tags.add("mystical");
    basis.add(/artefatos|artifacts/.test(folder) ? "official-folder" : "system-data");
  }
}

function applyOfficialItemAdjustment(item, tags, basis) {
  const adjustment = officialItemCategoryAdjustment(item);
  if (!adjustment) return;
  for (const category of adjustment.addCategories ?? []) addCategory(tags, category);
  for (const tag of adjustment.addTags ?? []) tags.add(tag);
  // Explicit exclusions are applied last. This matters for translated names
  // such as Vesa (which is non-alcoholic) and for official mechanical variants
  // whose native fields are broader than the table entry.
  for (const category of adjustment.removeCategories ?? []) tags.delete(canonicalTaxonomyCategoryId(category));
  for (const tag of adjustment.removeTags ?? []) tags.delete(tag);
  basis.add(adjustment.source ?? "official-item");
}

function freezeTaxonomy(tags, basis, type) {
  return Object.freeze({
    version: ITEM_TAXONOMY_VERSION,
    primary: PRIMARY_PRIORITY.find((tag) => tags.has(tag)) ?? typeTag(type) ?? "item",
    tags: Object.freeze([...tags].filter(Boolean).sort()),
    basis: Object.freeze([...basis].sort())
  });
}

function addCategory(set, category) {
  const canonical = canonicalTaxonomyCategoryId(category);
  if (!canonical || !CATEGORY_SET.has(canonical)) return;
  for (const ancestor of taxonomyCategoryAncestors(canonical)) set.add(ancestor);
  set.add(canonical);
}

function normalizeCategoryOverride(value) {
  const raw = canonicalTaxonomyCategoryId(value);
  if (CATEGORY_SET.has(raw)) return raw;
  const migrated = LEGACY_CATEGORY_ALIASES[raw];
  return CATEGORY_SET.has(migrated) ? migrated : null;
}

function normalizeCategoryList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((category) => normalizeCategoryOverride(category))
    .filter(Boolean))]
    .sort();
}

function typeTag(type) {
  return (({ mysticalPower: "mystical-power" })[type] ?? normalize(type).replace(/\s+/g, "-")) || null;
}

function worldFolderPath(folder) {
  const names = [];
  const visited = new Set();
  let current = folder;
  while (current && !visited.has(current) && names.length < 24) {
    visited.add(current);
    names.unshift(current.name ?? "");
    current = current.folder ?? current.parent;
  }
  return names;
}

function stableTaxonomy(value) {
  if (!value) return "";
  return JSON.stringify({
    version: value.version, primary: value.primary,
    tags: [...(value.tags ?? [])].sort(), basis: [...(value.basis ?? [])].sort()
  });
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Object.values(collection);
}

function add(set, ...values) { for (const value of values) if (value) set.add(value); }
function group(tag, namePattern, descriptionPattern = null) { return Object.freeze({ tag, namePattern, descriptionPattern }); }
function normalize(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
