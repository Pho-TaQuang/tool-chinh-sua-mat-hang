import { useEffect, useRef, useState } from "react";
import { createRequestId } from "@shared/utils/request-id";
import type { SiteAuthContext } from "../../site.api.client";
import { SiteApiClient } from "../../site.api.client";
import { extractAuthContext } from "../auth-context";
import { logContent, logToService, sendRuntimeMessage } from "../runtime";

export function useShellBootstrap(): {
  apiClient: SiteApiClient | null;
  statusText: string;
  setStatusText: (text: string) => void;
  logToService: typeof logToService;
} {
  const [statusText, setStatusText] = useState("Ready.");
  const [apiClient, setApiClient] = useState<SiteApiClient | null>(null);
  const authRef = useRef<SiteAuthContext>({
    csrfToken: null,
    fnbToken: null,
    merchantId: null,
    storeId: null,
    shopOrigin: window.location.origin
  });

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setStatusText("Initializing...");

      const extracted = extractAuthContext();
      authRef.current = extracted;

      logContent("info", "Extracted auth context.", {
        hasFnbToken: Boolean(extracted.fnbToken),
        merchantId: extracted.merchantId,
        storeId: extracted.storeId,
        hasCsrf: Boolean(extracted.csrfToken)
      });

      await logToService("info", "Extracted auth context.", {
        hasFnbToken: Boolean(extracted.fnbToken),
        merchantId: extracted.merchantId,
        storeId: extracted.storeId,
        hasCsrf: Boolean(extracted.csrfToken)
      });

      await sendRuntimeMessage({
        type: "INIT_CONTEXT",
        requestId: createRequestId("init"),
        timestamp: Date.now(),
        payload: extracted
      });

      if (!mounted) {
        return;
      }

      setApiClient(new SiteApiClient(() => authRef.current));
      setStatusText("Ready.");
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    apiClient,
    statusText,
    setStatusText,
    logToService
  };
}
