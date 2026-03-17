import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "./queue.manager";
import { QueueManager } from "./queue.manager";

function createMemoryStorage(initial?: Record<string, unknown>): StorageAdapter {
  const store = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      store.set(key, structuredClone(value));
    }
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers ?? {})
    }
  });
}

async function flushTimers(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
}

describe("QueueManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00.000Z"));
  });

  it("uses Retry-After header for 429 retries", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "throttled" }, 429, { "Retry-After": "7" }))
      .mockResolvedValueOnce(jsonResponse({ categories: [], metadata: { total: 0, page: 1, limit: 5 } }));

    const manager = new QueueManager({
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: {
        fetchFn: fetchMock as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => 0
      }
    });

    const enqueued = await manager.enqueueRequest({
      method: "GET",
      url: "https://fnb.mysapo.vn/admin/categories.json?page=1&limit=5",
      headers: {}
    });

    await flushTimers();
    const pending = (await manager.snapshot()).find((item) => item.id === enqueued.jobId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pending?.status).toBe("pending");
    expect(pending?.retriesUsed).toBe(1);
    expect(pending?.nextEligibleAt - Date.now()).toBeGreaterThanOrEqual(6998);

    const remaining = Math.max(1, (pending?.nextEligibleAt ?? Date.now()) - Date.now());
    await vi.advanceTimersByTimeAsync(remaining - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await flushTimers();
    await expect(enqueued.result).resolves.toMatchObject({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to exponential backoff when Retry-After is absent", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "throttled" }, 429))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const manager = new QueueManager({
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: {
        fetchFn: fetchMock as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => 0
      }
    });

    const enqueued = await manager.enqueueRequest({
      method: "GET",
      url: "https://fnb.mysapo.vn/admin/items.json?page=1&limit=50",
      headers: {}
    });

    await flushTimers();
    const pending = (await manager.snapshot()).find((item) => item.id === enqueued.jobId);
    expect(pending?.retriesUsed).toBe(1);
    expect(pending?.nextEligibleAt - Date.now()).toBeGreaterThanOrEqual(999);
    expect(pending?.nextEligibleAt - Date.now()).toBeLessThanOrEqual(1001);

    await vi.advanceTimersByTimeAsync(1000);
    await flushTimers();
    await expect(enqueued.result).resolves.toMatchObject({ ok: true, status: 200 });
  });

  it("treats maxRetries=3 as initial + 3 retries (4 total attempts)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "always" }, 429));

    const manager = new QueueManager({
      policy: { minDispatchGapMs: 0, jitterMs: 0, maxRetries: 3 },
      dependencies: {
        fetchFn: fetchMock as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => 0
      }
    });

    const enqueued = await manager.enqueueRequest({
      method: "GET",
      url: "https://fnb.mysapo.vn/admin/items.json?page=1&limit=50",
      headers: {}
    });
    enqueued.result.catch(() => undefined);

    await vi.advanceTimersByTimeAsync(20_000);
    await flushTimers();
    await expect(enqueued.result).rejects.toMatchObject({ code: "HTTP_429", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(30_000);
    await flushTimers();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry non-retryable 4xx but retries 5xx once", async () => {
    const fetch422 = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ message: "invalid" }, 422));
    const manager422 = new QueueManager({
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: {
        fetchFn: fetch422 as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => 0
      }
    });
    const job422 = await manager422.enqueueRequest({
      method: "PUT",
      url: "https://fnb.mysapo.vn/admin/items/abc.json",
      headers: {},
      body: "{}"
    });
    job422.result.catch(() => undefined);

    await flushTimers();
    await expect(job422.result).rejects.toMatchObject({ code: "HTTP_422", retryable: false });
    expect(fetch422).toHaveBeenCalledTimes(1);

    const fetch500 = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "oops" }, 500))
      .mockResolvedValueOnce(jsonResponse({ item: { client_id: "ok" } }, 200));
    const manager500 = new QueueManager({
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: {
        fetchFn: fetch500 as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => 0
      }
    });
    const job500 = await manager500.enqueueRequest({
      method: "GET",
      url: "https://fnb.mysapo.vn/admin/categories.json",
      headers: {}
    });
    await vi.advanceTimersByTimeAsync(1000);
    await flushTimers();
    await expect(job500.result).resolves.toMatchObject({ ok: true, status: 200 });
    expect(fetch500).toHaveBeenCalledTimes(2);
  });

  it("enforces shared in-flight request limit of 3", async () => {
    let inflight = 0;
    let maxInflight = 0;

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });
      inflight -= 1;
      return jsonResponse({ ok: true }, 200);
    });

    const manager = new QueueManager({
      policy: { minDispatchGapMs: 0, maxInFlightRequests: 3 },
      dependencies: {
        fetchFn: fetchMock as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => 0
      }
    });

    const jobs = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        manager.enqueueRequest({
          method: "GET",
          url: `https://fnb.mysapo.vn/admin/items.json?page=${index + 1}&limit=1`,
          headers: {}
        })
      )
    );

    await flushTimers();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(maxInflight).toBeLessThanOrEqual(3);

    await vi.advanceTimersByTimeAsync(10_000);
    await flushTimers();
    await Promise.all(jobs.map((job) => job.result));
    expect(maxInflight).toBe(3);
  });

  it("keeps minimum dispatch gap of 300ms", async () => {
    const callTimes: number[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(jsonResponse({ ok: true }, 200));
    });

    const manager = new QueueManager({
      policy: { minDispatchGapMs: 300, maxInFlightRequests: 3, jitterMs: 0 },
      dependencies: {
        fetchFn: fetchMock as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => 0
      }
    });

    const jobs = await Promise.all(
      Array.from({ length: 3 }, () =>
        manager.enqueueRequest({
          method: "GET",
          url: "https://fnb.mysapo.vn/admin/categories.json?page=1&limit=5",
          headers: {}
        })
      )
    );

    await flushTimers();
    await vi.advanceTimersByTimeAsync(300);
    await flushTimers();
    await vi.advanceTimersByTimeAsync(300);
    await flushTimers();
    await Promise.all(jobs.map((job) => job.result));
    expect(callTimes.length).toBe(3);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(300);
    expect(callTimes[2] - callTimes[1]).toBeGreaterThanOrEqual(300);
  });

  it("preserves retriesUsed and nextEligibleAt across restore", async () => {
    const storage = createMemoryStorage();
    const firstFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "rate_limited" }, 429, { "Retry-After": "7" }));
    const manager1 = new QueueManager({
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: {
        fetchFn: firstFetch as unknown as typeof fetch,
        storage,
        random: () => 0
      }
    });

    const enqueued = await manager1.enqueueRequest({
      method: "GET",
      url: "https://fnb.mysapo.vn/admin/categories.json?page=1&limit=5",
      headers: {}
    });
    await flushTimers();
    const before = (await manager1.snapshot()).find((job) => job.id === enqueued.jobId);
    expect(before?.retriesUsed).toBe(1);

    const manager2 = new QueueManager({
      policy: { minDispatchGapMs: 300, jitterMs: 0 },
      dependencies: {
        fetchFn: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true })) as unknown as typeof fetch,
        storage,
        random: () => 0
      }
    });
    await manager2.init();
    const after = (await manager2.snapshot()).find((job) => job.id === enqueued.jobId);

    expect(after?.retriesUsed).toBe(before?.retriesUsed);
    expect(after?.nextEligibleAt).toBeGreaterThanOrEqual(before?.nextEligibleAt ?? 0);
  });

  it("does not burst dispatch after restore", async () => {
    const storage = createMemoryStorage();
    const now = Date.now();
    await storage.set("sapo_batch_queue_v1", {
      globalNextDispatchAt: now,
      jobs: [
        {
          id: "job-1-1000",
          status: "pending",
          retriesUsed: 1,
          nextEligibleAt: now,
          deadlineAt: now + 60_000,
          updatedAt: now,
          createdAt: now - 5000,
          request: {
            method: "GET",
            url: "https://fnb.mysapo.vn/admin/categories.json?page=1&limit=5",
            headers: {}
          }
        },
        {
          id: "job-2-1001",
          status: "pending",
          retriesUsed: 0,
          nextEligibleAt: now,
          deadlineAt: now + 60_000,
          updatedAt: now,
          createdAt: now - 4000,
          request: {
            method: "GET",
            url: "https://fnb.mysapo.vn/admin/categories.json?page=2&limit=5",
            headers: {}
          }
        }
      ]
    });

    const callTimes: number[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(jsonResponse({ ok: true }, 200));
    });

    const manager = new QueueManager({
      policy: { minDispatchGapMs: 300, jitterMs: 0 },
      dependencies: {
        fetchFn: fetchMock as unknown as typeof fetch,
        storage,
        random: () => 0
      }
    });

    await manager.init();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(299);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(300);
  });

  it("spreads retry schedule with jitter under simultaneous 429", async () => {
    const randomValues = [0, 0.4, 0.8];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "burst" }, 429));
    const manager = new QueueManager({
      policy: { minDispatchGapMs: 0, maxRetries: 1, jitterMs: 250 },
      dependencies: {
        fetchFn: fetchMock as unknown as typeof fetch,
        storage: createMemoryStorage(),
        random: () => randomValues.shift() ?? 0
      }
    });

    await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        manager.enqueueRequest({
          method: "GET",
          url: `https://fnb.mysapo.vn/admin/items.json?page=${index + 1}&limit=1`,
          headers: {}
        })
      )
    );

    await flushTimers();
    const pending = (await manager.snapshot())
      .filter((job) => job.status === "pending")
      .map((job) => job.nextEligibleAt);
    expect(pending.length).toBe(3);
    expect(new Set(pending).size).toBeGreaterThan(1);
  });
});
