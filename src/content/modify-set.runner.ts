import type { ApiError } from "@shared/types/sapo.types";
import type { ModifySetCreateResponse } from "@shared/types/modify-set.types";
import type { SiteApiClient } from "./site.api.client";
import type {
  ModifySetPreparedInput,
  ModifySetRunCallbacks,
  ModifySetRunnerResult,
  ModifySetStatus
} from "./modify-set.types";

const MAX_BACKOFF_MS = 30_000;

export interface ModifySetRunnerPolicy {
  maxRetries: number;
  jitterMs: number;
}

interface ModifySetRunnerDeps {
  random: () => number;
  sleep: (delayMs: number) => Promise<void>;
}

const DEFAULT_POLICY: ModifySetRunnerPolicy = {
  maxRetries: 3,
  jitterMs: 250
};

function defaultDeps(): ModifySetRunnerDeps {
  return {
    random: () => Math.random(),
    sleep: async (delayMs: number) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.max(0, delayMs));
      });
    }
  };
}

function normalizeApiError(error: unknown): ApiError {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "code" in error &&
    "message" in error &&
    "retryable" in error
  ) {
    return error as ApiError;
  }

  if (error instanceof Error) {
    return {
      status: 0,
      code: "UNHANDLED_EXCEPTION",
      message: error.message,
      retryable: false,
      details: { stack: error.stack }
    };
  }

  return {
    status: 0,
    code: "UNKNOWN_ERROR",
    message: String(error),
    retryable: false,
    details: error
  };
}

function toMessage(error: ApiError): string {
  const responseDetails = formatResponseDetails(error.details);
  if (!responseDetails) {
    return `${error.code}: ${error.message}`;
  }
  return `${error.code}: ${error.message} | response: ${responseDetails}`;
}

function formatResponseDetails(details: unknown): string | null {
  if (details === undefined || details === null) {
    return null;
  }

  const raw = (() => {
    if (typeof details === "string") {
      return details.trim();
    }
    try {
      return JSON.stringify(details);
    } catch {
      return String(details);
    }
  })();

  if (!raw) {
    return null;
  }

  const maxLength = 800;
  if (raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, maxLength)}...`;
}

export class ModifySetRunner {
  private readonly apiClient: SiteApiClient;
  private readonly policy: ModifySetRunnerPolicy;
  private readonly deps: ModifySetRunnerDeps;

  constructor(options: {
    apiClient: SiteApiClient;
    policy?: Partial<ModifySetRunnerPolicy>;
    dependencies?: Partial<ModifySetRunnerDeps>;
  }) {
    this.apiClient = options.apiClient;
    this.policy = {
      ...DEFAULT_POLICY,
      ...options.policy
    };
    this.deps = {
      ...defaultDeps(),
      ...options.dependencies
    };
  }

  async run(
    sets: ModifySetPreparedInput[],
    callbacks: ModifySetRunCallbacks
  ): Promise<ModifySetRunnerResult[]> {
    const results: ModifySetRunnerResult[] = [];

    for (const set of sets) {
      const result = await this.processOne(set, callbacks);
      results.push(result);
    }

    return results;
  }

  async retrySingle(
    set: ModifySetPreparedInput,
    callbacks: ModifySetRunCallbacks
  ): Promise<ModifySetRunnerResult> {
    return this.processOne(set, callbacks);
  }

  async retryMappingOnly(
    input: { localId: string; modSetId: string; itemIds: string[] },
    callbacks: ModifySetRunCallbacks
  ): Promise<ModifySetRunnerResult> {
    callbacks.onSetStatusChange(input.localId, {
      status: "mapping",
      mappingError: null
    });

    callbacks.onLog?.("info", "Retry mapping modify set to items", {
      localId: input.localId,
      modSetId: input.modSetId,
      itemCount: input.itemIds.length
    });

    try {
      await this.withRetry(
        () => this.apiClient.mapModifySetToItems(input.modSetId, input.itemIds),
        "mapping",
        input.localId
      );

      callbacks.onSetStatusChange(input.localId, {
        status: "mapped",
        mappingError: null,
        apiClientId: input.modSetId
      });
      callbacks.onLog?.("info", "Retry mapping succeeded", {
        localId: input.localId,
        modSetId: input.modSetId
      });
      return {
        localId: input.localId,
        status: "mapped",
        modSetId: input.modSetId
      };
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const errorMessage = toMessage(normalized);
      callbacks.onSetStatusChange(input.localId, {
        status: "mapping_failed",
        mappingError: errorMessage,
        apiClientId: input.modSetId
      });
      callbacks.onLog?.("error", "Retry mapping failed", {
        localId: input.localId,
        modSetId: input.modSetId,
        error: normalized
      });
      return {
        localId: input.localId,
        status: "mapping_failed",
        modSetId: input.modSetId,
        errorMessage
      };
    }
  }

  private async processOne(
    set: ModifySetPreparedInput,
    callbacks: ModifySetRunCallbacks
  ): Promise<ModifySetRunnerResult> {
    callbacks.onSetStatusChange(set.localId, {
      status: "creating",
      createError: null,
      mappingError: null
    });
    callbacks.onLog?.("info", "Creating modify set", { localId: set.localId, name: set.name });

    let createResponse: ModifySetCreateResponse;
    try {
      createResponse = await this.withRetry(() => this.apiClient.createModifySet(set.payload), "create", set.localId);
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const errorMessage = toMessage(normalized);
      callbacks.onSetStatusChange(set.localId, {
        status: "create_failed",
        createError: errorMessage
      });
      callbacks.onLog?.("error", "Create modify set failed", {
        localId: set.localId,
        error: normalized
      });
      return {
        localId: set.localId,
        status: "create_failed",
        modSetId: null,
        errorMessage
      };
    }

    const modSetId =
      createResponse.modify_set?.client_id ??
      set.payload.modify_set.client_id ??
      set.existingClientId;

    callbacks.onSetStatusChange(set.localId, {
      status: "created",
      apiClientId: modSetId,
      createError: null
    });

    callbacks.onLog?.("info", "Modify set created", {
      localId: set.localId,
      modSetId
    });

    callbacks.onSetStatusChange(set.localId, {
      status: "mapping",
      mappingError: null
    });
    callbacks.onLog?.("info", "Mapping modify set to items", {
      localId: set.localId,
      modSetId,
      itemCount: set.itemIds.length
    });

    try {
      if (!modSetId) {
        throw {
          status: 0,
          code: "MISSING_MOD_SET_ID",
          message: "Create response does not contain modify_set.client_id",
          retryable: false
        } satisfies ApiError;
      }

      await this.withRetry(
        () => this.apiClient.mapModifySetToItems(modSetId, set.itemIds),
        "mapping",
        set.localId
      );

      callbacks.onSetStatusChange(set.localId, {
        status: "mapped",
        mappingError: null,
        apiClientId: modSetId
      });
      callbacks.onLog?.("info", "Modify set mapped", {
        localId: set.localId,
        modSetId,
        itemCount: set.itemIds.length
      });

      return {
        localId: set.localId,
        status: "mapped",
        modSetId
      };
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const errorMessage = toMessage(normalized);
      callbacks.onSetStatusChange(set.localId, {
        status: "mapping_failed",
        mappingError: errorMessage,
        apiClientId: modSetId
      });
      callbacks.onLog?.("error", "Mapping modify set failed", {
        localId: set.localId,
        modSetId,
        error: normalized
      });
      return {
        localId: set.localId,
        status: "mapping_failed",
        modSetId,
        errorMessage
      };
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    step: "create" | "mapping",
    localId: string
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (error: unknown) {
        const normalized = normalizeApiError(error);
        const shouldRetry = normalized.retryable && attempt < this.policy.maxRetries;
        if (!shouldRetry) {
          throw normalized;
        }

        attempt += 1;
        const delay = this.computeRetryDelayMs(normalized, attempt);
        await this.deps.sleep(delay);
      }
    }
  }

  private computeRetryDelayMs(error: ApiError, retryIndex: number): number {
    if (typeof error.retryAfterMs === "number" && error.retryAfterMs >= 0) {
      return error.retryAfterMs;
    }
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, retryIndex - 1));
    const jitter = Math.floor(this.deps.random() * (this.policy.jitterMs + 1));
    return base + jitter;
  }
}

export function isFailureStatus(status: ModifySetStatus): boolean {
  return status === "create_failed" || status === "mapping_failed";
}
