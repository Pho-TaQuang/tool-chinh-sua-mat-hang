import type { ApiError, CategoryListResponse } from "./sapo.types";

export type RuntimeMessageType =
  | "INIT_CONTEXT"
  | "RUN_SMOKE_TEST"
  | "QUEUE_ENQUEUE"
  | "QUEUE_CANCEL"
  | "DEBUG_LOG"
  | "SMOKE_TEST_RESULT"
  | "QUEUE_PROGRESS"
  | "QUEUE_DONE"
  | "QUEUE_ERROR";

export interface RuntimeEnvelope<TType extends RuntimeMessageType, TPayload> {
  type: TType;
  requestId: string;
  timestamp: number;
  payload: TPayload;
}

export interface InitContextPayload {
  csrfToken: string | null;
  fnbToken: string | null;
  merchantId: string | null;
  storeId: string | null;
  shopOrigin: string;
}

export interface SmokeTestRequestPayload {
  page?: number;
  limit?: number;
  name?: string;
}

export interface SmokeTestResultPayload {
  total: number;
  page: number;
  limit: number;
  count: number;
  response: CategoryListResponse;
}

export interface QueueEnqueuePayload {
  request: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    body?: unknown;
  };
}

export interface QueueCancelPayload {
  jobId: string;
}

export interface DebugLogPayload {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  details?: unknown;
}

export interface QueueProgressPayload {
  jobId: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  retriesUsed: number;
  nextEligibleAt: number;
  deadlineAt: number;
  updatedAt: number;
}

export interface QueueDonePayload {
  jobId: string;
  status: "success";
}

export interface QueueErrorPayload {
  jobId: string;
  status: "failed" | "cancelled";
  error: ApiError;
}

export interface RuntimeResponseOk<T = unknown> {
  ok: true;
  data: T;
}

export interface RuntimeResponseError {
  ok: false;
  error: ApiError;
}

export type RuntimeResponse<T = unknown> = RuntimeResponseOk<T> | RuntimeResponseError;

export type ContentToBackgroundMessage =
  | RuntimeEnvelope<"INIT_CONTEXT", InitContextPayload>
  | RuntimeEnvelope<"RUN_SMOKE_TEST", SmokeTestRequestPayload>
  | RuntimeEnvelope<"QUEUE_ENQUEUE", QueueEnqueuePayload>
  | RuntimeEnvelope<"QUEUE_CANCEL", QueueCancelPayload>
  | RuntimeEnvelope<"DEBUG_LOG", DebugLogPayload>;

export type BackgroundToContentMessage =
  | RuntimeEnvelope<"SMOKE_TEST_RESULT", SmokeTestResultPayload>
  | RuntimeEnvelope<"QUEUE_PROGRESS", QueueProgressPayload>
  | RuntimeEnvelope<"QUEUE_DONE", QueueDonePayload>
  | RuntimeEnvelope<"QUEUE_ERROR", QueueErrorPayload>;

export function isRuntimeEnvelope(input: unknown): input is RuntimeEnvelope<RuntimeMessageType, unknown> {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as Partial<RuntimeEnvelope<RuntimeMessageType, unknown>>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.timestamp === "number"
  );
}

export function isContentToBackgroundMessage(input: unknown): input is ContentToBackgroundMessage {
  if (!isRuntimeEnvelope(input)) {
    return false;
  }

  return ["INIT_CONTEXT", "RUN_SMOKE_TEST", "QUEUE_ENQUEUE", "QUEUE_CANCEL", "DEBUG_LOG"].includes(
    input.type
  );
}
