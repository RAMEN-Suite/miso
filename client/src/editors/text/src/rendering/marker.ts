import katex from "katex";
import "katex/dist/katex.min.css";
import type { AnnotationAppearance, AppearanceOverride, IconSpecInput, MarkerStyle, MathTextStyle } from "../external";

/**
 * Markers of zero-point annotations as DOM elements. Pure functions of the appearance and the annotation's properties,
 * so they can render outside the editor (e.g. a preview of a draft config).
 *
 * @packageDocumentation
 */

// TODO: This should come from the editor
/** Class prefix of the Lucide icon font (`lucide-static`), e.g. `icon-triangle-alert` */
const LUCIDE_ICON_CLASS_PREFIX = "icon-" as const;

/** Inline styles of marker elements, keyed by their camelCase CSS property names. */
type MarkerElementStyles = Partial<CSSStyleDeclaration>;

/** Styles of every marker element. */
const BASE_MARKER_STYLES: MarkerElementStyles = { display: "inline-block", verticalAlign: "middle" };

/** Styles of the box around an icon, also used for the fallback. `1em` scales it with the surrounding text. */
const ICON_BOX_STYLES: MarkerElementStyles = { width: "1em", height: "1em", lineHeight: "1", textAlign: "center" };

/** Styles of the icon element inside the box. */
const ICON_CONTENT_STYLES: MarkerElementStyles = { display: "block", width: "100%", height: "100%" };

/** Shown instead of a formula whose notation is empty or missing. */
const EMPTY_MATH_PLACEHOLDER = "∅" as const;

/**
 * Resolves the marker of a zero-point annotation from the configured appearance. The marker of a variant matching
 * the annotation's property values replaces the marker of the annotation type, the last matching variant wins.
 *
 * @param {AnnotationAppearance | undefined} appearance The appearance of the annotation type, with property names in
 *   `variants` (see `toEditorAppearance`).
 * @param {Readonly<Record<string, unknown>> | undefined} properties The annotation's properties.
 * @returns {MarkerStyle | undefined} The marker, or `undefined` if no marker is configured.
 */
function resolveMarker(
  appearance: AnnotationAppearance | undefined,
  properties: Readonly<Record<string, unknown>> | undefined,
): MarkerStyle | undefined {
  let marker: MarkerStyle | undefined = appearance?.marker;

  for (const variant of appearance?.variants ?? []) {
    const value: unknown = properties?.[variant.property];
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
 * Renders the marker of a zero-point annotation into `element`: the resolved marker, or the crossed-box fallback if
 * none is configured or it is malformed. Sets the marker styles on `element`.
 *
 * @param {HTMLElement} element The element that holds the marker, e.g. the node view's DOM.
 * @param {AnnotationAppearance | undefined} appearance The appearance of the annotation type.
 * @param {Readonly<Record<string, unknown>> | undefined} properties The annotation's properties.
 */
export function renderMarker(
  element: HTMLElement,
  appearance: AnnotationAppearance | undefined,
  properties: Readonly<Record<string, unknown>> | undefined,
): void {
  const marker: MarkerStyle | undefined = resolveMarker(appearance, properties);
  const markerElement: HTMLElement | null = marker ? createMarkerElement(marker, properties) : null;

  Object.assign(element.style, BASE_MARKER_STYLES);

  if (!markerElement || marker?.kind === "icon") {
    Object.assign(element.style, ICON_BOX_STYLES);
  } else if (marker?.kind === "math") {
    // Applied after the base styles, so a configured `display` overrides `inline-block`
    Object.assign(element.style, getMathStyles(marker));
  }

  element.appendChild(markerElement ?? createFallbackElement());
}

/**
 * Creates the content of a zero-point annotation's marker. New kinds of {@linkcode MarkerStyle} get their own branch
 * and create function here (e.g. {@linkcode createMathElement}), plus their own styles applied in
 * {@linkcode renderMarker}.
 *
 * @param {MarkerStyle} marker The marker to render.
 * @param {Readonly<Record<string, unknown>> | undefined} properties The annotation's properties, for kinds that render
 *   one of them (e.g. a formula).
 * @returns {HTMLElement | null} The marker content, or `null` if the marker is malformed.
 */
function createMarkerElement(marker: MarkerStyle, properties: Readonly<Record<string, unknown>> | undefined): HTMLElement | null {
  if (marker.kind === "icon") {
    return createIconElement(marker.icon);
  } else if (marker.kind === "math") {
    return createMathElement(marker, properties);
  }

  return null;
}

/**
 * Renders the LaTeX notation stored in the annotation property `marker.property` with KaTeX. A `display: "block"`
 * renders it in display mode. Invalid notation is shown as KaTeX error text instead of throwing.
 *
 * @param {MathTextStyle} marker The math marker to render.
 * @param {Readonly<Record<string, unknown>> | undefined} properties The annotation's properties holding the notation.
 * @returns {HTMLSpanElement} The formula element, or a placeholder if the notation is empty or missing.
 */
function createMathElement(marker: MathTextStyle, properties: Readonly<Record<string, unknown>> | undefined): HTMLSpanElement {
  const element: HTMLSpanElement = document.createElement("span");
  const notation: unknown = properties?.[marker.property];

  const renderAsBlock: boolean = marker.display === "block";

  if (typeof notation !== "string" || notation.trim() === "") {
    element.textContent = EMPTY_MATH_PLACEHOLDER;
  } else {
    katex.render(notation, element, { displayMode: renderAsBlock, throwOnError: false });
  }

  return element;
}

/**
 * Returns the CSS properties of a math marker, which are all its keys except `kind` and `property`.
 *
 * @param {MathTextStyle} marker The math marker.
 * @returns {MarkerElementStyles} The CSS properties, keyed by their camelCase names.
 */
function getMathStyles(marker: MathTextStyle): MarkerElementStyles {
  const { kind: _kind, property: _property, ...styles } = marker;

  return styles;
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
