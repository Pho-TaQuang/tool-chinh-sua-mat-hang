import React, { useState } from "react";
import "../ui/styles.css";
import "./styles.css";
import { CONTENT_TOOL_TABS, DEFAULT_CONTENT_TOOL_TAB_ID } from "./tabs";
import { useShellBootstrap } from "./hooks/useShellBootstrap";
import { useToastQueue } from "./hooks/useToastQueue";
import { TabSwitcher } from "./components/TabSwitcher";
import { ToastViewport } from "./components/ToastViewport";

function resolveActiveTab(tabId: string) {
  return CONTENT_TOOL_TABS.find((tab) => tab.id === tabId) ?? CONTENT_TOOL_TABS[0];
}

export function AppShell(): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState(DEFAULT_CONTENT_TOOL_TAB_ID);
  const { apiClient, statusText, setStatusText, logToService } = useShellBootstrap();
  const { toasts, showToast } = useToastQueue();
  const activeTab = resolveActiveTab(activeTabId);
  const ActiveTabComponent = activeTab.Component;

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          className="spx-shell-launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Open Sapo Batch Tool"
        >
          S
        </button>
      ) : null}

      {isOpen ? (
        <div className="spx-shell-overlay">
          <div className="spx-shell-backdrop" onClick={() => setIsOpen(false)} />
          <div className="spx-shell-container" role="dialog" aria-modal="true" aria-label="Sapo Batch Popup">
            <div className="spx-shell-header">
              <div className="spx-shell-header-left">
                <div className="spx-shell-brand">
                  <div className="spx-shell-logo">S</div>
                  <h2 className="spx-shell-title">Sapo Batch Tool</h2>
                </div>
                <p className="spx-shell-status">{statusText}</p>
              </div>
              <div className="spx-shell-header-actions">
                <button
                  type="button"
                  className="spx-icon-btn spx-danger"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close popup"
                >
                  X
                </button>
              </div>
            </div>

            <div className="spx-shell-main">
              <TabSwitcher
                activeTabId={activeTabId}
                tabs={CONTENT_TOOL_TABS}
                onSelectTab={setActiveTabId}
              />

              <ActiveTabComponent
                apiClient={apiClient}
                onStatusText={setStatusText}
                onShowToast={showToast}
                onDebugLog={logToService}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ToastViewport toasts={toasts} />
    </>
  );
}
