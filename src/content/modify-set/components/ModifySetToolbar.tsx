import React from "react";
import { Clipboard, Upload } from "../../ui/icons";
import type { ModifySetCardModel } from "../types";

interface ModifySetToolbarProps {
  isSubmitting: boolean;
  completed: number;
  total: number;
  percent: number;
  processingSet?: ModifySetCardModel;
  onPreviewImport: () => void;
  onCreateAndMap: () => void;
}

export function ModifySetToolbar({
  isSubmitting,
  completed,
  total,
  percent,
  processingSet,
  onPreviewImport,
  onCreateAndMap
}: ModifySetToolbarProps): React.JSX.Element {
  const processingLabel = processingSet ? processingSet.name.trim() || processingSet.localId : "";

  return (
    <div className="spx-sync-row spx-card" style={{ marginBottom: 15 }}>
      <div className="spx-sync-progress-group">
        <div
          className="spx-sync-progress-item-name"
          title={processingSet ? `Running: ${processingLabel}` : undefined}
        >
          {processingSet ? `Running: ${processingLabel}` : "\u00A0"}
        </div>
        <div className="spx-sync-progress-main">
          <span className="spx-sync-progress-label">{isSubmitting ? "Running batch..." : "Ready"}</span>
          <div className="spx-progress-track">
            <div className="spx-progress-bar" style={{ width: `${percent}%` }} />
          </div>
          <span className="spx-stat-label">{completed}/{total || 0} completed</span>
        </div>
      </div>
      <div className="spx-sync-item">
        <button className="spx-tool-btn" onClick={onPreviewImport}>
          <Clipboard /> Preview import
        </button>
        <button className="spx-big-btn spx-green" onClick={onCreateAndMap} disabled={isSubmitting}>
          <Upload /> {isSubmitting ? "Submitting..." : "Create & map"}
        </button>
      </div>
    </div>
  );
}
