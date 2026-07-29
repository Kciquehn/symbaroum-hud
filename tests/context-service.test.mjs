import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  user: { id: "user" },
  i18n: {
    lang: "en",
    localize: (key) => key
  },
  modules: new Map()
};

const { ContextService } = await import("../scripts/services/context-service.mjs");

function actorWithDamage(damage) {
  return {
    id: "actor",
    uuid: "Actor.actor",
    name: "Hero",
    img: "hero.webp",
    type: "player",
    items: [],
    effects: [],
    testUserPermission: () => true,
    system: {
      health: {
        toughness: { value: 10, max: 10 },
        corruption: { temporary: 0, permanent: 0, max: 10 }
      },
      attributes: {},
      weapons: [{
        id: "weapon",
        name: "Sword",
        img: "sword.webp",
        damage
      }]
    }
  };
}

test("uses the prepared Symbaroum weapon damage label", () => {
  const context = ContextService.build(actorWithDamage({
    base: "1d8",
    displayText: "1d8+1[Bonus]",
    displayTextShort: "1d8+1"
  }), { showIndResources: false });

  assert.equal(context.weapons[0].damage, "1d8+1");
});

test("never exposes a weapon damage object to Handlebars", () => {
  const context = ContextService.build(actorWithDamage({ nested: {} }), {
    showIndResources: false
  });

  assert.equal(context.weapons[0].damage, "");
});

test("uses the prepared isPower flag and omits suppressed effects", () => {
  const actor = actorWithDamage("1d8");
  actor.items = [
    {
      id: "power",
      name: "Dom",
      img: "power.webp",
      type: "ability",
      system: {
        isPower: true,
        hasScript: true,
        novice: { isActive: true, action: "A" }
      }
    },
    {
      id: "trait",
      name: "Traço",
      img: "trait.webp",
      type: "trait",
      system: { isPower: true, isTrait: true }
    },
    {
      id: "gear",
      name: "Ferramenta",
      img: "gear.webp",
      type: "boon",
      system: { isPower: false }
    }
  ];
  actor.effects = [
    { id: "active", name: "Ativo", img: "active.webp" },
    {
      id: "suppressed",
      name: "Suprimido",
      img: "suppressed.webp",
      isSuppressed: true
    }
  ];

  const context = ContextService.build(actor, { showIndResources: false });

  assert.deepEqual(context.powers.map((item) => item.id), ["power"]);
  assert.deepEqual(context.traits.map((item) => item.id), ["trait"]);
  assert.equal(context.powers[0].action, "use-power");
  assert.equal(context.traits[0].action, "open-item");
  assert.deepEqual(context.inventory.map((item) => item.id), ["gear"]);
  assert.deepEqual(context.effects.map((effect) => effect.id), ["active"]);
});
