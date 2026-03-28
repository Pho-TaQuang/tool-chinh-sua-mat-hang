import { applyFillRange } from "../grid";
import { createEmptySet, createRow, ensureTrailingRows } from "../defaults";
import type {
  ActiveCell,
  FillState,
  ModifySetCardModel,
  ModifySetLinkedItem,
  ModifySetRowModel,
  PendingPreview
} from "../types";
import { validateModifySetDraft } from "../validator";

export interface ModifySetEditorState {
  sets: ModifySetCardModel[];
  selectedRowsBySetId: Record<string, string[]>;
  rowAnchorsBySetId: Record<string, number>;
  fillState: FillState | null;
  pendingPreview: PendingPreview | null;
  lastPreview: PendingPreview | null;
  activeCell: ActiveCell | null;
  pickerTargetSetId: string | null;
  pickerSelectedItemsMap: Map<string, ModifySetLinkedItem>;
  isSubmitting: boolean;
}

export type ModifySetEditorAction =
  | { type: "commit_set"; localId: string; nextSet: ModifySetCardModel; userEdit: boolean }
  | { type: "replace_sets"; nextSets: ModifySetCardModel[] }
  | { type: "set_selected_rows"; localId: string; rowIds: string[]; anchor: number }
  | { type: "clear_selected_rows"; localId: string }
  | { type: "delete_selected_rows"; localId: string }
  | { type: "set_active_cell"; activeCell: ActiveCell | null }
  | { type: "set_fill_state"; fillState: FillState | null }
  | { type: "apply_fill"; localId: string; targetRowIndex: number }
  | { type: "open_preview"; preview: PendingPreview }
  | { type: "close_preview" }
  | { type: "import_preview" }
  | { type: "open_picker"; localId: string; items: ModifySetLinkedItem[] }
  | { type: "close_picker" }
  | { type: "set_picker_selection_map"; selectionMap: Map<string, ModifySetLinkedItem> }
  | { type: "confirm_picker" }
  | { type: "patch_set_status"; localId: string; update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">> }
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

export function createInitialModifySetEditorState(): ModifySetEditorState {
  return {
    sets: [createEmptySet(0)],
    selectedRowsBySetId: {},
    rowAnchorsBySetId: {},
    fillState: null,
    pendingPreview: null,
    lastPreview: null,
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
        sets: action.nextSets
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

    case "open_preview":
      return {
        ...state,
        pendingPreview: action.preview,
        lastPreview: action.preview
      };

    case "close_preview":
      return {
        ...state,
        pendingPreview: null
      };

    case "import_preview": {
      const preview = state.pendingPreview;
      if (!preview) {
        return state;
      }

      return {
        ...state,
        sets: updateSetById(
          state.sets,
          preview.setLocalId,
          (set) => {
            const rows = [...set.rows];
            for (let index = 0; index < preview.preview.rows.length; index += 1) {
              const parsedRow = preview.preview.rows[index];
              if (!parsedRow) {
                continue;
              }

              const targetRow = preview.startRow + index;
              while (rows.length <= targetRow) {
                rows.push(createRow());
              }

              const current = rows[targetRow] ?? createRow();
              rows[targetRow] = {
                ...current,
                name: parsedRow.name,
                priceInput: parsedRow.priceInput,
                costInput: parsedRow.costInput
              };
            }

            return {
              ...set,
              rows
            };
          },
          true
        ),
        pendingPreview: null
      };
    }

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
      if (state.pendingPreview?.setLocalId === action.localId) {
        nextState.pendingPreview = null;
      }
      if (state.lastPreview?.setLocalId === action.localId) {
        nextState.lastPreview = null;
      }
      if (state.activeCell?.setLocalId === action.localId) {
        nextState.activeCell = null;
      }
      if (state.fillState?.setLocalId === action.localId) {
        nextState.fillState = null;
      }

      return nextState;
    }

    default:
      return state;
  }
}
