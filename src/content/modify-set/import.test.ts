import { describe, expect, it } from "vitest";
import { importModifySetsFromCsv, importModifySetsFromJson } from "./import";

describe("modify set import", () => {
  it("imports JSON export documents as new editable drafts without server ids", () => {
    const sets = importModifySetsFromJson(
      JSON.stringify({
        exported_at: "2026-04-28T05:53:22.788Z",
        mod_sets: [
          {
            client_id: "server-set-1",
            max_quantity: 1,
            min_quantity: 0,
            name: "Mức Đường",
            stock_type: "ingredient",
            allow_multiple_quantity: false,
            count_items: 1,
            mod_options: [
              {
                client_id: "server-option-1",
                name: "30% đường",
                price: 0,
                cost: 0,
                default_selected: false,
                order_number: 1,
                cost_setting: false
              }
            ],
            mapped_items: [
              {
                client_id: "item-1",
                name: "Trà sữa",
                category_name: "Đồ uống"
              }
            ]
          }
        ]
      })
    );

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      name: "Mức Đường",
      minQuantity: 0,
      maxQuantity: 1,
      allowMultipleQuantity: false,
      stockType: "ingredient",
      apiClientId: null,
      status: "validated",
      mappingItems: [{ clientId: "item-1", name: "Trà sữa" }]
    });
    expect(sets[0]?.rows[0]).toMatchObject({
      name: "30% đường",
      priceInput: "0",
      costInput: "0",
      defaultSelected: false
    });
    expect(sets[0]?.rows.at(-1)).toMatchObject({
      name: "",
      priceInput: "",
      costInput: ""
    });
  });

  it("imports CSV export rows with BOM, quotes, commas, and newlines", () => {
    const csv = [
      "\uFEFFmodify_set_client_id,modify_set_name,min_quantity,max_quantity,allow_multiple_quantity,stock_type,count_items,mapped_item_count,mapped_item_ids,mapped_item_names,option_client_id,option_order_number,option_name,option_price,option_cost,option_default_selected,option_cost_setting",
      "set-1,\"Topping \"\"Đặc biệt\"\", size\",0,2,true,nottrack,2,2,item-1|item-2,\"Trà sữa|Cà phê\",opt-1,1,\"Trân châu, đen\",10000,,false,false",
      "set-1,\"Topping \"\"Đặc biệt\"\", size\",0,2,true,nottrack,2,2,item-1|item-2,\"Trà sữa|Cà phê\",opt-2,2,\"Kem\nphô mai\",15000,5000,true,false"
    ].join("\r\n");

    const sets = importModifySetsFromCsv(csv);

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      name: "Topping \"Đặc biệt\", size",
      minQuantity: 0,
      maxQuantity: 2,
      allowMultipleQuantity: true,
      stockType: "nottrack",
      status: "validated",
      mappingItems: [
        { clientId: "item-1", name: "Trà sữa" },
        { clientId: "item-2", name: "Cà phê" }
      ]
    });
    expect(sets[0]?.rows[0]).toMatchObject({
      name: "Trân châu, đen",
      priceInput: "10000",
      costInput: "",
      defaultSelected: false
    });
    expect(sets[0]?.rows[1]).toMatchObject({
      name: "Kem\nphô mai",
      priceInput: "15000",
      costInput: "5000",
      defaultSelected: true
    });
  });

  it("rejects CSV files that are missing required export columns", () => {
    expect(() => importModifySetsFromCsv("modify_set_name\nTopping")).toThrow(
      "CSV import is missing required column"
    );
  });

  it("rejects JSON without a mod_sets array", () => {
    expect(() => importModifySetsFromJson(JSON.stringify({ mod_sets: null }))).toThrow(
      "JSON import must contain a mod_sets array"
    );
  });
});
