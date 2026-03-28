# Shared UI

## Purpose
Hold shared content-side UI primitives that are reused across shell, tax, and modify-set without hiding feature-specific layout rules.

## Entrypoints
- `src/content/ui/styles.css`: shared content UI stylesheet.
- `src/content/ui/CustomSelect.tsx`: shared searchable select component.
- `src/content/ui/icons.tsx`: shared icon set.

## Shared Primitives
- root design tokens on `#sapo-batch-panel-root`
- cards, icon buttons, big action buttons
- sync/progress layouts
- text inputs and select dropdown styles
- tables, pagination, and page summary text
- row-status badges
- shared icons and `CustomSelect`

## Style Ownership
- Put a selector in `src/content/ui/styles.css` only if it is reused across at least two features or shell surfaces.
- Keep shell-local layout in `src/content/shell/styles.css`.
- Keep tax-local layout in `src/content/tax/styles.css`.
- Keep modify-set local layout and modal structure in `src/content/modify-set/styles.css`.

## Important Dependencies
- `src/content/shell/AppShell.tsx` imports `ui/styles.css` before shell-local styles.
- `src/content/tax/components/TaxFilters.tsx` and `src/content/modify-set/components/ModifySetPickerModal.tsx` use `CustomSelect`.
- Shell, tax, and modify-set all use the shared icon set.

## Easy To Break
- Root variables under `#sapo-batch-panel-root` must stay available to every content-side subtree.
- `CustomSelect` depends on the shared `.spx-input-clean`, `.spx-custom-select`, and `.spx-select-*` selectors.
- Shared responsive rules should stay primitive-level; feature-specific mobile behavior belongs in feature stylesheets.

## Belongs In `ui/` When
- the component or selector is already reused in two places and likely to be reused again
- the rule is primitive-level, not feature layout
- moving it does not hide a feature business rule or feature-specific interaction
