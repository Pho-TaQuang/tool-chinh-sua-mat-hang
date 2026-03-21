import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@shared/types/sapo.types";
import { createRequestId } from "@shared/utils/request-id";
import type { SiteApiClient } from "./site.api.client";
import { asCategoryOptions } from "./site.api.client";
import { CustomSelect } from "./custom-select";
import { buildModifySetPayload, prepareModifySetsForSubmit } from "./modify-set.normalize";
import { parseClipboardToPreview } from "./modify-set.parser";
import { isFailureStatus, ModifySetRunner } from "./modify-set.runner";
import type {
  ClipboardPreview,
  ModifySetCardModel,
  ModifySetLinkedItem,
  ModifySetPreparedInput,
  ModifySetRunnerResult,
  ModifySetRowModel
} from "./modify-set.types";
import { isRowCompletelyEmpty, validateModifySetDraft } from "./modify-set.validator";
import { Plus, Trash, LinkIcon, ChevronUp, ChevronDown, Check, X, Search, RefreshCw, Clipboard, Upload, RotateCcw } from "./icons";

const PAGE_LIMIT = 50;
type MainCol = 0 | 1 | 2;

interface ModifySetTabProps {
  apiClient: SiteApiClient | null;
  onStatusText: (text: string) => void;
  onShowToast: (message: string, type: "success" | "warn" | "error" | "info") => void;
  onDebugLog?: (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown) => Promise<void>;
}

interface PendingPreview {
  setLocalId: string;
  startRow: number;
  preview: ClipboardPreview;
}

interface FillState {
  setLocalId: string;
  fromRow: number;
  col: MainCol;
  value: string;
}

function toMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function createRow(): ModifySetRowModel {
  return {
    rowId: createRequestId("mod-row"),
    name: "",
    priceInput: "",
    costInput: "",
    defaultSelected: false
  };
}

function ensureTrailing(rows: ModifySetRowModel[]): ModifySetRowModel[] {
  const next = rows.length > 0 ? [...rows] : [createRow()];
  const last = next[next.length - 1];
  if (!last || !isRowCompletelyEmpty(last)) {
    next.push(createRow());
  }
  return next;
}

function createSet(index: number): ModifySetCardModel {
  const draft: ModifySetCardModel = {
    localId: createRequestId("mod-set"),
    name: "",
    minQuantity: 0,
    maxQuantity: 1,
    allowMultipleQuantity: false,
    mappingItems: [],
    rows: ensureTrailing([]),
    collapsed: false,
    status: "draft",
    apiClientId: null,
    createError: null,
    mappingError: null,
    validationErrors: {
      setErrors: [],
      rowErrors: [],
      validRowCount: 0,
      hasError: false
    }
  };
  return {
    ...draft,
    validationErrors: validateModifySetDraft(draft)
  };
}

function statusLabel(status: ModifySetCardModel["status"]): string {
  if (status === "draft") return "Draft";
  if (status === "validated") return "Validated";
  if (status === "creating") return "Creating";
  if (status === "created") return "Created";
  if (status === "mapping") return "Mapping";
  if (status === "mapped") return "Mapped";
  if (status === "create_failed") return "Create Failed";
  return "Mapping Failed";
}

function statusTone(status: ModifySetCardModel["status"]): string {
  if (status === "mapped") return "spx-success";
  if (status === "validated" || status === "created") return "spx-processing";
  if (status === "creating" || status === "mapping") return "spx-pending";
  if (status === "create_failed" || status === "mapping_failed") return "spx-failed";
  return "spx-idle";
}

export function ModifySetTab({ apiClient, onStatusText, onShowToast, onDebugLog }: ModifySetTabProps): React.JSX.Element {
  const [sets, setSets] = useState<ModifySetCardModel[]>([createSet(0)]);
  const [selectedRows, setSelectedRows] = useState<Record<string, string[]>>({});
  const [rowAnchors, setRowAnchors] = useState<Record<string, number>>({});
  const [fillState, setFillState] = useState<FillState | null>(null);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const [lastPreview, setLastPreview] = useState<PendingPreview | null>(null);
  const [activeCell, setActiveCell] = useState<{ setLocalId: string; row: number; col: MainCol } | null>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemPage, setItemPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickerTargetSetId, setPickerTargetSetId] = useState<string | null>(null);
  const [pickerSelectedItemsMap, setPickerSelectedItemsMap] = useState<Map<string, ModifySetLinkedItem>>(new Map());

  const runnerRef = useRef<ModifySetRunner | null>(null);

  useEffect(() => {
    if (!apiClient) {
      return;
    }
    runnerRef.current = new ModifySetRunner({ apiClient });
  }, [apiClient]);

  useEffect(() => {
    if (!fillState) {
      return;
    }
    const handleMouseUp = () => setFillState(null);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [fillState]);

  const selectedItems = useMemo(
    () => Array.from(pickerSelectedItemsMap.values()),
    [pickerSelectedItemsMap]
  );
  const pickerTargetSet = useMemo(
    () => sets.find((set) => set.localId === pickerTargetSetId) ?? null,
    [pickerTargetSetId, sets]
  );
  const totalPages = useMemo(() => Math.max(1, Math.ceil(itemTotal / PAGE_LIMIT)), [itemTotal]);
  const allPageSelected = items.length > 0 && items.every((item) => pickerSelectedItemsMap.has(item.client_id));

  const loadItems = async (page: number, categoryId: string, name: string) => {
    if (!apiClient) return;
    setIsLoadingItems(true);
    onStatusText("Loading item search...");
    try {
      const response = await apiClient.getItems(page, PAGE_LIMIT, categoryId || undefined, name || undefined);
      setItems(response.items);
      setItemTotal(response.metadata.total);
      onStatusText(`Loaded ${response.items.length} item(s) for mapping.`);
    } catch (error: unknown) {
      onStatusText(`Load mapping items failed: ${toMessage(error)}`);
    } finally {
      setIsLoadingItems(false);
    }
  };

  useEffect(() => {
    if (!apiClient) return;
    void (async () => {
      try {
        const categories = await apiClient.getCategories(1, 250, "");
        setCategoryOptions(asCategoryOptions(categories.categories));
        await loadItems(1, "", "");
      } catch (error: unknown) {
        onStatusText(`Modify set init failed: ${toMessage(error)}`);
      }
    })();
  }, [apiClient]);

  const openMappingPicker = (setLocalId: string) => {
    const set = sets.find((item) => item.localId === setLocalId);
    if (!set) {
      return;
    }
    setPickerTargetSetId(setLocalId);
    setPickerSelectedItemsMap(new Map(set.mappingItems.map((item) => [item.clientId, item])));
  };

  const closeMappingPicker = () => {
    setPickerTargetSetId(null);
    setPickerSelectedItemsMap(new Map());
  };

  const confirmMappingPicker = () => {
    if (!pickerTargetSetId) {
      return;
    }
    const nextItems = Array.from(pickerSelectedItemsMap.values());
    setSets((prev) =>
      prev.map((set) => {
        if (set.localId !== pickerTargetSetId) {
          return set;
        }
        const validation = validateModifySetDraft(set);
        const nextStatus: ModifySetCardModel["status"] = validation.hasError
          ? "draft"
          : set.apiClientId
            ? "created"
            : "validated";
        return {
          ...set,
          mappingItems: nextItems,
          validationErrors: validation,
          createError: null,
          mappingError: null,
          status: nextStatus
        };
      })
    );
    closeMappingPicker();
  };

  const editSet = (
    localId: string,
    updater: (set: ModifySetCardModel) => ModifySetCardModel,
    userEdit = true
  ) => {
    setSets((prev) =>
      prev.map((set) => {
        if (set.localId !== localId) return set;
        const next = updater(set);
        if (!userEdit) return next;

        const withRows = { ...next, rows: ensureTrailing(next.rows) };
        const validation = validateModifySetDraft(withRows);
        return {
          ...withRows,
          validationErrors: validation,
          status: validation.hasError ? "draft" : "validated",
          apiClientId: null,
          createError: null,
          mappingError: null
        };
      })
    );
  };

  const focusCell = (setLocalId: string, row: number, col: MainCol) => {
    requestAnimationFrame(() => {
      const selector = `input[data-set-id="${setLocalId}"][data-row="${row}"][data-col="${col}"]`;
      const cell = document.querySelector<HTMLInputElement>(selector);
      cell?.focus();
      cell?.select();
    });
  };

  const deleteSelectedRows = (setLocalId: string) => {
    const selected = new Set(selectedRows[setLocalId] ?? []);
    if (selected.size === 0) return;
    editSet(setLocalId, (set) => {
      const rows = set.rows.filter((row) => !selected.has(row.rowId));
      return { ...set, rows: rows.length > 0 ? rows : [createRow()] };
    });
    setSelectedRows((prev) => ({ ...prev, [setLocalId]: [] }));
  };

  const runCallbacks = () => ({
    onSetStatusChange: (
      localId: string,
      update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>
    ) => {
      setSets((prev) =>
        prev.map((set) => (set.localId === localId ? { ...set, ...update } : set))
      );
    },
    onLog: (level: "info" | "warn" | "error", message: string, details?: unknown) => {
      if (onDebugLog) {
        void onDebugLog(level, message, details);
      }
    }
  });

  const validateAll = (): { hasError: boolean; next: ModifySetCardModel[] } => {
    let hasError = false;
    const next = sets.map((set): ModifySetCardModel => {
      const validated = validateModifySetDraft({ ...set, rows: ensureTrailing(set.rows) });
      const mappingMissing = set.mappingItems.length === 0;
      if (validated.hasError || mappingMissing) hasError = true;
      return {
        ...set,
        validationErrors: validated,
        mappingError: mappingMissing ? "Please link at least one item for this set." : null,
        status:
          validated.hasError || mappingMissing
            ? "draft"
            : set.status === "mapped"
              ? "mapped"
              : set.apiClientId
                ? "created"
                : "validated"
      };
    });
    return { hasError, next };
  };

  const createAndMap = async () => {
    if (!runnerRef.current || !apiClient) {
      onStatusText("API client is not ready.");
      return;
    }
    if (pendingPreview && pendingPreview.preview.invalidRows > 0) {
      onStatusText("Preview still contains invalid rows. Fix the data and import again before submit.");
      return;
    }
    const validation = validateAll();
    setSets(validation.next);
    if (validation.hasError) {
      onStatusText("Validation failed. Fix all errors before Create & map.");
      onShowToast("Validation failed. Fix all errors before Create & map.", "error");
      return;
    }

    const pendingSets = validation.next.filter((set) => set.status !== "mapped");
    if (pendingSets.length === 0) {
      onStatusText("No pending set. All sets are already mapped.");
      return;
    }

    const mapOnlySets = pendingSets.filter((set) => Boolean(set.apiClientId));
    const createSets = pendingSets.filter((set) => !set.apiClientId);

    const { prepared, invalidLocalIds } = prepareModifySetsForSubmit(createSets);
    if (invalidLocalIds.length > 0 || (prepared.length === 0 && mapOnlySets.length === 0)) {
      onStatusText("No valid modify set to submit.");
      return;
    }

    setIsSubmitting(true);
    try {
      const results: ModifySetRunnerResult[] = [];

      for (const set of mapOnlySets) {
        if (!set.apiClientId) {
          continue;
        }
        const mapResult = await runnerRef.current.retryMappingOnly(
          {
            localId: set.localId,
            modSetId: set.apiClientId,
            itemIds: set.mappingItems.map((item) => item.clientId)
          },
          runCallbacks()
        );
        results.push(mapResult);
      }

      if (prepared.length > 0) {
        const createdResults = await runnerRef.current.run(prepared, runCallbacks());
        results.push(...createdResults);
      }

      const success = results.filter((result) => result.status === "mapped").length;
      const failed = results.length - success;
      onStatusText(`Create & map completed. Success: ${success}, Failed: ${failed}.`);
      onShowToast(`Create & map completed. Success: ${success}, Failed: ${failed}.`, failed > 0 ? "warn" : "success");
    } catch (error: unknown) {
      const msg = `Create & map failed: ${toMessage(error)}`;
      onStatusText(msg);
      onShowToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const retryOne = async (set: ModifySetCardModel) => {
    if (!runnerRef.current) {
      onStatusText("Runner is not ready.");
      return;
    }
    if (set.mappingItems.length === 0) {
      onStatusText("Please link at least one item for this set before retry.");
      return;
    }
    const itemIds = set.mappingItems.map((item) => item.clientId);

    if (set.status === "mapping_failed" && set.apiClientId) {
      await runnerRef.current.retryMappingOnly(
        { localId: set.localId, modSetId: set.apiClientId, itemIds },
        runCallbacks()
      );
      return;
    }

    const validation = validateModifySetDraft(set);
    if (validation.hasError) {
      editSet(set.localId, (cur) => ({ ...cur, validationErrors: validation, status: "draft" }), false);
      onStatusText("Retry blocked because set still has validation errors.");
      return;
    }

    const prepared: ModifySetPreparedInput = {
      localId: set.localId,
      name: set.name,
      itemIds,
      payload: buildModifySetPayload(set),
      existingClientId: set.apiClientId
    };
    await runnerRef.current.retrySingle(prepared, runCallbacks());
  };

  return (
    <div className="spx-modset-layout">
      <div className="spx-modset-grid">
        <div className="spx-modset-sets-panel">
          {sets.map((set, setIndex) => {
            const rowErrMap = new Map<string, string[]>();
            for (const rowError of set.validationErrors.rowErrors) {
              const list = rowErrMap.get(rowError.rowId) ?? [];
              list.push(rowError.message);
              rowErrMap.set(rowError.rowId, list);
            }

            return (
              <div key={set.localId} className="spx-card spx-modset-card">
                <div className="spx-modset-card-main">
                  <div className="spx-modset-card-header">
                    <div>
                      <div className="spx-modset-card-title-row">
                        <strong>{set.name.trim() || `Set ${setIndex + 1}`}</strong>
                        <span className={`spx-row-status ${statusTone(set.status)}`}>{statusLabel(set.status)}</span>
                      </div>
                      <div className="spx-modset-card-subtitle">
                        Valid options: {set.validationErrors.validRowCount}
                      </div>
                    </div>
                    <div className="spx-modset-card-actions">
                      {isFailureStatus(set.status) ? (
                        <button className="spx-icon-btn spx-warning" onClick={() => void retryOne(set)} title="Retry">
                          <RotateCcw />
                        </button>
                      ) : null}
                      <button className="spx-tool-btn" onClick={() => openMappingPicker(set.localId)}>
                        <LinkIcon /> Link ({set.mappingItems.length})
                      </button>
                      <button className="spx-icon-btn" onClick={() => editSet(set.localId, (cur) => ({ ...cur, collapsed: !cur.collapsed }), false)} title={set.collapsed ? "Expand" : "Collapse"}>
                        {set.collapsed ? <ChevronDown /> : <ChevronUp />}
                      </button>
                      <button
                        className="spx-icon-btn spx-danger"
                        title="Delete set"
                        onClick={() =>
                          setSets((prev) => {
                            const next = prev.filter((entry) => entry.localId !== set.localId);
                            return next.length > 0 ? next : [createSet(0)];
                          })
                        }
                      >
                        <Trash />
                      </button>
                    </div>
                  </div>

                  {set.createError ? <div className="spx-modset-error">Create error: {set.createError}</div> : null}
                  {set.mappingError ? <div className="spx-modset-error">Mapping error: {set.mappingError}</div> : null}
                  {set.validationErrors.setErrors.map((error) => (
                    <div key={`${set.localId}-${error.code}`} className="spx-modset-error">
                      {error.message}
                    </div>
                  ))}

                  {set.collapsed ? null : (
                  <div className="spx-modset-card-body">
                    <div className="spx-modset-set-fields">
                      <label>
                        Name
                        <input
                          className="spx-input-text spx-modset-input"
                          placeholder={`Set ${setIndex + 1}`}
                          value={set.name}
                          onChange={(event) => editSet(set.localId, (cur) => ({ ...cur, name: event.target.value }))}
                        />
                      </label>
                      <label>
                        Min qty
                        <input
                          type="number"
                          className="spx-input-text spx-modset-input"
                          value={set.minQuantity}
                          onChange={(event) => editSet(set.localId, (cur) => ({ ...cur, minQuantity: Number(event.target.value) || 0 }))}
                        />
                      </label>
                      <label>
                        Max qty
                        <input
                          type="number"
                          className="spx-input-text spx-modset-input"
                          value={set.maxQuantity}
                          onChange={(event) => editSet(set.localId, (cur) => ({ ...cur, maxQuantity: Number(event.target.value) || 0 }))}
                        />
                      </label>
                      <label className="spx-modset-checkbox-label">
                        <input
                          type="checkbox"
                          checked={set.allowMultipleQuantity}
                          onChange={(event) => editSet(set.localId, (cur) => ({ ...cur, allowMultipleQuantity: event.target.checked }))}
                        />
                        Allow multiple quantity
                      </label>
                    </div>



                    <div className="spx-modset-sheet-wrap">
                      <table className="spx-modset-sheet">
                        <thead>
                          <tr>
                            <th style={{ width: 40 }}>#</th>
                            <th>Name</th>
                            <th style={{ width: 140 }}>Price</th>
                            <th style={{ width: 140 }}>Cost</th>
                            <th style={{ width: 70 }}>Default</th>
                          </tr>
                        </thead>
                        <tbody>
                          {set.rows.map((row, rowIndex) => {
                            const selected = new Set(selectedRows[set.localId] ?? []).has(row.rowId);
                            const rowErrors = rowErrMap.get(row.rowId) ?? [];
                            return (
                              <tr key={row.rowId} className={selected ? "spx-modset-sheet-row-selected" : ""}>
                                <td
                                  className="spx-modset-row-index"
                                  onClick={(event) => {
                                    const current = new Set(selectedRows[set.localId] ?? []);
                                    const anchor = rowAnchors[set.localId];
                                    if (event.shiftKey && typeof anchor === "number") {
                                      current.clear();
                                      const start = Math.min(anchor, rowIndex);
                                      const end = Math.max(anchor, rowIndex);
                                      for (let i = start; i <= end; i += 1) {
                                        const candidate = set.rows[i]?.rowId;
                                        if (candidate) current.add(candidate);
                                      }
                                    } else if (current.has(row.rowId)) {
                                      current.delete(row.rowId);
                                    } else {
                                      current.add(row.rowId);
                                    }
                                    setSelectedRows((prev) => ({ ...prev, [set.localId]: Array.from(current) }));
                                    setRowAnchors((prev) => ({ ...prev, [set.localId]: rowIndex }));
                                  }}
                                >
                                  {rowIndex + 1}
                                </td>
                                {[0, 1, 2].map((col) => {
                                  const colIndex = col as MainCol;
                                  const value = colIndex === 0 ? row.name : colIndex === 1 ? row.priceInput : row.costInput;
                                  return (
                                    <td
                                      key={`${row.rowId}-${colIndex}`}
                                      className="spx-modset-main-cell"
                                      onMouseEnter={() => {
                                        if (!fillState || fillState.setLocalId !== set.localId || fillState.col !== colIndex || rowIndex <= fillState.fromRow) return;
                                        editSet(set.localId, (cur) => {
                                          const rows = [...cur.rows];
                                          const field = colIndex === 0 ? "name" : colIndex === 1 ? "priceInput" : "costInput";
                                          for (let i = fillState.fromRow + 1; i <= rowIndex; i += 1) {
                                            const current = rows[i] ?? createRow();
                                            rows[i] = { ...current, [field]: fillState.value } as ModifySetRowModel;
                                          }
                                          return { ...cur, rows };
                                        });
                                      }}
                                    >
                                      <div className="spx-modset-cell-input-wrap">
                                        <input
                                          className={`spx-input-text spx-modset-cell-input ${rowErrors.length > 0 ? "spx-modset-cell-error" : ""}`}
                                          value={value}
                                          data-set-id={set.localId}
                                          data-row={rowIndex}
                                          data-col={colIndex}
                                          onFocus={() => setActiveCell({ setLocalId: set.localId, row: rowIndex, col: colIndex })}
                                          onChange={(event) => {
                                            const field = colIndex === 0 ? "name" : colIndex === 1 ? "priceInput" : "costInput";
                                            editSet(set.localId, (cur) => {
                                              const rows = [...cur.rows];
                                              const current = rows[rowIndex] ?? createRow();
                                              rows[rowIndex] = { ...current, [field]: event.target.value } as ModifySetRowModel;
                                              return { ...cur, rows };
                                            });
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Delete" && (selectedRows[set.localId] ?? []).length > 0) {
                                              event.preventDefault();
                                              deleteSelectedRows(set.localId);
                                              return;
                                            }
                                            if (
                                              event.key === "ArrowUp" ||
                                              event.key === "ArrowDown" ||
                                              event.key === "ArrowLeft" ||
                                              event.key === "ArrowRight"
                                            ) {
                                              event.preventDefault();
                                              let nextRow = rowIndex;
                                              let nextCol = colIndex;

                                              if (event.key === "ArrowUp") {
                                                nextRow = Math.max(0, rowIndex - 1);
                                              } else if (event.key === "ArrowDown") {
                                                nextRow = Math.min(set.rows.length - 1, rowIndex + 1);
                                              } else if (event.key === "ArrowLeft") {
                                                nextCol = (Math.max(0, colIndex - 1) as MainCol);
                                              } else {
                                                nextCol = (Math.min(2, colIndex + 1) as MainCol);
                                              }

                                              editSet(set.localId, (cur) => ({ ...cur, rows: ensureTrailing(cur.rows) }), false);
                                              focusCell(set.localId, nextRow, nextCol);
                                              return;
                                            }
                                            if (event.key !== "Tab" && event.key !== "Enter") return;
                                            event.preventDefault();
                                            let nextRow = rowIndex;
                                            let nextCol = colIndex;
                                            if (event.key === "Enter") {
                                              nextRow += 1;
                                            } else if (event.shiftKey) {
                                              if (colIndex === 0) {
                                                nextRow = Math.max(0, rowIndex - 1);
                                                nextCol = 2;
                                              } else {
                                                nextCol = (colIndex - 1) as MainCol;
                                              }
                                            } else if (colIndex === 2) {
                                              nextRow += 1;
                                              nextCol = 0;
                                            } else {
                                              nextCol = (colIndex + 1) as MainCol;
                                            }
                                            editSet(set.localId, (cur) => ({ ...cur, rows: ensureTrailing(cur.rows) }), false);
                                            focusCell(set.localId, nextRow, nextCol);
                                          }}
                                          onPaste={(event) => {
                                            const text = event.clipboardData.getData("text/plain");
                                            if (!text.trim()) return;
                                            event.preventDefault();
                                            const preview = parseClipboardToPreview(text);
                                            const payload = { setLocalId: set.localId, startRow: rowIndex, preview };
                                            setPendingPreview(payload);
                                            setLastPreview(payload);
                                          }}
                                        />
                                        {activeCell && activeCell.setLocalId === set.localId && activeCell.row === rowIndex && activeCell.col === colIndex ? (
                                          <button
                                            type="button"
                                            className="spx-modset-fill-handle"
                                            onMouseDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              setFillState({ setLocalId: set.localId, fromRow: rowIndex, col: colIndex, value });
                                            }}
                                            title="Drag to fill down"
                                          />
                                        ) : null}
                                      </div>
                                      {rowErrors.length > 0 ? (
                                        <div className="spx-modset-row-error-inline">{rowErrors.join(" ")}</div>
                                      ) : null}
                                    </td>
                                  );
                                })}
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={row.defaultSelected}
                                    onChange={(event) =>
                                      editSet(set.localId, (cur) => {
                                        const rows = [...cur.rows];
                                        const current = rows[rowIndex] ?? createRow();
                                        rows[rowIndex] = { ...current, defaultSelected: event.target.checked };
                                        return { ...cur, rows };
                                      })
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                </div>

                <div className="spx-modset-card-sidebar">
                  <div style={{ position: "absolute", inset: 0 }}>
                    <div className="spx-modset-linked-items">
                      <div className="spx-modset-linked-items-title">
                        Linked items ({set.mappingItems.length})
                      </div>
                      <div className="spx-modset-linked-items-list">
                        {set.mappingItems.length === 0 ? (
                          <div className="spx-modset-selected-empty">No linked item for this set.</div>
                        ) : (
                          set.mappingItems.map((item) => (
                            <div key={`${set.localId}-${item.clientId}`} className="spx-modset-linked-item-row">
                              <span title={item.clientId}>{item.name}</span>
                              <button
                                type="button"
                                className="spx-icon-btn spx-danger"
                                style={{ padding: 2, background: "transparent" }}
                                title="Remove"
                                onClick={() => {
                                  editSet(set.localId, (cur) => ({
                                    ...cur,
                                    mappingItems: cur.mappingItems.filter(i => i.clientId !== item.clientId)
                                  }));
                                }}
                              >
                                <X />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="spx-modset-add-card" onClick={() => setSets((prev) => [...prev, createSet(prev.length)])}>
            <Plus />
            <span>Add new set</span>
          </div>

        </div>
      </div>

      <div className="spx-modset-footer">
        <button className="spx-tool-btn" style={{ marginRight: "auto" }} onClick={() => (lastPreview ? setPendingPreview(lastPreview) : onStatusText("No preview data yet."))}>
          <Clipboard /> Preview import
        </button>
        <button className="spx-big-btn spx-green" onClick={() => void createAndMap()} disabled={isSubmitting}>
          <Upload /> {isSubmitting ? "Submitting..." : "Create & map"}
        </button>
      </div>

      {pickerTargetSetId ? (
        <div className="spx-modset-preview-overlay">
          <div className="spx-modset-preview-modal">
            <h3>Link items for: {pickerTargetSet?.name?.trim() || "Untitled set"}</h3>
            <div className="spx-modset-items-toolbar">
              <input
                className="spx-input-text spx-modset-search-input"
                placeholder="Search item by name"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const nextKeyword = keywordInput.trim();
                    setKeyword(nextKeyword);
                    setItemPage(1);
                    void loadItems(1, selectedCategoryId, nextKeyword);
                  }
                }}
              />
              <CustomSelect
                value={selectedCategoryId}
                onChange={(value) => {
                  setSelectedCategoryId(value);
                  setItemPage(1);
                  void loadItems(1, value, keyword);
                }}
                placeholder="All categories"
                options={[
                  { value: "", label: "All categories" },
                  ...categoryOptions.map((option) => ({ value: option.value, label: option.label }))
                ]}
              />
              <button
                className="spx-tool-btn"
                onClick={() => {
                  const nextKeyword = keywordInput.trim();
                  setKeyword(nextKeyword);
                  setItemPage(1);
                  void loadItems(1, selectedCategoryId, nextKeyword);
                }}
              >
                <Search /> Search
              </button>
              <button className="spx-tool-btn" onClick={() => void loadItems(itemPage, selectedCategoryId, keyword)}>
                <RefreshCw /> {isLoadingItems ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="spx-modset-picker-grid">
              <div className="spx-modset-preview-table-wrap">
                <table className="spx-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40, textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={() =>
                            setPickerSelectedItemsMap((prev) => {
                              const next = new Map(prev);
                              const full = items.every((item) => next.has(item.client_id));
                              if (full) {
                                for (const item of items) next.delete(item.client_id);
                              } else {
                                for (const item of items) next.set(item.client_id, { clientId: item.client_id, name: item.name });
                              }
                              return next;
                            })
                          }
                        />
                      </th>
                      <th style={{ width: 60 }}>#</th>
                      <th>Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.client_id}>
                        <td style={{ textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
                          <input
                            type="checkbox"
                            checked={pickerSelectedItemsMap.has(item.client_id)}
                            onChange={() =>
                              setPickerSelectedItemsMap((prev) => {
                                const next = new Map(prev);
                                if (next.has(item.client_id)) {
                                  next.delete(item.client_id);
                                } else {
                                  next.set(item.client_id, { clientId: item.client_id, name: item.name });
                                }
                                return next;
                              })
                            }
                          />
                        </td>
                        <td>{(itemPage - 1) * PAGE_LIMIT + index + 1}</td>
                        <td title={item.client_id}>{item.name}</td>
                      </tr>
                    ))}
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: "center" }}>
                          No items found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>

                <div className="spx-pagination">
                  <button
                    className="spx-page-btn"
                    onClick={() => {
                      const next = Math.max(1, itemPage - 1);
                      if (next === itemPage) return;
                      setItemPage(next);
                      void loadItems(next, selectedCategoryId, keyword);
                    }}
                    disabled={itemPage <= 1 || isLoadingItems}
                  >
                    &laquo;
                  </button>
                  <div className="spx-page-input-group">
                    <span id="spx-p-total">Page {itemPage} of {totalPages}</span>
                  </div>
                  <button
                    className="spx-page-btn"
                    onClick={() => {
                      const next = Math.min(totalPages, itemPage + 1);
                      if (next === itemPage) return;
                      setItemPage(next);
                      void loadItems(next, selectedCategoryId, keyword);
                    }}
                    disabled={itemPage >= totalPages || isLoadingItems}
                  >
                    &raquo;
                  </button>
                </div>
              </div>

              <div className="spx-modset-selected-list spx-modset-selected-list-vertical">
                <div className="spx-modset-linked-items-title">Selected items ({selectedItems.length})</div>
                {selectedItems.length === 0 ? (
                  <div className="spx-modset-selected-empty">No selected item.</div>
                ) : (
                  selectedItems.map((item) => (
                    <div key={item.clientId} className="spx-modset-linked-item-row">
                      <span title={item.clientId}>{item.name}</span>
                      <button
                        type="button"
                        className="spx-icon-btn spx-danger"
                        title="Remove"
                        onClick={() =>
                          setPickerSelectedItemsMap((prev) => {
                            const next = new Map(prev);
                            next.delete(item.clientId);
                            return next;
                          })
                        }
                      >
                        <X />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="spx-modset-preview-actions">
              <button
                className="spx-tool-btn"
                onClick={closeMappingPicker}
              >
                <X /> Cancel
              </button>
              <button className="spx-big-btn spx-green" onClick={confirmMappingPicker} disabled={selectedItems.length === 0}>
                <Check /> Confirm link items
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingPreview ? (
        <div className="spx-modset-preview-overlay">
          <div className="spx-modset-preview-modal">
            <h3>Preview import</h3>
            <p>
              Total: {pendingPreview.preview.totalRows} | Valid: {pendingPreview.preview.validRows} | Invalid: {pendingPreview.preview.invalidRows}
            </p>
            <div className="spx-modset-preview-table-wrap">
              <table className="spx-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Line</th>
                    <th>Name</th>
                    <th style={{ width: 140 }}>Price</th>
                    <th style={{ width: 140 }}>Cost</th>
                    <th style={{ width: 220 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPreview.preview.rows.map((row) => (
                    <tr key={`preview-${row.lineNumber}-${row.name}`}>
                      <td>{row.lineNumber}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.priceInput || "-"}</td>
                      <td>{row.costInput || "-"}</td>
                      <td>
                        {row.errors.length === 0 ? (
                          <span className="spx-row-status spx-success">Valid</span>
                        ) : (
                          <span className="spx-row-status spx-failed">{row.errors.join(" ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="spx-modset-preview-actions">
              <button className="spx-tool-btn" onClick={() => setPendingPreview(null)}>
                <X /> Close
              </button>
              <button
                className="spx-big-btn spx-green"
                onClick={() => {
                  if (pendingPreview.preview.invalidRows > 0) return;
                  editSet(pendingPreview.setLocalId, (set) => {
                    const rows = [...set.rows];
                    for (let i = 0; i < pendingPreview.preview.rows.length; i += 1) {
                      const parsed = pendingPreview.preview.rows[i];
                      if (!parsed) continue;
                      const target = pendingPreview.startRow + i;
                      while (rows.length <= target) rows.push(createRow());
                      const current = rows[target] ?? createRow();
                      rows[target] = {
                        ...current,
                        name: parsed.name,
                        priceInput: parsed.priceInput,
                        costInput: parsed.costInput
                      };
                    }
                    return { ...set, rows };
                  });
                  setPendingPreview(null);
                  onStatusText("Paste preview imported.");
                }}
                disabled={pendingPreview.preview.invalidRows > 0}
              >
                <Check /> Import to sheet
              </button>
            </div>
            {pendingPreview.preview.invalidRows > 0 ? (
              <div className="spx-modset-error">
                Import blocked because there are invalid rows. Please fix and paste again.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
