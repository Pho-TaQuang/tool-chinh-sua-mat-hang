import React from "react";
import { fieldForMainColumn, getNextCellPosition } from "../grid";
import type {
  ActiveCell,
  FillState,
  MainCol,
  ModifySetCardModel
} from "../types";

interface ModifySetSheetProps {
  set: ModifySetCardModel;
  selectedRowIds: string[];
  rowErrorMap: Map<string, string[]>;
  activeCell: ActiveCell | null;
  fillState: FillState | null;
  onSelectRow: (rowIndex: number, shiftKey: boolean) => void;
  onCellFocus: (row: number, col: MainCol) => void;
  onCellChange: (row: number, col: MainCol, value: string) => void;
  onDeleteSelectedRows: () => void;
  onEnsureTrailingRows: () => void;
  onPasteText: (row: number, text: string) => void;
  onFillStart: (row: number, col: MainCol, value: string) => void;
  onFillHover: (row: number, col: MainCol) => void;
  onDefaultSelectedChange: (row: number, checked: boolean) => void;
}

export function ModifySetSheet({
  set,
  selectedRowIds,
  rowErrorMap,
  activeCell,
  fillState,
  onSelectRow,
  onCellFocus,
  onCellChange,
  onDeleteSelectedRows,
  onEnsureTrailingRows,
  onPasteText,
  onFillStart,
  onFillHover,
  onDefaultSelectedChange
}: ModifySetSheetProps): React.JSX.Element {
  const selectedSet = new Set(selectedRowIds);

  const focusCell = (row: number, col: MainCol) => {
    requestAnimationFrame(() => {
      const selector = `input[data-set-id="${set.localId}"][data-row="${row}"][data-col="${col}"]`;
      const cell = document.querySelector<HTMLInputElement>(selector);
      cell?.focus();
      cell?.select();
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
          </tr>
        </thead>
        <tbody>
          {set.rows.map((row, rowIndex) => {
            const selected = selectedSet.has(row.rowId);
            const rowErrors = rowErrorMap.get(row.rowId) ?? [];

            return (
              <tr key={row.rowId} className={selected ? "spx-modset-sheet-row-selected" : ""}>
                <td className="spx-modset-row-index" onClick={(event) => onSelectRow(rowIndex, event.shiftKey)}>
                  {rowIndex + 1}
                </td>
                {[0, 1, 2].map((col) => {
                  const colIndex = col as MainCol;
                  const field = fieldForMainColumn(colIndex);
                  const value = row[field];

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
                      <div className="spx-modset-cell-input-wrap">
                        <input
                          className={`spx-input-text spx-modset-cell-input ${rowErrors.length > 0 ? "spx-modset-cell-error" : ""}`}
                          value={value}
                          data-set-id={set.localId}
                          data-row={rowIndex}
                          data-col={colIndex}
                          onFocus={() => onCellFocus(rowIndex, colIndex)}
                          onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Delete" && selectedRowIds.length > 0) {
                              event.preventDefault();
                              onDeleteSelectedRows();
                              return;
                            }

                            const navigationKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
                            if (navigationKeys.includes(event.key as (typeof navigationKeys)[number])) {
                              event.preventDefault();
                              const next = getNextCellPosition({
                                key: event.key as (typeof navigationKeys)[number],
                                rowIndex,
                                colIndex,
                                rowCount: set.rows.length
                              });
                              onEnsureTrailingRows();
                              focusCell(next.row, next.col);
                              return;
                            }

                            if (event.key !== "Tab" && event.key !== "Enter") {
                              return;
                            }

                            event.preventDefault();
                            const next = getNextCellPosition({
                              key: event.key,
                              rowIndex,
                              colIndex,
                              rowCount: set.rows.length,
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
                            onPasteText(rowIndex, text);
                          }}
                        />
                        {activeCell &&
                        activeCell.setLocalId === set.localId &&
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
                      {rowErrors.length > 0 ? <div className="spx-modset-row-error-inline">{rowErrors.join(" ")}</div> : null}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
