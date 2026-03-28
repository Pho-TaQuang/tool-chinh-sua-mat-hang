import React, { useEffect, useMemo } from "react";
import "./styles.css";
import { TaxBatchToolbar } from "./components/TaxBatchToolbar";
import { TaxFilters } from "./components/TaxFilters";
import { TaxItemsTable } from "./components/TaxItemsTable";
import { useTaxBatchSession } from "./hooks/useTaxBatchSession";
import { useTaxCatalog } from "./hooks/useTaxCatalog";
import { buildBatchItemMap } from "./view";
import type { ContentToolTabProps } from "../shell/types";

export type TaxTabProps = ContentToolTabProps;

export function TaxTab({
  apiClient,
  onStatusText,
  onShowToast,
  onDebugLog
}: TaxTabProps): React.JSX.Element {
  const catalog = useTaxCatalog({ apiClient, onStatusText });
  const batchSession = useTaxBatchSession({
    apiClient,
    onStatusText,
    onShowToast,
    onDebugLog,
    applyVisibleItemsPatch: catalog.applyVisibleItemsPatch,
    reloadCurrentPage: catalog.reloadCurrentPage
  });
  const initializeCatalog = catalog.initialize;
  const initializeBatchSession = batchSession.initialize;

  useEffect(() => {
    if (!apiClient) {
      return;
    }

    let mounted = true;

    const setup = async () => {
      await initializeBatchSession();
      if (!mounted) {
        return;
      }

      await initializeCatalog();
      if (!mounted) {
        return;
      }

      onStatusText("Ready.");
    };

    void setup();

    return () => {
      mounted = false;
    };
  }, [apiClient, initializeBatchSession, initializeCatalog, onStatusText]);

  const batchMap = useMemo(
    () => buildBatchItemMap(batchSession.batchState),
    [batchSession.batchState]
  );

  return (
    <>
      <TaxBatchToolbar
        progress={batchSession.progress}
        batchState={batchSession.batchState}
        hasOngoingBatch={batchSession.hasOngoingBatch}
        canStart={catalog.selectedItems.length > 0 && Boolean(catalog.selectedTax)}
        onStartBatch={() =>
          void batchSession.startBatch({
            items: catalog.selectedItems,
            tax: catalog.selectedTax,
            page: catalog.page,
            limit: catalog.pageLimit,
            categoryId: catalog.selectedCategoryId
          })
        }
        onTogglePauseResume={() => void batchSession.togglePauseResume()}
        onDiscardBatch={() => void batchSession.discardBatch()}
      />

      <div className="spx-card spx-tax-layout">
        <div className="spx-tax-table-section">
          <div className="spx-tax-table-header">
            <h3 className="spx-tax-title">
              Items
              <span className="spx-tax-selected-count">
                (Selected: {catalog.selectedItems.length})
              </span>
            </h3>
            <TaxFilters
              selectedCategoryId={catalog.selectedCategoryId}
              categoryOptions={catalog.categoryOptions}
              selectedTaxCode={catalog.selectedTaxCode}
              vatPitCategories={catalog.vatPitCategories}
              isLoadingCatalogs={catalog.isLoadingCatalogs}
              isLoadingItems={catalog.isLoadingItems}
              onChangeCategory={(value) => {
                void catalog.changeCategory(value);
              }}
              onChangeTaxCode={catalog.setSelectedTaxCode}
              onRefreshCatalogs={() => {
                void catalog.refreshCatalogs();
              }}
              onRefreshTable={() => {
                void catalog.refreshItems();
              }}
            />
          </div>

          <TaxItemsTable
            items={catalog.items}
            page={catalog.page}
            pageLimit={catalog.pageLimit}
            totalPages={catalog.totalPages}
            selectedIds={catalog.selectedIds}
            batchMap={batchMap}
            pageAllSelected={catalog.pageAllSelected}
            isLoadingItems={catalog.isLoadingItems}
            onToggleSelect={catalog.toggleSelect}
            onToggleSelectPage={catalog.toggleSelectPage}
            onPrevPage={() => {
              void catalog.goPrevPage();
            }}
            onNextPage={() => {
              void catalog.goNextPage();
            }}
          />
        </div>
      </div>
    </>
  );
}
