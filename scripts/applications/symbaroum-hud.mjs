import {
  MODULE_ID,
  SETTINGS,
  STORAGE_VIEW_MODES
} from "../constants.mjs";
import { refreshHotbarShortcuts } from "../integrations/hotbar-shortcuts.mjs";
import { IndResourcesIntegration } from "../integrations/ind-resources.mjs";
import {
  applyPlayerListVisibility,
  getSetting,
  getStorageViewMode
} from "../settings.mjs";
import { ActorService, canUsePowerItem, isTraitLikeItem } from "../services/actor-service.mjs";
import { ritualistProgress } from "../services/ritual-service.mjs";

const ApplicationV2 = foundry.applications.api.ApplicationV2;
const HOTBAR_CONTROL_ACTIONS = new Set(["mute", "menu"]);
const CONTROL_TOOLTIP_DELAY_MS = 800;
const IND_RESOURCES_CONTAINER_DRAG_TYPE = "application/x-tenebre-container-item";
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
  #effectMenuAbortController = null;
  #effectMenuElement = null;
  #hostilityTint = null;
  #hotbarAnchor = null;
  #listenerAbortController = null;
  #manualActorKey = null;
  #mysticalPowersOpen = false;
  #resolvedActorKey = null;
  #selectedAbilityId = null;
  #selectedAbilityTab = DEFAULT_ABILITY_TAB;
  #selectedMysticalPowerId = null;
  #selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
  #selectedRitualId = null;
  #selectedTraitId = null;
  #storageContainerId = null;
  #storageDragData = null;
  #storageOpen = false;
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
    if (resolvedKey !== this.#resolvedActorKey) {
      this.#resolvedActorKey = resolvedKey;
      this.#manualActorKey = null;
      this.#mysticalPowersOpen = false;
      this.#abilitiesOpen = false;
      this.#attacksOpen = false;
      this.#selectedAbilityId = null;
      this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
      this.#selectedMysticalPowerId = null;
      this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
      this.#selectedRitualId = null;
      this.#selectedTraitId = null;
      this.#storageContainerId = null;
      this.#storageOpen = false;
      this.#ritualsOpen = false;
      this.#traitsOpen = false;
      if (resolvedActor) this.#actor = resolvedActor;
    }

    if (this.#manualActorKey) {
      const manualActor = ActorService.accessibleActors(this.#actor)
        .find((actor) => actorKey(actor) === this.#manualActorKey);
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
    const toughness = actor?.system?.health?.toughness ?? {};
    const corruption = actor?.system?.health?.corruption ?? {};
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
    const storageViewMode = getStorageViewMode();
    const abilities = await abilityContext(
      actor,
      this.#selectedAbilityId,
      this.#selectedAbilityTab,
      { traits: false }
    );
    const mysticalPowers = await abilityContext(
      actor,
      this.#selectedMysticalPowerId,
      this.#selectedMysticalPowerTab,
      { mysticalPowers: true }
    );
    const traits = await abilityContext(
      actor,
      this.#selectedTraitId,
      DEFAULT_ABILITY_TAB,
      { traits: true }
    );
    const rituals = await ritualContext(actor, this.#selectedRitualId);
    const knowledgeButtons = [
      indResources.actions?.maneuvers,
      rituals.available,
      mysticalPowers.available,
      abilities.available,
      traits.available
    ].filter(Boolean).length;

    return {
      hasActor: Boolean(actor),
      canCycleActor: ActorService.accessibleActors(actor).length > 1,
      knowledge: {
        available: showPlayerResources || knowledgeButtons > 0,
        columns: knowledgeButtons > 2 ? 2 : 1,
        showExperience: showPlayerResources
      },
      showEconomy: showPlayerResources,
      playersHidden: getSetting(SETTINGS.HIDE_PLAYERS),
      weaponDrawn: Boolean(indResources.drawnWeapons?.length),
      actions: {
        attributes: canRollActor,
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
        weaponReadiness: Boolean(canUseCharacterActions && indResources.readiness)
      },
      readiness: canUseCharacterActions ? indResources.readiness : null,
      ammoRecovery: canUseCharacterActions ? indResources.ammoRecovery : null,
      attributes: attributeContext(actor),
      abilities: {
        canUse: canRollActor,
        ...abilities,
        open: this.#abilitiesOpen && abilities.available
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
        open: this.#traitsOpen && traits.available
      },
      attacks: {
        canUse: canRollActor,
        items: attackContext(actor, {
          canDrag: canRollActor,
          drawnWeapons: indResources.drawnWeapons
        }),
        open: this.#attacksOpen
      },
      effects: activeEffectContext(actor),
      storage: indResources.storage
        ? {
            ...indResources.storage,
            load: indResources.load,
            open: this.#storageOpen,
            viewMode: storageViewMode,
            listView: storageViewMode === STORAGE_VIEW_MODES.LIST
          }
        : null,
      info: {
        defense: defenseValue(actor),
        armor: armorValue(actor),
        armorName: armorName(actor),
        experience: showPlayerResources ? experienceContext(actor) : null,
        load: showPlayerResources && indResources.active ? indResources.load : null,
        money: showPlayerResources ? moneyContext(actor) : null,
        rations: indResources.active ? indResources.rations : null,
        quiver: indResources.active ? indResources.quiver : null
      },
      actor: actor
        ? {
            name: actor.name,
            img: actor.img,
            deathFailures: failedDeathRolls(actor),
            vitality: {
              value: number(toughness.value),
              max: number(toughness.max)
            },
            corruption: {
              temporary: number(corruption.temporary),
              permanent: number(corruption.permanent),
              max: number(corruption.max)
            }
          }
        : {
            name: game.i18n.localize("SYMBAROUMHUD.Empty"),
            img: "icons/svg/mystery-man.svg",
            deathFailures: [],
            vitality: { value: 0, max: 0 },
            corruption: { temporary: 0, permanent: 0, max: 0 }
          }
    };
  }

  async _renderHTML(context) {
    return renderTemplate(`modules/${MODULE_ID}/templates/hud.hbs`, context);
  }

  _replaceHTML(result, content) {
    this.#closeEffectMenu();
    const hotbar = document.getElementById("hotbar");
    if (hotbar && content.contains(hotbar)) hotbar.remove();

    content.innerHTML = result;
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
    this.#updateHostilityTint(null);
    this.#clearDelayedTooltip();
    this.#restoreHotbar();
    this.#actor = null;
    this.#abilitiesOpen = false;
    this.#attacksOpen = false;
    this.#manualActorKey = null;
    this.#mysticalPowersOpen = false;
    this.#resolvedActorKey = null;
    this.#selectedAbilityId = null;
    this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
    this.#selectedMysticalPowerId = null;
    this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
    this.#selectedRitualId = null;
    this.#selectedTraitId = null;
    this.#storageContainerId = null;
    this.#storageDragData = null;
    this.#storageOpen = false;
    this.#ritualsOpen = false;
    this.#traitsOpen = false;
    return super._onClose(options);
  }

  #activateListeners(root) {
    this.#listenerAbortController?.abort();
    this.#listenerAbortController = new AbortController();
    const signal = this.#listenerAbortController.signal;
    this.#clearDelayedTooltip();

    root.addEventListener("click", (event) => {
      const actionElement = event.target.closest("[data-action]");
      if (!actionElement || !root.contains(actionElement) || actionElement.closest("#hotbar")) return;
      event.preventDefault();
      void this.#onAction(actionElement, event);
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
      if (!ActorService.canUpdate(actor) || !item?.uuid) {
        event.preventDefault();
        return;
      }

      const serializedDocument = JSON.stringify({
        type: "Item",
        uuid: item.uuid
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

      const source = itemElement.dataset.containerId ? "stored" : "inventory";
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
      if (source === "inventory") {
        event.dataTransfer.setData("text/plain", serializedDocument);
        event.dataTransfer.setData("application/json", serializedDocument);
      }
      event.dataTransfer.setData(
        IND_RESOURCES_CONTAINER_DRAG_TYPE,
        serializedContainer
      );
    }, { signal });

    root.addEventListener("dragover", (event) => {
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
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      inventoryElement.dataset.storageInventoryTarget = "true";
    }, { signal });

    root.addEventListener("dragleave", (event) => {
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

  #dockHotbar(root, detachedHotbar = null) {
    const hotbar = detachedHotbar ?? document.getElementById("hotbar");
    const slot = root.querySelector("[data-symba-hotbar]");
    if (!hotbar || !slot) return;

    if (!this.#hotbarAnchor && hotbar.parentNode && !root.contains(hotbar)) {
      this.#hotbarAnchor = document.createComment(`${MODULE_ID}:hotbar`);
      hotbar.parentNode.insertBefore(this.#hotbarAnchor, hotbar);
    }

    slot.appendChild(hotbar);
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
    const active = root
      ?.querySelector("[data-symba-weapon-drawn]")
      ?.dataset.symbaWeaponDrawn === "true";

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

      const actor = this.#actor;
      if (!actor) return;

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
      if (action === "delete-storage-item") {
        return IndResourcesIntegration.deleteStorageItem(
          actor,
          element.dataset.containerId,
          element.dataset.itemId
        );
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
      if (action === "roll-weapon") {
        return ActorService.rollWeapon(actor, element.dataset.itemId);
      }
      if (action === "roll-attribute") {
        return ActorService.rollAttribute(actor, element.dataset.attribute);
      }
      if (action === "roll-defense") return ActorService.rollArmor(actor);
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
    } catch (error) {
      console.error(`${MODULE_ID} | HUD action failed.`, error);
      ui.notifications.error(game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed"));
    }
  }

  #openAddAbilityDialog(actor) {
    if (!ActorService.canUpdate(actor)) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoPermission"));
      return;
    }

    const abilities = ActorService.availableWorldAbilities(actor);
    if (!abilities.length) {
      ui.notifications.warn(game.i18n.localize("SYMBAROUMHUD.Notifications.NoAvailableAbilities"));
      return;
    }

    const entries = abilities.map((item, index) => `
      <label class="symbaroum-hud-ability-picker-entry" data-search-index="${escapeHtml(`${item.name ?? ""} ${item.system?.reference ?? ""}`.toLocaleLowerCase())}">
        <input type="radio" name="abilityId" value="${escapeHtml(item.id)}" ${index === 0 ? "checked" : ""}>
        <img src="${escapeHtml(item.img ?? "icons/svg/item-bag.svg")}" alt="">
        <span>
          <strong>${escapeHtml(item.name)}</strong>
          ${item.system?.reference ? `<small>${escapeHtml(item.system.reference)}</small>` : ""}
        </span>
      </label>
    `).join("");
    const content = `
      <form class="symbaroum-hud-ability-picker">
        <p>${game.i18n.localize("SYMBAROUMHUD.Abilities.AddPrompt")}</p>
        <label class="symbaroum-hud-ability-picker-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" name="abilitySearch" autocomplete="off" placeholder="${escapeHtml(game.i18n.localize("SYMBAROUMHUD.Abilities.Search"))}">
        </label>
        <div class="symbaroum-hud-ability-picker-list">${entries}</div>
        <p class="symbaroum-hud-ability-picker-empty" hidden>${game.i18n.localize("SYMBAROUMHUD.Abilities.NoSearchResults")}</p>
      </form>
    `;

    const dialog = new Dialog({
      title: game.i18n.localize("SYMBAROUMHUD.Abilities.Add"),
      content,
      buttons: {
        ok: {
          label: game.i18n.localize("SYMBAROUMHUD.Abilities.Buy"),
          callback: async (html) => {
            const root = html?.[0] ?? html;
            const itemId = root?.querySelector?.("input[name='abilityId']:checked")?.value;
            const created = await ActorService.buyWorldAbility(actor, itemId);
            if (created) {
              this.#selectedAbilityId = created.id;
              this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
              this.#abilitiesOpen = true;
              this.#attacksOpen = false;
              this.#mysticalPowersOpen = false;
              this.#ritualsOpen = false;
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

    const entries = maneuvers.map((maneuver, index) => `
      <label class="symbaroum-hud-ability-picker-entry symbaroum-hud-maneuver-picker-entry" data-search-index="${escapeHtml(`${maneuver.label ?? ""} ${(maneuver.notes ?? []).join(" ")}`.toLocaleLowerCase())}">
        <input type="radio" name="maneuverId" value="${escapeHtml(maneuver.id)}" ${index === 0 ? "checked" : ""}>
        <i class="fa-solid ${escapeHtml(maneuver.icon)}" aria-hidden="true"></i>
        <span>
          <strong>${escapeHtml(maneuver.label)}</strong>
          ${maneuver.notes?.length ? `<small>${escapeHtml(maneuver.notes.join(" · "))}</small>` : ""}
        </span>
      </label>
    `).join("");
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
      render: setupAbilityPickerSearch
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
    this.#actor = actors[nextIndex];
    this.#manualActorKey = actorKey(this.#actor);
    this.#abilitiesOpen = false;
    this.#attacksOpen = false;
    this.#mysticalPowersOpen = false;
    this.#selectedAbilityId = null;
    this.#selectedAbilityTab = DEFAULT_ABILITY_TAB;
    this.#selectedMysticalPowerId = null;
    this.#selectedMysticalPowerTab = DEFAULT_ABILITY_TAB;
    this.#selectedRitualId = null;
    this.#selectedTraitId = null;
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

function defenseValue(actor) {
  const prepared = Number(actor?.system?.combat?.defense);
  if (Number.isFinite(prepared)) return prepared;

  const attribute = actor?.system?.defense?.attribute;
  return number(actor?.system?.attributes?.[attribute]?.total);
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
  { mysticalPowers = false, traits = false } = {}
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

  return {
    available: items.length > 0,
    items: items.map((item) => ({
      id: item.id,
      img: item.img ?? "icons/svg/item-bag.svg",
      name: item.name,
      uuid: item.uuid,
      active: item.id === selectedItem?.id
    })),
    selected: selectedItem
      ? await abilityDetailContext(selectedItem, selectedAbilityTab)
      : null
  };
}

async function ritualContext(actor, selectedRitualId = null) {
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
    selected: selectedItem
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
  const trait = isTraitLikeItem(item);
  const hasLevels = !trait;
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

function attackContext(actor, { canDrag = false, drawnWeapons = null } = {}) {
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

function activeEffectContext(actor) {
  return Array.from(actor?.effects ?? [])
    .filter((effect) => !effect.disabled && !effect.isSuppressed)
    .map((effect) => ({
      id: effect.id,
      name: effect.name ?? effect.label ?? game.i18n.localize("SYMBAROUMHUD.Sections.Effects"),
      img: effect.img ?? effect.icon ?? "icons/svg/aura.svg"
    }));
}
