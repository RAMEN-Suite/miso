<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from "vue";
import Select from "primevue/select";
import {
  NATIVE_TYPES,
  findShape,
  getContentCarrierRefs,
  getNativeTypeConfig,
  getShapesForNode,
  IconView,
  nativeTypeIcon,
  shapeRefOf,
  type ConfigFinding,
  type ConfigMapping,
  type NativeType,
} from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { useTimedHighlight } from "../state/useTimedHighlight";
import { EMPTY_ENTRY_PT, withEmptyEntry, type SelectEntry } from "../utils/selectEntries";
import FindingList from "./FindingList.vue";
import SectionHeading from "./SectionHeading.vue";
import TermHint from "./TermHint.vue";

const { draft, requiredContext: ctx, findings, selection } = useConfigDraft();

const root = useTemplateRef<HTMLElement>("root");

/** The shape ref of the mapping that was jumped to, highlighted for a moment */
const highlightedRef = useTimedHighlight(() => (selection.value.kind === "textEditor" ? selection.value.focus : undefined));

// The highlighted mapping is scrolled to
watch(
  highlightedRef,
  async (shapeRef) => {
    if (shapeRef) {
      await nextTick();
      root.value
        ?.querySelector(`[data-annotation="${CSS.escape(shapeRef)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },
  { immediate: true },
);

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

  return withEmptyEntry([...byRef].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)));
});

/** The native attributes of a native type */
function nativeAttributesOf(native: NativeType): string[] {
  return getNativeTypeConfig(native).attributes.map((attribute) => attribute.name);
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
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- The attributes are a record keyed by attribute name
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
        The editor's native types and the annotation shapes that implement them. A mapped shape must carry the built-in attributes
        with the built-in types.
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
      <div class="grid grid-cols-[10rem_auto_1fr] gap-x-2 gap-y-1 items-center">
        <span class="flex items-center gap-2" :class="slot.mapping ? 'font-medium' : 'text-slate-500'">
          <IconView :spec="nativeTypeIcon(slot.native)" class="text-slate-500" />
          <code class="text-sm">{{ slot.native }}</code>
        </span>
        <span class="text-slate-500">is</span>
        <Select
          :aria-label="`Annotation shape of ${slot.native}`"
          :model-value="slot.mapping?.annotation"
          :options="shapeEntries"
          option-label="label"
          option-value="value"
          :pt="EMPTY_ENTRY_PT"
          filter
          placeholder="Not mapped"
          size="small"
          :invalid="!!slot.mapping && !findShape(ctx, slot.mapping.annotation)"
          @update:model-value="setShape(slot, $event)"
        />

        <template v-if="slot.mapping">
          <template v-for="nativeAttribute in nativeAttributesOf(slot.native)" :key="nativeAttribute">
            <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- Eslint config does not recognize PrimeVue's component; the control has an aria-label -->
            <label class="pl-6 text-sm text-slate-600"
              ><code>{{ nativeAttribute }}</code></label
            >
            <span class="text-slate-500">is</span>
            <Select
              :aria-label="`Property for ${nativeAttribute}`"
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
        </template>
      </div>

      <FindingList v-if="slot.mapping" :findings="findingsOf(slot.index, slot.mapping)" with-path />
    </div>
  </section>
</template>
