export const OCCUPATION_ARCHETYPES = Object.freeze([
  archetype("hunter", "Hunter", "fa-crosshairs", "ranger-arch.webp"),
  archetype("warrior", "Warrior", "fa-shield-halved", "sellsword-arch.webp"),
  archetype("rogue", "Rogue", "fa-user-ninja", "thug-arch.webp"),
  archetype("mystic", "Mystic", "fa-wand-sparkles", "witch.webp")
]);

export const CORE_OCCUPATIONS = Object.freeze([
  occupation("berserker", "warrior", "fa-hand-fist", "berserker-rage.webp", ["barbarian", "ogre"]),
  occupation("duelist", "warrior", "fa-khanda", "duelist-arch.webp", ["ambrian", "changeling"]),
  occupation("captain", "warrior", "fa-chess-king", "captain-arch.webp", ["ambrian", "barbarian"]),
  occupation("sellsword", "warrior", "fa-coins", "sellsword-arch.webp", ["ambrian", "barbarian"]),
  occupation("knight", "warrior", "fa-shield-halved", "knight-arch.webp", ["ambrian"]),
  occupation("witch", "mystic", "fa-masks-theater", "witch.webp", ["barbarian", "changeling"]),
  occupation("sorcerer", "mystic", "fa-eye", "sorcerer-arch.webp", ["ambrian", "barbarian"]),
  occupation("theurg", "mystic", "fa-sun", "theurg-arch.webp", ["ambrian"]),
  occupation("wizard", "mystic", "fa-book-open", "wizard-arch.webp", ["ambrian"]),
  occupation("selfTaughtMystic", "mystic", "fa-wand-sparkles", "self-taught-mystic-arch.webp", ["ambrian", "changeling"]),
  occupation("charlatan", "rogue", "fa-comments", "rouges-domain.webp", ["changeling", "ambrian", "barbarian"]),
  occupation("witchhunter", "hunter", "fa-crosshairs", "witchfinder-arch.webp", ["ambrian", "barbarian"]),
  occupation("thug", "rogue", "fa-user-ninja", "thug-arch.webp", ["goblin", "ambrian", "barbarian", "ogre"]),
  occupation("treasureHunter", "rogue", "fa-gem", "treasure-hunter-arch.webp", ["goblin", "ambrian", "barbarian", "ogre"]),
  occupation("ranger", "hunter", "fa-tree", "ranger-arch.webp", ["barbarian", "changeling"]),
  occupation("monsterHunter", "hunter", "fa-paw", "witchhunter.webp", ["ambrian", "barbarian", "abductedHuman"], "advancedPlayersGuide"),
  occupation("bountyHunter", "hunter", "fa-bullseye", "longbowman.webp", ["ambrian", "barbarian", "dwarf"], "advancedPlayersGuide"),
  occupation("runeSmith", "warrior", "fa-hammer", "robust-warrior.webp", ["abductedHuman", "ogre", "troll"], "advancedPlayersGuide"),
  occupation("tattooedWarrior", "warrior", "fa-fire-flame-curved", "clan-warrior.webp", ["barbarian", "goblin", "troll"], "advancedPlayersGuide"),
  occupation("weaponMaster", "warrior", "fa-khanda", "duelist-arch.webp", ["ambrian", "barbarian", "changeling", "elf", "goblin", "ogre", "troll", "abductedHuman"], "advancedPlayersGuide"),
  occupation("formerCultist", "rogue", "fa-eye-slash", "sorcerer-arch.webp", ["ambrian", "barbarian", "changeling", "undead"], "advancedPlayersGuide"),
  occupation("guildThief", "rogue", "fa-user-secret", "rouges-domain.webp", ["ambrian", "barbarian", "changeling", "goblin"], "advancedPlayersGuide"),
  occupation("sapper", "rogue", "fa-bomb", "siege-of-the-jezites.webp", ["ambrian", "ogre"], "advancedPlayersGuide"),
  occupation("trollSinger", "mystic", "fa-music", "back-troll.webp", ["dwarf", "elf", "ogre", "troll"], "advancedPlayersGuide"),
  occupation("symbolist", "mystic", "fa-draw-polygon", "clan-zarek.webp", ["barbarian", "goblin", "troll"], "advancedPlayersGuide"),
]);

export function coreOccupation(id) {
  return CORE_OCCUPATIONS.find((entry) => entry.id === id) ?? null;
}

function occupation(id, archetype, icon, art, suggestedRaces = [], source = "coreRulebook") {
  const prefix = `SYMBAROUMHUD.CharacterCreator.Occupations.${id}`;
  const advanced = source === "advancedPlayersGuide";
  return Object.freeze({
    id,
    archetype,
    icon,
    art: `modules/symbaroum-corerules/images/pictures/${art}`,
    name: `${prefix}.Name`,
    quote: `${prefix}.Quote`,
    summary: `${prefix}.Summary`,
    attributes: `${prefix}.Attributes`,
    races: `${prefix}.Races`,
    suggestedRaces: Object.freeze([...suggestedRaces]),
    abilities: `${prefix}.Abilities`,
    gifts: advanced ? `${prefix}.Gifts` : "",
    burdens: advanced ? `${prefix}.Burdens` : "",
    source,
    sourceLabel: `SYMBAROUMHUD.CharacterCreator.Occupation.Sources.${source}`
  });
}

function archetype(id, key, icon, art) {
  const prefix = `SYMBAROUMHUD.CharacterCreator.Archetypes.${key}`;
  return Object.freeze({
    id,
    icon,
    art: `modules/symbaroum-corerules/images/pictures/${art}`,
    label: `${prefix}.Name`,
    summary: `${prefix}.Summary`,
    ability: `${prefix}.Ability`
  });
}
