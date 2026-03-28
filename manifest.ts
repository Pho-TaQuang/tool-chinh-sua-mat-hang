import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Tools tổng hợp Sapo FnB",
  version: "2.1.0",
  description:
    "Tiện ích nội bộ cho các thao tác hàng loạt an toàn trên Sapo - by Người yêu của Lê Uyên Sapo phòng FnB 2 Hà Nội",
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
