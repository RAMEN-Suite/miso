<script setup lang="ts">
import { camelCaseToTitleCase } from "../utils/helper/helper";
import { PropertyConfig } from "../models/types";
import DataInputComponent from "../components/DataInputComponent.vue";
import DataInputGroup from "../components/DataInputGroup.vue";

const properties = defineModel<any>();

const props = defineProps<{
  fields: PropertyConfig[];
  mode?: "edit" | "view";
}>();
</script>

<template>
  <form>
    <div v-for="field in fields" v-show="field.visible" :key="field.name" class="flex align-items-center gap-3 mb-3">
      <label :for="field.name" class="form-label font-semibold">{{ camelCaseToTitleCase(field.name) }} </label>
      <DataInputGroup v-if="field.type === 'array'" v-model="properties[field.name]" :config="field" :mode="props.mode" />
      <DataInputComponent v-else v-model="properties[field.name]" :config="field" :mode="props.mode" />
    </div>
  </form>
</template>

<style scoped></style>
