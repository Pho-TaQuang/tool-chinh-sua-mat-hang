import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@shared/types/sapo.types";
import type { BatchRunnerStorage } from "./runner";
import { BatchRunner } from "./runner";
import type { SiteApiClient } from "../site.api.client";

const expectValue = expect as unknown as (actual: unknown) => any;

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createItem(clientId: string): Item {
  return {
    server_id: 1,
    client_id: clientId,
    name: clientId,
    description: "",
    item_type: "basic",
    stock_type: "nottrack",
    color: "B1AFAF",
    stamp_print: false,
    kitchen_id: null,
    sub_kitchen_ids: [],
    created_on: 1,
    modified_on: 2,
    barcode_setting: false,
    tax: null,
    time_frame_id: null,
    stock_unit: null,
    category: null,
    image: null,
    variants: [],
    mod_sets: [],
    channels: [],
    sale_channels: [],
    tax_infos: {
      vat_pit_category_code: "",
      vat_pit_category_name: ""
    },
    tax_reduction_rate: null
  };
}

function memoryStorage(initial?: Record<string, unknown>): BatchRunnerStorage {
  const data = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return data.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      data.set(key, structuredClone(value));
    },
    async remove(key: string): Promise<void> {
      data.delete(key);
    }
  };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
}

describe("BatchRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00.000Z"));
  });

  it("retries 429 with Retry-After and cleans completed success state", async () => {
    const storage = memoryStorage();
    const getDetail = vi.fn().mockResolvedValue({ item: createItem("item-1") });
    const update = vi
      .fn()
      .mockRejectedValueOnce({
        status: 429,
        code: "HTTP_429",
        message: "throttle",
        retryable: true,
        retryAfterMs: 7000
      })
      .mockResolvedValueOnce({
        item: {
          ...createItem("item-1"),
          tax_infos: {
            vat_pit_category_code: "305",
            vat_pit_category_name: "Food Service"
          }
        }
      });

    const apiClient = {
      getItemDetail: getDetail,
      updateItem: update
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      policy: { maxRetries: 3, jitterMs: 0, minDispatchGapMs: 0 },
      dependencies: {
        storage,
        random: () => 0
      }
    });

    await runner.startBatch({
      items: [{ clientId: "item-1", name: "item-1" }],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });

    await flush();
    expectValue(update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6999);
    await flush();
    expectValue(update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expectValue(update).toHaveBeenCalledTimes(2);

    const state = runner.getState();
    expectValue(state).toBeNull();
  });

  it("stops retrying after maxRetries=3 (4 attempts total)", async () => {
    const storage = memoryStorage();
    const apiClient = {
      getItemDetail: vi.fn().mockResolvedValue({ item: createItem("item-1") }),
      updateItem: vi.fn().mockRejectedValue({
        status: 429,
        code: "HTTP_429",
        message: "throttle",
        retryable: true
      })
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      policy: { maxRetries: 3, jitterMs: 0, minDispatchGapMs: 0 },
      dependencies: {
        storage,
        random: () => 0
      }
    });

    await runner.startBatch({
      items: [{ clientId: "item-1", name: "item-1" }],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });

    await vi.advanceTimersByTimeAsync(20_000);
    await flush();

    expectValue(apiClient.updateItem).toHaveBeenCalledTimes(4);
    const state = runner.getState();
    expectValue(state?.items[0]?.status).toBe("failed");
    expectValue(state?.items[0]?.attempts).toBe(4);
  });

  it("restores processing items as pending and drops success items", async () => {
    const storage = memoryStorage({
      sapo_tax_batch_v1: {
        batchId: "batch-1",
        selectedTax: { code: "305", name: "Food Service" },
        page: 1,
        limit: 50,
        categoryId: null,
        isPaused: false,
        createdAt: 1,
        updatedAt: 2,
        items: [
          { clientId: "a", name: "A", status: "processing", attempts: 2, updatedAt: 2 },
          { clientId: "b", name: "B", status: "success", attempts: 1, updatedAt: 2 }
        ]
      }
    });

    const apiClient = {
      getItemDetail: vi.fn(),
      updateItem: vi.fn()
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      dependencies: { storage }
    });

    await runner.init();
    const state = runner.getState();
    expectValue(state?.isPaused).toBe(true);
    expectValue(state?.items[0]?.status).toBe("pending");
    expectValue(state?.items).toHaveLength(1);
  });

  it("retryFailed re-queues failed items and keeps success pruned", async () => {
    const storage = memoryStorage({
      sapo_tax_batch_v1: {
        batchId: "batch-1",
        selectedTax: { code: "305", name: "Food Service" },
        page: 1,
        limit: 50,
        categoryId: null,
        isPaused: true,
        createdAt: 1,
        updatedAt: 2,
        items: [
          { clientId: "a", name: "A", status: "failed", attempts: 2, updatedAt: 2 },
          { clientId: "b", name: "B", status: "success", attempts: 1, updatedAt: 2 }
        ]
      }
    });

    const apiClient = {
      getItemDetail: vi.fn(),
      updateItem: vi.fn()
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      dependencies: { storage }
    });

    await runner.init();
    await runner.retryFailed();
    const state = runner.getState();
    expectValue(state?.items[0]?.status).toBe("pending");
    expectValue(state?.items).toHaveLength(1);
  });

  it("enforces minimum dispatch gap between item starts", async () => {
    const storage = memoryStorage();
    const startTimestamps: number[] = [];

    const runner = new BatchRunner({
      apiClient: {
        getItemDetail: vi.fn().mockImplementation(async (clientId: string) => {
          return { item: createItem(clientId) };
        }),
        updateItem: vi.fn().mockImplementation(async (clientId: string) => {
          return {
            item: {
              ...createItem(clientId),
              tax_infos: {
                vat_pit_category_code: "305",
                vat_pit_category_name: "Food Service"
              }
            }
          };
        })
      } as unknown as SiteApiClient,
      policy: { maxConcurrency: 3, minDispatchGapMs: 300, jitterMs: 0, maxRetries: 3 },
      dependencies: {
        storage,
        random: () => 0
      },
      logger: (entry) => {
        if (entry.message.startsWith("Item started:")) {
          startTimestamps.push(entry.timestamp);
        }
      }
    });

    await runner.startBatch({
      items: [
        { clientId: "a", name: "A" },
        { clientId: "b", name: "B" },
        { clientId: "c", name: "C" }
      ],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });

    await vi.advanceTimersByTimeAsync(1000);
    await flush();

    expectValue(startTimestamps.length).toBe(3);
    expectValue(startTimestamps[1]! - startTimestamps[0]!).toBeGreaterThanOrEqual(300);
    expectValue(startTimestamps[2]! - startTimestamps[1]!).toBeGreaterThanOrEqual(300);
  });

  it("post-check is skipped after successful items were cleaned", async () => {
    const storage = memoryStorage();
    const baseItem = createItem("item-1");

    const apiClient = {
      getItemDetail: vi
        .fn()
        .mockResolvedValueOnce({ item: baseItem })
        .mockResolvedValueOnce({
          item: {
            ...baseItem,
            tax_infos: {
              vat_pit_category_code: "305",
              vat_pit_category_name: "Food Service"
            }
          }
        }),
      updateItem: vi.fn().mockResolvedValue({
        item: {
          ...baseItem,
          tax_infos: {
            vat_pit_category_code: "305",
            vat_pit_category_name: "Food Service"
          }
        }
      })
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: { storage, random: () => 0 }
    });

    await runner.startBatch({
      items: [{ clientId: "item-1", name: "item-1" }],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });
    await vi.advanceTimersByTimeAsync(50);
    await flush();

    const started = await runner.runPostCheck();
    expectValue(started).toBe(false);
    expectValue(runner.getState()).toBeNull();
  });

  it("prunes successful items and pauses the remaining failures when a mixed batch completes", async () => {
    const storage = memoryStorage();
    const apiClient = {
      getItemDetail: vi.fn().mockImplementation(async (clientId: string) => ({ item: createItem(clientId) })),
      updateItem: vi.fn().mockImplementation(async (clientId: string) => {
        if (clientId === "a") {
          return {
            item: {
              ...createItem(clientId),
              tax_infos: {
                vat_pit_category_code: "305",
                vat_pit_category_name: "Food Service"
              }
            }
          };
        }

        throw {
          status: 422,
          code: "HTTP_422",
          message: "invalid",
          retryable: false
        };
      })
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: { storage, random: () => 0 }
    });

    await runner.startBatch({
      items: [
        { clientId: "a", name: "A" },
        { clientId: "b", name: "B" }
      ],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });

    await vi.advanceTimersByTimeAsync(50);
    await flush();

    const state = runner.getState();
    expectValue(state?.isPaused).toBe(true);
    expectValue(state?.items).toHaveLength(1);
    expectValue(state?.items[0]).toMatchObject({
      clientId: "b",
      status: "failed"
    });
  });

  it("marks an item failed without retry when tax verification mismatches", async () => {
    const storage = memoryStorage();
    const apiClient = {
      getItemDetail: vi.fn().mockResolvedValue({ item: createItem("item-1") }),
      updateItem: vi.fn().mockResolvedValue({
        item: createItem("item-1")
      })
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: { storage, random: () => 0 }
    });

    await runner.startBatch({
      items: [{ clientId: "item-1", name: "item-1" }],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });

    await vi.advanceTimersByTimeAsync(50);
    await flush();

    expectValue(apiClient.updateItem).toHaveBeenCalledTimes(1);
    const state = runner.getState();
    expectValue(state?.isPaused).toBe(true);
    expectValue(state?.items[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: {
        code: "VERIFY_FAILED"
      }
    });
  });

  it("does not let stale async work mutate state after discard", async () => {
    const storage = memoryStorage();
    const detail = createDeferred<{ item: Item }>();
    const apiClient = {
      getItemDetail: vi.fn().mockReturnValue(detail.promise),
      updateItem: vi.fn()
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: { storage, random: () => 0 }
    });

    await runner.startBatch({
      items: [{ clientId: "item-1", name: "item-1" }],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });

    await flush();
    expectValue(runner.getState()?.items[0]?.status).toBe("processing");

    await runner.discard();
    detail.resolve({ item: createItem("item-1") });
    await flush();

    expectValue(apiClient.updateItem).not.toHaveBeenCalled();
    expectValue(runner.getState()).toBeNull();
  });

  it("returns false for post-check while the batch is still running", async () => {
    const storage = memoryStorage();
    const detail = createDeferred<{ item: Item }>();
    const apiClient = {
      getItemDetail: vi.fn().mockReturnValue(detail.promise),
      updateItem: vi.fn()
    } as unknown as SiteApiClient;

    const runner = new BatchRunner({
      apiClient,
      policy: { minDispatchGapMs: 0, jitterMs: 0 },
      dependencies: { storage, random: () => 0 }
    });

    await runner.startBatch({
      items: [{ clientId: "item-1", name: "item-1" }],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    });

    await flush();
    const started = await runner.runPostCheck();

    expectValue(started).toBe(false);

    await runner.discard();
    detail.resolve({ item: createItem("item-1") });
    await flush();
  });
});
