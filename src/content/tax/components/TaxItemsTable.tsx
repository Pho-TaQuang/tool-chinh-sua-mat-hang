import React from "react";
import type { Item } from "@shared/types/sapo.types";
import type { BatchItemState } from "../types";
import { resolveTaxRowStatus } from "../view";

interface TaxItemsTableProps {
  items: Item[];
  page: number;
  pageLimit: number;
  totalPages: number;
  selectedIds: Set<string>;
  batchMap: Map<string, BatchItemState>;
  pageAllSelected: boolean;
  isLoadingItems: boolean;
  onToggleSelect: (clientId: string) => void;
  onToggleSelectPage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function TaxItemsTable({
  items,
  page,
  pageLimit,
  totalPages,
  selectedIds,
  batchMap,
  pageAllSelected,
  isLoadingItems,
  onToggleSelect,
  onToggleSelectPage,
  onPrevPage,
  onNextPage
}: TaxItemsTableProps): React.JSX.Element {
  return (
    <>
      <div className="spx-tax-table-container">
        <table className="spx-table">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
                <input type="checkbox" checked={pageAllSelected} onChange={onToggleSelectPage} />
              </th>
              <th style={{ width: 50 }}>#</th>
              <th>Name</th>
              <th style={{ width: 140 }}>Current Tax</th>
              <th style={{ width: 100 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const status = resolveTaxRowStatus(item.client_id, selectedIds, batchMap);
              return (
                <tr key={item.client_id}>
                  <td style={{ textAlign: "center", overflow: "visible", textOverflow: "clip" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.client_id)}
                      onChange={() => onToggleSelect(item.client_id)}
                    />
                  </td>
                  <td>{(page - 1) * pageLimit + index + 1}</td>
                  <td title={item.client_id}>{item.name}</td>
                  <td>{item.tax_infos?.vat_pit_category_code || "-"}</td>
                  <td>
                    <span className={`spx-row-status ${status.tone}`}>
                      {status.label}
                      {typeof status.attempts === "number" ? ` (${status.attempts})` : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center" }}>
                  No items loaded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="spx-pagination">
        <button className="spx-page-btn" onClick={onPrevPage} disabled={page <= 1 || isLoadingItems}>
          &laquo;
        </button>
        <div className="spx-page-input-group">
          <span className="spx-page-summary">
            Page {page} of {totalPages}
          </span>
        </div>
        <button className="spx-page-btn" onClick={onNextPage} disabled={page >= totalPages || isLoadingItems}>
          &raquo;
        </button>
      </div>
    </>
  );
}
