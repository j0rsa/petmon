# petmon — Claude Code Instructions

## Change checklists

### Touching backend (Rust `src/`, `migrations/`, `tests/`)
1. **Tests** — update or add integration tests in `tests/api_tests.rs` covering the changed behaviour.
2. **API spec** — reflect any new/changed/removed endpoints or fields in `docs/openapi.yaml`.
3. **MCP** — if the change adds or changes a capability a Claude agent might use, update `src/mcp/`.
4. **DB migrations** — if the latest migration file has not been pushed to `main` yet (check with `git log origin/main..HEAD -- migrations/`), amend that existing file rather than creating a new one. Only create a new migration file when the previous one is already in `main`.
5. **CLAUDE.md** — if the change introduces a new pattern, constraint, or domain rule worth preserving, add it here.

### Touching frontend (`frontend/src/`)
1. **Storybook** — update existing stories or add new ones for the changed component/page; ensure mock fixtures cover the new states.
2. **Tests** — update Vitest unit tests if any exist for the changed module.
3. **CLAUDE.md** — if the change establishes a new UI convention or naming pattern, add it here.

### Touching anything
- **Cargo version** — bump `version` in `Cargo.toml` following semver:
  - patch (`0.x.y+1`) for bug fixes and minor UI tweaks
  - minor (`0.x+1.0`) for new features or new API endpoints
  - **Skip the bump** if the version was already changed since the last push to `main` (check with `git log origin/main..HEAD -- Cargo.toml`).

---

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
