import { MODULE_ID } from "../constants.mjs";

const CHANNEL = `module.${MODULE_ID}`;
const RESPONSE_TIMEOUT = 30_000;
const CACHE_TTL = 10 * 60_000;

export class ActorTransactionError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// One queue on the active GM owns all cooperating money/contract mutations.
// The socket's second argument is the server-provided sender, never payload data.
export class ActorTransactionCoordinator {
  constructor({ getGame = () => globalThis.game, resolveUuid = (uuid) => globalThis.fromUuid?.(uuid) } = {}) {
    this.getGame = getGame;
    this.resolveUuid = resolveUuid;
    this.handlers = new Map();
    this.queues = new Map();
    this.requests = new Map();
    this.pending = new Map();
    this.socket = null;
  }

  register(name, handler) { this.handlers.set(name, handler); }

  listen() {
    const socket = this.getGame()?.socket;
    if (!socket?.on || this.socket === socket) return;
    this.socket = socket;
    socket.on(CHANNEL, (message, senderId) => { void this.receive(message, senderId); });
  }

  authority() {
    const game = this.getGame();
    if (game.users?.activeGM?.active) return game.users.activeGM;
    const users = game.users?.contents ?? (game.users ? Array.from(game.users) : []);
    return users.filter((user) => user.active && user.isGM)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]
      // Standalone service callers have no world user collection.
      ?? (!game.users && game.user?.isGM ? game.user : null);
  }

  async execute(actor, operation, data, { requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` } = {}) {
    const game = this.getGame();
    if (!actor?.testUserPermission?.(game.user, "OWNER")) throw new ActorTransactionError("permission");
    const authority = this.authority();
    if (!authority) throw new ActorTransactionError("noAuthority");
    const request = { type: "request", id: requestId, authorityId: authority.id, actorUuid: actor.uuid ?? actor.id, operation, data };
    if (authority.id === game.user.id) return this.dispatch(request, game.user, actor);
    this.listen();
    if (!this.socket) throw new ActorTransactionError("noAuthority");
    return new Promise((resolve, reject) => {
      if (this.pending.has(requestId)) { reject(new ActorTransactionError("duplicateRequest")); return; }
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        // Never retry or fall back locally: the GM may already have committed.
        reject(new ActorTransactionError("transactionTimeout"));
      }, RESPONSE_TIMEOUT);
      this.pending.set(requestId, { resolve, reject, timer, authorityId: authority.id });
      try { this.socket.emit(CHANNEL, request); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }

  async receive(message, senderId) {
    if (!message || typeof message.id !== "string" || !senderId) return;
    const game = this.getGame();
    if (message.type === "response") {
      const pending = this.pending.get(message.id);
      if (!pending || message.targetId !== game.user.id || senderId !== pending.authorityId) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new ActorTransactionError(message.error));
      else pending.resolve(message.result);
      return;
    }
    if (message.type !== "request" || message.authorityId !== game.user.id || this.authority()?.id !== game.user.id) return;
    const user = game.users?.get?.(senderId);
    let response;
    try {
      if (!user?.active) throw new ActorTransactionError("permission");
      response = { result: await this.dispatch(message, user) };
    } catch (error) {
      response = { error: error instanceof ActorTransactionError ? error.code : "transactionFailed" };
      if (!(error instanceof ActorTransactionError)) console.error(`${MODULE_ID} | Transaction failed.`, error);
    }
    this.socket.emit(CHANNEL, { type: "response", id: message.id, targetId: senderId, ...response });
  }

  dispatch(request, user, localActor = null) {
    if (typeof request.actorUuid !== "string" || !request.actorUuid || !this.handlers.has(request.operation)) {
      return Promise.reject(new ActorTransactionError("unavailable"));
    }
    const fingerprint = JSON.stringify([request.actorUuid, request.operation, request.data]);
    const key = `${user.id}:${request.id}`;
    const cached = this.requests.get(key);
    if (cached) return cached.fingerprint === fingerprint ? cached.promise : Promise.reject(new ActorTransactionError("duplicateRequest"));
    for (const [id, entry] of this.requests) {
      if (entry.finishedAt && Date.now() - entry.finishedAt > CACHE_TTL) this.requests.delete(id);
    }
    const previous = this.queues.get(request.actorUuid) ?? Promise.resolve();
    const record = { fingerprint, finishedAt: 0 };
    const current = previous.catch(() => {}).then(async () => {
      if (this.authority()?.id !== this.getGame().user.id) throw new ActorTransactionError("authorityChanged");
      const actor = localActor ?? await this.resolveUuid(request.actorUuid);
      if (!actor?.testUserPermission?.(user, "OWNER")) throw new ActorTransactionError("permission");
      return this.handlers.get(request.operation)(actor, request.data, user);
    });
    record.promise = current.finally(() => {
      record.finishedAt = Date.now();
      if (this.queues.get(request.actorUuid) === current) this.queues.delete(request.actorUuid);
    });
    this.requests.set(key, record);
    this.queues.set(request.actorUuid, current);
    return record.promise;
  }
}

export const actorTransactions = new ActorTransactionCoordinator();
