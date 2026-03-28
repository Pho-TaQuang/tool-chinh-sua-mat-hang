import type { ApiError } from "@shared/types/sapo.types";
import type { ModifySetCreateResponse } from "@shared/types/modify-set.types";
import { computeRetryDelayMs, shouldRetry } from "@shared/http/retry";
import { formatApiErrorMessage, normalizeApiError } from "../api-error";
import type { SiteApiClient } from "../site.api.client";
import type {
  ModifySetCardModel,
  ModifySetPreparedInput,
  ModifySetRunCallbacks,
  ModifySetRunnerResult,
  ModifySetStatus
} from "./types";

export interface ModifySetRunnerPolicy {
  maxRetries: number;
  jitterMs: number;
}

interface ModifySetRunnerDeps {
  random: () => number;
  sleep: (delayMs: number) => Promise<void>;
}

interface CreateStageSuccess {
  modSetId: string | null;
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

function createMissingModifySetIdError(): ApiError {
  return {
    status: 0,
    code: "MISSING_MOD_SET_ID",
    message: "Create response does not contain modify_set.client_id",
    retryable: false
  };
}

function emitSetStatus(
  callbacks: ModifySetRunCallbacks,
  localId: string,
  update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>
): void {
  callbacks.onSetStatusChange(localId, update);
}

function resolveModifySetId(
  createResponse: ModifySetCreateResponse,
  preparedInput: ModifySetPreparedInput
): string | null {
  return (
    createResponse.modify_set?.client_id ??
    preparedInput.payload.modify_set.client_id ??
    preparedInput.existingClientId
  );
}

function buildCreateFailureResult(localId: string, errorMessage: string): ModifySetRunnerResult {
  return {
    localId,
    status: "create_failed",
    modSetId: null,
    errorMessage
  };
}

function buildMappingFailureResult(
  localId: string,
  modSetId: string | null,
  errorMessage: string
): ModifySetRunnerResult {
  return {
    localId,
    status: "mapping_failed",
    modSetId,
    errorMessage
  };
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
      results.push(await this.processOne(set, callbacks));
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
    return this.runMappingStage(
      {
        localId: input.localId,
        modSetId: input.modSetId,
        itemIds: input.itemIds,
        isRetryOnly: true
      },
      callbacks
    );
  }

  private async processOne(
    set: ModifySetPreparedInput,
    callbacks: ModifySetRunCallbacks
  ): Promise<ModifySetRunnerResult> {
    const createStage = await this.runCreateStage(set, callbacks);
    if ("status" in createStage) {
      return createStage;
    }

    return this.runMappingStage(
      {
        localId: set.localId,
        modSetId: createStage.modSetId,
        itemIds: set.itemIds,
        isRetryOnly: false
      },
      callbacks
    );
  }

  private async runCreateStage(
    set: ModifySetPreparedInput,
    callbacks: ModifySetRunCallbacks
  ): Promise<CreateStageSuccess | ModifySetRunnerResult> {
    emitSetStatus(callbacks, set.localId, {
      status: "creating",
      createError: null,
      mappingError: null
    });
    callbacks.onLog?.("info", "Creating modify set", { localId: set.localId, name: set.name });

    try {
      const createResponse = await this.withRetry(() => this.apiClient.createModifySet(set.payload));
      const modSetId = resolveModifySetId(createResponse, set);

      emitSetStatus(callbacks, set.localId, {
        status: "created",
        apiClientId: modSetId,
        createError: null
      });
      callbacks.onLog?.("info", "Modify set created", {
        localId: set.localId,
        modSetId
      });

      return { modSetId };
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const errorMessage = formatApiErrorMessage(normalized);

      emitSetStatus(callbacks, set.localId, {
        status: "create_failed",
        createError: errorMessage
      });
      callbacks.onLog?.("error", "Create modify set failed", {
        localId: set.localId,
        error: normalized
      });

      return buildCreateFailureResult(set.localId, errorMessage);
    }
  }

  private async runMappingStage(
    input: {
      localId: string;
      modSetId: string | null;
      itemIds: string[];
      isRetryOnly: boolean;
    },
    callbacks: ModifySetRunCallbacks
  ): Promise<ModifySetRunnerResult> {
    emitSetStatus(callbacks, input.localId, {
      status: "mapping",
      mappingError: null
    });
    callbacks.onLog?.(
      "info",
      input.isRetryOnly ? "Retry mapping modify set to items" : "Mapping modify set to items",
      {
        localId: input.localId,
        modSetId: input.modSetId,
        itemCount: input.itemIds.length
      }
    );

    try {
      if (!input.modSetId) {
        throw createMissingModifySetIdError();
      }

      await this.withRetry(() => this.apiClient.mapModifySetToItems(input.modSetId, input.itemIds));

      emitSetStatus(callbacks, input.localId, {
        status: "mapped",
        mappingError: null,
        apiClientId: input.modSetId
      });
      callbacks.onLog?.(
        "info",
        input.isRetryOnly ? "Retry mapping succeeded" : "Modify set mapped",
        {
          localId: input.localId,
          modSetId: input.modSetId,
          itemCount: input.itemIds.length
        }
      );

      return {
        localId: input.localId,
        status: "mapped",
        modSetId: input.modSetId
      };
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const errorMessage = formatApiErrorMessage(normalized);

      emitSetStatus(callbacks, input.localId, {
        status: "mapping_failed",
        mappingError: errorMessage,
        apiClientId: input.modSetId
      });
      callbacks.onLog?.(
        "error",
        input.isRetryOnly ? "Retry mapping failed" : "Mapping modify set failed",
        {
          localId: input.localId,
          modSetId: input.modSetId,
          error: normalized
        }
      );

      return buildMappingFailureResult(input.localId, input.modSetId, errorMessage);
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (error: unknown) {
        const normalized = normalizeApiError(error);
        if (!shouldRetry(normalized, attempt, this.policy.maxRetries)) {
          throw normalized;
        }

        attempt += 1;
        const delay = computeRetryDelayMs({
          error: normalized,
          retryIndex: attempt,
          jitterMs: this.policy.jitterMs,
          random: this.deps.random
        });
        await this.deps.sleep(delay);
      }
    }
  }
}

export function isFailureStatus(status: ModifySetStatus): boolean {
  return status === "create_failed" || status === "mapping_failed";
}
