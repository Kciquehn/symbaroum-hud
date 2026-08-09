import assert from "node:assert/strict";
import test from "node:test";

import { defenseDisplayValue } from "../scripts/services/defense-service.mjs";

test("shows the native prepared NPC defense modifier including active rules", () => {
  const actor = {
    type: "monster",
    system: { combat: { defense: 1, defmod: 9 } }
  };

  assert.equal(defenseDisplayValue(actor), "+9");
});

test("calculates the NPC modifier from final defense when defmod is unavailable", () => {
  const actor = {
    type: "monster",
    system: { combat: { defense: 1 } }
  };

  assert.equal(defenseDisplayValue(actor), "+9");
});

test("does not add a plus sign to zero or negative NPC modifiers", () => {
  assert.equal(defenseDisplayValue({
    type: "monster",
    system: { combat: { defense: 10, defmod: 0 } }
  }), "0");
  assert.equal(defenseDisplayValue({
    type: "monster",
    system: { combat: { defense: 12, defmod: -2 } }
  }), "-2");
});

test("keeps the prepared defense target for player characters", () => {
  assert.equal(defenseDisplayValue({
    type: "player",
    system: { combat: { defense: 13, defmod: -3 } }
  }), 13);
});
