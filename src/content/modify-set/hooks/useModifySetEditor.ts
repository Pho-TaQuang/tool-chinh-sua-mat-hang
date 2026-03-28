import { useEffect, useMemo, useReducer } from "react";
import { ensureTrailingRows } from "../defaults";
import { toggleRowSelectionRange } from "../grid";
import type {
  ActiveCell,
  ClipboardPreview,
  FillState,
  MainCol,
  ModifySetCardModel,
  ModifySetLinkedItem
} from "../types";
import { getModifySetProgress } from "../view";
import {
  createInitialModifySetEditorState,
  modifySetEditorReducer,
  type ModifySetEditorState
} from "../state/editor.reducer";
import { getPickerTargetSet, getSelectedPickerItems } from "../state/editor.selectors";

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
  startFill: (fillState: FillState) => void;
  stopFill: () => void;
  applyFillHover: (localId: string, rowIndex: number, col: MainCol) => void;
  openPreview: (setLocalId: string, startRow: number, preview: ClipboardPreview) => void;
  restoreLastPreview: () => boolean;
  closePreview: () => void;
  importPendingPreview: () => void;
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
    dispatch({ type: "delete_selected_rows", localId });
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

    dispatch({
      type: "apply_fill",
      localId,
      targetRowIndex: rowIndex
    });
  };

  const openPreview = (setLocalId: string, startRow: number, preview: ClipboardPreview) => {
    dispatch({
      type: "open_preview",
      preview: {
        setLocalId,
        startRow,
        preview
      }
    });
  };

  const restoreLastPreview = (): boolean => {
    if (!state.lastPreview) {
      return false;
    }

    dispatch({
      type: "open_preview",
      preview: state.lastPreview
    });
    return true;
  };

  const closePreview = () => {
    dispatch({ type: "close_preview" });
  };

  const importPendingPreview = () => {
    dispatch({ type: "import_preview" });
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
    dispatch({ type: "replace_sets", nextSets: sets });
  };

  const addSet = () => {
    dispatch({ type: "add_set" });
  };

  const deleteSet = (localId: string) => {
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
    startFill,
    stopFill,
    applyFillHover,
    openPreview,
    restoreLastPreview,
    closePreview,
    importPendingPreview,
    patchSetStatus,
    setSubmitting,
    replaceSets,
    addSet,
    deleteSet
  };
}
