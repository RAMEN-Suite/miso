import { BaseNodeData, IconSpec, IconSpecInput, ModelAnnotationShape, ModelContext, Node } from "../models/types";
import { BASE_NODE_REF } from "./ramen";
import { getNodeConfig, getShapeConfig, resolveClassifierRef } from "../utils/helper/modelHelper";

/** Used for nodes whose labels can't be resolved to a node type (invalid data). */
const FALLBACK_NODE_ICON: IconSpec = { kind: "lucide", name: "circle-question-mark" };

/** Default icons of the RAMEN base nodes, by their qualified refs. Used when no icon is configured along a lineage. */
export const BASE_NODE_ICONS: Readonly<Record<string, IconSpec>> = {
  [BASE_NODE_REF.Collection]: { kind: "lucide", name: "folder" },
  [BASE_NODE_REF.Content]: { kind: "lucide", name: "file-text" },
  [BASE_NODE_REF.Annotation]: { kind: "lucide", name: "pencil" },
  [BASE_NODE_REF.Entity]: { kind: "lucide", name: "user" },
};

/** The model context node icons are resolved with, set by {@linkcode initializeNodeIcons} */
let iconContext: ModelContext | undefined;

/** The resolved icon per classifier ref, see {@linkcode getClassifierIcon} */
const nodeIconsByRef = new Map<string, IconSpec>();

/**
 * Resolves the configured icon of an annotation type. The icon identifies the type itself and doesn't depend on the
 * property values of an annotation.
 *
 * @param {ModelAnnotationShape | undefined} shape - The annotation shape of the type.
 * @returns {IconSpecInput | undefined} The configured icon, or `undefined` if there is none.
 */
export function resolveAnnotationIcon(shape: ModelAnnotationShape | undefined): IconSpecInput | undefined {
  return shape ? getShapeConfig(shape)?.appearance?.icon : undefined;
}

/**
 * Sets the model context node icons are resolved with, and drops the icons resolved with a previous one. Called when
 * the config is initialized.
 *
 * @param {ModelContext} context - The model context.
 * @returns {void} This function does not return anything.
 */
export function initializeNodeIcons(context: ModelContext): void {
  iconContext = context;
  nodeIconsByRef.clear();
}

/**
 * The icon of a node type: the nearest `ext.miso.appearance.icon` along its lineage (base level ones are in
 * `miso.general.baseClassifiers`), otherwise the default of its base node. Cached per classifier.
 *
 * @param {ModelContext} context - The model context.
 * @param {string} classifierRef - Qualified ref of the node type.
 * @returns {IconSpec} The icon.
 */
function getClassifierIcon(context: ModelContext, classifierRef: string): IconSpec {
  const cached: IconSpec | undefined = nodeIconsByRef.get(classifierRef);

  if (cached) {
    return cached;
  }

  // Base-first lineage, so the nearest configuration is searched from the end
  const lineageRefs: string[] = context.model.getNodeLineage(classifierRef).map((item) => `${item.modelId}:${item.nodeId}`);
  const configured: IconSpec | undefined = lineageRefs
    .toReversed()
    .map((ref) => normalizeIconSpec(getNodeConfig(context, ref)?.appearance?.icon))
    .find((spec): spec is IconSpec => spec !== null);
  const icon: IconSpec = configured ?? BASE_NODE_ICONS[lineageRefs[0] ?? ""] ?? FALLBACK_NODE_ICON;

  nodeIconsByRef.set(classifierRef, icon);

  return icon;
}

/**
 * Normalizes the possible icon configurations (lucide icon name, raw SVG or external URL) into the canonical {@link IconSpec}.
 *
 * @param {IconSpecInput | undefined} input - The raw value, e.g. from a configuration file.
 * @returns {IconSpec | null} The normalized spec, or `null` when the input is missing or malformed.
 */
export function normalizeIconSpec(input: IconSpecInput | undefined): IconSpec | null {
  if (input === undefined || input === null) {
    return null;
  }

  if (typeof input === "string") {
    const name: string = input.trim();

    if (name === "") {
      return null;
    }

    return { kind: "lucide", name };
  }

  if (typeof input !== "object") {
    console.warn("Invalid icon spec, ignoring:", input);
    return null;
  }

  if (input.kind === "lucide" && typeof input.name === "string" && input.name.trim() !== "") {
    return { kind: "lucide", name: input.name.trim() };
  }

  if (input.kind === "url" && typeof input.url === "string" && input.url.trim() !== "") {
    return { kind: "url", url: input.url.trim() };
  }

  if (input.kind === "svg" && typeof input.svg === "string" && input.svg.trim() !== "") {
    return { kind: "svg", svg: input.svg };
  }

  console.warn("Invalid icon spec, ignoring:", input);

  return null;
}

/**
 * Resolves the icon of a node from its node type (see {@linkcode getClassifierIcon}). Takes the node's
 * `classifierRef`, or resolves its labels if it has none, so it also works for label lists like `{ nodeLabels:
 * ["Collection", "Letter"] }`.
 *
 * @param {Pick<Node<BaseNodeData>, "nodeLabels" | "classifierRef">} node - The node, or a node type option.
 * @returns {IconSpec} The icon to render, a question mark for nodes whose labels can't be resolved.
 */
export function resolveNodeIcon(node: Pick<Node<BaseNodeData>, "nodeLabels" | "classifierRef">): IconSpec {
  if (!iconContext) {
    return FALLBACK_NODE_ICON;
  }

  const classifierRef: string | null =
    node.classifierRef !== undefined ? node.classifierRef : resolveClassifierRef(iconContext, node.nodeLabels).ref;

  return classifierRef ? getClassifierIcon(iconContext, classifierRef) : FALLBACK_NODE_ICON;
}
