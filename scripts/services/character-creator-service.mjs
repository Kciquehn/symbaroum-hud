import { MODULE_ID } from "../constants.mjs";

const FLAG = "characterCreationMode";
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
    && !actor.getFlag?.(MODULE_ID, FLAG)
  );
}

export function registerCharacterCreatorHooks() {
  const offer = (sheet) => {
    const actor = sheet?.actor ?? sheet?.document ?? sheet?.object;
    void CharacterCreatorService.offer(actor);
  };
  Hooks.on("renderActorSheet", offer);
  Hooks.on("renderSymbaroumActorSheet", offer);
}

export class CharacterCreatorService {
  static async offer(actor) {
    const key = actor?.uuid ?? actor?.id;
    if (!key || pendingActors.has(key) || !shouldOfferCharacterCreator(actor)) return null;

    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (!DialogV2?.wait) return null;

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
      await actor.setFlag(MODULE_ID, FLAG, choice);
      if (choice === CHARACTER_CREATION_MODES.CREATOR) {
        Hooks.callAll(`${MODULE_ID}.characterCreatorRequested`, actor);
        await this.#showPrototypeIntroduction(DialogV2, actor);
      }
      return choice;
    } catch (error) {
      console.error(`${MODULE_ID} | Character creator choice failed.`, error);
      ui.notifications?.error(
        game.i18n.localize("SYMBAROUMHUD.Notifications.ActionFailed")
      );
      return null;
    } finally {
      pendingActors.delete(key);
    }
  }

  static async #showPrototypeIntroduction(DialogV2, actor) {
    return DialogV2.wait({
      classes: ["symbaroum-hud-character-creator-dialog"],
      window: {
        title: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.PrototypeTitle")
      },
      content: `
        <div class="symbaroum-hud-character-creator-intro">
          <i class="fa-solid fa-book-open" aria-hidden="true"></i>
          <h2>${escapeHtml(actor.name)}</h2>
          <p>${game.i18n.localize("SYMBAROUMHUD.CharacterCreator.PrototypeText")}</p>
        </div>
      `,
      buttons: [{
        action: "close",
        icon: "fa-solid fa-check",
        label: game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Understood"),
        default: true
      }],
      rejectClose: false
    });
  }
}

function characterCreatorChoiceContent() {
  return `
    <div class="symbaroum-hud-character-creator-choice">
      <div class="symbaroum-hud-character-creator-emblem" aria-hidden="true">
        <i class="fa-solid fa-scroll"></i>
      </div>
      <h2>${game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Heading")}</h2>
      <p>${game.i18n.localize("SYMBAROUMHUD.CharacterCreator.Description")}</p>
      <small>${game.i18n.localize("SYMBAROUMHUD.CharacterCreator.DecisionHint")}</small>
    </div>
  `;
}

function actorItems(actor) {
  return Array.from(actor?.items?.values?.() ?? actor?.items ?? []);
}

function canOwn(actor, user) {
  if (typeof actor?.testUserPermission === "function") {
    return actor.testUserPermission(user, "OWNER");
  }
  return actor?.isOwner !== false;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
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
