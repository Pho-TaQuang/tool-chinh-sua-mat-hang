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
        costInput: "500",
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

  it("replace_sets clears per-set interaction state", () => {
    const initial = createInitialModifySetEditorState();
    const set = getBaseSet({ localId: initial.sets[0]!.localId });
    const nextSet = getBaseSet({ localId: "next-set", name: "Imported" });
    const opened = modifySetEditorReducer(
      {
        ...initial,
        sets: [set],
        selectedRowsBySetId: { [set.localId]: ["row-1"] },
        rowAnchorsBySetId: { [set.localId]: 0 },
        activeCell: { setLocalId: set.localId, row: 0, col: 0 },
        fillState: { setLocalId: set.localId, fromRow: 0, col: 0, value: "A" }
      },
      {
        type: "open_picker",
        localId: set.localId,
        items: set.mappingItems
      }
    );

    const next = modifySetEditorReducer(opened, { type: "replace_sets", nextSets: [nextSet] });

    expect(next.sets).toEqual([nextSet]);
    expect(next.selectedRowsBySetId).toEqual({});
    expect(next.rowAnchorsBySetId).toEqual({});
    expect(next.activeCell).toBeNull();
    expect(next.fillState).toBeNull();
    expect(next.pickerTargetSetId).toBeNull();
    expect(next.pickerSelectedItemsMap.size).toBe(0);
  });

  it("applies non-overflow paste directly to the current set", () => {
    const initial = createInitialModifySetEditorState();
    const set = {
      ...getBaseSet({ localId: initial.sets[0]!.localId }),
      rows: [
        {
          rowId: "r1",
          name: "Keep Name",
          priceInput: "1000",
          costInput: "700",
          defaultSelected: false
        }
      ]
    };

    const next = modifySetEditorReducer(
      {
        ...initial,
        sets: [set]
      },
      {
        type: "request_paste",
        setLocalId: set.localId,
        startRow: 0,
        startCol: 1,
        clipboardGrid: [["2500"]]
      }
    );

    expect(next.pendingPasteOverflow).toBeNull();
    expect(next.sets[0]?.rows[0]).toMatchObject({
      name: "Keep Name",
      priceInput: "2500",
      costInput: "700"
    });
    expect(next.activeCell).toMatchObject({ setLocalId: set.localId, row: 0, col: 1 });
  });

  it("stores pending overflow paste until user confirms", () => {
    const initial = createInitialModifySetEditorState();
    const set = {
      ...getBaseSet({ localId: initial.sets[0]!.localId }),
      rows: [
        {
          rowId: "r1",
          name: "Keep",
          priceInput: "1000",
          costInput: "200",
          defaultSelected: false
        }
      ]
    };

    const pending = modifySetEditorReducer(
      {
        ...initial,
        sets: [set]
      },
      {
        type: "request_paste",
        setLocalId: set.localId,
        startRow: 0,
        startCol: 1,
        clipboardGrid: [["9000", "300", "EXTRA"]]
      }
    );

    expect(pending.pendingPasteOverflow).not.toBeNull();
    expect(pending.sets[0]?.rows[0]).toMatchObject({
      name: "Keep",
      priceInput: "1000",
      costInput: "200"
    });

    const confirmed = modifySetEditorReducer(pending, { type: "confirm_overflow_paste" });
    expect(confirmed.pendingPasteOverflow).toBeNull();
    expect(confirmed.sets[0]?.rows[0]).toMatchObject({
      name: "Keep",
      priceInput: "9000",
      costInput: "300"
    });
  });

  it("cancels pending overflow paste without changing data", () => {
    const initial = createInitialModifySetEditorState();
    const set = {
      ...getBaseSet({ localId: initial.sets[0]!.localId }),
      rows: [
        {
          rowId: "r1",
          name: "Keep",
          priceInput: "1000",
          costInput: "200",
          defaultSelected: false
        },
        createRow()
      ]
    };

    const pending = modifySetEditorReducer(
      {
        ...initial,
        sets: [set]
      },
      {
        type: "request_paste",
        setLocalId: set.localId,
        startRow: 0,
        startCol: 1,
        clipboardGrid: [["9000", "300", "EXTRA"]]
      }
    );

    const cancelled = modifySetEditorReducer(pending, { type: "cancel_overflow_paste" });

    expect(cancelled.pendingPasteOverflow).toBeNull();
    expect(cancelled.sets[0]?.rows[0]).toMatchObject({
      name: "Keep",
      priceInput: "1000",
      costInput: "200"
    });
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
