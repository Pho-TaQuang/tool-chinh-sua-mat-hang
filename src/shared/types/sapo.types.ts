export interface Metadata {
  total: number;
  page: number;
  limit: number;
  version?: number;
}

export interface Category {
  client_id: string;
  name: string;
  created_on?: number;
  modified_on?: number | null;
  products_count?: number;
}

export interface TaxInfos {
  vat_pit_category_code: string;
  vat_pit_category_name: string;
}

export interface PricingPolicy {
  client_id: string;
  code: string;
  price: number;
  time_block?: number | null;
  time_unit?: string | null;
  time_slot_name?: string | null;
  specific_time?: string | null;
  day_of_week?: string | null;
}

export interface Variant {
  client_id: string;
  name: string;
  title: string;
  price_type: string;
  price: number;
  cost?: number | string | null;
  order_number?: number;
  stock?: number | string | null;
  threshold_low?: number | string | null;
  stock_management?: boolean;
  time_block?: number | null;
  time_unit?: string | null;
  barcode?: string | null;
  cost_setting?: boolean;
  export_price?: number | null;
  code?: string | null;
  pricing_policies?: PricingPolicy[];
  disabled?: boolean;
  item_ingredients?: unknown[];
  init_stock?: string | number | null;
}

export interface SaleChannel {
  channel_code: string;
  available_status: string;
}

export interface ItemCategory {
  client_id: string;
  name: string;
}

export interface Item {
  server_id: number;
  client_id: string;
  name: string;
  description: string;
  item_type: string;
  stock_type: string;
  color: string;
  stamp_print: boolean;
  kitchen_id: string | null;
  sub_kitchen_ids: string[];
  created_on: number;
  modified_on: number;
  barcode_setting: boolean;
  tax: unknown | null;
  time_frame_id: string | null;
  stock_unit: unknown | null;
  category: ItemCategory | null;
  image: unknown | null;
  variants: Variant[];
  mod_sets: unknown[];
  channels: string[];
  sale_channels: SaleChannel[];
  tax_infos: TaxInfos;
  tax_reduction_rate: number | null;
  [key: string]: unknown;
}

export interface CategoryListResponse {
  categories: Category[];
  metadata: Metadata;
}

export interface ItemListResponse {
  items: Item[];
  metadata: Metadata;
}

export interface ItemDetailResponse {
  item: Item;
}

export interface UpdateItemRequest {
  item: Item;
}

export interface UpdateItemResponse {
  item: Item;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
  retryAfterMs?: number;
}
