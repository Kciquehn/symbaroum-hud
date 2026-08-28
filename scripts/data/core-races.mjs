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
  robust: trait("robust", "trait", "fa-person", ["Robusto", "Robust"]),
  wisdomOfAges: trait("wisdomOfAges", "ability", "fa-brain", ["Sabedoria das Eras", "Wisdom of the Ages"]),
  naturalHeritage: trait("naturalHeritage", "trait", "fa-mountain", [
    "Herança Natural", "Natural Heritage", "Earth bound", "Earthbound"
  ]),
  absoluteMemory: trait("absoluteMemory", "boon", "fa-bookmark", ["Memória Absoluta", "Absolute Memory"]),
  retribution: trait("retribution", "mysticalPower", "fa-hand-sparkles", ["Retribuição", "Retribution"]),
  armored: trait("armored", "trait", "fa-shield", ["Armadurado", "Armored"]),
  naturalWeapon: trait("naturalWeapon", "trait", "fa-paw", ["Arma Natural", "Natural Weapon"]),
  regeneration: trait("regeneration", "trait", "fa-heart-circle-plus", ["Regeneração", "Regeneration"]),
  undead: trait("undead", "trait", "fa-skull", ["Morto-Vivo", "Undead"]),
  tombCold: trait("tombCold", "trait", "fa-snowflake", ["Frio da Tumba", "Grave Cold", "Cold of the Grave"]),
  terrify: trait("terrify", "trait", "fa-face-frown-open", ["Aterrorizar", "Terrify"])
});

const LORE_TITLES = Object.freeze({
  history: "SYMBAROUMHUD.CharacterCreator.Race.HistoryAndCulture",
  names: "SYMBAROUMHUD.CharacterCreator.Race.Names",
  surnames: "SYMBAROUMHUD.CharacterCreator.Race.Surnames"
});

const LORE_FACT_LABELS = Object.freeze({
  male: "SYMBAROUMHUD.CharacterCreator.Race.MaleNames",
  female: "SYMBAROUMHUD.CharacterCreator.Race.FemaleNames",
  examples: "SYMBAROUMHUD.CharacterCreator.Race.NameExamples"
});

const loreSection = (raceId, sectionId, paragraphCount, factIds = []) => Object.freeze({
  id: sectionId,
  title: LORE_TITLES[sectionId],
  paragraphs: Object.freeze(Array.from({ length: paragraphCount }, (_value, index) =>
    `SYMBAROUMHUD.CharacterCreator.Race.Entries.${raceId}.Lore.${sectionId}.Paragraph${index + 1}`
  )),
  facts: Object.freeze(factIds.map((factId) => Object.freeze({
    label: LORE_FACT_LABELS[factId],
    value: `SYMBAROUMHUD.CharacterCreator.Race.Entries.${raceId}.Lore.${sectionId}.${factId}`
  })))
});

const race = (id, icon, art, artPosition, required, choice = [], optional = [], lore = []) => Object.freeze({
  id,
  icon,
  art,
  artPosition,
  required: Object.freeze(required),
  choice: Object.freeze(choice),
  optional: Object.freeze(optional),
  lore: Object.freeze(lore),
  name: `SYMBAROUMHUD.CharacterCreator.Race.Entries.${id}.Name`,
  summary: `SYMBAROUMHUD.CharacterCreator.Race.Entries.${id}.Summary`
});

export const CORE_RACES = Object.freeze([
  race("ambrian", "fa-crown", "assets/races/ambrian.webp", "50% 30%", [], ["contacts", "privileged"], [], [
    loreSection("ambrian", "history", 5),
    loreSection("ambrian", "names", 1, ["male", "female"]),
    loreSection("ambrian", "surnames", 1)
  ]),
  race("barbarian", "fa-tree", "assets/races/barbarian.webp", "50% 16%", [], ["contacts", "bushcraft"], [], [
    loreSection("barbarian", "history", 5),
    loreSection("barbarian", "names", 1, ["male", "female"])
  ]),
  race("changeling", "fa-masks-theater", "assets/races/changeling.webp", "50% 8%", ["longLived"], [], ["shapeshifter"], [
    loreSection("changeling", "history", 3),
    loreSection("changeling", "names", 1, ["male", "female"])
  ]),
  race("goblin", "fa-face-grin-wide", "assets/races/goblin.webp", "50% 24%", ["shortLived", "pariah"], [], ["survivalInstinct"], [
    loreSection("goblin", "history", 4),
    loreSection("goblin", "names", 1, ["male", "female"])
  ]),
  race("ogre", "fa-person", "assets/races/goblin-ogre.webp", "38% 32%", ["pariah", "longLived"], [], ["robust"], [
    loreSection("ogre", "history", 3),
    loreSection("ogre", "names", 1, ["examples"])
  ]),
  race("elf", "fa-leaf", "modules/symbaroum-corerules/images/pictures/summer-elf.webp", "50% 24%", ["longLived", "pariah"], [], ["wisdomOfAges"], [
    loreSection("elf", "history", 3),
    loreSection("elf", "names", 1, ["male", "female"])
  ]),
  race("dwarf", "fa-gem", "modules/symbaroum-corerules/images/pictures/guard-warrior.webp", "50% 22%", ["naturalHeritage", "absoluteMemory", "pariah"], [], ["retribution"], [
    loreSection("dwarf", "history", 3),
    loreSection("dwarf", "names", 1, ["examples"])
  ]),
  race("abductedHuman", "fa-people-arrows-left-right", "modules/symbaroum-corerules/images/pictures/band-of-elves.webp", "50% 34%", ["bushcraft"], [], [], [
    loreSection("abductedHuman", "history", 3),
    loreSection("abductedHuman", "names", 1, ["examples"])
  ]),
  race("troll", "fa-mountain-sun", "modules/symbaroum-corerules/images/pictures/back-troll.webp", "50% 20%", ["longLived", "pariah"], [], ["armored", "naturalWeapon", "regeneration", "robust"], [
    loreSection("troll", "history", 3),
    loreSection("troll", "names", 1, ["examples"])
  ]),
  race("undead", "fa-skull", "modules/symbaroum-corerules/images/pictures/undead.webp", "50% 24%", ["undead"], [], ["tombCold", "terrify"], [
    loreSection("undead", "history", 3),
    loreSection("undead", "names", 1, ["examples"])
  ])
]);

export function coreRace(id) {
  return CORE_RACES.find((entry) => entry.id === id) ?? null;
}

export function coreRaceTrait(id) {
  return CORE_RACE_TRAITS[id] ?? null;
}
