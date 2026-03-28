import type {
  ModifySetCardModel,
  ModifySetDraftValidation,
  ModifySetRowModel,
  ModifySetRowValidationError,
  ModifySetValidationError
} from "./types";

function parseNumberInput(input: string): { value: number | null; valid: boolean } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: null, valid: true };
  }

  const normalized = trimmed.replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return { value: null, valid: false };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { value: null, valid: false };
  }

  return { value: parsed, valid: true };
}

export function isRowCompletelyEmpty(row: ModifySetRowModel): boolean {
  return (
    row.name.trim().length === 0 &&
    row.priceInput.trim().length === 0 &&
    row.costInput.trim().length === 0 &&
    row.defaultSelected === false
  );
}

export function validateModifySetDraft(input: ModifySetCardModel): ModifySetDraftValidation {
  const setErrors: ModifySetValidationError[] = [];
  const rowErrors: ModifySetRowValidationError[] = [];

  if (!input.name.trim()) {
    setErrors.push({
      code: "SET_NAME_REQUIRED",
      message: "Modify set name is required."
    });
  }

  if (input.minQuantity < 0) {
    setErrors.push({
      code: "MIN_LT_ZERO",
      message: "min_quantity must be greater than or equal to 0."
    });
  }

  if (input.minQuantity > input.maxQuantity) {
    setErrors.push({
      code: "MIN_GT_MAX",
      message: "min_quantity cannot be greater than max_quantity."
    });
  }

  let validRowCount = 0;

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    if (!row) {
      continue;
    }

    if (isRowCompletelyEmpty(row)) {
      continue;
    }

    let hasRowError = false;

    if (!row.name.trim()) {
      hasRowError = true;
      rowErrors.push({
        rowId: row.rowId,
        rowIndex: index,
        code: "ROW_NAME_REQUIRED",
        message: "Option name is required."
      });
    }

    if (!row.priceInput.trim()) {
      hasRowError = true;
      rowErrors.push({
        rowId: row.rowId,
        rowIndex: index,
        code: "ROW_PRICE_REQUIRED",
        message: "Price is required for each option."
      });
    }

    const priceParsed = parseNumberInput(row.priceInput);
    if (row.priceInput.trim().length > 0 && !priceParsed.valid) {
      hasRowError = true;
      rowErrors.push({
        rowId: row.rowId,
        rowIndex: index,
        code: "ROW_PRICE_INVALID",
        message: "Price must be a valid number or blank."
      });
    }

    const costParsed = parseNumberInput(row.costInput);
    if (!costParsed.valid) {
      hasRowError = true;
      rowErrors.push({
        rowId: row.rowId,
        rowIndex: index,
        code: "ROW_COST_INVALID",
        message: "Cost must be a valid number or blank."
      });
    }

    if (!hasRowError) {
      validRowCount += 1;
    }
  }

  if (validRowCount === 0) {
    setErrors.push({
      code: "NO_VALID_OPTIONS",
      message: "Modify set must have at least 1 valid option."
    });
  }

  if (input.maxQuantity > validRowCount) {
    setErrors.push({
      code: "MAX_GT_OPTION_COUNT",
      message: "max_quantity cannot be greater than the number of valid options."
    });
  }

  return {
    setErrors,
    rowErrors,
    validRowCount,
    hasError: setErrors.length > 0 || rowErrors.length > 0
  };
}

export function parseOptionalNumber(input: string): number | "" {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  return Number(trimmed.replace(/,/g, ""));
}