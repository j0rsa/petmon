# Shared application extension and access control

Implementation reference for OSS `0.26.0`, built on `0.25.0`. This document describes generic public contracts; downstream product schemas and policies belong in their own applications.

Petmon remains a standalone single-tenant care tracker. Its library and shared UI provide composition interfaces alongside token management, instance administration and integration safeguards. Public interfaces use generic actors, resources, actions and settings; they do not introduce a tenant product or product-specific schema.

## Release scope

These prerequisites are one independently shippable feature release with one minor version bump: `0.25.0` to `0.26.0`. Follow the one-bump-per-PR rule in `CLAUDE.md` on follow-up changes. Pre-1.0 major features use minor versions.

The standalone application retains shared-pet behavior through an explicit default resource policy. Its settings tiers remain system, user and pet. Custom identity providers, resource ownership models and extension-specific UI live with their consuming application.

## Integration surfaces addressed

- `AppState` and `ServiceContext` carry explicit resource, runtime, notification and identity adapters.
- Care application services accept `ServiceContext`; repositories remain lower-level persistence primitives.
- Production and test macros use `api::configure_full` inside the authenticated scope.
- MCP checks `mcp` at the transport boundary. That scope intentionally enables both read and write care operations through MCP.
- API-token creation, scope changes and activation enforce effective permission attenuation; ordinary management is owner-scoped.
- Standalone notifications retain shared behavior through an explicit backend. Restricted embedders provide their own durable ownership, queries and audience implementation, including deleted-pet events.
- Telegram message references include original destination and nonsecret bot identity to prevent cross-chat mixing and destination changes redirecting edits.
- Shared frontend composition supports custom pet collection/selection/create and resource-specific effective permissions.

## Concrete entry points

- `auth::AppState::embedded(pool, timezone, policy, runtime, identity_adapter, notifications)` requires all restricted-mode adapters. `AppState::new` / `new_with_tz` explicitly configure standalone behavior.
- `embedding::{ServiceContext, ResourcePolicy, ResourceAction, PetVisibility, RuntimeResolver, IdentityAdapter}` define the backend integration contract. Policy futures use `futures::future::BoxFuture`.
- `AppState::request_context(&HttpRequest)` derives a context from the authenticated actor. `worker_context("purpose")` supplies trusted maintenance access while preserving runtime and notification adapters. Never construct standalone/trusted context for a user operation.
- `notification_runtime::NotificationBackend` owns event creation, list/count/read/dismiss, and current recipients. Implement persistence plus ownership in its `create` operation atomically. `Recipients::Readers([])` is no delivery; only explicit `AllSubscribers` broadcasts.
- `mcp::registry::{ToolRegistry, ToolHandler}` registers schema and implementation together on `AppState::mcp_registry`.
- `AppState::{edition, features, application_version}` customize `/info`; `base_version` always identifies the shared crate.
- Frontend integrations import `frontend/src/embedding.ts`; the exported provider and extension types compose shared `App` or individual pages. See the frontend source types for exact optional adapters.

Worker entry points are `nudge_service::spawn_with_context`, `feeding_nudge_service::spawn_with_context` and `elimination_classifier_retrain::spawn(ServiceContext)`. Minute reminder ticks accommodate fractional-hour timezone offsets. Medication keys use the latest due deadline, not the current hour; feeding keys use the scheduled window. Repeated local slots deduplicate, and skipped DST feeding windows catch up on the first tick after the gap. The old pool/timezone reminder constructors explicitly use standalone defaults and must not be used by restricted applications. A failing per-pet runtime resolution skips that pet and records a diagnostic.

## Identity and service authorization contracts

Provide a trusted authentication/identity adapter for an embedding application while retaining the default OSS OIDC, API-token and DEV_MODE behavior. It must resolve a canonical actor consistently for REST, MCP, Shortcuts, API-token owners and per-user reader/settings keys. Do not key identity by a display name or token alias. The adapter is registered by trusted startup code, never chosen from caller-provided headers/body fields.

Introduce an explicit request/service context carrying actor, credential scopes, resource policy and runtime settings resolution. Shared application services are the authorization boundary; a new transport must not bypass checks by calling a pool-only service. Internal maintenance/worker operations use explicit trusted context with a clearly bounded purpose. Low-level repositories remain persistence primitives.

Generic resource actions include `View`, `WriteRecords`, `WriteProfile`, `ManageIntegrations`, `Create`, `Delete` and `ChangeStatus`. A mixed-field update requires all applicable actions. The default standalone policy allows existing shared-pet access after scope checks; an embedder can supply a restrictive policy. Make the default explicit at standalone composition, so an embedding application can require its own policy at startup.

Policy contract requirements:

1. Resolve persisted record ownership before returning or modifying a resource by ID. Validate relationships among pet, medication, formulation, assignment and bundle references.
2. Authorize all batch items before any writes or external side effects.
3. Apply visibility inside database selection before pagination/count/aggregation; distinguish unrestricted access from an empty authorized set. Use an explicit visibility type rather than ambiguous null/empty conventions, and account for large result sets without unbounded query parameters.
4. Require a policy decision for resources without a pet, including global day notes and notifications whose pet has been deleted. Missing context is not unrestricted visibility.
5. Ordinary care operations authorize at admission; an operation already admitted may finish while a concurrent revocation commits. Subsequent requests recheck live policy. Pet creation/deletion additionally authorize on the same transaction connection as their lifecycle writes. Embedders needing serializable revocation for every care mutation need a stronger transaction contract; this API does not promise cancellation of already-admitted writes. Authorization/database errors never cause permissive fallback.
6. Share enforcement across REST, MCP tools/resources, legacy MCP aliases and Shortcut individual/bundle adapters.

Create an operation inventory covering every API/tool/resource, analytics and classifier route, bulk operation, notification producer and direct repository call site. The inventory and restrictive fake-policy tests are part of the public extension contract, not a private business-role implementation.

## Transaction-aware lifecycle

`pet_service::{create_in_transaction, delete_in_transaction}` compose lifecycle operations on a supplied connection. Embedders can create a pet and required related records atomically rather than attaching related data after the pet has committed.

The embedding lifecycle resolves/authorizes its destination and runs public pet persistence plus extension writes on the same transaction/connection. Implement `ResourcePolicy::authorize_transaction` using that connection, not another pooled connection; custom policies default to denial when the hook is omitted. Standalone creation uses the same validated primitives.

The caller owns transaction commit/rollback and any application-specific retry/idempotency key. Run outbound messages only after commit. Regression tests verify rollback when related creation fails and guarded deletion uses the same transaction.

## Credential scopes and instance administrator

Scopes describe access, not a numeric ordering:

| Scope | Meaning |
|---|---|
| `api_read` | Ordinary REST reads |
| `api_write` | Ordinary REST writes, including permission to request token creation |
| `mcp` | MCP endpoint and both read/write care operations through it |
| `all` | REST read/write and MCP access; administrative token access only with a live server-side administrator role |

`mcp` does not grant REST token-management access. `api_read` alongside `mcp` does not make MCP read-only. Resource authorization still applies to every operation. API-token administration requires literal `all` plus the owner's current `instance_admin` role; combining the three ordinary scopes or using legacy empty scopes does not qualify. Interactive sessions require the live role and the endpoint's read/write scope.

Token creation, scope changes and reactivation cannot exceed the calling credential's authority. `api_write`/`all` enables creation but not stronger credentials. Only a literal `all` API token can delegate `all`; the combined ordinary scopes cannot, even when its owner is not yet an administrator. This prevents escalation through a future role grant. Omitted scopes request `all` and must pass the same checks; empty requested lists are invalid. API token owners are always set server-side. Include attempts to edit the current credential in attenuation checks.

Ordinary token list/revoke/activate/delete/update operations are owner-scoped. Admin endpoints can inspect/revoke instance credentials after role and scope checks. An `all` token follows its owner's live administrator role; regular device/MCP tokens never acquire administrative access. Revoked administrator grants take effect on subsequent requests.

Shared instance-admin storage is keyed by the resolved actor, with CLI list/grant/revoke and documented bootstrap/recovery. `GET /auth/me` exposes `roles`, `scopes` and credential `kind`, without a separate capabilities model. Frontend controls check both the role and credential authority. DEV_MODE may grant admin for local development, but authorization tests must also exercise real non-admin and restricted-token identities.

Instance settings (OIDC, Telegram bot configuration, sensitive VAPID management) require admin permission. Public VAPID configuration needed to subscribe remains available to ordinary authorized users. Personal settings and push/device controls stay personal. Shared Settings components gate queries as well as rendered sections. Record administrative actions without secrets.

Document the standalone upgrade: operators must establish an administrator before restricted settings become necessary. Define environment bootstrap as one-time initialization or explicit authoritative configuration; do not silently undo CLI revocation at restart. Include last-admin protection and offline recovery. This is an intentional standalone access-control change, not something hidden by passing DEV_MODE tests.

## Notifications and external delivery

Inject a notification/audience service into all producers, including request-triggered classification failures, medication/feeding workers and spawned tasks. Merely passing an audience to worker startup is insufficient.

Provide hooks for notification ownership/lifetime decisions, list/count/read/dismiss authorization and recipient resolution. Nullable/deleted resource ownership must be handled explicitly. A delivery operation receives the resource context and resolves the current authorized recipients when sending; errors cannot turn into an unrestricted broadcast. Standalone composition may explicitly retain its current broadcast behavior.

An embedder can implement personal dismissal without deleting shared events. Standalone dismissal still deletes events globally; durable delivery claims survive deletion so a worker cannot recreate a dismissed reminder in the same slot. Restricted notification backends must provide their own durable deduplication. Subscription update/test/delete validates caller ownership (transfer additionally accepts proof of the original browser keys).

Before each queued push delivery, shared code re-resolves the audience and rechecks the subscription owner and encryption keys. A failed resolution or changed subscription skips that delivery. An already-admitted network send cannot be recalled; provider/device queues are outside this authorization boundary.

Fix Telegram references in shared code: identify delivery by `(bot_identity, chat_id, message_id)` (at minimum chat ID and message ID for a fixed bot), persisting the original chat/thread/bot context. Scope medication-bundle undo to that delivery and pet. Changing current pet settings cannot redirect edits/deletes of an earlier delivery. If historical destination cannot be recovered, skip unsafe external mutation and report a diagnostic rather than guessing.

Treat integration configuration as a separate policy action from ordinary profile writes. Standalone policy may allow it under existing write permissions; restricted embedders decide who can change destinations. Never persist bot secrets in per-record delivery context.

## Effective timezone and UTC instants

Expose a per-resource effective-timezone resolver; the OSS implementation returns the instance timezone. APIs, MCP, Shortcuts and workers use the same resolver for real-time records, due dates, reminder slots, nutrition status and journal boundaries. Standalone `/info.timezone` supplies the same zone to the frontend before mounting care forms; embedded frontends supply ready per-resource zones. Do not make custom timezone support a worker-only wrapper.

Each record stores one UTC RFC3339 instant in `occurred_at` (or weight's `measured_at`), normalized to fixed nanosecond precision and a `Z` suffix for lexical SQL ordering. No parallel UTC fields, source timezone or civil snapshot are stored. APIs require explicit-offset RFC3339 input; frontend forms resolve local civil input in the resource timezone, reject DST gaps and ask which instant a repeated hour means. Existing clients must update with this release.

Date-only fields and recurring wall-clock schedules retain their civil semantics: birthdays, `local_date` journal days and treatment dates are not timestamps to convert blindly. Editing a journal date alone does not move the instant. Display and chart hours use the current effective resource timezone, while elapsed durations and cutoffs use UTC. A timezone change can change the displayed clock time without rewriting the journal day.

Startup refuses legacy/noncanonical record timestamps. Back up the database and stop writers, then run `petmon migrate-record-times --timezone TZ` for a dry run and repeat with `--apply` to convert atomically. The library helper is `record_time::backfill_legacy(&pool, historical_timezone, apply)`. Invalid/ambiguous/nonexistent civil timestamps block the whole conversion; resolve them with explicit offsets first. Mixed historical timezones need explicit per-row correction, not a guessed global zone. Existing journal dates are preserved. Migration `026_record_instants.sql` records migration metadata rather than adding duplicate timestamp columns. Embedders must use the same startup gate; released migrations are unchanged.

Provide clock/context injection for deterministic midnight, timezone and DST tests. Keep dedupe semantics stable across restart and timezone changes. Standalone instance-time behavior remains the default. Shortcut menu/take request formats and real-time-only restrictions do not change; server-side resolution supplies the effective timezone.

## HTTP and MCP composition

Expose one `configure_full` route registration used by production and test macros, including auth, health, info, all care pillars, notifications, push, settings, token routes, user/pet settings and Shortcuts. Authentication wrapper ownership and the public-path allowlist must be explicit and tested; route registration alone does not apply middleware. Embedders register extra routes under the same appropriate protection.

Pass actor/context to MCP tool dispatch and resource reads. Introduce a registry that can replace both a tool's schema and handler, or add tools, without modifying public product schemas. Normalize aliases before registry lookup. Reject duplicate/conflicting registration and prevent overridden tools from falling through to the default handler. Test `tools/list`, `tools/call`, direct legacy methods, resources and prompts through the production wiring.

Allow embedders to report edition, features and their version plus base-library version in `/info`; standalone keeps its existing version and adds only generic metadata. No private capability names or schemas in public OpenAPI.

## Shared frontend contracts

Provide explicit, typed composition points for:

- Additional routes and navigation/chrome slots.
- Visible pet collection and controlled selection/provider integration.
- Selection persistence strategy and account-change cleanup.
- Pet creation action, including any embedder-required context.
- Per-resource effective permissions, including profile, integration and status actions.
- Identity/session integration and role/scope-aware admin Settings controls.

Intersect scope and resource permissions; an extension must not broaden a credential. Pending permissions are not permission to mutate. Permissions take the actual resource ID, not only ambient selection, so direct links work correctly. Query keys and invalidation contracts account for identity changes and custom collection context; cancel obsolete requests that could repopulate stale state.

Default implementations preserve standalone behavior. Keep shared pages reusable rather than requiring an embedder to copy Pets/Health/Settings/Layout. Ensure the frontend build can import shared sources with one React/context identity and compatible dependency resolution. Follow existing Storybook desktop, 360x700 and applicable 320x720 requirements.

`ApplicationExtensions.permissions` is required in embedded composition; absence/pending resolution never means unrestricted access. `configureApiSession` requires `getToken`, `getSessionKey` and `onUnauthorized`. The session key must change whenever credentials/account context changes, including cookie sessions. Optional `session.installApiToken` enables the shared Remember device flow for custom sessions; otherwise that flow is hidden. Session changes replace the query cache and authenticated form tree; obsolete 401 responses cannot clear a replacement session.

Optional `ApplicationExtensions.timezone(petId)` supplies an already-resolved IANA zone for shared page/calendar/form date defaults, and `now()` injects a clock for deterministic tests. Without this adapter, standalone browser-time defaults remain unchanged. Load runtime data before rendering the corresponding collection and change `sessionKey` on runtime-policy changes. Backend runtime resolution remains authoritative for writes and workers; the frontend adapter only aligns the displayed/default civil day with it.

## Operation inventory and verification

| Entry points | Shared authorization boundary / additional requirements |
|---|---|
| Pets list/get/create/PATCH/delete | `pet_service`; SQL visibility, field-specific actions, same-connection lifecycle hooks |
| Nutrition records and batch, schedules, status, day summaries/notes, analytics | Corresponding care services; all batch pets before writes; filter before pagination/aggregation; explicit global-note decision |
| Elimination records, analytics, duration profile, classifier status/retrain | Corresponding care services and classifier wrappers; persisted parent ID and configuration action |
| Weight records, summaries, tags; health-state records | Weight/health services; scoped filters, per-pet runtime |
| Medications, formulations, assignments, bundles, intake and bundle take | `medication_service`; persisted parent/related-ID validation; `WriteRecords` for treatment configuration |
| Pet settings | Explicit `View`/`WriteRecords` policy using request context |
| Shortcuts menu, individual take, bundle take | Same care services/policy/runtime; unchanged query contract and realtime-only restrictions |
| Notifications list/count/read/read-all/dismiss | Injected `NotificationBackend`, including nullable/deleted resources |
| Classification-failure notifications and reminder workers | Same injected notification backend; audiences resolved when delivering |
| Push subscription create/update/test/delete | Ownership or original-browser-key proof for transfer; no endpoint-only impersonation |
| OIDC/Telegram settings, tokens and admin tokens | Live administrator role plus credential scope, or owner-scoped token management; token attenuation on every authority-changing operation |
| MCP tools/resources and direct legacy method aliases | Shared context/services plus normalized registry override; token-scope management separately requires `api_write` |

When extending the application:

Implement as one feature scope with reviewable internal steps:

1. Define operation inventory and typed identity/policy/transaction/audience/timezone contracts.
2. Unify route composition and service authorization; retain explicit standalone defaults.
3. Add token attenuation and shared admin gating/bootstrap with upgrade documentation.
4. Correct Telegram delivery identity and thread audience/timezone context through every producer/consumer.
5. Expose MCP registry and frontend provider/action/permission seams.
6. Update public OpenAPI, token UI, generic embedding documentation and applicable `CLAUDE.md` rules for implemented behavior.
7. Run `make check-be`, `make check-fe`, applicable shortcut checks, migration/upgrade tests, and restrictive fake-adapter integration tests; bump once under the repository version rule when implementing the release.

Tests cover default standalone compatibility, per-action denial and empty visibility, indirect IDs and mixed batches, nullable resources, transactional rollback, token attenuation (including aliases/empty scopes), explicit admin authority/revocation, cross-chat Telegram ID collisions and destination changes, notification audience errors, effective-timezone behavior, and MCP override parity. These tests validate reusable contracts without introducing a private ownership schema into OSS.

Later database portability should preserve shared repository reuse, with explicit database-specific migrations and integration tests. PostgreSQL support is not a prerequisite for this feature release.
