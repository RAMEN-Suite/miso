<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import Select from "primevue/select";
import {
  BUILTIN_STRUCTURAL_CONFIGS,
  findShape,
  getContentCarrierRefs,
  getShapesForNode,
  IconView,
  shapeRefOf,
  type ConfigFinding,
  type ConfigMapping,
  type IconSpecInput,
  type ModelContext,
} from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { EMPTY_ENTRY_PT, withEmptyEntry, type SelectEntry } from "../utils/selectEntries";
import FindingList from "./FindingList.vue";
import SectionHeading from "./SectionHeading.vue";
import TermHint from "./TermHint.vue";

type NativeType = ConfigMapping["native"];

const { draft, context, findings, selection } = useConfigDraft();

/** How long the mapping that was jumped to stays highlighted */
const HIGHLIGHT_MS = 1500;

const root = useTemplateRef<HTMLElement>("root");

/** The shape ref of the highlighted mapping */
const highlightedRef = ref<string>();

/**
 * Scrolls to the mapping of the selection's `focus` shape and highlights it for a moment.
 *
 * @param {string | undefined} shapeRef - The shape ref, nothing happens without one.
 */
async function focusMapping(shapeRef: string | undefined): Promise<void> {
  if (!shapeRef) {
    return;
  }

  await nextTick();
  root.value?.querySelector(`[data-annotation="${CSS.escape(shapeRef)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  highlightedRef.value = shapeRef;
  setTimeout(() => {
    if (highlightedRef.value === shapeRef) {
      highlightedRef.value = undefined;
    }
  }, HIGHLIGHT_MS);
}

watch(
  () => (selection.value.kind === "textEditor" ? selection.value.focus : undefined),
  (shapeRef) => void focusMapping(shapeRef),
  { immediate: true },
);

const ctx = computed<ModelContext>(() => context.value as ModelContext);

const NATIVE_TYPES: NativeType[] = BUILTIN_STRUCTURAL_CONFIGS.map((config) => config.type as NativeType);

/** The place of a native type in the form; `index` is the position of its mapping in the config */
interface MappingSlot {
  native: NativeType;
  mapping?: ConfigMapping;
  index: number;
}

/** One slot per native type in a fixed order, mapped or not; a native type mapped twice shows its first mapping */
const slots = computed<MappingSlot[]>(() => {
  const mappings: ConfigMapping[] = draft.value?.editors.text.mappings ?? [];

  return NATIVE_TYPES.map((native) => {
    const index: number = mappings.findIndex((mapping) => mapping.native === native);

    return { native, mapping: mappings[index], index };
  });
});

/** The annotation shapes on Content nodes as dropdown entries (shape refs), after the empty one that unmaps */
const shapeEntries = computed<SelectEntry<string>[]>(() => {
  const byRef = new Map<string, string>();

  for (const shape of getContentCarrierRefs(ctx.value).flatMap((ref) => getShapesForNode(ctx.value, ref))) {
    byRef.set(shapeRefOf(shape), shape.type);
  }

  return withEmptyEntry(
    [...byRef].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
  );
});

/** The icon of a native type */
function nativeTypeIconOf(native: NativeType): IconSpecInput | undefined {
  return BUILTIN_STRUCTURAL_CONFIGS.find((config) => config.type === native)?.icon;
}

/** The built-in attributes of a native type */
function nativeAttributesOf(native: NativeType): string[] {
  return BUILTIN_STRUCTURAL_CONFIGS.find((config) => config.type === native)?.attributes.map((attribute) => attribute.name) ?? [];
}

/** The properties of a mapping's shape as dropdown entries (attribute refs), after the empty one */
function propertiesOf(mapping: ConfigMapping): SelectEntry<string>[] {
  const shape = findShape(ctx.value, mapping.annotation);

  return withEmptyEntry(
    shape?.properties.map((property) => ({ label: property.name, value: `${shape.modelId}:${property.id}` })) ?? [],
  );
}

/** The findings of a mapping, including the ones on the built-in attributes of its shape */
function findingsOf(index: number, mapping: ConfigMapping): ConfigFinding[] {
  return findings.value.filter(
    (finding) =>
      finding.path.startsWith(`editors.text.mappings[${index}]`) ||
      (finding.ref === mapping.annotation && finding.path.startsWith("Annotation shape")),
  );
}

function update(index: number, change: (mapping: ConfigMapping) => void): void {
  const mapping: ConfigMapping | undefined = draft.value?.editors.text.mappings[index];

  if (mapping) {
    change(mapping);
  }
}

/**
 * Maps a native type to a shape, replacing its mapping; without a shape the mapping is removed.
 *
 * @param {MappingSlot} slot - The slot of the native type.
 * @param {string | null | undefined} ref - The shape ref, empty to unmap.
 */
function setShape(slot: MappingSlot, ref: string | null | undefined): void {
  const mappings: ConfigMapping[] | undefined = draft.value?.editors.text.mappings;

  if (!mappings) {
    return;
  }

  if (!ref) {
    if (slot.mapping) {
      mappings.splice(slot.index, 1);
    }

    return;
  }

  const mapping: ConfigMapping = { native: slot.native, annotation: ref, type: findShape(ctx.value, ref)?.type ?? "" };

  if (slot.mapping) {
    mappings[slot.index] = mapping;
  } else {
    mappings.push(mapping);
  }
}

/**
 * Maps a built-in attribute to a property of the shape. Without one, the property with the built-in's name is used.
 *
 * @param {number} index - The index of the mapping.
 * @param {string} nativeAttribute - The built-in attribute.
 * @param {string | null | undefined} attributeRef - The property's attribute ref, empty for the one with the same name.
 */
function setAttribute(index: number, nativeAttribute: string, attributeRef: string | null | undefined): void {
  update(index, (mapping) => {
    const attributes: Record<string, string> = { ...mapping.attributes };

    if (attributeRef) {
      attributes[nativeAttribute] = attributeRef;
    } else {
      delete attributes[nativeAttribute];
    }

    mapping.attributes = Object.keys(attributes).length > 0 ? attributes : undefined;
  });
}

</script>

<template>
  <!-- The native mappings of the text editor, a section of its form -->
  <section ref="root" class="flex flex-col gap-4">
    <div class="flex flex-col">
      <SectionHeading class="font-medium gap-1.5">Native mappings <TermHint term="native" /></SectionHeading>
      <p class="text-sm text-slate-500">
        The editor's native types and the annotation shapes that implement them. A mapped shape must carry the built-in
        attributes with the built-in types.
      </p>
    </div>

    <!-- One slot per native type; an unmapped one stays in place, dashed -->
    <div
      v-for="slot in slots"
      :key="slot.native"
      :data-annotation="slot.mapping?.annotation"
      class="rounded border p-3 flex flex-col gap-2 transition-colors duration-500"
      :class="
        slot.mapping && highlightedRef === slot.mapping.annotation
          ? 'border-blue-500 bg-blue-50'
          : slot.mapping
            ? 'border-slate-200'
            : 'border-dashed border-slate-300'
      "
    >
      <div class="flex items-center gap-2">
        <span class="w-40 shrink-0 flex items-center gap-2" :class="slot.mapping ? 'font-medium' : 'text-slate-500'">
          <IconView :spec="nativeTypeIconOf(slot.native)" class="text-slate-500" />
          <code class="text-sm">{{ slot.native }}</code>
        </span>
        <span class="text-slate-500">is</span>
        <Select
          :model-value="slot.mapping?.annotation"
          :options="shapeEntries"
          option-label="label"
          option-value="value"
          :pt="EMPTY_ENTRY_PT"
          filter
          placeholder="Not mapped"
          size="small"
          class="flex-1"
          :invalid="!!slot.mapping && !findShape(ctx, slot.mapping.annotation)"
          @update:model-value="setShape(slot, $event)"
        />
      </div>

      <template v-if="slot.mapping">
        <div v-if="nativeAttributesOf(slot.native).length > 0" class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 items-center pl-2">
          <template v-for="nativeAttribute in nativeAttributesOf(slot.native)" :key="nativeAttribute">
            <label class="text-sm text-slate-600">{{ nativeAttribute }}</label>
            <Select
              :model-value="slot.mapping.attributes?.[nativeAttribute]"
              :options="propertiesOf(slot.mapping)"
              option-label="label"
              option-value="value"
              :pt="EMPTY_ENTRY_PT"
              :placeholder="`Property named ${nativeAttribute}`"
              size="small"
              @update:model-value="setAttribute(slot.index, nativeAttribute, $event)"
            />
          </template>
        </div>

        <FindingList :findings="findingsOf(slot.index, slot.mapping)" with-path />
      </template>
    </div>
  </section>
</template>
