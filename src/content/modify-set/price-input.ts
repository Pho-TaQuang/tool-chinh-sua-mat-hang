export function getPriceEditableBoundary(value: string): number {
  if (!value.endsWith("000")) {
    return value.length;
  }

  return Math.max(0, value.length - 3);
}

export function applyPriceOneShotSuffix(input: {
  previousValue: string;
  rawValue: string;
  inputType: string | undefined;
  inputData: string | null;
}): { value: string; applied: boolean; caret: number | null } {
  if (input.inputType !== "insertText") {
    return {
      value: input.rawValue,
      applied: false,
      caret: null
    };
  }

  if (input.previousValue.trim().length > 0) {
    return {
      value: input.rawValue,
      applied: false,
      caret: null
    };
  }

  if (!input.inputData || !/^\d$/.test(input.inputData)) {
    return {
      value: input.rawValue,
      applied: false,
      caret: null
    };
  }

  const typedDigits = input.rawValue.replace(/\D/g, "");
  if (!typedDigits) {
    return {
      value: input.rawValue,
      applied: false,
      caret: null
    };
  }

  return {
    value: `${typedDigits}000`,
    applied: true,
    caret: typedDigits.length
  };
}
