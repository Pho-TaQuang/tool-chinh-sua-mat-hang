import { ModifySetTab } from "../modify-set";
import { TaxTab } from "../tax";
import type { ContentToolTabDefinition } from "./types";

export const CONTENT_TOOL_TABS = [
  {
    id: "tax",
    label: "Batch Tax",
    Component: TaxTab
  },
  {
    id: "modify_set",
    label: "Modify Set",
    Component: ModifySetTab
  }
] satisfies readonly [ContentToolTabDefinition, ...ContentToolTabDefinition[]];

export const DEFAULT_CONTENT_TOOL_TAB_ID = CONTENT_TOOL_TABS[0].id;
