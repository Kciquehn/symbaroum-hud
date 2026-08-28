/** Rules introduced by the Advanced Player's Guide that affect Ability eligibility. */
export const ARCHETYPAL_ABILITY_RULES = Object.freeze([
  archetypalRule("hunter", "hunterInstinct", ["Instinto do Caçador", "Hunter Instinct"], [
    "Alquimia", "Armadilheiro", "Ferreiro", "Médico", "Mestre do Saber", "Saber de Bestas", "Tático", "Veneficista",
    "Dominação", "Líder", "Arremessar Aço", "Ataque Gêmeo", "Atirador", "Golpe com Flecha", "Luta de Cajado",
    "Maestria em Armas de Haste", "Acrobacias", "Saque Rápido", "Tiro Rápido", "Guarda-Costas", "Inabalável",
    "Sexto Sentido", "Visão de Bruxa", "Punho de Ferro", "Atributo Excepcional", "Equestre", "Homem-de-Armas",
    "Recuperação", "Ritualista"
  ]),
  archetypalRule("warrior", "featOfStrength", ["Façanha de Força", "Feat of Strength"], [
    "Dominação", "Líder", "Ataque Gêmeo", "Combatente de Escudo", "Força da Empunhadura Dupla", "Luta de Cajado",
    "Maestria em Armas de Haste", "Passo do Martelo", "Acrobacias", "Saque Rápido", "Guarda-Costas", "Inabalável",
    "Punho de Ferro", "Amoque", "Artista do Machado", "Atributo Excepcional", "Equestre", "Espada Abençoada",
    "Homem-de-Armas", "Mangualeiro", "Oportunista", "Recuperação", "Tatuagem Rúnica"
  ]),
  archetypalRule("rogue", "quickReflexes", ["Reflexos Rápidos", "Quick Reflexes"], [
    "Alquimia", "Armadilheiro", "Estrangulador", "Ferreiro", "Golpe Baixo", "Médico", "Mestre do Saber",
    "Saber de Bestas", "Tático", "Veneficista", "Ataque Furtivo", "Finta", "Dominação", "Líder", "Atirador",
    "Arremessar Aço", "Ataque Gêmeo", "Guerreiro Natural", "Maestria em Armas de Haste", "Acrobacias",
    "Dança da Adaga", "Saque Rápido", "Tiro Rápido", "Inabalável", "Sexto Sentido", "Visão de Bruxa",
    "Atributo Excepcional", "Equestre", "Oportunista", "Recuperação", "Ritualista"
  ]),
  archetypalRule("mystic", "powerfulGift", ["Dom Poderoso", "Powerful Gift"], [
    "Alquimia", "Ferreiro", "Médico", "Mestre do Saber", "Saber de Bestas", "Guerreiro Natural",
    "Maestria em Armas de Haste", "Dominação", "Líder", "Acrobacias", "Inabalável", "Poder Místico",
    "Sexto Sentido", "Visão de Bruxa", "Amoque", "Atributo Excepcional", "Bruxaria", "Canto do Troll",
    "Magia do Cajado", "Magismo", "Recuperação", "Ritualista", "Simbolismo", "Teurgia"
  ])
]);

/**
 * Professions and mystical specializations from the Advanced Player's Guide.
 *
 * A Profession is a progression goal: all required Abilities must be known and
 * at least one of them must be at Master rank. Its unique gifts are therefore
 * not normal starting options. The creator keeps their original world sheets
 * readable, but marks and locks them during initial character creation.
 */
export const ADVANCED_PROFESSION_RULES = Object.freeze([
  professionRule("ironSworn", "Jurado do Ferro", "Iron Sworn",
    requirements("Ataque Gêmeo, Atirador, Maestria em Armas de Haste e Mestre do Saber ou Saber de Bestas.",
      "Twin Attack, Marksman, Polearm Mastery, and Loremaster or Beast Lore."), [
      exclusive("ability", "Combate Ágil", "Agile Combat")
    ]),
  professionRule("templar", "Templário", "Templar",
    requirements("Homem-de-Armas, Punho de Ferro, Teurgia e Poder Místico (Aura Sagrada ou Martelo Bruxo).",
      "Man-at-Arms, Iron Fist, Theurgy, and Mystical Power (Sacred Aura or Witch Hammer)."), [
      exclusive("ability", "Místico Blindado", "Armored Mystic")
    ]),
  professionRule("wrathGuard", "Guarda da Ira", "Wrath Guard",
    requirements("Ataque Gêmeo ou Combatente de Escudo, Homem-de-Armas, Punho de Ferro e Recuperação; apenas humanos bárbaros.",
      "Twin Attack or Shield Fighter, Man-at-Arms, Iron Fist, and Recovery; barbarian humans only."), [
      exclusive("ability", "Combate Sangrento", "Blood Combat")
    ]),
  professionRule("queensSpy", "Espião da Rainha", "Queen's Spy",
    requirements("Ataque Gêmeo, Espada Abençoada, Finta e Estrangulador ou Veneficista; requer nobre ambriano com Privilegiado.",
      "Twin Attack, Blessed Blade, Feint, and Strangler or Poisoner; requires an Ambrian noble with Privileged."), [
      exclusive("ability", "Pirotecnia", "Pyrotechnics")
    ]),
  professionRule("gentlemanThief", "Ladrão Cavalheiro", "Gentleman Thief",
    requirements("Acrobacias, Armadilheiro, Dominação e Ataque Gêmeo ou Espada Abençoada.",
      "Acrobatics, Trapper, Domination, and Twin Attack or Blessed Blade."), [
      exclusive("ability", "Dança do Manto", "Mantle Dance")
    ]),
  professionRule("artifactCreator", "Criador de Artefatos", "Artifact Crafter",
    requirements("Ferreiro, Mestre do Saber e Ritualista; Poder Místico é opcional.",
      "Blacksmith, Loremaster, and Ritualist; Mystical Power is optional."), [
      exclusive("ability", "Criar Artefatos", "Artifact Crafting")
    ]),
  professionRule("staffMage", "Magista do Cajado", "Staff Mage",
    requirements("Luta de Cajado, Maestria em Armas de Haste e Mestre do Saber; Poder Místico é opcional e a Corrupção Permanente deve ser 3 ou menos.",
      "Staff Fighting, Polearm Mastery, and Loremaster; Mystical Power is optional and Permanent Corruption must be 3 or less."), [
      exclusive("ability", "Magia do Cajado", "Staff Magic"),
      exclusive("mysticalPower", "Cajado Projétil", "Staff Projectile"),
      exclusive("ritual", "Tempestade de Sangue", "Blood Storm"),
      exclusive("ritual", "Tremor")
    ]),
  professionRule("bloodWader", "Ave de Sangue", "Blood Wader",
    requirements("Bruxaria, Guerreiro Natural, Médico e Poder Místico (Metamorfose).",
      "Witchcraft, Natural Warrior, Medicus, and Mystical Power (Shapeshift)."), [
      exclusive("trait", "Arma Natural", "Natural Weapon"),
      exclusive("boon", "Besta Companheira", "Beast Companion"),
      exclusive("trait", "Regeneração", "Regeneration")
    ]),
  professionRule("confessor", "Confessor", "Confessor",
    requirements("Líder ou Médico, Teurgia, Poder Místico (Aura Sagrada, Imposição de Mãos ou Forma Verdadeira) e Ritualista (Exorcismo).",
      "Leader or Medicus, Theurgy, Mystical Power (Sacred Aura, Lay on Hands, or True Form), and Ritualist (Exorcism)."), [
      exclusive("mysticalPower", "Doador de Vida", "Life Giver"),
      exclusive("ritual", "Expiação", "Atonement")
    ]),
  professionRule("demonologist", "Demonologista", "Demonologist",
    requirements("Feitiçaria, Poder Místico (Aura Profana), Ritualista (Rito de Profanação) e Mestre do Saber ou Visão de Bruxa.",
      "Sorcery, Mystical Power (Unholy Aura), Ritualist (Desecrating Rite), and Loremaster or Witchsight."), [
      exclusive("ritual", "Convocar Daemon", "Summon Daemon"),
      exclusive("mysticalPower", "Exorcizar", "Exorcize"),
      exclusive("ritual", "Servo Daemon", "Daemon Servant"),
      exclusive("mysticalPower", "Teleporte", "Teleport")
    ]),
  professionRule("spiritualist", "Espiritualista", "Spiritualist",
    requirements("Bruxaria, Visão de Bruxa, Poder Místico (Herdar Ferimento) e Ritualista (Necromancia).",
      "Witchcraft, Witchsight, Mystical Power (Inherit Wound), and Ritualist (Necromancy)."), [
      exclusive("ritual", "Adivinhação da Morte", "Death Divination"),
      exclusive("trait", "Aterrorizar", "Terrify"),
      exclusive("mysticalPower", "Espíritos Atormentadores", "Tormenting Spirits", "Espíritos Atormentados")
    ]),
  professionRule("illusionist", "Ilusionista", "Illusionist",
    requirements("Magismo, Mestre do Saber, Poder Místico (Correção Ilusória ou Imperceptível) e Ritualista (Terreno Falso e Ilusão).",
      "Wizardry, Loremaster, Mystical Power (Illusory Correction or Unnoticeable), and Ritualist (False Terrain and Illusion)."), [
      exclusive("mysticalPower", "Espelhamento", "Mirroring"),
      exclusive("ritual", "Fata Morgana"),
      exclusive("ritual", "Paisagem Encantadora", "Enchanting Landscape")
    ]),
  professionRule("inquisitor", "Inquisidor", "Inquisitor",
    requirements("Ataque Furtivo ou Visão de Bruxa, Teurgia, Poder Místico (Anátema ou Imperceptível) e Ritualista (Fumaça Sagrada).",
      "Backstab or Witchsight, Theurgy, Mystical Power (Anathema or Unnoticeable), and Ritualist (Holy Smoke)."), [
      exclusive("ritual", "Olhar Penetrante", "Piercing Gaze"),
      exclusive("mysticalPower", "Purgatório", "Purgatory")
    ]),
  professionRule("mentalist", "Mentalista", "Mentalist",
    requirements("Magismo, Mestre do Saber, Poder Místico (Dobrar Vontade, Arremesso Mental ou Levitação) e Ritualista (Clarividência ou Interrogatório Telepático).",
      "Wizardry, Loremaster, Mystical Power (Bend Will, Mind-Throw, or Levitate), and Ritualist (Clairvoyance or Telepathic Interrogation)."), [
      exclusive("mysticalPower", "Impulso Psíquico", "Psychic Thrust"),
      exclusive("ritual", "Túnel Mágico", "Magic Tunnel")
    ]),
  professionRule("necromancer", "Necromante", "Necromancer",
    requirements("Feitiçaria, Médico, Poder Místico (Golpe de Regresso) e Ritualista (Erguer os Mortos).",
      "Sorcery, Medicus, Mystical Power (Unnoticeable Strike), and Ritualist (Raise Undead)."), [
      exclusive("mysticalPower", "Caminhada Espiritual", "Spirit Walk"),
      exclusive("mysticalPower", "Espíritos Atormentadores", "Tormenting Spirits", "Espíritos Atormentados"),
      exclusive("ritual", "Lorde da Morte", "Death Lord")
    ]),
  professionRule("pyromancer", "Piromante", "Pyromancer",
    requirements("Magismo, Mestre do Saber, Poder Místico (Cascata de Enxofre ou Muralha de Fogo) e Ritualista (Conto das Cinzas ou Servo Flamejante).",
      "Wizardry, Loremaster, Mystical Power (Brimstone Cascade or Wall of Fire), and Ritualist (Tale of Ashes or Flaming Servant)."), [
      exclusive("mysticalPower", "Alma de Fogo", "Fire Soul"),
      exclusive("ritual", "Servos Gêmeos", "Twin Servants")
    ]),
  professionRule("greenWeaver", "Tecelã Verde", "Green Weaver",
    requirements("Alquimia, Bruxaria, Poder Místico (Vinhas Emaranhadoras) e Ritualista (Crescimento Rápido).",
      "Alchemy, Witchcraft, Mystical Power (Entangling Vines), and Ritualist (Quick Growth)."), [
      exclusive("ritual", "Fortaleza Viva", "Living Fortress"),
      exclusive("mysticalPower", "Manto de Espinhos", "Thorn Cloak")
    ])
]);

export const PROFESSION_ABILITY_RULES = Object.freeze(ADVANCED_PROFESSION_RULES.flatMap((profession) =>
  profession.uniqueItems.filter((item) => item.kind === "ability").map((item) => Object.freeze({
    profession: profession.id,
    professionName: profession.name,
    requirements: profession.requirements,
    identities: item.identities
  }))
));

export function archetypalAbilityRule(item) {
  const identities = documentIdentities(item);
  return ARCHETYPAL_ABILITY_RULES.find((rule) => identities.some((identity) => rule.identities.includes(identity))) ?? null;
}

export function professionAbilityRule(item) {
  const identities = documentIdentities(item);
  return PROFESSION_ABILITY_RULES.find((rule) => identities.some((identity) => rule.identities.includes(identity))) ?? null;
}

export function professionExclusiveItemRules(item) {
  const identities = documentIdentities(item);
  const type = String(item?.type ?? "");
  return ADVANCED_PROFESSION_RULES.filter((profession) => profession.uniqueItems.some((uniqueItem) => (
    (!type || uniqueItem.kind === type)
    && identities.some((identity) => uniqueItem.identities.includes(identity))
  )));
}

export function countsTowardArchetype(item, rule) {
  if (!rule) return false;
  return documentIdentities(item).some((identity) => rule.eligibleAbilities.includes(identity));
}

function archetypalRule(archetype, id, aliases, eligibleAbilities) {
  return Object.freeze({
    id,
    archetype,
    minimum: 3,
    identities: Object.freeze(aliases.map(normalizeIdentity)),
    eligibleAbilities: Object.freeze(eligibleAbilities.map(normalizeIdentity))
  });
}

function professionRule(id, name, englishName, requirements, uniqueItems) {
  return Object.freeze({
    id,
    name,
    englishName,
    requirements,
    uniqueItems: Object.freeze(uniqueItems)
  });
}

function requirements(pt, en) {
  return Object.freeze({ pt, en });
}

function exclusive(kind, ...aliases) {
  return Object.freeze({ kind, identities: Object.freeze(aliases.map(normalizeIdentity)) });
}

function documentIdentities(item) {
  return [item?.system?.reference, item?.name].map(normalizeIdentity).filter(Boolean);
}

function normalizeIdentity(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}
