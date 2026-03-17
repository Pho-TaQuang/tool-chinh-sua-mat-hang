import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  QueueDonePayload,
  QueueErrorPayload,
  QueueProgressPayload,
  RuntimeResponse,
  SmokeTestResultPayload
} from "@shared/types/runtime.types";
import { isContentToBackgroundMessage } from "@shared/types/runtime.types";
import type { ApiError } from "@shared/types/sapo.types";
import { createRequestId } from "@shared/utils/request-id";
import { SapoApiClient, type SapoContext } from "./api.client";
import { QueueManager } from "./queue.manager";

type SenderTabId = number;

interface ContextStoreValue extends SapoContext {
  updatedAt: number;
}

const queueManager = new QueueManager();
const apiClient = new SapoApiClient({ queue: queueManager });
const contextByTab = new Map<SenderTabId, ContextStoreValue>();
const ownerTabByJobId = new Map<string, SenderTabId>();
const LOG_SCOPE = "[SapoBatch][service]";

queueManager.subscribe({
  progress: (event) => {
    logService("info", "Queue progress event.", {
      jobId: event.job.id,
      status: event.job.status,
      retriesUsed: event.job.retriesUsed
    });
    const tabId = ownerTabByJobId.get(event.job.id);
    if (tabId === undefined) {
      return;
    }
    const payload: QueueProgressPayload = {
      jobId: event.job.id,
      status: event.job.status,
      retriesUsed: event.job.retriesUsed,
      nextEligibleAt: event.job.nextEligibleAt,
      deadlineAt: event.job.deadlineAt,
      updatedAt: event.job.updatedAt
    };
    void emitToTab(tabId, {
      type: "QUEUE_PROGRESS",
      requestId: createRequestId("queue-progress"),
      timestamp: Date.now(),
      payload
    });
  },
  done: (event) => {
    logService("info", "Queue done event.", { jobId: event.job.id });
    const tabId = ownerTabByJobId.get(event.job.id);
    if (tabId === undefined) {
      return;
    }
    const payload: QueueDonePayload = {
      jobId: event.job.id,
      status: "success"
    };
    void emitToTab(tabId, {
      type: "QUEUE_DONE",
      requestId: createRequestId("queue-done"),
      timestamp: Date.now(),
      payload
    });
  },
  error: (event) => {
    logService("error", "Queue error event.", {
      jobId: event.job.id,
      status: event.job.status,
      error: event.job.lastError
    });
    const tabId = ownerTabByJobId.get(event.job.id);
    if (tabId === undefined) {
      return;
    }

    const payload: QueueErrorPayload = {
      jobId: event.job.id,
      status: event.job.status === "cancelled" ? "cancelled" : "failed",
      error:
        event.job.lastError ??
        createError({
          status: 0,
          code: "UNKNOWN_QUEUE_ERROR",
          message: "Queue failed without error payload.",
          retryable: false
        })
    };
    void emitToTab(tabId, {
      type: "QUEUE_ERROR",
      requestId: createRequestId("queue-error"),
      timestamp: Date.now(),
      payload
    });
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isContentToBackgroundMessage(message)) {
    return false;
  }

  void handleMessage(message, sender)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: normalizeUnknownError(error)
      } satisfies RuntimeResponse);
    });

  return true;
});

async function handleMessage(
  message: ContentToBackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<RuntimeResponse> {
  await queueManager.init();
  const tabId = sender.tab?.id;
  logService("info", "Received message.", {
    type: message.type,
    requestId: message.requestId,
    tabId
  });

  switch (message.type) {
    case "INIT_CONTEXT": {
      if (tabId === undefined) {
        return fail("MISSING_TAB_CONTEXT", "Không tìm thấy tab gửi message.");
      }

      contextByTab.set(tabId, {
        csrfToken: message.payload.csrfToken,
        fnbToken: message.payload.fnbToken,
        merchantId: message.payload.merchantId,
        storeId: message.payload.storeId,
        shopOrigin: message.payload.shopOrigin,
        updatedAt: Date.now()
      });
      logService("info", "Saved INIT_CONTEXT for tab.", {
        tabId,
        hasFnbToken: Boolean(message.payload.fnbToken),
        merchantId: message.payload.merchantId,
        storeId: message.payload.storeId,
        hasCsrf: Boolean(message.payload.csrfToken)
      });

      return ok({ initialized: true, tabId });
    }

    case "RUN_SMOKE_TEST": {
      if (tabId === undefined) {
        return fail("MISSING_TAB_CONTEXT", "Không tìm thấy tab gửi message.");
      }

      const context = contextByTab.get(tabId);
      if (!context) {
        return fail(
          "MISSING_CONTEXT",
          "Chưa có context cho tab. Hãy gửi INIT_CONTEXT trước khi chạy smoke test."
        );
      }

      const response = await apiClient.getCategories(context, {
        page: message.payload.page ?? 1,
        limit: message.payload.limit ?? 5,
        name: message.payload.name ?? ""
      });
      logService("info", "RUN_SMOKE_TEST completed.", {
        tabId,
        total: response.metadata.total,
        count: response.categories.length
      });

      const payload: SmokeTestResultPayload = {
        total: response.metadata.total,
        page: response.metadata.page,
        limit: response.metadata.limit,
        count: response.categories.length,
        response
      };

      const event: BackgroundToContentMessage = {
        type: "SMOKE_TEST_RESULT",
        requestId: message.requestId,
        timestamp: Date.now(),
        payload
      };
      await emitToTab(tabId, event);
      return ok(payload);
    }

    case "QUEUE_ENQUEUE": {
      if (tabId === undefined) {
        return fail("MISSING_TAB_CONTEXT", "Không tìm thấy tab gửi message.");
      }

      const context = contextByTab.get(tabId);
      if (!context) {
        return fail("MISSING_CONTEXT", "Chưa có context cho tab.");
      }

      const requiresAuth = message.payload.request.method !== "GET";
      if (requiresAuth && !context.fnbToken && !context.csrfToken) {
        return fail(
          "MISSING_AUTH_TOKEN",
          "Không tìm thấy auth token. Hãy mở trang admin Sapo để lấy x-fnb-token hoặc csrf-token rồi thử lại."
        );
      }

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
      const body = message.payload.request.body
        ? JSON.stringify(message.payload.request.body)
        : undefined;
      if (body) {
        headers["Content-Type"] = "application/json";
      }

      const enqueued = await queueManager.enqueueRequest({
        method: message.payload.request.method,
        url: `https://fnb.mysapo.vn/admin${message.payload.request.path}`,
        headers,
        credentials: "include",
        metadata: { requestId: message.requestId, tabId },
        ...(body ? { body } : {})
      });
      logService("info", "QUEUE_ENQUEUE accepted.", {
        jobId: enqueued.jobId,
        method: message.payload.request.method,
        path: message.payload.request.path,
        tabId
      });
      ownerTabByJobId.set(enqueued.jobId, tabId);

      void enqueued.result.catch(() => {
        // Queue error event is emitted by listener.
      });

      return ok({ jobId: enqueued.jobId });
    }

    case "QUEUE_CANCEL": {
      const cancelled = await queueManager.cancel(message.payload.jobId);
      logService("info", "QUEUE_CANCEL processed.", {
        jobId: message.payload.jobId,
        cancelled
      });
      return ok({ cancelled });
    }

    case "DEBUG_LOG": {
      logService(message.payload.level, message.payload.message, {
        tabId,
        details: message.payload.details
      });
      return ok({ logged: true });
    }
  }
}

async function emitToTab(tabId: number, message: BackgroundToContentMessage): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  } catch {
    // The destination tab may be gone or not ready; swallow to keep worker stable.
  }
}

function ok<T>(data: T): RuntimeResponse<T> {
  return {
    ok: true,
    data
  };
}

function fail(code: string, message: string, details?: unknown): RuntimeResponse {
  return {
    ok: false,
    error: createError({
      status: 0,
      code,
      message,
      details,
      retryable: false
    })
  };
}

function createError(input: {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
  retryAfterMs?: number;
}): ApiError {
  const error: ApiError = {
    status: input.status,
    code: input.code,
    message: input.message,
    retryable: input.retryable
  };
  if (input.details !== undefined) {
    error.details = input.details;
  }
  if (input.retryAfterMs !== undefined) {
    error.retryAfterMs = input.retryAfterMs;
  }
  return error;
}

function normalizeUnknownError(error: unknown): ApiError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    "status" in error &&
    "retryable" in error
  ) {
    return error as ApiError;
  }

  if (error instanceof Error) {
    return createError({
      status: 0,
      code: "UNHANDLED_EXCEPTION",
      message: error.message,
      details: { name: error.name, stack: error.stack },
      retryable: false
    });
  }

  return createError({
    status: 0,
    code: "UNKNOWN_ERROR",
    message: "Unknown background worker error.",
    details: error,
    retryable: false
  });
}

function logService(level: "debug" | "info" | "warn" | "error", message: string, details?: unknown): void {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (details !== undefined) {
    logger(LOG_SCOPE, message, details);
    return;
  }
  logger(LOG_SCOPE, message);
}
