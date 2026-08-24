# petmon — Claude Code Instructions

## Change checklists

### Settings: instance vs user

| Layer | Storage | Scope | Examples |
|-------|---------|-------|----------|
| **Instance** | `app_settings` | Shared by all users on this deployment | OIDC config, Telegram bot token, VAPID keys |
| **User** | `user_settings` keyed by `reader_key` | Per authenticated identity | Display format, widget prefs, (future) per-user integrations |

User settings API: `GET/POST /api/v1/me/settings/{key}` where `key` is e.g. `display`, `nutrition_calendar`, `cumulative_fluid_chart`, `developer_mode`.

`reader_key` is always the user id (`Identity.subject`):
- **OIDC:** JWT `sub` — same settings on web, mobile, and API-token sessions.
- **API token:** `api_tokens.owner_subject` (the minting user's `sub`). Tokens without `owner_subject` cannot authenticate.
- **DEV_MODE:** `"dev"`.

Push subscriptions remain per browser endpoint; notification read state and push ownership follow `reader_key`.

**Selected pet** is browser-local (`localStorage` key `petmon-selected-pet-id`), not a user setting. Restore it after refresh. While the pets query is pending, `data` is `undefined` — do not treat the `data ?? []` empty array as “no pets”, or the stored id is wiped and the UI falls back to the first pet.

**Apple Shortcuts (med intake)** — signed file (`assets/shortcuts/Petmon Take Meds.shortcut`), built on macOS via `make shortcut` (or `make build-med-intake-shortcut`), served at `GET /api/v1/shortcuts/meds/intake.shortcut`. **iPhone import requires an iCloud share link** (self-hosted URLs fail in Shortcuts). Store it in `assets/shortcuts/publish.json` (`icloud_url`) or override with `MED_INTAKE_SHORTCUT_ICLOUD_URL`; exposed on `GET /api/v1/info` → `med_intake_shortcut_icloud_url`. Publish workflow: `make publish-med-intake-shortcut` then `--set-url` (see `docs/apple-shortcut-med-intake.md`). Menu includes scheduled and optional (variable-dose) meds; bundles excluded for now.

**AutoMate (med intake, Android)** — flow file (`assets/automate/Petmon Take Meds.flo`), bootstrap via `make build-med-intake-automate`, served at `GET /api/v1/shortcuts/meds/intake.flo`. Android can import self-hosted `.flo` directly. Optional Automate Community link in `assets/shortcuts/publish.json` (`automate_community_url`) or `MED_INTAKE_AUTOMATE_COMMUNITY_URL`; exposed on `/api/v1/info` → `med_intake_automate_community_url`. Publish: `make automate`. Build/export steps: `docs/automate-med-intake.md`. Take requests may pass `?source=automate`. Same menu/take API as Shortcuts.

---
1. **Tests** — update or add integration tests in `tests/api_tests.rs` covering the changed behaviour.
2. **API spec** — reflect any new/changed/removed endpoints or fields in `docs/openapi.yaml`.
3. **MCP** — if the change adds or changes a capability a Claude agent might use, update `src/mcp/`.
4. **DB migrations** — check `git log origin/main..HEAD -- migrations/`. If that command returns a commit (migration not yet pushed), amend that existing file. If it returns nothing (all migrations already in `main`), create a new numbered migration file. Never amend a migration that is already in `main`.
5. **CLAUDE.md** — if the change introduces a new pattern, constraint, or domain rule worth preserving, add it here.

### Touching frontend (`frontend/src/`)
1. **Storybook** — update existing stories or add new ones for the changed component/page; ensure mock fixtures cover the new states.
2. **Tests** — update Vitest unit tests if any exist for the changed module.
3. **Desktop + mobile** — every Storybook `play` function must also run at **360×700** (`asNarrowStory` from `frontend/src/stories/viewport.ts`). That size is the required floor, not an optional extra. The narrow twin must keep the same interactions and assert the UI still fits (`assertFitsNarrowViewport`).
4. **CLAUDE.md** — if the change establishes a new UI convention or naming pattern, add it here.

### Locale-aware decimal inputs (iOS / EU keyboards)

Mobile decimal fields often show a comma (`,`) instead of a dot (`.`). **Never use `type="number"` for free-form decimal entry** — iOS rejects or mishandles comma input.

**Pattern (weight, liquid ml, schedule amounts, etc.):**
- `type="text"` + `inputMode="decimal"`
- Parse with `parseDecimal()` from `frontend/src/lib/numbers.ts` (normalises `,` → `.`)
- Validate with `Number.isFinite(parseDecimal(value)) && parseDecimal(value) > 0` (or `!isNaN(...)` where zero is allowed)

**Do not** use `Number.parseFloat` directly on raw input strings.

### Touching anything
- **Cargo version** — bump `version` in `Cargo.toml` following semver. **Always bump on every change, no exceptions:**
  - patch (`0.x.y+1`) for bug fixes, minor UI tweaks, refactors
  - minor (`0.x+1.0`) for new features or new API endpoints
  - **Skip the bump only** if the version was already changed since the last push to `main` (check with `git log origin/main..HEAD -- Cargo.toml`). If that command returns a commit, the version was already bumped — don't bump again.

---

## MCP tool names

MCP tool names (the `name` field in `tools/list` / `tools/call`) **must** follow the MCP 2025-11-25 tool-name rules (SEP-986 as published):

- Allowed characters only: `A-Z`, `a-z`, `0-9`, `_`, `-`, `.`
- Length 1–128 characters
- Use **dots** for namespacing, never slashes — e.g. `weight.records.create`, not `weight/records/create`

**Why:** Clients such as LiteLLM and several LLM providers reject `/` in tool names (even though an early SEP draft allowed it). Slash names produce registration warnings and can break tool calling.

**Do not confuse with:**
- JSON-RPC **protocol** methods (`tools/list`, `tools/call`, `prompts/get`, …) — those keep slashes; they are not tool names
- REST API paths (`/api/v1/nutrition/records`) — unchanged
- MCP resource URIs (`petmon://pets/{id}/today`) — unchanged

When adding a tool in `src/mcp/tools.rs`, advertise only the dotted name. Legacy slash names may be accepted as call aliases (normalized with `replace('/', ".")`) but must not appear in `tools/list`.

---

## Web Push / VAPID

- VAPID JWT `sub` must be a real `mailto:` or `https:` contact URI. **Never** use `@localhost` — Apple/Safari return `403 BadJwtToken`.
- Default subject is `https://petmon.j0rsa.com`; override with `VAPID_SUBJECT`. Keys auto-generate into `app_settings` unless `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` are set.
- On load, invalid stored subjects (e.g. legacy `mailto:admin@localhost`) are rewritten automatically.

## Medication intake Telegram

Omit `occurred_at` and `local_date` for a real-time dose; the server stamps now and the Telegram line has no timestamp:

`#pills <med name> <dosage> <med emoji>`

Provide either date field for a delayed/backdated entry. The timestamp uses the caller's display date/time format:

`#pills <med name> <dosage> <med emoji> - <timestamp>`

A bundle Take now or Add record sends **one** Telegram message with one `#pills` line per member, in bundle order, joined by a newline. All intake records store the same `telegram_message_id`. Undoing one remaining dose edits that message; undoing the last remaining dose deletes it. Health bundle rows offer Add record, Take now, and Undo for the latest shared take.

Medication accent color and emoji live on the medication identity, not on assignments.

Treatment plan UI: known medications, assignments, and bundles are card lists, not HTML tables. Medications have a view state and an explicit Edit mode for name/color/emoji. Assignments are grouped by medication — the current course is the card, earlier paused/ended courses collapse under it. Assignment cards show how long the current uninterrupted course has run: from the first assignment after the last pause through today (if active) or through the latest end date. Press + New assignment to open the create form at the top of the Assignments list (Revise uses the same card). Bundles join two or more scheduled (not optional) assignments; press + New bundle to open the create form at the top of the Bundles list. The form lists current scheduled medications that are not already in a bundle. Bundles appear on Health as a Take now row when every member is due. Today's meds splits bundles and individual meds into labeled groups. Card actions sit on the header row, right-aligned on desktop; they wrap below the title on narrow screens. UI tests for this page (and new UI in general) cover desktop and 360×700.

## Terminology: BE vs FE split

The app uses two vocabulary layers that must never bleed into each other:

| Layer | Where | Vocabulary |
|-------|-------|------------|
| **Backend** | Rust src, API types, DB schema, JSON field names | Professional/medical: `urination`, `defecation`, `vomit`, `elimination` |
| **Frontend** | UI labels, chart legends, headings, tooltips, user-facing strings | Casual/non-clinical: `Wee`, `Poop`, `Vomit`, `General` |

**Why:** The app is for pet owners, not clinicians. Medical terms in the UI can feel cold or off-putting. The BE keeps precise terminology for data integrity and interoperability.

**In practice:**
- `EliminationEventType = 'urination' | 'defecation' | ...` — correct in API/types
- Chart bar `name="Wee"` / `name="Poop"` — correct in FE components
- Do **not** render "Urination" or "Defecation" in any visible UI string
- Internal FE variable names (e.g. `defecationCount`, `urination_count`) can remain medical since they're not user-facing
