import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@shared/types/sapo.types";
import type { BatchRunState, BatchStats, SelectableItem, TaxSelection } from "./batch.types";
import { BatchRunner } from "./batch.runner";
import { CustomSelect } from "./custom-select";
import type { SiteApiClient, VatPitCategory } from "./site.api.client";
import { asCategoryOptions, toTaxSelection } from "./site.api.client";

const PAGE_LIMIT = 50;

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

interface TaxTabProps {
  apiClient: SiteApiClient | null;
  onStatusText: (text: string) => void;
  onShowToast: (message: string, type: "success" | "warn" | "error" | "info") => void;
  onDebugLog?: (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown) => Promise<void>;
}

export function TaxTab({ apiClient, onStatusText, onShowToast, onDebugLog }: TaxTabProps): React.JSX.Element {
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
    if (!apiClient) {
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      const runner = new BatchRunner({
        apiClient,
        logger: (entry) => {
          if (onDebugLog) {
            void onDebugLog(entry.level, entry.message, entry.details);
          }
        }
      });
      runnerRef.current = runner;

      unsubscribe = runner.subscribe(({ state, stats, lastLog }) => {
        if (!mounted) {
          return;
        }

        setBatchState(state);
        setBatchStats(stats);

        if (!lastLog || lastLog.message !== "Batch completed.") {
          return;
        }
        if (lastCompletionLogIdRef.current === lastLog.id) {
          return;
        }

        lastCompletionLogIdRef.current = lastLog.id;
        const success = stats.success > 0;
        const msg = `Batch completed. Total: ${stats.total}, Success: ${stats.success}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`;

        void (async () => {
          await loadItemsPage(
            apiClient,
            pageRef.current,
            selectedCategoryIdRef.current,
            setItems,
            setItemTotal,
            setSelectedIds,
            setIsLoadingItems,
            onStatusText
          );
          onShowToast(msg, stats.failed > 0 ? "error" : "success");
        })();
      });

      await runner.init();
      if (runner.getState() && runner.hasIncompleteItems()) {
        const shouldResume = window.confirm(
          "Detected unfinished batch. OK = Resume, Cancel = Discard."
        );
        if (shouldResume) {
          await runner.resume();
          onStatusText("Resumed unfinished batch.");
        } else {
          await runner.discard();
          onStatusText("Discarded unfinished batch.");
        }
      }

      await loadCatalogs(
        apiClient,
        setCategoryOptions,
        setVatPitCategories,
        setSelectedTaxCode,
        onStatusText
      );

      await loadItemsPage(
        apiClient,
        page,
        selectedCategoryId,
        setItems,
        setItemTotal,
        setSelectedIds,
        setIsLoadingItems,
        onStatusText
      );

      onStatusText("Ready.");
    };

    void setup();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [apiClient, onDebugLog, onStatusText]);

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

  const loadCurrentPage = async (nextPage: number, categoryId: string): Promise<void> => {
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
      onStatusText
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
      onStatusText("Please choose a tax code.");
      return;
    }

    if (selectedItems.length === 0) {
      onStatusText("Please select at least one item.");
      return;
    }

    await runner.startBatch({
      items: selectedItems,
      tax: selectedTax,
      page,
      limit: PAGE_LIMIT,
      categoryId: selectedCategoryId || null
    });
    onStatusText(`Batch started (${selectedItems.length} item(s)).`);
  };

  const onPauseResume = async (): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner || !batchState) {
      return;
    }

    if (batchState.isPaused) {
      await runner.resume();
      onStatusText("Batch resumed.");
      return;
    }

    await runner.pause();
    onStatusText("Batch paused.");
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
    onStatusText("Batch discarded.");
  };

  const onRefreshCatalogs = async (): Promise<void> => {
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
        onStatusText
      );
      onStatusText("Catalogs refreshed.");
    } finally {
      setIsLoadingCatalogs(false);
    }
  };

  return (
    <>
      <div className="spx-sync-row spx-card">
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
          <span className="spx-stat-label">{progress.completed}/{progress.total || 0} completed</span>
        </div>
        <div className="spx-sync-item">
          <button
            className="spx-big-btn spx-danger"
            onClick={onDiscardBatch}
            disabled={!batchState || batchState.items.length === 0}
          >
            Discard
          </button>
          {hasOngoingBatch ? (
            <button className="spx-big-btn spx-warning" onClick={onPauseResume} disabled={!batchState}>
              {batchState?.isPaused ? "Resume" : "Pause"}
            </button>
          ) : (
            <button
              className="spx-big-btn spx-green"
              onClick={onStartBatch}
              disabled={selectedItems.length === 0 || !selectedTax}
            >
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
              <span className="spx-card-title-selected">(Selected: {selectedItems.length})</span>
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
                  ...categoryOptions.map((option) => ({ value: option.value, label: option.label }))
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
                  <th style={{ width: 40, textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
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
                      <td style={{ textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
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
                    <td colSpan={5} style={{ textAlign: "center" }}>
                      No items loaded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

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
      return { label: "Pending", tone: "spx-pending", attempts: batchItem.attempts };
    }
    if (batchItem.status === "processing") {
      return { label: "Processing", tone: "spx-processing", attempts: batchItem.attempts };
    }
    if (batchItem.status === "success") {
      return { label: "Success", tone: "spx-success", attempts: batchItem.attempts };
    }
    if (batchItem.status === "failed") {
      return { label: "Failed", tone: "spx-failed", attempts: batchItem.attempts };
    }
    return { label: "Skipped", tone: "spx-skipped", attempts: batchItem.attempts };
  }

  if (selectedIds.has(clientId)) {
    return { label: "Selected", tone: "spx-pending" };
  }
  return { label: "Idle", tone: "spx-idle" };
}

async function loadCatalogs(
  apiClient: SiteApiClient,
  setCategoryOptions: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string }>>>,
  setVatPitCategories: React.Dispatch<React.SetStateAction<VatPitCategory[]>>,
  setSelectedTaxCode: React.Dispatch<React.SetStateAction<string>>,
  onStatusText: (text: string) => void
): Promise<void> {
  onStatusText("Loading categories and tax catalog...");

  const [vatPitCategories, categoriesResponse] = await Promise.all([
    apiClient.getVatPitCategories(),
    apiClient.getCategories(1, 250, "")
  ]);

  setVatPitCategories(vatPitCategories);
  setCategoryOptions(asCategoryOptions(categoriesResponse.categories));

  if (vatPitCategories.length > 0) {
    const defaultTaxCode =
      vatPitCategories.find((tax) => tax.code === "305")?.code ?? vatPitCategories[0]?.code ?? "";

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
  onStatusText: (text: string) => void
): Promise<void> {
  setIsLoadingItems(true);
  onStatusText("Loading table data...");

  try {
    const response = await apiClient.getItems(page, PAGE_LIMIT, categoryId || undefined);
    setItems(response.items);
    setItemTotal(response.metadata.total);
    setSelectedIds(new Set());
    onStatusText(`Loaded ${response.items.length} item(s) from page ${page}.`);
  } catch (error: unknown) {
    onStatusText(`Load items failed: ${normalizeErrorMessage(error)}`);
  } finally {
    setIsLoadingItems(false);
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
