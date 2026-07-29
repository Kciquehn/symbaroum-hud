import { ActorService, canUsePowerItem, isTraitLikeItem } from "./actor-service.mjs";
import { IndResourcesIntegration } from "../integrations/ind-resources.mjs";

const INVENTORY_TYPES = new Set(["equipment", "artifact", "boon", "burden"]);

export class ContextService {
  static build(actor, { showIndResources = true } = {}) {
    if (!actor) {
      return {
        hasActor: false,
        emptyMessage: game.i18n.localize("SYMBAROUMHUD.Empty")
      };
    }

    const corruption = actor.system?.health?.corruption ?? {};
    const toughness = actor.system?.health?.toughness ?? {};
    const items = Array.from(actor.items ?? []);

    return {
      hasActor: true,
      actor: {
        id: actor.id,
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        type: actor.type,
        typeLabel: game.i18n.localize(`SYMBAROUMHUD.ActorTypes.${actor.type}`),
        canUpdate: ActorService.canUpdate(actor)
      },
      toughness: {
        value: number(toughness.value),
        max: number(toughness.max),
        threshold: number(toughness.threshold)
      },
      corruption: {
        temporary: number(corruption.temporary),
        permanent: number(corruption.permanent),
        total: number(corruption.value, number(corruption.temporary) + number(corruption.permanent)),
        max: number(corruption.max),
        threshold: number(corruption.threshold)
      },
      defense: {
        value: defenseValue(actor),
        armor: actor.system?.combat?.name ?? game.i18n.localize("SYMBAROUMHUD.Sections.Armor")
      },
      attributes: Object.entries(actor.system?.attributes ?? {}).map(([id, attribute]) => ({
        id,
        label: game.i18n.localize(attribute.label),
        value: number(attribute.total, number(attribute.value)),
        base: number(attribute.value),
        modifier: number(attribute.temporaryMod)
      })),
      weapons: (actor.system?.weapons ?? []).map((weapon) => ({
        id: weapon.id,
        name: weapon.name,
        img: weapon.img,
        damage: weaponDamageLabel(weapon.damage),
        attribute: weapon.attribute,
        active: true
      })),
      powers: sortItems(items.filter((item) => (
        item.system?.isPower && !isTraitLikeItem(item)
      ))).map(itemContext),
      traits: sortItems(items.filter((item) => (
        item.system?.isPower && isTraitLikeItem(item)
      ))).map(itemContext),
      rituals: sortItems(items.filter((item) => item.type === "ritual")).map(itemContext),
      inventory: sortItems(items.filter((item) => (
        INVENTORY_TYPES.has(item.type) && !item.system?.isPower
      ))).map(itemContext),
      effects: Array.from(actor.effects ?? [], (effect) => ({
        id: effect.id,
        name: effect.name,
        img: effect.img,
        disabled: Boolean(effect.disabled),
        suppressed: Boolean(effect.isSuppressed)
      })).filter((effect) => !effect.disabled && !effect.suppressed),
      indResources: showIndResources
        ? IndResourcesIntegration.context(actor)
        : { active: false }
    };
  }
}

function defenseValue(actor) {
  const defense = actor.system?.combat?.defense;
  if (Number.isFinite(Number(defense))) return Number(defense);

  const attributeId = actor.system?.defense?.attribute ?? "quick";
  return number(actor.system?.attributes?.[attributeId]?.total);
}

function itemContext(item) {
  const canUsePower = canUsePowerItem(item);

  return {
    id: item.id,
    name: item.name,
    img: item.img,
    type: item.type,
    typeLabel: game.i18n.localize(`ITEM.Type${item.type}`),
    action: canUsePower ? "use-power" : "open-item",
    active: Boolean(item.system?.isActive ?? item.system?.active ?? true)
  };
}

function sortItems(items) {
  return items.sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
}

function weaponDamageLabel(damage) {
  if (damage === null || damage === undefined) return "";
  if (typeof damage !== "object") return String(damage);

  for (const value of [
    damage.displayTextShort,
    damage.displayText,
    damage.pc,
    damage.base,
    damage.npc
  ]) {
    if (value !== null && value !== undefined && typeof value !== "object") {
      return String(value);
    }
  }

  return "";
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}
