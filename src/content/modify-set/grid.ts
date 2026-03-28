import { createRow } from "./defaults";
import type { FillState, MainCol, ModifySetRowModel } from "./types";

export function fieldForMainColumn(col: MainCol): "name" | "priceInput" | "costInput" {
  if (col === 0) {
    return "name";
  }
  if (col === 1) {
    return "priceInput";
  }
  return "costInput";
}

export function getNextCellPosition(input: {
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Tab" | "Enter";
  rowIndex: number;
  colIndex: MainCol;
  rowCount: number;
  shiftKey?: boolean;
}): { row: number; col: MainCol } {
  let nextRow = input.rowIndex;
  let nextCol = input.colIndex;

  if (input.key === "ArrowUp") {
    nextRow = Math.max(0, input.rowIndex - 1);
  } else if (input.key === "ArrowDown") {
    nextRow = Math.min(input.rowCount - 1, input.rowIndex + 1);
  } else if (input.key === "ArrowLeft") {
    nextCol = Math.max(0, input.colIndex - 1) as MainCol;
  } else if (input.key === "ArrowRight") {
    nextCol = Math.min(2, input.colIndex + 1) as MainCol;
  } else if (input.key === "Enter") {
    nextRow = input.rowIndex + 1;
  } else if (input.shiftKey) {
    if (input.colIndex === 0) {
      nextRow = Math.max(0, input.rowIndex - 1);
      nextCol = 2;
    } else {
      nextCol = (input.colIndex - 1) as MainCol;
    }
  } else if (input.colIndex === 2) {
    nextRow = input.rowIndex + 1;
    nextCol = 0;
  } else {
    nextCol = (input.colIndex + 1) as MainCol;
  }

  return { row: nextRow, col: nextCol };
}

export function applyFillRange(
  rows: ModifySetRowModel[],
  fillState: FillState,
  targetRowIndex: number
): ModifySetRowModel[] {
  if (targetRowIndex <= fillState.fromRow) {
    return rows;
  }

  const nextRows = [...rows];
  const field = fieldForMainColumn(fillState.col);

  for (let index = fillState.fromRow + 1; index <= targetRowIndex; index += 1) {
    const currentRow = nextRows[index] ?? createRow();
    nextRows[index] = {
      ...currentRow,
      [field]: fillState.value
    } as ModifySetRowModel;
  }

  return nextRows;
}

export function toggleRowSelectionRange(input: {
  rows: ModifySetRowModel[];
  selectedRowIds: string[];
  anchor: number | undefined;
  rowIndex: number;
  shiftKey: boolean;
}): { selectedRowIds: string[]; anchor: number } {
  const selected = new Set(input.selectedRowIds);

  if (input.shiftKey && typeof input.anchor === "number") {
    selected.clear();
    const start = Math.min(input.anchor, input.rowIndex);
    const end = Math.max(input.anchor, input.rowIndex);

    for (let index = start; index <= end; index += 1) {
      const rowId = input.rows[index]?.rowId;
      if (rowId) {
        selected.add(rowId);
      }
    }
  } else {
    const rowId = input.rows[input.rowIndex]?.rowId;
    if (rowId) {
      if (selected.has(rowId)) {
        selected.delete(rowId);
      } else {
        selected.add(rowId);
      }
    }
  }

  return {
    selectedRowIds: Array.from(selected),
    anchor: input.rowIndex
  };
}
