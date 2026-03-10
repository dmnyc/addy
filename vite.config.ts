import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    exclude: ["@breeztech/breez-sdk-spark"],
  },
  build: {
    target: "esnext",
  },
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.wasm"],
});
