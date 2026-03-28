# Content Architecture

## Purpose
Document the canonical content-side module boundaries after wrapper cleanup, so the source of truth is easy to find without following compatibility files.

## Ownership Map
- `src/content/index.tsx`: minimal bootstrap entrypoint.
- `src/content/shell/`: content shell, auth/bootstrap, runtime messaging, toast queue, and tab registry.
- `src/content/ui/`: shared content-side UI primitives and shared stylesheet.
- `src/content/tax/`: tax feature UI, runner, state machine, tests, and local styles.
- `src/content/modify-set/`: modify-set feature UI, runner, reducer, tests, and local styles.
- `src/content/site.api.client.ts`: shared content-side API boundary.
- `src/content/api-error.ts`: content-side operator-facing API error formatting.

## Canonical Entrypoints
- content app bootstrap: `src/content/index.tsx`
- shell mount: `src/content/shell/index.ts`
- tax feature: `src/content/tax/index.ts`
- modify-set feature: `src/content/modify-set/index.ts`
- shared UI: `src/content/ui/styles.css`, `src/content/ui/CustomSelect.tsx`, `src/content/ui/icons.tsx`

## Canonical Import Replacements
- `src/content/tax.tab.tsx` -> `src/content/tax/index.ts`
- `src/content/modify-set.tab.tsx` -> `src/content/modify-set/index.ts`
- `src/content/batch.runner.ts` -> `src/content/tax/runner.ts`
- `src/content/batch.runner.state.ts` -> `src/content/tax/runner.state.ts`
- `src/content/batch.types.ts` -> `src/content/tax/types.ts`
- `src/content/item.transformer.ts` -> `src/content/tax/item-transformer.ts`
- `src/content/modify-set.normalize.ts` -> `src/content/modify-set/normalize.ts`
- `src/content/modify-set.parser.ts` -> `src/content/modify-set/parser.ts`
- `src/content/modify-set.runner.ts` -> `src/content/modify-set/runner.ts`
- `src/content/modify-set.types.ts` -> `src/content/modify-set/types.ts`
- `src/content/modify-set.validator.ts` -> `src/content/modify-set/validator.ts`
- `src/content/custom-select.tsx` -> `src/content/ui/CustomSelect.tsx`
- `src/content/icons.tsx` -> `src/content/ui/icons.tsx`
- `src/content/styles.css` -> `src/content/ui/styles.css`, `src/content/shell/styles.css`, or `src/content/tax/styles.css` depending on ownership
- `src/content/retry-policy.ts` -> `@shared/http/retry`

## Style Ownership Matrix
- `src/content/ui/styles.css`
  - shared variables
  - shared buttons, inputs, selects, tables, pagination, row status, progress primitives
- `src/content/shell/styles.css`
  - launcher, overlay, shell header, shell tabs, shell toasts
- `src/content/tax/styles.css`
  - tax-local layout wrappers and tax-only responsive table behavior
- `src/content/modify-set/styles.css`
  - modify-set local layout, cards, sheet, picker modal, preview modal

## Files Intentionally Kept Top-Level
- `src/content/index.tsx`: external content entrypoint
- `src/content/site.api.client.ts`: shared content-side API client
- `src/content/api-error.ts`: content-side operator-facing error formatting

## Easy To Break
- `src/content/ui/styles.css` must load before shell-local and feature-local styles.
- Shell tab order and default tab live in `src/content/shell/tabs.ts`.
- Tax runner/state semantics are part of resumable batch behavior and are already test-locked.
- Modify-set reducer and runner sequencing drive user-visible statuses and retries.
- Do not reintroduce top-level wrapper files unless there is a real external compatibility need.

## Quick Path Guide
- change shell tabs or bootstrap: `src/content/shell/`
- change shared buttons/select/table styles: `src/content/ui/styles.css`
- change tax batch flow: `src/content/tax/`
- change modify-set editor/create-map flow: `src/content/modify-set/`
- change content-side HTTP calls: `src/content/site.api.client.ts`
- change operator-facing error formatting: `src/content/api-error.ts`
