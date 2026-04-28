import { describe, expect, it, vi } from "vitest";
import type { Item } from "@shared/types/sapo.types";
import type { ModifySetResponse } from "@shared/types/modify-set.types";
import type { SiteApiClient } from "../site.api.client";
import {
  buildServerModifySetExport,
  createServerModifySetExportFile,
  formatModifySetExportCsv,
  formatModifySetExportJson,
  type ModifySetExportDocument
} from "./export";

function createModSet(overrides?: Partial<ModifySetResponse>): ModifySetResponse {
  return {
    client_id: "set-1",
    max_quantity: 1,
    min_quantity: 0,
    name: "Topping",
    stock_type: "nottrack",
    allow_multiple_quantity: true,
    count_items: 0,
    mod_options: [
      {
        client_id: "option-1",
        name: "Trân châu",
        price: 10000,
        cost: null,
        default_selected: false,
        order_number: 1,
        cost_setting: false
      }
    ],
    ...overrides
  };
}

function createItem(overrides?: Partial<Item>): Item {
  return {
    server_id: 1,
    client_id: "item-1",
    name: "Milk tea",
    description: "",
    item_type: "basic",
    stock_type: "item",
    color: "",
    stamp_print: false,
    kitchen_id: null,
    sub_kitchen_ids: [],
    created_on: 0,
    modified_on: 0,
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
    tax_reduction_rate: null,
    ...overrides
  };
}

function createDocument(overrides?: Partial<ModifySetExportDocument>): ModifySetExportDocument {
  return {
    exported_at: "2026-04-28T05:00:00.000Z",
    total_mod_sets: 1,
    total_items_scanned: 1,
    mapping_source: "items.mod_sets",
    mod_sets: [
      {
        ...createModSet({
          name: "Topping \"Đặc biệt\", size",
          count_items: 1,
          mod_options: [
            {
              client_id: "option-1",
              name: "Trân châu, đen",
              price: 10000,
              cost: null,
              default_selected: false,
              order_number: 1,
              cost_setting: false
            }
          ]
        }),
        mapped_items: [
          {
            client_id: "item-1",
            name: "Trà\nSữa",
            category_name: "Đồ uống"
          }
        ]
      }
    ],
    ...overrides
  };
}

describe("modify set export", () => {
  it("fetches modify sets across pages until metadata.total is reached", async () => {
    const apiClient = {
      getModifySets: vi.fn(async (page: number) => {
        if (page === 1) {
          return {
            metadata: { total: 3, page: 1, limit: 50 },
            mod_sets: [createModSet({ client_id: "set-1" }), createModSet({ client_id: "set-2" })]
          };
        }

        return {
          metadata: { total: 3, page: 2, limit: 50 },
          mod_sets: [createModSet({ client_id: "set-3" })]
        };
      }),
      getItems: vi.fn(async () => ({ metadata: { total: 0, page: 1, limit: 50 }, items: [] }))
    } as unknown as SiteApiClient;

    const document = await buildServerModifySetExport(apiClient, new Date("2026-04-28T05:00:00.000Z"));

    expect(document.total_mod_sets).toBe(3);
    expect(apiClient.getModifySets).toHaveBeenCalledTimes(2);
    expect(apiClient.getModifySets).toHaveBeenNthCalledWith(1, 1, 50, "");
    expect(apiClient.getModifySets).toHaveBeenNthCalledWith(2, 2, 50, "");
  });

  it("maps scanned items back to modify sets through items[].mod_sets", async () => {
    const apiClient = {
      getModifySets: vi.fn(async () => ({
        metadata: { total: 1, page: 1, limit: 50 },
        mod_sets: [createModSet({ client_id: "set-1" })]
      })),
      getItems: vi.fn(async () => ({
        metadata: { total: 2, page: 1, limit: 50 },
        items: [
          createItem({
            client_id: "item-1",
            name: "Sinh tố bơ",
            category: { client_id: "cat-1", name: "Đồ uống" },
            mod_sets: [{ client_id: "set-1", name: "Topping" }]
          }),
          createItem({
            client_id: "item-2",
            name: "Cà phê",
            mod_sets: [{ client_id: "other-set", name: "Other" }]
          })
        ]
      }))
    } as unknown as SiteApiClient;

    const document = await buildServerModifySetExport(apiClient, new Date("2026-04-28T05:00:00.000Z"));

    expect(document.total_items_scanned).toBe(2);
    expect(document.mod_sets[0]?.mapped_items).toEqual([
      {
        client_id: "item-1",
        name: "Sinh tố bơ",
        category_name: "Đồ uống"
      }
    ]);
  });

  it("formats CSV with UTF-8 BOM, CRLF, and escaped cells", () => {
    const csv = formatModifySetExportCsv(createDocument());

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain('"Topping ""Đặc biệt"", size"');
    expect(csv).toContain('"Trà\nSữa"');
    expect(csv).toContain('"Trân châu, đen"');
    expect(csv).toContain(",10000,,false,false");
  });

  it("formats JSON with export metadata and mapped items", () => {
    const parsed = JSON.parse(formatModifySetExportJson(createDocument())) as ModifySetExportDocument;

    expect(parsed).toMatchObject({
      exported_at: "2026-04-28T05:00:00.000Z",
      total_mod_sets: 1,
      total_items_scanned: 1,
      mapping_source: "items.mod_sets"
    });
    expect(parsed.mod_sets[0]?.mapped_items[0]).toMatchObject({
      client_id: "item-1",
      name: "Trà\nSữa",
      category_name: "Đồ uống"
    });
  });

  it("fails export file creation when item scan fails", async () => {
    const apiClient = {
      getModifySets: vi.fn(async () => ({
        metadata: { total: 1, page: 1, limit: 50 },
        mod_sets: [createModSet({ client_id: "set-1" })]
      })),
      getItems: vi.fn(async () => {
        throw new Error("item scan failed");
      })
    } as unknown as SiteApiClient;

    await expect(createServerModifySetExportFile(apiClient, "json")).rejects.toThrow("item scan failed");
  });
});
