const trait = (id, type, icon, aliases = []) => Object.freeze({
  id,
  type,
  icon,
  aliases: Object.freeze(aliases),
  name: `SYMBAROUMHUD.CharacterCreator.Race.Traits.${id}.Name`,
  description: `SYMBAROUMHUD.CharacterCreator.Race.Traits.${id}.Description`
});

export const CORE_RACE_TRAITS = Object.freeze({
  contacts: trait("contacts", "boon", "fa-address-book", ["Contatos", "Contacts"]),
  privileged: trait("privileged", "boon", "fa-crown", ["Privilegiado", "Privileged"]),
  bushcraft: trait("bushcraft", "boon", "fa-tree", ["Mateiro", "Bushcraft"]),
  longLived: trait("longLived", "boon", "fa-hourglass-half", ["Vida Longa", "Longevo", "Long-lived"]),
  shortLived: trait("shortLived", "burden", "fa-hourglass-end", ["Vida Curta", "De Vida Curta", "Short-lived"]),
  pariah: trait("pariah", "burden", "fa-person-circle-xmark", ["Pária", "Pariah"]),
  shapeshifter: trait("shapeshifter", "trait", "fa-masks-theater", ["Metamorfo", "Shapeshifter"]),
  survivalInstinct: trait("survivalInstinct", "trait", "fa-heart-pulse", ["Instinto de Sobrevivência", "Survival Instinct"]),
  robust: trait("robust", "trait", "fa-person", ["Robusto", "Robust"])
});

const race = (id, icon, required, choice = [], optional = []) => Object.freeze({
  id,
  icon,
  required: Object.freeze(required),
  choice: Object.freeze(choice),
  optional: Object.freeze(optional),
  name: `SYMBAROUMHUD.CharacterCreator.Race.Entries.${id}.Name`,
  summary: `SYMBAROUMHUD.CharacterCreator.Race.Entries.${id}.Summary`
});

export const CORE_RACES = Object.freeze([
  race("ambrian", "fa-crown", [], ["contacts", "privileged"]),
  race("barbarian", "fa-tree", [], ["contacts", "bushcraft"]),
  race("changeling", "fa-masks-theater", ["longLived"], [], ["shapeshifter"]),
  race("goblin", "fa-face-grin-wide", ["shortLived", "pariah"], [], ["survivalInstinct"]),
  race("ogre", "fa-person", ["pariah", "longLived"], [], ["robust"])
]);

export function coreRace(id) {
  return CORE_RACES.find((entry) => entry.id === id) ?? null;
}

export function coreRaceTrait(id) {
  return CORE_RACE_TRAITS[id] ?? null;
}
