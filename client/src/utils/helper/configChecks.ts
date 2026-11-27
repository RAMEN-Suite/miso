import type { Attribute } from "@ramen-suite/core";
import type {
  AnnotationExtent,
  AnnotationShapeConfig,
  AppearanceOverride,
  ModelAnnotationShape,
  ModelAttribute,
  ModelContext,
} from "../../models/types";
import type { ConfigFinding } from "../../schemas/misoConfig.schema";
import { findAttribute, getOptions, getShapeConfig, getTextShapes, shapeRefOf } from "./modelHelper";

/**
 * Checks of the settings that need the imported model, beyond the ref checks of `checkConfig`. All findings are
 * warnings: the affected settings are ignored where they don't apply.
 *
 * - appearance: `marker` on range annotations, `highlight` on zero-point ones (not for shapes mapped to a native type,
 *   which are blocks), variant properties that aren't properties of the shape, variant values that aren't options of
 *   the property
 * - shortcuts used by several text annotation types
 * - text annotation shapes without a configured extent or representation (not mapped to a native type)
 * - mappings to shapes that Content nodes can't carry, native types mapped twice
 *
 * @param {ModelContext} context - The model context.
 * @returns {ConfigFinding[]} The warnings, with the ref of the shape they concern.
 */
export function collectConfigWarnings(context: ModelContext): ConfigFinding[] {
  return [...checkAppearances(context), ...checkShortcuts(context), ...checkTextShapes(context)];
}

/** Appearance of each configured annotation shape */
function checkAppearances(context: ModelContext): ConfigFinding[] {
  const findings: ConfigFinding[] = [];

  for (const shape of context.config.model.annotations) {
    const shapeConfig: AnnotationShapeConfig | undefined = getShapeConfig(context, shape);

    if (!shapeConfig) {
      continue;
    }

    const ref: string = shapeRefOf(shape);
    const warn = (path: string, message: string, attributeRef?: string): void => {
      findings.push({ severity: "warning", path, message, ref, attributeRef });
    };
    const isMapped: boolean = context.config.editors.text.mappings.some((m) => m.annotation === ref);
    const extent: AnnotationExtent = shapeConfig.editing?.extent ?? "range";
    const entryPath: string = `elements.annotations["${ref}"] ("${shape.type}")`;
    const appearances: [string, AppearanceOverride][] = [[`${entryPath}.appearance`, shapeConfig.appearance ?? {}]];

    (shapeConfig.appearance?.variants ?? []).forEach((variant, index) => {
      const variantPath: string = `${entryPath}.appearance.variants[${index}]`;
      const attribute: Attribute | undefined = findAttribute(shape, variant.property);
      const property: ModelAttribute | undefined = attribute ? { attribute, ownerRef: ref } : undefined;
      const options: string[] | undefined = property ? getOptions(context, property)?.map(String) : undefined;

      if (!property) {
        warn(variantPath, `"${variant.property}" is no property of the annotation type, the variant is ignored`);
      }

      for (const [value, override] of Object.entries(variant.values)) {
        const path: string = `${variantPath}.values.${value}`;

        if (options && !options.includes(value)) {
          warn(path, `"${value}" is not an option of the "${property?.attribute.name}" property`, variant.property);
        }

        appearances.push([path, override]);
      }
    });

    // Mapped shapes are blocks, their highlights and markers are never drawn
    for (const [path, appearance] of isMapped ? [] : appearances) {
      if (extent === "range" && appearance.marker) {
        warn(`${path}.marker`, "only applies to zeroPoint annotations");
      }

      if (extent === "zeroPoint" && appearance.highlight) {
        warn(`${path}.highlight`, "only applies to range annotations");
      }
    }
  }

  return findings;
}

/** Shortcuts used by several text annotation types (shortcuts are only registered for these) */
function checkShortcuts(context: ModelContext): ConfigFinding[] {
  const shapesByShortcut = new Map<string, ModelAnnotationShape[]>();

  for (const shape of getTextShapes(context)) {
    const shortcut: string | undefined = getShapeConfig(context, shape)?.controls?.shortcut;

    if (shortcut) {
      shapesByShortcut.set(shortcut, [...(shapesByShortcut.get(shortcut) ?? []), shape]);
    }
  }

  return [...shapesByShortcut].flatMap(([shortcut, shapes]) =>
    shapes.length > 1
      ? shapes.map(
          (shape): ConfigFinding => ({
            severity: "warning",
            path: `elements.annotations["${shapeRefOf(shape)}"] ("${shape.type}").controls.shortcut`,
            message: `"${shortcut}" is also configured for ${shapes
              .filter((other) => other !== shape)
              .map((other) => `"${other.type}"`)
              .join(", ")}`,
            ref: shapeRefOf(shape),
          }),
        )
      : [],
  );
}

/** Text shapes that lack editing settings, and mappings that don't fit the text shapes */
function checkTextShapes(context: ModelContext): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const textShapes: ModelAnnotationShape[] = getTextShapes(context);
  const textShapeRefs = new Set<string>(textShapes.map(shapeRefOf));
  const mappedRefs = new Set<string>(context.config.editors.text.mappings.map((mapping) => mapping.annotation));

  for (const shape of textShapes) {
    const ref: string = shapeRefOf(shape);
    const editing: AnnotationShapeConfig["editing"] = getShapeConfig(context, shape)?.editing;
    const missing: string[] = [
      ...(editing?.extent ? [] : ["extent (defaults to range)"]),
      ...(editing?.representation ? [] : ["representation (defaults to inline)"]),
    ];

    // Mapped shapes get both from their native type
    if (!mappedRefs.has(ref) && missing.length > 0) {
      findings.push({
        severity: "warning",
        path: `elements.annotations["${ref}"] ("${shape.type}").editing`,
        message: `no ${missing.join(" and no ")} configured`,
        ref,
      });
    }
  }

  const mappedNativeTypes = new Set<string>();

  context.config.editors.text.mappings.forEach((mapping, index) => {
    const path: string = `editors.text.mappings[${index}] (${mapping.native})`;

    if (!textShapeRefs.has(mapping.annotation)) {
      findings.push({
        severity: "warning",
        path,
        message: `"${mapping.annotation}" is no annotation shape on Content nodes`,
        ref: mapping.annotation,
      });
    } else if (mappedNativeTypes.has(mapping.native)) {
      findings.push({
        severity: "warning",
        path,
        message: `native type "${mapping.native}" is mapped twice`,
        ref: mapping.annotation,
      });
    } else {
      mappedNativeTypes.add(mapping.native);
    }
  });

  return findings;
}
