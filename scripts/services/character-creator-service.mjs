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
import {
  ABILITY_DISTRIBUTION_MODES,
  abilityRankCost,
  abilitySelectionCost,
  abilitySelectionLimits,
  isValidAbilitySelection
} from "../data/character-creation-abilities.mjs";

const MODE_FLAG = "characterCreationMode";
const STATE_FLAG = "characterCreatorState";
const OCCUPATION_STEP_COMPLETE = "occupation-complete";
const ATTRIBUTES_STEP_COMPLETE = "attributes-complete";
const RACE_STEP_COMPLETE = "race-complete";
const ABILITIES_STEP_COMPLETE = "abilities-complete";
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
  return [OCCUPATION_STEP_COMPLETE, ATTRIBUTES_STEP_COMPLETE, RACE_STEP_COMPLETE, ABILITIES_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isAttributesStepComplete(actor) {
  return [ATTRIBUTES_STEP_COMPLETE, RACE_STEP_COMPLETE, ABILITIES_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isRaceStepComplete(actor) {
  return [RACE_STEP_COMPLETE, ABILITIES_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isAbilitiesStepComplete(actor) {
  return actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step === ABILITIES_STEP_COMPLETE;
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
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isAbilitiesStepComplete(actor)) {
      return this.openAbilitiesStep(actor);
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
          if (attributes) {
            const race = await this.#showRaceBook(DialogV2, actor);
            if (race) await this.#showAbilitiesBook(DialogV2, actor);
          }
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
      const race = await this.#showRaceBook(DialogV2, actor);
      if (!race) return race;
      return await this.#showAbilitiesBook(DialogV2, actor);
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
      const race = await this.#showRaceBook(DialogV2, actor);
      if (race) await this.#showAbilitiesBook(DialogV2, actor);
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
      const race = await this.#showRaceBook(DialogV2, actor);
      if (!race) return race;
      await this.#showAbilitiesBook(DialogV2, actor);
      return race;
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openAbilitiesStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isRaceStepComplete(actor)
      || isAbilitiesStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#showAbilitiesBook(DialogV2, actor);
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

  static async #showAbilitiesBook(DialogV2, actor) {
    const abilities = availableCreationAbilities(actor);
    const mysticalPowers = availableCreationMysticalPowers(actor);
    const rituals = availableCreationRituals(actor);
    const racialCost = racialAbilityCost(actor);
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-abilities-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Title") },
      position: { width: 920, height: 600 },
      content: await abilitiesBookContent(actor, abilities, racialCost, mysticalPowers, rituals),
      buttons: [
        {
          action: "choose-abilities",
          icon: "fa-solid fa-hand-sparkles",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Choose"),
          default: true,
          callback: async (_event, button) => {
            const mode = formValue(button.form, "abilityDistributionMode");
            const experienceBudget = Number(formValue(button.form, "abilityExperienceBudget"));
            const selections = parseAbilitySelections(formValue(button.form, "abilitySelections"));
            const costs = abilityExperienceCosts();
            if (!isValidAbilitySelection(selections, mode, racialCost, { experienceBudget, costs })) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Invalid"));
              return null;
            }
            const available = new Map(availableCreationAbilities(actor).map((item) => [item.id, item]));
            const availablePowers = new Map(availableCreationMysticalPowers(actor).map((item) => [item.id, item]));
            const availableRituals = new Map(availableCreationRituals(actor).map((item) => [item.id, item]));
            if (selections.some((selection) => !available.has(selection.id))) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable"));
              return null;
            }
            if (!areCreationAbilityChoicesValid(selections, available, availablePowers, availableRituals)) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.InvalidSpecialChoice"));
              return null;
            }
            const documents = selections.flatMap((selection) => {
              const ability = available.get(selection.id);
              if (selection.kind === "mysticalPower") {
                return [creationAbilityData(availablePowers.get(selection.choiceId), selection.rank)];
              }
              const created = [creationAbilityData(ability, selection.rank)];
              if (selection.kind === "ritualist") {
                created.push(...selection.ritualIds.map((id) => creationRitualData(availableRituals.get(id))));
              }
              return created;
            });
            const created = documents.length
              ? await actor.createEmbeddedDocuments("Item", documents)
              : [];
            const purchasedWithExperience = mode === ABILITY_DISTRIBUTION_MODES.EXPERIENCE;
            const freeExperience = purchasedWithExperience ? 0 : selections.reduce((total, selection) => {
              const source = selection.kind === "mysticalPower"
                ? availablePowers.get(selection.choiceId)
                : available.get(selection.id);
              return total + creationAbilityExperienceCost(source, selection.rank);
            }, 0);
            const freeRaceExperience = racialFreeExperienceValue(actor);
            const existingBonus = Number(actor.system?.bonus?.experience?.value ?? 0);
            if (purchasedWithExperience) {
              await actor.update({
                "system.experience.total": experienceBudget,
                "system.bonus.experience.value": existingBonus + freeRaceExperience
              });
            } else if (freeExperience > 0) {
              await actor.update({
                "system.bonus.experience.value": existingBonus + freeRaceExperience + freeExperience
                  + racialCost * abilityRankCost("novice", costs)
              });
            }
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const saved = selections.map((selection) => {
              const ability = available.get(selection.id);
              const chosen = selection.kind === "mysticalPower"
                ? availablePowers.get(selection.choiceId)
                : ability;
              return {
                ...selection,
                name: chosen.name,
                ...(selection.kind === "mysticalPower" ? { abilityName: ability.name } : {}),
                ...(selection.kind === "ritualist"
                  ? { ritualNames: selection.ritualIds.map((id) => availableRituals.get(id).name) }
                  : {})
              };
            });
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: ABILITIES_STEP_COMPLETE,
              abilityDistribution: mode,
              abilityExperienceBudget: purchasedWithExperience ? experienceBudget : null,
              abilityExperienceSpent: purchasedWithExperience
                ? abilitySelectionCost(selections, costs) + racialCost * abilityRankCost("novice", costs)
                : null,
              abilities: saved
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "abilities", mode, abilities: saved, created
            });
            return saved;
          }
        },
        {
          action: "continue-later",
          icon: "fa-solid fa-bookmark",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.ContinueLater"),
          callback: () => null
        }
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindAbilitiesBook(dialog.element, racialCost);
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
    </button>
  `).join("");

  const pages = CORE_RACES.map((race) => {
    const required = race.required.map((id) => traitCard(id, "required", race.id)).join("");
    const choices = race.choice.map((id) => traitCard(id, "choice", race.id)).join("");
    const optional = race.optional.map((id) => traitCard(id, "optional", race.id)).join("");
    const lore = race.lore.map((section) => `
      <section class="symbaroum-hud-race-lore-section" data-race-lore="${section.id}">
        <h3>${localizeEscaped(section.title)}</h3>
        ${section.paragraphs.map((paragraph) => `<p>${localizeEscaped(paragraph)}</p>`).join("")}
        ${section.facts.length ? `<dl>${section.facts.map((fact) => `<div><dt>${localizeEscaped(fact.label)}</dt><dd>${localizeEscaped(fact.value)}</dd></div>`).join("")}</dl>` : ""}
      </section>
    `).join("");
    return `
      <article class="symbaroum-hud-race-page" data-race-page="${race.id}"
        ${race.id === selectedId ? "" : "hidden"}>
        <div class="symbaroum-hud-race-heading">
          <div class="symbaroum-hud-occupation-page-icon" aria-hidden="true"><i class="fa-solid ${race.icon}"></i></div>
          <h2>${localizeEscaped(race.name)}</h2>
        </div>
        <p class="symbaroum-hud-race-summary">${localizeEscaped(race.summary)}</p>
        <figure class="symbaroum-hud-race-art"><img src="modules/symbaroum-hud/${race.art}" alt="" style="object-position:${race.artPosition}"></figure>
        <div class="symbaroum-hud-race-lore">${lore}</div>
        <section class="symbaroum-hud-race-traits"><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.TraitsHeading")}</h3>
          ${required ? `<section class="symbaroum-hud-race-trait-section"><header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.RequiredTraits")}</h3><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.Automatic")}</span></header><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.RequiredHint")}</p><div>${required}</div></section>` : ""}
          ${choices ? `<section class="symbaroum-hud-race-trait-section"><header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.ChooseOne")}</h3><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.FreeChoice")}</span></header><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.ChoiceHint")}</p><div>${choices}</div></section>` : ""}
          ${optional ? `<section class="symbaroum-hud-race-trait-section"><header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.OptionalTraits")}</h3><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.CostsAbility")}</span></header><p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.OptionalHint")}</p><div>${optional}</div></section>` : ""}
        </section>
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

function availableCreationAbilities(actor) {
  const known = new Set(actorItems(actor)
    .filter((item) => item.type === "ability")
    .map(abilityIdentity));
  return availableCreationWorldItems(known, (item) => item?.type === "ability");
}

function availableCreationMysticalPowers(actor) {
  const known = new Set(actorItems(actor)
    .filter(isMysticalPowerDocument)
    .map(abilityIdentity));
  return availableCreationWorldItems(known, isMysticalPowerDocument);
}

function availableCreationRituals(actor) {
  const known = new Set(actorItems(actor)
    .filter(isRitualDocument)
    .map(abilityIdentity));
  return availableCreationWorldItems(known, isRitualDocument);
}

function availableCreationWorldItems(known, predicate) {
  const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
  const unique = new Map();
  for (const item of Array.from(game.items?.values?.() ?? game.items ?? [])) {
    if (!predicate(item)) continue;
    if (item.testUserPermission && !item.testUserPermission(game.user, observerLevel)) continue;
    const identity = abilityIdentity(item);
    if (!identity || known.has(identity) || unique.has(identity)) continue;
    unique.set(identity, item);
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(
    right.name, game.i18n?.lang ?? "pt-BR", { sensitivity: "base" }
  ));
}

function isMysticalPowerDocument(item) {
  return item?.type === "mysticalPower"
    || item?.type === "mystical-power"
    || Boolean(item?.system?.isMysticalPower);
}

function isRitualDocument(item) {
  return item?.type === "ritual" || Boolean(item?.system?.isRitual);
}

function isMysticalPowerAbility(item) {
  const reference = normalizeName(item?.system?.reference);
  const name = normalizeName(item?.name);
  return ["mysticalpower", "mysticpower", "podermistico"].includes(reference)
    || ["podermistico", "mysticalpower"].includes(name);
}

function isRitualistAbility(item) {
  const reference = normalizeName(item?.system?.reference);
  const name = normalizeName(item?.name);
  return reference === "ritualist" || ["ritualista", "ritualist"].includes(name);
}

function ritualCapacity(rank) {
  if (rank === "novice") return 1;
  if (rank === "adept") return 3;
  if (rank === "master") return 6;
  return 0;
}

function abilityIdentity(item) {
  return normalizeName(item?.system?.reference || item?.name);
}

function racialAbilityCost(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  return Math.min(2, Math.max(0, Array.isArray(state.abilityCostTraits) ? state.abilityCostTraits.length : 0));
}

function racialFreeExperienceValue(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const paid = new Set(state.abilityCostTraits ?? []);
  const costs = game.symbaroum?.config?.expCosts ?? {};
  return Array.from(state.raceTraits ?? []).reduce((total, id) => {
    if (paid.has(id)) return total;
    const trait = coreRaceTrait(id);
    if (trait?.type === "boon") return total + (Number(costs.boon?.cost) || 5);
    if (trait?.type === "burden") return total + (Number(costs.burden?.cost) || -5);
    if (trait?.type === "trait") return total + abilityRankCost("novice", costs.power);
    return total;
  }, 0);
}

async function abilitiesBookContent(actor, abilities, racialCost, mysticalPowers, rituals) {
  const firstId = abilities[0]?.id ?? "";
  const costs = abilityExperienceCosts();
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const racialTraits = (state.abilityCostTraits ?? [])
    .map((id) => coreRaceTrait(id))
    .filter(Boolean)
    .map((trait) => game.i18n.localize(trait.name));
  const index = abilities.map((ability) => `
    <button type="button" class="symbaroum-hud-ability-index-entry"
      data-creation-ability-id="${escapeHtml(ability.id)}"
      data-search="${escapeHtml(normalizeName(`${ability.name} ${ability.system?.reference ?? ""}`))}"
      data-active="${ability.id === firstId}" aria-pressed="${ability.id === firstId}">
      <img src="${escapeHtml(ability.img || "icons/svg/book.svg")}" alt="">
      <span>${escapeHtml(ability.name)}</span>
      <strong data-ability-entry-rank></strong>
    </button>`).join("");
  const pages = (await Promise.all(abilities.map(async (ability) => {
    const mysticalPowerAbility = isMysticalPowerAbility(ability);
    const ritualistAbility = isRitualistAbility(ability);
    const nativeSheet = await renderCreationAbilitySheet(ability);
    const mysticalPowerChoices = mysticalPowerAbility
      ? await mysticalPowerChoiceContent(ability, mysticalPowers, costs)
      : "";
    const ritualChoices = ritualistAbility
      ? await ritualChoiceContent(ability, rituals)
      : "";
    return `
      <article class="symbaroum-hud-ability-page" data-creation-ability-page="${escapeHtml(ability.id)}"
        ${ability.id === firstId ? "" : "hidden"}>
        <div class="symbaroum sheet item symbaroum-hud-native-ability-sheet">${nativeSheet}</div>
        <div class="symbaroum-hud-native-ability-purchase" ${mysticalPowerAbility ? "hidden" : ""}>
          ${["novice", "adept", "master"].map((rank) => `<button type="button"
            data-select-ability="${escapeHtml(ability.id)}" data-rank="${rank}"
            ${ritualistAbility ? 'data-choice-type="ritualist"' : ""}>
            <i class="fa-regular fa-circle" aria-hidden="true"></i>
            <span>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Abilities.Select${rank[0].toUpperCase()}${rank.slice(1)}`)}</span>
            <small>${abilityRankCost(rank, costs)} XP</small>
          </button>`).join("")}
        </div>
        ${mysticalPowerAbility ? mysticalPowerChoices : ""}
        ${ritualChoices}
      </article>`;
  }))).join("");
  const limits = abilitySelectionLimits(ABILITY_DISTRIBUTION_MODES.FIVE_NOVICE, racialCost);
  const initialExperience = Math.max(0, Number(actor.system?.experience?.total) || 50);
  return `
    <div class="symbaroum-hud-abilities-book">
      <input type="hidden" name="abilityDistributionMode" value="${ABILITY_DISTRIBUTION_MODES.EXPERIENCE}">
      <input type="hidden" name="abilitySelections" value="[]">
      <header class="symbaroum-hud-creator-step-guide">
        <div class="symbaroum-hud-creator-step-number"><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.AbilitiesProgress")}</strong></div>
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepFourTitle")}</h2>
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepFourText")}</p></div>
      </header>
      <nav class="symbaroum-hud-ability-mode-tabs" aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.DistributionMethod")}">
        <button type="button" data-ability-mode="experience" data-active="true" aria-pressed="true"><i class="fa-solid fa-coins"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperiencePurchase")}</button>
        <button type="button" data-ability-mode="five-novice" data-active="false" aria-pressed="false"><i class="fa-solid fa-hand-fist"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.FiveNovice")}</button>
        <button type="button" data-ability-mode="mixed" data-active="false" aria-pressed="false"><i class="fa-solid fa-crown"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Mixed")}</button>
      </nav>
      <div class="symbaroum-hud-ability-workspace">
        <aside class="symbaroum-hud-ability-index">
          <label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-ability-search placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.SearchPlaceholder")}"></label>
          <section class="symbaroum-hud-ability-experience" data-ability-experience-panel>
            <header><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperienceRemaining")}</span>
              <strong data-experience-remaining>${initialExperience}</strong></header>
            <div><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperienceSpent")} <b data-experience-spent>0</b></span>
              <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperienceAvailable")}</span>
                <input type="number" name="abilityExperienceBudget" value="${initialExperience}" min="0" step="1"></label></div>
            <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperienceCosts")}</small>
          </section>
          <div class="symbaroum-hud-ability-slots" hidden>
            <span data-ability-slot="novice"><b>0</b>/${limits.novice} ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Novice")}</span>
            <span data-ability-slot="adept" hidden><b>0</b>/0 ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Adept")}</span>
          </div>
          ${racialCost ? `<p class="symbaroum-hud-ability-racial-cost"><i class="fa-solid fa-feather"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.RacialCost")}<strong>${escapeHtml(racialTraits.join(", "))}</strong></p>` : ""}
          <nav>${index || `<p class="symbaroum-hud-ability-empty">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Empty")}</p>`}</nav>
        </aside>
        <main class="symbaroum-hud-ability-reading-page">${pages || `<p class="symbaroum-hud-ability-empty">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Empty")}</p>`}</main>
      </div>
    </div>`;
}

async function renderCreationAbilitySheet(ability) {
  const sheet = ability?.sheet;
  const renderTemplate = foundry?.applications?.handlebars?.renderTemplate;
  if (!sheet?.getData || !renderTemplate) return "";
  const data = await sheet.getData();
  data.owner = false;
  data.editable = false;
  data.isOwned = false;
  data.cssClass = "locked";
  const template = sheet.options?.template ?? "systems/symbaroum/template/sheet/ability.hbs";
  const rendered = await renderTemplate(template, data);
  return String(rendered)
    .replace(/^\s*<form\b[^>]*>/i, "")
    .replace(/<\/form>\s*$/i, "")
    .replace(/<(input|select|textarea)\b/gi, "<$1 disabled");
}

async function mysticalPowerChoiceContent(ability, mysticalPowers, costs) {
  if (!mysticalPowers.length) {
    return `<p class="symbaroum-hud-ability-special-empty">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoMysticalPowers")}</p>`;
  }
  const cards = await Promise.all(mysticalPowers.map(async (power) => {
    return `
      <article class="symbaroum-hud-ability-special-card" data-mystical-power-choice="${escapeHtml(power.id)}">
        <header>
          <img src="${escapeHtml(power.img || "icons/svg/daze.svg")}" alt="">
          <div><button type="button" class="symbaroum-hud-ability-special-open"
            data-open-creation-item="${escapeHtml(power.id)}"
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.OpenMysticalPower", { name: power.name })}">
            <h4>${escapeHtml(power.name)}</h4>
          </button>
          ${power.system?.reference ? `<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Reference")}: ${escapeHtml(power.system.reference)}</small>` : ""}</div>
        </header>
        <div class="symbaroum-hud-ability-special-ranks">
          ${["novice", "adept", "master"].map((rank) => `
            <button type="button" data-select-ability="${escapeHtml(ability.id)}"
              data-choice-type="mysticalPower" data-choice-id="${escapeHtml(power.id)}" data-rank="${rank}">
              <i class="fa-regular fa-circle" aria-hidden="true"></i>
              <span>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Abilities.${rank[0].toUpperCase()}${rank.slice(1)}`)}</span>
              <small>${abilityRankCost(rank, costs)} XP</small>
            </button>`).join("")}
        </div>
      </article>`;
  }));
  return `
    <section class="symbaroum-hud-ability-special-picker symbaroum-hud-mystical-power-picker">
      <header><div><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ChooseMysticalPower")}</h3>
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.MysticalPowerChoiceIntro")}</p></div></header>
      <div class="symbaroum-hud-ability-special-list">${cards.join("")}</div>
    </section>`;
}

async function ritualChoiceContent(ability, rituals) {
  const cards = await Promise.all(rituals.map(async (ritual) => {
    const description = await enrichCreatorDescription(ritual.system?.description, ritual);
    return `
      <article class="symbaroum-hud-ability-special-card symbaroum-hud-ritual-choice-card"
        data-ritual-choice="${escapeHtml(ritual.id)}">
        <button type="button" data-select-ritual="${escapeHtml(ritual.id)}"
          data-ritualist-ability="${escapeHtml(ability.id)}" aria-pressed="false" disabled>
          <img src="${escapeHtml(ritual.img || "icons/svg/book.svg")}" alt="">
          <span><strong>${escapeHtml(ritual.name)}</strong>
          ${ritual.system?.reference ? `<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Reference")}: ${escapeHtml(ritual.system.reference)}</small>` : ""}</span>
          <i class="fa-regular fa-square" aria-hidden="true"></i>
        </button>
        <details><summary>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ReadRitual")}</summary>
          <div>${description}</div>
        </details>
      </article>`;
  }));
  return `
    <section class="symbaroum-hud-ability-special-picker symbaroum-hud-ritual-picker"
      data-ritual-picker="${escapeHtml(ability.id)}">
      <header><div><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ChooseRituals")}</h3>
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.RitualChoiceIntro")}</p></div>
        <strong><b data-ritual-count>0</b>/<b data-ritual-required>0</b></strong></header>
      ${cards.length
        ? `<div class="symbaroum-hud-ability-special-list">${cards.join("")}</div>`
        : `<p class="symbaroum-hud-ability-special-empty">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoRituals")}</p>`}
    </section>`;
}

function bindAbilitiesBook(element, racialCost) {
  const modeInput = element.querySelector('input[name="abilityDistributionMode"]');
  const selectionsInput = element.querySelector('input[name="abilitySelections"]');
  const experienceInput = element.querySelector('input[name="abilityExperienceBudget"]');
  const costs = abilityExperienceCosts();
  const entries = [...element.querySelectorAll("[data-creation-ability-id]")];
  const pages = [...element.querySelectorAll("[data-creation-ability-page]")];
  const selections = new Map();
  const selectionKey = (id, choiceId = "") => choiceId ? `${id}:${choiceId}` : id;
  const selectionValues = (source = selections) => [...source.values()];
  const openPage = (id) => {
    for (const entry of entries) {
      const active = entry.dataset.creationAbilityId === id;
      entry.dataset.active = String(active);
      entry.setAttribute("aria-pressed", String(active));
    }
    for (const page of pages) page.hidden = page.dataset.creationAbilityPage !== id;
  };
  const refresh = () => {
    const mode = modeInput.value;
    const limits = abilitySelectionLimits(mode, racialCost);
    const counts = { novice: 0, adept: 0, master: 0 };
    const values = selectionValues();
    for (const selection of values) counts[selection.rank]++;
    selectionsInput.value = JSON.stringify(values);
    const experienceMode = mode === ABILITY_DISTRIBUTION_MODES.EXPERIENCE;
    const budget = Math.max(0, Number(experienceInput?.value) || 0);
    const spent = abilitySelectionCost(values, costs) + racialCost * abilityRankCost("novice", costs);
    const experiencePanel = element.querySelector("[data-ability-experience-panel]");
    const slotsPanel = element.querySelector(".symbaroum-hud-ability-slots");
    if (experiencePanel) experiencePanel.hidden = !experienceMode;
    if (slotsPanel) slotsPanel.hidden = experienceMode;
    const spentElement = element.querySelector("[data-experience-spent]");
    const remainingElement = element.querySelector("[data-experience-remaining]");
    if (spentElement) spentElement.textContent = String(spent);
    if (remainingElement) {
      remainingElement.textContent = String(budget - spent);
      remainingElement.dataset.insufficient = String(spent > budget);
    }
    for (const rank of ["novice", "adept"]) {
      const slot = element.querySelector(`[data-ability-slot="${rank}"]`);
      if (!slot) continue;
      slot.hidden = rank === "adept" && limits.adept === 0;
      slot.querySelector("b").textContent = String(counts[rank]);
      slot.childNodes[1].textContent = `/${limits[rank]} `;
      slot.dataset.complete = String(counts[rank] === limits[rank]);
    }
    for (const entry of entries) {
      const selected = values.filter((selection) => selection.id === entry.dataset.creationAbilityId);
      entry.dataset.selected = String(selected.length > 0);
      entry.querySelector("[data-ability-entry-rank]").textContent = selected.length > 1
        ? (game.i18n.format?.("SYMBAROUMHUD.CharacterCreator.Abilities.SelectedCount", { count: selected.length }) ?? String(selected.length))
        : selected.length
          ? game.i18n.localize(`SYMBAROUMHUD.CharacterCreator.Abilities.${selected[0].rank[0].toUpperCase()}${selected[0].rank.slice(1)}`)
          : "";
    }
    for (const button of element.querySelectorAll("[data-select-ability]")) {
      const key = selectionKey(button.dataset.selectAbility, button.dataset.choiceId);
      const active = selections.get(key)?.rank === button.dataset.rank;
      button.dataset.selected = String(active);
      button.hidden = experienceMode
        ? false
        : button.dataset.rank === "master" || (button.dataset.rank === "adept" && limits.adept === 0);
      button.querySelector("i").className = active ? "fa-solid fa-circle-check" : "fa-regular fa-circle";
    }
    for (const picker of element.querySelectorAll("[data-ritual-picker]")) {
      const selection = selections.get(picker.dataset.ritualPicker);
      const required = selection?.kind === "ritualist" ? ritualCapacity(selection.rank) : 0;
      const chosen = new Set(selection?.ritualIds ?? []);
      picker.querySelector("[data-ritual-count]").textContent = String(chosen.size);
      picker.querySelector("[data-ritual-required]").textContent = String(required);
      for (const button of picker.querySelectorAll("[data-select-ritual]")) {
        const active = chosen.has(button.dataset.selectRitual);
        button.dataset.selected = String(active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = !selection || (!active && chosen.size >= required);
        button.querySelector("i").className = active ? "fa-solid fa-square-check" : "fa-regular fa-square";
      }
    }
    const specialChoicesComplete = values.every((selection) => {
      if (selection.kind === "mysticalPower") return Boolean(selection.choiceId);
      if (selection.kind === "ritualist") {
        return new Set(selection.ritualIds ?? []).size === ritualCapacity(selection.rank);
      }
      return true;
    });
    const confirm = element.querySelector('[data-action="choose-abilities"]');
    if (confirm) confirm.disabled = !specialChoicesComplete || !isValidAbilitySelection(
      values, mode, racialCost,
      { experienceBudget: budget, costs }
    );
  };
  for (const entry of entries) entry.addEventListener("click", () => openPage(entry.dataset.creationAbilityId));
  for (const page of pages) {
    const tabs = [...page.querySelectorAll(".symbaroum-hud-native-ability-sheet .sheet-tabs [data-tab]")];
    const panels = [...page.querySelectorAll(".symbaroum-hud-native-ability-sheet .sheet-body > .tab[data-tab]")];
    const activateTab = (tab) => {
      for (const candidate of tabs) {
        const active = candidate === tab;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      }
      for (const panel of panels) {
        const active = panel.dataset.tab === tab.dataset.tab;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      }
    };
    for (const tab of tabs) {
      tab.setAttribute("role", "button");
      tab.setAttribute("tabindex", "0");
      tab.addEventListener("click", () => activateTab(tab));
      tab.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") activateTab(tab);
      });
    }
    if (tabs[0]) activateTab(tabs[0]);
  }
  for (const button of element.querySelectorAll("[data-open-creation-item]")) button.addEventListener("click", () => {
    const item = availableWorldItem(button.dataset.openCreationItem);
    const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
    if (!item || (item.testUserPermission && !item.testUserPermission(game.user, observerLevel))) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable"));
      return;
    }
    item.sheet?.render(true);
  });
  for (const tab of element.querySelectorAll("[data-ability-mode]")) tab.addEventListener("click", () => {
    modeInput.value = tab.dataset.abilityMode;
    selections.clear();
    for (const candidate of element.querySelectorAll("[data-ability-mode]")) {
      const active = candidate === tab;
      candidate.dataset.active = String(active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    refresh();
  });
  for (const button of element.querySelectorAll("[data-select-ability]")) button.addEventListener("click", () => {
    const { selectAbility: id, rank, choiceId = "", choiceType = "" } = button.dataset;
    const key = selectionKey(id, choiceId);
    const current = selections.get(key);
    if (current?.rank === rank) selections.delete(key);
    else {
      const candidate = {
        id,
        rank,
        ...(choiceType ? { kind: choiceType } : {}),
        ...(choiceId ? { choiceId } : {}),
        ...(choiceType === "ritualist"
          ? { ritualIds: Array.from(current?.ritualIds ?? []).slice(0, ritualCapacity(rank)) }
          : {})
      };
      if (modeInput.value === ABILITY_DISTRIBUTION_MODES.EXPERIENCE) {
        const candidates = new Map(selections);
        candidates.set(key, candidate);
        const budget = Math.max(0, Number(experienceInput?.value) || 0);
        const spent = abilitySelectionCost(selectionValues(candidates), costs)
          + racialCost * abilityRankCost("novice", costs);
        if (spent > budget) {
          ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.NotEnoughExperience"));
          return;
        }
      } else {
        const limits = abilitySelectionLimits(modeInput.value, racialCost);
        const occupied = selectionValues().filter((selection) => (
          selectionKey(selection.id, selection.choiceId) !== key && selection.rank === rank
        )).length;
        if (occupied >= limits[rank]) {
          ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.SlotFull"));
          return;
        }
      }
      selections.set(key, candidate);
    }
    refresh();
  });
  for (const button of element.querySelectorAll("[data-select-ritual]")) button.addEventListener("click", () => {
    const key = button.dataset.ritualistAbility;
    const selection = selections.get(key);
    if (!selection || selection.kind !== "ritualist") {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.SelectRitualistRankFirst"));
      return;
    }
    const ritualIds = new Set(selection.ritualIds ?? []);
    const ritualId = button.dataset.selectRitual;
    if (ritualIds.has(ritualId)) ritualIds.delete(ritualId);
    else if (ritualIds.size < ritualCapacity(selection.rank)) ritualIds.add(ritualId);
    else {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.RitualCapacityFull"));
      return;
    }
    selections.set(key, { ...selection, ritualIds: [...ritualIds] });
    refresh();
  });
  const search = element.querySelector("[data-ability-search]");
  search?.addEventListener("input", () => {
    const query = normalizeName(search.value);
    for (const entry of entries) entry.hidden = Boolean(query && !entry.dataset.search.includes(query));
    const active = entries.find((entry) => entry.dataset.active === "true" && !entry.hidden);
    if (!active) openPage(entries.find((entry) => !entry.hidden)?.dataset.creationAbilityId ?? "");
  });
  experienceInput?.addEventListener("input", refresh);
  refresh();
}

function availableWorldItem(id) {
  return game.items?.get?.(id)
    ?? Array.from(game.items?.values?.() ?? game.items ?? []).find((item) => item.id === id);
}

function parseAbilitySelections(value) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
      id: String(entry?.id ?? ""),
      rank: String(entry?.rank ?? ""),
      ...(entry?.kind ? { kind: String(entry.kind) } : {}),
      ...(entry?.choiceId ? { choiceId: String(entry.choiceId) } : {}),
      ...(Array.isArray(entry?.ritualIds)
        ? { ritualIds: [...new Set(entry.ritualIds.map((id) => String(id)).filter(Boolean))] }
        : {})
    }));
  } catch {
    return [];
  }
}

function areCreationAbilityChoicesValid(selections, abilities, mysticalPowers, rituals) {
  return selections.every((selection) => {
    const ability = abilities.get(selection.id);
    if (!ability) return false;
    if (isMysticalPowerAbility(ability)) {
      return selection.kind === "mysticalPower"
        && Boolean(selection.choiceId)
        && mysticalPowers.has(selection.choiceId);
    }
    if (isRitualistAbility(ability)) {
      const ritualIds = Array.from(selection.ritualIds ?? []);
      return selection.kind === "ritualist"
        && ritualIds.length === ritualCapacity(selection.rank)
        && new Set(ritualIds).size === ritualIds.length
        && ritualIds.every((id) => rituals.has(id));
    }
    return !selection.kind && !selection.choiceId && !selection.ritualIds;
  });
}

function creationAbilityData(source, rank) {
  const clone = globalThis.foundry?.utils?.deepClone ?? ((value) => structuredClone(value));
  const data = clone(source.toObject ? source.toObject() : source);
  delete data._id;
  data.system ??= {};
  for (const level of ["novice", "adept", "master"]) data.system[level] ??= {};
  data.system.novice.isActive = true;
  data.system.adept.isActive = rank === "adept" || rank === "master";
  data.system.master.isActive = rank === "master";
  return data;
}

function creationRitualData(source) {
  const clone = globalThis.foundry?.utils?.deepClone ?? ((value) => structuredClone(value));
  const data = clone(source.toObject ? source.toObject() : source);
  delete data._id;
  return data;
}

function creationAbilityExperienceCost(source, rank) {
  const costs = abilityExperienceCosts();
  if (Array.isArray(costs.nocost) && costs.nocost.includes(source?.system?.reference)) return 0;
  return abilityRankCost(rank, costs);
}

function abilityExperienceCosts() {
  return game.symbaroum?.config?.expCosts?.power ?? { novice: 10, adept: 20, master: 30, nocost: [] };
}

async function enrichCreatorDescription(value, relativeTo) {
  const description = String(value ?? "").trim();
  if (!description) return `<em>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoDescription")}</em>`;
  const editor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation
    ?? globalThis.foundry?.applications?.ux?.TextEditor
    ?? globalThis.TextEditor;
  return editor?.enrichHTML ? editor.enrichHTML(description, { async: true, relativeTo }) : escapeHtml(description);
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
  const pointValues = pointBuyDistribution();
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

function pointBuyDistribution() {
  return CORE_ATTRIBUTES.map(() => ATTRIBUTE_MIN);
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

function formatEscaped(key, data) {
  const fallback = Object.entries(data ?? {}).reduce(
    (value, [placeholder, replacement]) => value.replaceAll(`{${placeholder}}`, String(replacement)),
    game.i18n.localize(key)
  );
  return escapeHtml(game.i18n.format?.(key, data) ?? fallback);
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
