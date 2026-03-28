import { describe, expect, it } from "vitest";
import { createApiError, isApiErrorLike } from "./api-error";

describe("shared http api-error helpers", () => {
  it("builds ApiError objects with optional fields", () => {
    expect(
      createApiError({
        status: 429,
        code: "HTTP_429",
        message: "Retry later",
        retryable: true,
        details: { reason: "throttle" },
        retryAfterMs: 7000
      })
    ).toEqual({
      status: 429,
      code: "HTTP_429",
      message: "Retry later",
      retryable: true,
      details: { reason: "throttle" },
      retryAfterMs: 7000
    });
  });

  it("detects ApiError-like values", () => {
    expect(
      isApiErrorLike({
        status: 0,
        code: "UNKNOWN",
        message: "Unknown",
        retryable: false
      })
    ).toBe(true);
    expect(isApiErrorLike(new Error("boom"))).toBe(false);
  });
});
