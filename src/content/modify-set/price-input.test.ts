import { describe, expect, it } from "vitest";
import {
  applyPriceOneShotSuffix,
  getPriceEditableBoundary
} from "./price-input";

describe("applyPriceOneShotSuffix", () => {
  it("adds 000 once when first digit is typed into an empty cell", () => {
    const transformed = applyPriceOneShotSuffix({
      previousValue: "",
      rawValue: "1",
      inputType: "insertText",
      inputData: "1"
    });

    expect(transformed).toEqual({
      value: "1000",
      applied: true,
      caret: 1
    });
  });

  it("does not append again after the first trigger", () => {
    const transformed = applyPriceOneShotSuffix({
      previousValue: "1000",
      rawValue: "12000",
      inputType: "insertText",
      inputData: "2"
    });

    expect(transformed).toEqual({
      value: "12000",
      applied: false,
      caret: null
    });
  });

  it("does not trigger for paste", () => {
    const transformed = applyPriceOneShotSuffix({
      previousValue: "",
      rawValue: "5000",
      inputType: "insertFromPaste",
      inputData: null
    });

    expect(transformed.applied).toBe(false);
    expect(transformed.value).toBe("5000");
  });

  it("does not trigger for non-digit first character", () => {
    const transformed = applyPriceOneShotSuffix({
      previousValue: "",
      rawValue: "a",
      inputType: "insertText",
      inputData: "a"
    });

    expect(transformed.applied).toBe(false);
    expect(transformed.value).toBe("a");
  });
});

describe("getPriceEditableBoundary", () => {
  it("returns editable boundary before 000 suffix", () => {
    expect(getPriceEditableBoundary("12000")).toBe(2);
    expect(getPriceEditableBoundary("12345")).toBe(5);
  });
});
