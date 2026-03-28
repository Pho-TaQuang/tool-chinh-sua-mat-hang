import React from "react";
import { ChevronDown, ChevronUp, LinkIcon, RotateCcw, Trash } from "../../ui/icons";
import { isFailureStatus } from "../runner";
import type { ActiveCell, FillState, MainCol, ModifySetCardModel } from "../types";
import { buildRowErrorMap, statusLabel, statusTone } from "../view";
import { ModifySetLinkedItems } from "./ModifySetLinkedItems";
import { ModifySetSheet } from "./ModifySetSheet";

interface ModifySetCardProps {
  set: ModifySetCardModel;
  setIndex: number;
  selectedRowIds: string[];
  activeCell: ActiveCell | null;
  fillState: FillState | null;
  onRetry: () => void;
  onOpenMappingPicker: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onNameChange: (value: string) => void;
  onMinQuantityChange: (value: number) => void;
  onMaxQuantityChange: (value: number) => void;
  onAllowMultipleChange: (value: boolean) => void;
  onSelectRow: (rowIndex: number, shiftKey: boolean) => void;
  onCellFocus: (row: number, col: MainCol) => void;
  onCellChange: (row: number, col: MainCol, value: string) => void;
  onDeleteSelectedRows: () => void;
  onEnsureTrailingRows: () => void;
  onPasteText: (rowIndex: number, text: string) => void;
  onFillStart: (row: number, col: MainCol, value: string) => void;
  onFillHover: (row: number, col: MainCol) => void;
  onDefaultSelectedChange: (rowIndex: number, checked: boolean) => void;
  onRemoveLinkedItem: (itemClientId: string) => void;
}

export function ModifySetCard({
  set,
  setIndex,
  selectedRowIds,
  activeCell,
  fillState,
  onRetry,
  onOpenMappingPicker,
  onToggleCollapse,
  onDelete,
  onNameChange,
  onMinQuantityChange,
  onMaxQuantityChange,
  onAllowMultipleChange,
  onSelectRow,
  onCellFocus,
  onCellChange,
  onDeleteSelectedRows,
  onEnsureTrailingRows,
  onPasteText,
  onFillStart,
  onFillHover,
  onDefaultSelectedChange,
  onRemoveLinkedItem
}: ModifySetCardProps): React.JSX.Element {
  const rowErrorMap = buildRowErrorMap(set.validationErrors.rowErrors);

  return (
    <div className="spx-card spx-modset-card">
      <div className="spx-modset-card-main">
        <div className="spx-modset-card-header">
          <div>
            <div className="spx-modset-card-title-row">
              <strong>{set.name.trim() || `Set ${setIndex + 1}`}</strong>
              <span className={`spx-row-status ${statusTone(set.status)}`}>{statusLabel(set.status)}</span>
            </div>
            <div className="spx-modset-card-subtitle">Valid options: {set.validationErrors.validRowCount}</div>
          </div>
          <div className="spx-modset-card-actions">
            {isFailureStatus(set.status) ? (
              <button className="spx-icon-btn spx-warning" onClick={onRetry} title="Retry">
                <RotateCcw />
              </button>
            ) : null}
            <button className="spx-tool-btn" onClick={onOpenMappingPicker}>
              <LinkIcon /> Link ({set.mappingItems.length})
            </button>
            <button className="spx-icon-btn" onClick={onToggleCollapse} title={set.collapsed ? "Expand" : "Collapse"}>
              {set.collapsed ? <ChevronDown /> : <ChevronUp />}
            </button>
            <button className="spx-icon-btn spx-danger" title="Delete set" onClick={onDelete}>
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
                  onChange={(event) => onNameChange(event.target.value)}
                />
              </label>
              <label>
                Min qty
                <input
                  type="number"
                  className="spx-input-text spx-modset-input"
                  value={set.minQuantity}
                  onChange={(event) => onMinQuantityChange(Number(event.target.value) || 0)}
                />
              </label>
              <label>
                Max qty
                <input
                  type="number"
                  className="spx-input-text spx-modset-input"
                  value={set.maxQuantity}
                  onChange={(event) => onMaxQuantityChange(Number(event.target.value) || 0)}
                />
              </label>
              <label className="spx-modset-checkbox-label">
                <input
                  type="checkbox"
                  checked={set.allowMultipleQuantity}
                  onChange={(event) => onAllowMultipleChange(event.target.checked)}
                />
                Allow multiple quantity
              </label>
            </div>

            <ModifySetSheet
              set={set}
              selectedRowIds={selectedRowIds}
              rowErrorMap={rowErrorMap}
              activeCell={activeCell}
              fillState={fillState}
              onSelectRow={onSelectRow}
              onCellFocus={onCellFocus}
              onCellChange={onCellChange}
              onDeleteSelectedRows={onDeleteSelectedRows}
              onEnsureTrailingRows={onEnsureTrailingRows}
              onPasteText={onPasteText}
              onFillStart={onFillStart}
              onFillHover={onFillHover}
              onDefaultSelectedChange={onDefaultSelectedChange}
            />
          </div>
        )}
      </div>

      <div className="spx-modset-card-sidebar">
        <div style={{ position: "absolute", inset: 0 }}>
          <ModifySetLinkedItems setLocalId={set.localId} items={set.mappingItems} onRemove={onRemoveLinkedItem} />
        </div>
      </div>
    </div>
  );
}
