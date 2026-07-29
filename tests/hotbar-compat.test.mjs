import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = { release: { generation: 13 } };

const { assignHotbarMacro } = await import("../scripts/compat/hotbar.mjs");

test("normalizes the v13 and v14 hotbar assignment signatures", async () => {
  const calls = [];
  const user = {
    assignHotbarMacro: async (...args) => calls.push(args)
  };
  const macro = { id: "macro" };

  await assignHotbarMacro(user, macro, 2, { fromSlot: 1 });
  game.release.generation = 14;
  await assignHotbarMacro(user, macro, 4, { fromSlot: 3 });

  assert.deepEqual(calls, [
    [macro, 2, { fromSlot: 1 }],
    [macro, 4, 3]
  ]);
});
