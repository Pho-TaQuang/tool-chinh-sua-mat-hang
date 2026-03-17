import type {
  ApiError,
  CategoryListResponse,
  ItemDetailResponse,
  ItemListResponse,
  Item,
  UpdateItemResponse
} from "@shared/types/sapo.types";
import type { QueueManager, QueueRequestTask } from "./queue.manager";

export interface SapoContext {
  csrfToken: string | null;
  fnbToken: string | null;
  merchantId: string | null;
  storeId: string | null;
  shopOrigin: string;
}

export interface GetCategoriesParams {
  page: number;
  limit: number;
  name?: string;
}

export interface GetItemsParams {
  page: number;
  limit: number;
  categoryId?: string;
}

export interface SapoApiClientOptions {
  queue: QueueManager;
  baseAdminUrl?: string;
}

export class SapoApiClient {
  private readonly queue: QueueManager;
  private readonly baseAdminUrl: string;

  constructor(options: SapoApiClientOptions) {
    this.queue = options.queue;
    this.baseAdminUrl = options.baseAdminUrl ?? "https://fnb.mysapo.vn/admin";
  }

  async getCategories(context: SapoContext, params: GetCategoriesParams): Promise<CategoryListResponse> {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
      name: params.name ?? ""
    });

    return this.request<CategoryListResponse>(context, {
      method: "GET",
      path: `/categories.json?${query.toString()}`
    });
  }

  async getItems(context: SapoContext, params: GetItemsParams): Promise<ItemListResponse> {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit)
    });
    if (params.categoryId) {
      query.set("category_id", params.categoryId);
    }

    return this.request<ItemListResponse>(context, {
      method: "GET",
      path: `/items.json?${query.toString()}`
    });
  }

  async getItemDetail(context: SapoContext, clientId: string): Promise<ItemDetailResponse> {
    return this.request<ItemDetailResponse>(context, {
      method: "GET",
      path: `/items/${encodeURIComponent(clientId)}.json`
    });
  }

  async updateItem(context: SapoContext, clientId: string, item: Item): Promise<UpdateItemResponse> {
    return this.request<UpdateItemResponse>(context, {
      method: "PUT",
      path: `/items/${encodeURIComponent(clientId)}.json`,
      body: JSON.stringify({ item }),
      requiresAuth: true
    });
  }

  private async request<T>(
    context: SapoContext,
    input: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path: string;
      body?: string;
      requiresAuth?: boolean;
    }
  ): Promise<T> {
    const requiresAuth = input.requiresAuth ?? input.method !== "GET";
    const hasAuthToken = Boolean(context.fnbToken || context.csrfToken);
    if (requiresAuth && !hasAuthToken) {
      throw this.createApiError({
        status: 0,
        code: "MISSING_AUTH_TOKEN",
        message:
          "Không tìm thấy auth token. Hãy mở trang admin Sapo để lấy x-fnb-token hoặc csrf-token rồi thử lại.",
        retryable: false
      });
    }

    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (context.csrfToken) {
      headers["X-CSRF-Token"] = context.csrfToken;
    }
    if (context.fnbToken) {
      headers["x-fnb-token"] = context.fnbToken;
    }
    if (context.merchantId) {
      headers["x-merchant-id"] = context.merchantId;
    }
    if (context.storeId) {
      headers["x-store-id"] = context.storeId;
    }
    if (input.body) {
      headers["Content-Type"] = "application/json";
    }

    const requestTask: QueueRequestTask = {
      method: input.method,
      url: `${this.baseAdminUrl}${input.path}`,
      headers,
      credentials: "include",
      metadata: {
        endpoint: input.path
      },
      ...(input.body ? { body: input.body } : {})
    };

    const enqueued = await this.queue.enqueueRequest(requestTask);
    const response = await enqueued.result;
    return response.body as T;
  }

  private createApiError(input: {
    status: number;
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
    retryAfterMs?: number;
  }): ApiError {
    const error: ApiError = {
      status: input.status,
      code: input.code,
      message: input.message,
      retryable: input.retryable
    };
    if (input.details !== undefined) {
      error.details = input.details;
    }
    if (input.retryAfterMs !== undefined) {
      error.retryAfterMs = input.retryAfterMs;
    }
    return error;
  }
}
