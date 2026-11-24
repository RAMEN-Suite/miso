<script setup lang="ts">
import { computed } from "vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import SelectButton from "primevue/selectbutton";
import Button from "primevue/button";
import {
  ANNOTATION_EXTENT_DESCRIPTIONS,
  ANNOTATION_EXTENTS,
  BUILTIN_STRUCTURAL_CONFIGS,
  TEXT_ANNOTATION_REPRESENTATION_DESCRIPTIONS,
  TEXT_ANNOTATION_REPRESENTATIONS,
  findShape,
  getContentCarrierRefs,
  getContentMedium,
  getShapesForNode,
  IconView,
  shapeRefOf,
  type AnnotationAppearance,
  type ConfigFinding,
  type ConfigMapping,
  type ContentMedium,
  type IconSpecInput,
  type ModelAnnotationShape,
  type ModelContext,
} from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { attributeRowsOf, variantPropertiesOf, type AttributeRow, type VariantProperty } from "../utils/attributes";
import { editAnnotationEntry, hasStyles, styleKindOf, withKey, type AnnotationEntry, type StyleKind } from "../utils/configUpdate";
import { shapeIconOf } from "../utils/elementIcons";
import { MEDIUM_ICONS } from "../utils/media";
import { EMPTY_ENTRY_PT, withEmptySuggestion } from "../utils/selectEntries";
import AttributeTable from "./AttributeTable.vue";
import ElementLink from "./ElementLink.vue";
import FormHeader from "./FormHeader.vue";
import SectionHeading from "./SectionHeading.vue";
import FindingList from "./FindingList.vue";
import HighlightStyleInput from "./HighlightStyleInput.vue";
import IconSpecInputField from "./IconSpecInput.vue";
import MarkerInput from "./MarkerInput.vue";
import TermHint from "./TermHint.vue";
import TextAnnotationPreview from "./TextAnnotationPreview.vue";
import VariantsEditor from "./VariantsEditor.vue";

type Editing = NonNullable<AnnotationEntry["editing"]>;
type Extent = NonNullable<Editing["extent"]>;
type Representation = NonNullable<Editing["representation"]>;

const props = defineProps<{ shapeRef: string }>();

const { draft, context, findings, setStylesAside, bringBackStyles } = useConfigDraft();

/** Typed against the schema's values, so a new extent or representation needs a description */
const EXTENT_DESCRIPTIONS: Record<Extent, string> = ANNOTATION_EXTENT_DESCRIPTIONS;
const REPRESENTATION_DESCRIPTIONS: Record<Representation, string> = TEXT_ANNOTATION_REPRESENTATION_DESCRIPTIONS;

const ctx = computed<ModelContext>(() => context.value as ModelContext);

const shape = computed<ModelAnnotationShape | undefined>(() => findShape(ctx.value, props.shapeRef));

const entry = computed<AnnotationEntry | undefined>(() => draft.value?.elements.annotations[props.shapeRef]);

/** The mapping to a native type of the editor, which brings its own extent, representation, group and icon */
const mapping = computed<ConfigMapping | undefined>(() =>
  draft.value?.editors.text.mappings.find((candidate) => candidate.annotation === props.shapeRef),
);

/** The shape's icon, the native type's when it is mapped */
const icon = computed<IconSpecInput | undefined>(() => shapeIconOf(ctx.value, props.shapeRef));

/** Whether a node may carry the shape */
function carries(nodeRef: string): boolean {
  return getShapesForNode(ctx.value, nodeRef).some((candidate) => shapeRefOf(candidate) === props.shapeRef);
}

/** A node that may carry the shape */
interface Carrier {
  ref: string;
  name: string;
}

/** The nodes that may carry the shape */
const carriers = computed<Carrier[]>(() =>
  ctx.value.config.model.classifiers
    .filter((classifier) => classifier.kind === "Node" && carries(`${classifier.modelId}:${classifier.id}`))
    .map((node) => ({ ref: `${node.modelId}:${node.id}`, name: node.name })),
);

/** The Content types that may carry the shape, by their medium (from the draft, along the lineage) */
const contentCarriersByMedium = computed<Map<ContentMedium, Carrier[]>>(() => {
  const byMedium = new Map<ContentMedium, Carrier[]>();

  for (const ref of getContentCarrierRefs(ctx.value).filter(carries)) {
    const medium: ContentMedium = getContentMedium(ctx.value, ref);

    byMedium.set(medium, [...(byMedium.get(medium) ?? []), { ref, name: ctx.value.model.getNode(ref)?.name ?? ref }]);
  }

  return byMedium;
});

/** Why `structure` can't be chosen: the editor builds blocks only for its native types */
const STRUCTURE_HINT = "Only for shapes mapped to a native type (see Editors > Text)";

/** `structure` is only chosen by a mapping, so it is disabled here (a config that has it still shows it) */
const REPRESENTATION_OPTIONS: { value: Representation; disabled: boolean }[] = TEXT_ANNOTATION_REPRESENTATIONS.map((value) => ({
  value,
  disabled: value === "structure",
}));

const textCarriers = computed<Carrier[]>(() => contentCarriersByMedium.value.get("text") ?? []);
const imageCarriers = computed<Carrier[]>(() => contentCarriersByMedium.value.get("image") ?? []);

const extent = computed<Extent>(() => {
  const nativeExtent: Extent | undefined = BUILTIN_STRUCTURAL_CONFIGS.find((c) => c.type === mapping.value?.native)?.extent;

  return nativeExtent ?? entry.value?.editing?.extent ?? "range";
});

const representation = computed<Representation>(() =>
  mapping.value ? "structure" : (entry.value?.editing?.representation ?? "inline"),
);

/** The kind of styles that doesn't apply to the current extent */
const inapplicableStyleKind = computed<StyleKind>(() => styleKindOf(extent.value === "range" ? "zeroPoint" : "range"));

/** Whether the entry still has styles that don't apply to its extent, e.g. from a config written by hand */
const hasInapplicableStyles = computed<boolean>(() => hasStyles(entry.value, inapplicableStyleKind.value));

/** The groups of all entries, as suggestions */
const groupOptions = computed<string[]>(() => [
  ...new Set(Object.values(draft.value?.elements.annotations ?? {}).flatMap((e) => (e.group ? [e.group] : []))),
].sort());

const properties = computed<VariantProperty[]>(() => (shape.value ? variantPropertiesOf(ctx.value, shape.value) : []));

const ownFindings = computed<ConfigFinding[]>(() => findings.value.filter((finding) => finding.ref === props.shapeRef));

const flaggedAttributeRefs = computed<Set<string>>(
  () => new Set(ownFindings.value.flatMap((finding) => (finding.attributeRef ? [finding.attributeRef] : []))),
);

const attributeRows = computed<AttributeRow[]>(() => (shape.value ? attributeRowsOf(ctx.value, shape.value) : []));

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

/**
 * Sets the extent. The styles of the other extent are set aside (they would only warn) and the ones set aside for the
 * new extent come back, so switching back and forth loses nothing.
 *
 * @param {Extent | null | undefined} value - The extent, empty for the default (range).
 */
function setExtent(value: Extent | null | undefined): void {
  const next: Extent = value ?? "range";

  edit((target) => {
    target.editing = withKey(target.editing, "extent", value ?? undefined);
    setStylesAside(props.shapeRef, target, styleKindOf(next === "range" ? "zeroPoint" : "range"));
    bringBackStyles(props.shapeRef, target, styleKindOf(next));
  });
}

/** Sets the styles that don't apply to the extent aside; switching the extent brings them back */
function setInapplicableStylesAside(): void {
  edit((target) => setStylesAside(props.shapeRef, target, inapplicableStyleKind.value));
}

function setAppearance<K extends keyof AnnotationAppearance>(key: K, value: AnnotationAppearance[K] | undefined): void {
  edit((target) => {
    target.appearance = withKey(target.appearance, key, value);
  });
}
</script>

<template>
  <div v-if="shape" class="flex flex-col gap-6">
    <FormHeader>
      <h2 class="text-xl font-semibold flex items-center gap-2">
        <IconView v-if="icon" :spec="icon" :size="20" class="text-slate-500" />{{ shape.type }}
      </h2>
      <p class="text-sm text-slate-500">
        Annotation shape on
        <template v-for="(carrier, index) in carriers" :key="carrier.ref">
          <ElementLink :to="{ kind: 'classifier', ref: carrier.ref }">{{ carrier.name }}</ElementLink
          >{{ index < carriers.length - 1 ? ", " : "" }}
        </template>
        <template v-if="carriers.length === 0">no node</template>
        · <code class="text-xs">{{ shapeRef }}</code>
      </p>
    </FormHeader>

    <div v-if="mapping || !entry" class="flex flex-col gap-2">
      <div
        v-if="mapping"
        class="flex items-center gap-2 rounded px-3 py-2 border-l-4 border-blue-500 bg-blue-50 text-sm text-blue-900"
      >
        <i class="icon-info shrink-0" />
        <span class="flex-1">
          Mapped to the native type
          <ElementLink :to="{ kind: 'textEditor', focus: shapeRef }"><code>{{ mapping.native }}</code></ElementLink>: extent,
          representation, group and icon come from it.
        </span>
        <TermHint term="native" />
      </div>
      <p v-if="!entry" class="text-sm text-slate-500">
        Not configured yet. Changing a setting creates its entry. <TermHint term="entry" />
      </p>
    </div>

    <FindingList :findings="ownFindings" with-path />

    <section class="flex flex-col gap-2">
      <SectionHeading class="font-medium">Properties</SectionHeading>
      <AttributeTable :rows="attributeRows" :flagged-refs="flaggedAttributeRefs" />
    </section>

    <!-- A mapped shape shows the icon of its native type -->
    <section v-if="!mapping" class="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2 items-center">
      <label class="text-sm text-slate-600 flex items-center gap-1.5">Icon <TermHint term="icon" /></label>
      <IconSpecInputField :model-value="entry?.appearance?.icon" @update:model-value="setAppearance('icon', $event)" />
    </section>

    <!-- Text Content: the text editor's settings, styling and preview -->
    <section v-if="textCarriers.length > 0" class="flex flex-col gap-4 rounded border border-slate-200 p-4">
      <SectionHeading class="font-semibold gap-2"><i :class="MEDIUM_ICONS.text" class="text-slate-500" />Text</SectionHeading>

      <div class="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-2 items-center">
        <label class="text-sm text-slate-600 flex items-center gap-1.5">Group <TermHint term="group" /></label>
        <Select
          :model-value="mapping ? undefined : entry?.group"
          :options="withEmptySuggestion(groupOptions)"
          :pt="EMPTY_ENTRY_PT"
          :disabled="!!mapping"
          editable
          size="small"
          :placeholder="mapping ? 'structure (mapped)' : 'other'"
          @update:model-value="setGroup"
        />

        <label class="text-sm text-slate-600 flex items-center gap-1.5">Shortcut <TermHint term="shortcut" /></label>
        <InputText
          :model-value="entry?.controls?.shortcut ?? ''"
          size="small"
          placeholder="e.g. Mod-Shift-e"
          @update:model-value="setShortcut"
        />

        <label class="text-sm text-slate-600 flex items-center gap-1.5 self-start pt-1.5">Extent <TermHint term="extent" /></label>
        <div class="flex flex-col gap-1">
          <SelectButton
            :model-value="mapping ? extent : entry?.editing?.extent"
            :options="ANNOTATION_EXTENTS"
            :disabled="!!mapping"
            size="small"
            class="self-start"
            @update:model-value="setExtent"
          >
            <template #option="{ option }">
              <span :title="EXTENT_DESCRIPTIONS[option as Extent]">{{ option }}</span>
            </template>
          </SelectButton>
          <small class="text-slate-500">{{ EXTENT_DESCRIPTIONS[extent] }}</small>
        </div>

        <label class="text-sm text-slate-600 flex items-center gap-1.5 self-start pt-1.5">
          Representation <TermHint term="representation" />
        </label>
        <div class="flex flex-col gap-1">
          <SelectButton
            :model-value="mapping ? representation : entry?.editing?.representation"
            :options="REPRESENTATION_OPTIONS"
            option-label="value"
            option-value="value"
            option-disabled="disabled"
            :disabled="!!mapping"
            size="small"
            class="self-start"
            @update:model-value="setEditing('representation', $event)"
          >
            <template #option="{ option }">
              <span :title="option.disabled ? STRUCTURE_HINT : REPRESENTATION_DESCRIPTIONS[option.value as Representation]">
                {{ option.value }}
              </span>
            </template>
          </SelectButton>
          <small class="text-slate-500">{{ REPRESENTATION_DESCRIPTIONS[representation] }}</small>
        </div>
      </div>

      <template v-if="representation === 'inline'">
        <div class="flex flex-col gap-2">
          <h4 class="font-medium flex items-center gap-1.5">
            Styling <TermHint :term="extent === 'range' ? 'highlight' : 'marker'" />
          </h4>
          <div
            v-if="hasInapplicableStyles"
            class="flex items-center gap-2 rounded px-2 py-1 border-l-4 border-amber-500 bg-amber-50 text-sm text-amber-900"
          >
            <span class="flex-1">
              The entry also has {{ inapplicableStyleKind === "marker" ? "markers" : "highlights" }}, which only apply to
              {{ inapplicableStyleKind === "marker" ? "zeroPoint" : "range" }}.
            </span>
            <Button
              label="Set aside"
              size="small"
              severity="warn"
              text
              title="Removes them from the config; switching the extent brings them back (until another config is opened)"
              @click="setInapplicableStylesAside"
            />
          </div>
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
        </div>

        <div class="flex flex-col gap-2">
          <h4 class="font-medium flex items-center gap-1.5">Variants <TermHint term="variants" /></h4>
          <VariantsEditor
            :model-value="entry?.appearance?.variants"
            :properties="properties"
            :extent="extent"
            @update:model-value="setAppearance('variants', $event)"
          />
        </div>
      </template>

      <!-- Structure annotations are blocks, there is nothing to preview -->
      <div v-if="representation !== 'structure'" class="flex flex-col gap-2">
        <h4 class="font-medium">Preview</h4>
        <TextAnnotationPreview :shape="shape" :appearance="entry?.appearance" :extent="extent" :representation="representation" />
      </div>
    </section>

    <!-- Image Content: no image editor yet, so nothing to configure or preview -->
    <section v-if="imageCarriers.length > 0" class="flex flex-col gap-2 rounded border border-slate-200 p-4">
      <SectionHeading class="font-semibold gap-2"><i :class="MEDIUM_ICONS.image" class="text-slate-500" />Image</SectionHeading>
      <p class="text-sm text-slate-500">Settings and a preview for image annotations come with the image editor.</p>
    </section>
  </div>
  <p v-else class="text-slate-500">The model has no annotation shape {{ shapeRef }}.</p>
</template>
