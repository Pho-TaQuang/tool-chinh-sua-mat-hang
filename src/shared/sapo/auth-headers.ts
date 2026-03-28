export interface SapoAuthHeadersContext {
  csrfToken: string | null;
  fnbToken: string | null;
  merchantId: string | null;
  storeId: string | null;
}

export function buildSapoAuthHeaders(
  context: SapoAuthHeadersContext,
  hasBody: boolean
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest"
  };

  if (context.csrfToken) {
    headers["X-CSRF-Token"] = context.csrfToken;
  }
  if (context.fnbToken) {
    headers["x-fnb-token"] = context.fnbToken;
  }
  if (context.merchantId) {
    headers["x-merchant-id"] = context.merchantId;
  }
  if (context.storeId) {
    headers["x-store-id"] = context.storeId;
  }
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}
