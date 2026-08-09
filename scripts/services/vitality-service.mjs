export const VITALITY_STATES = Object.freeze({
  HEALTHY: "healthy",
  INJURED: "injured",
  WOUNDED: "wounded",
  CRITICAL: "critical"
});

export function vitalityState(value, max) {
  const maximum = Number(max);
  if (!Number.isFinite(maximum) || maximum <= 0) return VITALITY_STATES.HEALTHY;

  const current = Number(value);
  const ratio = (Number.isFinite(current) ? current : 0) / maximum;
  if (ratio <= 0.25) return VITALITY_STATES.CRITICAL;
  if (ratio <= 0.5) return VITALITY_STATES.WOUNDED;
  if (ratio < 1) return VITALITY_STATES.INJURED;
  return VITALITY_STATES.HEALTHY;
}

export function shouldShowDangerTint(weaponDrawn, state) {
  return Boolean(weaponDrawn) || state === VITALITY_STATES.CRITICAL;
}
