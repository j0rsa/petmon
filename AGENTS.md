# AGENTS.md

Project-specific guidance for agents. See `CLAUDE.md` for the change checklists (backend/frontend/versioning rules) and `README.md` for the product overview and API reference.

## Cursor Cloud specific instructions

petmon is a single product: a Rust/Actix Web backend (crate `petmon`) that serves a React/Vite SPA (`frontend/`), backed by embedded SQLite. There is no separate database service — SQLx runs `migrations/` automatically on startup.

### Services & ports
- Backend API + MCP + served frontend: `http://localhost:8080` (run `DEV_MODE=true make run-be`, i.e. `DEV_MODE=true STATIC_DIR=frontend/dist cargo run`). `DEV_MODE=true` bypasses all OIDC auth — required for local/e2e work.
- Vite dev server (frontend hot reload): `http://localhost:5173` (`make run-dev-fe`), proxies `/api` and `/mcp` to `:8080`, so the backend must also be running.
- The backend only serves the built SPA if `frontend/dist` exists (`make build-fe`); otherwise the root page shows "Frontend not built yet." For UI work, prefer the Vite dev server on 5173.

### Non-obvious gotchas
- Rust toolchain: the base image ships an older `rustc` (1.83) that CANNOT build this crate — some deps require the `edition2024` Cargo feature (needs Rust ≥ 1.85). The update script pins `rustup default stable`; if a build fails with "feature `edition2024` is required", run `rustup update stable`.
- Backend tests/clippy expect `DATABASE_URL="sqlite::memory:"` (see `make check-be`). Tests run via `cargo nextest` (installed separately: `cargo install cargo-nextest --locked`); `cargo test` also works.
- Frontend tests (`npx vitest run`) include Storybook browser-mode tests that need Playwright Chromium; the update script runs `npx playwright install chromium --with-deps`.
- `make seed-demo` wipes the DB (`sqlite:petmon.db`) before loading 4 demo pets (Mittens, Rex, Pepper, Clover). Use `ARGS='--append'` to keep existing data.
- **`DEMO_MODE=true`** — on startup, if the database has no pets yet (fresh volume after migrations), demo seed runs automatically (append-only; never wipes). Use for PR preview hosts such as `petmon-pr.j0rsa.com` with OIDC (not `DEV_MODE`). Pair with a persistent `DATABASE_URL` volume so re-deploys keep data; wipe the volume to re-seed. PR builds also publish `ghcr.io/j0rsa/petmon:pr-preview` (overwritten per open PR — assumes one preview host).
- Standard commands live in the `Makefile` (`check`, `check-fe`, `check-be`, `build-fe`, `run-be`, `run-dev-fe`, `seed-demo`) — reference those rather than re-deriving.
