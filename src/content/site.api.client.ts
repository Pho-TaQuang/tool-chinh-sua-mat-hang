import type {
  ApiError,
  Category,
  CategoryListResponse,
  Item,
  ItemDetailResponse,
  ItemListResponse,
  UpdateItemResponse
} from "@shared/types/sapo.types";
import type {
  ModifySetCreateRequest,
  ModifySetCreateResponse,
  ModifySetMappingResponse
} from "@shared/types/modify-set.types";
import { createApiError } from "@shared/http/api-error";
import { parseResponseBody } from "@shared/http/response";
import { parseRetryAfterToMs } from "@shared/http/retry";
import { buildSapoAuthHeaders } from "@shared/sapo/auth-headers";
import type { TaxSelection } from "./tax/types";

export interface SiteAuthContext {
  csrfToken: string | null;
  fnbToken: string | null;
  merchantId: string | null;
  storeId: string | null;
  shopOrigin: string;
}

export interface VatPitCategory {
  code: string;
  name: string;
  depth: number;
  path: string;
  status: string;
  vat_rate?: number;
  pit_rate?: number;
  parent_code?: string | null;
  has_children?: boolean;
}

interface VatPitCategoriesResponse {
  vat_pit_categories: VatPitCategory[];
}

export class SiteApiClient {
  private readonly getContext: () => SiteAuthContext;

  constructor(getContext: () => SiteAuthContext) {
    this.getContext = getContext;
  }

  async getVatPitCategories(): Promise<VatPitCategory[]> {
    const response = await this.request<VatPitCategoriesResponse>({
      method: "GET",
      path: "/admin/vat_pit_categories.json"
    });
    return response.vat_pit_categories;
  }

  async getCategories(page: number, limit: number, name = ""): Promise<CategoryListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      name
    });
    return this.request<CategoryListResponse>({
      method: "GET",
      path: `/admin/categories.json?${params.toString()}`
    });
  }

  async getItems(page: number, limit: number, categoryId?: string, name?: string): Promise<ItemListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    });
    if (categoryId) {
      params.set("category_id", categoryId);
    }
    if (name && name.trim()) {
      params.set("name", name.trim());
    }

    return this.request<ItemListResponse>({
      method: "GET",
      path: `/admin/items.json?${params.toString()}`
    });
  }

  async getItemDetail(clientId: string): Promise<ItemDetailResponse> {
    return this.request<ItemDetailResponse>({
      method: "GET",
      path: `/admin/items/${encodeURIComponent(clientId)}.json`
    });
  }

  async updateItem(clientId: string, item: Item): Promise<UpdateItemResponse> {
    return this.request<UpdateItemResponse>({
      method: "PUT",
      path: `/admin/items/${encodeURIComponent(clientId)}.json`,
      body: JSON.stringify({ item })
    });
  }

  async createModifySet(payload: ModifySetCreateRequest): Promise<ModifySetCreateResponse> {
    return this.request<ModifySetCreateResponse>({
      method: "POST",
      path: "/admin/modify_sets.json",
      body: JSON.stringify(payload)
    });
  }

  async mapModifySetToItems(modSetId: string, itemIds: string[]): Promise<ModifySetMappingResponse | unknown> {
    const params = new URLSearchParams({
      modSetId,
      itemIds: itemIds.join(",")
    });

    return this.request<ModifySetMappingResponse | unknown>({
      method: "POST",
      path: `/admin/items/modify_set_mapping.json?${params.toString()}`
    });
  }

  async request<T>(input: { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string; body?: string }): Promise<T> {
    const context = this.getContext();
    const url = new URL(input.path, context.shopOrigin);
    const headers = buildSapoAuthHeaders(context, Boolean(input.body));

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: input.method,
        headers,
        credentials: "include",
        ...(input.body ? { body: input.body } : {})
      });
    } catch (error: unknown) {
      throw createApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: "Network failure or timeout while calling Sapo API.",
        retryable: true,
        details: error
      });
    }

    const parsedBody = await parseResponseBody(response);
    if (response.ok) {
      return parsedBody as T;
    }

    const retryAfterMs = parseRetryAfterToMs(response.headers.get("Retry-After"), Date.now());
    throw createApiError({
      status: response.status,
      code: `HTTP_${response.status}`,
      message: `HTTP ${response.status} while calling ${input.method} ${input.path}`,
      retryable: response.status === 429 || response.status >= 500,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      details: parsedBody
    });
  }
}

export function toTaxSelection(input: VatPitCategory): TaxSelection {
  return {
    code: input.code,
    name: input.name
  };
}

export function asCategoryOptions(categories: Category[]): Array<{ value: string; label: string }> {
  return categories.map((category) => ({
    value: category.client_id,
    label: category.name
  }));
}
