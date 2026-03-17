import type { ApiError, Item } from "@shared/types/sapo.types";
import { createRequestId } from "@shared/utils/request-id";
import type {
  BatchItemState,
  BatchItemStatus,
  BatchLogEntry,
  BatchRunState,
  BatchStats,
  SelectableItem,
  TaxSelection
} from "./batch.types";
import { patchTaxInfos } from "./item.transformer";
import type { SiteApiClient } from "./site.api.client";

const STORAGE_KEY = "sapo_tax_batch_v1";
const MAX_BACKOFF_MS = 30_000;

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

function isTerminal(status: BatchItemStatus): boolean {
  return status === "success" || status === "failed" || status === "skipped";
}

function calcStats(state: BatchRunState | null): BatchStats {
  if (!state) {
    return {
      total: 0,
      pending: 0,
      processing: 0,
      success: 0,
      failed: 0,
      skipped: 0
    };
  }

  const stats: BatchStats = {
    total: state.items.length,
    pending: 0,
    processing: 0,
    success: 0,
    failed: 0,
    skipped: 0
  };

  for (const item of state.items) {
    if (item.status === "pending") {
      stats.pending += 1;
      continue;
    }
    if (item.status === "processing") {
      stats.processing += 1;
      continue;
    }
    if (item.status === "success") {
      stats.success += 1;
      continue;
    }
    if (item.status === "failed") {
      stats.failed += 1;
      continue;
    }
    if (item.status === "skipped") {
      stats.skipped += 1;
    }
  }

  return stats;
}

function normalizeApiError(error: unknown): ApiError {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "code" in error &&
    "message" in error &&
    "retryable" in error
  ) {
    return error as ApiError;
  }

  if (error instanceof Error) {
    return {
      status: 0,
      code: "UNHANDLED_EXCEPTION",
      message: error.message,
      retryable: false,
      details: { stack: error.stack }
    };
  }

  return {
    status: 0,
    code: "UNKNOWN_ERROR",
    message: String(error),
    retryable: false,
    details: error
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
  private tickInProgress = false;

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
    listener({ state: this.state, stats: calcStats(this.state) });
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
    if (!this.state) {
      return false;
    }
    return this.state.items.some((item) => !isTerminal(item.status));
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
    this.state = {
      batchId: createRequestId("batch"),
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
      postCheck: {
        running: false,
        total: 0,
        checked: 0,
        ok: 0,
        mismatch: 0,
        error: 0,
        updatedAt: now
      }
    };
    this.nextDispatchAt = now;
    await this.persist();
    this.log("info", "Batch started.", {
      batchId: this.state.batchId,
      totalItems: this.state.items.length,
      tax: input.tax
    });
    this.emit();
    this.scheduleTick(0);
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
    this.log("info", "Batch resumed.", { batchId: this.state.batchId });
    await this.persist();
    this.emit();
    this.scheduleTick(0);
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
    this.scheduleTick(0);
  }

  async runPostCheck(): Promise<boolean> {
    await this.init();
    if (!this.state) {
      return false;
    }

    const stats = calcStats(this.state);
    if (stats.pending > 0 || stats.processing > 0) {
      this.log("warn", "Post-check skipped because batch is still running.", {
        pending: stats.pending,
        processing: stats.processing
      });
      return false;
    }

    const targets = this.state.items.filter((item) => item.status === "success");
    const now = this.deps.now();
    this.state = {
      ...this.state,
      postCheck: {
        running: true,
        total: targets.length,
        checked: 0,
        ok: 0,
        mismatch: 0,
        error: 0,
        updatedAt: now
      },
      updatedAt: now
    };
    await this.persist();
    this.log("info", "Post-check started.", {
      batchId: this.state.batchId,
      totalTargets: targets.length
    });
    this.emit();

    for (const [index, target] of targets.entries()) {
      if (!this.state) {
        return false;
      }
      await this.markVerifyStatus(target.clientId, "checking");

      try {
        const detail = await this.getItemDetailWithRetry(target.clientId);
        const code = detail.item.tax_infos?.vat_pit_category_code ?? "";
        const name = detail.item.tax_infos?.vat_pit_category_name ?? "";
        const expected = this.state.selectedTax;
        const matched = code === expected.code && name === expected.name;

        if (matched) {
          await this.markVerifyStatus(target.clientId, "ok", "Verified by re-fetch detail.");
          await this.bumpPostCheckCounter("ok");
        } else {
          await this.markVerifyStatus(
            target.clientId,
            "mismatch",
            `Expected (${expected.code} - ${expected.name}), got (${code} - ${name}).`
          );
          await this.bumpPostCheckCounter("mismatch");
        }
      } catch (error: unknown) {
        const normalized = normalizeApiError(error);
        await this.markVerifyStatus(
          target.clientId,
          "error",
          `${normalized.code}: ${normalized.message}`
        );
        await this.bumpPostCheckCounter("error");
      }

      if (index < targets.length - 1) {
        await this.sleep(this.policy.minDispatchGapMs);
      }
    }

    if (this.state?.postCheck) {
      this.state = {
        ...this.state,
        postCheck: {
          ...this.state.postCheck,
          running: false,
          updatedAt: this.deps.now()
        },
        updatedAt: this.deps.now()
      };
      await this.persist();
      this.log("info", "Post-check completed.", {
        postCheck: this.state.postCheck
      });
      this.emit();
    }
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
    if (this.timer) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
      this.timerDueAt = null;
    }
    await this.deps.storage.remove(STORAGE_KEY);
    this.log("warn", "Batch discarded.");
    this.emit();
  }

  private async restore(): Promise<void> {
    const saved = await this.deps.storage.get<BatchRunState>(STORAGE_KEY);
    if (!saved) {
      return;
    }

    const now = this.deps.now();
    const restoredItems = saved.items
      .map((item) => ({
        ...item,
        status: item.status === "processing" ? "pending" : item.status,
        verifyStatus: item.verifyStatus ?? "not_checked",
        updatedAt: now
      }))
      .filter((item) => item.status !== "success");

    if (restoredItems.length === 0) {
      this.state = null;
      await this.persist();
      return;
    }

    this.state = {
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
        : {
          running: false,
          total: 0,
          checked: 0,
          ok: 0,
          mismatch: 0,
          error: 0,
          updatedAt: now
        }
    };
    await this.persist();
    this.log("info", "Recovered unfinished batch from storage.", {
      batchId: this.state.batchId,
      stats: calcStats(this.state)
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
      stats: calcStats(this.state),
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

  private scheduleTick(delayMs: number): void {
    const dueAt = this.deps.now() + Math.max(0, delayMs);
    if (this.timer) {
      if (this.timerDueAt !== null && this.timerDueAt <= dueAt) {
        return;
      }
      this.deps.clearTimer(this.timer);
      this.timer = null;
      this.timerDueAt = null;
    }

    this.timerDueAt = dueAt;
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      this.timerDueAt = null;
      void this.tick();
    }, Math.max(0, delayMs));
  }

  private getNextPendingItem(): BatchItemState | undefined {
    if (!this.state) {
      return undefined;
    }
    return this.state.items.find((item) => item.status === "pending");
  }

  private async tick(): Promise<void> {
    if (this.tickInProgress) {
      return;
    }
    this.tickInProgress = true;

    try {
      if (!this.state || this.state.isPaused) {
        return;
      }

      while (
        this.state &&
        !this.state.isPaused &&
        this.inFlight < this.policy.maxConcurrency
      ) {
        const now = this.deps.now();
        if (now < this.nextDispatchAt) {
          break;
        }
        const nextItem = this.getNextPendingItem();
        if (!nextItem) {
          break;
        }
        const generation = this.generation;
        this.startItem(nextItem.clientId, generation).catch(() => {
          // Item-level errors are handled and recorded in state.
        });
        this.nextDispatchAt = now + this.policy.minDispatchGapMs;
      }

      if (!this.state || this.state.isPaused) {
        return;
      }

      const stats = calcStats(this.state);
      if (stats.pending === 0 && stats.processing === 0) {
        const currentState = this.state;
        this.log("info", "Batch completed.", {
          batchId: currentState.batchId,
          stats
        });

        const now = this.deps.now();
        const remainingItems = currentState.items.filter((item) => item.status !== "success");
        if (remainingItems.length === 0) {
          this.state = null;
        } else {
          this.state = {
            ...currentState,
            items: remainingItems,
            isPaused: true,
            updatedAt: now
          };
        }

        await this.persist();
        this.emit();
        return;
      }

      const now = this.deps.now();
      const delay = Math.max(0, this.nextDispatchAt - now);
      this.scheduleTick(delay);
    } finally {
      this.tickInProgress = false;
    }
  }

  private async startItem(clientId: string, generation: number): Promise<void> {
    if (!this.state) {
      return;
    }

    const itemIndex = this.state.items.findIndex((item) => item.clientId === clientId);
    if (itemIndex < 0) {
      return;
    }

    const now = this.deps.now();
    const itemState = this.state.items[itemIndex];
    if (!itemState) {
      return;
    }
    const currentAttempts = itemState.attempts + 1;
    this.state.items[itemIndex] = {
      ...itemState,
      status: "processing",
      attempts: currentAttempts,
      updatedAt: now
    };
    this.state.updatedAt = now;
    this.inFlight += 1;
    await this.persist();
    this.log("info", `Item started: ${itemState.name} [attempt ${currentAttempts}]`, {
      itemName: itemState.name,
      attempt: currentAttempts
    });

    try {
      await this.processItem(clientId, generation, currentAttempts, itemState.name);
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.scheduleTick(0);
    }
  }

  private async processItem(clientId: string, generation: number, attempt: number, itemName: string): Promise<void> {
    const state = this.state;
    if (!state) {
      return;
    }

    try {
      const detail = await this.apiClient.getItemDetail(clientId);
      this.ensureGeneration(generation);
      const patchedItem: Item = patchTaxInfos(detail.item, state.selectedTax);
      const updated = await this.apiClient.updateItem(clientId, patchedItem);
      this.ensureGeneration(generation);
      this.verifyTaxInfos(updated.item, state.selectedTax);
      await this.markItemStatus(clientId, "success");
      this.log(
        "info",
        `Item updated successfully: ${itemName} | Tax info code  : ${state.selectedTax.code}`,
        {
          itemName,
          taxCode: state.selectedTax.code
        }
      );
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const retriesUsed = attempt - 1;
      const shouldRetry = normalized.retryable && retriesUsed < this.policy.maxRetries;

      if (shouldRetry) {
        const retryDelay = this.computeRetryDelayMs(normalized, retriesUsed + 1);
        await this.markItemRetryInProgress(clientId, normalized, attempt + 1);
        this.log("warn", "Item scheduled for retry.", {
          clientId,
          itemName,
          attempt,
          retryInMs: retryDelay,
          code: normalized.code
        });
        await this.sleep(retryDelay);
        this.ensureGeneration(generation);
        await this.processItem(clientId, generation, attempt + 1, itemName);
        return;
      }

      await this.markItemStatus(clientId, "failed", normalized);
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

  private async markItemRetryInProgress(clientId: string, lastError: ApiError, nextAttempt: number): Promise<void> {
    if (!this.state) {
      return;
    }
    const itemIndex = this.state.items.findIndex((item) => item.clientId === clientId);
    if (itemIndex < 0) {
      return;
    }

    const now = this.deps.now();
    const current = this.state.items[itemIndex];
    if (!current) {
      return;
    }
    this.state.items[itemIndex] = {
      ...current,
      status: "processing",
      attempts: nextAttempt,
      verifyStatus: "not_checked",
      lastError,
      updatedAt: now
    };
    this.state.updatedAt = now;
    await this.persist();
    this.emit();
  }

  private async markItemStatus(clientId: string, status: BatchItemStatus, lastError?: ApiError): Promise<void> {
    if (!this.state) {
      return;
    }
    const itemIndex = this.state.items.findIndex((item) => item.clientId === clientId);
    if (itemIndex < 0) {
      return;
    }

    const current = this.state.items[itemIndex];
    if (!current) {
      return;
    }
    const next: BatchItemState = {
      ...current,
      status,
      updatedAt: this.deps.now()
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

    this.state.items[itemIndex] = next;
    this.state.updatedAt = this.deps.now();
    await this.persist();
    this.emit();
  }

  private computeRetryDelayMs(error: ApiError, retryIndex: number): number {
    if (typeof error.retryAfterMs === "number" && error.retryAfterMs >= 0) {
      return error.retryAfterMs;
    }
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, retryIndex - 1));
    const jitter = Math.floor(this.deps.random() * (this.policy.jitterMs + 1));
    return base + jitter;
  }

  private ensureGeneration(generation: number): void {
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
    while (attempt <= this.policy.maxRetries + 1) {
      try {
        return await this.apiClient.getItemDetail(clientId);
      } catch (error: unknown) {
        const normalized = normalizeApiError(error);
        const retriesUsed = attempt - 1;
        const shouldRetry = normalized.retryable && retriesUsed < this.policy.maxRetries;
        if (!shouldRetry) {
          throw normalized;
        }
        const retryDelay = this.computeRetryDelayMs(normalized, retriesUsed + 1);
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
    throw {
      status: 0,
      code: "POST_CHECK_RETRY_EXHAUSTED",
      message: "Post-check retries exhausted.",
      retryable: false
    } satisfies ApiError;
  }

  private async markVerifyStatus(
    clientId: string,
    verifyStatus: BatchItemState["verifyStatus"],
    verifyMessage?: string
  ): Promise<void> {
    if (!this.state) {
      return;
    }
    const itemIndex = this.state.items.findIndex((item) => item.clientId === clientId);
    if (itemIndex < 0) {
      return;
    }

    const now = this.deps.now();
    const current = this.state.items[itemIndex];
    if (!current) {
      return;
    }
    const next: BatchItemState = {
      ...current,
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

    this.state.items[itemIndex] = next;
    this.state.updatedAt = now;
    await this.persist();
    this.emit();
  }

  private async bumpPostCheckCounter(result: "ok" | "mismatch" | "error"): Promise<void> {
    if (!this.state || !this.state.postCheck) {
      return;
    }
    const now = this.deps.now();
    const next = {
      ...this.state.postCheck,
      checked: this.state.postCheck.checked + 1,
      updatedAt: now
    };
    if (result === "ok") {
      next.ok += 1;
    } else if (result === "mismatch") {
      next.mismatch += 1;
    } else {
      next.error += 1;
    }

    this.state = {
      ...this.state,
      postCheck: next,
      updatedAt: now
    };
    await this.persist();
    this.emit();
  }
}
