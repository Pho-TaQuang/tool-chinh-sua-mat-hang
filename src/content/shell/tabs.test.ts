import { describe, expect, it } from "vitest";
import { CONTENT_TOOL_TABS, DEFAULT_CONTENT_TOOL_TAB_ID } from "./tabs";

describe("content shell tab registry", () => {
  it("keeps the registry order and default tab id stable", () => {
    expect(CONTENT_TOOL_TABS.map((tab) => tab.id)).toEqual(["tax", "modify_set"]);
    expect(DEFAULT_CONTENT_TOOL_TAB_ID).toBe(CONTENT_TOOL_TABS[0].id);
  });

  it("requires unique tab ids and non-empty labels", () => {
    const ids = CONTENT_TOOL_TABS.map((tab) => tab.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(CONTENT_TOOL_TABS.every((tab) => tab.label.trim().length > 0)).toBe(true);
    expect(CONTENT_TOOL_TABS.every((tab) => Boolean(tab.Component))).toBe(true);
  });
});
