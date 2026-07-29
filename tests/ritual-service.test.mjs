import assert from "node:assert/strict";
import test from "node:test";

import { ritualistProgress } from "../scripts/services/ritual-service.mjs";

function ritualist(levels = {}) {
  return {
    type: "ability",
    system: {
      novice: { isActive: Boolean(levels.novice) },
      adept: { isActive: Boolean(levels.adept) },
      master: { isActive: Boolean(levels.master) }
    }
  };
}

test("calculates the official Ritualist capacity for every learned rank", () => {
  assert.deepEqual(
    ritualistProgress(ritualist({ novice: true }), 0),
    {
      level: "novice",
      levelLabel: "SYMBAROUMHUD.Abilities.Novice",
      known: 0,
      capacity: 1,
      remaining: 1,
      extras: 0,
      atCapacity: false,
      canLearnAdditional: false,
      additionalRitualCost: null
    }
  );

  assert.equal(
    ritualistProgress(ritualist({ novice: true, adept: true }), 1).capacity,
    3
  );
  assert.equal(
    ritualistProgress(ritualist({
      novice: true,
      adept: true,
      master: true
    }), 4).capacity,
    6
  );
});

test("uses the highest active rank and never exposes negative remaining slots", () => {
  const progress = ritualistProgress(
    ritualist({ novice: true, master: true }),
    7
  );

  assert.equal(progress.level, "master");
  assert.equal(progress.known, 7);
  assert.equal(progress.capacity, 6);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.extras, 1);
  assert.equal(progress.atCapacity, true);
});

test("reports an unlearned ability without inventing capacity", () => {
  const progress = ritualistProgress(ritualist(), -4);

  assert.equal(progress.level, null);
  assert.equal(progress.levelLabel, "SYMBAROUMHUD.Rituals.NotLearned");
  assert.equal(progress.known, 0);
  assert.equal(progress.capacity, 0);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.atCapacity, false);
});

test("exposes the optional additional-ritual rule only for a master", () => {
  const master = ritualistProgress(ritualist({ master: true }), 6, {
    additionalRitualsAllowed: true,
    additionalRitualCost: 10
  });
  const masterWithoutOptionalRule = ritualistProgress(
    ritualist({ master: true }),
    6
  );
  const adept = ritualistProgress(ritualist({ adept: true }), 3, {
    additionalRitualsAllowed: true,
    additionalRitualCost: 10
  });

  assert.equal(master.canLearnAdditional, true);
  assert.equal(master.additionalRitualCost, 10);
  assert.equal(master.atCapacity, false);
  assert.equal(masterWithoutOptionalRule.canLearnAdditional, false);
  assert.equal(masterWithoutOptionalRule.atCapacity, true);
  assert.equal(adept.canLearnAdditional, false);
  assert.equal(adept.atCapacity, true);
});
