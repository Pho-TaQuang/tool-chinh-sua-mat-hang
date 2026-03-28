import type { ModifySetCreateRequest } from "@shared/types/modify-set.types";
import type { ContentToolTabProps } from "../shell/types";

export type ModifySetStatus =
  | "draft"
  | "validated"
  | "creating"
  | "created"
  | "mapping"
  | "mapped"
  | "create_failed"
  | "mapping_failed";

export type MainCol = 0 | 1 | 2;

export interface ModifySetRowModel {
  rowId: string;
  name: string;
  priceInput: string;
  costInput: string;
  defaultSelected: boolean;
}

export interface ModifySetValidationError {
  code: "SET_NAME_REQUIRED" | "MIN_LT_ZERO" | "MIN_GT_MAX" | "MAX_GT_OPTION_COUNT" | "NO_VALID_OPTIONS";
  message: string;
}

export interface ModifySetRowValidationError {
  rowId: string;
  rowIndex: number;
  code: "ROW_NAME_REQUIRED" | "ROW_PRICE_REQUIRED" | "ROW_PRICE_INVALID" | "ROW_COST_INVALID";
  message: string;
}

export interface ModifySetDraftValidation {
  setErrors: ModifySetValidationError[];
  rowErrors: ModifySetRowValidationError[];
  validRowCount: number;
  hasError: boolean;
}

export interface ModifySetLinkedItem {
  clientId: string;
  name: string;
}

export interface ModifySetCardModel {
  localId: string;
  name: string;
  minQuantity: number;
  maxQuantity: number;
  isMaxQuantityEdited: boolean;
  allowMultipleQuantity: boolean;
  mappingItems: ModifySetLinkedItem[];
  rows: ModifySetRowModel[];
  collapsed: boolean;
  status: ModifySetStatus;
  apiClientId: string | null;
  createError: string | null;
  mappingError: string | null;
  validationErrors: ModifySetDraftValidation;
}

export interface ParsedClipboardRow {
  lineNumber: number;
  name: string;
  priceInput: string;
  costInput: string;
  errors: string[];
}

export interface ClipboardPreview {
  rows: ParsedClipboardRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface ModifySetPreparedInput {
  localId: string;
  name: string;
  itemIds: string[];
  payload: ModifySetCreateRequest;
  existingClientId: string | null;
}

export interface ModifySetRunCallbacks {
  onSetStatusChange: (
    localId: string,
    update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>
  ) => void;
  onLog?: (level: "info" | "warn" | "error", message: string, details?: unknown) => void;
}

export interface ModifySetRunnerResult {
  localId: string;
  status: ModifySetStatus;
  modSetId: string | null;
  errorMessage?: string;
}

export interface PendingPreview {
  setLocalId: string;
  startRow: number;
  preview: ClipboardPreview;
}

export interface FillState {
  setLocalId: string;
  fromRow: number;
  col: MainCol;
  value: string;
}

export interface ActiveCell {
  setLocalId: string;
  row: number;
  col: MainCol;
}

export type ModifySetTabProps = ContentToolTabProps;
