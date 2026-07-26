import { createApp } from "vue";
import ConfirmationService from "primevue/confirmationservice";
import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";
import Tooltip from "primevue/tooltip";
import DialogService from "primevue/dialogservice";
import ToastService from "primevue/toastservice";
import App from "./App.vue";
import router from "./router.ts";
import { contenteditable } from "./directives/contenteditable";
import "../src/styles/style.css";
import "../src/styles/tiptap.css";
import "../src/styles/variables.css";
import "primeicons/primeicons.css";
import "/node_modules/primeflex/primeflex.css";

const app = createApp(App);

app
  .use(router)
  .use(PrimeVue, {
    theme: {
      preset: Aura,
    },
  })
  .use(DialogService)
  .use(ConfirmationService)
  .use(ToastService);

app.directive("tooltip", Tooltip);
app.directive("contenteditable", contenteditable);

app.mount("#app");
