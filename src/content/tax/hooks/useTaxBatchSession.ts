import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BatchRunner } from "../runner";
import type { BatchRunState, BatchStats, SelectableItem, TaxSelection } from "../types";
import { createEmptyBatchStats, deriveBatchProgress, type TaxBatchProgressModel } from "../view";
import type { SiteApiClient } from "../../site.api.client";

interface UseTaxBatchSessionOptions {
  apiClient: SiteApiClient | null;
  onStatusText: (text: string) => void;
  onShowToast: (message: string, type: "success" | "warn" | "error" | "info") => void;
  onDebugLog?: (level: "debug" | "info" | "warn" | "error", message: string, details?: unknown) => Promise<void>;
  applyVisibleItemsPatch: (state: BatchRunState | null) => void;
  reloadCurrentPage: () => Promise<void>;
}

interface StartBatchInput {
  items: SelectableItem[];
  tax: TaxSelection | null;
  page: number;
  limit: number;
  categoryId: string;
}

interface UseTaxBatchSessionResult {
  batchState: BatchRunState | null;
  batchStats: BatchStats;
  progress: TaxBatchProgressModel;
  hasOngoingBatch: boolean;
  initialize: () => Promise<void>;
  startBatch: (input: StartBatchInput) => Promise<void>;
  togglePauseResume: () => Promise<void>;
  discardBatch: () => Promise<void>;
}

export function useTaxBatchSession({
  apiClient,
  onStatusText,
  onShowToast,
  onDebugLog,
  applyVisibleItemsPatch,
  reloadCurrentPage
}: UseTaxBatchSessionOptions): UseTaxBatchSessionResult {
  const [batchState, setBatchState] = useState<BatchRunState | null>(null);
  const [batchStats, setBatchStats] = useState<BatchStats>(createEmptyBatchStats());

  const runnerRef = useRef<BatchRunner | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastCompletionLogIdRef = useRef<string | null>(null);
  const onStatusTextRef = useRef(onStatusText);
  const onShowToastRef = useRef(onShowToast);
  const onDebugLogRef = useRef(onDebugLog);
  const applyVisibleItemsPatchRef = useRef(applyVisibleItemsPatch);
  const reloadCurrentPageRef = useRef(reloadCurrentPage);

  useEffect(() => {
    onStatusTextRef.current = onStatusText;
  }, [onStatusText]);

  useEffect(() => {
    onShowToastRef.current = onShowToast;
  }, [onShowToast]);

  useEffect(() => {
    onDebugLogRef.current = onDebugLog;
  }, [onDebugLog]);

  useEffect(() => {
    applyVisibleItemsPatchRef.current = applyVisibleItemsPatch;
  }, [applyVisibleItemsPatch]);

  useEffect(() => {
    reloadCurrentPageRef.current = reloadCurrentPage;
  }, [reloadCurrentPage]);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      runnerRef.current = null;
    };
  }, []);

  const initialize = useCallback(async (): Promise<void> => {
    if (!apiClient) {
      return;
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    const runner = new BatchRunner({
      apiClient,
      logger: (entry) => {
        const debugLog = onDebugLogRef.current;
        if (debugLog) {
          void debugLog(entry.level, entry.message, entry.details);
        }
      }
    });

    runnerRef.current = runner;
    lastCompletionLogIdRef.current = null;

    unsubscribeRef.current = runner.subscribe(({ state, stats, lastLog }) => {
      setBatchState(state);
      setBatchStats(stats);
      applyVisibleItemsPatchRef.current(state);

      if (!lastLog || lastLog.message !== "Batch completed.") {
        return;
      }

      // Completion logs can be emitted multiple times through state snapshots, so toast/reload work must be gated by log id.
      if (lastCompletionLogIdRef.current === lastLog.id) {
        return;
      }

      lastCompletionLogIdRef.current = lastLog.id;
      const message = `Batch completed. Total: ${stats.total}, Success: ${stats.success}, Failed: ${stats.failed}, Skipped: ${stats.skipped}`;

      void (async () => {
        // Completion handling must reload the latest page/filter, not the values captured when the subscription was created.
        await reloadCurrentPageRef.current();
        onShowToastRef.current(message, stats.failed > 0 ? "error" : "success");
      })();
    });

    await runner.init();
    if (!runner.getState() || !runner.hasIncompleteItems()) {
      return;
    }

    const shouldResume = window.confirm("Detected unfinished batch. OK = Resume, Cancel = Discard.");
    if (shouldResume) {
      await runner.resume();
      onStatusTextRef.current("Resumed unfinished batch.");
      return;
    }

    await runner.discard();
    onStatusTextRef.current("Discarded unfinished batch.");
  }, [apiClient]);

  const startBatch = useCallback(async (input: StartBatchInput): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner) {
      return;
    }

    if (!input.tax) {
      onStatusTextRef.current("Please choose a tax code.");
      return;
    }

    if (input.items.length === 0) {
      onStatusTextRef.current("Please select at least one item.");
      return;
    }

    await runner.startBatch({
      items: input.items,
      tax: input.tax,
      page: input.page,
      limit: input.limit,
      categoryId: input.categoryId || null
    });
    onStatusTextRef.current(`Batch started (${input.items.length} item(s)).`);
  }, []);

  const togglePauseResume = useCallback(async (): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner || !batchState) {
      return;
    }

    if (batchState.isPaused) {
      await runner.resume();
      onStatusTextRef.current("Batch resumed.");
      return;
    }

    await runner.pause();
    onStatusTextRef.current("Batch paused.");
  }, [batchState]);

  const discardBatch = useCallback(async (): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner) {
      return;
    }

    if (!batchState || batchState.items.length === 0) {
      return;
    }

    const confirmed = window.confirm("Discard current batch state?");
    if (!confirmed) {
      return;
    }

    await runner.discard();
    onStatusTextRef.current("Batch discarded.");
  }, [batchState]);

  const progress = useMemo(
    () => deriveBatchProgress(batchState, batchStats),
    [batchState, batchStats]
  );

  return {
    batchState,
    batchStats,
    progress,
    hasOngoingBatch: batchStats.pending > 0 || batchStats.processing > 0,
    initialize,
    startBatch,
    togglePauseResume,
    discardBatch
  };
}
