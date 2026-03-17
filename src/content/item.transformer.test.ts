import { describe, expect, it } from "vitest";
import type { Item } from "@shared/types/sapo.types";
import { patchTaxInfos } from "./item.transformer";

function createItem(): Item {
  return {
    server_id: 1,
    client_id: "item-1",
    name: "Item 1",
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
      vat_pit_category_code: "101",
      vat_pit_category_name: "Old"
    },
    tax_reduction_rate: null
  };
}

describe("patchTaxInfos", () => {
  it("updates tax_infos and keeps input immutable", () => {
    const original = createItem();
    const next = patchTaxInfos(original, {
      code: "305",
      name: "Dich vu an uong"
    });

    expect(next.tax_infos.vat_pit_category_code).toBe("305");
    expect(next.tax_infos.vat_pit_category_name).toBe("Dich vu an uong");
    expect(original.tax_infos.vat_pit_category_code).toBe("101");
    expect(original.tax_infos.vat_pit_category_name).toBe("Old");
    expect(next.name).toBe(original.name);
  });
});
