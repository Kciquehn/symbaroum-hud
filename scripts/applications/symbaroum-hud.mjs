import {
  MODULE_ID,
  SETTINGS,
  SIMPLIFIED_HUD_MODES,
  STORAGE_VIEW_MODES,
  THEMES
} from "../constants.mjs";
import { SymbaroumCompendiumBrowser } from "./compendium-browser.mjs";
import { refreshHotbarShortcuts } from "../integrations/hotbar-shortcuts.mjs";
import { IndResourcesIntegration } from "../integrations/ind-resources.mjs";
import { ItemPilesIntegration } from "../integrations/item-piles.mjs";
import {
  applyPlayerListVisibility,
  getSetting,
  getSimplifiedHudMode,
  getStorageViewMode,
  getTheme,
  setTheme
} from "../settings.mjs";
import {
  ActorService,
  canUsePowerItem,
  hasPowerLevels,
  isTraitLikeItem
} from "../services/actor-service.mjs";
import { CharacterCreatorService } from "../services/character-creator-service.mjs";
import { defenseDisplayValue } from "../services/defense-service.mjs";
import { ritualistProgress } from "../services/ritual-service.mjs";
import {
  activateEmbeddedItemSheetActiveControls,
  activateEmbeddedItemSheetTabs,
  renderEmbeddedItemSheet
} from "../services/native-item-sheet-service.mjs";
import {
  parseVitalityDelta,
  shouldShowDangerTint,
  vitalityState
} from "../services/vitality-service.mjs";
import {
  actorServiceRecords,
  removeActorService,
  useActorService
} from "../services/service-contract-service.mjs";
import { itemHasTaxonomyTag } from "../services/item-taxonomy-service.mjs";

const ApplicationV2 = foundry.applications.api.ApplicationV2;
const HOTBAR_CONTROL_ACTIONS = new Set(["mute", "menu"]);
const CONTROL_TOOLTIP_DELAY_MS = 800;
const IND_RESOURCES_CONTAINER_DRAG_TYPE = "application/x-tenebre-container-item";
const SERVICE_STORAGE_ID = "__services";
const ATTRIBUTE_ORDER = [
  "accurate",
  "cunning",
  "discreet",
  "persuasive",
  "quick",
  "resolute",
  "strong",
  "vigilant"
];
const ATTRIBUTE_ICONS = Object.freeze({
  accurate: "fa-crosshairs",
  cunning: "fa-brain",
  discreet: "fa-mask",
  persuasive: "fa-comments",
  quick: "fa-person-running",
  resolute: "fa-sun",
  strong: "fa-hand-fist",
  vigilant: "fa-eye"
});
const ABILITY_LEVELS = Object.freeze([
  { id: "novice", label: "SYMBAROUMHUD.Abilities.Novice" },
  { id: "adept", label: "SYMBAROUMHUD.Abilities.Adept" },
  { id: "master", label: "SYMBAROUMHUD.Abilities.Master" }
]);
const DEFAULT_ABILITY_TAB = "description";
const FALLBACK_RITUAL_IMAGE = "systems/symbaroum/asset/image/ritual.png";
const FALLBACK_RITUALIST_IMAGE = "systems/symbaroum/asset/image/ability.png";
const ACTION_LABEL_KEYS = Object.freeze({
  A: "ACTION.ACTIVE",
  F: "ACTION.FREE",
  M: "ACTION.MOVEMENT",
  P: "ACTION.PASSIVE",
  R: "ACTION.REACTION",
  S: "ACTION.SPECIAL",
  T: "ACTION.FULL_TURN"
});

export class SymbaroumHud extends ApplicationV2 {
  #abilitiesOpen = false;
  #actor = null;
  #attacksOpen = false;
  #simplifiedActionsOpen = false;
  #simplifiedInventoryOpen = false;
  #simplifiedPowersOpen = false;
  #simplifiedPowersSelectedItemId = null;
  #simplifiedCollapsedContainers = new Set();
  #simplifiedOpenContainers = new Set();
  #collapseAnimationRunning = false;
  #collapseTransition = null;
  #effectMenuAbortController = null;
  #effectMenuElement = null;
  #itemContextMenuAbortController = null;
  #itemContextMenuElement = null;
  #hostilityTint = null;
  #hotbarAnchor = null;
  #listenerAbortController = null;
  #manualActorKey = null;
  #actorPickerOpen = false;
  #mysticalPowersOpen = false;
  #resolvedActorKey = null;
  #selectedAbilityId = null;
  #selectedAbilityTab = DEFAULT_ABILITY_TAB;
  #selectedMysticalPowerId = null;
  #selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
  #selectedRitualId = null;
  #selectedTraitId = null;
  #selectedTraitTab = DEFAULT_ABILITY_TAB;
  #storageContainerId = null;
  #storageDragData = null;
  #storageOpen = false;
  #tacticsCollapsed = true;
  #tooltipElement = null;
  #tooltipTimeout = null;
  #ritualsOpen = false;
  #traitsOpen = false;

  static DEFAULT_OPTIONS = {
    id: "symbaroum-hud",
    classes: ["symbaroum-hud"],
    window: {
      frame: false,
      positioned: false
    },
    position: {
      width: "auto",
      height: "auto"
    }
  };

  get actor() {
    return this.#actor;
  }

  async render(options = {}) {
    if (!getSetting(SETTINGS.ENABLED)) {
      if (this.rendered) await this.close();
      return this;
    }

    const previousActorKey = actorKey(this.#actor);
    const resolvedActor = ActorService.resolve(getSetting(SETTINGS.SELECTION_MODE));
    const resolvedKey = actorKey(resolvedActor);
    if (!this.#manualActorKey && resolvedKey !== this.#resolvedActorKey) {
      this.#resolvedActorKey = resolvedKey;
      this.#actorPickerOpen = false;
      this.#mysticalPowersOpen = false;
      this.#abilitiesOpen = false;
      this.#attacksOpen = false;
      this.#simplifiedActionsOpen = false;
      this.#simplifiedInventoryOpen = false;
      this.#simplifiedPowersOpen = false;
      this.#selectedAbilityId = null;
      this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
      this.#selectedMysticalPowerId = null;
      this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
      this.#selectedRitualId = null;
      this.#selectedTraitId = null;
      this.#selectedTraitTab = DEFAULT_ABILITY_TAB;
      this.#storageContainerId = null;
      this.#storageOpen = false;
      this.#tacticsCollapsed = true;
      this.#ritualsOpen = false;
      this.#traitsOpen = false;
      if (resolvedActor) this.#actor = resolvedActor;
    }

    if (this.#manualActorKey) {
      const manualActor = ActorService.accessibleActors(this.#actor)
        .find((actor) => actorKey(actor) === this.#manualActorKey)
        || (this.#manualActorKey.includes(".") ? fromUuidSync?.(this.#manualActorKey) : game.actors?.get(this.#manualActorKey));
      if (manualActor) this.#actor = manualActor;
      else this.#manualActorKey = null;
    } else if (resolvedActor) {
      this.#actor = resolvedActor;
    }

    const result = await super.render({ force: true, ...options });
    if (actorKey(this.#actor) !== previousActorKey) {
      void ui.hotbar?.render({ force: true });
    }
    return result;
  }

  async _prepareContext() {
    const actor = this.#actor;
    const ownedActorChoices = !game.user?.isGM
      ? ActorService.ownedActors(actor)
      : [];
    const toughness = actor?.system?.health?.toughness ?? {};
    const corruption = actor?.system?.health?.corruption ?? {};
    const vitalityValue = number(toughness.value);
    const vitalityMax = number(toughness.max);
    const temporaryCorruption = number(corruption.temporary);
    const permanentCorruption = number(corruption.permanent);
    const corruptionMax = number(corruption.max);
    const totalCorruption = temporaryCorruption + permanentCorruption;
    const indResources = actor && getSetting(SETTINGS.SHOW_IND_RESOURCES)
      ? IndResourcesIntegration.context(actor, {
          containerId: this.#storageContainerId
        })
      : { active: false };
    const canRollActor = Boolean(actor && ActorService.canUpdate(actor));
    const showPlayerResources = actor?.type === "player";
    const canUseCharacterActions = Boolean(
      showPlayerResources && canRollActor
    );
    const showWeaponReadinessButton = getSetting(SETTINGS.SHOW_WEAPON_READINESS_BUTTON);
    const hudCollapsed = Boolean(getSetting(SETTINGS.COLLAPSED));
    const storageViewMode = getStorageViewMode();
    const abilities = await abilityContext(
      actor,
      this.#selectedAbilityId,
      this.#selectedAbilityTab,
      {
        includeDetails: this.#abilitiesOpen,
        traits: false,
        nativeSheet: this.#abilitiesOpen,
        nativeSheetInteractive: canRollActor
      }
    );
    const mysticalPowers = await abilityContext(
      actor,
      this.#selectedMysticalPowerId,
      this.#selectedMysticalPowerTab,
      {
        includeDetails: this.#mysticalPowersOpen,
        mysticalPowers: true
      }
    );
    const traits = await abilityContext(
      actor,
      this.#selectedTraitId,
      this.#selectedTraitTab,
      {
        includeDetails: this.#traitsOpen,
        traits: true
      }
    );
    const rituals = await ritualContext(actor, this.#selectedRitualId, {
      includeDetails: this.#ritualsOpen
    });
    const effects = activeEffectContext(actor);
    const services = actorServiceRecords(actor);
    const tacticsHtml = game.user?.isGM && actor?.type === "monster"
      ? await enrichDescription(actor.system?.bio?.tactics, actor)
      : "";
    const abilitiesAvailable = Boolean(actor);
    const traitsAvailable = Boolean(actor);
    const knowledgeButtons = [
      indResources.actions?.maneuvers,
      rituals.available,
      mysticalPowers.available,
      abilitiesAvailable,
      traitsAvailable
    ].filter(Boolean).length;

    return {
      hasActor: Boolean(actor),
      canCycleActor: ActorService.accessibleActors(actor).length > 1,
      canChooseOwnedActor: ownedActorChoices.length > 1,
      actorPickerOpen: this.#actorPickerOpen,
      ownedActors: ownedActorChoices.map((choice) => ({
        id: actorKey(choice),
        name: choice.name,
        img: choice.img || "icons/svg/mystery-man.svg",
        active: actorKey(choice) === actorKey(actor)
      })),
      knowledge: {
        available: showPlayerResources || knowledgeButtons > 0,
        columns: knowledgeButtons > 2 ? 2 : 1,
        showExperience: showPlayerResources
      },
      showEconomy: showPlayerResources,
      theme: getTheme(),
      isSimplified: getTheme() === THEMES.SIMPLIFIED,
      isClassic: getTheme() === THEMES.CLASSIC,
      simplifiedMode: getSimplifiedHudMode(),
      simplifiedModeIcon: {
        [SIMPLIFIED_HUD_MODES.FULL]: "fa-table-cells-large",
        [SIMPLIFIED_HUD_MODES.MINIMAL]: "fa-table-cells",
        [SIMPLIFIED_HUD_MODES.HIDDEN]: "fa-eye-slash"
      }[getSimplifiedHudMode()] ?? "fa-table-cells-large",
      simplifiedModeLabel: {
        [SIMPLIFIED_HUD_MODES.FULL]: game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedMode.Full") ?? "Completo",
        [SIMPLIFIED_HUD_MODES.MINIMAL]: game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedMode.Minimal") ?? "Mínimo",
        [SIMPLIFIED_HUD_MODES.HIDDEN]: game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedMode.Hidden") ?? "Oculto"
      }[getSimplifiedHudMode()] ?? "Completo",
      simplifiedModeTooltip: {
        [SIMPLIFIED_HUD_MODES.FULL]: game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedMode.TooltipFull") ?? "Modo do HUD: Completo (clique para Mínimo)",
        [SIMPLIFIED_HUD_MODES.MINIMAL]: game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedMode.TooltipMinimal") ?? "Modo do HUD: Mínimo (clique para Oculto)",
        [SIMPLIFIED_HUD_MODES.HIDDEN]: game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedMode.TooltipHidden") ?? "Modo do HUD: Oculto (clique para Completo)"
      }[getSimplifiedHudMode()] ?? "Modo do HUD: Completo (clique para Mínimo)",
      isManualActor: Boolean(this.#manualActorKey),
      playersHidden: getSetting(SETTINGS.HIDE_PLAYERS),
      hudCollapsed,
      hudExpanded: !hudCollapsed,
      hudTransition: this.#collapseTransition ?? "",
      simplifiedActionsOpen: this.#simplifiedActionsOpen,
      simplifiedActions: simplifiedActionContext(actor, {
        canRollActor,
        drawnWeapons: indResources.drawnWeapons
      }),
      simplifiedInventoryOpen: this.#simplifiedInventoryOpen,
      simplifiedInventory: simplifiedInventoryContext(actor, {
        canRollActor,
        drawnWeapons: indResources.drawnWeapons,
        indResources,
        isContainerCollapsed: (container) => this.#isSimplifiedContainerCollapsed(actor, container)
      }),
      simplifiedPowersOpen: this.#simplifiedPowersOpen,
      simplifiedPowers: simplifiedPowersContext(actor, {
        canRollActor,
        selectedItemId: this.#simplifiedPowersSelectedItemId
      }),
      weaponDrawn: Boolean(indResources.drawnWeapons?.length),
      vitalityState: actor ? vitalityState(vitalityValue, vitalityMax) : "healthy",
      actions: {
        attributes: canRollActor,
        corruption: canRollActor,
        vitality: canRollActor,
        defense: canUseCharacterActions,
        deathTest: canUseCharacterActions,
        recovery: canUseCharacterActions,
        rerollCost: canUseCharacterActions,
        rations: Boolean(
          canUseCharacterActions
          && indResources.rations
          && indResources.rations.quantity > 0
        ),
        ammoRecovery: Boolean(canUseCharacterActions && indResources.ammoRecovery),
        rest: Boolean(canUseCharacterActions && indResources.actions?.rest),
        maneuvers: Boolean(canUseCharacterActions && indResources.actions?.maneuvers),
        weaponReadiness: Boolean(
          canUseCharacterActions
          && showWeaponReadinessButton
          && indResources.readiness
        )
      },
      readiness: canUseCharacterActions && showWeaponReadinessButton
        ? indResources.readiness
        : null,
      ammoRecovery: canUseCharacterActions ? indResources.ammoRecovery : null,
      attributes: attributeContext(actor),
      abilities: {
        canUse: canRollActor,
        ...abilities,
        available: abilitiesAvailable,
        open: this.#abilitiesOpen && abilitiesAvailable
      },
      mysticalPowers: {
        canUse: canRollActor,
        ...mysticalPowers,
        open: this.#mysticalPowersOpen && mysticalPowers.available
      },
      rituals: {
        canUse: canRollActor,
        ...rituals,
        open: this.#ritualsOpen && rituals.available
      },
      traits: {
        canUse: canRollActor,
        ...traits,
        available: traitsAvailable,
        open: this.#traitsOpen && traitsAvailable
      },
      attacks: {
        canUse: canRollActor,
        items: attackContext(actor, {
          canDrag: canRollActor,
          drawnWeapons: indResources.drawnWeapons,
          canUse: canRollActor
        }),
        open: this.#attacksOpen
      },
      effects,
      tactics: tacticsHtml ? { html: tacticsHtml, collapsed: this.#tacticsCollapsed } : null,
      hasStatusSummary: Boolean(tacticsHtml || effects.length),
      storage: actor
        ? storageWithServices(indResources.storage, services, {
            selectedId: this.#storageContainerId,
            editable: canRollActor,
            canRemove: Boolean(game.user?.isGM),
            load: indResources.load,
            open: this.#storageOpen,
            viewMode: storageViewMode
          })
        : null,
      info: {
        defense: defenseDisplayValue(actor),
        armor: armorValue(actor),
        armorName: armorName(actor),
        experience: showPlayerResources ? experienceContext(actor) : null,
        load: showPlayerResources && indResources.active ? indResources.load : null,
        money: showPlayerResources ? moneyContext(actor) : null,
        rations: showPlayerResources && indResources.active ? indResources.rations : null,
        quiver: indResources.active ? indResources.quiver : null,
        maneuvers: indResources.active && Array.isArray(indResources.maneuvers) && indResources.maneuvers.length > 0 ? indResources.maneuvers.length : null
      },
      actor: actor
        ? {
            name: actor.name,
            img: actor.img,
            deathFailures: failedDeathRolls(actor),
            vitality: {
              value: vitalityValue,
              max: vitalityMax,
              percent: resourcePercent(vitalityValue, vitalityMax)
            },
            corruption: {
              temporary: temporaryCorruption,
              permanent: permanentCorruption,
              total: totalCorruption,
              max: corruptionMax,
              percent: resourcePercent(totalCorruption, corruptionMax)
            }
          }
        : {
            name: game.i18n.localize("SYMBAROUMHUD.Empty"),
            img: "icons/svg/mystery-man.svg",
            deathFailures: [],
            vitality: { value: 0, max: 0, percent: 0 },
            corruption: { temporary: 0, permanent: 0, total: 0, max: 0, percent: 0 }
          }
    };
  }

  async _renderHTML(context) {
    return foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/hud.hbs`,
      context
    );
  }

  _replaceHTML(result, content) {
    this.#closeEffectMenu();
    this.#closeItemContextMenu();
    const hotbar = document.getElementById("hotbar");
    if (hotbar && content.contains(hotbar)) hotbar.remove();
    const stableCharacterCard = this.#collapseAnimationRunning
      ? content.querySelector(".symbaroum-hud-character-card")
      : null;
    const stableHotbarControls = this.#collapseAnimationRunning
      ? content.querySelector(".symbaroum-hud-hotbar-controls")
      : null;

    content.innerHTML = result;
    if (stableCharacterCard) {
      content.querySelector(".symbaroum-hud-character-card")?.replaceWith(stableCharacterCard);
    }
    if (stableHotbarControls) {
      content.querySelector(".symbaroum-hud-hotbar-controls")?.replaceWith(stableHotbarControls);
    }
    const currentTheme = getTheme();
    content.dataset.symbaTheme = currentTheme;
    content.classList.toggle("symbaroum-hud--classic", currentTheme === THEMES.CLASSIC);
    content.classList.toggle("symbaroum-hud--simplified", currentTheme === THEMES.SIMPLIFIED);
    this.#updateHostilityTint(content);
    this.#dockHotbar(content, hotbar);
    this.#activateListeners(content);
    const element = this.element;
    if (element) document.body.appendChild(element);
  }

  _insertElement(element) {
    document.body.appendChild(element);
  }

  _onClose(options) {
    this.#listenerAbortController?.abort();
    this.#listenerAbortController = null;
    this.#closeEffectMenu();
    this.#closeItemContextMenu();
    this.#updateHostilityTint(null);
    this.#clearDelayedTooltip();
    this.#restoreHotbar();
    this.#actor = null;
    this.#abilitiesOpen = false;
    this.#attacksOpen = false;
    this.#collapseAnimationRunning = false;
    this.#collapseTransition = null;
    this.#manualActorKey = null;
    this.#actorPickerOpen = false;
    this.#mysticalPowersOpen = false;
    this.#resolvedActorKey = null;
    this.#selectedAbilityId = null;
    this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
    this.#selectedMysticalPowerId = null;
    this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
    this.#selectedRitualId = null;
    this.#selectedTraitId = null;
    this.#selectedTraitTab = DEFAULT_ABILITY_TAB;
    this.#storageContainerId = null;
    this.#storageDragData = null;
    this.#storageOpen = false;
    this.#simplifiedActionsOpen = false;
    this.#simplifiedInventoryOpen = false;
    this.#simplifiedPowersOpen = false;
    this.#simplifiedCollapsedContainers.clear();
    this.#simplifiedOpenContainers.clear();
    this.#tacticsCollapsed = true;
    this.#ritualsOpen = false;
    this.#traitsOpen = false;
    return super._onClose(options);
  }

  #isSimplifiedContainerCollapsed(actor, container) {
    const id = typeof container === "string" ? container : container?.id;
    if (!id) return true;
    if (this.#simplifiedCollapsedContainers.has(id)) return true;
    if (this.#simplifiedOpenContainers.has(id)) return false;
    if (IndResourcesIntegration.api?.containers?.isContainerExpanded && actor) {
      const containerItem = findActorItem(actor, id);
      if (containerItem) {
        return !IndResourcesIntegration.api.containers.isContainerExpanded(actor, containerItem);
      }
    }
    return true;
  }

  #activateListeners(root) {
    this.#listenerAbortController?.abort();
    this.#listenerAbortController = new AbortController();
    const signal = this.#listenerAbortController.signal;
    this.#clearDelayedTooltip();

    const nativeAbilitySheet = root.querySelector("[data-hud-ability-sheet]");
    activateEmbeddedItemSheetTabs(nativeAbilitySheet, {
      selectedTab: this.#selectedAbilityTab,
      signal,
      onSelect: (tabId) => { this.#selectedAbilityTab = tabId; }
    });
    activateEmbeddedItemSheetActiveControls(nativeAbilitySheet, { signal });

    root.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      if (!actionElement || !root.contains(actionElement) || actionElement.closest("#hotbar")) return;
      event.preventDefault();
      void this.#onAction(actionElement, event);
    }, { signal });

    root.addEventListener("contextmenu", (event) => {
      const actionElement = event.target.closest('[data-action="set-actor"]');
      if (!actionElement || !root.contains(actionElement)) return;
      event.preventDefault();
      event.stopPropagation();
      void this.#onAction(actionElement, event);
    }, { signal });

    if (this.#actorPickerOpen) {
      document.addEventListener("pointerdown", (event) => {
        if (event.target.closest?.(".symbaroum-hud-character-name")) return;
        this.#closeActorPicker(root);
      }, { capture: true, signal });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.#closeActorPicker(root);
      }, { signal });
    }

    root.addEventListener("change", (event) => {
      const activeLevel = event.target.closest?.(
        '[data-hud-ability-sheet] input[name^="system."][name$=".isActive"]'
      );
      if (activeLevel && root.contains(activeLevel)) {
        event.preventDefault();
        const level = activeLevel.name.match(/^system\.(novice|adept|master)\.isActive$/)?.[1];
        const itemId = activeLevel.closest("[data-hud-ability-sheet]")?.dataset.itemId;
        const actor = this.#actor;
        if (!actor || !level || !itemId) return;
        void ActorService.setAbilityLevelActive(actor, itemId, level, activeLevel.checked)
          .then(() => this.render())
          .catch((error) => {
            console.error(`${MODULE_ID} | Ability level update failed.`, error);
            ui.notifications?.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
          });
        return;
      }
      const input = event.target.closest?.('[data-storage-quantity="true"]');
      if (!input || !root.contains(input)) return;
      event.preventDefault();
      const actor = this.#actor;
      if (!actor) return;
      void IndResourcesIntegration.setStorageItemQuantity(
        actor,
        input.dataset.containerId || null,
        input.dataset.itemId,
        input.value
      ).then(() => this.render()).catch((error) => {
        console.error(`${MODULE_ID} | Storage quantity update failed.`, error);
        ui.notifications?.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
      });
    }, { signal });

    root.addEventListener("keydown", (event) => {
      const input = event.target.closest?.('[data-storage-quantity="true"]');
      if (!input || !root.contains(input) || event.key !== "Enter") return;
      event.preventDefault();
      input.blur();
    }, { signal });

    root.addEventListener("contextmenu", (event) => {
      const storageElement = event.target.closest("[data-storage-delete-container]");
      if (!storageElement || !root.contains(storageElement)) return;
      event.preventDefault();
      event.stopPropagation();
      const actor = this.#actor;
      if (!actor) return;
      const containerId = storageElement.dataset.storageDeleteContainer;
      void IndResourcesIntegration.deleteStorageContainer(actor, containerId)
        .then((result) => {
          if (!result) return;
          if (
            this.#storageContainerId === containerId
            || this.#storageContainerId === `__quiver:${containerId}`
          ) {
            this.#storageContainerId = null;
          }
          return this.render();
        })
        .catch((error) => {
          console.error(`${MODULE_ID} | Storage container deletion failed.`, error);
          ui.notifications?.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
    }, { signal });

    root.addEventListener("contextmenu", (event) => {
      const itemRow = event.target.closest(".symbaroum-hud-simplified-inventory-panel [data-item-id]");
      if (!itemRow || !root.contains(itemRow)) return;
      event.preventDefault();
      event.stopPropagation();
      this.#openItemContextMenu(itemRow, event);
    }, { signal });

    root.addEventListener("contextmenu", (event) => {
      const effectElement = event.target.closest("[data-effect-id]");
      if (!effectElement || !root.contains(effectElement)) return;
      event.preventDefault();
      event.stopPropagation();
      this.#openEffectMenu(effectElement.dataset.effectId, event);
    }, { signal });

    root.addEventListener("contextmenu", (event) => {
      const abilityElement = event.target.closest("[data-ability-id]");
      if (!abilityElement || !root.contains(abilityElement)) return;
      event.preventDefault();
      event.stopPropagation();
      const actor = this.#actor;
      if (!actor) return;
      void ActorService.openItem(actor, abilityElement.dataset.abilityId).catch((error) => {
        console.error(`${MODULE_ID} | Ability open failed.`, error);
        ui.notifications?.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
      });
    }, { signal });

    root.addEventListener("dragstart", (event) => {
      const abilityElement = event.target.closest(
        '[data-ability-draggable="true"][data-item-id]'
      );
      if (!abilityElement || !root.contains(abilityElement) || !event.dataTransfer) return;

      const actor = this.#actor;
      const item = findActorItem(actor, abilityElement.dataset.itemId);
      const uuid = abilityElement.dataset.itemUuid || item?.uuid;
      if (!ActorService.canUpdate(actor) || !uuid) {
        event.preventDefault();
        return;
      }

      const serializedDocument = JSON.stringify({
        type: "Item",
        uuid
      });
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", serializedDocument);
      event.dataTransfer.setData("application/json", serializedDocument);
    }, { signal });

    root.addEventListener("dragstart", (event) => {
      const weaponElement = event.target.closest(
        '[data-weapon-draggable="true"][data-item-id]'
      );
      if (!weaponElement || !root.contains(weaponElement) || !event.dataTransfer) return;

      const actor = this.#actor;
      const item = findActorItem(actor, weaponElement.dataset.itemId);
      const uuid = weaponElement.dataset.itemUuid || item?.uuid;
      if (!ActorService.canUpdate(actor) || !uuid) {
        event.preventDefault();
        return;
      }

      const serializedDocument = JSON.stringify({
        type: "Item",
        uuid
      });
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", serializedDocument);
      event.dataTransfer.setData("application/json", serializedDocument);
    }, { signal });

    root.addEventListener("dragstart", (event) => {
      const itemElement = event.target.closest(
        '[data-storage-draggable="true"][data-item-id]'
      );
      if (!itemElement || !root.contains(itemElement) || !event.dataTransfer) return;

      const actor = this.#actor;
      const item = findActorItem(actor, itemElement.dataset.itemId);
      if (!actor || !item?.uuid) {
        event.preventDefault();
        return;
      }

      const source = itemElement.dataset.storageSource
        || (itemElement.dataset.containerId ? "stored" : "inventory");
      const documentData = { type: "Item", uuid: item.uuid };
      const containerData = {
        actorId: actor.id,
        actorUuid: actor.uuid,
        containerId: itemElement.dataset.containerId || null,
        itemId: item.id,
        source
      };
      const serializedDocument = JSON.stringify(documentData);
      const serializedContainer = JSON.stringify(containerData);

      this.#storageDragData = containerData;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", serializedDocument);
      event.dataTransfer.setData("application/json", serializedDocument);
      event.dataTransfer.setData(
        IND_RESOURCES_CONTAINER_DRAG_TYPE,
        serializedContainer
      );
    }, { signal });

    root.addEventListener("dragover", (event) => {
      const traitsElement = event.target.closest('[data-trait-drop="true"]');
      if (
        traitsElement
        && root.contains(traitsElement)
        && this.#canDropOnTraits(event.dataTransfer)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = this.#isCurrentStorageDrag(this.#storageDragData)
            ? "move"
            : "copy";
        }
        this.#clearStorageDropTargets(root);
        this.#clearAttackDropTargets(root);
        this.#clearRitualDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);
        this.#clearTraitDropTargets(root);
        traitsElement.dataset.traitDropTarget = "true";
        return;
      }

      const mysticalPowersElement = event.target.closest('[data-mystical-power-drop="true"]');
      if (
        mysticalPowersElement
        && root.contains(mysticalPowersElement)
        && this.#canDropOnMysticalPowers(event.dataTransfer)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = this.#isCurrentStorageDrag(this.#storageDragData)
            ? "move"
            : "copy";
        }
        this.#clearStorageDropTargets(root);
        this.#clearAttackDropTargets(root);
        this.#clearRitualDropTargets(root);
        this.#clearTraitDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);
        mysticalPowersElement.dataset.mysticalPowerDropTarget = "true";
        return;
      }

      const ritualsElement = event.target.closest('[data-ritual-drop="true"]');
      if (
        ritualsElement
        && root.contains(ritualsElement)
        && this.#canDropOnRituals(event.dataTransfer)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = this.#isCurrentStorageDrag(this.#storageDragData)
            ? "move"
            : "copy";
        }
        this.#clearStorageDropTargets(root);
        this.#clearAttackDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);
        this.#clearTraitDropTargets(root);
        this.#clearRitualDropTargets(root);
        ritualsElement.dataset.ritualDropTarget = "true";
        return;
      }

      const attacksElement = event.target.closest('[data-weapon-drop="true"]');
      if (
        attacksElement
        && root.contains(attacksElement)
        && this.#canDropOnAttacks(event.dataTransfer)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = this.#isCurrentStorageDrag(this.#storageDragData)
            ? "move"
            : "copy";
        }
        this.#clearStorageDropTargets(root);
        this.#clearRitualDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);
        this.#clearTraitDropTargets(root);
        this.#clearAttackDropTargets(root);
        attacksElement.dataset.weaponDropTarget = "true";
        return;
      }

      const quiverElement = event.target.closest("[data-storage-drop-quiver]");
      if (
        quiverElement
        && root.contains(quiverElement)
        && this.#canDropOnQuiver(event.dataTransfer)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = this.#isCurrentStorageDrag(this.#storageDragData)
            ? "move"
            : "copy";
        }
        this.#clearStorageDropTargets(root);
        quiverElement.dataset.storageDropTarget = "true";
        return;
      }

      const containerElement = event.target.closest("[data-storage-drop-container]");
      if (
        containerElement
        && root.contains(containerElement)
        && (
          (
            this.#isCurrentStorageDrag(this.#storageDragData)
            && this.#storageDragData.source === "inventory"
          )
          || this.#hasDocumentDragData(event.dataTransfer)
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = this.#isCurrentStorageDrag(this.#storageDragData)
            ? "move"
            : "copy";
        }
        this.#clearStorageDropTargets(root);
        containerElement.dataset.storageDropTarget = "true";
        return;
      }

      const withdrawElement = event.target.closest("[data-storage-withdraw-zone]");
      if (
        withdrawElement
        && root.contains(withdrawElement)
        && this.#isCurrentStorageDrag(this.#storageDragData)
        && this.#storageDragData.source === "stored"
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        this.#clearStorageDropTargets(root);
        withdrawElement.dataset.storageWithdrawTarget = "true";
        return;
      }

      const inventoryElement = event.target.closest(
        '[data-storage-inventory-drop="true"]'
      );
      if (
        !inventoryElement
        || !root.contains(inventoryElement)
      ) {
        return;
      }
      if (
        !this.#isCurrentStorageDrag(this.#storageDragData)
        && !this.#hasDocumentDragData(event.dataTransfer)
      ) return;

      event.preventDefault();
      event.stopPropagation();
      this.#clearStorageDropTargets(root);
      if (this.#isCurrentStorageDrag(this.#storageDragData)) {
        if (this.#storageDragData.source === "stored") {
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          inventoryElement.dataset.storageInventoryTarget = "true";
          return;
        }
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      inventoryElement.dataset.storageInventoryTarget = "true";
    }, { signal });

    root.addEventListener("dragleave", (event) => {
      const traitsElement = event.target.closest('[data-trait-drop="true"]');
      if (traitsElement && !traitsElement.contains(event.relatedTarget)) {
        delete traitsElement.dataset.traitDropTarget;
      }

      const mysticalPowersElement = event.target.closest('[data-mystical-power-drop="true"]');
      if (mysticalPowersElement && !mysticalPowersElement.contains(event.relatedTarget)) {
        delete mysticalPowersElement.dataset.mysticalPowerDropTarget;
      }

      const ritualsElement = event.target.closest('[data-ritual-drop="true"]');
      if (ritualsElement && !ritualsElement.contains(event.relatedTarget)) {
        delete ritualsElement.dataset.ritualDropTarget;
      }

      const attacksElement = event.target.closest('[data-weapon-drop="true"]');
      if (attacksElement && !attacksElement.contains(event.relatedTarget)) {
        delete attacksElement.dataset.weaponDropTarget;
      }

      const containerElement = event.target.closest("[data-storage-drop-container]");
      if (containerElement && !containerElement.contains(event.relatedTarget)) {
        delete containerElement.dataset.storageDropTarget;
      }

      const quiverElement = event.target.closest("[data-storage-drop-quiver]");
      if (quiverElement && !quiverElement.contains(event.relatedTarget)) {
        delete quiverElement.dataset.storageDropTarget;
      }

      const withdrawElement = event.target.closest("[data-storage-withdraw-zone]");
      if (withdrawElement && !withdrawElement.contains(event.relatedTarget)) {
        delete withdrawElement.dataset.storageWithdrawTarget;
      }

      const inventoryElement = event.target.closest(
        '[data-storage-inventory-drop="true"]'
      );
      if (inventoryElement && !inventoryElement.contains(event.relatedTarget)) {
        delete inventoryElement.dataset.storageInventoryTarget;
      }
    }, { signal });

    root.addEventListener("drop", (event) => {
      const traitsElement = event.target.closest('[data-trait-drop="true"]');
      if (traitsElement && root.contains(traitsElement)) {
        const dragData = this.#storageDragData
          ?? this.#readStorageDragData(event.dataTransfer);
        const dropData = this.#readDocumentDragData(event.dataTransfer);
        if (
          !(
            this.#isCurrentStorageDrag(dragData)
            && dragData.source === "inventory"
          )
          && !this.#isItemDropData(dropData)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const actor = this.#actor;
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);
        this.#clearAttackDropTargets(root);
        this.#clearRitualDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);
        this.#clearTraitDropTargets(root);

        const action = this.#isCurrentStorageDrag(dragData)
          ? Promise.resolve(findActorItem(actor, dragData.itemId))
          : ActorService.importTraitLikeItem(actor, dropData);

        void action.then((item) => {
          if (!isTraitLikeItem(item)) return;
          this.#abilitiesOpen = false;
          this.#attacksOpen = false;
          this.#mysticalPowersOpen = false;
          this.#ritualsOpen = false;
          this.#storageOpen = false;
          this.#selectedTraitId = item.id;
          this.#selectedTraitTab = DEFAULT_ABILITY_TAB;
          this.#traitsOpen = true;
          return this.render();
        }).catch((error) => {
          console.error(`${MODULE_ID} | Failed to drop a trait on the HUD traits button.`, error);
          ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
        return;
      }

      const mysticalPowersElement = event.target.closest('[data-mystical-power-drop="true"]');
      if (mysticalPowersElement && root.contains(mysticalPowersElement)) {
        const dragData = this.#storageDragData
          ?? this.#readStorageDragData(event.dataTransfer);
        const dropData = this.#readDocumentDragData(event.dataTransfer);
        if (
          !(
            this.#isCurrentStorageDrag(dragData)
            && dragData.source === "inventory"
          )
          && !this.#isItemDropData(dropData)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const actor = this.#actor;
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);
        this.#clearAttackDropTargets(root);
        this.#clearRitualDropTargets(root);
        this.#clearTraitDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);

        const action = this.#isCurrentStorageDrag(dragData)
          ? Promise.resolve(findActorItem(actor, dragData.itemId))
          : IndResourcesIntegration.importMysticalPowerItem(actor, dropData);

        void action.then((item) => {
          if (!IndResourcesIntegration.isMysticalPowerItem(item)) return;
          this.#abilitiesOpen = false;
          this.#attacksOpen = false;
          this.#storageOpen = false;
          this.#ritualsOpen = false;
          this.#traitsOpen = false;
          this.#selectedMysticalPowerId = item.id;
          this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
          this.#mysticalPowersOpen = true;
          return this.render();
        }).catch((error) => {
          console.error(`${MODULE_ID} | Failed to drop a mystical power on the HUD mystical powers button.`, error);
          ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
        return;
      }

      const ritualsElement = event.target.closest('[data-ritual-drop="true"]');
      if (ritualsElement && root.contains(ritualsElement)) {
        const dragData = this.#storageDragData
          ?? this.#readStorageDragData(event.dataTransfer);
        const dropData = this.#readDocumentDragData(event.dataTransfer);
        if (
          !(
            this.#isCurrentStorageDrag(dragData)
            && dragData.source === "inventory"
          )
          && !this.#isItemDropData(dropData)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const actor = this.#actor;
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);
        this.#clearAttackDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);
        this.#clearTraitDropTargets(root);
        this.#clearRitualDropTargets(root);

        const action = this.#isCurrentStorageDrag(dragData)
          ? Promise.resolve(findActorItem(actor, dragData.itemId))
          : IndResourcesIntegration.importRitualItem(actor, dropData);

        void action.then((item) => {
          if (!IndResourcesIntegration.isRitualItem(item)) return;
          this.#abilitiesOpen = false;
          this.#attacksOpen = false;
          this.#mysticalPowersOpen = false;
          this.#storageOpen = false;
          this.#traitsOpen = false;
          this.#selectedRitualId = item.id;
          this.#ritualsOpen = true;
          return this.render();
        }).catch((error) => {
          console.error(`${MODULE_ID} | Failed to drop a ritual on the HUD rituals button.`, error);
          ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
        return;
      }

      const attacksElement = event.target.closest('[data-weapon-drop="true"]');
      if (attacksElement && root.contains(attacksElement)) {
        const dragData = this.#storageDragData
          ?? this.#readStorageDragData(event.dataTransfer);
        const dropData = this.#readDocumentDragData(event.dataTransfer);
        if (
          !(
            this.#isCurrentStorageDrag(dragData)
            && dragData.source === "inventory"
          )
          && !this.#isItemDropData(dropData)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const actor = this.#actor;
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);
        this.#clearRitualDropTargets(root);
        this.#clearMysticalPowerDropTargets(root);
        this.#clearTraitDropTargets(root);
        this.#clearAttackDropTargets(root);

        const action = this.#isCurrentStorageDrag(dragData)
          ? Promise.resolve(findActorItem(actor, dragData.itemId))
          : IndResourcesIntegration.importWeaponItem(actor, dropData);

        void action.then((item) => {
          if (!IndResourcesIntegration.isWeaponItem(item)) return;
          this.#abilitiesOpen = false;
          this.#mysticalPowersOpen = false;
          this.#storageOpen = false;
          this.#ritualsOpen = false;
          this.#traitsOpen = false;
          this.#attacksOpen = true;
          return this.render();
        }).catch((error) => {
          console.error(`${MODULE_ID} | Failed to drop a weapon on the HUD attacks button.`, error);
          ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
        return;
      }

      const quiverElement = event.target.closest("[data-storage-drop-quiver]");
      if (quiverElement && root.contains(quiverElement)) {
        const dragData = this.#storageDragData
          ?? this.#readStorageDragData(event.dataTransfer);
        const dropData = this.#readDocumentDragData(event.dataTransfer);
        if (
          !(
            this.#isCurrentStorageDrag(dragData)
            && dragData.source === "inventory"
          )
          && !this.#isItemDropData(dropData)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const actor = this.#actor;
        const quiverId = quiverElement.dataset.storageDropQuiver;
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);

        const action = this.#isCurrentStorageDrag(dragData)
          ? IndResourcesIntegration.dropInventoryItemOnQuiver(
              actor,
              dragData.itemId,
              quiverId
            )
          : IndResourcesIntegration.importQuiverAmmo(
              actor,
              dropData,
              quiverId
            );

        void action.catch((error) => {
          console.error(`${MODULE_ID} | Failed to drop ammunition on the HUD quiver.`, error);
          ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
        return;
      }

      const containerElement = event.target.closest("[data-storage-drop-container]");
      if (containerElement && root.contains(containerElement)) {
        const dragData = this.#storageDragData
          ?? this.#readStorageDragData(event.dataTransfer);
        const dropData = this.#readDocumentDragData(event.dataTransfer);
        if (
          !(
            this.#isCurrentStorageDrag(dragData)
            && dragData.source === "inventory"
          )
          && !this.#isItemDropData(dropData)
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const actor = this.#actor;
        const containerId = containerElement.dataset.storageDropContainer;
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);

        const action = this.#isCurrentStorageDrag(dragData)
          ? IndResourcesIntegration.storeInContainer(
              actor,
              dragData.itemId,
              containerId
            )
          : IndResourcesIntegration.importItemInContainer(
              actor,
              dropData,
              containerId
            );

        void action.catch((error) => {
          console.error(`${MODULE_ID} | Failed to store a HUD inventory item.`, error);
          ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
        return;
      }

      const withdrawElement = event.target.closest("[data-storage-withdraw-zone]");
      if (withdrawElement && root.contains(withdrawElement)) {
        const dragData = this.#storageDragData
          ?? this.#readStorageDragData(event.dataTransfer);
        if (!this.#isCurrentStorageDrag(dragData) || dragData.source !== "stored") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const actor = this.#actor;
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);

        void IndResourcesIntegration.withdrawFromContainer(
          actor,
          dragData.itemId,
          dragData.containerId
        ).catch((error) => {
          console.error(`${MODULE_ID} | Failed to withdraw a HUD inventory item.`, error);
          ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
        return;
      }

      const inventoryElement = event.target.closest(
        '[data-storage-inventory-drop="true"]'
      );
      if (
        !inventoryElement
        || !root.contains(inventoryElement)
      ) {
        return;
      }
      if (this.#isCurrentStorageDrag(this.#storageDragData)) {
        if (this.#storageDragData.source === "stored" && this.#storageDragData.containerId) {
          event.preventDefault();
          event.stopPropagation();
          const { itemId, containerId } = this.#storageDragData;
          this.#storageDragData = null;
          this.#clearStorageDropTargets(root);
          void IndResourcesIntegration.withdrawFromContainer(
            this.#actor,
            itemId,
            containerId
          ).catch((error) => {
            console.error(`${MODULE_ID} | Failed to withdraw item on inventory drop.`, error);
          });
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.#storageDragData = null;
        this.#clearStorageDropTargets(root);
        return;
      }

      const dropData = this.#readDocumentDragData(event.dataTransfer);
      if (!this.#isItemDropData(dropData)) return;

      event.preventDefault();
      event.stopPropagation();
      this.#clearStorageDropTargets(root);

      void IndResourcesIntegration.importInventoryItem(
        this.#actor,
        dropData
      ).catch((error) => {
        console.error(`${MODULE_ID} | Failed to import a HUD inventory item.`, error);
        ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
      });
    }, { signal });

    root.addEventListener("dragend", () => {
      this.#storageDragData = null;
      this.#clearStorageDropTargets(root);
      this.#clearAttackDropTargets(root);
      this.#clearRitualDropTargets(root);
      this.#clearMysticalPowerDropTargets(root);
      this.#clearTraitDropTargets(root);
    }, { signal });

    for (const button of root.querySelectorAll("[data-symba-delayed-tooltip]")) {
      button.addEventListener("pointerenter", () => {
        this.#clearDelayedTooltip();
        this.#tooltipTimeout = window.setTimeout(() => {
          this.#tooltipTimeout = null;
          if (!button.matches(":hover")) return;

          this.#tooltipElement = button;
          game.tooltip.activate(button, { text: button.ariaLabel });
        }, CONTROL_TOOLTIP_DELAY_MS);
      }, { signal });

      button.addEventListener("pointerleave", () => {
        window.clearTimeout(this.#tooltipTimeout);
        this.#tooltipTimeout = null;
        if (this.#tooltipElement !== button) return;

        game.tooltip.deactivate();
        this.#tooltipElement = null;
      }, { signal });
    }
  }

  #clearDelayedTooltip() {
    window.clearTimeout(this.#tooltipTimeout);
    this.#tooltipTimeout = null;
    if (this.#tooltipElement) game.tooltip.deactivate();
    this.#tooltipElement = null;
  }

  #readStorageDragData(dataTransfer) {
    const raw = dataTransfer?.getData(IND_RESOURCES_CONTAINER_DRAG_TYPE);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }

  #readDocumentDragData(dataTransfer) {
    for (const type of ["text/plain", "application/json"]) {
      const raw = dataTransfer?.getData(type);
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") return data;
      } catch (_error) {
        // Other drag payloads are not Foundry Documents.
      }
    }
    return null;
  }

  #hasDocumentDragData(dataTransfer) {
    const types = Array.from(dataTransfer?.types ?? []);
    return types.includes("text/plain") || types.includes("application/json");
  }

  #isItemDropData(data) {
    return data?.type === "Item" || data?.documentName === "Item";
  }

  #isCurrentStorageDrag(data) {
    const actor = this.#actor;
    return Boolean(
      actor
      && (data?.source === "inventory" || data?.source === "stored")
      && data.actorId === actor.id
      && data.actorUuid === actor.uuid
      && typeof data.itemId === "string"
      && data.itemId
    );
  }

  #clearStorageDropTargets(root) {
    for (const element of root.querySelectorAll('[data-storage-drop-target="true"]')) {
      delete element.dataset.storageDropTarget;
    }
    for (const element of root.querySelectorAll('[data-storage-inventory-target="true"]')) {
      delete element.dataset.storageInventoryTarget;
    }
    for (const element of root.querySelectorAll('[data-storage-withdraw-target="true"]')) {
      delete element.dataset.storageWithdrawTarget;
    }
  }

  #canDropOnQuiver(dataTransfer) {
    if (
      this.#isCurrentStorageDrag(this.#storageDragData)
      && this.#storageDragData.source === "inventory"
    ) {
      const item = findActorItem(this.#actor, this.#storageDragData.itemId);
      return IndResourcesIntegration.isQuiverCompatibleItem(item);
    }
    return this.#hasDocumentDragData(dataTransfer);
  }

  #canDropOnAttacks(dataTransfer) {
    if (!ActorService.canUpdate(this.#actor)) return false;
    if (
      this.#isCurrentStorageDrag(this.#storageDragData)
      && this.#storageDragData.source === "inventory"
    ) {
      const item = findActorItem(this.#actor, this.#storageDragData.itemId);
      return IndResourcesIntegration.isWeaponItem(item);
    }

    const dropData = this.#readDocumentDragData(dataTransfer);
    return this.#isItemDropData(dropData);
  }

  #canDropOnRituals(dataTransfer) {
    if (!ActorService.canUpdate(this.#actor)) return false;
    if (
      this.#isCurrentStorageDrag(this.#storageDragData)
      && this.#storageDragData.source === "inventory"
    ) {
      const item = findActorItem(this.#actor, this.#storageDragData.itemId);
      return IndResourcesIntegration.isRitualItem(item);
    }

    const dropData = this.#readDocumentDragData(dataTransfer);
    return this.#isItemDropData(dropData);
  }

  #canDropOnMysticalPowers(dataTransfer) {
    if (!ActorService.canUpdate(this.#actor)) return false;
    if (
      this.#isCurrentStorageDrag(this.#storageDragData)
      && this.#storageDragData.source === "inventory"
    ) {
      const item = findActorItem(this.#actor, this.#storageDragData.itemId);
      return IndResourcesIntegration.isMysticalPowerItem(item);
    }

    const dropData = this.#readDocumentDragData(dataTransfer);
    return this.#isItemDropData(dropData);
  }

  #canDropOnTraits(dataTransfer) {
    if (!ActorService.canUpdate(this.#actor)) return false;
    if (
      this.#isCurrentStorageDrag(this.#storageDragData)
      && this.#storageDragData.source === "inventory"
    ) {
      const item = findActorItem(this.#actor, this.#storageDragData.itemId);
      return isTraitLikeItem(item);
    }

    const dropData = this.#readDocumentDragData(dataTransfer);
    return this.#isItemDropData(dropData);
  }

  #clearAttackDropTargets(root) {
    for (const element of root.querySelectorAll('[data-weapon-drop-target="true"]')) {
      delete element.dataset.weaponDropTarget;
    }
  }

  #clearRitualDropTargets(root) {
    for (const element of root.querySelectorAll('[data-ritual-drop-target="true"]')) {
      delete element.dataset.ritualDropTarget;
    }
  }

  #clearMysticalPowerDropTargets(root) {
    for (const element of root.querySelectorAll('[data-mystical-power-drop-target="true"]')) {
      delete element.dataset.mysticalPowerDropTarget;
    }
  }

  #clearTraitDropTargets(root) {
    for (const element of root.querySelectorAll('[data-trait-drop-target="true"]')) {
      delete element.dataset.traitDropTarget;
    }
  }

  #openEffectMenu(effectId, event) {
    const actor = this.#actor;
    if (!actor || !effectId) return;
    this.#closeEffectMenu();

    const controller = new AbortController();
    const signal = controller.signal;
    const menu = document.createElement("div");
    const button = document.createElement("button");
    const icon = document.createElement("i");
    const label = game.i18n.localize("SYMBAROUMHUD.Actions.RemoveEffect");

    menu.className = "symbaroum-hud-effect-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);

    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.disabled = !ActorService.canUpdate(actor);
    icon.className = "fa-solid fa-trash";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon, document.createTextNode(label));
    menu.appendChild(button);

    button.addEventListener("click", () => {
      this.#closeEffectMenu();
      void ActorService.removeEffect(actor, effectId).catch((error) => {
        console.error(`${MODULE_ID} | Effect removal failed.`, error);
        ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
      });
    }, { signal });

    document.body.appendChild(menu);
    this.#effectMenuAbortController = controller;
    this.#effectMenuElement = menu;

    const margin = 6;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(
      margin,
      Math.min(event.clientX, window.innerWidth - bounds.width - margin)
    );
    const top = Math.max(
      margin,
      Math.min(event.clientY, window.innerHeight - bounds.height - margin)
    );
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    button.focus({ preventScroll: true });

    document.addEventListener("pointerdown", (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) this.#closeEffectMenu();
    }, { capture: true, signal });
    document.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") this.#closeEffectMenu();
    }, { signal });
    window.addEventListener("blur", () => this.#closeEffectMenu(), { signal });
  }

  #closeEffectMenu() {
    this.#effectMenuAbortController?.abort();
    this.#effectMenuAbortController = null;
    this.#effectMenuElement?.remove();
    this.#effectMenuElement = null;
  }

  #openItemContextMenu(itemRow, event) {
    const actor = this.#actor;
    const itemId = itemRow.dataset.itemId;
    if (!actor || !itemId) return;

    const item = findActorItem(actor, itemId) ?? ActorService.item(actor, itemId);
    if (!item) return;

    this.#closeItemContextMenu();
    this.#closeEffectMenu();

    const controller = new AbortController();
    const signal = controller.signal;
    const menu = document.createElement("div");
    menu.className = "symbaroum-hud-item-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", item.name || "Item");

    const options = [];

    options.push({
      action: "open-sheet",
      icon: "fa-solid fa-file-lines",
      label: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.OpenSheet"),
      callback: () => ActorService.openItem(actor, itemId)
    });

    options.push({
      action: "post-to-chat",
      icon: "fa-solid fa-message",
      label: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.PostToChat"),
      callback: async () => {
        if (typeof item.displayCard === "function") return item.displayCard();
        if (typeof item.roll === "function") return item.roll();
        const content = `<h3>${item.name}</h3>${item.system?.description?.value || ""}`;
        return ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content
        });
      }
    });

    const isArmor = item.type === "armor" || Boolean(item.system?.baseProtection || item.system?.protection);
    if (isArmor) {
      const isEquipped = Boolean(item.system?.isActive || item.system?.state === "active");
      options.push({
        action: "toggle-armor",
        icon: isEquipped ? "fa-solid fa-shirt" : "fa-solid fa-shield-halved",
        label: isEquipped
          ? game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.UnequipArmor")
          : game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.EquipArmor"),
        callback: async () => {
          if (!ActorService.canUpdate(actor)) return;
          await item.update({ "system.state": isEquipped ? "other" : "active" });
          return this.render();
        }
      });
    }

    const readinessState = IndResourcesIntegration.weaponReadinessState(actor, itemId);
    if (readinessState) {
      options.push({
        action: "toggle-weapon-drawn",
        icon: readinessState.drawn ? "fa-solid fa-hand" : "fa-solid fa-khanda",
        label: readinessState.drawn
          ? game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.SheatheWeapon")
          : game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.DrawWeapon"),
        callback: async () => {
          if (readinessState.drawn) {
            await IndResourcesIntegration.sheatheWeapon(actor, itemId);
          } else {
            await IndResourcesIntegration.drawWeapon(actor, itemId);
          }
          return this.render();
        }
      });
    }

    if (isQuiverItem(item)) {
      options.push({
        action: "reload-quiver",
        icon: "fa-solid fa-arrows-rotate",
        label: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.ReloadQuiver"),
        callback: () => this.#reloadQuiver(actor, itemId)
      });
    }

    const containerId = itemRow.dataset.containerId;
    if (containerId) {
      options.push({
        action: "withdraw-from-container",
        icon: "fa-solid fa-arrow-up-from-bracket",
        label: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.WithdrawItem"),
        callback: async () => {
          const containerItem = findActorItem(actor, containerId);
          if (containerItem && isQuiverItem(containerItem)) {
            await this.#withdrawFromQuiver(actor, containerItem, itemId);
          } else {
            await IndResourcesIntegration.withdrawFromContainer(actor, itemId, containerId);
          }
          return this.render();
        }
      });
    }

    options.push({
      action: "drop-item",
      icon: "fa-solid fa-arrow-down",
      label: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.DropItem"),
      callback: async () => {
        const success = await ItemPilesIntegration.dropItem(actor, item, { containerId });
        if (success) {
          return this.render();
        }
      }
    });

    options.push({
      action: "delete-item",
      icon: "fa-solid fa-trash",
      isDestructive: true,
      label: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.DeleteItem"),
      callback: () => this.#confirmAndDeleteItem(actor, item, containerId)
    });

    for (const opt of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `symbaroum-hud-context-menu-item${opt.isDestructive ? " is-destructive" : ""}`;
      button.setAttribute("role", "menuitem");
      button.disabled = !ActorService.canUpdate(actor);

      const icon = document.createElement("i");
      icon.className = opt.icon;
      icon.setAttribute("aria-hidden", "true");

      const labelSpan = document.createElement("span");
      labelSpan.textContent = opt.label;

      button.append(icon, labelSpan);
      button.addEventListener("click", () => {
        this.#closeItemContextMenu();
        void Promise.resolve(opt.callback()).catch((err) => {
          console.error(`${MODULE_ID} | Item context menu action failed:`, err);
          ui.notifications?.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
        });
      }, { signal });

      menu.appendChild(button);
    }

    document.body.appendChild(menu);
    this.#itemContextMenuAbortController = controller;
    this.#itemContextMenuElement = menu;

    const margin = 6;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(
      margin,
      Math.min(event.clientX, window.innerWidth - bounds.width - margin)
    );
    const top = Math.max(
      margin,
      Math.min(event.clientY, window.innerHeight - bounds.height - margin)
    );
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const firstButton = menu.querySelector("button:not(:disabled)");
    firstButton?.focus?.({ preventScroll: true });

    document.addEventListener("pointerdown", (pointerEvent) => {
      if (!menu.contains(pointerEvent.target)) this.#closeItemContextMenu();
    }, { capture: true, signal });
    document.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Escape") this.#closeItemContextMenu();
    }, { signal });
    window.addEventListener("blur", () => this.#closeItemContextMenu(), { signal });
  }

  #closeItemContextMenu() {
    this.#itemContextMenuAbortController?.abort();
    this.#itemContextMenuAbortController = null;
    this.#itemContextMenuElement?.remove();
    this.#itemContextMenuElement = null;
  }

  async #confirmAndDeleteItem(actor, item, containerId = null) {
    if (!actor || !item || !ActorService.canUpdate(actor)) return;

    const itemName = item.name ?? game.i18n.localize("SYMBAROUMHUD.Empty");
    let confirmed = false;

    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (typeof DialogV2?.confirm === "function") {
      confirmed = await DialogV2.confirm({
        window: { title: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.DeleteItem") },
        content: `<p>${game.i18n.format("SYMBAROUMHUD.SimplifiedInventory.DeleteItemConfirm", { name: itemName })}</p>`,
        yes: { default: false },
        rejectClose: false
      });
    } else if (typeof Dialog?.confirm === "function") {
      confirmed = await Dialog.confirm({
        title: game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.DeleteItem"),
        content: `<p>${game.i18n.format("SYMBAROUMHUD.SimplifiedInventory.DeleteItemConfirm", { name: itemName })}</p>`,
        defaultYes: false,
        rejectClose: false
      });
    } else {
      confirmed = true;
    }

    if (!confirmed) return;

    if (containerId) {
      const containerItem = findActorItem(actor, containerId);
      if (containerItem && isQuiverItem(containerItem)) {
        const loadedAmmo = Array.isArray(containerItem.flags?.["symbaroum-hud"]?.loadedAmmo)
          ? [...containerItem.flags["symbaroum-hud"].loadedAmmo]
          : [];
        const filtered = loadedAmmo.filter((a) => (a.id ?? a) !== item.id);
        await containerItem.setFlag("symbaroum-hud", "loadedAmmo", filtered);
      }
    }

    await ActorService.deleteItem(actor, item.id);
    ui.notifications?.info?.(game.i18n.localize("SYMBAROUMHUD.SimplifiedInventory.ItemDeleted"));
    return this.render();
  }

  #dockHotbar(root, detachedHotbar = null) {
    const hotbar = detachedHotbar ?? document.getElementById("hotbar");
    const slot = root.querySelector("[data-symba-hotbar]");
    if (!hotbar || !slot) {
      if (detachedHotbar) this.#restoreHotbar();
      return;
    }

    if (!this.#hotbarAnchor && hotbar.parentNode && !root.contains(hotbar)) {
      this.#hotbarAnchor = document.createComment(`${MODULE_ID}:hotbar`);
      hotbar.parentNode.insertBefore(this.#hotbarAnchor, hotbar);
    }

    slot.appendChild(hotbar);
    for (const staleToggle of hotbar.querySelectorAll(".symbaroum-hud-collapse-toggle")) {
      staleToggle.remove();
    }
    const collapsed = root.querySelector('[data-hud-collapsed="true"]');
    const collapseToggle = root.querySelector(
      ".symbaroum-hud-card-row > .symbaroum-hud-collapse-toggle"
    );
    const rightControls = hotbar.querySelector("#hotbar-controls-right");
    if (!collapsed && collapseToggle && rightControls) {
      rightControls.before(collapseToggle);
    }
    collapseToggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.#onAction(collapseToggle, event);
    });
    refreshHotbarShortcuts(hotbar);
  }

  #restoreHotbar() {
    const hotbar = document.getElementById("hotbar");
    if (!hotbar) {
      this.#hotbarAnchor?.remove();
      this.#hotbarAnchor = null;
      return;
    }

    if (this.#hotbarAnchor?.parentNode) {
      this.#hotbarAnchor.parentNode.insertBefore(hotbar, this.#hotbarAnchor.nextSibling);
      this.#hotbarAnchor.remove();
    } else {
      document.getElementById("ui-bottom")?.prepend(hotbar);
    }
    this.#hotbarAnchor = null;
  }

  #updateHostilityTint(root) {
    const cardRow = root?.querySelector("[data-symba-weapon-drawn]");
    const active = shouldShowDangerTint(
      cardRow?.dataset.symbaWeaponDrawn === "true",
      cardRow?.dataset.vitalityState
    );

    if (!active) {
      this.#hostilityTint?.remove();
      this.#hostilityTint = null;
      return;
    }

    if (this.#hostilityTint?.isConnected) return;
    this.#hostilityTint = document.createElement("div");
    this.#hostilityTint.id = "symbaroum-hud-hostility-tint";
    this.#hostilityTint.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.#hostilityTint);
  }

  async #animateHudCollapse() {
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const root = this.element;
    const targets = [
      root?.querySelector?.(".symbaroum-hud-tactics"),
      root?.querySelector?.(".symbaroum-hud-main-column")
    ].filter((element) => typeof element?.animate === "function");
    if (!targets.length) return;

    const animations = targets.map((element) => element.animate([
      { opacity: 1, transform: "translateX(0) scaleX(1)" },
      { opacity: 0, transform: "translateX(-18px) scaleX(0.97)" }
    ], {
      duration: 180,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
      fill: "forwards"
    }));
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  }

  async #onAction(element, event) {
    const action = element.dataset.action;
    try {
      if (action === "hotbar-control") {
        const hotbarAction = element.dataset.hotbarAction;
        if (!HOTBAR_CONTROL_ACTIONS.has(hotbarAction)) return;

        document.querySelector(
          `#hotbar #hotbar-controls-left [data-action="${hotbarAction}"]`
        )?.click();
        return;
      }

      if (action === "cycle-hud-mode") {
        return this.#cycleSimplifiedHudMode();
      }

      if (action === "toggle-hud-theme") {
        const current = getTheme();
        const next = current === THEMES.SIMPLIFIED ? THEMES.CLASSIC : THEMES.SIMPLIFIED;
        await setTheme(next);
        return;
      }

      if (action === "toggle-players") {
        const wasHidden = document.body.classList.contains("symbaroum-hud-hide-players");
        const hidden = !wasHidden;
        applyPlayerListVisibility(hidden);
        this.#updatePlayerToggle(element, hidden);

        try {
          await game.settings.set(MODULE_ID, SETTINGS.HIDE_PLAYERS, hidden);
        } catch (error) {
          applyPlayerListVisibility(wasHidden);
          this.#updatePlayerToggle(element, wasHidden);
          throw error;
        }
        return;
      }

      if (action === "toggle-hud-collapse") {
        if (this.#collapseAnimationRunning) return;
        const collapsed = !Boolean(getSetting(SETTINGS.COLLAPSED));
        this.#collapseAnimationRunning = true;
        this.#collapseTransition = collapsed ? "collapse" : "expand";
        try {
          await game.settings.set(MODULE_ID, SETTINGS.COLLAPSED, collapsed);
          if (collapsed) {
            await this.#animateHudCollapse();
            this.#abilitiesOpen = false;
            this.#attacksOpen = false;
            this.#mysticalPowersOpen = false;
            this.#ritualsOpen = false;
            this.#storageOpen = false;
            this.#traitsOpen = false;
          }
          return await this.render();
        } finally {
          this.#collapseTransition = null;
          this.#collapseAnimationRunning = false;
        }
      }

      if (action === "toggle-tactics") {
        this.#tacticsCollapsed = !this.#tacticsCollapsed;
        const section = element.closest(".symbaroum-hud-tactics, .symbaroum-hud-simplified-tactics");
        const content = section?.querySelector(".symbaroum-hud-tactics-content, .symbaroum-hud-simplified-tactics-content");
        section?.setAttribute("data-tactics-collapsed", String(this.#tacticsCollapsed));
        content?.setAttribute("aria-hidden", String(this.#tacticsCollapsed));
        const toggleBtn = section?.querySelector('button[data-action="toggle-tactics"]') ?? element;
        toggleBtn?.setAttribute("aria-expanded", String(!this.#tacticsCollapsed));
        const label = game.i18n.localize(this.#tacticsCollapsed
          ? "SYMBAROUMHUD.Actions.ShowTactics"
          : "SYMBAROUMHUD.Actions.HideTactics");
        toggleBtn?.setAttribute("aria-label", label);
        if (toggleBtn?.dataset) toggleBtn.dataset.tooltip = label;
        const header = section?.querySelector(".symbaroum-hud-simplified-tactics-header");
        if (header) {
          header.setAttribute("aria-label", label);
          if (header.dataset) header.dataset.tooltip = label;
        }
        const icon = section?.querySelector('[data-action="toggle-tactics"] i') ?? element.querySelector("i");
        if (icon) icon.className = `fa-solid ${this.#tacticsCollapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
        return;
      }

      if (action === "set-actor") {
        if (event?.button === 2) {
          this.#manualActorKey = null;
          this.#actor = ActorService.resolve(getSetting(SETTINGS.SELECTION_MODE));
          return this.render();
        }

        const controlled = canvas?.tokens?.controlled?.map((t) => t.actor).find((a) => ActorService.isUsable(a));
        if (controlled) {
          if (this.#manualActorKey === actorKey(controlled)) {
            this.#manualActorKey = null;
            this.#actor = ActorService.resolve(getSetting(SETTINGS.SELECTION_MODE));
            return this.render();
          }
          return this.#activateManualActor(controlled);
        }

        if (this.#manualActorKey) {
          this.#manualActorKey = null;
          this.#actor = ActorService.resolve(getSetting(SETTINGS.SELECTION_MODE));
          return this.render();
        }

        const owned = ActorService.ownedActors(this.#actor);
        if (owned.length > 1) {
          return this.#cycleActor(1);
        }

        ui.notifications?.info?.(game.i18n?.localize?.("SYMBAROUMHUD.Actions.SetActorUnpinned") ?? "Selecione um token no mapa para fixar no HUD.");
        return;
      }

      const actor = this.#actor;
      if (!actor) return;

      if (action === "toggle-actor-picker") {
        const choices = game.user?.isGM ? [] : ActorService.ownedActors(actor);
        if (choices.length < 2) return actor.sheet?.render(true);
        this.#actorPickerOpen = !this.#actorPickerOpen;
        return this.render();
      }
      if (action === "select-owned-actor") {
        const selected = ActorService.ownedActors(actor)
          .find((candidate) => actorKey(candidate) === element.dataset.actorId);
        if (!selected) return;
        return this.#activateManualActor(selected);
      }
      if (action === "previous-actor") return this.#cycleActor(-1);
      if (action === "next-actor") return this.#cycleActor(1);
      if (action === "open-actor") return actor.sheet?.render(true);
      if (action === "toggle-storage") {
        if (this.#storageOpen) this.#storageOpen = false;
        else {
          this.#abilitiesOpen = false;
          this.#attacksOpen = false;
          this.#mysticalPowersOpen = false;
          this.#ritualsOpen = false;
          this.#traitsOpen = false;
          this.#storageContainerId = null;
          this.#storageOpen = true;
        }
        return this.render();
      }
      if (action === "toggle-abilities") {
        if (this.#abilitiesOpen) this.#abilitiesOpen = false;
        else {
          this.#attacksOpen = false;
          this.#mysticalPowersOpen = false;
          this.#storageOpen = false;
          this.#ritualsOpen = false;
          this.#traitsOpen = false;
          this.#abilitiesOpen = true;
        }
        return this.render();
      }
      if (action === "toggle-mystical-powers") {
        if (this.#mysticalPowersOpen) this.#mysticalPowersOpen = false;
        else {
          this.#abilitiesOpen = false;
          this.#attacksOpen = false;
          this.#storageOpen = false;
          this.#ritualsOpen = false;
          this.#traitsOpen = false;
          this.#mysticalPowersOpen = true;
        }
        return this.render();
      }
      if (action === "toggle-rituals") {
        if (this.#ritualsOpen) this.#ritualsOpen = false;
        else {
          this.#abilitiesOpen = false;
          this.#attacksOpen = false;
          this.#mysticalPowersOpen = false;
          this.#storageOpen = false;
          this.#traitsOpen = false;
          this.#ritualsOpen = true;
        }
        return this.render();
      }
      if (action === "toggle-traits") {
        if (this.#traitsOpen) this.#traitsOpen = false;
        else {
          this.#abilitiesOpen = false;
          this.#attacksOpen = false;
          this.#mysticalPowersOpen = false;
          this.#ritualsOpen = false;
          this.#storageOpen = false;
          this.#traitsOpen = true;
        }
        return this.render();
      }
      if (action === "toggle-attacks") {
        if (this.#attacksOpen) this.#attacksOpen = false;
        else {
          this.#abilitiesOpen = false;
          this.#mysticalPowersOpen = false;
          this.#storageOpen = false;
          this.#ritualsOpen = false;
          this.#traitsOpen = false;
          this.#attacksOpen = true;
        }
        return this.render();
      }
      if (action === "close-attacks") {
        this.#attacksOpen = false;
        return this.render();
      }
      if (action === "close-abilities") {
        this.#abilitiesOpen = false;
        return this.render();
      }
      if (action === "close-mystical-powers") {
        this.#mysticalPowersOpen = false;
        return this.render();
      }
      if (action === "close-rituals") {
        this.#ritualsOpen = false;
        return this.render();
      }
      if (action === "close-traits") {
        this.#traitsOpen = false;
        return this.render();
      }
      if (action === "select-ability") {
        this.#abilitiesOpen = true;
        this.#attacksOpen = false;
        this.#mysticalPowersOpen = false;
        this.#ritualsOpen = false;
        this.#storageOpen = false;
        this.#traitsOpen = false;
        this.#selectedAbilityId = element.dataset.itemId || null;
        this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
        return this.render();
      }
      if (action === "select-mystical-power") {
        this.#abilitiesOpen = false;
        this.#attacksOpen = false;
        this.#storageOpen = false;
        this.#ritualsOpen = false;
        this.#traitsOpen = false;
        this.#mysticalPowersOpen = true;
        this.#selectedMysticalPowerId = element.dataset.itemId || null;
        this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
        return this.render();
      }
      if (action === "select-ritual") {
        this.#abilitiesOpen = false;
        this.#attacksOpen = false;
        this.#mysticalPowersOpen = false;
        this.#storageOpen = false;
        this.#traitsOpen = false;
        this.#ritualsOpen = true;
        this.#selectedRitualId = element.dataset.itemId || null;
        return this.render();
      }
      if (action === "select-trait") {
        this.#abilitiesOpen = false;
        this.#attacksOpen = false;
        this.#mysticalPowersOpen = false;
        this.#ritualsOpen = false;
        this.#storageOpen = false;
        this.#traitsOpen = true;
        this.#selectedTraitId = element.dataset.itemId || null;
        this.#selectedTraitTab = DEFAULT_ABILITY_TAB;
        return this.render();
      }
      if (action === "select-ability-tab") {
        this.#abilitiesOpen = true;
        this.#attacksOpen = false;
        this.#mysticalPowersOpen = false;
        this.#ritualsOpen = false;
        this.#storageOpen = false;
        this.#traitsOpen = false;
        this.#selectedAbilityTab = element.dataset.abilityTab || DEFAULT_ABILITY_TAB;
        return this.render();
      }
      if (action === "select-mystical-power-tab") {
        this.#abilitiesOpen = false;
        this.#attacksOpen = false;
        this.#storageOpen = false;
        this.#ritualsOpen = false;
        this.#traitsOpen = false;
        this.#mysticalPowersOpen = true;
        this.#selectedMysticalPowerTab = element.dataset.abilityTab || DEFAULT_ABILITY_TAB;
        return this.render();
      }
      if (action === "select-trait-tab") {
        this.#abilitiesOpen = false;
        this.#attacksOpen = false;
        this.#mysticalPowersOpen = false;
        this.#ritualsOpen = false;
        this.#storageOpen = false;
        this.#traitsOpen = true;
        this.#selectedTraitTab = element.dataset.abilityTab || DEFAULT_ABILITY_TAB;
        return this.render();
      }
      if (action === "toggle-ability-level") {
        await ActorService.setAbilityLevelActive(
          actor,
          element.dataset.itemId,
          element.dataset.abilityLevel,
          element.dataset.active !== "true"
        );
        return this.render();
      }
      if (action === "close-storage") {
        this.#storageOpen = false;
        return this.render();
      }
      if (action === "toggle-storage-view") {
        const nextMode = getStorageViewMode() === STORAGE_VIEW_MODES.GRID
          ? STORAGE_VIEW_MODES.LIST
          : STORAGE_VIEW_MODES.GRID;
        await game.settings.set(MODULE_ID, SETTINGS.STORAGE_VIEW_MODE, nextMode);
        return this.render();
      }
      if (action === "open-shop") {
        return SymbaroumCompendiumBrowser.openShop({ actor });
      }
      if (action === "open-weapon-shop") {
        return SymbaroumCompendiumBrowser.openShop({
          actor,
          category: "weapon",
          lockCategory: true
        });
      }
      if (action === "select-storage-container") {
        this.#abilitiesOpen = false;
        this.#attacksOpen = false;
        this.#mysticalPowersOpen = false;
        this.#ritualsOpen = false;
        this.#traitsOpen = false;
        this.#storageContainerId = element.dataset.containerId || null;
        this.#storageOpen = true;
        return this.render();
      }
      if (action === "open-storage-item") {
        return IndResourcesIntegration.openStorageItem(
          actor,
          element.dataset.containerId,
          element.dataset.itemId
        );
      }
      if (action === "change-storage-quantity") {
        await IndResourcesIntegration.changeStorageItemQuantity(
          actor,
          element.dataset.containerId || null,
          element.dataset.itemId,
          element.dataset.quantityDelta
        );
        return this.render();
      }
      if (action === "toggle-storage-item-state") {
        await IndResourcesIntegration.toggleStorageItemState(
          actor,
          element.dataset.containerId || null,
          element.dataset.itemId
        );
        return this.render();
      }
      if (action === "delete-storage-item") {
        return IndResourcesIntegration.deleteStorageItem(
          actor,
          element.dataset.containerId,
          element.dataset.itemId
        );
      }
      if (action === "use-service-record") {
        const record = await useActorService(actor, element.dataset.serviceRecordId);
        if (record) ui.notifications?.info(game.i18n.format("SYMBAROUMHUD.Services.UsedNotice", {
          service: record.name,
          actor: actor.name
        }));
        return this.render();
      }
      if (action === "remove-service-record") {
        if (!game.user?.isGM) return null;
        const removed = await removeActorService(actor, element.dataset.serviceRecordId);
        if (removed) ui.notifications?.info(game.i18n.localize("SYMBAROUMHUD.Services.RemovedNotice"));
        return this.render();
      }
      if (action === "reload-quiver") {
        return IndResourcesIntegration.reloadQuiver(actor, element.dataset.quiverId);
      }
      if (action === "open-money") {
        return IndResourcesIntegration.openMoney(actor);
      }
      if (action === "maneuver") {
        return this.#openManeuverDialog(actor);
      }
      if (action === "execute-maneuver") {
        const maneuverId = element.dataset.maneuverId;
        if (!actor || !maneuverId) return null;
        return IndResourcesIntegration.executeManeuver(actor, maneuverId);
      }
      if (action === "show-maneuver-info") {
        const maneuverId = element.dataset.maneuverId;
        const allManeuvers = IndResourcesIntegration.maneuvers();
        const found = allManeuvers.find((m) => m.id === maneuverId);
        if (found) {
          const notes = Array.isArray(found.notes) ? found.notes.join("<br><br>") : (found.notes || "");
          return new Dialog({
            title: found.label,
            content: `<div style="padding: 10px 6px; font-size: 13px; line-height: 1.5; color: #e5dec9;">${notes}</div>`,
            buttons: {
              roll: {
                icon: '<i class="fa-solid fa-dice-d20"></i>',
                label: game.i18n.localize("SYMBAROUMHUD.Maneuvers.Roll"),
                callback: () => IndResourcesIntegration.executeManeuver(actor, maneuverId)
              },
              close: {
                icon: '<i class="fa-solid fa-xmark"></i>',
                label: game.i18n.localize("SYMBAROUMHUD.Actions.Close")
              }
            },
            default: "roll"
          }).render(true);
        }
        return null;
      }
      if (action === "add-ability") {
        return this.#openAddAbilityDialog(actor);
      }
      if (action === "add-ritual") {
        return this.#openAddRitualDialog(actor);
      }
      if (action === "reroll-cost") {
        return this.#openRerollCostDialog(actor);
      }
      if (action === "use-ability") {
        return ActorService.usePower(actor, element.dataset.itemId);
      }
      if (action === "use-mystical-power") {
        return ActorService.usePower(actor, element.dataset.itemId);
      }
      if (action === "use-trait") {
        return ActorService.usePower(actor, element.dataset.itemId);
      }
      if (action === "open-ability") {
        return ActorService.openItem(actor, element.dataset.itemId);
      }
      if (action === "open-mystical-power") {
        return ActorService.openItem(actor, element.dataset.itemId);
      }
      if (action === "open-ritual") {
        return ActorService.openItem(actor, element.dataset.itemId);
      }
      if (action === "open-trait") {
        return ActorService.openItem(actor, element.dataset.itemId);
      }
      if (action === "use-ritual") {
        return ActorService.usePower(actor, element.dataset.itemId);
      }
      if (action === "select-power-card") {
        const itemId = element.dataset.itemId;
        this.#simplifiedPowersSelectedItemId = this.#simplifiedPowersSelectedItemId === itemId ? null : itemId;
        return this.render();
      }
      if (action === "close-power-card") {
        this.#simplifiedPowersSelectedItemId = null;
        return this.render();
      }
      if (action === "open-power-sheet") {
        return ActorService.openItem(actor, element.dataset.itemId);
      }
      if (action === "post-power-card") {
        const itemId = element.dataset.itemId;
        const item = findActorItem(actor, itemId);
        if (!item) return null;
        if (typeof item.displayCard === "function") {
          return item.displayCard();
        }
        const { tier, tierLabel } = getActiveTierInfo(item);
        const desc = resolvePowerDescription(item, tier);
        const speaker = typeof ChatMessage?.getSpeaker === "function"
          ? ChatMessage.getSpeaker({ actor })
          : { actor: actor.id, alias: actor.name };
        const badgeHtml = tierLabel ? `<span style="display:inline-block; padding:1px 5px; font-size:10px; font-weight:bold; background:rgba(197,174,69,0.2); border:1px solid rgba(197,174,69,0.5); border-radius:3px; color:#c5ae45; text-transform:uppercase; margin-bottom:4px;">${tierLabel}</span>` : "";
        return ChatMessage.create({
          speaker,
          flavor: `<div class="symbaroum-hud-roll-flavor"><strong>${actor.name}</strong>: ${item.name}</div>`,
          content: `
            <div class="symbaroum-hud-chat-card" style="padding:6px 8px; font-size:12px; line-height:1.45;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
                <img src="${item.img || ''}" width="28" height="28" style="border-radius:3px; object-fit:cover; border:1px solid rgba(255,255,255,0.2);"/>
                <div>
                  <div style="font-weight:bold; font-size:13px; color:#fff;">${item.name}</div>
                  ${badgeHtml}
                </div>
              </div>
              <div style="color:#d1d5db;">${desc || item.name}</div>
            </div>
          `
        });
      }
      if (action === "toggle-simplified-actions") {
        this.#simplifiedActionsOpen = !this.#simplifiedActionsOpen;
        if (this.#simplifiedActionsOpen) {
          this.#simplifiedInventoryOpen = false;
          this.#simplifiedPowersOpen = false;
        }
        return this.render();
      }
      if (action === "close-simplified-actions") {
        this.#simplifiedActionsOpen = false;
        return this.render();
      }
      if (action === "toggle-simplified-inventory") {
        this.#simplifiedInventoryOpen = !this.#simplifiedInventoryOpen;
        if (this.#simplifiedInventoryOpen) {
          this.#simplifiedActionsOpen = false;
          this.#simplifiedPowersOpen = false;
        }
        return this.render();
      }
      if (action === "close-simplified-inventory") {
        this.#simplifiedInventoryOpen = false;
        return this.render();
      }
      if (action === "toggle-simplified-powers") {
        this.#simplifiedPowersOpen = !this.#simplifiedPowersOpen;
        if (this.#simplifiedPowersOpen) {
          this.#simplifiedActionsOpen = false;
          this.#simplifiedInventoryOpen = false;
        }
        return this.render();
      }
      if (action === "close-simplified-powers") {
        this.#simplifiedPowersOpen = false;
        return this.render();
      }
      if (action === "toggle-simplified-container") {
        const containerId = element.dataset.containerId;
        if (!containerId) return;
        const containerItem = findActorItem(actor, containerId);
        const currentlyCollapsed = this.#isSimplifiedContainerCollapsed(actor, { id: containerId });
        if (currentlyCollapsed) {
          this.#simplifiedCollapsedContainers.delete(containerId);
          this.#simplifiedOpenContainers.add(containerId);
          if (containerItem && IndResourcesIntegration.api?.containers?.toggleContainer) {
            if (!IndResourcesIntegration.api.containers.isContainerExpanded?.(actor, containerItem)) {
              await IndResourcesIntegration.api.containers.toggleContainer(actor, containerItem).catch(() => undefined);
            }
          }
        } else {
          this.#simplifiedOpenContainers.delete(containerId);
          this.#simplifiedCollapsedContainers.add(containerId);
          if (containerItem && IndResourcesIntegration.api?.containers?.toggleContainer) {
            if (IndResourcesIntegration.api.containers.isContainerExpanded?.(actor, containerItem)) {
              await IndResourcesIntegration.api.containers.toggleContainer(actor, containerItem).catch(() => undefined);
            }
          }
        }
        return this.render();
      }
      if (action === "withdraw-from-container") {
        const itemId = element.dataset.itemId;
        const containerId = element.dataset.containerId;
        if (!itemId || !containerId) return;
        const containerItem = findActorItem(actor, containerId);
        if (containerItem && isQuiverItem(containerItem)) {
          await this.#withdrawFromQuiver(actor, containerItem, itemId);
          return this.render();
        }
        await IndResourcesIntegration.withdrawFromContainer(actor, itemId, containerId);
        return this.render();
      }
      if (action === "reload-quiver") {
        const containerId = element.dataset.containerId;
        if (!containerId) return;
        return this.#reloadQuiver(actor, containerId);
      }
      if (action === "toggle-armor-equip") {
        const item = findActorItem(actor, element.dataset.itemId);
        if (!item || !ActorService.canUpdate(actor)) return null;
        const isCurrentlyActive = Boolean(item.system?.isActive || item.system?.state === "active");
        const nextState = isCurrentlyActive ? "other" : "active";
        await item.update({ "system.state": nextState });
        return this.render();
      }
      if (action === "change-item-quantity") {
        const delta = Number(element.dataset.delta ?? 0);
        return this.#changeItemQuantity(actor, element.dataset.itemId, delta);
      }
      if (action === "open-item") {
        return ActorService.openItem(actor, element.dataset.itemId);
      }
      if (action === "use-item") {
        const item = findActorItem(actor, element.dataset.itemId);
        if (!item) return null;
        const isRation = /\b(pao|pão|waybread|travel\s+bread|racao|ração|ration)\b/i.test(item.name)
          || Boolean(item.flags?.["symbaroum-ind-resources"]?.isRation)
          || Boolean(safeCall(() => IndResourcesIntegration.api?.rations?.isRation?.(item)));
        if (isRation && IndResourcesIntegration.api?.rations?.consumeDay) {
          const res = await IndResourcesIntegration.api.rations.consumeDay(actor, item);
          void this.render();
          return res;
        }
        if (typeof item.roll === "function") return item.roll();
        if (typeof item.use === "function") return item.use();
        if (typeof item.displayCard === "function") return item.displayCard();
        return ActorService.openItem(actor, element.dataset.itemId);
      }
      if (action === "roll-weapon") {
        return this.#rollWeapon(actor, element.dataset.itemId);
      }
      if (action === "draw-weapon") {
        const drawn = await IndResourcesIntegration.drawWeapon(
          actor,
          element.dataset.itemId
        );
        if (drawn) return this.render();
        return null;
      }
      if (action === "sheathe-weapon") {
        const sheathed = await IndResourcesIntegration.sheatheWeapon(
          actor,
          element.dataset.itemId
        );
        if (sheathed) return this.render();
        return null;
      }
      if (action === "modify-vitality") {
        return this.#openVitalityDialog(actor);
      }
      if (action === "modify-corruption") {
        return this.#openCorruptionDialog(actor);
      }
      if (action === "roll-attribute") {
        return ActorService.rollAttribute(actor, element.dataset.attribute);
      }
      if (action === "roll-defense") return ActorService.rollArmor(actor);
      if (action === "roll-armor-protection") return ActorService.rollArmorProtection(actor, element.dataset.itemId);
      if (action === "consume-ration") {
        return IndResourcesIntegration.execute("rations", actor);
      }
      if (action === "recover-ammo") {
        await IndResourcesIntegration.recoverAmmo(actor);
        return this.render();
      }
      if (action === "death-test") {
        return ActorService.rollDeathTest(actor, { showDialog: Boolean(event?.shiftKey) });
      }
      if (action === "death-recovery") return ActorService.recoverDeath(actor);
      if (action === "rest") return IndResourcesIntegration.execute("rest", actor);
      if (action === "weapon-readiness") {
        return IndResourcesIntegration.execute("readiness", actor);
      }
      if (action === "open-effect-menu") {
        return this.#openEffectMenu(element.dataset.effectId, event);
      }
      if (action === "remove-effect") {
        return ActorService.removeEffect(actor, element.dataset.effectId);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | HUD action failed.`, error);
      ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
    }
  }

  async #cycleSimplifiedHudMode() {
    const current = getSimplifiedHudMode();
    const modes = [
      SIMPLIFIED_HUD_MODES.FULL,
      SIMPLIFIED_HUD_MODES.MINIMAL,
      SIMPLIFIED_HUD_MODES.HIDDEN
    ];
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    await game.settings.set(MODULE_ID, SETTINGS.SIMPLIFIED_HUD_MODE, next);
    return this.render({ force: true });
  }

  async #rollWeapon(actor, itemId) {
    const readiness = IndResourcesIntegration.weaponReadinessState(actor, itemId);
    if (!readiness || readiness.drawn) {
      return ActorService.rollWeapon(actor, itemId);
    }

    const confirmed = await globalThis.Dialog.confirm({
      title: game.i18n.localize("SYMBAROUMHUD.Attacks.DrawPromptTitle"),
      content: `
        <div class="symbaroum-hud-draw-weapon-dialog">
          <p>${escapeHtml(game.i18n.format("SYMBAROUMHUD.Attacks.DrawPrompt", {
            weapon: readiness.name
          }))}</p>
          <p class="symbaroum-hud-draw-weapon-warning">
            <i class="fa-solid fa-person-running" aria-hidden="true"></i>
            <strong>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Attacks.DrawMovementReminder"))}</strong>
          </p>
        </div>
      `,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });
    if (!confirmed) return null;

    const drawn = await IndResourcesIntegration.drawWeapon(actor, itemId);
    if (!drawn) return null;
    return this.render();
  }

  async #changeItemQuantity(actor, itemId, delta) {
    const item = findActorItem(actor, itemId);
    if (!item || !ActorService.canUpdate(actor) || !Number.isFinite(delta)) return null;
    const currentQuantity = Math.max(0, Math.trunc(Number(item.system?.number ?? 1)));
    const nextQuantity = Math.max(0, currentQuantity + Math.trunc(delta));
    if (nextQuantity === currentQuantity) return item;
    await item.update({ "system.number": nextQuantity });
    return this.render();
  }

  async #reloadQuiver(actor, quiverId) {
    if (!actor || !quiverId) return;

    if (typeof IndResourcesIntegration.api?.ammo?.reloadQuiverPrompt === "function") {
      const res = await IndResourcesIntegration.reloadQuiver(actor, quiverId);
      void this.render();
      return res;
    }

    const quiverItem = findActorItem(actor, quiverId);
    if (!quiverItem) return;

    const capacityLimit = 12;
    let loadedAmmo = Array.from(quiverItem.flags?.["symbaroum-ind-resources"]?.loadedAmmo ?? []);
    let currentLoaded = loadedAmmo.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
    if (!loadedAmmo.length) {
      currentLoaded = Number(quiverItem.flags?.["symbaroum-ind-resources"]?.usesRemaining ?? quiverItem.system?.uses?.value ?? 0);
    }
    const allItems = Array.from(actor.items?.values?.() ?? actor.items ?? []);
    const storedInQuiver = allItems.filter((i) => (
      String(i.flags?.["symbaroum-ind-resources"]?.storedIn) === quiverId
      || String(i.system?.storedIn) === quiverId
    ));
    for (const item of storedInQuiver) {
      currentLoaded += Math.max(1, Number(item.system?.number ?? 1));
    }

    const remainingCapacity = Math.max(0, capacityLimit - currentLoaded);
    if (remainingCapacity <= 0) {
      ui.notifications?.warn(game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedInventory.QuiverFull") ?? "A aljava está cheia (12/12 flechas).");
      return;
    }

    const looseAmmoItems = allItems.filter((item) => (
      isAmmoItem(item)
      && !isQuiverItem(item)
      && Number(item.system?.number ?? 1) > 0
      && !item.flags?.["symbaroum-ind-resources"]?.storedIn
      && !item.system?.storedIn
    ));

    if (!looseAmmoItems.length) {
      ui.notifications?.warn(game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedInventory.NoAmmoAvailable") ?? "Nenhuma flecha disponível no inventário.");
      return;
    }

    if (looseAmmoItems.length === 1) {
      const loose = looseAmmoItems[0];
      const looseQty = Math.max(1, Number(loose.system?.number ?? 1));
      const toLoad = Math.min(remainingCapacity, looseQty);

      const nextLooseQty = looseQty - toLoad;
      if (nextLooseQty <= 0) {
        if (typeof loose.delete === "function") await loose.delete();
        else if (actor.deleteEmbeddedDocuments) await actor.deleteEmbeddedDocuments("Item", [loose.id]);
      } else {
        if (typeof loose.update === "function") await loose.update({ "system.number": nextLooseQty });
        else if (actor.updateEmbeddedDocuments) await actor.updateEmbeddedDocuments("Item", [{ _id: loose.id, "system.number": nextLooseQty }]);
      }

      const existingEntry = loadedAmmo.find((e) => e.name === loose.name);
      if (existingEntry) {
        existingEntry.quantity = (Number(existingEntry.quantity) || 0) + toLoad;
      } else {
        loadedAmmo.push({
          id: loose.id,
          name: loose.name,
          img: loose.img || "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
          quantity: toLoad,
          sourceUuid: loose.uuid || ""
        });
      }

      await quiverItem.setFlag("symbaroum-ind-resources", "loadedAmmo", loadedAmmo);
      ui.notifications?.info(
        game.i18n?.format?.("TENEBRE.Ammo.ReloadSuccess", { loaded: toLoad, ammo: loose.name })
        ?? `${toLoad}x ${loose.name} recarregada(s) na aljava.`
      );
      return this.render();
    }

    const optionsHtml = looseAmmoItems.map((item) => (
      `<option value="${item.id}">${item.name} (${item.system?.number ?? 1}x)</option>`
    )).join("");

    const content = `
      <form class="symbaroum-hud-quiver-reload-form">
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="display:block; margin-bottom: 4px; font-weight: bold;">${game.i18n?.localize?.("TENEBRE.Ammo.ReloadChooseAmmo") ?? "Escolha a munição"}:</label>
          <select name="ammoId" style="width: 100%;">${optionsHtml}</select>
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="display:block; margin-bottom: 4px; font-weight: bold;">${game.i18n?.localize?.("TENEBRE.Ammo.ReloadQuantity") ?? "Quantidade"}:</label>
          <input type="number" name="quantity" min="1" max="${remainingCapacity}" value="${Math.min(remainingCapacity, Number(looseAmmoItems[0].system?.number ?? 1))}" style="width: 100%;">
          <small style="color: #888;">Capacidade restante: ${remainingCapacity} flecha(s)</small>
        </div>
      </form>
    `;

    if (globalThis.Dialog?.prompt) {
      const selected = await globalThis.Dialog.prompt({
        title: game.i18n?.localize?.("SYMBAROUMHUD.SimplifiedInventory.ReloadQuiver") ?? "Recarregar Aljava",
        content,
        label: game.i18n?.localize?.("TENEBRE.Common.Confirm") ?? "Confirmar",
        callback: (html) => {
          const form = html[0].querySelector("form") || html[0];
          const ammoId = form.querySelector('[name="ammoId"]')?.value;
          const qty = Number(form.querySelector('[name="quantity"]')?.value) || 0;
          return { ammoId, qty };
        },
        rejectClose: false
      });

      if (!selected?.ammoId || !selected?.qty) return;

      const loose = looseAmmoItems.find((i) => i.id === selected.ammoId);
      if (!loose) return;

      const looseQty = Math.max(1, Number(loose.system?.number ?? 1));
      const toLoad = Math.min(remainingCapacity, looseQty, Math.max(1, selected.qty));

      const nextLooseQty = looseQty - toLoad;
      if (nextLooseQty <= 0) {
        if (typeof loose.delete === "function") await loose.delete();
        else if (actor.deleteEmbeddedDocuments) await actor.deleteEmbeddedDocuments("Item", [loose.id]);
      } else {
        if (typeof loose.update === "function") await loose.update({ "system.number": nextLooseQty });
        else if (actor.updateEmbeddedDocuments) await actor.updateEmbeddedDocuments("Item", [{ _id: loose.id, "system.number": nextLooseQty }]);
      }

      const existingEntry = loadedAmmo.find((e) => e.name === loose.name);
      if (existingEntry) {
        existingEntry.quantity = (Number(existingEntry.quantity) || 0) + toLoad;
      } else {
        loadedAmmo.push({
          id: loose.id,
          name: loose.name,
          img: loose.img || "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
          quantity: toLoad,
          sourceUuid: loose.uuid || ""
        });
      }

      await quiverItem.setFlag("symbaroum-ind-resources", "loadedAmmo", loadedAmmo);
      ui.notifications?.info(
        game.i18n?.format?.("TENEBRE.Ammo.ReloadSuccess", { loaded: toLoad, ammo: loose.name })
        ?? `${toLoad}x ${loose.name} recarregada(s) na aljava.`
      );
      return this.render();
    }
  }

  async #withdrawFromQuiver(actor, quiverItem, entryId) {
    if (!actor || !quiverItem || !entryId) return;

    let loadedAmmo = Array.from(quiverItem.flags?.["symbaroum-ind-resources"]?.loadedAmmo ?? []);
    const entryIndex = loadedAmmo.findIndex((e, idx) => e.id === entryId || `loaded-${idx}` === entryId || e.name === entryId);

    if (entryIndex >= 0) {
      const entry = loadedAmmo[entryIndex];
      const qtyToWithdraw = Number(entry.quantity) || 1;
      loadedAmmo.splice(entryIndex, 1);
      await quiverItem.setFlag("symbaroum-ind-resources", "loadedAmmo", loadedAmmo);

      const allItems = Array.from(actor.items?.values?.() ?? actor.items ?? []);
      const existingLoose = allItems.find((i) => i.name === entry.name && !i.flags?.["symbaroum-ind-resources"]?.storedIn && !i.system?.storedIn);
      if (existingLoose) {
        const curQty = Number(existingLoose.system?.number ?? 1);
        if (typeof existingLoose.update === "function") {
          await existingLoose.update({ "system.number": curQty + qtyToWithdraw });
        } else if (actor.updateEmbeddedDocuments) {
          await actor.updateEmbeddedDocuments("Item", [{ _id: existingLoose.id, "system.number": curQty + qtyToWithdraw }]);
        }
      } else {
        if (actor.createEmbeddedDocuments) {
          await actor.createEmbeddedDocuments("Item", [{
            name: entry.name,
            type: "equipment",
            img: entry.img || "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
            system: { number: qtyToWithdraw }
          }]);
        }
      }
      return;
    }

    const physicalItem = findActorItem(actor, entryId);
    if (physicalItem) {
      if (typeof physicalItem.unsetFlag === "function") {
        await physicalItem.unsetFlag("symbaroum-ind-resources", "storedIn");
      }
      if (physicalItem.system?.storedIn && typeof physicalItem.update === "function") {
        await physicalItem.update({ "system.storedIn": "" });
      }
    }
  }


  #openVitalityDialog(actor) {
    if (!ActorService.canUpdate(actor)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }

    const vitality = actor.system?.health?.toughness ?? {};
    const current = number(vitality.value);
    const max = number(vitality.max);
    const content = `
      <form class="symbaroum-hud-vitality-dialog">
        <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Vitality.Prompt"))}</p>
        <div class="symbaroum-hud-vitality-current">
          <i class="fa-solid fa-heart" aria-hidden="true"></i>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Vitality.Current"))}</span>
          <strong>${current}/${max}</strong>
        </div>
        <label>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Vitality.Amount"))}</span>
          <input type="text" name="vitalityAmount" value="" inputmode="numeric"
            pattern="[+-]?[0-9]+" placeholder="+3 / -9" required autofocus>
        </label>
      </form>
    `;
    const change = async (html, direction = null) => {
      const root = html?.[0] ?? html;
      const value = root?.querySelector?.("input[name='vitalityAmount']")?.value;
      const delta = parseVitalityDelta(value, direction);
      if (delta === null) return false;
      await ActorService.adjust(
        actor,
        "system.health.toughness.value",
        delta
      );
      await this.render();
      return true;
    };

    const dialog = new Dialog({
      title: game.i18n.localize("SYMBAROUMHUD.Vitality.Title"),
      content,
      buttons: {
        heal: {
          icon: '<i class="fa-solid fa-heart-circle-plus" aria-hidden="true"></i>',
          label: game.i18n.localize("SYMBAROUMHUD.Vitality.Heal"),
          callback: (html) => change(html, 1)
        },
        damage: {
          icon: '<i class="fa-solid fa-heart-crack" aria-hidden="true"></i>',
          label: game.i18n.localize("SYMBAROUMHUD.Vitality.Damage"),
          callback: (html) => change(html, -1)
        },
        cancel: {
          label: game.i18n.localize("Cancel")
        }
      },
      render: (html) => {
        const root = html?.[0] ?? html;
        const input = root?.querySelector?.("input[name='vitalityAmount']");
        input?.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.stopPropagation();
          if (await change(html)) await dialog.close();
        });
      },
      default: "cancel"
    });
    dialog.render(true);
  }

  #openCorruptionDialog(actor) {
    if (!ActorService.canUpdate(actor)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }

    const corruption = actor.system?.health?.corruption ?? {};
    const temporary = number(corruption.temporary);
    const permanent = number(corruption.permanent);
    const max = number(corruption.max);
    const content = `
      <form class="symbaroum-hud-corruption-dialog">
        <p>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Corruption.Prompt"))}</p>
        <div class="symbaroum-hud-corruption-current">
          <i class="fa-solid fa-droplet" aria-hidden="true"></i>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Corruption.Current"))}</span>
          <strong>${temporary}+${permanent}/${max}</strong>
        </div>
        <label>
          <span>${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Corruption.Amount"))}</span>
          <input type="number" name="corruptionAmount" value="1" min="1" step="1" required autofocus>
        </label>
      </form>
    `;
    const change = async (html, direction) => {
      const root = html?.[0] ?? html;
      const value = Number(root?.querySelector?.("input[name='corruptionAmount']")?.value);
      if (!Number.isFinite(value) || value <= 0) return null;
      const amount = Math.max(1, Math.floor(value));
      await ActorService.adjust(
        actor,
        "system.health.corruption.temporary",
        direction * amount
      );
      return this.render();
    };

    const dialog = new Dialog({
      title: game.i18n.localize("SYMBAROUMHUD.Corruption.Title"),
      content,
      buttons: {
        reduce: {
          icon: '<i class="fa-solid fa-minus" aria-hidden="true"></i>',
          label: game.i18n.localize("SYMBAROUMHUD.Corruption.Reduce"),
          callback: (html) => change(html, -1)
        },
        gain: {
          icon: '<i class="fa-solid fa-droplet" aria-hidden="true"></i>',
          label: game.i18n.localize("SYMBAROUMHUD.Corruption.Gain"),
          callback: (html) => change(html, 1)
        },
        cancel: {
          label: game.i18n.localize("Cancel")
        }
      },
      default: "cancel"
    });
    dialog.render(true);
  }

  async #openAddAbilityDialog(actor) {
    if (!ActorService.canUpdate(actor)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }
    const created = await CharacterCreatorService.openAbilityBrowser(actor);
    if (!created?.length) return null;
    const ability = created.find((item) => item.type === "ability");
    if (ability) {
      this.#selectedAbilityId = ability.id;
      this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
    }
    this.#abilitiesOpen = true;
    this.#attacksOpen = false;
    this.#mysticalPowersOpen = false;
    this.#ritualsOpen = false;
    this.#storageOpen = false;
    this.#traitsOpen = false;
    return this.render();
  }

  #openManeuverDialog(actor) {
    if (!ActorService.canUpdate(actor) || actor.type !== "player") {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }

    const maneuvers = IndResourcesIntegration.maneuvers();
    if (!maneuvers.length) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.ManeuversUnavailable"));
      return;
    }

    const showDescriptionLabel = game.i18n.localize("SYMBAROUMHUD.Maneuvers.ShowDescription");
    const entries = maneuvers.map((maneuver, index) => {
      const notes = maneuver.notes ?? [];
      const description = notes
        .map((note) => `<p>${escapeHtml(note)}</p>`)
        .join("");
      return `
        <div class="symbaroum-hud-ability-picker-entry symbaroum-hud-maneuver-picker-entry" data-search-index="${escapeHtml(`${maneuver.label ?? ""} ${notes.join(" ")}`.toLocaleLowerCase())}">
          <label class="symbaroum-hud-maneuver-picker-choice">
            <input type="radio" name="maneuverId" value="${escapeHtml(maneuver.id)}" ${index === 0 ? "checked" : ""}>
            <i class="fa-solid ${escapeHtml(maneuver.icon)}" aria-hidden="true"></i>
            <span>
              <strong>${escapeHtml(maneuver.label)}</strong>
              ${notes.length ? `<small>${escapeHtml(notes.join(" · "))}</small>` : ""}
            </span>
          </label>
          ${notes.length ? `
            <button type="button" class="symbaroum-hud-maneuver-description-toggle"
              data-maneuver-description-toggle aria-expanded="false"
              data-tooltip="${escapeHtml(showDescriptionLabel)}"
              aria-label="${escapeHtml(showDescriptionLabel)}">
              <i class="fa-solid fa-book-open" aria-hidden="true"></i>
            </button>
            <div class="symbaroum-hud-maneuver-description" hidden>${description}</div>
          ` : ""}
        </div>
      `;
    }).join("");
    const content = `
      <form class="symbaroum-hud-ability-picker symbaroum-hud-maneuver-picker">
        <p>${game.i18n.localize("SYMBAROUMHUD.Maneuvers.Prompt")}</p>
        <label class="symbaroum-hud-ability-picker-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" name="abilitySearch" autocomplete="off" placeholder="${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Maneuvers.Search"))}">
        </label>
        <div class="symbaroum-hud-ability-picker-list">${entries}</div>
        <p class="symbaroum-hud-ability-picker-empty" hidden>${game.i18n.localize("SYMBAROUMHUD.Maneuvers.NoSearchResults")}</p>
      </form>
    `;

    const dialog = new Dialog({
      title: game.i18n.localize("SYMBAROUMHUD.Sections.Maneuvers"),
      content,
      buttons: {
        ok: {
          label: game.i18n.localize("SYMBAROUMHUD.Maneuvers.Roll"),
          callback: async (html) => {
            const root = html?.[0] ?? html;
            const maneuverId = root?.querySelector?.("input[name='maneuverId']:checked")?.value;
            return IndResourcesIntegration.executeManeuver(actor, maneuverId);
          }
        },
        cancel: {
          label: game.i18n.localize("Cancel")
        }
      },
      default: "ok",
      render: setupManeuverPicker
    });
    dialog.render(true);
  }

  #openAddRitualDialog(actor) {
    if (!ActorService.canUpdate(actor)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }

    const rituals = ActorService.availableWorldRituals(actor);
    if (!rituals.length) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoAvailableRituals"));
      return;
    }

    const entries = rituals.map((item, index) => `
      <label class="symbaroum-hud-ability-picker-entry" data-search-index="${escapeHtml(`${item.name ?? ""} ${item.system?.reference ?? ""}`.toLocaleLowerCase())}">
        <input type="radio" name="ritualId" value="${escapeHtml(item.id)}" ${index === 0 ? "checked" : ""}>
        <img src="${escapeHtml(item.img ?? FALLBACK_RITUAL_IMAGE)}" alt="">
        <span>
          <strong>${escapeHtml(item.name)}</strong>
          ${item.system?.reference ? `<small>${escapeHtml(item.system.reference)}</small>` : ""}
        </span>
      </label>
    `).join("");
    const content = `
      <form class="symbaroum-hud-ability-picker">
        <p>${game.i18n.localize("SYMBAROUMHUD.Rituals.AddPrompt")}</p>
        <label class="symbaroum-hud-ability-picker-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" name="abilitySearch" autocomplete="off" placeholder="${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Rituals.Search"))}">
        </label>
        <div class="symbaroum-hud-ability-picker-list">${entries}</div>
        <p class="symbaroum-hud-ability-picker-empty" hidden>${game.i18n.localize("SYMBAROUMHUD.Rituals.NoSearchResults")}</p>
      </form>
    `;

    const dialog = new Dialog({
      title: game.i18n.localize("SYMBAROUMHUD.Rituals.Add"),
      content,
      buttons: {
        ok: {
          label: game.i18n.localize("SYMBAROUMHUD.Rituals.Buy"),
          callback: async (html) => {
            const root = html?.[0] ?? html;
            const itemId = root?.querySelector?.("input[name='ritualId']:checked")?.value;
            const created = await ActorService.buyWorldRitual(actor, itemId);
            if (created) {
              this.#selectedRitualId = created.id;
              this.#ritualsOpen = true;
              this.#abilitiesOpen = false;
              this.#attacksOpen = false;
              this.#mysticalPowersOpen = false;
              this.#storageOpen = false;
              this.#traitsOpen = false;
              return this.render();
            }
            return null;
          }
        },
        cancel: {
          label: game.i18n.localize("Cancel")
        }
      },
      default: "ok",
      render: setupAbilityPickerSearch
    });
    dialog.render(true);
  }

  #openRerollCostDialog(actor) {
    if (!ActorService.canUpdate(actor)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }

    const experience = experienceContext(actor);
    const xpDisabled = experience.available < 1 ? "disabled" : "";
    const corruption = actor.system?.health?.corruption ?? {};
    const permanent = number(corruption.permanent);
    const max = number(corruption.max);
    const corruptionDisabled = max > 0 && permanent >= max ? "disabled" : "";
    const defaultCost = xpDisabled ? "corruption" : "experience";
    const content = `
      <form class="symbaroum-hud-reroll-dialog">
        <p>${game.i18n.localize("SYMBAROUMHUD.RerollCost.Prompt")}</p>
        <label>
          <input type="radio" name="cost" value="experience" ${defaultCost === "experience" ? "checked" : ""} ${xpDisabled}>
          <span>${game.i18n.localize("SYMBAROUMHUD.RerollCost.Experience")}</span>
          <small>${experience.available}/${experience.total}</small>
        </label>
        <label>
          <input type="radio" name="cost" value="corruption" ${defaultCost === "corruption" ? "checked" : ""} ${corruptionDisabled}>
          <span>${game.i18n.localize("SYMBAROUMHUD.RerollCost.PermanentCorruption")}</span>
          <small>${permanent}/${max}</small>
        </label>
      </form>
    `;

    const dialog = new Dialog({
      title: game.i18n.localize("SYMBAROUMHUD.RerollCost.Title"),
      content,
      buttons: {
        ok: {
          label: game.i18n.localize("SYMBAROUMHUD.RerollCost.Pay"),
          callback: async (html) => {
            const root = html?.[0] ?? html;
            const cost = root?.querySelector?.("input[name='cost']:checked")?.value;
            const paid = await ActorService.payRerollCost(actor, cost);
            if (paid) return this.render();
            return null;
          }
        },
        cancel: {
          label: game.i18n.localize("Cancel")
        }
      },
      default: "ok"
    });
    dialog.render(true);
  }

  #updatePlayerToggle(element, hidden) {
    element.classList.toggle("fa-users", hidden);
    element.classList.toggle("fa-users-slash", !hidden);
    element.setAttribute("aria-pressed", String(hidden));
    element.setAttribute(
      "aria-label",
      game.i18n.localize(hidden
        ? "SYMBAROUMHUD.Actions.ShowPlayers"
        : "SYMBAROUMHUD.Actions.HidePlayers")
    );
  }

  async #cycleActor(direction) {
    const actors = ActorService.accessibleActors(this.#actor);
    if (actors.length < 2) return;

    const currentKey = actorKey(this.#actor);
    const currentIndex = Math.max(
      0,
      actors.findIndex((actor) => actorKey(actor) === currentKey)
    );
    const nextIndex = (currentIndex + direction + actors.length) % actors.length;
    return this.#activateManualActor(actors[nextIndex]);
  }

  #closeActorPicker(root = this.element) {
    this.#actorPickerOpen = false;
    const picker = root?.querySelector?.("[data-owned-actor-picker]");
    if (picker) picker.hidden = true;
    root?.querySelector?.('[data-action="toggle-actor-picker"]')?.setAttribute("aria-expanded", "false");
  }

  async #activateManualActor(actor) {
    this.#actor = actor;
    this.#manualActorKey = actorKey(this.#actor);
    this.#actorPickerOpen = false;
    this.#abilitiesOpen = false;
    this.#attacksOpen = false;
    this.#mysticalPowersOpen = false;
    this.#selectedAbilityId = null;
    this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
    this.#selectedMysticalPowerId = null;
    this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
    this.#selectedRitualId = null;
    this.#selectedTraitId = null;
    this.#selectedTraitTab = DEFAULT_ABILITY_TAB;
    this.#storageContainerId = null;
    this.#storageOpen = false;
    this.#ritualsOpen = false;
    this.#traitsOpen = false;
    const result = await this.render();
    await ui.hotbar?.render({ force: true });
    return result;
  }
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function resourcePercent(value, max) {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 1000) / 10));
}

function armorValue(actor) {
  const combat = actor?.system?.combat ?? {};
  return firstText(
    combat.displayTextShort,
    combat.protectionPc,
    combat.protectionNpc
  ) ?? "—";
}

function armorName(actor) {
  return firstText(actor?.system?.combat?.name)
    ?? game.i18n.localize("SYMBAROUMHUD.Info.Armor");
}

function moneyContext(actor) {
  const money = actor?.system?.money ?? {};
  return {
    thaler: number(money.thaler),
    shilling: number(money.shilling),
    orteg: number(money.orteg)
  };
}


function firstText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function failedDeathRolls(actor) {
  const count = Math.min(
    3,
    Math.max(0, Math.trunc(number(actor?.system?.nbrOfFailedDeathRoll)))
  );
  return Array.from({ length: count });
}

function attributeContext(actor) {
  const attributes = actor?.system?.attributes ?? {};
  return ATTRIBUTE_ORDER.flatMap((id) => {
    const attribute = attributes[id];
    if (!attribute) return [];

    return [{
      id,
      label: game.i18n.localize(attribute.label ?? `ATTRIBUTE.${id.toUpperCase()}`),
      icon: ATTRIBUTE_ICONS[id],
      value: number(attribute.total ?? attribute.value)
    }];
  });
}

function experienceContext(actor) {
  const experience = actor?.system?.experience?.experience
    ?? actor?.system?.experience
    ?? {};
  const total = number(experience.total ?? experience.current);
  const spent = number(experience.spent);
  const available = number(experience.available ?? Math.max(0, total - spent));

  return {
    available,
    spent,
    total
  };
}

function actorKey(actor) {
  return actor?.uuid ?? actor?.id ?? null;
}

function findActorItem(actor, itemId) {
  return actor?.items?.get?.(itemId)
    ?? Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
      .find((item) => item?.id === itemId)
    ?? null;
}

async function abilityContext(
  actor,
  selectedAbilityId = null,
  selectedAbilityTab = DEFAULT_ABILITY_TAB,
  {
    includeDetails = true,
    mysticalPowers = false,
    nativeSheet = false,
    nativeSheetInteractive = false,
    traits = false
  } = {}
) {
  const items = Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
    .filter((item) => Boolean(item?.system?.isPower))
    .filter((item) => isMysticalPowerItem(item) === mysticalPowers)
    .filter((item) => !isRitualItem(item))
    .filter((item) => mysticalPowers || isTraitLikeItem(item) === traits)
    .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
  const selectedItem = items.find((item) => item.id === selectedAbilityId)
    ?? items[0]
    ?? null;

  const selected = includeDetails && selectedItem
    ? await abilityDetailContext(selectedItem, selectedAbilityTab)
    : null;
  if (selected && nativeSheet) {
    selected.nativeSheet = await renderEmbeddedItemSheet(selectedItem, {
      enabledFields: nativeSheetInteractive
        ? ABILITY_LEVELS.map(({ id }) => `system.${id}.isActive`)
        : [],
      isOwned: true
    });
  }

  return {
    available: items.length > 0,
    items: items.map((item) => ({
      id: item.id,
      img: item.img ?? "icons/svg/item-bag.svg",
      name: item.name,
      uuid: item.uuid,
      active: item.id === selectedItem?.id
    })),
    selected
  };
}

async function ritualContext(actor, selectedRitualId = null, { includeDetails = true } = {}) {
  const items = Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
    .filter(isRitualItem)
    .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
  const ritualist = findRitualistAbility(actor);
  const progress = ritualistProgress(
    ritualist,
    items.length,
    ritualistAdditionalRules()
  );
  const selectedItem = items.find((item) => item.id === selectedRitualId)
    ?? items[0]
    ?? null;

  return {
    available: Boolean(ritualist),
    ritualist: ritualist
      ? {
          id: ritualist.id,
          img: ritualist.img ?? FALLBACK_RITUALIST_IMAGE,
          name: ritualist.name,
          uuid: ritualist.uuid,
          level: progress.level,
          levelLabel: game.i18n.localize(progress.levelLabel),
          known: progress.known,
          capacity: progress.capacity,
          remaining: progress.remaining,
          extras: progress.extras,
          atCapacity: progress.atCapacity,
          canLearnAdditional: progress.canLearnAdditional,
          additionalRitualCost: progress.additionalRitualCost
        }
      : null,
    items: items.map((item) => ({
      id: item.id,
      img: item.img ?? FALLBACK_RITUAL_IMAGE,
      name: item.name,
      uuid: item.uuid,
      action: firstText(item.system?.actions) ?? game.i18n.localize("SYMBAROUMHUD.Rituals.Ritual"),
      active: item.id === selectedItem?.id
    })),
    selected: includeDetails && selectedItem
      ? await ritualDetailContext(selectedItem)
      : null
  };
}

function ritualistAdditionalRules() {
  let additionalRitualsAllowed = false;
  try {
    additionalRitualsAllowed = Boolean(
      game.settings?.get?.("symbaroum", "optionalMoreRituals")
    );
  } catch (_error) {
    // The optional system rule is absent or unavailable.
  }

  return {
    additionalRitualsAllowed,
    additionalRitualCost: game.symbaroum?.config?.expCosts?.ritual?.cost ?? null
  };
}

async function ritualDetailContext(item) {
  const system = item.system ?? {};
  const description = await enrichDescription(system.description, item);

  return {
    id: item.id,
    img: item.img ?? FALLBACK_RITUAL_IMAGE,
    name: item.name,
    uuid: item.uuid,
    reference: firstText(system.reference),
    action: firstText(system.actions) ?? game.i18n.localize("SYMBAROUMHUD.Rituals.Ritual"),
    description,
    activeTab: {
      id: DEFAULT_ABILITY_TAB,
      label: game.i18n.localize("SYMBAROUMHUD.Abilities.Description"),
      description,
      active: true,
      empty: !description
    }
  };
}

function findRitualistAbility(actor) {
  return Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
    .find((item) => IndResourcesIntegration.isRitualistAbility(item)) ?? null;
}

function isRitualItem(item) {
  return IndResourcesIntegration.isRitualItem(item);
}

function isMysticalPowerItem(item) {
  return IndResourcesIntegration.isMysticalPowerItem(item);
}

async function abilityDetailContext(item, selectedAbilityTab = DEFAULT_ABILITY_TAB) {
  const system = item.system ?? {};
  const hasLevels = hasPowerLevels(item);
  const description = await enrichDescription(system.description, item);
  const levels = [];

  if (hasLevels) {
    for (const level of ABILITY_LEVELS) {
      const source = system[level.id] ?? {};
      const description = await enrichDescription(source.description, item);
      const action = actionLabel(source.action);
      const learned = Boolean(source.isActive);
      if (!description && !action && !learned) continue;

      levels.push({
        id: level.id,
        label: game.i18n.localize(level.label),
        action,
        description,
        learned
      });
    }
  }
  const tabs = hasLevels ? [{
    id: DEFAULT_ABILITY_TAB,
    label: game.i18n.localize("SYMBAROUMHUD.Abilities.Description"),
    description,
    empty: !description
  }, ...ABILITY_LEVELS.map((level) => {
    const entry = levels.find((candidate) => candidate.id === level.id);
    return {
      id: level.id,
      level: level.id,
      label: game.i18n.localize(level.label),
      action: entry?.action ?? null,
      description: entry?.description ?? "",
      learned: Boolean(entry?.learned),
      empty: !entry?.description
    };
  })] : [{
    id: DEFAULT_ABILITY_TAB,
    label: game.i18n.localize("SYMBAROUMHUD.Abilities.Description"),
    description,
    active: true,
    empty: !description
  }];
  const activeTab = tabs.find((tab) => tab.id === selectedAbilityTab) ?? tabs[0];

  return {
    canUsePower: canUsePowerItem(item),
    hasLevels,
    id: item.id,
    img: item.img ?? "icons/svg/item-bag.svg",
    name: item.name,
    uuid: item.uuid,
    reference: firstText(system.reference),
    description,
    levels,
    tabs: tabs.map((tab) => ({
      ...tab,
      active: tab.id === activeTab.id
    })),
    activeTab
  };
}

async function enrichDescription(value, relativeTo = null) {
  const description = firstText(value);
  if (!description) return "";

  const textEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation
    ?? globalThis.foundry?.applications?.ux?.TextEditor
    ?? globalThis.TextEditor;
  if (textEditor?.enrichHTML) {
    return textEditor.enrichHTML(description, { async: true, relativeTo });
  }
  return escapeHtml(description);
}

function actionLabel(value) {
  const action = firstText(value);
  if (!action || action === "-") return null;

  const key = ACTION_LABEL_KEYS[action.toUpperCase()];
  if (!key) return action;

  const label = game.i18n.localize(key);
  return label === key ? action : label;
}

function setupAbilityPickerSearch(html) {
  const root = html?.[0] ?? html;
  const input = root?.querySelector?.("input[name='abilitySearch']");
  if (!input) return;

  const entries = Array.from(root.querySelectorAll(".symbaroum-hud-ability-picker-entry"));
  const empty = root.querySelector(".symbaroum-hud-ability-picker-empty");
  const update = () => {
    const query = input.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const entry of entries) {
      const matches = !query || entry.dataset.searchIndex?.includes(query);
      entry.hidden = !matches;
      if (matches) visible += 1;
    }

    const checked = root.querySelector("input[type='radio']:checked");
    if (checked?.closest(".symbaroum-hud-ability-picker-entry")?.hidden) {
      checked.checked = false;
    }

    if (!root.querySelector("input[type='radio']:checked")) {
      const firstVisible = entries.find((entry) => !entry.hidden)
        ?.querySelector("input[type='radio']");
      if (firstVisible) firstVisible.checked = true;
    }

    if (empty) empty.hidden = visible > 0;
  };

  input.addEventListener("input", update);
}

function setupManeuverPicker(html) {
  setupAbilityPickerSearch(html);
  const root = html?.[0] ?? html;
  if (!root?.querySelectorAll) return;

  const showLabel = game.i18n.localize("SYMBAROUMHUD.Maneuvers.ShowDescription");
  const hideLabel = game.i18n.localize("SYMBAROUMHUD.Maneuvers.HideDescription");
  for (const button of root.querySelectorAll("[data-maneuver-description-toggle]")) {
    button.addEventListener("click", () => {
      const description = button.closest(".symbaroum-hud-maneuver-picker-entry")
        ?.querySelector(".symbaroum-hud-maneuver-description");
      if (!description) return;

      const expanded = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(expanded));
      description.hidden = !expanded;
      const label = expanded ? hideLabel : showLabel;
      button.setAttribute("aria-label", label);
      button.dataset.tooltip = label;
    });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

function simplifiedActionContext(actor, { canRollActor = false, drawnWeapons = null } = {}) {
  if (!actor) {
    return {
      hasActions: false,
      attacks: [],
      abilities: [],
      mysticalPowers: [],
      traits: [],
      otherItems: []
    };
  }

  const attacks = attackContext(actor, {
    canDrag: canRollActor,
    drawnWeapons,
    canUse: canRollActor
  });
  const allItems = Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
    .filter((item) => Boolean(item?.name))
    .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));

  const abilities = [];
  const mysticalPowers = [];
  const traits = [];
  const otherItems = [];

  for (const item of allItems) {
    if (isMysticalPowerItem(item)) {
      const activeLevel = ["master", "adept", "novice"].find((lvl) => Boolean(item.system?.[lvl]?.isActive));
      const actionKey = activeLevel ? item.system?.[activeLevel]?.action : null;
      mysticalPowers.push({
        id: item.id,
        name: item.name,
        img: item.img || "systems/symbaroum/asset/image/power.png",
        uuid: item.uuid || "",
        canUse: canRollActor,
        actionLabel: actionKey ? actionLabel(actionKey) : null
      });
      continue;
    }

    if (isRitualItem(item)) continue;

    if (isTraitLikeItem(item)) {
      if (canUsePowerItem(item)) {
        traits.push({
          id: item.id,
          name: item.name,
          img: item.img || "systems/symbaroum/asset/image/trait.png",
          uuid: item.uuid || "",
          canUse: canRollActor,
          actionLabel: null
        });
      }
      continue;
    }

    if (item.system?.isPower) {
      if (canUsePowerItem(item)) {
        const activeLevel = ["master", "adept", "novice"].find((lvl) => Boolean(item.system?.[lvl]?.isActive));
        const actionKey = activeLevel ? item.system?.[activeLevel]?.action : null;
        abilities.push({
          id: item.id,
          name: item.name,
          img: item.img || "systems/symbaroum/asset/image/ability.png",
          uuid: item.uuid || "",
          canUse: canRollActor,
          actionLabel: actionKey ? actionLabel(actionKey) : null
        });
      }
      continue;
    }

    if (canUsePowerItem(item)) {
      otherItems.push({
        id: item.id,
        name: item.name,
        img: item.img || "icons/svg/item-bag.svg",
        uuid: item.uuid || "",
        canUse: canRollActor,
        actionLabel: null
      });
    }
  }

  const rawManeuvers = IndResourcesIntegration.maneuvers();
  const maneuvers = Array.isArray(rawManeuvers)
    ? rawManeuvers.map((m) => ({
        id: m.id,
        name: m.label,
        icon: m.icon || "fa-chess-knight",
        description: Array.isArray(m.notes) ? m.notes.join("\n\n") : (m.notes || ""),
        canUse: canRollActor
      }))
    : [];

  const hasActions = Boolean(
    attacks.length || abilities.length || mysticalPowers.length || traits.length || otherItems.length || maneuvers.length
  );

  return {
    hasActions,
    attacks,
    abilities,
    mysticalPowers,
    traits,
    otherItems,
    maneuvers
  };
}

function getActiveTierInfo(item) {
  const activeLevel = ["master", "adept", "novice"].find((lvl) => Boolean(item.system?.[lvl]?.isActive));
  if (!activeLevel) return { tier: null, tierLabel: "", actionKey: null };
  const levelObj = ABILITY_LEVELS.find((l) => l.id === activeLevel);
  const tierLabel = levelObj ? game.i18n.localize(levelObj.label) : activeLevel.toUpperCase();
  const actionKey = item.system?.[activeLevel]?.action || null;
  return { tier: activeLevel, tierLabel, actionKey };
}

function resolvePowerDescription(item, activeLevel) {
  if (!item) return "";
  let desc = "";
  if (activeLevel && item.system?.[activeLevel]?.description) {
    desc = item.system[activeLevel].description;
  }
  if (!desc && item.system?.description) {
    desc = item.system.description;
  }
  if (!desc && item.system?.novice?.description) {
    desc = item.system.novice.description;
  }
  return desc || "";
}

function simplifiedPowersContext(actor, { canRollActor = false, selectedItemId = null } = {}) {
  if (!actor) {
    return {
      isEmpty: true,
      hasAbilities: false,
      hasMysticalPowers: false,
      hasRituals: false,
      hasTraits: false,
      abilities: [],
      mysticalPowers: [],
      rituals: [],
      traits: [],
      column1: { sections: [], hasSections: false },
      column2: { sections: [], hasSections: false },
      hasColumn2: false,
      selectedCard: null
    };
  }

  const allItems = Array.from(actor?.items?.values?.() ?? actor?.items ?? [])
    .filter((item) => Boolean(item?.name))
    .sort((left, right) => left.name.localeCompare(right.name, game.i18n?.lang || "en"));

  const abilities = [];
  const mysticalPowers = [];
  const rituals = [];
  const traits = [];

  let selectedCard = null;

  for (const item of allItems) {
    if (isRitualItem(item)) {
      const description = resolvePowerDescription(item);
      const isSelected = selectedItemId === String(item.id);
      const entry = {
        id: item.id,
        name: item.name,
        img: item.img || "systems/symbaroum/asset/image/ritual.png",
        uuid: item.uuid || "",
        description,
        type: "ritual",
        badge: game.i18n?.localize("SYMBAROUMHUD.Sections.Rituals") ?? "Ritual",
        actionLabel: null,
        canRoll: canRollActor && canUsePowerItem(item),
        canUse: canRollActor,
        rollAction: "use-ritual",
        isSelected
      };
      rituals.push(entry);
      if (isSelected) {
        selectedCard = {
          ...entry,
          actorName: actor.name
        };
      }
      continue;
    }

    if (isMysticalPowerItem(item)) {
      const { tier, tierLabel, actionKey } = getActiveTierInfo(item);
      const description = resolvePowerDescription(item, tier);
      const canRoll = canRollActor && canUsePowerItem(item);
      const isSelected = selectedItemId === String(item.id);
      const entry = {
        id: item.id,
        name: item.name,
        img: item.img || "systems/symbaroum/asset/image/power.png",
        uuid: item.uuid || "",
        tier,
        tierLabel,
        description,
        type: "mysticalPower",
        badge: tierLabel || (game.i18n?.localize("SYMBAROUMHUD.Sections.MysticalPowers") ?? "Poder Místico"),
        actionLabel: actionKey ? actionLabel(actionKey) : null,
        canRoll,
        canUse: canRollActor,
        rollAction: "use-mystical-power",
        isSelected
      };
      mysticalPowers.push(entry);
      if (isSelected) {
        selectedCard = {
          ...entry,
          actorName: actor.name
        };
      }
      continue;
    }

    if (isTraitLikeItem(item)) {
      const { tier, tierLabel, actionKey } = getActiveTierInfo(item);
      const description = resolvePowerDescription(item, tier);
      const canRoll = canRollActor && canUsePowerItem(item);
      const isSelected = selectedItemId === String(item.id);
      const entry = {
        id: item.id,
        name: item.name,
        img: item.img || "systems/symbaroum/asset/image/trait.png",
        uuid: item.uuid || "",
        tier,
        tierLabel,
        description,
        type: "trait",
        badge: tierLabel || (game.i18n?.localize("SYMBAROUMHUD.Sections.Traits") ?? "Traço"),
        actionLabel: actionKey ? actionLabel(actionKey) : null,
        canRoll,
        canUse: canRollActor,
        rollAction: "use-trait",
        isSelected
      };
      traits.push(entry);
      if (isSelected) {
        selectedCard = {
          ...entry,
          actorName: actor.name
        };
      }
      continue;
    }

    if (item.system?.isPower) {
      const { tier, tierLabel, actionKey } = getActiveTierInfo(item);
      const description = resolvePowerDescription(item, tier);
      const canRoll = canRollActor && canUsePowerItem(item);
      const isSelected = selectedItemId === String(item.id);
      const entry = {
        id: item.id,
        name: item.name,
        img: item.img || "systems/symbaroum/asset/image/ability.png",
        uuid: item.uuid || "",
        tier,
        tierLabel,
        description,
        type: "ability",
        badge: tierLabel || (game.i18n?.localize("SYMBAROUMHUD.Sections.Abilities") ?? "Habilidade"),
        actionLabel: actionKey ? actionLabel(actionKey) : null,
        canRoll,
        canUse: canRollActor,
        rollAction: "use-ability",
        isSelected
      };
      abilities.push(entry);
      if (isSelected) {
        selectedCard = {
          ...entry,
          actorName: actor.name
        };
      }
      continue;
    }
  }

  // Multi-column section assignment (PF2e HUD style 2 columns):
  const col1Sections = [];
  const col2Sections = [];

  const hasMagic = mysticalPowers.length > 0 || rituals.length > 0;

  if (hasMagic) {
    if (abilities.length > 0) {
      col1Sections.push({
        title: game.i18n?.localize("SYMBAROUMHUD.Sections.Abilities") ?? "Habilidades",
        items: abilities,
        icon: "fa-bolt"
      });
    }
    if (traits.length > 0) {
      col1Sections.push({
        title: game.i18n?.localize("SYMBAROUMHUD.Sections.Traits") ?? "Traços & Características",
        items: traits,
        icon: "fa-dna"
      });
    }
    if (mysticalPowers.length > 0) {
      col2Sections.push({
        title: game.i18n?.localize("SYMBAROUMHUD.Sections.MysticalPowers") ?? "Poderes Místicos",
        items: mysticalPowers,
        icon: "fa-wand-magic-sparkles"
      });
    }
    if (rituals.length > 0) {
      col2Sections.push({
        title: game.i18n?.localize("SYMBAROUMHUD.Sections.Rituals") ?? "Rituais",
        items: rituals,
        icon: "fa-book-open"
      });
    }
  } else if (traits.length > 0) {
    if (abilities.length > 0) {
      col1Sections.push({
        title: game.i18n?.localize("SYMBAROUMHUD.Sections.Abilities") ?? "Habilidades",
        items: abilities,
        icon: "fa-bolt"
      });
    }
    col2Sections.push({
      title: game.i18n?.localize("SYMBAROUMHUD.Sections.Traits") ?? "Traços & Características",
      items: traits,
      icon: "fa-dna"
    });
  } else if (abilities.length > 4) {
    const mid = Math.ceil(abilities.length / 2);
    col1Sections.push({
      title: game.i18n?.localize("SYMBAROUMHUD.Sections.Abilities") ?? "Habilidades",
      items: abilities.slice(0, mid),
      icon: "fa-bolt"
    });
    col2Sections.push({
      title: game.i18n?.localize("SYMBAROUMHUD.Sections.Abilities") ?? "Habilidades",
      items: abilities.slice(mid),
      icon: "fa-bolt"
    });
  } else {
    if (abilities.length > 0) {
      col1Sections.push({
        title: game.i18n?.localize("SYMBAROUMHUD.Sections.Abilities") ?? "Habilidades",
        items: abilities,
        icon: "fa-bolt"
      });
    }
  }

  const isEmpty = !abilities.length && !mysticalPowers.length && !rituals.length && !traits.length;

  return {
    isEmpty,
    hasAbilities: abilities.length > 0,
    hasMysticalPowers: mysticalPowers.length > 0,
    hasRituals: rituals.length > 0,
    hasTraits: traits.length > 0,
    abilities,
    mysticalPowers,
    rituals,
    traits,
    column1: {
      sections: col1Sections,
      hasSections: col1Sections.length > 0
    },
    column2: {
      sections: col2Sections,
      hasSections: col2Sections.length > 0
    },
    hasColumn1: col1Sections.length > 0,
    hasColumn2: col2Sections.length > 0,
    selectedCard
  };
}

function resolveItemUses(item, actor) {
  if (!item) return null;

  // 1. Ind Resources API for rations
  if (IndResourcesIntegration.api?.rations?.getState) {
    const isRation = /\b(pao|pão|waybread|travel\s+bread|racao|ração|ration)\b/i.test(item.name)
      || Boolean(item.flags?.["symbaroum-ind-resources"]?.isRation)
      || Boolean(safeCall(() => IndResourcesIntegration.api?.rations?.isRation?.(item)));
    if (isRation) {
      const state = safeCall(() => IndResourcesIntegration.api.rations.getState(actor, item));
      if (state && Number.isFinite(state.totalUsesCapacity) && state.totalUsesCapacity > 0) {
        return `${state.totalUsesRemaining}/${state.totalUsesCapacity}`;
      }
      if (state && Number.isFinite(state.usesPerUnit) && state.usesPerUnit > 0) {
        return `${state.usesRemaining}/${state.usesPerUnit}`;
      }
    }
  }

  // 2. Actor flag from symbaroum-ind-resources
  const rationFlag = actor?.getFlag?.("symbaroum-ind-resources", "rations");
  const isRationName = /\b(pao|pão|waybread|travel\s+bread|racao|ração|ration)\b/i.test(item.name)
    || Boolean(item.flags?.["symbaroum-ind-resources"]?.isRation);

  if (isRationName) {
    const rawQty = item.system?.number ?? item.system?.quantity ?? 1;
    const quantity = Number.isFinite(Number(rawQty)) ? Math.max(1, Math.trunc(Number(rawQty))) : 1;
    const usesPerUnit = 4;
    let usesRemaining = usesPerUnit;

    if (rationFlag) {
      const travelBread = rationFlag.byRule?.travelBread ?? rationFlag;
      if (Number.isFinite(Number(travelBread.usesRemaining))) {
        usesRemaining = Math.max(0, Math.min(usesPerUnit, Number(travelBread.usesRemaining)));
      }
    }

    const totalRemaining = ((quantity - 1) * usesPerUnit) + usesRemaining;
    const totalCapacity = quantity * usesPerUnit;
    return `${totalRemaining}/${totalCapacity}`;
  }

  // 3. Generic item uses (system.uses or item flags)
  const systemUses = item.system?.uses;
  if (systemUses && Number.isFinite(Number(systemUses.max)) && Number(systemUses.max) > 0) {
    const current = Number.isFinite(Number(systemUses.value)) ? Number(systemUses.value) : 0;
    return `${current}/${systemUses.max}`;
  }

  const indUses = item.flags?.["symbaroum-ind-resources"];
  if (indUses && Number.isFinite(Number(indUses.usesPerUnit)) && Number(indUses.usesPerUnit) > 0) {
    const max = Number(indUses.usesPerUnit);
    const rem = Number.isFinite(Number(indUses.usesRemaining)) ? Number(indUses.usesRemaining) : max;
    return `${rem}/${max}`;
  }

  return null;
}

function isAmmoItem(item) {
  if (!item || !item.name) return false;
  if (Boolean(item.flags?.["symbaroum-ind-resources"]?.isAmmo) || item.flags?.["symbaroum-ind-resources"]?.ammoType) return true;
  if (Boolean(item.system?.isAmmo)) return true;
  const name = String(item.name).toLocaleLowerCase();
  return [
    "flecha",
    "flechas",
    "virote",
    "virotes",
    "arrow",
    "arrows",
    "bolt",
    "bolts",
    "ammunition",
    "municao",
    "munição",
    "projectile",
    "projetil",
    "projétil"
  ].some((term) => name.includes(term));
}

function isQuiverItem(item) {
  if (!item || !item.name) return false;
  const name = String(item.name).toLocaleLowerCase();
  return name.includes("aljava") || name.includes("quiver");
}

function simplifiedInventoryContext(actor, { canRollActor = false, drawnWeapons = null, indResources = null, isContainerCollapsed = null } = {}) {
  const fallback = {
    weapons: [],
    armors: [],
    equipment: [],
    column1: {
      weapons: [],
      armors: [],
      equipment: [],
      hasWeapons: false,
      hasArmors: false,
      hasEquipment: false
    },
    column2: {
      consumables: [],
      treasure: [],
      containers: [],
      hasConsumables: false,
      hasTreasure: false,
      hasContainers: false
    },
    column3: {
      survival: [],
      general: [],
      hasSurvival: false,
      hasGeneral: false
    },
    money: { thaler: 0, shilling: 0, orteg: 0 },
    load: null,
    hasWeapons: false,
    hasArmors: false,
    hasEquipment: false,
    hasColumn1: false,
    hasColumn2: false,
    hasColumn3: false,
    isEmpty: true
  };

  if (!actor) return fallback;

  try {
    const readiness = readinessContext(drawnWeapons);
    const lang = game.i18n?.lang || "en";
    const processedIds = new Set();

    // 1. Column 1: Weapons & Shields
    const rawWeapons = Array.isArray(actor?.system?.weapons)
      ? actor.system.weapons
      : (actor?.system?.weapons && typeof actor.system.weapons === "object" ? Object.values(actor.system.weapons) : []);

    const allItems = Array.from(actor?.items?.values?.() ?? actor?.items ?? []).filter((i) => Boolean(i?.name));

    const weapons = [];
    for (const weapon of rawWeapons) {
      if (!weapon?.id || !weapon?.name) continue;
      if (isAmmoItem(weapon) || isQuiverItem(weapon)) continue;
      processedIds.add(String(weapon.id));
      const item = findActorItem(actor, weapon.id);
      if (item?.id) processedIds.add(String(item.id));
      const uuid = item?.uuid ?? weapon.uuid ?? "";
      const drawn = readiness ? readiness.has(weapon, item, uuid) : false;
      const damage = weapon.damage?.displayTextShort
        ?? (typeof weapon.damage?.displayText === "string" ? weapon.damage.displayText : null)
        ?? (typeof weapon.damage === "string" ? weapon.damage : null)
        ?? (typeof item?.system?.damage?.displayTextShort === "string" ? item.system.damage.displayTextShort : null)
        ?? (typeof item?.system?.baseDamage === "string" ? item.system.baseDamage : null)
        ?? "—";
      const rawQty = weapon.system?.number ?? item?.system?.number ?? 1;
      const quantity = Number.isFinite(Number(rawQty)) ? Math.max(0, Math.trunc(Number(rawQty))) : 1;
      weapons.push({
        id: weapon.id,
        name: weapon.name,
        img: weapon.img ?? item?.img ?? "systems/symbaroum/asset/image/weapon.png",
        uuid,
        damage,
        quantity,
        hasMultiple: quantity > 1,
        drawn,
        canUse: canRollActor,
        readinessKnown: Boolean(readiness),
        readinessLabel: readiness
          ? (game.i18n?.localize(drawn ? "SYMBAROUMHUD.Attacks.Drawn" : "SYMBAROUMHUD.Attacks.Sheathed") ?? (drawn ? "Sacada" : "Guardada"))
          : null
      });
    }

    // Add weapons and shields from allItems not yet in weapons
    for (const item of allItems) {
      if (processedIds.has(String(item.id))) continue;
      if (isAmmoItem(item) || isQuiverItem(item)) continue;
      const isWpn = item.type === "weapon" || Boolean(item.system?.isWeapon) || itemHasTaxonomyTag(item, "weapon") || itemHasTaxonomyTag(item, "melee-weapons") || itemHasTaxonomyTag(item, "ranged-weapons");
      const isShield = itemHasTaxonomyTag(item, "shields") || /\b(shield|escudo|broquel|buckler)\b/i.test(item.name);

      if (isWpn || isShield) {
        processedIds.add(String(item.id));
        const uuid = item.uuid || "";
        const drawn = readiness ? readiness.has(item, item, uuid) : false;
        const damage = item.system?.damage?.displayTextShort
          ?? (typeof item.system?.damage?.displayText === "string" ? item.system.damage.displayText : null)
          ?? (typeof item.system?.baseDamage === "string" ? item.system.baseDamage : null)
          ?? (isShield ? (item.system?.baseProtection ?? "—") : "—");
        const rawQty = item.system?.number ?? 1;
        const quantity = Number.isFinite(Number(rawQty)) ? Math.max(0, Math.trunc(Number(rawQty))) : 1;
        weapons.push({
          id: item.id,
          name: item.name,
          img: item.img || (isShield ? "systems/symbaroum/asset/image/shield.png" : "systems/symbaroum/asset/image/weapon.png"),
          uuid,
          damage,
          quantity,
          hasMultiple: quantity > 1,
          drawn,
          isShield,
          canUse: canRollActor,
          readinessKnown: Boolean(readiness),
          readinessLabel: readiness
            ? (game.i18n?.localize(drawn ? "SYMBAROUMHUD.Attacks.Drawn" : "SYMBAROUMHUD.Attacks.Sheathed") ?? (drawn ? "Sacada" : "Guardada"))
            : null
        });
      }
    }
    weapons.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), lang));

    // 2. Column 1: Armors
    const rawArmors = Array.isArray(actor?.system?.armors)
      ? actor.system.armors
      : (actor?.system?.armors && typeof actor.system.armors === "object" ? Object.values(actor.system.armors) : []);

    const armors = [];
    for (const armor of rawArmors) {
      if (!armor?.id || !armor?.name || armor?.isNoArmor) continue;
      if (processedIds.has(String(armor.id))) continue;
      processedIds.add(String(armor.id));
      const item = findActorItem(actor, armor.id);
      if (item?.id) processedIds.add(String(item.id));
      const uuid = item?.uuid ?? armor.uuid ?? "";
      const isActive = Boolean(armor.isActive ?? (item?.system?.isActive || item?.system?.state === "active"));
      const isEquipped = Boolean(armor.isEquipped ?? (item?.system?.isEquipped || item?.system?.state === "equipped"));
      const protection = armor.displayTextShort
        ?? (typeof armor.displayText === "string" ? armor.displayText : null)
        ?? (typeof armor.baseProtection === "string" ? armor.baseProtection : null)
        ?? (typeof item?.system?.baseProtection === "string" ? item.system.baseProtection : null)
        ?? "—";
      const rawQty = armor.system?.number ?? item?.system?.number ?? 1;
      const quantity = Number.isFinite(Number(rawQty)) ? Math.max(0, Math.trunc(Number(rawQty))) : 1;
      armors.push({
        id: armor.id,
        name: armor.name,
        img: armor.img ?? item?.img ?? "systems/symbaroum/asset/image/armor.png",
        uuid,
        protection,
        impeding: Number(armor.impeding ?? item?.system?.impeding ?? 0),
        quantity,
        hasMultiple: quantity > 1,
        isActive,
        isEquipped,
        stateLabel: isActive
          ? (game.i18n?.localize("SYMBAROUMHUD.Storage.StateActive") ?? "Ativa")
          : isEquipped
            ? (game.i18n?.localize("SYMBAROUMHUD.Storage.StateEquipped") ?? "Equipada")
            : (game.i18n?.localize("SYMBAROUMHUD.Storage.StateStored") ?? "Guardada"),
        canUse: canRollActor
      });
    }

    for (const item of allItems) {
      if (processedIds.has(String(item.id))) continue;
      if (isAmmoItem(item) || isQuiverItem(item)) continue;
      if ((item.type === "armor" || Boolean(item.system?.isArmor) || itemHasTaxonomyTag(item, "armor")) && !item.system?.isNoArmor) {
        processedIds.add(String(item.id));
        const isActive = Boolean(item.system?.isActive || item.system?.state === "active");
        const isEquipped = Boolean(item.system?.isEquipped || item.system?.state === "equipped");
        const rawQty = item.system?.number ?? 1;
        const quantity = Number.isFinite(Number(rawQty)) ? Math.max(0, Math.trunc(Number(rawQty))) : 1;
        armors.push({
          id: item.id,
          name: item.name,
          img: item.img || "systems/symbaroum/asset/image/armor.png",
          uuid: item.uuid || "",
          protection: item.system?.baseProtection ?? "—",
          impeding: Number(item.system?.impeding ?? 0),
          quantity,
          hasMultiple: quantity > 1,
          isActive,
          isEquipped,
          stateLabel: isActive
            ? (game.i18n?.localize("SYMBAROUMHUD.Storage.StateActive") ?? "Ativa")
            : isEquipped
              ? (game.i18n?.localize("SYMBAROUMHUD.Storage.StateEquipped") ?? "Equipada")
              : (game.i18n?.localize("SYMBAROUMHUD.Storage.StateStored") ?? "Guardada"),
          canUse: canRollActor
        });
      }
    }
    armors.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), lang));

    // 3. Column 2: Containers & Column 3: General Inventory
    const EXCLUDED_TYPES = new Set(["ability", "mysticalPower", "mystical-power", "ritual", "trait", "boon", "burden"]);
    const CONTAINER_REGEX = /\b(backpack|mochila|quiver|aljava|pouch|bolsa|algibeira|sacola|bau|chest|barril|barrel|basket|cesta|knapsack|caixa|box)\b|\bsaco(?!\s+de\s+dormir)\b|\bsack(?!\s+sleeping)\b/i;

    function isItemAContainer(item) {
      if (!item || !item.name) return false;
      // Explicitly reject items that are not storage containers
      if (/\b(cantil|waterskin|saco\s+de\s+dormir|sleeping\s+bag|caneca|copo|drinking\s+horn)\b/i.test(item.name)) {
        return false;
      }
      if (isAmmoItem(item)) return false;
      if (isQuiverItem(item)) return true;
      if (item.system?.isContainer || Boolean(item.flags?.["symbaroum-ind-resources"]?.isContainer)) return true;
      if (safeCall(() => IndResourcesIntegration.api?.containers?.isContainer?.(item))) return true;
      return CONTAINER_REGEX.test(item.name);
    }

    const containerMap = new Map();

    // Containers from Ind Resources if available:
    if (indResources?.storage?.containers?.length) {
      for (const c of indResources.storage.containers) {
        if (c?.id) {
          containerMap.set(String(c.id), {
            id: c.id,
            name: c.name,
            img: c.img ?? "icons/svg/item-bag.svg",
            capacity: c.capacity ?? null,
            storedItems: Array.isArray(c.items) ? c.items : []
          });
        }
      }
    }

    // Containers from allItems:
    for (const item of allItems) {
      if (processedIds.has(String(item.id))) continue;
      if (isItemAContainer(item)) {
        if (!containerMap.has(String(item.id))) {
          const cap = safeCall(() => IndResourcesIntegration.api?.containers?.getContainerCapacityLabel?.(actor, item));
          containerMap.set(String(item.id), {
            id: item.id,
            name: item.name,
            img: item.img || "icons/svg/item-bag.svg",
            capacity: cap ? String(cap) : null,
            storedItems: []
          });
        }
      }
    }

    // Process each container and its contents:
    const containers = [];
    for (const [cId, cData] of containerMap.entries()) {
      processedIds.add(cId);
      const containerItem = findActorItem(actor, cId);
      const cUuid = containerItem?.uuid ?? "";
      const isQuiver = isQuiverItem(containerItem) || isQuiverItem(cData);

      const storedItemMap = new Map();
      for (const s of cData.storedItems) {
        if (s?.id) storedItemMap.set(String(s.id), s);
      }
      if (IndResourcesIntegration.api?.containers?.getStoredItems && containerItem) {
        const fromApi = Array.from(safeCall(() => IndResourcesIntegration.api.containers.getStoredItems(actor, containerItem)) ?? []);
        for (const s of fromApi) {
          if (s?.id && !storedItemMap.has(String(s.id))) storedItemMap.set(String(s.id), s);
        }
      }
      for (const item of allItems) {
        if (String(item.flags?.["symbaroum-ind-resources"]?.storedIn) === cId
          || String(item.system?.storedIn) === cId) {
          if (!storedItemMap.has(String(item.id))) storedItemMap.set(String(item.id), item);
        }
      }

      const storedItems = [];

      if (isQuiver && containerItem) {
        const loadedAmmo = containerItem.flags?.["symbaroum-ind-resources"]?.loadedAmmo;
        if (Array.isArray(loadedAmmo) && loadedAmmo.length) {
          loadedAmmo.forEach((entry, idx) => {
            const qty = Math.max(1, Number(entry.quantity) || 1);
            storedItems.push({
              id: entry.id || `loaded-${idx}`,
              name: entry.name || (game.i18n?.localize?.("SYMBAROUMHUD.Storage.LoadedAmmo") ?? "Flechas"),
              img: entry.img || "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
              uuid: entry.sourceUuid || "",
              quantity: qty,
              hasMultiple: qty > 1,
              uses: null,
              containerId: cId,
              draggable: false,
              canUse: false,
              canWithdraw: canRollActor,
              isQuiverAmmo: true
            });
          });
        } else {
          const usesRemaining = containerItem.flags?.["symbaroum-ind-resources"]?.usesRemaining ?? containerItem.system?.uses?.value;
          if (Number(usesRemaining) > 0) {
            const qty = Number(usesRemaining);
            storedItems.push({
              id: "loaded-legacy",
              name: game.i18n?.localize?.("SYMBAROUMHUD.Storage.LoadedAmmo") ?? "Flechas",
              img: "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp",
              uuid: "",
              quantity: qty,
              hasMultiple: qty > 1,
              uses: null,
              containerId: cId,
              draggable: false,
              canUse: false,
              canWithdraw: canRollActor,
              isQuiverAmmo: true
            });
          }
        }
      }

      for (const [sId, sItem] of storedItemMap.entries()) {
        processedIds.add(sId);
        if (isQuiver && storedItems.some((e) => e.name === sItem.name)) continue;
        const rawQty = sItem.system?.number ?? sItem.quantity ?? 1;
        const quantity = Number.isFinite(Number(rawQty)) ? Math.max(1, Math.trunc(Number(rawQty))) : 1;
        const uses = resolveItemUses(sItem, actor);
        storedItems.push({
          id: sItem.id,
          name: sItem.name,
          img: sItem.img || (isQuiver ? "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp" : "icons/svg/item-bag.svg"),
          uuid: sItem.uuid || "",
          quantity,
          hasMultiple: quantity > 1,
          uses,
          containerId: cId,
          draggable: true,
          canUse: canRollActor,
          canWithdraw: canRollActor,
          isQuiverAmmo: isQuiver
        });
      }
      storedItems.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), lang));

      const collapsed = typeof isContainerCollapsed === "function"
        ? isContainerCollapsed(containerItem ?? { id: cId })
        : true;

      let capacity = cData.capacity;
      let canReloadQuiver = false;
      if (isQuiver) {
        const totalLoaded = storedItems.reduce((acc, curr) => acc + (Number(curr.quantity) || 1), 0);
        capacity = `${totalLoaded}/12`;
        canReloadQuiver = canRollActor;
      }

      containers.push({
        id: cId,
        name: cData.name,
        img: cData.img || (isQuiver ? "icons/weapons/ammunition/arrows-bodkin-yellow-red.webp" : "icons/svg/item-bag.svg"),
        uuid: cUuid,
        capacity,
        quantity: 1,
        hasMultiple: false,
        collapsed,
        isQuiver,
        canReloadQuiver,
        items: storedItems,
        itemCount: storedItems.length,
        hasItems: storedItems.length > 0
      });
    }
    containers.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), lang));

    // Exclude any remaining stored items from appearing in general inventory:
    for (const item of allItems) {
      if (item.flags?.["symbaroum-ind-resources"]?.storedIn || item.system?.storedIn) {
        processedIds.add(String(item.id));
      }
      if (IndResourcesIntegration.api?.containers?.isStored?.(item)) {
        processedIds.add(String(item.id));
      }
    }

    // Column 3: All remaining items (unified "Inventário")
    const inventoryItems = allItems
      .filter((item) => {
        if (processedIds.has(String(item.id))) return false;
        if (EXCLUDED_TYPES.has(item.type)) return false;
        if (item.system?.isPower || isMysticalPowerItem(item) || isRitualItem(item) || isTraitLikeItem(item)) return false;
        return true;
      })
      .map((item) => {
        const rawQty = item.system?.number ?? item.system?.quantity ?? 1;
        const quantity = Number.isFinite(Number(rawQty)) ? Math.max(1, Math.trunc(Number(rawQty))) : 1;
        const uses = resolveItemUses(item, actor);
        return {
          id: item.id,
          name: item.name,
          img: item.img || "icons/svg/item-bag.svg",
          uuid: item.uuid || "",
          quantity,
          hasMultiple: quantity > 1,
          uses,
          draggable: true,
          canEdit: canRollActor,
          canUse: canRollActor
        };
      });
    inventoryItems.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), lang));

    const money = moneyContext(actor);
    const rawLoad = indResources?.load ?? null;
    let load = null;
    if (rawLoad) {
      const cur = Number(rawLoad.current ?? 0);
      const cap = Number(rawLoad.capacity ?? 0);
      const percent = cap > 0 ? Math.min(100, Math.round((cur / cap) * 100)) : 0;
      load = {
        current: cur,
        capacity: cap,
        overloaded: Boolean(rawLoad.overloaded),
        percent
      };
    }

    const hasCol1 = weapons.length > 0 || armors.length > 0;
    const hasCol2 = containers.length > 0;
    const hasCol3 = inventoryItems.length > 0;

    return {
      weapons,
      armors,
      equipment: [],
      column1: {
        weapons,
        armors,
        equipment: [],
        hasWeapons: weapons.length > 0,
        hasArmors: armors.length > 0,
        hasEquipment: false
      },
      column2: {
        containers,
        hasContainers: containers.length > 0,
        consumables: [],
        treasure: [],
        hasConsumables: false,
        hasTreasure: false
      },
      column3: {
        items: inventoryItems,
        hasItems: inventoryItems.length > 0,
        survival: inventoryItems,
        general: inventoryItems,
        hasSurvival: false,
        hasGeneral: false
      },
      money,
      load,
      hasWeapons: weapons.length > 0,
      hasArmors: armors.length > 0,
      hasEquipment: false,
      hasColumn1: hasCol1,
      hasColumn2: hasCol2,
      hasColumn3: hasCol3,
      isEmpty: !hasCol1 && !hasCol2 && !hasCol3
    };
  } catch (error) {
    console.error(`${MODULE_ID} | Error building simplifiedInventoryContext:`, error);
    return fallback;
  }
}

function attackContext(actor, { canDrag = false, drawnWeapons = null, canUse = true } = {}) {
  const readiness = readinessContext(drawnWeapons);
  return Array.from(actor?.system?.weapons ?? [])
    .filter((weapon) => weapon?.id && weapon?.name)
    .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang))
    .map((weapon) => {
      const item = findActorItem(actor, weapon.id);
      const uuid = item?.uuid ?? weapon.uuid ?? "";
      const drawn = readiness ? readiness.has(weapon, item, uuid) : false;
      return {
        id: weapon.id,
        img: weapon.img ?? item?.img ?? "icons/svg/sword.svg",
        name: weapon.name,
        uuid,
        drawn,
        canUse,
        readinessKnown: Boolean(readiness),
        readinessLabel: readiness
          ? game.i18n.localize(drawn ? "SYMBAROUMHUD.Attacks.Drawn" : "SYMBAROUMHUD.Attacks.Sheathed")
          : null,
        draggable: Boolean(canDrag && uuid)
      };
    });
}

function readinessContext(drawnWeapons) {
  if (!Array.isArray(drawnWeapons)) return null;
  const ids = new Set();
  const uuids = new Set();
  const names = new Set();

  for (const weapon of drawnWeapons) {
    if (weapon?.id) ids.add(String(weapon.id));
    if (weapon?.uuid) uuids.add(String(weapon.uuid));
    if (weapon?.name) names.add(normalizeText(weapon.name));
  }

  return {
    has: (weapon, item, uuid) => {
      return ids.has(String(item?.id ?? weapon?.id ?? ""))
        || uuids.has(String(uuid ?? item?.uuid ?? weapon?.uuid ?? ""))
        || names.has(normalizeText(weapon?.name ?? item?.name ?? ""));
    }
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function safeCall(callback) {
  try {
    return callback();
  } catch (_error) {
    return null;
  }
}

function storageWithServices(storage, services, {
  selectedId = null,
  editable = false,
  canRemove = false,
  load = null,
  open = false,
  viewMode = STORAGE_VIEW_MODES.GRID
} = {}) {
  const serviceSelected = selectedId === SERVICE_STORAGE_ID;
  const base = storage ?? {
    mode: "inventory",
    containerSelected: false,
    quiverSelected: false,
    armorSelected: false,
    inventoryActive: true,
    armorCount: 0,
    hasContainers: false,
    hasQuiver: false,
    pockets: true,
    id: null,
    name: game.i18n.localize("SYMBAROUMHUD.Storage.Inventory"),
    img: null,
    capacity: null,
    quiver: null,
    quivers: [],
    items: [],
    containers: []
  };
  const records = Array.from(services ?? []).map((record) => ({
    ...record,
    canUse: Boolean(editable && record.canUse),
    canRemove: Boolean(canRemove),
    useLabel: game.i18n.localize(record.fulfillment === "consumable"
      ? "SYMBAROUMHUD.Services.MarkUsed"
      : "SYMBAROUMHUD.Services.Complete"),
    quantityLabel: record.quantity > 1
      ? `${record.quantity} × ${record.unitLabel}`
      : record.unitLabel,
    statusIcon: record.status === "active"
      ? "fa-circle-check"
      : record.status === "expired"
        ? "fa-clock-rotate-left"
        : "fa-circle-check",
    categoryIcon: serviceCategoryIcon(record.category)
  }));
  return {
    ...base,
    mode: serviceSelected ? "services" : base.mode,
    serviceSelected,
    inventoryActive: serviceSelected ? false : base.inventoryActive,
    containerSelected: serviceSelected ? false : base.containerSelected,
    quiverSelected: serviceSelected ? false : base.quiverSelected,
    armorSelected: serviceSelected ? false : base.armorSelected,
    id: serviceSelected ? SERVICE_STORAGE_ID : base.id,
    name: serviceSelected
      ? game.i18n.localize("SYMBAROUMHUD.Services.Title")
      : base.name,
    services: records,
    serviceCount: records.filter(({ status }) => status === "active").length,
    hasServices: records.length > 0,
    load,
    open,
    viewMode,
    listView: viewMode === STORAGE_VIEW_MODES.LIST
  };
}

function serviceCategoryIcon(category) {
  return ({
    hospitality: "fa-bed",
    travel: "fa-route",
    professionals: "fa-user-tie",
    contracts: "fa-file-signature",
    permits: "fa-scroll",
    fees: "fa-receipt",
    information: "fa-book-open-reader"
  })[category] ?? "fa-bell-concierge";
}

function activeEffectContext(actor) {
  return Array.from(actor?.effects ?? [])
    .filter((effect) => !effect.disabled && !effect.isSuppressed)
    .map((effect) => ({
      id: effect.id,
      name: effect.name ?? effect.label ?? game.i18n.localize("SYMBAROUMHUD.Sections.Effects"),
      img: effect.img ?? effect.icon ?? "icons/svg/aura.svg"
    }));
}

export { simplifiedInventoryContext, simplifiedPowersContext, resolveItemUses, isAmmoItem, isQuiverItem };
