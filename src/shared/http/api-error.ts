import type { ApiError } from "@shared/types/sapo.types";

export interface CreateApiErrorInput {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
  retryAfterMs?: number;
}

export function createApiError(input: CreateApiErrorInput): ApiError {
  const error: ApiError = {
    status: input.status,
    code: input.code,
    message: input.message,
    retryable: input.retryable
  };

  if (input.details !== undefined) {
    error.details = input.details;
  }
  if (input.retryAfterMs !== undefined) {
    error.retryAfterMs = input.retryAfterMs;
  }

  return error;
}

export function isApiErrorLike(error: unknown): error is ApiError {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "status" in error &&
    "code" in error &&
    "message" in error &&
    "retryable" in error
  );
}
