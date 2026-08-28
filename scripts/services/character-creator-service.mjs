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
  ADVANCED_PROFESSION_RULES,
  archetypalAbilityRule,
  countsTowardArchetype,
  professionAbilityRule,
  professionExclusiveItemRules
} from "../data/advanced-character-options.mjs";
import {
  CONTENT_ORIGINS,
  UNKNOWN_CONTENT_ORIGIN,
  contentOriginDefinition,
  resolveContentOrigin,
  staticContentOriginIndex
} from "./content-origin-service.mjs";
import { resolveItemTaxonomy } from "./item-taxonomy-service.mjs";
import {
  activateEmbeddedItemSheetTabs,
  renderEmbeddedItemSheet
} from "./native-item-sheet-service.mjs";
import {
  moneyFromOrtegs,
  moneyToOrtegs,
  parseShopPrice,
  selectShopPrice,
  ShopService
} from "./shop-service.mjs";

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
const PARIAH_STARTING_SHILLING = 5;
const CREATOR_STEPS = Object.freeze([
  Object.freeze({ id: "occupation", complete: OCCUPATION_STEP_COMPLETE }),
  Object.freeze({ id: "race", complete: RACE_STEP_COMPLETE }),
  Object.freeze({ id: "attributes", complete: ATTRIBUTES_STEP_COMPLETE }),
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
  if (!isRaceStepComplete(actor)) return "race";
  if (!isAttributesStepComplete(actor)) return "attributes";
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
      if (!isRaceStepComplete(actor)) return this.openRaceStep(actor);
      if (!isAttributesStepComplete(actor)) return this.openAttributesStep(actor);
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
          title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Title"),
          resizable: true
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
      || !isRaceStepComplete(actor)
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
      || !isOccupationStepComplete(actor)
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
        window: {
          title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.BrowserTitle"),
          resizable: true
        },
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
          bindAbilitiesBook(dialog.element, actor, 0, {
            confirmAction: "buy-abilities",
            requireSelection: true,
            enforceAdvancedRules: false
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
        currentStep = "abilities";
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
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Occupation.Title"),
        resizable: true
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
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Attributes.Title"),
        resizable: true
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
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Race.Title"),
        resizable: true
      },
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
    const savedAdvancedTraits = Array.isArray(creatorState.advancedTraits) ? creatorState.advancedTraits : [];
    const advancedTraits = availableCreationAdvancedTraits(actor, {
      includeKnownIds: savedAdvancedTraits.map((selection) => selection.id)
    });
    const racialCost = racialAbilityCost(actor);
    return DialogV2.wait({
      classes: [
        "symbaroum-hud-character-creator-dialog",
        "symbaroum-hud-occupation-book-dialog",
        "symbaroum-hud-abilities-book-dialog"
      ],
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Title"),
        resizable: true
      },
      position: creatorDialogPosition(placement, 1140, 700),
      content: await abilitiesBookContent(actor, abilities, racialCost, mysticalPowers, rituals, { advancedTraits }),
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
            const advancedTraitSelections = parseAdvancedTraitSelections(formValue(button.form, "advancedTraitSelections"));
            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const costs = abilityExperienceCosts();
            const advancedTraitCost = advancedTraitExperienceCost(advancedTraitSelections);
            if (!isValidAdvancedTraitSelection(advancedTraitSelections, advancedTraits)
              || !isValidAbilitySelection(selections, mode, racialCost, {
                experienceBudget: experienceBudget - advancedTraitCost, costs
              })) {
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
            if (!areAdvancedCreationAbilityRulesValid(actor, selections, available, availablePowers, availableRituals)) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.AdvancedRuleInvalid"));
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
            const advancedTraitDocuments = advancedTraitSelections.map((selection) => creationRitualData(
              advancedTraits.find((item) => item.id === selection.id)
            ));
            const createdAdvancedTraits = await createMissingEmbeddedItems(actor, advancedTraitDocuments);
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
                ? abilitySelectionCost(selections, costs) + racialCost * abilityRankCost("novice", costs) + advancedTraitCost
                : null,
              abilityBonusExperienceAwarded: creatorBonus,
              abilities: saved,
              advancedTraits: advancedTraitSelections.map((selection) => ({
                ...selection,
                name: advancedTraits.find((item) => item.id === selection.id)?.name ?? selection.id
              }))
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "abilities", mode, abilities: saved, created,
              advancedTraits: advancedTraitSelections, createdAdvancedTraits
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
        stabilizeCreatorDialogPosition(dialog, placement, 1140, 700);
        bindCreatorStepNavigation(dialog.element, actor, "abilities");
        bindAbilitiesBook(dialog.element, actor, racialCost);
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
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Contacts.Title"),
        resizable: true
      },
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
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.Title"),
        resizable: true
      },
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
            const selections = equipmentSelectionsFromForm(button.form, currentGrants, currentEquipment);
            if (!selections) return null;

            const camp = findCampingEquipment(actor, currentEquipment);
            const alreadyHasCamp = actorItems(actor).some(isCampingEquipment);
            if (!camp && !alreadyHasCamp) {
              ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.MissingCamping"));
              return null;
            }

            const experience = creationExperienceTotal(actor);
            const baseThaler = startingThalerForExperience(experience);
            const privilegedThaler = privilegedStartingThaler(actor);
            const pariahShilling = pariahStartingShilling(actor);
            const startingMoneyOrtegs = pariahShilling !== null
              ? pariahShilling * 10
              : (privilegedThaler ?? baseThaler) * 100;
            const paidCart = equipmentShopCartFromForm(button.form, currentEquipment);
            if (!paidCart) return null;
            const complimentary = missingCreationEquipmentSelections(actor, [
              ...selections.map(({ grant, item, quantity }) => ({
                source: item,
                quantity,
                reason: equipmentGrantReason(grant)
              })),
              ...(!alreadyHasCamp ? [{
                source: camp,
                quantity: 1,
                reason: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.CampingGrantReason")
              }] : [])
            ]);
            const alreadyCompleted = hasCompletedCreatorStep(actor, "equipment");
            let checkout;
            if (paidCart.length || complimentary.length) {
              checkout = await ShopService.purchaseCart(actor, paidCart, {
                balanceOverride: alreadyCompleted ? null : startingMoneyOrtegs,
                complimentary
              });
            } else {
              if (!alreadyCompleted) {
                const startingMoney = moneyFromOrtegs(startingMoneyOrtegs);
                await actor.update({
                  "system.money.thaler": startingMoney.thaler,
                  "system.money.shilling": startingMoney.shilling,
                  "system.money.orteg": startingMoney.orteg
                });
              }
              checkout = { ok: true, items: [], balance: ShopService.balance(actor) };
            }
            if (!checkout.ok) {
              notifyEquipmentShopFailure(checkout.reason);
              return null;
            }
            const created = checkout.items ?? [];

            const previous = actor.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
            const saved = selections.map(({ grant, item, quantity, combination }) => ({
              ability: grant.ability,
              ...(grant.grantId ? { grantId: grant.grantId } : {}),
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
              startingThaler: startingMoneyOrtegs / 100,
              startingThalerBase: baseThaler,
              startingThalerOverride: privilegedThaler,
              startingShillingOverride: pariahShilling,
              startingExperience: experience,
              equipmentPurchases: paidCart.map(({ source, amount, quantity }) => ({
                itemId: source.id,
                itemName: source.name,
                amount,
                quantity
              }))
            });
            Hooks.callAll(`${MODULE_ID}.characterCreatorStepCompleted`, actor, {
              step: "equipment", equipment: saved, thaler: startingMoneyOrtegs / 100, created
            });
            return { equipment: saved, thaler: startingMoneyOrtegs / 100, created };
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
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Personality.Title"),
        resizable: true
      },
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
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Friends.Title"),
        resizable: true
      },
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
  // Older creator states do not have completedSteps and were recorded while
  // Attributes preceded Race. Keep those markers backward compatible after
  // changing the visible order to Race, Attributes and then Abilities.
  const legacyCompleted = {
    [OCCUPATION_STEP_COMPLETE]: ["occupation"],
    [ATTRIBUTES_STEP_COMPLETE]: ["occupation", "attributes"],
    [RACE_STEP_COMPLETE]: ["occupation", "attributes", "race"],
    [ABILITIES_STEP_COMPLETE]: ["occupation", "attributes", "race", "abilities"],
    [SHADOW_STEP_COMPLETE]: ["occupation", "attributes", "race", "abilities"],
    [EQUIPMENT_STEP_COMPLETE]: ["occupation", "attributes", "race", "abilities", "equipment"],
    [PERSONALITY_STEP_COMPLETE]: ["occupation", "attributes", "race", "abilities", "equipment", "personality"],
    [FRIENDS_STEP_COMPLETE]: CREATOR_STEPS.map((entry) => entry.id)
  }[state.step];
  return legacyCompleted ? [...legacyCompleted] : [];
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
      abilities: parseAbilitySelections(formValue(form, "abilitySelections")),
      advancedTraits: parseAdvancedTraitSelections(formValue(form, "advancedTraitSelections"))
    };
  }
  if (step === "equipment") {
    let equipmentShopCart = [];
    try {
      const parsed = JSON.parse(formValue(form, "equipmentShopCart") || "[]");
      if (Array.isArray(parsed)) equipmentShopCart = parsed;
    } catch (_error) {
      equipmentShopCart = [];
    }
    return { equipmentShopCart };
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
  const margin = 12;
  const viewportWidth = Number(globalThis.innerWidth);
  const viewportHeight = Number(globalThis.innerHeight);
  const defaultWidth = Number.isFinite(viewportWidth)
    ? Math.max(760, viewportWidth - (margin * 2))
    : width;
  const defaultHeight = Number.isFinite(viewportHeight)
    ? Math.max(520, viewportHeight - (margin * 2))
    : height;
  const resolvedWidth = Number.isFinite(placement?.width) ? placement.width : defaultWidth;
  const resolvedHeight = Number.isFinite(placement?.height) ? placement.height : defaultHeight;
  const position = { width: resolvedWidth, height: resolvedHeight };
  if (!Number.isFinite(placement?.left) || !Number.isFinite(placement?.top)) return position;

  const maximumLeft = Number.isFinite(viewportWidth)
    ? Math.max(0, viewportWidth - Math.min(resolvedWidth, viewportWidth))
    : placement.left;
  const maximumTop = Number.isFinite(viewportHeight)
    ? Math.max(0, viewportHeight - Math.min(resolvedHeight, viewportHeight))
    : placement.top;
  position.left = Math.min(Math.max(0, placement.left), maximumLeft);
  position.top = Math.min(Math.max(0, placement.top), maximumTop);
  return position;
}

function bindCreatorDialogPlacement(dialog, placement) {
  const element = dialog?.element;
  const header = element?.querySelector?.(".window-header");
  if (!header || !placement) return;

  element.addEventListener?.("pointerdown", () => dialog.bringToFront?.());

  const remember = () => {
    globalThis.setTimeout(() => {
      const bounds = element.getBoundingClientRect?.();
      const left = Number(bounds?.left ?? dialog.position?.left);
      const top = Number(bounds?.top ?? dialog.position?.top);
      const width = Number(bounds?.width ?? dialog.position?.width);
      const height = Number(bounds?.height ?? dialog.position?.height);
      if (Number.isFinite(left)) placement.left = left;
      if (Number.isFinite(top)) placement.top = top;
      if (Number.isFinite(width) && width > 0) placement.width = width;
      if (Number.isFinite(height) && height > 0) placement.height = height;
    }, 0);
  };
  const rememberOnRelease = (eventName) => {
    const ownerDocument = element.ownerDocument ?? globalThis.document;
    ownerDocument?.addEventListener?.(eventName, remember, { once: true });
  };
  header.addEventListener("pointerdown", () => rememberOnRelease("pointerup"));
  header.addEventListener("mousedown", () => rememberOnRelease("mouseup"));
  header.addEventListener("mouseup", remember);
  const resizeHandle = element.querySelector?.(".window-resize-handle, [data-resize-handle]");
  resizeHandle?.addEventListener?.("pointerdown", () => rememberOnRelease("pointerup"));
  resizeHandle?.addEventListener?.("mousedown", () => rememberOnRelease("mouseup"));
  resizeHandle?.addEventListener?.("mouseup", remember);
}

function stabilizeCreatorDialogPosition(dialog, placement, width, height) {
  const apply = () => {
    if (!dialog?.element?.isConnected) return;
    dialog.setPosition?.(creatorDialogPosition(placement, width, height));
  };

  // Native Item sheets make the first Abilities layout heavier. Foundry can
  // finish that render with a temporary height and only correct it after the
  // window receives focus, so enforce the intended bounds during render too.
  apply();
  globalThis.setTimeout(apply, 0);
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
    : "";
  const selectedOccupation = coreOccupation(selectedId);
  const selectedArchetypeId = selectedId === "custom"
    ? "custom"
    : (selectedOccupation?.archetype ?? "");
  const custom = creatorState.customOccupation ?? {};
  const archetypeCards = OCCUPATION_ARCHETYPES.map((archetype) => `
    <button type="button" class="symbaroum-hud-archetype-card"
      data-select-archetype="${archetype.id}"
      data-active="${archetype.id === selectedArchetypeId}"
      aria-pressed="${archetype.id === selectedArchetypeId}"
      aria-label="${localizeEscaped(archetype.label)}"
      style="--symbaroum-hud-archetype-art: url(&quot;/${escapeHtml(archetype.art)}&quot;)">
      <span class="symbaroum-hud-archetype-card-art" aria-hidden="true"></span>
      <span class="symbaroum-hud-archetype-card-copy">
        <strong>${localizeEscaped(archetype.label)}</strong>
        <span>${localizeEscaped(archetype.summary)}</span>
        <em>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ChooseArchetype")}
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></em>
      </span>
    </button>
  `).join("");
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
      <section class="symbaroum-hud-occupation-index-group"
        data-occupation-archetype-group="${archetype.id}"
        ${selectedArchetypeId === archetype.id ? "" : "hidden"}>
        <h3>${localizeEscaped(archetype.label)}</h3>
        ${items}
      </section>
    `;
  }).join("") + `
    <section class="symbaroum-hud-occupation-index-group symbaroum-hud-occupation-custom-index"
      data-occupation-archetype-group="custom" ${selectedArchetypeId === "custom" ? "" : "hidden"}>
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
    const suggestedGifts = occupationSuggestionLinks(actor,
      occupation.gifts ? game.i18n.localize(occupation.gifts) : "", "boon");
    const suggestedBurdens = occupationSuggestionLinks(actor,
      occupation.burdens ? game.i18n.localize(occupation.burdens) : "", "burden");
    const advancedSuggestions = [
      occupation.gifts ? `<li><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SuggestedGifts")}:</strong><span class="symbaroum-hud-occupation-ability-links">${suggestedGifts}</span></li>` : "",
      occupation.burdens ? `<li><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SuggestedBurdens")}:</strong><span class="symbaroum-hud-occupation-ability-links">${suggestedBurdens}</span></li>` : ""
    ].join("");
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
              ${advancedSuggestions}
              <li><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.Source")}:</strong><span>${localizeEscaped(occupation.sourceLabel)}</span></li>
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
      <section class="symbaroum-hud-archetype-stage" data-archetype-stage>
        <header class="symbaroum-hud-archetype-introduction">
          <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ArchetypeLabel")}</span>
          <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ArchetypeSelectionTitle")}</h2>
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ArchetypeSelectionText")}</p>
        </header>
        <div class="symbaroum-hud-archetype-carousel">
          <div class="symbaroum-hud-archetype-track" data-archetype-track>
            ${archetypeCards}
          </div>
        </div>
        <button type="button" class="symbaroum-hud-custom-from-archetypes" data-select-custom-occupation>
          <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.CustomFromArchetypes")}
        </button>
      </section>
      <aside class="symbaroum-hud-occupation-index" data-occupation-stage hidden>
        <header>
          <button type="button" class="symbaroum-hud-change-archetype" data-change-archetype
            title="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ChangeArchetype")}">
            <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
            <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ChangeArchetype")}</span>
          </button>
          <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.Index")}</h2>
        </header>
        <div class="symbaroum-hud-occupation-index-list" role="navigation"
          aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.SelectLabel")}">
          ${index}
        </div>
        <p class="symbaroum-hud-occupation-profession-notice">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.ProfessionNotice")}
        </p>
      </aside>
      <main class="symbaroum-hud-occupation-reading-page" data-occupation-stage hidden>
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
  const archetypeStage = element.querySelector("[data-archetype-stage]");
  const occupationStages = Array.from(element.querySelectorAll("[data-occupation-stage]"));
  const archetypeGroups = Array.from(element.querySelectorAll("[data-occupation-archetype-group]"));
  const archetypeCards = Array.from(element.querySelectorAll("[data-select-archetype]"));
  const confirm = element.querySelector('[data-action="choose-occupation"]');
  const updateConfirmation = () => {
    const occupationStageVisible = occupationStages.some((stage) => !stage.hidden);
    if (confirm) confirm.disabled = !occupationStageVisible
      || (!coreOccupation(input?.value) && input?.value !== "custom");
  };
  const selectOccupation = (id) => {
    if (!coreOccupation(id) && id !== "custom") return;
    input.value = id;
    for (const candidate of entries) {
      const active = candidate.dataset.occupationId === id;
      candidate.dataset.active = String(active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    for (const page of pages) page.hidden = page.dataset.occupationPage !== id;
    updateConfirmation();
  };
  const showOccupationStage = (archetypeId) => {
    if (!OCCUPATION_ARCHETYPES.some(({ id }) => id === archetypeId) && archetypeId !== "custom") return;
    if (archetypeStage) archetypeStage.hidden = true;
    for (const stage of occupationStages) stage.hidden = false;
    for (const group of archetypeGroups) {
      group.hidden = group.dataset.occupationArchetypeGroup !== archetypeId;
    }
    for (const card of archetypeCards) {
      const active = card.dataset.selectArchetype === archetypeId;
      card.dataset.active = String(active);
      card.setAttribute("aria-pressed", String(active));
    }
    const current = coreOccupation(input?.value);
    if (archetypeId === "custom") selectOccupation("custom");
    else if (current?.archetype !== archetypeId) {
      selectOccupation(CORE_OCCUPATIONS.find((occupation) => occupation.archetype === archetypeId)?.id);
    }
  };
  const showArchetypeStage = () => {
    input.value = "";
    for (const candidate of entries) {
      candidate.dataset.active = "false";
      candidate.setAttribute("aria-pressed", "false");
    }
    for (const page of pages) page.hidden = true;
    for (const stage of occupationStages) stage.hidden = true;
    if (archetypeStage) archetypeStage.hidden = false;
    updateConfirmation();
  };

  for (const card of archetypeCards) {
    card.addEventListener("click", () => showOccupationStage(card.dataset.selectArchetype));
  }
  element.querySelector("[data-select-custom-occupation]")?.addEventListener("click", () => {
    showOccupationStage("custom");
  });
  element.querySelector("[data-change-archetype]")?.addEventListener("click", showArchetypeStage);
  for (const entry of entries) {
    entry.addEventListener("click", () => selectOccupation(entry.dataset.occupationId));
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
  for (const button of element.querySelectorAll("[data-open-occupation-related-item]")) {
    button.addEventListener("click", () => {
      const item = occupationRelatedItemDocument(button.dataset.openOccupationRelatedItem);
      if (!item) {
        ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable"));
        return;
      }
      openCreationItemSheet(item);
    });
  }
  for (const button of element.querySelectorAll("[data-open-occupation-suggestion]")) {
    button.addEventListener("click", () => {
      const item = occupationSuggestionDocument(button.dataset.openOccupationSuggestion);
      if (!item) {
        ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.Unavailable"));
        return;
      }
      openCreationItemSheet(item);
    });
  }
  updateConfirmation();
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
  return occupationAbilityGroups(value).map(({ heading, abilities }) => {
    const links = abilities.map((label) => occupationAbilityEntryLink(actor, label)).join(", ");
    return `${heading ? `<strong>${escapeHtml(heading)}:</strong> ` : ""}${links}`;
  }).join("; ");
}

function occupationAbilityEntryLink(actor, label) {
  const entry = occupationAbilityEntry(label);
  const ability = occupationAbilityDocument(null, actor, entry.ability);
  const abilityLabel = ability
    ? `<button type="button" class="symbaroum-hud-occupation-ability-link"
        data-open-occupation-ability="${escapeHtml(ability.id)}"
        title="${escapeHtml(`${game.i18n.localize("SYMBAROUMHUD.Actions.OpenAbility")}: ${entry.ability}`)}">
        ${escapeHtml(entry.ability)}
      </button>`
    : `<span>${escapeHtml(entry.ability)}</span>`;
  if (!entry.qualifier || !entry.related.length) return abilityLabel;
  const related = entry.related.map((suggestion) => {
    const item = occupationRelatedItemDocument(null, actor, suggestion, entry.choiceType);
    if (!item) return `<span>${escapeHtml(suggestion)}</span>`;
    return `<button type="button" class="symbaroum-hud-occupation-ability-link"
      data-open-occupation-related-item="${escapeHtml(item.id)}"
      title="${escapeHtml(`${game.i18n.localize("SYMBAROUMHUD.Actions.OpenItem")}: ${suggestion}`)}">
      ${escapeHtml(suggestion)}
    </button>`;
  }).join(` ${escapeHtml(entry.connector)} `);
  return `${abilityLabel} (${escapeHtml(entry.qualifier)} ${related})`;
}

function occupationSuggestionLinks(actor, value, type) {
  return occupationAbilityGroups(value).map(({ heading, abilities }) => {
    const links = abilities.map((label) => {
      const item = occupationSuggestionDocument(null, actor, label, type);
      if (!item) return `<span>${escapeHtml(label)}</span>`;
      const title = `${game.i18n.localize("SYMBAROUMHUD.Actions.OpenItem")}: ${label}`;
      return `<button type="button" class="symbaroum-hud-occupation-ability-link"
        data-open-occupation-suggestion="${escapeHtml(item.id)}" title="${escapeHtml(title)}">
        ${escapeHtml(label)}
      </button>`;
    }).join(", ");
    return `${heading ? `<strong>${escapeHtml(heading)}:</strong> ` : ""}${links}`;
  }).join("; ");
}

function occupationAbilityGroups(value) {
  return String(value ?? "")
    .split(/\s*;\s*/u)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const separator = section.indexOf(":");
      const heading = separator >= 0 ? section.slice(0, separator).trim() : "";
      const list = separator >= 0 ? section.slice(separator + 1) : section;
      const abilities = splitOccupationAbilityList(list);
      return { heading, abilities };
    });
}

function splitOccupationAbilityList(value) {
  const entries = [];
  let current = "";
  let depth = 0;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === "(") depth++;
    else if (character === ")") depth = Math.max(0, depth - 1);
    const alternative = depth === 0 ? text.slice(index).match(/^\s+(?:ou|or)\s+/iu) : null;
    if (depth === 0 && (character === "," || alternative)) {
      if (current.trim()) entries.push(current.trim());
      current = "";
      if (alternative) index += alternative[0].length - 1;
      continue;
    }
    current += character;
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
}

function occupationAbilityNames(value) {
  return occupationAbilityGroups(value)
    .flatMap((group) => group.abilities)
    .map((label) => occupationAbilityEntry(label).ability);
}

function occupationRelatedRecommendations(value) {
  const recommendations = { mysticalPowers: [], rituals: [] };
  for (const label of occupationAbilityGroups(value).flatMap((group) => group.abilities)) {
    const entry = occupationAbilityEntry(label);
    const target = entry.choiceType === "mysticalPower"
      ? recommendations.mysticalPowers
      : entry.choiceType === "ritual"
        ? recommendations.rituals
        : null;
    if (!target) continue;
    for (const suggestion of entry.related) {
      if (!target.some((current) => normalizeName(current) === normalizeName(suggestion))) target.push(suggestion);
    }
  }
  return recommendations;
}

function occupationAbilityEntry(label) {
  const text = String(label ?? "").trim();
  const qualified = text.match(/^(.*?)\s*\((geralmente|usually)\s+(.+?)\)\s*$/iu);
  if (!qualified) return { ability: text, qualifier: "", connector: "ou", choiceType: "", related: [] };
  const ability = qualified[1].trim();
  const normalizedAbility = normalizeName(ability);
  const choiceType = ["podermistico", "mysticalpower"].includes(normalizedAbility)
    ? "mysticalPower"
    : ["ritualista", "ritualist"].includes(normalizedAbility)
      ? "ritual"
      : "";
  if (!choiceType) return { ability, qualifier: qualified[2], connector: "ou", choiceType: "", related: [] };
  const connector = /\s+or\s+/iu.test(qualified[3]) ? "or" : "ou";
  const related = qualified[3]
    .split(/\s+(?:ou|or)\s+/iu)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return { ability, qualifier: qualified[2], connector, choiceType, related };
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
  const occupationRecommendation = occupationRaceRecommendation(actor);
  const recommendedRaceIds = occupationRecommendation?.raceIds ?? [];
  const recommendationOrder = new Map(recommendedRaceIds.map((id, index) => [id, index]));
  const orderedRaces = [...CORE_RACES].sort((left, right) => {
    const leftOrder = recommendationOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = recommendationOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
  const recommendationContent = occupationRecommendation ? `
    <aside class="symbaroum-hud-race-occupation-recommendation">
      <header><i class="fa-solid fa-compass" aria-hidden="true"></i>
        <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.OccupationRecommendation")}</span></header>
      <strong>${escapeHtml(occupationRecommendation.name)}</strong>
      <p>${escapeHtml(occupationRecommendation.races)}</p>
    </aside>` : "";
  const index = orderedRaces.map((race) => {
    const recommended = recommendationOrder.has(race.id);
    return `
    <button type="button" class="symbaroum-hud-race-index-entry"
      data-race-id="${race.id}" data-active="${race.id === selectedId}"
      data-occupation-recommended="${recommended}"
      aria-pressed="${race.id === selectedId}">
      <i class="fa-solid ${race.icon}" aria-hidden="true"></i>
      <span>${localizeEscaped(race.name)}${recommended ? `
        <small><i class="fa-solid fa-compass" aria-hidden="true"></i>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Race.RecommendedTag", { occupation: occupationRecommendation.name })}</small>` : ""}</span>
    </button>
  `;
  }).join("");

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
        <div class="symbaroum-hud-race-editorial-body">
          <figure class="symbaroum-hud-race-art"><img src="${escapeHtml(raceArtPath(race.art))}" alt="" loading="lazy" style="object-position:${race.artPosition}"></figure>
          <div class="symbaroum-hud-race-lore">${lore}</div>
        </div>
        <section class="symbaroum-hud-race-traits"><h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.TraitsHeading")}</h3>
          ${required ? `<section class="symbaroum-hud-race-trait-section" data-trait-group="required"><h4>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.RequiredTraits")}</h4><div>${required}</div></section>` : ""}
          ${choices ? `<section class="symbaroum-hud-race-trait-section" data-trait-group="choice"><h4>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.ChooseOne")}</h4><div>${choices}</div></section>` : ""}
          ${optional ? `<section class="symbaroum-hud-race-trait-section" data-trait-group="optional"><h4>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.OptionalTraits")} <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Race.CostsAbility")}</small></h4><div>${optional}</div></section>` : ""}
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
        ${recommendationContent}
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

function occupationSuggestionDocument(id, actor = null, label = "", type = "") {
  const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
  const suggestedName = normalizeName(String(label).replace(/\s*\([^)]*\)\s*$/, ""));
  return [...actorItems(actor), ...Array.from(game.items?.values?.() ?? game.items ?? [])].find((item) => {
    if (!["boon", "burden"].includes(item?.type)) return false;
    if (type && item.type !== type) return false;
    if (id && item.id !== id) return false;
    if (!id && suggestedName && ![
      normalizeName(item.name),
      normalizeName(item.system?.reference)
    ].includes(suggestedName)) return false;
    return !item.testUserPermission || item.testUserPermission(game.user, observerLevel);
  }) ?? null;
}

function occupationRelatedItemDocument(id, actor = null, label = "", type = "") {
  const observerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? "OBSERVER";
  const suggestedName = normalizeName(label);
  return [...actorItems(actor), ...Array.from(game.items?.values?.() ?? game.items ?? [])].find((item) => {
    if (type === "mysticalPower" && item?.type !== "mysticalPower") return false;
    if (type === "ritual" && !isRitualDocument(item)) return false;
    if (!type && item?.type !== "mysticalPower" && !isRitualDocument(item)) return false;
    if (id && item.id !== id) return false;
    if (!id && suggestedName && ![
      normalizeName(item.name),
      normalizeName(item.system?.reference)
    ].includes(suggestedName)) return false;
    return !item.testUserPermission || item.testUserPermission(game.user, observerLevel);
  }) ?? null;
}

function raceArtPath(path) {
  const value = String(path ?? "").replace(/^\/+/, "");
  const resolved = /^(?:modules|systems)\//.test(value) ? value : `modules/symbaroum-hud/${value}`;
  return value === "assets/races/goblin.webp" ? `${resolved}?art=goblin-traveller-v2` : resolved;
}

function occupationRaceRecommendation(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (state.occupation === "custom") {
    const name = String(state.customOccupation?.name ?? actor?.system?.bio?.occupation ?? "").trim();
    const races = String(state.customOccupation?.races ?? "").trim();
    return name && races ? { name, races, raceIds: raceIdsMentionedBy(races) } : null;
  }
  const occupation = coreOccupation(state.occupation);
  if (!occupation) return null;
  return {
    name: game.i18n.localize(occupation.name),
    races: game.i18n.localize(occupation.races),
    raceIds: occupation.suggestedRaces ?? []
  };
}

function raceIdsMentionedBy(text) {
  const normalized = normalizeName(text);
  const ids = CORE_RACES
    .filter((race) => normalized.includes(normalizeName(game.i18n.localize(race.name))))
    .map((race) => race.id);
  if (normalized.includes("humano") || normalized.includes("human")) {
    for (const id of ["ambrian", "barbarian"]) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
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
              <input type="text" name="contactsNetwork" required value="${escapeHtml(saved.network ?? "")}" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.NetworkPlaceholder")}"></label>
            <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Relationship")}<i class="fa-solid fa-asterisk" aria-hidden="true"></i></span>
              <textarea name="contactsRelationship" required placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.RelationshipPlaceholder")}">${escapeHtml(saved.relationship ?? "")}</textarea></label>
          </section>
          <details class="symbaroum-hud-contact-people symbaroum-hud-contact-fold">
            <summary><span><i class="fa-solid fa-users" aria-hidden="true"></i>
              ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.PeopleHeading")}</span>
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Optional")}</small></summary>
            <div class="symbaroum-hud-contact-fold-content">${peopleRows}</div>
          </details>
          <details class="symbaroum-hud-contacts-extra symbaroum-hud-contact-fold">
            <summary><span><i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.DetailsHeading")}</span>
              <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Optional")}</small></summary>
            <div class="symbaroum-hud-contacts-details symbaroum-hud-contact-fold-content">
              <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Access")}</span>
                <textarea name="contactsAccess" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.AccessPlaceholder")}">${escapeHtml(saved.access ?? "")}</textarea></label>
              <label><span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.Complications")}</span>
                <textarea name="contactsComplications" placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.ComplicationsPlaceholder")}">${escapeHtml(saved.complications ?? "")}</textarea></label>
            </div>
          </details>`;
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
  const aliases = new Set(
    [trait.id, game.i18n.localize(trait.name), ...trait.aliases].map(normalizeName).filter(Boolean)
  );
  const matches = (item) => item?.type === trait.type && [
    item.system?.reference,
    item.name,
    item.flags?.babele?.originalName
  ].some((value) => aliases.has(normalizeName(value)));
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

function availableCreationAdvancedTraits(actor, { includeKnownIds = [] } = {}) {
  const known = new Set(actorItems(actor)
    .filter((item) => ["boon", "burden"].includes(item.type))
    .map(abilityIdentity));
  const included = new Set(includeKnownIds);
  return availableCreationWorldItems(known, (item) => ["boon", "burden"].includes(item?.type), {
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
  return Math.max(0, Array.isArray(state.abilityCostTraits) ? state.abilityCostTraits.length : 0);
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
    if (["trait", "ability", "mysticalPower"].includes(trait?.type)) {
      return total + abilityRankCost("novice", costs.power);
    }
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
  const advancedTraits = browserMode ? [] : Array.from(options.advancedTraits ?? []);
  const savedAdvancedTraits = browserMode
    ? []
    : parseAdvancedTraitSelections(JSON.stringify(state.advancedTraits ?? []));
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
  const savedSelectionIds = new Set(savedSelections.map((selection) => selection.id));
  const orderedAbilities = [...abilities].sort((left, right) => {
    const leftRecommended = isRecommended(left);
    const rightRecommended = isRecommended(right);
    if (leftRecommended !== rightRecommended) return leftRecommended ? -1 : 1;
    if (leftRecommended) return recommendationIndex(left) - recommendationIndex(right);
    const leftSelected = savedSelectionIds.has(left.id);
    const rightSelected = savedSelectionIds.has(right.id);
    if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
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
  const selectedArchetype = String(state.archetype ?? actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.archetype ?? "");
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
    const archetypeRule = archetypalAbilityRule(ability);
    const professionRule = professionAbilityRule(ability);
    const archetypeApplies = archetypeRule?.archetype === selectedArchetype;
    return `
    <li data-ability-browser-result data-origin="${escapeHtml(origin)}" data-source="${browserSourceId}"
      data-ability-default-order="${abilityOrder}">
      <button type="button" class="symbaroum-hud-browser-entry-main symbaroum-hud-ability-index-entry"
        data-creation-ability-id="${escapeHtml(ability.id)}"
        data-search="${escapeHtml(normalizeName(`${ability.name} ${ability.system?.reference ?? ""} ${originLabel} ${isRecommended(ability) ? recommendation?.name ?? "" : ""}`))}"
        data-occupation-recommended="${isRecommended(ability)}"
        ${archetypeApplies ? `data-archetypal-ability="${escapeHtml(archetypeRule.id)}"` : ""}
        ${professionRule && !browserMode ? `data-profession-restricted="${escapeHtml(professionRule.profession)}"` : ""}
        ${traditionGateway ? `data-tradition-gateway="${traditionGateway}" data-tradition-recommended="false"` : ""}
        data-active="${ability.id === firstId}" aria-pressed="${ability.id === firstId}">
        <img src="${escapeHtml(ability.img || "icons/svg/book.svg")}" alt="">
        <span class="symbaroum-hud-browser-entry-details symbaroum-hud-ability-index-label">
          <strong>${escapeHtml(ability.name)}</strong>
          ${isRecommended(ability) ? `<small><i class="fa-solid fa-compass" aria-hidden="true"></i>${escapeHtml(recommendation.name)}</small>` : ""}
          ${traditionGateway ? `<small class="symbaroum-hud-tradition-recommendation"
            data-tradition-ability-recommendation hidden><i class="fa-solid fa-hat-wizard" aria-hidden="true"></i><span></span></small>` : ""}
          ${archetypeApplies ? `<small class="symbaroum-hud-advanced-rule-tag" data-archetype-rule-tag>
            <i class="fa-solid fa-diagram-project" aria-hidden="true"></i>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ArchetypeRequirementShort", { count: archetypeRule.minimum })}</small>` : ""}
          ${professionRule && !browserMode ? `<small class="symbaroum-hud-advanced-rule-tag" data-locked="true">
            <i class="fa-solid fa-lock" aria-hidden="true"></i>${escapeHtml(professionRule.professionName)}</small>` : ""}
          <b class="symbaroum-hud-ability-browser-rank" data-ability-entry-rank></b>
        </span>
      </button>
    </li>`;
  }).join("");
  const pages = (await Promise.all(abilities.map(async (ability) => {
    const mysticalPowerAbility = isMysticalPowerAbility(ability);
    const ritualistAbility = isRitualistAbility(ability);
    const mysticalTradition = coreMysticalTradition(ability);
    const archetypeRule = archetypalAbilityRule(ability);
    const professionRule = professionAbilityRule(ability);
    const archetypeApplies = archetypeRule?.archetype === selectedArchetype;
    const sheetLoaded = ability.id === firstId;
    const nativeSheet = sheetLoaded ? await renderCreationAbilitySheet(ability) : "";
    const mysticalPowerChoices = mysticalPowerAbility
      ? await mysticalPowerChoiceContent(ability, mysticalPowers, costs, originIndex, browserSourceId, {
        enforceProfessionRules: !browserMode,
        occupationRecommendation: recommendation
      })
      : "";
    const ritualChoices = ritualistAbility
      ? await ritualChoiceContent(ability, rituals, originIndex, browserSourceId, {
        enforceProfessionRules: !browserMode,
        occupationRecommendation: recommendation
      })
      : "";
    return `
      <article class="symbaroum-hud-ability-page" data-creation-ability-page="${escapeHtml(ability.id)}"
        ${mysticalTradition ? `data-mystical-tradition="${escapeHtml(mysticalTradition.id)}"` : ""}
        ${archetypeApplies ? `data-archetypal-ability-page="${escapeHtml(archetypeRule.id)}"` : ""}
        ${professionRule && !browserMode ? `data-profession-restricted-page="${escapeHtml(professionRule.profession)}"` : ""}
        ${ability.id === firstId ? "" : "hidden"}>
        ${mysticalTradition ? mysticalTraditionContent(mysticalTradition, ability) : ""}
        ${archetypeApplies ? `<aside class="symbaroum-hud-advanced-ability-rule" data-archetype-rule-notice>
          <i class="fa-solid fa-diagram-project" aria-hidden="true"></i><div>
            <strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ArchetypeRequirementTitle")}</strong>
            <span>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ArchetypeRequirement", { count: archetypeRule.minimum })}</span>
          </div></aside>` : ""}
        ${professionRule && !browserMode ? `<aside class="symbaroum-hud-advanced-ability-rule" data-restricted="true">
          <i class="fa-solid fa-lock" aria-hidden="true"></i><div>
            <strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ProfessionAbilityTitle")}</strong>
            <span>${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.ProfessionAbility", { profession: professionRule.professionName })}</span>
          </div></aside>` : ""}
        <div class="symbaroum sheet item symbaroum-hud-native-ability-sheet"
          data-ability-sheet-host data-ability-sheet-loaded="${sheetLoaded}">
          ${sheetLoaded ? nativeSheet : abilitySheetLoadingContent()}
        </div>
        <div class="symbaroum-hud-native-ability-purchase" ${mysticalPowerAbility ? "hidden" : ""}>
          ${["novice", "adept", "master"].map((rank) => `<button type="button"
            data-select-ability="${escapeHtml(ability.id)}" data-rank="${rank}"
            ${archetypeApplies ? `data-archetypal-rule="${escapeHtml(archetypeRule.id)}" data-archetypal-minimum="${archetypeRule.minimum}"` : ""}
            ${professionRule && !browserMode ? `data-profession-restricted="${escapeHtml(professionRule.profession)}"` : ""}
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
      <input type="hidden" name="advancedTraitSelections" value="${escapeHtml(JSON.stringify(savedAdvancedTraits))}">
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
          ${browserMode ? "" : advancedProfessionCatalogueContent()}
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
          <details class="symbaroum-hud-ability-result-group symbaroum-hud-ability-list-group" open>
            <summary>
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              <h2>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Categories.Abilities")}</h2>
              <span><b data-ability-result-count>${orderedAbilities.length}</b> ${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Found")}</span>
            </summary>
            <ol>${index || `<li class="symbaroum-hud-browser-empty"><i class="fa-solid fa-book-open"></i><strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Empty")}</strong></li>`}</ol>
          </details>
          ${advancedTraits.length ? advancedTraitCatalogueContent(actor, advancedTraits, savedAdvancedTraits) : ""}
        </section>
        <main class="symbaroum-hud-ability-reading-page">${pages || `<p class="symbaroum-hud-ability-empty">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Empty")}</p>`}</main>
      </div>
    </div>`;
}

function occupationAbilityRecommendation(actor) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (state.occupation === "custom") {
    const name = String(state.customOccupation?.name ?? "").trim();
    const value = state.customOccupation?.abilities;
    const abilities = occupationAbilityNames(value);
    return name && abilities.length ? { name, abilities, ...occupationRelatedRecommendations(value) } : null;
  }
  const occupation = coreOccupation(state.occupation);
  if (!occupation) return null;
  const value = game.i18n.localize(occupation.abilities);
  const abilities = occupationAbilityNames(value);
  return abilities.length ? {
    name: game.i18n.localize(occupation.name),
    abilities,
    ...occupationRelatedRecommendations(value)
  } : null;
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
  const practice = tradition.kind === "practice";
  return `
    <section class="symbaroum-hud-mystical-tradition-page">
      <header class="symbaroum-hud-mystical-tradition-hero">
        <figure>
          <img src="${escapeHtml(tradition.art)}" alt="${localizeEscaped(tradition.name)}"
            data-tradition-fallback-src="${artFallback}">
        </figure>
        <div>
          <span><i class="fa-solid ${escapeHtml(tradition.icon)}" aria-hidden="true"></i>${localizeEscaped(practice
            ? "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PracticeBookLabel"
            : "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.BookLabel")}</span>
          <h2>${localizeEscaped(tradition.name)}</h2>
          <p>${localizeEscaped(tradition.introduction)}</p>
          <aside>
            <i class="fa-solid fa-scroll" aria-hidden="true"></i>
            <p>${formatEscaped(tradition.profession
              ? "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.ProfessionPurchaseExplanation"
              : "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PurchaseExplanation", { ability: ability.name })}</p>
          </aside>
        </div>
      </header>
      <div class="symbaroum-hud-mystical-tradition-chapter">
        <section class="symbaroum-hud-mystical-tradition-doctrine">
          <h3>${localizeEscaped(practice
            ? "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PracticeHeading"
            : "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.TraditionHeading")}</h3>
          <p>${localizeEscaped(tradition.doctrine)}</p>
        </section>
        <section>
          <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.TitlesHeading")}</h3>
          <p>${localizeEscaped(tradition.titles)}</p>
        </section>
        <section>
          <h3>${localizeEscaped(practice
            ? "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PracticeWorksHeading"
            : "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PowersHeading")}</h3>
          <p>${localizeEscaped(tradition.powers)}</p>
        </section>
        <section>
          <h3>${localizeEscaped(practice
            ? "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.PracticeLimitsHeading"
            : "SYMBAROUMHUD.CharacterCreator.Abilities.Traditions.RitualsHeading")}</h3>
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

function advancedTraitCatalogueContent(actor, items, savedSelections) {
  const selected = new Set(savedSelections.map((selection) => selection.id));
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  const occupation = coreOccupation(state.occupation);
  const suggested = new Set([
    occupation?.gifts ? game.i18n.localize(occupation.gifts) : "",
    occupation?.burdens ? game.i18n.localize(occupation.burdens) : ""
  ].flatMap((value) => String(value).split(/\s*,\s*/u)).map(normalizeName).filter(Boolean));
  const groups = ["boon", "burden"].map((type) => {
    const entries = items.filter((item) => item.type === type).sort((left, right) => {
      const recommendation = Number(suggested.has(normalizeName(right.name)))
        - Number(suggested.has(normalizeName(left.name)));
      return recommendation || left.name.localeCompare(right.name, game.i18n?.lang ?? "pt-BR", { sensitivity: "base" });
    });
    return `<section data-advanced-trait-group="${type}">
      <h4><i class="fa-solid ${type === "boon" ? "fa-gift" : "fa-weight-hanging"}" aria-hidden="true"></i>
        ${localizeEscaped(type === "boon"
          ? "SYMBAROUMHUD.CharacterCreator.Abilities.AdvancedTraits.Boons"
          : "SYMBAROUMHUD.CharacterCreator.Abilities.AdvancedTraits.Burdens")}
        <small><b data-advanced-trait-count="${type}">0</b>/${type === "boon" ? 3 : 2}</small></h4>
      <div>${entries.map((item) => {
        const professionRules = professionExclusiveItemRules(item);
        return `<article data-advanced-trait-entry="${escapeHtml(item.id)}"
          ${professionRules.length ? `data-profession-restricted-choice="${escapeHtml(professionRules.map((rule) => rule.id).join(" "))}"` : ""}>
        <button type="button" data-open-creation-item="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}">
          <img src="${escapeHtml(item.img || (type === "boon" ? "icons/svg/upgrade.svg" : "icons/svg/downgrade.svg"))}" alt="">
          <span>${escapeHtml(item.name)}</span>
          ${suggested.has(normalizeName(item.name)) ? `<em><i class="fa-solid fa-compass"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.AdvancedTraits.Suggested")}</em>` : ""}
        </button>
        <label><input type="checkbox" data-advanced-trait-choice value="${escapeHtml(item.id)}"
          data-advanced-trait-type="${type}" ${selected.has(item.id) ? "checked" : ""}
          ${professionRules.length ? `data-profession-restricted="${escapeHtml(professionRules.map((rule) => rule.id).join(" "))}" disabled` : ""}>
          <i class="fa-regular fa-square" aria-hidden="true"></i></label>
      </article>`;
      }).join("")}</div>
    </section>`;
  }).join("");
  return `<details class="symbaroum-hud-ability-result-group symbaroum-hud-advanced-trait-catalogue">
    <summary><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.AdvancedTraits.Title")}</h2>
      <b data-advanced-trait-balance>0 XP</b></summary>
    <div class="symbaroum-hud-advanced-trait-content">
      <div class="symbaroum-hud-advanced-trait-rules">
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.AdvancedTraits.Rules")}</p>
        <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.AdvancedTraits.Limits")}</small>
      </div>
      ${groups}
    </div>
  </details>`;
}

function advancedProfessionCatalogueContent() {
  const english = String(game.i18n?.lang ?? "pt-BR").toLowerCase().startsWith("en");
  const entries = ADVANCED_PROFESSION_RULES.map((profession) => `<article>
    <header><i class="fa-solid fa-lock" aria-hidden="true"></i>
      <strong>${escapeHtml(english ? profession.englishName : profession.name)}</strong></header>
    <p>${escapeHtml(english ? profession.requirements.en : profession.requirements.pt)}</p>
  </article>`).join("");
  return `<details class="symbaroum-hud-advanced-profession-catalogue">
    <summary><i class="fa-solid fa-ranking-star" aria-hidden="true"></i>
      <span>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Professions.Title")}</span></summary>
    <div class="symbaroum-hud-advanced-profession-introduction">
      <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Professions.Rules")}</p>
    </div>
    <div class="symbaroum-hud-advanced-profession-list">${entries}</div>
  </details>`;
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
  return hasCreationTrait(actor, "privileged", ["trait", "boon"])
    ? PRIVILEGED_STARTING_THALER
    : null;
}

function pariahStartingShilling(actor) {
  return hasCreationTrait(actor, "pariah", ["trait", "burden"])
    ? PARIAH_STARTING_SHILLING
    : null;
}

function hasCreationTrait(actor, traitId, itemTypes) {
  const state = actor?.getFlag?.(MODULE_ID, STATE_FLAG) ?? {};
  if (Array.isArray(state.raceTraits) && state.raceTraits.includes(traitId)) return true;
  const trait = coreRaceTrait(traitId);
  const aliases = new Set([
    trait?.id,
    trait?.name ? game.i18n.localize(trait.name) : "",
    ...(trait?.aliases ?? [])
  ].map(normalizeName).filter(Boolean));
  return actorItems(actor).some((item) => itemTypes.includes(item?.type)
    && aliases.has(normalizeName(item.system?.reference || item.name)));
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

// Livro Basico + Guia Avancado do Jogador, Tabela 1: Equipamento Inicial (p. 7).
// Each Ability can grant more than one item and may ask the player to choose the
// exact weapon. Keeping the table declarative makes the Portuguese translations,
// English references and future imported content resolve through the same path.
const CREATION_EQUIPMENT_RULES = Object.freeze({
  agilecombat: Object.freeze([
    Object.freeze({ grantId: "longbow", category: "named", itemAliases: ["arcolongo", "longbow"], weapon: true, quantity: 1 })
  ]),
  armoredmystic: Object.freeze([
    Object.freeze({ grantId: "armor", category: "medium-armor", armor: true, quantity: 1 })
  ]),
  arrowjab: Object.freeze([
    Object.freeze({ grantId: "ranged", category: "item-choice", choiceKind: "ranged", quantity: 1 })
  ]),
  axeartist: Object.freeze([
    Object.freeze({ grantId: "axe", category: "item-choice", choiceKind: "axe", quantity: 1 })
  ]),
  blacksmith: Object.freeze([
    Object.freeze({ grantId: "weapon", category: "item-choice", choiceKind: "common-weapon", quantity: 1 }),
    Object.freeze({ grantId: "armor", category: "medium-armor", armor: true, quantity: 1 })
  ]),
  daggerdance: Object.freeze([
    Object.freeze({ grantId: "stiletto", category: "named", itemAliases: ["estilete", "stiletto"], weapon: true, quantity: 1 })
  ]),
  flailer: Object.freeze([
    Object.freeze({ grantId: "flail", category: "item-choice", choiceKind: "flail", quantity: 1 })
  ]),
  hammerstep: Object.freeze([
    Object.freeze({ grantId: "hammer", category: "item-choice", choiceKind: "hammer", quantity: 1 })
  ]),
  manatarms: Object.freeze([
    Object.freeze({ grantId: "armor", category: "medium-armor", label: "MediumArmor", armor: true, quantity: 1 })
  ]),
  marksman: Object.freeze([
    Object.freeze({ category: "marksman-choice", label: "RangedWeapon", quantity: 1 })
  ]),
  polearmmastery: Object.freeze([
    Object.freeze({ grantId: "polearm", category: "item-choice", choiceKind: "spear-or-staff", quantity: 1 })
  ]),
  pyrotechnics: Object.freeze([
    Object.freeze({ grantId: "grenade", category: "named", itemAliases: ["granadaalquimica", "alchemicalgrenade"], weapon: true, quantity: 1 }),
    Object.freeze({ grantId: "flash-powder", category: "named", itemAliases: ["poluminoso", "flashpowder"], quantity: 1 })
  ]),
  rapidfire: Object.freeze([
    Object.freeze({ grantId: "ranged", category: "item-choice", choiceKind: "ranged", quantity: 1 })
  ]),
  sacredsword: Object.freeze([
    Object.freeze({ grantId: "sword", category: "item-choice", choiceKind: "fencing-sword", quantity: 1 }),
    Object.freeze({ grantId: "parrying-dagger", category: "named", itemAliases: ["adagadeaparar", "parryingdagger"], quantity: 1 })
  ]),
  shieldfighter: Object.freeze([
    Object.freeze({ category: "shield", label: "Shield", quantity: 1 })
  ]),
  staffcombat: Object.freeze([
    Object.freeze({ grantId: "long-weapon", category: "item-choice", choiceKind: "common-long", quantity: 1 })
  ]),
  staffmagic: Object.freeze([
    Object.freeze({ grantId: "rune-staff", category: "named", itemAliases: ["cajadorunico", "runestaff"], weapon: true, quantity: 1 })
  ]),
  steelthrow: Object.freeze([
    Object.freeze({ category: "thrown", label: "ThrownWeapon", quantity: 1 })
  ]),
  symbolism: Object.freeze([
    Object.freeze({ grantId: "protection-symbol", category: "named", itemAliases: ["simbolodeprotecao", "symbolofprotection"], quantity: 1 })
  ]),
  trollsinging: Object.freeze([
    Object.freeze({ grantId: "cuirass", category: "named", itemAliases: ["couracadeescaldo", "skaldscuirass"], armor: true, quantity: 1 })
  ]),
  twinattack: Object.freeze([
    Object.freeze({ category: "sword", label: "Sword", quantity: 1 })
  ]),
  twohandedforce: Object.freeze([
    Object.freeze({ category: "heavy", label: "TwoHandedWeapon", quantity: 1 })
  ]),
  witchhammer: Object.freeze([
    Object.freeze({ category: "one-handed", label: "OneHandedWeapon", quantity: 1 })
  ])
});

const CREATION_EQUIPMENT_ABILITY_ALIASES = Object.freeze({
  agilecombat: ["combateagil", "agilecombat"],
  armoredmystic: ["misticoblindado", "armoredmystic"],
  arrowjab: ["golpecomflecha", "arrowjab"],
  axeartist: ["artistadomachado", "axeartist"],
  blacksmith: ["ferreiro", "blacksmith"],
  daggerdance: ["dancadaadaga", "daggerdance"],
  flailer: ["mangualeiro", "flailer"],
  hammerstep: ["passodomartelo", "ritmodomartelo", "hammerstep", "hammerrhythm"],
  manatarms: ["homemdearmas", "manatarms"],
  marksman: ["atirador", "marksman"],
  polearmmastery: ["maestriaemarmasdehaste", "polearmmastery"],
  pyrotechnics: ["pirotecnia", "pyrotechnics"],
  rapidfire: ["fogorapido", "tirorapido", "rapidfire", "fastfire"],
  sacredsword: ["espadasagrada", "espadaabencoada", "sacredsword", "swordsaint"],
  shieldfighter: ["combatentedeescudo", "shieldfighter"],
  staffcombat: ["lutadecajado", "staffcombat"],
  staffmagic: ["magiadocajado", "staffmagic"],
  steelthrow: ["arremessaraco", "steelthrow"],
  symbolism: ["simbolismo", "symbolism"],
  trollsinging: ["cantodotroll", "trollsinging"],
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
  spear: Object.freeze(["lanca", "spear"]),
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
    const rules = CREATION_EQUIPMENT_RULES[ability];
    if (!rules) continue;
    const adeptTwinAttack = ability === "twinattack"
      && Boolean(item?.system?.adept?.isActive || item?.system?.master?.isActive);
    for (const rule of rules) {
      grants.push({
        ...rule,
        source: "ability",
        ability,
        abilityName: item.name,
        quantity: adeptTwinAttack ? 2 : rule.quantity
      });
    }
  }
  // The basic weapon combination is replaced only by an Ability that actually
  // grants a weapon. Armor, shields and utility items do not satisfy that rule.
  // Treating any grant as a weapon used to skip the choice screen and leave the
  // final confirmation disabled for characters such as Homem-de-Armas.
  const hasAbilityWeapon = grants.some(isWeaponEquipmentGrant);
  const hasAbilityArmor = grants.some((grant) => grant.armor || isArmorEquipmentCategory(grant.category));
  return [
    ...grants,
    ...(!hasAbilityWeapon ? [{
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

function isWeaponEquipmentGrant(grant) {
  if (grant?.weapon === true) return true;
  return [
    "marksman-choice",
    "item-choice",
    "sword",
    "one-handed",
    "heavy",
    "long",
    "short",
    "ranged",
    "thrown"
  ].includes(grant?.category);
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
  // A reference such as "1handed" describes a category, not a document identity.
  // Using it first collapsed different grants (for example an Estoc and a Hammer)
  // into a single item. Names keep distinct official pieces while still preventing
  // the same world item from being granted twice.
  return `${item?.type ?? ""}:${normalizeName(item?.name || item?.system?.reference)}`;
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

function findNamedEquipment(equipment, aliases = []) {
  const identities = new Set(aliases.map(normalizeName).filter(Boolean));
  if (!identities.size) return null;
  return equipment.find((item) => identities.has(normalizeName(item?.name)))
    ?? equipment.find((item) => identities.has(normalizeName(item?.system?.reference)))
    ?? null;
}

function findEquipmentForGrant(equipment, grant) {
  if (grant?.itemAliases?.length) return findNamedEquipment(equipment, grant.itemAliases);
  return findGenericEquipment(equipment, grant?.category);
}

function equipmentChoiceCandidates(equipment, grant) {
  const unique = new Map();
  const add = (item) => {
    if (item?.id && !unique.has(item.id)) unique.set(item.id, item);
  };
  const nameOf = (item) => normalizeName(item?.name);
  const referenceOf = (item) => normalizeName(item?.system?.reference);
  const weapon = (item) => item?.type === "weapon";
  const namedLike = (item, aliases) => aliases.some((alias) => {
    const normalized = normalizeName(alias);
    return nameOf(item) === normalized || nameOf(item).includes(normalized);
  });

  switch (grant?.choiceKind) {
    case "axe":
      equipment.filter((item) => weapon(item)
        && ["1handed", "heavy"].includes(referenceOf(item))
        && namedLike(item, ["machado", "axe"])).forEach(add);
      break;
    case "fencing-sword":
      [
        findNamedEquipment(equipment, ["espadadeduelo", "espadadeesgrimaambriana", "fencingsword", "ambrianfencingsword"]),
        findNamedEquipment(equipment, ["estoc"])
      ].forEach(add);
      break;
    case "common-weapon":
      ["one-handed", "heavy", "long", "short", "ranged", "thrown"]
        .map((category) => findGenericEquipment(equipment, category)).forEach(add);
      ["sword", "dagger", "staff"].map((configured) => findConfiguredStartingItem(equipment, configured)).forEach(add);
      break;
    case "common-long":
      add(findGenericEquipment(equipment, "long"));
      ["staff", "spear"].map((configured) => findConfiguredStartingItem(equipment, configured)).forEach(add);
      break;
    case "spear-or-staff":
      ["spear", "staff"].map((configured) => findConfiguredStartingItem(equipment, configured)).forEach(add);
      break;
    case "ranged":
      equipment.filter((item) => weapon(item) && (
        ["ranged", "bow", "crossbow"].includes(referenceOf(item))
        || namedLike(item, ["arco", "besta", "bow", "crossbow"])
      )).forEach(add);
      break;
    case "flail":
      equipment.filter((item) => weapon(item) && namedLike(item, ["mangual", "flail"])).forEach(add);
      break;
    case "hammer":
      equipment.filter((item) => weapon(item)
        && ["1handed", "heavy"].includes(referenceOf(item))
        && namedLike(item, ["martelo", "hammer"])).forEach(add);
      break;
    default:
      break;
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(
    right.name, game.i18n?.lang ?? "pt-BR", { sensitivity: "base" }
  ));
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

function equipmentSelectionsFromForm(form, grants, equipment) {
  const selections = [];
  for (const grant of grants) {
    if (grant.category === "marksman-choice") {
      const choice = formValue(form, equipmentGrantField(grant, 0));
      const resolved = resolveMarksmanEquipment(equipment, choice);
      if (!resolved) {
        ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.MarksmanRequired"));
        return null;
      }
      selections.push(...resolved.items.map(({ item, quantity }) => ({
        grant, item, quantity, combination: resolved.choice
      })));
      continue;
    }
    if (grant.category === "starting-combination") {
      const combinationId = formValue(form, equipmentGrantField(grant, 0));
      const resolved = resolveStartingCombination(equipment, combinationId);
      if (!resolved) {
        ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.Required"));
        return null;
      }
      selections.push(...resolved.items.map(({ item, quantity = 1 }) => ({
        grant, item, quantity, combination: resolved.id
      })));
      continue;
    }
    if (grant.category === "item-choice") {
      const itemId = formValue(form, equipmentGrantField(grant, 0));
      const item = equipmentChoiceCandidates(equipment, grant).find((candidate) => candidate.id === itemId);
      if (!item) {
        ui.notifications?.warn(game.i18n.format(
          "SYMBAROUMHUD.CharacterCreator.Equipment.AbilityChoiceRequired",
          { ability: grant.abilityName }
        ));
        return null;
      }
      selections.push({ grant, item, quantity: grant.quantity, combination: item.id });
      continue;
    }
    const item = findEquipmentForGrant(equipment, grant);
    if (!item) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.NoMatchingItems"));
      return null;
    }
    selections.push({ grant, item, quantity: grant.quantity });
  }
  return selections;
}

function equipmentShopCartFromForm(form, equipment) {
  let lines;
  try {
    lines = JSON.parse(formValue(form, "equipmentShopCart") || "[]");
  } catch (_error) {
    lines = null;
  }
  if (!Array.isArray(lines)) {
    ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Failed"));
    return null;
  }
  const purchases = [];
  for (const line of lines) {
    const source = equipment.find((item) => item.id === line.itemId);
    const quantity = Number(line.quantity);
    const price = selectShopPrice(parseShopPrice(source?.system?.cost), line.amount);
    if (!source || !price || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Failed"));
      return null;
    }
    purchases.push({ source, amount: price.amount, quantity });
  }
  return purchases;
}

function missingCreationEquipmentSelections(actor, selections) {
  const existing = new Set(actorItems(actor).map(equipmentIdentity));
  return selections.filter(({ source }) => {
    const identity = equipmentIdentity(source);
    if (existing.has(identity)) return false;
    existing.add(identity);
    return true;
  });
}

function notifyEquipmentShopFailure(reason) {
  const key = {
    permission: "SYMBAROUMHUD.CompendiumBrowser.Shop.NoPermission",
    unavailable: "SYMBAROUMHUD.CompendiumBrowser.Shop.Unavailable",
    invalidPrice: "SYMBAROUMHUD.CompendiumBrowser.Shop.InvalidPrice",
    invalidQuantity: "SYMBAROUMHUD.CompendiumBrowser.Shop.InvalidQuantity",
    insufficient: "SYMBAROUMHUD.CompendiumBrowser.Shop.Insufficient",
    failed: "SYMBAROUMHUD.CompendiumBrowser.Shop.Failed"
  }[reason] ?? "SYMBAROUMHUD.CompendiumBrowser.Shop.Failed";
  ui.notifications?.warn(game.i18n.localize(key));
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

function equipmentGrantReason(grant) {
  if (grant?.source === "ability") {
    return game.i18n.format("SYMBAROUMHUD.CharacterCreator.Equipment.AbilityGrantReason", {
      ability: grant.abilityName
    });
  }
  if (grant?.category === "light-armor") {
    return game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.LightArmorGrantReason");
  }
  return game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.BasicGrantReason");
}

function equipmentShopMoneyLabel(value) {
  const money = moneyFromOrtegs(value);
  const parts = [];
  if (money.thaler) parts.push(`${money.thaler} ${game.i18n.localize("MONEY.THALER")}`);
  if (money.shilling) parts.push(`${money.shilling} ${game.i18n.localize("MONEY.SHILLING")}`);
  if (money.orteg || !parts.length) parts.push(`${money.orteg} ${game.i18n.localize("MONEY.ORTEG")}`);
  return parts.join(" · ");
}

function equipmentShopItemPayload(item, quantity = 1, reason = "", free = false) {
  return {
    itemId: item?.id ?? "",
    uuid: item?.uuid ?? `Item.${item?.id ?? ""}`,
    name: item?.name ?? "",
    img: item?.img || "icons/svg/item-bag.svg",
    quantity,
    reason,
    free
  };
}

function equipmentShopFreeLineContent(line) {
  if (!line?.itemId) return "";
  return `<article class="symbaroum-hud-shop-cart-item symbaroum-hud-creator-shop-grant" data-free-item="${escapeHtml(line.itemId)}">
    <img src="${escapeHtml(line.img)}" alt="">
    <span class="symbaroum-hud-shop-cart-item-name">
      <strong>${escapeHtml(line.name)}</strong>
      <small>${line.quantity > 1 ? `×${line.quantity}` : localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.Automatic")}</small>
    </span>
    <span class="symbaroum-hud-creator-shop-free-price" data-tooltip="${escapeHtml(line.reason)}">
      <strong>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.Free")}</strong>
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
    </span>
  </article>`;
}

function equipmentShopEntryContent(item, originIndex) {
  const price = parseShopPrice(item?.system?.cost);
  if (!price) return "";
  const sourceId = "world:Item";
  const origin = resolveContentOrigin(item, { index: originIndex, sourceId });
  const originLabel = game.i18n.localize(contentOriginDefinition(origin).label);
  const category = resolveItemTaxonomy(item).primary;
  const categoryLabel = game.i18n.localize(`SYMBAROUMHUD.ItemTaxonomy.Categories.${category}`);
  return `<li data-equipment-shop-entry data-item-id="${escapeHtml(item.id)}"
    data-item-name="${escapeHtml(item.name)}" data-item-type="${escapeHtml(item.type)}"
    data-item-origin="${escapeHtml(origin)}" data-item-price="${escapeHtml(price.raw)}">
    <button type="button" class="symbaroum-hud-browser-entry-main" data-open-equipment-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}">
      <img src="${escapeHtml(item.img || "icons/svg/item-bag.svg")}" alt="">
      <span class="symbaroum-hud-browser-entry-details"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(categoryLabel)}</small></span>
      <span class="symbaroum-hud-browser-entry-source">
        <span class="symbaroum-hud-browser-entry-source-label">${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.WorldItems")}</span>
        <em class="symbaroum-hud-browser-entry-origin" data-origin="${escapeHtml(origin)}"><i class="fa-solid fa-bookmark" aria-hidden="true"></i>${escapeHtml(originLabel)}</em>
      </span>
    </button>
    <span class="symbaroum-hud-browser-entry-controls">
      <button type="button" class="symbaroum-hud-shop-buy" data-equipment-shop-add="${escapeHtml(item.id)}"
        aria-label="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.AddToCart")} ${escapeHtml(item.name)} — ${escapeHtml(price.raw)}">
        <span>${escapeHtml(price.raw)}</span><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
        <em data-equipment-shop-badge hidden></em>
      </button>
    </span>
  </li>`;
}

function equipmentShopChoiceContent({
  marksmanGrant, marksmanChoices, abilityChoices, combinationGrant, combinations, savedCombination
}) {
  const sections = [];
  if (marksmanGrant) {
    sections.push(`<section class="symbaroum-hud-creator-shop-choice" role="radiogroup" aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.MarksmanChoice")}">
      <h3><i class="fa-solid fa-gift" aria-hidden="true"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.MarksmanChoice")}</h3>
      <div>${marksmanChoices.map(({ choice, item, resolved }) => {
        const extra = resolved?.items?.map(({ item: resolvedItem, quantity }) => equipmentShopItemPayload(
          resolvedItem, quantity, equipmentGrantReason(marksmanGrant), true
        )) ?? [];
        return `<label data-available="${Boolean(resolved)}">
          <input type="radio" name="${equipmentGrantField(marksmanGrant, 0)}" value="${choice}" data-equipment-grant
            data-free-cart='${escapeHtml(JSON.stringify(extra))}'${savedCombination("marksman-choice") === choice ? " checked" : ""}${resolved ? "" : " disabled"}>
          <span></span><img src="${escapeHtml(item?.img || "icons/svg/item-bag.svg")}" alt="">
          <strong>${escapeHtml(item?.name || game.i18n.localize(`SYMBAROUMHUD.CharacterCreator.Equipment.${choice === "crossbow" ? "Crossbow" : "Bow"}`))}</strong>
        </label>`;
      }).join("")}</div>
    </section>`);
  }
  for (const { grant, candidates } of abilityChoices) {
    const choiceLead = formatEscaped(
        "SYMBAROUMHUD.CharacterCreator.Equipment.AbilityChoiceLead", { ability: grant.abilityName }
      );
    sections.push(`<section class="symbaroum-hud-creator-shop-choice" role="radiogroup" aria-label="${choiceLead}" data-ability-equipment-choice="${escapeHtml(grant.ability)}">
      <h3><i class="fa-solid fa-gift" aria-hidden="true"></i>${choiceLead}</h3>
      <div>${candidates.map((item) => {
        const extra = [equipmentShopItemPayload(item, grant.quantity, equipmentGrantReason(grant), true)];
        return `<label data-available="true">
          <input type="radio" name="${equipmentGrantField(grant, 0)}" value="${escapeHtml(item.id)}" data-equipment-grant
            data-free-cart='${escapeHtml(JSON.stringify(extra))}'${savedCombination(grant) === item.id ? " checked" : ""}>
          <span></span><img src="${escapeHtml(item.img || "icons/svg/item-bag.svg")}" alt="">
          <strong>${escapeHtml(item.name)}</strong>
        </label>`;
      }).join("") || `<p class="symbaroum-hud-equipment-unavailable">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.NoMatchingItems")}</p>`}</div>
    </section>`);
  }
  if (combinationGrant) {
    sections.push(`<section class="symbaroum-hud-creator-shop-choice" role="radiogroup" aria-label="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.NoAbilityGrantLead")}">
      <h3><i class="fa-solid fa-gift" aria-hidden="true"></i>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.NoAbilityGrantLead")}</h3>
      <div>${combinations.map(({ combination, resolved }) => {
        const extra = resolved?.items?.map(({ item, quantity = 1 }) => equipmentShopItemPayload(
          item, quantity, equipmentGrantReason(combinationGrant), true
        )) ?? [];
        return `<label data-available="${Boolean(resolved)}">
          <input type="radio" name="${equipmentGrantField(combinationGrant, 0)}" value="${combination.id}" data-equipment-grant
            data-free-cart='${escapeHtml(JSON.stringify(extra))}'${savedCombination("starting-combination") === combination.id ? " checked" : ""}${resolved ? "" : " disabled"}>
          <span></span><strong>${localizeEscaped(`SYMBAROUMHUD.CharacterCreator.Equipment.${combination.label}`)}</strong>
        </label>`;
      }).join("")}</div>
    </section>`);
  }
  return sections.join("");
}

function equipmentBookContent(actor, grants, equipment, campingEquipment) {
  const creatorState = creatorStepViewState(actor, "equipment");
  const savedEquipment = Array.isArray(creatorState.equipment) ? creatorState.equipment : [];
  const savedCombination = (grantOrCategory) => {
    if (typeof grantOrCategory === "string") {
      return savedEquipment.find((entry) => entry.category === grantOrCategory)?.combination ?? "";
    }
    return savedEquipment.find((entry) => entry.ability === grantOrCategory?.ability
      && entry.grantId === grantOrCategory?.grantId)?.combination
      ?? savedEquipment.find((entry) => entry.ability === grantOrCategory?.ability
        && entry.category === grantOrCategory?.category)?.combination
      ?? "";
  };
  const experience = creationExperienceTotal(actor);
  const baseThaler = startingThalerForExperience(experience);
  const privilegedThaler = privilegedStartingThaler(actor);
  const pariahShilling = pariahStartingShilling(actor);
  const initialMoneyOrtegs = pariahShilling !== null
    ? pariahShilling * 10
    : (privilegedThaler ?? baseThaler) * 100;
  const alreadyCompleted = hasCompletedCreatorStep(actor, "equipment");
  const startingBalance = alreadyCompleted ? moneyToOrtegs(actor.system?.money ?? {}) : initialMoneyOrtegs;
  const balance = moneyFromOrtegs(startingBalance);
  const alreadyHasCamp = actorItems(actor).some(isCampingEquipment);
  const campItem = alreadyHasCamp ? actorItems(actor).find(isCampingEquipment) : campingEquipment;
  const abilityGrants = grants.filter((grant) => grant.source === "ability");
  const combinationGrant = grants.find((grant) => grant.category === "starting-combination");
  const lightArmorGrant = grants.find((grant) => grant.category === "light-armor" && grant.source === "basic");
  const lightArmor = lightArmorGrant ? findGenericEquipment(equipment, "light-armor") : null;
  const itemChoiceGrants = abilityGrants.filter((grant) => grant.category === "item-choice");
  const abilityItems = abilityGrants
    .filter((grant) => !["marksman-choice", "item-choice"].includes(grant.category))
    .map((grant) => ({ grant, item: findEquipmentForGrant(equipment, grant) }));
  const abilityChoices = itemChoiceGrants.map((grant) => ({
    grant,
    candidates: equipmentChoiceCandidates(equipment, grant)
  }));
  const marksmanGrant = abilityGrants.find((grant) => grant.category === "marksman-choice");
  const marksmanChoices = marksmanGrant ? ["crossbow", "bow"].map((choice) => ({
    choice,
    item: findMarksmanWeapon(equipment, choice),
    resolved: resolveMarksmanEquipment(equipment, choice)
  })) : [];
  const combinations = combinationGrant ? STARTING_EQUIPMENT_COMBINATIONS.map((combination) => ({
    combination,
    resolved: resolveStartingCombination(equipment, combination.id)
  })) : [];
  const fixedFreeItems = [
    ...abilityItems.filter(({ item }) => Boolean(item)).map(({ grant, item }) => equipmentShopItemPayload(
      item, grant.quantity, equipmentGrantReason(grant), true
    )),
    ...(lightArmor ? [equipmentShopItemPayload(lightArmor, 1, equipmentGrantReason(lightArmorGrant), true)] : []),
    ...(campItem ? [equipmentShopItemPayload(
      campItem, 1, game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Equipment.CampingGrantReason"), true
    )] : [])
  ];
  const shopItems = equipment.filter((item) => Boolean(parseShopPrice(item?.system?.cost)));
  characterCreatorOriginIndex ??= staticContentOriginIndex();
  const origins = new Map();
  for (const item of shopItems) {
    const origin = resolveContentOrigin(item, { index: characterCreatorOriginIndex, sourceId: "world:Item" });
    origins.set(origin, game.i18n.localize(contentOriginDefinition(origin).label));
  }
  const savedCart = Array.isArray(creatorState.equipmentShopCart)
    ? creatorState.equipmentShopCart.filter((line) => shopItems.some((item) => item.id === line.itemId))
    : [];
  const choices = equipmentShopChoiceContent({
    marksmanGrant, marksmanChoices, abilityChoices, combinationGrant, combinations, savedCombination
  });
  const automaticReady = Boolean(campItem)
    && abilityItems.every(({ item }) => Boolean(item))
    && abilityChoices.every(({ candidates }) => candidates.length > 0)
    && (!marksmanGrant || marksmanChoices.some(({ resolved }) => Boolean(resolved)))
    && (!lightArmorGrant || Boolean(lightArmor));

  return `<div class="symbaroum-hud-equipment-book symbaroum-hud-creator-shop-book"
      data-camping-ready="${Boolean(campItem)}" data-equipment-ready="${automaticReady}"
      data-starting-balance="${startingBalance}" data-fixed-free-cart='${escapeHtml(JSON.stringify(fixedFreeItems))}'>
    <header class="symbaroum-hud-creator-step-guide">
      ${creatorStepNumber(actor, "equipment", "SYMBAROUMHUD.CharacterCreator.Guide.EquipmentProgress")}
      <div><h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepSixTitle")}</h2>
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.StepSixText")}</p></div>
    </header>
    <input type="hidden" name="equipmentShopCart" value="${escapeHtml(JSON.stringify(savedCart))}" data-equipment-shop-cart>
    <section class="symbaroum-hud-equipment-choice-stage symbaroum-hud-initial-equipment-choice"
      data-equipment-choice-stage${choices ? "" : " hidden"}>
      <header><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><div>
        <h2>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.InitialChoiceTitle")}</h2>
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ChoiceStageText")}</p>
      </div></header>
      <div class="symbaroum-hud-equipment-choice-stage-options">${choices}</div>
      <footer><button type="button" data-equipment-choice-continue>
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ContinueToShop")}
      </button></footer>
    </section>
    <div class="symbaroum-hud-browser-shell symbaroum-hud-creator-equipment-shop" data-browser-mode="shop"
      data-equipment-shop-stage${choices ? " hidden" : ""}>
      <header class="symbaroum-hud-browser-heading">
        <div><i class="fa-solid fa-shop" aria-hidden="true"></i><span>
          <strong>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.Title")}</strong>
          <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ShopSubtitle")}</small>
        </span></div>
        <span class="symbaroum-hud-browser-heading-actions symbaroum-hud-equipment-shop-heading-actions">
          ${choices ? `<button type="button" data-equipment-choice-review title="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ReviewInitialChoices")}">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>` : ""}
          <button type="button" data-equipment-rules-toggle title="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.ShowRules")}">
            <i class="fa-solid fa-book-open" aria-hidden="true"></i>
          </button>
        </span>
      </header>
      <nav class="symbaroum-hud-browser-tabs" aria-label="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.CategoriesLabel")}">
        ${[
          ["all", "fa-book-open", "All"], ["weapon", "fa-sword", "Weapons"],
          ["armor", "fa-shield-halved", "Armors"], ["equipment", "fa-backpack", "Equipment"]
        ].map(([id, icon, label], index) => `<button type="button" data-equipment-shop-category="${id}" data-active="${index === 0}" aria-pressed="${index === 0}"
          title="${localizeEscaped(`SYMBAROUMHUD.CompendiumBrowser.Categories.${label}`)}"><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`).join("")}
      </nav>
      <aside class="symbaroum-hud-browser-sidebar">
        <div class="symbaroum-hud-browser-filter-toolbar">
          <label class="symbaroum-hud-browser-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input type="search" data-equipment-shop-search placeholder="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Search")}">
            <button type="button" data-equipment-shop-clear hidden aria-label="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.ClearSearch")}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
          </label>
          <button type="button" class="symbaroum-hud-browser-filter-toggle" data-equipment-shop-filter-toggle
            title="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Filters")}"><i class="fa-solid fa-filter" aria-hidden="true"></i></button>
        </div>
        <section class="symbaroum-hud-shop-balance">
          <header><h2><i class="fa-solid fa-coins" aria-hidden="true"></i>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.Balance")}</h2></header>
          <div>
            <span><strong data-equipment-balance-thaler>${balance.thaler}</strong><small>${localizeEscaped("MONEY.THALER")}</small></span>
            <span><strong data-equipment-balance-shilling>${balance.shilling}</strong><small>${localizeEscaped("MONEY.SHILLING")}</small></span>
            <span><strong data-equipment-balance-orteg>${balance.orteg}</strong><small>${localizeEscaped("MONEY.ORTEG")}</small></span>
          </div>
          ${pariahShilling !== null ? `<p class="symbaroum-hud-equipment-pariah-money"><i class="fa-solid fa-person-circle-xmark" aria-hidden="true"></i>${formatEscaped(
            "SYMBAROUMHUD.CharacterCreator.Equipment.PariahStartingMoney", { total: pariahShilling }
          )}</p>` : privilegedThaler !== null ? `<p class="symbaroum-hud-equipment-privileged-money"><i class="fa-solid fa-crown" aria-hidden="true"></i>${formatEscaped(
            "SYMBAROUMHUD.CharacterCreator.Equipment.PrivilegedStartingMoney", { total: privilegedThaler }
          )}</p>` : ""}
        </section>
        <section class="symbaroum-hud-shop-cart">
          <header><h2><i class="fa-solid fa-basket-shopping" aria-hidden="true"></i>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.CartTitle")}<small data-equipment-cart-count>0</small></h2>
            <button type="button" data-equipment-cart-clear title="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.CartClear")}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
          </header>
          <div class="symbaroum-hud-shop-cart-items" data-equipment-cart-items></div>
          <footer><div><span>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.CartTotal")}</span><strong data-equipment-cart-total>${equipmentShopMoneyLabel(0)}</strong>
            <small data-equipment-cart-remaining></small></div></footer>
        </section>
        <div class="symbaroum-hud-browser-filter-popover" data-equipment-shop-filter-panel hidden>
          <section class="symbaroum-hud-browser-origin-filter"><header><h2>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Origin")}</h2></header><div>
            ${[...origins].sort((a, b) => a[1].localeCompare(b[1], game.i18n.lang)).map(([id, label]) => `<label><input type="checkbox" data-equipment-shop-origin value="${escapeHtml(id)}" checked><span>${escapeHtml(label)}</span></label>`).join("")}
          </div></section>
        </div>
      </aside>
      <main class="symbaroum-hud-browser-results symbaroum-hud-creator-shop-results">
        <header><h2>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.AvailableItems")}</h2><span><b data-equipment-result-count>${shopItems.length}</b> ${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Found")}</span></header>
        <div class="symbaroum-hud-creator-shop-options">
          <section class="symbaroum-hud-creator-shop-rules" hidden>
            <h3>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.BookLabel")}</h3>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.OfficialIntroductionBeforeCamp")}${campItem ? escapeHtml(campItem.name) : localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.CampingMissing")}${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.OfficialIntroductionAfterCamp")}</p>
            <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Equipment.StartingRulesArmor")}</p>
          </section>
        </div>
        <ol>${shopItems.map((item) => equipmentShopEntryContent(item, characterCreatorOriginIndex)).join("")}
          <li class="symbaroum-hud-browser-empty" data-equipment-shop-empty hidden><i class="fa-solid fa-store-slash" aria-hidden="true"></i><strong>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.Empty")}</strong></li>
        </ol>
      </main>
    </div>
  </div>`;
}

function bindEquipmentBook(element, actor) {
  const book = element.querySelector("[data-camping-ready]");
  const choices = Array.from(element.querySelectorAll("[data-equipment-grant]"));
  const groups = [...new Set(choices.map((choice) => choice.name))];
  const confirm = element.querySelector('[data-action="choose-equipment"]');
  const formFooter = confirm?.closest(".form-footer");
  const choiceStage = element.querySelector("[data-equipment-choice-stage]");
  const shopStage = element.querySelector("[data-equipment-shop-stage]");
  const continueToShop = element.querySelector("[data-equipment-choice-continue]");
  const reviewChoices = element.querySelector("[data-equipment-choice-review]");
  const cartField = element.querySelector("[data-equipment-shop-cart]");
  const cartItems = element.querySelector("[data-equipment-cart-items]");
  const startingBalance = Number(book?.dataset.startingBalance) || 0;
  const parseJson = (value, fallback = []) => {
    try {
      const parsed = JSON.parse(value || "[]");
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_error) {
      return fallback;
    }
  };
  const fixedFree = parseJson(book?.dataset.fixedFreeCart);
  const paidCart = new Map(parseJson(cartField?.value).map((line) => [line.itemId, {
    itemId: line.itemId,
    amount: Number(line.amount),
    quantity: Math.max(1, Number(line.quantity) || 1)
  }]));
  let activeCategory = "all";
  let showingChoiceStage = groups.length > 0;

  const entryFor = (itemId) => element.querySelector(`[data-equipment-shop-entry][data-item-id="${globalThis.CSS?.escape?.(itemId) ?? itemId}"]`);
  // Older creator drafts may contain an incomplete ranged-price line created
  // when its price dialog was cancelled. Drop it before totals are calculated
  // so a defensive MAX_SAFE_INTEGER value can never leak into the visible cart.
  for (const [itemId, line] of paidCart) {
    const entry = entryFor(itemId);
    const selectedPrice = selectShopPrice(parseShopPrice(entry?.dataset.itemPrice), line.amount);
    if (!entry || !selectedPrice) paidCart.delete(itemId);
  }
  const selectedFree = () => choices.filter((choice) => choice.checked)
    .flatMap((choice) => parseJson(choice.dataset.freeCart));
  const paidTotal = () => [...paidCart.values()].reduce((total, line) => {
    const entry = entryFor(line.itemId);
    const parsed = parseShopPrice(entry?.dataset.itemPrice);
    const price = selectShopPrice(parsed, line.amount);
    return total + (price?.ortegs ?? Number.MAX_SAFE_INTEGER) * line.quantity;
  }, 0);
  const saveCart = () => {
    if (cartField) cartField.value = JSON.stringify([...paidCart.values()]);
  };
  const allChoicesSelected = () => groups.every((name) => choices.some(
    (choice) => choice.name === name && choice.checked
  ));
  const showStage = (stage) => {
    showingChoiceStage = stage === "choices" && groups.length > 0;
    if (choiceStage) choiceStage.hidden = !showingChoiceStage;
    if (shopStage) shopStage.hidden = showingChoiceStage;
    if (confirm) confirm.hidden = showingChoiceStage;
    if (formFooter) formFooter.hidden = showingChoiceStage;
  };
  const paidCartLineContent = (line) => {
    const entry = entryFor(line.itemId);
    const price = selectShopPrice(parseShopPrice(entry?.dataset.itemPrice), line.amount);
    if (!entry || !price) return "";
    const quantity = Math.max(1, Number(line.quantity) || 1);
    return `<article class="symbaroum-hud-shop-cart-item" data-paid-item="${escapeHtml(line.itemId)}">
      <img src="${escapeHtml(entry.querySelector("img")?.getAttribute("src") || "icons/svg/item-bag.svg")}" alt="">
      <span class="symbaroum-hud-shop-cart-item-name"><strong>${escapeHtml(entry.dataset.itemName)}</strong><small>${escapeHtml(price.raw)}</small></span>
      <span class="symbaroum-hud-shop-cart-quantity">
        <button type="button" data-equipment-cart-change="-1" data-item-id="${escapeHtml(line.itemId)}"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
        <strong>${quantity}</strong>
        <button type="button" data-equipment-cart-change="1" data-item-id="${escapeHtml(line.itemId)}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
      </span>
      <small class="symbaroum-hud-shop-cart-subtotal">${escapeHtml(equipmentShopMoneyLabel(price.ortegs * quantity))}</small>
      <button type="button" class="symbaroum-hud-shop-cart-remove" data-equipment-cart-remove="${escapeHtml(line.itemId)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </article>`;
  };

  const refresh = () => {
    const freeLines = [...fixedFree, ...selectedFree()];
    const paidLines = [...paidCart.values()];
    if (cartItems) cartItems.innerHTML = [
      ...freeLines.map(equipmentShopFreeLineContent),
      ...paidLines.map(paidCartLineContent)
    ].join("");
    const total = paidTotal();
    const remaining = Math.max(0, startingBalance - total);
    const money = moneyFromOrtegs(remaining);
    const count = [...freeLines, ...paidLines].reduce((sum, line) => sum + (Number(line.quantity) || 1), 0);
    const countNode = element.querySelector("[data-equipment-cart-count]");
    const totalNode = element.querySelector("[data-equipment-cart-total]");
    const remainingNode = element.querySelector("[data-equipment-cart-remaining]");
    if (countNode) countNode.textContent = String(count);
    if (totalNode) totalNode.textContent = equipmentShopMoneyLabel(total);
    if (remainingNode) remainingNode.textContent = `${game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.CartRemaining")}: ${equipmentShopMoneyLabel(remaining)}`;
    for (const [denomination, value] of Object.entries(money)) {
      const node = element.querySelector(`[data-equipment-balance-${denomination}]`);
      if (node) node.textContent = String(value);
    }
    const clear = element.querySelector("[data-equipment-cart-clear]");
    if (clear) clear.hidden = paidCart.size === 0;
    for (const entry of element.querySelectorAll("[data-equipment-shop-entry]")) {
      const line = paidCart.get(entry.dataset.itemId);
      const price = line
        ? selectShopPrice(parseShopPrice(entry.dataset.itemPrice), line.amount)
        : parseShopPrice(entry.dataset.itemPrice);
      const button = entry.querySelector("[data-equipment-shop-add]");
      const badge = entry.querySelector("[data-equipment-shop-badge]");
      const affordable = Boolean(price) && remaining >= price.ortegs;
      if (button) button.disabled = !affordable;
      if (badge) {
        badge.hidden = !line;
        badge.textContent = line ? String(line.quantity) : "";
      }
    }
    saveCart();
    const equipmentReady = book?.dataset.campingReady === "true"
      && book?.dataset.equipmentReady === "true"
      && allChoicesSelected();
    if (continueToShop) continueToShop.disabled = !equipmentReady;
    if (confirm) confirm.disabled = !equipmentReady || total > startingBalance;
  };
  continueToShop?.addEventListener("click", () => {
    if (continueToShop.disabled || !allChoicesSelected()) return;
    showStage("shop");
    refresh();
  });
  reviewChoices?.addEventListener("click", () => {
    showStage("choices");
    refresh();
  });
  for (const choice of choices) choice.addEventListener("change", refresh);
  for (const button of element.querySelectorAll("[data-open-equipment-item]")) button.addEventListener("click", () => {
    const item = actorItems(actor).find((candidate) => candidate.id === button.dataset.openEquipmentItem)
      ?? availableWorldItem(button.dataset.openEquipmentItem);
    if (!item) return;
    openCreationItemSheet(item);
  });
  for (const button of element.querySelectorAll("[data-equipment-shop-add]")) button.addEventListener("click", async () => {
    const entry = entryFor(button.dataset.equipmentShopAdd);
    const parsed = parseShopPrice(entry?.dataset.itemPrice);
    if (!entry || !parsed) return;
    const existing = paidCart.get(entry.dataset.itemId);
    let selected = existing ? selectShopPrice(parsed, existing.amount) : selectShopPrice(parsed);
    if (!selected && parsed.ranged) {
      const remaining = Math.max(0, startingBalance - paidTotal());
      const unitValue = parsed.ortegs / parsed.amount;
      const maximum = Math.min(parsed.maximumAmount, Math.floor(remaining / unitValue));
      const DialogV2 = dialogClass();
      selected = await DialogV2?.wait?.({
        classes: ["symbaroum-hud-shop-dialog"],
        window: { title: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.CartPriceTitle") },
        position: { width: 430 },
        content: `<form class="symbaroum-hud-shop-confirm"><img src="${escapeHtml(entry.querySelector("img")?.getAttribute("src") || "icons/svg/item-bag.svg")}" alt="">
          <p>${formatEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.CartPriceText", { item: entry.dataset.itemName, price: parsed.raw })}</p>
          <label class="symbaroum-hud-shop-price-choice"><span>${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.Shop.ChoosePrice")}</span>
            <span class="symbaroum-hud-shop-price-input"><input type="number" name="price" min="${parsed.amount}" max="${maximum}" value="${parsed.amount}" step="1" required></span></label></form>`,
        buttons: [{ action: "add", icon: "fa-solid fa-cart-shopping", default: true,
          label: game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.AddToCart"),
          callback: (_event, dialogButton) => selectShopPrice(parsed, formValue(dialogButton.form, "price")) },
        { action: "cancel", label: game.i18n.localize("Cancel"), callback: () => null }],
        rejectClose: false
      });
    }
    selected = normalizeEquipmentShopPriceSelection(parsed, selected);
    if (!selected) return;
    if (paidTotal() + selected.ortegs > startingBalance) {
      ui.notifications?.warn(game.i18n.localize("SYMBAROUMHUD.CompendiumBrowser.Shop.Insufficient"));
      return;
    }
    paidCart.set(entry.dataset.itemId, {
      itemId: entry.dataset.itemId,
      amount: selected.amount,
      quantity: (existing?.quantity ?? 0) + 1
    });
    refresh();
  });
  cartItems?.addEventListener("click", (event) => {
    const change = event.target.closest("[data-equipment-cart-change]");
    const remove = event.target.closest("[data-equipment-cart-remove]");
    if (remove) paidCart.delete(remove.dataset.equipmentCartRemove);
    else if (change) {
      const line = paidCart.get(change.dataset.itemId);
      if (!line) return;
      const quantity = line.quantity + Number(change.dataset.equipmentCartChange);
      if (quantity <= 0) paidCart.delete(line.itemId);
      else if (quantity <= 999) {
        const price = selectShopPrice(parseShopPrice(entryFor(line.itemId)?.dataset.itemPrice), line.amount);
        if (Number(change.dataset.equipmentCartChange) < 0 || paidTotal() + (price?.ortegs ?? Infinity) <= startingBalance) {
          paidCart.set(line.itemId, { ...line, quantity });
        }
      }
    } else return;
    refresh();
  });
  element.querySelector("[data-equipment-cart-clear]")?.addEventListener("click", () => {
    paidCart.clear();
    refresh();
  });

  const applyFilters = () => {
    const query = normalizeName(element.querySelector("[data-equipment-shop-search]")?.value);
    const enabledOrigins = new Set(Array.from(element.querySelectorAll("[data-equipment-shop-origin]:checked"), (input) => input.value));
    let visible = 0;
    for (const entry of element.querySelectorAll("[data-equipment-shop-entry]")) {
      const matches = (activeCategory === "all" || entry.dataset.itemType === activeCategory)
        && (!query || normalizeName(entry.dataset.itemName).includes(query))
        && enabledOrigins.has(entry.dataset.itemOrigin);
      entry.hidden = !matches;
      if (matches) visible += 1;
    }
    const count = element.querySelector("[data-equipment-result-count]");
    const empty = element.querySelector("[data-equipment-shop-empty]");
    if (count) count.textContent = String(visible);
    if (empty) empty.hidden = visible > 0;
  };
  const search = element.querySelector("[data-equipment-shop-search]");
  const clearSearch = element.querySelector("[data-equipment-shop-clear]");
  search?.addEventListener("input", () => {
    if (clearSearch) clearSearch.hidden = !search.value;
    applyFilters();
  });
  clearSearch?.addEventListener("click", () => {
    search.value = "";
    clearSearch.hidden = true;
    applyFilters();
    search.focus();
  });
  for (const tab of element.querySelectorAll("[data-equipment-shop-category]")) tab.addEventListener("click", () => {
    activeCategory = tab.dataset.equipmentShopCategory;
    for (const candidate of element.querySelectorAll("[data-equipment-shop-category]")) {
      const active = candidate === tab;
      candidate.dataset.active = String(active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    applyFilters();
  });
  for (const origin of element.querySelectorAll("[data-equipment-shop-origin]")) origin.addEventListener("change", applyFilters);
  element.querySelector("[data-equipment-shop-filter-toggle]")?.addEventListener("click", () => {
    const panel = element.querySelector("[data-equipment-shop-filter-panel]");
    if (panel) panel.hidden = !panel.hidden;
  });
  element.querySelector("[data-equipment-rules-toggle]")?.addEventListener("click", () => {
    const rules = element.querySelector(".symbaroum-hud-creator-shop-rules");
    if (rules) rules.hidden = !rules.hidden;
  });
  showStage(showingChoiceStage ? "choices" : "shop");
  refresh();
  applyFilters();
  globalThis.setTimeout(refresh, 0);
}

export function normalizeEquipmentShopPriceSelection(price, selection) {
  if (!price || !selection || typeof selection !== "object") return null;
  return selectShopPrice(price, selection.amount);
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
      <header class="symbaroum-hud-personality-contacts-header">
        <h2><i class="fa-solid fa-address-book" aria-hidden="true"></i>
          ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.WhoAreThey")}</h2>
        <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Contacts.QuickHint")}</p>
      </header>
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
  return renderEmbeddedItemSheet(ability);
}

async function mysticalPowerChoiceContent(ability, mysticalPowers, costs, originIndex, sourceId, {
  enforceProfessionRules = true,
  occupationRecommendation = null
} = {}) {
  if (!mysticalPowers.length) {
    return `<p class="symbaroum-hud-ability-special-empty">${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoMysticalPowers")}</p>`;
  }
  const recommendationOrder = occupationChoiceRecommendationOrder(occupationRecommendation?.mysticalPowers);
  const orderedPowers = orderOccupationRecommendedChoices(mysticalPowers, recommendationOrder);
  const cards = await Promise.all(orderedPowers.map(async (power, choiceOrder) => {
    const origin = resolveContentOrigin(power, { index: originIndex, sourceId });
    const identities = choiceIdentities(power);
    const occupationRecommended = occupationChoiceRecommendationIndex(power, recommendationOrder) < Number.MAX_SAFE_INTEGER;
    const professionRules = enforceProfessionRules ? professionExclusiveItemRules(power) : [];
    const professionNames = professionRules.map((rule) => rule.name).join(", ");
    return `
      <article class="symbaroum-hud-ability-special-card" data-mystical-power-choice="${escapeHtml(power.id)}"
        data-creation-choice-origin="${escapeHtml(origin)}" data-creation-choice-source="${escapeHtml(sourceId)}"
        data-creation-choice-identities="${escapeHtml(identities.join(" "))}"
        data-mystical-power-search-value="${escapeHtml(normalizeName(`${power.name} ${power.system?.reference ?? ""}`))}"
        data-choice-default-order="${choiceOrder}" data-tradition-recommended="false"
        data-occupation-choice-recommended="${occupationRecommended}"
        ${professionRules.length ? `data-profession-restricted-choice="${escapeHtml(professionRules.map((rule) => rule.id).join(" "))}"` : ""}>
        <header>
          <img src="${escapeHtml(power.img || "icons/svg/daze.svg")}" alt="">
          <div><button type="button" class="symbaroum-hud-ability-special-open"
            data-open-creation-item="${escapeHtml(power.id)}"
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.OpenMysticalPower", { name: power.name })}">
            <h4>${escapeHtml(power.name)}</h4>
          </button>
          ${power.system?.reference ? `<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Reference")}: ${escapeHtml(power.system.reference)}</small>` : ""}
          ${occupationRecommended ? `<small class="symbaroum-hud-tradition-recommendation" data-occupation-choice-recommendation>
            <i class="fa-solid fa-compass" aria-hidden="true"></i><span>${escapeHtml(occupationRecommendation.name)}</span>
          </small>` : ""}
          <small class="symbaroum-hud-tradition-recommendation" data-tradition-choice-recommendation hidden>
            <i class="fa-solid fa-hat-wizard" aria-hidden="true"></i><span></span>
          </small>
          ${professionRules.length ? `<small class="symbaroum-hud-advanced-rule-tag" data-locked="true">
            <i class="fa-solid fa-lock" aria-hidden="true"></i>${escapeHtml(professionNames)}</small>` : ""}</div>
        </header>
        <div class="symbaroum-hud-ability-special-ranks">
          ${["novice", "adept", "master"].map((rank) => `
            <button type="button" data-select-ability="${escapeHtml(ability.id)}"
              data-choice-type="mysticalPower" data-choice-id="${escapeHtml(power.id)}" data-rank="${rank}"
              ${professionRules.length ? `data-profession-restricted="${escapeHtml(professionRules.map((rule) => rule.id).join(" "))}"` : ""}>
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
      <label class="symbaroum-hud-ability-special-search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input type="search" data-mystical-power-search
          placeholder="${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.SearchMysticalPowers")}">
        <button type="button" data-clear-mystical-power-search
          aria-label="${localizeEscaped("SYMBAROUMHUD.CompendiumBrowser.ClearSearch")}">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </label>
      <div class="symbaroum-hud-ability-special-list">${cards.join("")}</div>
      <p class="symbaroum-hud-ability-special-empty" data-mystical-power-filter-empty hidden>
        ${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.NoFilteredMysticalPowers")}
      </p>
    </section>`;
}

async function ritualChoiceContent(ability, rituals, originIndex, sourceId, {
  enforceProfessionRules = true,
  occupationRecommendation = null
} = {}) {
  const recommendationOrder = occupationChoiceRecommendationOrder(occupationRecommendation?.rituals);
  const orderedRituals = orderOccupationRecommendedChoices(rituals, recommendationOrder);
  const cards = orderedRituals.map((ritual, choiceOrder) => {
    const origin = resolveContentOrigin(ritual, { index: originIndex, sourceId });
    const identities = choiceIdentities(ritual);
    const occupationRecommended = occupationChoiceRecommendationIndex(ritual, recommendationOrder) < Number.MAX_SAFE_INTEGER;
    const professionRules = enforceProfessionRules ? professionExclusiveItemRules(ritual) : [];
    const professionNames = professionRules.map((rule) => rule.name).join(", ");
    return `
      <article class="symbaroum-hud-ability-special-card symbaroum-hud-ritual-choice-card"
        data-ritual-choice="${escapeHtml(ritual.id)}"
        data-creation-choice-origin="${escapeHtml(origin)}" data-creation-choice-source="${escapeHtml(sourceId)}"
        data-creation-choice-identities="${escapeHtml(identities.join(" "))}"
        data-choice-default-order="${choiceOrder}" data-tradition-recommended="false"
        data-occupation-choice-recommended="${occupationRecommended}"
        ${professionRules.length ? `data-profession-restricted-choice="${escapeHtml(professionRules.map((rule) => rule.id).join(" "))}"` : ""}>
        <header>
          <img src="${escapeHtml(ritual.img || "icons/svg/book.svg")}" alt="">
          <div><button type="button" class="symbaroum-hud-ability-special-open"
            data-open-creation-item="${escapeHtml(ritual.id)}"
            title="${formatEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.OpenRitual", { name: ritual.name })}">
            <h4>${escapeHtml(ritual.name)}</h4>
          </button>
          ${ritual.system?.reference ? `<small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Abilities.Reference")}: ${escapeHtml(ritual.system.reference)}</small>` : ""}
          ${occupationRecommended ? `<small class="symbaroum-hud-tradition-recommendation" data-occupation-choice-recommendation>
            <i class="fa-solid fa-compass" aria-hidden="true"></i><span>${escapeHtml(occupationRecommendation.name)}</span>
          </small>` : ""}
          <small class="symbaroum-hud-tradition-recommendation" data-tradition-choice-recommendation hidden>
            <i class="fa-solid fa-hat-wizard" aria-hidden="true"></i><span></span>
          </small>
          ${professionRules.length ? `<small class="symbaroum-hud-advanced-rule-tag" data-locked="true">
            <i class="fa-solid fa-lock" aria-hidden="true"></i>${escapeHtml(professionNames)}</small>` : ""}</div>
          <button type="button" class="symbaroum-hud-ritual-select"
            data-select-ritual="${escapeHtml(ritual.id)}"
            data-ritualist-ability="${escapeHtml(ability.id)}" aria-pressed="false" disabled
            ${professionRules.length ? `data-profession-restricted="${escapeHtml(professionRules.map((rule) => rule.id).join(" "))}"` : ""}
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

function occupationChoiceRecommendationOrder(labels = []) {
  return new Map((labels ?? []).map((label, index) => [normalizeName(label), index]));
}

function occupationChoiceRecommendationIndex(item, recommendationOrder) {
  const matches = choiceIdentities(item)
    .filter((identity) => recommendationOrder.has(identity))
    .map((identity) => recommendationOrder.get(identity));
  return matches.length ? Math.min(...matches) : Number.MAX_SAFE_INTEGER;
}

function orderOccupationRecommendedChoices(items, recommendationOrder) {
  return [...items].sort((left, right) => {
    const difference = occupationChoiceRecommendationIndex(left, recommendationOrder)
      - occupationChoiceRecommendationIndex(right, recommendationOrder);
    return Number.isNaN(difference) || difference === 0 ? 0 : difference;
  });
}

function bindAbilitiesBook(element, actor, racialCost, {
  confirmAction = "choose-abilities",
  requireSelection = false,
  enforceAdvancedRules = true
} = {}) {
  const modeInput = element.querySelector('input[name="abilityDistributionMode"]');
  const selectionsInput = element.querySelector('input[name="abilitySelections"]');
  const advancedTraitsInput = element.querySelector('input[name="advancedTraitSelections"]');
  const experienceInput = element.querySelector('input[name="abilityExperienceBudget"]');
  const costs = abilityExperienceCosts();
  const entries = [...element.querySelectorAll("[data-creation-ability-id]")];
  const pages = [...element.querySelectorAll("[data-creation-ability-page]")];
  const specialChoiceCards = [...element.querySelectorAll("[data-creation-choice-identities]")];
  const selections = new Map();
  const advancedTraitSelections = new Map(parseAdvancedTraitSelections(advancedTraitsInput?.value).map((selection) => [selection.id, selection]));
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
    const selectedAbilityIds = new Set(values.map((selection) => selection.id));
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
          : selectedAbilityIds.has(entry.dataset.creationAbilityId)
            ? 1
            : entry.dataset.traditionRecommended === "true"
              ? 2
              : 3;
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
        const occupationDifference = Number(right.dataset.occupationChoiceRecommended === "true")
          - Number(left.dataset.occupationChoiceRecommended === "true");
        if (occupationDifference) return occupationDifference;
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
    if (activateEmbeddedItemSheetTabs(host)) host.dataset.abilityTabsBound = "true";
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
    const advancedValues = [...advancedTraitSelections.values()];
    const advancedTraitCost = advancedTraitExperienceCost(advancedValues);
    if (advancedTraitsInput) advancedTraitsInput.value = JSON.stringify(advancedValues);
    const archetypeProgress = new Map();
    for (const ruleButton of element.querySelectorAll("[data-archetypal-rule]")) {
      const ability = availableWorldItem(ruleButton.dataset.selectAbility);
      const rule = archetypalAbilityRule(ability);
      if (rule && !archetypeProgress.has(rule.id)) {
        archetypeProgress.set(rule.id, advancedArchetypeAbilityCount(actor, values, rule));
      }
    }
    updateTraditionRecommendations(values);
    for (const selection of values) counts[selection.rank]++;
    selectionsInput.value = JSON.stringify(values);
    const experienceMode = mode === ABILITY_DISTRIBUTION_MODES.EXPERIENCE;
    const budget = Math.max(0, Number(experienceInput?.value) || 0);
    const spent = abilitySelectionCost(values, costs) + racialCost * abilityRankCost("novice", costs) + advancedTraitCost;
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
      const required = Number(button.dataset.archetypalMinimum) || 0;
      const progress = button.dataset.archetypalRule
        ? (archetypeProgress.get(button.dataset.archetypalRule) ?? 0)
        : required;
      const professionRestricted = Boolean(button.dataset.professionRestricted);
      button.disabled = professionRestricted || (!active && required > 0 && progress < required);
      if (professionRestricted) {
        button.title = game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.ProfessionAbilityLocked");
      } else if (required > 0 && progress < required) {
        button.title = game.i18n.format?.("SYMBAROUMHUD.CharacterCreator.Abilities.ArchetypeRequirementProgress", {
          current: progress, count: required
        }) ?? `${progress}/${required}`;
      } else button.removeAttribute("title");
      button.querySelector("i").className = active ? "fa-solid fa-circle-check" : "fa-regular fa-circle";
    }
    const benefitCounts = { boon: 0, burden: 0 };
    for (const selection of advancedValues) benefitCounts[selection.type]++;
    for (const type of ["boon", "burden"]) {
      const count = element.querySelector(`[data-advanced-trait-count="${type}"]`);
      if (count) count.textContent = String(benefitCounts[type]);
    }
    const balance = element.querySelector("[data-advanced-trait-balance]");
    if (balance) {
      balance.textContent = advancedTraitCost === 0
        ? "0 XP"
        : `${advancedTraitCost > 0 ? "−" : "+"}${Math.abs(advancedTraitCost)} XP`;
      balance.dataset.bonus = String(advancedTraitCost < 0);
    }
    for (const input of element.querySelectorAll("[data-advanced-trait-choice]")) {
      const active = advancedTraitSelections.has(input.value);
      const type = input.dataset.advancedTraitType;
      const maximum = type === "boon" ? 3 : 2;
      const professionRestricted = Boolean(input.dataset.professionRestricted);
      input.checked = active;
      input.disabled = professionRestricted || (!active && benefitCounts[type] >= maximum);
      const icon = input.closest("label")?.querySelector("i");
      if (icon) icon.className = active ? "fa-solid fa-square-check" : "fa-regular fa-square";
      input.closest("[data-advanced-trait-entry]")?.setAttribute("data-selected", String(active));
    }
    for (const notice of element.querySelectorAll("[data-archetype-rule-notice]")) {
      const page = notice.closest("[data-archetypal-ability-page]");
      const id = page?.dataset.archetypalAbilityPage;
      const current = archetypeProgress.get(id) ?? 0;
      const ruleButton = element.querySelector(`[data-archetypal-rule="${id}"]`);
      const required = Number(ruleButton?.dataset.archetypalMinimum) || 3;
      notice.dataset.complete = String(current >= required);
      const text = notice.querySelector("span");
      if (text) text.textContent = game.i18n.format?.(
        "SYMBAROUMHUD.CharacterCreator.Abilities.ArchetypeRequirementProgress",
        { current, count: required }
      ) ?? `${current}/${required}`;
    }
    for (const picker of element.querySelectorAll("[data-ritual-picker]")) {
      const selection = selections.get(picker.dataset.ritualPicker);
      const required = selection?.kind === "ritualist" ? ritualCapacity(selection.rank) : 0;
      const chosen = new Set(selection?.ritualIds ?? []);
      picker.querySelector("[data-ritual-count]").textContent = String(chosen.size);
      picker.querySelector("[data-ritual-required]").textContent = String(required);
      for (const button of picker.querySelectorAll("[data-select-ritual]")) {
        const active = chosen.has(button.dataset.selectRitual);
        const professionRestricted = Boolean(button.dataset.professionRestricted);
        button.dataset.selected = String(active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = professionRestricted || !selection || (!active && chosen.size >= required);
        if (professionRestricted) {
          button.title = game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Abilities.ProfessionChoiceLocked");
        }
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
      || !specialChoicesComplete
      || (enforceAdvancedRules && !areAdvancedCreationAbilityRulesValid(actor, values, new Map(values.map((selection) => [
        selection.id, availableWorldItem(selection.id)
      ]))))
      || !isValidAdvancedTraitSelection(advancedValues, [...element.querySelectorAll("[data-advanced-trait-choice]")].map((input) => ({
        id: input.value, type: input.dataset.advancedTraitType
      })))
      || !isValidAbilitySelection(
      values, mode, racialCost,
      { experienceBudget: budget - advancedTraitCost, costs }
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
          + racialCost * abilityRankCost("novice", costs)
          + advancedTraitExperienceCost([...advancedTraitSelections.values()]);
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
  const mysticalPowerSearch = element.querySelector("[data-mystical-power-search]");
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
    const mysticalPowerQuery = normalizeName(mysticalPowerSearch?.value);
    for (const card of specialChoiceCards) {
      const matchesMysticalPowerSearch = !card.matches("[data-mystical-power-choice]")
        || !mysticalPowerQuery
        || String(card.dataset.mysticalPowerSearchValue ?? "").includes(mysticalPowerQuery);
      const visible = origins.has(card.dataset.creationChoiceOrigin)
        && sources.has(card.dataset.creationChoiceSource)
        && matchesMysticalPowerSearch;
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
  mysticalPowerSearch?.addEventListener("input", refreshBrowserFilters);
  element.querySelector("[data-clear-ability-search]")?.addEventListener("click", () => {
    search.value = "";
    search.focus();
    refreshBrowserFilters();
  });
  element.querySelector("[data-clear-mystical-power-search]")?.addEventListener("click", () => {
    mysticalPowerSearch.value = "";
    mysticalPowerSearch.focus();
    refreshBrowserFilters();
  });
  for (const input of element.querySelectorAll("[data-advanced-trait-choice]")) input.addEventListener("change", () => {
    if (input.checked) {
      advancedTraitSelections.set(input.value, { id: input.value, type: input.dataset.advancedTraitType });
    } else advancedTraitSelections.delete(input.value);
    refresh();
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

function parseAdvancedTraitSelections(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.map((entry) => ({
      id: String(entry?.id ?? ""),
      type: String(entry?.type ?? "")
    })).filter((entry) => entry.id && ["boon", "burden"].includes(entry.type) && !seen.has(entry.id) && seen.add(entry.id));
  } catch {
    return [];
  }
}

function advancedTraitExperienceCost(selections) {
  return selections.reduce((total, selection) => total + (selection.type === "boon" ? 5 : -5), 0);
}

function isValidAdvancedTraitSelection(selections, available) {
  const sources = new Map(available.map((item) => [item.id, item]));
  const counts = { boon: 0, burden: 0 };
  for (const selection of selections) {
    const source = sources.get(selection.id);
    if (!source || source.type !== selection.type || professionExclusiveItemRules(source).length) return false;
    counts[selection.type]++;
  }
  return counts.boon <= 3 && counts.burden <= 2;
}

function areAdvancedCreationAbilityRulesValid(actor, selections, abilities, mysticalPowers = null, rituals = null) {
  const archetype = String(actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.archetype ?? "");
  for (const selection of selections) {
    const ability = abilities.get(selection.id);
    if (!ability) return false;
    if (professionAbilityRule(ability)) return false;
    if (selection.kind === "mysticalPower") {
      const power = mysticalPowers?.get?.(selection.choiceId) ?? availableWorldItem(selection.choiceId);
      if (professionExclusiveItemRules(power).length) return false;
    }
    if (selection.kind === "ritualist") {
      for (const id of selection.ritualIds ?? []) {
        const ritual = rituals?.get?.(id) ?? availableWorldItem(id);
        if (professionExclusiveItemRules(ritual).length) return false;
      }
    }
    const rule = archetypalAbilityRule(ability);
    if (!rule) continue;
    if (rule.archetype !== archetype || advancedArchetypeAbilityCount(actor, selections, rule) < rule.minimum) {
      return false;
    }
  }
  return true;
}

function advancedArchetypeAbilityCount(actor, selections, rule) {
  const counted = new Set();
  for (const item of actorItems(actor)) {
    if (item?.type === "ability" && countsTowardArchetype(item, rule)) counted.add(abilityIdentity(item));
  }
  for (const selection of selections) {
    const source = availableWorldItem(selection.id);
    if (source && countsTowardArchetype(source, rule)) counted.add(abilityIdentity(source));
  }
  return counted.size;
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
  const aliases = new Set(
    [trait.id, game.i18n.localize(trait.name), ...trait.aliases].map(normalizeName).filter(Boolean)
  );
  const matches = (item) => [
    item?.system?.reference,
    item?.name,
    item?.flags?.babele?.originalName
  ].some((value) => aliases.has(normalizeName(value)));
  const existing = actorItems(actor).find((item) => item?.type === trait.type && matches(item));
  if (existing) return { id: trait.id, created: false, item: existing };
  const source = Array.from(game.items?.values?.() ?? game.items ?? []).find((item) =>
    item.type === trait.type && matches(item)
  );
  const clone = globalThis.foundry?.utils?.deepClone ?? ((value) => structuredClone(value));
  const data = source?.toObject ? clone(source.toObject()) : fallbackTraitData(trait);
  delete data._id;
  if (["trait", "ability", "mysticalPower"].includes(data.type)) {
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
  const system = ["trait", "ability", "mysticalPower"].includes(trait.type)
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
