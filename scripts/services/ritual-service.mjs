const RITUALIST_LEVELS = Object.freeze([
  {
    id: "master",
    capacity: 6,
    label: "SYMBAROUMHUD.Abilities.Master"
  },
  {
    id: "adept",
    capacity: 3,
    label: "SYMBAROUMHUD.Abilities.Adept"
  },
  {
    id: "novice",
    capacity: 1,
    label: "SYMBAROUMHUD.Abilities.Novice"
  }
]);

/**
 * Build the Ritualist progression summary from the ability's active rank.
 *
 * @param {object|null} ritualist The actor's Ritualist Item.
 * @param {number} knownRituals Number of ritual Items owned by the actor.
 * @param {object} [options] Optional Symbaroum rule configuration.
 * @returns {object} A presentation-safe progression summary.
 */
export function ritualistProgress(
  ritualist,
  knownRituals,
  { additionalRitualsAllowed = false, additionalRitualCost = null } = {}
) {
  const level = RITUALIST_LEVELS.find(
    (candidate) => Boolean(ritualist?.system?.[candidate.id]?.isActive)
  ) ?? null;
  const known = nonNegativeInteger(knownRituals);
  const capacity = level?.capacity ?? 0;
  const remaining = Math.max(0, capacity - known);
  const extras = Math.max(0, known - capacity);
  const normalizedAdditionalCost = finiteNumber(additionalRitualCost);
  const canLearnAdditional = Boolean(
    additionalRitualsAllowed && level?.id === "master"
  );

  return {
    level: level?.id ?? null,
    levelLabel: level?.label ?? "SYMBAROUMHUD.Rituals.NotLearned",
    known,
    capacity,
    remaining,
    extras,
    atCapacity: capacity > 0 && remaining === 0 && !canLearnAdditional,
    canLearnAdditional,
    additionalRitualCost: normalizedAdditionalCost
  };
}

function nonNegativeInteger(value) {
  const number = finiteNumber(value);
  return number === null ? 0 : Math.max(0, Math.trunc(number));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
