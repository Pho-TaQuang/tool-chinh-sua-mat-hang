import type {
  ModifySetCardModel,
  ModifySetLinkedItem,
  ModifySetRowValidationError,
  ModifySetStatus
} from "./types";

type CellErrorField = "name" | "priceInput" | "costInput";

function cellErrorFieldFromCode(error: ModifySetRowValidationError): CellErrorField {
  if (error.code === "ROW_NAME_REQUIRED") {
    return "name";
  }
  if (error.code === "ROW_PRICE_REQUIRED" || error.code === "ROW_PRICE_INVALID") {
    return "priceInput";
  }
  return "costInput";
}

export function buildCellErrorKey(rowId: string, field: CellErrorField): string {
  return `${rowId}:${field}`;
}

export function statusLabel(status: ModifySetStatus): string {
  if (status === "draft") return "Draft";
  if (status === "validated") return "Validated";
  if (status === "creating") return "Creating";
  if (status === "created") return "Created";
  if (status === "mapping") return "Mapping";
  if (status === "mapped") return "Mapped";
  if (status === "create_failed") return "Create Failed";
  return "Mapping Failed";
}

export function statusTone(status: ModifySetStatus): string {
  if (status === "mapped") return "spx-success";
  if (status === "validated" || status === "created") return "spx-processing";
  if (status === "creating" || status === "mapping") return "spx-pending";
  if (status === "create_failed" || status === "mapping_failed") return "spx-failed";
  return "spx-idle";
}

export function getModifySetProgress(sets: ModifySetCardModel[]): {
  completed: number;
  total: number;
  percent: number;
  processingSet: ModifySetCardModel | undefined;
} {
  const eligibleSets = sets.filter((set) => set.status !== "draft");
  const completed = eligibleSets.filter((set) => ["mapped", "create_failed", "mapping_failed"].includes(set.status)).length;
  const total = eligibleSets.length;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const processingSet = sets.find((set) => set.status === "creating" || set.status === "mapping");

  return {
    completed,
    total,
    percent,
    processingSet
  };
}

export function buildCellErrorMap(rowErrors: ModifySetRowValidationError[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const rowError of rowErrors) {
    const field = cellErrorFieldFromCode(rowError);
    const key = buildCellErrorKey(rowError.rowId, field);
    const current = map.get(key) ?? [];
    current.push(rowError.message);
    map.set(key, current);
  }

  return map;
}

export function listSelectedItems(map: Map<string, ModifySetLinkedItem>): ModifySetLinkedItem[] {
  return Array.from(map.values());
}
