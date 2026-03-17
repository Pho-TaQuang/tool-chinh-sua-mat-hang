import type { ApiError } from "@shared/types/sapo.types";

const STORAGE_KEY = "sapo_batch_queue_v1";
const MAX_BACKOFF_MS = 30_000;
const RESTORE_JITTER_MS = 150;

export type QueueJobStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export interface QueuePolicy {
  maxInFlightRequests: number;
  minDispatchGapMs: number;
  maxRetries: number;
  jobTtlMs: number;
  jitterMs: number;
}

export interface QueueRequestTask {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
  credentials?: RequestCredentials;
  metadata?: Record<string, unknown>;
}

export interface QueueJobState {
  id: string;
  status: QueueJobStatus;
  retriesUsed: number;
  nextEligibleAt: number;
  deadlineAt: number;
  lastError?: ApiError;
  updatedAt: number;
}

interface QueueJobRecord extends QueueJobState {
  createdAt: number;
  request: QueueRequestTask;
}

interface PersistedQueueState {
  globalNextDispatchAt: number;
  jobs: QueueJobRecord[];
}

export interface QueueRequestResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
}

export interface QueueEvent {
  job: QueueJobState;
}

export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface QueueDependencies {
  fetchFn: typeof fetch;
  storage: StorageAdapter;
  now: () => number;
  random: () => number;
  setTimer: (handler: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface QueueManagerOptions {
  policy?: Partial<QueuePolicy>;
  dependencies?: Partial<QueueDependencies>;
}

type JobResolver = {
  resolve: (value: QueueRequestResult) => void;
  reject: (reason: ApiError) => void;
};

type QueueListener = {
  progress?: (event: QueueEvent) => void;
  done?: (event: QueueEvent) => void;
  error?: (event: QueueEvent) => void;
};

const DEFAULT_POLICY: QueuePolicy = {
  maxInFlightRequests: 3,
  minDispatchGapMs: 300,
  maxRetries: 3,
  jobTtlMs: 10 * 60 * 1000,
  jitterMs: 250
};

export const chromeStorageAdapter: StorageAdapter = {
  async get<T>(key: string): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      chrome.storage.local.get(key, (storageResult) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(storageResult[key] as T | undefined);
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
  }
};

function defaultDependencies(): QueueDependencies {
  return {
    fetchFn: fetch,
    storage: chromeStorageAdapter,
    now: () => Date.now(),
    random: () => Math.random(),
    setTimer: (handler, delayMs) => setTimeout(handler, delayMs),
    clearTimer: (timer) => clearTimeout(timer)
  };
}

function createApiError(input: {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
  retryAfterMs?: number;
}): ApiError {
  const error: ApiError = {
    status: input.status,
    code: input.code,
    message: input.message,
    retryable: input.retryable
  };
  if (input.details !== undefined) {
    error.details = input.details;
  }
  if (input.retryAfterMs !== undefined) {
    error.retryAfterMs = input.retryAfterMs;
  }
  return error;
}

function parseRetryAfterToMs(retryAfter: string | null, nowMs: number): number | undefined {
  if (!retryAfter) {
    return undefined;
  }

  const trimmed = retryAfter.trim();
  if (!trimmed) {
    return undefined;
  }

  const asSeconds = Number(trimmed);
  if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
    return Math.floor(asSeconds * 1000);
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isNaN(parsedDate)) {
    return undefined;
  }

  const delta = parsedDate - nowMs;
  if (delta <= 0) {
    return 0;
  }

  return delta;
}

function toHeadersObject(headers: Headers): Record<string, string> {
  const entries: Record<string, string> = {};
  headers.forEach((value, key) => {
    entries[key] = value;
  });
  return entries;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export class QueueManager {
  public readonly policy: QueuePolicy;

  private readonly deps: QueueDependencies;
  private readonly jobs = new Map<string, QueueJobRecord>();
  private readonly listeners = new Set<QueueListener>();
  private readonly resolvers = new Map<string, JobResolver>();
  private readonly abortControllers = new Map<string, AbortController>();

  private inFlight = 0;
  private globalNextDispatchAt = 0;
  private sequence = 0;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private isTicking = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt: number | null = null;

  constructor(options?: QueueManagerOptions) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...options?.policy
    };
    this.deps = {
      ...defaultDependencies(),
      ...options?.dependencies
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

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async enqueueRequest(task: QueueRequestTask): Promise<{ jobId: string; result: Promise<QueueRequestResult> }> {
    await this.init();

    const now = this.deps.now();
    const id = this.createJobId();
    const record: QueueJobRecord = {
      id,
      request: task,
      status: "pending",
      retriesUsed: 0,
      createdAt: now,
      updatedAt: now,
      nextEligibleAt: now,
      deadlineAt: now + this.policy.jobTtlMs
    };

    this.jobs.set(id, record);
    await this.persist();
    this.scheduleTick(0);

    const result = new Promise<QueueRequestResult>((resolve, reject) => {
      this.resolvers.set(id, { resolve, reject });
    });

    return { jobId: id, result };
  }

  async cancel(jobId: string): Promise<boolean> {
    await this.init();

    const job = this.jobs.get(jobId);
    if (!job || job.status === "success" || job.status === "failed" || job.status === "cancelled") {
      return false;
    }

    const now = this.deps.now();
    job.status = "cancelled";
    job.updatedAt = now;
    this.jobs.set(jobId, job);

    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(jobId);
    }

    await this.persist();
    this.emit("error", job);
    this.rejectResolver(jobId, createApiError({
      status: 499,
      code: "JOB_CANCELLED",
      message: `Queue job ${jobId} was cancelled.`,
      retryable: false
    }));

    return true;
  }

  async snapshot(): Promise<QueueJobState[]> {
    await this.init();
    return this.listJobs();
  }

  private async restore(): Promise<void> {
    const restored = await this.deps.storage.get<PersistedQueueState>(STORAGE_KEY);
    if (!restored) {
      return;
    }

    const now = this.deps.now();
    const pendingOrRunning = restored.jobs.filter((job) => job.status === "pending" || job.status === "running");
    let restoreIndex = 0;

    for (const storedJob of restored.jobs) {
      const normalized: QueueJobRecord = {
        ...storedJob,
        status: storedJob.status === "running" ? "pending" : storedJob.status
      };

      if (normalized.status === "pending") {
        const base = Math.max(now, normalized.nextEligibleAt);
        const restoreJitter = Math.floor(this.deps.random() * (RESTORE_JITTER_MS + 1));
        const stagger = restoreIndex * this.policy.minDispatchGapMs + restoreJitter;
        normalized.nextEligibleAt = base + stagger;
        normalized.updatedAt = now;
        restoreIndex += 1;
      }

      this.jobs.set(normalized.id, normalized);
      this.sequence = Math.max(this.sequence, this.extractSequence(normalized.id));
    }

    if (pendingOrRunning.length > 0) {
      this.globalNextDispatchAt = Math.max(now, restored.globalNextDispatchAt);
      await this.persist();
      this.scheduleTick(0);
    }
  }

  private async tick(): Promise<void> {
    if (this.isTicking) {
      return;
    }

    this.isTicking = true;
    try {
      const now = this.deps.now();
      while (this.inFlight < this.policy.maxInFlightRequests) {
        const currentNow = this.deps.now();
        if (currentNow < this.globalNextDispatchAt) {
          break;
        }

        const nextJob = this.getNextDispatchableJob(currentNow);
        if (!nextJob) {
          break;
        }

        this.startJob(nextJob).catch(() => {
          // The error is handled internally and reported via state/event.
        });
        this.globalNextDispatchAt = currentNow + this.policy.minDispatchGapMs;
      }

      await this.persist();

      const nextWake = this.computeNextWakeDelay(now);
      if (nextWake !== null) {
        this.scheduleTick(nextWake);
      }
    } finally {
      this.isTicking = false;
    }
  }

  private getNextDispatchableJob(now: number): QueueJobRecord | undefined {
    let selected: QueueJobRecord | undefined;
    for (const job of this.jobs.values()) {
      if (job.status !== "pending") {
        continue;
      }
      if (now < job.nextEligibleAt) {
        continue;
      }
      if (!selected || job.nextEligibleAt < selected.nextEligibleAt || job.createdAt < selected.createdAt) {
        selected = job;
      }
    }
    return selected;
  }

  private computeNextWakeDelay(now: number): number | null {
    let nextAt: number | null = null;

    for (const job of this.jobs.values()) {
      if (job.status !== "pending") {
        continue;
      }
      nextAt = nextAt === null ? job.nextEligibleAt : Math.min(nextAt, job.nextEligibleAt);
    }

    if (nextAt === null) {
      return null;
    }

    const gate = Math.max(nextAt, this.globalNextDispatchAt);
    return Math.max(0, gate - now);
  }

  private async startJob(job: QueueJobRecord): Promise<void> {
    const now = this.deps.now();
    job.status = "running";
    job.updatedAt = now;
    this.jobs.set(job.id, job);
    this.inFlight += 1;
    this.emit("progress", job);

    const controller = new AbortController();
    this.abortControllers.set(job.id, controller);

    try {
      const requestInit: RequestInit = {
        method: job.request.method,
        headers: job.request.headers,
        credentials: job.request.credentials ?? "include",
        signal: controller.signal,
        ...(job.request.body !== undefined ? { body: job.request.body } : {})
      };
      const response = await this.deps.fetchFn(job.request.url, requestInit);
      this.abortControllers.delete(job.id);

      const headers = toHeadersObject(response.headers);
      const body = await parseResponseBody(response);
      if (response.ok) {
        await this.markSuccess(job, { status: response.status, ok: true, headers, body });
        return;
      }

      const retryAfterMs = parseRetryAfterToMs(response.headers.get("Retry-After"), this.deps.now());
      const error = createApiError({
        status: response.status,
        code: `HTTP_${response.status}`,
        message: `HTTP ${response.status} while processing ${job.request.method} ${job.request.url}.`,
        details: body,
        retryable: response.status === 429 || response.status >= 500,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {})
      });

      await this.handleFailure(job, error);
    } catch (error: unknown) {
      this.abortControllers.delete(job.id);

      const latestState = this.jobs.get(job.id);
      if (latestState?.status === "cancelled") {
        return;
      }

      const networkError = createApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "Network failure or timeout while calling Sapo API.",
        details: error instanceof Error ? { name: error.name, message: error.message } : error,
        retryable: true
      });
      await this.handleFailure(job, networkError);
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.scheduleTick(0);
    }
  }

  private async markSuccess(job: QueueJobRecord, result: QueueRequestResult): Promise<void> {
    const now = this.deps.now();
    job.status = "success";
    job.updatedAt = now;
    this.jobs.set(job.id, job);
    await this.persist();
    this.emit("progress", job);
    this.emit("done", job);
    this.resolveResolver(job.id, result);
  }

  private async handleFailure(job: QueueJobRecord, error: ApiError): Promise<void> {
    const now = this.deps.now();
    const nextRetryIndex = job.retriesUsed + 1;
    const retryWindow = this.computeRetryDelayMs(error, nextRetryIndex);
    const nextEligibleAt = now + retryWindow;
    const shouldRetry =
      error.retryable &&
      job.retriesUsed < this.policy.maxRetries &&
      nextEligibleAt <= job.deadlineAt;

    if (shouldRetry) {
      job.retriesUsed = nextRetryIndex;
      job.nextEligibleAt = nextEligibleAt;
      job.lastError = error;
      job.status = "pending";
      job.updatedAt = now;
      this.jobs.set(job.id, job);
      await this.persist();
      this.emit("progress", job);
      return;
    }

    job.status = "failed";
    job.lastError = error;
    job.updatedAt = now;
    this.jobs.set(job.id, job);
    await this.persist();
    this.emit("progress", job);
    this.emit("error", job);
    this.rejectResolver(job.id, error);
  }

  private computeRetryDelayMs(error: ApiError, retryIndex: number): number {
    if (typeof error.retryAfterMs === "number" && error.retryAfterMs >= 0) {
      return error.retryAfterMs;
    }

    const jitter = Math.floor(this.deps.random() * (this.policy.jitterMs + 1));
    const exponential = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, retryIndex - 1));
    return exponential + jitter;
  }

  private emit(type: keyof QueueListener, job: QueueJobRecord): void {
    const payload: QueueEvent = { job: toQueueJobState(job) };

    for (const listener of this.listeners) {
      const handler = listener[type];
      if (handler) {
        handler(payload);
      }
    }
  }

  private resolveResolver(jobId: string, result: QueueRequestResult): void {
    const resolver = this.resolvers.get(jobId);
    if (!resolver) {
      return;
    }
    this.resolvers.delete(jobId);
    resolver.resolve(result);
  }

  private rejectResolver(jobId: string, error: ApiError): void {
    const resolver = this.resolvers.get(jobId);
    if (!resolver) {
      return;
    }
    this.resolvers.delete(jobId);
    resolver.reject(error);
  }

  private listJobs(): QueueJobState[] {
    return Array.from(this.jobs.values()).map((job) => toQueueJobState(job));
  }

  private async persist(): Promise<void> {
    const snapshot: PersistedQueueState = {
      globalNextDispatchAt: this.globalNextDispatchAt,
      jobs: Array.from(this.jobs.values())
    };
    await this.deps.storage.set(STORAGE_KEY, snapshot);
  }

  private scheduleTick(delayMs: number): void {
    const dueAt = this.deps.now() + Math.max(0, delayMs);
    if (this.timer !== null) {
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

  private createJobId(): string {
    this.sequence += 1;
    return `job-${this.sequence}-${this.deps.now()}`;
  }

  private extractSequence(jobId: string): number {
    const fragments = jobId.split("-");
    if (fragments.length < 2) {
      return 0;
    }
    const maybeSequence = Number(fragments[1]);
    if (Number.isNaN(maybeSequence)) {
      return 0;
    }
    return maybeSequence;
  }
}

function toQueueJobState(job: QueueJobRecord): QueueJobState {
  const state: QueueJobState = {
    id: job.id,
    status: job.status,
    retriesUsed: job.retriesUsed,
    nextEligibleAt: job.nextEligibleAt,
    deadlineAt: job.deadlineAt,
    updatedAt: job.updatedAt
  };
  if (job.lastError) {
    state.lastError = job.lastError;
  }
  return state;
}

export function buildQueuePolicy(overrides?: Partial<QueuePolicy>): QueuePolicy {
  return {
    ...DEFAULT_POLICY,
    ...overrides
  };
}
