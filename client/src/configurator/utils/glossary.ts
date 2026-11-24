import { describeConfigTerm, type ConfigTerm } from "../external";

/**
 * Explanations of the configurator's own terms. Terms of the config itself are described in its schema, see
 * `describeConfigTerm`.
 */
const GLOSSARY = {
  entry:
    "The settings of one model element in the config. An element without an entry (grey in the list) uses the defaults; changing a setting creates its entry.",
  findings:
    "What the checks found. Problems make the config unusable and block the export; warnings don't (the setting is ignored where it doesn't apply).",
  dataMigration:
    "The stored data refers to elements by name (labels, annotation types, relationship types, property names). A rename in the model needs a migration of the database.",} as const;

/** A term with an explanation: a term of the config or of the configurator */
export type Term = ConfigTerm | keyof typeof GLOSSARY;

/**
 * The explanation of a term.
 *
 * @param {Term} term - The term.
 * @returns {string} The explanation.
 */
export function explain(term: Term): string {
  if (term in GLOSSARY) {
    return GLOSSARY[term as keyof typeof GLOSSARY];
  } else {
    return describeConfigTerm(term as ConfigTerm);
  }
}
