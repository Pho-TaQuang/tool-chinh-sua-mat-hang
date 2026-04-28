import type { ModifySetResponse, ModifySetResponseOption } from "@shared/types/modify-set.types";
import { createRow, ensureTrailingRows } from "./defaults";
import type { ModifySetCardModel, ModifySetLinkedItem, ModifySetRowModel } from "./types";
import { validateModifySetDraft } from "./validator";

export type ModifySetImportFormat = "csv" | "json";

interface CsvImportRow {
  modify_set_client_id: string;
  modify_set_name: string;
  min_quantity: string;
  max_quantity: string;
  allow_multiple_quantity: string;
  stock_type: string;
  mapped_item_ids: string;
  mapped_item_names: string;
  option_client_id: string;
  option_order_number: string;
  option_name: string;
  option_price: string;
  option_cost: string;
  option_default_selected: string;
}

export async function importModifySetsFromFile(format: ModifySetImportFormat, file: File): Promise<ModifySetCardModel[]> {
  const text = await file.text();
  return format === "json" ? importModifySetsFromJson(text) : importModifySetsFromCsv(text);
}

export function importModifySetsFromJson(text: string): ModifySetCardModel[] {
  const parsed = JSON.parse(stripBom(text)) as unknown;
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { mod_sets?: unknown }).mod_sets)) {
    throw new Error("JSON import must contain a mod_sets array.");
  }

  return (parsed as { mod_sets: unknown[] }).mod_sets.map((entry, index) =>
    buildCardFromServerModifySet(normalizeJsonModifySet(entry), index)
  );
}

export function importModifySetsFromCsv(text: string): ModifySetCardModel[] {
  const records = parseCsv(stripBom(text));
  if (records.length < 2) {
    throw new Error("CSV import must contain a header row and at least one data row.");
  }

  const header = records[0] ?? [];
  const columnIndex = new Map(header.map((name, index) => [name, index]));
  assertRequiredCsvColumns(columnIndex);

  const grouped = new Map<string, CsvImportRow[]>();
  const setOrder: string[] = [];

  for (const record of records.slice(1)) {
    if (record.every((cell) => cell.trim().length === 0)) {
      continue;
    }

    const row = rowFromRecord(columnIndex, record);
    const key = row.modify_set_client_id || row.modify_set_name;
    if (!key) {
      throw new Error("CSV row is missing modify_set_client_id and modify_set_name.");
    }
    if (!grouped.has(key)) {
      grouped.set(key, []);
      setOrder.push(key);
    }
    grouped.get(key)?.push(row);
  }

  if (setOrder.length === 0) {
    throw new Error("CSV import did not contain any modify set rows.");
  }

  return setOrder.map((key, index) => buildCardFromCsvRows(grouped.get(key) ?? [], index));
}

function buildCardFromServerModifySet(modSet: ModifySetResponse & { mapped_items?: unknown[] }, index: number): ModifySetCardModel {
  const sortedOptions = [...modSet.mod_options].sort((left, right) => left.order_number - right.order_number);
  const rows = ensureTrailingRows(sortedOptions.map(rowFromOption));
  const draft: ModifySetCardModel = {
    localId: `mod-import-${Date.now()}-${index}`,
    name: modSet.name,
    minQuantity: toNumber(modSet.min_quantity, 0),
    maxQuantity: toNumber(modSet.max_quantity, 0),
    isMaxQuantityEdited: true,
    allowMultipleQuantity: Boolean(modSet.allow_multiple_quantity),
    stockType: modSet.stock_type || "nottrack",
    mappingItems: mappingItemsFromJson(modSet.mapped_items),
    rows,
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
    }
  };
  const validation = validateModifySetDraft(draft);

  return {
    ...draft,
    validationErrors: validation,
    status: validation.hasError ? "draft" : "validated"
  };
}

function buildCardFromCsvRows(rows: CsvImportRow[], index: number): ModifySetCardModel {
  const first = rows[0];
  if (!first) {
    throw new Error("CSV import group is empty.");
  }

  const optionRows = rows
    .filter((row) => row.option_name || row.option_price || row.option_cost || row.option_client_id)
    .sort((left, right) => toNumber(left.option_order_number, 0) - toNumber(right.option_order_number, 0))
    .map(rowFromCsvOption);
  const draftRows = ensureTrailingRows(optionRows);
  const draft: ModifySetCardModel = {
    localId: `mod-import-${Date.now()}-${index}`,
    name: first.modify_set_name,
    minQuantity: toNumber(first.min_quantity, 0),
    maxQuantity: toNumber(first.max_quantity, 0),
    isMaxQuantityEdited: true,
    allowMultipleQuantity: toBoolean(first.allow_multiple_quantity),
    stockType: first.stock_type || "nottrack",
    mappingItems: mappingItemsFromCsv(first.mapped_item_ids, first.mapped_item_names),
    rows: draftRows,
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
    }
  };
  const validation = validateModifySetDraft(draft);

  return {
    ...draft,
    validationErrors: validation,
    status: validation.hasError ? "draft" : "validated"
  };
}

function normalizeJsonModifySet(entry: unknown): ModifySetResponse & { mapped_items?: unknown[] } {
  if (!entry || typeof entry !== "object") {
    throw new Error("JSON mod_sets entries must be objects.");
  }

  const value = entry as Record<string, unknown>;
  if (!Array.isArray(value.mod_options)) {
    throw new Error("JSON mod_sets entries must contain mod_options arrays.");
  }

  return {
    ...value,
    client_id: asString(value.client_id),
    max_quantity: toNumber(value.max_quantity, 0),
    min_quantity: toNumber(value.min_quantity, 0),
    name: asString(value.name),
    stock_type: asString(value.stock_type),
    allow_multiple_quantity: Boolean(value.allow_multiple_quantity),
    mod_options: value.mod_options.map(normalizeJsonOption),
    mapped_items: Array.isArray(value.mapped_items) ? value.mapped_items : []
  };
}

function normalizeJsonOption(entry: unknown): ModifySetResponseOption {
  if (!entry || typeof entry !== "object") {
    throw new Error("JSON mod_options entries must be objects.");
  }

  const value = entry as Record<string, unknown>;
  return {
    ...value,
    client_id: asString(value.client_id),
    name: asString(value.name),
    price: value.price === null ? null : toNumber(value.price, 0),
    cost: value.cost === null || value.cost === "" ? null : toNumber(value.cost, 0),
    default_selected: Boolean(value.default_selected),
    order_number: toNumber(value.order_number, 0),
    cost_setting: Boolean(value.cost_setting)
  };
}

function rowFromOption(option: ModifySetResponseOption): ModifySetRowModel {
  return {
    ...createRow(),
    name: option.name,
    priceInput: valueToInput(option.price),
    costInput: valueToInput(option.cost),
    defaultSelected: option.default_selected
  };
}

function rowFromCsvOption(row: CsvImportRow): ModifySetRowModel {
  return {
    ...createRow(),
    name: row.option_name,
    priceInput: row.option_price,
    costInput: row.option_cost,
    defaultSelected: toBoolean(row.option_default_selected)
  };
}

function mappingItemsFromJson(input: unknown[] | undefined): ModifySetLinkedItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const result = new Map<string, ModifySetLinkedItem>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const value = entry as Record<string, unknown>;
    const clientId = asString(value.client_id).trim();
    if (!clientId) {
      continue;
    }

    result.set(clientId, {
      clientId,
      name: asString(value.name) || clientId
    });
  }

  return [...result.values()];
}

function mappingItemsFromCsv(ids: string, names: string): ModifySetLinkedItem[] {
  const itemIds = ids.split("|").map((value) => value.trim()).filter(Boolean);
  const itemNames = names.split("|").map((value) => value.trim());

  return itemIds.map((clientId, index) => ({
    clientId,
    name: itemNames[index] || clientId
  }));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === "\"" && nextChar === "\"") {
        cell += "\"";
        index += 1;
        continue;
      }
      if (char === "\"") {
        inQuotes = false;
        continue;
      }
      cell += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\r" || char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error("CSV import has an unterminated quoted cell.");
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function rowFromRecord(columnIndex: Map<string, number>, record: string[]): CsvImportRow {
  return {
    modify_set_client_id: getCsvValue(columnIndex, record, "modify_set_client_id"),
    modify_set_name: getCsvValue(columnIndex, record, "modify_set_name"),
    min_quantity: getCsvValue(columnIndex, record, "min_quantity"),
    max_quantity: getCsvValue(columnIndex, record, "max_quantity"),
    allow_multiple_quantity: getCsvValue(columnIndex, record, "allow_multiple_quantity"),
    stock_type: getCsvValue(columnIndex, record, "stock_type"),
    mapped_item_ids: getCsvValue(columnIndex, record, "mapped_item_ids"),
    mapped_item_names: getCsvValue(columnIndex, record, "mapped_item_names"),
    option_client_id: getCsvValue(columnIndex, record, "option_client_id"),
    option_order_number: getCsvValue(columnIndex, record, "option_order_number"),
    option_name: getCsvValue(columnIndex, record, "option_name"),
    option_price: getCsvValue(columnIndex, record, "option_price"),
    option_cost: getCsvValue(columnIndex, record, "option_cost"),
    option_default_selected: getCsvValue(columnIndex, record, "option_default_selected")
  };
}

function assertRequiredCsvColumns(columnIndex: Map<string, number>): void {
  const required = [
    "modify_set_client_id",
    "modify_set_name",
    "min_quantity",
    "max_quantity",
    "allow_multiple_quantity",
    "mapped_item_ids",
    "mapped_item_names",
    "option_client_id",
    "option_order_number",
    "option_name",
    "option_price",
    "option_cost",
    "option_default_selected"
  ];
  const missing = required.filter((column) => !columnIndex.has(column));
  if (missing.length > 0) {
    throw new Error(`CSV import is missing required column(s): ${missing.join(", ")}.`);
  }
}

function getCsvValue(columnIndex: Map<string, number>, record: string[], column: string): string {
  const index = columnIndex.get(column);
  if (index === undefined) {
    return "";
  }

  return record[index] ?? "";
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }
  return false;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function valueToInput(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value);
}

function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}
