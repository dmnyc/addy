import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { execSync } from "child_process";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify("1.0.0"),
    __BUILD_HASH__: JSON.stringify(commitHash),
  },
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
