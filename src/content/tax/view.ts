import type { Item } from "@shared/types/sapo.types";
import type { VatPitCategory } from "../site.api.client";
import type { BatchItemState, BatchRunState, BatchStats, SelectableItem } from "./types";

export interface TaxRowStatusModel {
  label: string;
  tone: string;
  attempts?: number;
}

export interface TaxBatchProgressModel {
  completed: number;
  total: number;
  percent: number;
  processingName: string | null;
}

export function createEmptyBatchStats(): BatchStats {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
    skipped: 0
  };
}

export function buildBatchItemMap(state: BatchRunState | null): Map<string, BatchItemState> {
  const batchMap = new Map<string, BatchItemState>();
  if (!state) {
    return batchMap;
  }

  for (const item of state.items) {
    batchMap.set(item.clientId, item);
  }

  return batchMap;
}

export function deriveBatchProgress(
  state: BatchRunState | null,
  stats: BatchStats
): TaxBatchProgressModel {
  const completed = stats.success + stats.failed + stats.skipped;
  const total = stats.total;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const processingItem = state?.items.find((item) => item.status === "processing");

  return {
    completed,
    total,
    percent,
    processingName: processingItem?.name ?? null
  };
}

export function deriveSelectedItems(items: Item[], selectedIds: Set<string>): SelectableItem[] {
  const output: SelectableItem[] = [];
  for (const item of items) {
    if (selectedIds.has(item.client_id)) {
      output.push({ clientId: item.client_id, name: item.name });
    }
  }
  return output;
}

export function isCurrentPageFullySelected(items: Item[], selectedIds: Set<string>): boolean {
  return items.length > 0 && items.every((item) => selectedIds.has(item.client_id));
}

export function resolveTaxRowStatus(
  clientId: string,
  selectedIds: Set<string>,
  batchMap: Map<string, BatchItemState>
): TaxRowStatusModel {
  const batchItem = batchMap.get(clientId);
  if (batchItem) {
    if (batchItem.status === "pending") {
      return { label: "Pending", tone: "spx-pending", attempts: batchItem.attempts };
    }
    if (batchItem.status === "processing") {
      return { label: "Processing", tone: "spx-processing", attempts: batchItem.attempts };
    }
    if (batchItem.status === "success") {
      return { label: "Success", tone: "spx-success", attempts: batchItem.attempts };
    }
    if (batchItem.status === "failed") {
      return { label: "Failed", tone: "spx-failed", attempts: batchItem.attempts };
    }
    return { label: "Skipped", tone: "spx-skipped", attempts: batchItem.attempts };
  }

  if (selectedIds.has(clientId)) {
    return { label: "Selected", tone: "spx-pending" };
  }

  return { label: "Idle", tone: "spx-idle" };
}

export function applySuccessfulTaxUpdatesToVisibleItems(
  items: Item[],
  batchState: BatchRunState | null
): Item[] {
  if (!batchState || items.length === 0) {
    return items;
  }

  const succeededClientIds = new Set<string>();
  for (const item of batchState.items) {
    if (item.status === "success") {
      succeededClientIds.add(item.clientId);
    }
  }

  if (succeededClientIds.size === 0) {
    return items;
  }

  let changed = false;
  const nextItems = items.map((item) => {
    if (!succeededClientIds.has(item.client_id)) {
      return item;
    }

    const currentCode = item.tax_infos?.vat_pit_category_code ?? "";
    const currentName = item.tax_infos?.vat_pit_category_name ?? "";
    const targetCode = batchState.selectedTax.code;
    const targetName = batchState.selectedTax.name;

    if (currentCode === targetCode && currentName === targetName) {
      return item;
    }

    changed = true;
    return {
      ...item,
      tax_infos: {
        ...(item.tax_infos ?? { vat_pit_category_code: "", vat_pit_category_name: "" }),
        vat_pit_category_code: targetCode,
        vat_pit_category_name: targetName
      }
    };
  });

  return changed ? nextItems : items;
}

export function resolveDefaultTaxCode(
  vatPitCategories: VatPitCategory[],
  currentTaxCode: string
): string {
  if (currentTaxCode && vatPitCategories.some((tax) => tax.code === currentTaxCode)) {
    return currentTaxCode;
  }

  return vatPitCategories.find((tax) => tax.code === "305")?.code ?? vatPitCategories[0]?.code ?? "";
}

export function toUnknownErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
