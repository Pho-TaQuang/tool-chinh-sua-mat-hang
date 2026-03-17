import { describe, expect, it, vi } from "vitest";
import type { QueueManager } from "./queue.manager";
import { SapoApiClient } from "./api.client";

function createQueueMock(resultBody: unknown) {
  return {
    enqueueRequest: vi.fn().mockResolvedValue({
      jobId: "job-1",
      result: Promise.resolve({
        status: 200,
        ok: true,
        headers: { "content-type": "application/json" },
        body: resultBody
      })
    })
  };
}

describe("SapoApiClient", () => {
  it("fails fast for mutating request when both x-fnb-token and csrf are missing", async () => {
    const queueMock = createQueueMock({ categories: [], metadata: { total: 0, page: 1, limit: 5 } });
    const client = new SapoApiClient({
      queue: queueMock as unknown as QueueManager
    });

    const item = {
      server_id: 1,
      client_id: "abc",
      name: "Mì trộn",
      description: "",
      item_type: "basic",
      stock_type: "nottrack",
      color: "B1AFAF",
      stamp_print: true,
      kitchen_id: null,
      sub_kitchen_ids: [],
      created_on: 1,
      modified_on: 1,
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
      tax_infos: { vat_pit_category_code: "", vat_pit_category_name: "" },
      tax_reduction_rate: null
    };

    await expect(
      client.updateItem(
        {
          csrfToken: null,
          fnbToken: null,
          merchantId: null,
          storeId: null,
          shopOrigin: "https://fnb.mysapo.vn"
        },
        "abc",
        item
      )
    ).rejects.toMatchObject({
      code: "MISSING_AUTH_TOKEN",
      retryable: false
    });
    expect(queueMock.enqueueRequest).not.toHaveBeenCalled();
  });

  it("builds GET categories request with required headers and credentials", async () => {
    const queueMock = createQueueMock({
      categories: [{ client_id: "a", name: "Đồ uống" }],
      metadata: { total: 1, page: 1, limit: 5 }
    });
    const client = new SapoApiClient({
      queue: queueMock as unknown as QueueManager
    });

    const response = await client.getCategories(
      {
        csrfToken: null,
        fnbToken: "fnb-token-123",
        merchantId: "47985",
        storeId: "49524",
        shopOrigin: "https://fnb.mysapo.vn"
      },
      {
        page: 1,
        limit: 5,
        name: ""
      }
    );

    expect(response.metadata.total).toBe(1);
    expect(queueMock.enqueueRequest).toHaveBeenCalledTimes(1);
    expect(queueMock.enqueueRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        url: "https://fnb.mysapo.vn/admin/categories.json?page=1&limit=5&name=",
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
          "x-fnb-token": "fnb-token-123",
          "x-merchant-id": "47985",
          "x-store-id": "49524"
        })
      })
    );
  });

  it("sends update payload as full { item } via PUT", async () => {
    const queueMock = createQueueMock({
      item: { client_id: "abc", name: "Mì trộn" }
    });
    const client = new SapoApiClient({
      queue: queueMock as unknown as QueueManager
    });

    const item = {
      server_id: 1,
      client_id: "abc",
      name: "Mì trộn",
      description: "",
      item_type: "basic",
      stock_type: "nottrack",
      color: "B1AFAF",
      stamp_print: true,
      kitchen_id: null,
      sub_kitchen_ids: [],
      created_on: 1,
      modified_on: 1,
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
      tax_infos: { vat_pit_category_code: "", vat_pit_category_name: "" },
      tax_reduction_rate: null
    };

    const response = await client.updateItem(
      {
        csrfToken: null,
        fnbToken: "token",
        merchantId: "47985",
        storeId: "49524",
        shopOrigin: "https://fnb.mysapo.vn"
      },
      "abc",
      item
    );

    expect(response.item.client_id).toBe("abc");
    expect(queueMock.enqueueRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PUT",
        url: "https://fnb.mysapo.vn/admin/items/abc.json",
        body: JSON.stringify({ item }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-fnb-token": "token",
          "x-merchant-id": "47985",
          "x-store-id": "49524"
        })
      })
    );
  });
});
