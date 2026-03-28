import type { ApiError, Item } from "@shared/types/sapo.types";
import { createRequestId } from "@shared/utils/request-id";
import { normalizeApiError } from "../api-error";
import {
  calcBatchStats,
  createBatchRunState,
  finalizeCompletedBatchState,
  finishBatchPostCheck,
  getNextPendingBatchItem,
  hasIncompleteBatchItems,
  incrementBatchPostCheck,
  markBatchItemFinished,
  markBatchItemRetryScheduled,
  markBatchItemStarted,
  markBatchItemVerified,
  restoreBatchRunState,
  startBatchPostCheck
} from "./runner.state";
import type {
  BatchItemState,
  BatchLogEntry,
  BatchRunState,
  BatchStats,
  SelectableItem,
  TaxSelection
} from "./types";
import { patchTaxInfos } from "./item-transformer";
import { computeRetryDelayMs, shouldRetry } from "@shared/http/retry";
import type { SiteApiClient } from "../site.api.client";

const STORAGE_KEY = "sapo_tax_batch_v1";

export interface BatchRunnerPolicy {
  maxConcurrency: number;
  minDispatchGapMs: number;
  maxRetries: number;
  jitterMs: number;
}

export interface BatchRunnerStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

interface BatchRunnerDependencies {
  now: () => number;
  random: () => number;
  setTimer: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  storage: BatchRunnerStorage;
}

export interface BatchRunnerOptions {
  apiClient: SiteApiClient;
  policy?: Partial<BatchRunnerPolicy>;
  dependencies?: Partial<BatchRunnerDependencies>;
  logger?: (entry: BatchLogEntry) => void;
}

type BatchListener = (snapshot: {
  state: BatchRunState | null;
  stats: BatchStats;
  lastLog?: BatchLogEntry;
}) => void;

const DEFAULT_POLICY: BatchRunnerPolicy = {
  maxConcurrency: 3,
  minDispatchGapMs: 300,
  maxRetries: 3,
  jitterMs: 250
};

const chromeStorage: BatchRunnerStorage = {
  async get<T>(key: string): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result[key] as T | undefined);
      });
    });
  },
  async set<T>(key: string, value: T): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  },
  async remove(key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(key, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }
};

function defaultDependencies(): BatchRunnerDependencies {
  return {
    now: () => Date.now(),
    random: () => Math.random(),
    setTimer: (handler, delayMs) => setTimeout(handler, delayMs),
    clearTimer: (timer) => clearTimeout(timer),
    storage: chromeStorage
  };
}

export class BatchRunner {
  private readonly apiClient: SiteApiClient;
  private readonly policy: BatchRunnerPolicy;
  private readonly deps: BatchRunnerDependencies;
  private readonly listeners = new Set<BatchListener>();
  private readonly logger: ((entry: BatchLogEntry) => void) | undefined;

  private state: BatchRunState | null = null;
  private inFlight = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt: number | null = null;
  private nextDispatchAt = 0;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private generation = 0;
  private dispatchInProgress = false;

  constructor(options: BatchRunnerOptions) {
    this.apiClient = options.apiClient;
    this.policy = {
      ...DEFAULT_POLICY,
      ...options.policy
    };
    this.deps = {
      ...defaultDependencies(),
      ...options.dependencies
    };
    this.logger = options.logger;
  }

  subscribe(listener: BatchListener): () => void {
    this.listeners.add(listener);
    listener({ state: this.state, stats: calcBatchStats(this.state) });
    return () => {
      this.listeners.delete(listener);
    };
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.restore().then(() => {
        this.initialized = true;
      });
    }

    await this.initPromise;
  }

  getState(): BatchRunState | null {
    return this.state;
  }

  hasIncompleteItems(): boolean {
    return hasIncompleteBatchItems(this.state);
  }

  async startBatch(input: {
    items: SelectableItem[];
    tax: TaxSelection;
    page: number;
    limit: number;
    categoryId: string | null;
  }): Promise<void> {
    await this.init();

    const now = this.deps.now();
    this.generation += 1;
    this.state = createBatchRunState(
      {
        batchId: createRequestId("batch"),
        items: input.items,
        tax: input.tax,
        page: input.page,
        limit: input.limit,
        categoryId: input.categoryId
      },
      now
    );
    this.nextDispatchAt = now;
    await this.persist();
    this.log("info", "Batch started.", {
      batchId: this.state.batchId,
      totalItems: this.state.items.length,
      tax: input.tax
    });
    this.emit();
    this.scheduleDispatch(0);
  }

  async pause(): Promise<void> {
    await this.init();
    if (!this.state || this.state.isPaused) {
      return;
    }

    this.state = {
      ...this.state,
      isPaused: true,
      updatedAt: this.deps.now()
    };
    await this.persist();
    this.log("info", "Batch paused.", { batchId: this.state.batchId });
    this.emit();
  }

  async resume(): Promise<void> {
    await this.init();
    if (!this.state || !this.state.isPaused) {
      return;
    }

    this.state = {
      ...this.state,
      isPaused: false,
      updatedAt: this.deps.now()
    };
    await this.persist();
    this.log("info", "Batch resumed.", { batchId: this.state.batchId });
    this.emit();
    this.scheduleDispatch(0);
  }

  async retryFailed(): Promise<void> {
    await this.init();
    if (!this.state) {
      return;
    }

    const now = this.deps.now();
    this.state = {
      ...this.state,
      items: this.state.items.map((item) => {
        if (item.status !== "failed") {
          return item;
        }

        return {
          ...item,
          status: "pending",
          verifyStatus: "not_checked",
          updatedAt: now
        };
      }),
      isPaused: false,
      updatedAt: now
    };
    await this.persist();
    this.log("info", "Retry failed items triggered.", { batchId: this.state.batchId });
    this.emit();
    this.scheduleDispatch(0);
  }

  async runPostCheck(): Promise<boolean> {
    await this.init();
    if (!this.state) {
      return false;
    }

    const stats = calcBatchStats(this.state);
    if (stats.pending > 0 || stats.processing > 0) {
      this.log("warn", "Post-check skipped because batch is still running.", {
        pending: stats.pending,
        processing: stats.processing
      });
      return false;
    }

    const targets = this.state.items.filter((item) => item.status === "success");
    const nextState = startBatchPostCheck(this.state, targets.length, this.deps.now());
    this.state = nextState;
    await this.persist();
    this.log("info", "Post-check started.", {
      batchId: nextState.batchId,
      totalTargets: targets.length
    });
    this.emit();

    for (const [index, target] of targets.entries()) {
      if (!this.state) {
        return false;
      }

      await this.updateVerifyState(target.clientId, "checking");

      try {
        const detail = await this.getItemDetailWithRetry(target.clientId);
        const currentState = this.state;
        if (!currentState) {
          return false;
        }

        const code = detail.item.tax_infos?.vat_pit_category_code ?? "";
        const name = detail.item.tax_infos?.vat_pit_category_name ?? "";
        const expected = currentState.selectedTax;

        if (code === expected.code && name === expected.name) {
          await this.updateVerifyState(target.clientId, "ok", "Verified by re-fetch detail.");
          await this.incrementPostCheckCounter("ok");
        } else {
          await this.updateVerifyState(
            target.clientId,
            "mismatch",
            `Expected (${expected.code} - ${expected.name}), got (${code} - ${name}).`
          );
          await this.incrementPostCheckCounter("mismatch");
        }
      } catch (error: unknown) {
        const normalized = normalizeApiError(error);
        await this.updateVerifyState(target.clientId, "error", `${normalized.code}: ${normalized.message}`);
        await this.incrementPostCheckCounter("error");
      }

      if (index < targets.length - 1) {
        await this.sleep(this.policy.minDispatchGapMs);
      }
    }

    if (!this.state) {
      return false;
    }

    this.state = finishBatchPostCheck(this.state, this.deps.now());
    await this.persist();
    this.log("info", "Post-check completed.", {
      postCheck: this.state.postCheck
    });
    this.emit();
    return true;
  }

  async discard(): Promise<void> {
    await this.init();
    if (!this.state) {
      return;
    }

    this.generation += 1;
    this.state = null;
    this.inFlight = 0;
    this.nextDispatchAt = 0;
    this.clearScheduledDispatch();
    await this.deps.storage.remove(STORAGE_KEY);
    this.log("warn", "Batch discarded.");
    this.emit();
  }

  private async restore(): Promise<void> {
    const saved = await this.deps.storage.get<BatchRunState>(STORAGE_KEY);
    if (!saved) {
      return;
    }

    this.state = restoreBatchRunState(saved, this.deps.now());
    await this.persist();
    if (!this.state) {
      return;
    }

    this.log("info", "Recovered unfinished batch from storage.", {
      batchId: this.state.batchId,
      stats: calcBatchStats(this.state)
    });
    this.emit();
  }

  private async persist(): Promise<void> {
    if (!this.state) {
      await this.deps.storage.remove(STORAGE_KEY);
      return;
    }

    await this.deps.storage.set(STORAGE_KEY, this.state);
  }

  private emit(lastLog?: BatchLogEntry): void {
    const snapshot = {
      state: this.state,
      stats: calcBatchStats(this.state),
      ...(lastLog ? { lastLog } : {})
    };

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private log(level: BatchLogEntry["level"], message: string, details?: unknown): void {
    const entry: BatchLogEntry = {
      id: createRequestId("batch-log"),
      level,
      message,
      timestamp: this.deps.now(),
      ...(details !== undefined ? { details } : {})
    };
    if (this.logger) {
      this.logger(entry);
    }
    this.emit(entry);
  }

  private clearScheduledDispatch(): void {
    if (!this.timer) {
      return;
    }

    this.deps.clearTimer(this.timer);
    this.timer = null;
    this.timerDueAt = null;
  }

  private scheduleDispatch(delayMs: number): void {
    const dueAt = this.deps.now() + Math.max(0, delayMs);
    if (this.timer) {
      if (this.timerDueAt !== null && this.timerDueAt <= dueAt) {
        return;
      }
      this.clearScheduledDispatch();
    }

    this.timerDueAt = dueAt;
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      this.timerDueAt = null;
      void this.dispatchPendingWork();
    }, Math.max(0, delayMs));
  }

  private async dispatchPendingWork(): Promise<void> {
    if (this.dispatchInProgress) {
      return;
    }
    this.dispatchInProgress = true;

    try {
      if (!this.state || this.state.isPaused) {
        return;
      }

      while (this.state && !this.state.isPaused && this.inFlight < this.policy.maxConcurrency) {
        const now = this.deps.now();
        if (now < this.nextDispatchAt) {
          break;
        }

        const nextItem = getNextPendingBatchItem(this.state);
        if (!nextItem) {
          break;
        }

        const generation = this.generation;
        void this.beginItemAttempt(nextItem.clientId, generation).catch(() => undefined);
        this.nextDispatchAt = now + this.policy.minDispatchGapMs;
      }

      if (!this.state || this.state.isPaused) {
        return;
      }

      const stats = calcBatchStats(this.state);
      if (stats.pending === 0 && stats.processing === 0) {
        const completedState = this.state;
        this.log("info", "Batch completed.", {
          batchId: completedState.batchId,
          stats
        });

        // Success items are pruned after completion, so a full-success batch clears persisted state and post-check can no longer resume later.
        this.state = finalizeCompletedBatchState(completedState, this.deps.now());
        await this.persist();
        this.emit();
        return;
      }

      const delay = Math.max(0, this.nextDispatchAt - this.deps.now());
      this.scheduleDispatch(delay);
    } finally {
      this.dispatchInProgress = false;
    }
  }

  private async beginItemAttempt(clientId: string, generation: number): Promise<void> {
    if (!this.state) {
      return;
    }

    const nextState = markBatchItemStarted(this.state, clientId, this.deps.now());
    if (nextState === this.state) {
      return;
    }

    this.state = nextState;
    const currentItem = nextState.items.find((item) => item.clientId === clientId);
    if (!currentItem) {
      return;
    }

    this.inFlight += 1;
    await this.persist();
    this.log("info", `Item started: ${currentItem.name} [attempt ${currentItem.attempts}]`, {
      itemName: currentItem.name,
      attempt: currentItem.attempts
    });

    try {
      await this.applyTaxSelectionWithRetry(
        clientId,
        generation,
        currentItem.attempts,
        currentItem.name,
        nextState.selectedTax
      );
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.scheduleDispatch(0);
    }
  }

  private async applyTaxSelectionWithRetry(
    clientId: string,
    generation: number,
    attempt: number,
    itemName: string,
    selectedTax: TaxSelection
  ): Promise<void> {
    if (!this.state) {
      return;
    }

    try {
      const detail = await this.apiClient.getItemDetail(clientId);
      this.ensureGeneration(generation);
      const patchedItem: Item = patchTaxInfos(detail.item, selectedTax);
      const updated = await this.apiClient.updateItem(clientId, patchedItem);
      this.ensureGeneration(generation);
      this.verifyTaxInfos(updated.item, selectedTax);
      await this.updateItemState(clientId, "success");
      this.log("info", `Item updated successfully: ${itemName} | Tax info code  : ${selectedTax.code}`, {
        itemName,
        taxCode: selectedTax.code
      });
      return;
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const retriesUsed = attempt - 1;
      if (shouldRetry(normalized, retriesUsed, this.policy.maxRetries)) {
        const retryDelay = computeRetryDelayMs({
          error: normalized,
          retryIndex: retriesUsed + 1,
          jitterMs: this.policy.jitterMs,
          random: this.deps.random
        });
        await this.updateRetryState(clientId, normalized, attempt + 1);
        this.log("warn", "Item scheduled for retry.", {
          clientId,
          itemName,
          attempt,
          retryInMs: retryDelay,
          code: normalized.code
        });
        await this.sleep(retryDelay);
        this.ensureGeneration(generation);
        await this.applyTaxSelectionWithRetry(clientId, generation, attempt + 1, itemName, selectedTax);
        return;
      }

      await this.updateItemState(clientId, "failed", normalized);
      this.log("error", "Item failed permanently.", {
        clientId,
        itemName,
        attempt,
        code: normalized.code,
        message: normalized.message
      });
    }
  }

  private verifyTaxInfos(item: Item, selectedTax: TaxSelection): void {
    const code = item.tax_infos?.vat_pit_category_code ?? "";
    const name = item.tax_infos?.vat_pit_category_name ?? "";
    if (code !== selectedTax.code || name !== selectedTax.name) {
      throw {
        status: 0,
        code: "VERIFY_FAILED",
        message: "Response tax_infos does not match requested tax selection.",
        retryable: false,
        details: {
          expected: selectedTax,
          actual: { code, name }
        }
      } satisfies ApiError;
    }
  }

  private async updateRetryState(clientId: string, lastError: ApiError, nextAttempt: number): Promise<void> {
    if (!this.state) {
      return;
    }

    const nextState = markBatchItemRetryScheduled(this.state, clientId, lastError, nextAttempt, this.deps.now());
    await this.replaceState(nextState);
  }

  private async updateItemState(
    clientId: string,
    status: BatchItemState["status"],
    lastError?: ApiError
  ): Promise<void> {
    if (!this.state) {
      return;
    }

    const nextState = markBatchItemFinished(this.state, clientId, status, this.deps.now(), lastError);
    await this.replaceState(nextState);
  }

  private async updateVerifyState(
    clientId: string,
    verifyStatus: BatchItemState["verifyStatus"],
    verifyMessage?: string
  ): Promise<void> {
    if (!this.state) {
      return;
    }

    const nextState = markBatchItemVerified(this.state, clientId, verifyStatus, this.deps.now(), verifyMessage);
    await this.replaceState(nextState);
  }

  private async incrementPostCheckCounter(result: "ok" | "mismatch" | "error"): Promise<void> {
    if (!this.state) {
      return;
    }

    const nextState = incrementBatchPostCheck(this.state, result, this.deps.now());
    await this.replaceState(nextState);
  }

  private async replaceState(nextState: BatchRunState | null): Promise<void> {
    if (nextState === this.state) {
      return;
    }

    this.state = nextState;
    await this.persist();
    this.emit();
  }

  private ensureGeneration(generation: number): void {
    // The generation guard prevents stale async retries from mutating a batch that was discarded or replaced.
    if (generation !== this.generation) {
      throw {
        status: 0,
        code: "BATCH_CHANGED",
        message: "Batch state changed while processing item.",
        retryable: false
      } satisfies ApiError;
    }
  }

  private async sleep(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.deps.setTimer(resolve, Math.max(0, delayMs));
    });
  }

  private async getItemDetailWithRetry(clientId: string): Promise<{ item: Item }> {
    let attempt = 1;

    while (true) {
      try {
        return await this.apiClient.getItemDetail(clientId);
      } catch (error: unknown) {
        const normalized = normalizeApiError(error);
        const retriesUsed = attempt - 1;
        if (!shouldRetry(normalized, retriesUsed, this.policy.maxRetries)) {
          throw normalized;
        }

        const retryDelay = computeRetryDelayMs({
          error: normalized,
          retryIndex: retriesUsed + 1,
          jitterMs: this.policy.jitterMs,
          random: this.deps.random
        });
        this.log("warn", "Post-check retry scheduled.", {
          clientId,
          attempt,
          retryInMs: retryDelay,
          code: normalized.code
        });
        await this.sleep(retryDelay);
        attempt += 1;
      }
    }
  }
}
