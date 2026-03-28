import { createRoot } from "react-dom/client";
import { AppShell } from "./AppShell";

export function mountContentShell(): void {
  if (document.getElementById("sapo-batch-panel-root")) {
    return;
  }

  const rootElement = document.createElement("div");
  rootElement.id = "sapo-batch-panel-root";
  document.body.appendChild(rootElement);
  createRoot(rootElement).render(<AppShell />);
}
