import assert from "node:assert/strict";
import test from "node:test";
import { ActorTransactionCoordinator, actorTransactions } from "../scripts/services/actor-transaction-service.mjs";
import "../scripts/services/shop-service.mjs";

function fixture() {
  const clients = new Map();
  const gm = { id: "gm", isGM: true, active: true };
  const first = { id: "first", isGM: false, active: true };
  const second = { id: "second", isGM: false, active: true };
  const stranger = { id: "stranger", isGM: false, active: true };
  const users = new Map([gm, first, second, stranger].map((user) => [user.id, user]));
  users.activeGM = gm;
  const actor = {
    id: "actor", uuid: "Actor.actor", system: { money: { thaler: 1, shilling: 0, orteg: 0 } },
    flags: { "symbaroum-hud": { services: [] } }, created: [],
    testUserPermission: (user) => user.id !== stranger.id,
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async update(changes) {
      await Promise.resolve();
      for (const [path, value] of Object.entries(changes)) {
        if (path.startsWith("system.money.")) this.system.money[path.split(".").at(-1)] = value;
        else if (path === "flags.symbaroum-hud.services") this.flags["symbaroum-hud"].services = value;
      }
      return this;
    },
    async createEmbeddedDocuments(_type, entries) {
      await Promise.resolve();
      const created = entries.map((entry, index) => ({ ...entry, _id: `created-${this.created.length + index}` }));
      this.created.push(...created);
      return created;
    }
  };
  const sourceData = { name: "Sword", type: "weapon", system: { cost: "1 táler", number: 1 } };
  const source = { ...sourceData, uuid: "Item.sword", documentName: "Item", testUserPermission: () => true, toObject: () => structuredClone(sourceData) };
  const documents = new Map([[actor.uuid, actor], [source.uuid, source]]);
  const resolveUuid = async (uuid) => documents.get(uuid);
  for (const user of users.values()) {
    const environment = { user, users, time: { worldTime: 1000 }, settings: { get: () => ({ services: [] }) } };
    const socket = {
      on(_channel, listener) { this.listener = listener; },
      emit(_channel, message) {
        for (const [id, client] of clients) {
          if (id !== user.id) queueMicrotask(() => client.socket.listener(structuredClone(message), user.id));
        }
      }
    };
    environment.socket = socket;
    const coordinator = new ActorTransactionCoordinator({ getGame: () => environment, resolveUuid });
    for (const [name, handler] of actorTransactions.handlers) coordinator.register(name, handler);
    clients.set(user.id, { coordinator, environment, socket });
    coordinator.listen();
  }
  globalThis.game = clients.get(gm.id).environment;
  globalThis.fromUuid = resolveUuid;
  const request = (quantity = 1) => ({
    purchases: [{ source: { uuid: source.uuid }, quantity }], complimentary: [], balanceOverride: null
  });
  return { clients, actor, source, users, request, first: clients.get(first.id).coordinator, second: clients.get(second.id).coordinator, gm: clients.get(gm.id).coordinator };
}

test("independent clients cannot buy twice using the same pre-purchase balance", async () => {
  const { first, second, actor, request } = fixture();
  const firstView = { uuid: actor.uuid, system: structuredClone(actor.system), testUserPermission: actor.testUserPermission };
  const secondView = { ...firstView, system: structuredClone(actor.system) };
  const results = await Promise.all([
    first.execute(firstView, "shop.purchase", request()), second.execute(secondView, "shop.purchase", request())
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === "insufficient").length, 1);
  assert.equal(actor.created.length, 1);
  assert.equal(actor.system.money.thaler, 0);
});

test("independent clients debit both contract uses through the GM queue", async () => {
  const { first, second, actor } = fixture();
  actor.flags["symbaroum-hud"].services = [{
    id: "passage", serviceId: "passage", name: "Passage", quantity: 3, remaining: 3, status: "active", fulfillment: "consumable"
  }];
  await Promise.all([
    first.execute(actor, "service.use", { recordId: "passage" }),
    second.execute(actor, "service.use", { recordId: "passage" })
  ]);
  assert.equal(actor.flags["symbaroum-hud"].services[0].remaining, 1);
});

test("a purchase and contract use share the same actor queue", async () => {
  const { first, second, actor, request } = fixture();
  actor.flags["symbaroum-hud"].services = [{
    id: "passage", serviceId: "passage", name: "Passage", quantity: 3, remaining: 3, status: "active", fulfillment: "consumable"
  }];
  const cart = request();
  cart.purchases = [{ source: { uuid: "SymbaroumHudService.explorer-license-individual-year" }, quantity: 1 }];
  actor.system.money.thaler = 100;
  const [purchase] = await Promise.all([
    first.execute(actor, "shop.purchase", cart), second.execute(actor, "service.use", { recordId: "passage" })
  ]);
  assert.equal(purchase.ok, true);
  assert.equal(actor.flags["symbaroum-hud"].services.length, 2);
  assert.equal(actor.flags["symbaroum-hud"].services.find(({ id }) => id === "passage").remaining, 2);
});

test("the authority rejects player overrides and snapshots even when the local guard is bypassed", async () => {
  const { first, actor, request } = fixture();
  for (const modify of [
    (data) => { data.balanceOverride = 10000; },
    (data) => { data.purchases[0].priceOverride = { ortegs: 1 }; },
    (data) => { data.complimentary = data.purchases; }
  ]) {
    const cart = request(); modify(cart);
    assert.equal((await first.execute(actor, "shop.purchase", cart)).reason, "permission");
  }
  const cart = request();
  cart.purchases[0].source.snapshot = { type: "weapon", name: "Fake", system: { cost: "1 ortega" } };
  assert.equal((await first.execute(actor, "shop.purchase", cart)).reason, "unavailable");
  await assert.rejects(first.execute(actor, "service.add", { records: [] }), { code: "permission" });
  assert.equal(actor.created.length, 0);
  assert.equal(actor.system.money.thaler, 1);
});

test("repeated request IDs are idempotent and changed payloads are rejected", async () => {
  const { first, actor, request } = fixture();
  const a = await first.execute(actor, "shop.purchase", request(), { requestId: "same" });
  const b = await first.execute(actor, "shop.purchase", request(), { requestId: "same" });
  assert.deepEqual(a, b);
  assert.equal(actor.created.length, 1);
  await assert.rejects(first.execute(actor, "shop.purchase", request(2), { requestId: "same" }), { code: "duplicateRequest" });
});

test("no GM means no mutation and no local fallback", async () => {
  const { first, actor, users, request } = fixture();
  users.get("gm").active = false;
  users.activeGM = null;
  await assert.rejects(first.execute(actor, "shop.purchase", request()), { code: "noAuthority" });
  assert.equal(actor.created.length, 0);
});

test("the authenticated sender is used instead of a forged payload identity", async () => {
  const { clients, actor, request } = fixture();
  const intruder = clients.get("stranger");
  let response;
  intruder.socket.listener = (message) => { if (message.type === "response") response = message; };
  intruder.socket.emit("module.symbaroum-hud", {
    type: "request", id: "forged", authorityId: "gm", actorUuid: actor.uuid,
    operation: "shop.purchase", data: request(), userId: "gm", senderId: "first"
  });
  for (let index = 0; index < 12; index++) await Promise.resolve();
  assert.equal(response.error, "permission");
  assert.equal(actor.created.length, 0);
});

test("the GM resolves current document prices instead of trusting a stale client copy", async () => {
  const { first, actor, source, request } = fixture();
  source.system.cost = "2 táleres";
  const cart = request();
  cart.purchases[0].source.cost = "1 ortega";
  cart.purchases[0].source.system = { cost: "1 ortega" };
  const result = await first.execute(actor, "shop.purchase", cart);
  assert.equal(result.reason, "insufficient");
  assert.equal(actor.created.length, 0);
});

test("failed requests do not poison the actor queue", async () => {
  const { first, second, actor, request } = fixture();
  actor.flags["symbaroum-hud"].services = [{ id: "r", serviceId: "s", name: "Service", quantity: 2, remaining: 2, fulfillment: "consumable" }];
  const [denied, consumed] = await Promise.allSettled([
    first.execute(actor, "service.add", { records: [] }), second.execute(actor, "service.use", { recordId: "r" })
  ]);
  assert.equal(denied.status, "rejected");
  assert.equal(consumed.status, "fulfilled");
  assert.equal(consumed.value.remaining, 1);
  assert.equal((await first.execute(actor, "shop.purchase", request())).ok, true);
});
