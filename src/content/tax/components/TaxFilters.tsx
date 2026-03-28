import React from "react";
import { CustomSelect } from "../../ui/CustomSelect";
import type { VatPitCategory } from "../../site.api.client";

type CategoryOption = { value: string; label: string };

interface TaxFiltersProps {
  selectedCategoryId: string;
  categoryOptions: CategoryOption[];
  selectedTaxCode: string;
  vatPitCategories: VatPitCategory[];
  isLoadingCatalogs: boolean;
  isLoadingItems: boolean;
  onChangeCategory: (value: string) => void;
  onChangeTaxCode: (value: string) => void;
  onRefreshCatalogs: () => void;
  onRefreshTable: () => void;
}

export function TaxFilters({
  selectedCategoryId,
  categoryOptions,
  selectedTaxCode,
  vatPitCategories,
  isLoadingCatalogs,
  isLoadingItems,
  onChangeCategory,
  onChangeTaxCode,
  onRefreshCatalogs,
  onRefreshTable
}: TaxFiltersProps): React.JSX.Element {
  return (
    <div className="spx-tax-filters">
      <CustomSelect
        value={selectedCategoryId}
        onChange={onChangeCategory}
        placeholder="All categories"
        options={[
          { value: "", label: "All categories" },
          ...categoryOptions.map((option) => ({ value: option.value, label: option.label }))
        ]}
      />

      <CustomSelect
        value={selectedTaxCode}
        onChange={onChangeTaxCode}
        placeholder="Select Tax info"
        options={vatPitCategories.map((tax) => ({
          value: tax.code,
          label: `${tax.code} - ${tax.name}`,
          title: `${tax.code} - ${tax.name}`
        }))}
      />

      <button className="spx-tool-btn" onClick={onRefreshCatalogs} disabled={isLoadingCatalogs}>
        {isLoadingCatalogs ? "Refreshing..." : "Refresh Catalogs"}
      </button>
      <button className="spx-tool-btn" onClick={onRefreshTable} disabled={isLoadingItems}>
        {isLoadingItems ? "Loading..." : "Refresh Table"}
      </button>
    </div>
  );
}
