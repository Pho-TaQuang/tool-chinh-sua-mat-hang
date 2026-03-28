import type { SiteAuthContext } from "../site.api.client";

export function extractAuthContext(): SiteAuthContext {
  const csrfToken = normalizeHeaderValue(readMeta("csrf-token"));
  const tokenCandidate =
    readMeta("x-fnb-token") ??
    readCookie("x-fnb-token") ??
    readFromStorage([
      "x-fnb-token",
      "x_fnb_token",
      "fnb_token",
      "fnbToken",
      "access_token",
      "auth_token",
      "token"
    ]) ??
    readJwtLikeFromStorage();
  const fnbToken = normalizeHeaderValue(tokenCandidate);

  const parsedIds = parseIdsFromToken(fnbToken);
  const merchantId =
    normalizeId(readMeta("x-merchant-id")) ??
    normalizeId(readCookie("x-merchant-id")) ??
    normalizeId(readFromStorage(["x-merchant-id", "merchant_id", "merchantId"])) ??
    parsedIds.merchantId;
  const storeId =
    normalizeId(readMeta("x-store-id")) ??
    normalizeId(readCookie("x-store-id")) ??
    normalizeId(readFromStorage(["x-store-id", "store_id", "storeId"])) ??
    parsedIds.storeId;

  return {
    csrfToken,
    fnbToken,
    merchantId,
    storeId,
    shopOrigin: window.location.origin
  };
}

export function parseIdsFromToken(
  token: string | null
): { merchantId: string | null; storeId: string | null } {
  if (!token) {
    return { merchantId: null, storeId: null };
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return { merchantId: null, storeId: null };
  }

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1] || "")) as {
      sub?: string;
      jti?: string | number;
    };

    return {
      merchantId: normalizeId(payload.sub?.split(":")?.[0] ?? null),
      storeId: normalizeId(payload.jti ? String(payload.jti) : null)
    };
  } catch {
    return { merchantId: null, storeId: null };
  }
}

export function normalizeHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutBearer = trimmed.replace(/^Bearer\s+/i, "");
  const withoutQuotes =
    (withoutBearer.startsWith("\"") && withoutBearer.endsWith("\"")) ||
    (withoutBearer.startsWith("'") && withoutBearer.endsWith("'"))
      ? withoutBearer.slice(1, -1)
      : withoutBearer;

  return withoutQuotes.trim() || null;
}

export function normalizeId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const sanitized = normalizeHeaderValue(value);
  if (!sanitized) {
    return null;
  }

  const digitsOnly = sanitized.replace(/[^\d]/g, "");
  return digitsOnly || sanitized;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return atob(base64);
}

function readMeta(name: string): string | null {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
}

function readCookie(name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function readFromStorage(candidateKeys: string[]): string | null {
  const keySet = new Set(candidateKeys.map((key) => key.toLowerCase()));

  for (const storage of listStorages()) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !keySet.has(key.toLowerCase())) {
        continue;
      }

      const value = storage.getItem(key);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function readJwtLikeFromStorage(): string | null {
  const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

  for (const storage of listStorages()) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.toLowerCase().includes("token")) {
        continue;
      }

      const value = storage.getItem(key);
      if (value && jwtPattern.test(value)) {
        return value;
      }
    }
  }

  return null;
}

function listStorages(): Storage[] {
  const storages: Storage[] = [];

  try {
    storages.push(window.localStorage);
  } catch {
    // ignore storage access errors
  }

  try {
    storages.push(window.sessionStorage);
  } catch {
    // ignore storage access errors
  }

  return storages;
}
