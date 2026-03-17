import type { ApiError } from "@shared/types/sapo.types";

export type BatchItemStatus = "pending" | "processing" | "success" | "failed" | "skipped";
export type VerifyStatus = "not_checked" | "checking" | "ok" | "mismatch" | "error";

export interface TaxSelection {
  code: string;
  name: string;
}

export interface BatchItemState {
  clientId: string;
  name: string;
  status: BatchItemStatus;
  attempts: number;
  verifyStatus: VerifyStatus;
  verifyMessage?: string;
  lastVerifiedAt?: number;
  lastError?: ApiError;
  updatedAt: number;
}

export interface BatchStats {
  total: number;
  pending: number;
  processing: number;
  success: number;
  failed: number;
  skipped: number;
}

export interface BatchRunState {
  batchId: string;
  selectedTax: TaxSelection;
  page: number;
  limit: number;
  categoryId: string | null;
  isPaused: boolean;
  createdAt: number;
  updatedAt: number;
  items: BatchItemState[];
  postCheck?: {
    running: boolean;
    total: number;
    checked: number;
    ok: number;
    mismatch: number;
    error: number;
    updatedAt: number;
  };
}

export interface BatchLogEntry {
  id: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
  details?: unknown;
}

export interface SelectableItem {
  clientId: string;
  name: string;
}
