# IntrinsicFinEd — API

FastAPI server that exposes the analysis scripts to the frontend.

## Run

```bash
pip install -r requirements.txt
uvicorn backend.api:app --reload --port 8000
```

Then start the frontend (`cd frontend && npm run dev`). The frontend will
hit `http://localhost:8000/api/*` and silently fall back to mock data if
the API is offline.

## Endpoints

| Endpoint                            | Wired to                          |
|-------------------------------------|------------------------------------|
| `GET /api/health`                   | DB existence check                 |
| `GET /api/economic`                 | `data/economicmetrics.py` (TODO)   |
| `GET /api/industries`               | distinct industries in `financials.db` |
| `GET /api/industry/{industry}`      | `backend/industry_averages.py` (TODO)|
| `GET /api/comparative/{industry}`   | `backend/comparitivestockanalysis.py` (TODO)|
| `GET /api/individual/{ticker}`      | `backend/individualanalysis.py` (TODO)|

All endpoints return JSON matching the `SectionData` shape consumed by the
frontend (`frontend/src/lib/types.ts`).

## Environment

- `FINANCIALS_DB` — path to `financials.db`. Defaults to the repo root.
