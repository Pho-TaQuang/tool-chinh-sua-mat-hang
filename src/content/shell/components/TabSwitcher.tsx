import React from "react";
import type { ContentToolTabDefinition } from "../types";

interface TabSwitcherProps {
  activeTabId: string;
  tabs: readonly ContentToolTabDefinition[];
  onSelectTab: (tabId: string) => void;
}

export function TabSwitcher({
  activeTabId,
  tabs,
  onSelectTab
}: TabSwitcherProps): React.JSX.Element {
  return (
    <div className="spx-card spx-shell-tab-switcher">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`spx-shell-tab-btn ${activeTabId === tab.id ? "spx-shell-tab-active" : ""}`}
          onClick={() => onSelectTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
