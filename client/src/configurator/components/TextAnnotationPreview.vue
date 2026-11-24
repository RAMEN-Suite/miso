<script setup lang="ts">
import { computed, ref, type ComponentPublicInstance } from "vue";
import InputText from "primevue/inputtext";
import {
  getHighlightStyle,
  renderMarker,
  toEditorAppearance,
  type AnnotationAppearance,
  type ModelAnnotationShape,
} from "../external";

/** A line of the preview: the annotation with some property values */
interface PreviewRow {
  label: string;
  properties: Record<string, unknown>;
}

const props = defineProps<{
  shape: ModelAnnotationShape;
  /** The appearance as configured (attribute refs) */
  appearance: AnnotationAppearance | undefined;
  extent: "range" | "zeroPoint";
  /** Structure annotations have no preview */
  representation: "inline" | "blockClassification";
}>();

const annotatedText = ref<string>("dolor sit");
const sampleFormula = ref<string>("\\frac{a}{b}");

/** The appearance as the editor reads it (property names) */
const editorAppearance = computed<AnnotationAppearance | undefined>(() =>
  props.appearance ? toEditorAppearance(props.shape, props.appearance) : undefined,
);

/** The property a math marker reads its notation from, by name */
const mathProperties = computed<string[]>(() => {
  const appearance: AnnotationAppearance | undefined = editorAppearance.value;
  const markers = [
    appearance?.marker,
    ...(appearance?.variants ?? []).flatMap((v) => Object.values(v.values).map((o) => o.marker)),
  ];

  return [...new Set(markers.flatMap((marker) => (marker?.kind === "math" ? [marker.property] : [])))];
});

/** The type's own appearance, then one line per configured variant value */
const rows = computed<PreviewRow[]>(() => {
  const base: Record<string, unknown> = Object.fromEntries(mathProperties.value.map((name) => [name, sampleFormula.value]));
  const variantRows: PreviewRow[] = (editorAppearance.value?.variants ?? []).flatMap((variant) =>
    Object.keys(variant.values).map((value) => ({
      label: `${variant.property} = ${value}`,
      properties: { ...base, [variant.property]: value },
    })),
  );

  return [{ label: "Without matching variant", properties: base }, ...variantRows];
});

/**
 * Renders the marker of a line into its element; called on every render, since the marker is plain DOM.
 *
 * @param {Element | ComponentPublicInstance | null} element - The marker element.
 * @param {Record<string, unknown>} properties - The annotation's properties.
 */
function mountMarker(element: Element | ComponentPublicInstance | null, properties: Record<string, unknown>): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.replaceChildren();
  element.removeAttribute("style");
  renderMarker(element, editorAppearance.value, properties);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p v-if="representation === 'blockClassification'" class="text-sm text-slate-500">
      Block classifications are shown as tags and lines next to their blocks, not with highlights or markers.
    </p>
    <template v-else>
      <div class="flex gap-2">
        <InputText v-if="extent === 'range'" v-model="annotatedText" size="small" class="flex-1" placeholder="Annotated text" />
        <InputText
          v-if="mathProperties.length > 0"
          v-model="sampleFormula"
          size="small"
          class="flex-1 font-mono"
          placeholder="Sample LaTeX"
        />
      </div>
      <div class="tiptap-editor-pane rounded border border-slate-200 px-4 py-1">
        <div v-for="row in rows" :key="row.label" class="flex items-baseline gap-4">
          <p class="flex-1">
            Lorem ipsum
            <template v-if="extent === 'range'">
              <span :style="getHighlightStyle(editorAppearance, row.properties)">{{ annotatedText }}</span> amet, consectetur.
            </template>
            <template v-else>
              <span :ref="(element) => mountMarker(element, row.properties)" /> dolor sit amet, consectetur.
            </template>
          </p>
          <small class="w-48 shrink-0 text-slate-500 truncate" :title="row.label">{{ row.label }}</small>
        </div>
      </div>
    </template>
  </div>
</template>
