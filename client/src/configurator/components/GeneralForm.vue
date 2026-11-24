<script setup lang="ts">
import { computed } from "vue";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import { useConfigDraft } from "../state/useConfigDraft";
import { withKey } from "../utils/configUpdate";

const { draft } = useConfigDraft();

const counts = computed<{ label: string; value: number }[]>(() => {
  const config = draft.value;

  if (!config) {
    return [];
  }

  return [
    { label: "Node classifiers in the model", value: config.model.classifiers.filter((c) => c.kind === "Node").length },
    { label: "Annotation shapes in the model", value: config.model.annotations.length },
    { label: "Classifier entries", value: Object.keys(config.elements.classifiers).length },
    { label: "Annotation entries", value: Object.keys(config.elements.annotations).length },
    { label: "Native mappings", value: config.editors.text.mappings.length },
  ];
});

function setId(id: string | undefined): void {
  if (draft.value) {
    draft.value.id = id ?? "";
  }
}

function setDescription(description: string | undefined): void {
  if (draft.value) {
    draft.value.meta = withKey(draft.value.meta, "description", description);
  }
}
</script>

<template>
  <div v-if="draft" class="flex flex-col gap-6">
    <header>
      <h2 class="text-xl font-semibold">General</h2>
      <p class="text-sm text-slate-500"><code class="text-xs">{{ draft.$schema }}</code></p>
    </header>

    <section class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 items-start">
      <label class="text-sm text-slate-600 pt-1">ID</label>
      <InputText :model-value="draft.id" size="small" :invalid="draft.id === ''" @update:model-value="setId" />

      <label class="text-sm text-slate-600 pt-1">Description</label>
      <Textarea :model-value="draft.meta?.description ?? ''" rows="3" placeholder="What this configuration is for" @update:model-value="setDescription" />
    </section>

    <section>
      <h3 class="font-medium mb-2">Contents</h3>
      <dl class="grid grid-cols-[16rem_auto] gap-y-1 text-sm">
        <template v-for="count in counts" :key="count.label">
          <dt class="text-slate-600">{{ count.label }}</dt>
          <dd>{{ count.value }}</dd>
        </template>
      </dl>
    </section>

    <p class="text-sm text-slate-500">
      Templates and special characters are exported as they are; the configurator doesn't edit them.
    </p>
  </div>
</template>
