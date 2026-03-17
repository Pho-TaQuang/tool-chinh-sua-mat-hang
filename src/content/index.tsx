import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Item } from "@shared/types/sapo.types";
import type { RuntimeResponse } from "@shared/types/runtime.types";
import { createRequestId } from "@shared/utils/request-id";
import type { BatchLogEntry, BatchRunState, BatchStats, SelectableItem, TaxSelection } from "./batch.types";
import { BatchRunner } from "./batch.runner";
import type { SiteAuthContext, VatPitCategory } from "./site.api.client";
import { SiteApiClient, asCategoryOptions, toTaxSelection } from "./site.api.client";
import "./styles.css";

const LOG_SCOPE = "[SapoBatch][content]";
const PAGE_LIMIT = 50;

interface RuntimeEnvelope<T = unknown> {
  type: "INIT_CONTEXT" | "RUN_SMOKE_TEST" | "QUEUE_ENQUEUE" | "QUEUE_CANCEL" | "DEBUG_LOG";
  requestId: string;
  timestamp: number;
  payload: T;
}

interface RowStatusModel {
  label: string;
  tone: string;
  attempts?: number;
}

function emptyStats(): BatchStats {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
    skipped: 0
  };
}

function App(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [auth, setAuth] = useState<SiteAuthContext>({
    csrfToken: null,
    fnbToken: null,
    merchantId: null,
    storeId: null,
    shopOrigin: window.location.origin
  });
  const authRef = useRef<SiteAuthContext>(auth);

  const [statusText, setStatusText] = useState("Ready.");
  const [items, setItems] = useState<Item[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [vatPitCategories, setVatPitCategories] = useState<VatPitCategory[]>([]);
  const [selectedTaxCode, setSelectedTaxCode] = useState("");
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);
  const [batchState, setBatchState] = useState<BatchRunState | null>(null);
  const [batchStats, setBatchStats] = useState<BatchStats>(emptyStats());
  const [logs, setLogs] = useState<BatchLogEntry[]>([]);

  const apiClientRef = useRef<SiteApiClient | null>(null);
  const runnerRef = useRef<BatchRunner | null>(null);
  const pageRef = useRef(page);
  const selectedCategoryIdRef = useRef(selectedCategoryId);
  const lastCompletionLogIdRef = useRef<string | null>(null);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    selectedCategoryIdRef.current = selectedCategoryId;
  }, [selectedCategoryId]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      const extracted = extractAuthContext();
      authRef.current = extracted;
      if (!mounted) {
        return;
      }
      setAuth(extracted);
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

      const apiClient = new SiteApiClient(() => authRef.current);
      apiClientRef.current = apiClient;

      const runner = new BatchRunner({
        apiClient,
        logger: (entry) => {
          logContent(entry.level, entry.message, entry.details);
          void logToService(entry.level, entry.message, entry.details);
        }
      });
      runnerRef.current = runner;

      unsubscribe = runner.subscribe(({ state, stats, lastLog }) => {
        if (!mounted) {
          return;
        }
        setBatchState(state);
        setBatchStats(stats);
        if (lastLog) {
          setLogs((previous) => [lastLog, ...previous].slice(0, 120));
          if (lastLog.message === "Batch completed.") {
            if (lastCompletionLogIdRef.current === lastLog.id) {
              return;
            }
            lastCompletionLogIdRef.current = lastLog.id;
            const summary = [
              "Batch completed.",
              `Total: ${stats.total}`,
              `Success: ${stats.success}`,
              `Failed: ${stats.failed}`,
              `Skipped: ${stats.skipped}`
            ].join("\n");
            void (async () => {
              await loadItemsPage(
                apiClient,
                pageRef.current,
                selectedCategoryIdRef.current,
                setItems,
                setItemTotal,
                setSelectedIds,
                setIsLoadingItems,
                setStatusText
              );
              window.alert(summary);
            })();
          }
        }
      });

      await runner.init();
      if (runner.getState() && runner.hasIncompleteItems()) {
        setIsOpen(true);
        const shouldResume = window.confirm(
          "Detected unfinished batch. OK = Resume, Cancel = Discard."
        );
        if (shouldResume) {
          await runner.resume();
          setStatusText("Resumed unfinished batch.");
        } else {
          await runner.discard();
          setStatusText("Discarded unfinished batch.");
        }
      }

      await loadCatalogs(
        apiClient,
        setCategoryOptions,
        setVatPitCategories,
        setSelectedTaxCode,
        setStatusText
      );
      await loadItemsPage(
        apiClient,
        page,
        selectedCategoryId,
        setItems,
        setItemTotal,
        setSelectedIds,
        setIsLoadingItems,
        setStatusText
      );

      if (mounted) {
        setStatusText("Ready.");
      }
    };

    void setup();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const totalPages = useMemo(() => {
    if (itemTotal <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(itemTotal / PAGE_LIMIT));
  }, [itemTotal]);

  const selectedItems = useMemo<SelectableItem[]>(() => {
    const output: SelectableItem[] = [];
    for (const item of items) {
      if (selectedIds.has(item.client_id)) {
        output.push({ clientId: item.client_id, name: item.name });
      }
    }
    return output;
  }, [items, selectedIds]);

  const selectedTax = useMemo<TaxSelection | null>(() => {
    const found = vatPitCategories.find((category) => category.code === selectedTaxCode);
    if (!found) {
      return null;
    }
    return toTaxSelection(found);
  }, [selectedTaxCode, vatPitCategories]);

  const batchMap = useMemo(() => {
    const map = new Map<string, BatchRunState["items"][number]>();
    if (!batchState) {
      return map;
    }
    for (const item of batchState.items) {
      map.set(item.clientId, item);
    }
    return map;
  }, [batchState]);

  const progress = useMemo(() => {
    const completed = batchStats.success + batchStats.failed + batchStats.skipped;
    const total = batchStats.total;
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    const processingItem = batchState?.items.find((item) => item.status === "processing");
    return {
      completed,
      total,
      percent,
      processingName: processingItem?.name ?? null
    };
  }, [batchState, batchStats]);

  const pageAllSelected = items.length > 0 && items.every((item) => selectedIds.has(item.client_id));

  const hasOngoingBatch = batchStats.pending > 0 || batchStats.processing > 0;

  const openPanel = () => setIsOpen(true);
  const closePanel = () => setIsOpen(false);

  const loadCurrentPage = async (nextPage: number, categoryId: string): Promise<void> => {
    const apiClient = apiClientRef.current;
    if (!apiClient) {
      return;
    }
    await loadItemsPage(
      apiClient,
      nextPage,
      categoryId,
      setItems,
      setItemTotal,
      setSelectedIds,
      setIsLoadingItems,
      setStatusText
    );
  };

  const onRefreshTable = async (): Promise<void> => {
    await loadCurrentPage(page, selectedCategoryId);
  };

  const onCategoryChange = async (value: string): Promise<void> => {
    setSelectedCategoryId(value);
    setPage(1);
    await loadCurrentPage(1, value);
  };

  const onPrevPage = async (): Promise<void> => {
    const next = Math.max(1, page - 1);
    if (next === page) {
      return;
    }
    setPage(next);
    await loadCurrentPage(next, selectedCategoryId);
  };

  const onNextPage = async (): Promise<void> => {
    const next = Math.min(totalPages, page + 1);
    if (next === page) {
      return;
    }
    setPage(next);
    await loadCurrentPage(next, selectedCategoryId);
  };

  const toggleSelect = (clientId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      const ids = items.map((item) => item.client_id);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        for (const id of ids) {
          next.delete(id);
        }
      } else {
        for (const id of ids) {
          next.add(id);
        }
      }
      return next;
    });
  };

  const onStartBatch = async (): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner) {
      return;
    }
    if (!selectedTax) {
      setStatusText("Please choose a tax code.");
      return;
    }
    if (selectedItems.length === 0) {
      setStatusText("Please select at least one item.");
      return;
    }

    await runner.startBatch({
      items: selectedItems,
      tax: selectedTax,
      page,
      limit: PAGE_LIMIT,
      categoryId: selectedCategoryId || null
    });
    setStatusText(`Batch started (${selectedItems.length} item(s)).`);
  };

  const onPauseResume = async (): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner || !batchState) {
      return;
    }
    if (batchState.isPaused) {
      await runner.resume();
      setStatusText("Batch resumed.");
    } else {
      await runner.pause();
      setStatusText("Batch paused.");
    }
  };

  const onRetryFailed = async (): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner) {
      return;
    }
    await runner.retryFailed();
    setStatusText("Retry failed triggered.");
  };

  const onDiscardBatch = async (): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner) {
      return;
    }
    if (!batchState || batchState.items.length === 0) {
      return;
    }
    const confirmed = window.confirm("Discard current batch state?");
    if (!confirmed) {
      return;
    }
    await runner.discard();
    setStatusText("Batch discarded.");
  };

  const onRefreshCatalogs = async (): Promise<void> => {
    const apiClient = apiClientRef.current;
    if (!apiClient) {
      return;
    }
    setIsLoadingCatalogs(true);
    try {
      await loadCatalogs(
        apiClient,
        setCategoryOptions,
        setVatPitCategories,
        setSelectedTaxCode,
        setStatusText
      );
      setStatusText("Catalogs refreshed.");
    } finally {
      setIsLoadingCatalogs(false);
    }
  };

  const launcherBadge = hasOngoingBatch ? batchStats.pending + batchStats.processing : 0;

  return (
    <>
      <button className="spx-float-launcher" onClick={openPanel} aria-label="Open Sapo Batch Tool">
        S
        {launcherBadge > 0 ? <span className="sapo-float-launcher__badge">{launcherBadge}</span> : null}
      </button>

      {isOpen ? (
        <div className="spx-dashboard-overlay">
          <div className="spx-dashboard-backdrop" onClick={closePanel} />
          <div className="spx-dashboard-container" role="dialog" aria-modal="true" aria-label="Sapo Batch Popup">
            <div className="spx-header">
              <div className="spx-header-left">
                <div className="spx-brand">
                  <div className="spx-logo">S</div>
                  <h2 className="spx-title">Sapo Tax Infos Updater</h2>
                </div>
                <p className="spx-header-subtitle">{statusText}</p>
              </div>
              <div className="spx-header-actions">
                <button className="spx-icon-btn spx-danger" onClick={closePanel} aria-label="Close popup">
                  X
                </button>
              </div>
            </div>

            <div className="spx-main">
              <div className="spx-sync-row spx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="spx-sync-progress-group">
                  <span className="spx-sync-progress-label">
                    {progress.processingName
                      ? `Running: ${progress.processingName}`
                      : hasOngoingBatch
                        ? "Running batch..."
                        : "Ready"}
                  </span>
                  <div className="spx-progress-track">
                    <div className="spx-progress-bar" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <span className="spx-stat-label" style={{ marginLeft: "10px", whiteSpace: "nowrap" }}>{progress.completed}/{progress.total || 0} completed</span>
                </div>
                <div className="spx-sync-item" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <button className="spx-big-btn spx-danger" onClick={onDiscardBatch} disabled={!batchState || batchState.items.length === 0}>
                    Discard
                  </button>
                  {hasOngoingBatch ? (
                    <button className="spx-big-btn spx-warning" onClick={onPauseResume} disabled={!batchState}>
                      {batchState?.isPaused ? "Resume" : "Pause"}
                    </button>
                  ) : (
                    <button className="spx-big-btn spx-green" onClick={onStartBatch} disabled={selectedItems.length === 0 || !selectedTax}>
                      Update
                    </button>
                  )}
                </div>
              </div>

              <div className="spx-card spx-layout-grid-full">
                <div className="spx-table-section">
                  <div className="spx-cards-header">
                    <h3 className="spx-card-title">
                      Items
                      <span style={{ fontSize: 13, color: "var(--text-sec)", fontWeight: 500 }}>
                        (Selected: {selectedItems.length})
                      </span>
                    </h3>
                    <div className="spx-header-tools">
                      <CustomSelect
                        value={selectedCategoryId}
                        onChange={(val) => {
                          void onCategoryChange(val);
                        }}
                        placeholder="All categories"
                        options={[
                          { value: "", label: "All categories" },
                          ...categoryOptions.map((o) => ({ value: o.value, label: o.label }))
                        ]}
                      />

                      <CustomSelect
                        value={selectedTaxCode}
                        onChange={(val) => setSelectedTaxCode(val)}
                        placeholder="Select Tax info"
                        options={vatPitCategories.map((tax) => ({
                          value: tax.code,
                          label: `${tax.code} - ${tax.name}`,
                          title: `${tax.code} - ${tax.name}`
                        }))}
                      />

                      <button className="spx-tool-btn" onClick={onRefreshCatalogs} disabled={isLoadingCatalogs}>
                        {isLoadingCatalogs ? "Refreshing..." : "Refresh Catalogs"}
                      </button>
                      <button className="spx-tool-btn" onClick={onRefreshTable} disabled={isLoadingItems}>
                        {isLoadingItems ? "Loading..." : "Refresh Table"}
                      </button>
                    </div>
                  </div>

                  <div className="spx-table-container">
                    <table className="spx-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40, textAlign: 'center', overflow: 'visible', textOverflow: 'clip' }}>
                            <input type="checkbox" checked={pageAllSelected} onChange={toggleSelectPage} />
                          </th>
                          <th style={{ width: 50 }}>#</th>
                          <th>Name</th>
                          <th style={{ width: 140 }}>Current Tax</th>
                          <th style={{ width: 100 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => {
                          const status = resolveRowStatus(item.client_id, selectedIds, batchMap);
                          return (
                            <tr key={item.client_id}>
                              <td style={{ textAlign: 'center', overflow: 'visible', textOverflow: 'clip' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(item.client_id)}
                                  onChange={() => toggleSelect(item.client_id)}
                                />
                              </td>
                              <td>{(page - 1) * PAGE_LIMIT + index + 1}</td>
                              <td title={item.client_id}>{item.name}</td>
                              <td>{item.tax_infos?.vat_pit_category_code || "-"}</td>
                              <td>
                                <span className={`spx-row-status ${status.tone}`}>
                                  {status.label}
                                  {typeof status.attempts === "number" ? ` (${status.attempts})` : ""}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center" }}>No items loaded.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="spx-pagination">
                    <button className="spx-page-btn" onClick={onPrevPage} disabled={page <= 1 || isLoadingItems}>
                      &laquo;
                    </button>
                    <div className="spx-page-input-group">
                      <span id="spx-p-total">
                        Page {page} of {totalPages}
                      </span>
                    </div>
                    <button className="spx-page-btn" onClick={onNextPage} disabled={page >= totalPages || isLoadingItems}>
                      &raquo;
                    </button>
                  </div>
                </div>
              </div>

              <div className="spx-logs-area spx-card">
                {logs.length === 0 ? (
                  <div>No logs yet.</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className={`spx-log-entry ${log.level}`}>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function resolveRowStatus(
  clientId: string,
  selectedIds: Set<string>,
  batchMap: Map<string, BatchRunState["items"][number]>
): RowStatusModel {
  const batchItem = batchMap.get(clientId);
  if (batchItem) {
    if (batchItem.status === "pending") {
      return { label: "Pending", tone: "spx-pending" as any, attempts: batchItem.attempts };
    }
    if (batchItem.status === "processing") {
      return { label: "Processing", tone: "spx-processing" as any, attempts: batchItem.attempts };
    }
    if (batchItem.status === "success") {
      return { label: "Success", tone: "spx-success" as any, attempts: batchItem.attempts };
    }
    if (batchItem.status === "failed") {
      return { label: "Failed", tone: "spx-failed" as any, attempts: batchItem.attempts };
    }
    return { label: "Skipped", tone: "spx-skipped" as any, attempts: batchItem.attempts };
  }

  if (selectedIds.has(clientId)) {
    return { label: "Selected", tone: "spx-pending" as any };
  }
  return { label: "Idle", tone: "spx-idle" as any };
}

async function loadCatalogs(
  apiClient: SiteApiClient,
  setCategoryOptions: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string }>>>,
  setVatPitCategories: React.Dispatch<React.SetStateAction<VatPitCategory[]>>,
  setSelectedTaxCode: React.Dispatch<React.SetStateAction<string>>,
  setStatusText: React.Dispatch<React.SetStateAction<string>>
): Promise<void> {
  setStatusText("Loading categories and tax catalog...");
  const [vatPitCategories, categoriesResponse] = await Promise.all([
    apiClient.getVatPitCategories(),
    apiClient.getCategories(1, 250, "")
  ]);
  setVatPitCategories(vatPitCategories);
  setCategoryOptions(asCategoryOptions(categoriesResponse.categories));
  if (vatPitCategories.length > 0) {
    const defaultTaxCode = vatPitCategories.find((tax) => tax.code === "305")?.code ?? vatPitCategories[0]?.code ?? "";
    setSelectedTaxCode((current) => {
      if (current && vatPitCategories.some((tax) => tax.code === current)) {
        return current;
      }
      return defaultTaxCode;
    });
  }
}

async function loadItemsPage(
  apiClient: SiteApiClient,
  page: number,
  categoryId: string,
  setItems: React.Dispatch<React.SetStateAction<Item[]>>,
  setItemTotal: React.Dispatch<React.SetStateAction<number>>,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  setIsLoadingItems: React.Dispatch<React.SetStateAction<boolean>>,
  setStatusText: React.Dispatch<React.SetStateAction<string>>
): Promise<void> {
  setIsLoadingItems(true);
  setStatusText("Loading table data...");
  try {
    const response = await apiClient.getItems(page, PAGE_LIMIT, categoryId || undefined);
    setItems(response.items);
    setItemTotal(response.metadata.total);
    setSelectedIds(new Set());
    setStatusText(`Loaded ${response.items.length} item(s) from page ${page}.`);
  } catch (error: unknown) {
    setStatusText(`Load items failed: ${normalizeErrorMessage(error)}`);
  } finally {
    setIsLoadingItems(false);
  }
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
  if (!token) {
    return { merchantId: null, storeId: null };
  }
  const parts = token.split(".");
  if (parts.length < 2) {
    return { merchantId: null, storeId: null };
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1] || "")) as { sub?: string; jti?: string | number };
    const merchantFromSub = payload.sub?.split(":")?.[0] ?? null;
    const storeFromJti = payload.jti ? String(payload.jti) : null;
    return {
      merchantId: normalizeId(merchantFromSub ?? null),
      storeId: normalizeId(storeFromJti ?? null)
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
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withoutBearer = trimmed.replace(/^Bearer\s+/i, "");
  const withoutQuotes =
    (withoutBearer.startsWith('"') && withoutBearer.endsWith('"')) ||
      (withoutBearer.startsWith("'") && withoutBearer.endsWith("'"))
      ? withoutBearer.slice(1, -1)
      : withoutBearer;
  return withoutQuotes.trim() || null;
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}

function normalizeId(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const sanitized = normalizeHeaderValue(value);
  if (!sanitized) {
    return null;
  }
  const digitsOnly = sanitized.replace(/[^\d]/g, "");
  return digitsOnly || sanitized;
}

function readMeta(name: string): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
}

function readCookie(name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  if (!match || !match[1]) {
    return null;
  }
  return decodeURIComponent(match[1]);
}

function readFromStorage(candidateKeys: string[]): string | null {
  for (const key of candidateKeys) {
    const exact = readStorageValue(key);
    if (exact) {
      return exact;
    }
  }

  const keySet = new Set(candidateKeys.map((key) => key.toLowerCase()));
  for (const storage of listStorages()) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) {
        continue;
      }
      if (!keySet.has(key.toLowerCase())) {
        continue;
      }
      const value = storage.getItem(key);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function readJwtLikeFromStorage(): string | null {
  const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  for (const storage of listStorages()) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.toLowerCase().includes("token")) {
        continue;
      }
      const value = storage.getItem(key);
      if (value && jwtPattern.test(value)) {
        return value;
      }
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

function readStorageValue(key: string): string | null {
  for (const storage of listStorages()) {
    const value = storage.getItem(key);
    if (value) {
      return value;
    }
  }
  return null;
}

function normalizeErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; title?: string }[];
  placeholder?: string;
  disabled?: boolean;
}

function CustomSelect({ value, onChange, options, placeholder, disabled }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || "");

  const filteredOptions = search.trim() === ""
    ? options
    : options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="spx-custom-select" ref={ref}>
      <input
        type="text"
        className="spx-input-clean"
        disabled={disabled}
        readOnly={!isOpen}
        value={isOpen ? search : truncateText(displayLabel, 40)}
        onChange={(e) => setSearch(e.target.value)}
        onClick={() => {
          if (!disabled && !isOpen) {
            setIsOpen(true);
            setSearch("");
          }
        }}
        placeholder={isOpen ? truncateText(displayLabel, 40) : placeholder}
        title={selectedOption?.title || selectedOption?.label || placeholder}
      />

      {isOpen && (
        <div className="spx-select-dropdown">
          {filteredOptions.length === 0 ? (
            <div className="spx-select-option" style={{ opacity: 0.5, cursor: "default", fontStyle: "italic" }}>
              No results found
            </div>
          ) : (
            filteredOptions.map((opt) => (
              <div
                key={opt.value}
                className={`spx-select-option ${opt.value === value ? 'spx-selected' : ''}`}
                title={opt.title || opt.label}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                  setSearch("");
                }}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// LOGGING & TELEMETRY
// ============================================================================
function logContent(level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): void {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (details !== undefined) {
    logger(LOG_SCOPE, message, details);
    return;
  }
  logger(LOG_SCOPE, message);
}

async function logToService(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  details?: unknown
): Promise<void> {
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
  if (document.getElementById("sapo-batch-panel-root")) {
    return;
  }
  const rootElement = document.createElement("div");
  rootElement.id = "sapo-batch-panel-root";
  document.body.appendChild(rootElement);
  createRoot(rootElement).render(<App />);
}

mountPanel();
