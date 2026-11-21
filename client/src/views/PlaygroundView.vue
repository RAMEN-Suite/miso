<script setup lang="ts">
import { DataTypes } from "@ramen-suite/core";
import type {
  AnnotationShapeProperty,
  AnnotationShapeRelation,
  AnnotationShapeSuggestion,
  AttributeInfo,
  Bounds,
  Constraint,
  DataType,
  Diagnostic,
  Literal,
  Model,
  Node,
  ProjectValidationResult,
  AnnotationShape,
  RamenModel,
  Relation,
} from "@ramen-suite/core";
import { ref } from "vue";
import Button from "primevue/button";
import { useConfigStore } from "../store/config";

interface AttributeRow {
  name: string;
  type: string;
  bounds: string;
  declaredBy: string;
  inherited: boolean;
}

interface NodeRow {
  name: string;
  lineage: string;
  attributes: AttributeRow[];
}

interface DataTypeRow {
  name: string;
  baseType: string;
  model: string;
  constraints: string[];
  literals: string[];
}

interface RelationRow {
  name: string;
  from: string;
  to: string;
  fromBounds: string;
  toBounds: string;
}

interface AnnotationRow {
  type: string;
  properties: string[];
  relations: string[];
}

interface CarrierRow {
  carrier: string;
  types: string[];
}

const { getModelContext } = useConfigStore();

/** The model of the loaded Miso config. The app only renders routes after the config is initialized. */
let edition: RamenModel | undefined;
let loadError: string | undefined;

try {
  edition = getModelContext().model;
} catch (error: unknown) {
  loadError = error instanceof Error ? error.message : String(error);
}

function formatBounds(bounds: Bounds): string {
  const upper: string = bounds.upperBound === -1 ? "*" : String(bounds.upperBound);
  return `${bounds.lowerBound}..${upper}`;
}

const BUILTIN_TYPES: string[] = Object.values(DataTypes);

function typeName(edition: RamenModel, typeId: string): string {
  if (BUILTIN_TYPES.includes(typeId)) {
    return typeId;
  } else {
    return edition.getDataType(typeId)?.name ?? typeId;
  }
}

function nodeName(edition: RamenModel, ref: string): string {
  return edition.getNode(ref)?.name ?? ref;
}

function getLocalNodes(edition: RamenModel): Node[] {
  return edition.getModel().classifiers.filter((classifier): classifier is Node => classifier.kind === "Node");
}

function buildNodeRows(edition: RamenModel): NodeRow[] {
  return getLocalNodes(edition).map(
    (node: Node): NodeRow => ({
      name: node.name,
      lineage: edition
        .getNodeLineage(node)
        .map((item) => item.name)
        .join(" › "),
      attributes: edition.getAttributes(node).map(
        (attribute: AttributeInfo): AttributeRow => ({
          name: attribute.name,
          type: typeName(edition, attribute.typeId),
          bounds: formatBounds(attribute.bounds),
          declaredBy: attribute.declaredBy.name,
          inherited: attribute.inherited,
        }),
      ),
    }),
  );
}

function formatConstraint(constraint: Constraint): string {
  const expression: string =
    typeof constraint.expression === "string" ? constraint.expression : JSON.stringify(constraint.expression);
  return `${constraint.name} (${constraint.language}: ${expression})`;
}

function formatLiteral(literal: Literal): string {
  if (literal.literal !== undefined) {
    return literal.literal;
  } else if (literal.value !== undefined) {
    return String(literal.value);
  } else {
    return literal.name;
  }
}

// Built-in value types first, then the declared ones of every loaded model (imported base model and project)
function buildDataTypeRows(edition: RamenModel): DataTypeRow[] {
  const builtinRows: DataTypeRow[] = BUILTIN_TYPES.map(
    (name: string): DataTypeRow => ({ name, baseType: "—", model: "built-in", constraints: [], literals: [] }),
  );

  const declaredRows: DataTypeRow[] = edition.getModels().flatMap((model: Model): DataTypeRow[] =>
    model.classifiers
      .filter((classifier): classifier is DataType => classifier.kind === "DataType")
      .map(
        (dataType: DataType): DataTypeRow => ({
          name: dataType.name,
          baseType: dataType.baseType,
          model: model.name,
          constraints: (dataType.constraints ?? []).map(formatConstraint),
          literals: (dataType.literals ?? []).map(formatLiteral),
        }),
      ),
  );

  return [...builtinRows, ...declaredRows];
}

function buildRelationRows(edition: RamenModel): RelationRow[] {
  return edition.getModel().relations.map(
    (relation: Relation): RelationRow => ({
      name: relation.name,
      from: nodeName(edition, relation.from.nodeId),
      to: nodeName(edition, relation.to.nodeId),
      fromBounds: formatBounds(relation.from.bounds),
      toBounds: formatBounds(relation.to.bounds),
    }),
  );
}

function describeProperty(edition: RamenModel, property: AnnotationShapeProperty): string {
  if ("attributeId" in property) {
    return `→ attribute ${property.attributeId}${property.bounds ? ` [${formatBounds(property.bounds)}]` : ""}`;
  } else {
    return `${property.name}: ${typeName(edition, property.typeId)} [${formatBounds(property.bounds)}]`;
  }
}

function describeRelationRule(edition: RamenModel, rule: AnnotationShapeRelation): string {
  const relations: string = rule.relationIds
    .map((id: string): string => {
      const relation: Relation | undefined = edition.getRelation(id);

      if (relation) {
        return `${nodeName(edition, relation.from.nodeId)} ${relation.name} ${nodeName(edition, relation.to.nodeId)}`;
      } else {
        return id;
      }
    })
    .join(" | ");

  return `${rule.direction} [${formatBounds(rule.bounds)}]: ${relations}`;
}

function buildAnnotationRows(edition: RamenModel): AnnotationRow[] {
  return edition.getAnnotationShapes().map(
    (annotation: AnnotationShape): AnnotationRow => ({
      type: annotation.type,
      properties: annotation.properties.map((property: AnnotationShapeProperty): string => describeProperty(edition, property)),
      relations: annotation.relations.map((rule: AnnotationShapeRelation): string => describeRelationRule(edition, rule)),
    }),
  );
}

// Every local node that allows at least one annotation type
function buildCarrierRows(edition: RamenModel): CarrierRow[] {
  return getLocalNodes(edition)
    .map(
      (node: Node): CarrierRow => ({
        carrier: node.name,
        types: edition
          .suggestAnnotationShapesForNode(node)
          .map((suggestion: AnnotationShapeSuggestion): string => suggestion.type),
      }),
    )
    .filter((row: CarrierRow): boolean => row.types.length > 0);
}

const modelValidation: ProjectValidationResult | undefined = edition?.validate();
const nodeRows: NodeRow[] = edition ? buildNodeRows(edition) : [];
const dataTypeRows: DataTypeRow[] = edition ? buildDataTypeRows(edition) : [];
const relationRows: RelationRow[] = edition ? buildRelationRows(edition) : [];
const annotationRows: AnnotationRow[] = edition ? buildAnnotationRows(edition) : [];
const carrierRows: CarrierRow[] = edition ? buildCarrierRows(edition) : [];
const exportJson: string = edition ? JSON.stringify(edition.export(), null, 2) : "";

/** Feedback duration of the copy button's check icon */
const COPY_FEEDBACK_MS = 1500 as const;

const isCopying = ref<boolean>(false);
const hasCopied = ref<boolean>(false);

/** Copies the export JSON to the clipboard and shows a check icon on the button for a moment. */
async function copyExportJson(): Promise<void> {
  if (isCopying.value) {
    return;
  }

  isCopying.value = true;

  try {
    await navigator.clipboard.writeText(exportJson);
    hasCopied.value = true;
    setTimeout(() => {
      hasCopied.value = false;
    }, COPY_FEEDBACK_MS);
  } catch (error: unknown) {
    console.error("Copying the export JSON failed:", error);
  } finally {
    isCopying.value = false;
  }
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  return `[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}${diagnostic.path ? ` (${diagnostic.path})` : ""}`;
}
</script>

<template>
  <div class="playground flex flex-col gap-8 p-6">
    <h1 class="text-2xl font-semibold">ramen-core playground</h1>

    <div v-if="loadError" class="text-red-600">The model of the config is not available: {{ loadError }}</div>

    <template v-if="edition">
      <section>
        <h2 class="text-xl font-semibold mb-2">1. Model validity</h2>
        <p v-if="modelValidation?.valid" class="text-green-700">Model is valid.</p>
        <ul v-else>
          <li v-for="(diagnostic, i) in modelValidation?.diagnostics" :key="i" class="text-red-600">
            {{ formatDiagnostic(diagnostic) }}
          </li>
        </ul>
      </section>

      <section>
        <h2 class="text-xl font-semibold mb-2">2. Node types (resolved inheritance)</h2>
        <div v-for="node in nodeRows" :key="node.name" class="mb-4">
          <h3 class="font-semibold">
            {{ node.name }} <span class="font-normal opacity-70">— {{ node.lineage }}</span>
          </h3>
          <table class="playground-table">
            <thead>
              <tr>
                <th>Attribute</th>
                <th>Type</th>
                <th>Bounds</th>
                <th>Declared by</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="attribute in node.attributes" :key="attribute.name" :class="{ 'opacity-60': attribute.inherited }">
                <td>{{ attribute.name }}</td>
                <td>{{ attribute.type }}</td>
                <td>{{ attribute.bounds }}</td>
                <td>{{ attribute.declaredBy }}{{ attribute.inherited ? " (inherited)" : "" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="text-xl font-semibold mb-2">3. Data types</h2>
        <table class="playground-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Base type</th>
              <th>Model</th>
              <th>Constraints</th>
              <th>Literals</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="dataType in dataTypeRows" :key="`${dataType.model}:${dataType.name}`">
              <td>{{ dataType.name }}</td>
              <td>{{ dataType.baseType }}</td>
              <td>{{ dataType.model }}</td>
              <td>
                <div v-for="constraint in dataType.constraints" :key="constraint">{{ constraint }}</div>
              </td>
              <td>{{ dataType.literals.join(", ") }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 class="text-xl font-semibold mb-2">4. Relations</h2>
        <table class="playground-table">
          <thead>
            <tr>
              <th>From</th>
              <th>Relation</th>
              <th>To</th>
              <th>From bounds</th>
              <th>To bounds</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(relation, i) in relationRows" :key="i">
              <td>{{ relation.from }}</td>
              <td>{{ relation.name }}</td>
              <td>{{ relation.to }}</td>
              <td>{{ relation.fromBounds }}</td>
              <td>{{ relation.toBounds }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 class="text-xl font-semibold mb-2">5. Annotation types</h2>
        <table class="playground-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Properties</th>
              <th>Relation rules</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="annotation in annotationRows" :key="annotation.type">
              <td>{{ annotation.type }}</td>
              <td>
                <div v-for="property in annotation.properties" :key="property">{{ property }}</div>
              </td>
              <td>
                <div v-for="rule in annotation.relations" :key="rule">{{ rule }}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <h3 class="font-semibold mt-4">Allowed annotation types per node</h3>
        <ul>
          <li v-for="row in carrierRows" :key="row.carrier">
            <strong>{{ row.carrier }}</strong
            >: {{ row.types.join(", ") || "—" }}
          </li>
        </ul>
      </section>

      <section>
        <div class="flex items-center gap-2 mb-2">
          <h2 class="text-xl font-semibold">6. Export (RamenFile)</h2>
          <Button
            :icon="hasCopied ? 'icon-check' : 'icon-copy'"
            severity="secondary"
            text
            aria-label="Copy export JSON"
            title="Copy export JSON"
            class="w-8! h-8!"
            :disabled="isCopying"
            @click="copyExportJson"
          />
        </div>
        <details>
          <summary>Show export JSON</summary>
          <pre class="playground-pre">{{ exportJson }}</pre>
        </details>
      </section>
    </template>
  </div>
</template>

<style scoped>
.playground {
  overflow: auto;
  height: 100%;
}

.playground-table {
  border-collapse: collapse;
  font-size: 0.875rem;
}

.playground-table th,
.playground-table td {
  border: 1px solid var(--p-content-border-color, #ddd);
  padding: 0.25rem 0.5rem;
  text-align: left;
  vertical-align: top;
}

.playground-pre {
  font-size: 0.75rem;
  max-height: 32rem;
  overflow: auto;
}
</style>
