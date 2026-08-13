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
const SHADOW_STEP_COMPLETE = "shadow-complete";
const EQUIPMENT_STEP_COMPLETE = "equipment-complete";
const PERSONALITY_STEP_COMPLETE = "personality-complete";
const FRIENDS_STEP_COMPLETE = "friends-complete";
const CREATOR_STEPS = Object.freeze([
  Object.freeze({ id: "occupation", complete: OCCUPATION_STEP_COMPLETE }),
  Object.freeze({ id: "attributes", complete: ATTRIBUTES_STEP_COMPLETE }),
  Object.freeze({ id: "race", complete: RACE_STEP_COMPLETE }),
  Object.freeze({ id: "abilities", complete: ABILITIES_STEP_COMPLETE }),
  Object.freeze({ id: "shadow", complete: SHADOW_STEP_COMPLETE }),
  Object.freeze({ id: "equipment", complete: EQUIPMENT_STEP_COMPLETE }),
  Object.freeze({ id: "personality", complete: PERSONALITY_STEP_COMPLETE }),
  Object.freeze({ id: "friends", complete: FRIENDS_STEP_COMPLETE })
]);
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
  return [OCCUPATION_STEP_COMPLETE, ATTRIBUTES_STEP_COMPLETE, RACE_STEP_COMPLETE, ABILITIES_STEP_COMPLETE, SHADOW_STEP_COMPLETE, EQUIPMENT_STEP_COMPLETE, PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isAttributesStepComplete(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const progressed = [ATTRIBUTES_STEP_COMPLETE, RACE_STEP_COMPLETE, ABILITIES_STEP_COMPLETE, SHADOW_STEP_COMPLETE, EQUIPMENT_STEP_COMPLETE, PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE]
    .includes(state.step);
  if (!progressed) return false;
  return !(state.attributesDeferred && isAbilitiesStepComplete(actor));
}

export function isRaceStepComplete(actor) {
  return [RACE_STEP_COMPLETE, ABILITIES_STEP_COMPLETE, SHADOW_STEP_COMPLETE, EQUIPMENT_STEP_COMPLETE, PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isContactsPreparationRequired(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  return Boolean(state.raceTraits?.includes("contacts") && !state.contacts);
}

export function isAbilitiesStepComplete(actor) {
  return [ABILITIES_STEP_COMPLETE, SHADOW_STEP_COMPLETE, EQUIPMENT_STEP_COMPLETE, PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isShadowStepComplete(actor) {
  return [SHADOW_STEP_COMPLETE, EQUIPMENT_STEP_COMPLETE, PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isEquipmentStepComplete(actor) {
  return [EQUIPMENT_STEP_COMPLETE, PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isPersonalityStepComplete(actor) {
  return [PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE]
    .includes(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step);
}

export function isFriendsStepComplete(actor) {
  return actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step === FRIENDS_STEP_COMPLETE;
}

export function registerCharacterCreatorHooks() {
  const handleSheet = (sheet) => {
    const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
    void CharacterCreatorService.handleSheet(actor, sheet);
  };
  Hooks.on("renderActorSheet", handleSheet);
  Hooks.on("renderSymbaroumActorSheet", handleSheet);
}

export class CharacterCreatorService {
  static async handleSheet(actor, sheet = null) {
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
    if (mode === CHARACTER_CREATION_MODES.CREATOR && isContactsPreparationRequired(actor)) {
      return this.openContactsStep(actor);
    }
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isAbilitiesStepComplete(actor)) {
      return this.openAbilitiesStep(actor);
    }
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isShadowStepComplete(actor)) {
      return this.openShadowStep(actor);
    }
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isEquipmentStepComplete(actor)) {
      return this.openEquipmentStep(actor);
    }
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isPersonalityStepComplete(actor)) {
      return this.openPersonalityStep(actor);
    }
    if (mode === CHARACTER_CREATION_MODES.CREATOR && !isFriendsStepComplete(actor)) {
      return this.openFriendsStep(actor);
    }
    if (!mode) return this.offer(actor, sheet);
    return null;
  }

  static async offer(actor, sheet = null) {
    const key = actorKey(actor);
    if (!key || pendingActors.has(key) || !shouldOfferCharacterCreator(actor)) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;

    pendingActors.add(key);
    try {
      const choice = await DialogV2.wait({
        classes: [
          "symbaroum-hud-character-creator-dialog",
          "symbaroum-hud-character-creator-choice-dialog"
        ],
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
        await closeOriginalActorSheet(sheet, actor);
        Hooks.callAll(`${MODULE_ID}.characterCreatorRequested`, actor);
        await this.#runCreatorSteps(DialogV2, actor, "occupation");
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
      return await this.#runCreatorSteps(DialogV2, actor, "occupation");
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
      return await this.#runCreatorSteps(DialogV2, actor, "attributes");
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
      return await this.#runCreatorSteps(DialogV2, actor, "race");
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
      || isContactsPreparationRequired(actor)
      || isAbilitiesStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#runCreatorSteps(DialogV2, actor, "abilities");
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openAbilityBrowser(actor) {
    const key = actorKey(actor);
    if (!key || pendingActors.has(key) || actor?.type !== "player" || !canOwn(actor, game.user)) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    const abilities = availableCreationAbilities(actor, { includeKnownMysticalPowerAbility: true });
    if (!abilities.length) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoAvailableAbilities"));
      return null;
    }

    pendingActors.add(key);
    try {
      const mysticalPowers = availableCreationMysticalPowers(actor);
      const rituals = availableCreationRituals(actor);
      const experienceBudget = availableActorExperience(actor);
      return await DialogV2.wait({
        classes: [
          "symbaroum-hud-character-creator-dialog",
          "symbaroum-hud-occupation-book-dialog",
          "symbaroum-hud-abilities-book-dialog",
          "symbaroum-hud-ability-browser-dialog"
        ],
        window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.BrowserTitle") },
        position: { width: 1140, height: 700 },
        content: await abilitiesBookContent(actor, abilities, 0, mysticalPowers, rituals, {
          browserMode: true,
          experienceBudget
        }),
        buttons: [
          {
            action: "buy-abilities",
            icon: "fa-solid fa-coins",
            label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.BuySelected"),
            default: true,
            callback: async (_event, button) => {
              const selections = parseAbilitySelections(formValue(button.form, "abilitySelections"));
              if (!selections.length) {
                ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.SelectAtLeastOne"));
                return null;
              }
              const currentBudget = availableActorExperience(actor);
              const costs = abilityExperienceCosts();
              if (!isValidAbilitySelection(selections, ABILITY_DISTRIBUTION_MODES.EXPERIENCE, 0, {
                experienceBudget: currentBudget,
                costs
              })) {
                ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.NotEnoughExperience"));
                return null;
              }
              const available = new Map(availableCreationAbilities(actor, {
                includeKnownMysticalPowerAbility: true
              }).map((item) => [item.id, item]));
              const availablePowers = new Map(availableCreationMysticalPowers(actor).map((item) => [item.id, item]));
              const availableRituals = new Map(availableCreationRituals(actor).map((item) => [item.id, item]));
              if (selections.some((selection) => !available.has(selection.id))
                || !areCreationAbilityChoicesValid(selections, available, availablePowers, availableRituals)) {
                ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable"));
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
              return documents.length ? actor.createEmbeddedDocuments("Item", documents) : null;
            }
          },
          {
            action: "cancel",
            label: game.i18n.localize("Cancel"),
            callback: () => null
          }
        ],
        close: () => null,
        rejectClose: false,
        render: (_event, dialog) => {
          bindAbilitiesBook(dialog.element, 0, {
            confirmAction: "buy-abilities",
            requireSelection: true
          });
          globalThis.setTimeout(() => {
            if (dialog.element?.isConnected) dialog.bringToFront?.();
          }, 0);
        }
      });
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openContactsStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isRaceStepComplete(actor)
      || !isContactsPreparationRequired(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#runCreatorSteps(DialogV2, actor, "contacts");
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openShadowStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isAbilitiesStepComplete(actor)
      || !isAttributesStepComplete(actor)
      || isShadowStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#runCreatorSteps(DialogV2, actor, "shadow");
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openEquipmentStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isShadowStepComplete(actor)
      || isEquipmentStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#runCreatorSteps(DialogV2, actor, "equipment");
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openPersonalityStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isEquipmentStepComplete(actor)
      || isPersonalityStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#runCreatorSteps(DialogV2, actor, "personality");
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async openFriendsStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isPersonalityStepComplete(actor)
      || isFriendsStepComplete(actor)
    ) return null;

    const DialogV2 = dialogClass();
    if (!DialogV2) return null;
    pendingActors.add(key);
    try {
      return await this.#runCreatorSteps(DialogV2, actor, "friends");
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
  }

  static async #runCreatorSteps(DialogV2, actor, initialStep) {
    let currentStep = initialStep;
    let initialResult;
    let lastResult;

    while (currentStep) {
      const result = await this.#showCreatorStep(DialogV2, actor, currentStep);
      if (isCreatorNavigationResult(result)) {
        currentStep = result.step;
        continue;
      }
      if (!result) return initialStep === "occupation" ? null : (initialResult ?? lastResult ?? result);

      if (currentStep === initialStep && initialResult === undefined) initialResult = result;
      lastResult = result;
      if (result === "attributes-deferred") {
        currentStep = "race";
        continue;
      }
      currentStep = nextRequiredCreatorStep(actor, currentStep);
    }

    return initialResult ?? lastResult ?? null;
  }

  static #showCreatorStep(DialogV2, actor, step) {
    switch (step) {
      case "occupation": return this.#showOccupationBook(DialogV2, actor);
      case "attributes": return this.#showAttributesBook(DialogV2, actor);
      case "race": return this.#showRaceBook(DialogV2, actor);
      case "contacts": return this.#showContactsBook(DialogV2, actor);
      case "abilities": return this.#showAbilitiesBook(DialogV2, actor);
      case "shadow": return this.#showShadowBook(DialogV2, actor);
      case "equipment": return this.#showEquipmentBook(DialogV2, actor);
      case "personality": return this.#showPersonalityBook(DialogV2, actor);
      case "friends": return this.#showFriendsBook(DialogV2, actor);
      default: return Promise.resolve(null);
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
      position: { width: 1060, height: 680 },
      content: occupationBookContent(actor),
      buttons: [
        {
          action: "choose-occupation",
          icon: "fa-solid fa-feather-pointed",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Occupation.Choose"),
          default: true,
          callback: async (_event, button) => {
            const occupationId = formValue(button.form, "occupation");
            const occupation = coreOccupation(occupationId);
            const customOccupation = occupationId === "custom"
              ? customOccupationFromForm(button.form)
              : null;
            if (!occupation && !customOccupation) return null;
            if (customOccupation && !customOccupation.name) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Occupation.CustomNameRequired"));
              return null;
            }

            const name = occupation
              ? game.i18n.localize(occupation.name)
              : customOccupation.name;
            await actor.update({ "system.bio.occupation": name });
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const { customOccupation: _previousCustomOccupation, ...preservedState } = previous;
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...preservedState,
              version: 1,
              step: furthestCreatorProgress(previous.step, OCCUPATION_STEP_COMPLETE),
              archetype: occupation?.archetype ?? "custom",
              occupation: occupation?.id ?? "custom",
              ...(customOccupation ? { customOccupation } : {})
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "occupation",
              archetype: occupation?.archetype ?? "custom",
              occupation: occupation?.id ?? "custom",
              ...(customOccupation ? { customOccupation } : {})
            });
            return occupation?.id ?? "custom";
          }
        },
        ...creatorNavigationDialogButtons(actor, "occupation")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindOccupationBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showAttributesBook(DialogV2, actor) {
    const returningAfterAbilities = isAbilitiesStepComplete(actor);
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-attributes-book-dialog"
      ],
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Attributes.Title")
      },
      position: { width: 1060, height: 680 },
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
              step: furthestCreatorProgress(previous.step, ATTRIBUTES_STEP_COMPLETE),
              attributesDeferred: false,
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
        ...(!returningAfterAbilities ? [{
          action: "defer-attributes",
          icon: "fa-solid fa-forward-step",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Attributes.AdjustLater"),
          callback: async () => {
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: furthestCreatorProgress(previous.step, ATTRIBUTES_STEP_COMPLETE),
              attributesDeferred: true
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepDeferred`, actor, {
              step: "attributes",
              resumeAfter: "abilities"
            });
            return "attributes-deferred";
          }
        }] : []),
        ...creatorNavigationDialogButtons(actor, "attributes")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
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
      position: { width: 1060, height: 680 },
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
            const keepsContacts = traitIds.includes("contacts");
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: furthestCreatorProgress(previous.step, RACE_STEP_COMPLETE),
              race: race.id,
              raceTraits: traitIds,
              abilityCostTraits: optional,
              contacts: keepsContacts ? previous.contacts : null
            });
            if (!keepsContacts && previous.contacts) {
              await actor.update({ "system.notes": contactsNotes(actor.system?.notes, null) });
            }
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
        ...creatorNavigationDialogButtons(actor, "race")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindRaceBook(dialog.element, actor);
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
      position: { width: 1140, height: 700 },
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
              step: furthestCreatorProgress(previous.step, ABILITIES_STEP_COMPLETE),
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
        ...creatorNavigationDialogButtons(actor, "abilities")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindAbilitiesBook(dialog.element, racialCost);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showContactsBook(DialogV2, actor) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-contacts-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Contacts.Title") },
      position: { width: 1060, height: 680 },
      content: contactsBookContent(actor),
      buttons: [
        {
          action: "choose-contacts",
          icon: "fa-solid fa-address-book",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Contacts.Choose"),
          default: true,
          callback: async (_event, button) => {
            const contacts = {
              network: formValue(button.form, "contactsNetwork").trim(),
              people: Array.from({ length: 4 }, (_, index) => ({
                name: formValue(button.form, `contactName-${index}`).trim(),
                role: formValue(button.form, `contactRole-${index}`).trim(),
                location: formValue(button.form, `contactLocation-${index}`).trim()
              })).filter((contact) => Object.values(contact).some(Boolean)),
              relationship: formValue(button.form, "contactsRelationship").trim(),
              access: formValue(button.form, "contactsAccess").trim(),
              complications: formValue(button.form, "contactsComplications").trim()
            };
            if (!contacts.network || !contacts.relationship) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Contacts.Required"));
              return null;
            }
            await actor.update({ "system.notes": contactsNotes(actor.system?.notes, contacts) });
            const contactsTrait = actorItems(actor).find((item) =>
              ["boon", "trait"].includes(item?.type)
              && normalizeName(item.system?.reference || item.name).startsWith("contacts")
            );
            if (typeof contactsTrait?.update === "function") {
              const traitName = game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.Traits.contacts.Name");
              await contactsTrait.update({ name: `${traitName} (${contacts.network})` });
            }
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              contacts
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorTraitPrepared`, actor, {
              trait: "contacts", contacts
            });
            return contacts;
          }
        },
        ...creatorNavigationDialogButtons(actor, "contacts")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindContactsBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showShadowBook(DialogV2, actor) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-shadow-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Shadow.Title") },
      position: { width: 1060, height: 690 },
      content: shadowBookContent(actor),
      buttons: [
        {
          action: "choose-shadow",
          icon: "fa-solid fa-eye",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Shadow.Choose"),
          default: true,
          callback: async (_event, button) => {
            const shadow = formValue(button.form, "shadow").trim();
            if (!shadow) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Shadow.Required"));
              return null;
            }
            await actor.update({ "system.bio.shadow": shadow });
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: furthestCreatorProgress(previous.step, SHADOW_STEP_COMPLETE),
              shadow
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "shadow", shadow
            });
            return shadow;
          }
        },
        ...creatorNavigationDialogButtons(actor, "shadow")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindShadowBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showEquipmentBook(DialogV2, actor) {
    const grants = creationEquipmentGrants(actor);
    const equipment = availableCreationEquipment(actor);
    const campingEquipment = findCampingEquipment(actor, equipment);
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-equipment-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.Title") },
      position: { width: 1060, height: 690 },
      content: equipmentBookContent(actor, grants, equipment, campingEquipment),
      buttons: [
        {
          action: "choose-equipment",
          icon: "fa-solid fa-backpack",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.Choose"),
          default: true,
          callback: async (_event, button) => {
            const currentGrants = creationEquipmentGrants(actor);
            const currentEquipment = availableCreationEquipment(actor);
            const selections = [];
            for (const grant of currentGrants) {
              if (grant.category === "marksman-choice") {
                const choice = formValue(button.form, equipmentGrantField(grant, 0));
                const marksmanEquipment = resolveMarksmanEquipment(currentEquipment, choice);
                if (!marksmanEquipment) {
                  ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.MarksmanRequired"));
                  return null;
                }
                selections.push(...marksmanEquipment.items.map(({ item, quantity }) => ({
                  grant, item, quantity, combination: marksmanEquipment.choice
                })));
                continue;
              }
              if (grant.category === "starting-combination") {
                const combinationId = formValue(button.form, equipmentGrantField(grant, 0));
                const combination = resolveStartingCombination(currentEquipment, combinationId);
                if (!combination) {
                  ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.Required"));
                  return null;
                }
                selections.push(...combination.items.map(({ item, quantity = 1 }) => ({
                  grant, item, quantity, combination: combination.id
                })));
                continue;
              }
              const item = findGenericEquipment(currentEquipment, grant.category);
              if (!item) {
                ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.NoMatchingItems"));
                return null;
              }
              for (let index = 0; index < grant.quantity; index += 1) {
                selections.push({ grant, item, quantity: 1 });
              }
            }

            const camp = findCampingEquipment(actor, currentEquipment);
            const alreadyHasCamp = actorItems(actor).some(isCampingEquipment);
            if (!camp && !alreadyHasCamp) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.MissingCamping"));
              return null;
            }

            const documents = selections.map(({ item, quantity }) => creationEquipmentData(item, quantity));
            if (!alreadyHasCamp) documents.push(creationEquipmentData(camp));
            const created = documents.length
              ? await actor.createEmbeddedDocuments("Item", documents)
              : [];
            const experience = creationExperienceTotal(actor);
            const thaler = startingThalerForExperience(experience);
            await actor.update({ "system.money.thaler": thaler });

            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const saved = selections.map(({ grant, item, quantity, combination }) => ({
              ability: grant.ability,
              category: grant.category,
              itemId: item.id,
              itemName: item.name,
              quantity,
              ...(combination ? { combination } : {})
            }));
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: furthestCreatorProgress(previous.step, EQUIPMENT_STEP_COMPLETE),
              equipment: saved,
              campingEquipment: camp?.name ?? actorItems(actor).find(isCampingEquipment)?.name ?? "",
              startingThaler: thaler,
              startingExperience: experience
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "equipment", equipment: saved, thaler, created
            });
            return { equipment: saved, thaler, created };
          }
        },
        ...creatorNavigationDialogButtons(actor, "equipment")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindEquipmentBook(dialog.element, actor);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showPersonalityBook(DialogV2, actor) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-personality-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Personality.Title") },
      position: { width: 1060, height: 700 },
      content: personalityBookContent(actor),
      buttons: [
        {
          action: "choose-personality",
          icon: "fa-solid fa-feather-pointed",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Personality.Choose"),
          default: true,
          callback: async (_event, button) => {
            const characterName = formValue(button.form, "personalityName").trim();
            const biography = {
              quote: formValue(button.form, "personalityQuote").trim(),
              age: formValue(button.form, "personalityAge").trim(),
              height: formValue(button.form, "personalityHeight").trim(),
              weight: formValue(button.form, "personalityWeight").trim(),
              appearance: formValue(button.form, "personalityAppearance").trim(),
              background: formValue(button.form, "personalityBackground").trim(),
              personalGoal: formValue(button.form, "personalityGoal").trim()
            };
            if (!characterName || !biography.appearance || !biography.background || !biography.personalGoal) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Personality.Required"));
              return null;
            }
            await actor.update({
              name: characterName,
              ...Object.fromEntries(Object.entries(biography).map(([field, value]) => [
                `system.bio.${field}`, value
              ]))
            });
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: furthestCreatorProgress(previous.step, PERSONALITY_STEP_COMPLETE),
              personality: { characterName, ...biography }
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "personality", personality: { characterName, ...biography }
            });
            return { characterName, ...biography };
          }
        },
        ...creatorNavigationDialogButtons(actor, "personality")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindPersonalityBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showFriendsBook(DialogV2, actor) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-friends-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Friends.Title") },
      position: { width: 1060, height: 690 },
      content: friendsBookContent(actor),
      buttons: [
        {
          action: "choose-friends",
          icon: "fa-solid fa-people-group",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Friends.Choose"),
          default: true,
          callback: async (_event, button) => {
            const companions = Array.from({ length: 5 }, (_, index) => ({
              name: formValue(button.form, `friendName-${index}`).trim(),
              race: formValue(button.form, `friendRace-${index}`).trim(),
              occupation: formValue(button.form, `friendOccupation-${index}`).trim(),
              player: formValue(button.form, `friendPlayer-${index}`).trim()
            })).filter((friend) => Object.values(friend).some(Boolean));
            const group = {
              name: formValue(button.form, "groupName").trim(),
              goal: formValue(button.form, "groupGoal").trim()
            };
            if (!group.goal) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Friends.Required"));
              return null;
            }
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const friendsGroup = { companions, group };
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              version: 1,
              step: furthestCreatorProgress(previous.step, FRIENDS_STEP_COMPLETE),
              friendsGroup
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "friends", ...friendsGroup
            });
            return friendsGroup;
          }
        },
        ...creatorNavigationDialogButtons(actor, "friends")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorStepNavigation(dialog.element);
        bindFriendsBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }
}

function creatorStepIndex(step) {
  return CREATOR_STEPS.findIndex((entry) => entry.id === step || entry.complete === step);
}

function furthestCreatorProgress(previous, completed) {
  return creatorStepIndex(previous) > creatorStepIndex(completed) ? previous : completed;
}

function isCreatorStepFilled(actor, step) {
  switch (step) {
    case "occupation": return isOccupationStepComplete(actor);
    case "attributes": return isAttributesStepComplete(actor);
    case "race": return isRaceStepComplete(actor);
    case "abilities": return isAbilitiesStepComplete(actor);
    case "shadow": return isShadowStepComplete(actor);
    case "equipment": return isEquipmentStepComplete(actor);
    default: return false;
  }
}

function nextRequiredCreatorStep(actor, currentStep) {
  if (isAbilitiesStepComplete(actor) && !isAttributesStepComplete(actor)) return "attributes";
  if (currentStep === "race" && isContactsPreparationRequired(actor)) return "contacts";
  if (currentStep === "contacts") return isAbilitiesStepComplete(actor) ? null : "abilities";
  const currentIndex = creatorStepIndex(currentStep);
  return CREATOR_STEPS.slice(currentIndex + 1).find((entry) => !isCreatorStepFilled(actor, entry.id))?.id ?? null;
}

function creatorNavigationTargets(actor, currentStep) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const hasContacts = Boolean(state.raceTraits?.includes("contacts") && state.contacts);
  if (currentStep === "contacts") {
    return { previous: "race", next: isAbilitiesStepComplete(actor) ? "abilities" : null };
  }
  const index = creatorStepIndex(currentStep);
  const previous = currentStep === "abilities" && hasContacts
    ? "contacts"
    : index > 0 && isCreatorStepFilled(actor, CREATOR_STEPS[index - 1].id)
    ? CREATOR_STEPS[index - 1].id
    : null;
  const nextEntry = CREATOR_STEPS[index + 1];
  const deferredAttributesBlock = currentStep === "attributes"
    && isAbilitiesStepComplete(actor)
    && !isAttributesStepComplete(actor);
  const next = currentStep === "race" && hasContacts
    ? "contacts"
    : nextEntry && !deferredAttributesBlock && isCreatorStepFilled(actor, nextEntry.id)
      ? nextEntry.id
      : null;
  return { previous, next };
}

function creatorNavigationDialogButtons(actor, currentStep) {
  const targets = creatorNavigationTargets(actor, currentStep);
  return [
    ...(targets.previous ? [{
      action: "creator-previous-step",
      label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Guide.PreviousStep"),
      callback: () => ({ creatorNavigation: true, step: targets.previous })
    }] : []),
    ...(targets.next ? [{
      action: "creator-next-step",
      label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Guide.NextStep"),
      callback: () => ({ creatorNavigation: true, step: targets.next })
    }] : [])
  ];
}

function isCreatorNavigationResult(result) {
  return Boolean(result?.creatorNavigation && (
    result.step === "contacts" || CREATOR_STEPS.some((entry) => entry.id === result.step)
  ));
}

function creatorStepNumber(actor, currentStep, progressKey) {
  const targets = creatorNavigationTargets(actor, currentStep);
  const navigationButton = (direction, target, icon, labelKey) => `
    <button type="button" class="symbaroum-hud-creator-step-arrow"
      data-creator-navigation="${direction}" ${target ? "" : "disabled"}
      aria-label="${localizeEscaped(labelKey)}" title="${localizeEscaped(labelKey)}">
      <i class="fa-solid ${icon}" aria-hidden="true"></i>
    </button>`;
  return `
    <div class="symbaroum-hud-creator-step-number">
      ${navigationButton("previous", targets.previous, "fa-chevron-left", "SYMBAROUMHUD.CharacterCreator.Guide.PreviousStep")}
      <strong>${localizeEscaped(progressKey)}</strong>
      ${navigationButton("next", targets.next, "fa-chevron-right", "SYMBAROUMHUD.CharacterCreator.Guide.NextStep")}
    </div>`;
}

function bindCreatorStepNavigation(element) {
  for (const trigger of element.querySelectorAll("[data-creator-navigation]:not([disabled])")) {
    trigger.addEventListener("click", () => {
      const action = trigger.dataset.creatorNavigation === "previous"
        ? "creator-previous-step"
        : "creator-next-step";
      element.querySelector(`.form-footer button[data-action="${action}"], button[data-action="${action}"]`)?.click();
    });
  }
}

function occupationBookContent(actor) {
  const creatorState = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const selectedId = creatorState.occupation === "custom" || coreOccupation(creatorState.occupation)
    ? creatorState.occupation
    : CORE_OCCUPATIONS[0].id;
  const custom = creatorState.customOccupation ?? {};
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
  }).join("") + `
    <section class="symbaroum-hud-occupation-index-group symbaroum-hud-occupation-custom-index">
      <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomGroup")}</h3>
      <button type="button" class="symbaroum-hud-occupation-index-entry"
        data-occupation-id="custom" data-active="${selectedId === "custom"}"
        aria-pressed="${selectedId === "custom"}">
        <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
        <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomName")}</span>
      </button>
    </section>`;

  const pages = CORE_OCCUPATIONS.map((occupation) => {
    const archetype = OCCUPATION_ARCHETYPES.find((entry) => entry.id === occupation.archetype);
    const appropriateAbilities = occupationAbilityLinks(actor, game.i18n.localize(occupation.abilities));
    return `
      <article class="symbaroum-hud-occupation-page"
        data-occupation-page="${occupation.id}"
        ${occupation.id === selectedId ? "" : "hidden"}>
        <header class="symbaroum-hud-occupation-chapter-banner">
          <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ArchetypeLabel")}</span>
          <strong>${localizeEscaped(archetype.label)}</strong>
        </header>
        <div class="symbaroum-hud-occupation-journal-spread">
          <section class="symbaroum-hud-occupation-journal-card">
            <h2>${localizeEscaped(occupation.name)}</h2>
            <blockquote>${localizeEscaped(occupation.quote)}</blockquote>
            <hr>
            <p class="symbaroum-hud-occupation-summary">${localizeEscaped(occupation.summary)}</p>
            <ul class="symbaroum-hud-occupation-facts">
              <li><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ImportantAttributes")}:</strong><span>${localizeEscaped(occupation.attributes)}</span></li>
              <li><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SuggestedRaces")}:</strong><span>${localizeEscaped(occupation.races)}</span></li>
              <li><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.AppropriateAbilities")}:</strong><span class="symbaroum-hud-occupation-ability-links">${appropriateAbilities}</span></li>
            </ul>
          </section>
          <figure class="symbaroum-hud-occupation-art" data-occupation-art="${occupation.id}"
            style="--symbaroum-hud-occupation-art: url(&quot;/${escapeHtml(occupation.art)}&quot;)">
            <i class="fa-solid ${occupation.icon}" aria-hidden="true"></i>
            <figcaption>${localizeEscaped(archetype.summary)}</figcaption>
          </figure>
        </div>
      </article>
    `;
  }).join("");

  const customPage = `
    <article class="symbaroum-hud-occupation-page symbaroum-hud-custom-occupation-page"
      data-occupation-page="custom" ${selectedId === "custom" ? "" : "hidden"}>
      <header class="symbaroum-hud-occupation-chapter-banner">
        <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ArchetypeLabel")}</span>
        <strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomArchetype")}</strong>
      </header>
      <div class="symbaroum-hud-occupation-journal-spread">
        <section class="symbaroum-hud-occupation-journal-card symbaroum-hud-custom-occupation-card">
          <label class="symbaroum-hud-custom-occupation-name">
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomOccupationName")}</span>
            <input type="text" name="customOccupationName" value="${escapeHtml(custom.name)}"
              placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomOccupationNamePlaceholder")}" autocomplete="off">
          </label>
          <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomQuote")}</span>
            <input type="text" name="customOccupationQuote" value="${escapeHtml(custom.quote)}"
              placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomQuotePlaceholder")}" autocomplete="off"></label>
          <hr>
          <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomSummary")}</span>
            <textarea name="customOccupationSummary" rows="3" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomSummaryPlaceholder")}">${escapeHtml(custom.summary)}</textarea></label>
          <div class="symbaroum-hud-custom-occupation-facts">
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ImportantAttributes")}</span>
              <input type="text" name="customOccupationAttributes" value="${escapeHtml(custom.attributes)}" autocomplete="off"></label>
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SuggestedRaces")}</span>
              <input type="text" name="customOccupationRaces" value="${escapeHtml(custom.races)}" autocomplete="off"></label>
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.AppropriateAbilities")}</span>
              <textarea name="customOccupationAbilities" rows="2" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomAbilitiesPlaceholder")}">${escapeHtml(custom.abilities)}</textarea></label>
          </div>
        </section>
        <figure class="symbaroum-hud-occupation-art symbaroum-hud-custom-occupation-art">
          <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
          <figcaption>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomHint")}</figcaption>
        </figure>
      </div>
    </article>`;

  return `
    <div class="symbaroum-hud-occupation-book">
      <input type="hidden" name="occupation" value="${selectedId}">
      <header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "occupation", "SYMBAROUMHUD.CharacterCreator.Guide.Progress")}
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
        ${customPage}
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
      if (!coreOccupation(id) && id !== "custom") return;
      input.value = id;
      for (const candidate of entries) {
        const active = candidate.dataset.occupationId === id;
        candidate.dataset.active = String(active);
        candidate.setAttribute("aria-pressed", String(active));
      }
      for (const page of pages) page.hidden = page.dataset.occupationPage !== id;
    });
  }
  for (const button of element.querySelectorAll("[data-open-occupation-ability]")) {
    button.addEventListener("click", () => {
      const item = occupationAbilityDocument(button.dataset.openOccupationAbility);
      if (!item) {
        ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable"));
        return;
      }
      openCreationItemSheet(item);
    });
  }
}

function customOccupationFromForm(form) {
  return {
    name: formValue(form, "customOccupationName").trim(),
    quote: formValue(form, "customOccupationQuote").trim(),
    summary: formValue(form, "customOccupationSummary").trim(),
    attributes: formValue(form, "customOccupationAttributes").trim(),
    races: formValue(form, "customOccupationRaces").trim(),
    abilities: formValue(form, "customOccupationAbilities").trim()
  };
}

function occupationAbilityLinks(actor, value) {
  return String(value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean).map((label) => {
    const item = occupationAbilityDocument(null, actor, label);
    if (!item) return `<span>${escapeHtml(label)}</span>`;
    const title = `${game.i18n.localize("SYMBAROUMHUD.Actions.OpenAbility")}: ${label}`;
    return `<button type="button" class="symbaroum-hud-occupation-ability-link"
      data-open-occupation-ability="${escapeHtml(item.id)}" title="${escapeHtml(title)}">
      ${escapeHtml(label)}
    </button>`;
  }).join(", ");
}

function occupationAbilityDocument(id, actor = null, label = "") {
  const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
  const suggestedName = normalizeName(String(label).replace(/\s*\([^)]*\)\s*$/, ""));
  return [...actorItems(actor), ...Array.from(game.items?.values?.() ?? game.items ?? [])].find((item) => {
    if (item?.type !== "ability") return false;
    if (id && item.id !== id) return false;
    if (!id && suggestedName && ![
      normalizeName(item.name),
      normalizeName(item.system?.reference)
    ].includes(suggestedName)) return false;
    return !item.testUserPermission || item.testUserPermission(game.user, observerLevel);
  }) ?? null;
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
    const required = race.required.map((id) => traitCard(actor, id, "required", race.id)).join("");
    const choices = race.choice.map((id) => traitCard(actor, id, "choice", race.id)).join("");
    const optional = race.optional.map((id) => traitCard(actor, id, "optional", race.id)).join("");
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
        ${creatorStepNumber(actor, "race", "SYMBAROUMHUD.CharacterCreator.Guide.RaceProgress")}
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

function traitCard(actor, id, mode, raceId) {
  const trait = coreRaceTrait(id);
  const source = raceTraitDocument(actor, trait);
  const control = mode === "required"
    ? `<i class="fa-solid fa-circle-check" aria-hidden="true"></i>`
    : `<input type="${mode === "choice" ? "radio" : "checkbox"}"
        name="race-${mode}-${raceId}${mode === "optional" ? `-${id}` : ""}"
        value="${id}">`;
  return `
    <article class="symbaroum-hud-race-trait-card" data-trait-mode="${mode}">
      <label class="symbaroum-hud-race-trait-control" title="${localizeEscaped(mode === "required"
        ? "SYMBAROUMHUD.CharacterCreator.Race.Automatic"
        : "SYMBAROUMHUD.CharacterCreator.Race.SelectTrait")}">${control}</label>
      <i class="fa-solid ${trait.icon}" aria-hidden="true"></i>
      <button type="button" class="symbaroum-hud-race-trait-open"
        data-open-race-trait="${escapeHtml(id)}" ${source ? "" : "disabled"}
        title="${source
          ? formatEscaped("SYMBAROUMHUD.CharacterCreator.Race.OpenTrait", { name: game.i18n.localize(trait.name) })
          : localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.TraitUnavailable")}">
        <strong>${localizeEscaped(trait.name)}</strong>
        <i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i>
      </button>
    </article>`;
}

function bindRaceBook(element, actor) {
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
  for (const button of element.querySelectorAll("[data-open-race-trait]:not([disabled])")) {
    button.addEventListener("click", () => {
      const trait = coreRaceTrait(button.dataset.openRaceTrait);
      const item = raceTraitDocument(actor, trait);
      if (!item) {
        ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.TraitUnavailable"));
        return;
      }
      openCreationItemSheet(item);
    });
  }
  refresh();
}

function contactsBookContent(actor) {
  const saved = actor.getFlag?.(MODULE_ID, STATE_FLAG)?.contacts ?? {};
  const people = Array.from({ length: 4 }, (_, index) => saved.people?.[index] ?? {});
  const contactField = (name, label, value = "", placeholder = "") => `
    <label><span>${localizeEscaped(label)}</span>
      <input type="text" name="${name}" value="${escapeHtml(value)}" placeholder="${localizeEscaped(placeholder)}"></label>`;
  const peopleRows = people.map((contact, index) => `
    <article class="symbaroum-hud-contact-row">
      <span class="symbaroum-hud-contact-number">${index + 1}</span>
      ${contactField(`contactName-${index}`, "SYMBAROUMHUD.CharacterCreator.Contacts.PersonName", contact.name, "SYMBAROUMHUD.CharacterCreator.Contacts.PersonNamePlaceholder")}
      ${contactField(`contactRole-${index}`, "SYMBAROUMHUD.CharacterCreator.Contacts.PersonRole", contact.role, "SYMBAROUMHUD.CharacterCreator.Contacts.PersonRolePlaceholder")}
      ${contactField(`contactLocation-${index}`, "SYMBAROUMHUD.CharacterCreator.Contacts.PersonLocation", contact.location, "SYMBAROUMHUD.CharacterCreator.Contacts.PersonLocationPlaceholder")}
    </article>`).join("");
  return `
    <div class="symbaroum-hud-contacts-book">
      <header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "contacts", "SYMBAROUMHUD.CharacterCreator.Contacts.Progress")}
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Heading")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.StepText")}</p></div>
      </header>
      <div class="symbaroum-hud-contacts-workspace">
        <aside class="symbaroum-hud-contacts-guide">
          <header><i class="fa-solid fa-address-book" aria-hidden="true"></i>
            <div><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.TraitLabel")}</span>
              <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.HowItWorks")}</h2></div></header>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Introduction")}</p>
          <section><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.InPlayHeading")}</h3>
            <ol>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.InPlay.Declare")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.InPlay.Connect")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.InPlay.Master")}</li>
            </ol></section>
          <section><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.CanProvideHeading")}</h3>
            <ul>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.CanProvide.Information")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.CanProvide.Introduction")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.CanProvide.Help")}</li>
            </ul></section>
          <blockquote>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Limits")}</blockquote>
        </aside>
        <main class="symbaroum-hud-contacts-page">
          <header><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.RecordLabel")}</span>
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.WhoAreThey")}</h2></header>
          <section class="symbaroum-hud-contacts-network">
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Network")}<i class="fa-solid fa-asterisk" aria-hidden="true"></i></span>
              <input type="text" name="contactsNetwork" required value="${escapeHtml(saved.network ?? "")}" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.NetworkPlaceholder")}">
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.NetworkHint")}</small></label>
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Relationship")}<i class="fa-solid fa-asterisk" aria-hidden="true"></i></span>
              <textarea name="contactsRelationship" required placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.RelationshipPlaceholder")}">${escapeHtml(saved.relationship ?? "")}</textarea></label>
          </section>
          <section class="symbaroum-hud-contact-people">
            <header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.PeopleHeading")}</h3>
              <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.PeopleHint")}</p></header>
            ${peopleRows}
          </section>
          <section class="symbaroum-hud-contacts-details">
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Access")}</span>
              <textarea name="contactsAccess" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.AccessPlaceholder")}">${escapeHtml(saved.access ?? "")}</textarea></label>
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Complications")}</span>
              <textarea name="contactsComplications" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.ComplicationsPlaceholder")}">${escapeHtml(saved.complications ?? "")}</textarea></label>
          </section>
        </main>
      </div>
    </div>`;
}

function bindContactsBook(element) {
  const required = Array.from(element.querySelectorAll("[required]"));
  const confirm = element.querySelector('[data-action="choose-contacts"]');
  const refresh = () => {
    if (confirm) confirm.disabled = required.some((field) => !field.value.trim());
  };
  for (const field of required) field.addEventListener("input", refresh);
  refresh();
}

const CONTACTS_NOTES_START = "<!-- symbaroum-hud:contacts:start -->";
const CONTACTS_NOTES_END = "<!-- symbaroum-hud:contacts:end -->";

function contactsNotes(existingNotes, contacts) {
  const current = String(existingNotes ?? "");
  const escapedStart = CONTACTS_NOTES_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = CONTACTS_NOTES_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutExisting = current.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "g"), "").trim();
  if (!contacts) return withoutExisting;
  const detail = (labelKey, value) => value
    ? `<p><strong>${localizeEscaped(labelKey)}:</strong> ${escapeHtml(value)}</p>`
    : "";
  const people = contacts.people?.length
    ? `<h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.PeopleHeading")}</h3><ul>${contacts.people.map((contact) => {
      const details = [contact.role, contact.location].filter(Boolean).map(escapeHtml).join(" — ");
      return `<li><strong>${escapeHtml(contact.name || game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Contacts.UnnamedContact"))}</strong>${details ? ` — ${details}` : ""}</li>`;
    }).join("")}</ul>`
    : "";
  const block = `${CONTACTS_NOTES_START}<section class="symbaroum-hud-character-contacts"><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.NotesHeading")}</h2>${detail("SYMBAROUMHUD.CharacterCreator.Contacts.Network", contacts.network)}${detail("SYMBAROUMHUD.CharacterCreator.Contacts.Relationship", contacts.relationship)}${people}${detail("SYMBAROUMHUD.CharacterCreator.Contacts.Access", contacts.access)}${detail("SYMBAROUMHUD.CharacterCreator.Contacts.Complications", contacts.complications)}</section>${CONTACTS_NOTES_END}`;
  return [withoutExisting, block].filter(Boolean).join("\n");
}

function raceTraitDocument(actor, trait) {
  if (!trait) return null;
  const aliases = [trait.id, game.i18n.localize(trait.name), ...trait.aliases].map(normalizeName);
  const matches = (item) => ["trait", "boon", "burden"].includes(item?.type)
    && aliases.includes(normalizeName(item.system?.reference || item.name));
  const embedded = actorItems(actor).find(matches);
  if (embedded) return embedded;
  const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
  return Array.from(game.items?.values?.() ?? game.items ?? []).find((item) =>
    matches(item) && (!item.testUserPermission || item.testUserPermission(game.user, observerLevel))
  ) ?? null;
}

function availableCreationAbilities(actor, { includeKnownMysticalPowerAbility = false } = {}) {
  const known = new Set(actorItems(actor)
    .filter((item) => item.type === "ability")
    .map(abilityIdentity));
  return availableCreationWorldItems(known, (item) => item?.type === "ability", {
    includeKnown: includeKnownMysticalPowerAbility ? isMysticalPowerAbility : null
  });
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

function availableCreationWorldItems(known, predicate, { includeKnown = null } = {}) {
  const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
  const unique = new Map();
  for (const item of Array.from(game.items?.values?.() ?? game.items ?? [])) {
    if (!predicate(item)) continue;
    if (item.testUserPermission && !item.testUserPermission(game.user, observerLevel)) continue;
    const identity = abilityIdentity(item);
    if (!identity || (known.has(identity) && !includeKnown?.(item)) || unique.has(identity)) continue;
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

async function abilitiesBookContent(actor, abilities, racialCost, mysticalPowers, rituals, options = {}) {
  const browserMode = Boolean(options.browserMode);
  const recommendation = occupationAbilityRecommendation(actor);
  const recommendationOrder = new Map((recommendation?.abilities ?? []).map((name, index) => [
    normalizeName(name.replace(/\s*\([^)]*\)\s*$/, "")), index
  ]));
  const isRecommended = (ability) => [normalizeName(ability.name), normalizeName(ability.system?.reference)]
    .some((identity) => recommendationOrder.has(identity));
  const recommendationIndex = (ability) => Math.min(...[
    normalizeName(ability.name), normalizeName(ability.system?.reference)
  ].filter((identity) => recommendationOrder.has(identity)).map((identity) => recommendationOrder.get(identity)));
  const orderedAbilities = [...abilities].sort((left, right) => {
    const leftRecommended = isRecommended(left);
    const rightRecommended = isRecommended(right);
    if (leftRecommended !== rightRecommended) return leftRecommended ? -1 : 1;
    if (leftRecommended) return recommendationIndex(left) - recommendationIndex(right);
    return left.name.localeCompare(right.name, game.i18n?.lang ?? "pt-BR", { sensitivity: "base" });
  });
  const firstId = orderedAbilities[0]?.id ?? "";
  const costs = abilityExperienceCosts();
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const racialTraits = (state.abilityCostTraits ?? [])
    .map((id) => coreRaceTrait(id))
    .filter(Boolean)
    .map((trait) => game.i18n.localize(trait.name));
  const index = orderedAbilities.map((ability) => `
    <button type="button" class="symbaroum-hud-ability-index-entry"
      data-creation-ability-id="${escapeHtml(ability.id)}"
      data-search="${escapeHtml(normalizeName(`${ability.name} ${ability.system?.reference ?? ""} ${isRecommended(ability) ? recommendation?.name ?? "" : ""}`))}"
      data-occupation-recommended="${isRecommended(ability)}"
      data-active="${ability.id === firstId}" aria-pressed="${ability.id === firstId}">
      <img src="${escapeHtml(ability.img || "icons/svg/book.svg")}" alt="">
      <span class="symbaroum-hud-ability-index-label">
        <span>${escapeHtml(ability.name)}</span>
        ${isRecommended(ability) ? `<small><i class="fa-solid fa-compass" aria-hidden="true"></i>${escapeHtml(recommendation.name)}</small>` : ""}
      </span>
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
  const initialExperience = browserMode
    ? Math.max(0, Number(options.experienceBudget) || 0)
    : Math.max(0, Number(actor.system?.experience?.total) || 50);
  return `
    <div class="symbaroum-hud-abilities-book" data-ability-browser="${browserMode}">
      <input type="hidden" name="abilityDistributionMode" value="${ABILITY_DISTRIBUTION_MODES.EXPERIENCE}">
      <input type="hidden" name="abilitySelections" value="[]">
      <header class="symbaroum-hud-creator-step-guide">
        ${browserMode
          ? `<span class="symbaroum-hud-ability-browser-emblem"><i class="fa-solid fa-book-open" aria-hidden="true"></i></span>`
          : creatorStepNumber(actor, "abilities", "SYMBAROUMHUD.CharacterCreator.Guide.AbilitiesProgress")}
        <div><h2>${localizeEscaped(browserMode
          ? "SYMBAROUMHUD.CharacterCreator.Abilities.BrowserHeading"
          : "SYMBAROUMHUD.CharacterCreator.Guide.StepFourTitle")}</h2>
        <p>${localizeEscaped(browserMode
          ? "SYMBAROUMHUD.CharacterCreator.Abilities.BrowserIntroduction"
          : "SYMBAROUMHUD.CharacterCreator.Guide.StepFourText")}</p></div>
      </header>
      ${browserMode ? "" : `<nav class="symbaroum-hud-ability-mode-tabs" aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.DistributionMethod")}">
        <button type="button" data-ability-mode="experience" data-active="true" aria-pressed="true"><i class="fa-solid fa-coins"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperiencePurchase")}</button>
        <button type="button" data-ability-mode="five-novice" data-active="false" aria-pressed="false"><i class="fa-solid fa-hand-fist"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.FiveNovice")}</button>
        <button type="button" data-ability-mode="mixed" data-active="false" aria-pressed="false"><i class="fa-solid fa-crown"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Mixed")}</button>
      </nav>`}
      <div class="symbaroum-hud-ability-workspace">
        <aside class="symbaroum-hud-ability-index">
          <label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-ability-search placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.SearchPlaceholder")}"></label>
          <section class="symbaroum-hud-ability-experience" data-ability-experience-panel>
            <header><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperienceRemaining")}</span>
              <strong data-experience-remaining>${initialExperience}</strong></header>
            <div><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperienceSpent")} <b data-experience-spent>0</b></span>
              <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ExperienceAvailable")}</span>
                <input type="number" name="abilityExperienceBudget" value="${initialExperience}" min="0" step="1" ${browserMode ? "readonly" : ""}></label></div>
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

function occupationAbilityRecommendation(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (state.occupation === "custom") {
    const name = String(state.customOccupation?.name ?? "").trim();
    const abilities = String(state.customOccupation?.abilities ?? "").split(",")
      .map((entry) => entry.trim()).filter(Boolean);
    return name && abilities.length ? { name, abilities } : null;
  }
  const occupation = coreOccupation(state.occupation);
  if (!occupation) return null;
  const abilities = String(game.i18n.localize(occupation.abilities)).split(",")
    .map((entry) => entry.trim()).filter(Boolean);
  return abilities.length ? { name: game.i18n.localize(occupation.name), abilities } : null;
}

function shadowBookContent(actor) {
  const examples = [
    ["nature", "fa-leaf", "Nature"],
    ["civilization", "fa-crown", "Civilization"],
    ["mixed", "fa-circle-half-stroke", "Mixed"],
    ["spiritual", "fa-cloud", "Spiritual"],
    ["corrupted", "fa-burst", "Corrupted"]
  ].map(([tone, icon, key]) => {
    const example = game.i18n.localize(`SYMBAROUMHUD.CharacterCreator.Shadow.Examples.${key}`);
    return `
      <button type="button" class="symbaroum-hud-shadow-example" data-shadow-tone="${tone}"
        data-shadow-example="${escapeHtml(example)}">
        <i class="fa-solid ${icon}" aria-hidden="true"></i>
        <span>${escapeHtml(example)}</span>
      </button>`;
  }).join("");
  const current = String(actor.system?.bio?.shadow ?? "").trim();
  return `
    <div class="symbaroum-hud-shadow-book">
      <header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "shadow", "SYMBAROUMHUD.CharacterCreator.Guide.ShadowProgress")}
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepFiveTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepFiveText")}</p></div>
      </header>
      <div class="symbaroum-hud-shadow-workspace">
        <aside class="symbaroum-hud-shadow-principles">
          <header><i class="fa-solid fa-eye" aria-hidden="true"></i>
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.PrinciplesHeading")}</h2></header>
          ${[
            ["nature", "fa-leaf", "Nature"],
            ["civilization", "fa-landmark", "Civilization"],
            ["darkness", "fa-moon", "Darkness"]
          ].map(([tone, icon, key]) => `
            <section data-shadow-tone="${tone}">
              <i class="fa-solid ${icon}" aria-hidden="true"></i>
              <div><h3>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.Principles.${key}.Title`)}</h3>
                <p>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.Principles.${key}.Text`)}</p></div>
            </section>`).join("")}
          <p class="symbaroum-hud-shadow-mixed-note"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i>
            ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.MixedNote")}</p>
        </aside>
        <main class="symbaroum-hud-shadow-page">
          <section class="symbaroum-hud-shadow-explanation">
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.BookLabel")}</span>
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Heading")}</h2>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Introduction")}</p>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Visibility")}</p>
          </section>
          <section class="symbaroum-hud-shadow-corruption">
            <i class="fa-solid fa-droplet" aria-hidden="true"></i>
            <div><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.CorruptionHeading")}</h3>
              <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.CorruptionText")}</p></div>
          </section>
          <section class="symbaroum-hud-shadow-examples">
            <header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.ExamplesHeading")}</h3>
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.ExamplesHint")}</small></header>
            <div>${examples}</div>
          </section>
          <label class="symbaroum-hud-shadow-entry">
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.FieldLabel")}</span>
            <textarea name="shadow" maxlength="420" required
              placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Placeholder")}">${escapeHtml(current)}</textarea>
            <small><span data-shadow-count>${current.length}</span>/420 · ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.FieldHint")}</small>
          </label>
        </main>
      </div>
    </div>`;
}

function bindShadowBook(element) {
  const textarea = element.querySelector('textarea[name="shadow"]');
  const count = element.querySelector("[data-shadow-count]");
  const confirm = element.querySelector('[data-action="choose-shadow"]');
  const refreshCount = () => {
    if (count) count.textContent = String(textarea?.value?.length ?? 0);
    if (confirm) confirm.disabled = !textarea?.value?.trim();
  };
  textarea?.addEventListener("input", refreshCount);
  for (const example of element.querySelectorAll("[data-shadow-example]")) {
    example.addEventListener("click", () => {
      if (!textarea) return;
      textarea.value = example.dataset.shadowExample;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    });
  }
  refreshCount();
}

export function startingThalerForExperience(experience) {
  return Math.max(0, Math.floor((Number(experience) || 0) / 10));
}

function creationExperienceTotal(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const chosenBudget = Number(state.abilityExperienceBudget);
  if (state.abilityExperienceBudget !== null && state.abilityExperienceBudget !== undefined
    && Number.isFinite(chosenBudget)) return Math.max(0, chosenBudget);
  const nativeTotal = Number(
    actor?.system?.experience?.total
      ?? actor?.system?.experience?.experience?.total
  );
  return nativeTotal > 0 ? nativeTotal : 50;
}

function availableActorExperience(actor) {
  const experience = actor?.system?.experience ?? {};
  const prepared = Number(experience.available);
  if (Number.isFinite(prepared)) return Math.max(0, prepared);
  return Math.max(0,
    (Number(experience.total) || 0)
      - (Number(experience.spent) || 0)
      - (Number(experience.artifactrr) || 0)
  );
}

const CREATION_EQUIPMENT_RULES = Object.freeze({
  manatarms: { category: "medium-armor", label: "MediumArmor", quantity: 1 },
  marksman: { category: "marksman-choice", label: "RangedWeapon", quantity: 1 },
  polearmmastery: { category: "long", label: "Polearm", quantity: 1 },
  shieldfighter: { category: "shield", label: "Shield", quantity: 1 },
  steelthrow: { category: "thrown", label: "ThrownWeapon", quantity: 1 },
  twinattack: { category: "one-handed", label: "OneHandedWeapon", quantity: 1 },
  twohandedforce: { category: "heavy", label: "TwoHandedWeapon", quantity: 1 },
  witchhammer: { category: "one-handed", label: "OneHandedWeapon", quantity: 1 }
});

const CREATION_EQUIPMENT_ABILITY_ALIASES = Object.freeze({
  manatarms: ["homemdearmas", "manatarms"],
  marksman: ["atirador", "marksman"],
  polearmmastery: ["maestriaemarmasdehaste", "polearmmastery"],
  shieldfighter: ["combatentedeescudo", "shieldfighter"],
  steelthrow: ["arremessaraco", "steelthrow"],
  twinattack: ["ataquegemeo", "twinattack"],
  twohandedforce: ["forcadaempunhaduradupla", "twohandedforce"],
  witchhammer: ["martelobruxo", "witchhammer"]
});

const CAMPING_EQUIPMENT_ALIASES = Object.freeze([
  "equipamentodeacampar",
  "equipamentodeacampamento",
  "equipamentodecampo",
  "fieldequipment",
  "campingequipment"
]);

const STARTING_EQUIPMENT_COMBINATIONS = Object.freeze([
  Object.freeze({ id: "staff", label: "StaffCombination", items: Object.freeze([
    Object.freeze({ configured: "staff" }), Object.freeze({ configured: "dagger" })
  ]) }),
  Object.freeze({ id: "sword", label: "OneHandedCombination", items: Object.freeze([
    Object.freeze({ configured: "sword" }), Object.freeze({ configured: "dagger" })
  ]) }),
  Object.freeze({ id: "bow", label: "RangedCombination", items: Object.freeze([
    Object.freeze({ configured: "bow" }), Object.freeze({ configured: "quiver" }),
    Object.freeze({ configured: "ammunition", quantity: 10 }), Object.freeze({ configured: "dagger" })
  ]) })
]);

const CONFIGURED_STARTING_ITEM_ALIASES = Object.freeze({
  staff: Object.freeze(["bordao", "staff", "quarterstaff"]),
  dagger: Object.freeze(["adaga", "dagger"]),
  sword: Object.freeze(["espada", "sword"]),
  bow: Object.freeze(["arco", "bow"]),
  quiver: Object.freeze(["aljava", "quiver"]),
  ammunition: Object.freeze([
    "flecha", "flechas", "virote", "virotes", "flechasvirotes",
    "flechasvirotesregulares", "arrow", "arrows", "bolt", "bolts", "ammo", "ammunition"
  ])
});

function creationEquipmentGrants(actor) {
  const grants = [];
  for (const item of actorItems(actor)) {
    const identity = normalizeName(item?.system?.reference || item?.name);
    const ability = Object.entries(CREATION_EQUIPMENT_ABILITY_ALIASES)
      .find(([, aliases]) => aliases.includes(identity))?.[0];
    const rule = CREATION_EQUIPMENT_RULES[ability];
    if (!rule) continue;
    const adeptTwinAttack = ability === "twinattack"
      && Boolean(item?.system?.adept?.isActive || item?.system?.master?.isActive);
    grants.push({
      ...rule,
      source: "ability",
      ability,
      abilityName: item.name,
      quantity: adeptTwinAttack ? 2 : rule.quantity
    });
  }
  const hasAbilityEquipment = grants.length > 0;
  const hasAbilityArmor = grants.some((grant) => isArmorEquipmentCategory(grant.category));
  return [
    ...grants,
    ...(!hasAbilityEquipment ? [{
      source: "basic",
      ability: "basicweapon",
      abilityName: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.BasicWeaponHeading"),
      category: "starting-combination",
      label: "BasicWeapon",
      quantity: 1
    }] : []),
    ...(!hasAbilityArmor ? [{
      source: "basic",
      ability: "basicarmor",
      abilityName: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.BasicEquipmentHeading"),
      category: "light-armor",
      label: "LightArmor",
      quantity: 1
    }] : [])
  ];
}

function isArmorEquipmentCategory(category) {
  return category === "light-armor" || category === "medium-armor";
}

function availableCreationEquipment(actor) {
  const known = new Set(actorItems(actor).map(equipmentIdentity));
  const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
  const unique = new Map();
  for (const item of Array.from(game.items?.values?.() ?? game.items ?? [])) {
    if (!["weapon", "armor", "equipment"].includes(item?.type)) continue;
    if (item.testUserPermission && !item.testUserPermission(game.user, observerLevel)) continue;
    const identity = equipmentIdentity(item);
    if (!identity || (known.has(identity) && isCampingEquipment(item)) || unique.has(item.id)) continue;
    unique.set(item.id, item);
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(
    right.name, game.i18n?.lang ?? "pt-BR", { sensitivity: "base" }
  ));
}

function equipmentIdentity(item) {
  return `${item?.type ?? ""}:${normalizeName(item?.system?.reference || item?.name)}`;
}

function findCampingEquipment(actor, equipment = availableCreationEquipment(actor)) {
  if (actorItems(actor).some(isCampingEquipment)) return null;
  return equipment.find(isCampingEquipment) ?? null;
}

function isCampingEquipment(item) {
  if (item?.type !== "equipment") return false;
  const reference = normalizeName(item?.system?.reference);
  const name = normalizeName(item?.name);
  return CAMPING_EQUIPMENT_ALIASES.includes(reference) || CAMPING_EQUIPMENT_ALIASES.includes(name);
}

function resolveStartingCombination(equipment, combinationId) {
  const combination = STARTING_EQUIPMENT_COMBINATIONS.find((entry) => entry.id === combinationId);
  if (!combination) return null;
  const items = combination.items.map(({ configured, quantity = 1 }) => ({
    item: findConfiguredStartingItem(equipment, configured), quantity
  }));
  return items.every(({ item }) => item) ? { ...combination, items } : null;
}

function findConfiguredStartingItem(equipment, configured) {
  const aliases = CONFIGURED_STARTING_ITEM_ALIASES[configured] ?? [];
  return equipment.find((item) => aliases.includes(normalizeName(item?.name)))
    ?? equipment.find((item) => aliases.includes(normalizeName(item?.system?.reference)))
    ?? null;
}

function findMarksmanWeapon(equipment, choice) {
  const aliases = choice === "crossbow"
    ? ["besta", "crossbow"]
    : ["arco", "bow"];
  return equipment.find((item) => item?.type === "weapon" && aliases.includes(
    normalizeName(item?.system?.reference || item?.name)
  )) ?? equipment.find((item) => item?.type === "weapon" && aliases.includes(normalizeName(item?.name))) ?? null;
}

function resolveMarksmanEquipment(equipment, choice) {
  const weapon = findMarksmanWeapon(equipment, choice);
  const quiver = findConfiguredStartingItem(equipment, "quiver");
  const ammunition = findConfiguredStartingItem(equipment, "ammunition");
  return weapon && quiver && ammunition ? {
    choice,
    items: [
      { item: weapon, quantity: 1 },
      { item: quiver, quantity: 1 },
      { item: ammunition, quantity: 10 }
    ]
  } : null;
}

function findGenericEquipment(equipment, category) {
  return equipment.find((item) => genericEquipmentCategory(item) === category) ?? null;
}

function genericEquipmentCategory(item) {
  const reference = normalizeName(item?.system?.reference);
  const name = normalizeName(item?.name);
  if (item?.type === "weapon") {
    if (reference === "long" && ["armalonga", "longweapon"].includes(name)) return "long";
    if (reference === "short" && ["armacurta", "shortweapon"].includes(name)) return "short";
    if (reference === "ranged" && ["armaadistancia", "rangedweapon"].includes(name)) return "ranged";
    if (reference === "1handed" && ["armadeumamao", "armaumamao", "onehandedweapon"].includes(name)) return "one-handed";
    if (reference === "thrown" && ["armadearremesso", "thrownweapon"].includes(name)) return "thrown";
    if (reference === "heavy" && ["armapesada", "armaspesadas", "heavyweapon"].includes(name)) return "heavy";
    if (reference === "shield" && ["escudo", "shield"].includes(name)) return "shield";
  }
  if (item?.type === "armor") {
    if ((reference === "lightarmor" || String(item.system?.baseProtection ?? "") === "1d4")
      && ["armaduraleve", "lightarmor"].includes(name)) return "light-armor";
    if ((reference === "mediumarmor" || String(item.system?.baseProtection ?? "") === "1d6")
      && ["armaduramedia", "mediumarmor"].includes(name)) return "medium-armor";
  }
  if (item?.type === "equipment") {
    if (["aljava", "quiver"].includes(name)) return "quiver";
    if (["flecha", "flechas", "arrow", "arrows", "flechasvirotesregulares"].includes(name)
      || ["arrow", "arrows", "ammo", "ammunition"].includes(reference)) return "arrow";
  }
  return null;
}

function equipmentGrantField(grant, index) {
  return `equipmentGrant-${grant.ability}-${index}`;
}

function creationEquipmentItemLink(item, quantity = 1) {
  if (!item) return `<span class="symbaroum-hud-equipment-unavailable">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.NoMatchingItems")}</span>`;
  return `<button type="button" class="symbaroum-hud-equipment-item-link"
    data-open-equipment-item="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}">
    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
    <span>${escapeHtml(item.name)}${quantity > 1 ? ` ×${quantity}` : ""}</span>
  </button>`;
}

function creationEquipmentAbilitySource(grant) {
  if (!grant?.abilityName) return "";
  return `<span class="symbaroum-hud-equipment-ability-source">${formatEscaped(
    "SYMBAROUMHUD.CharacterCreator.Equipment.GrantedByAbility",
    { ability: grant.abilityName }
  )}</span>`;
}

function equipmentBookContent(actor, grants, equipment, campingEquipment) {
  const experience = creationExperienceTotal(actor);
  const thaler = startingThalerForExperience(experience);
  const alreadyHasCamp = actorItems(actor).some(isCampingEquipment);
  const campItem = alreadyHasCamp ? actorItems(actor).find(isCampingEquipment) : campingEquipment;
  const abilityGrants = grants.filter((grant) => grant.source === "ability");
  const abilityArmorGrant = abilityGrants.find((grant) => isArmorEquipmentCategory(grant.category));
  const combinationGrant = grants.find((grant) => grant.category === "starting-combination");
  const lightArmorGrant = grants.find((grant) => grant.category === "light-armor" && grant.source === "basic");
  const lightArmor = lightArmorGrant ? findGenericEquipment(equipment, "light-armor") : null;
  const abilityNames = [...new Set(abilityGrants.map((grant) => grant.abilityName))];
  const abilityItems = abilityGrants
    .filter((grant) => grant.category !== "marksman-choice")
    .map((grant) => ({ grant, item: findGenericEquipment(equipment, grant.category) }));
  const marksmanGrant = abilityGrants.find((grant) => grant.category === "marksman-choice");
  const marksmanChoices = marksmanGrant ? ["crossbow", "bow"].map((choice) => ({
    choice,
    item: findMarksmanWeapon(equipment, choice),
    resolved: resolveMarksmanEquipment(equipment, choice)
  })) : [];
  const marksmanQuiver = marksmanGrant ? findConfiguredStartingItem(equipment, "quiver") : null;
  const marksmanAmmunition = marksmanGrant ? findConfiguredStartingItem(equipment, "ammunition") : null;
  const combinations = combinationGrant ? STARTING_EQUIPMENT_COMBINATIONS.map((combination) => ({
    combination,
    resolved: resolveStartingCombination(equipment, combination.id)
  })) : [];
  const automaticReady = [
    ...abilityItems.map(({ item }) => Boolean(item)),
    !marksmanGrant || marksmanChoices.some(({ resolved }) => Boolean(resolved)),
    !lightArmorGrant || Boolean(lightArmor)
  ].every(Boolean);

  return `
    <div class="symbaroum-hud-equipment-book" data-camping-ready="${Boolean(campItem)}" data-equipment-ready="${automaticReady}">
      <header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "equipment", "SYMBAROUMHUD.CharacterCreator.Guide.EquipmentProgress")}
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepSixTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepSixText")}</p></div>
      </header>
      <div class="symbaroum-hud-equipment-workspace">
        <aside class="symbaroum-hud-equipment-summary">
          <section class="symbaroum-hud-equipment-money">
            <i class="fa-solid fa-coins" aria-hidden="true"></i>
            <div><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.StartingMoney")}</span>
              <strong>${thaler}</strong><small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.Thaler")}</small></div>
            <p>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.MoneyFormula", { experience, thaler })}</p>
          </section>
        </aside>
        <main class="symbaroum-hud-equipment-page">
          <section class="symbaroum-hud-equipment-official-text">
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.BookLabel")}</h2>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.OfficialIntroductionBeforeCamp")}
              ${creationEquipmentItemLink(campItem)}${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.OfficialIntroductionAfterCamp")}</p>
          </section>
          ${abilityGrants.length ? `<section class="symbaroum-hud-equipment-ability-rewards">
            <h3>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.AbilityGrantLead", { abilities: abilityNames.join(", ") })}</h3>
            <ul>${abilityItems.map(({ grant, item }) => `<li><i class="fa-solid fa-circle-check" aria-hidden="true"></i>${creationEquipmentItemLink(item, grant.quantity)}${creationEquipmentAbilitySource(grant)}</li>`).join("")}</ul>
            ${marksmanGrant ? `<fieldset class="symbaroum-hud-equipment-choice-group symbaroum-hud-equipment-marksman-choice">
              <legend>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.MarksmanChoice")}</legend>
              <div class="symbaroum-hud-equipment-choice-list">
                ${marksmanChoices.map(({ choice, item, resolved }) => `<label class="symbaroum-hud-equipment-choice" data-available="${Boolean(resolved)}">
                  <input type="radio" name="${equipmentGrantField(marksmanGrant, 0)}" value="${choice}" required data-equipment-grant ${resolved ? "" : "disabled"}>
                  <span class="symbaroum-hud-equipment-choice-marker" aria-hidden="true"></span>
                  <img src="${escapeHtml(item?.img || "icons/svg/item-bag.svg")}" alt="">
                  <span class="symbaroum-hud-equipment-choice-name"><strong>${escapeHtml(item?.name || game.i18n.localize(`SYMBAROUMHUD.CharacterCreator.Equipment.${choice === "crossbow" ? "Crossbow" : "Bow"}`))}</strong>${creationEquipmentAbilitySource(marksmanGrant)}</span>
                </label>`).join("")}
              </div>
              <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.MarksmanAlsoReceives")}
                ${creationEquipmentItemLink(marksmanQuiver)} ${creationEquipmentAbilitySource(marksmanGrant)}
                ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.And")}
                ${creationEquipmentItemLink(marksmanAmmunition, 10)} ${creationEquipmentAbilitySource(marksmanGrant)}.</p>
            </fieldset>` : ""}
          </section>` : `<section class="symbaroum-hud-equipment-basic-choice">
            <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.NoAbilityGrantLead")}</h3>
            <fieldset class="symbaroum-hud-equipment-choice-group">
              <div class="symbaroum-hud-equipment-choice-list symbaroum-hud-equipment-combination-list">
                ${combinations.map(({ combination, resolved }) => `<label class="symbaroum-hud-equipment-choice symbaroum-hud-equipment-combination-choice" data-available="${Boolean(resolved)}">
                  <input type="radio" name="${equipmentGrantField(combinationGrant, 0)}" value="${combination.id}" required data-equipment-grant ${resolved ? "" : "disabled"}>
                  <span class="symbaroum-hud-equipment-choice-marker" aria-hidden="true"></span>
                  <span class="symbaroum-hud-equipment-choice-name"><strong>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Equipment.${combination.label}`)}</strong></span>
                </label>`).join("")}
              </div>
              ${combinations.some(({ resolved }) => resolved) ? "" : `<small class="symbaroum-hud-equipment-missing">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.NoMatchingItems")}</small>`}
            </fieldset>
          </section>`}
          <section class="symbaroum-hud-equipment-armor-rule">
            ${abilityArmorGrant
              ? `<p>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ArmorAlreadyGranted", { ability: abilityArmorGrant.abilityName })}</p>`
              : `<p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ArmorIntroductionBefore")}
                ${creationEquipmentItemLink(lightArmor)}${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ArmorIntroductionAfter")}</p>`}
          </section>
        </main>
      </div>
    </div>`;
}

function bindEquipmentBook(element, actor) {
  const book = element.querySelector("[data-camping-ready]");
  const choices = Array.from(element.querySelectorAll("[data-equipment-grant]"));
  const groups = [...new Set(choices.map((choice) => choice.name))];
  const confirm = element.querySelector('[data-action="choose-equipment"]');
  const refresh = () => {
    if (confirm) confirm.disabled = book?.dataset.campingReady !== "true"
      || book?.dataset.equipmentReady !== "true"
      || groups.some((name) => !choices.some((choice) => choice.name === name && choice.checked));
  };
  for (const choice of choices) choice.addEventListener("change", refresh);
  for (const button of element.querySelectorAll("[data-open-equipment-item]")) button.addEventListener("click", () => {
    const item = actorItems(actor).find((candidate) => candidate.id === button.dataset.openEquipmentItem)
      ?? availableWorldItem(button.dataset.openEquipmentItem);
    if (!item) return;
    openCreationItemSheet(item);
  });
  refresh();
}

function personalityBookContent(actor) {
  const bio = actor.system?.bio ?? {};
  const textField = (name, label, value, placeholder = "", required = false) => `
    <label class="symbaroum-hud-personality-field">
      <span>${localizeEscaped(label)}${required ? `<i class="fa-solid fa-asterisk" aria-hidden="true"></i>` : ""}</span>
      <input type="text" name="${name}" value="${escapeHtml(value ?? "")}" placeholder="${localizeEscaped(placeholder)}" ${required ? "required" : ""}>
    </label>`;
  const writingField = (name, label, value, placeholder, hint, required = false) => `
    <label class="symbaroum-hud-personality-writing-field">
      <span>${localizeEscaped(label)}${required ? `<i class="fa-solid fa-asterisk" aria-hidden="true"></i>` : ""}</span>
      <textarea name="${name}" placeholder="${localizeEscaped(placeholder)}" ${required ? "required" : ""}>${escapeHtml(value ?? "")}</textarea>
      <small>${localizeEscaped(hint)}</small>
    </label>`;
  return `
    <div class="symbaroum-hud-personality-book">
      <header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "personality", "SYMBAROUMHUD.CharacterCreator.Guide.PersonalityProgress")}
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepSevenTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepSevenText")}</p></div>
      </header>
      <div class="symbaroum-hud-personality-workspace">
        <aside class="symbaroum-hud-personality-guide">
          <header><i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
            <div><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.BookLabel")}</span>
              <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.GuideHeading")}</h2></div></header>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.Introduction")}</p>
          <section><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.QuestionsHeading")}</h3>
            <ul>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.Questions.Origin")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.Questions.Relationships")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.Questions.Temperament")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.Questions.Motivation")}</li>
            </ul></section>
          <blockquote>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.QuoteHint")}</blockquote>
          <p class="symbaroum-hud-personality-goal-note"><i class="fa-solid fa-compass" aria-hidden="true"></i>
            ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.GoalHint")}</p>
        </aside>
        <main class="symbaroum-hud-personality-page">
          <header><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.SheetLabel")}</span>
            <h2>${escapeHtml(actor.name)}</h2></header>
          <section class="symbaroum-hud-personality-basics">
            ${textField("personalityName", "SYMBAROUMHUD.CharacterCreator.Personality.Name", actor.name, "SYMBAROUMHUD.CharacterCreator.Personality.NamePlaceholder", true)}
            ${textField("personalityQuote", "SYMBAROUMHUD.CharacterCreator.Personality.Quote", bio.quote, "SYMBAROUMHUD.CharacterCreator.Personality.QuotePlaceholder")}
            ${textField("personalityAge", "SYMBAROUMHUD.CharacterCreator.Personality.Age", bio.age, "SYMBAROUMHUD.CharacterCreator.Personality.AgePlaceholder")}
            ${textField("personalityHeight", "SYMBAROUMHUD.CharacterCreator.Personality.Height", bio.height, "SYMBAROUMHUD.CharacterCreator.Personality.HeightPlaceholder")}
            ${textField("personalityWeight", "SYMBAROUMHUD.CharacterCreator.Personality.Weight", bio.weight, "SYMBAROUMHUD.CharacterCreator.Personality.WeightPlaceholder")}
          </section>
          <section class="symbaroum-hud-personality-writing">
            ${writingField("personalityAppearance", "SYMBAROUMHUD.CharacterCreator.Personality.Appearance", bio.appearance, "SYMBAROUMHUD.CharacterCreator.Personality.AppearancePlaceholder", "SYMBAROUMHUD.CharacterCreator.Personality.AppearanceHint", true)}
            ${writingField("personalityBackground", "SYMBAROUMHUD.CharacterCreator.Personality.Background", bio.background, "SYMBAROUMHUD.CharacterCreator.Personality.BackgroundPlaceholder", "SYMBAROUMHUD.CharacterCreator.Personality.BackgroundHint", true)}
            ${writingField("personalityGoal", "SYMBAROUMHUD.CharacterCreator.Personality.PersonalGoal", bio.personalGoal, "SYMBAROUMHUD.CharacterCreator.Personality.GoalPlaceholder", "SYMBAROUMHUD.CharacterCreator.Personality.PersonalGoalHint", true)}
          </section>
        </main>
      </div>
    </div>`;
}

function bindPersonalityBook(element) {
  const required = Array.from(element.querySelectorAll("[required]"));
  const confirm = element.querySelector('[data-action="choose-personality"]');
  const refresh = () => {
    if (confirm) confirm.disabled = required.some((field) => !field.value.trim());
  };
  for (const field of required) field.addEventListener("input", refresh);
  refresh();
}

function friendsBookContent(actor) {
  const saved = actor.getFlag?.(MODULE_ID, STATE_FLAG)?.friendsGroup ?? {};
  const companions = Array.from({ length: 5 }, (_, index) => saved.companions?.[index] ?? {});
  const group = saved.group ?? {};
  const field = (name, label, value = "") => `
    <label><span>${localizeEscaped(label)}</span>
      <input type="text" name="${name}" value="${escapeHtml(value)}"></label>`;
  const rows = companions.map((friend, index) => `
    <article class="symbaroum-hud-friend-row" data-friend-row="${index}">
      <span class="symbaroum-hud-friend-number">${index + 1}</span>
      ${field(`friendName-${index}`, "SYMBAROUMHUD.CharacterCreator.Friends.Name", friend.name)}
      ${field(`friendRace-${index}`, "SYMBAROUMHUD.CharacterCreator.Friends.Race", friend.race)}
      ${field(`friendOccupation-${index}`, "SYMBAROUMHUD.CharacterCreator.Friends.Occupation", friend.occupation)}
      ${field(`friendPlayer-${index}`, "SYMBAROUMHUD.CharacterCreator.Friends.Player", friend.player)}
    </article>`).join("");
  return `
    <div class="symbaroum-hud-friends-book">
      <header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "friends", "SYMBAROUMHUD.CharacterCreator.Guide.FriendsProgress")}
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepEightTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepEightText")}</p></div>
      </header>
      <div class="symbaroum-hud-friends-workspace">
        <aside class="symbaroum-hud-friends-guide">
          <header><i class="fa-solid fa-people-roof" aria-hidden="true"></i>
            <div><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.BookLabel")}</span>
              <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GuideHeading")}</h2></div></header>
          <section><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.CompanionsHeading")}</h3>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.CompanionsText")}</p></section>
          <section><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupHeading")}</h3>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupText")}</p></section>
          <section><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GoalHeading")}</h3>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GoalText")}</p>
            <ul>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.Examples.Base")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.Examples.Threat")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.Examples.Alliance")}</li>
              <li>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.Examples.Legend")}</li>
            </ul></section>
          <blockquote>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.ExampleHint")}</blockquote>
        </aside>
        <main class="symbaroum-hud-friends-page">
          <header><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.SheetLabel")}</span>
            <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.CompanionsTitle")}</h2></header>
          <section class="symbaroum-hud-friend-list">${rows}</section>
          <section class="symbaroum-hud-group-card">
            <header><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
              <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupTitle")}</h2></header>
            ${field("groupName", "SYMBAROUMHUD.CharacterCreator.Friends.GroupName", group.name)}
            <label class="symbaroum-hud-group-goal"><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupGoal")}<i class="fa-solid fa-asterisk" aria-hidden="true"></i></span>
              <textarea name="groupGoal" required placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupGoalPlaceholder")}">${escapeHtml(group.goal ?? "")}</textarea>
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupGoalHint")}</small></label>
          </section>
        </main>
      </div>
    </div>`;
}

function bindFriendsBook(element) {
  const goal = element.querySelector('textarea[name="groupGoal"]');
  const confirm = element.querySelector('[data-action="choose-friends"]');
  const refresh = () => {
    if (confirm) confirm.disabled = !goal?.value.trim();
  };
  goal?.addEventListener("input", refresh);
  refresh();
}

function creationEquipmentData(source, quantity = 1) {
  const clone = globalThis.foundry?.utils?.deepClone ?? ((value) => structuredClone(value));
  const data = clone(source.toObject ? source.toObject() : source);
  delete data._id;
  data.system ??= {};
  data.system.number = quantity;
  return data;
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
  const cards = rituals.map((ritual) => `
      <article class="symbaroum-hud-ability-special-card symbaroum-hud-ritual-choice-card"
        data-ritual-choice="${escapeHtml(ritual.id)}">
        <header>
          <img src="${escapeHtml(ritual.img || "icons/svg/book.svg")}" alt="">
          <div><button type="button" class="symbaroum-hud-ability-special-open"
            data-open-creation-item="${escapeHtml(ritual.id)}"
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.OpenRitual", { name: ritual.name })}">
            <h4>${escapeHtml(ritual.name)}</h4>
          </button>
          ${ritual.system?.reference ? `<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Reference")}: ${escapeHtml(ritual.system.reference)}</small>` : ""}</div>
          <button type="button" class="symbaroum-hud-ritual-select"
            data-select-ritual="${escapeHtml(ritual.id)}"
            data-ritualist-ability="${escapeHtml(ability.id)}" aria-pressed="false" disabled
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.SelectRitual", { name: ritual.name })}">
            <i class="fa-regular fa-square" aria-hidden="true"></i>
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.SelectRitualLabel")}</span>
          </button>
        </header>
      </article>`);
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

function bindAbilitiesBook(element, racialCost, {
  confirmAction = "choose-abilities",
  requireSelection = false
} = {}) {
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
    const confirm = element.querySelector(`[data-action="${confirmAction}"]`);
    if (confirm) confirm.disabled = (requireSelection && !values.length)
      || !specialChoicesComplete || !isValidAbilitySelection(
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
    openCreationItemSheet(item);
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

function openCreationItemSheet(item) {
  const sheet = item?.sheet;
  if (!sheet) return;
  sheet.render?.(true);
  promoteCreationItemSheet(sheet);
}

function promoteCreationItemSheet(sheet, attempt = 0) {
  const element = sheet?.element?.[0] ?? sheet?.element;
  if (element?.classList) {
    element.classList.add("symbaroum-hud-creation-item-preview");
    sheet.bringToFront?.();
    return;
  }
  if (attempt < 20) globalThis.setTimeout(() => promoteCreationItemSheet(sheet, attempt + 1), 25);
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
  const occupationRecommendation = occupationAttributeRecommendation(actor);
  const occupationRecommendationContent = occupationRecommendation ? `
    <aside class="symbaroum-hud-attribute-occupation-recommendation">
      <header><i class="fa-solid fa-compass" aria-hidden="true"></i>
        <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.OccupationRecommendation")}</span></header>
      <strong>${escapeHtml(occupationRecommendation.name)}</strong>
      <p>${escapeHtml(occupationRecommendation.attributes)}</p>
    </aside>` : "";
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
        ${creatorStepNumber(actor, "attributes", "SYMBAROUMHUD.CharacterCreator.Guide.AttributesProgress")}
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
          ${occupationRecommendationContent}
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

function occupationAttributeRecommendation(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (state.occupation === "custom") {
    const name = String(state.customOccupation?.name ?? actor?.system?.bio?.occupation ?? "").trim();
    const attributes = String(state.customOccupation?.attributes ?? "").trim();
    return name && attributes ? { name, attributes } : null;
  }
  const occupation = coreOccupation(state.occupation);
  if (!occupation) return null;
  return {
    name: game.i18n.localize(occupation.name),
    attributes: game.i18n.localize(occupation.attributes)
  };
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

async function closeOriginalActorSheet(sheet, actor) {
  const application = sheet ?? actor?.sheet;
  if (typeof application?.close !== "function") return;
  try {
    await application.close();
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not close the original Actor sheet before opening the creator.`, error);
  }
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
