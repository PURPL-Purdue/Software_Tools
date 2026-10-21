# WrapDrive Frontend

React/Vite frontend for the PURPL WrapDrive inventory backend.

## Requirements

- Node.js 20.19+ or 22.12+ (required by Vite 8)
- The FastAPI backend running on `http://127.0.0.1:8000`

## Local setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

Local development uses `/api` and `vite.config.js` proxies it to FastAPI. This avoids hard-coding a machine-specific backend URL.

For a deployed frontend, copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the public API base URL if the frontend and API are not served from the same origin.

## Implemented UI

- Search and filters for category, tag, and location
- Part creation and editing
- Engineering details, free-form specifications, tags, and notes
- Stock summary and location allocations
- Direct allocation editing with a required per-change audit note
- Stock history
- Serialized/tracked units
- Related parts
- Attachment upload and download
- Category management
- Responsive layout for laptop/tablet/mobile widths

## Data-integrity behavior

The UI does not directly overwrite the backend's total/available/in-use stock summary. Allocation edits are sent to the backend reconcile endpoint, where stock changes are validated and recorded in history.

## Before production deployment

The backend currently does not provide authentication/authorization. Do not expose the app publicly until authentication and authorization are implemented. Also run end-to-end tests against the real MongoDB deployment before treating inventory mutations as production-ready.
