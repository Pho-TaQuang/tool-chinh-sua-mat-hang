export interface ModifySetOptionPayload {
  client_id: string;
  default_selected: boolean;
  mod_ingredients: unknown[];
  name: string;
  order_number: number;
  price: number | "";
  cost: number | "";
}

export interface ModifySetPayload {
  allow_multiple_quantity: boolean;
  client_id: string;
  max_quantity: number;
  min_quantity: number;
  mod_options: ModifySetOptionPayload[];
  name: string;
  stock_type: "nottrack" | string;
}

export interface ModifySetCreateRequest {
  modify_set: ModifySetPayload;
}

export interface ModifySetResponseOption {
  client_id: string;
  name: string;
  price: number | null;
  cost: number | null;
  default_selected: boolean;
  order_number: number;
  cost_setting?: boolean;
  [key: string]: unknown;
}

export interface ModifySetResponse {
  client_id: string;
  max_quantity: number;
  min_quantity: number;
  name: string;
  stock_type: string;
  allow_multiple_quantity: boolean;
  count_items?: number;
  mod_options: ModifySetResponseOption[];
  [key: string]: unknown;
}

export interface ModifySetCreateResponse {
  modify_set: ModifySetResponse;
}

export interface ModifySetListResponse {
  metadata: {
    total: number;
    page: number;
    version?: number;
    limit: number;
  };
  mod_sets: ModifySetResponse[];
}

export interface ModifySetMappingResult {
  modSetId: string;
  itemIds: string[];
  status: "pending" | "success" | "failed";
  message?: string;
}

export interface ModifySetMappingResponse {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
}
