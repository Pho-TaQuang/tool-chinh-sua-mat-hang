import React from "react";
import "./styles.css";
import { Plus } from "../ui/icons";
import { ModifySetCard } from "./components/ModifySetCard";
import { ModifySetPasteOverflowModal } from "./components/ModifySetPasteOverflowModal";
import { ModifySetPickerModal } from "./components/ModifySetPickerModal";
import { ModifySetToolbar } from "./components/ModifySetToolbar";
import { useModifySetCatalog } from "./hooks/useModifySetCatalog";
import { useModifySetEditor } from "./hooks/useModifySetEditor";
import { useModifySetSubmission } from "./hooks/useModifySetSubmission";
import type { MainCol, ModifySetTabProps } from "./types";

export function ModifySetTab({ apiClient, onStatusText, onShowToast, onDebugLog }: ModifySetTabProps): React.JSX.Element {
  const editor = useModifySetEditor();
  const catalog = useModifySetCatalog(apiClient, onStatusText);
  const submission = useModifySetSubmission({
    apiClient,
    sets: editor.state.sets,
    onStatusText,
    onShowToast,
    onDebugLog,
    patchSetStatus: editor.patchSetStatus,
    replaceSets: editor.replaceSets,
    setSubmitting: editor.setSubmitting,
    editSet: editor.editSet
  });

  const allPageSelected =
    catalog.items.length > 0 && catalog.items.every((item) => editor.state.pickerSelectedItemsMap.has(item.client_id));

  const handleTogglePickerItem = (item: { client_id: string; name: string }) => {
    const next = new Map(editor.state.pickerSelectedItemsMap);
    if (next.has(item.client_id)) {
      next.delete(item.client_id);
    } else {
      next.set(item.client_id, { clientId: item.client_id, name: item.name });
    }
    editor.setPickerSelectionMap(next);
  };

  const handleToggleAllPickerItems = () => {
    const next = new Map(editor.state.pickerSelectedItemsMap);
    if (allPageSelected) {
      for (const item of catalog.items) {
        next.delete(item.client_id);
      }
    } else {
      for (const item of catalog.items) {
        next.set(item.client_id, { clientId: item.client_id, name: item.name });
      }
    }
    editor.setPickerSelectionMap(next);
  };

  const handleRemoveSelectedPickerItem = (clientId: string) => {
    const next = new Map(editor.state.pickerSelectedItemsMap);
    next.delete(clientId);
    editor.setPickerSelectionMap(next);
  };

  const handleFillStart = (setLocalId: string, row: number, col: MainCol, value: string) => {
    editor.startFill({
      setLocalId,
      fromRow: row,
      col,
      value
    });
  };

  const handleTabHotkeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      editor.undo();
      return;
    }

    if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      editor.redo();
    }
  };

  return (
    <div className="spx-modset-layout" onKeyDownCapture={handleTabHotkeys}>
      <div className="spx-modset-grid">
        <div className="spx-modset-sets-panel">
          <ModifySetToolbar
            isSubmitting={editor.state.isSubmitting}
            completed={editor.progress.completed}
            total={editor.progress.total}
            percent={editor.progress.percent}
            processingSet={editor.progress.processingSet}
            onCreateAndMap={() => void submission.createAndMap()}
          />

          {editor.state.sets.map((set, setIndex) => (
            <ModifySetCard
              key={set.localId}
              set={set}
              setIndex={setIndex}
              selectedRowIds={editor.state.selectedRowsBySetId[set.localId] ?? []}
              activeCell={editor.state.activeCell}
              fillState={editor.state.fillState}
              onRetry={() => void submission.retryOne(set)}
              onOpenMappingPicker={() => editor.openMappingPicker(set.localId)}
              onToggleCollapse={() => editor.editSet(set.localId, (current) => ({ ...current, collapsed: !current.collapsed }), false)}
              onDelete={() => editor.deleteSet(set.localId)}
              onNameChange={(value) => editor.editSet(set.localId, (current) => ({ ...current, name: value }))}
              onMinQuantityChange={(value) => editor.editSet(set.localId, (current) => ({ ...current, minQuantity: value }))}
              onMaxQuantityChange={(value) =>
                editor.editSet(set.localId, (current) => ({
                  ...current,
                  maxQuantity: value,
                  isMaxQuantityEdited: true
                }))
              }
              onAllowMultipleChange={(value) =>
                editor.editSet(set.localId, (current) => ({ ...current, allowMultipleQuantity: value }))
              }
              onSelectRow={(rowIndex, shiftKey) => editor.selectRows(set.localId, rowIndex, shiftKey)}
              onCellFocus={(row, col) => editor.setActiveCell({ setLocalId: set.localId, row, col })}
              onCellChange={(row, col, value) =>
                editor.editSet(set.localId, (current) => {
                  const rows = [...current.rows];
                  const field = col === 0 ? "name" : col === 1 ? "priceInput" : "costInput";
                  const targetRow = rows[row];
                  if (!targetRow) {
                    return current;
                  }
                  rows[row] = {
                    ...targetRow,
                    [field]: value
                  };
                  return {
                    ...current,
                    rows
                  };
                })
              }
              onDeleteSelectedRows={() => editor.deleteSelectedRows(set.localId)}
              onDeleteRow={(rowIndex) => editor.deleteRow(set.localId, rowIndex)}
              onEnsureTrailingRows={() => editor.ensureTrailingForSet(set.localId)}
              onPasteText={(rowIndex, colIndex, text) => {
                const result = editor.requestPaste(set.localId, rowIndex, colIndex, text);
                if (result === "empty") {
                  onStatusText("Clipboard data is empty.");
                  return;
                }
                if (result === "overflow") {
                  onStatusText("Pasted data has overflow columns. Confirm to continue or cancel.");
                }
              }}
              onFillStart={(row, col, value) => handleFillStart(set.localId, row, col, value)}
              onFillHover={(row, col) => editor.applyFillHover(set.localId, row, col)}
              onDefaultSelectedChange={(rowIndex, checked) =>
                editor.editSet(set.localId, (current) => {
                  const rows = [...current.rows];
                  const targetRow = rows[rowIndex];
                  if (!targetRow) {
                    return current;
                  }
                  rows[rowIndex] = {
                    ...targetRow,
                    defaultSelected: checked
                  };
                  return {
                    ...current,
                    rows
                  };
                })
              }
              onRemoveLinkedItem={(itemClientId) =>
                editor.editSet(set.localId, (current) => ({
                  ...current,
                  mappingItems: current.mappingItems.filter((item) => item.clientId !== itemClientId)
                }))
              }
            />
          ))}

          <div className="spx-modset-add-card" onClick={editor.addSet}>
            <Plus />
            <span>Add new set</span>
          </div>
        </div>
      </div>

      <ModifySetPickerModal
        targetSet={editor.pickerTargetSet}
        items={catalog.items}
        selectedItems={editor.selectedPickerItems}
        selectedItemsMap={editor.state.pickerSelectedItemsMap}
        allPageSelected={allPageSelected}
        itemPage={catalog.itemPage}
        totalPages={catalog.totalPages}
        keywordInput={catalog.keywordInput}
        selectedCategoryId={catalog.selectedCategoryId}
        categoryOptions={catalog.categoryOptions}
        isLoadingItems={catalog.isLoadingItems}
        onKeywordInputChange={catalog.setKeywordInput}
        onSearch={() => void catalog.search()}
        onCategoryChange={(value) => {
          void catalog.changeCategory(value);
        }}
        onRefresh={() => void catalog.refresh()}
        onToggleAllPage={handleToggleAllPickerItems}
        onToggleItem={handleTogglePickerItem}
        onRemoveSelectedItem={handleRemoveSelectedPickerItem}
        onPrevPage={() => void catalog.goToPrevPage()}
        onNextPage={() => void catalog.goToNextPage()}
        onClose={editor.closeMappingPicker}
        onConfirm={editor.confirmMappingPicker}
      />

      <ModifySetPasteOverflowModal
        pendingPasteOverflow={editor.state.pendingPasteOverflow}
        onCancel={editor.cancelOverflowPaste}
        onContinue={editor.confirmOverflowPaste}
      />
    </div>
  );
}
