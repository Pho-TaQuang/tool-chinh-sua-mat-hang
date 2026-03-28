import type { ApiError } from "@shared/types/sapo.types";
import { createApiError, isApiErrorLike } from "@shared/http/api-error";

function formatResponseDetails(details: unknown, maxDetailLength: number): string | null {
  if (details === undefined || details === null) {
    return null;
  }

  const raw = (() => {
    if (typeof details === "string") {
      return details.trim();
    }

    try {
      return JSON.stringify(details);
    } catch {
      return String(details);
    }
  })();

  if (!raw) {
    return null;
  }

  if (raw.length <= maxDetailLength) {
    return raw;
  }

  return `${raw.slice(0, maxDetailLength)}...`;
}

export function normalizeApiError(error: unknown): ApiError {
  if (isApiErrorLike(error)) {
    return error as ApiError;
  }

  if (error instanceof Error) {
    return createApiError({
      status: 0,
      code: "UNHANDLED_EXCEPTION",
      message: error.message,
      retryable: false,
      details: { stack: error.stack }
    });
  }

  return createApiError({
    status: 0,
    code: "UNKNOWN_ERROR",
    message: String(error),
    retryable: false,
    details: error
  });
}

export function formatApiErrorMessage(error: ApiError, maxDetailLength = 800): string {
  const responseDetails = formatResponseDetails(error.details, maxDetailLength);
  if (!responseDetails) {
    return `${error.code}: ${error.message}`;
  }

  return `${error.code}: ${error.message} | response: ${responseDetails}`;
}
