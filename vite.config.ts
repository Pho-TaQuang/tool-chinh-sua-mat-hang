import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import manifest from "./manifest";

export default defineConfig({
  plugins: [tsconfigPaths(), react(), crx({ manifest })],
  build: {
    target: "es2022",
    sourcemap: true
  }
});
