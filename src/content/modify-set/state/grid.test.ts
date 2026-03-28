import { describe, expect, it } from "vitest";
import { applyFillRange, getNextCellPosition, toggleRowSelectionRange } from "../grid";
import type { FillState } from "../types";

const rows = [
  { rowId: "r1", name: "A", priceInput: "100", costInput: "", defaultSelected: false },
  { rowId: "r2", name: "", priceInput: "", costInput: "", defaultSelected: false },
  { rowId: "r3", name: "", priceInput: "", costInput: "", defaultSelected: false }
];

describe("modify-set grid helpers", () => {
  it("returns the same next-cell positions for arrow, tab, and enter navigation", () => {
    expect(getNextCellPosition({ key: "ArrowUp", rowIndex: 1, colIndex: 1, rowCount: 3 })).toEqual({ row: 0, col: 1 });
    expect(getNextCellPosition({ key: "ArrowRight", rowIndex: 1, colIndex: 1, rowCount: 3 })).toEqual({ row: 1, col: 2 });
    expect(getNextCellPosition({ key: "Tab", rowIndex: 1, colIndex: 2, rowCount: 3 })).toEqual({ row: 2, col: 0 });
    expect(getNextCellPosition({ key: "Tab", rowIndex: 1, colIndex: 0, rowCount: 3, shiftKey: true })).toEqual({ row: 0, col: 2 });
    expect(getNextCellPosition({ key: "Enter", rowIndex: 1, colIndex: 1, rowCount: 3 })).toEqual({ row: 2, col: 1 });
  });

  it("fills rows downward using the current fill handle value", () => {
    const fillState: FillState = {
      setLocalId: "set-1",
      fromRow: 0,
      col: 0,
      value: "Copied"
    };

    const filledRows = applyFillRange(rows, fillState, 2);

    expect(filledRows[1]?.name).toBe("Copied");
    expect(filledRows[2]?.name).toBe("Copied");
  });

  it("reproduces row range selection for shift-click", () => {
    const single = toggleRowSelectionRange({
      rows,
      selectedRowIds: [],
      anchor: undefined,
      rowIndex: 0,
      shiftKey: false
    });
    const ranged = toggleRowSelectionRange({
      rows,
      selectedRowIds: single.selectedRowIds,
      anchor: single.anchor,
      rowIndex: 2,
      shiftKey: true
    });

    expect(single.selectedRowIds).toEqual(["r1"]);
    expect(ranged.selectedRowIds).toEqual(["r1", "r2", "r3"]);
  });
});
