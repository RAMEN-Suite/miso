import { SpecialCharacterGroup } from "../models/types";
import builtinSpecialCharacters from "../data/specialCharacters.json";

/**
 * The built-in groups of the special characters picker: one group per Unicode block, identified by the block's alias
 * (e.g. `Latin_Extended_A`), with the assigned characters and their Unicode names. Projects pick and extend them in their
 * config.
 */
export const BUILTIN_SPECIAL_CHARACTER_GROUPS: SpecialCharacterGroup[] = builtinSpecialCharacters;
