import { applyFillRange } from "../grid";
import { applyClipboardGridToRows, hasClipboardOverflow } from "../parser";
import { createEmptySet, createRow, ensureTrailingRows } from "../defaults";
import type {
  ActiveCell,
  FillState,
  MainCol,
  ModifySetCardModel,
  ModifySetLinkedItem,
  PendingPasteOverflow
} from "../types";
import { validateModifySetDraft } from "../validator";

export interface ModifySetEditorState {
  sets: ModifySetCardModel[];
  selectedRowsBySetId: Record<string, string[]>;
  rowAnchorsBySetId: Record<string, number>;
  fillState: FillState | null;
  pendingPasteOverflow: PendingPasteOverflow | null;
  activeCell: ActiveCell | null;
  pickerTargetSetId: string | null;
  pickerSelectedItemsMap: Map<string, ModifySetLinkedItem>;
  isSubmitting: boolean;
}

export interface ModifySetEditorHistorySnapshot {
  sets: ModifySetCardModel[];
  selectedRowsBySetId: Record<string, string[]>;
  rowAnchorsBySetId: Record<string, number>;
  activeCell: ActiveCell | null;
  pendingPasteOverflow: PendingPasteOverflow | null;
}

export type ModifySetEditorAction =
  | { type: "commit_set"; localId: string; nextSet: ModifySetCardModel; userEdit: boolean }
  | { type: "replace_sets"; nextSets: ModifySetCardModel[] }
  | { type: "restore_history"; snapshot: ModifySetEditorHistorySnapshot }
  | { type: "set_selected_rows"; localId: string; rowIds: string[]; anchor: number }
  | { type: "clear_selected_rows"; localId: string }
  | { type: "delete_selected_rows"; localId: string }
  | { type: "set_active_cell"; activeCell: ActiveCell | null }
  | { type: "set_fill_state"; fillState: FillState | null }
  | { type: "apply_fill"; localId: string; targetRowIndex: number }
  | { type: "request_paste"; setLocalId: string; startRow: number; startCol: MainCol; clipboardGrid: string[][] }
  | { type: "confirm_overflow_paste" }
  | { type: "cancel_overflow_paste" }
  | { type: "open_picker"; localId: string; items: ModifySetLinkedItem[] }
  | { type: "close_picker" }
  | { type: "set_picker_selection_map"; selectionMap: Map<string, ModifySetLinkedItem> }
  | { type: "confirm_picker" }
  | {
      type: "patch_set_status";
      localId: string;
      update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>;
    }
  | { type: "set_submitting"; isSubmitting: boolean }
  | { type: "add_set" }
  | { type: "delete_set"; localId: string };

function revalidateUserEditedSet(nextSet: ModifySetCardModel): ModifySetCardModel {
  let validatedSet = {
    ...nextSet,
    rows: ensureTrailingRows(nextSet.rows)
  };
  let validation = validateModifySetDraft(validatedSet);

  if (!validatedSet.isMaxQuantityEdited) {
    const autoMax = Math.max(1, validation.validRowCount);
    if (validatedSet.maxQuantity !== autoMax) {
      validatedSet = {
        ...validatedSet,
        maxQuantity: autoMax
      };
      validation = validateModifySetDraft(validatedSet);
    }
  }

  return {
    ...validatedSet,
    validationErrors: validation,
    status: validation.hasError ? "draft" : "validated",
    apiClientId: null,
    createError: null,
    mappingError: null
  };
}

function updateSetById(
  sets: ModifySetCardModel[],
  localId: string,
  updater: (set: ModifySetCardModel) => ModifySetCardModel,
  userEdit: boolean
): ModifySetCardModel[] {
  return sets.map((set) => {
    if (set.localId !== localId) {
      return set;
    }

    const nextSet = updater(set);
    return userEdit ? revalidateUserEditedSet(nextSet) : nextSet;
  });
}

function clearPerSetState(state: ModifySetEditorState, localId: string): Pick<ModifySetEditorState, "selectedRowsBySetId" | "rowAnchorsBySetId"> {
  const nextSelectedRows = { ...state.selectedRowsBySetId };
  const nextAnchors = { ...state.rowAnchorsBySetId };
  delete nextSelectedRows[localId];
  delete nextAnchors[localId];

  return {
    selectedRowsBySetId: nextSelectedRows,
    rowAnchorsBySetId: nextAnchors
  };
}

function applyPasteDirect(
  state: ModifySetEditorState,
  input: { setLocalId: string; startRow: number; startCol: MainCol; clipboardGrid: string[][] }
): ModifySetEditorState {
  const set = state.sets.find((entry) => entry.localId === input.setLocalId);
  if (!set) {
    return state;
  }

  const nextSets = updateSetById(
    state.sets,
    input.setLocalId,
    (current) => ({
      ...current,
      rows: applyClipboardGridToRows({
        rows: current.rows,
        startRow: input.startRow,
        startCol: input.startCol,
        clipboardGrid: input.clipboardGrid
      })
    }),
    true
  );

  return {
    ...state,
    sets: nextSets,
    pendingPasteOverflow: null,
    activeCell: {
      setLocalId: input.setLocalId,
      row: input.startRow,
      col: input.startCol
    }
  };
}

export function createInitialModifySetEditorState(): ModifySetEditorState {
  return {
    sets: [createEmptySet(0)],
    selectedRowsBySetId: {},
    rowAnchorsBySetId: {},
    fillState: null,
    pendingPasteOverflow: null,
    activeCell: null,
    pickerTargetSetId: null,
    pickerSelectedItemsMap: new Map(),
    isSubmitting: false
  };
}

export function validateAllSets(sets: ModifySetCardModel[]): { hasError: boolean; nextSets: ModifySetCardModel[] } {
  let hasError = false;

  const nextSets = sets.map((set) => {
    const validatedSet = {
      ...set,
      rows: ensureTrailingRows(set.rows)
    };
    const validation = validateModifySetDraft(validatedSet);
    const mappingMissing = set.mappingItems.length === 0;
    if (validation.hasError || mappingMissing) {
      hasError = true;
    }

    return {
      ...validatedSet,
      validationErrors: validation,
      mappingError: mappingMissing ? "Please link at least one item for this set." : null,
      status:
        validation.hasError || mappingMissing
          ? "draft"
          : set.status === "mapped"
            ? "mapped"
            : set.apiClientId
              ? "created"
              : "validated"
    };
  });

  return {
    hasError,
    nextSets
  };
}

export function modifySetEditorReducer(
  state: ModifySetEditorState,
  action: ModifySetEditorAction
): ModifySetEditorState {
  switch (action.type) {
    case "commit_set":
      return {
        ...state,
        sets: updateSetById(state.sets, action.localId, () => action.nextSet, action.userEdit)
      };

    case "replace_sets":
      return {
        ...state,
        sets: action.nextSets,
        selectedRowsBySetId: {},
        rowAnchorsBySetId: {},
        fillState: null,
        pendingPasteOverflow: null,
        activeCell: null,
        pickerTargetSetId: null,
        pickerSelectedItemsMap: new Map()
      };

    case "restore_history":
      return {
        ...state,
        sets: action.snapshot.sets,
        selectedRowsBySetId: action.snapshot.selectedRowsBySetId,
        rowAnchorsBySetId: action.snapshot.rowAnchorsBySetId,
        activeCell: action.snapshot.activeCell,
        pendingPasteOverflow: action.snapshot.pendingPasteOverflow,
        fillState: null
      };

    case "set_selected_rows":
      return {
        ...state,
        selectedRowsBySetId: {
          ...state.selectedRowsBySetId,
          [action.localId]: action.rowIds
        },
        rowAnchorsBySetId: {
          ...state.rowAnchorsBySetId,
          [action.localId]: action.anchor
        }
      };

    case "clear_selected_rows": {
      return {
        ...state,
        ...clearPerSetState(state, action.localId)
      };
    }

    case "delete_selected_rows": {
      const selectedRowIds = new Set(state.selectedRowsBySetId[action.localId] ?? []);
      if (selectedRowIds.size === 0) {
        return state;
      }

      const nextSets = updateSetById(
        state.sets,
        action.localId,
        (set) => {
          const nextRows = set.rows.filter((row) => !selectedRowIds.has(row.rowId));
          return {
            ...set,
            rows: nextRows.length > 0 ? nextRows : [createRow()]
          };
        },
        true
      );

      return {
        ...state,
        sets: nextSets,
        ...clearPerSetState(state, action.localId)
      };
    }

    case "set_active_cell":
      return {
        ...state,
        activeCell: action.activeCell
      };

    case "set_fill_state":
      return {
        ...state,
        fillState: action.fillState
      };

    case "apply_fill": {
      const fillState = state.fillState;
      if (!fillState || fillState.setLocalId !== action.localId) {
        return state;
      }

      return {
        ...state,
        sets: updateSetById(
          state.sets,
          action.localId,
          (set) => ({
            ...set,
            rows: applyFillRange(set.rows, fillState, action.targetRowIndex)
          }),
          true
        )
      };
    }

    case "request_paste": {
      if (action.clipboardGrid.length === 0) {
        return state;
      }

      const hasOverflow = hasClipboardOverflow({
        startCol: action.startCol,
        clipboardGrid: action.clipboardGrid
      });

      if (hasOverflow) {
        return {
          ...state,
          pendingPasteOverflow: {
            setLocalId: action.setLocalId,
            startRow: action.startRow,
            startCol: action.startCol,
            clipboardGrid: action.clipboardGrid
          },
          activeCell: {
            setLocalId: action.setLocalId,
            row: action.startRow,
            col: action.startCol
          }
        };
      }

      return applyPasteDirect(state, {
        setLocalId: action.setLocalId,
        startRow: action.startRow,
        startCol: action.startCol,
        clipboardGrid: action.clipboardGrid
      });
    }

    case "confirm_overflow_paste": {
      if (!state.pendingPasteOverflow) {
        return state;
      }

      return applyPasteDirect(state, state.pendingPasteOverflow);
    }

    case "cancel_overflow_paste":
      return {
        ...state,
        pendingPasteOverflow: null
      };

    case "open_picker":
      return {
        ...state,
        pickerTargetSetId: action.localId,
        pickerSelectedItemsMap: new Map(action.items.map((item) => [item.clientId, item]))
      };

    case "close_picker":
      return {
        ...state,
        pickerTargetSetId: null,
        pickerSelectedItemsMap: new Map()
      };

    case "set_picker_selection_map":
      return {
        ...state,
        pickerSelectedItemsMap: new Map(action.selectionMap)
      };

    case "confirm_picker": {
      if (!state.pickerTargetSetId) {
        return state;
      }

      const nextItems = Array.from(state.pickerSelectedItemsMap.values());
      return {
        ...state,
        sets: state.sets.map((set) => {
          if (set.localId !== state.pickerTargetSetId) {
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
        }),
        pickerTargetSetId: null,
        pickerSelectedItemsMap: new Map()
      };
    }

    case "patch_set_status":
      return {
        ...state,
        sets: state.sets.map((set) => (set.localId === action.localId ? { ...set, ...action.update } : set))
      };

    case "set_submitting":
      return {
        ...state,
        isSubmitting: action.isSubmitting
      };

    case "add_set":
      return {
        ...state,
        sets: [...state.sets, createEmptySet(state.sets.length)]
      };

    case "delete_set": {
      const nextSets = state.sets.filter((set) => set.localId !== action.localId);
      const nextState: ModifySetEditorState = {
        ...state,
        sets: nextSets.length > 0 ? nextSets : [createEmptySet(0)],
        ...clearPerSetState(state, action.localId)
      };

      if (state.pickerTargetSetId === action.localId) {
        nextState.pickerTargetSetId = null;
        nextState.pickerSelectedItemsMap = new Map();
      }
      if (state.activeCell?.setLocalId === action.localId) {
        nextState.activeCell = null;
      }
      if (state.fillState?.setLocalId === action.localId) {
        nextState.fillState = null;
      }
      if (state.pendingPasteOverflow?.setLocalId === action.localId) {
        nextState.pendingPasteOverflow = null;
      }

      return nextState;
    }

    default:
      return state;
  }
}
