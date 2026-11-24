<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import Select from "primevue/select";
import {
  BUILTIN_STRUCTURAL_CONFIGS,
  findShape,
  getContentCarrierRefs,
  getShapesForNode,
  shapeRefOf,
  type ConfigFinding,
  type ConfigMapping,
  type ModelContext,
} from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import FindingList from "./FindingList.vue";

type NativeType = ConfigMapping["native"];

const { draft, context, findings } = useConfigDraft();

const ctx = computed<ModelContext>(() => context.value as ModelContext);

const NATIVE_TYPES: NativeType[] = BUILTIN_STRUCTURAL_CONFIGS.map((config) => config.type as NativeType);

const mappings = computed<ConfigMapping[]>(() => draft.value?.editors.text.mappings ?? []);

/** The annotation shapes on Content nodes, the candidates of a mapping */
const textShapes = computed<{ ref: string; type: string }[]>(() => {
  const byRef = new Map<string, string>();

  for (const shape of getContentCarrierRefs(ctx.value).flatMap((ref) => getShapesForNode(ctx.value, ref))) {
    byRef.set(shapeRefOf(shape), shape.type);
  }

  return [...byRef].map(([ref, type]) => ({ ref, type })).sort((a, b) => a.type.localeCompare(b.type));
});

/** The built-in attributes of a native type */
function nativeAttributesOf(native: NativeType): string[] {
  return BUILTIN_STRUCTURAL_CONFIGS.find((config) => config.type === native)?.attributes.map((attribute) => attribute.name) ?? [];
}

/** The properties of a mapping's shape */
function propertiesOf(mapping: ConfigMapping): { attributeRef: string; name: string }[] {
  const shape = findShape(ctx.value, mapping.annotation);

  return shape?.properties.map((property) => ({ attributeRef: `${shape.modelId}:${property.id}`, name: property.name })) ?? [];
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

function setNative(index: number, native: NativeType): void {
  update(index, (mapping) => {
    mapping.native = native;
    // Attributes of another native type don't apply
    mapping.attributes = undefined;
  });
}

function setShape(index: number, ref: string): void {
  update(index, (mapping) => {
    mapping.annotation = ref;
    mapping.type = findShape(ctx.value, ref)?.type ?? "";
    mapping.attributes = undefined;
  });
}

/**
 * Maps a built-in attribute to a property of the shape. Without one, the property with the built-in's name is used.
 *
 * @param {number} index - The index of the mapping.
 * @param {string} nativeAttribute - The built-in attribute.
 * @param {string | undefined} attributeRef - The property's attribute ref, `undefined` for the one with the same name.
 */
function setAttribute(index: number, nativeAttribute: string, attributeRef: string | undefined): void {
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

function addMapping(): void {
  const used = new Set<string>(mappings.value.map((mapping) => mapping.native));
  const native: NativeType = NATIVE_TYPES.find((type) => !used.has(type)) ?? NATIVE_TYPES[0];

  draft.value?.editors.text.mappings.push({ native, annotation: "", type: "" });
}

function removeMapping(index: number): void {
  draft.value?.editors.text.mappings.splice(index, 1);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header>
      <h2 class="text-xl font-semibold">Native mappings</h2>
      <p class="text-sm text-slate-500">
        The editor's native types and the annotation shapes that implement them. A mapped shape must carry the built-in
        attributes with the built-in types.
      </p>
    </header>

    <div v-for="(mapping, index) in mappings" :key="index" class="rounded border border-slate-200 p-3 flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <Select
          :model-value="mapping.native"
          :options="NATIVE_TYPES"
          size="small"
          class="w-40"
          @update:model-value="setNative(index, $event)"
        />
        <span class="text-slate-500">is</span>
        <Select
          :model-value="mapping.annotation"
          :options="textShapes"
          option-label="type"
          option-value="ref"
          filter
          placeholder="Annotation shape"
          size="small"
          class="flex-1"
          :invalid="!findShape(ctx, mapping.annotation)"
          @update:model-value="setShape(index, $event)"
        />
        <Button icon="icon-trash-2" severity="danger" text size="small" title="Remove the mapping" @click="removeMapping(index)" />
      </div>

      <div v-if="nativeAttributesOf(mapping.native).length > 0" class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 items-center pl-2">
        <template v-for="nativeAttribute in nativeAttributesOf(mapping.native)" :key="nativeAttribute">
          <label class="text-sm text-slate-600">{{ nativeAttribute }}</label>
          <Select
            :model-value="mapping.attributes?.[nativeAttribute]"
            :options="propertiesOf(mapping)"
            option-label="name"
            option-value="attributeRef"
            show-clear
            :placeholder="`Property named ${nativeAttribute}`"
            size="small"
            @update:model-value="setAttribute(index, nativeAttribute, $event)"
          />
        </template>
      </div>

      <FindingList :findings="findingsOf(index, mapping)" with-path />
    </div>

    <Button label="Add mapping" icon="icon-plus" size="small" severity="secondary" class="self-start" @click="addMapping" />
  </div>
</template>
