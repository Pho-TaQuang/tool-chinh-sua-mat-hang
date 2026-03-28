import { useEffect, useRef } from "react";
import { buildModifySetPayload, prepareModifySetsForSubmit } from "../normalize";
import { ModifySetRunner } from "../runner";
import type { SiteApiClient } from "../../site.api.client";
import type {
  ModifySetCardModel,
  ModifySetPreparedInput,
  PendingPreview
} from "../types";
import { validateModifySetDraft } from "../validator";
import { validateAllSets } from "../state/editor.reducer";

function toMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

interface ModifySetSubmissionOptions {
  apiClient: SiteApiClient | null;
  sets: ModifySetCardModel[];
  pendingPreview: PendingPreview | null;
  onStatusText: (text: string) => void;
  onShowToast: (message: string, type: "success" | "warn" | "error" | "info") => void;
  onDebugLog?: (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown) => Promise<void>;
  patchSetStatus: (
    localId: string,
    update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>
  ) => void;
  replaceSets: (sets: ModifySetCardModel[]) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  editSet: (localId: string, updater: (set: ModifySetCardModel) => ModifySetCardModel, userEdit?: boolean) => void;
}

export interface ModifySetSubmissionHandle {
  createAndMap: () => Promise<void>;
  retryOne: (set: ModifySetCardModel) => Promise<void>;
}

export function useModifySetSubmission(options: ModifySetSubmissionOptions): ModifySetSubmissionHandle {
  const runnerRef = useRef<ModifySetRunner | null>(null);

  useEffect(() => {
    if (!options.apiClient) {
      runnerRef.current = null;
      return;
    }

    runnerRef.current = new ModifySetRunner({ apiClient: options.apiClient });
  }, [options.apiClient]);

  const createCallbacks = () => ({
    onSetStatusChange: (
      localId: string,
      update: Partial<Pick<ModifySetCardModel, "status" | "apiClientId" | "createError" | "mappingError">>
    ) => {
      options.patchSetStatus(localId, update);
    },
    onLog: (level: "info" | "warn" | "error", message: string, details?: unknown) => {
      if (options.onDebugLog) {
        void options.onDebugLog(level, message, details);
      }
    }
  });

  const createAndMap = async (): Promise<void> => {
    if (!runnerRef.current || !options.apiClient) {
      options.onStatusText("API client is not ready.");
      return;
    }

    if (options.pendingPreview && options.pendingPreview.preview.invalidRows > 0) {
      options.onStatusText("Preview still contains invalid rows. Fix the data and import again before submit.");
      return;
    }

    const validation = validateAllSets(options.sets);
    options.replaceSets(validation.nextSets);
    if (validation.hasError) {
      options.onStatusText("Validation failed. Fix all errors before Create & map.");
      options.onShowToast("Validation failed. Fix all errors before Create & map.", "error");
      return;
    }

    const pendingSets = validation.nextSets.filter((set) => set.status !== "mapped");
    if (pendingSets.length === 0) {
      options.onStatusText("No pending set. All sets are already mapped.");
      return;
    }

    const mapOnlySets = pendingSets.filter((set) => Boolean(set.apiClientId));
    const createSets = pendingSets.filter((set) => !set.apiClientId);

    const { prepared, invalidLocalIds } = prepareModifySetsForSubmit(createSets);
    if (invalidLocalIds.length > 0 || (prepared.length === 0 && mapOnlySets.length === 0)) {
      options.onStatusText("No valid modify set to submit.");
      return;
    }

    options.setSubmitting(true);
    try {
      const results = [] as Array<{ status: string }>;

      for (const set of mapOnlySets) {
        if (!set.apiClientId) {
          continue;
        }

        const mapResult = await runnerRef.current.retryMappingOnly(
          {
            localId: set.localId,
            modSetId: set.apiClientId,
            itemIds: set.mappingItems.map((item) => item.clientId)
          },
          createCallbacks()
        );
        results.push(mapResult);
      }

      if (prepared.length > 0) {
        const createdResults = await runnerRef.current.run(prepared, createCallbacks());
        results.push(...createdResults);
      }

      const success = results.filter((result) => result.status === "mapped").length;
      const failed = results.length - success;
      options.onStatusText(`Create & map completed. Success: ${success}, Failed: ${failed}.`);
      options.onShowToast(`Create & map completed. Success: ${success}, Failed: ${failed}.`, failed > 0 ? "warn" : "success");
    } catch (error: unknown) {
      const message = `Create & map failed: ${toMessage(error)}`;
      options.onStatusText(message);
      options.onShowToast(message, "error");
    } finally {
      options.setSubmitting(false);
    }
  };

  const retryOne = async (set: ModifySetCardModel): Promise<void> => {
    if (!runnerRef.current) {
      options.onStatusText("Runner is not ready.");
      return;
    }

    if (set.mappingItems.length === 0) {
      options.onStatusText("Please link at least one item for this set before retry.");
      return;
    }

    const itemIds = set.mappingItems.map((item) => item.clientId);
    if (set.status === "mapping_failed" && set.apiClientId) {
      await runnerRef.current.retryMappingOnly(
        {
          localId: set.localId,
          modSetId: set.apiClientId,
          itemIds
        },
        createCallbacks()
      );
      return;
    }

    const validation = validateModifySetDraft(set);
    if (validation.hasError) {
      options.editSet(
        set.localId,
        (current) => ({
          ...current,
          validationErrors: validation,
          status: "draft"
        }),
        false
      );
      options.onStatusText("Retry blocked because set still has validation errors.");
      return;
    }

    const prepared: ModifySetPreparedInput = {
      localId: set.localId,
      name: set.name,
      itemIds,
      payload: buildModifySetPayload(set),
      existingClientId: set.apiClientId
    };
    await runnerRef.current.retrySingle(prepared, createCallbacks());
  };

  return {
    createAndMap,
    retryOne
  };
}
