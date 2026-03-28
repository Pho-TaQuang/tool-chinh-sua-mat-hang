import type { ClipboardPreview, ParsedClipboardRow } from "./types";

function normalizeNumericToken(input: string): string {
  return input.replace(/,/g, "").trim();
}

function isNumericToken(input: string): boolean {
  if (!input.trim()) {
    return false;
  }

  const normalized = normalizeNumericToken(input);
  return /^-?\d+(?:\.\d+)?$/.test(normalized);
}

export function parseClipboardToPreview(raw: string): ClipboardPreview {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const rows: ParsedClipboardRow[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    if (!line.trim()) {
      continue;
    }

    const cells = line.split("\t").map((cell) => cell.trim());
    const nonEmptyCells = cells
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value.length > 0);

    const errors: string[] = [];

    if (nonEmptyCells.length === 0) {
      rows.push({
        lineNumber: lineIndex + 1,
        name: "",
        priceInput: "",
        costInput: "",
        errors: ["Empty row or no valid data."]
      });
      continue;
    }

    const nameCell = nonEmptyCells.find((entry) => !isNumericToken(entry.value)) ?? null;
    const name = nameCell?.value ?? "";
    if (!name) {
      errors.push("Option name is required.");
    }

    const numericCandidates: string[] = [];
    for (const cell of nonEmptyCells) {
      if (nameCell && cell.index === nameCell.index) {
        continue;
      }

      if (isNumericToken(cell.value)) {
        numericCandidates.push(normalizeNumericToken(cell.value));
      } else {
        errors.push(`Value is not a valid number: "${cell.value}".`);
      }
    }

    const priceInput = numericCandidates[0] ?? "";
    const costInput = numericCandidates[1] ?? "";

    rows.push({
      lineNumber: lineIndex + 1,
      name,
      priceInput,
      costInput,
      errors
    });
  }

  let validRows = 0;
  for (const row of rows) {
    if (row.errors.length === 0 && row.name.trim().length > 0) {
      validRows += 1;
    }
  }

  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows: Math.max(0, rows.length - validRows)
  };
}