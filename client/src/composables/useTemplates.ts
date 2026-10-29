import { useGuidelinesStore } from "../store/guidelines";
import { createCollectionNode, createTextNode } from "../config/ramen";
import { BUILTIN_STRUCTURAL_NESTING } from "../config/constants";
import { isRequiredValueMissing } from "../utils/helper/helper";
import { IAnnotation } from "../models/IAnnotation";
import {
  Annotation,
  BuiltinStructuralType,
  CollectionNode,
  CollectionTemplate,
  ContentTemplate,
  NodeStatusObject,
  PropertyConfig,
  TemplateBlock,
  TemplateChild,
  TemplateCollectionAnnotation,
  TemplateCollectionChild,
  TemplateContentChild,
  TemplateTextAnnotation,
  TextNode,
} from "../models/types";

/** Structural types allowed at the top level of a text: the same as inside a list item. */
const TOP_LEVEL_ROLES: readonly string[] = BUILTIN_STRUCTURAL_NESTING.listItem.contains;

/** Annotation properties that are derived from the template structure, so they can't be set via `properties`. */
const DERIVED_ANNOTATION_PROPERTIES: readonly string[] = ["uuid", "type", "text", "startIndex", "endIndex", "isZeroPoint"];

/** Validation results per template object, so each invalid template is reported only once. */
const validityByTemplate = new WeakMap<CollectionTemplate | ContentTemplate, boolean>();

/**
 * Composable for the templates configured in the `miso` keys of the `collections`/`contents` sections: shortcuts for
 * creating a node of a certain type together with a subgraph (annotations, sub-collections, Contents, text structure)
 * in one go. Entities can't be part of a template, since they would have to be looked up in the database.
 *
 * Templates are checked against the guidelines before they are offered, so every created node conforms to the
 * configured types and properties. Invalid templates are left out with a warning. Instances are plain copies with
 * fresh UUIDs, every node has the status `created`.
 */
export function useTemplates() {
  const {
    getAnnotationExtent,
    getAnnotationFields,
    getAnnotationRepresentation,
    getAnnotationType,
    getAvailableCollectionAnnotationConfigs,
    getAvailableCollectionLabels,
    getAvailableContentLabels,
    getCollectionAnnotationFields,
    getCollectionConfigFields,
    getContentMedium,
    getEditorRole,
    getStructuralAnnotationConfig,
    guidelines,
    isConfiguredAnnotationType,
  } = useGuidelinesStore();

  /**
   * Adds the nodes of a Collection template to the given ownership tree of a new Collection.
   *
   * @param {NodeStatusObject} root - The new Collection with status `created`.
   * @param {CollectionTemplate} template - The template to apply.
   * @returns {NodeStatusObject} A copy of the root with the template's nodes attached.
   */
  function applyCollectionTemplate(root: NodeStatusObject, template: CollectionTemplate): NodeStatusObject {
    return {
      ...root,
      connectedNodes: [
        ...root.connectedNodes,
        ...(template.annotations ?? []).map(buildCollectionAnnotation),
        ...template.children.map(buildChild),
      ],
    };
  }

  function buildAnnotation(data: Record<string, unknown>): Annotation {
    return {
      node: { nodeLabels: ["Annotation"], data: { ...data, uuid: crypto.randomUUID() } as IAnnotation },
      connectedNodes: [],
      meta: { status: "created" },
    };
  }

  function buildBlockAnnotation(block: TemplateBlock, startIndex: number, text: string): Annotation {
    return buildAnnotation({
      ...block.properties,
      type: block.type,
      startIndex,
      endIndex: text.length - 1,
      text: text.slice(startIndex),
    });
  }

  function buildCollectionAnnotation(annotation: TemplateCollectionAnnotation): Annotation {
    return buildAnnotation({ ...annotation.properties, type: annotation.type });
  }

  /**
   * Builds an inline annotation over the first occurrence of its `text` in the block's text, or over the whole block.
   *
   * @param {TemplateTextAnnotation} annotation - The annotation of the template block.
   * @param {number} blockStart - The index of the block's first character in the whole text.
   * @param {string} blockText - The placeholder text of the block.
   * @returns {Annotation} The annotation with its range in the whole text.
   */
  function buildTextAnnotation(annotation: TemplateTextAnnotation, blockStart: number, blockText: string): Annotation {
    const coveredText: string = annotation.text ?? blockText;
    const startIndex: number = blockStart + blockText.indexOf(coveredText);

    return buildAnnotation({
      ...annotation.properties,
      type: annotation.type,
      startIndex,
      endIndex: startIndex + coveredText.length - 1,
      text: coveredText,
    });
  }

  function buildChild(child: TemplateChild): NodeStatusObject {
    if (child.kind === "collection") {
      return buildCollectionChild(child);
    } else {
      return buildContentChild(child);
    }
  }

  function buildCollectionChild(child: TemplateCollectionChild): NodeStatusObject {
    const { data } = createCollectionNode();

    const node: CollectionNode = {
      nodeLabels: ["Collection", child.additionalLabel],
      data: { ...child.properties, ...data, label: child.label },
    };

    return {
      node,
      connectedNodes: [...(child.annotations ?? []).map(buildCollectionAnnotation), ...(child.children ?? []).map(buildChild)],
      meta: { status: "created" },
    };
  }

  function buildContentChild(child: TemplateContentChild): NodeStatusObject {
    const node: TextNode = createTextNode({ additionalNodeLabels: [child.additionalLabel] });

    if (child.template !== undefined) {
      const template: ContentTemplate | undefined = getContentTemplates().find((t) => t.name === child.template);

      return buildContent(node, template?.blocks ?? []);
    } else {
      return buildContent(node, child.blocks ?? []);
    }
  }

  /**
   * Builds the standoff of a text from template blocks: the blocks' texts are concatenated (the editor's plain text has
   * no separators between blocks) and each block becomes an annotation over the range of its own text or its children.
   * The inline annotations of text blocks are placed within their block.
   *
   * @param {TextNode} node - The new Content node.
   * @param {TemplateBlock[]} blocks - The text structure.
   * @returns {NodeStatusObject} The Content with its text and its annotations attached, all with status `created`.
   */
  function buildContent(node: TextNode, blocks: TemplateBlock[]): NodeStatusObject {
    let text: string = "";
    const annotations: Annotation[] = [];

    const visit = (block: TemplateBlock): void => {
      const startIndex: number = text.length;

      // Only text blocks have a text and inline annotations, only containers and classifications have children
      // (checked on validation)
      text += block.text ?? "";
      (block.annotations ?? []).forEach((a) => annotations.push(buildTextAnnotation(a, startIndex, block.text ?? "")));
      (block.children ?? []).forEach(visit);

      annotations.push(buildBlockAnnotation(block, startIndex, text));
    };

    blocks.forEach(visit);

    return { node: { ...node, data: { ...node.data, text } }, connectedNodes: annotations, meta: { status: "created" } };
  }

  /**
   * Builds a new Content from a Content template.
   *
   * @param {TextNode} node - The new Content node with its final labels.
   * @param {ContentTemplate} template - The template to apply.
   * @returns {NodeStatusObject} The Content with the template's text and structure, all with status `created`.
   */
  function buildContentFromTemplate(node: TextNode, template: ContentTemplate): NodeStatusObject {
    return buildContent(node, template.blocks);
  }

  function checkBlock(block: TemplateBlock, allowedRoles: readonly string[], path: string): string[] {
    if (!isConfiguredAnnotationType(block.type)) {
      return [`${path}: unknown annotation type "${block.type}"`];
    }

    const representation = getAnnotationRepresentation(block.type);

    if (representation === "structure") {
      return checkStructuralBlock(block, allowedRoles, path);
    } else if (representation === "blockClassification") {
      return checkClassificationBlock(block, allowedRoles, path);
    } else {
      return [`${path}: "${block.type}" is neither a structural type nor a block classification`];
    }
  }

  function checkBlocks(blocks: TemplateBlock[], allowedRoles: readonly string[], path: string): string[] {
    return blocks.flatMap((block, index) => checkBlock(block, allowedRoles, `${path}[${index}]`));
  }

  /**
   * Block classifications are transparent for the nesting: their children must be valid at the classification's
   * position.
   */
  function checkClassificationBlock(block: TemplateBlock, allowedRoles: readonly string[], path: string): string[] {
    const problems: string[] = [];

    if (block.text !== undefined) {
      problems.push(`${path}.text: a block classification gets its text from its children`);
    }

    if (!block.children?.length) {
      problems.push(`${path}.children: a block classification needs at least one child`);
    }

    if (block.annotations !== undefined) {
      problems.push(`${path}.annotations: inline annotations are only possible on text blocks`);
    }

    problems.push(...checkProperties(block.properties ?? {}, getAnnotationPropertyFields(block.type), path, true));
    problems.push(...checkBlocks(block.children ?? [], allowedRoles, `${path}.children`));

    return problems;
  }

  function checkChild(child: TemplateChild, path: string): string[] {
    if (child.kind === "collection") {
      return checkCollectionChild(child, path);
    } else {
      return checkContentChild(child, path);
    }
  }

  function checkCollectionChild(child: TemplateCollectionChild, path: string): string[] {
    if (!getAvailableCollectionLabels().includes(child.additionalLabel)) {
      return [`${path}: unknown Collection type "${child.additionalLabel}"`];
    }

    const problems: string[] = [];

    if (child.label.trim().length === 0) {
      problems.push(`${path}.label must not be empty`);
    }

    const fields: PropertyConfig[] = getCollectionConfigFields([child.additionalLabel]).filter((f) => f.name !== "label");

    problems.push(...checkProperties(child.properties ?? {}, fields, path, true));
    problems.push(...checkCollectionAnnotations(child.annotations ?? [], child.additionalLabel, path));
    (child.children ?? []).forEach((c, index) => problems.push(...checkChild(c, `${path}.children[${index}]`)));

    return problems;
  }

  /**
   * Annotations of a Collection must be of a type configured for the Collection's type, with complete properties.
   */
  function checkCollectionAnnotations(
    annotations: TemplateCollectionAnnotation[],
    additionalLabel: string,
    path: string,
  ): string[] {
    const nodeLabels: string[] = ["Collection", additionalLabel];
    const types: string[] = getAvailableCollectionAnnotationConfigs(nodeLabels).map((c) => c.type);

    return annotations.flatMap((annotation, index) => {
      const annotationPath: string = `${path}.annotations[${index}]`;

      if (!types.includes(annotation.type)) {
        return [`${annotationPath}: "${annotation.type}" is not an annotation type of "${additionalLabel}"`];
      }

      const fields: PropertyConfig[] = getCollectionAnnotationFields(nodeLabels, annotation.type).filter(
        (f) => !DERIVED_ANNOTATION_PROPERTIES.includes(f.name),
      );

      return checkProperties(annotation.properties ?? {}, fields, annotationPath, true);
    });
  }

  /**
   * The root's properties only prefill the form, so required ones may be left to the user. Its annotations are created
   * without a form, so they must be complete.
   */
  function checkCollectionTemplate(template: CollectionTemplate): string[] {
    if (!getAvailableCollectionLabels().includes(template.additionalLabel)) {
      return [`unknown Collection type "${template.additionalLabel}"`];
    }

    const fields: PropertyConfig[] = getCollectionConfigFields([template.additionalLabel]).filter((f) => f.name !== "label");

    return [
      ...checkProperties(template.properties ?? {}, fields, "template", false),
      ...checkCollectionAnnotations(template.annotations ?? [], template.additionalLabel, "template"),
      ...template.children.flatMap((child, index) => checkChild(child, `children[${index}]`)),
    ];
  }

  function checkContentChild(child: TemplateContentChild, path: string): string[] {
    if (!getAvailableContentLabels().includes(child.additionalLabel)) {
      return [`${path}: unknown Content type "${child.additionalLabel}"`];
    }

    const problems: string[] = [];
    const hasStructure: boolean = child.blocks !== undefined || child.template !== undefined;

    if (child.blocks !== undefined && child.template !== undefined) {
      problems.push(`${path}: use either "blocks" or "template"`);
    }

    if (hasStructure && getContentMedium([child.additionalLabel]) !== "text") {
      problems.push(`${path}: a text structure is only possible for Content types with the medium "text"`);
    }

    if (child.template !== undefined && !getContentTemplates().some((t) => t.name === child.template)) {
      problems.push(`${path}.template: there is no valid Content template "${child.template}"`);
    }

    problems.push(...checkBlocks(child.blocks ?? [], TOP_LEVEL_ROLES, `${path}.blocks`));

    return problems;
  }

  function checkContentTemplate(template: ContentTemplate): string[] {
    if (!getAvailableContentLabels().includes(template.additionalLabel)) {
      return [`unknown Content type "${template.additionalLabel}"`];
    }

    const problems: string[] = [];

    if (getContentMedium([template.additionalLabel]) !== "text") {
      problems.push(`a text structure is only possible for Content types with the medium "text"`);
    }

    if (template.blocks.length === 0) {
      problems.push(`blocks must not be empty`);
    }

    problems.push(...checkBlocks(template.blocks, TOP_LEVEL_ROLES, "blocks"));

    return problems;
  }

  /**
   * Checks the given property values against their configs: each value must belong to a configured property and
   * match its type and options. If `isComplete`, every required property must have a value, too.
   */
  function checkProperties(
    values: Record<string, unknown>,
    fields: PropertyConfig[],
    path: string,
    isComplete: boolean,
  ): string[] {
    const problems: string[] = [];

    for (const [name, value] of Object.entries(values)) {
      const field: PropertyConfig | undefined = fields.find((f) => f.name === name);

      if (!field) {
        problems.push(`${path}.properties.${name} is not a configured property`);
      } else if (!isAllowedValue(value, field)) {
        problems.push(`${path}.properties.${name}: invalid value ${JSON.stringify(value)}`);
      }
    }

    for (const field of fields) {
      if (isComplete && isRequiredValueMissing(values[field.name], field)) {
        problems.push(`${path}.properties.${field.name} is required`);
      }
    }

    return problems;
  }

  /**
   * Structural blocks must use the project's name of their native type and be allowed by the nesting rules. Text blocks
   * (paragraph, heading) need a placeholder text, since empty blocks would collapse to the same position in the
   * standoff. Containers (list, table etc.) need children.
   */
  function checkStructuralBlock(block: TemplateBlock, allowedRoles: readonly string[], path: string): string[] {
    const problems: string[] = [];
    const editorRole: string = getEditorRole(block.type);
    const configuredType: string = getAnnotationType(editorRole);
    const contains: readonly string[] = BUILTIN_STRUCTURAL_NESTING[editorRole as BuiltinStructuralType]?.contains ?? [];

    if (configuredType !== block.type) {
      problems.push(`${path}: use the configured type "${configuredType}" instead of "${block.type}"`);
    }

    if (!allowedRoles.includes(editorRole)) {
      problems.push(`${path}: "${block.type}" is not allowed at this position`);
    }

    if (contains.length === 0) {
      if (!block.text?.trim()) {
        problems.push(`${path}.text: a text block needs a placeholder text`);
      }

      if (block.children !== undefined) {
        problems.push(`${path}.children: a text block can't have children`);
      }

      problems.push(...checkTextAnnotations(block, path));
    } else {
      if (block.text !== undefined) {
        problems.push(`${path}.text: a container gets its text from its children`);
      }

      if (block.annotations !== undefined) {
        problems.push(`${path}.annotations: inline annotations are only possible on text blocks`);
      }

      if (!block.children?.length) {
        problems.push(`${path}.children: a container needs at least one child`);
      }
    }

    const fields: PropertyConfig[] = [
      ...(getStructuralAnnotationConfig(block.type)?.properties ?? []),
      ...getAnnotationPropertyFields(block.type),
    ];

    problems.push(...checkProperties(block.properties ?? {}, fields, path, true));
    problems.push(...checkBlocks(block.children ?? [], contains, `${path}.children`));

    return problems;
  }

  /**
   * Annotations on a text block must be inline range annotations (a zero point has no meaningful position in a
   * placeholder text) whose `text` occurs in the block's text, with complete properties.
   */
  function checkTextAnnotations(block: TemplateBlock, path: string): string[] {
    return (block.annotations ?? []).flatMap((annotation, index) => {
      const annotationPath: string = `${path}.annotations[${index}]`;

      if (!isConfiguredAnnotationType(annotation.type) || getAnnotationRepresentation(annotation.type) !== "inline") {
        return [`${annotationPath}: "${annotation.type}" is not an inline annotation type`];
      }

      if (getAnnotationExtent(annotation.type) !== "range") {
        return [`${annotationPath}: "${annotation.type}" is a zero point, which is not possible in templates`];
      }

      const problems: string[] = [];

      if (annotation.text !== undefined && (!annotation.text || !(block.text ?? "").includes(annotation.text))) {
        problems.push(`${annotationPath}.text: "${annotation.text}" is not part of the block's text`);
      }

      problems.push(
        ...checkProperties(annotation.properties ?? {}, getAnnotationPropertyFields(annotation.type), annotationPath, true),
      );

      return problems;
    });
  }

  /** The property configs of an annotation type without the ones derived from the template structure. */
  function getAnnotationPropertyFields(type: string): PropertyConfig[] {
    return getAnnotationFields(type).filter((f) => !DERIVED_ANNOTATION_PROPERTIES.includes(f.name));
  }

  /**
   * Returns the Collection templates (`collections.miso.templates`) that conform to the guidelines.
   *
   * @returns {CollectionTemplate[]} The valid Collection templates.
   */
  function getCollectionTemplates(): CollectionTemplate[] {
    const templates: CollectionTemplate[] = guidelines.value?.collections.miso?.templates ?? [];

    return templates.filter((template) => isValidTemplate(template, () => checkCollectionTemplate(template)));
  }

  /**
   * Returns the Content templates (`contents.miso.templates`) that conform to the guidelines.
   *
   * @returns {ContentTemplate[]} The valid Content templates.
   */
  function getContentTemplates(): ContentTemplate[] {
    const templates: ContentTemplate[] = guidelines.value?.contents.miso?.templates ?? [];

    return templates.filter((template) => isValidTemplate(template, () => checkContentTemplate(template)));
  }

  function isAllowedValue(value: unknown, field: PropertyConfig): boolean {
    if (value === null) {
      return !field.required;
    }

    if (field.options && !(field.options as unknown[]).includes(value)) {
      return false;
    }

    if (typeof value === "number") {
      const isAboveMinimum: boolean = field.minimum === undefined || value >= field.minimum;
      const isBelowMaximum: boolean = field.maximum === undefined || value <= field.maximum;

      if (!isAboveMinimum || !isBelowMaximum) {
        return false;
      }
    }

    if (field.type === "Boolean") {
      return typeof value === "boolean";
    } else if (field.type === "Integer") {
      return Number.isInteger(value);
    } else if (field.type === "Float") {
      return typeof value === "number";
    } else if (field.type === "String") {
      return typeof value === "string";
    } else {
      return true;
    }
  }

  function isValidTemplate(template: CollectionTemplate | ContentTemplate, check: () => string[]): boolean {
    const cached: boolean | undefined = validityByTemplate.get(template);

    if (cached !== undefined) {
      return cached;
    }

    // Set before checking, so a template that refers to itself can't recurse endlessly
    validityByTemplate.set(template, false);

    const problems: string[] = check();

    if (problems.length > 0) {
      console.warn(`Template "${template.name}" is ignored:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    }

    validityByTemplate.set(template, problems.length === 0);

    return problems.length === 0;
  }

  return {
    applyCollectionTemplate,
    buildContentFromTemplate,
    getCollectionTemplates,
    getContentTemplates,
  };
}
