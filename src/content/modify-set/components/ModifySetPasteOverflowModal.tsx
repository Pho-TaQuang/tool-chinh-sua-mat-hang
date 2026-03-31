import React from "react";
import { X } from "../../ui/icons";
import type { PendingPasteOverflow } from "../types";

interface ModifySetPasteOverflowModalProps {
  pendingPasteOverflow: PendingPasteOverflow | null;
  onCancel: () => void;
  onContinue: () => void;
}

export function ModifySetPasteOverflowModal({
  pendingPasteOverflow,
  onCancel,
  onContinue
}: ModifySetPasteOverflowModalProps): React.JSX.Element | null {
  if (!pendingPasteOverflow) {
    return null;
  }

  return (
    <div className="spx-modset-preview-overlay">
      <div className="spx-modset-preview-modal">
        <h3>Paste overflow warning</h3>
        <p>
          Pasted data has more columns than the table can fit from the current cell. Continue anyway will import only
          the columns that fit in the sheet.
        </p>
        <div className="spx-modset-preview-actions">
          <button className="spx-tool-btn" onClick={onCancel}>
            <X /> Cancel
          </button>
          <button className="spx-big-btn spx-green" onClick={onContinue}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
