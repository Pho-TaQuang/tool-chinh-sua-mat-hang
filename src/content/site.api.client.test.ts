import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModifySetCreateRequest } from "@shared/types/modify-set.types";
import { SiteApiClient } from "./site.api.client";

const context = {
  csrfToken: "csrf",
  fnbToken: "token",
  merchantId: "47985",
  storeId: "49524",
  shopOrigin: "https://fnb.mysapo.vn"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("SiteApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds getItems query with name filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [], metadata: { total: 0, page: 1, limit: 50 } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SiteApiClient(() => context);
    await client.getItems(1, 50, "cat-1", "Bún bò");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://fnb.mysapo.vn/admin/items.json?page=1&limit=50&category_id=cat-1&name=B%C3%BAn+b%C3%B2"
    );
  });

  it("builds getModifySets query with name filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ mod_sets: [], metadata: { total: 0, page: 1, limit: 50 } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SiteApiClient(() => context);
    await client.getModifySets(1, 50, "");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://fnb.mysapo.vn/admin/modify_sets.json?page=1&limit=50&name="
    );
  });

  it("sends createModifySet payload to POST /admin/modify_sets.json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ modify_set: { client_id: "set-1", mod_options: [] } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SiteApiClient(() => context);
    const payload: ModifySetCreateRequest = {
      modify_set: {
        allow_multiple_quantity: true,
        client_id: "set-1",
        max_quantity: 1,
        min_quantity: 0,
        name: "Size",
        stock_type: "nottrack",
        mod_options: [
          {
            client_id: "opt-1",
            default_selected: false,
            mod_ingredients: [],
            name: "M",
            order_number: 1,
            price: 10000,
            cost: ""
          }
        ]
      }
    };

    await client.createModifySet(payload);

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://fnb.mysapo.vn/admin/modify_sets.json");
    expect(call?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(payload),
      headers: expect.objectContaining({
        "Content-Type": "application/json",
        "x-fnb-token": "token"
      })
    });
  });

  it("sends mapping request as POST with query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SiteApiClient(() => context);
    await client.mapModifySetToItems("set-1", ["item-1", "item-2"]);

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe(
      "https://fnb.mysapo.vn/admin/items/modify_set_mapping.json?modSetId=set-1&itemIds=item-1%2Citem-2"
    );
    expect(call?.[1]).toMatchObject({ method: "POST" });
  });
});
