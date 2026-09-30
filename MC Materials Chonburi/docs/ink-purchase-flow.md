# Purchase entry and deletion

- Use บันทึกซื้อเข้า for existing models or select เพิ่มรุ่นหมึกใหม่ inside a receipt line and enter its name, quantity and price. There is no separate model-creation toolbar button.
- Model creation and the receipt are committed atomically. Invalid lines leave no orphan model. Duplicate normalized names are rejected; retries reuse the original operation ID.
- Deletion uses a confirmation dialog without a reason field. Update reasons remain required. Soft-deletion audit records and negative-stock / nonzero-stock protection remain unchanged.
- Import-review tables no longer display the data-issues column. Underlying validation and review details remain available.

## Local upgrade safety

The direct local server now preserves material state in `local-data/materials.json` (override with `MATERIAL_DATA_PATH`). This preserves user edits, versions and original timestamps during server upgrades. Ink and image data retain their existing stores. Back up the entire `local-data` directory.

For an older in-memory server only, run `node tools/preserve-local-materials.mjs` before stopping it. It exports the live snapshot and verifies exact restoration, and refuses to overwrite an existing database. Do not rerun this migration against a newer persisted server. The first migration cannot recover the old process's private idempotency cache; new operations are persisted across restarts.

After upgrading, restart `node local/server.mjs` on port 4176, then reload the browser. Do not use the new purchase flow against the old server implementation.
