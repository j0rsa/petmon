<p align="center">
  <img src="frontend/public/icons/192x192.png" width="96" alt="Petmon logo" />
</p>

# petmon

Pet monitoring system — a single deployable service with a React SPA frontend and a Rust/Actix Web backend backed by SQLite. Track nutrition, toileting habits, and weight across multiple pets.

## Features

- **React 18 SPA** with TypeScript, React Router v6, TanStack Query, and Recharts
- **Actix Web JSON API** versioned under `/api/v1`
- **SQLite** persistence via SQLx with automatic migrations on startup
- **Stateless MCP** (JSON-RPC) endpoint at `/mcp` for agent/LLM integrations
- **Embedded OpenAPI spec** (`/api/docs`) via `rust-embed`; frontend is served from `STATIC_DIR` at runtime
- **PWA** — installable on iOS and Android, with service worker update banner
- **Structured JSON logging** with `tracing`, optional OTLP export
- **Environment-based configuration**

## Monitoring pillars

### Nutrition
Track meals, water, treats, and liquids. Feeding schedules with target windows. Full analytics (daily totals, range summaries, best-fluid-day chart).

### Toileting (Elimination)
Log litter box visits and potty breaks with event type (wee, poop, vomit, general), optional subtype (e.g. soft/hard/blood for poop; fur/food for vomit), and optional time-in-box duration. Month calendar with visit count, average duration, and vomit dot per day. Analytics with median visits/day trend and time-spent trend chart including regression line and median reference.

### Health
Weight history per pet — log measurements, view a 30-day trend chart on the pet profile, and manage the full history at `/health`. Overview shows the latest weight with a ▲/▼/● indicator vs the 30-day average.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Overview | `/` | Cross-pillar highlights: today's fluid intake + streak, toileting visits, latest weight |
| Nutrition journal | `/nutrition` | Month calendar + selected day log |
| Nutrition analytics | `/nutrition/analytics` | Charts and range summaries |
| Feeding schedules | `/nutrition/schedules` | Nutrition feeding schedules |
| Import | `/nutrition/import` | Paste Telegram nutrition logs (parsed in the browser) |
| Toileting journal | `/elimination` | Month calendar (visit count, avg duration, vomit dot) + day log |
| Toileting analytics | `/elimination/analytics` | Median visits, time-spent trend, vomit days |
| Health | `/health` | Weight history chart, log form, full measurements table |
| Pet profile | `/pets/:id` | Profile fields + 30-day weight chart |
| Pets | `/pets` | List of pet profiles |
| Settings | `/settings` | OIDC/SSO, Telegram, API token management, display preferences |

## Mobile / PWA

The app is installable as a PWA on iOS and Android. After installing:

- **Stay signed in**: go to Settings → API tokens → **Remember this device**. This creates a long-lived API token stored on the device, eliminating repeated SSO redirects.
- **Updates**: when a new version is deployed, a banner appears at the top of the screen. Tap **Update** to reload with the latest assets.

## API Overview

```
GET/POST         /api/v1/pets
GET/PATCH/DELETE /api/v1/pets/:id

GET/POST         /api/v1/nutrition/records       # filters: pet_id, date, date_from, date_to, category
POST             /api/v1/nutrition/records/batch
GET/PATCH/DELETE /api/v1/nutrition/records/:id

GET              /api/v1/days/:date              # nutrition day summary; ?pet_id=
PATCH            /api/v1/days/:date/note

GET              /api/v1/nutrition/analytics/daily-totals
GET              /api/v1/nutrition/analytics/range-summary
GET              /api/v1/nutrition/analytics/best-fluid-day

GET/POST         /api/v1/nutrition/schedules     # ?pet_id=
GET/PATCH/DELETE /api/v1/nutrition/schedules/:id

GET/POST         /api/v1/elimination/records     # filters: pet_id, date, date_from, date_to, event_type
GET/PATCH/DELETE /api/v1/elimination/records/:id
GET              /api/v1/elimination/analytics/daily-summaries
GET              /api/v1/elimination/analytics/range-summary

GET/POST         /api/v1/health/weight           # weight records; filters: pet_id, date_from, date_to
DELETE           /api/v1/health/weight/:id
GET              /api/v1/health/weight/stats     # ?pet_id=&date_from=&date_to= → latest_kg, avg_kg, count

GET              /api/v1/settings/display
POST             /api/v1/settings/display
GET/POST         /api/v1/settings/oidc
GET/POST         /api/v1/settings/telegram

GET/POST         /api/v1/api-tokens
POST             /api/v1/api-tokens/:id/activate
DELETE           /api/v1/api-tokens/:id
DELETE           /api/v1/api-tokens/:id/permanent

GET              /api/v1/health                  # health check (unauthenticated)
GET              /api/v1/info                    # version + git SHA (unauthenticated)
POST             /mcp                            # JSON-RPC 2.0
```

Full schema at `/api/docs` (Swagger UI) or `/api/docs/openapi.yaml`.

## MCP

petmon exposes a **stateless JSON-RPC 2.0** MCP endpoint at `POST /mcp`, protected by the same Bearer-token auth as the REST API.

### Available tools

**Context tools** (recommended starting points — return everything needed in one call):

| Tool | Returns |
|------|---------|
| `pets/nutrition-context` | Pet profile + precomputed on-track status + today's records + active schedules + 7-day trend |
| `pets/elimination-context` | Pet profile + today's wee/poop/vomit counts + 7-day trend |
| `pets/health-context` | Pet profile + last 10 weight records + 30-day stats + last 10 wellbeing check-ins (level + notes) |

**Prompts** (caregiver workflow templates — use via MCP `prompts/get`):

| Prompt | Purpose |
|--------|---------|
| `daily-summary` | Full daily snapshot across nutrition, toileting, and health |
| `nutrition-check` | Is liquid intake on track right now vs schedule? (uses `nutrition/on-track`) |
| `toileting-check` | Today's wee/poop/vomit and recent trends |
| `health-check` | Weight trend and recent wellbeing check-ins |
| `log-intake` | Log water, liquids, or food for a pet |
| `vet-handoff` | Structured brief for a vet visit (default 14-day lookback) |

**Individual tools:**

`pets/list`, `pets/get`, `pets/create`, `pets/update`

`nutrition/records/list`, `nutrition/records/get`, `nutrition/records/create`, `nutrition/records/batch-create`, `nutrition/records/update`, `nutrition/records/delete`

`nutrition/status`, `nutrition/on-track`

`nutrition/analytics/daily-totals`, `nutrition/analytics/range-summary`, `nutrition/analytics/best-fluid-day`

`nutrition/schedules/list`, `nutrition/schedules/get`, `nutrition/schedules/create`, `nutrition/schedules/update`, `nutrition/schedules/delete`

`days/summary`, `days/note/get`, `days/note/set`

`elimination/records/list`, `elimination/records/create`, `elimination/records/update`, `elimination/records/delete`, `elimination/analytics/range-summary`

`weight/records/list`, `weight/records/create`, `weight/records/delete`

`health/state/list`, `health/state/create`, `health/state/delete`

### Wellbeing levels

When creating health state records, use `level`: `terrible`, `poor`, `ok`, `good`, `amazing`. Optional `note` for caregiver observations.

### Event types for toileting

When creating elimination records, use `event_type`:
- `urination` (wee)
- `defecation` (poop) — subtypes: `normal`, `soft`, `liquid`, `hard`, `blood`, `mucus`
- `vomit` — subtypes: `food`, `fur`, `fur_with_food`, `bile`, `other`
- `general`

### Connecting Claude to petmon

petmon uses HTTP transport (JSON-RPC over a single `POST /mcp` endpoint). Add it to your Claude Code config (`~/.claude/settings.json` or the project's `.claude/settings.json`):

```json
{
  "mcpServers": {
    "petmon": {
      "type": "url",
      "url": "https://<your-petmon-host>/mcp",
      "headers": {
        "Authorization": "Bearer pm_api_<your-api-token>"
      }
    }
  }
}
```

**Steps:**

1. **Create an API token** — open petmon → Settings → API tokens → Create token. Copy the token immediately (shown once). Or use **Remember this device** to generate and store a token automatically.
2. **Add the server** to your Claude settings, replacing `<your-petmon-host>` and `<your-api-token>`.
3. **Restart Claude Code** (or run `/mcp` to reload servers).
4. Example prompts:
   - *"How much has Mittens drunk today?"*
   - *"Log 20 ml of water for Mittens now"*
   - *"Did Rex vomit recently? Show me the last week."*
   - *"What does Clover weigh and is the trend stable?"*

For local development use `http://localhost:8080/mcp` as the URL.

## Home Assistant

petmon can receive toileting records (and combined weight measurements) directly from Home Assistant automations and scripts via REST commands. See **[HOMEASSISTANT.md](HOMEASSISTANT.md)** for a complete setup guide including `rest_command` definitions, example automations, and a dashboard button card.

## Authentication

petmon supports two auth methods:

- **OIDC/SSO (PKCE flow)** — the browser exchanges the authorization code directly with the provider. No client secret required. Configure via Settings → OIDC, or via environment variables (`OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_ENABLED`).
- **API tokens** — long-lived `pm_api_*` tokens. Can be created by OIDC-authenticated users. Use for MCP, scripts, and "Remember this device" on PWA.

`DEV_MODE=true` bypasses all auth for local development.

### OIDC provider setup

- Set client type to **public** (no client secret).
- Enable **Authorization Code + PKCE**.
- Add `https://<your-domain>/auth/callback` as an allowed redirect URI.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | Bind port |
| `DATABASE_URL` | `sqlite:petmon.db` | SQLite path |
| `TIMEZONE` / `TZ` | `UTC` | Local timezone for day bucketing |
| `DEV_MODE` | `false` | Skip all auth (local dev only) |
| `IMPORT_MAX_BYTES` | `1048576` | Max JSON request body size |
| `STATIC_DIR` | *(unset)* | Serve frontend from this directory instead of embedded assets |
| `OIDC_ISSUER_URL` | *(unset)* | Merged over DB config at startup |
| `OIDC_CLIENT_ID` | *(unset)* | Merged over DB config at startup |
| `OIDC_ENABLED` | *(unset)* | `1`/`true`/`yes` to enable |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | *(unset)* | OTLP/gRPC collector for distributed tracing |
| `OTEL_SERVICE_NAME` | `petmon` | Service name in traces |

## Demo data

Load a ready-to-explore dataset (4 pets, ~45 days of nutrition, elimination, and weight records):

```bash
make seed-demo
```

This clears existing rows and seeds Mittens, Rex, Pepper, and Clover. Demo pet IDs match the Storybook fixtures.

## Quick Start

```bash
# 1. Seed demo data (optional)
make seed-demo

# 2. Run (DEV_MODE skips OIDC)
DEV_MODE=true make run-be

# 3. Open the UI
open http://localhost:8080

# Or run frontend dev server separately for hot-reload
make run-dev-fe   # → http://localhost:5173
```

## Development

### Backend

```bash
cargo check
cargo test          # runs unit + integration tests via nextest
cargo build --release
```

### Frontend

```bash
cd frontend
npm install
npm run build       # tsc + vite → frontend/dist/
npm run dev         # Vite dev server with API proxy to :8080
```

### Storybook

```bash
make story
# or: cd frontend && npm run storybook
```

Stories live next to each component (`*.stories.tsx`). Coverage: all major components + Nutrition, Elimination, Health, Settings, and Analytics pages.

On each PR, CI publishes Storybook to [Chromatic](https://www.chromatic.com/) and updates the PR description with preview links (between `<!-- chromatic-storybook-preview -->` markers). Add a repo secret named `CHROMATIC_PROJECT_TOKEN` (from your Chromatic project → Manage → Configure). For Chromatic’s own PR status checks and richer comments, finish GitHub App setup at [chromatic.com/setup](https://www.chromatic.com/setup) for your project.

### Makefile targets

| Target | Description |
|--------|-------------|
| `make run-be` | Kill any stale backend, rebuild, run with `DEV_MODE=true` |
| `make run-dev-fe` | Vite dev server (proxies `/api` and `/mcp` to `:8080`) |
| `make seed-demo` | Reset DB and load demo data |
| `make check` | Full check: `cargo fmt`, `cargo clippy`, `cargo nextest`, `tsc`, `eslint` |
| `make story` | Storybook component catalog |

## Observability

Logs are emitted as JSON to stdout. `/api/v1/health` spans are suppressed from traces.

```bash
RUST_LOG=petmon=info                          # default — info and above for app code
RUST_LOG=petmon=debug                         # verbose app logs
RUST_LOG=debug                                # everything including deps (very noisy)
```

Distributed tracing with Jaeger:

```bash
docker run -d --name jaeger -p 4317:4317 -p 16686:16686 jaegertracing/all-in-one:latest
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 cargo run
# UI: http://localhost:16686
```

### Troubleshooting

**OIDC group mapping not working?**

Users may land on the wrong scope (e.g. read-only user gets full access) if:
- The JWT uses a different claim name than `groups_claim` in your config
- The group value in the JWT doesn't exactly match `full_access_group` / `readonly_group`

Enable targeted debug logging for the OIDC auth module only — keeps everything
else at `info` so the output stays readable:

```bash
RUST_LOG=petmon=info,petmon::auth::oidc=debug cargo run
```

On each login you will see two `DEBUG` lines:

```
OIDC token verified — resolving scopes from groups
  sub=alice  groups_claim="groups"  groups=["petmon-admins"]
  full_access_group=Some("petmon-admins")  readonly_group=Some("petmon-viewers")
  raw_claim_value=Some(Array [String("petmon-admins")])

OIDC scope resolution complete
  sub=alice  resolved_scopes={}   ← empty = full access
```

Key things to check in the first line:
- `groups` — what was actually extracted from the token (check spelling and case)
- `raw_claim_value` — the raw JSON value under that claim key; `None` means the claim
  is absent entirely — the claim name is wrong
- `resolved_scopes` — `{}` means full access; `{"api_read"}` means read-only; if you
  expected read-only but see `{}`, the user's group name matches `full_access_group`

For Docker / HA deployments set the env var in your run config:

```yaml
# docker-compose.yml
environment:
  RUST_LOG: "petmon=info,petmon::auth::oidc=debug"

# Home Assistant add-on options
env_vars:
  - name: RUST_LOG
    value: "petmon=info,petmon::auth::oidc=debug"
```

## CI/CD

```
version-check ──► frontend ──────────────────────────────────────────────┐
              └──► backend-check ──► backend-test ──► backend-amd64 ─────┤──► docker
                                                  └──► backend-arm64 ────┘
```

| Job | What it does |
|-----|--------------|
| `version-check` | Fails if the `Cargo.toml` version tag already exists in GHCR |
| `frontend` | tsc, lint, Vitest, Vite build |
| `backend-check` | `cargo fmt` + `cargo clippy` |
| `backend-test` | `cargo nextest` |
| `backend-amd64/arm64` | musl release builds |
| `docker` | Multiarch image → GHCR tagged `v<version>`, `sha-<short>`, `latest` on main; `pr-<number>-<version>-<short-sha>` on PRs |

To release: bump `version` in `Cargo.toml` and push to main.

## Deployment

```bash
cargo build --release
DATABASE_URL=sqlite:/data/petmon.db \
STATIC_DIR=/app/frontend/dist \
OIDC_ISSUER_URL=https://your-provider.com \
OIDC_CLIENT_ID=your-client-id \
./target/release/petmon
```

The binary runs migrations automatically on startup. Frontend assets must be built separately and pointed to via `STATIC_DIR`.
