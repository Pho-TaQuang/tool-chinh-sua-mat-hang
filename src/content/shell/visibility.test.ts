import {
  SHELL_REOPEN_GUARD_MS,
  createInitialShellVisibilityState,
  isShellReopenBlocked,
  requestShellClose,
  requestShellOpen
} from "./visibility";

describe("shell visibility guard", () => {
  it("opens from the initial closed state", () => {
    const state = createInitialShellVisibilityState();

    expect(requestShellOpen(state, 100)).toEqual({
      isOpen: true,
      reopenBlockedUntil: 0
    });
  });

  it("blocks immediate reopen after a close", () => {
    const opened = requestShellOpen(createInitialShellVisibilityState(), 100);
    const closed = requestShellClose(opened, 125);

    expect(closed).toEqual({
      isOpen: false,
      reopenBlockedUntil: 125 + SHELL_REOPEN_GUARD_MS
    });
    expect(isShellReopenBlocked(closed, 125 + SHELL_REOPEN_GUARD_MS - 1)).toBe(true);
    expect(requestShellOpen(closed, 125 + SHELL_REOPEN_GUARD_MS - 1)).toBe(closed);
  });

  it("allows reopen once the guard window expires", () => {
    const opened = requestShellOpen(createInitialShellVisibilityState(), 10);
    const closed = requestShellClose(opened, 50);
    const reopened = requestShellOpen(closed, 50 + SHELL_REOPEN_GUARD_MS);

    expect(isShellReopenBlocked(closed, 50 + SHELL_REOPEN_GUARD_MS)).toBe(false);
    expect(reopened).toEqual({
      isOpen: true,
      reopenBlockedUntil: 50 + SHELL_REOPEN_GUARD_MS
    });
  });
});
