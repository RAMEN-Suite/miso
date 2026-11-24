<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import { formatFinding, type ConfigFinding } from "../external";
import { useConfigDraft, type ApplyModelOptions, type PendingModel } from "../state/useConfigDraft";
import FindingList from "./FindingList.vue";
import ModelChangeList from "./ModelChangeList.vue";
import TermHint from "./TermHint.vue";

const props = defineProps<{ pending: PendingModel }>();

const emit = defineEmits<{ cancel: []; apply: [options: ApplyModelOptions] }>();

const { findings } = useConfigDraft();

const options = ref<ApplyModelOptions>({ refreshNameHints: true, pruneGoneEntries: true });

const currentKeys = computed<Set<string>>(() => new Set(findings.value.map(formatFinding)));
const pendingKeys = computed<Set<string>>(() => new Set(props.pending.findings.map(formatFinding)));

/** What the new model brings up: the findings of the config with it that it doesn't have now */
const newFindings = computed<ConfigFinding[]>(() =>
  props.pending.findings.filter((finding) => !currentKeys.value.has(formatFinding(finding))),
);

const resolvedCount = computed<number>(() => findings.value.filter((finding) => !pendingKeys.value.has(formatFinding(finding))).length);

const problemCount = computed<number>(() => props.pending.findings.filter((finding) => finding.severity === "problem").length);

const migrationCount = computed<number>(() => props.pending.changes.filter((change) => change.needsDataMigration).length);
</script>

<template>
  <Dialog
    :visible="true"
    modal
    :header="`Update the model from ${pending.fileName}`"
    :style="{ width: 'min(64rem, 95vw)' }"
    @update:visible="emit('cancel')"
  >
    <div class="grid grid-cols-2 gap-6">
      <section>
        <h3 class="font-medium mb-2">Changes ({{ pending.changes.length }})</h3>
        <p v-if="migrationCount > 0" class="text-sm text-amber-700 mb-2">
          {{ migrationCount }} change(s) rename stored names: the data in Neo4j has to be migrated.
          <TermHint term="dataMigration" />
        </p>
        <div class="max-h-[60vh] overflow-auto pr-1">
          <ModelChangeList :changes="pending.changes" />
        </div>
      </section>
      <section>
        <h3 class="font-medium mb-2">What the config needs</h3>
        <p class="text-sm text-slate-600 mb-2">
          {{ newFindings.length }} new finding(s), {{ resolvedCount }} resolved. Name hints and entries of removed elements
          can be handled on apply (below); the rest stays in the findings panel.
        </p>
        <div class="max-h-[50vh] overflow-auto pr-1">
          <FindingList :findings="newFindings" with-path />
        </div>
      </section>
    </div>

    <template #footer>
      <div class="flex flex-col items-start gap-1 mr-auto text-sm">
        <label class="flex items-center gap-2">
          <Checkbox v-model="options.refreshNameHints" binary />
          Update the name hints from the new model
        </label>
        <label class="flex items-center gap-2">
          <Checkbox v-model="options.pruneGoneEntries" binary />
          Remove entries of elements and attributes the new model doesn't have
        </label>
      </div>
      <Button label="Cancel" severity="secondary" @click="emit('cancel')" />
      <Button
        label="Apply"
        :title="problemCount > 0 ? `${problemCount} problem(s) remain after the update; export stays blocked until they are fixed` : ''"
        @click="emit('apply', options)"
      />
    </template>
  </Dialog>
</template>
