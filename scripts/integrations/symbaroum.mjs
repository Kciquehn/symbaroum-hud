const DEATH_TEST_MODULE_URL = new URL(
  "../../../../systems/symbaroum/script/common/dialog.js",
  import.meta.url
);

export class SymbaroumIntegration {
  static async rollDeathTest(actor, { showDialog = false } = {}) {
    const module = await import(DEATH_TEST_MODULE_URL.href);
    if (typeof module.prepareRollDeathTest !== "function") {
      throw new Error("The Symbaroum death-test function is unavailable.");
    }

    return module.prepareRollDeathTest(actor, showDialog);
  }
}
