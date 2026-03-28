import React from "react";
import { X } from "../../ui/icons";
import type { ModifySetLinkedItem } from "../types";

interface ModifySetLinkedItemsProps {
  setLocalId: string;
  items: ModifySetLinkedItem[];
  onRemove: (itemClientId: string) => void;
}

export function ModifySetLinkedItems({
  setLocalId,
  items,
  onRemove
}: ModifySetLinkedItemsProps): React.JSX.Element {
  return (
    <div className="spx-modset-linked-items">
      <div className="spx-modset-linked-items-title">Linked items ({items.length})</div>
      <div className="spx-modset-linked-items-list">
        {items.length === 0 ? (
          <div className="spx-modset-selected-empty">No linked item for this set.</div>
        ) : (
          items.map((item) => (
            <div key={`${setLocalId}-${item.clientId}`} className="spx-modset-linked-item-row">
              <span title={item.clientId}>{item.name}</span>
              <button
                type="button"
                className="spx-icon-btn spx-danger"
                style={{ padding: 2, background: "transparent" }}
                title="Remove"
                onClick={() => onRemove(item.clientId)}
              >
                <X />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
