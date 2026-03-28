import { describe, expect, it } from "vitest";
import type { ApiError } from "@shared/types/sapo.types";
import { computeRetryDelayMs, parseRetryAfterToMs, shouldRetry } from "./retry";

const retryableError: ApiError = {
  status: 429,
  code: "HTTP_429",
  message: "Retry later",
  retryable: true
};

describe("shared http retry helpers", () => {
  it("parses Retry-After as seconds or http date", () => {
    const nowMs = Date.parse("2026-03-21T00:00:00Z");

    expect(parseRetryAfterToMs("7", nowMs)).toBe(7000);
    expect(parseRetryAfterToMs("Sun, 22 Mar 2026 00:00:00 GMT", nowMs)).toBe(24 * 60 * 60 * 1000);
  });

  it("uses retryAfterMs before exponential backoff", () => {
    expect(
      computeRetryDelayMs({
        error: { ...retryableError, retryAfterMs: 2500 },
        retryIndex: 3,
        jitterMs: 250,
        random: () => 0.5
      })
    ).toBe(2500);
  });

  it("computes exponential backoff with jitter and retry predicate", () => {
    expect(
      computeRetryDelayMs({
        error: retryableError,
        retryIndex: 3,
        jitterMs: 250,
        random: () => 0.5
      })
    ).toBe(4125);
    expect(shouldRetry(retryableError, 2, 3)).toBe(true);
    expect(shouldRetry(retryableError, 3, 3)).toBe(false);
  });
});
