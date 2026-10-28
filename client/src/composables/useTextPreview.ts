import { Schema } from "@tiptap/pm/model";
import { AnnotationNode, NodeDto } from "../models/types";
import { StandoffConverter, type TiptapJson } from "../editors/text/src";
import { useGuidelinesStore } from "../store/guidelines";
import { useTiptapStore } from "../store/tiptap";

/** A read-only document built from the beginning of a text. */
export interface TextPreview {
  /** The document of the shown part, built from its structural annotations only. */
  document: TiptapJson;
  /** Whether the text continues after the shown part. */
  isTruncated: boolean;
}

interface UseTextPreviewReturnType {
  createTextPreview: (text: string, annotations: NodeDto<AnnotationNode>[], maxLength: number) => TextPreview;
  getTextPreviewAnnotationTypes: () => string[];
}

/**
 * A composable for building read-only previews of the beginning of a text, based on the project's structural
 * annotation types.
 *
 * @returns {UseTextPreviewReturnType} An object containing the functions to build previews.
 */
export function useTextPreview(): UseTextPreviewReturnType {
  const { getAnnotationRepresentation, getEditorRole, getStructuralAnnotationConfigs } = useGuidelinesStore();
  const { getEditorSchema } = useTiptapStore();

  /**
   * Returns the annotation types a text preview is built from (all structural ones), e.g. to fetch only those.
   *
   * @returns {string[]} The project annotation types
   */
  function getTextPreviewAnnotationTypes(): string[] {
    return getStructuralAnnotationConfigs().map((config) => config.type);
  }

  /**
   * Builds a read-only preview document from the beginning of a text.
   *
   * Only structural annotations (paragraphs, headings, lists, tables, line breaks) are used, all others are ignored, so
   * passing only those (see {@linkcode getTextPreviewAnnotationTypes}) is enough.
   * Long texts are cut after about `maxLength` characters, see {@linkcode findCutIndex}.
   *
   * @param {string} text The full text
   * @param {NodeDto<AnnotationNode>[]} annotations All annotations of the text
   * @param {number} maxLength Number of characters to show at most (roughly)
   * @returns {TextPreview} The preview document and whether the text was cut
   */
  function createTextPreview(text: string, annotations: NodeDto<AnnotationNode>[], maxLength: number): TextPreview {
    const schema: Schema = getEditorSchema();
    const structural: NodeDto<AnnotationNode>[] = annotations.filter(
      (a) => getAnnotationRepresentation(a.node.data.type) === "structure",
    );

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
   * @param {NodeDto<AnnotationNode>[]} structural The structural annotations of the text
   * @param {number} maxLength Number of characters to show at most (roughly)
   * @param {Schema} schema The editor schema, tells which types are text blocks
   * @returns {number} The exclusive end index of the shown text
   */
  function findCutIndex(text: string, structural: NodeDto<AnnotationNode>[], maxLength: number, schema: Schema): number {
    if (text.length <= maxLength) {
      return text.length;
    }

    const lastIndex: number = maxLength - 1;
    const textBlock: NodeDto<AnnotationNode> | undefined = structural.find(
      (a) =>
        schema.nodes[getEditorRole(a.node.data.type)]?.isTextblock &&
        a.node.data.startIndex <= lastIndex &&
        a.node.data.endIndex >= lastIndex,
    );

    const blockEnd: number = textBlock ? textBlock.node.data.endIndex + 1 : maxLength;

    return Math.min(blockEnd, maxLength * 2, text.length);
  }

  /**
   * Fits the annotations into a text cut at `cut`: annotations starting after it are dropped, annotations reaching
   * beyond it are shortened (as copies, the given ones are left untouched).
   *
   * @param {NodeDto<AnnotationNode>[]} annotations The annotations of the full text
   * @param {number} cut The exclusive end index of the cut text
   * @returns {NodeDto<AnnotationNode>[]} The annotations within the cut text
   */
  function clipAnnotations(annotations: NodeDto<AnnotationNode>[], cut: number): NodeDto<AnnotationNode>[] {
    return annotations
      .filter((a) => a.node.data.startIndex < cut)
      .map((a) => {
        if (a.node.data.endIndex < cut) {
          return a;
        }

        return { ...a, node: { ...a.node, data: { ...a.node.data, endIndex: cut - 1 } } };
      });
  }

  return {
    createTextPreview,
    getTextPreviewAnnotationTypes,
  };
}
