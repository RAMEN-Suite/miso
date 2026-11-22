import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    specialCharacters: {
      /**
       * Replaces the selection with the given character.
       *
       * @param {string} character - The character.
       */
      insertSpecialCharacter: (character: string) => ReturnType;
    };
  }
}

/** Inserts special characters, e.g. from the picker, via {@linkcode insertSpecialCharacter}. */
export const SpecialCharacters = Extension.create({
  name: "specialCharacters",

  addCommands() {
    return {
      insertSpecialCharacter:
        (character: string) =>
        ({ tr, dispatch }) => {
          // A selected node (e.g. a line break) would be replaced together with its annotation
          if (!(tr.selection instanceof TextSelection)) {
            return false;
          }

          if (dispatch) {
            tr.insertText(character).scrollIntoView();
          }

          return true;
        },
    };
  },
});
