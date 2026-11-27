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
} from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { attributeRowsOf, type AttributeRow } from "../utils/attributes";
import { editClassifierEntry, setContentMedium, withKey, type ClassifierEntry } from "../utils/configUpdate";
import { classifierIconOf } from "../utils/elementIcons";
import IconSpecInputField from "./IconSpecInput.vue";
import { MEDIUM_ICONS } from "../utils/media";
import AttributeTable from "./AttributeTable.vue";
import CopyButton from "./CopyButton.vue";
import FormHeader from "./FormHeader.vue";
import FieldFindings from "./FieldFindings.vue";
import FindingList from "./FindingList.vue";
import { useTimedHighlight } from "../state/useTimedHighlight";
import { isShownAtField, type FindingField } from "../utils/findingFields";
import SectionHeading from "./SectionHeading.vue";
import TermHint from "./TermHint.vue";

type Medium = ContentMedium;

const props = defineProps<{ classifierRef: string }>();

const { draft, requiredContext: ctx, findings, selection } = useConfigDraft();

/** Media without an editor yet; they can't be chosen, a config that has one still shows it */
const MEDIA_WITHOUT_EDITOR: readonly Medium[] = ["image"];

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

const isBaseContent = computed<boolean>(() => props.classifierRef === BASE_NODE_REF.Content);

/**
 * Why a medium can't be chosen, `undefined` if it can: media without an editor; any other medium than an inherited one,
 * since a medium is forwarded down the refinement chain unchanged; and every medium on RAMEN's Content node, which has
 * none. A medium already set there stays selectable, so it can be removed.
 *
 * @param {Medium} medium - The medium.
 * @returns {string | undefined} The reason.
 */
function mediumBlockedReason(medium: Medium): string | undefined {
  if (isBaseContent.value) {
    return entry.value?.medium === medium ? undefined : "RAMEN's Content node has no medium, set it on its refinements";
  } else if (MEDIA_WITHOUT_EDITOR.includes(medium)) {
    return "No editor for this medium yet";
  } else if (inheritedMedium.value && medium !== inheritedMedium.value.value) {
    return `The medium is inherited from ${inheritedMedium.value.from}`;
  } else {
    return undefined;
  }
}

/** The media to choose from, see {@linkcode mediumBlockedReason} */
const mediumOptions = computed<{ value: Medium; disabled: boolean; reason?: string }[]>(() =>
  CONTENT_MEDIA.map((value) => {
    const reason: string | undefined = mediumBlockedReason(value);

    return { value, disabled: reason !== undefined, reason };
  }),
);

/**
 * The medium the switch shows: the own one, otherwise the inherited one. Exactly one is shown as soon as there is one,
 * since a Content refinement can't be without a medium.
 */
const shownMedium = computed<Medium | undefined>(() => entry.value?.medium ?? inheritedMedium.value?.value);

/** Only a medium on RAMEN's Content node can be unselected, since it isn't allowed there */
const canUnselectMedium = computed<boolean>(() => isBaseContent.value && entry.value?.medium !== undefined);

/** The hint next to the medium switch */
const mediumHint = computed<string>(() => {
  if (isBaseContent.value) {
    return entry.value?.medium
      ? "Not allowed here, click the selected option to remove it."
      : "RAMEN's Content node has no medium, set it on its refinements.";
  } else if (inheritedMedium.value) {
    return `Inherited from ${inheritedMedium.value.from}.`;
  } else if (entry.value?.medium) {
    return "Forwarded to the types refining it.";
  } else {
    return "Required, here or on a type it refines.";
  }
});

const ownFindings = computed<ConfigFinding[]>(() => findings.value.filter((finding) => finding.ref === props.classifierRef));

/** The controls of the form that can show findings */
const SHOWN_FIELDS: ReadonlySet<FindingField> = new Set<FindingField>(["attributes"]);

/** The findings of the list on top: the ones no control shows */
const topFindings = computed<ConfigFinding[]>(() =>
  ownFindings.value.filter((finding) => !isShownAtField(finding, SHOWN_FIELDS)),
);

/** The finding selected in the findings panel, highlighted for a moment */
const highlightedFinding = useTimedHighlight(() => (selection.value.kind === "classifier" ? selection.value.focus : undefined));

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

/**
 * Sets the classifier's own medium; the types refining it lose theirs and inherit it (see `setContentMedium`). `null`
 * (unselected) only comes from RAMEN's Content node, see {@linkcode canUnselectMedium}.
 *
 * @param {Medium | null | undefined} medium - The chosen medium.
 */
function setMedium(medium: Medium | null | undefined): void {
  if (draft.value) {
    setContentMedium(draft.value, ctx.value.model, props.classifierRef, name.value, medium ?? undefined);
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <FormHeader>
      <h2 class="text-xl font-semibold flex items-center gap-2">
        <IconView v-if="icon" :spec="icon" :size="20" class="text-slate-500" />{{ name }}
      </h2>
      <p class="text-sm text-slate-500">
        <code class="text-xs">{{ classifierRef }}</code> <CopyButton :text="classifierRef" />
      </p>
    </FormHeader>

    <p v-if="!entry" class="text-sm text-slate-500">
      Not configured yet. Changing a setting creates its entry. <TermHint term="entry" />
    </p>

    <FindingList :findings="topFindings" :highlighted="highlightedFinding" />

    <section class="flex flex-col gap-2">
      <SectionHeading class="font-medium gap-1.5">Icon <TermHint term="icon" /></SectionHeading>
      <IconSpecInputField
        :model-value="entry?.appearance?.icon"
        :inherited-from="inheritedIconFrom"
        @update:model-value="setIcon"
      />
    </section>

    <section v-if="isContent" class="flex flex-col gap-2">
      <SectionHeading class="font-medium gap-1.5">Medium <TermHint term="medium" /></SectionHeading>
      <div class="flex items-center gap-3">
        <SelectButton
          :model-value="shownMedium"
          :allow-empty="canUnselectMedium"
          :options="mediumOptions"
          option-label="value"
          option-value="value"
          option-disabled="disabled"
          size="small"
          @update:model-value="setMedium"
        >
          <template #option="{ option }">
            <span class="flex items-center gap-1.5" :title="option.reason ?? ''">
              <i :class="MEDIUM_ICONS[option.value as Medium]" />{{ option.value }}
            </span>
          </template>
        </SelectButton>
        <small class="text-slate-500">{{ mediumHint }}</small>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <SectionHeading class="font-medium">Attributes</SectionHeading>
      <AttributeTable :rows="attributeRows" :flagged-refs="flaggedAttributeRefs" />
      <FieldFindings :findings="ownFindings" :highlighted="highlightedFinding" field="attributes" />
    </section>
  </div>
</template>
