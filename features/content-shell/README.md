# Content Shell

## Purpose
Bootstrap the content-side app, extract auth context, create the shared API client, host the floating shell UI, and route shared shell props into feature tabs through the tab registry.

## Entrypoints
- `src/content/index.tsx`: thin content bootstrap entrypoint.
- `src/content/shell/index.ts`: shell export surface.
- `src/content/shell/mount.tsx`: idempotent mount for the content shell root.
- `src/content/shell/AppShell.tsx`: shell composition, active-tab rendering, and shell chrome.

## Main Domain Rules
- Default tab stays `tax`, and tab order stays `tax` then `modify_set`.
- Every tab rendered by the shell receives the same `ContentToolTabProps` contract.
- Bootstrap must keep auth extraction precedence unchanged for token, merchant id, and store id.
- Toast fade/remove timing stays `4700ms` and `5000ms`.
- Worker debug-log failures must not break the shell.

## Important Dependencies
- `src/content/site.api.client.ts` for `SiteAuthContext` and `SiteApiClient`.
- `chrome.runtime.sendMessage` for `INIT_CONTEXT` and `DEBUG_LOG`.
- `@shared/utils/request-id` for shell and toast ids.
- `src/content/ui/styles.css` for shared content UI primitives and root variables.
- `src/content/shell/styles.css` for shell-local launcher, dialog, tab, and toast styles.
- Feature entrypoints `src/content/tax/index.ts` and `src/content/modify-set/index.ts`.

## Tab Registry Ownership
- `src/content/shell/tabs.ts` is the single place that decides tab order and default tab id.
- Adding a new tab means implementing `ContentToolTabProps` and adding one registry entry.
- Shell code should not gain feature-specific conditional branches again.

## Bootstrap And Runtime Ownership
- `src/content/shell/auth-context.ts`: auth extraction and token/id normalization.
- `src/content/shell/runtime.ts`: runtime messaging and debug-log transport.
- `src/content/shell/hooks/useShellBootstrap.ts`: one-time bootstrap sequence and API client setup.
- `src/content/shell/hooks/useToastQueue.ts`: toast queue state and timer lifecycle.

## Shell Style Ownership
- `src/content/ui/styles.css`: shared primitives such as cards, buttons, inputs, selects, tables, pagination, row status, and progress styles.
- `src/content/shell/styles.css`: shell-local launcher, overlay, header, tabs, and toast viewport styles.
- Shell-local class names use the `spx-shell-*` prefix.

## Canonical Imports
- `TaxTab` from `src/content/tax`
- `ModifySetTab` from `src/content/modify-set`
- shared tab types from `src/content/shell/types.ts`
- shell mount from `src/content/shell/index.ts`

## Module Map
- `src/content/shell/types.ts`: shared tab props, tab definitions, toast types, and debug logger types.
- `src/content/shell/tabs.ts`: ordered tab registry.
- `src/content/shell/auth-context.ts`: auth extraction helpers.
- `src/content/shell/runtime.ts`: runtime messaging and debug-log transport.
- `src/content/shell/hooks/useShellBootstrap.ts`: bootstrap flow and API client setup.
- `src/content/shell/hooks/useToastQueue.ts`: toast queue state and timer cleanup.
- `src/content/shell/components/TabSwitcher.tsx`: registry-driven tab switcher.
- `src/content/shell/components/ToastViewport.tsx`: shell toast rendering only.

## Easy To Break
- Auth extraction precedence is easy to change accidentally when touching storage and cookie readers.
- `INIT_CONTEXT` must still happen before the shared `SiteApiClient` is used by tabs.
- Toast timing and icon mapping are part of the operator-facing shell behavior.
- Shell layout depends on `ui/styles.css` loading before `shell/styles.css`.
