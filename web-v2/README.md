# SeaMart POS — Rebuild

This is a clean, isolated rebuild. The legacy application remains in `web/` and is not modified by this branch.

## Stage 1
- Odoo-inspired responsive shell
- Cashier catalog and right-side cart
- Product/category read-only views
- CSV master loader with validation (expects at least 2,000 valid rows)
- New isolated browser storage keys: `seamart_v2_*`

## Safety
- Legacy `web/` and its storage keys are untouched.
- Master CSV is copied into this folder.
- Stock values from existing v2 local storage are retained on reload by product code + barcode.

## Test
Open `index.html` through a static server / GitHub Pages preview. Check that 2,228 records load, category filters work, adding/removing cart quantities works, and refresh preserves the v2 cart.

Payment, receipt, stock movement, reporting and login are intentionally not included until Stage 1 passes.
