import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVANCED_PROFESSION_RULES,
  ARCHETYPAL_ABILITY_RULES,
  PROFESSION_ABILITY_RULES,
  archetypalAbilityRule,
  countsTowardArchetype,
  professionAbilityRule,
  professionExclusiveItemRules
} from "../scripts/data/advanced-character-options.mjs";
import { CORE_MYSTICAL_TRADITIONS, coreMysticalTradition } from "../scripts/data/core-mystical-traditions.mjs";

const item = (name, reference = "") => ({ name, system: { reference } });

test("the Advanced Player's Guide traditions and mystical practice are part of the creator catalogue", () => {
  assert.equal(CORE_MYSTICAL_TRADITIONS.length, 8);
  assert.equal(coreMysticalTradition(item("Canto do Troll"))?.id, "trollSinging");
  assert.equal(coreMysticalTradition(item("Magia do Cajado"))?.id, "staffMagic");
  assert.equal(coreMysticalTradition(item("Simbolismo"))?.id, "symbolism");
  assert.equal(coreMysticalTradition(item("Criar Artefatos"))?.kind, "practice");
  assert.equal(coreMysticalTradition(item("Staff Magic"))?.profession, true);
});

test("every archetype exposes its Advanced Guide eligibility rule", () => {
  assert.deepEqual(ARCHETYPAL_ABILITY_RULES.map(({ archetype }) => archetype), [
    "hunter", "warrior", "rogue", "mystic"
  ]);
  assert.equal(archetypalAbilityRule(item("Instinto do Caçador"))?.minimum, 3);
  assert.equal(archetypalAbilityRule(item("Façanha de Força"))?.archetype, "warrior");
  assert.equal(archetypalAbilityRule(item("Reflexos Rápidos"))?.archetype, "rogue");
  assert.equal(archetypalAbilityRule(item("Dom Poderoso"))?.archetype, "mystic");
  assert.equal(countsTowardArchetype(item("Alquimia"), ARCHETYPAL_ABILITY_RULES[0]), true);
});

test("profession-exclusive Abilities are identified independently of language", () => {
  assert.equal(ADVANCED_PROFESSION_RULES.length, 17);
  assert.equal(PROFESSION_ABILITY_RULES.length, 7);
  assert.equal(professionAbilityRule(item("Combate Ágil"))?.profession, "ironSworn");
  assert.equal(professionAbilityRule(item("Staff Magic"))?.profession, "staffMage");
  assert.equal(professionAbilityRule(item("Pirotecnia"))?.profession, "queensSpy");
});

test("profession-exclusive Powers, Rituals, Traits, and Boons are covered", () => {
  assert.deepEqual(professionExclusiveItemRules({ ...item("Cajado Projétil"), type: "mysticalPower" }).map(({ id }) => id), ["staffMage"]);
  assert.deepEqual(professionExclusiveItemRules({ ...item("Servos Gêmeos"), type: "ritual" }).map(({ id }) => id), ["pyromancer"]);
  assert.deepEqual(professionExclusiveItemRules({ ...item("Besta Companheira"), type: "boon" }).map(({ id }) => id), ["bloodWader"]);
  assert.deepEqual(professionExclusiveItemRules({ ...item("Espíritos Atormentadores"), type: "mysticalPower" }).map(({ id }) => id), ["spiritualist", "necromancer"]);
});
