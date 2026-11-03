import { ActorService } from "../services/actor-service.mjs";

const pendingDrops = new Set();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export class ItemPilesIntegration {
  static get active() {
    return Boolean(
      (game.modules?.get?.("item-piles")?.active || Boolean(game.itempiles?.API))
      && Boolean(game.itempiles?.API)
    );
  }

  static get api() {
    return game.itempiles?.API ?? null;
  }

  /**
   * Finds the best token reference for the actor on the current canvas.
   * @param {Actor} actor
   * @returns {Token|null}
   */
  static findActorToken(actor) {
    if (!actor || !canvas?.tokens) return null;

    if (actor.token?.object) return actor.token.object;

    const controlled = canvas.tokens.controlled?.find(
      (t) => t.actor?.id === actor.id || t.actor?.uuid === actor.uuid
    );
    if (controlled) return controlled;

    return canvas.tokens.placeables?.find(
      (t) => t.actor?.id === actor.id || t.actor?.uuid === actor.uuid
    ) ?? null;
  }

  /**
   * Calculates a drop position near the given token or on the canvas.
   * @param {Actor} actor
   * @returns {{x: number, y: number, sceneId: string}|null}
   */
  static getDropPosition(actor) {
    if (!canvas?.scene) return null;

    const token = this.findActorToken(actor);
    const gridSize = canvas.grid?.size || 100;

    if (token) {
      return {
        x: Math.round(token.x + gridSize),
        y: Math.round(token.y),
        sceneId: canvas.scene.id
      };
    }

    if (canvas.stage?.pivot) {
      return {
        x: Math.round(canvas.stage.pivot.x),
        y: Math.round(canvas.stage.pivot.y),
        sceneId: canvas.scene.id
      };
    }

    return {
      x: 0,
      y: 0,
      sceneId: canvas.scene.id
    };
  }

  /**
   * Drops an item from the actor's inventory onto the canvas using Item Piles API.
   * @param {Actor} actor
   * @param {Item|string} itemOrId
   * @param {object} [options]
   * @returns {Promise<boolean>}
   */
  static async dropItem(actor, itemOrId, { containerId = null } = {}) {
    if (!ActorService.canUpdate(actor)) return false;
    const itemId = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
    const key = `${actor.uuid ?? actor.id}:${itemId}`;
    if (!itemId || pendingDrops.has(key)) return false;
    pendingDrops.add(key);
    try {
      return await this.#dropItem(actor, itemId, { containerId });
    } finally {
      pendingDrops.delete(key);
    }
  }

  static async #dropItem(actor, itemOrId, { containerId = null } = {}) {
    const item = typeof itemOrId === "string"
      ? (ActorService.item(actor, itemOrId) ?? Array.from(actor.items ?? []).find((i) => i.id === itemOrId))
      : itemOrId;
    if (!item) return false;

    const api = this.api;
    const position = this.getDropPosition(actor);

    if (!position) {
      ui.notifications?.warn?.(game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.DropItemNoToken"));
      return false;
    }

    const itemName = item.name ?? game.i18n.localize("SYMBAROUMHUD.Empty");
    const actorName = actor.name ?? game.i18n.localize("SYMBAROUMHUD.Empty");

    if (api && typeof api.createItemPile === "function" && typeof api.transferItems === "function") {
      try {
        // Create an empty destination; the Item Piles authority transfers the
        // original instead of copying it and attempting a separate deletion.
        const created = await api.createItemPile({
          sceneId: position.sceneId,
          position: { x: position.x, y: position.y },
          items: []
        });
        const target = created?.tokenUuid ?? created?.actorUuid;
        if (!target) return false;
        const destination = await globalThis.fromUuid?.(target);
        if (!destination) return false;
        const transferred = await api.transferItems(actor, destination, [item.id]);
        if (!Array.isArray(transferred) || !transferred.length) return false;
      } catch (err) {
        console.error("Symbaroum HUD | Error dropping item via Item Piles:", err);
        ui.notifications?.error?.(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        return false;
      }
    } else {
      ui.notifications?.warn?.(game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.DropItemNoModule"));
      return false;
    }

    // Clean up container/quiver if needed
    if (containerId) {
      const containerItem = actor.items?.get?.(containerId);
      if (containerItem?.flags?.["symbaroum-hud"]?.loadedAmmo) {
        const loadedAmmo = Array.isArray(containerItem.flags["symbaroum-hud"].loadedAmmo)
          ? [...containerItem.flags["symbaroum-hud"].loadedAmmo]
          : [];
        const filtered = loadedAmmo.filter((a) => (a.id ?? a) !== item.id);
        await containerItem.setFlag("symbaroum-hud", "loadedAmmo", filtered);
      }
    }

    // Send chat message
    const itemImg = item.img || "icons/svg/item-bag.svg";
    const dropText = game.i18n.format("SYMBAROUMHUD.SimplifiedInventory.DropItemChat", {
      actor: escapeHtml(actorName),
      item: escapeHtml(itemName)
    });

    const chatContent = `
      <div class="symbaroum-hud-chat-drop-card" style="display: flex; align-items: center; gap: 8px;">
        <img src="${escapeHtml(itemImg)}" width="32" height="32" style="border: 0; border-radius: 3px; object-fit: cover; flex-shrink: 0;" alt="${escapeHtml(itemName)}" />
        <div>
          <p style="margin: 0; font-size: 13px; line-height: 1.3;">${dropText}</p>
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker?.({ actor }) ?? { actor: actor.id, alias: actorName },
      content: chatContent
    });

    ui.notifications?.info?.(
      game.i18n.format("SYMBAROUMHUD.SimplifiedInventory.DropItemSuccess", { item: itemName })
    );

    return true;
  }
}
