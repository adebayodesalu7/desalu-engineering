# Desalu site: Firebase to Supabase migration

This migration is for the **Desalu website only**. AfriqueDating keeps its
existing Supabase project and data; the site will use a new, dedicated project.
The current Firebase configuration and emulator remain in place until the
Supabase implementation is configured and all checks pass.

## 1. Create the dedicated Supabase project

1. Sign in to [Supabase](https://supabase.com/dashboard) and create a new
   organization or select the organization that should own the Desalu project.
2. Choose **New project**, name it `desalu-platform`, select a region near the
   site's primary users, and generate a strong database password. Save that
   password in a password manager; do not put it in website code or send it in
   chat.
3. Use the Free plan for development if its quotas and inactivity pause fit.
   Supabase currently includes 1 GB of file storage on Free; projects on Free
   can pause after inactivity. Recheck the plan before production use.
4. Wait until the project reports that it is ready. Keep the project's region,
   URL, and database password private.

## 2. Create the storage bucket, tables, and security policies

1. In the Supabase dashboard, open **SQL Editor** and create a new query.
2. Copy all of [`supabase-schema.sql`](./supabase-schema.sql) into the editor
   and run it against the new, empty Desalu project. If you already ran an
   earlier copy of this script, run the updated complete script again so the
   catalog metadata, review/report workflow, staff activity log, release-review
   RPCs, aggregate analytics, private dashboard preferences, storage snapshots,
   storage-cleanup audit function, staff MFA assurance enforcement, and current
   policies are installed.
3. Open **Storage → Buckets**. Confirm that `resource-releases` exists and is
   **private**. The SQL migration sets a 50 MiB per-file limit and restricts
   allowed MIME types, including the `application/x-zip-compressed` type
   reported for ZIP files by some Windows browsers. Do not make this bucket
   public.
4. In **Table Editor**, confirm the tables `resources`, `resource_releases`,
   `resource_reports`, `admin_activity_log`, `admin_storage_snapshots`,
   `admin_dashboard_preferences`, `inquiries`, `saved_briefs`, `bookmarks`, and
   `download_history` have Row Level Security enabled. Users can submit reports
   for published resources; staff review reports and releases through
   server-authorized RPCs. Analytics and dashboard preferences are available
   only through staff-authorized RPCs; user-level download history is not
   exposed to staff. The staff role table is in the non-exposed `private`
   schema.

Download reporting uses aggregate counts derived from existing download
history. Individual history rows remain available only to their owner and are
removed when the account is deleted. No additional download-event tracking is
introduced. Storage snapshots are captured when staff opens the analytics
dashboard; snapshots are daily and are not backfilled, so earlier storage
trends will not appear.

The bucket object layout is:

```text
resources/<resource-id>/releases/<release-uuid>/artifact.zip
resources/<resource-id>/releases/<release-uuid>/build.apk
resources/<resource-id>/releases/<release-uuid>/build.aab
resources/<resource-id>/releases/<release-uuid>/source.zip
```

Only authenticated staff can upload. Authenticated users can download a file
only when its matching resource and release are published. The catalog metadata
is readable without signing in.

## 3. Configure Supabase Auth and the browser client

1. In **Authentication → Providers**, enable Email/password sign-in. Choose
   whether email confirmation is required.
2. In **Authentication → URL Configuration**, add the local site URL used for
   testing (for example `http://127.0.0.1:8765`) and the final production
   domain. Add the corresponding allowed redirect URLs.
3. The project URL and publishable key have been added to
   [`supabase-config.js`](./supabase-config.js). They are public browser
   configuration, not server secrets. Never add a `service_role` key, database
   password, Gemini API key, or Turnstile secret to browser JavaScript.
4. Sign up for one staff account through the site. In the Supabase dashboard,
   open **Authentication → Users** and copy that user's UUID. In the SQL Editor,
   grant staff access to that exact UUID:

   ```sql
   insert into private.user_roles (user_id, role)
   values ('PASTE-STAFF-USER-UUID-HERE', 'staff')
   on conflict (user_id, role) do nothing;
   ```

   Grant staff roles only to trusted administrators. Do not store a staff flag
   in user-editable profile metadata.
5. In **Authentication → URL Configuration**, allow the local preview and
   password-reset redirect URLs, plus the eventual production URLs. The current
   preview is `http://127.0.0.1:8765`; add
   `http://127.0.0.1:8765/**` if the dashboard uses redirect patterns.
6. **Enable staff authenticator MFA before deploying the matching website
   files.** The Supabase dashboard's **Authentication → Multi-Factor** page
   should have **TOTP (App Authenticator)** set to **Enabled**; SMS is not
   required. The website will prompt each staff member to enroll an
   authenticator app at their next password sign-in, then require a fresh
   TOTP verification when their session is below AAL2. The updated
   `public.is_staff()` function also checks AAL2, so staff RLS policies and
   staff-authorized RPCs reject lower-assurance sessions server-side. The
   separate `public.is_staff_identity()` RPC only identifies whether the
   signed-in user has a staff role, allowing the login UI to know whom to
   prompt; it does not grant staff data access. Apply the updated SQL and
   deploy the matching site files in one maintenance window. Once the SQL is
   active, staff access fails closed until the updated login flow has enrolled
   or verified the staff member's authenticator. An unfinished setup can be
   restarted from the sign-in page; new enrollment attempts use unique factor
   names so a stale or duplicate authenticator name cannot block enrollment.
   If staff open a protected
   page with an AAL1 session, the site signs out that local session and returns
   them to sign-in so enrollment or verification runs before they return to the
   requested staff page. A signed-in account without the staff role is not
   redirected into staff tools.
7. If a staff member loses their authenticator, verify their identity through
   a separate trusted channel before an authorized Supabase project owner
   removes that user's lost TOTP factor in **Authentication → Users**. The
   staff member must enroll a replacement before staff tools become available.
   Do not remove factors for an unverified recovery request.

## 4. Application code migration

The site currently uses Firebase for password authentication, the admin/staff
claim, inquiries, saved briefs, bookmarks, download history, resource catalog
metadata, private release downloads/uploads, and the Gemini-backed chat client.
The migration must update these flows together:

1. Replace Firebase Auth with Supabase Auth and use Supabase UUIDs as user IDs.
2. Replace Firestore reads/writes with the tables and RLS policies above.
3. Replace Firebase Storage with the private `resource-releases` bucket.
   Preserve the existing 50 MiB validation, SHA-256 verification, separate
   Android build/source downloads, and release publication workflow. The
   supplied `publish_resource_release` RPC publishes only after the required
   objects exist.
4. Replace the Firebase AI client call with the included Supabase Edge Function
   at `supabase/functions/site-chat/index.ts`. Create a Cloudflare Turnstile
   widget for the local preview host and production host. Put its **site key**
   in `supabase-config.js`; add `GEMINI_API_KEY`, `TURNSTILE_SECRET_KEY`, and
   `ALLOWED_ORIGINS` as Edge Function secrets in Supabase Dashboard → Edge
   Functions → Secrets. Allowed origins should be exact origins, comma
   separated (for example `http://127.0.0.1:8765`). Deploy the function with
   JWT verification disabled only because it is a public chat endpoint; it
   verifies Turnstile server-side and checks the request origin. Do not deploy
   or enable it until both secret keys and the allowed-origin list are set.
   Never put either secret in site JavaScript.
5. Protect public inquiry and AI endpoints against abuse before production.
   The existing form honeypot and minimum completion time are not a substitute
   for server-verified CAPTCHA and rate limiting.
6. Test normal user, signed-out user, non-staff user, and staff behavior using
   the public publishable key. Verify storage denial for unpublished releases
   and verify that each user can access only their own workspace rows.

Do not remove the Firebase client, Firebase rules, or emulator workflow until
the Supabase version passes these checks.

## 5. Data migration and cutover

1. Inventory and export the current Firebase Auth users, Firestore documents,
   and Storage objects. Keep a read-only backup of the export.
2. Firebase user passwords are not copied by the browser migration. Users may
   need to create/reset their Supabase passwords. Map Firebase UIDs to new
   Supabase Auth UUIDs before moving saved briefs, bookmarks, or download
   history.
3. Copy published resources and release files to Supabase; calculate and verify
   SHA-256 checksums after transfer. Do not migrate draft, test, or unapproved
   packages.
4. Test the local and hosted development project separately. Confirm library
   listing, upload/publish, authenticated downloads, inquiries, staff inbox,
   saved briefs, bookmarks, history, password reset, and chat handoff.
5. Only after the owner approves a production cutover should the production
   site use the Supabase project. Keep Firebase exports until the new site and
   backups are verified. Do not delete the Firebase project as part of this
   code migration.

## Current status

- Dedicated project created at `fsnpssnfgciqykhlaxxd.supabase.co`; the supplied
  publishable key and URL are configured in `supabase-config.js`.
- The first schema run reported success and the private
  `resource-releases` bucket was created. The SQL file has since been tightened
  to enforce draft-only direct writes, timestamp triggers, restricted inquiry
  update columns, Windows ZIP MIME compatibility, verification against
  Supabase Storage's `user_metadata` checksum field, and staff-only resource
  availability and orphan-file cleanup functions/policies. Rerun the
  **updated complete** `supabase-schema.sql` in the SQL Editor before testing
  the new resource manager actions.
- The Desalu browser modules have been migrated to Supabase Auth, Postgres,
  Storage, and the staff-role RPC. Firebase modules remain in the project for
  rollback/reference, but the migrated pages no longer import them.
- The sign-in page now includes a Supabase password-recovery flow. Test the
  email link and password update against the configured redirect URL before
  production use.
- User accounts and historical data have **not** been migrated. Firebase users
  must register/reset passwords in Supabase; approved catalog releases must be
  imported and checksums re-verified before the hosted library is populated.
- The AI chat stays disabled until a Turnstile site key, Gemini and Turnstile
  Edge Function secrets, exact allowed origins, and the deployed `site-chat`
  function are configured.
- The current code is not production-ready until the updated SQL is applied,
  a trusted staff user is provisioned, login and RLS-denial cases pass, approved
  packages are imported, and public inquiry abuse controls are added.
