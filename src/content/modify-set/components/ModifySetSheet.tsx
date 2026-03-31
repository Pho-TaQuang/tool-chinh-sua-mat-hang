import React from "react";
import { Trash } from "../../ui/icons";
import { fieldForMainColumn, getNextCellPosition } from "../grid";
import { applyPriceOneShotSuffix } from "../price-input";
import { buildCellErrorKey } from "../view";
import type { ActiveCell, FillState, MainCol, ModifySetRowModel } from "../types";

interface ModifySetSheetProps {
  sheetId: string;
  setLocalId: string;
  rows: ModifySetRowModel[];
  selectedRowIds: string[];
  cellErrorMap: Map<string, string[]>;
  activeCell: ActiveCell | null;
  fillState: FillState | null;
  onSelectRow: (rowIndex: number, shiftKey: boolean) => void;
  onCellFocus: (row: number, col: MainCol) => void;
  onCellChange: (row: number, col: MainCol, value: string) => void;
  onDeleteSelectedRows: () => void;
  onDeleteRow: (rowIndex: number) => void;
  onEnsureTrailingRows: () => void;
  onPasteText: (row: number, col: MainCol, text: string) => void;
  onFillStart: (row: number, col: MainCol, value: string) => void;
  onFillHover: (row: number, col: MainCol) => void;
  onDefaultSelectedChange: (row: number, checked: boolean) => void;
}

interface EditingCell {
  row: number;
  col: MainCol;
}

interface EditHint {
  row: number;
  col: MainCol;
}

function isSameEditingCell(current: EditingCell | null, row: number, col: MainCol): boolean {
  return Boolean(current && current.row === row && current.col === col);
}

function isPrintableKey(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function ModifySetSheet({
  sheetId,
  setLocalId,
  rows,
  selectedRowIds,
  cellErrorMap,
  activeCell,
  fillState,
  onSelectRow,
  onCellFocus,
  onCellChange,
  onDeleteSelectedRows,
  onDeleteRow,
  onEnsureTrailingRows,
  onPasteText,
  onFillStart,
  onFillHover,
  onDefaultSelectedChange
}: ModifySetSheetProps): React.JSX.Element {
  const selectedSet = new Set(selectedRowIds);
  const [editingCell, setEditingCell] = React.useState<EditingCell | null>(null);
  const [editHint, setEditHint] = React.useState<EditHint | null>(null);
  const hintTimerRef = React.useRef<number | null>(null);
  const pendingDoubleClickCaretRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const showDoubleClickHint = (row: number, col: MainCol) => {
    setEditHint({ row, col });

    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = window.setTimeout(() => {
      setEditHint(null);
      hintTimerRef.current = null;
    }, 1200);
  };

  const focusCell = (row: number, col: MainCol) => {
    const boundedRow = Math.max(0, row);

    requestAnimationFrame(() => {
      const selector = `input[data-sheet-id="${sheetId}"][data-row="${boundedRow}"][data-col="${col}"]`;
      const cell = document.querySelector<HTMLInputElement>(selector);
      if (!cell) {
        return;
      }
      cell.focus();
      cell.select();
      setEditingCell(null);
    });
  };

  const enterEditMode = (
    row: number,
    col: MainCol,
    input: HTMLInputElement,
    options?: { caretAtEnd?: boolean; explicitCaret?: number }
  ) => {
    setEditHint(null);
    setEditingCell({ row, col });
    requestAnimationFrame(() => {
      if (document.activeElement !== input) {
        input.focus();
      }
      const explicitCaret = options?.explicitCaret;
      const caret =
        typeof explicitCaret === "number"
          ? explicitCaret
          : options?.caretAtEnd
            ? input.value.length
            : input.selectionEnd ?? input.value.length;
      input.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="spx-modset-sheet-wrap">
      <table className="spx-modset-sheet">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Name</th>
            <th style={{ width: 140 }}>Price</th>
            <th style={{ width: 140 }}>Cost</th>
            <th style={{ width: 70 }}>Default</th>
            <th style={{ width: 56 }}>Delete</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const selected = selectedSet.has(row.rowId);

            return (
              <tr key={row.rowId} className={selected ? "spx-modset-sheet-row-selected" : ""}>
                <td
                  className="spx-modset-row-index"
                  onClick={(event) => {
                    onSelectRow(rowIndex, event.shiftKey);
                  }}
                >
                  {rowIndex + 1}
                </td>
                {[0, 1, 2].map((col) => {
                  const colIndex = col as MainCol;
                  const field = fieldForMainColumn(colIndex);
                  const value = row[field];
                  const isEditing = isSameEditingCell(editingCell, rowIndex, colIndex);
                  const showCellHint = editHint?.row === rowIndex && editHint.col === colIndex;
                  const cellErrors = cellErrorMap.get(buildCellErrorKey(row.rowId, field)) ?? [];

                  return (
                    <td
                      key={`${row.rowId}-${colIndex}`}
                      className="spx-modset-main-cell"
                      onMouseEnter={() => {
                        if (!fillState) {
                          return;
                        }
                        onFillHover(rowIndex, colIndex);
                      }}
                    >
                      {showCellHint ? <div className="spx-modset-cell-edit-hint">Double click to edit</div> : null}
                      <div className="spx-modset-cell-input-wrap">
                        <input
                          className={`spx-input-text spx-modset-cell-input ${
                            isEditing ? "spx-modset-cell-input-editing" : "spx-modset-cell-input-select"
                          } ${cellErrors.length > 0 ? "spx-modset-cell-error" : ""}`}
                          value={value}
                          readOnly={!isEditing}
                          data-sheet-id={sheetId}
                          data-set-id={setLocalId}
                          data-row={rowIndex}
                          data-col={colIndex}
                          onFocus={() => {
                            onCellFocus(rowIndex, colIndex);
                          }}
                          onMouseDown={(event) => {
                            if (isEditing) {
                              return;
                            }

                            if (event.detail === 2) {
                              pendingDoubleClickCaretRef.current = event.currentTarget.selectionStart;
                              event.preventDefault();
                              return;
                            }

                            pendingDoubleClickCaretRef.current = null;
                          }}
                          onDoubleClick={(event) => {
                            if (isEditing) {
                              return;
                            }

                            event.preventDefault();
                            const explicitCaret =
                              pendingDoubleClickCaretRef.current ?? event.currentTarget.selectionStart ?? 0;
                            pendingDoubleClickCaretRef.current = null;
                            setEditHint(null);
                            setEditingCell({ row: rowIndex, col: colIndex });
                            requestAnimationFrame(() => {
                              if (document.activeElement === event.currentTarget) {
                                event.currentTarget.setSelectionRange(explicitCaret, explicitCaret);
                              }
                            });
                          }}
                          onBlur={() => {
                            if (isEditing) {
                              setEditingCell(null);
                            }
                          }}
                          onChange={(event) => {
                            if (colIndex !== 1) {
                              onCellChange(rowIndex, colIndex, event.target.value);
                              return;
                            }

                            const nativeEvent = event.nativeEvent as InputEvent;
                            const transformed = applyPriceOneShotSuffix({
                              previousValue: value,
                              rawValue: event.target.value,
                              inputType: nativeEvent.inputType,
                              inputData: nativeEvent.data
                            });

                            onCellChange(rowIndex, colIndex, transformed.value);
                            if (transformed.applied && transformed.caret !== null) {
                              requestAnimationFrame(() => {
                                if (document.activeElement === event.currentTarget) {
                                  event.currentTarget.setSelectionRange(transformed.caret, transformed.caret);
                                }
                              });
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape" && isEditing) {
                              event.preventDefault();
                              setEditingCell(null);
                              requestAnimationFrame(() => {
                                event.currentTarget.select();
                              });
                              return;
                            }

                            if (!isEditing && event.key === "Delete" && selectedRowIds.length > 0) {
                              event.preventDefault();
                              onDeleteSelectedRows();
                              return;
                            }

                            if (!isEditing && isPrintableKey(event)) {
                              if (!value.trim()) {
                                event.preventDefault();

                                if (colIndex === 1) {
                                  const transformed = applyPriceOneShotSuffix({
                                    previousValue: value,
                                    rawValue: event.key,
                                    inputType: "insertText",
                                    inputData: event.key
                                  });
                                  onCellChange(rowIndex, colIndex, transformed.value);
                                  enterEditMode(rowIndex, colIndex, event.currentTarget, {
                                    explicitCaret: transformed.applied ? transformed.caret ?? undefined : undefined,
                                    caretAtEnd: !transformed.applied
                                  });
                                } else {
                                  onCellChange(rowIndex, colIndex, event.key);
                                  enterEditMode(rowIndex, colIndex, event.currentTarget, { caretAtEnd: true });
                                }
                              } else {
                                event.preventDefault();
                                showDoubleClickHint(rowIndex, colIndex);
                              }
                              return;
                            }

                            const navigationKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
                            if (navigationKeys.includes(event.key as (typeof navigationKeys)[number])) {
                              if (isEditing) {
                                return;
                              }

                              event.preventDefault();
                              const next = getNextCellPosition({
                                key: event.key as (typeof navigationKeys)[number],
                                rowIndex,
                                colIndex,
                                rowCount: rows.length
                              });
                              onEnsureTrailingRows();
                              focusCell(next.row, next.col);
                              return;
                            }

                            if (event.key !== "Tab" && event.key !== "Enter") {
                              return;
                            }

                            event.preventDefault();
                            if (isEditing) {
                              setEditingCell(null);
                            }

                            const next = getNextCellPosition({
                              key: event.key,
                              rowIndex,
                              colIndex,
                              rowCount: rows.length,
                              shiftKey: event.shiftKey
                            });
                            onEnsureTrailingRows();
                            focusCell(next.row, next.col);
                          }}
                          onPaste={(event) => {
                            const text = event.clipboardData.getData("text/plain");
                            if (!text.trim()) {
                              return;
                            }

                            event.preventDefault();
                            onPasteText(rowIndex, colIndex, text);
                          }}
                        />
                        {activeCell &&
                        activeCell.setLocalId === setLocalId &&
                        activeCell.row === rowIndex &&
                        activeCell.col === colIndex ? (
                          <button
                            type="button"
                            className="spx-modset-fill-handle"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onFillStart(rowIndex, colIndex, value);
                            }}
                            title="Drag to fill down"
                          />
                        ) : null}
                      </div>
                      {cellErrors.length > 0 ? <div className="spx-modset-row-error-inline">{cellErrors.join(" ")}</div> : null}
                    </td>
                  );
                })}
                <td>
                  <input
                    type="checkbox"
                    checked={row.defaultSelected}
                    onChange={(event) => onDefaultSelectedChange(rowIndex, event.target.checked)}
                  />
                </td>
                <td className="spx-modset-row-action">
                  <button
                    type="button"
                    className="spx-icon-btn spx-danger spx-modset-row-delete-btn"
                    onClick={() => {
                      setEditHint(null);
                      setEditingCell(null);
                      onDeleteRow(rowIndex);
                    }}
                    title="Delete row"
                  >
                    <Trash />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
