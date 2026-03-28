# Shared HTTP

## Purpose
Provide shared request/error/retry helpers used by both content-side features and background queue code, so cross-cutting HTTP rules live in one place instead of being reimplemented in each runtime.

## Entrypoints
- `src/shared/http/api-error.ts`: shared `ApiError` builder and shape guard.
- `src/shared/http/retry.ts`: `Retry-After`, retry predicate, and exponential backoff helpers.
- `src/shared/http/response.ts`: safe response-body parsing for JSON and text payloads.
- `src/shared/sapo/auth-headers.ts`: standard Sapo auth header builder.

## Main Domain Rules
- `Retry-After` wins over exponential backoff when present and valid.
- Retry delay still uses jitter on exponential retries.
- Auth headers must preserve current header names and casing used by Sapo endpoints.
- `Content-Type` is only added when a request body exists.
- Shared helpers stay transport-level; they should not hide feature-specific batch or mapping rules.

## Important Dependencies
- `src/shared/types/sapo.types.ts` for `ApiError`.
- `src/content/site.api.client.ts` and `src/background/queue.manager.ts` as main consumers.
- `src/background/api.client.ts` and feature runners as direct retry helper consumers.

## Easy To Break
- Changing auth header names or omission rules can break both content calls and background queue calls.
- Altering retry math changes both item batch behavior and background queue scheduling.
- `parseResponseBody` must stay permissive; throwing on malformed response bodies would widen failure scope across runtimes.
