import { Schema } from "@tiptap/pm/model";
import { Annotation, ModelAnnotationShape } from "../models/types";
import { shapeRefOf } from "../utils/helper/modelHelper";
import { StandoffConverter, type TiptapJson } from "../editors/text/src";
import { useConfigStore } from "../store/config";
import { useTiptapStore } from "../store/tiptap";
import { createTextPositionSelector, type TextPositionSelector } from "../utils/helper/selector";

/** A read-only document built from the beginning of a text. */
export interface TextPreview {
  /** The document of the shown part, built from its structural annotations only. */
  document: TiptapJson;
  /** Whether the text continues after the shown part. */
  isTruncated: boolean;
}

interface UseTextPreviewReturnType {
  createTextPreview: (text: string, annotations: Annotation[], maxLength: number) => TextPreview;
  getTextPreviewShapeRefs: () => string[];
}

/**
 * A composable for building read-only previews of the beginning of a text, based on the project's structural
 * annotation types.
 *
 * @returns {UseTextPreviewReturnType} An object containing the functions to build previews.
 */
export function useTextPreview(): UseTextPreviewReturnType {
  const { getAnnotationRepresentation, getAnnotationShape, getEditorRole, getStructuralShapes } = useConfigStore();
  const { getEditorSchema } = useTiptapStore();

  /**
   * Returns the refs of the annotation shapes a text preview is built from (all structural ones), e.g. to fetch only
   * those.
   *
   * @returns {string[]} The shape refs
   */
  function getTextPreviewShapeRefs(): string[] {
    return getStructuralShapes().map(({ shape }) => shapeRefOf(shape));
  }

  /**
   * Returns the editor role of an annotation's shape.
   *
   * @param {Annotation} annotation The annotation
   * @returns {string | undefined} The role, `undefined` if the annotation has no shape mapped to one
   */
  function roleOf(annotation: Annotation): string | undefined {
    const shape: ModelAnnotationShape | undefined = getAnnotationShape(annotation.node);

    return shape ? getEditorRole(shape) : undefined;
  }

  /**
   * Builds a read-only preview document from the beginning of a text.
   *
   * Only structural annotations (paragraphs, headings, lists, tables, line breaks) are used, all others are ignored, so
   * passing only those (see {@linkcode getTextPreviewShapeRefs}) is enough.
   * Long texts are cut after about `maxLength` characters, see {@linkcode findCutIndex}.
   *
   * @param {string} text The full text
   * @param {Annotation[]} annotations All annotations of the text
   * @param {number} maxLength Number of characters to show at most (roughly)
   * @returns {TextPreview} The preview document and whether the text was cut
   */
  function createTextPreview(text: string, annotations: Annotation[], maxLength: number): TextPreview {
    const schema: Schema = getEditorSchema();
    const structural: Annotation[] = annotations.filter((a) => {
      const shape: ModelAnnotationShape | undefined = getAnnotationShape(a.node);

      return shape !== undefined && getAnnotationRepresentation(shape) === "structure";
    });

    const cut: number = findCutIndex(text, structural, maxLength, schema);
    const isTruncated: boolean = cut < text.length;

    const converter = new StandoffConverter(
      { text: text.slice(0, cut), annotations: isTruncated ? clipAnnotations(structural, cut) : structural },
      schema,
    );

    return { document: converter.getData().tipTapJson, isTruncated };
  }

  /**
   * Finds the index the preview text ends at (exclusive).
   *
   * The cut is moved from `maxLength` to the end of the paragraph or heading it falls into, so the last shown block is
   * complete. A very long block is still cut at twice `maxLength`.
   *
   * @param {string} text The full text
   * @param {Annotation[]} structural The structural annotations of the text
   * @param {number} maxLength Number of characters to show at most (roughly)
   * @param {Schema} schema The editor schema, tells which types are text blocks
   * @returns {number} The exclusive end index of the shown text
   */
  function findCutIndex(text: string, structural: Annotation[], maxLength: number, schema: Schema): number {
    if (text.length <= maxLength) {
      return text.length;
    }

    const lastIndex: number = maxLength - 1;
    const textBlock: Annotation | undefined = structural.find(
      (a) =>
        schema.nodes[roleOf(a) ?? ""]?.isTextblock &&
        a.node.properties.selector.start <= lastIndex &&
        a.node.properties.selector.end >= lastIndex,
    );

    const blockEnd: number = textBlock ? textBlock.node.properties.selector.end + 1 : maxLength;

    return Math.min(blockEnd, maxLength * 2, text.length);
  }

  /**
   * Fits the annotations into a text cut at `cut`: annotations starting after it are dropped, annotations reaching
   * beyond it are shortened (as copies, the given ones are left untouched).
   *
   * @param {Annotation[]} annotations The annotations of the full text
   * @param {number} cut The exclusive end index of the cut text
   * @returns {Annotation[]} The annotations within the cut text
   */
  function clipAnnotations(annotations: Annotation[], cut: number): Annotation[] {
    return annotations
      .filter((a) => a.node.properties.selector.start < cut)
      .map((a) => {
        if (a.node.properties.selector.end < cut) {
          return a;
        }

        const selector: TextPositionSelector = createTextPositionSelector(a.node.properties.selector.start, cut - 1);

        return { ...a, node: { ...a.node, properties: { ...a.node.properties, selector } } };
      });
  }

  return {
    createTextPreview,
    getTextPreviewShapeRefs,
  };
}
