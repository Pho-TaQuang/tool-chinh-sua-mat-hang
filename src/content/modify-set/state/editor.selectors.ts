import type { ModifySetCardModel, ModifySetLinkedItem } from "../types";
import type { ModifySetEditorState } from "./editor.reducer";

export function getPickerTargetSet(state: ModifySetEditorState): ModifySetCardModel | null {
  if (!state.pickerTargetSetId) {
    return null;
  }

  return state.sets.find((set) => set.localId === state.pickerTargetSetId) ?? null;
}

export function getSelectedPickerItems(state: ModifySetEditorState): ModifySetLinkedItem[] {
  return Array.from(state.pickerSelectedItemsMap.values());
}
