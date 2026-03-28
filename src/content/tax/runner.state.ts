import type { ApiError } from "@shared/types/sapo.types";
import type {
  BatchItemState,
  BatchItemStatus,
  BatchRunState,
  BatchStats,
  SelectableItem,
  TaxSelection
} from "./types";

type PostCheckResult = "ok" | "mismatch" | "error";

export interface CreateBatchRunStateInput {
  batchId: string;
  items: SelectableItem[];
  tax: TaxSelection;
  page: number;
  limit: number;
  categoryId: string | null;
}

function createEmptyStats(): BatchStats {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
    skipped: 0
  };
}

function createPostCheckState(now: number) {
  return {
    running: false,
    total: 0,
    checked: 0,
    ok: 0,
    mismatch: 0,
    error: 0,
    updatedAt: now
  };
}

function isBatchItemTerminal(status: BatchItemStatus): boolean {
  return status === "success" || status === "failed" || status === "skipped";
}

function replaceBatchItem(
  state: BatchRunState,
  clientId: string,
  now: number,
  update: (item: BatchItemState) => BatchItemState
): BatchRunState {
  const itemIndex = state.items.findIndex((item) => item.clientId === clientId);
  if (itemIndex < 0) {
    return state;
  }

  const currentItem = state.items[itemIndex];
  if (!currentItem) {
    return state;
  }

  const nextItems = [...state.items];
  nextItems[itemIndex] = update(currentItem);
  return {
    ...state,
    items: nextItems,
    updatedAt: now
  };
}

export function createBatchRunState(input: CreateBatchRunStateInput, now: number): BatchRunState {
  return {
    batchId: input.batchId,
    selectedTax: input.tax,
    page: input.page,
    limit: input.limit,
    categoryId: input.categoryId,
    isPaused: false,
    createdAt: now,
    updatedAt: now,
    items: input.items.map((item) => ({
      clientId: item.clientId,
      name: item.name,
      status: "pending",
      attempts: 0,
      verifyStatus: "not_checked",
      updatedAt: now
    })),
    postCheck: createPostCheckState(now)
  };
}

export function restoreBatchRunState(saved: BatchRunState, now: number): BatchRunState | null {
  const restoredItems = saved.items
    .map((item) => ({
      ...item,
      status: item.status === "processing" ? "pending" : item.status,
      verifyStatus: item.verifyStatus ?? "not_checked",
      updatedAt: now
    }))
    .filter((item) => item.status !== "success");

  if (restoredItems.length === 0) {
    return null;
  }

  return {
    ...saved,
    isPaused: true,
    updatedAt: now,
    items: restoredItems,
    postCheck: saved.postCheck
      ? {
          ...saved.postCheck,
          running: false,
          updatedAt: now
        }
      : createPostCheckState(now)
  };
}

export function calcBatchStats(state: BatchRunState | null): BatchStats {
  if (!state) {
    return createEmptyStats();
  }

  return state.items.reduce<BatchStats>(
    (stats, item) => {
      stats.total += 1;
      if (item.status === "pending") {
        stats.pending += 1;
      } else if (item.status === "processing") {
        stats.processing += 1;
      } else if (item.status === "success") {
        stats.success += 1;
      } else if (item.status === "failed") {
        stats.failed += 1;
      } else if (item.status === "skipped") {
        stats.skipped += 1;
      }
      return stats;
    },
    createEmptyStats()
  );
}

export function hasIncompleteBatchItems(state: BatchRunState | null): boolean {
  if (!state) {
    return false;
  }

  return state.items.some((item) => !isBatchItemTerminal(item.status));
}

export function getNextPendingBatchItem(state: BatchRunState | null): BatchItemState | undefined {
  return state?.items.find((item) => item.status === "pending");
}

export function markBatchItemStarted(state: BatchRunState, clientId: string, now: number): BatchRunState {
  return replaceBatchItem(state, clientId, now, (item) => ({
    ...item,
    status: "processing",
    attempts: item.attempts + 1,
    updatedAt: now
  }));
}

export function markBatchItemRetryScheduled(
  state: BatchRunState,
  clientId: string,
  lastError: ApiError,
  nextAttempt: number,
  now: number
): BatchRunState {
  return replaceBatchItem(state, clientId, now, (item) => ({
    ...item,
    status: "processing",
    attempts: nextAttempt,
    verifyStatus: "not_checked",
    lastError,
    updatedAt: now
  }));
}

export function markBatchItemFinished(
  state: BatchRunState,
  clientId: string,
  status: BatchItemStatus,
  now: number,
  lastError?: ApiError
): BatchRunState {
  return replaceBatchItem(state, clientId, now, (item) => {
    const next: BatchItemState = {
      ...item,
      status,
      updatedAt: now
    };

    if (status === "success") {
      next.verifyStatus = "not_checked";
      delete next.verifyMessage;
      delete next.lastVerifiedAt;
      delete next.lastError;
    }

    if (lastError !== undefined) {
      next.lastError = lastError;
    }

    return next;
  });
}

export function markBatchItemVerified(
  state: BatchRunState,
  clientId: string,
  verifyStatus: BatchItemState["verifyStatus"],
  now: number,
  verifyMessage?: string
): BatchRunState {
  return replaceBatchItem(state, clientId, now, (item) => {
    const next: BatchItemState = {
      ...item,
      verifyStatus,
      updatedAt: now
    };

    if (verifyMessage !== undefined) {
      next.verifyMessage = verifyMessage;
    } else {
      delete next.verifyMessage;
    }

    if (verifyStatus === "checking") {
      delete next.lastVerifiedAt;
    } else {
      next.lastVerifiedAt = now;
    }

    return next;
  });
}

export function startBatchPostCheck(state: BatchRunState, total: number, now: number): BatchRunState {
  return {
    ...state,
    postCheck: {
      running: true,
      total,
      checked: 0,
      ok: 0,
      mismatch: 0,
      error: 0,
      updatedAt: now
    },
    updatedAt: now
  };
}

export function incrementBatchPostCheck(
  state: BatchRunState,
  result: PostCheckResult,
  now: number
): BatchRunState {
  if (!state.postCheck) {
    return state;
  }

  const next = {
    ...state.postCheck,
    checked: state.postCheck.checked + 1,
    updatedAt: now
  };

  if (result === "ok") {
    next.ok += 1;
  } else if (result === "mismatch") {
    next.mismatch += 1;
  } else {
    next.error += 1;
  }

  return {
    ...state,
    postCheck: next,
    updatedAt: now
  };
}

export function finishBatchPostCheck(state: BatchRunState, now: number): BatchRunState {
  if (!state.postCheck) {
    return state;
  }

  return {
    ...state,
    postCheck: {
      ...state.postCheck,
      running: false,
      updatedAt: now
    },
    updatedAt: now
  };
}

export function finalizeCompletedBatchState(state: BatchRunState, now: number): BatchRunState | null {
  const remainingItems = state.items.filter((item) => item.status !== "success");
  if (remainingItems.length === 0) {
    return null;
  }

  return {
    ...state,
    items: remainingItems,
    isPaused: true,
    updatedAt: now
  };
}
