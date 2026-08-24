/**
 * Curated corrections taken from the official equipment tables and the rules
 * that accompany them. Foundry's imported Item ids are stable across the
 * official Adventures, which lets us disambiguate entries such as the two
 * different Grappling Hooks without relying on loose words in their names.
 *
 * The generic classifier remains the fallback for homebrew documents. These
 * adjustments only add/remove the public Categories or functional tags that
 * the official text explicitly supports.
 */

const ASSIGNMENTS = new Map();

function assign(ids, adjustment) {
  for (const id of ids) {
    const current = ASSIGNMENTS.get(id) ?? emptyAdjustment();
    ASSIGNMENTS.set(id, Object.freeze({
      addCategories: merge(current.addCategories, adjustment.addCategories),
      removeCategories: merge(current.removeCategories, adjustment.removeCategories),
      addTags: merge(current.addTags, adjustment.addTags),
      removeTags: merge(current.removeTags, adjustment.removeTags),
      source: adjustment.source ?? current.source ?? "official-table"
    }));
  }
}

const FOOD_COMMON = Object.freeze({
  addCategories: ["food-and-drink"],
  removeCategories: ["containers", "trade-goods"],
  addTags: ["consumable", "prepared-food"],
  source: "apg-table-21"
});

assign([
  "Q9VDumCqbVtCBOCZ", "cTTLahVle3FDrdvp", "SrbTq1gVesikiPnu", "ueaEFXX6abU6Ki4v",
  "SoXo7f5CfOusFluz", "9R3EZpSclWQQcKcu", "0HmwAOVzLftcurjn", "5EIUfgXoeDhzbdxp",
  "7hHQrrpKY8Kw2dL2", "52YqEe21kf7cIsp9", "FJaCL6T6UHYEITJE", "91BVnTZr5NB7LoXy",
  "omMiSehsQfP3CkSc", "rZDUtztcLytrrKBj", "8UNO0bUA8x1w7yfr", "UHwFtS7l3oyS5FBX",
  "JIuFlKjPRqUpzP4z"
], { ...FOOD_COMMON, addCategories: ["beverages"], addTags: ["alcoholic", ...FOOD_COMMON.addTags] });

// Vesa is the explicit non-alcoholic drink in the APG table.
assign(["cTTLahVle3FDrdvp"], {
  removeTags: ["alcoholic"],
  addTags: ["non-alcoholic"],
  source: "apg-table-21"
});

assign([
  "7c6qacZriLYppadW", "ntcQjZ5agwTls9wK", "dZB2JK89jEBQVef5", "iBBNZ1GWDGh1vEuT",
  "0xXMhqDe4Fben1ia", "PEaoP8c22Y6GWO9a"
], { ...FOOD_COMMON, addCategories: ["meat"] });

assign(["mCIshLOVdiYyMBzA", "q4eGSsZvvinwe1Df", "RnLj2HFvCxIYYC3m", "MqPVolHGcQzJotju", "CyUZouVCkkmv83Km"],
  { ...FOOD_COMMON, addCategories: ["teas"] });

assign(["auYHhueBfbULEhlV", "Arc9fQvls3N76x9t", "DQRSroDPBdm5Fshk", "DQNyGjePy51m50VP", "Vo1okTqqmMDfO9bc"],
  { ...FOOD_COMMON, addCategories: ["stews"] });
assign(["Vo1okTqqmMDfO9bc"], { addCategories: ["fish"], source: "apg-table-21" });

assign(["3ZXQivHXXYO6otOM", "q2ZTkwpTvxRTJ4kS", "PqQ44Fv54iClP66N"],
  { ...FOOD_COMMON, addCategories: ["porridges"] });

assign(["VUUePYLOsHGP31IA", "qwlLA7XJRtLPlB81", "FEqyOFCr7XtpskfI", "4WtamCX1Lj7tR8Ln"],
  { ...FOOD_COMMON, addCategories: ["fish"], removeCategories: ["containers", "trade-goods", "desserts"] });

assign([
  "YP5IluhtkhA0LoyP", "RpksPVVzbh5nvrRg", "wOQqzrZcfpOgo72R", "GyImGCyD1M5uaAbT",
  "Sad6A4xaLnbpBDDa", "prneQOqCYnHJHDIc", "zMV85eP0zeVbF2fz", "vZkz9M8915uztsRo",
  "5AGBhOkxrkqRjDVA", "FT5QIdCw5vI8FtwM", "aN3nh7SB1MIURPTq", "yICrS3hrvyoU1lYk",
  "IDmmh6TUekYZmtmJ", "FigHTlM9kZscJzmM", "J1XAlWkx8iRzHIeV", "Nvkw2BT7LQh72aId"
], { ...FOOD_COMMON, addCategories: ["desserts"] });
assign(["RpksPVVzbh5nvrRg"], { addCategories: ["meat"], source: "apg-table-21" });
assign(["J1XAlWkx8iRzHIeV"], { addCategories: ["pies"], source: "apg-table-21" });

assign(["lA80vNYSc3cCmVYI", "Na3YtPkkQEsM18iV"],
  { ...FOOD_COMMON, addCategories: ["soups"] });

assign(["E522AWZVX170oYH0", "QG0MsQNe5yX4VJln", "Ha1sPtsrO7Y0w78Z", "AmKO0vJXN2x8LcCS", "kxew6THRLLyD0enW", "I4bijtBLasDM2s7a", "kyD7qHjho14LhtPH"],
  { ...FOOD_COMMON, addCategories: ["pies"] });
assign(["E522AWZVX170oYH0", "Ha1sPtsrO7Y0w78Z", "I4bijtBLasDM2s7a"], { addCategories: ["meat"], source: "apg-table-21" });
assign(["AmKO0vJXN2x8LcCS", "kyD7qHjho14LhtPH"], { addCategories: ["fish"], source: "apg-table-21" });

// APG Table 23: trade ingredients are also food ingredients, but not prepared dishes.
assign([
  "N2nopfvcRwQ3dWwq", "z3rflOt4Op4Xf27P", "QEdHHUhNDtzaWQcd", "9r932BjZ7sCFH9YY",
  "xQqiqu2v5GWdSwvK", "bNY1zhVCRMfN7LnR", "YP25qn5UCU20JrYR", "qRVvFtubDDfqiKNP",
  "vfot56XhP1EcHer1", "whDIIZBhqTTFRwXK", "TBhVOzLrU2uan1t3", "um0Bm5T794k0Praz",
  "DpHWHYA4bBZYrT0F", "xysREkkfSVxZlRfM", "487naCRVdS1B6NQV", "v23fTkGX2UznPmet"
], {
  addCategories: ["trade-goods", "food-and-drink"],
  addTags: ["ingredient"],
  removeTags: ["prepared-food"],
  source: "apg-table-23"
});

// Core field equipment and APG specialist tools used on expeditions.
assign([
  "yXilV2RZ3XDoc4XG", "lQZ355N4huoTlxHB", "GWrNrjOnDzBSrWdf", "Ot85bJGAzsoonBzX",
  "oVTWWx1RVMBi8SA9", "F8F8WMMFxm5WNtt2", "JUCV3b2At80lIT0P", "HiUvqNPY9LQBTelJ",
  "tALgI0WPrzGRhPep", "14jr0tLMQUM4kLBW", "wJrgYW4SIoZrnDJk", "mT857PQbiqvXYRhq",
  "VQwjt2YTGzPLqR4M", "Wh7J8Tn5umFigWzE", "vWnBrDcSolBcdyGO", "DXO7Hdl7095tDmP5",
  "BqbOGVNZnpPbMuTi", "HUvBL8aGlKayfp6A", "Q5JZxbsjgU7K0xa8", "sZfWU3esv36Bnhuq",
  "rereHD0WR1J9Wy8f", "sHMVwq4xPbw4SHXm", "0pm9O9GmhyDhaDIu", "t0O09fPc9x1MrEYX",
  "5BjMrC9yGVujgGjU", "pkAuqCOCrTUkP9WB", "k4PpTJc0QIMiSjcA"
], { addCategories: ["survival-items"], source: "core-table-12/apg-table-20" });

// Medical preparations and field medicine.
assign(["q7RrwXYIEsMkTUcq", "JPTpIVE5y6BxKnzX", "zXZXi2yTExZhChcO", "aoJvGQh4st21UrYR", "uy0VQD0YEqTClxQI", "Pd543wVzvwAqKjvG", "sSVltexu3egYH38a", "PngUfCXZ7D6prfqX", "sz4uDmvtfshseAzZ"],
  { addCategories: ["medical-supplies"], source: "core-table-11/apg-rules" });
assign(["q7RrwXYIEsMkTUcq", "JPTpIVE5y6BxKnzX", "zXZXi2yTExZhChcO"],
  { addCategories: ["survival-items"], source: "expedition-use" });

// Waybread is food for one person for one week, an elixir and expedition gear.
assign(["pZRbyyX2FrEHM0xr"], {
  addCategories: ["alchemical-elixirs", "food-and-drink", "survival-items"],
  addTags: ["alchemical", "consumable"],
  source: "core-table-11-waybread"
});

// Special ammunition. The ids distinguish the APG arrow-hook from climbing gear.
assign(["KU1ifBABDKgHyKeq", "9k3aTAJJ2wHwAZKA", "22I77kXMahYnEyxL", "LVKo48bE7s9EoxNT", "G4DggGbUJxrlWrzC", "9YH9IXvHgHosoUVZ", "5aYYs0njIwUMZR5Q", "tPZQv08Mf5dajHtr", "an1TKBIxyC1vLjFX"], {
  addCategories: ["arrows"],
  removeCategories: ["tools", "survival-items"],
  source: "apg-table-14"
});
assign(["RNtaeFKzvVis1rBY"], { addCategories: ["arrows", "survival-items"], source: "apg-arrow-grappling-hook" });
assign(["6eDefGOhMG1klpIm", "yin0sHNN2cxbA6OW"], {
  addCategories: ["arrows", "alchemical-elixirs", "alchemical-weapons"],
  source: "apg-table-17"
});

// Weapons with more than one official mechanical role.
assign(["UL9hwMy9EI18vCdo"], {
  addCategories: ["bows"],
  removeCategories: ["one-handed-weapons", "melee-weapons"],
  source: "apg-table-13-horsemans-bow"
});
assign(["UrWQuXVtRuCmIPCM", "6xdyN7d20lQ56NTB"], { addCategories: ["one-handed-weapons", "heavy-weapons"], source: "core-bastard-weapon" });
assign(["znXEWwp6vlfTGubn", "ecoIFYt6rPV7fwMS"], { addCategories: ["one-handed-weapons", "long-weapons"], source: "apg-lance" });
assign(["OZPLEsqZm4DdiCqe", "Cvc8Sfh1lJz2NY7S"], { addCategories: ["one-handed-weapons", "heavy-weapons"], source: "apg-long-hammer" });
assign(["UOuleO8eTNy7HoMk"], {
  // APG p. 115: it is a ranged alchemical weapon and counts as a war hammer
  // in close combat, so both the projectile and Heavy/melee facets apply.
  addCategories: ["projectile-weapons", "heavy-weapons", "alchemical-weapons"],
  source: "apg-portable-firetube"
});
assign(["9u7QgjLOIPBe5s85", "tYJNBnpf7F0XK74x", "WM3GpZTmcyIfmWXu", "GWX6r9gZ85nUkmjz", "n9RMXtUSmlR5s1kt", "51BAcMvLq4qt3NiC", "XM6czmSaRpzELcc9", "6RKNCpvmzdTUpkGb", "eeaGmjM98AYywLXV", "RKhbzKmoZXEIZTDN"],
  { addCategories: ["alchemical-weapons"], source: "apg-alchemical-weapon-rules" });
assign(["DOMBBxoTukA7PO3V", "l81sBzwy9laFDGWK", "WJq0oCyBkWOrO1jr", "4JG3NxzghnYwPlJv", "tYJNBnpf7F0XK74x", "RmGT5eV8yhcn9Edh", "xEHxF78Z9pO1vlOl"],
  { addCategories: ["siege-weapons"], source: "apg-table-15" });
assign(["RmGT5eV8yhcn9Edh"], { addCategories: ["traps", "alchemical-weapons"], source: "apg-breaching-pot-buried" });
assign(["xEHxF78Z9pO1vlOl"], {
  addCategories: ["alchemical-weapons"],
  removeCategories: ["traps"],
  source: "apg-breaching-pot-ground"
});

// Exact exceptions that loose name matching must not leak into other stores.
assign(["AgUiqfl0xvdoxpd9", "Vsq5prYDyCdHrmz1"], { removeCategories: ["musical-instruments"], source: "core-table-12" });
assign(["qI5UoMPKUVils3kF"], { addCategories: ["tobacco-utensils", "containers"], removeCategories: ["tobacco-types"], source: "apg-table-24" });
assign(["btOE3I9V6P9S5D6A", "HczTRhiABT2sopuR"], { removeCategories: ["trade-goods"], source: "artifact-description" });
assign(["yzMSNGDukYWfv4Qx"], { addCategories: ["traps", "melee-weapons"], removeCategories: ["tools"], source: "gmg-living-chain" });
assign(["OjXVofGocEuDhprg"], { addCategories: ["clothing"], removeCategories: ["alchemical-elixirs"], removeTags: ["alchemical", "consumable", "transformative"], source: "gmg-transformation-robes" });
assign(["aoJvGQh4st21UrYR"], { removeCategories: ["alchemical-elixirs"], removeTags: ["alchemical"], source: "apg-healing-spider-artifact" });

// Reference books and manuals function as specialist tools rather than as
// consumable preparations merely because their titles mention artifacts,
// traps, or poison.
assign(["QZyuEshzpp2syyNu", "4dyPzMH8eSvIG1U2", "vHXGEgn2qTkqiDfC"], {
  addCategories: ["specialized-tools"],
  source: "official-equipment-description"
});
assign(["FMWP0vnyPzqB7od8"], {
  addCategories: ["specialized-tools"],
  removeCategories: ["alchemical-elixirs"],
  removeTags: ["alchemical", "consumable", "poison"],
  source: "official-poison-manual"
});
assign(["aoJvGQh4st21UrYR"], { removeTags: ["consumable"], source: "apg-healing-spider-artifact" });
assign(["JUCV3b2At80lIT0P"], { removeCategories: ["containers"], source: "core-bedroll" });
assign(["rm9PQir9HBeur4Hd", "ZLLk8TCTDjplSc2K"], {
  addCategories: ["medical-supplies"],
  source: "official-healing-or-antidote-use"
});

// Prepared dishes must not inherit ingredient or unrelated food subtypes just
// because their localized recipe names mention honey, sugar, spices or broth.
assign(["Sad6A4xaLnbpBDDa", "RnLj2HFvCxIYYC3m", "aN3nh7SB1MIURPTq", "Nvkw2BT7LQh72aId"], {
  removeTags: ["ingredient"],
  source: "apg-table-21-prepared-food"
});
assign(["SoXo7f5CfOusFluz", "9R3EZpSclWQQcKcu"], {
  removeCategories: ["soups"],
  removeTags: ["non-alcoholic"],
  source: "apg-table-21-blackbrew"
});
assign(["3ZXQivHXXYO6otOM"], { removeCategories: ["beverages"], source: "apg-table-21-porridge" });

// Physical facets of official artifacts.
assign(["bxcZ38u7sA4P0xGh"], { addCategories: ["long-weapons"], source: "apg-rune-staff" });
assign(["Aq7XlQZjroTWlC5e", "PjfNwxvHTxvZI6L0", "7yCNnUmEmPS4g3PL", "TduUp0xpHKB5ZtUs", "fUWOjyTMydalblNo", "18wuMCLBPczy6u2o", "JRLGgeprigmu3UTa", "171e1TCiFYexIE2O", "dxYAfK2qfZxlJx12", "SqYq8j2XIqJDWwf5", "OjXVofGocEuDhprg"],
  { addCategories: ["clothing"], source: "artifact-physical-form" });
assign(["xv8hdPHdp7nWj9s9", "lNkcn3NFl6WnzXmK", "rooGtkM2d2vzbe5R", "clBZJMHsDcd37s9H"], {
  addCategories: ["clothing"],
  source: "official-armor-garment"
});
assign(["32zf6Im62hd4qEyU"], { addCategories: ["short-weapons"], source: "gmg-ashiki-blades" });
assign(["q4teNj0ZJliRWchW"], {
  addCategories: ["throwing-weapons"],
  removeCategories: ["projectile-weapons"],
  source: "gmg-steel-circle"
});
assign(["NRri0uwGBn9LZNXY"], { addCategories: ["shields"], source: "gmg-mirrored-shield" });
assign(["eHf3T4HfT0PhWGsM"], { addCategories: ["musical-instruments", "heavy-weapons"], source: "gmg-war-horn" });

export function officialItemCategoryAdjustment(item) {
  for (const id of itemIdentityCandidates(item)) {
    const adjustment = ASSIGNMENTS.get(id);
    if (adjustment) return adjustment;
  }
  return null;
}

export const OFFICIAL_ITEM_CATEGORY_ASSIGNMENT_COUNT = ASSIGNMENTS.size;

function itemIdentityCandidates(item) {
  const candidates = new Set([item?.id, item?._id]);
  for (const source of [item?._stats?.compendiumSource, item?.flags?.core?.sourceId]) {
    const id = String(source ?? "").split(".").at(-1);
    if (id) candidates.add(id);
  }
  return [...candidates].filter(Boolean);
}

function emptyAdjustment() {
  return { addCategories: [], removeCategories: [], addTags: [], removeTags: [], source: null };
}

function merge(left = [], right = []) {
  return Object.freeze([...new Set([...left, ...right])]);
}
