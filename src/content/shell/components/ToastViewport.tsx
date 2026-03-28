import React from "react";
import { AlertCircle, Check, X } from "../../ui/icons";
import type { ShellToastConfig } from "../types";

interface ToastViewportProps {
  toasts: readonly ShellToastConfig[];
}

export function ToastViewport({ toasts }: ToastViewportProps): React.JSX.Element {
  return (
    <div className="spx-shell-toast-container">
      {toasts.map((toast) => {
        let Icon = AlertCircle;
        if (toast.type === "success") {
          Icon = Check;
        }
        if (toast.type === "error") {
          Icon = X;
        }

        return (
          <div
            key={toast.id}
            className={`spx-shell-toast spx-shell-toast-${toast.type} ${toast.fading ? "spx-shell-toast-fade" : ""}`}
          >
            <Icon />
            <div className="spx-shell-toast-message">{toast.message}</div>
          </div>
        );
      })}
    </div>
  );
}
