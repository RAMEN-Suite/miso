<script setup lang="ts">
import { computed } from "vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import SelectButton from "primevue/selectbutton";
import {
  BUILTIN_STRUCTURAL_CONFIGS,
  findShape,
  getContentCarrierRefs,
  getShapesForNode,
  shapeRefOf,
  type AnnotationAppearance,
  type ConfigFinding,
  type ConfigMapping,
  type ModelAnnotationShape,
  type ModelContext,
} from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { attributeRowsOf, setAttributeFlag, variantPropertiesOf, type AttributeRow, type VariantProperty } from "../utils/attributes";
import { editAnnotationEntry, withKey, type AnnotationEntry } from "../utils/configUpdate";
import AnnotationPreview from "./AnnotationPreview.vue";
import AttributeTable from "./AttributeTable.vue";
import FindingList from "./FindingList.vue";
import HighlightStyleInput from "./HighlightStyleInput.vue";
import IconSpecInputField from "./IconSpecInput.vue";
import MarkerInput from "./MarkerInput.vue";
import VariantsEditor from "./VariantsEditor.vue";

type Editing = NonNullable<AnnotationEntry["editing"]>;
type Extent = NonNullable<Editing["extent"]>;
type Representation = NonNullable<Editing["representation"]>;

const props = defineProps<{ shapeRef: string }>();

const { draft, context, findings } = useConfigDraft();

const EXTENT_OPTIONS: Extent[] = ["range", "zeroPoint"];
const REPRESENTATION_OPTIONS: Representation[] = ["inline", "structure", "blockClassification"];

const ctx = computed<ModelContext>(() => context.value as ModelContext);

const shape = computed<ModelAnnotationShape | undefined>(() => findShape(ctx.value, props.shapeRef));

const entry = computed<AnnotationEntry | undefined>(() => draft.value?.elements.annotations[props.shapeRef]);

/** The mapping to a native type of the editor, which brings its own extent and representation */
const mapping = computed<ConfigMapping | undefined>(() =>
  draft.value?.editors.text.mappings.find((candidate) => candidate.annotation === props.shapeRef),
);

/** Names of the nodes that may carry the shape */
const carrierNames = computed<string[]>(() =>
  ctx.value.config.model.classifiers
    .filter((classifier) => classifier.kind === "Node")
    .filter((node) => getShapesForNode(ctx.value, `${node.modelId}:${node.id}`).some((s) => shapeRefOf(s) === props.shapeRef))
    .map((node) => node.name),
);

/** Whether Content nodes may carry the shape, so the text editor shows it */
const isTextShape = computed<boolean>(() =>
  getContentCarrierRefs(ctx.value).some((ref) => getShapesForNode(ctx.value, ref).some((s) => shapeRefOf(s) === props.shapeRef)),
);

const extent = computed<Extent>(() => {
  const nativeExtent: Extent | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === mapping.value?.native)?.extent;

  return nativeExtent ?? entry.value?.editing?.extent ?? "range";
});

const representation = computed<Representation>(() =>
  mapping.value ? "structure" : (entry.value?.editing?.representation ?? "inline"),
);

/** The groups of all entries, as suggestions */
const groupOptions = computed<string[]>(() => [
  ...new Set(Object.values(draft.value?.elements.annotations ?? {}).flatMap((e) => (e.group ? [e.group] : []))),
].sort());

const properties = computed<VariantProperty[]>(() => (shape.value ? variantPropertiesOf(ctx.value, shape.value) : []));

const ownFindings = computed<ConfigFinding[]>(() => findings.value.filter((finding) => finding.ref === props.shapeRef));

const flaggedAttributeRefs = computed<Set<string>>(
  () => new Set(ownFindings.value.flatMap((finding) => (finding.attributeRef ? [finding.attributeRef] : []))),
);

const attributeRows = computed<AttributeRow[]>(() => (shape.value ? attributeRowsOf(ctx.value, shape.value, entry.value) : []));

function edit(change: (target: AnnotationEntry) => void): void {
  if (draft.value && shape.value) {
    editAnnotationEntry(draft.value, props.shapeRef, shape.value.type, change);
  }
}

function setGroup(group: string | null | undefined): void {
  edit((target) => {
    target.group = group?.trim() || undefined;
  });
}

function setShortcut(shortcut: string | undefined): void {
  edit((target) => {
    target.controls = withKey(target.controls, "shortcut", shortcut?.trim());
  });
}

function setEditing<K extends keyof Editing>(key: K, value: Editing[K] | null | undefined): void {
  edit((target) => {
    target.editing = withKey(target.editing, key, value ?? undefined);
  });
}

function setAppearance<K extends keyof AnnotationAppearance>(key: K, value: AnnotationAppearance[K] | undefined): void {
  edit((target) => {
    target.appearance = withKey(target.appearance, key, value);
  });
}

function setAttribute(row: AttributeRow, key: "visible" | "editable", value: boolean | undefined): void {
  edit((target) => setAttributeFlag(target, row, key, value));
}
</script>

<template>
  <div v-if="shape" class="flex flex-col gap-6">
    <header>
      <h2 class="text-xl font-semibold">{{ shape.type }}</h2>
      <p class="text-sm text-slate-500">
        Annotation shape on {{ carrierNames.join(", ") || "no node" }} · <code class="text-xs">{{ shapeRef }}</code>
      </p>
      <p v-if="mapping" class="text-sm mt-1">
        Mapped to the native type <code>{{ mapping.native }}</code>: extent and representation come from it.
      </p>
      <p v-if="!entry" class="text-sm text-slate-500 mt-1">Not configured yet. Changing a setting creates its entry.</p>
    </header>

    <FindingList :findings="ownFindings" with-path />

    <section class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 items-center">
      <label class="text-sm text-slate-600">Icon</label>
      <IconSpecInputField :model-value="entry?.appearance?.icon" @update:model-value="setAppearance('icon', $event)" />

      <template v-if="isTextShape">
        <label class="text-sm text-slate-600">Group</label>
        <Select
          :model-value="entry?.group"
          :options="groupOptions"
          editable
          show-clear
          size="small"
          :placeholder="mapping ? 'structure (mapped)' : 'other'"
          @update:model-value="setGroup"
        />

        <label class="text-sm text-slate-600">Shortcut</label>
        <InputText
          :model-value="entry?.controls?.shortcut ?? ''"
          size="small"
          placeholder="e.g. Mod-Shift-e"
          @update:model-value="setShortcut"
        />

        <label class="text-sm text-slate-600">Extent</label>
        <SelectButton
          :model-value="mapping ? extent : entry?.editing?.extent"
          :options="EXTENT_OPTIONS"
          :disabled="!!mapping"
          size="small"
          @update:model-value="setEditing('extent', $event)"
        />

        <label class="text-sm text-slate-600">Representation</label>
        <SelectButton
          :model-value="mapping ? representation : entry?.editing?.representation"
          :options="REPRESENTATION_OPTIONS"
          :disabled="!!mapping"
          size="small"
          @update:model-value="setEditing('representation', $event)"
        />
      </template>
    </section>

    <template v-if="isTextShape && representation === 'inline'">
      <section class="flex flex-col gap-2">
        <h3 class="font-medium">{{ extent === "range" ? "Highlight" : "Marker" }}</h3>
        <HighlightStyleInput
          v-if="extent === 'range'"
          :model-value="entry?.appearance?.highlight"
          @update:model-value="setAppearance('highlight', $event)"
        />
        <MarkerInput
          v-else
          :model-value="entry?.appearance?.marker"
          :properties="properties"
          @update:model-value="setAppearance('marker', $event)"
        />
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="font-medium">Variants</h3>
        <small class="text-slate-500">
          Override the {{ extent === "range" ? "highlight" : "marker" }} for certain property values; later variants win.
        </small>
        <VariantsEditor
          :model-value="entry?.appearance?.variants"
          :properties="properties"
          :extent="extent"
          @update:model-value="setAppearance('variants', $event)"
        />
      </section>
    </template>

    <section v-if="isTextShape" class="flex flex-col gap-2">
      <h3 class="font-medium">Preview</h3>
      <AnnotationPreview :shape="shape" :appearance="entry?.appearance" :extent="extent" :representation="representation" />
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="font-medium">Properties</h3>
      <AttributeTable :rows="attributeRows" :flagged-refs="flaggedAttributeRefs" @set="setAttribute" />
    </section>
  </div>
  <p v-else class="text-slate-500">The model has no annotation shape {{ shapeRef }}.</p>
</template>
