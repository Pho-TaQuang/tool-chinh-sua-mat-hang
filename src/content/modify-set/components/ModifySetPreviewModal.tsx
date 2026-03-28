import React from "react";
import { Check, X } from "../../ui/icons";
import type { PendingPreview } from "../types";

interface ModifySetPreviewModalProps {
  pendingPreview: PendingPreview | null;
  onClose: () => void;
  onImport: () => void;
}

export function ModifySetPreviewModal({
  pendingPreview,
  onClose,
  onImport
}: ModifySetPreviewModalProps): React.JSX.Element | null {
  if (!pendingPreview) {
    return null;
  }

  return (
    <div className="spx-modset-preview-overlay">
      <div className="spx-modset-preview-modal">
        <h3>Preview import</h3>
        <p>
          Total: {pendingPreview.preview.totalRows} | Valid: {pendingPreview.preview.validRows} | Invalid: {pendingPreview.preview.invalidRows}
        </p>
        <div className="spx-modset-preview-table-wrap">
          <table className="spx-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Line</th>
                <th>Name</th>
                <th style={{ width: 140 }}>Price</th>
                <th style={{ width: 140 }}>Cost</th>
                <th style={{ width: 220 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingPreview.preview.rows.map((row) => (
                <tr key={`preview-${row.lineNumber}-${row.name}`}>
                  <td>{row.lineNumber}</td>
                  <td>{row.name || "-"}</td>
                  <td>{row.priceInput || "-"}</td>
                  <td>{row.costInput || "-"}</td>
                  <td>
                    {row.errors.length === 0 ? (
                      <span className="spx-row-status spx-success">Valid</span>
                    ) : (
                      <span className="spx-row-status spx-failed">{row.errors.join(" ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="spx-modset-preview-actions">
          <button className="spx-tool-btn" onClick={onClose}>
            <X /> Close
          </button>
          <button
            className="spx-big-btn spx-green"
            onClick={onImport}
            disabled={pendingPreview.preview.invalidRows > 0}
          >
            <Check /> Import to sheet
          </button>
        </div>
        {pendingPreview.preview.invalidRows > 0 ? (
          <div className="spx-modset-error">
            Import blocked because there are invalid rows. Please fix and paste again.
          </div>
        ) : null}
      </div>
    </div>
  );
}
