import React from "react";
import "./styles.css";
import { Plus } from "../ui/icons";
import { ModifySetCard } from "./components/ModifySetCard";
import { ModifySetPasteOverflowModal } from "./components/ModifySetPasteOverflowModal";
import { ModifySetPickerModal } from "./components/ModifySetPickerModal";
import { ModifySetToolbar } from "./components/ModifySetToolbar";
import { ModifySetTransferCard } from "./components/ModifySetTransferCard";
import { useModifySetCatalog } from "./hooks/useModifySetCatalog";
import { useModifySetEditor } from "./hooks/useModifySetEditor";
import { useModifySetSubmission } from "./hooks/useModifySetSubmission";
import {
  createServerModifySetExportFile,
  downloadTextFile,
  type ModifySetExportFormat
} from "./export";
import { importModifySetsFromFile, type ModifySetImportFormat } from "./import";
import type { MainCol, ModifySetTabProps } from "./types";

function toMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function ModifySetTab({ apiClient, onStatusText, onShowToast, onDebugLog }: ModifySetTabProps): React.JSX.Element {
  const [isExporting, setIsExporting] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
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

  const handleExport = async (format: ModifySetExportFormat): Promise<void> => {
    if (!apiClient) {
      onStatusText("Modify set export unavailable until Sapo context is ready.");
      onShowToast("Export unavailable until Sapo context is ready.", "warn");
      return;
    }

    setIsExporting(true);
    onStatusText(`Exporting server modify sets as ${format.toUpperCase()}...`);
    void onDebugLog?.("info", "Exporting server modify sets", { format });

    try {
      const file = await createServerModifySetExportFile(apiClient, format);
      downloadTextFile(file.fileName, file.contents, file.mimeType);
      onStatusText(
        `Exported ${file.document.total_mod_sets} modify set(s) after scanning ${file.document.total_items_scanned} item(s).`
      );
      onShowToast(`Exported ${file.document.total_mod_sets} modify set(s).`, "success");
      void onDebugLog?.("info", "Server modify set export completed", {
        format,
        fileName: file.fileName,
        totalModSets: file.document.total_mod_sets,
        totalItemsScanned: file.document.total_items_scanned
      });
    } catch (error: unknown) {
      const message = toMessage(error);
      onStatusText(`Modify set export failed: ${message}`);
      onShowToast("Modify set export failed.", "error");
      void onDebugLog?.("error", "Server modify set export failed", { format, error: message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (format: ModifySetImportFormat, file: File): Promise<void> => {
    setIsImporting(true);
    onStatusText(`Importing modify sets from ${file.name}...`);
    void onDebugLog?.("info", "Importing modify sets from file", { format, fileName: file.name });

    try {
      const importedSets = await importModifySetsFromFile(format, file);
      editor.replaceSets(importedSets);
      onStatusText(`Imported ${importedSets.length} modify set(s) from ${file.name}.`);
      onShowToast(`Imported ${importedSets.length} modify set(s).`, "success");
      void onDebugLog?.("info", "Modify set import completed", {
        format,
        fileName: file.name,
        totalModSets: importedSets.length
      });
    } catch (error: unknown) {
      const message = toMessage(error);
      onStatusText(`Modify set import failed: ${message}`);
      onShowToast("Modify set import failed.", "error");
      void onDebugLog?.("error", "Modify set import failed", { format, fileName: file.name, error: message });
    } finally {
      setIsImporting(false);
    }
  };

  const isTransferBusy = isExporting || isImporting || editor.state.isSubmitting;

  return (
    <div className="spx-modset-layout" onKeyDownCapture={handleTabHotkeys}>
      <div className="spx-modset-grid">
        <div className="spx-modset-sets-panel">
          <ModifySetTransferCard
            isBusy={isTransferBusy}
            canExport={Boolean(apiClient)}
            onExport={(format) => void handleExport(format)}
            onImport={(format, file) => void handleImport(format, file)}
          />

          <ModifySetToolbar
            isSubmitting={editor.state.isSubmitting}
            isActionDisabled={isExporting || isImporting}
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
