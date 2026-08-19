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
import { coreMysticalTradition } from "../data/core-mystical-traditions.mjs";
import {
  CONTENT_ORIGINS,
  UNKNOWN_CONTENT_ORIGIN,
  contentOriginDefinition,
  resolveContentOrigin,
  staticContentOriginIndex
} from "./content-origin-service.mjs";

const MODE_FLAG = "characterCreationMode";
const STATE_FLAG = "characterCreatorState";
const DISMISSED_USERS_FLAG = "characterCreatorDismissedUsers";
const OCCUPATION_STEP_COMPLETE = "occupation-complete";
const ATTRIBUTES_STEP_COMPLETE = "attributes-complete";
const RACE_STEP_COMPLETE = "race-complete";
const ABILITIES_STEP_COMPLETE = "abilities-complete";
const SHADOW_STEP_COMPLETE = "shadow-complete";
const EQUIPMENT_STEP_COMPLETE = "equipment-complete";
const PERSONALITY_STEP_COMPLETE = "personality-complete";
const FRIENDS_STEP_COMPLETE = "friends-complete";
const PRIVILEGED_STARTING_THALER = 50;
const CREATOR_STEPS = Object.freeze([
  Object.freeze({ id: "occupation", complete: OCCUPATION_STEP_COMPLETE }),
  Object.freeze({ id: "attributes", complete: ATTRIBUTES_STEP_COMPLETE }),
  Object.freeze({ id: "race", complete: RACE_STEP_COMPLETE }),
  Object.freeze({ id: "abilities", complete: ABILITIES_STEP_COMPLETE }),
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
let characterCreatorOriginIndex = null;

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
    && !hasDismissedCharacterCreator(actor, user)
  );
}

export function isOccupationStepComplete(actor) {
  return hasCompletedCreatorStep(actor, "occupation");
}

export function isAttributesStepComplete(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (!hasCompletedCreatorStep(actor, "attributes")) return false;
  return !(state.attributesDeferred && isAbilitiesStepComplete(actor));
}

export function isRaceStepComplete(actor) {
  return hasCompletedCreatorStep(actor, "race");
}

export function isContactsPreparationRequired(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  return Boolean(state.raceTraits?.includes("contacts") && !state.contacts);
}

export function isAbilitiesStepComplete(actor) {
  return hasCompletedCreatorStep(actor, "abilities");
}

export function isShadowStepComplete(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  return Boolean(hasText(actor?.system?.bio?.shadow)
    || hasText(state.shadow)
    || [SHADOW_STEP_COMPLETE, PERSONALITY_STEP_COMPLETE, FRIENDS_STEP_COMPLETE].includes(state.step)
    || state.completedSteps?.some?.((step) => ["shadow", "personality", "friends"].includes(step)));
}

export function isEquipmentStepComplete(actor) {
  return hasCompletedCreatorStep(actor, "equipment");
}

export function isPersonalityStepComplete(actor) {
  return hasCompletedCreatorStep(actor, "personality")
    && isShadowStepComplete(actor)
    && !isContactsPreparationRequired(actor);
}

export function isFriendsStepComplete(actor) {
  return hasCompletedCreatorStep(actor, "friends");
}

function canOpenCharacterCreator(actor) {
  return Boolean(actor?.type === "player" && canOwn(actor, game.user));
}

function creatorEntryStep(actor) {
  if (!isOccupationStepComplete(actor)) return "occupation";
  if (!isAttributesStepComplete(actor)) return "attributes";
  if (!isRaceStepComplete(actor)) return "race";
  if (!isAbilitiesStepComplete(actor)) return "abilities";
  if (!isEquipmentStepComplete(actor)) return "equipment";
  if (!isPersonalityStepComplete(actor)) return "personality";
  if (!isFriendsStepComplete(actor)) return "friends";
  return "occupation";
}

function attachCharacterCreatorHeaderButton(sheet, html, actor) {
  if (!canOpenCharacterCreator(actor)) return;
  const candidates = [html, html?.[0], sheet?.element, sheet?.element?.[0]];
  const root = candidates.find((candidate) => candidate?.querySelector?.(".window-header"));
  const header = root?.querySelector?.(".window-header");
  if (!header || header.querySelector(".symbaroum-hud-open-character-creator")) return;

  const button = root.ownerDocument.createElement("button");
  const label = game.i18n.localize("SYMBAROUMHUD.CharacterCreator.OpenButton");
  button.type = "button";
  button.className = "header-control symbaroum-hud-open-character-creator";
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<i class="fa-solid fa-book-open" aria-hidden="true"></i><span>${escapeHtml(label)}</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void CharacterCreatorService.open(actor);
  });
  (header.querySelector(".window-controls") ?? header).prepend(button);
}

export function registerCharacterCreatorHooks() {
  const handleSheet = (sheet, html) => {
    const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
    attachCharacterCreatorHeaderButton(sheet, html, actor);
    void CharacterCreatorService.handleSheet(actor, sheet);
  };
  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
    if (!canOpenCharacterCreator(actor)) return;
    if (buttons.some((button) => button.class === "symbaroum-hud-open-character-creator")) return;
    buttons.unshift({
      label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.OpenButton"),
      class: "symbaroum-hud-open-character-creator",
      icon: "fas fa-book-open",
      onclick: () => void CharacterCreatorService.open(actor)
    });
  });
  Hooks.on("renderActorSheet", handleSheet);
  Hooks.on("renderSymbaroumActorSheet", handleSheet);
}

export class CharacterCreatorService {
  static async handleSheet(actor, sheet = null) {
    if (!actor || actor.type !== "player" || !canOwn(actor, game.user)) return null;
    const mode = actor.getFlag?.(MODULE_ID, MODE_FLAG);
    if (mode === CHARACTER_CREATION_MODES.CREATOR) {
      if ((isFriendsStepComplete(actor) && isPersonalityStepComplete(actor))
        || hasDismissedCharacterCreator(actor, game.user)) return null;
      await closeOriginalActorSheet(sheet, actor);
      if (!isOccupationStepComplete(actor)) return this.openOccupationStep(actor);
      if (!isAttributesStepComplete(actor)) return this.openAttributesStep(actor);
      if (!isRaceStepComplete(actor)) return this.openRaceStep(actor);
      if (!isAbilitiesStepComplete(actor)) return this.openAbilitiesStep(actor);
      if (!isEquipmentStepComplete(actor)) return this.openEquipmentStep(actor);
      if (!isPersonalityStepComplete(actor)) return this.openPersonalityStep(actor);
      if (!isFriendsStepComplete(actor)) return this.openFriendsStep(actor);
      return null;
    }
    if (!mode) return this.offer(actor, sheet);
    return null;
  }

  static async open(actor) {
    const key = actorKey(actor);
    if (!key || pendingActors.has(key) || !canOpenCharacterCreator(actor)) return null;
    const DialogV2 = dialogClass();
    if (!DialogV2) return null;

    pendingActors.add(key);
    try {
      Hooks.callAll(`${MODULE_ID}.characterCreatorRequested`, actor);
      return await this.#runCreatorSteps(DialogV2, actor, creatorEntryStep(actor));
    } catch (error) {
      return handleCreatorError(error);
    } finally {
      pendingActors.delete(key);
    }
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
        rejectClose: false,
        render: (_event, dialog) => {
          bindCharacterCreatorDismissal(dialog.element, actor);
        }
      });

      if (!Object.values(CHARACTER_CREATION_MODES).includes(choice)) return null;
      if (choice === CHARACTER_CREATION_MODES.CREATOR) {
        // Close before persisting the mode: setFlag can re-render an open Actor
        // sheet and replace the application instance that triggered this prompt.
        await closeOriginalActorSheet(sheet, actor);
        await actor.setFlag(MODULE_ID, MODE_FLAG, choice);
        Hooks.callAll(`${MODULE_ID}.characterCreatorRequested`, actor);
        await this.#runCreatorSteps(DialogV2, actor, "occupation");
      } else {
        await actor.setFlag(MODULE_ID, MODE_FLAG, choice);
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
    // Kept as a public compatibility alias for integrations that used the old
    // standalone Shadow step. Shadow is now prepared with the biography.
    return this.openPersonalityStep(actor);
  }

  static async openEquipmentStep(actor) {
    const key = actorKey(actor);
    if (
      !key
      || pendingActors.has(key)
      || !canOwn(actor, game.user)
      || actor.getFlag?.(MODULE_ID, MODE_FLAG) !== CHARACTER_CREATION_MODES.CREATOR
      || !isAbilitiesStepComplete(actor)
      || !isAttributesStepComplete(actor)
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
    const placement = {};

    while (currentStep) {
      const result = await this.#showCreatorStep(DialogV2, actor, currentStep, placement);
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

  static #showCreatorStep(DialogV2, actor, step, placement) {
    switch (step) {
      case "occupation": return this.#showOccupationBook(DialogV2, actor, placement);
      case "attributes": return this.#showAttributesBook(DialogV2, actor, placement);
      case "race": return this.#showRaceBook(DialogV2, actor, placement);
      case "contacts": return this.#showContactsBook(DialogV2, actor, placement);
      case "abilities": return this.#showAbilitiesBook(DialogV2, actor, placement);
      case "equipment": return this.#showEquipmentBook(DialogV2, actor, placement);
      case "personality": return this.#showPersonalityBook(DialogV2, actor, placement);
      case "friends": return this.#showFriendsBook(DialogV2, actor, placement);
      default: return Promise.resolve(null);
    }
  }

  static async #showOccupationBook(DialogV2, actor, placement) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog"
      ],
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Occupation.Title")
      },
      position: creatorDialogPosition(placement, 1060, 680),
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
              ...clearCreatorStepDraftPatch(previous, "occupation"),
              version: 1,
              step: furthestCreatorProgress(previous.step, OCCUPATION_STEP_COMPLETE),
              completedSteps: markCreatorStepComplete(previous, "occupation"),
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
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "occupation");
        bindOccupationBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showAttributesBook(DialogV2, actor, placement) {
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
      position: creatorDialogPosition(placement, 1060, 680),
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
              ...clearCreatorStepDraftPatch(previous, "attributes"),
              version: 1,
              step: furthestCreatorProgress(previous.step, ATTRIBUTES_STEP_COMPLETE),
              completedSteps: markCreatorStepComplete(previous, "attributes"),
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
                ...clearCreatorStepDraftPatch(previous, "attributes"),
                version: 1,
                step: furthestCreatorProgress(previous.step, ATTRIBUTES_STEP_COMPLETE),
                completedSteps: markCreatorStepComplete(previous, "attributes"),
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
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "attributes");
        bindAttributesBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showRaceBook(DialogV2, actor, placement) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-race-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.Title") },
      position: creatorDialogPosition(placement, 1060, 680),
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
                ...clearCreatorStepDraftPatch(previous, "race"),
                version: 1,
                step: furthestCreatorProgress(previous.step, RACE_STEP_COMPLETE),
                completedSteps: markCreatorStepComplete(previous, "race"),
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
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "race");
        bindRaceBook(dialog.element, actor);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showAbilitiesBook(DialogV2, actor, placement) {
    const creatorState = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
    const savedSelections = parseAbilitySelections(JSON.stringify(creatorState.abilities ?? []));
    const abilities = availableCreationAbilities(actor, {
      includeKnownIds: savedSelections.map((selection) => selection.id)
    });
    const mysticalPowers = availableCreationMysticalPowers(actor, {
      includeKnownIds: savedSelections.map((selection) => selection.choiceId).filter(Boolean)
    });
    const rituals = availableCreationRituals(actor, {
      includeKnownIds: savedSelections.flatMap((selection) => selection.ritualIds ?? [])
    });
    const racialCost = racialAbilityCost(actor);
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-abilities-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Title") },
      position: creatorDialogPosition(placement, 1140, 700),
      content: await abilitiesBookContent(actor, abilities, racialCost, mysticalPowers, rituals),
      buttons: [
        {
          action: "choose-abilities",
          icon: "fa-solid fa-hand-sparkles",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Choose"),
          default: true,
          callback: async (_event, button) => {
            const mode = ABILITY_DISTRIBUTION_MODES.EXPERIENCE;
            const experienceBudget = Number(formValue(button.form, "abilityExperienceBudget"));
            const selections = parseAbilitySelections(formValue(button.form, "abilitySelections"));
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const costs = abilityExperienceCosts();
            if (!isValidAbilitySelection(selections, mode, racialCost, { experienceBudget, costs })) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Invalid"));
              return null;
            }
            const available = new Map(availableCreationAbilities(actor, {
              includeKnownIds: selections.map((selection) => selection.id)
            }).map((item) => [item.id, item]));
            const availablePowers = new Map(availableCreationMysticalPowers(actor, {
              includeKnownIds: selections.map((selection) => selection.choiceId).filter(Boolean)
            }).map((item) => [item.id, item]));
            const availableRituals = new Map(availableCreationRituals(actor, {
              includeKnownIds: selections.flatMap((selection) => selection.ritualIds ?? [])
            }).map((item) => [item.id, item]));
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
            const created = await applyCreationAbilityDocuments(actor, documents);
            const purchasedWithExperience = mode === ABILITY_DISTRIBUTION_MODES.EXPERIENCE;
            const freeExperience = purchasedWithExperience ? 0 : selections.reduce((total, selection) => {
              const source = selection.kind === "mysticalPower"
                ? availablePowers.get(selection.choiceId)
                : available.get(selection.id);
              return total + creationAbilityExperienceCost(source, selection.rank);
            }, 0);
            const freeRaceExperience = racialFreeExperienceValue(actor);
            const existingBonus = Number(actor.system?.bonus?.experience?.value ?? 0);
            const priorCreatorBonus = Number.isFinite(Number(previous.abilityBonusExperienceAwarded))
              ? Number(previous.abilityBonusExperienceAwarded)
              : Array.isArray(previous.abilities)
                ? freeRaceExperience + (previous.abilityDistribution === ABILITY_DISTRIBUTION_MODES.EXPERIENCE
                  ? 0
                  : abilitySelectionCost(previous.abilities, costs)
                    + racialCost * abilityRankCost("novice", costs))
                : 0;
            const creatorBonus = freeRaceExperience + (purchasedWithExperience
              ? 0
              : freeExperience + racialCost * abilityRankCost("novice", costs));
            const updatedBonus = Math.max(0, existingBonus - priorCreatorBonus + creatorBonus);
            if (purchasedWithExperience) {
              await actor.update({
                "system.experience.total": experienceBudget,
                "system.bonus.experience.value": updatedBonus
              });
            } else if (freeExperience > 0) {
              await actor.update({
                "system.bonus.experience.value": updatedBonus
              });
            }
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
                ...clearCreatorStepDraftPatch(previous, "abilities"),
                version: 1,
                step: furthestCreatorProgress(previous.step, ABILITIES_STEP_COMPLETE),
                completedSteps: markCreatorStepComplete(previous, "abilities"),
                abilityDistribution: mode,
              abilityExperienceBudget: purchasedWithExperience ? experienceBudget : null,
              abilityExperienceSpent: purchasedWithExperience
                ? abilitySelectionCost(selections, costs) + racialCost * abilityRankCost("novice", costs)
                : null,
              abilityBonusExperienceAwarded: creatorBonus,
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
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "abilities");
        bindAbilitiesBook(dialog.element, racialCost);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showContactsBook(DialogV2, actor, placement) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-contacts-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Contacts.Title") },
      position: creatorDialogPosition(placement, 1060, 680),
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
            await updateContactsTraitName(actor, contacts);
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
              ...previous,
              ...clearCreatorStepDraftPatch(previous, "contacts"),
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
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "contacts");
        bindContactsBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showEquipmentBook(DialogV2, actor, placement) {
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
      position: creatorDialogPosition(placement, 1060, 690),
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
            const created = await createMissingEmbeddedItems(actor, documents);
            const experience = creationExperienceTotal(actor);
            const baseThaler = startingThalerForExperience(experience);
            const privilegedThaler = privilegedStartingThaler(actor);
            const thaler = privilegedThaler ?? baseThaler;
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
                ...clearCreatorStepDraftPatch(previous, "equipment"),
                version: 1,
                step: furthestCreatorProgress(previous.step, EQUIPMENT_STEP_COMPLETE),
                completedSteps: markCreatorStepComplete(previous, "equipment"),
                equipment: saved,
              campingEquipment: camp?.name ?? actorItems(actor).find(isCampingEquipment)?.name ?? "",
              startingThaler: thaler,
              startingThalerBase: baseThaler,
              startingThalerOverride: privilegedThaler,
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
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "equipment");
        bindEquipmentBook(dialog.element, actor);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showPersonalityBook(DialogV2, actor, placement) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-personality-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Personality.Title") },
      position: creatorDialogPosition(placement, 1060, 700),
      content: personalityBookContent(actor),
      buttons: [
        {
          action: "choose-personality",
          icon: "fa-solid fa-feather-pointed",
          label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Personality.Choose"),
          default: true,
          callback: async (_event, button) => {
            const characterName = formValue(button.form, "personalityName").trim();
            const shadow = formValue(button.form, "shadow").trim();
            const shadowPrinciple = formValue(button.form, "shadow-principle");
            const preparesContacts = creatorStepViewState(actor, "race").raceTraits?.includes("contacts");
            const contacts = preparesContacts ? contactsFromForm(button.form) : null;
            const biography = {
              quote: formValue(button.form, "personalityQuote").trim(),
              age: formValue(button.form, "personalityAge").trim(),
              height: formValue(button.form, "personalityHeight").trim(),
              weight: formValue(button.form, "personalityWeight").trim(),
              appearance: formValue(button.form, "personalityAppearance").trim(),
              background: formValue(button.form, "personalityBackground").trim(),
              personalGoal: formValue(button.form, "personalityGoal").trim()
            };
            if (!characterName || !shadow || !biography.appearance || !biography.background || !biography.personalGoal
              || (preparesContacts && (!contacts.network || !contacts.relationship))) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Personality.Required"));
              return null;
            }
            await actor.update({
              name: characterName,
              ...Object.fromEntries(Object.entries(biography).map(([field, value]) => [
                `system.bio.${field}`, value
              ])),
              "system.bio.shadow": shadow,
              ...(preparesContacts ? { "system.notes": contactsNotes(actor.system?.notes, contacts) } : {})
            });
            if (preparesContacts) await updateContactsTraitName(actor, contacts);
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
                ...previous,
                ...clearCreatorStepDraftPatch(previous, "personality"),
                version: 1,
                step: furthestCreatorProgress(previous.step, PERSONALITY_STEP_COMPLETE),
                completedSteps: markCreatorStepComplete(previous, "personality"),
                personality: { characterName, ...biography },
                shadow,
                shadowPrinciple,
                ...(preparesContacts ? { contacts } : {})
            });
            if (preparesContacts) {
              Hooks.callAll(`${MODULE_ID}.characterCreatorTraitPrepared`, actor, {
                trait: "contacts", contacts
              });
            }
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "personality", personality: { characterName, ...biography },
              shadow, shadowPrinciple,
              ...(preparesContacts ? { contacts } : {})
            });
            return { characterName, ...biography, shadow, shadowPrinciple,
              ...(preparesContacts ? { contacts } : {}) };
          }
        },
        ...creatorNavigationDialogButtons(actor, "personality")
      ],
      close: () => null,
      rejectClose: false,
      render: (_event, dialog) => {
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "personality");
        bindPersonalityBook(dialog.element);
        bindShadowBook(dialog.element);
        globalThis.setTimeout(() => {
          if (dialog.element?.isConnected) dialog.bringToFront?.();
        }, 0);
      }
    });
  }

  static async #showFriendsBook(DialogV2, actor, placement) {
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-friends-book-dialog"
      ],
      window: { title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Friends.Title") },
      position: creatorDialogPosition(placement, 1060, 690),
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
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const friendsGroup = { companions, group };
            await actor.setFlag(MODULE_ID, STATE_FLAG, {
                ...previous,
                ...clearCreatorStepDraftPatch(previous, "friends"),
                version: 1,
                step: furthestCreatorProgress(previous.step, FRIENDS_STEP_COMPLETE),
                completedSteps: markCreatorStepComplete(previous, "friends"),
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
        bindCreatorDialogPlacement(dialog, placement);
        bindCreatorStepNavigation(dialog.element, actor, "friends");
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

function completedCreatorSteps(state = {}) {
  if (Array.isArray(state.completedSteps)) {
    return state.completedSteps.filter((step) => creatorStepIndex(step) >= 0);
  }
  if (state.step === SHADOW_STEP_COMPLETE) {
    return ["occupation", "attributes", "race", "abilities"];
  }
  const legacyProgress = creatorStepIndex(state.step);
  return legacyProgress < 0
    ? []
    : CREATOR_STEPS.slice(0, legacyProgress + 1).map((entry) => entry.id);
}

function hasCompletedCreatorStep(actor, step) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  return completedCreatorSteps(state).includes(step);
}

function markCreatorStepComplete(state, step) {
  const completed = new Set(completedCreatorSteps(state));
  completed.add(step);
  return CREATOR_STEPS.map((entry) => entry.id).filter((id) => completed.has(id));
}

function creatorStepViewState(actor, step) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const draft = state.drafts?.[step]?.state;
  return draft && typeof draft === "object" ? { ...state, ...draft } : state;
}

function creatorStepDraftState(step, form) {
  if (step === "occupation") {
    const occupation = formValue(form, "occupation");
    return {
      occupation,
      ...(occupation === "custom" ? { customOccupation: customOccupationFromForm(form) } : {})
    };
  }
  if (step === "attributes") {
    return {
      attributeDistribution: formValue(form, "attributeDistributionMode"),
      attributeTypicalValues: CORE_ATTRIBUTES.map((attribute) => formValue(form, `typical-${attribute.id}`)),
      attributePointValues: CORE_ATTRIBUTES.map((attribute) => Number(formValue(form, `points-${attribute.id}`)) || ATTRIBUTE_MIN)
    };
  }
  if (step === "race") {
    const race = coreRace(formValue(form, "race"));
    if (!race) return {};
    const choice = formValue(form, `race-choice-${race.id}`);
    const optional = race.optional.filter((id) => formChecked(form, `race-optional-${race.id}-${id}`));
    return {
      race: race.id,
      raceTraits: [...race.required, ...(choice ? [choice] : []), ...optional],
      abilityCostTraits: optional
    };
  }
  if (step === "contacts") return { contacts: contactsFromForm(form) };
  if (step === "abilities") {
    return {
      abilityDistribution: ABILITY_DISTRIBUTION_MODES.EXPERIENCE,
      abilityExperienceBudget: Math.max(0, Number(formValue(form, "abilityExperienceBudget")) || 0),
      abilities: parseAbilitySelections(formValue(form, "abilitySelections"))
    };
  }
  if (step === "personality") {
    return {
      personality: personalityFromForm(form),
      shadow: formValue(form, "shadow"),
      shadowPrinciple: formValue(form, "shadow-principle"),
      ...(form?.elements?.namedItem?.("contactsNetwork") || form?.elements?.contactsNetwork
        ? { contacts: contactsFromForm(form) }
        : {})
    };
  }
  if (step === "friends") return { friendsGroup: friendsGroupFromForm(form) };
  return {};
}

function creatorFormDraftFields(form) {
  const fields = {};
  const elements = form?.elements;
  const controls = elements && typeof elements[Symbol.iterator] === "function"
    ? Array.from(elements, (control) => ({ name: control?.name, control }))
    : Object.entries(elements ?? {})
      .filter(([name, control]) => name !== "namedItem" && control && typeof control === "object")
      .map(([name, control]) => ({ name: control.name || name, control }));
  for (const { name, control } of controls) {
    if (!name || control.disabled) continue;
    const type = String(control.type ?? "").toLowerCase();
    if (["button", "submit", "reset", "file"].includes(type)) continue;
    const checkable = type === "checkbox" || type === "radio";
    const field = fields[name] ??= { checkable, values: [] };
    if (checkable) {
      if (control.checked) field.values.push(String(control.value ?? "on"));
    } else {
      field.values = [String(control.value ?? "")];
    }
  }
  return fields;
}

async function saveCreatorStepDraft(actor, step, form) {
  if (!actor?.setFlag || !form) return;
  const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  await actor.setFlag(MODULE_ID, STATE_FLAG, {
    ...previous,
    version: 1,
    drafts: {
      ...(previous.drafts ?? {}),
      [step]: {
        state: creatorStepDraftState(step, form),
        fields: creatorFormDraftFields(form)
      }
    }
  });
}

function withoutCreatorStepDraft(state, step) {
  const drafts = { ...(state?.drafts ?? {}) };
  delete drafts[step];
  return drafts;
}

function clearCreatorStepDraftPatch(state, step) {
  return state?.drafts?.[step] ? { drafts: withoutCreatorStepDraft(state, step) } : {};
}

function restoreCreatorStepDraftFields(element, actor, step) {
  const fields = actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.drafts?.[step]?.fields;
  if (!fields || !element?.querySelectorAll) return;
  for (const control of element.querySelectorAll("[name]")) {
    const field = fields[control.name];
    if (!field || control.disabled) continue;
    const type = String(control.type ?? "").toLowerCase();
    if (field.checkable) control.checked = field.values.includes(String(control.value ?? "on"));
    else if (!["button", "submit", "reset", "file"].includes(type)) control.value = field.values[0] ?? "";
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
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
    case "equipment": return isEquipmentStepComplete(actor);
    case "personality": return isPersonalityStepComplete(actor);
    case "friends": return isFriendsStepComplete(actor);
    default: return false;
  }
}

function nextRequiredCreatorStep(actor, currentStep) {
  if (isAbilitiesStepComplete(actor) && !isAttributesStepComplete(actor)) return "attributes";
  if (currentStep === "contacts") return isAbilitiesStepComplete(actor) ? null : "abilities";
  const currentIndex = creatorStepIndex(currentStep);
  return CREATOR_STEPS.slice(currentIndex + 1).find((entry) => !isCreatorStepFilled(actor, entry.id))?.id ?? null;
}

function creatorNavigationTargets(actor, currentStep) {
  if (currentStep === "contacts") {
    return { previous: "race", next: "abilities" };
  }
  const index = creatorStepIndex(currentStep);
  const previous = index > 0 ? CREATOR_STEPS[index - 1].id : null;
  const nextEntry = CREATOR_STEPS[index + 1];
  const next = nextEntry?.id ?? null;
  return { previous, next };
}

function creatorNavigationDialogButtons(actor, currentStep) {
  const targets = creatorNavigationTargets(actor, currentStep);
  return [
    ...(targets.previous ? [{
      action: "creator-previous-step",
      label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Guide.PreviousStep"),
      callback: async (_event, button) => {
        await saveCreatorStepDraft(actor, currentStep, button.form);
        return {
          creatorNavigation: true,
          step: creatorNavigationTargets(actor, currentStep).previous ?? targets.previous
        };
      }
    }] : []),
    ...(targets.next ? [{
      action: "creator-next-step",
      label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Guide.NextStep"),
      callback: async (_event, button) => {
        await saveCreatorStepDraft(actor, currentStep, button.form);
        return {
          creatorNavigation: true,
          step: creatorNavigationTargets(actor, currentStep).next ?? targets.next
        };
      }
    }] : [])
  ];
}

function creatorDialogPosition(placement, width, height) {
  const position = { width, height };
  if (!Number.isFinite(placement?.left) || !Number.isFinite(placement?.top)) return position;

  const viewportWidth = Number(globalThis.innerWidth);
  const viewportHeight = Number(globalThis.innerHeight);
  const maximumLeft = Number.isFinite(viewportWidth)
    ? Math.max(0, viewportWidth - Math.min(width, viewportWidth))
    : placement.left;
  const maximumTop = Number.isFinite(viewportHeight)
    ? Math.max(0, viewportHeight - Math.min(height, viewportHeight))
    : placement.top;
  position.left = Math.min(Math.max(0, placement.left), maximumLeft);
  position.top = Math.min(Math.max(0, placement.top), maximumTop);
  return position;
}

function bindCreatorDialogPlacement(dialog, placement) {
  const element = dialog?.element;
  const header = element?.querySelector?.(".window-header");
  if (!header || !placement) return;

  const remember = () => {
    globalThis.setTimeout(() => {
      const bounds = element.getBoundingClientRect?.();
      const left = Number(bounds?.left ?? dialog.position?.left);
      const top = Number(bounds?.top ?? dialog.position?.top);
      if (Number.isFinite(left)) placement.left = left;
      if (Number.isFinite(top)) placement.top = top;
    }, 0);
  };
  const rememberOnRelease = (eventName) => {
    const ownerDocument = element.ownerDocument ?? globalThis.document;
    ownerDocument?.addEventListener?.(eventName, remember, { once: true });
  };
  header.addEventListener("pointerdown", () => rememberOnRelease("pointerup"));
  header.addEventListener("mousedown", () => rememberOnRelease("mouseup"));
  header.addEventListener("mouseup", remember);
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

function bindCreatorStepNavigation(element, actor, currentStep) {
  for (const trigger of element.querySelectorAll("[data-creator-navigation]:not([disabled])")) {
    trigger.addEventListener("click", () => {
      const action = trigger.dataset.creatorNavigation === "previous"
        ? "creator-previous-step"
        : "creator-next-step";
      element.querySelector(`.form-footer button[data-action="${action}"], button[data-action="${action}"]`)?.click();
    });
  }
  globalThis.setTimeout(() => restoreCreatorStepDraftFields(element, actor, currentStep), 0);
}

function occupationBookContent(actor) {
  const creatorState = creatorStepViewState(actor, "occupation");
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
  const creatorState = creatorStepViewState(actor, "race");
  const selectedId = coreRace(creatorState.race)?.id ?? CORE_RACES[0].id;
  const selectedTraits = new Set(Array.isArray(creatorState.raceTraits) ? creatorState.raceTraits : []);
  const index = CORE_RACES.map((race) => `
    <button type="button" class="symbaroum-hud-race-index-entry"
      data-race-id="${race.id}" data-active="${race.id === selectedId}"
      aria-pressed="${race.id === selectedId}">
      <i class="fa-solid ${race.icon}" aria-hidden="true"></i>
      <span>${localizeEscaped(race.name)}</span>
    </button>
  `).join("");

  const pages = CORE_RACES.map((race) => {
    const required = race.required.map((id) => traitCard(actor, id, "required", race.id, selectedTraits.has(id))).join("");
    const choices = race.choice.map((id) => traitCard(actor, id, "choice", race.id, selectedTraits.has(id))).join("");
    const optional = race.optional.map((id) => traitCard(actor, id, "optional", race.id, selectedTraits.has(id))).join("");
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

function traitCard(actor, id, mode, raceId, selected = false) {
  const trait = coreRaceTrait(id);
  const source = raceTraitDocument(actor, trait);
  const control = mode === "required"
    ? `<i class="fa-solid fa-circle-check" aria-hidden="true"></i>`
    : `<input type="${mode === "choice" ? "radio" : "checkbox"}"
        name="race-${mode}-${raceId}${mode === "optional" ? `-${id}` : ""}"
        value="${id}" ${selected ? "checked" : ""}>`;
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
  const saved = creatorStepViewState(actor, "contacts").contacts ?? {};
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
          ${contactsFieldsContent(saved)}
        </main>
      </div>
    </div>`;
}

function contactsFieldsContent(saved = {}) {
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
          </section>`;
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

async function updateContactsTraitName(actor, contacts) {
  const contactsTrait = actorItems(actor).find((item) =>
    ["boon", "trait"].includes(item?.type)
    && normalizeName(item.system?.reference || item.name).startsWith("contacts")
  );
  if (typeof contactsTrait?.update !== "function") return;
  const traitName = game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.Traits.contacts.Name");
  await contactsTrait.update({ name: `${traitName} (${contacts.network})` });
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

function availableCreationAbilities(actor, {
  includeKnownMysticalPowerAbility = false,
  includeKnownIds = []
} = {}) {
  const known = new Set(actorItems(actor)
    .filter((item) => item.type === "ability")
    .map(abilityIdentity));
  const included = new Set(includeKnownIds);
  return availableCreationWorldItems(known, (item) => item?.type === "ability", {
    includeKnown: (item) => included.has(item.id)
      || (includeKnownMysticalPowerAbility && isMysticalPowerAbility(item))
  });
}

function availableCreationMysticalPowers(actor, { includeKnownIds = [] } = {}) {
  const known = new Set(actorItems(actor)
    .filter(isMysticalPowerDocument)
    .map(abilityIdentity));
  const included = new Set(includeKnownIds);
  return availableCreationWorldItems(known, isMysticalPowerDocument, {
    includeKnown: (item) => included.has(item.id)
  });
}

function availableCreationRituals(actor, { includeKnownIds = [] } = {}) {
  const known = new Set(actorItems(actor)
    .filter(isRitualDocument)
    .map(abilityIdentity));
  const included = new Set(includeKnownIds);
  return availableCreationWorldItems(known, isRitualDocument, {
    includeKnown: (item) => included.has(item.id)
  });
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

function choiceIdentities(item) {
  return [...new Set([item?.name, item?.system?.reference].map(normalizeName).filter(Boolean))];
}

function mysticalTraditionChoiceIdentities(tradition, kind) {
  const key = kind === "ritual" ? tradition?.rituals : tradition?.powers;
  return new Set(String(key ? game.i18n.localize(key) : "")
    .split(/\s*,\s*|\s+(?:e|and)\s+/iu)
    .map(normalizeName)
    .filter(Boolean));
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
  const state = browserMode
    ? (actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {})
    : creatorStepViewState(actor, "abilities");
  const savedSelections = browserMode
    ? []
    : parseAbilitySelections(JSON.stringify(state.abilities ?? []));
  const savedMode = ABILITY_DISTRIBUTION_MODES.EXPERIENCE;
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
  characterCreatorOriginIndex ??= staticContentOriginIndex();
  const originIndex = characterCreatorOriginIndex;
  const browserSourceId = "world:Item";
  const browserSourceLabel = game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.WorldItems");
  const browserAbilities = orderedAbilities.map((ability) => {
    const origin = resolveContentOrigin(ability, { index: originIndex, sourceId: browserSourceId });
    return {
      ability,
      origin,
      originLabel: game.i18n.localize(contentOriginDefinition(origin).label)
    };
  });
  const originCounts = new Map();
  const specialChoiceOrigins = [...mysticalPowers, ...rituals].map((item) => resolveContentOrigin(item, {
    index: originIndex,
    sourceId: browserSourceId
  }));
  for (const origin of [...browserAbilities.map((entry) => entry.origin), ...specialChoiceOrigins]) {
    originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
  }
  const browserOrigins = [...CONTENT_ORIGINS, contentOriginDefinition(UNKNOWN_CONTENT_ORIGIN)]
    .map((origin) => ({
      ...origin,
      localizedLabel: game.i18n.localize(origin.label),
      count: originCounts.get(origin.id) ?? 0
    }));
  const firstId = orderedAbilities.some((ability) => ability.id === savedSelections[0]?.id)
    ? savedSelections[0].id
    : orderedAbilities[0]?.id ?? "";
  const costs = abilityExperienceCosts();
  const racialTraits = (state.abilityCostTraits ?? [])
    .map((id) => coreRaceTrait(id))
    .filter(Boolean)
    .map((trait) => game.i18n.localize(trait.name));
  const index = browserAbilities.map(({ ability, origin, originLabel }, abilityOrder) => {
    const traditionGateway = isMysticalPowerAbility(ability)
      ? "power"
      : isRitualistAbility(ability)
        ? "ritual"
        : "";
    return `
    <li data-ability-browser-result data-origin="${escapeHtml(origin)}" data-source="${browserSourceId}"
      data-ability-default-order="${abilityOrder}">
      <button type="button" class="symbaroum-hud-browser-entry-main symbaroum-hud-ability-index-entry"
        data-creation-ability-id="${escapeHtml(ability.id)}"
        data-search="${escapeHtml(normalizeName(`${ability.name} ${ability.system?.reference ?? ""} ${originLabel} ${isRecommended(ability) ? recommendation?.name ?? "" : ""}`))}"
        data-occupation-recommended="${isRecommended(ability)}"
        ${traditionGateway ? `data-tradition-gateway="${traditionGateway}" data-tradition-recommended="false"` : ""}
        data-active="${ability.id === firstId}" aria-pressed="${ability.id === firstId}">
        <img src="${escapeHtml(ability.img || "icons/svg/book.svg")}" alt="">
        <span class="symbaroum-hud-browser-entry-details symbaroum-hud-ability-index-label">
          <strong>${escapeHtml(ability.name)}</strong>
          ${isRecommended(ability) ? `<small><i class="fa-solid fa-compass" aria-hidden="true"></i>${escapeHtml(recommendation.name)}</small>` : ""}
          ${traditionGateway ? `<small class="symbaroum-hud-tradition-recommendation"
            data-tradition-ability-recommendation hidden><i class="fa-solid fa-hat-wizard" aria-hidden="true"></i><span></span></small>` : ""}
          <b class="symbaroum-hud-ability-browser-rank" data-ability-entry-rank></b>
        </span>
      </button>
    </li>`;
  }).join("");
  const pages = (await Promise.all(abilities.map(async (ability) => {
    const mysticalPowerAbility = isMysticalPowerAbility(ability);
    const ritualistAbility = isRitualistAbility(ability);
    const mysticalTradition = coreMysticalTradition(ability);
    const sheetLoaded = ability.id === firstId;
    const nativeSheet = sheetLoaded ? await renderCreationAbilitySheet(ability) : "";
    const mysticalPowerChoices = mysticalPowerAbility
      ? await mysticalPowerChoiceContent(ability, mysticalPowers, costs, originIndex, browserSourceId)
      : "";
    const ritualChoices = ritualistAbility
      ? await ritualChoiceContent(ability, rituals, originIndex, browserSourceId)
      : "";
    return `
      <article class="symbaroum-hud-ability-page" data-creation-ability-page="${escapeHtml(ability.id)}"
        ${mysticalTradition ? `data-mystical-tradition="${escapeHtml(mysticalTradition.id)}"` : ""}
        ${ability.id === firstId ? "" : "hidden"}>
        ${mysticalTradition ? mysticalTraditionContent(mysticalTradition, ability) : ""}
        <div class="symbaroum sheet item symbaroum-hud-native-ability-sheet"
          data-ability-sheet-host data-ability-sheet-loaded="${sheetLoaded}">
          ${sheetLoaded ? nativeSheet : abilitySheetLoadingContent()}
        </div>
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
    : Math.max(0, Number(state.abilityExperienceBudget ?? actor.system?.experience?.total) || 50);
  return `
    <div class="symbaroum-hud-abilities-book" data-ability-browser="${browserMode}">
      <input type="hidden" name="abilityDistributionMode" value="${savedMode}">
      <input type="hidden" name="abilitySelections" value="${escapeHtml(JSON.stringify(savedSelections))}">
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
      <div class="symbaroum-hud-browser-shell symbaroum-hud-creator-ability-browser">
        <aside class="symbaroum-hud-browser-sidebar symbaroum-hud-ability-index">
          <div class="symbaroum-hud-ability-filter-toolbar">
            <label class="symbaroum-hud-browser-search"><i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" data-ability-search placeholder="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Search")}">
              <button type="button" data-clear-ability-search aria-label="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.ClearSearch")}">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </label>
            <button type="button" class="symbaroum-hud-ability-filter-toggle"
              data-toggle-ability-filter-panel aria-expanded="false"
              aria-label="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Filters")}"
              title="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Filters")}">
              <i class="fa-solid fa-filter" aria-hidden="true"></i>
            </button>
          </div>
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
          <div class="symbaroum-hud-ability-filter-popover" data-ability-filter-panel hidden>
            <section class="symbaroum-hud-browser-origin-filter">
              <header><h2>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Origin")}</h2>
                <button type="button" data-toggle-ability-origins title="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.ToggleOrigins")}">
                  <i class="fa-solid fa-check-double" aria-hidden="true"></i>
                </button>
              </header>
              <div>${browserOrigins.map((origin) => `<label data-empty="${origin.count === 0}">
                <input type="checkbox" data-creation-browser-origin value="${escapeHtml(origin.id)}" checked>
                <span>${escapeHtml(origin.localizedLabel)}</span><small>${origin.count}</small>
              </label>`).join("")}</div>
            </section>
            <section class="symbaroum-hud-browser-source-filter">
              <header><h2>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Sources")}</h2></header>
              <div><label><input type="checkbox" data-creation-browser-source value="${browserSourceId}" checked>
                <span>${escapeHtml(browserSourceLabel)}</span><small>${orderedAbilities.length}</small>
              </label></div>
            </section>
          </div>
        </aside>
        <section class="symbaroum-hud-browser-results symbaroum-hud-creator-ability-results">
          <header><h2>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Results")}</h2>
            <span><b data-ability-result-count>${orderedAbilities.length}</b> ${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Found")}</span>
          </header>
          <ol>${index || `<li class="symbaroum-hud-browser-empty"><i class="fa-solid fa-book-open"></i><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Empty")}</strong></li>`}</ol>
        </section>
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

function shadowBookContent(actor, { embedded = false } = {}) {
  const legacyState = creatorStepViewState(actor, "shadow");
  const creatorState = embedded
    ? { ...legacyState, ...creatorStepViewState(actor, "personality") }
    : legacyState;
  const principles = [
    {
      id: "nature",
      icon: "fa-leaf",
      key: "Nature",
      art: "assets/shadows/nature.webp",
      examples: [["nature", "fa-leaf", "Nature"], ["spiritual", "fa-cloud", "Spiritual"], ["mixed", "fa-circle-half-stroke", "Mixed"]]
    },
    {
      id: "civilization",
      icon: "fa-landmark",
      key: "Civilization",
      art: "assets/shadows/civilization.webp",
      examples: [["civilization", "fa-crown", "Civilization"], ["mixed", "fa-circle-half-stroke", "Mixed"]]
    },
    {
      id: "darkness",
      icon: "fa-moon",
      key: "Darkness",
      art: "assets/shadows/darkness.webp",
      examples: [["corrupted", "fa-burst", "Corrupted"], ["mixed", "fa-circle-half-stroke", "Mixed"]]
    }
  ];
  const selectedId = principles.some((principle) => principle.id === creatorState.shadowPrinciple)
    ? creatorState.shadowPrinciple
    : "nature";
  const index = principles.map((principle) => `
    <button type="button" class="symbaroum-hud-shadow-index-entry"
      data-shadow-page-id="${principle.id}" data-active="${principle.id === selectedId}"
      aria-pressed="${principle.id === selectedId}">
      <i class="fa-solid ${principle.icon}" aria-hidden="true"></i>
      <span>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.Principles.${principle.key}.Title`)}</span>
    </button>
  `).join("");
  const pages = principles.map((principle) => {
    const examples = principle.examples.map(([tone, icon, key]) => {
      const example = game.i18n.localize(`SYMBAROUMHUD.CharacterCreator.Shadow.Examples.${key}`);
      return `
        <button type="button" class="symbaroum-hud-shadow-example" data-shadow-tone="${tone}"
          data-shadow-example="${escapeHtml(example)}">
          <i class="fa-solid ${icon}" aria-hidden="true"></i>
          <span>${escapeHtml(example)}</span>
        </button>`;
    }).join("");
    const darkness = principle.id === "darkness" ? `
      <section class="symbaroum-hud-shadow-corruption">
        <i class="fa-solid fa-droplet" aria-hidden="true"></i>
        <div><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.CorruptionHeading")}</h3>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.CorruptionText")}</p></div>
      </section>` : "";
    return `
      <article class="symbaroum-hud-shadow-page" data-shadow-page="${principle.id}"
        ${principle.id === selectedId ? "" : "hidden"}>
        <div class="symbaroum-hud-shadow-heading">
          <div class="symbaroum-hud-occupation-page-icon" aria-hidden="true"><i class="fa-solid ${principle.icon}"></i></div>
          <div><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.BookLabel")}</span>
            <h2>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.Principles.${principle.key}.Title`)}</h2></div>
        </div>
        <p class="symbaroum-hud-shadow-summary">${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.Principles.${principle.key}.Text`)}</p>
        <figure class="symbaroum-hud-shadow-art">
          <img src="modules/symbaroum-hud/${principle.art}"
            alt="${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.IllustrationAlt.${principle.key}`)}">
        </figure>
        <div class="symbaroum-hud-shadow-lore">
          <section>
            <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Heading")}</h3>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Introduction")}</p>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Visibility")}</p>
          </section>
          <section>
            <h3>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.Principles.${principle.key}.Title`)}</h3>
            <p>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Shadow.PageText.${principle.key}`)}</p>
            <p class="symbaroum-hud-shadow-mixed-note"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i>
              ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.MixedNote")}</p>
          </section>
          ${darkness}
          <section class="symbaroum-hud-shadow-examples">
            <header><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.ExamplesHeading")}</h3>
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.ExamplesHint")}</small></header>
            <div>${examples}</div>
          </section>
        </div>
      </article>`;
  }).join("");
  const current = String(creatorState.shadow ?? actor.system?.bio?.shadow ?? "").trim();
  return `
    <div class="symbaroum-hud-shadow-book${embedded ? " symbaroum-hud-shadow-book-embedded" : ""}"
      ${embedded ? 'data-personality-section="shadow" hidden' : ""}>
      <input type="hidden" name="shadow-principle" value="${selectedId}">
      ${embedded ? "" : `<header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "shadow", "SYMBAROUMHUD.CharacterCreator.Guide.ShadowProgress")}
        <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepFiveTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepFiveText")}</p></div>
      </header>`}
      <aside class="symbaroum-hud-shadow-index">
        <header><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Index")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.IndexHint")}</p></header>
        <nav aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Index")}">${index}</nav>
      </aside>
      <main class="symbaroum-hud-shadow-reading-page">
        <header class="symbaroum-hud-occupation-character-name"><i class="fa-solid fa-book-open" aria-hidden="true"></i><span>${escapeHtml(actor.name)}</span></header>
        ${pages}
          <label class="symbaroum-hud-shadow-entry">
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.FieldLabel")}</span>
            <textarea name="shadow" maxlength="420" required
              placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.Placeholder")}">${escapeHtml(current)}</textarea>
            <small><span data-shadow-count>${current.length}</span>/420 &middot; ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Shadow.FieldHint")}</small>
          </label>
      </main>
    </div>`;
}

function mysticalTraditionContent(tradition, ability) {
  const artFallback = escapeHtml(tradition.fallbackArt);
  return `
    <section class="symbaroum-hud-mystical-tradition-page">
      <header class="symbaroum-hud-mystical-tradition-hero">
        <figure>
          <img src="${escapeHtml(tradition.art)}" alt="${localizeEscaped(tradition.name)}"
            data-tradition-fallback-src="${artFallback}">
        </figure>
        <div>
          <span><i class="fa-solid ${escapeHtml(tradition.icon)}" aria-hidden="true"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.BookLabel")}</span>
          <h2>${localizeEscaped(tradition.name)}</h2>
          <p>${localizeEscaped(tradition.introduction)}</p>
          <aside>
            <i class="fa-solid fa-scroll" aria-hidden="true"></i>
            <p>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PurchaseExplanation", { ability: ability.name })}</p>
          </aside>
        </div>
      </header>
      <div class="symbaroum-hud-mystical-tradition-chapter">
        <section class="symbaroum-hud-mystical-tradition-doctrine">
          <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.TraditionHeading")}</h3>
          <p>${localizeEscaped(tradition.doctrine)}</p>
        </section>
        <section>
          <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.TitlesHeading")}</h3>
          <p>${localizeEscaped(tradition.titles)}</p>
        </section>
        <section>
          <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PowersHeading")}</h3>
          <p>${localizeEscaped(tradition.powers)}</p>
        </section>
        <section>
          <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.RitualsHeading")}</h3>
          <p>${localizeEscaped(tradition.rituals)}</p>
        </section>
        <section class="symbaroum-hud-mystical-tradition-corruption">
          <h3><i class="fa-solid fa-droplet" aria-hidden="true"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.CorruptionHeading")}</h3>
          <p>${localizeEscaped(tradition.corruption)}</p>
        </section>
      </div>
      <footer><span>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.AbilityHeading", { ability: ability.name })}</span></footer>
    </section>`;
}

function bindShadowBook(element) {
  const principle = element.querySelector('input[name="shadow-principle"]');
  const entries = Array.from(element.querySelectorAll("[data-shadow-page-id]"));
  const pages = Array.from(element.querySelectorAll("[data-shadow-page]"));
  const textarea = element.querySelector('textarea[name="shadow"]');
  const count = element.querySelector("[data-shadow-count]");
  const confirm = element.querySelector('[data-action="choose-shadow"]');
  const refreshCount = () => {
    if (count) count.textContent = String(textarea?.value?.length ?? 0);
    if (confirm) confirm.disabled = !textarea?.value?.trim();
  };
  for (const entry of entries) entry.addEventListener("click", () => {
    const id = entry.dataset.shadowPageId;
    if (!pages.some((page) => page.dataset.shadowPage === id)) return;
    if (principle) principle.value = id;
    for (const candidate of entries) {
      const active = candidate.dataset.shadowPageId === id;
      candidate.dataset.active = String(active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    for (const page of pages) page.hidden = page.dataset.shadowPage !== id;
  });
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

function privilegedStartingThaler(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (Array.isArray(state.raceTraits) && state.raceTraits.includes("privileged")) {
    return PRIVILEGED_STARTING_THALER;
  }
  const trait = coreRaceTrait("privileged");
  const aliases = new Set([
    trait?.id,
    trait?.name ? game.i18n.localize(trait.name) : "",
    ...(trait?.aliases ?? [])
  ].map(normalizeName).filter(Boolean));
  return actorItems(actor).some((item) => ["trait", "boon"].includes(item?.type)
    && aliases.has(normalizeName(item.system?.reference || item.name)))
    ? PRIVILEGED_STARTING_THALER
    : null;
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
  twinattack: { category: "sword", label: "Sword", quantity: 1 },
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
  return equipment.find((item) => aliases.includes(configuredStartingItemIdentity(item?.name)))
    ?? equipment.find((item) => aliases.includes(configuredStartingItemIdentity(item?.system?.reference)))
    ?? null;
}

function configuredStartingItemIdentity(value) {
  return normalizeName(value).replace(/regulares$/, "");
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
  if (category === "sword") return findConfiguredStartingItem(equipment, "sword");
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
  const creatorState = creatorStepViewState(actor, "equipment");
  const savedEquipment = Array.isArray(creatorState.equipment) ? creatorState.equipment : [];
  const savedCombination = (category) => savedEquipment.find((entry) => entry.category === category)?.combination ?? "";
  const experience = creationExperienceTotal(actor);
  const baseThaler = startingThalerForExperience(experience);
  const privilegedThaler = privilegedStartingThaler(actor);
  const thaler = privilegedThaler ?? baseThaler;
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
            <p>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.MoneyFormula", { experience, thaler: baseThaler })}</p>
            ${privilegedThaler !== null ? `<p class="symbaroum-hud-equipment-privileged-money"><i class="fa-solid fa-crown" aria-hidden="true"></i>${formatEscaped(
              "SYMBAROUMHUD.CharacterCreator.Equipment.PrivilegedStartingMoney",
              { total: privilegedThaler }
            )}</p>` : ""}
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
                  <input type="radio" name="${equipmentGrantField(marksmanGrant, 0)}" value="${choice}" required data-equipment-grant${savedCombination("marksman-choice") === choice ? " checked" : ""}${resolved ? " " : " disabled"}>
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
                  <input type="radio" name="${equipmentGrantField(combinationGrant, 0)}" value="${combination.id}" required data-equipment-grant${savedCombination("starting-combination") === combination.id ? " checked" : ""}${resolved ? " " : " disabled"}>
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
  const creatorState = creatorStepViewState(actor, "personality");
  const draft = creatorState.personality ?? {};
  const bio = { ...(actor.system?.bio ?? {}), ...draft };
  const characterName = draft.characterName ?? actor.name;
  const preparesContacts = creatorStepViewState(actor, "race").raceTraits?.includes("contacts");
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
      <nav class="symbaroum-hud-personality-section-tabs" aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.Sections")}">
        <button type="button" data-personality-section-tab="history" data-active="true" aria-pressed="true">
          <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.HistoryTab")}
        </button>
        <button type="button" data-personality-section-tab="shadow" data-active="false" aria-pressed="false">
          <i class="fa-solid fa-eye" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Personality.ShadowTab")}
        </button>
      </nav>
      <div class="symbaroum-hud-personality-workspace" data-personality-section="history">
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
            <h2>${escapeHtml(characterName)}</h2></header>
          <section class="symbaroum-hud-personality-basics">
            ${textField("personalityName", "SYMBAROUMHUD.CharacterCreator.Personality.Name", characterName, "SYMBAROUMHUD.CharacterCreator.Personality.NamePlaceholder", true)}
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
          ${preparesContacts ? contactsBiographyContent(creatorState.contacts) : ""}
        </main>
      </div>
      ${shadowBookContent(actor, { embedded: true })}
    </div>`;
}

function contactsBiographyContent(saved = {}) {
  return `
    <section class="symbaroum-hud-personality-contacts symbaroum-hud-contacts-page">
      <header><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.TraitLabel")}</span>
        <h2><i class="fa-solid fa-address-book" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.WhoAreThey")}</h2></header>
      <p class="symbaroum-hud-personality-contacts-introduction">
        ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Introduction")}
      </p>
      <blockquote>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Limits")}</blockquote>
      ${contactsFieldsContent(saved)}
    </section>`;
}

function bindPersonalityBook(element) {
  const required = Array.from(element.querySelectorAll("[required]"));
  const confirm = element.querySelector('[data-action="choose-personality"]');
  const tabs = Array.from(element.querySelectorAll("[data-personality-section-tab]"));
  const sections = Array.from(element.querySelectorAll("[data-personality-section]"));
  const openSection = (id) => {
    for (const tab of tabs) {
      const active = tab.dataset.personalitySectionTab === id;
      tab.dataset.active = String(active);
      tab.setAttribute("aria-pressed", String(active));
    }
    for (const section of sections) section.hidden = section.dataset.personalitySection !== id;
  };
  const refresh = () => {
    if (confirm) confirm.disabled = required.some((field) => !field.value.trim());
  };
  for (const tab of tabs) tab.addEventListener("click", () => openSection(tab.dataset.personalitySectionTab));
  for (const field of required) field.addEventListener("input", refresh);
  openSection("history");
  refresh();
}

function friendsBookContent(actor) {
  const saved = creatorStepViewState(actor, "friends").friendsGroup ?? {};
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
            <label class="symbaroum-hud-group-goal"><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupGoal")}<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.Optional")}</small></span>
              <textarea name="groupGoal" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupGoalPlaceholder")}">${escapeHtml(group.goal ?? "")}</textarea>
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Friends.GroupGoalHint")}</small></label>
          </section>
        </main>
      </div>
    </div>`;
}

function bindFriendsBook(element) {
  const confirm = element.querySelector('[data-action="choose-friends"]');
  if (confirm) confirm.disabled = false;
}

function creationEquipmentData(source, quantity = 1) {
  const clone = globalThis.foundry?.utils?.deepClone ?? ((value) => structuredClone(value));
  const data = clone(source.toObject ? source.toObject() : source);
  delete data._id;
  data.system ??= {};
  data.system.number = quantity;
  return data;
}

function abilitySheetLoadingContent() {
  return `<div class="symbaroum-hud-ability-sheet-loading">
    <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
    <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.LoadingSheet")}</span>
  </div>`;
}

function abilitySheetUnavailableContent() {
  return `<div class="symbaroum-hud-ability-sheet-loading" data-error="true">
    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
    <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable")}</span>
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

async function mysticalPowerChoiceContent(ability, mysticalPowers, costs, originIndex, sourceId) {
  if (!mysticalPowers.length) {
    return `<p class="symbaroum-hud-ability-special-empty">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoMysticalPowers")}</p>`;
  }
  const cards = await Promise.all(mysticalPowers.map(async (power, choiceOrder) => {
    const origin = resolveContentOrigin(power, { index: originIndex, sourceId });
    const identities = choiceIdentities(power);
    return `
      <article class="symbaroum-hud-ability-special-card" data-mystical-power-choice="${escapeHtml(power.id)}"
        data-creation-choice-origin="${escapeHtml(origin)}" data-creation-choice-source="${escapeHtml(sourceId)}"
        data-creation-choice-identities="${escapeHtml(identities.join(" "))}"
        data-choice-default-order="${choiceOrder}" data-tradition-recommended="false">
        <header>
          <img src="${escapeHtml(power.img || "icons/svg/daze.svg")}" alt="">
          <div><button type="button" class="symbaroum-hud-ability-special-open"
            data-open-creation-item="${escapeHtml(power.id)}"
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.OpenMysticalPower", { name: power.name })}">
            <h4>${escapeHtml(power.name)}</h4>
          </button>
          ${power.system?.reference ? `<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Reference")}: ${escapeHtml(power.system.reference)}</small>` : ""}
          <small class="symbaroum-hud-tradition-recommendation" data-tradition-choice-recommendation hidden>
            <i class="fa-solid fa-hat-wizard" aria-hidden="true"></i><span></span>
          </small></div>
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
      <p class="symbaroum-hud-ability-special-empty" data-mystical-power-filter-empty hidden>
        ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoFilteredMysticalPowers")}
      </p>
    </section>`;
}

async function ritualChoiceContent(ability, rituals, originIndex, sourceId) {
  const cards = rituals.map((ritual, choiceOrder) => {
    const origin = resolveContentOrigin(ritual, { index: originIndex, sourceId });
    const identities = choiceIdentities(ritual);
    return `
      <article class="symbaroum-hud-ability-special-card symbaroum-hud-ritual-choice-card"
        data-ritual-choice="${escapeHtml(ritual.id)}"
        data-creation-choice-origin="${escapeHtml(origin)}" data-creation-choice-source="${escapeHtml(sourceId)}"
        data-creation-choice-identities="${escapeHtml(identities.join(" "))}"
        data-choice-default-order="${choiceOrder}" data-tradition-recommended="false">
        <header>
          <img src="${escapeHtml(ritual.img || "icons/svg/book.svg")}" alt="">
          <div><button type="button" class="symbaroum-hud-ability-special-open"
            data-open-creation-item="${escapeHtml(ritual.id)}"
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.OpenRitual", { name: ritual.name })}">
            <h4>${escapeHtml(ritual.name)}</h4>
          </button>
          ${ritual.system?.reference ? `<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Reference")}: ${escapeHtml(ritual.system.reference)}</small>` : ""}
          <small class="symbaroum-hud-tradition-recommendation" data-tradition-choice-recommendation hidden>
            <i class="fa-solid fa-hat-wizard" aria-hidden="true"></i><span></span>
          </small></div>
          <button type="button" class="symbaroum-hud-ritual-select"
            data-select-ritual="${escapeHtml(ritual.id)}"
            data-ritualist-ability="${escapeHtml(ability.id)}" aria-pressed="false" disabled
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.SelectRitual", { name: ritual.name })}">
            <i class="fa-regular fa-square" aria-hidden="true"></i>
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.SelectRitualLabel")}</span>
          </button>
        </header>
      </article>`;
  });
  return `
    <section class="symbaroum-hud-ability-special-picker symbaroum-hud-ritual-picker"
      data-ritual-picker="${escapeHtml(ability.id)}">
      <header><div><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ChooseRituals")}</h3>
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.RitualChoiceIntro")}</p></div>
        <strong><b data-ritual-count>0</b>/<b data-ritual-required>0</b></strong></header>
      ${cards.length
        ? `<div class="symbaroum-hud-ability-special-list">${cards.join("")}</div>
          <p class="symbaroum-hud-ability-special-empty" data-ritual-filter-empty hidden>
            ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoFilteredRituals")}
          </p>`
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
  const specialChoiceCards = [...element.querySelectorAll("[data-creation-choice-identities]")];
  const selections = new Map();
  const selectionKey = (id, choiceId = "") => choiceId ? `${id}:${choiceId}` : id;
  for (const selection of parseAbilitySelections(selectionsInput?.value ?? "[]")) {
    selections.set(selectionKey(selection.id, selection.choiceId), selection);
  }
  for (const image of element.querySelectorAll("[data-tradition-fallback-src]")) {
    const useFallback = () => {
      const fallback = image.dataset.traditionFallbackSrc;
      if (fallback && image.getAttribute("src") !== fallback) image.setAttribute("src", fallback);
    };
    image.addEventListener("error", useFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) useFallback();
  }
  const selectionValues = (source = selections) => [...source.values()];
  const updateTraditionRecommendations = (values) => {
    const traditions = [];
    const seen = new Set();
    for (const selection of values) {
      const tradition = coreMysticalTradition(availableWorldItem(selection.id));
      if (!tradition || seen.has(tradition.id)) continue;
      seen.add(tradition.id);
      traditions.push({
        definition: tradition,
        name: game.i18n.localize(tradition.name),
        powers: mysticalTraditionChoiceIdentities(tradition, "power"),
        rituals: mysticalTraditionChoiceIdentities(tradition, "ritual")
      });
    }
    const traditionNames = traditions.map((tradition) => tradition.name);
    for (const entry of entries) {
      const recommended = Boolean(entry.dataset.traditionGateway && traditions.length);
      entry.dataset.traditionRecommended = String(recommended);
      const tag = entry.querySelector("[data-tradition-ability-recommendation]");
      if (!tag) continue;
      tag.hidden = !recommended;
      const label = tag.querySelector("span");
      if (label) label.textContent = traditionNames.join(", ");
    }
    const resultList = entries[0]?.closest("ol");
    if (resultList) {
      [...entries].sort((left, right) => {
        const priority = (entry) => entry.dataset.occupationRecommended === "true"
          ? 0
          : entry.dataset.traditionRecommended === "true"
            ? 1
            : 2;
        const priorityDifference = priority(left) - priority(right);
        if (priorityDifference) return priorityDifference;
        return Number(left.closest("[data-ability-default-order]")?.dataset.abilityDefaultOrder ?? 0)
          - Number(right.closest("[data-ability-default-order]")?.dataset.abilityDefaultOrder ?? 0);
      }).forEach((entry) => resultList.append(entry.closest("[data-ability-browser-result]")));
    }
    for (const card of specialChoiceCards) {
      const identities = new Set(String(card.dataset.creationChoiceIdentities ?? "").split(" ").filter(Boolean));
      const kind = card.matches("[data-ritual-choice]") ? "rituals" : "powers";
      const matching = traditions.filter((tradition) => [...identities].some((identity) => tradition[kind].has(identity)));
      const recommended = matching.length > 0;
      card.dataset.traditionRecommended = String(recommended);
      const tag = card.querySelector("[data-tradition-choice-recommendation]");
      if (tag) {
        tag.hidden = !recommended;
        const label = tag.querySelector("span");
        if (label) label.textContent = matching.map((tradition) => tradition.name).join(", ");
      }
    }
    for (const list of element.querySelectorAll(".symbaroum-hud-ability-special-list")) {
      [...list.querySelectorAll("[data-choice-default-order]")].sort((left, right) => {
        const recommendationDifference = Number(right.dataset.traditionRecommended === "true")
          - Number(left.dataset.traditionRecommended === "true");
        if (recommendationDifference) return recommendationDifference;
        return Number(left.dataset.choiceDefaultOrder ?? 0) - Number(right.dataset.choiceDefaultOrder ?? 0);
      }).forEach((card) => list.append(card));
    }
  };
  const bindNativeAbilitySheetTabs = (page) => {
    const host = page?.querySelector("[data-ability-sheet-host]");
    if (!host || host.dataset.abilityTabsBound === "true") return;
    const tabs = [...host.querySelectorAll(".sheet-tabs [data-tab]")];
    const panels = [...host.querySelectorAll(".sheet-body > .tab[data-tab]")];
    if (!tabs.length) return;
    host.dataset.abilityTabsBound = "true";
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
    activateTab(tabs[0]);
  };
  const loadAbilityPageSheet = async (page) => {
    const host = page?.querySelector("[data-ability-sheet-host]");
    if (!host || host.dataset.abilitySheetLoaded === "true" || host.dataset.abilitySheetLoading === "true") {
      bindNativeAbilitySheetTabs(page);
      return;
    }
    const ability = availableWorldItem(page.dataset.creationAbilityPage);
    if (!ability) return;
    host.dataset.abilitySheetLoading = "true";
    host.setAttribute("aria-busy", "true");
    try {
      const rendered = await renderCreationAbilitySheet(ability);
      host.innerHTML = rendered || abilitySheetUnavailableContent();
      host.dataset.abilitySheetLoaded = "true";
      bindNativeAbilitySheetTabs(page);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not lazily render Ability ${ability.name}.`, error);
      host.innerHTML = abilitySheetUnavailableContent();
    } finally {
      delete host.dataset.abilitySheetLoading;
      host.removeAttribute("aria-busy");
    }
  };
  const openPage = (id) => {
    for (const entry of entries) {
      const active = entry.dataset.creationAbilityId === id;
      entry.dataset.active = String(active);
      entry.setAttribute("aria-pressed", String(active));
    }
    let activePage = null;
    for (const page of pages) {
      const active = page.dataset.creationAbilityPage === id;
      page.hidden = !active;
      if (active) activePage = page;
    }
    if (activePage) void loadAbilityPageSheet(activePage);
  };
  const refresh = () => {
    const mode = modeInput.value;
    const limits = abilitySelectionLimits(mode, racialCost);
    const counts = { novice: 0, adept: 0, master: 0 };
    const values = selectionValues();
    updateTraditionRecommendations(values);
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
  for (const page of pages) bindNativeAbilitySheetTabs(page);
  for (const button of element.querySelectorAll("[data-open-creation-item]")) button.addEventListener("click", () => {
    const item = availableWorldItem(button.dataset.openCreationItem);
    const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
    if (!item || (item.testUserPermission && !item.testUserPermission(game.user, observerLevel))) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable"));
      return;
    }
    openCreationItemSheet(item);
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
  const filterPanel = element.querySelector("[data-ability-filter-panel]");
  const filterToggle = element.querySelector("[data-toggle-ability-filter-panel]");
  const originFilters = [...element.querySelectorAll("[data-creation-browser-origin]")];
  const sourceFilters = [...element.querySelectorAll("[data-creation-browser-source]")];
  const setFilterPanelOpen = (open) => {
    if (!filterPanel || !filterToggle) return;
    filterPanel.hidden = !open;
    filterToggle.dataset.active = String(open);
    filterToggle.setAttribute("aria-expanded", String(open));
  };
  const refreshBrowserFilters = () => {
    const query = normalizeName(search?.value);
    const origins = new Set(originFilters.filter((input) => input.checked).map((input) => input.value));
    const sources = new Set(sourceFilters.filter((input) => input.checked).map((input) => input.value));
    let visibleCount = 0;
    for (const entry of entries) {
      const result = entry.closest("[data-ability-browser-result]");
      const visible = (!query || entry.dataset.search.includes(query))
        && origins.has(result?.dataset.origin)
        && sources.has(result?.dataset.source);
      entry.hidden = !visible;
      if (result) result.hidden = !visible;
      if (visible) visibleCount++;
    }
    let visibleMysticalPowers = 0;
    let visibleRituals = 0;
    for (const card of specialChoiceCards) {
      const visible = origins.has(card.dataset.creationChoiceOrigin)
        && sources.has(card.dataset.creationChoiceSource);
      card.hidden = !visible;
      if (!visible) continue;
      if (card.matches("[data-mystical-power-choice]")) visibleMysticalPowers++;
      if (card.matches("[data-ritual-choice]")) visibleRituals++;
    }
    const emptyPowers = element.querySelector("[data-mystical-power-filter-empty]");
    const emptyRituals = element.querySelector("[data-ritual-filter-empty]");
    if (emptyPowers) emptyPowers.hidden = visibleMysticalPowers > 0;
    if (emptyRituals) emptyRituals.hidden = visibleRituals > 0;
    const count = element.querySelector("[data-ability-result-count]");
    if (count) count.textContent = String(visibleCount);
    const active = entries.find((entry) => entry.dataset.active === "true" && !entry.hidden);
    const orderedEntries = [...element.querySelectorAll("[data-creation-ability-id]")];
    if (!active) openPage(orderedEntries.find((entry) => !entry.hidden)?.dataset.creationAbilityId ?? "");
  };
  search?.addEventListener("input", refreshBrowserFilters);
  element.querySelector("[data-clear-ability-search]")?.addEventListener("click", () => {
    search.value = "";
    search.focus();
    refreshBrowserFilters();
  });
  filterToggle?.addEventListener("click", () => setFilterPanelOpen(filterPanel?.hidden !== false));
  element.addEventListener("click", (event) => {
    if (filterPanel?.hidden !== false) return;
    if (event.target.closest("[data-ability-filter-panel], [data-toggle-ability-filter-panel]")) return;
    setFilterPanelOpen(false);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || filterPanel?.hidden !== false) return;
    setFilterPanelOpen(false);
    filterToggle?.focus();
  });
  for (const input of [...originFilters, ...sourceFilters]) {
    input.addEventListener("change", refreshBrowserFilters);
  }
  element.querySelector("[data-toggle-ability-origins]")?.addEventListener("click", () => {
    const check = originFilters.some((input) => !input.checked);
    for (const input of originFilters) input.checked = check;
    refreshBrowserFilters();
  });
  experienceInput?.addEventListener("input", refresh);
  refresh();
  refreshBrowserFilters();
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

async function applyCreationAbilityDocuments(actor, documents) {
  const remaining = [...actorItems(actor)];
  const missing = [];
  for (const document of documents) {
    const identity = abilityIdentity(document);
    const index = remaining.findIndex((item) => item.type === document.type && abilityIdentity(item) === identity);
    if (index < 0) {
      missing.push(document);
      continue;
    }
    const [existing] = remaining.splice(index, 1);
    if (typeof existing.update === "function" && document.system?.novice) {
      await existing.update({
        "system.novice.isActive": Boolean(document.system.novice.isActive),
        "system.adept.isActive": Boolean(document.system.adept?.isActive),
        "system.master.isActive": Boolean(document.system.master?.isActive)
      });
    }
  }
  return missing.length ? actor.createEmbeddedDocuments("Item", missing) : [];
}

async function createMissingEmbeddedItems(actor, documents) {
  const existingCounts = new Map();
  for (const item of actorItems(actor)) {
    const key = `${item.type}:${abilityIdentity(item)}`;
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }
  const missing = documents.filter((document) => {
    const key = `${document.type}:${abilityIdentity(document)}`;
    const available = existingCounts.get(key) ?? 0;
    if (available <= 0) return true;
    existingCounts.set(key, available - 1);
    return false;
  });
  return missing.length ? actor.createEmbeddedDocuments("Item", missing) : [];
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
  const creatorState = creatorStepViewState(actor, "attributes");
  const selectedMode = Object.values(ATTRIBUTE_DISTRIBUTION_MODES).includes(creatorState.attributeDistribution)
    ? creatorState.attributeDistribution
    : ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL;
  const typicalValues = typicalDistribution(actor, creatorState);
  const pointValues = pointBuyDistribution(actor, creatorState);
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
        <div class="symbaroum-hud-attribute-typical-control" data-mode-control="typical" ${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL ? "" : "hidden"}>
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
        <div class="symbaroum-hud-attribute-point-control" data-mode-control="point-buy" ${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.POINT_BUY ? "" : "hidden"}>
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
        value="${selectedMode}">
      <header class="symbaroum-hud-creator-step-guide">
        ${creatorStepNumber(actor, "attributes", "SYMBAROUMHUD.CharacterCreator.Guide.AttributesProgress")}
        <div>
          <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepTwoTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepTwoText")}</p>
        </div>
      </header>
      <nav class="symbaroum-hud-attribute-mode-tabs"
        aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.DistributionMethod")}">
        <button type="button" data-attribute-mode="typical" data-active="${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL}" aria-pressed="${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL}">
          <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.Typical")}
        </button>
        <button type="button" data-attribute-mode="point-buy" data-active="${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.POINT_BUY}" aria-pressed="${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.POINT_BUY}">
          <i class="fa-solid fa-scale-balanced" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Attributes.PointBuy")}
        </button>
      </nav>
      <div class="symbaroum-hud-attribute-workspace">
        <aside class="symbaroum-hud-attribute-rules">
          <div data-attribute-rules="typical" ${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL ? "" : "hidden"}>
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
          <div data-attribute-rules="point-buy" ${selectedMode === ATTRIBUTE_DISTRIBUTION_MODES.POINT_BUY ? "" : "hidden"}>
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

  setMode(modeInput.value);
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

function typicalDistribution(actor, state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {}) {
  if (Array.isArray(state.attributeTypicalValues)) {
    return CORE_ATTRIBUTES.map((_, index) => state.attributeTypicalValues[index] ?? "");
  }
  const saved = state.attributes ?? {};
  const savedValues = CORE_ATTRIBUTES.map((attribute) => Number(saved[attribute.id]));
  if (isValidTypicalDistribution(savedValues)) return savedValues;
  const current = CORE_ATTRIBUTES.map((attribute) =>
    Number(actor?.system?.attributes?.[attribute.id]?.value)
  );
  if (isValidTypicalDistribution(current)) return current;
  return CORE_ATTRIBUTES.map(() => "");
}

function pointBuyDistribution(actor, state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {}) {
  if (Array.isArray(state.attributePointValues)) {
    return CORE_ATTRIBUTES.map((_, index) => Number(state.attributePointValues[index]) || ATTRIBUTE_MIN);
  }
  const saved = state.attributes ?? {};
  const savedValues = CORE_ATTRIBUTES.map((attribute) => Number(saved[attribute.id]));
  if (isValidPointBuyDistribution(savedValues)) return savedValues;
  return CORE_ATTRIBUTES.map(() => ATTRIBUTE_MIN);
}

function attributeValuesFromForm(form, mode) {
  const prefix = mode === ATTRIBUTE_DISTRIBUTION_MODES.TYPICAL ? "typical" : "points";
  return CORE_ATTRIBUTES.map((attribute) => Number(formValue(form, `${prefix}-${attribute.id}`)));
}

function contactsFromForm(form) {
  return {
    network: formValue(form, "contactsNetwork").trim(),
    people: Array.from({ length: 4 }, (_, index) => ({
      name: formValue(form, `contactName-${index}`).trim(),
      role: formValue(form, `contactRole-${index}`).trim(),
      location: formValue(form, `contactLocation-${index}`).trim()
    })).filter((contact) => Object.values(contact).some(Boolean)),
    relationship: formValue(form, "contactsRelationship").trim(),
    access: formValue(form, "contactsAccess").trim(),
    complications: formValue(form, "contactsComplications").trim()
  };
}

function personalityFromForm(form) {
  return {
    characterName: formValue(form, "personalityName"),
    quote: formValue(form, "personalityQuote"),
    age: formValue(form, "personalityAge"),
    height: formValue(form, "personalityHeight"),
    weight: formValue(form, "personalityWeight"),
    appearance: formValue(form, "personalityAppearance"),
    background: formValue(form, "personalityBackground"),
    personalGoal: formValue(form, "personalityGoal")
  };
}

function friendsGroupFromForm(form) {
  return {
    companions: Array.from({ length: 5 }, (_, index) => ({
      name: formValue(form, `friendName-${index}`),
      race: formValue(form, `friendRace-${index}`),
      occupation: formValue(form, `friendOccupation-${index}`),
      player: formValue(form, `friendPlayer-${index}`)
    })).filter((friend) => Object.values(friend).some((value) => value.trim())),
    group: {
      name: formValue(form, "groupName"),
      goal: formValue(form, "groupGoal")
    }
  };
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
      <label class="symbaroum-hud-character-creator-dismiss">
        <input type="checkbox" data-character-creator-dismiss>
        <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.DoNotShowAgain")}</span>
      </label>
    </div>
  `;
}

function hasDismissedCharacterCreator(actor, user = game.user) {
  const userId = user?.id;
  if (!userId) return false;
  const dismissedUsers = actor?.getFlag?.(MODULE_ID, DISMISSED_USERS_FLAG);
  return Array.isArray(dismissedUsers) && dismissedUsers.includes(userId);
}

async function setCharacterCreatorDismissed(actor, user = game.user, dismissed = true) {
  const userId = user?.id;
  if (!userId || !actor?.setFlag) return;
  const dismissedUsers = new Set(
    Array.isArray(actor.getFlag?.(MODULE_ID, DISMISSED_USERS_FLAG))
      ? actor.getFlag(MODULE_ID, DISMISSED_USERS_FLAG)
      : []
  );
  if (dismissed) dismissedUsers.add(userId);
  else dismissedUsers.delete(userId);
  await actor.setFlag(MODULE_ID, DISMISSED_USERS_FLAG, [...dismissedUsers]);
}

function bindCharacterCreatorDismissal(element, actor) {
  const control = element?.querySelector?.("[data-character-creator-dismiss]");
  if (!control) return;
  control.checked = hasDismissedCharacterCreator(actor, game.user);
  control.addEventListener("change", () => {
    void setCharacterCreatorDismissed(actor, game.user, control.checked);
  });
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
