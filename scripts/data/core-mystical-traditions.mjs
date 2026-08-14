const MODULE_PATH = "modules/symbaroum-hud";

export const CORE_MYSTICAL_TRADITIONS = Object.freeze([
  tradition("witchcraft", "witch", "fa-leaf", "witch.webp", ["bruxaria"]),
  tradition("sorcery", "sorcerer", "fa-eye", "sorcerer-arch.webp", ["feiticaria"]),
  tradition("wizardry", "wizard", "fa-book-open", "wizard-arch.webp", ["magismo", "magia"]),
  tradition("theurgy", "theurg", "fa-sun", "theurg-arch.webp", ["teurgia"])
]);

export function coreMysticalTradition(item) {
  const identities = [item?.system?.reference, item?.name].map(normalizeIdentity);
  return CORE_MYSTICAL_TRADITIONS.find((entry) => identities.some((identity) => entry.identities.includes(identity))) ?? null;
}

function tradition(id, occupation, icon, art, aliases = []) {
  const prefix = `SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.${id}`;
  return Object.freeze({
    id,
    occupation,
    icon,
    art: `modules/symbaroum-corerules/images/pictures/${art}`,
    fallbackArt: `${MODULE_PATH}/assets/shadows/darkness.webp`,
    identities: Object.freeze([id, ...aliases].map(normalizeIdentity)),
    name: `${prefix}.Name`,
    introduction: `${prefix}.Introduction`,
    doctrine: `${prefix}.Doctrine`,
    titles: `${prefix}.Titles`,
    powers: `${prefix}.Powers`,
    rituals: `${prefix}.Rituals`,
    corruption: `${prefix}.Corruption`
  });
}

function normalizeIdentity(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}
