export const SHELL_REOPEN_GUARD_MS = 250;

export interface ShellVisibilityState {
  isOpen: boolean;
  reopenBlockedUntil: number;
}

export function createInitialShellVisibilityState(): ShellVisibilityState {
  return {
    isOpen: false,
    reopenBlockedUntil: 0
  };
}

export function isShellReopenBlocked(state: ShellVisibilityState, now: number): boolean {
  return now < state.reopenBlockedUntil;
}

export function requestShellOpen(
  state: ShellVisibilityState,
  now: number
): ShellVisibilityState {
  if (state.isOpen || isShellReopenBlocked(state, now)) {
    return state;
  }

  return {
    ...state,
    isOpen: true
  };
}

export function requestShellClose(
  state: ShellVisibilityState,
  now: number
): ShellVisibilityState {
  if (!state.isOpen) {
    return state;
  }

  return {
    isOpen: false,
    reopenBlockedUntil: now + SHELL_REOPEN_GUARD_MS
  };
}
