# Tax

## Purpose
Apply one selected VAT/PIT category to many Sapo F&B items in a controlled, resumable batch.

## Entrypoints
- `src/content/tax/index.ts`: feature export surface.
- `src/content/tax/TaxTab.tsx`: shell component that composes catalog loading, batch lifecycle, and presentational pieces.
- `src/content/tax/runner.ts`: batch execution, persistence, retry, and post-check orchestration.
- `src/content/tax/runner.state.ts`: pure batch state transitions and selectors.
- `src/content/tax/styles.css`: tax-local layout and responsive table wrappers.

## Main Domain Rules
- A batch stores the selected tax plus the source page/filter context used when it was started.
- Restore turns `processing` items back into `pending` and drops `success` items.
- Full-success completion clears persisted batch state entirely.
- Mixed completion prunes `success` items and pauses the remaining failures/skips.
- Only visible selected rows are included when starting a batch.
- A successful visible item is updated optimistically in the current table view.
- Default tax selection prefers code `305`, otherwise the first returned tax code, while preserving the current valid choice.

## Important Dependencies
- `src/content/site.api.client.ts` for categories, VAT/PIT catalog, item detail, and item update APIs.
- `chrome.storage.local` through `BatchRunnerStorage` for resumable state.
- `src/content/api-error.ts` for operator-facing error normalization and formatting.
- `@shared/http/retry` for retry timing.
- `src/content/ui/CustomSelect.tsx` and `src/content/ui/styles.css` for shared UI primitives.

## Module Map
- `src/content/tax/view.ts`: pure UI/domain derivations for progress, selection, row status, optimistic table patching, and default tax choice.
- `src/content/tax/hooks/useTaxCatalog.ts`: item page state, category/tax catalogs, selection state, and loader commands.
- `src/content/tax/hooks/useTaxBatchSession.ts`: runner lifecycle, restore prompt, completion gating, and batch commands.
- `src/content/tax/components/TaxBatchToolbar.tsx`: progress and start/pause/discard actions.
- `src/content/tax/components/TaxFilters.tsx`: category/tax selects and refresh actions.
- `src/content/tax/components/TaxItemsTable.tsx`: table rows, row status, selection, and pagination.

## Style Ownership
- `src/content/ui/styles.css`: shared button, select, table, pagination, row-status, and progress styles.
- `src/content/tax/styles.css`: tax-local layout wrappers and tax-only responsive table behavior.

## Canonical Imports
- `TaxTab` from `src/content/tax`
- `BatchRunner` from `src/content/tax/runner`
- batch types from `src/content/tax/types`
- item transformer from `src/content/tax/item-transformer`

## Easy To Break
- Completion reload must fire once per completion log id, not once per snapshot.
- Completion reload must use the latest page/category values, not stale closure values from startup.
- Page loads clear selection; dropping that behavior changes what the next batch can include.
- Row status labels and tones are derived from both local selection state and batch state.
- Mobile table behavior now lives in `src/content/tax/styles.css`; do not move it back into shared UI styles.
