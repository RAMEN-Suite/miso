import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        // Change when docker network configuration changes
        target: "http://backend:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
