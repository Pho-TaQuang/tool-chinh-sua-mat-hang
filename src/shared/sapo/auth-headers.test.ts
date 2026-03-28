import { describe, expect, it } from "vitest";
import { buildSapoAuthHeaders } from "./auth-headers";

describe("shared sapo auth headers", () => {
  it("builds auth headers and only adds content-type when a body exists", () => {
    const withoutBody = buildSapoAuthHeaders(
      {
        csrfToken: "csrf",
        fnbToken: "token",
        merchantId: "47985",
        storeId: "49524"
      },
      false
    );
    const withBody = buildSapoAuthHeaders(
      {
        csrfToken: "csrf",
        fnbToken: "token",
        merchantId: "47985",
        storeId: "49524"
      },
      true
    );

    expect(withoutBody).not.toHaveProperty("Content-Type");
    expect(withBody).toMatchObject({
      "Content-Type": "application/json",
      "X-CSRF-Token": "csrf",
      "x-fnb-token": "token",
      "x-merchant-id": "47985",
      "x-store-id": "49524"
    });
  });
});
