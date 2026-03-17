import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Sapo Batch Tool",
  version: "0.1.0",
  description: "Internal extension for safe Sapo batch operations.",
  permissions: ["storage", "alarms"],
  host_permissions: ["https://fnb.mysapo.vn/*"],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["https://fnb.mysapo.vn/admin/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle"
    }
  ]
});
