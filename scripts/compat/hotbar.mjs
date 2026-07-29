export function assignHotbarMacro(user, macro, slot, { fromSlot } = {}) {
  if (Number(game.release?.generation) >= 14) {
    return user.assignHotbarMacro(macro, slot, fromSlot);
  }
  return user.assignHotbarMacro(macro, slot, { fromSlot });
}
