import assert from "node:assert/strict";
import test from "node:test";

import { VITALITY_STATES, vitalityState } from "../scripts/services/vitality-service.mjs";

test("keeps the HUD clean while vitality is above half", () => {
  assert.equal(vitalityState(10, 10), VITALITY_STATES.HEALTHY);
  assert.equal(vitalityState(6, 10), VITALITY_STATES.HEALTHY);
  assert.equal(vitalityState(1, 0), VITALITY_STATES.HEALTHY);
});

test("shows the wounded state from half vitality down to above one quarter", () => {
  assert.equal(vitalityState(5, 10), VITALITY_STATES.WOUNDED);
  assert.equal(vitalityState(2.6, 10), VITALITY_STATES.WOUNDED);
});

test("shows the critical state at one quarter vitality or below", () => {
  assert.equal(vitalityState(2.5, 10), VITALITY_STATES.CRITICAL);
  assert.equal(vitalityState(0, 10), VITALITY_STATES.CRITICAL);
  assert.equal(vitalityState(-1, 10), VITALITY_STATES.CRITICAL);
});
