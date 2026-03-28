import { describe, expect, it, vi } from "vitest";
import type { ModifySetCreateRequest } from "@shared/types/modify-set.types";
import type { SiteApiClient } from "../site.api.client";
import { ModifySetRunner } from "./runner";
import type { ModifySetPreparedInput } from "./types";

function createPayload(clientId: string): ModifySetCreateRequest {
  return {
    modify_set: {
      allow_multiple_quantity: true,
      client_id: clientId,
      max_quantity: 1,
      min_quantity: 0,
      name: `Set-${clientId}`,
      stock_type: "nottrack",
      mod_options: [
        {
          client_id: `${clientId}-opt`,
          default_selected: false,
          mod_ingredients: [],
          name: "Option",
          order_number: 1,
          price: 1000,
          cost: ""
        }
      ]
    }
  };
}

function createPrepared(localId: string): ModifySetPreparedInput {
  return {
    localId,
    name: `Set ${localId}`,
    itemIds: ["item-1", "item-2"],
    payload: createPayload(localId),
    existingClientId: null
  };
}

describe("ModifySetRunner", () => {
  it("runs create then mapping sequentially for multiple sets", async () => {
    const apiClient = {
      createModifySet: vi
        .fn()
        .mockResolvedValueOnce({ modify_set: { client_id: "ms-1" } })
        .mockResolvedValueOnce({ modify_set: { client_id: "ms-2" } }),
      mapModifySetToItems: vi.fn().mockResolvedValue({ success: true })
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      dependencies: {
        sleep: async () => undefined,
        random: () => 0
      }
    });

    const updates: Array<{ localId: string; status: string | undefined }> = [];
    const result = await runner.run([createPrepared("one"), createPrepared("two")], {
      onSetStatusChange: (localId, update) => {
        updates.push({ localId, status: update.status });
      }
    });

    expect(result.map((entry) => entry.status)).toEqual(["mapped", "mapped"]);
    expect(apiClient.createModifySet).toHaveBeenCalledTimes(2);
    expect(apiClient.mapModifySetToItems).toHaveBeenCalledTimes(2);
    expect(updates.filter((entry) => entry.status === "creating")).toHaveLength(2);
    expect(updates.filter((entry) => entry.status === "mapping")).toHaveLength(2);
  });

  it("does not run mapping when create fails", async () => {
    const apiClient = {
      createModifySet: vi.fn().mockRejectedValue({
        status: 422,
        code: "HTTP_422",
        message: "invalid",
        retryable: false
      }),
      mapModifySetToItems: vi.fn()
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      dependencies: {
        sleep: async () => undefined,
        random: () => 0
      }
    });

    const result = await runner.run([createPrepared("one")], {
      onSetStatusChange: () => undefined
    });

    expect(result[0]?.status).toBe("create_failed");
    expect(apiClient.mapModifySetToItems).not.toHaveBeenCalled();
  });

  it("keeps created id and marks mapping_failed when mapping call fails", async () => {
    const apiClient = {
      createModifySet: vi.fn().mockResolvedValue({ modify_set: { client_id: "ms-1" } }),
      mapModifySetToItems: vi.fn().mockRejectedValue({
        status: 500,
        code: "HTTP_500",
        message: "server",
        retryable: false
      })
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      dependencies: {
        sleep: async () => undefined,
        random: () => 0
      }
    });

    const result = await runner.run([createPrepared("one")], {
      onSetStatusChange: () => undefined
    });

    expect(result[0]).toMatchObject({
      status: "mapping_failed",
      modSetId: "ms-1"
    });
  });

  it("retries retryable create errors using retryAfterMs", async () => {
    const sleepSpy = vi.fn(async () => undefined);
    const apiClient = {
      createModifySet: vi
        .fn()
        .mockRejectedValueOnce({
          status: 429,
          code: "HTTP_429",
          message: "throttle",
          retryable: true,
          retryAfterMs: 7000
        })
        .mockResolvedValueOnce({ modify_set: { client_id: "ms-1" } }),
      mapModifySetToItems: vi.fn().mockResolvedValue({ success: true })
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      policy: { maxRetries: 3, jitterMs: 0 },
      dependencies: {
        sleep: sleepSpy,
        random: () => 0
      }
    });

    const result = await runner.run([createPrepared("one")], {
      onSetStatusChange: () => undefined
    });

    expect(result[0]?.status).toBe("mapped");
    expect(apiClient.createModifySet).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(7000);
  });

  it("does not create again when retrying mapping only and honors retryAfterMs", async () => {
    const sleepSpy = vi.fn(async () => undefined);
    const apiClient = {
      createModifySet: vi.fn(),
      mapModifySetToItems: vi
        .fn()
        .mockRejectedValueOnce({
          status: 429,
          code: "HTTP_429",
          message: "throttle",
          retryable: true,
          retryAfterMs: 2000
        })
        .mockResolvedValueOnce({ success: true })
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      policy: { maxRetries: 3, jitterMs: 0 },
      dependencies: {
        sleep: sleepSpy,
        random: () => 0
      }
    });

    const result = await runner.retryMappingOnly(
      {
        localId: "one",
        modSetId: "ms-1",
        itemIds: ["item-1", "item-2"]
      },
      {
        onSetStatusChange: () => undefined
      }
    );

    expect(result).toMatchObject({
      status: "mapped",
      modSetId: "ms-1"
    });
    expect(apiClient.createModifySet).not.toHaveBeenCalled();
    expect(apiClient.mapModifySetToItems).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledWith(2000);
  });

  it("emits callback order and falls back to payload client id when create response omits it", async () => {
    const prepared = createPrepared("one");
    const payloadClientId = prepared.payload.modify_set.client_id;
    const apiClient = {
      createModifySet: vi.fn().mockResolvedValue({ modify_set: {} }),
      mapModifySetToItems: vi.fn().mockResolvedValue({ success: true })
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      dependencies: {
        sleep: async () => undefined,
        random: () => 0
      }
    });

    const statuses: string[] = [];
    const apiClientIds: Array<string | null | undefined> = [];

    const result = await runner.run([prepared], {
      onSetStatusChange: (_localId, update) => {
        if (update.status) {
          statuses.push(update.status);
        }
        apiClientIds.push(update.apiClientId);
      }
    });

    expect(result[0]).toMatchObject({
      status: "mapped",
      modSetId: payloadClientId
    });
    expect(statuses).toEqual(["creating", "created", "mapping", "mapped"]);
    expect(apiClientIds).toContain(payloadClientId);
  });

  it("prefers create response id over payload and existing ids", async () => {
    const prepared = createPrepared("one");
    prepared.existingClientId = "existing-id";
    const apiClient = {
      createModifySet: vi.fn().mockResolvedValue({ modify_set: { client_id: "response-id" } }),
      mapModifySetToItems: vi.fn().mockResolvedValue({ success: true })
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      dependencies: {
        sleep: async () => undefined,
        random: () => 0
      }
    });

    const result = await runner.run([prepared], {
      onSetStatusChange: () => undefined
    });

    expect(result[0]).toMatchObject({
      status: "mapped",
      modSetId: "response-id"
    });
  });

  it("falls back to existingClientId when create response and payload ids are missing", async () => {
    const prepared = createPrepared("one");
    delete (prepared.payload.modify_set as { client_id?: string }).client_id;
    prepared.existingClientId = "existing-id";

    const apiClient = {
      createModifySet: vi.fn().mockResolvedValue({ modify_set: {} }),
      mapModifySetToItems: vi.fn().mockResolvedValue({ success: true })
    } as unknown as SiteApiClient;

    const runner = new ModifySetRunner({
      apiClient,
      dependencies: {
        sleep: async () => undefined,
        random: () => 0
      }
    });

    const result = await runner.run([prepared], {
      onSetStatusChange: () => undefined
    });

    expect(result[0]).toMatchObject({
      status: "mapped",
      modSetId: "existing-id"
    });
  });
});
