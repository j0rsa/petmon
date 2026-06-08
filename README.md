# petmon

Pet monitoring system — a single deployable service with a React SPA frontend and a Rust/Actix Web backend backed by SQLite. Track nutrition (meals, water, treats), with separate record tables planned per monitoring pillar (nutrition, elimination, health).

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
| Dashboard | `/` | Today's nutrition records, totals, and quick add form |
| Day View | `/days/:date` | Browse any date's nutrition records with navigation |
| Analytics | `/analytics` | Nutrition charts and range summaries (7 / 30 / custom days) |
| Pets | `/pets` | Manage pet profiles |
| Feeding schedules | `/schedules` | Create and manage nutrition feeding schedules |
| Import | `/imports` | Paste Telegram nutrition logs (parsed in the browser) |

## API Overview

```
GET/POST    /api/v1/pets
GET/PATCH/DELETE /api/v1/pets/:id

GET/POST    /api/v1/nutrition/records          # filters: pet_id, date, date_from, date_to, category
POST        /api/v1/nutrition/records/batch    # { records: CreateNutritionRecord[] }
GET/PATCH/DELETE /api/v1/nutrition/records/:id

GET         /api/v1/days/:date       # nutrition day summary + records; ?pet_id=
PATCH       /api/v1/days/:date/note

GET         /api/v1/nutrition/analytics/daily-totals   # ?date_from=&date_to=&pet_id=
GET         /api/v1/nutrition/analytics/range-summary

GET/POST    /api/v1/nutrition/schedules        # ?pet_id=
GET/PATCH/DELETE /api/v1/nutrition/schedules/:id

GET         /api/v1/health
POST        /mcp                     # JSON-RPC 2.0
```

## MCP Operations

The `/mcp` endpoint accepts JSON-RPC 2.0 requests. Available methods:

`pets/list`, `pets/get`, `pets/create`, `pets/update`, `pets/delete`,
`nutrition/records/list`, `nutrition/records/get`, `nutrition/records/create`, `nutrition/records/batch-create`, `nutrition/records/update`, `nutrition/records/delete`,
`days/summary`, `nutrition/analytics/daily-totals`, `nutrition/analytics/range-summary`,
`nutrition/schedules/list`, `nutrition/schedules/get`, `nutrition/schedules/create`, `nutrition/schedules/update`, `nutrition/schedules/delete`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | Bind port |
| `DATABASE_URL` | `sqlite:petmon.db` | SQLite path |
| `TIMEZONE` | `UTC` | Local timezone for day bucketing |
| `IMPORT_MAX_BYTES` | `1048576` | Max JSON request body size |

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

### Telegram nutrition import

The `/imports` page parses Telegram bot logs in the browser (same format as the original `cat-intake-tracker` prototype), then commits via `POST /api/v1/nutrition/records/batch`:

```
Staging Bot, [31. May 2026 at 06:15:15]:
#cat_ate #wet_food 15
#cat_ate #liquids 16
```

Each pillar will get its own parser on the frontend; the backend only accepts structured record payloads.

## Deployment

The release binary is self-contained — it embeds all frontend assets and auto-runs SQLite migrations:

```bash
cargo build --release
DATABASE_URL=sqlite:/data/petmon.db ./target/release/petmon
```
