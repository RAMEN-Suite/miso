import { describe, expect, test } from "vitest";
import { type SpecialCharacterGroup, resolveSpecialCharacterGroups } from "../../../../../src/editors/text/src";

const latin: SpecialCharacterGroup = {
  id: "Latin_Extended_A",
  label: "Latin Extended-A",
  characters: [{ character: "ſ", name: "LATIN SMALL LETTER LONG S" }],
};

const greek: SpecialCharacterGroup = {
  id: "Greek_And_Coptic",
  label: "Greek and Coptic",
  characters: [{ character: "α", name: "GREEK SMALL LETTER ALPHA" }],
};

const builtins: SpecialCharacterGroup[] = [latin, greek];

describe("resolveSpecialCharacterGroups", () => {
  test("offers all built-in groups without config", () => {
    expect(resolveSpecialCharacterGroups(undefined, builtins)).toEqual({ groups: builtins, warnings: [] });
  });

  test("offers no groups for an empty config", () => {
    expect(resolveSpecialCharacterGroups([], builtins)).toEqual({ groups: [], warnings: [] });
  });

  test("keeps the configured order of built-in and own groups", () => {
    const sigla = { id: "sigla", label: "Sigla", characters: [{ character: "ꝝ", name: "rum abbreviation" }] };

    const { groups } = resolveSpecialCharacterGroups(["Greek_And_Coptic", sigla, "Latin_Extended_A"], builtins);

    expect(groups.map((group) => group.id)).toEqual(["Greek_And_Coptic", "sigla", "Latin_Extended_A"]);
  });

  test("extends a built-in group with the characters of a group with its id", () => {
    const { groups, warnings } = resolveSpecialCharacterGroups(
      [{ id: "Greek_And_Coptic", characters: [{ character: "ϛ", name: "stigma" }] }],
      builtins,
    );

    expect(warnings).toEqual([]);
    expect(groups).toEqual([{ ...greek, characters: [...greek.characters, { character: "ϛ", name: "stigma" }] }]);
  });

  test("replaces the label of an extended built-in group if one is given", () => {
    const { groups } = resolveSpecialCharacterGroups([{ id: "Greek_And_Coptic", label: "Greek", characters: [] }], builtins);

    expect(groups[0].label).toBe("Greek");
    expect(groups[0].characters).toEqual(greek.characters);
  });

  test("never changes the built-in groups", () => {
    resolveSpecialCharacterGroups([{ id: "Latin_Extended_A", characters: [{ character: "ꝑ", name: "p" }] }], builtins);

    expect(latin.characters).toHaveLength(1);
  });

  test("merges a group into one listed before with the same id, at its first position", () => {
    const { groups } = resolveSpecialCharacterGroups(
      [
        "Greek_And_Coptic",
        { id: "sigla", label: "Sigla", characters: [{ character: "ꝝ", name: "rum" }] },
        { id: "Greek_And_Coptic", characters: [{ character: "ϛ", name: "stigma" }] },
        { id: "sigla", characters: [{ character: "ꝑ", name: "per" }] },
      ],
      builtins,
    );

    expect(groups).toEqual([
      { ...greek, characters: [...greek.characters, { character: "ϛ", name: "stigma" }] },
      {
        id: "sigla",
        label: "Sigla",
        characters: [
          { character: "ꝝ", name: "rum" },
          { character: "ꝑ", name: "per" },
        ],
      },
    ]);
    expect(greek.characters).toHaveLength(1);
  });

  test("skips unknown ids and characters already in the group with a warning", () => {
    const { groups, warnings } = resolveSpecialCharacterGroups(
      [
        "Unknown_Block",
        "Latin_Extended_A",
        "Latin_Extended_A",
        { id: "Greek_And_Coptic", characters: [{ character: "α", name: "alpha again" }] },
      ],
      builtins,
    );

    expect(groups).toEqual([latin, greek]);
    expect(warnings).toHaveLength(2);
  });

  test("shows the id of an own group without label, with a warning", () => {
    const { groups, warnings } = resolveSpecialCharacterGroups([{ id: "sigla", characters: [] }], builtins);

    expect(groups[0].label).toBe("sigla");
    expect(warnings).toHaveLength(1);
  });
});
