import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldShowDangerTint,
  VITALITY_STATES,
  vitalityState
} from "../scripts/services/vitality-service.mjs";

test("keeps the HUD clean only at full vitality", () => {
  assert.equal(vitalityState(10, 10), VITALITY_STATES.HEALTHY);
  assert.equal(vitalityState(12, 10), VITALITY_STATES.HEALTHY);
  assert.equal(vitalityState(1, 0), VITALITY_STATES.HEALTHY);
});

test("shows danger as soon as any vitality is lost", () => {
  assert.equal(vitalityState(9, 10), VITALITY_STATES.INJURED);
  assert.equal(vitalityState(5.1, 10), VITALITY_STATES.INJURED);
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

test("shows the screen danger tint for a drawn weapon or critical vitality", () => {
  assert.equal(shouldShowDangerTint(true, VITALITY_STATES.HEALTHY), true);
  assert.equal(shouldShowDangerTint(false, VITALITY_STATES.CRITICAL), true);
  assert.equal(shouldShowDangerTint(true, VITALITY_STATES.CRITICAL), true);
  assert.equal(shouldShowDangerTint(false, VITALITY_STATES.WOUNDED), false);
});
