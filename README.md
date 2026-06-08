# catmon

Cat intake tracking system — a single deployable service with a React SPA frontend and a Rust/Actix Web backend backed by SQLite.

## Features

- **React 18 SPA** with TypeScript, React Router v6, TanStack Query, and Recharts
- **Actix Web JSON API** versioned under `/api/v1`
- **SQLite** persistence via SQLx with automatic migrations on startup
- **Stateless MCP** (JSON-RPC) endpoint at `/mcp` for agent/LLM integrations
- **Embedded frontend** assets compiled into the binary via `rust-embed`
- **Structured JSON logging** with `tracing`
- **Environment-based configuration**

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Today's intake entries, totals, and quick add form |
| Day View | `/days/:date` | Browse any date's entries with navigation |
| Analytics | `/analytics` | Charts and range summaries (7 / 30 / custom days) |
| Cats | `/cats` | Manage cat profiles |
| Schedules | `/schedules` | Create and manage feeding schedules |
| Imports | `/imports` | Preview and commit Telegram-style text logs |

## API Overview

```
GET/POST    /api/v1/cats
GET/PATCH/DELETE /api/v1/cats/:id

GET/POST    /api/v1/entries          # filters: cat_id, date, date_from, date_to, category
GET/PATCH/DELETE /api/v1/entries/:id

GET         /api/v1/days/:date       # day summary + entries; ?cat_id=
PATCH       /api/v1/days/:date/note

GET         /api/v1/analytics/daily-totals   # ?date_from=&date_to=&cat_id=
GET         /api/v1/analytics/range-summary

GET/POST    /api/v1/schedules        # ?cat_id=
GET/PATCH/DELETE /api/v1/schedules/:id

POST        /api/v1/imports/preview
POST        /api/v1/imports/commit
GET         /api/v1/imports
GET         /api/v1/imports/:id

GET         /api/v1/health
POST        /mcp                     # JSON-RPC 2.0
```

## MCP Operations

The `/mcp` endpoint accepts JSON-RPC 2.0 requests. Available methods:

`cats/list`, `cats/get`, `cats/create`, `cats/update`, `cats/delete`,
`entries/list`, `entries/get`, `entries/create`, `entries/update`, `entries/delete`,
`days/summary`, `analytics/daily-totals`, `analytics/range-summary`,
`schedules/list`, `schedules/get`, `schedules/create`, `schedules/update`, `schedules/delete`,
`imports/preview`, `imports/commit`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | Bind port |
| `DATABASE_URL` | `sqlite:catmon.db` | SQLite path |
| `TIMEZONE` | `UTC` | Local timezone for day bucketing |
| `IMPORT_MAX_BYTES` | `1048576` | Max import payload size |

Create a `.env` file at the project root to override defaults.

## Quick Start

```bash
# Run the server (migrations applied automatically)
cargo run

# Open the UI
open http://localhost:8080

# Health check
curl http://localhost:8080/api/v1/health
```

## Development

### Backend

```bash
# Check, test, build
cargo check
cargo test
cargo build --release
```

### Frontend

The built frontend assets are committed to `frontend/dist/` and embedded into the binary at compile time. To rebuild the frontend after changes:

```bash
cd frontend
npm install
npm run build
# Then rebuild the backend: cd .. && cargo build
```

### Import Format

The import parser understands Telegram-style text logs:

```
# optional comment
08:30 wet 85g tuna pâté
12:00 dry 30g
18:00 water 50ml
2024-01-15 20:00 treats 5g

# Supported categories: wet/wetfood, dry/dryfood, water/liquid, treat/treats, med/meds
# Amount units: g, ml, kg, oz, pcs, tbsp, tsp
```

## Deployment

The release binary is self-contained — it embeds all frontend assets and auto-runs SQLite migrations:

```bash
cargo build --release
DATABASE_URL=sqlite:/data/catmon.db ./target/release/catmon
```
