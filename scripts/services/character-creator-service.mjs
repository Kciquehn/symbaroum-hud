import { MODULE_ID } from "../constants.mjs";
import {
  CORE_OCCUPATIONS,
  OCCUPATION_ARCHETYPES,
  coreOccupation
} from "../data/core-occupations.mjs";
import {
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  ATTRIBUTE_POINT_TOTAL,
  CORE_ATTRIBUTES,
  TYPICAL_ATTRIBUTE_VALUES,
  availableTypicalValues,
  isValidPointBuyDistribution,
  isValidTypicalDistribution
} from "../data/core-attributes.mjs";
import {
  CORE_RACES,
  coreRace,
  coreRaceTrait
} from "../data/core-races.mjs";

const MODE_FLAG = "characterCreationMode";
const STATE_FLAG = "characterCreatorState";
const OCCUPATION_STEP_COMPLETE = "occupation-complete";
const ATTRIBUTES_STEP_COMPLETE = "attributes-complete";
const RACE_STEP_COMPLETE = "race-complete";
const ATTRIBUTE_DISTRIBUTION_MODES = Object.freeze({
  TYPICAL: "typical",
  POINT_BUY: "point-buy"
});
const BIOGRAPHY_FIELDS = Object.freeze([
  "race",
  "occupation",
  "shadow",
  "quote",
  "age",
  "height",
  "weight",
  "appearance",
  "background",
  "personalGoal",
  "stigmas"
]);
const pendingActors = new Set();

export const CHARACTER_CREATION_MODES = Object.freeze({
  CREATOR: "creator",
  MANUAL: "manual"
});

export function isBlankPlayerActor(actor) {
  if (!actor || actor.type !== "player") return false;
  if (actorItems(actor).length > 0) return false;

  const bio = actor.system?.bio ?? {};
  if (BIOGRAPHY_FIELDS.some((field) => hasText(bio[field]))) return false;
  return !hasText(actor.system?.notes);
}

export function shouldOfferCharacterCreator(actor, user = game.user) {
  return Boolean(
    isBlankPlayerActor(actor)
    && canOwn(actor, user)
    && !actor.getFlag?.(MODULE_ID, MODE_FLAG)
  );
}

export function isOccupationStepComplete(actor) {
  return [OCCUPATION_STEP_COMPLETE, ATTRIBUTES_STEP_COMPLETE, RACE_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isAttributesStepComplete(actor) {
  return [ATTRIBUTES_STEP_COMPLETE, RACE_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isRaceStepComplete(actor) {
  return actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step === RACE_STEP_COMPLETE;
}

export function registerCharacterCreatorHooks() {
  const handleSheet = (sheet) => {
    const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
    void CharacterCreatorService.handleSheet(actor);
  };
  Hooks.on("renderActorSheet", handleSheet);
  Hooks.on("renderSymbaroumActorSheet", handleSheet);
}

export class CharacterCreatorService {
  static async handleSheet(actor) {
    if (!actor || actor.type !== "player" || !canOwn(actor, game.user)) return null;
    const mode = actor.getFlag?.(MODULE_ID, MODE_FLAG);
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isOccupationStepComplete(actor)) {
      return this.openOccupationStep(actor);
    }
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isAttributesStepComplete(actor)) {
      return this.openAttributesStep(actor);
    }
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isRaceStepComplete(actor)) {
      return this.openRaceStep(actor);
    }
    if (!mode) return this.offer(actor);
    return null;
  }

  static async offer(actor) {
    const key = actorKey(actor);
    if (!key || pendingActors.has(key) || !shouldOfferCharacterCreator(actor)) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;

    pendingActors.add(key);
    try {
      const choice = await DialogV2.wait({
        classes: ["symbaroum-hud-character-creator-dialog"],
        window: {
          title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Title")
        },
        content: characterCreatorChoiceContent(),
        buttons: [
          {
            action: CHARACTER_CREATION_MODES.CREATOR,
            icon: "fa-solid fa-wand-magic-sparkles",
            label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.UseCreator"),
            default: true,
            callback: () => CHARACTER_CREATION_MODES.CREATOR
          },
          {
            action: CHARACTER_CREATION_MODES.MANUAL,
            icon: "fa-solid fa-pen-nib",
            label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.FillManually"),
            callback: () => CHARACTER_CREATION_MODES.MANUAL
          }
        ],
        close: () => null,
        rejectClose: false
      });

      if (!Object.values(CHARACTER_CREATION_MODES).includes(choice)) return null;
      await actor.setFlag(MODULE_ID, MODE_FLAG, choice);
      if (choice === CHARACTER_CREATION_MODES.CREATOR) {
        Hooks.callAll(`${MODULE_ID}.characterCreatorRequested`, actor);
        const occupation = await this.#showOccupationBook(DialogV2, actor);
        if (occupation) {
          const attributes = await this.#showAttributesBook(DialogV2, actor);
          if (attributes) await this.#showRaceBook(DialogV2, actor);
        }
      }
      return choice;
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openOccupationStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || isOccupationStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;

    pendingActors.add(key);
    try {
      const occupation = await this.#showOccupationBook(DialogV2, actor);
      if (!occupation) return occupation;
      const attributes = await this.#showAttributesBook(DialogV2, actor);
      if (!attributes) return attributes;
      return await this.#showRaceBook(DialogV2, actor);
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openAttributesStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isOccupationStepComplete(actor)
      || isAttributesStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;

    pendingActors.add(key);
    try {
      const attributes = await this.#showAttributesBook(DialogV2, actor);
      if (!attributes) return attributes;
      await this.#showRaceBook(DialogV2, actor);
      return attributes;
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openRaceStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isAttributesStepComplete(actor)
      || isRaceStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#showRaceBook(DialogV2, actor);
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async #showOccupationBook(DialogV2, actor) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog"
      ],
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Occupation.Title")
      },
      position: { width: 860, height: 550 },
      content: occupationBookContent(actor),
      buttons: [
        {
          action: "choose-occupation",
          icon: "fa-solid fa-feather-pointed",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Occupation.Choose"),
          default: true,
          callback: async (_event, button) => {
            const occupation = coreOccupation(button.form.elements.occupation?.value);
            if (!occupation) return null;

            const name = game.i18n.localize(occupation.name);
            await actor.update({ "system.bio.occupation": name });
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              version: 1,
              step: OCCUPATION_STEP_COMPLETE,
              archetype: occupation.archetype,
              occupation: occupation.id
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "occupation",
              archetype: occupation.archetype,
              occupation: occupation.id
            });
            return occupation.id;
          }
        },
        {
          action: "continue-later",
          icon: "fa-solid fa-bookmark",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Occupation.ContinueLater"),
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindOccupationBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showAttributesBook(DialogV2, actor) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-attributes-book-dialog"
      ],
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Attributes.Title")
      },
      position: { width: 860, height: 550 },
      content: attributesBookContent(actor),
      buttons: [
        {
          action: "choose-attributes",
          icon: "fa-solid fa-dice-d20",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Attributes.Choose"),
          default: true,
          callback: async (_event, button) => {
            const mode = formValue(button.form, "attributeDistributionMode");
            const values = attributeValuesFromForm(button.form, mode);
            const valid = mode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL
              ? isValidTypicalDistribution(values)
              : isValidPointBuyDistribution(values);
            if (!valid) {
              ui.notifications?.warn(
                game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Attributes.Invalid")
              );
              return null;
            }

            const update = Object.fromEntries(CORE_ATTRIBUTES.map((attribute, index) => [
              `system.attributes.${attribute.id}.value`,
              values[index]
            ]));
            await actor.update(update);
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: ATTRIBUTES_STEP_COMPLETE,
              attributeDistribution: mode,
              attributes: Object.fromEntries(CORE_ATTRIBUTES.map((attribute, index) => [
                attribute.id,
                values[index]
              ]))
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "attributes",
              mode,
              attributes: values
            });
            return values;
          }
        },
        {
          action: "continue-later",
          icon: "fa-solid fa-bookmark",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Attributes.ContinueLater"),
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindAttributesBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showRaceBook(DialogV2, actor) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-race-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.Title") },
      position: { width: 860, height: 550 },
      content: raceBookContent(actor),
      buttons: [
        {
          action: "choose-race",
          icon: "fa-solid fa-people-group",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.Choose"),
          default: true,
          callback: async (_event, button) => {
            const race = coreRace(formValue(button.form, "race"));
            if (!race) return null;
            const selectedChoice = formValue(button.form, `race-choice-${race.id}`);
            if (race.choice.length && !race.choice.includes(selectedChoice)) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.ChoiceRequired"));
              return null;
            }
            const optional = race.optional.filter((id) => formChecked(button.form, `race-optional-${race.id}-${id}`));
            const traitIds = [...race.required, ...(selectedChoice ? [selectedChoice] : []), ...optional];
            const results = [];
            for (const id of traitIds) results.push(await addRaceTrait(actor, coreRaceTrait(id)));

            await actor.update({ "system.bio.race": game.i18n.localize(race.name) });
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: RACE_STEP_COMPLETE,
              race: race.id,
              raceTraits: traitIds,
              abilityCostTraits: optional
            });
            if (race.required.length) {
              const names = race.required.map((id) => game.i18n.localize(coreRaceTrait(id).name)).join(", ");
              ui.notifications?.info(format("SYMBAROUMHUD.CharacterCreator.Race.RequiredAdded", { traits: names }));
            }
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "race", race: race.id, traits: traitIds, results
            });
            return race.id;
          }
        },
        {
          action: "continue-later",
          icon: "fa-solid fa-bookmark",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.ContinueLater"),
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindRaceBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }
}

function occupationBookContent(actor) {
  const selectedId = CORE_OCCUPATIONS[0].id;
  const index = OCCUPATION_ARCHETYPES.map((archetype) => {
    const items = CORE_OCCUPATIONS
      .filter((occupation) => occupation.archetype === archetype.id)
      .map((occupation) => `
        <button type="button" class="symbaroum-hud-occupation-index-entry"
          data-occupation-id="${occupation.id}"
          data-active="${occupation.id === selectedId}"
          aria-pressed="${occupation.id === selectedId}">
          <i class="fa-solid ${occupation.icon}" aria-hidden="true"></i>
          <span>${localizeEscaped(occupation.name)}</span>
        </button>
      `).join("");
    return `
      <section class="symbaroum-hud-occupation-index-group">
        <h3>${localizeEscaped(archetype.label)}</h3>
        ${items}
      </section>
    `;
  }).join("");

  const pages = CORE_OCCUPATIONS.map((occupation) => {
    const archetype = OCCUPATION_ARCHETYPES.find((entry) => entry.id === occupation.archetype);
    return `
      <article class="symbaroum-hud-occupation-page"
        data-occupation-page="${occupation.id}"
        ${occupation.id === selectedId ? "" : "hidden"}>
        <section class="symbaroum-hud-archetype-introduction">
          <div>
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ArchetypeLabel")}</span>
            <h2>${localizeEscaped(archetype.label)}</h2>
          </div>
          <p>${localizeEscaped(archetype.summary)}</p>
        </section>
        <div class="symbaroum-hud-occupation-heading">
          <div class="symbaroum-hud-occupation-page-icon" aria-hidden="true">
            <i class="fa-solid ${occupation.icon}"></i>
          </div>
          <div>
            <span class="symbaroum-hud-occupation-archetype">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.OccupationLabel")}</span>
            <h2>${localizeEscaped(occupation.name)}</h2>
          </div>
        </div>
        <div class="symbaroum-hud-occupation-ornament" aria-hidden="true"><span></span><i></i><span></span></div>
        <blockquote>${localizeEscaped(occupation.quote)}</blockquote>
        <p class="symbaroum-hud-occupation-summary">${localizeEscaped(occupation.summary)}</p>
        <dl class="symbaroum-hud-occupation-details">
          <div><dt>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ImportantAttributes")}</dt><dd>${localizeEscaped(occupation.attributes)}</dd></div>
          <div><dt>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SuggestedRaces")}</dt><dd>${localizeEscaped(occupation.races)}</dd></div>
          <div><dt>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.AppropriateAbilities")}</dt><dd>${localizeEscaped(occupation.abilities)}</dd></div>
        </dl>
      </article>
    `;
  }).join("");

  return `
    <div class="symbaroum-hud-occupation-book">
      <input type="hidden" name="occupation" value="${selectedId}">
      <header class="symbaroum-hud-creator-step-guide">
        <div class="symbaroum-hud-creator-step-number">
          <strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.Progress")}</strong>
        </div>
        <div>
          <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepOneTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepOneText")}</p>
        </div>
      </header>
      <aside class="symbaroum-hud-occupation-index">
        <header>
          <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.Index")}</h2>
        </header>
        <div class="symbaroum-hud-occupation-index-list" role="navigation"
          aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SelectLabel")}">
          ${index}
        </div>
      </aside>
      <main class="symbaroum-hud-occupation-reading-page">
        <header class="symbaroum-hud-occupation-character-name">
          <i class="fa-solid fa-book-open" aria-hidden="true"></i>
          <span>${escapeHtml(actor.name)}</span>
        </header>
        ${pages}
        <footer>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SelectionHint")}</footer>
      </main>
    </div>
  `;
}

function bindOccupationBook(element) {
  const input = element.querySelector('input[name="occupation"]');
  const entries = Array.from(element.querySelectorAll("[data-occupation-id]"));
  const pages = Array.from(element.querySelectorAll("[data-occupation-page]"));
  for (const entry of entries) {
    entry.addEventListener("click", () => {
      const id = entry.dataset.occupationId;
      if (!coreOccupation(id)) return;
      input.value = id;
      for (const candidate of entries) {
        const active = candidate.dataset.occupationId === id;
        candidate.dataset.active = String(active);
        candidate.setAttribute("aria-pressed", String(active));
      }
      for (const page of pages) page.hidden = page.dataset.occupationPage !== id;
    });
  }
}

function raceBookContent(actor) {
  const selectedId = CORE_RACES[0].id;
  const index = CORE_RACES.map((race) => `
    <button type="button" class="symbaroum-hud-race-index-entry"
      data-race-id="${race.id}" data-active="${race.id === selectedId}"
      aria-pressed="${race.id === selectedId}">
      <i class="fa-solid ${race.icon}" aria-hidden="true"></i>
      <span>${localizeEscaped(race.name)}</span>
      <small>${localizeEscaped(race.family)}</small>
    </button>
  `).join("");

  const pages = CORE_RACES.map((race) => {
    const required = race.required.map((id) => traitCard(id, "required", race.id)).join("");
    const choices = race.choice.map((id) => traitCard(id, "choice", race.id)).join("");
    const optional = race.optional.map((id) => traitCard(id, "optional", race.id)).join("");
    return `
      <article class="symbaroum-hud-race-page" data-race-page="${race.id}"
        ${race.id === selectedId ? "" : "hidden"}>
        <div class="symbaroum-hud-race-heading">
          <div class="symbaroum-hud-occupation-page-icon" aria-hidden="true"><i class="fa-solid ${race.icon}"></i></div>
          <div><span>${localizeEscaped(race.family)}</span><h2>${localizeEscaped(race.name)}</h2></div>
        </div>
        <p class="symbaroum-hud-race-summary">${localizeEscaped(race.summary)}</p>
        ${required ? `<section class="symbaroum-hud-race-trait-section"><header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.RequiredTraits")}</h3><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.Automatic")}</span></header><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.RequiredHint")}</p><div>${required}</div></section>` : ""}
        ${choices ? `<section class="symbaroum-hud-race-trait-section"><header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.ChooseOne")}</h3><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.FreeChoice")}</span></header><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.ChoiceHint")}</p><div>${choices}</div></section>` : ""}
        ${optional ? `<section class="symbaroum-hud-race-trait-section"><header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.OptionalTraits")}</h3><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.CostsAbility")}</span></header><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.OptionalHint")}</p><div>${optional}</div></section>` : ""}
      </article>`;
  }).join("");

  return `
    <div class="symbaroum-hud-race-book">
      <input type="hidden" name="race" value="${selectedId}">
      <header class="symbaroum-hud-creator-step-guide">
        <div class="symbaroum-hud-creator-step-number"><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.RaceProgress")}</strong></div>
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepThreeTitle")}</h2><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepThreeText")}</p></div>
      </header>
      <aside class="symbaroum-hud-race-index">
        <header><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.Index")}</h2><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.IndexHint")}</p></header>
        <nav aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.Index")}">${index}</nav>
      </aside>
      <main class="symbaroum-hud-race-reading-page">
        <header class="symbaroum-hud-occupation-character-name"><i class="fa-solid fa-book-open" aria-hidden="true"></i><span>${escapeHtml(actor.name)}</span></header>
        ${pages}
      </main>
    </div>`;
}

function traitCard(id, mode, raceId) {
  const trait = coreRaceTrait(id);
  const control = mode === "required"
    ? `<i class="fa-solid fa-circle-check" aria-hidden="true"></i>`
    : `<input type="${mode === "choice" ? "radio" : "checkbox"}"
        name="race-${mode}-${raceId}${mode === "optional" ? `-${id}` : ""}"
        value="${id}">`;
  return `
    <label class="symbaroum-hud-race-trait-card" data-trait-mode="${mode}">
      <span class="symbaroum-hud-race-trait-control">${control}</span>
      <i class="fa-solid ${trait.icon}" aria-hidden="true"></i>
      <span><strong>${localizeEscaped(trait.name)}</strong><small>${localizeEscaped(trait.description)}</small></span>
    </label>`;
}

function bindRaceBook(element) {
  const input = element.querySelector('input[name="race"]');
  const entries = Array.from(element.querySelectorAll("[data-race-id]"));
  const pages = Array.from(element.querySelectorAll("[data-race-page]"));
  const confirm = element.querySelector('[data-action="choose-race"]');
  const refresh = () => {
    const race = coreRace(input?.value);
    if (confirm) confirm.disabled = Boolean(race?.choice.length && !element.querySelector(`input[name="race-choice-${race.id}"]:checked`));
  };
  for (const entry of entries) entry.addEventListener("click", () => {
    const id = entry.dataset.raceId;
    if (!coreRace(id)) return;
    input.value = id;
    for (const candidate of entries) {
      const active = candidate.dataset.raceId === id;
      candidate.dataset.active = String(active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    for (const page of pages) page.hidden = page.dataset.racePage !== id;
    refresh();
  });
  for (const control of element.querySelectorAll('input[type="radio"], input[type="checkbox"]')) control.addEventListener("change", refresh);
  refresh();
}

async function addRaceTrait(actor, trait) {
  if (!trait) return null;
  const aliases = [game.i18n.localize(trait.name), ...trait.aliases].map(normalizeName);
  const existing = actorItems(actor).find((item) => aliases.includes(normalizeName(item.name)));
  if (existing) return { id: trait.id, created: false, item: existing };
  const source = Array.from(game.items?.values?.() ?? game.items ?? []).find((item) =>
    ["trait", "boon", "burden"].includes(item.type) && aliases.includes(normalizeName(item.name))
  );
  const clone = globalThis.foundry?.utils?.deepClone ?? ((value) => structuredClone(value));
  const data = source?.toObject ? clone(source.toObject()) : fallbackTraitData(trait);
  delete data._id;
  if (data.type === "trait") {
    data.system ??= {};
    data.system.novice ??= {};
    data.system.adept ??= {};
    data.system.master ??= {};
    data.system.novice.isActive = true;
    data.system.adept.isActive = false;
    data.system.master.isActive = false;
  }
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return { id: trait.id, created: true, item: created };
}

function fallbackTraitData(trait) {
  const system = trait.type === "trait"
    ? {
        description: game.i18n.localize(trait.description), reference: trait.id,
        novice: { isActive: true, action: "", description: "" },
        adept: { isActive: false, action: "", description: "" },
        master: { isActive: false, action: "", description: "" }, marker: false
      }
    : { description: game.i18n.localize(trait.description), reference: trait.id, level: 1 };
  return {
    name: game.i18n.localize(trait.name), type: trait.type,
    img: trait.type === "burden" ? "icons/svg/downgrade.svg" : "icons/svg/upgrade.svg", system
  };
}

function attributesBookContent(actor) {
  const typicalValues = typicalDistribution(actor);
  const pointValues = pointBuyDistribution(actor);
  const typicalOptions = [...new Set(TYPICAL_ATTRIBUTE_VALUES)]
    .map((value) => `<option value="${value}">${value}</option>`).join("");
  const cards = CORE_ATTRIBUTES.map((attribute, index) => `
    <article class="symbaroum-hud-attribute-choice" data-attribute-card="${attribute.id}">
      <header>
        <i class="fa-solid ${attribute.icon}" aria-hidden="true"></i>
        <h3>${localizeEscaped(attribute.name)}</h3>
        <div class="symbaroum-hud-attribute-typical-control" data-mode-control="typical">
          <label class="sr-only" for="symbaroum-hud-typical-${attribute.id}">
            ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Value")}
          </label>
          <select id="symbaroum-hud-typical-${attribute.id}"
            name="typical-${attribute.id}" data-typical-attribute="${attribute.id}"
            data-initial-value="${typicalValues[index]}">
            <option value="">—</option>
            ${typicalOptions}
          </select>
        </div>
        <div class="symbaroum-hud-attribute-point-control" data-mode-control="point-buy" hidden>
          <button type="button" data-adjust-attribute="${attribute.id}" data-delta="-1"
            aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Decrease")}">−</button>
          <input type="number" name="points-${attribute.id}" value="${pointValues[index]}"
            min="${ATTRIBUTE_MIN}" max="${ATTRIBUTE_MAX}" readonly
            aria-label="${localizeEscaped(attribute.name)}">
          <button type="button" data-adjust-attribute="${attribute.id}" data-delta="1"
            aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Increase")}">+</button>
        </div>
      </header>
      <p>${localizeEscaped(attribute.description)}</p>
    </article>
  `).join("");

  return `
    <div class="symbaroum-hud-attributes-book">
      <input type="hidden" name="attributeDistributionMode"
        value="${ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL}">
      <header class="symbaroum-hud-creator-step-guide">
        <div class="symbaroum-hud-creator-step-number">
          <strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.AttributesProgress")}</strong>
        </div>
        <div>
          <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepTwoTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepTwoText")}</p>
        </div>
      </header>
      <nav class="symbaroum-hud-attribute-mode-tabs"
        aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.DistributionMethod")}">
        <button type="button" data-attribute-mode="typical" data-active="true" aria-pressed="true">
          <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Typical")}
        </button>
        <button type="button" data-attribute-mode="point-buy" data-active="false" aria-pressed="false">
          <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.PointBuy")}
        </button>
      </nav>
      <div class="symbaroum-hud-attribute-workspace">
        <aside class="symbaroum-hud-attribute-rules">
          <div data-attribute-rules="typical">
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Typical")}</h2>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.TypicalRules")}</p>
            <div class="symbaroum-hud-attribute-value-sequence" aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.TypicalValues")}">
              ${TYPICAL_ATTRIBUTE_VALUES.map((value, index) => {
                const occurrence = TYPICAL_ATTRIBUTE_VALUES.slice(0, index).filter((entry) => entry === value).length;
                return `<strong data-typical-value="${value}" data-value-occurrence="${occurrence}" data-used="false">${value}</strong>`;
              }).join("")}
            </div>
            <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.TypicalHint")}</small>
          </div>
          <div data-attribute-rules="point-buy" hidden>
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.PointBuy")}</h2>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.PointBuyRules")}</p>
            <div class="symbaroum-hud-attribute-points">
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Remaining")}</small>
              <strong data-points-remaining>0</strong>
              <span data-points-status
                data-ready="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Ready")}"
                data-pending="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.SpendAll")}">
                ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Ready")}
              </span>
            </div>
            <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.PointBuyHint")}</small>
          </div>
        </aside>
        <main class="symbaroum-hud-attribute-reading-page">
          <header class="symbaroum-hud-occupation-character-name">
            <i class="fa-solid fa-dice-d20" aria-hidden="true"></i>
            <span>${escapeHtml(actor.name)}</span>
          </header>
          <div class="symbaroum-hud-attribute-introduction">
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Heading")}</h2>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Introduction")}</p>
          </div>
          <section class="symbaroum-hud-attribute-choice-grid">
            ${cards}
          </section>
        </main>
      </div>
    </div>
  `;
}

function bindAttributesBook(element) {
  const modeInput = element.querySelector('input[name="attributeDistributionMode"]');
  const tabs = Array.from(element.querySelectorAll("[data-attribute-mode]"));
  const rulePanels = Array.from(element.querySelectorAll("[data-attribute-rules]"));
  const modeControls = Array.from(element.querySelectorAll("[data-mode-control]"));
  const typicalSelects = Array.from(element.querySelectorAll("[data-typical-attribute]"));
  const pointInputs = Array.from(element.querySelectorAll('input[name^="points-"]'));

  for (const select of typicalSelects) {
    select.value = select.dataset.initialValue ?? "";
    select.addEventListener("change", () => refreshTypicalDistribution(element, typicalSelects, pointInputs));
  }

  const setMode = (mode) => {
    if (!Object.values(ATTRIBUTE_DISTRIBUTION_MODES).includes(mode)) return;
    modeInput.value = mode;
    for (const tab of tabs) {
      const active = tab.dataset.attributeMode === mode;
      tab.dataset.active = String(active);
      tab.setAttribute("aria-pressed", String(active));
    }
    for (const panel of rulePanels) panel.hidden = panel.dataset.attributeRules !== mode;
    for (const control of modeControls) control.hidden = control.dataset.modeControl !== mode;
    refreshTypicalDistribution(element, typicalSelects, pointInputs);
    updatePointBuyStatus(element, pointInputs);
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => setMode(tab.dataset.attributeMode));
  }
  for (const button of element.querySelectorAll("[data-adjust-attribute]")) {
    button.addEventListener("click", () => {
      const input = element.querySelector(`input[name="points-${button.dataset.adjustAttribute}"]`);
      if (!input) return;
      const current = Number(input.value);
      const delta = Number(button.dataset.delta);
      const next = current + delta;
      const remaining = ATTRIBUTE_POINT_TOTAL
        - pointInputs.reduce((total, candidate) => total + Number(candidate.value), 0);
      if (next < ATTRIBUTE_MIN || next > ATTRIBUTE_MAX) return;
      if (delta > 0 && remaining <= 0) return;
      if (
        next === ATTRIBUTE_MAX
        && pointInputs.some((candidate) => candidate !== input && Number(candidate.value) === ATTRIBUTE_MAX)
      ) return;
      input.value = String(next);
      updatePointBuyStatus(element, pointInputs);
    });
  }

  setMode(ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL);
}

function refreshTypicalDistribution(element, selects, pointInputs) {
  const values = selects.map((select) => select.value);
  for (const [index, select] of selects.entries()) {
    const current = select.value;
    const blank = new Option("—", "");
    const options = availableTypicalValues(values, index).map((value) => new Option(String(value), String(value)));
    select.replaceChildren(blank, ...options);
    select.value = current;
  }

  const used = new Map();
  for (const rawValue of values) {
    if (rawValue === "") continue;
    const value = Number(rawValue);
    used.set(value, (used.get(value) ?? 0) + 1);
  }
  for (const token of element.querySelectorAll("[data-typical-value]")) {
    const value = Number(token.dataset.typicalValue);
    const occurrence = Number(token.dataset.valueOccurrence);
    token.dataset.used = String((used.get(value) ?? 0) > occurrence);
  }
  updatePointBuyStatus(element, pointInputs);
}

function updatePointBuyStatus(element, pointInputs) {
  const remaining = ATTRIBUTE_POINT_TOTAL
    - pointInputs.reduce((total, input) => total + Number(input.value), 0);
  const counter = element.querySelector("[data-points-remaining]");
  const status = element.querySelector("[data-points-status]");
  const mode = element.querySelector('input[name="attributeDistributionMode"]')?.value;
  const typicalValues = Array.from(element.querySelectorAll("[data-typical-attribute]"), (select) => select.value);
  const confirm = element.querySelector('[data-action="choose-attributes"]');
  if (counter) counter.textContent = String(remaining);
  if (status) {
    const ready = remaining === 0;
    status.textContent = ready ? status.dataset.ready : status.dataset.pending;
    status.dataset.complete = String(ready);
  }
  if (confirm) {
    confirm.disabled = mode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL
      ? !isValidTypicalDistribution(typicalValues)
      : remaining !== 0;
  }
}

function typicalDistribution(actor) {
  const current = CORE_ATTRIBUTES.map((attribute) =>
    Number(actor?.system?.attributes?.[attribute.id]?.value)
  );
  if (isValidTypicalDistribution(current)) return current;
  return CORE_ATTRIBUTES.map(() => "");
}

function pointBuyDistribution(actor) {
  const current = CORE_ATTRIBUTES.map((attribute) =>
    Number(actor?.system?.attributes?.[attribute.id]?.value)
  );
  if (isValidPointBuyDistribution(current)) return current;
  return CORE_ATTRIBUTES.map(() => 10);
}

function attributeValuesFromForm(form, mode) {
  const prefix = mode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL ? "typical" : "points";
  return CORE_ATTRIBUTES.map((attribute) => Number(formValue(form, `${prefix}-${attribute.id}`)));
}

function formValue(form, name) {
  return form?.elements?.namedItem?.(name)?.value
    ?? form?.elements?.[name]?.value
    ?? "";
}

function formChecked(form, name) {
  return Boolean(form?.elements?.namedItem?.(name)?.checked ?? form?.elements?.[name]?.checked);
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function format(key, data) {
  return game.i18n.format?.(key, data) ?? game.i18n.localize(key).replace("{traits}", data.traits);
}

function characterCreatorChoiceContent() {
  return `
    <div class="symbaroum-hud-character-creator-choice">
      <div class="symbaroum-hud-character-creator-emblem" aria-hidden="true">
        <i class="fa-solid fa-scroll"></i>
      </div>
      <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Heading")}</h2>
      <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Description")}</p>
      <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.DecisionHint")}</small>
    </div>
  `;
}

function actorItems(actor) {
  return Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
}

function actorKey(actor) {
  return actor?.uuid ?? actor?.id ?? null;
}

function canOwn(actor, user) {
  if (typeof actor?.testUserPermission === "function") {
    return actor.testUserPermission(user, "OWNER");
  }
  return actor?.isOwner !== false;
}

function dialogClass() {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  return DialogV2?.wait ? DialogV2 : null;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function handleCreatorError(error) {
  console.error(`${MODULE_ID} | Character creator failed.`, error);
  ui.notifications?.error(
    game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed")
  );
  return null;
}

function localizeEscaped(key) {
  return escapeHtml(game.i18n.localize(key));
}

function escapeHtml(value) {
  const escape = globalThis.foundry?.utils?.escapeHTML;
  return escape ? escape(String(value ?? "")) : String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
