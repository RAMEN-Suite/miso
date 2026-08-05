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

async function goHome(): Promise<void> {
  await router.push("/");
}
</script>

<template>
  <div class="error-container flex flex-column justify-content-center align-items-center gap-4">
    <h2>404</h2>
    <div class="text">The page you requested does not exist :/</div>
    <div class="flex gap-2">
      <Button v-if="hasHistory" icon="pi pi-arrow-left" label="Go back" @click="goBack" />
      <Button icon="pi pi-home" label="Go to home" @click="goHome" />
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
