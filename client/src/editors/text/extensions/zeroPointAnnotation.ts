import { Node, NodeViewRendererProps } from "@tiptap/core";
import { IAnnotation } from "../../../models/IAnnotation";
import { Annotation, AnnotationAppearance, AppearanceOverride, IconSpecInput, MarkerStyle, Range } from "../../../models/types";
import { cloneDeep } from "../../../utils/helper/helper";
import { findNodeBoundariesByUuid } from "../../../utils/helper/tiptapHelper";

// TODO: This should come from the editor
/** Class prefix of the Lucide icon font (`lucide-static`), e.g. `icon-triangle-alert` */
const LUCIDE_ICON_CLASS_PREFIX = "icon-" as const;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    zeroPointAnnotation: {
      /**
       * Inserts a zero-point annotation at the given position (defaults to the selection start). The annotation
       * is cloned and stored in the node's `_annotation` attribute.
       *
       * @param {Annotation} annotation - The annotation to add.
       * @param {number} position - The document position to insert the annotation at.
       */
      addZeroPointAnnotation: (annotation: Annotation, position?: number) => ReturnType;
      /**
       * Replaces the data of an existing zero-point annotation, matched by its uuid.
       *
       * @param {Annotation} annotation - The updated annotation.
       */
      updateZeroPointAnnotation: (annotation: Annotation) => ReturnType;
      /**
       * Removes a zero-point annotation, matched by its uuid, from the document.
       *
       * @param {Annotation} annotation - The annotation to remove.
       */
      removeZeroPointAnnotation: (annotation: Annotation) => ReturnType;
    };
  }
}

interface ZeroPointAttributes {
  uuid: string;
  _annotation: Annotation | null;
}

/** Inline styles of marker elements, keyed by their camelCase CSS property names. */
type MarkerElementStyles = Partial<CSSStyleDeclaration>;

/** Styles of every marker element. */
const BASE_MARKER_STYLES: MarkerElementStyles = { display: "inline-block", verticalAlign: "middle" };

/** Styles of the box around an icon, also used for the fallback. `1em` scales it with the surrounding text. */
const ICON_BOX_STYLES: MarkerElementStyles = { width: "1em", height: "1em", lineHeight: "1", textAlign: "center" };

/** Styles of the icon element inside the box. */
const ICON_CONTENT_STYLES: MarkerElementStyles = { display: "block", width: "100%", height: "100%" };

interface ZeroPointOptions {
  /** Returns the configured appearance of the given annotation type, used to render its marker. */
  getAppearance: (type: string) => AnnotationAppearance | undefined;
}

/**
 * Resolves the marker of a zero-point annotation from the configured appearance. The marker of a variant matching
 * the annotation's property values replaces the marker of the annotation type, the last matching variant wins.
 *
 * @param {AnnotationAppearance | undefined} appearance The configured appearance of the annotation type.
 * @param {IAnnotation | undefined} data The annotation's data.
 * @returns {MarkerStyle | undefined} The marker, or `undefined` if no marker is configured.
 */
function resolveMarker(appearance: AnnotationAppearance | undefined, data: IAnnotation | undefined): MarkerStyle | undefined {
  let marker: MarkerStyle | undefined = appearance?.marker;

  for (const variant of appearance?.variants ?? []) {
    const value: unknown = data?.[variant.property];
    const override: AppearanceOverride | undefined =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? variant.values[String(value)]
        : undefined;

    if (override?.marker) {
      marker = override.marker;
    }
  }

  return marker;
}

/**
 * Creates the content of a zero-point annotation's marker. New kinds of {@linkcode MarkerStyle} get their own branch
 * and create function here (e.g. `createFormulaElement`), plus their own typed style constant applied in the node view.
 *
 * @param {MarkerStyle} marker The marker to render.
 * @param {Annotation | null} _annotation The annotation, for kinds that render one of its properties (unused until such a kind exists).
 * @returns {HTMLElement | null} The marker content, or `null` if the marker is malformed.
 */
function createMarkerElement(marker: MarkerStyle, _annotation: Annotation | null): HTMLElement | null {
  if (marker.kind === "icon") {
    return createIconElement(marker.icon);
  }

  return null;
}

/**
 * Creates an icon element. A string is the shorthand for a Lucide icon name.
 *
 * @param {IconSpecInput} icon The icon to render.
 * @returns {HTMLElement | null} The icon element, or `null` if the icon is malformed.
 */
function createIconElement(icon: IconSpecInput): HTMLElement | null {
  if (typeof icon === "string") {
    return createLucideIconElement(icon);
  } else if (icon.kind === "lucide") {
    return createLucideIconElement(icon.name);
  } else if (icon.kind === "url") {
    return createUrlIconElement(icon.url);
  } else if (icon.kind === "svg") {
    return createSvgIconElement(icon.svg);
  }

  return null;
}

/**
 * Creates a Lucide icon font glyph.
 *
 * @param {string} name The name of the Lucide icon, e.g. `triangle-alert`.
 * @returns {HTMLElement} The icon element.
 */
function createLucideIconElement(name: string): HTMLElement {
  const element: HTMLElement = document.createElement("i");

  element.className = LUCIDE_ICON_CLASS_PREFIX + name;

  Object.assign(element.style, ICON_CONTENT_STYLES);

  return element;
}

/**
 * Creates an icon loaded from a URL.
 *
 * @param {string} url The URL of the icon.
 * @returns {HTMLImageElement} The icon element.
 */
function createUrlIconElement(url: string): HTMLImageElement {
  const element: HTMLImageElement = document.createElement("img");

  element.src = url;
  element.alt = "";
  Object.assign(element.style, ICON_CONTENT_STYLES);

  // Replaced by the fallback if the URL can't be loaded
  element.addEventListener("error", () => element.replaceWith(createFallbackElement()), { once: true });

  return element;
}

/**
 * Creates an icon from raw SVG markup. The markup comes from the project configuration, which is supplied by whoever
 * deploys the app.
 *
 * @param {string} svg The raw SVG markup.
 * @returns {HTMLSpanElement | null} The icon element, or `null` if the markup contains no SVG element.
 */
function createSvgIconElement(svg: string): HTMLSpanElement | null {
  const element: HTMLSpanElement = document.createElement("span");

  element.innerHTML = svg;

  const svgElement: SVGSVGElement | null = element.querySelector("svg");

  if (!svgElement) {
    return null;
  }

  Object.assign(element.style, ICON_CONTENT_STYLES);
  Object.assign(svgElement.style, ICON_CONTENT_STYLES);

  return element;
}

/**
 * Creates the content of a marker that is not configured or can't be rendered (e.g. the URL doesn't load): a crossed
 * box, like the placeholder for a missing font character. The stroke is thin and doesn't scale with the marker size.
 *
 * @returns {SVGSVGElement} The fallback element.
 */
function createFallbackElement(): SVGSVGElement {
  const svg: SVGSVGElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "0.8");
  svg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="1" vector-effect="non-scaling-stroke" /><path d="M3 3l18 18M21 3L3 21" vector-effect="non-scaling-stroke" />`;
  Object.assign(svg.style, ICON_CONTENT_STYLES);

  return svg;
}

export const ZeroPointAnnotation = Node.create<ZeroPointOptions>({
  name: "zeroPointAnnotation",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      getAppearance: () => undefined,
    };
  },

  addAttributes() {
    return {
      // The annotation itself (data, status and connected nodes). The attribute is its source of truth while it
      // is in the editor. Unlike on structural nodes and in `_semanticBlocks`, the status is included, since
      // zero-point annotations are only saved when they were created or changed.
      _annotation: {
        default: null,
        rendered: false,
      },
      // Identifies the annotation. Separate attribute since it is managed by the
      // UniqueID extension (e.g. regenerated for duplicated nodes).
      uuid: {
        default: null,
        isRequired: true,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-annotation-uuid"),
        renderHTML: (attributes: ZeroPointAttributes) => {
          return {
            "data-annotation-uuid": attributes.uuid,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-annotation-uuid]",
      },
    ];
  },

  addNodeView() {
    // TODO: This can be more elegant
    return (nodeProps: NodeViewRendererProps) => {
      const elm: HTMLElement = document.createElement("span");
      const annotation: Annotation | null = nodeProps.node.attrs._annotation;
      const annotationType: string = annotation?.node.data.type ?? "";
      const annotationSubType: string | number | undefined = annotation?.node.data.subType;

      elm.setAttribute("data-annotation-type", annotationType);
      elm.setAttribute("data-annotation-subtype", annotationSubType?.toString() ?? "");

      const marker: MarkerStyle | undefined = resolveMarker(this.options.getAppearance(annotationType), annotation?.node.data);

      const markerElement: HTMLElement | null = marker ? createMarkerElement(marker, annotation) : null;

      Object.assign(elm.style, BASE_MARKER_STYLES);

      if (!markerElement || marker?.kind === "icon") {
        Object.assign(elm.style, ICON_BOX_STYLES);
      }

      elm.appendChild(markerElement ?? createFallbackElement());

      return { dom: elm };
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes }];
  },

  addCommands() {
    return {
      addZeroPointAnnotation:
        (annotation: Annotation, position?: number) =>
        ({ commands }) => {
          const pos: number = position ?? this.editor.state.selection.from;

          return commands.insertContentAt(pos, {
            type: this.name,
            attrs: { _annotation: cloneDeep(annotation), uuid: annotation.node.data.uuid },
          });
        },

      updateZeroPointAnnotation:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          const range: Range | null = findNodeBoundariesByUuid(tr.doc, annotation.node.data.uuid);

          if (!range) {
            return false;
          }

          // Cloned since the annotation is stored in the document and must not share references
          // with the caller (e.g. reactive form data)
          tr.setNodeAttribute(range.from, "_annotation", cloneDeep(annotation));

          dispatch?.(tr);

          return true;
        },

      removeZeroPointAnnotation:
        (annotation: Annotation) =>
        ({ tr, dispatch }) => {
          const range: Range | null = findNodeBoundariesByUuid(tr.doc, annotation.node.data.uuid);

          if (!range) {
            return false;
          }

          // Do NOT set status to 'deleted' - this is determined during save preprocessing
          // when checked what annotations are in the document
          tr.delete(range.from, range.to);

          dispatch?.(tr);

          return true;
        },
    };
  },
});
