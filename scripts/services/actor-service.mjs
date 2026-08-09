import { SELECTION_MODES, SUPPORTED_ACTOR_TYPES } from "../constants.mjs";
import { SymbaroumIntegration } from "../integrations/symbaroum.mjs";

const TRAIT_LIKE_ITEM_TYPES = new Set(["trait", "boon", "burden"]);
const USABLE_POWER_ACTIONS = new Set(["A", "F", "M", "R", "S", "T"]);
const REROLL_COSTS = new Set(["experience", "corruption"]);

export function isTraitLikeItem(item) {
  return TRAIT_LIKE_ITEM_TYPES.has(item?.type)
    || Boolean(item?.system?.isTrait)
    || Boolean(item?.system?.isBoon)
    || Boolean(item?.system?.isBurden);
}

export function canUsePowerItem(item) {
  if (!item?.system?.isPower || !item.system?.hasScript) {
    return false;
  }

  const system = item.system;
  return ["novice", "adept", "master"].some((level) => {
    const source = system[level] ?? {};
    const active = level === "novice"
      ? Boolean(source.isActive || system.marker)
      : Boolean(source.isActive && !system.marker);
    if (!active) return false;

    const action = String(source.action ?? "").trim().toUpperCase();
    return USABLE_POWER_ACTIONS.has(action);
  });
}

export class ActorService {
  static resolve(mode) {
    const controlledActors = (canvas?.tokens?.controlled ?? [])
      .map((token) => token.actor);
    if (game.user?.isGM) {
      const controlledActor = controlledActors.find((actor) => this.isUsable(actor));
      if (controlledActor) return controlledActor;
    }

    const candidates = mode === SELECTION_MODES.COMBAT
      ? [game.combat?.combatant?.actor]
      : mode === SELECTION_MODES.CHARACTER
        ? [game.user?.character]
        : [
            ...controlledActors,
            game.combat?.combatant?.actor,
            game.user?.character
          ];

    return candidates.find((actor) => this.isUsable(actor)) ?? null;
  }

  static isUsable(actor) {
    return Boolean(
      actor
      && SUPPORTED_ACTOR_TYPES.has(actor.type)
      && actor.testUserPermission?.(game.user, "OBSERVER")
    );
  }

  static canUpdate(actor) {
    return Boolean(actor?.testUserPermission?.(game.user, "OWNER"));
  }

  static accessibleActors(current = null) {
    const worldActors = Array.from(game.actors ?? []);
    const currentKey = current?.uuid ?? current?.id;
    const currentIsInWorld = currentKey && worldActors.some((actor) => (
      (actor.uuid ?? actor.id) === currentKey
    ));
    const actors = current && !currentIsInWorld
      ? [current, ...worldActors]
      : worldActors;
    const seen = new Set();

    return actors.filter((actor) => {
      if (!this.isUsable(actor)) return false;
      const key = actor.uuid ?? actor.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  static weapon(actor, id) {
    if (!actor || !id) return null;
    return (actor.system?.weapons ?? []).find((weapon) => weapon.id === id) ?? null;
  }

  static item(actor, id) {
    return actor?.items?.get?.(id) ?? null;
  }

  static async rollAttribute(actor, attribute) {
    if (!this.#canAct(actor) || !actor.system?.attributes?.[attribute]) return;
    return actor.rollAttribute(attribute);
  }

  static async rollArmor(actor) {
    if (!this.#canAct(actor) || typeof actor.rollArmor !== "function") return;
    return actor.rollArmor();
  }

  static async rollDeathTest(actor, { showDialog = false } = {}) {
    if (!this.#canAct(actor) || actor.type !== "player") return;
    return SymbaroumIntegration.rollDeathTest(actor, { showDialog });
  }

  static async recoverDeath(actor) {
    if (!this.#canAct(actor) || actor.type !== "player") return;
    return actor.update({ "system.nbrOfFailedDeathRoll": 0 });
  }

  static async removeEffect(actor, id) {
    if (!this.#canAct(actor) || !id) return;
    const effect = actor.effects?.get?.(id)
      ?? Array.from(actor.effects ?? []).find((entry) => entry.id === id);
    if (!effect || typeof effect.delete !== "function") return;
    return effect.delete();
  }

  static async rollWeapon(actor, id) {
    const weapon = this.weapon(actor, id);
    if (!this.#canAct(actor) || !weapon || typeof actor.rollWeapon !== "function") return;
    return actor.rollWeapon(weapon);
  }

  static async usePower(actor, id) {
    const item = this.item(actor, id);
    if (
      !this.#canAct(actor)
      || !item
      || !canUsePowerItem(item)
      || typeof actor.usePower !== "function"
    ) return;
    return actor.usePower(item);
  }

  static async setAbilityLevelActive(actor, id, level, active) {
    const item = this.item(actor, id);
    if (
      !this.#canAct(actor)
      || !item?.system?.isPower
      || isTraitLikeItem(item)
      || !["novice", "adept", "master"].includes(level)
      || typeof item.update !== "function"
    ) {
      return;
    }

    return item.update({ [`system.${level}.isActive`]: Boolean(active) });
  }

  static availableWorldAbilities(actor) {
    const known = new Set(Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
      .filter((item) => item?.type === "ability")
      .map(abilityIdentity)
      .filter(Boolean));

    return Array.from(game.items ?? [])
      .filter((item) => item?.type === "ability")
      .filter((item) => item.testUserPermission?.(game.user, "OBSERVER") ?? true)
      .filter((item) => !known.has(abilityIdentity(item)))
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
  }

  static availableWorldRituals(actor) {
    const known = new Set(Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
      .filter(isRitualItem)
      .map(abilityIdentity)
      .filter(Boolean));

    return Array.from(game.items ?? [])
      .filter(isRitualItem)
      .filter((item) => item.testUserPermission?.(game.user, "OBSERVER") ?? true)
      .filter((item) => !known.has(abilityIdentity(item)))
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
  }

  static async buyWorldAbility(actor, itemId) {
    if (
      !this.#canAct(actor)
      || actor.type !== "player"
      || typeof actor.createEmbeddedDocuments !== "function"
    ) return;

    const item = this.availableWorldAbilities(actor)
      .find((candidate) => candidate.id === itemId);
    if (!item) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.AbilityUnavailable"));
      return;
    }

    const noviceCost = Number(game.symbaroum?.config?.expCosts?.power?.novice) || 10;
    const available = Number(actor.system?.experience?.available);
    if (Number.isFinite(available) && available < noviceCost) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NotEnoughExperience"));
      return;
    }

    const source = item.toObject?.() ?? item;
    const data = foundry.utils.deepClone(source);
    delete data._id;
    data.system ??= {};
    data.system.novice ??= {};
    data.system.adept ??= {};
    data.system.master ??= {};
    data.system.novice.isActive = true;
    data.system.adept.isActive = false;
    data.system.master.isActive = false;

    const created = await actor.createEmbeddedDocuments("Item", [data]);
    return created?.[0] ?? null;
  }

  static async buyWorldRitual(actor, itemId) {
    if (
      !this.#canAct(actor)
      || actor.type !== "player"
      || typeof actor.createEmbeddedDocuments !== "function"
    ) return;

    const item = this.availableWorldRituals(actor)
      .find((candidate) => candidate.id === itemId);
    if (!item) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.RitualUnavailable"));
      return;
    }

    const source = item.toObject?.() ?? item;
    const data = foundry.utils.deepClone(source);
    delete data._id;

    const created = await actor.createEmbeddedDocuments("Item", [data]);
    return created?.[0] ?? null;
  }

  static async importTraitLikeItem(actor, dropData) {
    if (!this.#canAct(actor) || dropData?.type !== "Item") return;

    const ItemClass = globalThis.Item?.implementation
      ?? globalThis.CONFIG?.Item?.documentClass;
    if (typeof ItemClass?.fromDropData !== "function") return;

    const item = await ItemClass.fromDropData(dropData);
    const canObserve = typeof item?.testUserPermission !== "function"
      || item.testUserPermission(game.user, "OBSERVER");
    if (item?.documentName !== "Item" || !canObserve || !isTraitLikeItem(item)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.OnlyTraits"));
      return;
    }

    if (actor.uuid && item.parent?.uuid === actor.uuid) return item;
    if (typeof actor.createEmbeddedDocuments !== "function") return;

    const source = item.toObject?.() ?? item;
    const data = foundry.utils.deepClone(source);
    delete data._id;

    const created = await actor.createEmbeddedDocuments("Item", [data]);
    return created?.[0] ?? null;
  }

  static async payRerollCost(actor, cost) {
    if (!this.#canAct(actor) || actor.type !== "player" || !REROLL_COSTS.has(cost)) return;

    const experience = actor.system?.experience ?? {};
    const corruption = actor.system?.health?.corruption ?? {};
    const actorName = actor.name ?? game.i18n.localize("SYMBAROUMHUD.Empty");
    const costLabel = cost === "experience"
      ? game.i18n.localize("SYMBAROUMHUD.RerollCost.Experience")
      : game.i18n.localize("SYMBAROUMHUD.RerollCost.PermanentCorruption");

    if (cost === "experience") {
      const available = Number(experience.available ?? (
        (Number(experience.total) || 0)
        - (Number(experience.artifactrr) || 0)
        - (Number(experience.spent) || 0)
      ));
      if (!Number.isFinite(available) || available < 1) {
        ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoAvailableExperience"));
        return;
      }

      await actor.update({
        "system.experience.artifactrr": (Number(experience.artifactrr) || 0) + 1
      });
    } else {
      const permanent = Number(corruption.permanent) || 0;
      const max = Number(corruption.max);
      if (Number.isFinite(max) && permanent >= max) {
        ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.CorruptionMaximumReached"));
        return;
      }

      await actor.update({
        "system.health.corruption.permanent": permanent + 1
      });
    }

    await ChatMessage.create({
      speaker: { actor: actor.id },
      rollMode: game.settings?.get?.("core", "rollMode"),
      content: `<h2>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.RerollCost.ChatTitle"))}</h2>
        <p>${escapeHtml(actorName)} ${escapeHtml(game.i18n.localize("SYMBAROUMHUD.RerollCost.ChatPaid"))} 1 ${escapeHtml(costLabel)}.</p>`
    });

    return true;
  }

  static async openItem(actor, id) {
    const item = this.item(actor, id);
    if (!item || !item.testUserPermission?.(game.user, "OBSERVER")) return;
    return item.sheet?.render(true);
  }

  static async adjust(actor, path, delta) {
    if (!this.canUpdate(actor)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }

    const value = Number(foundry.utils.getProperty(actor, path));
    if (!Number.isFinite(value) || !Number.isFinite(delta)) return;

    const limits = this.#limits(actor, path);
    const next = Math.clamp(value + delta, limits.min, limits.max);
    if (next === value) return;

    const corruptionAlert = path === "system.health.corruption.temporary" && next > value
      ? this.#corruptionAlert(actor, next - value)
      : null;
    const defeated = path === "system.health.toughness.value" && value > 0 && next === 0;
    const result = await actor.update({ [path]: next });
    if (corruptionAlert) await this.#postCorruptionAlert(actor, corruptionAlert);
    if (defeated) await this.#handleDefeat(actor);
    return result;
  }

  static async #handleDefeat(actor) {
    await actor.addCondition?.("dead");
    ui.notifications.warn(game.i18n.localize("EFFECT.StatusDead"));

    const render = globalThis.foundry?.applications?.handlebars?.renderTemplate
      ?? globalThis.renderTemplate;
    if (typeof render !== "function") return;

    const actorName = String(actor.name ?? "");
    const deadEffect = globalThis.CONFIG?.statusEffects?.find?.((effect) => effect.id === "dead");
    const content = await render("systems/symbaroum/template/chat/ability.hbs", {
      targetData: false,
      hasTarget: false,
      introText: game.i18n.format("CHAT.DEAD", { name: actorName }),
      introImg: actor.img,
      targetText: "",
      subText: "",
      subImg: deadEffect?.img ?? "icons/svg/skull.svg",
      hasRoll: false,
      rollString: "",
      rollResult: "",
      resultText: "",
      finalText: actorName + game.i18n.localize("COMBAT.CHAT_DAMAGE_DYING"),
      haveCorruption: false,
      corruptionText: ""
    });
    const chatData = { user: game.user.id, content };
    if (!actor.hasPlayerOwner) {
      const recipients = ChatMessage.getWhisperRecipients?.("GM") ?? [];
      if (recipients.length > 0) chatData.whisper = recipients;
    }
    await ChatMessage.create(chatData);
  }

  static #corruptionAlert(actor, gained) {
    const corruption = actor.system?.health?.corruption ?? {};
    const threshold = Number(corruption.threshold);
    if (!Number.isFinite(threshold) || threshold <= 0) return null;

    const derivedValue = Number(corruption.value);
    const current = Number.isFinite(derivedValue)
      ? derivedValue
      : [corruption.temporary, corruption.longterm, corruption.permanent]
          .reduce((total, value) => total + (Number(value) || 0), 0);
    const maximum = Number(corruption.max);
    const next = current + gained;

    if (current < threshold) {
      if (next >= threshold) {
        return {
          finalKey: "CORRUPTION.CHAT_THRESHOLD",
          image: "icons/magic/acid/dissolve-arm-flesh.webp",
          introKey: "CORRUPTION.CHAT_INTRO"
        };
      }
      if (next === threshold - 1) return corruptionWarning();
      return null;
    }

    if (Number.isFinite(maximum) && current < maximum) {
      if (next >= maximum) {
        return {
          finalKey: "CORRUPTION.CHAT_MAX",
          image: "icons/creatures/unholy/demon-horned-winged-laughing.webp",
          introKey: "CORRUPTION.CHAT_INTRO"
        };
      }
      if (next === maximum - 1) return corruptionWarning();
    }

    return null;
  }

  static async #postCorruptionAlert(actor, alert) {
    const render = globalThis.foundry?.applications?.handlebars?.renderTemplate
      ?? globalThis.renderTemplate;
    if (typeof render !== "function") return;

    const actorName = String(actor.name ?? "");
    const content = await render("systems/symbaroum/template/chat/ability.hbs", {
      targetData: false,
      hasTarget: false,
      introText: actorName + game.i18n.localize(alert.introKey),
      introImg: actor.img,
      targetText: "",
      subText: "",
      subImg: alert.image,
      hasRoll: false,
      rollString: "",
      rollResult: "",
      resultText: "",
      finalText: actorName + game.i18n.localize(alert.finalKey),
      haveCorruption: false,
      corruptionText: ""
    });
    const chatData = { user: game.user.id, content };
    if (!actor.hasPlayerOwner) {
      const recipients = ChatMessage.getWhisperRecipients?.("GM") ?? [];
      if (recipients.length > 0) chatData.whisper = recipients;
    }
    await ChatMessage.create(chatData);
  }

  static #limits(actor, path) {
    if (path === "system.health.toughness.value") {
      return {
        min: 0,
        max: Math.max(0, Number(actor.system?.health?.toughness?.max) || 0)
      };
    }

    if (path === "system.health.corruption.temporary") {
      const corruption = actor.system?.health?.corruption ?? {};
      return {
        min: 0,
        max: Math.max(0, (Number(corruption.max) || 0) - (Number(corruption.permanent) || 0))
      };
    }

    return { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER };
  }

  static #canAct(actor) {
    if (this.isUsable(actor) && this.canUpdate(actor)) return true;
    ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
    return false;
  }
}

function abilityIdentity(item) {
  const reference = String(item?.system?.reference ?? "").trim().toLocaleLowerCase();
  if (reference) return `reference:${reference}`;
  const name = String(item?.name ?? "").trim().toLocaleLowerCase();
  return name ? `name:${name}` : null;
}

function isRitualItem(item) {
  return item?.type === "ritual" || Boolean(item?.system?.isRitual);
}

function corruptionWarning() {
  return {
    finalKey: "CORRUPTION.CHAT_WARNING",
    image: "icons/magic/air/wind-vortex-swirl-purple.webp",
    introKey: "CORRUPTION.CHAT_WARNING"
  };
}

function escapeHtml(value) {
  const text = String(value ?? "");
  return globalThis.foundry?.utils?.escapeHTML?.(text)
    ?? text.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
}
