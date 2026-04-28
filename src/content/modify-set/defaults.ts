import { createRequestId } from "@shared/utils/request-id";
import type { ModifySetCardModel, ModifySetDraftValidation, ModifySetRowModel } from "./types";
import { isRowCompletelyEmpty, validateModifySetDraft } from "./validator";

function emptyValidation(): ModifySetDraftValidation {
  return {
    setErrors: [],
    rowErrors: [],
    validRowCount: 0,
    hasError: false
  };
}

export function createRow(): ModifySetRowModel {
  return {
    rowId: createRequestId("mod-row"),
    name: "",
    priceInput: "",
    costInput: "",
    defaultSelected: false
  };
}

export function ensureTrailingRows(rows: ModifySetRowModel[]): ModifySetRowModel[] {
  const next = rows.length > 0 ? [...rows] : [createRow()];
  const last = next[next.length - 1];
  if (!last || !isRowCompletelyEmpty(last)) {
    next.push(createRow());
  }
  return next;
}

export function createEmptySet(index: number): ModifySetCardModel {
  const draft: ModifySetCardModel = {
    localId: createRequestId("mod-set"),
    name: "",
    minQuantity: 0,
    maxQuantity: 1,
    isMaxQuantityEdited: false,
    allowMultipleQuantity: false,
    stockType: "nottrack",
    mappingItems: [],
    rows: ensureTrailingRows([]),
    collapsed: false,
    status: "draft",
    apiClientId: null,
    createError: null,
    mappingError: null,
    validationErrors: emptyValidation()
  };

  void index;

  return {
    ...draft,
    validationErrors: validateModifySetDraft(draft)
  };
}
