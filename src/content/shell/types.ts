import type { ComponentType } from "react";
import type { SiteApiClient } from "../site.api.client";

export type ShellToastType = "success" | "warn" | "error" | "info";

export type ShellDebugLevel = "debug" | "info" | "warn" | "error";

export type ShellDebugLogger = (
  level: ShellDebugLevel,
  message: string,
  details?: unknown
) => Promise<void>;

export interface ContentToolTabProps {
  apiClient: SiteApiClient | null;
  onStatusText: (text: string) => void;
  onShowToast: (message: string, type: ShellToastType) => void;
  onDebugLog?: ShellDebugLogger;
}

export type ContentToolTabComponent = ComponentType<ContentToolTabProps>;

export interface ContentToolTabDefinition {
  id: string;
  label: string;
  Component: ContentToolTabComponent;
}

export interface ShellToastConfig {
  id: string;
  message: string;
  type: ShellToastType;
  fading?: boolean;
}
