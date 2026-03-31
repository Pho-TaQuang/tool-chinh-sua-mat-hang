import { createRow } from "./defaults";
import { fieldForMainColumn } from "./grid";
import type { MainCol, ModifySetRowModel } from "./types";

export function parseClipboardGrid(raw: string): string[][] {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    rows.push(line.split("\t").map((cell) => cell.trim()));
  }

  return rows;
}

export function hasClipboardOverflow(input: { startCol: MainCol; clipboardGrid: string[][] }): boolean {
  const availableColumns = 3 - input.startCol;
  return input.clipboardGrid.some((row) => row.length > availableColumns);
}

export function applyClipboardGridToRows(input: {
  rows: ModifySetRowModel[];
  startRow: number;
  startCol: MainCol;
  clipboardGrid: string[][];
}): ModifySetRowModel[] {
  const nextRows = [...input.rows];

  for (let rowOffset = 0; rowOffset < input.clipboardGrid.length; rowOffset += 1) {
    const targetRowIndex = input.startRow + rowOffset;
    while (nextRows.length <= targetRowIndex) {
      nextRows.push(createRow());
    }

    const current = nextRows[targetRowIndex] ?? createRow();
    const clipboardRow = input.clipboardGrid[rowOffset] ?? [];
    const nextRow: ModifySetRowModel = {
      ...current
    };

    for (let cellOffset = 0; cellOffset < clipboardRow.length; cellOffset += 1) {
      const targetCol = input.startCol + cellOffset;
      if (targetCol > 2) {
        continue;
      }

      const field = fieldForMainColumn(targetCol as MainCol);
      nextRow[field] = clipboardRow[cellOffset] ?? "";
    }

    nextRows[targetRowIndex] = nextRow;
  }

  return nextRows;
}
