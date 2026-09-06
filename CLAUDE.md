# petmon — Claude Code Instructions

## Change checklists

### Settings: three-tier model

Petmon has three distinct settings tiers. Before adding any new preference, decide which tier owns it.

| Tier | Table | Keyed by | Audience | API path | Examples |
|------|-------|----------|----------|----------|----------|
| **System / Instance** | `app_settings` | `key` (string) | Shared by **all users** on this deployment — set by the operator | Internal only (no REST API; set via env or startup migration) | OIDC config, Telegram bot token, VAPID keys, demo mode |
| **User** | `user_settings` | `reader_key` + `key` | One **authenticated identity** across all their devices and sessions | `GET/POST /api/v1/me/settings/{key}` | Date/time display format, widget visibility toggles, developer mode |
| **Pet** | `pet_settings` | `pet_id` + `key` | The **pet itself** — today always one owner, but shared across all future co-owners | `GET/POST /api/v1/pets/{pet_id}/settings/{key}` | Medication nudge schedule (`med_nudge`) |

#### Decision guide

Ask these questions in order:
1. **Does it belong to the server infrastructure, not any user?** → System (`app_settings`).
2. **Is it a personal UI preference that should differ between two people looking at the same pet?** → User (`user_settings`).
3. **Is it a configuration that applies to the pet regardless of who is logged in?** → Pet (`pet_settings`).

#### User settings (`user_settings`)

`reader_key` is always the user id (`Identity.subject`):
- **OIDC:** JWT `sub` — same settings on web, mobile, and API-token sessions.
- **API token:** `api_tokens.owner_subject` (the minting user's `sub`). Tokens without `owner_subject` cannot authenticate.
- **DEV_MODE:** `"dev"`.

Known user-setting keys: `display`, `nutrition_calendar`, `cumulative_fluid_chart`, `developer_mode`.

Adding a new user-setting key: add the constant + types to `src/domain/user_settings.rs`, add a match arm in both `get_user_settings` and `update_user_settings` in `src/api/user_settings.rs`, extend `UserSettingsKey` and `UserSettingsMap` in `frontend/src/api/userSettings.ts`.

#### Pet settings (`pet_settings`)

Known pet-setting keys: `med_nudge` (medication nudge schedule — morning/midday/evening slots with `enabled` + `deadline_hour`).

Adding a new pet-setting key: add the constant + types to `src/domain/pet_settings.rs`, add a match arm in `src/api/pet_settings.rs`, extend `PetSettingsKey` and `PetSettingsMap` in `frontend/src/api/petSettings.ts`.

Push subscriptions remain per browser endpoint; notification read state and push ownership follow `reader_key`.

**Selected pet** is browser-local (`localStorage` key `petmon-selected-pet-id`), not a user setting. Restore it after refresh. While the pets query is pending, `data` is `undefined` — do not treat the `data ?? []` empty array as “no pets”, or the stored id is wiped and the UI falls back to the first pet.

**Apple Shortcuts (med intake)** — written in [Cherri](https://cherrilang.org) at `shortcuts/med-intake.cherri`, compiled and signed by `shortcuts/build.py` into `assets/shortcuts/Petmon Take Meds.shortcut`, served at `GET /api/v1/shortcuts/meds/intake.shortcut`. `make check-shortcut` (compile + verify, any OS), `make build-shortcut` (adds signing, macOS). **iPhone import requires an iCloud share link** (self-hosted URLs fail in Shortcuts). Store it in `assets/shortcuts/publish.json` (`icloud_url`) or override with `MED_INTAKE_SHORTCUT_ICLOUD_URL`; exposed on `GET /api/v1/info` → `med_intake_shortcut_icloud_url`. Publish workflow: `make publish-shortcut` then `python3 shortcuts/publish.py --set-url` (see `docs/apple-shortcut-med-intake.md`). Menu includes scheduled and optional (variable-dose) meds. **Bundles appear as a single entry** (kind = `bundle`) and are taken via `POST /shortcuts/meds/intake/take-bundle?pet_id=&bundle_id=`; member medications also appear as individual choices so they can be taken separately. **Meal wait timer**: when `meal_wait_minutes` is set on an assignment, the shortcut starts a countdown timer via `startTimer(qty("{waitValue}", "min"))` after a successful take (for bundles, uses the max across members).

**Never hand-write the shortcut plist.** Shortcuts imports a malformed workflow without complaint and then does the wrong thing silently — three releases shipped broken that way (a bare `Repeat Item` resolving to the inner loop; `Format Date` with no input, so the menu asked for `&date=`; missing required action parameters). Cherri owns the action forms; `cherri --action=<name>` and `cherri --docs=<category>` are the authoritative signatures.

### Menu response contract

The menu response keeps `status`, `labels`, and `lines` for forward-compatibility, but the Cherri shortcut reads `choices` directly. `shortcut_menu::disambiguate_labels` appends ` (2)`, ` (3)`, … so two meds with the same name+dose can't log one tap twice. `DoseFraction` parses both display spellings (`3/4`) and canonical names (`three_quarter`); `DoseFraction::label()`'s `½` glyphs are for the web UI only and do **not** survive a query param. Choice objects for bundles have `kind = "bundle"` and `bundle_id` but no `medication_id` / `assignment_id`; individual choices have `kind = "scheduled" | "optional_pill" | "optional_liquid"` and `medication_id` + `assignment_id`. All choices may carry `meal_wait_minutes` (omitted when null).

**The take endpoint is real-time only.** It accepts no `occurred_at` / `local_date` — the server stamps its own local time, so `#pills` has no timestamp, matching a web Take now. Do not add a timestamp param back: the take token is unsigned, so that would hand anyone holding one a backdating primitive, and a device flow has no backdating UI anyway. Backdated doses go through `POST /health/meds/intake`. `MedIntakeTakeQuery` is `deny_unknown_fields`, so a drifted generator gets a `400` instead of a silently dropped timestamp (which would read as a backdated dose landing on today). The device's own day is still used for the *menu* `?date=`; if it disagrees with the server's day the due-date check rejects the take with `400` rather than filing it on the wrong day.

### Editing the Cherri shortcut

Hard-won rules for **v2.3.0** (also in the source header):

- **`const` for any value an action consumes; `@` only for a mutable accumulator.** `const` compiles to `Type: ActionOutput` with the producing action's UUID; `@name` compiles to a by-name `Type: Variable`. A mutable value reaches an action by being interpolated into a `const`.
- `@` is **required** on all mutable variable references (v2.2+ enforced); `const` references remain bare: `alert(x)`, `"{x}"`.
- Loop variables are mutable — capture them as text consts via `"{@var}"` before conditions. `getValue` results need `.text` coercion in conditions: `if label.text == pickText`.
- `#define` must precede `#include`; there is no `else if`; compiler error positions can be stale (bisect the file).
- Import questions cannot be variable values and each fills exactly one action argument, so each feeds its own `text(question )` — the space before `)` is load-bearing.
- `shortcuts/build.py` re-points each import question's `ActionIndex` at the Text action producing its constant via `QUESTION_TARGETS` and fails if two collide. It also verifies every variable reference resolves, since a dangling one leaves the parameter empty at run time rather than failing.
- Shortcuts hands a **4xx body to the next action** instead of stopping, so a take is only counted as logged when the response contains an `id`.
- `shortcuts sign` needs its input named `*.shortcut` and takes Cherri's XML directly (no `plutil -convert binary1`).
- `#include 'actions/scripting'` is not needed in v2.3.0 — scripting actions are auto-included.

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

### PWA chrome: safe areas and the demo banner

The app is installed full-bleed (`viewport-fit=cover` + `apple-mobile-web-app-status-bar-style: black-translucent`), so the top and bottom strips of the web view sit under the status bar / camera hole and the home indicator. Four `:root` variables in `frontend/src/index.css` own that:

| Variable | Meaning |
|----------|---------|
| `--device-top` / `--device-bottom` | The physical inset (`env(safe-area-inset-*)`). |
| `--safe-top` / `--safe-bottom` | What edge-touching UI should pad by — the device inset, unless something else already covers that strip. |
| `--demo-banner-height` | Height reserved for the fixed demo banner; `0px` when it is not mounted. |

Rules:
- **Never read `env(safe-area-inset-*)` directly** outside those definitions — use the variables, so a story can simulate a notched phone (`withDeviceInsets()` from `frontend/src/stories/viewport.tsx`). `env()` is always 0 in a desktop browser, which is why notch bugs ship unnoticed.
- **Top padding is not mobile-only.** `.content` clears `--safe-top` at every breakpoint; a landscape phone or iPad PWA is wider than 768px and still notched.
- **Whatever is topmost owns the top inset.** `:root:has(.demo-banner)` sets `--safe-top: 0` and folds the inset into `--demo-banner-height`, so content below it is not padded twice.
- **Nothing in flow above `.app-shell`.** The banner is `position: fixed` and the shell reserves its height as `padding-top` inside `min-height: 100dvh` (border-box). An in-flow banner above a `100vh` shell made every page — even ones that fit — scroll by the banner's height, which is what left the fixed bottom nav floating over a rubber-band gap on iOS. Use `100dvh` (with a `100vh` fallback line) for full-height boxes.

Regression cover lives in `Layout.stories.tsx` / `DemoBanner.stories.tsx`: `assertShellSpansOneViewport`, `assertBottomNavPinned`, `assertTextClearsTopInset`.

### Locale-aware decimal inputs (iOS / EU keyboards)

Mobile decimal fields often show a comma (`,`) instead of a dot (`.`). **Never use `type="number"` for free-form decimal entry** — iOS rejects or mishandles comma input.

**Pattern (weight, liquid ml, schedule amounts, etc.):**
- `type="text"` + `inputMode="decimal"`
- Parse with `parseDecimal()` from `frontend/src/lib/numbers.ts` (normalises `,` → `.`)
- Validate with `Number.isFinite(parseDecimal(value)) && parseDecimal(value) > 0` (or `!isNaN(...)` where zero is allowed)

**Do not** use `Number.parseFloat` directly on raw input strings.

### Touching anything
- **Cargo version — one bump per PR.** Bump `version` in `Cargo.toml` (and the matching `petmon` entry in `Cargo.lock`) **once** for the whole branch/PR, following semver:
  - patch (`0.x.y+1`) for bug fixes, minor UI tweaks, refactors
  - minor (`0.x+1.0`) for new features or new API endpoints
- **Before bumping**, run `git log origin/main..HEAD -- Cargo.toml`. If that returns any commit, the version was **already bumped on this branch — do not bump again**, even on follow-up commits in the same PR.
- **When to bump:** on the first commit that needs a release, or amend the existing version commit if the branch has not merged yet. Never stack `0.21.1` → `0.21.2` across multiple commits in one PR.

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

Treatment plan UI: known medications, assignments, and bundles are card lists, not HTML tables. Medications have a view state and an explicit Edit mode for name/color/emoji. Assignments are grouped by medication — the current course is the card, earlier paused/ended courses collapse under it. Assignment cards show how long the current uninterrupted course has run: from the first assignment after the last pause through today (if active) or through the latest end date. Press + New assignment to open the create form at the top of the Assignments list (Revise uses the same card). Bundles join two or more scheduled (not optional) assignments; press + New bundle to open the create form at the top of the Bundles list. The form lists current scheduled medications that are not already in a bundle. Bundles appear on Health as a Take now row when every member is due. Today's meds splits bundles and individual meds into labeled groups. Card actions sit on the header row, right-aligned on desktop; they wrap below the title on narrow screens. **Exception:** the Today's meds shortcut import icon (iOS only) stays on the header row at the card's right edge at *every* width, and `.med-intake-heading.section-heading` deliberately overrides the below-640px stacking to keep it there. It is a card action, never markup nested next to the `<h3>`. UI tests for this page (and new UI in general) cover desktop and 360×700; `assertHeaderActionPlacement` in `frontend/src/stories/viewport.tsx` checks the placement at both sizes.

## Target devices and viewport specifications

These are the primary client devices to check for usability. All UI work must be verified at the corresponding CSS viewport widths; Storybook stories use `asNarrowStory` / `withDeviceInsets()` to simulate the smallest breakpoints.

### Mobile devices

| Device | Screen | Orientation | CSS viewport (w × h) | DPR | Safe area notes |
|--------|--------|-------------|----------------------|-----|-----------------|
| **Samsung Galaxy Z Flip 4** | Main (6.7" unfolded) | Portrait | 393 × 960 px ¹ | 2.75 | Punch-hole camera top; use `env(safe-area-inset-*)` |
| Samsung Galaxy Z Flip 4 | Main (6.7" unfolded) | Landscape | 960 × 393 px ¹ | 2.75 | — |
| Samsung Galaxy Z Flip 4 | Cover (1.9" external) | Portrait | ~130 × 65 px ² | ~4 | Web browsers do not run on the cover screen |
| **iPhone 16 Pro** | 6.3" Super Retina XDR | Portrait | 402 × 874 px | 3 | Dynamic Island top ≈ 59 pt; home indicator ≈ 34 pt |
| iPhone 16 Pro | 6.3" Super Retina XDR | Landscape | 874 × 402 px | 3 | Side safe areas apply |
| **iPhone 15 Pro Max** | 6.7" Super Retina XDR | Portrait | 430 × 932 px | 3 | Dynamic Island top ≈ 59 pt; home indicator ≈ 34 pt |
| iPhone 15 Pro Max | 6.7" Super Retina XDR | Landscape | 932 × 430 px | 3 | Side safe areas apply |

**Notes:**

¹ Galaxy Z Flip 4 main screen physical resolution is **1080 × 2640 px** @ 425 ppi. Chrome on Android reports DPR ≈ 2.75, yielding a CSS viewport of ~393 × 960 px in portrait. Some profiling tools report DPR 3 (→ 360 × 880 px); treat 360 px as the safe minimum width for this device. The exact reported value can differ between Chrome and Samsung Internet.

² The cover/external screen (1.9", 512 × 260 physical px) is used exclusively for Samsung's Flex Window widgets — standard web browsers do not render on it. No web viewport testing is required for the cover screen.

Safe area insets on iOS should always be handled via CSS `env(safe-area-inset-top/right/bottom/left)` — never hardcoded. The `withDeviceInsets()` Storybook decorator simulates these values in tests. Top insets for Dynamic Island models are approximately **59 pt** (status bar + island) and the home indicator bottom reserve is **34 pt**.

The app ships as a PWA with `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style: black-translucent`, so the full display area (including behind the status bar and home indicator) is used. The `--safe-top` / `--safe-bottom` CSS variables in `frontend/src/index.css` own this offset — never read `env(safe-area-inset-*)` directly outside those definitions.

### Desktop viewports

| Target | CSS viewport width | Notes |
|--------|--------------------|-------|
| Narrow desktop / large tablet | 800 px | Minimum breakpoint for "desktop" layouts |
| Standard desktop | 1400 px | Comfortable multi-column layout width |

Desktop heights are not fixed test targets — designs must reflow to any height. Use `min-height: 100dvh` (with `100vh` fallback) for full-height containers.

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
