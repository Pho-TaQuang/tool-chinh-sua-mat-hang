import { useEffect, useMemo, useState } from "react";
import type { Item } from "@shared/types/sapo.types";
import { asCategoryOptions, type SiteApiClient } from "../../site.api.client";

const PAGE_LIMIT = 50;

function toMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export interface ModifySetCatalogHandle {
  items: Item[];
  itemTotal: number;
  itemPage: number;
  keywordInput: string;
  keyword: string;
  selectedCategoryId: string;
  categoryOptions: Array<{ value: string; label: string }>;
  isLoadingItems: boolean;
  totalPages: number;
  setKeywordInput: (value: string) => void;
  search: () => Promise<void>;
  changeCategory: (value: string) => Promise<void>;
  refresh: () => Promise<void>;
  goToPrevPage: () => Promise<void>;
  goToNextPage: () => Promise<void>;
}

export function useModifySetCatalog(
  apiClient: SiteApiClient | null,
  onStatusText: (text: string) => void
): ModifySetCatalogHandle {
  const [items, setItems] = useState<Item[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemPage, setItemPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(itemTotal / PAGE_LIMIT)), [itemTotal]);

  const loadItems = async (page: number, categoryId: string, name: string): Promise<void> => {
    if (!apiClient) {
      return;
    }

    setIsLoadingItems(true);
    onStatusText("Loading item search...");
    try {
      const response = await apiClient.getItems(page, PAGE_LIMIT, categoryId || undefined, name || undefined);
      setItems(response.items);
      setItemTotal(response.metadata.total);
      onStatusText(`Loaded ${response.items.length} item(s) for mapping.`);
    } catch (error: unknown) {
      onStatusText(`Load mapping items failed: ${toMessage(error)}`);
    } finally {
      setIsLoadingItems(false);
    }
  };

  useEffect(() => {
    if (!apiClient) {
      return;
    }

    void (async () => {
      try {
        const categories = await apiClient.getCategories(1, 250, "");
        setCategoryOptions(asCategoryOptions(categories.categories));
        await loadItems(1, "", "");
      } catch (error: unknown) {
        onStatusText(`Modify set init failed: ${toMessage(error)}`);
      }
    })();
  }, [apiClient]);

  const search = async (): Promise<void> => {
    const nextKeyword = keywordInput.trim();
    setKeyword(nextKeyword);
    setItemPage(1);
    await loadItems(1, selectedCategoryId, nextKeyword);
  };

  const changeCategory = async (value: string): Promise<void> => {
    setSelectedCategoryId(value);
    setItemPage(1);
    await loadItems(1, value, keyword);
  };

  const refresh = async (): Promise<void> => {
    await loadItems(itemPage, selectedCategoryId, keyword);
  };

  const goToPrevPage = async (): Promise<void> => {
    const nextPage = Math.max(1, itemPage - 1);
    if (nextPage === itemPage) {
      return;
    }

    setItemPage(nextPage);
    await loadItems(nextPage, selectedCategoryId, keyword);
  };

  const goToNextPage = async (): Promise<void> => {
    const nextPage = Math.min(totalPages, itemPage + 1);
    if (nextPage === itemPage) {
      return;
    }

    setItemPage(nextPage);
    await loadItems(nextPage, selectedCategoryId, keyword);
  };

  return {
    items,
    itemTotal,
    itemPage,
    keywordInput,
    keyword,
    selectedCategoryId,
    categoryOptions,
    isLoadingItems,
    totalPages,
    setKeywordInput,
    search,
    changeCategory,
    refresh,
    goToPrevPage,
    goToNextPage
  };
}
