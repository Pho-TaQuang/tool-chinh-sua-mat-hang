import { describe, expect, it } from "vitest";
import { parseClipboardToPreview } from "./parser";

describe("parseClipboardToPreview", () => {
  it("parses rows with empty columns and assigns numeric tokens in order", () => {
    const preview = parseClipboardToPreview("CRISPY CHICKEN\t\t55000.00\nSAUCED CHICKEN\t10000\t70000.00");

    expect(preview.totalRows).toBe(2);
    expect(preview.validRows).toBe(2);
    expect(preview.invalidRows).toBe(0);
    expect(preview.rows[0]).toMatchObject({
      name: "CRISPY CHICKEN",
      priceInput: "55000.00",
      costInput: ""
    });
    expect(preview.rows[1]).toMatchObject({
      name: "SAUCED CHICKEN",
      priceInput: "10000",
      costInput: "70000.00"
    });
  });

  it("reports missing name when a row only has numeric tokens", () => {
    const preview = parseClipboardToPreview("\t12000\t3000");

    expect(preview.totalRows).toBe(1);
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0]?.errors).toContain("Option name is required.");
  });

  it("reports non-numeric token after name", () => {
    const preview = parseClipboardToPreview("Topping A\tabc\t3000");

    expect(preview.totalRows).toBe(1);
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0]?.errors).toContain('Value is not a valid number: "abc".');
  });
});