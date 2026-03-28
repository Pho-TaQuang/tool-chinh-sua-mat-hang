import { describe, expect, it } from "vitest";
import type { BatchRunState } from "./types";
import {
  createBatchRunState,
  finalizeCompletedBatchState,
  finishBatchPostCheck,
  incrementBatchPostCheck,
  markBatchItemFinished,
  markBatchItemRetryScheduled,
  markBatchItemStarted,
  restoreBatchRunState,
  startBatchPostCheck
} from "./runner.state";

function createState(now = 1_000): BatchRunState {
  return createBatchRunState(
    {
      batchId: "batch-1",
      items: [
        { clientId: "item-1", name: "Item 1" },
        { clientId: "item-2", name: "Item 2" }
      ],
      tax: { code: "305", name: "Food Service" },
      page: 1,
      limit: 50,
      categoryId: null
    },
    now
  );
}

describe("batch.runner.state", () => {
  it("restores processing items as pending, drops success, and pauses the batch", () => {
    const saved: BatchRunState = {
      ...createState(100),
      isPaused: false,
      items: [
        {
          clientId: "processing-item",
          name: "Processing Item",
          status: "processing",
          attempts: 2,
          verifyStatus: "not_checked",
          updatedAt: 100
        },
        {
          clientId: "success-item",
          name: "Success Item",
          status: "success",
          attempts: 1,
          verifyStatus: "ok",
          updatedAt: 100
        },
        {
          clientId: "failed-item",
          name: "Failed Item",
          status: "failed",
          attempts: 1,
          verifyStatus: "error",
          updatedAt: 100
        }
      ],
      postCheck: {
        running: true,
        total: 3,
        checked: 1,
        ok: 1,
        mismatch: 0,
        error: 0,
        updatedAt: 100
      }
    };

    const restored = restoreBatchRunState(saved, 500);

    expect(restored).toMatchObject({
      isPaused: true,
      updatedAt: 500,
      postCheck: {
        running: false,
        updatedAt: 500
      }
    });
    expect(restored?.items).toHaveLength(2);
    expect(restored?.items[0]).toMatchObject({
      clientId: "processing-item",
      status: "pending",
      updatedAt: 500
    });
    expect(restored?.items[1]).toMatchObject({
      clientId: "failed-item",
      status: "failed",
      updatedAt: 500
    });
  });

  it("returns null when restore only contains success items", () => {
    const saved: BatchRunState = {
      ...createState(100),
      items: [
        {
          clientId: "success-item",
          name: "Success Item",
          status: "success",
          attempts: 1,
          verifyStatus: "ok",
          updatedAt: 100
        }
      ]
    };

    expect(restoreBatchRunState(saved, 500)).toBeNull();
  });

  it("tracks attempt state transitions and clears verification metadata on success", () => {
    const started = markBatchItemStarted(createState(100), "item-1", 200);
    const retried = markBatchItemRetryScheduled(
      started,
      "item-1",
      {
        status: 429,
        code: "HTTP_429",
        message: "throttle",
        retryable: true
      },
      2,
      300
    );
    const succeeded = markBatchItemFinished(retried, "item-1", "success", 400);

    expect(started.items[0]).toMatchObject({
      status: "processing",
      attempts: 1,
      updatedAt: 200
    });
    expect(retried.items[0]).toMatchObject({
      status: "processing",
      attempts: 2,
      lastError: {
        code: "HTTP_429"
      },
      updatedAt: 300
    });
    expect(succeeded.items[0]).toMatchObject({
      status: "success",
      attempts: 2,
      verifyStatus: "not_checked",
      updatedAt: 400
    });
    expect(succeeded.items[0]?.lastError).toBeUndefined();
    expect(succeeded.items[0]?.verifyMessage).toBeUndefined();
    expect(succeeded.items[0]?.lastVerifiedAt).toBeUndefined();
  });

  it("finalizes completed state by pruning success and pausing the remaining items", () => {
    const base = createState(100);
    const withResults: BatchRunState = {
      ...base,
      isPaused: false,
      items: [
        { ...base.items[0]!, status: "success", attempts: 1, updatedAt: 100 },
        { ...base.items[1]!, status: "failed", attempts: 2, updatedAt: 100 }
      ]
    };

    const finalized = finalizeCompletedBatchState(withResults, 500);

    expect(finalized).toMatchObject({
      isPaused: true,
      updatedAt: 500
    });
    expect(finalized?.items).toHaveLength(1);
    expect(finalized?.items[0]).toMatchObject({
      clientId: "item-2",
      status: "failed"
    });
  });

  it("returns null when every completed item succeeded and closes post-check cleanly", () => {
    const base = createState(100);
    const successOnly: BatchRunState = {
      ...base,
      items: base.items.map((item) => ({ ...item, status: "success", attempts: 1 }))
    };
    const startedPostCheck = startBatchPostCheck(successOnly, 2, 200);
    const incremented = incrementBatchPostCheck(startedPostCheck, "ok", 300);
    const finished = finishBatchPostCheck(incremented, 400);

    expect(finished.postCheck).toMatchObject({
      running: false,
      checked: 1,
      ok: 1,
      updatedAt: 400
    });
    expect(finalizeCompletedBatchState(finished, 500)).toBeNull();
  });
});
