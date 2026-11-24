<script setup lang="ts">
import { computed } from "vue";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import TabPanel from "primevue/tabpanel";
import TabPanels from "primevue/tabpanels";
import Tabs from "primevue/tabs";
import type { ConfigFinding, ModelContext } from "../external";
import { useConfigDraft } from "../state/useConfigDraft";
import { elementKindOf } from "../utils/elementTree";
import type { ElementChange } from "../utils/modelDiff";
import FindingList from "./FindingList.vue";
import ModelChangeList from "./ModelChangeList.vue";
import TermHint from "./TermHint.vue";

const { context, findings, lastUpdate, selection } = useConfigDraft();

/** Problems first, then warnings, each in check order */
const sortedFindings = computed<ConfigFinding[]>(() => [
  ...findings.value.filter((finding) => finding.severity === "problem"),
  ...findings.value.filter((finding) => finding.severity === "warning"),
]);

/**
 * Selects the element a finding concerns: the text editor for mapping findings, otherwise the element of its ref (if
 * the model still has it).
 *
 * @param {ConfigFinding} finding - The finding.
 */
function selectFinding(finding: ConfigFinding): void {
  if (finding.path.startsWith("editors.text.mappings") || finding.path.startsWith("Annotation shape")) {
    selection.value = { kind: "textEditor" };
  } else if (finding.ref) {
    selectRef(finding.ref);
  }
}

function selectRef(ref: string): void {
  const kind = elementKindOf(context.value!, ref);

  if (kind) {
    selection.value = { kind, ref };
  }
}

function selectChange(change: ElementChange): void {
  selectRef(change.ref);
}
</script>

<template>
  <Tabs value="findings" class="h-full">
    <TabList>
      <Tab value="findings">Findings ({{ findings.length }})</Tab>
      <Tab value="changes" :disabled="!lastUpdate">Model changes</Tab>
    </TabList>
    <TabPanels class="p-2!">
      <TabPanel value="findings">
        <p class="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
          Problems block the export, warnings don't. <TermHint term="findings" />
        </p>
        <p v-if="sortedFindings.length === 0" class="text-sm text-slate-500">No problems or warnings.</p>
        <FindingList :findings="sortedFindings" with-path selectable @select="selectFinding" />
      </TabPanel>
      <TabPanel value="changes">
        <template v-if="lastUpdate">
          <p class="text-sm text-slate-500 mb-2">From {{ lastUpdate.fileName }}</p>
          <ModelChangeList :changes="lastUpdate.changes" selectable @select="selectChange" />
        </template>
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>
