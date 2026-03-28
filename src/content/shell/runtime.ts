import type { RuntimeResponse } from "@shared/types/runtime.types";
import { createRequestId } from "@shared/utils/request-id";
import type { ShellDebugLevel } from "./types";

const LOG_SCOPE = "[SapoBatch][content]";

export interface RuntimeEnvelope<T = unknown> {
  type: "INIT_CONTEXT" | "RUN_SMOKE_TEST" | "QUEUE_ENQUEUE" | "QUEUE_CANCEL" | "DEBUG_LOG";
  requestId: string;
  timestamp: number;
  payload: T;
}

export async function sendRuntimeMessage<T>(message: RuntimeEnvelope): Promise<RuntimeResponse<T>> {
  return new Promise<RuntimeResponse<T>>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

export function logContent(level: ShellDebugLevel, message: string, details?: unknown): void {
  const logger =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (details !== undefined) {
    logger(LOG_SCOPE, message, details);
    return;
  }

  logger(LOG_SCOPE, message);
}

export async function logToService(
  level: ShellDebugLevel,
  message: string,
  details?: unknown
): Promise<void> {
  try {
    await sendRuntimeMessage({
      type: "DEBUG_LOG",
      requestId: createRequestId("debug"),
      timestamp: Date.now(),
      payload: { level, message, details }
    });
  } catch (error) {
    logContent("warn", "Failed to send DEBUG_LOG message.", error);
  }
}
