<p align="center">
  <img src="frontend/public/icons/192x192.png" width="96" alt="Petmon logo" />
</p>

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
| Overview | `/` | Cross-pillar highlights (nutrition live; elimination/health planned) |
| Nutrition journal | `/nutrition` | Month calendar with per-day hints + selected day log |
| Nutrition analytics | `/nutrition/analytics` | Charts and range summaries |
| Feeding schedules | `/nutrition/schedules` | Nutrition feeding schedules |
| Import | `/nutrition/import` | Paste Telegram nutrition logs (parsed in the browser) |
| Pets | `/pets` | Manage pet profiles |
| Settings | `/settings` | OIDC/SSO, Telegram notifications, API token management |

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

GET         /api/v1/settings/oidc         # public view (no secret)
POST        /api/v1/settings/oidc         # merge-update (omit secret to keep existing)
GET         /api/v1/settings/telegram     # public view (no bot token)
POST        /api/v1/settings/telegram     # merge-update (omit bot_token to keep existing)

GET         /api/v1/api-tokens            # list all tokens (hash never returned)
POST        /api/v1/api-tokens            # create — raw token returned once
DELETE      /api/v1/api-tokens/:id        # deactivate
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
| `STATIC_DIR` | *(unset)* | Serve frontend from this directory instead of embedded assets |

Create a `.env` file at the project root to override defaults.

### OIDC environment override

If any of the following vars are present at startup, they are merged over the OIDC config stored in the database. Fields that are absent in the environment are left unchanged — so you can update only the secret without re-supplying the issuer URL, for example.

| Variable | Description |
|----------|-------------|
| `OIDC_ISSUER_URL` | Issuer URL for autodiscovery (`/.well-known/openid-configuration`) |
| `OIDC_CLIENT_ID` | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | OAuth2 client secret |
| `OIDC_ENABLED` | `1` / `true` / `yes` to enable, any other value to disable |

If none of the four vars are set, no database write occurs.  This is useful for container deployments where secrets are injected via the environment but UI-driven changes (e.g. toggling enabled) should persist across restarts.

## Demo data

Load a ready-to-explore dataset (4 pets, ~45 days of nutrition logs, day notes, schedules):

```bash
make seed-demo
# or: cargo run --bin seed-demo
```

This clears existing rows by default, then seeds the database. Use `make seed-demo ARGS="--append"` only on an empty database.

Demo pets **Mittens** and **Rex** use the same IDs as the frontend Storybook fixtures.

## Quick Start

```bash
# Optional: populate demo data
make seed-demo

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

### Storybook

Component stories live next to each component (`*.stories.tsx`). Run the catalog with:

```bash
make story
# or: cd frontend && npm run storybook
```

### Logging records via API

Create a record for a pet using the current server time (omit `occurred_at`):

```bash
curl -X POST http://localhost:8080/api/v1/nutrition/records \
  -H "Authorization: Bearer pm_api_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pet_id": "550e8400-e29b-41d4-a716-446655440000",
    "category": "liquids",
    "amount": 15,
    "unit": "ml"
  }'
```

Supply `occurred_at` (RFC3339) to backfill a specific time:

```bash
curl -X POST http://localhost:8080/api/v1/nutrition/records \
  -H "Authorization: Bearer pm_api_<your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "pet_id": "550e8400-e29b-41d4-a716-446655440000",
    "category": "wet_food",
    "amount": 75,
    "unit": "g",
    "occurred_at": "2026-06-17T08:30:00Z"
  }'
```

Valid categories: `wet_food`, `dry_food`, `water`, `liquids`.

The pet ID is shown on the pet profile page (Settings → Pets → Open profile) or returned by `GET /api/v1/pets`.

### Telegram

**Import** — the `/imports` page parses Telegram bot logs in the browser (same format as the original `cat-intake-tracker` prototype), then commits via `POST /api/v1/nutrition/records/batch`:

```
Staging Bot, [31. May 2026 at 06:15:15]:
#cat_ate #wet_food 15
#cat_ate #liquids 16
```

**Forwarding** — when Telegram is enabled in Settings (`/settings`), every new nutrition record is forwarded to the configured chat in the same format (`#cat_ate #<category> <amount>`). Configure the bot token and chat/group ID through the UI; the bot token is stored in the database and never returned by GET endpoints.

Each pillar will get its own parser on the frontend; the backend only accepts structured record payloads.

## CI/CD

The pipeline only runs when source files change (README, icons, and other non-code files are ignored).

```
version-check ──► frontend ──────────────────────────────────┐
              └──► backend-check ──► backend-amd64 ───────────┤──► docker
                               └──► backend-arm64 ───────────┘
```

| Job | What it does |
|-----|--------------|
| `version-check` | Reads `version` from `Cargo.toml`, fails if that tag already exists in GHCR (main push only) |
| `frontend` | tsc, lint, Vitest/Storybook tests, Vite build → uploads `frontend/dist` artifact |
| `backend-check` | `cargo fmt`, `cargo clippy` (platform-agnostic, runs once) |
| `backend-amd64` | Tests + musl release build for `x86_64` → uploads binary artifact |
| `backend-arm64` | Tests + musl release build for `aarch64` on a native ARM runner → uploads binary artifact |
| `docker` | Assembles both binaries + frontend dist, builds and pushes multiarch image to GHCR |

On **main push** the Docker image is tagged `v<version>`, `sha-<short>`, and `latest`.  
On **pull requests** all jobs run but nothing is pushed to the registry.  
To release a new version, bump `version` in `Cargo.toml` and push.

## Deployment

The release binary is self-contained — it embeds all frontend assets and auto-runs SQLite migrations:

```bash
cargo build --release
DATABASE_URL=sqlite:/data/petmon.db ./target/release/petmon
```
