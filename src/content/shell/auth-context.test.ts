import { describe, expect, it } from "vitest";
import { normalizeHeaderValue, normalizeId, parseIdsFromToken } from "./auth-context";

function createToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${header}.${encodedPayload}.signature`;
}

describe("content shell auth context helpers", () => {
  it("normalizes header values by stripping bearer prefix and quotes", () => {
    expect(normalizeHeaderValue("  Bearer \"abc123\"  ")).toBe("abc123");
    expect(normalizeHeaderValue("  'quoted'  ")).toBe("quoted");
  });

  it("returns null for empty normalized header values", () => {
    expect(normalizeHeaderValue("")).toBeNull();
    expect(normalizeHeaderValue("   ")).toBeNull();
    expect(normalizeHeaderValue(null)).toBeNull();
  });

  it("prefers digits-only ids and falls back to sanitized strings", () => {
    expect(normalizeId("merchant:47985")).toBe("47985");
    expect(normalizeId("'store-alpha'")).toBe("store-alpha");
  });

  it("parses merchantId and storeId from token payload", () => {
    const token = createToken({ sub: "47985:user", jti: "49524" });

    expect(parseIdsFromToken(token)).toEqual({
      merchantId: "47985",
      storeId: "49524"
    });
  });

  it("returns null ids for malformed or undecodable tokens", () => {
    expect(parseIdsFromToken("invalid.token")).toEqual({
      merchantId: null,
      storeId: null
    });
    expect(parseIdsFromToken(null)).toEqual({
      merchantId: null,
      storeId: null
    });
  });
});
