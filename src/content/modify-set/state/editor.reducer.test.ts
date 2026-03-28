import { describe, expect, it } from "vitest";
import { createRow } from "../defaults";
import type { ModifySetCardModel } from "../types";
import {
  createInitialModifySetEditorState,
  modifySetEditorReducer,
  validateAllSets
} from "./editor.reducer";

function getBaseSet(overrides?: Partial<ModifySetCardModel>): ModifySetCardModel {
  const state = createInitialModifySetEditorState();
  return {
    ...state.sets[0]!,
    name: "Set 1",
    rows: [
      {
        rowId: "row-1",
        name: "Option A",
        priceInput: "1000",
        costInput: "",
        defaultSelected: false
      },
      {
        rowId: "row-empty",
        name: "",
        priceInput: "",
        costInput: "",
        defaultSelected: false
      }
    ],
    mappingItems: [{ clientId: "item-1", name: "Item 1" }],
    validationErrors: {
      setErrors: [],
      rowErrors: [],
      validRowCount: 1,
      hasError: false
    },
    ...overrides
  };
}

describe("modifySetEditorReducer", () => {
  it("keeps a trailing empty row and auto-adjusts max quantity on user edits when max was not manually edited", () => {
    const initial = createInitialModifySetEditorState();
    const nextSet = {
      ...getBaseSet(),
      rows: [
        {
          rowId: "row-1",
          name: "Option A",
          priceInput: "1000",
          costInput: "",
          defaultSelected: false
        }
      ],
      maxQuantity: 9,
      isMaxQuantityEdited: false
    };

    const nextState = modifySetEditorReducer(initial, {
      type: "commit_set",
      localId: initial.sets[0]!.localId,
      nextSet: {
        ...nextSet,
        localId: initial.sets[0]!.localId
      },
      userEdit: true
    });

    expect(nextState.sets[0]?.rows).toHaveLength(2);
    expect(nextState.sets[0]?.maxQuantity).toBe(1);
    expect(nextState.sets[0]?.status).toBe("validated");
  });

  it("clears apiClientId and stale errors on real user edits", () => {
    const initial = createInitialModifySetEditorState();
    const current = {
      ...getBaseSet({
        localId: initial.sets[0]!.localId,
        status: "created",
        apiClientId: "ms-1",
        createError: "old create error",
        mappingError: "old mapping error"
      })
    };

    const nextState = modifySetEditorReducer(
      {
        ...initial,
        sets: [current]
      },
      {
        type: "commit_set",
        localId: current.localId,
        nextSet: {
          ...current,
          name: "Updated name"
        },
        userEdit: true
      }
    );

    expect(nextState.sets[0]).toMatchObject({
      apiClientId: null,
      createError: null,
      mappingError: null,
      status: "validated"
    });
  });

  it("imports preview rows starting at the requested row index", () => {
    const initial = createInitialModifySetEditorState();
    const set = {
      ...getBaseSet({ localId: initial.sets[0]!.localId }),
      rows: [createRow(), createRow(), createRow()]
    };

    const opened = modifySetEditorReducer(
      {
        ...initial,
        sets: [set]
      },
      {
        type: "open_preview",
        preview: {
          setLocalId: set.localId,
          startRow: 1,
          preview: {
            rows: [
              { lineNumber: 1, name: "A", priceInput: "1000", costInput: "", errors: [] },
              { lineNumber: 2, name: "B", priceInput: "2000", costInput: "300", errors: [] }
            ],
            totalRows: 2,
            validRows: 2,
            invalidRows: 0
          }
        }
      }
    );

    const imported = modifySetEditorReducer(opened, { type: "import_preview" });

    expect(imported.sets[0]?.rows[1]).toMatchObject({ name: "A", priceInput: "1000" });
    expect(imported.sets[0]?.rows[2]).toMatchObject({ name: "B", priceInput: "2000", costInput: "300" });
    expect(imported.pendingPreview).toBeNull();
  });

  it("confirming picker selection recomputes status based on validation and existing client id", () => {
    const initial = createInitialModifySetEditorState();
    const set = getBaseSet({
      localId: initial.sets[0]!.localId,
      apiClientId: "ms-1",
      status: "mapped"
    });

    const opened = modifySetEditorReducer(
      {
        ...initial,
        sets: [set]
      },
      {
        type: "open_picker",
        localId: set.localId,
        items: set.mappingItems
      }
    );

    const nextSelection = new Map(opened.pickerSelectedItemsMap);
    nextSelection.set("item-2", { clientId: "item-2", name: "Item 2" });

    const updated = modifySetEditorReducer(opened, {
      type: "set_picker_selection_map",
      selectionMap: nextSelection
    });
    const confirmed = modifySetEditorReducer(updated, { type: "confirm_picker" });

    expect(confirmed.sets[0]).toMatchObject({
      status: "created",
      createError: null,
      mappingError: null
    });
    expect(confirmed.sets[0]?.mappingItems).toHaveLength(2);
    expect(confirmed.pickerTargetSetId).toBeNull();
  });
});

describe("validateAllSets", () => {
  it("preserves mapped status only for already mapped and valid sets", () => {
    const mappedSet = getBaseSet({ status: "mapped" });
    const validated = validateAllSets([mappedSet]);
    const invalid = validateAllSets([{ ...mappedSet, mappingItems: [] }]);

    expect(validated.nextSets[0]?.status).toBe("mapped");
    expect(invalid.nextSets[0]?.status).toBe("draft");
  });
});
