import { describe, expect, it } from "vitest";
import type { Item } from "@shared/types/sapo.types";
import type { BatchItemState, BatchRunState, BatchStats } from "./types";
import {
  applySuccessfulTaxUpdatesToVisibleItems,
  buildBatchItemMap,
  createEmptyBatchStats,
  deriveBatchProgress,
  deriveSelectedItems,
  isCurrentPageFullySelected,
  resolveDefaultTaxCode,
  resolveTaxRowStatus
} from "./view";

function createItem(clientId: string, taxCode = "", taxName = ""): Item {
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
      vat_pit_category_code: taxCode,
      vat_pit_category_name: taxName
    },
    tax_reduction_rate: null
  };
}

function createBatchState(items: BatchItemState[]): BatchRunState {
  return {
    batchId: "batch-1",
    selectedTax: { code: "305", name: "Food Service" },
    page: 1,
    limit: 50,
    categoryId: null,
    isPaused: false,
    createdAt: 1,
    updatedAt: 1,
    items
  };
}

describe("tax view helpers", () => {
  it("creates empty batch stats", () => {
    const stats = createEmptyBatchStats();

    expect(stats).toEqual({
      total: 0,
      pending: 0,
      processing: 0,
      success: 0,
      failed: 0,
      skipped: 0
    });
  });

  it("derives selected items and current-page selection state", () => {
    const items = [createItem("item-1"), createItem("item-2")];
    const selectedIds = new Set(["item-2"]);

    expect(deriveSelectedItems(items, selectedIds)).toEqual([
      { clientId: "item-2", name: "item-2" }
    ]);
    expect(isCurrentPageFullySelected(items, selectedIds)).toBe(false);
    expect(isCurrentPageFullySelected(items, new Set(["item-1", "item-2"]))).toBe(true);
  });

  it("derives batch progress from stats and processing item", () => {
    const stats: BatchStats = {
      total: 5,
      pending: 1,
      processing: 1,
      success: 2,
      failed: 1,
      skipped: 0
    };
    const state = createBatchState([
      {
        clientId: "item-1",
        name: "First Item",
        status: "processing",
        attempts: 1,
        verifyStatus: "not_checked",
        updatedAt: 1
      }
    ]);

    expect(deriveBatchProgress(state, stats)).toEqual({
      completed: 3,
      total: 5,
      percent: 60,
      processingName: "First Item"
    });
  });

  it("builds row status for local selection and batch items", () => {
    const batchMap = buildBatchItemMap(
      createBatchState([
        {
          clientId: "item-1",
          name: "Item 1",
          status: "processing",
          attempts: 2,
          verifyStatus: "not_checked",
          updatedAt: 1
        },
        {
          clientId: "item-2",
          name: "Item 2",
          status: "failed",
          attempts: 1,
          verifyStatus: "error",
          updatedAt: 1
        }
      ])
    );

    expect(resolveTaxRowStatus("item-0", new Set(), batchMap)).toEqual({
      label: "Idle",
      tone: "spx-idle"
    });
    expect(resolveTaxRowStatus("item-3", new Set(["item-3"]), batchMap)).toEqual({
      label: "Selected",
      tone: "spx-pending"
    });
    expect(resolveTaxRowStatus("item-1", new Set(), batchMap)).toEqual({
      label: "Processing",
      tone: "spx-processing",
      attempts: 2
    });
    expect(resolveTaxRowStatus("item-2", new Set(), batchMap)).toEqual({
      label: "Failed",
      tone: "spx-failed",
      attempts: 1
    });
  });

  it("applies optimistic tax updates only to visible success items", () => {
    const visibleItems = [
      createItem("item-1"),
      createItem("item-2", "101", "Old"),
      createItem("item-3", "999", "Other")
    ];
    const batchState = createBatchState([
      {
        clientId: "item-2",
        name: "Item 2",
        status: "success",
        attempts: 1,
        verifyStatus: "not_checked",
        updatedAt: 1
      },
      {
        clientId: "item-4",
        name: "Item 4",
        status: "success",
        attempts: 1,
        verifyStatus: "not_checked",
        updatedAt: 1
      }
    ]);

    const next = applySuccessfulTaxUpdatesToVisibleItems(visibleItems, batchState);

    expect(next[0]?.tax_infos?.vat_pit_category_code).toBe("");
    expect(next[1]?.tax_infos).toEqual({
      vat_pit_category_code: "305",
      vat_pit_category_name: "Food Service"
    });
    expect(next[2]?.tax_infos?.vat_pit_category_code).toBe("999");
  });

  it("returns the same items array when optimistic updates do not change anything", () => {
    const visibleItems = [createItem("item-1", "305", "Food Service")];
    const batchState = createBatchState([
      {
        clientId: "item-1",
        name: "Item 1",
        status: "success",
        attempts: 1,
        verifyStatus: "not_checked",
        updatedAt: 1
      }
    ]);

    expect(applySuccessfulTaxUpdatesToVisibleItems(visibleItems, batchState)).toBe(visibleItems);
  });

  it("resolves default tax code with current, 305, then first-item fallback", () => {
    const categories = [
      { code: "101", name: "A", depth: 0, path: "", status: "active" },
      { code: "305", name: "Food Service", depth: 0, path: "", status: "active" }
    ];

    expect(resolveDefaultTaxCode(categories, "101")).toBe("101");
    expect(resolveDefaultTaxCode(categories, "")).toBe("305");
    expect(
      resolveDefaultTaxCode([{ code: "101", name: "A", depth: 0, path: "", status: "active" }], "")
    ).toBe("101");
    expect(resolveDefaultTaxCode([], "")).toBe("");
  });
});
