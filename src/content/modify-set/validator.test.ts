import { describe, expect, it } from "vitest";
import type { ModifySetCardModel } from "./types";
import { buildModifySetPayload } from "./normalize";
import { validateModifySetDraft } from "./validator";

function createSet(overrides?: Partial<ModifySetCardModel>): ModifySetCardModel {
  return {
    localId: "set-1",
    name: "Topping",
    minQuantity: 0,
    maxQuantity: 2,
    isMaxQuantityEdited: false,
    allowMultipleQuantity: true,
    mappingItems: [],
    rows: [
      {
        rowId: "r1",
        name: "Cheese",
        priceInput: "5000",
        costInput: "3000",
        defaultSelected: false
      },
      {
        rowId: "r2",
        name: "",
        priceInput: "",
        costInput: "",
        defaultSelected: false
      }
    ],
    collapsed: false,
    status: "draft",
    apiClientId: null,
    createError: null,
    mappingError: null,
    validationErrors: {
      setErrors: [],
      rowErrors: [],
      validRowCount: 0,
      hasError: false
    },
    ...overrides
  };
}

describe("validateModifySetDraft", () => {
  it("rejects when min quantity is greater than max quantity", () => {
    const validation = validateModifySetDraft(createSet({ minQuantity: 3, maxQuantity: 1 }));

    expect(validation.hasError).toBe(true);
    expect(validation.setErrors.some((error) => error.code === "MIN_GT_MAX")).toBe(true);
  });

  it("rejects when min quantity is less than 0", () => {
    const validation = validateModifySetDraft(createSet({ minQuantity: -1, maxQuantity: 1 }));

    expect(validation.hasError).toBe(true);
    expect(validation.setErrors.some((error) => error.code === "MIN_LT_ZERO")).toBe(true);
  });

  it("rejects when max quantity is greater than valid option count", () => {
    const validation = validateModifySetDraft(
      createSet({
        maxQuantity: 3,
        rows: [
          {
            rowId: "r1",
            name: "A",
            priceInput: "1000",
            costInput: "",
            defaultSelected: false
          },
          {
            rowId: "r2",
            name: "B",
            priceInput: "1200",
            costInput: "",
            defaultSelected: false
          }
        ]
      })
    );

    expect(validation.hasError).toBe(true);
    expect(validation.setErrors.some((error) => error.code === "MAX_GT_OPTION_COUNT")).toBe(true);
  });

  it("rejects when there is no valid option row", () => {
    const validation = validateModifySetDraft(
      createSet({
        rows: [
          {
            rowId: "empty",
            name: "",
            priceInput: "",
            costInput: "",
            defaultSelected: false
          }
        ]
      })
    );

    expect(validation.hasError).toBe(true);
    expect(validation.setErrors.some((error) => error.code === "NO_VALID_OPTIONS")).toBe(true);
  });

  it("rejects option rows without price", () => {
    const validation = validateModifySetDraft(
      createSet({
        rows: [
          {
            rowId: "r1",
            name: "No price",
            priceInput: "",
            costInput: "",
            defaultSelected: false
          }
        ]
      })
    );

    expect(validation.hasError).toBe(true);
    expect(validation.rowErrors.some((error) => error.code === "ROW_PRICE_REQUIRED")).toBe(true);
  });
});

describe("buildModifySetPayload", () => {
  it("reorders option order_number continuously and maps defaults", () => {
    const payload = buildModifySetPayload(
      createSet({
        rows: [
          {
            rowId: "r1",
            name: "A",
            priceInput: "1000",
            costInput: "",
            defaultSelected: true
          },
          {
            rowId: "blank",
            name: "",
            priceInput: "",
            costInput: "",
            defaultSelected: false
          },
          {
            rowId: "r2",
            name: "B",
            priceInput: "1200",
            costInput: "200",
            defaultSelected: false
          }
        ]
      })
    );

    expect(payload.modify_set.mod_options).toHaveLength(2);
    expect(payload.modify_set.mod_options[0]).toMatchObject({
      name: "A",
      order_number: 1,
      default_selected: true,
      price: 1000,
      cost: ""
    });
    expect(payload.modify_set.mod_options[1]).toMatchObject({
      name: "B",
      order_number: 2,
      default_selected: false,
      price: 1200,
      cost: 200
    });
  });
});
