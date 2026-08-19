import { MODULE_ID } from "../constants.mjs";
import { OFFICIAL_CONTENT_ORIGIN_IDS } from "../data/official-content-origin-ids.mjs";

export const UNKNOWN_CONTENT_ORIGIN = "unknown";
export const CONTENT_ORIGIN_FLAG = `flags.${MODULE_ID}.origin`;

export const CONTENT_ORIGINS = Object.freeze([
  origin("core-rulebook", "SYMBAROUMHUD.CompendiumBrowser.Origins.CoreRulebook", [
    "livro basico", "core rulebook", "core rules", "crb"
  ]),
  origin("advanced-players-guide", "SYMBAROUMHUD.CompendiumBrowser.Origins.AdvancedPlayersGuide", [
    "guia avancado", "guia avancado do jogador", "advanced players guide", "apg"
  ]),
  origin("monster-codex", "SYMBAROUMHUD.CompendiumBrowser.Origins.MonsterCodex", [
    "codice de monstros", "monster codex"
  ]),
  origin("game-masters-guide", "SYMBAROUMHUD.CompendiumBrowser.Origins.GameMastersGuide", [
    "guia do mestre", "guia do mestre de jogo", "game masters guide", "gmg"
  ]),
  origin("adventure-collection-1", "SYMBAROUMHUD.CompendiumBrowser.Origins.AdventureCollectionOne", [
    "conjunto de aventuras 1", "coletanea de aventuras", "adventure collection"
  ]),
  origin("adventure-pack-2", "SYMBAROUMHUD.CompendiumBrowser.Origins.AdventurePackTwo", [
    "pacote de aventuras 2", "adventure pack 2"
  ]),
  origin("adventure-locations", "SYMBAROUMHUD.CompendiumBrowser.Origins.AdventureLocations", [
    "locais de aventura", "adventure locations"
  ]),
  origin("wrath-of-the-warden", "SYMBAROUMHUD.CompendiumBrowser.Origins.WrathOfTheWarden", [
    "a furia do guardiao", "wrath of the warden", "wotw"
  ])
]);

export const CONTENT_ORIGIN_PACKS = Object.freeze([
  pack("symbaroum-corerules.symbaroum-core-rules", "core-rulebook", { splitAdvanced: true }),
  pack("symbaroum-gmg.symbaroum-gmg", "game-masters-guide"),
  pack("symbaroum-monstercodex.symbaroum-monster-codex", "monster-codex"),
  pack("symbaroum-adventure-collection.symbaroum-adventure-collection", "adventure-collection-1"),
  pack("symbaroum-tot-wotw.symbaroum-wrath-of-the-warden", "wrath-of-the-warden", { splitAdvanced: true })
]);

const ORIGIN_BY_ID = new Map(CONTENT_ORIGINS.map((entry) => [entry.id, entry]));
const ORIGIN_ALIASES = new Map(CONTENT_ORIGINS.flatMap((entry) => [
  [normalize(entry.id), entry.id],
  ...entry.aliases.map((alias) => [normalize(alias), entry.id])
]));
const PACK_BY_COLLECTION = new Map(CONTENT_ORIGIN_PACKS.map((entry) => [entry.collection, entry]));

/**
 * Builds a deterministic document-id index from the official Adventure packs.
 * Imported Adventure documents retain their IDs, so this also classifies their
 * world copies without relying on translated names or copyrighted descriptions.
 */
export async function buildContentOriginIndex({ packs = globalThis.game?.packs } = {}) {
  const index = staticContentOriginIndex();
  for (const descriptor of CONTENT_ORIGIN_PACKS) {
    const sourcePack = collectionGet(packs, descriptor.collection);
    if (!sourcePack) continue;
    let adventures;
    try {
      adventures = typeof sourcePack.getDocuments === "function"
        ? await sourcePack.getDocuments()
        : collectionValues(sourcePack.documents ?? sourcePack);
    } catch (_error) {
      continue;
    }
    for (const adventure of collectionValues(adventures)) {
      indexAdventureContent(index, adventure, descriptor);
    }
  }
  return index;
}

export function staticContentOriginIndex() {
  const index = new Map();
  for (const [originId, keys] of Object.entries(OFFICIAL_CONTENT_ORIGIN_IDS)) {
    for (const key of keys) index.set(key, originId);
  }
  return index;
}

export function indexAdventureContent(index, adventure, descriptor) {
  const data = typeof adventure?.toObject === "function" ? adventure.toObject() : adventure;
  if (!data) return index;
  const folders = collectionValues(data.folders);
  const folderById = new Map(folders.map((folder) => [documentId(folder), folder]).filter(([id]) => id));

  for (const [documentName, documents] of [["Item", data.items], ["Actor", data.actors]]) {
    for (const document of collectionValues(documents)) {
      const id = documentId(document);
      if (!id) continue;
      const folderNames = folderAncestry(document.folder, folderById);
      const inferred = descriptor.splitAdvanced && isAdvancedGuideFolder(folderNames)
        ? "advanced-players-guide"
        : descriptor.origin;
      const key = contentOriginIndexKey(documentName, id);
      if (!index.has(key)) index.set(key, inferred);
      const sourceDocumentId = compendiumDocumentId(
        document?._stats?.compendiumSource ?? document?.flags?.core?.sourceId
      );
      if (sourceDocumentId) {
        const sourceKey = contentOriginIndexKey(documentName, sourceDocumentId);
        if (!index.has(sourceKey)) index.set(sourceKey, inferred);
      }
    }
  }
  return index;
}

export function resolveContentOrigin(document, {
  index = new Map(),
  sourceId = "",
  folderPath = ""
} = {}) {
  const explicit = normalizeContentOrigin(document?.flags?.[MODULE_ID]?.origin);
  if (explicit) return explicit;

  const id = documentId(document);
  const documentName = document?.documentName ?? inferDocumentName(document);
  const indexed = id ? index.get(contentOriginIndexKey(documentName, id)) : null;
  if (ORIGIN_BY_ID.has(indexed)) return indexed;

  const folderOrigin = inferOriginFromFolder(folderPath || worldFolderPath(document?.folder));
  if (folderOrigin) return folderOrigin;

  const sourceOrigin = inferOriginFromSource(sourceId || document?._stats?.compendiumSource || document?.flags?.core?.sourceId);
  return sourceOrigin || UNKNOWN_CONTENT_ORIGIN;
}

export function normalizeContentOrigin(value) {
  if (!value) return null;
  return ORIGIN_ALIASES.get(normalize(value)) ?? null;
}

export function contentOriginDefinition(id) {
  return ORIGIN_BY_ID.get(id) ?? {
    id: UNKNOWN_CONTENT_ORIGIN,
    label: "SYMBAROUMHUD.CompendiumBrowser.Origins.Unknown",
    aliases: Object.freeze([])
  };
}

export function contentOriginIndexKey(documentName, id) {
  return `${documentName || "Document"}:${id}`;
}

export function inferOriginFromSource(sourceId) {
  const value = String(sourceId ?? "");
  for (const descriptor of CONTENT_ORIGIN_PACKS) {
    if (value === descriptor.collection || value.includes(descriptor.collection)) return descriptor.origin;
  }
  return null;
}

export function inferOriginFromFolder(folderPath) {
  const value = normalize(Array.isArray(folderPath) ? folderPath.join(" / ") : folderPath);
  if (!value) return null;
  if (/\bapg\b|guia avancado|advanced player/.test(value)) return "advanced-players-guide";
  if (/monster codex|codice de monstros/.test(value)) return "monster-codex";
  if (/\bgmg\b|game master|guia do mestre/.test(value)) return "game-masters-guide";
  if (/adventure collection|coletanea de aventuras|conjunto de aventuras 1/.test(value)) return "adventure-collection-1";
  if (/adventure pack 2|pacote de aventuras 2/.test(value)) return "adventure-pack-2";
  if (/adventure locations|locais de aventura/.test(value)) return "adventure-locations";
  if (/wrath of the warden|furia do guardiao/.test(value)) return "wrath-of-the-warden";
  if (/core rules|core rulebook|livro basico/.test(value)) return "core-rulebook";
  return null;
}

function origin(id, label, aliases) {
  return Object.freeze({ id, label, aliases: Object.freeze(aliases) });
}

function pack(collection, originId, options = {}) {
  return Object.freeze({ collection, origin: originId, splitAdvanced: Boolean(options.splitAdvanced) });
}

function isAdvancedGuideFolder(folderNames) {
  return folderNames.some((name) => /\bapg\b|advanced player|guia avancado/i.test(String(name ?? "")));
}

function folderAncestry(folderValue, folderById) {
  const names = [];
  const visited = new Set();
  let id = referenceId(folderValue);
  while (id && !visited.has(id)) {
    visited.add(id);
    const folder = folderById.get(id);
    if (!folder) break;
    names.unshift(folder.name ?? "");
    id = referenceId(folder.folder);
  }
  return names;
}

function worldFolderPath(folder) {
  const names = [];
  const visited = new Set();
  let current = folder;
  while (current && !visited.has(current) && names.length < 16) {
    visited.add(current);
    names.unshift(current.name ?? "");
    current = current.folder;
  }
  return names;
}

function documentId(document) {
  return document?.id ?? document?._id ?? null;
}

function referenceId(value) {
  return typeof value === "string" ? value : documentId(value);
}

function compendiumDocumentId(value) {
  const match = String(value ?? "").match(/(?:^|\.)([A-Za-z0-9]{16})$/);
  return match?.[1] ?? null;
}

function inferDocumentName(document) {
  if (document?.type === "monster" || document?.prototypeToken || document?.system?.attributes) return "Actor";
  return "Item";
}

function collectionGet(collection, key) {
  if (!collection) return null;
  if (typeof collection.get === "function") return collection.get(key);
  return collection[key] ?? null;
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Object.values(collection);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
