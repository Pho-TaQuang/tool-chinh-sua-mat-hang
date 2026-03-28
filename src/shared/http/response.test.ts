import { describe, expect, it } from "vitest";
import { parseResponseBody } from "./response";

describe("shared http response helpers", () => {
  it("parses json and text bodies safely", async () => {
    const jsonResponse = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });
    const textResponse = new Response("plain text", {
      headers: { "content-type": "text/plain" }
    });

    await expect(parseResponseBody(jsonResponse)).resolves.toEqual({ ok: true });
    await expect(parseResponseBody(textResponse)).resolves.toBe("plain text");
  });
});
