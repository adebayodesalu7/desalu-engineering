# Website and Dashboard Implementation Plan

## Goal

Grow the existing Desalu Engineering resource library into a practical,
staff-managed catalog for Android APK/AAB releases and themes. Improve the
publishing dashboard and public discovery without weakening staff authorization,
download controls, privacy, or the curated-publishing model.

Choose individual work items in [DASHBOARD-ROADMAP-TASKS.md](./DASHBOARD-ROADMAP-TASKS.md),
or ask to implement the roadmap phase by phase. This plan does not authorize
automatic deployment to Cloudflare or changes to Supabase production data.

## Existing foundation

- The staff dashboard already verifies a signed-in user's staff role and links
  to inquiry management and platform publishing workflows.
- Staff can publish resources through existing WordPress, Android, iOS, and
  HTML/CSS/JS workflows. Android publishing supports APK or AAB plus a source
  archive; themes are supported as resource packages.
- Supabase stores resource and release metadata, release status, changelog,
  artifact size and checksum, and Android build format.
- User bookmarks and user-owned download history are already represented in
  the Supabase schema.
- Staff authorization is currently a single `staff` role. Do not imply that
  role management or multiple permission levels exist.

## Guardrails and decisions

1. Keep publishing staff-curated. Do not enable community uploads or public
   publishing as part of dashboard improvements.
2. Keep user records private and staff pages behind server-enforced Supabase
   authorization. A hidden link or client-side check is not an authorization
   control.
3. Treat published release files as immutable. Updates should be new releases;
   use the existing publish/retire lifecycle rather than silently replacing an
   artifact.
4. Before adding tracking, reviews, newsletter collection, or public reports,
   define the data collected, its purpose, access, retention, and deletion
   behavior.
5. Aggregate download counts, categories/tags, featured ordering, and
   screenshots are now supported by the updated schema. Keep analytics
   aggregate-only and verify RLS and deployment before relying on new database
   features.
6. Keep additions incremental and mobile-friendly. Do not add a paid plan,
   payment flow, or third-party analytics without explicit approval.
7. Download reporting uses only aggregate counts from existing download history.
   User-level history remains visible only to its owner and is removed when
   their account is deleted. Staff dashboard layouts are private to each staff
   account. Storage snapshots are captured only when staff opens analytics;
   there is no historical backfill.

## Phased implementation

## Progress

- **Staff MFA — implemented locally; schema and site deployment required.**
  TOTP enrollment and sign-in verification are integrated into account sign-in.
  Staff access now requires AAL2 in the server-side `is_staff()` function,
  protecting existing staff RLS policies and RPCs. AAL1 sessions on protected
  staff pages are signed out locally and routed back through sign-in/MFA.
  Accounts without a staff role are not redirected to protected staff pages.
  Run the updated schema before deploying the matching site files; staff must
  enroll an authenticator on their next sign-in. The Supabase project has TOTP
  enabled. The local
  session confirms the updated-schema gate works; the complete enrollment and
  verification flow remains untested until the new schema is applied. The
  refreshed Cloudflare package includes the MFA flow. Lost-factor recovery
  requires identity verification and removal by a trusted Supabase project
  owner.
- **Shared staff-page access gate — fixed locally.** The shared dashboard
  script was also loaded by the publishing, resource-manager, and review pages,
  but stopped before initializing their shared access gate because those pages
  do not contain dashboard-only widgets. It now handles shared staff gating on
  all staff pages and runs dashboard analytics/layout only on the overview.
  Supabase staff-role checks remain enforced. Fresh authenticated browser
  checks confirmed the publishing page and overview open, the resource manager
  loads resources, and the review queue loads pending releases, reports, and
  activity. This fix is included in the refreshed Cloudflare package.
- **Phase 1 — Dashboard foundation: implemented locally.** The overview shows
  published-resource and release counts, open inquiries, draft and in-review
  release counts, pending user reports, and recent releases, inquiries, and
  staff activity. Deployment has not been performed. A platform-by-platform
  publishing guide is also available for Android, WordPress themes/plugins,
  iOS, and web projects.
- **Phase 2 — Resource and release management: implemented locally; backend
  smoke-tested.** The new staff resource manager
  includes search/filtering, release history, draft metadata editing,
  retire/restore controls, a release preview, and a storage scan with
  unreferenced-file cleanup. Retire/restore is server-authorized; a read-only
  storage scan was verified without removing any files.
  Separate stable/beta channels have not been added; the current lifecycle
  remains draft/published/retired.
- **Phase 3 — Metadata and public discovery: implemented and verified
  locally.** Catalog metadata, search, filtering, sorting, featured resources,
  and resource details are in place. Public catalog and staff manager both
  show the same three resources after refreshing the stale manager view. The
  deployed aggregate-download RPC is available and popular sorting works.
- **Phase 4 — Review and admin operations: implemented locally; database
  deployment has been smoke-tested; final report permission update is pending.**
  New releases require staff review; users can report catalog issues; review
  actions and metadata edits are logged; cleanup records a file count. Rejected
  releases remain in history with feedback; corrections are submitted as a new
  version. Review navigation, review/report counters, staff activity, an empty
  release/report queue, and mobile layout have been checked against Supabase.
  The latest local schema revokes direct report-table updates so all report
  decisions go through the audited RPC; rerun the complete schema before
  enabling report review actions in production. The Cloudflare upload folder
  and ZIP have been refreshed and checked against local source files, but are
  not deployed. No reports or releases were submitted or changed during
  verification.
- **Phase 5 — Aggregate analytics: implemented locally; new RPCs await schema
  application.** The staff dashboard shows 30-day daily downloads, 12-week
  downloads, popular resources, category totals, and storage observations.
  Analytics expose aggregate counts only. Existing user download history is
  retained until account deletion; storage snapshots start when staff opens the
  report and are not backfilled.
- **Phase 6 — Dashboard personalization: implemented locally; new RPCs await
  schema application.** Staff can drag widgets or move them with keyboard/touch
  buttons, save the order to their private account preference, and reset it.
- The Cloudflare upload folder and ZIP now include these changes and have been
  checked against source files and local references. Apply the latest complete
  [`supabase-schema.sql`](./supabase-schema.sql) before deploying; no deployment
  has been performed.
- Optional community ratings/reviews, comparison, newsletter, and AI features
  remain out of scope.

### Phase 0 — Confirm scope and baseline

- Inventory the current admin pages, Supabase schema, RLS policies, and public
  catalog behavior before changing any shared data model.
- Confirm which checklist IDs are selected. If the full roadmap is requested,
  deliver one phase at a time and validate each phase before continuing.
- Preserve existing inquiry handling, publishing workflows, authorization, and
  download behavior.

**Acceptance criteria**

- The selected work is clear and does not silently include optional features.
- Any database migration has a rollback/compatibility plan and preserves the
  existing RLS guarantees.

### Phase 1 — Dashboard foundation

- Organize staff navigation and add quick links to existing inquiry and
  publishing pages.
- Build the overview only from information that can be queried reliably.
- Add responsive, accessible layouts and clear loading, empty, and error states.
- Add recent releases and draft/review summaries only after their source and
  status semantics are defined.

**Acceptance criteria**

- Existing staff access checks still gate every staff tool.
- Keyboard and narrow-screen users can reach all navigation and actions.
- Counts and activity shown on the page reconcile with the underlying data.

### Phase 2 — Resource and release management

- Provide staff search/filtering and a version-history view for resources.
- Make release status, platform/build format, changelog, and artifact details
  easy to inspect before publishing.
- Add safe retirement/hide controls and explicit confirmation for destructive
  actions.
- Measure storage using authorized Storage metadata; only offer cleanup for
  unreferenced files, with confirmation and an audit trail.

**Acceptance criteria**

- Published artifacts remain unchanged and downloadable under current policy.
- Staff can distinguish drafts, published releases, and retired releases.
- Cleanup cannot remove a file referenced by a resource release.

### Phase 3 — Metadata and public discovery

- Add only metadata fields selected for implementation, such as tags,
  categories, screenshots, app icons, compatibility, and support/privacy links.
- Create database migrations, form validation, display escaping, RLS rules, and
  backward-compatible defaults together.
- Add public detail pages and search/filter/sort controls based on published
  metadata only.
- Add featured/new/theme sections after defining staff-controlled ordering.

**Acceptance criteria**

- Public pages reveal only published metadata and never private upload paths.
- Existing catalog items continue to render when optional metadata is empty.
- Search and filters work on mobile and are keyboard accessible.

### Phase 4 — Review and admin operations

- Keep new resources in the current draft/review process until staff publish.
- Add a review checklist for ownership/licensing, secrets, private data,
  package integrity, and installation checks.
- Add activity logging and reporting workflows with limited, staff-only access.
- Add extra roles only if requested, with explicit least-privilege policies.
- Let signed-in users report a published resource; disclose that reports are
  tied to their account and reviewed by staff. Reports remain in the review
  record after resolution; deleting the associated account removes them.

**Acceptance criteria**

- Review/publish actions are authorized and auditable.
- Staff can see report counts and review user-submitted reports; report access is
  limited to the reporter and staff.
- A rejected or reported resource cannot accidentally remain publicly available.
- No user can grant themselves staff access or read another user's records.

### Phase 5 — Analytics and optional engagement

- Use current download history; do not add tracking events. Retain each user's
  history until account deletion, and expose only aggregate counts to staff.
- Record daily storage snapshots only when staff opens analytics; disclose that
  there is no history before the first snapshot.
- Treat ratings, reviews, comparison, newsletter, stories, and AI tools as
  separately selectable enhancements, not dependencies of the core dashboard.

**Acceptance criteria**

- Reports are based on recorded events, not inferred or fabricated metrics.
- User-specific download details are not exposed to other users.
- Analytics RPCs are staff-only and return totals, dates, categories, and
  resource names—not user IDs, account emails, or individual download rows.
- Optional engagement features have moderation and data-lifecycle rules.

### Phase 6 — Dashboard personalization and release

- Allow staff to reorder the dashboard's overview, activity, quick-action, and
  analytics widgets with drag-and-drop or accessible move buttons.
- Persist each layout in a staff-only preference row, with an explicit save and
  reset action; validate the widget set in the database RPC.
- Refresh and validate the Cloudflare package only after the required schema
  has been applied and the user confirms deployment.
- Run JavaScript checks, page/accessibility checks, and focused Supabase/RLS
  validation for changed behavior.
- Refresh the Cloudflare upload copy only after the user approves a deployment;
  deploy separately.

**Acceptance criteria**

- User preferences cannot change another staff member's layout unless sharing
  is explicitly designed.
- Existing live-site files remain unchanged until deployment is approved.
- Keyboard and touch users can reorder widgets without dragging.

## Suggested starting sequence

For the most useful, lowest-risk start, select **DASH-01 through DASH-04**:
dashboard navigation, accurate overview cards, quick actions, and responsive
accessibility. Then add release management and the public catalog improvements
based on actual usage. Keep analytics, reviews, and AI features for later.
