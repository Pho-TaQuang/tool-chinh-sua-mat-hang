import { describe, expect, it } from "vitest";
import { applyClipboardGridToRows, hasClipboardOverflow, parseClipboardGrid } from "./parser";

describe("parseClipboardGrid", () => {
  it("splits clipboard text into non-empty tab-separated rows", () => {
    const grid = parseClipboardGrid("A\t1000\n\nB\t2000");

    expect(grid).toEqual([
      ["A", "1000"],
      ["B", "2000"]
    ]);
  });
});

describe("hasClipboardOverflow", () => {
  it("returns true when pasted columns exceed remaining columns from start cell", () => {
    expect(hasClipboardOverflow({ startCol: 1, clipboardGrid: [["100", "200", "300"]] })).toBe(true);
    expect(hasClipboardOverflow({ startCol: 0, clipboardGrid: [["A", "100", "200"]] })).toBe(false);
  });
});

describe("applyClipboardGridToRows", () => {
  it("keeps existing values from columns that were not pasted", () => {
    const merged = applyClipboardGridToRows({
      rows: [
        {
          rowId: "r1",
          name: "Option A",
          priceInput: "1000",
          costInput: "700",
          defaultSelected: false
        }
      ],
      startRow: 0,
      startCol: 1,
      clipboardGrid: parseClipboardGrid("2500")
    });

    expect(merged[0]).toMatchObject({
      name: "Option A",
      priceInput: "2500",
      costInput: "700"
    });
  });

  it("maps multi-column paste from the selected start column", () => {
    const merged = applyClipboardGridToRows({
      rows: [
        {
          rowId: "r1",
          name: "A",
          priceInput: "1000",
          costInput: "",
          defaultSelected: false
        }
      ],
      startRow: 0,
      startCol: 0,
      clipboardGrid: parseClipboardGrid("New name\t5000\t300")
    });

    expect(merged[0]).toMatchObject({
      name: "New name",
      priceInput: "5000",
      costInput: "300"
    });
  });

  it("creates rows when paste range exceeds current table length", () => {
    const merged = applyClipboardGridToRows({
      rows: [
        {
          rowId: "r1",
          name: "Only row",
          priceInput: "1000",
          costInput: "",
          defaultSelected: false
        }
      ],
      startRow: 1,
      startCol: 0,
      clipboardGrid: parseClipboardGrid("B\t2000\nC\t3000")
    });

    expect(merged).toHaveLength(3);
    expect(merged[1]).toMatchObject({
      name: "B",
      priceInput: "2000"
    });
    expect(merged[2]).toMatchObject({
      name: "C",
      priceInput: "3000"
    });
    expect(merged[1]?.rowId).toBeTruthy();
    expect(merged[2]?.rowId).toBeTruthy();
  });

  it("ignores overflow columns when applying data", () => {
    const merged = applyClipboardGridToRows({
      rows: [
        {
          rowId: "r1",
          name: "A",
          priceInput: "1000",
          costInput: "200",
          defaultSelected: false
        }
      ],
      startRow: 0,
      startCol: 1,
      clipboardGrid: parseClipboardGrid("9000\t300\tEXTRA")
    });

    expect(merged[0]).toMatchObject({
      name: "A",
      priceInput: "9000",
      costInput: "300"
    });
  });
});
