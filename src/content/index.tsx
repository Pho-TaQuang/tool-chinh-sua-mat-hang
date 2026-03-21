import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { RuntimeResponse } from "@shared/types/runtime.types";
import { createRequestId } from "@shared/utils/request-id";
import type { SiteAuthContext } from "./site.api.client";
import { SiteApiClient } from "./site.api.client";
import { ModifySetTab } from "./modify-set.tab";
import { TaxTab } from "./tax.tab";
import { Check, X, AlertCircle } from "./icons";
import "./styles.css";

const LOG_SCOPE = "[SapoBatch][content]";

interface RuntimeEnvelope<T = unknown> {
  type: "INIT_CONTEXT" | "RUN_SMOKE_TEST" | "QUEUE_ENQUEUE" | "QUEUE_CANCEL" | "DEBUG_LOG";
  requestId: string;
  timestamp: number;
  payload: T;
}

type ToolTab = "tax" | "modify_set";

export interface ToastConfig {
  id: string;
  message: string;
  type: "success" | "warn" | "error" | "info";
  fading?: boolean;
}

function App(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const [activeTab, setActiveTab] = useState<ToolTab>("tax");
  const [apiClient, setApiClient] = useState<SiteApiClient | null>(null);
  const [toasts, setToasts] = useState<ToastConfig[]>([]);

  const showToast = (message: string, type: "success" | "warn" | "error" | "info" = "info") => {
    const id = createRequestId("toast");
    setToasts((prev) => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, fading: true } : t)));
    }, 4700);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const authRef = useRef<SiteAuthContext>({
    csrfToken: null,
    fnbToken: null,
    merchantId: null,
    storeId: null,
    shopOrigin: window.location.origin
  });

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      const extracted = extractAuthContext();
      authRef.current = extracted;
      setStatusText("Initializing...");

      logContent("info", "Extracted auth context.", {
        hasFnbToken: Boolean(extracted.fnbToken),
        merchantId: extracted.merchantId,
        storeId: extracted.storeId,
        hasCsrf: Boolean(extracted.csrfToken)
      });

      await logToService("info", "Extracted auth context.", {
        hasFnbToken: Boolean(extracted.fnbToken),
        merchantId: extracted.merchantId,
        storeId: extracted.storeId,
        hasCsrf: Boolean(extracted.csrfToken)
      });

      await sendMessage({
        type: "INIT_CONTEXT",
        requestId: createRequestId("init"),
        timestamp: Date.now(),
        payload: extracted
      });

      if (!mounted) {
        return;
      }
      setApiClient(new SiteApiClient(() => authRef.current));
      setStatusText("Ready.");
    };

    void setup();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      {!isOpen ? (
        <button className="spx-float-launcher" onClick={() => setIsOpen(true)} aria-label="Open Sapo Batch Tool">
          S
        </button>
      ) : null}

      {isOpen ? (
        <div className="spx-dashboard-overlay">
          <div className="spx-dashboard-backdrop" onClick={() => setIsOpen(false)} />
          <div className="spx-dashboard-container" role="dialog" aria-modal="true" aria-label="Sapo Batch Popup">
            <div className="spx-header">
              <div className="spx-header-left">
                <div className="spx-brand">
                  <div className="spx-logo">S</div>
                  <h2 className="spx-title">Sapo Batch Tool</h2>
                </div>
                <p className="spx-header-subtitle">{statusText}</p>
              </div>
              <div className="spx-header-actions">
                <button className="spx-icon-btn spx-danger" onClick={() => setIsOpen(false)} aria-label="Close popup">
                  X
                </button>
              </div>
            </div>

            <div className="spx-main">
              <div className="spx-card spx-tab-switcher">
                <button
                  className={`spx-tab-btn ${activeTab === "tax" ? "spx-tab-active" : ""}`}
                  onClick={() => setActiveTab("tax")}
                >
                  Batch Tax
                </button>
                <button
                  className={`spx-tab-btn ${activeTab === "modify_set" ? "spx-tab-active" : ""}`}
                  onClick={() => setActiveTab("modify_set")}
                >
                  Modify Set
                </button>
              </div>

              {activeTab === "tax" ? (
                <TaxTab
                  apiClient={apiClient}
                  onStatusText={setStatusText}
                  onShowToast={showToast}
                  onDebugLog={logToService}
                />
              ) : (
                <ModifySetTab
                  apiClient={apiClient}
                  onStatusText={setStatusText}
                  onShowToast={showToast}
                  onDebugLog={logToService}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="spx-toast-container">
        {toasts.map((toast) => {
          let Icon = AlertCircle;
          if (toast.type === "success") Icon = Check;
          if (toast.type === "error") Icon = X;

          return (
            <div key={toast.id} className={`spx-toast spx-toast-${toast.type} ${toast.fading ? "spx-toast-fade" : ""}`}>
              <Icon />
              <div className="spx-toast-message">{toast.message}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function extractAuthContext(): SiteAuthContext {
  const csrfToken = normalizeHeaderValue(readMeta("csrf-token"));
  const tokenCandidate =
    readMeta("x-fnb-token") ??
    readCookie("x-fnb-token") ??
    readFromStorage([
      "x-fnb-token",
      "x_fnb_token",
      "fnb_token",
      "fnbToken",
      "access_token",
      "auth_token",
      "token"
    ]) ??
    readJwtLikeFromStorage();
  const fnbToken = normalizeHeaderValue(tokenCandidate);

  const parsedIds = parseIdsFromToken(fnbToken);
  const merchantId =
    normalizeId(readMeta("x-merchant-id")) ??
    normalizeId(readCookie("x-merchant-id")) ??
    normalizeId(readFromStorage(["x-merchant-id", "merchant_id", "merchantId"])) ??
    parsedIds.merchantId;
  const storeId =
    normalizeId(readMeta("x-store-id")) ??
    normalizeId(readCookie("x-store-id")) ??
    normalizeId(readFromStorage(["x-store-id", "store_id", "storeId"])) ??
    parsedIds.storeId;

  return {
    csrfToken,
    fnbToken,
    merchantId,
    storeId,
    shopOrigin: window.location.origin
  };
}

function parseIdsFromToken(token: string | null): { merchantId: string | null; storeId: string | null } {
  if (!token) return { merchantId: null, storeId: null };
  const parts = token.split(".");
  if (parts.length < 2) return { merchantId: null, storeId: null };
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1] || "")) as { sub?: string; jti?: string | number };
    return {
      merchantId: normalizeId(payload.sub?.split(":")?.[0] ?? null),
      storeId: normalizeId(payload.jti ? String(payload.jti) : null)
    };
  } catch {
    return { merchantId: null, storeId: null };
  }
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return atob(base64);
}

function normalizeHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutBearer = trimmed.replace(/^Bearer\s+/i, "");
  const withoutQuotes =
    (withoutBearer.startsWith("\"") && withoutBearer.endsWith("\"")) ||
    (withoutBearer.startsWith("'") && withoutBearer.endsWith("'"))
      ? withoutBearer.slice(1, -1)
      : withoutBearer;
  return withoutQuotes.trim() || null;
}

function normalizeId(value: string | null): string | null {
  if (!value) return null;
  const sanitized = normalizeHeaderValue(value);
  if (!sanitized) return null;
  const digitsOnly = sanitized.replace(/[^\d]/g, "");
  return digitsOnly || sanitized;
}

function readMeta(name: string): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
}

function readCookie(name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function readFromStorage(candidateKeys: string[]): string | null {
  const keySet = new Set(candidateKeys.map((key) => key.toLowerCase()));
  for (const storage of listStorages()) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !keySet.has(key.toLowerCase())) continue;
      const value = storage.getItem(key);
      if (value) return value;
    }
  }
  return null;
}

function readJwtLikeFromStorage(): string | null {
  const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  for (const storage of listStorages()) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.toLowerCase().includes("token")) continue;
      const value = storage.getItem(key);
      if (value && jwtPattern.test(value)) return value;
    }
  }
  return null;
}

function listStorages(): Storage[] {
  const storages: Storage[] = [];
  try {
    storages.push(window.localStorage);
  } catch {
    // ignore
  }
  try {
    storages.push(window.sessionStorage);
  } catch {
    // ignore
  }
  return storages;
}

function logContent(level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): void {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (details !== undefined) {
    logger(LOG_SCOPE, message, details);
    return;
  }
  logger(LOG_SCOPE, message);
}

async function logToService(level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): Promise<void> {
  try {
    await sendMessage({
      type: "DEBUG_LOG",
      requestId: createRequestId("debug"),
      timestamp: Date.now(),
      payload: { level, message, details }
    });
  } catch (error) {
    logContent("warn", "Failed to send DEBUG_LOG message.", error);
  }
}

async function sendMessage<T>(message: RuntimeEnvelope): Promise<RuntimeResponse<T>> {
  return new Promise<RuntimeResponse<T>>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function mountPanel(): void {
  if (document.getElementById("sapo-batch-panel-root")) return;
  const rootElement = document.createElement("div");
  rootElement.id = "sapo-batch-panel-root";
  document.body.appendChild(rootElement);
  createRoot(rootElement).render(<App />);
}

mountPanel();
