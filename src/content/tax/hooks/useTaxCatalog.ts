import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@shared/types/sapo.types";
import { asCategoryOptions, toTaxSelection } from "../../site.api.client";
import type { SiteApiClient, VatPitCategory } from "../../site.api.client";
import type { BatchRunState, SelectableItem, TaxSelection } from "../types";
import {
  applySuccessfulTaxUpdatesToVisibleItems,
  deriveSelectedItems,
  isCurrentPageFullySelected,
  resolveDefaultTaxCode,
  toUnknownErrorMessage
} from "../view";

const PAGE_LIMIT = 50;

type CategoryOption = { value: string; label: string };

interface UseTaxCatalogOptions {
  apiClient: SiteApiClient | null;
  onStatusText: (text: string) => void;
}

interface UseTaxCatalogResult {
  items: Item[];
  itemTotal: number;
  page: number;
  pageLimit: number;
  totalPages: number;
  selectedCategoryId: string;
  categoryOptions: CategoryOption[];
  vatPitCategories: VatPitCategory[];
  selectedTaxCode: string;
  selectedTax: TaxSelection | null;
  selectedIds: Set<string>;
  selectedItems: SelectableItem[];
  pageAllSelected: boolean;
  isLoadingItems: boolean;
  isLoadingCatalogs: boolean;
  initialize: () => Promise<void>;
  setSelectedTaxCode: (value: string) => void;
  refreshItems: () => Promise<void>;
  changeCategory: (value: string) => Promise<void>;
  goPrevPage: () => Promise<void>;
  goNextPage: () => Promise<void>;
  toggleSelect: (clientId: string) => void;
  toggleSelectPage: () => void;
  reloadCurrentPage: () => Promise<void>;
  refreshCatalogs: () => Promise<void>;
  applyVisibleItemsPatch: (state: BatchRunState | null) => void;
}

export function useTaxCatalog({
  apiClient,
  onStatusText
}: UseTaxCatalogOptions): UseTaxCatalogResult {
  const [items, setItems] = useState<Item[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [vatPitCategories, setVatPitCategories] = useState<VatPitCategory[]>([]);
  const [selectedTaxCode, setSelectedTaxCodeState] = useState("");
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);

  const pageRef = useRef(page);
  const selectedCategoryIdRef = useRef(selectedCategoryId);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    selectedCategoryIdRef.current = selectedCategoryId;
  }, [selectedCategoryId]);

  const loadItemsPage = useCallback(
    async (nextPage: number, categoryId: string): Promise<void> => {
      if (!apiClient) {
        return;
      }

      setIsLoadingItems(true);
      onStatusText("Loading table data...");

      try {
        const response = await apiClient.getItems(nextPage, PAGE_LIMIT, categoryId || undefined);
        setItems(response.items);
        setItemTotal(response.metadata.total);
        setSelectedIds(new Set());
        onStatusText(`Loaded ${response.items.length} item(s) from page ${nextPage}.`);
      } catch (error: unknown) {
        onStatusText(`Load items failed: ${toUnknownErrorMessage(error)}`);
      } finally {
        setIsLoadingItems(false);
      }
    },
    [apiClient, onStatusText]
  );

  const loadCatalogs = useCallback(async (): Promise<void> => {
    if (!apiClient) {
      return;
    }

    onStatusText("Loading categories and tax catalog...");

    const [nextVatPitCategories, categoriesResponse] = await Promise.all([
      apiClient.getVatPitCategories(),
      apiClient.getCategories(1, 250, "")
    ]);

    setVatPitCategories(nextVatPitCategories);
    setCategoryOptions(asCategoryOptions(categoriesResponse.categories));

    if (nextVatPitCategories.length > 0) {
      setSelectedTaxCodeState((current) => resolveDefaultTaxCode(nextVatPitCategories, current));
    }
  }, [apiClient, onStatusText]);

  const initialize = useCallback(async (): Promise<void> => {
    if (!apiClient) {
      return;
    }

    await loadCatalogs();
    await loadItemsPage(pageRef.current, selectedCategoryIdRef.current);
  }, [apiClient, loadCatalogs, loadItemsPage]);

  const totalPages = useMemo(() => {
    if (itemTotal <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(itemTotal / PAGE_LIMIT));
  }, [itemTotal]);

  const selectedItems = useMemo(
    () => deriveSelectedItems(items, selectedIds),
    [items, selectedIds]
  );

  const pageAllSelected = useMemo(
    () => isCurrentPageFullySelected(items, selectedIds),
    [items, selectedIds]
  );

  const selectedTax = useMemo<TaxSelection | null>(() => {
    const found = vatPitCategories.find((category) => category.code === selectedTaxCode);
    return found ? toTaxSelection(found) : null;
  }, [selectedTaxCode, vatPitCategories]);

  const refreshItems = useCallback(async (): Promise<void> => {
    await loadItemsPage(pageRef.current, selectedCategoryIdRef.current);
  }, [loadItemsPage]);

  const reloadCurrentPage = refreshItems;

  const changeCategory = useCallback(
    async (value: string): Promise<void> => {
      setSelectedCategoryId(value);
      setPage(1);
      await loadItemsPage(1, value);
    },
    [loadItemsPage]
  );

  const goPrevPage = useCallback(async (): Promise<void> => {
    const nextPage = Math.max(1, page - 1);
    if (nextPage === page) {
      return;
    }

    setPage(nextPage);
    await loadItemsPage(nextPage, selectedCategoryId);
  }, [loadItemsPage, page, selectedCategoryId]);

  const goNextPage = useCallback(async (): Promise<void> => {
    const nextPage = Math.min(totalPages, page + 1);
    if (nextPage === page) {
      return;
    }

    setPage(nextPage);
    await loadItemsPage(nextPage, selectedCategoryId);
  }, [loadItemsPage, page, selectedCategoryId, totalPages]);

  const toggleSelect = useCallback((clientId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }, []);

  const toggleSelectPage = useCallback(() => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      const itemIds = items.map((item) => item.client_id);
      const allSelected = itemIds.every((clientId) => next.has(clientId));

      if (allSelected) {
        for (const clientId of itemIds) {
          next.delete(clientId);
        }
      } else {
        for (const clientId of itemIds) {
          next.add(clientId);
        }
      }

      return next;
    });
  }, [items]);

  const refreshCatalogs = useCallback(async (): Promise<void> => {
    if (!apiClient) {
      return;
    }

    setIsLoadingCatalogs(true);
    try {
      await loadCatalogs();
      onStatusText("Catalogs refreshed.");
    } finally {
      setIsLoadingCatalogs(false);
    }
  }, [apiClient, loadCatalogs, onStatusText]);

  const applyVisibleItemsPatch = useCallback((state: BatchRunState | null) => {
    setItems((previousItems) => applySuccessfulTaxUpdatesToVisibleItems(previousItems, state));
  }, []);

  return {
    items,
    itemTotal,
    page,
    pageLimit: PAGE_LIMIT,
    totalPages,
    selectedCategoryId,
    categoryOptions,
    vatPitCategories,
    selectedTaxCode,
    selectedTax,
    selectedIds,
    selectedItems,
    pageAllSelected,
    isLoadingItems,
    isLoadingCatalogs,
    initialize,
    setSelectedTaxCode: setSelectedTaxCodeState,
    refreshItems,
    changeCategory,
    goPrevPage,
    goNextPage,
    toggleSelect,
    toggleSelectPage,
    reloadCurrentPage,
    refreshCatalogs,
    applyVisibleItemsPatch
  };
}
