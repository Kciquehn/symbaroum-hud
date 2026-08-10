export const ABILITY_DISTRIBUTION_MODES = Object.freeze({
  FIVE_NOVICE: "five-novice",
  MIXED: "mixed"
});

export function abilitySelectionLimits(mode, racialAbilityCost = 0) {
  const occupied = Math.max(0, Math.min(2, Number(racialAbilityCost) || 0));
  if (mode === ABILITY_DISTRIBUTION_MODES.MIXED) {
    return Object.freeze({ novice: Math.max(0, 2 - occupied), adept: 1, occupied });
  }
  return Object.freeze({ novice: Math.max(0, 5 - occupied), adept: 0, occupied });
}

export function isValidAbilitySelection(selections, mode, racialAbilityCost = 0) {
  if (!Object.values(ABILITY_DISTRIBUTION_MODES).includes(mode)) return false;
  const normalized = Array.from(selections ?? []);
  const limits = abilitySelectionLimits(mode, racialAbilityCost);
  const ids = normalized.map((entry) => entry?.id).filter(Boolean);
  if (ids.length !== normalized.length || new Set(ids).size !== ids.length) return false;
  if (normalized.some((entry) => !["novice", "adept"].includes(entry?.rank))) return false;
  return normalized.filter((entry) => entry.rank === "novice").length === limits.novice
    && normalized.filter((entry) => entry.rank === "adept").length === limits.adept;
}
