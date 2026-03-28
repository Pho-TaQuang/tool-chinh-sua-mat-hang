import type { ApiError } from "@shared/types/sapo.types";

const DEFAULT_MAX_BACKOFF_MS = 30_000;

export function parseRetryAfterToMs(retryAfter: string | null, nowMs: number): number | undefined {
  if (!retryAfter) {
    return undefined;
  }

  const trimmed = retryAfter.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isNaN(parsedDate)) {
    return undefined;
  }

  return Math.max(0, parsedDate - nowMs);
}

export function shouldRetry(error: ApiError, retriesUsed: number, maxRetries: number): boolean {
  return error.retryable && retriesUsed < maxRetries;
}

export function computeRetryDelayMs(input: {
  error: ApiError;
  retryIndex: number;
  jitterMs: number;
  random: () => number;
  maxBackoffMs?: number;
}): number {
  if (typeof input.error.retryAfterMs === "number" && input.error.retryAfterMs >= 0) {
    return input.error.retryAfterMs;
  }

  const base = Math.min(
    input.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
    1000 * 2 ** Math.max(0, input.retryIndex - 1)
  );
  const jitter = Math.floor(input.random() * (input.jitterMs + 1));
  return base + jitter;
}
