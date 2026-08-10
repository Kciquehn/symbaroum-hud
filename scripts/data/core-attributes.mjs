export const ATTRIBUTE_MIN = 5;
export const ATTRIBUTE_MAX = 15;
export const ATTRIBUTE_POINT_TOTAL = 80;
export const TYPICAL_ATTRIBUTE_VALUES = Object.freeze([5, 7, 9, 10, 10, 11, 13, 15]);

export const CORE_ATTRIBUTES = Object.freeze([
  attribute("accurate", "fa-crosshairs"),
  attribute("cunning", "fa-brain"),
  attribute("discreet", "fa-mask"),
  attribute("persuasive", "fa-comments"),
  attribute("quick", "fa-person-running"),
  attribute("resolute", "fa-sun"),
  attribute("strong", "fa-hand-fist"),
  attribute("vigilant", "fa-eye")
]);

export function isValidTypicalDistribution(values) {
  const normalized = normalizedValues(values).sort((left, right) => left - right);
  return normalized.length === TYPICAL_ATTRIBUTE_VALUES.length
    && normalized.every((value, index) => value === TYPICAL_ATTRIBUTE_VALUES[index]);
}

export function isValidPointBuyDistribution(values) {
  const normalized = normalizedValues(values);
  return normalized.length === CORE_ATTRIBUTES.length
    && normalized.every((value) => value >= ATTRIBUTE_MIN && value <= ATTRIBUTE_MAX)
    && normalized.reduce((total, value) => total + value, 0) === ATTRIBUTE_POINT_TOTAL
    && normalized.filter((value) => value === ATTRIBUTE_MAX).length <= 1;
}

function attribute(id, icon) {
  const prefix = `SYMBAROUMHUD.CharacterCreator.Attributes.Entries.${id}`;
  return Object.freeze({
    id,
    icon,
    name: `${prefix}.Name`,
    description: `${prefix}.Description`
  });
}

function normalizedValues(values) {
  return Array.from(values ?? [], (value) => Number(value))
    .filter((value) => Number.isInteger(value));
}
