import { SpecialCharacter, SpecialCharacterGroup, SpecialCharacterGroupConfig } from "../../models/types";

/**
 * Builds the groups of the special characters picker from the config, in the configured order:
 * - Without config, all built-in groups are offered. An empty config offers none.
 * - An id pulls in the built-in group.
 * - A group with an id that is already there (a built-in group, or one listed before) is merged into that group at its
 *   first position: its characters are appended, its label replaces the previous one if given. Other groups are used as
 *   they are.
 *
 * Unknown ids and characters that are already in the group are skipped with a warning. The built-in groups are never
 * changed.
 *
 * @param {SpecialCharacterGroupConfig[] | undefined} config - The configured groups.
 * @param {SpecialCharacterGroup[]} builtinGroups - The built-in groups.
 * @returns {{ groups: SpecialCharacterGroup[]; warnings: string[] }} The groups of the picker and the warnings.
 */
export function resolveSpecialCharacterGroups(
  config: SpecialCharacterGroupConfig[] | undefined,
  builtinGroups: SpecialCharacterGroup[],
): { groups: SpecialCharacterGroup[]; warnings: string[] } {
  const warnings: string[] = [];

  if (config === undefined) {
    return { groups: builtinGroups, warnings };
  }

  const builtinById = new Map<string, SpecialCharacterGroup>(builtinGroups.map((group) => [group.id, group]));
  // Insertion order is the order of the picker
  const groupsById = new Map<string, SpecialCharacterGroup>();

  for (const entry of config) {
    const id: string = typeof entry === "string" ? entry : entry.id;
    const builtin: SpecialCharacterGroup | undefined = builtinById.get(id);
    const existing: SpecialCharacterGroup | undefined = groupsById.get(id);

    if (typeof entry === "string") {
      if (!builtin) {
        warnings.push(`"${id}" is no built-in group, it is skipped`);
      } else if (!existing) {
        groupsById.set(id, { ...builtin, characters: [...builtin.characters] });
      }

      continue;
    }

    const base: SpecialCharacterGroup | undefined = existing ?? builtin;
    const characters: SpecialCharacter[] = existing?.characters ?? [...(builtin?.characters ?? [])];
    const knownCharacters = new Set<string>(characters.map((item) => item.character));

    for (const item of entry.characters) {
      if (knownCharacters.has(item.character)) {
        warnings.push(`Group "${id}": "${item.character}" (${item.name}) is already in the group, it is skipped`);
      } else {
        knownCharacters.add(item.character);
        characters.push(item);
      }
    }

    const label: string | undefined = entry.label ?? base?.label;

    if (!label) {
      warnings.push(`Group "${id}" has no label, its id is shown instead`);
    }

    groupsById.set(id, { id, label: label ?? id, characters });
  }

  return { groups: [...groupsById.values()], warnings };
}
