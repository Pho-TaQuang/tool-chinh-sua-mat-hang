# Modify Set

## Purpose
Draft modify sets in the content UI, validate set and option rows locally, create sets through the API, then map each created set to linked items.

## Entrypoints
- `src/content/modify-set/index.ts`: feature export surface.
- `src/content/modify-set/ModifySetTab.tsx`: shell component that composes hooks and presentational pieces.
- `src/content/modify-set/hooks/useModifySetSubmission.ts`: runner lifecycle and submit/retry orchestration.
- `src/content/modify-set/styles.css`: feature-local `.spx-modset-*` styling.

## Main Domain Rules
- A set must pass local validation before create/map can start.
- Create runs before mapping; create failure blocks mapping.
- `mapping_failed` with an existing `apiClientId` retries mapping only.
- User edits clear stale API state so draft data is not mixed with an older create/map result.
- Trailing empty rows are preserved for spreadsheet-like editing.
- `max_quantity` stays aligned with valid row count until the user explicitly edits it.

## Important Dependencies
- `src/content/site.api.client.ts` for category/item loading, modify set creation, and item mapping.
- `src/content/modify-set/validator.ts` for set and row rules.
- `src/content/modify-set/normalize.ts` for payload shaping and valid-row filtering.
- `src/content/modify-set/runner.ts` for sequential create/map execution and retry behavior.
- `src/content/ui/icons.tsx`, `src/content/ui/CustomSelect.tsx`, and `src/content/ui/styles.css` for shared content UI primitives.

## Module Map
- `src/content/modify-set/types.ts`: feature-local UI, parser, and runner-facing types.
- `src/content/modify-set/defaults.ts`: empty set/row builders and trailing-row helpers.
- `src/content/modify-set/grid.ts`: pure helpers for selection, fill, and cell navigation.
- `src/content/modify-set/state/editor.reducer.ts`: core editor transitions.
- `src/content/modify-set/state/editor.selectors.ts`: derived editor state for the shell and hooks.
- `src/content/modify-set/hooks/useModifySetEditor.ts`: reducer wiring and high-level editor commands.
- `src/content/modify-set/hooks/useModifySetCatalog.ts`: picker/category remote query state.
- `src/content/modify-set/components/`: toolbar, card, sheet, linked-items, picker modal, and preview modal.

## Style Ownership
- `src/content/ui/styles.css`: shared buttons, inputs, selects, tables, pagination, row statuses, and progress styles.
- `src/content/modify-set/styles.css`: only feature-local `.spx-modset-*` layout and modal styles.

## Canonical Imports
- `ModifySetTab` from `src/content/modify-set`
- feature modules from `src/content/modify-set/*`
- shared icons from `src/content/ui/icons.tsx`
- shared select from `src/content/ui/CustomSelect.tsx`

## Easy To Break
- Callback order from the runner drives status badges, retry availability, and operator feedback.
- `modSetId` fallback priority must stay: create response, payload client id, existing client id.
- Preview import must stay blocked when parsed rows contain invalid records.
- Keyboard navigation, row-range selection, and drag-fill must match current spreadsheet behavior.
- Shared primitives now live in `src/content/ui/`; feature-local `.spx-modset-*` rules should not drift back into shared UI CSS.
