import type { Diagnostic, ModelInstanceGraph, ModelInstanceNode, ValidationResult } from "@ramen-suite/core";
import type { loadPlaygroundModel } from "./ramenPlaygroundModel";

/** Result of one ramen-core check. `error` is set when the check threw instead of returning diagnostics */
export interface CheckResult {
  label: string;
  expectation: "valid" | "invalid";
  diagnostics: readonly Diagnostic[];
  hasErrors: boolean;
  error?: string;
  input?: unknown;
}

function runCheck(
  label: string,
  expectation: CheckResult["expectation"],
  check: () => ValidationResult,
  input?: unknown,
): CheckResult {
  try {
    const result: ValidationResult = check();
    return { label, expectation, diagnostics: result.diagnostics, hasErrors: result.hasErrors, input };
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    return { label, expectation, diagnostics: [], hasErrors: true, error: message, input };
  }
}

/**
 * Single-value checks that need no recorded data graph (see `docs/ramen/validation.md`, "Check one input").
 */
export function runValueChecks({ edition, nodes }): CheckResult[] {
  return [
    runCheck("role.name = 'sender'", "valid", () =>
      edition.validateAnnotationValue(nodes.textAnnotation, "role", "name", "sender"),
    ),
    runCheck("role.name = 'editor'", "invalid", () =>
      edition.validateAnnotationValue(nodes.textAnnotation, "role", "name", "editor"),
    ),
    runCheck("Regesta.startDate = '1250-05-01'", "valid", () =>
      edition.validateAttributeValue(nodes.regesta, "startDate", "1250-05-01"),
    ),
    runCheck("Regesta.startDate = 'May 1250'", "invalid", () =>
      edition.validateAttributeValue(nodes.regesta, "startDate", "May 1250"),
    ),
    runCheck("Regesta.status = 'archived'", "invalid", () => edition.validateAttributeValue(nodes.regesta, "status", "archived")),
    runCheck("Summary.text = 42", "invalid", () => edition.validateAttributeValue(nodes.summary, "text", 42)),
  ];
}

/**
 * Validates recorded data as a complete `ModelInstanceGraph` (see `docs/ramen/validation.md`, "Check recorded data").
 * One Regesta with a Summary, a `person` annotation and one Person, plus broken variants of it.
 */
export function runInstanceChecks({ edition, nodes, relations }: PlaygroundModel): CheckResult[] {
  const regesta: ModelInstanceNode = {
    id: crypto.randomUUID(),
    typeId: nodes.regesta.id,
    properties: { uuid: crypto.randomUUID(), label: "RI V,1,1 n. 4521", startDate: "1250-05-01", status: "draft" },
  };
  const summary: ModelInstanceNode = {
    id: crypto.randomUUID(),
    typeId: nodes.summary.id,
    properties: { uuid: crypto.randomUUID(), text: "Konrad urkundet für Kloster Lorch." },
  };
  const annotation: ModelInstanceNode = {
    id: crypto.randomUUID(),
    typeId: nodes.textAnnotation.id,
    properties: {
      uuid: crypto.randomUUID(),
      type: "person",
      selector: { type: "TextPositionSelector", start: 0, end: 6 },
    },
  };
  const person: ModelInstanceNode = {
    id: crypto.randomUUID(),
    typeId: nodes.person.id,
    properties: { uuid: crypto.randomUUID(), label: "Konrad IV." },
  };

  const data: ModelInstanceGraph = {
    nodes: [regesta, summary, annotation, person],
    relations: [
      { id: crypto.randomUUID(), typeId: relations.summaryInRegesta.id, fromId: summary.id, toId: regesta.id },
      { id: crypto.randomUUID(), typeId: relations.summaryCarrier.id, fromId: summary.id, toId: annotation.id },
      { id: crypto.randomUUID(), typeId: relations.personLink.id, fromId: annotation.id, toId: person.id },
    ],
  };

  const withoutReference: ModelInstanceGraph = { ...data, relations: data.relations.slice(0, 2) };

  const withUnknownProperty: ModelInstanceGraph = {
    ...data,
    nodes: [regesta, summary, { ...annotation, properties: { ...annotation.properties, isZeroPoint: false } }, person],
  };

  const withoutStartDate: ModelInstanceGraph = {
    ...data,
    nodes: [
      { ...regesta, properties: { uuid: regesta.properties.uuid, label: regesta.properties.label } },
      summary,
      annotation,
      person,
    ],
  };

  const withUndeclaredType: ModelInstanceGraph = {
    ...data,
    nodes: [regesta, summary, { ...annotation, properties: { ...annotation.properties, type: "persName" } }, person],
  };

  // Today's MISO shape: flat character indices instead of a selector
  const withFlatIndices: ModelInstanceGraph = {
    ...data,
    nodes: [
      regesta,
      summary,
      {
        ...annotation,
        properties: { uuid: annotation.properties.uuid, type: "person", startIndex: 0, endIndex: 6 },
      },
      person,
    ],
  };

  return [
    runCheck("Complete graph", "valid", () => edition.validateInstances(data), data),
    runCheck(
      "person annotation without REFERS_TO",
      "invalid",
      () => edition.validateInstances(withoutReference),
      withoutReference,
    ),
    runCheck(
      "Unknown property isZeroPoint",
      "invalid",
      () => edition.validateInstances(withUnknownProperty),
      withUnknownProperty,
    ),
    runCheck(
      "Regesta without required startDate",
      "invalid",
      () => edition.validateInstances(withoutStartDate),
      withoutStartDate,
    ),
    runCheck(
      "Undeclared annotation type persName",
      "invalid",
      () => edition.validateInstances(withUndeclaredType),
      withUndeclaredType,
    ),
    runCheck(
      "Today's MISO shape: flat startIndex/endIndex",
      "invalid",
      () => edition.validateInstances(withFlatIndices),
      withFlatIndices,
    ),
  ];
}
