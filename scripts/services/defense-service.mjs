export function defenseDisplayValue(actor) {
  const combat = actor?.system?.combat ?? {};
  const preparedDefense = finiteNumber(combat.defense);

  if (actor?.type === "monster") {
    const preparedModifier = finiteNumber(combat.defmod);
    const modifier = preparedModifier ?? (
      preparedDefense === null ? null : 10 - preparedDefense
    );
    if (modifier !== null) return signedNumber(modifier);
  }

  if (preparedDefense !== null) return preparedDefense;

  const attribute = actor?.system?.defense?.attribute;
  return finiteNumber(actor?.system?.attributes?.[attribute]?.total) ?? 0;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function signedNumber(value) {
  return value > 0 ? `+${value}` : String(value);
}
