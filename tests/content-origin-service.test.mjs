import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_ORIGINS,
  buildContentOriginIndex,
  contentOriginIndexKey,
  inferOriginFromFolder,
  normalizeContentOrigin,
  resolveContentOrigin,
  staticContentOriginIndex
} from "../scripts/services/content-origin-service.mjs";

test("origin catalog covers every book supplied for classification", () => {
  assert.deepEqual(CONTENT_ORIGINS.slice(0, 7).map(({ id }) => id), [
    "core-rulebook",
    "advanced-players-guide",
    "monster-codex",
    "game-masters-guide",
    "adventure-collection-1",
    "adventure-pack-2",
    "adventure-locations"
  ]);
});

test("bundled official ids classify content even when source packs are hidden", async () => {
  const staticIndex = staticContentOriginIndex();
  const indexWithoutPacks = await buildContentOriginIndex({ packs: new Map() });
  assert.ok(staticIndex.size > 1_000);
  assert.equal(indexWithoutPacks.size, staticIndex.size);
  assert.ok([...staticIndex.values()].includes("core-rulebook"));
  assert.ok([...staticIndex.values()].includes("advanced-players-guide"));
  assert.ok([...staticIndex.values()].includes("monster-codex"));
});

test("core Adventure pack separates Core Rulebook from APG folders", async () => {
  const adventure = {
    folders: [
      { _id: "core", name: "Symbaroum - Items", folder: null },
      { _id: "apg", name: "Symbaroum - APG - Items", folder: null },
      { _id: "apgAbilities", name: "APG - Abilities", folder: "apg" }
    ],
    items: [
      { _id: "berserker", name: "Berserker", folder: "core", type: "ability" },
      { _id: "rapidFire", name: "Rapid Fire", folder: "apgAbilities", type: "ability" }
    ],
    actors: []
  };
  const packs = new Map([["symbaroum-corerules.symbaroum-core-rules", {
    getDocuments: async () => [adventure]
  }]]);
  const index = await buildContentOriginIndex({ packs });

  assert.equal(index.get(contentOriginIndexKey("Item", "berserker")), "core-rulebook");
  assert.equal(index.get(contentOriginIndexKey("Item", "rapidFire")), "advanced-players-guide");
});

test("official system-compendium ids inherit the Adventure document origin", async () => {
  const adventure = {
    folders: [{ _id: "apg", name: "APG - Powers", folder: null }],
    items: [{
      _id: "worldPower",
      folder: "apg",
      type: "mysticalPower",
      _stats: { compendiumSource: "Compendium.symbaroum.symbaroumpowersen.A8E7vSsrclAldlFi" }
    }],
    actors: []
  };
  const packs = new Map([["symbaroum-corerules.symbaroum-core-rules", {
    getDocuments: async () => [adventure]
  }]]);
  const index = await buildContentOriginIndex({ packs });
  assert.equal(index.get(contentOriginIndexKey("Item", "A8E7vSsrclAldlFi")), "advanced-players-guide");
});

test("earlier publication keeps precedence when an adventure repeats a document id", async () => {
  const packs = new Map([
    ["symbaroum-corerules.symbaroum-core-rules", {
      getDocuments: async () => [{ items: [{ _id: "shared", type: "ritual" }], actors: [], folders: [] }]
    }],
    ["symbaroum-adventure-collection.symbaroum-adventure-collection", {
      getDocuments: async () => [{ items: [{ _id: "shared", type: "ritual" }], actors: [], folders: [] }]
    }]
  ]);
  const index = await buildContentOriginIndex({ packs });
  assert.equal(index.get(contentOriginIndexKey("Item", "shared")), "core-rulebook");
});

test("an explicit document tag overrides automatic classification", () => {
  const document = {
    id: "custom",
    documentName: "Item",
    flags: { "symbaroum-hud": { origin: "Guia Avançado do Jogador" } }
  };
  const index = new Map([[contentOriginIndexKey("Item", "custom"), "core-rulebook"]]);
  assert.equal(resolveContentOrigin(document, { index }), "advanced-players-guide");
});

test("resolver falls back to folder, source pack, and explicit unknown tag", () => {
  assert.equal(inferOriginFromFolder("Symbaroum / Códice de Monstros / Traços"), "monster-codex");
  assert.equal(resolveContentOrigin({ id: "gmg", documentName: "Item" }, {
    sourceId: "Compendium.symbaroum-gmg.symbaroum-gmg.Adventure.xyz"
  }), "game-masters-guide");
  assert.equal(resolveContentOrigin({ id: "homebrew", documentName: "Item" }), "unknown");
});

test("origin aliases are accent-insensitive", () => {
  assert.equal(normalizeContentOrigin("Livro Básico"), "core-rulebook");
  assert.equal(normalizeContentOrigin("APG"), "advanced-players-guide");
  assert.equal(normalizeContentOrigin("Locais de Aventura"), "adventure-locations");
});
