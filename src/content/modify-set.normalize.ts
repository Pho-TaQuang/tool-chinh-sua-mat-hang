import type { ModifySetCreateRequest, ModifySetOptionPayload } from "@shared/types/modify-set.types";
import type { ModifySetCardModel, ModifySetPreparedInput } from "./modify-set.types";
import { isRowCompletelyEmpty, parseOptionalNumber, validateModifySetDraft } from "./modify-set.validator";

export function buildModifySetPayload(input: ModifySetCardModel): ModifySetCreateRequest {
  const validRows = input.rows.filter((row) => {
    if (isRowCompletelyEmpty(row)) {
      return false;
    }
    if (row.name.trim().length === 0) {
      return false;
    }
    const parsedPrice = parseOptionalNumber(row.priceInput);
    return typeof parsedPrice === "number" && Number.isFinite(parsedPrice);
  });

  const modOptions: ModifySetOptionPayload[] = validRows.map((row, index) => ({
    client_id: crypto.randomUUID(),
    default_selected: Boolean(row.defaultSelected),
    mod_ingredients: [],
    name: row.name.trim(),
    order_number: index + 1,
    price: parseOptionalNumber(row.priceInput),
    cost: parseOptionalNumber(row.costInput)
  }));

  return {
    modify_set: {
      allow_multiple_quantity: Boolean(input.allowMultipleQuantity),
      client_id: input.apiClientId ?? crypto.randomUUID(),
      max_quantity: input.maxQuantity,
      min_quantity: input.minQuantity,
      mod_options: modOptions,
      name: input.name.trim(),
      stock_type: "nottrack"
    }
  };
}

export function prepareModifySetsForSubmit(sets: ModifySetCardModel[]): {
  prepared: ModifySetPreparedInput[];
  invalidLocalIds: string[];
} {
  const prepared: ModifySetPreparedInput[] = [];
  const invalidLocalIds: string[] = [];

  for (const set of sets) {
    const validation = validateModifySetDraft(set);
    const itemIds = set.mappingItems.map((item) => item.clientId);
    if (validation.hasError || itemIds.length === 0) {
      invalidLocalIds.push(set.localId);
      continue;
    }

    const payload = buildModifySetPayload(set);
    prepared.push({
      localId: set.localId,
      name: set.name,
      itemIds,
      payload,
      existingClientId: set.apiClientId
    });
  }

  return { prepared, invalidLocalIds };
}
