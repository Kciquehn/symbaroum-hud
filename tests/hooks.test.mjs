import assert from "node:assert/strict";
import test from "node:test";

const listeners = new Map();

globalThis.game = {
  ready: true,
  user: { id: "user" }
};
globalThis.foundry = {
  utils: {
    debounce: (callback) => callback
  }
};
globalThis.Hooks = {
  on: (hook, callback) => listeners.set(hook, callback)
};

const { registerRefreshHooks } = await import("../scripts/hooks.mjs");

test("refresh hooks ignore unrelated actor documents", () => {
  let renders = 0;
  const hud = {
    actor: { id: "actor", uuid: "Actor.actor" },
    render: async () => {
      renders += 1;
    }
  };
  registerRefreshHooks(hud);

  listeners.get("updateActor")({ id: "other", uuid: "Actor.other" });
  listeners.get("updateItem")({
    parent: { id: "other", uuid: "Actor.other" }
  });
  assert.equal(renders, 0);

  listeners.get("updateActor")({ id: "actor", uuid: "Actor.actor" });
  listeners.get("createItem")({
    parent: { id: "actor", uuid: "Actor.actor" }
  });
  listeners.get("updateActiveEffect")({
    parent: { id: "actor", uuid: "Actor.actor" }
  });
  assert.equal(renders, 3);
});

test("refresh hooks track assigned-character and actor-list changes", () => {
  let renders = 0;
  const hud = {
    actor: { id: "actor", uuid: "Actor.actor" },
    render: async () => {
      renders += 1;
    }
  };
  registerRefreshHooks(hud);

  listeners.get("updateUser")({ id: "other" }, { character: "Actor.other" });
  listeners.get("updateUser")({ id: "user" }, { name: "Player" });
  assert.equal(renders, 0);

  listeners.get("updateUser")({ id: "user" }, { character: "Actor.actor" });
  listeners.get("createActor")({ id: "companion" });
  listeners.get("deleteActor")({ id: "companion" });
  assert.equal(renders, 3);
});
