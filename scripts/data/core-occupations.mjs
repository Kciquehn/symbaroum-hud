export const OCCUPATION_ARCHETYPES = Object.freeze([
  archetype("warrior", "Warrior"),
  archetype("mystic", "Mystic"),
  archetype("rogue", "Rogue")
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
  occupation("witchhunter", "rogue", "fa-crosshairs", "witchfinder-arch.webp", ["ambrian", "barbarian"]),
  occupation("thug", "rogue", "fa-user-ninja", "thug-arch.webp", ["goblin", "ambrian", "barbarian", "ogre"]),
  occupation("treasureHunter", "rogue", "fa-gem", "treasure-hunter-arch.webp", ["goblin", "ambrian", "barbarian", "ogre"]),
  occupation("ranger", "rogue", "fa-tree", "ranger-arch.webp", ["barbarian", "changeling"]),
]);

export function coreOccupation(id) {
  return CORE_OCCUPATIONS.find((entry) => entry.id === id) ?? null;
}

function occupation(id, archetype, icon, art, suggestedRaces = []) {
  const prefix = `SYMBAROUMHUD.CharacterCreator.Occupations.${id}`;
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
    abilities: `${prefix}.Abilities`
  });
}

function archetype(id, key) {
  const prefix = `SYMBAROUMHUD.CharacterCreator.Archetypes.${key}`;
  return Object.freeze({
    id,
    label: `${prefix}.Name`,
    summary: `${prefix}.Summary`
  });
}
