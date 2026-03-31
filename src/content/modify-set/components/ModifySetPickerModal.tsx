import React from "react";
import type { Item } from "@shared/types/sapo.types";
import { CustomSelect } from "../../ui/CustomSelect";
import { Check, RefreshCw, Search, X } from "../../ui/icons";
import type { ModifySetCardModel, ModifySetLinkedItem } from "../types";

interface ModifySetPickerModalProps {
  targetSet: ModifySetCardModel | null;
  items: Item[];
  selectedItems: ModifySetLinkedItem[];
  selectedItemsMap: Map<string, ModifySetLinkedItem>;
  allPageSelected: boolean;
  itemPage: number;
  totalPages: number;
  keywordInput: string;
  selectedCategoryId: string;
  categoryOptions: Array<{ value: string; label: string }>;
  isLoadingItems: boolean;
  onKeywordInputChange: (value: string) => void;
  onSearch: () => void;
  onCategoryChange: (value: string) => void;
  onRefresh: () => void;
  onToggleAllPage: () => void;
  onToggleItem: (item: Item) => void;
  onRemoveSelectedItem: (clientId: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function ModifySetPickerModal({
  targetSet,
  items,
  selectedItems,
  selectedItemsMap,
  allPageSelected,
  itemPage,
  totalPages,
  keywordInput,
  selectedCategoryId,
  categoryOptions,
  isLoadingItems,
  onKeywordInputChange,
  onSearch,
  onCategoryChange,
  onRefresh,
  onToggleAllPage,
  onToggleItem,
  onRemoveSelectedItem,
  onPrevPage,
  onNextPage,
  onClose,
  onConfirm
}: ModifySetPickerModalProps): React.JSX.Element | null {
  if (!targetSet) {
    return null;
  }

  return (
    <div className="spx-modset-preview-overlay">
      <div className="spx-modset-preview-modal">
        <h3>Link items for: {targetSet.name.trim() || "Untitled set"}</h3>
        <div className="spx-modset-items-toolbar">
          <input
            className="spx-input-text spx-modset-search-input"
            placeholder="Search item by name"
            value={keywordInput}
            onChange={(event) => onKeywordInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSearch();
              }
            }}
          />
          <CustomSelect
            value={selectedCategoryId}
            onChange={onCategoryChange}
            placeholder="All categories"
            options={[
              { value: "", label: "All categories" },
              ...categoryOptions.map((option) => ({ value: option.value, label: option.label }))
            ]}
          />
          <button className="spx-tool-btn" onClick={onSearch}>
            <Search /> Search
          </button>
          <button className="spx-tool-btn" onClick={onRefresh}>
            <RefreshCw /> {isLoadingItems ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div className="spx-modset-picker-grid">
          <div className="spx-modset-preview-table-container">
            <div className="spx-modset-preview-table-wrap">
              <table className="spx-table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
                    <input type="checkbox" checked={allPageSelected} onChange={onToggleAllPage} />
                  </th>
                  <th style={{ width: 60 }}>#</th>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.client_id}>
                    <td style={{ textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
                      <input
                        type="checkbox"
                        checked={selectedItemsMap.has(item.client_id)}
                        onChange={() => onToggleItem(item)}
                      />
                    </td>
                    <td>{(itemPage - 1) * 50 + index + 1}</td>
                    <td title={item.client_id}>{item.name}</td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center" }}>
                      No items found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>

            <div className="spx-pagination" style={{ marginTop: "auto" }}>
              <button className="spx-page-btn" onClick={onPrevPage} disabled={itemPage <= 1 || isLoadingItems}>
                &laquo;
              </button>
              <div className="spx-page-input-group">
                <span className="spx-page-summary">Page {itemPage} of {totalPages}</span>
              </div>
              <button className="spx-page-btn" onClick={onNextPage} disabled={itemPage >= totalPages || isLoadingItems}>
                &raquo;
              </button>
            </div>
          </div>

          <div className="spx-modset-selected-list spx-modset-selected-list-vertical">
            <div className="spx-modset-linked-items-title">Selected items ({selectedItems.length})</div>
            {selectedItems.length === 0 ? (
              <div className="spx-modset-selected-empty">No selected item.</div>
            ) : (
              selectedItems.map((item) => (
                <div key={item.clientId} className="spx-modset-linked-item-row">
                  <span title={item.clientId}>{item.name}</span>
                  <button type="button" className="spx-icon-btn spx-danger" title="Remove" onClick={() => onRemoveSelectedItem(item.clientId)}>
                    <X />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="spx-modset-preview-actions">
          <button className="spx-tool-btn" onClick={onClose}>
            <X /> Cancel
          </button>
          <button className="spx-big-btn spx-green" onClick={onConfirm} disabled={selectedItems.length === 0}>
            <Check /> Confirm link items
          </button>
        </div>
      </div>
    </div>
  );
}
