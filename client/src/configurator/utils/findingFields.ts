import type { ConfigFinding } from "../external";

/** A control of an element's form that findings can point to; the form shows them below it */
export type FindingField = "extent" | "representation" | "shortcut" | "styling" | "variants" | "attributes";

/** The path of an entry, e.g. `elements.annotations["<ref>"] ("name")`, and what follows it */
const ENTRY_PATH_PATTERN: RegExp = /^elements\.\w+\["[^"]*"\] \("[^"]*"\)(.*)$/;

/**
 * The controls a finding points to, from the rest of its path after the entry.
 *
 * @param {ConfigFinding} finding - The finding.
 * @returns {FindingField[]} The controls, empty for findings on the element as a whole (e.g. a name hint).
 */
export function fieldsOf(finding: ConfigFinding): FindingField[] {
  const rest: string | undefined = ENTRY_PATH_PATTERN.exec(finding.path)?.[1];

  if (finding.attributeRef || rest?.startsWith(".attributes")) {
    return ["attributes"];
  } else if (rest === undefined) {
    return [];
  } else if (rest === ".editing") {
    // Extent and representation missing, the message says which
    return ["extent", "representation"];
  } else if (rest.startsWith(".editing.extent")) {
    return ["extent"];
  } else if (rest.startsWith(".editing.representation")) {
    return ["representation"];
  } else if (rest.startsWith(".controls.shortcut")) {
    return ["shortcut"];
  } else if (rest.startsWith(".appearance.variants")) {
    return ["variants"];
  } else if (rest.startsWith(".appearance.highlight") || rest.startsWith(".appearance.marker")) {
    return ["styling"];
  }

  return [];
}

/**
 * Whether a control of the form shows a finding, so the list on top can leave it out.
 *
 * @param {ConfigFinding} finding - The finding.
 * @param {ReadonlySet<FindingField>} shownFields - The controls the form currently shows.
 * @returns {boolean} `true` if one of its controls is shown.
 */
export function isShownAtField(finding: ConfigFinding, shownFields: ReadonlySet<FindingField>): boolean {
  return fieldsOf(finding).some((field) => shownFields.has(field));
}

/**
 * Whether two findings are the same; the checks run again after each edit, so the objects differ.
 *
 * @param {ConfigFinding | undefined} a - A finding.
 * @param {ConfigFinding | undefined} b - Another finding.
 * @returns {boolean} `true` if both say the same about the same place.
 */
export function isSameFinding(a: ConfigFinding | undefined, b: ConfigFinding | undefined): boolean {
  return !!a && !!b && a.severity === b.severity && a.path === b.path && a.message === b.message;
}
