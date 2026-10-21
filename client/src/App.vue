<script setup lang="ts">
import { computed, onMounted, type Component } from "vue";
import { RouteLocationNormalized, useRoute } from "vue-router";
import { useAppStore } from "./store/app";
import { resolveLayout } from "./config/layouts";
import DatabaseConnectionError from "./utils/errors/databaseConnection.error";
import GuidelinesValidationError from "./utils/errors/guidelinesValidation.error";
import LoadingSpinner from "./components/LoadingSpinner.vue";
import DynamicDialog from "primevue/dynamicdialog";
import Toast from "primevue/toast";
import { ToastServiceMethods, useToast } from "primevue";

const { error: appError, isFetching: isAppFetching, initializeApp, registerToast } = useAppStore();
const toast: ToastServiceMethods = useToast();
const route: RouteLocationNormalized = useRoute();

const layoutComponent = computed<Component>(() => resolveLayout(route.meta.layout));

onMounted(async () => {
  registerToast(toast);

  await initializeApp();
});
</script>

<template>
  <LoadingSpinner v-if="isAppFetching" />
  <component :is="layoutComponent" v-else-if="!appError">
    <RouterView />
  </component>
  <template v-else>
    <div v-if="appError instanceof DatabaseConnectionError">
      The connection to the database could not be established. Reload the page please.
    </div>
    <div v-else-if="appError instanceof GuidelinesValidationError">
      The configuration is not in the right format. See the browser console for details.
    </div>
    <div v-else>Error fetching app configurations. Reload the page please.</div>
  </template>
  <DynamicDialog />
  <Toast />
</template>

<style scoped></style>
