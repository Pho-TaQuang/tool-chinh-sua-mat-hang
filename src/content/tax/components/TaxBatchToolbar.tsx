import React from "react";
import type { BatchRunState } from "../types";
import type { TaxBatchProgressModel } from "../view";

interface TaxBatchToolbarProps {
  progress: TaxBatchProgressModel;
  batchState: BatchRunState | null;
  hasOngoingBatch: boolean;
  canStart: boolean;
  onStartBatch: () => void;
  onTogglePauseResume: () => void;
  onDiscardBatch: () => void;
}

export function TaxBatchToolbar({
  progress,
  batchState,
  hasOngoingBatch,
  canStart,
  onStartBatch,
  onTogglePauseResume,
  onDiscardBatch
}: TaxBatchToolbarProps): React.JSX.Element {
  return (
    <div className="spx-sync-row spx-card">
      <div className="spx-sync-progress-group">
        <div
          className="spx-sync-progress-item-name"
          title={progress.processingName ? `Running: ${progress.processingName}` : undefined}
        >
          {progress.processingName ?? "\u00A0"}
        </div>
        <div className="spx-sync-progress-main">
          <span className="spx-sync-progress-label">
            {hasOngoingBatch ? "Running batch..." : "Ready"}
          </span>
          <div className="spx-progress-track">
            <div className="spx-progress-bar" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="spx-stat-label">
            {progress.completed}/{progress.total || 0} completed
          </span>
        </div>
      </div>
      <div className="spx-sync-item">
        <button
          className="spx-big-btn spx-danger"
          onClick={onDiscardBatch}
          disabled={!batchState || batchState.items.length === 0}
        >
          Discard
        </button>
        {hasOngoingBatch ? (
          <button
            className="spx-big-btn spx-warning"
            onClick={onTogglePauseResume}
            disabled={!batchState}
          >
            {batchState?.isPaused ? "Resume" : "Pause"}
          </button>
        ) : (
          <button className="spx-big-btn spx-green" onClick={onStartBatch} disabled={!canStart}>
            Update
          </button>
        )}
      </div>
    </div>
  );
}
