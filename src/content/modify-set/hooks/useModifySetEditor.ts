import { useEffect, useMemo, useReducer, useRef } from "react";
import { createRow, ensureTrailingRows } from "../defaults";
import { hasClipboardOverflow, parseClipboardGrid } from "../parser";
import { toggleRowSelectionRange } from "../grid";
import type {
  ActiveCell,
  FillState,
  MainCol,
  ModifySetCardModel,
  ModifySetLinkedItem,
  PendingPasteOverflow
} from "../types";
import { getModifySetProgress } from "../view";
import {
  createInitialModifySetEditorState,
  modifySetEditorReducer,
  type ModifySetEditorHistorySnapshot,
  type ModifySetEditorState
} from "../state/editor.reducer";
import { getPickerTargetSet, getSelectedPickerItems } from "../state/editor.selectors";

const MAX_HISTORY_DEPTH = 100;

function clonePendingPasteOverflow(overflow: PendingPasteOverflow | null): PendingPasteOverflow | null {
  if (!overflow) {
    return null;
  }

  return {
    setLocalId: overflow.setLocalId,
    startRow: overflow.startRow,
    startCol: overflow.startCol,
    clipboardGrid: overflow.clipboardGrid.map((row) => [...row])
  };
}

function cloneHistorySnapshot(snapshot: ModifySetEditorHistorySnapshot): ModifySetEditorHistorySnapshot {
  return {
    sets: snapshot.sets.map((set) => ({
      ...set,
      mappingItems: set.mappingItems.map((item) => ({ ...item })),
      rows: set.rows.map((row) => ({ ...row })),
      validationErrors: {
        ...set.validationErrors,
        setErrors: set.validationErrors.setErrors.map((error) => ({ ...error })),
        rowErrors: set.validationErrors.rowErrors.map((error) => ({ ...error }))
      }
    })),
    selectedRowsBySetId: Object.fromEntries(
      Object.entries(snapshot.selectedRowsBySetId).map(([setId, rowIds]) => [setId, [...rowIds]])
    ),
    rowAnchorsBySetId: { ...snapshot.rowAnchorsBySetId },
    activeCell: snapshot.activeCell ? { ...snapshot.activeCell } : null,
    pendingPasteOverflow: clonePendingPasteOverflow(snapshot.pendingPasteOverflow)
  };
}

export interface ModifySetEditorHandle {
  state: ModifySetEditorState;
  selectedPickerItems: ModifySetLinkedItem[];
  pickerTargetSet: ModifySetCardModel | null;
  progress: ReturnType<typeof getModifySetProgress>;
  editSet: (localId: string, updater: (set: ModifySetCardModel) => ModifySetCardModel, userEdit?: boolean) => void;
  ensureTrailingForSet: (localId: string) => void;
  openMappingPicker: (localId: string) => void;
  closeMappingPicker: () => void;
  confirmMappingPicker: () => void;
  setPickerSelectionMap: (selectionMap: Map<string, ModifySetLinkedItem>) => void;
  setActiveCell: (activeCell: ActiveCell | null) => void;
  selectRows: (localId: string, rowIndex: number, shiftKey: boolean) => void;
  deleteSelectedRows: (localId: string) => void;
  deleteRow: (localId: string, rowIndex: number) => void;
  startFill: (fillState: FillState) => void;
  stopFill: () => void;
  applyFillHover: (localId: string, rowIndex: number, col: MainCol) => void;
  requestPaste: (setLocalId: string, startRow: number, startCol: MainCol, text: string) => "empty" | "applied" | "overflow";
  confirmOverflowPaste: () => void;
  cancelOverflowPaste: () => void;
  undo: () => void;
  redo: () => void;
  patchSetStatus: (
    localId: string,
    update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>
  ) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  replaceSets: (sets: ModifySetCardModel[]) => void;
  addSet: () => void;
  deleteSet: (localId: string) => void;
}

export function useModifySetEditor(): ModifySetEditorHandle {
  const [state, dispatch] = useReducer(modifySetEditorReducer, undefined, createInitialModifySetEditorState);
  const historyRef = useRef<{
    undo: ModifySetEditorHistorySnapshot[];
    redo: ModifySetEditorHistorySnapshot[];
  }>({ undo: [], redo: [] });

  const buildHistorySnapshot = (): ModifySetEditorHistorySnapshot =>
    cloneHistorySnapshot({
      sets: state.sets,
      selectedRowsBySetId: state.selectedRowsBySetId,
      rowAnchorsBySetId: state.rowAnchorsBySetId,
      activeCell: state.activeCell,
      pendingPasteOverflow: state.pendingPasteOverflow
    });

  const pushUndoSnapshot = () => {
    const snapshot = buildHistorySnapshot();
    const history = historyRef.current;
    history.undo.push(snapshot);
    if (history.undo.length > MAX_HISTORY_DEPTH) {
      history.undo.shift();
    }
    history.redo = [];
  };

  const undo = () => {
    const history = historyRef.current;
    const snapshot = history.undo.pop();
    if (!snapshot) {
      return;
    }

    history.redo.push(buildHistorySnapshot());
    if (history.redo.length > MAX_HISTORY_DEPTH) {
      history.redo.shift();
    }

    dispatch({
      type: "restore_history",
      snapshot: cloneHistorySnapshot(snapshot)
    });
  };

  const redo = () => {
    const history = historyRef.current;
    const snapshot = history.redo.pop();
    if (!snapshot) {
      return;
    }

    history.undo.push(buildHistorySnapshot());
    if (history.undo.length > MAX_HISTORY_DEPTH) {
      history.undo.shift();
    }

    dispatch({
      type: "restore_history",
      snapshot: cloneHistorySnapshot(snapshot)
    });
  };

  const clearHistory = () => {
    historyRef.current.undo = [];
    historyRef.current.redo = [];
  };

  useEffect(() => {
    if (!state.fillState) {
      return;
    }

    const handleMouseUp = () => {
      dispatch({ type: "set_fill_state", fillState: null });
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [state.fillState]);

  const selectedPickerItems = useMemo(() => getSelectedPickerItems(state), [state]);
  const pickerTargetSet = useMemo(() => getPickerTargetSet(state), [state]);
  const progress = useMemo(() => getModifySetProgress(state.sets), [state.sets]);

  const editSet = (localId: string, updater: (set: ModifySetCardModel) => ModifySetCardModel, userEdit = true) => {
    const currentSet = state.sets.find((set) => set.localId === localId);
    if (!currentSet) {
      return;
    }

    if (userEdit) {
      pushUndoSnapshot();
    }

    dispatch({
      type: "commit_set",
      localId,
      nextSet: updater(currentSet),
      userEdit
    });
  };

  const ensureTrailingForSet = (localId: string) => {
    editSet(
      localId,
      (set) => ({
        ...set,
        rows: ensureTrailingRows(set.rows)
      }),
      false
    );
  };

  const openMappingPicker = (localId: string) => {
    const set = state.sets.find((entry) => entry.localId === localId);
    if (!set) {
      return;
    }

    dispatch({
      type: "open_picker",
      localId,
      items: set.mappingItems
    });
  };

  const closeMappingPicker = () => {
    dispatch({ type: "close_picker" });
  };

  const confirmMappingPicker = () => {
    if (!state.pickerTargetSetId) {
      return;
    }

    pushUndoSnapshot();
    dispatch({ type: "confirm_picker" });
  };

  const setPickerSelectionMap = (selectionMap: Map<string, ModifySetLinkedItem>) => {
    dispatch({ type: "set_picker_selection_map", selectionMap });
  };

  const setActiveCell = (activeCell: ActiveCell | null) => {
    dispatch({ type: "set_active_cell", activeCell });
  };

  const selectRows = (localId: string, rowIndex: number, shiftKey: boolean) => {
    const set = state.sets.find((entry) => entry.localId === localId);
    if (!set) {
      return;
    }

    const selection = toggleRowSelectionRange({
      rows: set.rows,
      selectedRowIds: state.selectedRowsBySetId[localId] ?? [],
      anchor: state.rowAnchorsBySetId[localId],
      rowIndex,
      shiftKey
    });

    dispatch({
      type: "set_selected_rows",
      localId,
      rowIds: selection.selectedRowIds,
      anchor: selection.anchor
    });
  };

  const deleteSelectedRows = (localId: string) => {
    const selectedRows = state.selectedRowsBySetId[localId] ?? [];
    if (selectedRows.length === 0) {
      return;
    }

    pushUndoSnapshot();
    dispatch({ type: "delete_selected_rows", localId });
  };

  const deleteRow = (localId: string, rowIndex: number) => {
    const currentSet = state.sets.find((set) => set.localId === localId);
    if (!currentSet) {
      return;
    }
    if (rowIndex < 0 || rowIndex >= currentSet.rows.length) {
      return;
    }

    pushUndoSnapshot();

    const nextRows = currentSet.rows.filter((_, index) => index !== rowIndex);

    dispatch({
      type: "commit_set",
      localId,
      nextSet: {
        ...currentSet,
        rows: nextRows.length > 0 ? nextRows : [createRow()]
      },
      userEdit: true
    });

    dispatch({ type: "clear_selected_rows", localId });

    if (state.activeCell?.setLocalId === localId) {
      dispatch({ type: "set_active_cell", activeCell: null });
    }
  };

  const startFill = (fillState: FillState) => {
    dispatch({ type: "set_fill_state", fillState });
  };

  const stopFill = () => {
    dispatch({ type: "set_fill_state", fillState: null });
  };

  const applyFillHover = (localId: string, rowIndex: number, col: MainCol) => {
    if (!state.fillState) {
      return;
    }
    if (state.fillState.setLocalId !== localId || state.fillState.col !== col || rowIndex <= state.fillState.fromRow) {
      return;
    }

    pushUndoSnapshot();
    dispatch({
      type: "apply_fill",
      localId,
      targetRowIndex: rowIndex
    });
  };

  const requestPaste = (
    setLocalId: string,
    startRow: number,
    startCol: MainCol,
    text: string
  ): "empty" | "applied" | "overflow" => {
    const clipboardGrid = parseClipboardGrid(text);
    if (clipboardGrid.length === 0) {
      return "empty";
    }

    const overflow = hasClipboardOverflow({ startCol, clipboardGrid });
    if (!overflow) {
      pushUndoSnapshot();
    }

    dispatch({
      type: "request_paste",
      setLocalId,
      startRow,
      startCol,
      clipboardGrid
    });

    return overflow ? "overflow" : "applied";
  };

  const confirmOverflowPaste = () => {
    if (!state.pendingPasteOverflow) {
      return;
    }

    pushUndoSnapshot();
    dispatch({ type: "confirm_overflow_paste" });
  };

  const cancelOverflowPaste = () => {
    dispatch({ type: "cancel_overflow_paste" });
  };

  const patchSetStatus = (
    localId: string,
    update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>
  ) => {
    dispatch({ type: "patch_set_status", localId, update });
  };

  const setSubmitting = (isSubmitting: boolean) => {
    dispatch({ type: "set_submitting", isSubmitting });
  };

  const replaceSets = (sets: ModifySetCardModel[]) => {
    clearHistory();
    dispatch({ type: "replace_sets", nextSets: sets });
  };

  const addSet = () => {
    pushUndoSnapshot();
    dispatch({ type: "add_set" });
  };

  const deleteSet = (localId: string) => {
    const set = state.sets.find((entry) => entry.localId === localId);
    if (!set) {
      return;
    }

    pushUndoSnapshot();
    dispatch({ type: "delete_set", localId });
  };

  return {
    state,
    selectedPickerItems,
    pickerTargetSet,
    progress,
    editSet,
    ensureTrailingForSet,
    openMappingPicker,
    closeMappingPicker,
    confirmMappingPicker,
    setPickerSelectionMap,
    setActiveCell,
    selectRows,
    deleteSelectedRows,
    deleteRow,
    startFill,
    stopFill,
    applyFillHover,
    requestPaste,
    confirmOverflowPaste,
    cancelOverflowPaste,
    undo,
    redo,
    patchSetStatus,
    setSubmitting,
    replaceSets,
    addSet,
    deleteSet
  };
}
