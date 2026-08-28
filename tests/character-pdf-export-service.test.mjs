import assert from "node:assert/strict";
import test from "node:test";

globalThis.game = {
  user: { id: "gm", name: "Mestre", isGM: true },
  users: [{ id: "gm", name: "Mestre", isGM: true }, { id: "player", name: "Erick", isGM: false }],
  i18n: {
    localize: (key) => ({
      "SYMBAROUMHUD.PdfExport.Types.Ability": "Habilidade",
      "SYMBAROUMHUD.PdfExport.Types.MysticalPower": "Poder místico",
      "SYMBAROUMHUD.PdfExport.Types.Ritual": "Ritual"
    })[key] ?? key
  },
  symbaroum: { config: {} }
};

const {
  actorPdfFieldData,
  fillActorPdf,
  summarizeItemForPdf
} = await import("../scripts/services/character-pdf-export-service.mjs");
const { PDFDocument } = await import("../vendor/pdf-lib/pdf-lib.esm.min.js");

function item(name, type, system = {}, flags = {}) {
  return {
    id: name,
    name,
    type,
    system,
    flags,
    getFlag: (scope, key) => flags?.[scope]?.[key]
  };
}

function actorFixture() {
  const creatorState = {
    friendsGroup: {
      companions: [{ name: "Grumpa", race: "Ogro", occupation: "Mercenária", player: "Ana" }],
      group: { name: "Os Corvos", goal: "Explorar Davokar" }
    }
  };
  return {
    id: "actor-1",
    uuid: "Actor.actor-1",
    name: "Aloeta",
    type: "player",
    system: {
      bio: {
        race: "Bárbara",
        occupation: "Bruxa",
        shadow: "Verde musgo com veios vermelhos",
        quote: "A floresta observa.",
        age: "31",
        height: "1,72 m",
        weight: "64 kg",
        appearance: "<p>Olhos atentos e manto gasto.</p><p>Carrega um cajado.</p>",
        background: "Criada nos clãs.",
        personalGoal: "Proteger seu círculo."
      },
      health: {
        toughness: { value: 9, max: 11, threshold: 6 },
        corruption: { temporary: 2, permanent: 1, threshold: 7 }
      },
      attributes: {
        accurate: { total: 10 }, cunning: { total: 9 }, discreet: { total: 7 }, persuasive: { total: 5 },
        quick: { total: 11 }, resolute: { total: 15 }, strong: { total: 13 }, vigilant: { total: 10 }
      },
      weapons: [{
        id: "Espada",
        attribute: "strong",
        attributeLabel: "Vigoroso",
        damage: { displayTextShort: "1d10+1" }
      }],
      armors: [{ id: "Armadura Leve", displayTextShort: "1d6+1", defense: 14 }],
      combat: { id: "Armadura Leve", displayTextShort: "1d6+1", defense: 14 },
      experience: { total: 50, spent: 20, available: 30 },
      money: { thaler: 3, shilling: 4, orteg: 5 }
    },
    items: [
      item("Bruxaria", "ability", {
        novice: { isActive: true, description: "<p>A bruxa reduz a Corrupção recebida e aprende os costumes de sua tradição.</p>" },
        adept: { isActive: false, description: "Texto de adepto." },
        master: { isActive: false, description: "Texto de mestre." }
      }),
      item("Abraço da Natureza", "mysticalPower", {
        novice: { isActive: true, description: "<p>As plantas prendem uma criatura escolhida pela mística.</p>" }
      }),
      item("Círculo de Bruxa", "ritual", { description: "<p>Cria um círculo ritualístico seguro para a bruxa e seus aliados.</p>" }),
      item("Espada", "weapon", { damage: "1d8", qualities: { precise: true } }),
      item("Armadura Leve", "armor", { protection: "1d4", qualities: { flexible: true } }),
      item("Pão de viagem", "equipment", { number: 3 })
    ],
    getFlag: (scope, key) => scope === "symbaroum-hud" && key === "characterCreatorState" ? creatorState : undefined,
    testUserPermission: (user, level) => user.id === "player" && level === "OWNER"
  };
}

test("summarizeItemForPdf strips markup and keeps only active ranks", () => {
  const ability = item("Teste", "ability", {
    novice: { isActive: true, description: `<p>Primeira frase importante.</p><p>${"Texto extenso ".repeat(60)}</p>` },
    adept: { isActive: false, description: "Não deve aparecer." },
    master: { isActive: false, description: "Também não deve aparecer." }
  });
  const summary = summarizeItemForPdf(ability, 120);
  assert.match(summary, /^N: Primeira frase importante\./);
  assert.doesNotMatch(summary, /Não deve aparecer/);
  assert.ok(summary.length <= 120);
  assert.doesNotMatch(summary, /<p>/);
});

test("summarizeItemForPdf honors a custom PDF summary", () => {
  const ability = item("Teste", "ability", {}, {
    "symbaroum-hud": { pdfSummary: "Resumo personalizado para a ficha." }
  });
  assert.equal(summarizeItemForPdf(ability), "Resumo personalizado para a ficha.");
});

test("actorPdfFieldData maps actor, items, ranks, friends, and money", () => {
  const data = actorPdfFieldData(actorFixture());
  assert.equal(data.values.Name, "Aloeta");
  assert.equal(data.values.Race, "Bárbara");
  assert.equal(data.values.Player, "Erick");
  assert.equal(data.values.Resolute, 15);
  assert.equal(data.values.Accurate, 9, "the Portuguese PDF prints Astuto over its internal Accurate field");
  assert.equal(data.values.Persuasive, 10, "the Portuguese PDF prints Preciso over its internal Persuasive field");
  assert.equal(data.values.Strong, 10, "the Portuguese PDF prints Vigilante over its internal Strong field");
  assert.equal(data.values.Vigilant, 13, "the Portuguese PDF prints Vigoroso over its internal Vigilant field");
  assert.equal(data.values["Ability/Power Name 1"], "Bruxaria");
  assert.equal(data.values["Ability/Power Type 2"], "Poder místico");
  assert.equal(data.values["Ability/Power Type 3"], "Ritual");
  assert.equal(data.checks["Check Box 1"], true);
  assert.equal(data.checks["Check Box 2"], false);
  assert.equal(data.values["Equipment 1"], "3x Pão de viagem");
  assert.equal(data.values["Friend Name 1"], "Grumpa");
  assert.equal(data.values.Thaler, 3);
  assert.equal(data.values.Appearance, "Olhos atentos e manto gasto. Carrega um cajado.");
  assert.equal(data.values["Weapon Damage 1"], "1d10+1", "uses damage prepared by the Symbaroum system");
  assert.equal(data.values["Weapon Attribute 1"], "Vigoroso", "uses the prepared attack attribute");
  assert.equal(data.values["Defense Protection 1"], "1d6+1", "uses protection prepared by abilities and armor");
  assert.equal(data.values["Defense 1"], "14", "uses the final prepared defense");
});

test("fillActorPdf preserves editable text fields and checkboxes", async () => {
  const template = await PDFDocument.create();
  const page = template.addPage([600, 800]);
  const form = template.getForm();
  const name = form.createTextField("Name");
  name.addToPage(page, { x: 20, y: 740, width: 200, height: 24 });
  const ability = form.createTextField("Ability/Power Name 1");
  ability.addToPage(page, { x: 20, y: 700, width: 200, height: 24 });
  const summary = form.createTextField("Ability/Power Effect 1");
  summary.enableMultiline();
  summary.addToPage(page, { x: 20, y: 600, width: 400, height: 80 });
  const rank = form.createCheckBox("Check Box 1");
  rank.addToPage(page, { x: 240, y: 700, width: 18, height: 18 });
  const appearance = form.createTextField("Appearance");
  appearance.enableMultiline();
  appearance.addToPage(page, { x: 20, y: 540, width: 400, height: 50 });

  const result = await fillActorPdf(await template.save(), actorFixture());
  const exported = await PDFDocument.load(result.bytes);
  const exportedForm = exported.getForm();
  assert.equal(exportedForm.getTextField("Name").getText(), "Aloeta");
  assert.equal(exportedForm.getTextField("Ability/Power Name 1").getText(), "Bruxaria");
  assert.match(exportedForm.getTextField("Ability/Power Effect 1").getText(), /^N:/);
  assert.equal(exportedForm.getTextField("Appearance").getText(), "Olhos atentos e manto gasto. Carrega um cajado.");
  assert.equal(exportedForm.getCheckBox("Check Box 1").isChecked(), true);
});
