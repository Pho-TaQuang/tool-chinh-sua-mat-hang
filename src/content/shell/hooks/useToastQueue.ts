import { useCallback, useEffect, useRef, useState } from "react";
import { createRequestId } from "@shared/utils/request-id";
import type { ShellToastConfig, ShellToastType } from "../types";

const TOAST_FADE_DELAY_MS = 4700;
const TOAST_REMOVE_DELAY_MS = 5000;

export function useToastQueue(): {
  toasts: ShellToastConfig[];
  showToast: (message: string, type: ShellToastType) => void;
} {
  const [toasts, setToasts] = useState<ShellToastConfig[]>([]);
  const timerIdsRef = useRef<Map<string, number[]>>(new Map());

  const showToast = useCallback((message: string, type: ShellToastType) => {
    const id = createRequestId("toast");
    setToasts((current) => [...current, { id, message, type }]);

    const fadeTimerId = window.setTimeout(() => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, fading: true } : toast))
      );
    }, TOAST_FADE_DELAY_MS);

    const removeTimerId = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timerIdsRef.current.delete(id);
    }, TOAST_REMOVE_DELAY_MS);

    timerIdsRef.current.set(id, [fadeTimerId, removeTimerId]);
  }, []);

  useEffect(() => {
    return () => {
      for (const timerIds of timerIdsRef.current.values()) {
        for (const timerId of timerIds) {
          window.clearTimeout(timerId);
        }
      }

      timerIdsRef.current.clear();
    };
  }, []);

  return {
    toasts,
    showToast
  };
}
