<script setup lang="ts">
import { computed } from "vue";
import type { Node } from "@ramen-suite/core";
import SelectButton from "primevue/selectbutton";
import { BASE_NODE_REF, getBaseNodeRef, type ConfigFinding, type IconSpecInput, type ModelContext } from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { attributeRowsOf, setAttributeFlag, type AttributeRow } from "../utils/attributes";
import { editClassifierEntry, withKey, type ClassifierEntry } from "../utils/configUpdate";
import IconSpecInputField from "./IconSpecInput.vue";
import AttributeTable from "./AttributeTable.vue";
import FindingList from "./FindingList.vue";

type Medium = NonNullable<ClassifierEntry["medium"]>;

const props = defineProps<{ classifierRef: string }>();

const { draft, context, findings } = useConfigDraft();

const MEDIUM_OPTIONS: Medium[] = ["text", "image"];

const ctx = computed<ModelContext>(() => context.value as ModelContext);

/** The classifier as an attribute owner; RAMEN base nodes may not be listed in the file, the model has them */
const owner = computed<(Node & { modelId: string }) | undefined>(() => {
  const listed = ctx.value.config.model.classifiers.find(
    (classifier): classifier is Node & { modelId: string } =>
      classifier.kind === "Node" && `${classifier.modelId}:${classifier.id}` === props.classifierRef,
  );
  const node: Node | undefined = listed ?? ctx.value.model.getNode(props.classifierRef);

  return node ? { ...node, modelId: props.classifierRef.split(":")[0] } : undefined;
});

const name = computed<string>(() => owner.value?.name ?? props.classifierRef);

/** Refs and names of the lineage, base first */
const lineage = computed<{ ref: string; name: string }[]>(() =>
  ctx.value.model.getNodeLineage(props.classifierRef).map((item) => ({ ref: `${item.modelId}:${item.nodeId}`, name: item.name })),
);

const entry = computed<ClassifierEntry | undefined>(() => draft.value?.elements.classifiers[props.classifierRef]);

const isContent = computed<boolean>(() => getBaseNodeRef(ctx.value, props.classifierRef) === BASE_NODE_REF.Content);

/**
 * The nearest value of a setting along the lineage, without the classifier itself.
 *
 * @param {(entry: ClassifierEntry) => T | undefined} read - Reads the setting from an entry.
 * @returns {{ value: T; from: string } | undefined} The value and the name of the classifier it is set on.
 */
function inherited<T>(read: (entry: ClassifierEntry) => T | undefined): { value: T; from: string } | undefined {
  for (const item of lineage.value.slice(0, -1).toReversed()) {
    const ancestorEntry: ClassifierEntry | undefined = draft.value?.elements.classifiers[item.ref];
    const value: T | undefined = ancestorEntry ? read(ancestorEntry) : undefined;

    if (value !== undefined) {
      return { value, from: item.name };
    }
  }

  return undefined;
}

const inheritedIcon = computed<{ icon: IconSpecInput; from: string } | undefined>(() => {
  const found = inherited((ancestor) => ancestor.appearance?.icon);

  return found ? { icon: found.value, from: found.from } : undefined;
});

const inheritedMedium = computed<{ value: Medium; from: string } | undefined>(() => inherited((ancestor) => ancestor.medium));

const ownFindings = computed<ConfigFinding[]>(() => findings.value.filter((finding) => finding.ref === props.classifierRef));

const flaggedAttributeRefs = computed<Set<string>>(
  () => new Set(ownFindings.value.flatMap((finding) => (finding.attributeRef ? [finding.attributeRef] : []))),
);

const attributeRows = computed<AttributeRow[]>(() => (owner.value ? attributeRowsOf(ctx.value, owner.value, entry.value) : []));

function edit(change: (target: ClassifierEntry) => void): void {
  if (draft.value) {
    editClassifierEntry(draft.value, props.classifierRef, name.value, change);
  }
}

function setIcon(icon: IconSpecInput | undefined): void {
  edit((target) => {
    target.appearance = withKey(target.appearance, "icon", icon);
  });
}

function setMedium(medium: Medium | null | undefined): void {
  edit((target) => {
    target.medium = medium ?? undefined;
  });
}

function setAttribute(row: AttributeRow, key: "visible" | "editable", value: boolean | undefined): void {
  edit((target) => setAttributeFlag(target, row, key, value));
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h2 class="text-xl font-semibold">{{ name }}</h2>
      <p class="text-sm text-slate-500">
        {{ lineage.map((item) => item.name).join(" > ") }} · <code class="text-xs">{{ classifierRef }}</code>
      </p>
      <p v-if="!entry" class="text-sm text-slate-500 mt-1">Not configured yet. Changing a setting creates its entry.</p>
    </header>

    <FindingList :findings="ownFindings" />

    <section class="flex flex-col gap-2">
      <h3 class="font-medium">Icon</h3>
      <IconSpecInputField :model-value="entry?.appearance?.icon" :inherited="inheritedIcon" @update:model-value="setIcon" />
    </section>

    <section v-if="isContent" class="flex flex-col gap-2">
      <h3 class="font-medium">Medium</h3>
      <div class="flex items-center gap-3">
        <SelectButton :model-value="entry?.medium" :options="MEDIUM_OPTIONS" size="small" @update:model-value="setMedium" />
        <small class="text-slate-500">
          {{
            entry?.medium
              ? "Click the selected option to inherit again."
              : inheritedMedium
                ? `Inherited from ${inheritedMedium.from}: ${inheritedMedium.value}`
                : "Default: text"
          }}
        </small>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <h3 class="font-medium">Attributes</h3>
      <AttributeTable :rows="attributeRows" :flagged-refs="flaggedAttributeRefs" @set="setAttribute" />
      <small class="text-slate-500">Inherited attributes are configured on the classifier that declares them.</small>
    </section>
  </div>
</template>
