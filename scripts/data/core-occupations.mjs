export const OCCUPATION_ARCHETYPES = Object.freeze([
  archetype("warrior", "Warrior"),
  archetype("mystic", "Mystic"),
  archetype("rogue", "Rogue")
]);

export const CORE_OCCUPATIONS = Object.freeze([
  occupation("berserker", "warrior", "fa-hand-fist", "berserker-rage.webp"),
  occupation("duelist", "warrior", "fa-khanda", "duelist-arch.webp"),
  occupation("captain", "warrior", "fa-chess-king", "captain-arch.webp"),
  occupation("sellsword", "warrior", "fa-coins", "sellsword-arch.webp"),
  occupation("knight", "warrior", "fa-shield-halved", "knight-arch.webp"),
  occupation("witch", "mystic", "fa-masks-theater", "witch.webp"),
  occupation("sorcerer", "mystic", "fa-eye", "sorcerer-arch.webp"),
  occupation("theurg", "mystic", "fa-sun", "theurg-arch.webp"),
  occupation("wizard", "mystic", "fa-book-open", "wizard-arch.webp"),
  occupation("selfTaughtMystic", "mystic", "fa-wand-sparkles", "self-taught-mystic-arch.webp"),
  occupation("charlatan", "rogue", "fa-comments", "rouges-domain.webp"),
  occupation("witchhunter", "rogue", "fa-crosshairs", "witchfinder-arch.webp"),
  occupation("thug", "rogue", "fa-user-ninja", "thug-arch.webp"),
  occupation("treasureHunter", "rogue", "fa-gem", "treasure-hunter-arch.webp"),
  occupation("ranger", "rogue", "fa-tree", "ranger-arch.webp"),
]);

export function coreOccupation(id) {
  return CORE_OCCUPATIONS.find((entry) => entry.id === id) ?? null;
}

function occupation(id, archetype, icon, art) {
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
