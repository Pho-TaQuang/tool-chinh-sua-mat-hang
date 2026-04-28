import type { Item } from "@shared/types/sapo.types";
import type { ModifySetResponse, ModifySetResponseOption } from "@shared/types/modify-set.types";
import type { SiteApiClient } from "../site.api.client";

const EXPORT_PAGE_LIMIT = 50;
const MAPPING_SOURCE = "items.mod_sets" as const;

export type ModifySetExportFormat = "csv" | "json";

export interface ModifySetMappedItem {
  client_id: string;
  name: string;
  category_name: string | null;
}

export interface ModifySetExportEntry extends ModifySetResponse {
  mapped_items: ModifySetMappedItem[];
}

export interface ModifySetExportDocument {
  exported_at: string;
  total_mod_sets: number;
  total_items_scanned: number;
  mapping_source: typeof MAPPING_SOURCE;
  mod_sets: ModifySetExportEntry[];
}

export interface ModifySetExportFile {
  fileName: string;
  mimeType: string;
  contents: string;
  document: ModifySetExportDocument;
}

export async function fetchAllModifySets(apiClient: SiteApiClient): Promise<ModifySetResponse[]> {
  const modSets: ModifySetResponse[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (modSets.length < total) {
    const response = await apiClient.getModifySets(page, EXPORT_PAGE_LIMIT, "");
    total = response.metadata.total;

    if (response.mod_sets.length === 0 && modSets.length < total) {
      throw new Error(`Modify set page ${page} returned no rows before reaching total ${total}.`);
    }

    modSets.push(...response.mod_sets);
    page += 1;
  }

  return modSets;
}

export async function fetchAllItemsForModifySetMapping(apiClient: SiteApiClient): Promise<Item[]> {
  const items: Item[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total) {
    const response = await apiClient.getItems(page, EXPORT_PAGE_LIMIT);
    total = response.metadata.total;

    if (response.items.length === 0 && items.length < total) {
      throw new Error(`Item page ${page} returned no rows before reaching total ${total}.`);
    }

    items.push(...response.items);
    page += 1;
  }

  return items;
}

export async function buildServerModifySetExport(
  apiClient: SiteApiClient,
  now = new Date()
): Promise<ModifySetExportDocument> {
  const [modSets, items] = await Promise.all([
    fetchAllModifySets(apiClient),
    fetchAllItemsForModifySetMapping(apiClient)
  ]);
  const mappedItemsBySetId = buildMappedItemsByModifySetId(modSets, items);

  return {
    exported_at: now.toISOString(),
    total_mod_sets: modSets.length,
    total_items_scanned: items.length,
    mapping_source: MAPPING_SOURCE,
    mod_sets: modSets.map((modSet) => ({
      ...modSet,
      mapped_items: mappedItemsBySetId.get(modSet.client_id) ?? []
    }))
  };
}

export async function createServerModifySetExportFile(
  apiClient: SiteApiClient,
  format: ModifySetExportFormat,
  now = new Date()
): Promise<ModifySetExportFile> {
  const document = await buildServerModifySetExport(apiClient, now);
  const extension = format === "csv" ? "csv" : "json";
  const fileName = buildModifySetExportFileName(extension, now);
  const contents = format === "csv" ? formatModifySetExportCsv(document) : formatModifySetExportJson(document);
  const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";

  return {
    fileName,
    mimeType,
    contents,
    document
  };
}

export function formatModifySetExportJson(document: ModifySetExportDocument): string {
  return JSON.stringify(document, null, 2);
}

export function formatModifySetExportCsv(document: ModifySetExportDocument): string {
  const columns = [
    "modify_set_client_id",
    "modify_set_name",
    "min_quantity",
    "max_quantity",
    "allow_multiple_quantity",
    "stock_type",
    "count_items",
    "mapped_item_count",
    "mapped_item_ids",
    "mapped_item_names",
    "option_client_id",
    "option_order_number",
    "option_name",
    "option_price",
    "option_cost",
    "option_default_selected",
    "option_cost_setting"
  ];
  const rows: string[][] = [columns];

  for (const modSet of document.mod_sets) {
    const options = modSet.mod_options.length > 0 ? modSet.mod_options : [null];

    for (const option of options) {
      rows.push(buildCsvRow(modSet, option));
    }
  }

  // Excel expects a BOM for UTF-8 Vietnamese text.
  return `\uFEFF${rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n")}\r\n`;
}

export function buildModifySetExportFileName(extension: "csv" | "json", now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `sapo-modify-sets-${date}-${time}.${extension}`;
}

export function downloadTextFile(fileName: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildMappedItemsByModifySetId(
  modSets: ModifySetResponse[],
  items: Item[]
): Map<string, ModifySetMappedItem[]> {
  const targetIds = new Set(modSets.map((modSet) => modSet.client_id));
  const mappedItemsBySetId = new Map<string, Map<string, ModifySetMappedItem>>();

  for (const modSet of modSets) {
    mappedItemsBySetId.set(modSet.client_id, new Map());
  }

  for (const item of items) {
    const mappedSetIds = new Set(getItemModifySetIds(item).filter((clientId) => targetIds.has(clientId)));
    if (mappedSetIds.size === 0) {
      continue;
    }

    const mappedItem: ModifySetMappedItem = {
      client_id: item.client_id,
      name: item.name,
      category_name: item.category?.name ?? null
    };

    for (const modSetId of mappedSetIds) {
      mappedItemsBySetId.get(modSetId)?.set(item.client_id, mappedItem);
    }
  }

  return new Map(
    [...mappedItemsBySetId.entries()].map(([modSetId, mappedItems]) => [modSetId, [...mappedItems.values()]])
  );
}

function getItemModifySetIds(item: Item): string[] {
  if (!Array.isArray(item.mod_sets)) {
    return [];
  }

  return item.mod_sets.flatMap((entry) => {
    if (typeof entry === "string") {
      return entry;
    }
    if (!entry || typeof entry !== "object" || !("client_id" in entry)) {
      return [];
    }

    const clientId = (entry as { client_id: unknown }).client_id;
    return typeof clientId === "string" && clientId.trim() ? clientId : [];
  });
}

function buildCsvRow(modSet: ModifySetExportEntry, option: ModifySetResponseOption | null): string[] {
  return [
    modSet.client_id,
    modSet.name,
    String(modSet.min_quantity),
    String(modSet.max_quantity),
    String(modSet.allow_multiple_quantity),
    modSet.stock_type,
    toExportValue(modSet.count_items),
    String(modSet.mapped_items.length),
    modSet.mapped_items.map((item) => item.client_id).join("|"),
    modSet.mapped_items.map((item) => item.name).join("|"),
    option?.client_id ?? "",
    toExportValue(option?.order_number),
    option?.name ?? "",
    toExportValue(option?.price),
    toExportValue(option?.cost),
    toExportValue(option?.default_selected),
    toExportValue(option?.cost_setting)
  ];
}

function toExportValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function toCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, "\"\"")}"`;
}
