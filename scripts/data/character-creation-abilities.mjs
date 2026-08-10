export const ABILITY_DISTRIBUTION_MODES = Object.freeze({
  EXPERIENCE: "experience",
  FIVE_NOVICE: "five-novice",
  MIXED: "mixed"
});

export const DEFAULT_ABILITY_EXPERIENCE_COSTS = Object.freeze({
  novice: 10,
  adept: 20,
  master: 30
});

export function abilityRankCost(rank, costs = DEFAULT_ABILITY_EXPERIENCE_COSTS) {
  const novice = Number(costs.novice) || DEFAULT_ABILITY_EXPERIENCE_COSTS.novice;
  const adept = Number(costs.adept) || DEFAULT_ABILITY_EXPERIENCE_COSTS.adept;
  const master = Number(costs.master) || DEFAULT_ABILITY_EXPERIENCE_COSTS.master;
  if (rank === "novice") return novice;
  if (rank === "adept") return novice + adept;
  if (rank === "master") return novice + adept + master;
  return Number.POSITIVE_INFINITY;
}

export function abilitySelectionCost(selections, costs = DEFAULT_ABILITY_EXPERIENCE_COSTS) {
  return Array.from(selections ?? []).reduce((total, entry) => total + abilityRankCost(entry?.rank, costs), 0);
}

export function abilitySelectionLimits(mode, racialAbilityCost = 0) {
  const occupied = Math.max(0, Math.min(2, Number(racialAbilityCost) || 0));
  if (mode === ABILITY_DISTRIBUTION_MODES.MIXED) {
    return Object.freeze({ novice: Math.max(0, 2 - occupied), adept: 1, occupied });
  }
  return Object.freeze({ novice: Math.max(0, 5 - occupied), adept: 0, occupied });
}

export function isValidAbilitySelection(selections, mode, racialAbilityCost = 0, options = {}) {
  if (!Object.values(ABILITY_DISTRIBUTION_MODES).includes(mode)) return false;
  const normalized = Array.from(selections ?? []);
  const identities = normalized.map((entry) => {
    if (!entry?.id) return "";
    return entry.choiceId ? `${entry.id}:${entry.choiceId}` : entry.id;
  });
  if (identities.some((identity) => !identity) || new Set(identities).size !== identities.length) return false;
  if (mode === ABILITY_DISTRIBUTION_MODES.EXPERIENCE) {
    if (normalized.some((entry) => !["novice", "adept", "master"].includes(entry?.rank))) return false;
    const budget = Number(options.experienceBudget);
    if (!Number.isFinite(budget) || budget < 0) return false;
    const racialCost = Math.max(0, Number(racialAbilityCost) || 0)
      * abilityRankCost("novice", options.costs);
    return abilitySelectionCost(normalized, options.costs) + racialCost <= budget
      && (normalized.length > 0 || racialCost > 0 || budget === 0);
  }
  const limits = abilitySelectionLimits(mode, racialAbilityCost);
  if (normalized.some((entry) => !["novice", "adept"].includes(entry?.rank))) return false;
  return normalized.filter((entry) => entry.rank === "novice").length === limits.novice
    && normalized.filter((entry) => entry.rank === "adept").length === limits.adept;
}
