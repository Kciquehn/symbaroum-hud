export const OCCUPATION_ARCHETYPES = Object.freeze([
  { id: "warrior", label: "SYMBAROUMHUD.CharacterCreator.Archetypes.Warrior" },
  { id: "mystic", label: "SYMBAROUMHUD.CharacterCreator.Archetypes.Mystic" },
  { id: "rogue", label: "SYMBAROUMHUD.CharacterCreator.Archetypes.Rogue" }
]);

export const CORE_OCCUPATIONS = Object.freeze([
  occupation("berserker", "warrior", "fa-hand-fist"),
  occupation("duelist", "warrior", "fa-khanda"),
  occupation("captain", "warrior", "fa-chess-king"),
  occupation("sellsword", "warrior", "fa-coins"),
  occupation("knight", "warrior", "fa-shield-halved"),
  occupation("witch", "mystic", "fa-masks-theater"),
  occupation("sorcerer", "mystic", "fa-eye"),
  occupation("theurg", "mystic", "fa-sun"),
  occupation("wizard", "mystic", "fa-book-open"),
  occupation("selfTaughtMystic", "mystic", "fa-wand-sparkles"),
  occupation("charlatan", "rogue", "fa-comments"),
  occupation("witchhunter", "rogue", "fa-crosshairs"),
  occupation("thug", "rogue", "fa-user-ninja"),
  occupation("treasureHunter", "rogue", "fa-gem"),
  occupation("ranger", "rogue", "fa-tree"),
]);

export function coreOccupation(id) {
  return CORE_OCCUPATIONS.find((entry) => entry.id === id) ?? null;
}

function occupation(id, archetype, icon) {
  const prefix = `SYMBAROUMHUD.CharacterCreator.Occupations.${id}`;
  return Object.freeze({
    id,
    archetype,
    icon,
    name: `${prefix}.Name`,
    summary: `${prefix}.Summary`,
    playstyle: `${prefix}.Playstyle`
  });
}
