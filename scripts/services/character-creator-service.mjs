import { MODULE_ID } from "../constants.mjs";
import {
  CORE_OCCUPATIONS,
  OCCUPATION_ARCHETYPES,
  coreOccupation
} from "../data/core-occupations.mjs";

const MODE_FLAG = "characterCreationMode";
const STATE_FLAG = "characterCreatorState";
const OCCUPATION_STEP_COMPLETE = "occupation-complete";
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
  return actor?.getFlag?.(MODULE_ID, STATE_FLAG)?.step === OCCUPATION_STEP_COMPLETE;
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
        await this.#showOccupationBook(DialogV2, actor);
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
      return await this.#showOccupationBook(DialogV2, actor);
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
          <small>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Guide.Title")}</small>
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
          <p>${localizeEscaped("SYMBAROUMHUD.CharacterCreator.Occupation.IndexHint")}</p>
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
