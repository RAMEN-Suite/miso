<script setup lang="ts">
import { ref, onMounted } from "vue";
import Button from "primevue/button";
import { useRouter } from "vue-router";

const router = useRouter();
const hasHistory = ref<boolean>(false);

onMounted(() => {
  hasHistory.value = window.history.state.back;
});

function goBack() {
  router.back();
}

// Must be outside of vue router for now
function goHome() {
  window.location.href = "/";
}
</script>

<template>
  <div class="error-container flex flex-col justify-center items-center gap-6">
    <div class="text">The provided path does not exist in the database :/</div>
    <div class="flex gap-2">
      <Button v-if="hasHistory" icon="icon-arrow-left" label="Go back" @click="goBack" />
      <Button icon="icon-home" label="Go to home" @click="goHome" />
    </div>
  </div>
</template>

<style scoped>
.error-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
