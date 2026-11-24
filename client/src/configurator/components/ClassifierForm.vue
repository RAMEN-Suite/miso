<script setup lang="ts">
import { computed } from "vue";
import type { Node } from "@ramen-suite/core";
import SelectButton from "primevue/selectbutton";
import {
  BASE_NODE_REF,
  CONTENT_MEDIA,
  getBaseNodeRef,
  IconView,
  type ConfigFinding,
  type ContentMedium,
  type IconSpecInput,
  type ModelContext,
} from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { attributeRowsOf, type AttributeRow } from "../utils/attributes";
import { editClassifierEntry, withKey, type ClassifierEntry } from "../utils/configUpdate";
import { classifierIconOf } from "../utils/elementIcons";
import IconSpecInputField from "./IconSpecInput.vue";
import { MEDIUM_ICONS } from "../utils/media";
import AttributeTable from "./AttributeTable.vue";
import CopyButton from "./CopyButton.vue";
import FormHeader from "./FormHeader.vue";
import FindingList from "./FindingList.vue";
import SectionHeading from "./SectionHeading.vue";
import TermHint from "./TermHint.vue";

type Medium = ContentMedium;

const props = defineProps<{ classifierRef: string }>();

const { draft, context, findings } = useConfigDraft();

/** Media without an editor yet; they can't be chosen, a config that has one still shows it */
const MEDIA_WITHOUT_EDITOR: readonly Medium[] = ["image"];

const MEDIUM_OPTIONS: { value: Medium; disabled: boolean }[] = CONTENT_MEDIA.map((value) => ({
  value,
  disabled: MEDIA_WITHOUT_EDITOR.includes(value),
}));

const ctx = computed<ModelContext>(() => context.value!);

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

/** The name of the ancestor whose icon applies without an own one */
const inheritedIconFrom = computed<string | undefined>(() => inherited((ancestor) => ancestor.appearance?.icon)?.from);

/** The icon the classifier shows, own, inherited or its base node's */
const icon = computed<IconSpecInput | undefined>(() => classifierIconOf(ctx.value, props.classifierRef));

const inheritedMedium = computed<{ value: Medium; from: string } | undefined>(() => inherited((ancestor) => ancestor.medium));

const ownFindings = computed<ConfigFinding[]>(() => findings.value.filter((finding) => finding.ref === props.classifierRef));

const flaggedAttributeRefs = computed<Set<string>>(
  () => new Set(ownFindings.value.flatMap((finding) => (finding.attributeRef ? [finding.attributeRef] : []))),
);

const attributeRows = computed<AttributeRow[]>(() => (owner.value ? attributeRowsOf(ctx.value, owner.value) : []));

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
</script>

<template>
  <div class="flex flex-col gap-6">
    <FormHeader>
      <h2 class="text-xl font-semibold flex items-center gap-2">
        <IconView v-if="icon" :spec="icon" :size="20" class="text-slate-500" />{{ name }}
      </h2>
      <p class="text-sm text-slate-500"><code class="text-xs">{{ classifierRef }}</code> <CopyButton :text="classifierRef" /></p>
    </FormHeader>

    <p v-if="!entry" class="text-sm text-slate-500">
      Not configured yet. Changing a setting creates its entry. <TermHint term="entry" />
    </p>

    <FindingList :findings="ownFindings" />

    <section class="flex flex-col gap-2">
      <SectionHeading class="font-medium gap-1.5">Icon <TermHint term="icon" /></SectionHeading>
      <IconSpecInputField :model-value="entry?.appearance?.icon" :inherited-from="inheritedIconFrom" @update:model-value="setIcon" />
    </section>

    <section v-if="isContent" class="flex flex-col gap-2">
      <SectionHeading class="font-medium gap-1.5">Medium <TermHint term="medium" /></SectionHeading>
      <div class="flex items-center gap-3">
        <SelectButton
          :model-value="entry?.medium"
          :options="MEDIUM_OPTIONS"
          option-label="value"
          option-value="value"
          option-disabled="disabled"
          size="small"
          @update:model-value="setMedium"
        >
          <template #option="{ option }">
            <span class="flex items-center gap-1.5" :title="option.disabled ? 'No editor for this medium yet' : ''">
              <i :class="MEDIUM_ICONS[option.value as Medium]" />{{ option.value }}
            </span>
          </template>
        </SelectButton>
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
      <SectionHeading class="font-medium">Attributes</SectionHeading>
      <AttributeTable :rows="attributeRows" :flagged-refs="flaggedAttributeRefs" />
    </section>
  </div>
</template>
