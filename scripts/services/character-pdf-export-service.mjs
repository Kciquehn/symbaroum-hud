import { MODULE_ID, SETTINGS } from "../constants.mjs";

const CREATOR_STATE_FLAG = "characterCreatorState";
const PDF_SUMMARY_FLAG = "pdfSummary";
const PDF_ITEM_TYPES = new Set(["ability", "mysticalPower", "ritual"]);
const RANKS = Object.freeze(["novice", "adept", "master"]);
// The translated official PDF kept the original internal field sequence while
// changing the printed Portuguese labels. These mappings target what is
// visibly printed on the sheet, rather than the misleading AcroForm names.
const ATTRIBUTE_FIELDS = Object.freeze({
  cunning: "Accurate",
  discreet: "Cunning",
  persuasive: "Discreet",
  accurate: "Persuasive",
  quick: "Quick",
  resolute: "Resolute",
  vigilant: "Strong",
  strong: "Vigilant"
});
const EXPORT_LIMITS = Object.freeze({ abilities: 12, weapons: 4, armors: 2, equipment: 21, friends: 5, artifacts: 4 });
const activeExports = new Set();
let pdfLibPromise = null;

function loadPdfLib() {
  pdfLibPromise ??= import("../../vendor/pdf-lib/pdf-lib.esm.min.js");
  return pdfLibPromise;
}

function localize(key) {
  return globalThis.game?.i18n?.localize?.(key) ?? key;
}

function format(key, data) {
  return globalThis.game?.i18n?.format?.(key, data) ?? localize(key);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return [...collection.values()];
  return Array.from(collection);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function valueText(value) {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (typeof value === "object") {
    return value.formula ?? value.value ?? value.total ?? value.base ?? "";
  }
  return String(value);
}

function plainText(value) {
  const html = String(value ?? "");
  if (!html) return "";
  const spacedHtml = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|tr)>/gi, " ");
  let text = spacedHtml;
  if (globalThis.document?.createElement) {
    const element = globalThis.document.createElement("div");
    element.innerHTML = spacedHtml;
    text = element.textContent ?? element.innerText ?? "";
  } else {
    text = spacedHtml.replace(/<[^>]+>/g, " ");
  }
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfSafeText(value) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replaceAll("←", "<-")
    .replaceAll("→", "->")
    .replaceAll("…", "...")
    .replace(/[\u2022\u25cf]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

function truncateAtWord(value, maximum) {
  const text = pdfSafeText(value);
  if (text.length <= maximum) return text;
  const shortened = text.slice(0, Math.max(1, maximum - 3));
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary > maximum * 0.65 ? boundary : shortened.length).trim()}...`;
}

function conciseText(value, maximum = 280) {
  const text = plainText(value);
  if (text.length <= maximum) return pdfSafeText(text);
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  let result = "";
  for (const sentence of sentences) {
    const candidate = `${result} ${sentence}`.trim();
    if (candidate.length > maximum) break;
    result = candidate;
    if (result.length >= maximum * 0.55) break;
  }
  return truncateAtWord(result || text, maximum);
}

function itemFlag(item, key) {
  return item?.getFlag?.(MODULE_ID, key) ?? item?.flags?.[MODULE_ID]?.[key];
}

function itemRankSummary(item, maximum = 285) {
  const custom = String(itemFlag(item, PDF_SUMMARY_FLAG) ?? "").trim();
  if (custom) return truncateAtWord(custom, maximum);
  if (item.type === "ritual") return conciseText(item.system?.description, maximum);

  const activeRanks = RANKS.filter((rank) => item.system?.[rank]?.isActive);
  const ranks = activeRanks.length ? activeRanks : ["novice"];
  const perRank = Math.max(64, Math.floor((maximum - (ranks.length * 5)) / ranks.length));
  const labels = { novice: "N", adept: "A", master: "M" };
  const summaries = ranks.map((rank) => {
    const description = item.system?.[rank]?.description || item.system?.description;
    return `${labels[rank]}: ${conciseText(description, perRank)}`;
  }).filter((summary) => !summary.endsWith(": "));
  return truncateAtWord(summaries.join(" "), maximum);
}

function itemTypeLabel(item) {
  if (item.type === "mysticalPower") return localize("SYMBAROUMHUD.PdfExport.Types.MysticalPower");
  if (item.type === "ritual") return localize("SYMBAROUMHUD.PdfExport.Types.Ritual");
  return localize("SYMBAROUMHUD.PdfExport.Types.Ability");
}

function enabledQualities(item) {
  const qualities = item?.system?.qualities ?? {};
  const config = globalThis.game?.symbaroum?.config?.QUALITIES ?? {};
  return Object.entries(qualities)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([quality]) => {
      const configured = config[quality];
      const label = configured?.label ?? configured ?? quality;
      const localized = typeof label === "string" ? localize(label) : quality;
      return localized === label && label.includes(".") ? quality : localized;
    })
    .join(", ");
}

function artifactPowers(item) {
  return [item.system?.power1, item.system?.power2, item.system?.power3]
    .filter((power) => power?.name || power?.description)
    .map((power) => power.name || conciseText(power.description, 54))
    .join(", ");
}

function artifactCorruption(item) {
  return [item.system?.power1, item.system?.power2, item.system?.power3]
    .map((power) => power?.corruption)
    .filter(Boolean)
    .join(", ");
}

function ownerNames(actor) {
  const users = collectionValues(globalThis.game?.users).filter((user) => {
    if (!user || user.isGM) return false;
    try {
      return actor?.testUserPermission?.(user, "OWNER") ?? false;
    } catch (_error) {
      return false;
    }
  });
  return users.map((user) => user.name).join(", ") || globalThis.game?.user?.name || "";
}

function creatorState(actor) {
  return actor?.getFlag?.(MODULE_ID, CREATOR_STATE_FLAG)
    ?? actor?.flags?.[MODULE_ID]?.[CREATOR_STATE_FLAG]
    ?? {};
}

function actorItems(actor) {
  return collectionValues(actor?.items);
}

function preparedEntry(entries, item) {
  const itemId = item?.id ?? item?._id;
  return collectionValues(entries).find((entry) => {
    const entryId = entry?.id ?? entry?._id;
    return itemId && entryId === itemId;
  });
}

function preparedWeapon(system, item) {
  return preparedEntry(system?.weapons, item);
}

function preparedArmor(system, item) {
  const armor = preparedEntry(system?.armors, item);
  const combatId = system?.combat?.id ?? system?.combat?._id;
  const itemId = item?.id ?? item?._id;
  return itemId && combatId === itemId ? system.combat : armor;
}

export function summarizeItemForPdf(item, maximum = 285) {
  return itemRankSummary(item, maximum);
}

export function actorPdfFieldData(actor) {
  const system = actor?.system ?? {};
  const bio = system.bio ?? {};
  const health = system.health ?? {};
  const experience = system.experience?.experience ?? system.experience ?? {};
  const state = creatorState(actor);
  const friendsGroup = state.friendsGroup ?? {};
  const items = actorItems(actor);
  const abilities = items.filter((item) => PDF_ITEM_TYPES.has(item.type)).slice(0, EXPORT_LIMITS.abilities);
  const weapons = items.filter((item) => item.type === "weapon").slice(0, EXPORT_LIMITS.weapons);
  const armors = items.filter((item) => item.type === "armor").slice(0, EXPORT_LIMITS.armors);
  const artifacts = items.filter((item) => item.type === "artifact").slice(0, EXPORT_LIMITS.artifacts);
  const equipment = items.filter((item) => ![
    ...PDF_ITEM_TYPES, "weapon", "armor", "artifact", "boon", "burden", "trait"
  ].includes(item.type)).slice(0, EXPORT_LIMITS.equipment);
  const friends = (friendsGroup.companions ?? []).slice(0, EXPORT_LIMITS.friends);
  const values = {
    Player: ownerNames(actor),
    Name: actor?.name ?? "",
    Race: plainText(bio.race),
    Occupation: plainText(bio.occupation),
    "Toughness Current": health.toughness?.value,
    "Toughness Maximum": health.toughness?.max,
    "Pain Threshold": health.toughness?.threshold,
    "Corruption Threshold": health.corruption?.threshold,
    "Temporary Corruption": health.corruption?.temporary,
    "Permanent Corruption": health.corruption?.permanent,
    Shadow: plainText(bio.shadow),
    "XP Total": experience.total ?? experience.current,
    "XP Unspent": experience.available ?? Math.max(0, number(experience.total ?? experience.current) - number(experience.spent)),
    Quote: plainText(bio.quote),
    Age: plainText(bio.age),
    Height: plainText(bio.height),
    Weight: plainText(bio.weight),
    Appearance: plainText(bio.appearance),
    Background: plainText(bio.background),
    "Personal Goal": plainText(bio.personalGoal),
    "Group Name": plainText(friendsGroup.group?.name),
    "Group Goal": plainText(friendsGroup.group?.goal),
    Thaler: system.money?.thaler,
    Shilling: system.money?.shilling,
    Orteg: system.money?.orteg,
    "Other Assets": plainText(system.notes)
  };

  for (const [attribute, field] of Object.entries(ATTRIBUTE_FIELDS)) {
    values[field] = system.attributes?.[attribute]?.total ?? system.attributes?.[attribute]?.value;
  }
  abilities.forEach((item, index) => {
    const slot = index + 1;
    values[`Ability/Power Name ${slot}`] = item.name;
    values[`Ability/Power Effect ${slot}`] = summarizeItemForPdf(item);
    values[`Ability/Power Type ${slot}`] = itemTypeLabel(item);
  });
  weapons.forEach((item, index) => {
    const slot = index + 1;
    const prepared = preparedWeapon(system, item);
    values[`Weapon ${slot}`] = item.name;
    values[`Weapon Damage ${slot}`] = valueText(
      prepared?.damage?.displayTextShort
        ?? prepared?.damage?.displayText
        ?? prepared?.damage?.pc
        ?? prepared?.damage?.base
        ?? item.system?.damage
        ?? item.system?.baseDamage
    );
    values[`Weapon Quality ${slot}`] = enabledQualities(item);
    values[`Weapon Attribute ${slot}`] = prepared?.attributeLabel ?? localize(
      globalThis.game?.symbaroum?.config?.ATTRIBUTE_FIELDS?.[prepared?.attribute ?? item.system?.attribute]?.label
        ?? `ATTRIBUTE.${String(prepared?.attribute ?? item.system?.attribute ?? "").toUpperCase()}`
    );
  });
  armors.forEach((item, index) => {
    const slot = index + 1;
    const prepared = preparedArmor(system, item);
    values[`Defense Armor ${slot}`] = item.name;
    values[`Defense Protection ${slot}`] = valueText(
      prepared?.displayTextShort
        ?? prepared?.protectionPc
        ?? prepared?.displayText
        ?? item.system?.protection
        ?? item.system?.baseProtection
    );
    values[`Defense Quality ${slot}`] = enabledQualities(item);
    values[`Defense ${slot}`] = valueText(
      prepared?.defense
        ?? system.combat?.defense
        ?? system.defense?.total
        ?? system.defense?.value
        ?? system.attributes?.quick?.total
    );
  });
  friends.forEach((friend, index) => {
    const slot = index + 1;
    values[`Friend Name ${slot}`] = friend.name;
    values[`Friend Race ${slot}`] = friend.race;
    values[`Friend Occupation ${slot}`] = friend.occupation;
    values[`Friend Player ${slot}`] = friend.player;
  });
  artifacts.forEach((item, index) => {
    values[`Artifact Name.${index}`] = item.name;
    values[`Artifact Powers.${index}`] = artifactPowers(item);
    values[`Artifact Corruption.${index}`] = artifactCorruption(item);
  });
  equipment.forEach((item, index) => {
    const quantity = Math.max(1, number(item.system?.number) || 1);
    values[`Equipment ${index + 1}`] = `${quantity > 1 ? `${quantity}x ` : ""}${item.name}`;
  });

  const checks = {};
  abilities.forEach((item, index) => {
    RANKS.forEach((rank, rankIndex) => {
      checks[`Check Box ${(index * 3) + rankIndex + 1}`] = Boolean(item.system?.[rank]?.isActive);
    });
  });
  return { values, checks, counts: {
    abilities: items.filter((item) => PDF_ITEM_TYPES.has(item.type)).length,
    weapons: items.filter((item) => item.type === "weapon").length,
    armors: items.filter((item) => item.type === "armor").length,
    equipment: items.filter((item) => ![
      ...PDF_ITEM_TYPES, "weapon", "armor", "artifact", "boon", "burden", "trait"
    ].includes(item.type)).length,
    friends: friendsGroup.companions?.length ?? 0,
    artifacts: items.filter((item) => item.type === "artifact").length
  } };
}

function writeTextField(form, name, value) {
  try {
    const field = form.getTextField(name);
    // Actor biography and item fields frequently contain Foundry's HTML editor
    // markup. PDF fields must receive only their visible text.
    let text = pdfSafeText(plainText(value));
    const maximum = field.getMaxLength?.();
    if (Number.isFinite(maximum) && maximum > 0 && text.length > maximum) {
      const compact = name === "Age" ? (text.match(/\d+/)?.[0] ?? text) : text;
      text = compact.slice(0, maximum).trim();
    }
    if (/Ability\/Power Effect|Appearance|Background|Personal Goal|Group Goal|Other Assets/.test(name)) {
      field.enableMultiline();
    }
    if (/Ability\/Power Effect/.test(name)) field.setFontSize(text.length > 230 ? 6 : text.length > 150 ? 7 : 8);
    else if (/Appearance|Background|Personal Goal|Group Goal|Other Assets/.test(name)) field.setFontSize(8);
    field.setText(text);
    return true;
  } catch (_error) {
    return false;
  }
}

function writeCheckBox(form, name, checked) {
  try {
    const field = form.getCheckBox(name);
    if (checked) field.check();
    else field.uncheck();
    return true;
  } catch (_error) {
    return false;
  }
}

export async function fillActorPdf(templateBytes, actor) {
  const { PDFDocument, StandardFonts } = await loadPdfLib();
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: false });
  const form = pdf.getForm();
  // The official sheet marks some empty text boxes as rich-text fields. pdf-lib
  // cannot regenerate appearances for rich text, so normalize them to regular
  // editable AcroForm text fields before filling the document.
  for (const field of form.getFields()) {
    if (typeof field.isRichFormatted === "function" && field.isRichFormatted()) {
      field.disableRichFormatting();
    }
  }
  const data = actorPdfFieldData(actor);
  const missing = [];
  for (const [name, value] of Object.entries(data.values)) {
    if (!writeTextField(form, name, value ?? "")) missing.push(name);
  }
  for (const [name, checked] of Object.entries(data.checks)) {
    if (!writeCheckBox(form, name, checked)) missing.push(name);
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);
  pdf.setTitle(`${actor?.name ?? localize("SYMBAROUMHUD.PdfExport.Character")} - Symbaroum`);
  pdf.setAuthor(ownerNames(actor));
  pdf.setCreator("Symbaroum HUD");
  pdf.setProducer("Symbaroum HUD / pdf-lib");
  return {
    bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false }),
    data,
    missing
  };
}

function exportFileName(actor) {
  const safe = String(actor?.name || "personagem")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe || "personagem"}-symbaroum.pdf`;
}

function routeFor(path) {
  const value = String(path ?? "").trim();
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  return globalThis.foundry?.utils?.getRoute?.(value) ?? value;
}

async function loadTemplate(path) {
  const response = await globalThis.fetch(routeFor(path), { credentials: "same-origin" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function savePdf(bytes, filename) {
  const saveDataToFile = globalThis.foundry?.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  if (typeof saveDataToFile === "function") {
    saveDataToFile(bytes, "application/pdf", filename);
    return;
  }
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canExport(actor) {
  if (!actor || actor.type !== "player" || !globalThis.game?.user) return false;
  try {
    return actor.testUserPermission?.(globalThis.game.user, "OWNER") ?? globalThis.game.user.isGM;
  } catch (_error) {
    return Boolean(globalThis.game.user.isGM);
  }
}

async function chooseTemplatePath(current = "") {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2 ?? globalThis.DialogV2;
  if (!DialogV2) return null;
  return DialogV2.wait({
    classes: ["symbaroum-hud-pdf-template-dialog"],
    window: { title: localize("SYMBAROUMHUD.PdfExport.ConfigureTitle") },
    position: { width: 610 },
    content: `<div class="symbaroum-hud-pdf-template">
      <i class="fa-solid fa-file-pdf" aria-hidden="true"></i>
      <div><h2>${escapeHtml(localize("SYMBAROUMHUD.PdfExport.ConfigureHeading"))}</h2>
        <p>${escapeHtml(localize("SYMBAROUMHUD.PdfExport.ConfigureText"))}</p></div>
      <label><span>${escapeHtml(localize("SYMBAROUMHUD.PdfExport.TemplatePath"))}</span>
        <span><input type="text" name="pdfTemplatePath" value="${escapeHtml(current)}" placeholder="worlds/meu-mundo/ficha-editavel.pdf" required>
          <button type="button" data-pdf-template-browse><i class="fa-solid fa-folder-open" aria-hidden="true"></i>${escapeHtml(localize("SYMBAROUMHUD.PdfExport.Browse"))}</button>
        </span></label>
      <small><i class="fa-solid fa-circle-info" aria-hidden="true"></i>${escapeHtml(localize("SYMBAROUMHUD.PdfExport.CopyrightHint"))}</small>
    </div>`,
    buttons: [{
      action: "save",
      icon: "fa-solid fa-check",
      label: localize("SYMBAROUMHUD.PdfExport.SaveAndUse"),
      default: true,
      callback: (_event, button) => String(button.form?.elements?.pdfTemplatePath?.value ?? "").trim()
    }, {
      action: "cancel",
      label: localize("Cancel"),
      callback: () => null
    }],
    rejectClose: false,
    render: (_event, dialog) => {
      dialog.element?.querySelector("[data-pdf-template-browse]")?.addEventListener("click", () => {
        const FilePicker = globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
        const input = dialog.element?.querySelector('input[name="pdfTemplatePath"]');
        if (!FilePicker || !input) return;
        new FilePicker({
          type: "any",
          current: input.value,
          callback: (path) => { input.value = path; }
        }).render();
      });
    }
  });
}

function overflowWarnings(data) {
  return Object.entries(EXPORT_LIMITS)
    .filter(([key, limit]) => number(data.counts?.[key]) > limit)
    .map(([key, limit]) => format("SYMBAROUMHUD.PdfExport.OverflowEntry", {
      section: localize(`SYMBAROUMHUD.PdfExport.Sections.${key}`),
      count: data.counts[key],
      limit
    }));
}

export class CharacterPdfExportService {
  static canExport(actor) {
    return canExport(actor);
  }

  static async export(actor) {
    if (!canExport(actor)) return null;
    const key = actor.uuid ?? actor.id;
    if (activeExports.has(key)) return null;
    activeExports.add(key);
    try {
      let path = String(globalThis.game.settings.get(MODULE_ID, SETTINGS.PDF_TEMPLATE_PATH) ?? "").trim();
      if (!path) {
        if (!globalThis.game.user.isGM) {
          globalThis.ui.notifications?.warn(localize("SYMBAROUMHUD.PdfExport.MissingPlayerTemplate"));
          return null;
        }
        path = await chooseTemplatePath(path);
        if (!path) return null;
        if (!/\.pdf(?:$|[?#])/i.test(path)) {
          globalThis.ui.notifications?.warn(localize("SYMBAROUMHUD.PdfExport.InvalidTemplate"));
          return null;
        }
        await globalThis.game.settings.set(MODULE_ID, SETTINGS.PDF_TEMPLATE_PATH, path);
      }
      globalThis.ui.notifications?.info(localize("SYMBAROUMHUD.PdfExport.Exporting"));
      const template = await loadTemplate(path);
      const result = await fillActorPdf(template, actor);
      savePdf(result.bytes, exportFileName(actor));
      const warnings = overflowWarnings(result.data);
      if (warnings.length) globalThis.ui.notifications?.warn(warnings.join(" "));
      if (result.missing.length) console.warn(`${MODULE_ID} | Missing PDF fields`, result.missing);
      globalThis.ui.notifications?.info(localize("SYMBAROUMHUD.PdfExport.Success"));
      return result;
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to export Actor PDF`, error);
      globalThis.ui.notifications?.error(format("SYMBAROUMHUD.PdfExport.Failed", { error: error?.message ?? error }));
      return null;
    } finally {
      activeExports.delete(key);
    }
  }
}

function attachPdfExportHeaderButton(sheet, html, actor) {
  if (!canExport(actor)) return;
  const candidates = [html, html?.[0], sheet?.element, sheet?.element?.[0]];
  const root = candidates.find((candidate) => candidate?.querySelector?.(".window-header"));
  const header = root?.querySelector?.(".window-header");
  if (!header || header.querySelector(".symbaroum-hud-export-character-pdf")) return;
  const button = root.ownerDocument.createElement("button");
  const label = localize("SYMBAROUMHUD.PdfExport.Button");
  button.type = "button";
  button.className = "header-control symbaroum-hud-export-character-pdf";
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<i class="fa-solid fa-file-pdf" aria-hidden="true"></i><span>${escapeHtml(label)}</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void CharacterPdfExportService.export(actor);
  });
  (header.querySelector(".window-controls") ?? header).prepend(button);
}

export function registerCharacterPdfExportHooks() {
  const handleSheet = (sheet, html) => {
    const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
    attachPdfExportHeaderButton(sheet, html, actor);
  };
  globalThis.Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
    if (!canExport(actor)) return;
    if (buttons.some((button) => button.class === "symbaroum-hud-export-character-pdf")) return;
    buttons.unshift({
      label: localize("SYMBAROUMHUD.PdfExport.Button"),
      class: "symbaroum-hud-export-character-pdf",
      icon: "fas fa-file-pdf",
      onclick: () => void CharacterPdfExportService.export(actor)
    });
  });
  globalThis.Hooks.on("renderActorSheet", handleSheet);
  globalThis.Hooks.on("renderSymbaroumActorSheet", handleSheet);
}
