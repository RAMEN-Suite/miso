import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";
import ConfiguratorView from "./views/ConfiguratorView.vue";
import "../styles/style.css";
import "../styles/variables.css";
import "../editors/text/src/styles/editor.css";

/**
 * Entry of the configurator, a page of its own next to the app: no router, no app stores, no backend. Served by the
 * Vite dev server only (`/configurator.html`), since it is no build input.
 */
createApp(ConfiguratorView)
  .use(PrimeVue, { theme: { preset: Aura } })
  .mount("#configurator");
