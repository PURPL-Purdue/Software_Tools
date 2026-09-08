# PURPL Inventory Backend

This backend is intentionally redesigned around the current inventory mockup rather than the early table-oriented frontend skeleton.

## What it supports

- Part records with PURPL/manufacturer numbers, category, free-form specifications, tags, description, image reference, and stock unit.
- Dynamic locations and location states (`available`, `in_use`, `unavailable`).
- Derived stock summary: total / available / in use / unavailable.
- Atomic multi-change stock updates with required notes and immutable history.
- Receive, move, remove, and adjustment operations.
- Individually tracked/serialized units with location, status, description, and kit; moving a tracked unit also moves one aggregate stock unit atomically.
- Part notes, related-part links, and MongoDB GridFS attachments.
- Search/filter by name/number/description, category, tag, and location.
- CORS configuration that works with local Vite on Windows/macOS/Linux.

## First setup

```bash
python -m venv .venv
```

Activate it:

**Windows PowerShell**
```powershell
.\.venv\Scripts\Activate.ps1
```

**macOS/Linux**
```bash
source .venv/bin/activate
```

Install dependencies:

```bash
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env`, then put the MongoDB URI in `.env`. Never commit `.env`.

Run:

```bash
uvicorn main:app --reload --port 8000
```

Open `http://127.0.0.1:8000/docs` for interactive API documentation.

## Important stock behavior

The browser should never calculate stock totals and then send replacements. It should send operations to:

`POST /parts/{part_id}/stock/changes`

Example:

```json
{
  "actor": "Abir",
  "changes": [
    {
      "operation": "move",
      "quantity": 1,
      "from_location_id": "<red-toolbox-id>",
      "to_location_id": "<biggie-k-id>",
      "note": "1 unit moved from toolbox to Biggie-K Stand"
    }
  ]
}
```

The backend validates every change, prevents negative stock, performs the whole batch atomically, increments `stock_version`, and writes an audit event for every change.

## Main endpoint map

- `GET/POST /parts`
- `GET/PATCH/DELETE /parts/{id}`
- `GET /parts/{id}/stock`
- `POST /parts/{id}/stock/changes`
- `GET /parts/{id}/stock/history`
- `GET/POST /parts/{id}/tracked-units`
- `PATCH /parts/{id}/tracked-units/{unit_id}`
- `POST /parts/{id}/tracked-units/{unit_id}/retire`
- `POST/DELETE /parts/{id}/notes/...`
- `GET/POST/DELETE /parts/{id}/relations/...`
- `GET/POST/DELETE /parts/{id}/attachments/...`
- `GET/POST/DELETE /categories`
- `GET/POST/PATCH /locations`
- `GET /tags`
- `GET /health`

## Data integrity rules

- Total stock is `sum(allocations)`; it is not independently editable.
- Available and in-use quantities are derived from location state.
- Stock cannot become negative.
- One PURPL part number can identify only one part.
- One serial can occur only once within a part.
- A category cannot be deleted while parts still use it.
- A part with history/tracked units is blocked from hard deletion.

## Security note

The original `mongo_test.py` contained a MongoDB username/password directly in source code. This replacement reads `MONGODB_URL` only from the environment. **Rotate the exposed MongoDB credential before continuing development**, then put the new URI only in `.env`.

## Direct-edit stock table support

The mockup allows editing allocation quantities directly and then asks for notes. Use:

`POST /parts/{part_id}/stock/reconcile`

Send only the rows the user edited, each with its desired `new_quantity` and its own note. The backend computes the difference against current stock and records audited adjustments. This is safer than letting the browser overwrite totals.

To create the four locations shown in the mockup, run:

```bash
python scripts/bootstrap_mockup_locations.py
```


# Backend design assumptions

1. **MongoDB remains the production database.** The stock service uses MongoDB multi-document transactions so a stock mutation and its audit event either both commit or neither commits. Use MongoDB Atlas or a replica set; a standalone local `mongod` does not provide the transaction guarantees this implementation expects.
2. **Locations are dynamic, not hard-coded.** A user can create locations such as `Red toolbox top drawer`, `Biggie-K Stand`, or future locations without a code change.
3. **Every location has an inventory state:** `available`, `in_use`, or `unavailable`. The UI's Available/In Use numbers are derived from the quantities at those locations rather than stored as independent counters that can drift out of sync.
4. **Total stock is derived from allocations.** `total`, `available`, and `in_use` are calculated, never hand-maintained fields.
5. **Stock may be fractional.** This supports units such as feet. API values are rounded to six decimal places; if PURPL later needs metrology-level precision, quantities should be migrated to BSON Decimal128.
6. **Serialized tracking does not automatically remove the unit from stock.** Serialization gives one physical unit an identity while it remains part of the aggregate quantity at its location. Retiring a tracked unit does remove one physical unit.
7. **Damaged/lost serialized units remain part of total stock but are treated as unavailable.** This matches the mockup's example of a broken valve still physically located in the red toolbox.
8. **Moving a tracked unit moves one aggregate stock unit automatically.** The tracked-unit edit and the allocation move occur in the same MongoDB transaction, so the Track a Part screen can change location in one operation without creating inconsistent totals.
9. **Stock update notes are mandatory per change.** A multi-change submission can carry a separate note on every change, matching the mockup dialog.
10. **Part notes are lightweight comments.** They are embedded on the part document because expected volume is small. Stock history is kept separately because it is append-only and can grow indefinitely.
11. **Relations are directional in storage.** A part can link to fittings/hardware/etc.; the frontend may choose to display reverse relations as well later.
12. **Attachments are stored in MongoDB GridFS.** This avoids OS-specific file paths and keeps Windows/macOS/Linux behavior consistent.
13. **Authentication is not included yet.** `actor`, `author`, and `uploaded_by` are request fields for now. When login is added, these should come from the authenticated user identity instead of the client request body.
14. **Existing old-schema inventory documents are not mutated automatically.** The old fields (`storage_quantity`, `biggie_k_quantity`, etc.) should be migrated once the actual current database contents are reviewed.

