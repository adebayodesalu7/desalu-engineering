# Multi-Business Platform: Implementation Plan

## Outcome

Turn the Desalu Engineering site into a small, modular toolkit that gives signed-in users useful repeat value, while keeping public inquiries and the basic project planner open to everyone. The first release focuses on saved project briefs and a curated download library. It is a focused MVP, not a promise to build a full SaaS suite or Git hosting service.

## Backend migration status

The owner selected a new dedicated Supabase project for the entire Desalu site;
AfriqueDating remains separate. Browser modules are being moved from Firebase
Auth, Firestore, and Storage to Supabase Auth, Postgres with Row Level Security,
and a private Storage bucket. See [SUPABASE-MIGRATION.md](./SUPABASE-MIGRATION.md)
for the setup and cutover checklist. The Firebase emulator releases and user
accounts have not yet been imported; do not treat the empty Supabase catalog as
a completed data migration or production cutover.

## Product decisions for the first release

- Keep the services site, inquiry form, and basic project planner usable without an account.
- Require an account to save briefs, bookmark resources, see download history, and download files.
- Start with free downloads; do not add payments until pricing, terms, and payment-provider decisions are approved.
- Publish resources through staff curation only. Community uploads, comments, ratings, and full Git workflows are out of scope.
- Treat WordPress websites as source material for reviewed, reusable products such as starter sites, themes, or plugins—not as unrestricted copies of live client websites.
- Publish a package only when Desalu owns the distributable work or has documented permission and licenses for every included asset. Remove credentials, private/customer data, environment files, and client-specific content before review.
- Keep public catalog metadata, user-owned workspace records, and private client-project data separately authorized. Signing up must never grant access to client projects or another user's records.

## Stages and completion criteria

### 0. Product and asset readiness

1. Keep validating the intended users and repeat workflows in parallel with implementation. Record evidence and unresolved assumptions; internal agreement is not market validation.
2. Inventory the existing WordPress sites and planned products. For each, record its original purpose, ownership, client involvement, reusable components, third-party assets, and permission to redistribute.
3. Select only clearly distributable material for the first catalog. Convert suitable work into a clean demo/starter package; exclude client data and anything with unclear rights.
4. Decide the initial free offer and workspace behavior. Billing stays out of scope until terms and pricing are explicitly approved.

**Ready when:** there is at least one candidate release with documented ownership/permissions, a defined audience and use case, and no unresolved privacy or licensing concerns. If no package is ready, launch the catalog shell without falsely claiming downloadable products are available.

### 1. Workspace and authorization design

1. Design the signed-in workspace around saved briefs, bookmarks, download history, and clear empty states.
2. Define owner-only access for each user record, account deletion/export behavior, and separation from the existing staff-only inquiry system.
3. Define catalog and release metadata: title, summary, resource type, author, version, release date, license, supported WordPress/PHP versions where relevant, requirements, setup steps, changelog, file size, and checksum.
4. Define secure artifact storage and delivery. The browser may list approved catalog metadata, but file access must require a signed-in user and must not expose staff upload paths or private client files. Keep separate publishing workflows for WordPress, Android, iOS, and HTML/CSS/JS; Android releases provide separate build and source downloads, while iOS releases provide an Xcode source ZIP.
5. Keep publishing staff-only and downloads read-only for users. Use immutable releases so an updated package is a new version, not a silent replacement.

**Ready when:** data ownership, Firestore/Storage authorization, publishing roles, and download behavior are documented and testable. Existing inquiry rules remain intact.

### 2. MVP build

1. Replace the generic signed-in account landing state with a useful workspace and navigation.
2. Add save, edit, organize, and delete for the existing project planner's briefs; retain the no-account planner flow.
3. Build a public catalog for staff-published resources, with sign-in required before download.
4. Add staff publishing for resource metadata and versioned packages, with validation and clear error reporting.
5. Add bookmarks and personal download history.
6. Keep private client projects on their separate, explicitly assigned access path.

**Ready when:** a user can plan without an account, sign up, save only their own brief, browse the catalog, download an approved release after signing in, and see their own bookmarks/history. Staff can publish or retire releases without granting users access to other records.

### 3. Package review and pilot

1. Review each archive for ownership/license documentation, secrets, personal/client data, malware, unexpected executables, and prohibited content.
2. Test installation and removal on a clean WordPress test site and verify documented compatibility.
3. Pilot with a small set of invited users; observe whether they can find, understand, install, and reuse resources.
4. Fix security, usability, and package issues before public promotion. Do not claim market validation until user evidence supports it.

**Ready when:** access-control tests pass, packages install as documented, privacy and licensing checks are complete, and pilot feedback has been reviewed.

### 4. Later modules

Only after the MVP is secure and used, evaluate additional small-business tools, paid plans, a client project portal, PWA installability, and native-app store submission tracking. Billing and community publishing remain separate decisions and are not prerequisites for the first free pilot.

## Initial data and trust boundaries

| Area | Intended access |
|---|---|
| Public catalog metadata | Readable without signing in |
| Resource release files | Downloadable only to authenticated accounts after authorization |
| Saved briefs, bookmarks, download history | Read/write by the owning account only |
| Staff publishing controls | Trusted staff only |
| Inquiries | Existing public-create/staff-read-and-update rules remain unchanged |
| Private client projects | Explicitly assigned client/staff access only; never inferred from signup or a supplied project ID |

The client-side Firebase configuration is public by design; authorization must be enforced by Firebase rules and, where needed, trusted backend logic. Do not place secrets in the browser or rely on obscurity of storage URLs.

## First implementation sequence

1. Inventory WordPress work and permissions; choose one suitable first release.
2. Finalize workspace, catalog, and secure file-delivery design.
3. Build the account workspace and saved briefs.
4. Build staff-only, platform-specific release publishing and the authenticated catalog/download flow. Android accepts one APK or AAB build plus a separate source project ZIP; iOS accepts an Xcode source ZIP. Store-submission tracking is not included.
5. Add bookmarks and download history.
6. Audit the first packages, test authorization and installation, and run a small pilot.

The detailed execution status and prerequisites are tracked in the session task list.

For the staff-dashboard and resource-library upgrade backlog, see
[DASHBOARD-ROADMAP-TASKS.md](./DASHBOARD-ROADMAP-TASKS.md) and
[DASHBOARD-IMPLEMENTATION-PLAN.md](./DASHBOARD-IMPLEMENTATION-PLAN.md).

## Current build progress

- **Saved project briefs — in progress:** the planner now has a save action that carries an explicitly selected brief through sign-up; the account page has a saved-brief list with edit and delete controls; Firestore rules scope records to their owner. Keep this task open until Firebase rules and services are deployed and the signed-in save/edit/delete and cross-account denial flows are verified.
- **Workspace design — in progress:** saved briefs, bookmark management, and download history are now represented in the account workspace; Firebase-backed data loading is owner-scoped. The user’s signed-in browser session receives permission-denied errors for these reads. The local rules must be deployed and verified before this feature can be considered working. Product-demand validation remains ongoing, so this is a provisional MVP direction.
- **WordPress inventory — latest-by-date selection:** compare modified times among each product's same-title/versioned packages, then validate the newest build rather than choosing by version label alone. Of the reviewed theme ZIPs, Metro Govt Portal 1.0.2 is newest overall (2026-10-10 06:08); its Theme Check fails on theme-owned post types, taxonomies, and shortcode, so it is not yet a finished release. The next-latest passing theme is Techtrix Consult Civic Government 1.6.2 (2026-10-10 05:04), freshly verified and published to the isolated emulator as a presentation-only demo starter (details below). Techtrix Supply 1.2.2 (2026-10-09 15:23) was the selected passing standalone package; 1.2.3 is now a locally tested candidate that fixes subdirectory links. Do not count the newer Civic Companion 1.0.1 ZIP (modified 2026-10-25) as a finished theme: plugin work is deferred and that package is unverified. EGovt 1.10.0 final-clean-v7 is older (2026-09-27) and has unresolved package blockers below.
- **Techtrix Supply 1.2.3 — published to the local Firebase emulator only:** after the owner confirmed redistribution rights and approved publishing as a demo/starter, `Techtrix Supply — Demo Starter` version 1.2.3 was published as resource `techtrix-supply-demo`, release `TYEqgUukYR1bFTYMVUD1`. The Firestore resource and release records are published, and `artifact.zip` is in the Storage emulator. The resource-library card loaded, the authenticated download flow verified the artifact SHA-256 (`40a730a9733b9282524472f62c28dec087d5ee29360bb0be2f9343e04d3485f1`), and download history recorded the download. Live Firebase remains unchanged. Emulator data is exported to `C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Supply-1.2.3-emulator-export`, with its restart config at `C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Supply-1.2.3-emulator-config.json`. The isolated release emulator uses Auth 19099, Firestore 18080, Storage 19199, and Emulator UI 4000; the local library preview is at `http://127.0.0.1:3000/resources.html`. Product/cart/checkout/payment behavior remains untested, and the approved sample storefront copy still requires customization before any real-store launch.
- **Civic Government 1.6.2 — published to the isolated Firebase emulator only:** on 2026-10-29, after the owner confirmed redistribution rights, the WordPress publisher created resource `techtrix-civic-government-demo`, release `gTeJ472nXDesRwPNSDbO`, version 1.6.2. The 204,447-byte ZIP at `C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Consult-Civic-Government-Theme-1.6.2.zip` matches all 55 source files; its SHA-256 is `b2508136c50eb00eb4d628c841e5b3f8b3ec2052ef612fb71e928d0d3f29cfc9`. All 20 PHP files passed PHP 8.5 lint. Theme Check 20260901 passed 7,198 tests with one informational text-domain notice. A clean local WordPress install activated and rendered it without browser console/network errors or horizontal overflow at 390 px. The authenticated library download returned 204,447 bytes and matched the release SHA-256; download history was recorded. The emulator catalog now contains both Civic and Supply; live Firebase was not changed. Combined emulator data is saved at `C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Civic-Government-1.6.2-emulator-export` with config `C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Civic-Government-1.6.2-emulator-config.json`. The theme is presentation-only: it has no civic post types, taxonomies, shortcodes, forms, or sample content, and its placeholder copy/images need customization. The Civic Companion plugin is not included, reviewed, or approved for release.
- **Metro Govt Portal 1.0.2 — package matches source; not release-ready:** the ZIP matches all 31 source files and all four PHP files lint. It installed locally without activation. Theme Check ran 1,639 tests and failed on `register_post_type()`, `register_taxonomy()`, and `add_shortcode()` in the theme, plus a missing `Tested up to` header. Its README declares GPL-2.0-or-later and explicitly warns that civic content editing/display is theme-dependent. Moving those features into a companion plugin would require the plugin work currently deferred; keep this package out of the release queue for now.
- **EGovt 1.10.0 final-clean-v7 — package matches source; not release-ready:** the ZIP matches all 15 source files and all nine PHP files lint. It installed locally without activation. Theme Check ran 3,353 tests and reported required issues: Cloudflare CDN resources, missing `readme.txt`, screenshot, and `License`/`License URI` headers; it also warned about the theme slug and missing copyright notice. The source references remotely hosted Unsplash demo photography and placeholder/example civic copy. Resolve external asset, ownership, licensing, and packaging concerns before reconsidering it.
- **Local WordPress preview — prepared:** the site title is now `Civic Theme Preview`, with a tagline identifying Civic Government 1.6.2. WooCommerce site visibility was switched from Coming soon to Live so the local homepage can be viewed without the coming-soon overlay; the XAMPP site remains on localhost. The active theme and desktop/mobile preview checks pass. Existing old WooCommerce menu links and sample posts/profiles remain and need curation before a polished walkthrough. Do not enter real client or public data.
- **Resource catalog and publishing — local emulator client/rules path verified; live publishing remains blocked:** Auth, Firestore, and Storage emulators run on ports 9099/8080/9199. Local pages show the emulator-only banner and use a demo project plus a synthetic Storage bucket; the existing live-project config remains unchanged. The catalog loads after correcting reserved-field access in Firestore rules. A disposable non-staff account is denied staff publishing; the guarded Admin SDK helper grants `staff: true` only with the explicit Auth emulator host and no Google application credentials. With a synthetic 188-byte ZIP, the client SDK successfully created draft metadata, uploaded the artifact, published a test release, displayed it in the catalog, downloaded it after authentication, verified its SHA-256, and recorded download history. Non-staff and signed-out clients were denied draft reads and uploads; a signed-in non-staff client could read the published test artifact. The temporary test release, object, and history record were removed. That earlier smoke test did not submit the publisher form; the later owner-approved Supply and Civic emulator releases are documented above. Firebase Console still requires a Spark billing upgrade for live Cloud Storage. Do not upgrade billing without owner approval, deploy the local CORS template, or attest to a clean-site test before package review and clean-install checks.
- **Storage CORS — local configuration prepared, not deployed:** `storage.cors.json` now allows the local development origins on ports 3000 and 8765 and the GET/HEAD/POST/PUT methods needed for library reads and browser package uploads. Apply it to the correct Firebase Storage bucket only after verifying the project and bucket. Add the real hosted origin before production use; CORS deployment and browser upload remain untested.
- **Browser smoke test — partial pass:** the homepage and mobile menu render without horizontal overflow at 390 px; the project planner generated a brief and handed it to the inquiry form without submitting it; sign-up routing retained the pending brief. Local auth, catalog, and publisher pages show the emulator notice; the catalog displays its expected empty state. One disposable emulator account was created; no live account or inquiry was created or submitted.
- **Dedicated staff URL — implemented and locally verified:** `admin-dashboard.html` is the central, staff-claim-protected entry point for the inquiry inbox and resource publisher. A disposable emulator account was denied before the staff claim and admitted after the guarded local grant; live staff claims remain untested.
- **Platform publishing choices — implemented; route and access-denial checks passed:** the staff publishing hub routes to distinct WordPress, Android, iOS, and HTML/CSS/JS forms. Browser checks confirmed each route shows the intended fields. Android releases store one APK or AAB build and a source ZIP as separate, checksummed downloads; iOS and web releases remain single ZIP downloads. Each file is currently limited to 50 MB. The updated rules loaded in an isolated emulator, where unauthenticated Firestore writes and Storage uploads were denied. An authenticated Android publish/download round trip remains untested; no Play Store/App Store submission workflow or live release has been added.
