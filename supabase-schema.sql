-- Run this once in the Supabase SQL Editor for the dedicated Desalu project.
-- It creates the private release bucket, database tables, RLS policies, and
-- staff MFA assurance enforcement. It does not migrate Firebase data.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.user_roles (
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('staff')),
    created_at timestamptz not null default now(),
    primary key (user_id, role)
);
alter table private.user_roles enable row level security;
revoke all on private.user_roles from public, anon, authenticated;

create or replace function public.is_staff_identity()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from private.user_roles
        where user_id = (select auth.uid())
          and role = 'staff'
    );
$$;
revoke all on function public.is_staff_identity() from public, anon;
grant execute on function public.is_staff_identity() to authenticated;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_staff_identity()
       and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

create table if not exists public.inquiries (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 2 and 80),
    email text not null check (
        char_length(email) <= 254
        and email ~* '^[^@ ]+@[^@ ]+\.[^@ ]+$'
    ),
    company text not null default '' check (char_length(company) <= 120),
    service text not null check (service in (
        'Android app design and development',
        'Website or web application',
        'Custom software and programming',
        'UI/UX design and prototype',
        'APIs and integrations',
        'Automation and ongoing support',
        'Other'
    )),
    timeline text not null default '' check (timeline in (
        '',
        'As soon as possible',
        'Within 1 to 3 months',
        'Within 3 to 6 months',
        'More than 6 months'
    )),
    message text not null check (char_length(message) between 20 and 3000),
    status text not null default 'new' check (status in (
        'new', 'reviewing', 'contacted', 'in progress', 'closed'
    )),
    staff_notes text not null default '' check (char_length(staff_notes) <= 2000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists inquiries_created_at_idx
    on public.inquiries (created_at desc);
alter table public.inquiries enable row level security;
grant insert on public.inquiries to anon, authenticated;
grant select on public.inquiries to authenticated;
revoke update on public.inquiries from authenticated;
grant update (status, staff_notes, updated_at) on public.inquiries to authenticated;
drop policy if exists "Public can submit inquiries" on public.inquiries;
create policy "Public can submit inquiries"
    on public.inquiries for insert to anon, authenticated
    with check (
        status = 'new'
        and staff_notes = ''
        and updated_at = created_at
    );
drop policy if exists "Staff can read inquiries" on public.inquiries;
create policy "Staff can read inquiries"
    on public.inquiries for select to authenticated
    using (public.is_staff());
drop policy if exists "Staff can update inquiries" on public.inquiries;
create policy "Staff can update inquiries"
    on public.inquiries for update to authenticated
    using (public.is_staff())
    with check (public.is_staff());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
drop trigger if exists inquiries_touch_updated_at on public.inquiries;
create trigger inquiries_touch_updated_at
    before update on public.inquiries
    for each row execute function public.touch_updated_at();

create table if not exists public.saved_briefs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null check (char_length(title) between 3 and 80),
    service text not null check (service in (
        'Android app design and development',
        'Website or web application',
        'Custom software and programming',
        'UI/UX design and prototype',
        'APIs and integrations',
        'Automation and ongoing support',
        'Other'
    )),
    content text not null check (char_length(content) between 20 and 3000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists saved_briefs_owner_updated_idx
    on public.saved_briefs (user_id, updated_at desc);
alter table public.saved_briefs enable row level security;
grant select, insert, update, delete on public.saved_briefs to authenticated;
drop policy if exists "Users manage their saved briefs" on public.saved_briefs;
create policy "Users manage their saved briefs"
    on public.saved_briefs for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
drop trigger if exists saved_briefs_touch_updated_at on public.saved_briefs;
create trigger saved_briefs_touch_updated_at
    before update on public.saved_briefs
    for each row execute function public.touch_updated_at();

create table if not exists public.resources (
    id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    title text not null check (char_length(title) between 3 and 100),
    summary text not null check (char_length(summary) between 20 and 600),
    category text not null default '' check (char_length(category) <= 60),
    tags text[] not null default '{}' check (
        cardinality(tags) <= 12
        and array_position(tags, null) is null
    ),
    developer text not null default '' check (char_length(developer) <= 100),
    support_url text not null default '' check (
        char_length(support_url) <= 300
        and (support_url = '' or support_url ~ '^https://[^[:space:]]+$')
    ),
    privacy_policy_url text not null default '' check (
        char_length(privacy_policy_url) <= 300
        and (privacy_policy_url = '' or privacy_policy_url ~ '^https://[^[:space:]]+$')
    ),
    icon_url text not null default '' check (
        char_length(icon_url) <= 500
        and (icon_url = '' or icon_url ~ '^https://[^[:space:]]+$')
    ),
    screenshots text[] not null default '{}' check (cardinality(screenshots) <= 6),
    is_featured boolean not null default false,
    featured_order integer not null default 0 check (featured_order >= 0),
    type text not null check (type in (
        'wordpress-theme',
        'wordpress-plugin',
        'html-css',
        'android-app',
        'ios-app'
    )),
    author text not null check (char_length(author) between 2 and 100),
    license text not null check (char_length(license) between 2 and 100),
    status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
    latest_release_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.resources
    add column if not exists category text not null default '',
    add column if not exists tags text[] not null default '{}',
    add column if not exists developer text not null default '',
    add column if not exists support_url text not null default '',
    add column if not exists privacy_policy_url text not null default '',
    add column if not exists icon_url text not null default '',
    add column if not exists screenshots text[] not null default '{}',
    add column if not exists is_featured boolean not null default false,
    add column if not exists featured_order integer not null default 0;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'resources_category_length') then
        alter table public.resources add constraint resources_category_length
            check (char_length(category) <= 60);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'resources_tags_count') then
        alter table public.resources add constraint resources_tags_count
            check (cardinality(tags) <= 12 and array_position(tags, null) is null);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'resources_developer_length') then
        alter table public.resources add constraint resources_developer_length
            check (char_length(developer) <= 100);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'resources_support_url_https') then
        alter table public.resources add constraint resources_support_url_https
            check (char_length(support_url) <= 300 and (support_url = '' or support_url ~ '^https://[^[:space:]]+$'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'resources_privacy_url_https') then
        alter table public.resources add constraint resources_privacy_url_https
            check (char_length(privacy_policy_url) <= 300 and (privacy_policy_url = '' or privacy_policy_url ~ '^https://[^[:space:]]+$'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'resources_icon_url_https') then
        alter table public.resources add constraint resources_icon_url_https
            check (char_length(icon_url) <= 500 and (icon_url = '' or icon_url ~ '^https://[^[:space:]]+$'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'resources_screenshots_count') then
        alter table public.resources add constraint resources_screenshots_count
            check (cardinality(screenshots) <= 6);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'resources_feature_order_nonnegative') then
        alter table public.resources add constraint resources_feature_order_nonnegative
            check (featured_order >= 0);
    end if;
end;
$$;
alter table public.resources enable row level security;
grant select on public.resources to anon, authenticated;
grant insert, update, delete on public.resources to authenticated;
drop policy if exists "Published resources are visible" on public.resources;
drop policy if exists "Staff manage resources" on public.resources;
create policy "Published resources are visible"
    on public.resources for select to anon, authenticated
    using (status = 'published');
drop policy if exists "Staff can read all resources" on public.resources;
create policy "Staff can read all resources"
    on public.resources for select to authenticated
    using (public.is_staff());
drop policy if exists "Staff can create draft resources" on public.resources;
create policy "Staff can create draft resources"
    on public.resources for insert to authenticated
    with check (
        public.is_staff()
        and status = 'draft'
        and latest_release_id is null
    );
drop policy if exists "Staff can update draft resources" on public.resources;
create policy "Staff can update draft resources"
    on public.resources for update to authenticated
    using (public.is_staff() and status = 'draft')
    with check (public.is_staff() and status = 'draft');
drop policy if exists "Staff can delete empty draft resources" on public.resources;
create policy "Staff can delete empty draft resources"
    on public.resources for delete to authenticated
    using (
        public.is_staff()
        and status = 'draft'
        and latest_release_id is null
    );
drop trigger if exists resources_touch_updated_at on public.resources;
create trigger resources_touch_updated_at
    before update on public.resources
    for each row execute function public.touch_updated_at();
create or replace function public.validate_resource_catalog_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if char_length(new.category) > 60 or char_length(new.developer) > 100 then
        raise exception 'Resource category or developer display name is too long';
    end if;

    if cardinality(new.tags) > 12
        or exists (
            select 1
            from unnest(new.tags) as tag
            where tag is null
               or char_length(tag) not between 1 and 40
               or tag <> lower(btrim(tag))
               or tag !~ '^[[:alnum:]][[:alnum:] -]*$'
        ) then
        raise exception 'Resource tags must be up to 12 normalized tags of 1-40 letters, numbers, spaces, or hyphens';
    end if;

    if cardinality(new.screenshots) > 6
        or exists (
            select 1
            from unnest(new.screenshots) as image_url
            where image_url is null
               or char_length(image_url) > 500
               or image_url !~ '^https://[^[:space:]]+$'
        ) then
        raise exception 'Resource screenshots must be up to 6 HTTPS image URLs';
    end if;

    if char_length(new.support_url) > 300
        or char_length(new.privacy_policy_url) > 300
        or char_length(new.icon_url) > 500
        or (new.support_url <> '' and new.support_url !~ '^https://[^[:space:]]+$')
        or (new.privacy_policy_url <> '' and new.privacy_policy_url !~ '^https://[^[:space:]]+$')
        or (new.icon_url <> '' and new.icon_url !~ '^https://[^[:space:]]+$') then
        raise exception 'Support, privacy, and icon URLs must use HTTPS';
    end if;

    return new;
end;
$$;
drop trigger if exists resources_validate_catalog_metadata on public.resources;
create trigger resources_validate_catalog_metadata
    before insert or update on public.resources
    for each row execute function public.validate_resource_catalog_metadata();

create table if not exists public.resource_releases (
    id uuid primary key default gen_random_uuid(),
    resource_id text not null references public.resources(id) on delete restrict,
    version text not null check (version ~ '^[A-Za-z0-9.+_-]{1,32}$'),
    supported_wordpress text not null default '' check (char_length(supported_wordpress) <= 80),
    requires_php text not null default '' check (char_length(requires_php) <= 40),
    requires text not null default '' check (char_length(requires) <= 300),
    setup text not null check (char_length(setup) between 20 and 3000),
    changelog text not null default '' check (char_length(changelog) <= 2000),
    storage_path text not null check (char_length(storage_path) <= 300),
    file_name text not null check (char_length(file_name) between 1 and 120),
    file_size bigint not null check (file_size between 1 and 52428800),
    sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
    build_format text not null default '' check (build_format in ('', 'apk', 'aab')),
    source_storage_path text not null default '' check (char_length(source_storage_path) <= 300),
    source_file_name text not null default '' check (char_length(source_file_name) <= 120),
    source_file_size bigint not null default 0 check (source_file_size between 0 and 52428800),
    source_sha256 text not null default '' check (
        source_sha256 = '' or source_sha256 ~ '^[a-f0-9]{64}$'
    ),
    status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'rejected', 'retired')),
    review_notes text not null default '' check (char_length(review_notes) <= 2000),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    published_at timestamptz,
    unique (resource_id, version),
    unique (id, resource_id),
    check (
        (
            build_format in ('apk', 'aab')
            and source_storage_path <> ''
            and source_file_name <> ''
            and source_file_size > 0
            and source_sha256 ~ '^[a-f0-9]{64}$'
        )
        or (
            build_format = ''
            and source_storage_path = ''
            and source_file_name = ''
            and source_file_size = 0
            and source_sha256 = ''
        )
    ),
    check (
        (status = 'published' and published_at is not null)
        or (status <> 'published' and published_at is null)
    )
);
alter table public.resource_releases
    add column if not exists review_notes text not null default '',
    add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
    add column if not exists reviewed_at timestamptz;
alter table public.resource_releases
    drop constraint if exists resource_releases_status_check;
alter table public.resource_releases
    add constraint resource_releases_status_check
    check (status in ('draft', 'in_review', 'published', 'rejected', 'retired'));
alter table public.resource_releases
    drop constraint if exists resource_releases_review_notes_length;
alter table public.resource_releases
    add constraint resource_releases_review_notes_length
    check (char_length(review_notes) <= 2000);
create index if not exists resource_releases_public_idx
    on public.resource_releases (resource_id, status);
alter table public.resources
    drop constraint if exists resources_latest_release_fk;
alter table public.resources
    add constraint resources_latest_release_fk
    foreign key (latest_release_id, id)
    references public.resource_releases (id, resource_id)
    deferrable initially deferred;
alter table public.resource_releases
    drop constraint if exists resource_release_storage_paths;
alter table public.resource_releases
    add constraint resource_release_storage_paths
    check (
        (
            build_format in ('apk', 'aab')
            and storage_path = 'resources/' || resource_id || '/releases/' || id::text || '/build.' || build_format
            and source_storage_path = 'resources/' || resource_id || '/releases/' || id::text || '/source.zip'
        )
        or (
            build_format = ''
            and storage_path = 'resources/' || resource_id || '/releases/' || id::text || '/artifact.zip'
            and source_storage_path = ''
        )
    );
alter table public.resource_releases enable row level security;
grant select on public.resource_releases to anon, authenticated;
grant insert, update, delete on public.resource_releases to authenticated;
drop policy if exists "Published releases are visible" on public.resource_releases;
drop policy if exists "Staff manage releases" on public.resource_releases;
create policy "Published releases are visible"
    on public.resource_releases for select to anon, authenticated
    using (
        status = 'published'
        and exists (
            select 1 from public.resources r
            where r.id = resource_id and r.status = 'published'
        )
    );
drop policy if exists "Staff can read all releases" on public.resource_releases;
create policy "Staff can read all releases"
    on public.resource_releases for select to authenticated
    using (public.is_staff());
drop policy if exists "Staff can create draft releases" on public.resource_releases;
create policy "Staff can create draft releases"
    on public.resource_releases for insert to authenticated
    with check (public.is_staff() and status = 'draft' and published_at is null);
drop policy if exists "Staff can update draft releases" on public.resource_releases;
create policy "Staff can update draft releases"
    on public.resource_releases for update to authenticated
    using (public.is_staff() and status = 'draft')
    with check (public.is_staff() and status = 'draft' and published_at is null);
drop policy if exists "Staff can delete draft releases" on public.resource_releases;
create policy "Staff can delete draft releases"
    on public.resource_releases for delete to authenticated
    using (public.is_staff() and status = 'draft');

create table if not exists public.bookmarks (
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    resource_id text not null references public.resources(id) on delete cascade,
    resource_title text not null check (char_length(resource_title) between 1 and 100),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, resource_id)
);
alter table public.bookmarks enable row level security;
grant select, insert, update, delete on public.bookmarks to authenticated;
drop policy if exists "Users manage their bookmarks" on public.bookmarks;
create policy "Users manage their bookmarks"
    on public.bookmarks for all to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1 from public.resources r
            where r.id = resource_id and r.status = 'published'
        )
    );
drop trigger if exists bookmarks_touch_updated_at on public.bookmarks;
create trigger bookmarks_touch_updated_at
    before update on public.bookmarks
    for each row execute function public.touch_updated_at();

create table if not exists public.download_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    resource_id text not null,
    release_id uuid not null,
    resource_title text not null check (char_length(resource_title) between 1 and 100),
    version text not null check (char_length(version) <= 32),
    downloaded_at timestamptz not null default now(),
    foreign key (release_id, resource_id)
        references public.resource_releases (id, resource_id) on delete restrict
);
create index if not exists download_history_owner_date_idx
    on public.download_history (user_id, downloaded_at desc);
create index if not exists download_history_downloaded_at_idx
    on public.download_history (downloaded_at desc);
alter table public.download_history enable row level security;
grant select, insert, delete on public.download_history to authenticated;
drop policy if exists "Users read their download history" on public.download_history;
create policy "Users read their download history"
    on public.download_history for select to authenticated
    using ((select auth.uid()) = user_id);
drop policy if exists "Users record published downloads" on public.download_history;
create policy "Users record published downloads"
    on public.download_history for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and exists (
            select 1
            from public.resources r
            join public.resource_releases rr
              on rr.id = download_history.release_id
             and rr.resource_id = r.id
            where r.id = download_history.resource_id
              and r.status = 'published'
              and rr.status = 'published'
              and rr.version = download_history.version
        )
    );
drop policy if exists "Users delete their download history" on public.download_history;
create policy "Users delete their download history"
    on public.download_history for delete to authenticated
    using ((select auth.uid()) = user_id);

create table if not exists public.resource_reports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    resource_id text not null references public.resources(id) on delete cascade,
    reason text not null check (reason in ('broken-download', 'security-concern', 'license-concern', 'incorrect-information', 'other')),
    message text not null check (char_length(message) between 10 and 2000),
    status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
    staff_note text not null default '' check (char_length(staff_note) <= 2000),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references auth.users(id) on delete set null
);
create unique index if not exists resource_reports_one_pending_per_user_idx
    on public.resource_reports (user_id, resource_id)
    where status = 'pending';
create index if not exists resource_reports_status_created_idx
    on public.resource_reports (status, created_at desc);
alter table public.resource_reports enable row level security;
grant select, insert on public.resource_reports to authenticated;
revoke update on public.resource_reports from authenticated;
drop policy if exists "Users submit and read their resource reports" on public.resource_reports;
create policy "Users submit and read their resource reports"
    on public.resource_reports for select to authenticated
    using ((select auth.uid()) = user_id);
drop policy if exists "Users can create reports on published resources" on public.resource_reports;
create policy "Users can create reports on published resources"
    on public.resource_reports for insert to authenticated
    with check (
        (select auth.uid()) = user_id
        and status = 'pending'
        and staff_note = ''
        and reviewed_at is null
        and reviewed_by is null
        and exists (select 1 from public.resources r where r.id = resource_id and r.status = 'published')
    );
drop policy if exists "Staff can review resource reports" on public.resource_reports;
create policy "Staff can review resource reports"
    on public.resource_reports for select to authenticated
    using (public.is_staff());
drop policy if exists "Staff can update resource reports" on public.resource_reports;
create or replace function public.review_resource_report(
    p_report_id uuid,
    p_status text,
    p_staff_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_resource_id text;
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to review resource reports'
            using errcode = '42501';
    end if;
    if p_status not in ('resolved', 'dismissed')
        or char_length(p_staff_note) > 2000 then
        raise exception 'Report review status or note is invalid';
    end if;

    update public.resource_reports
    set status = p_status,
        staff_note = btrim(p_staff_note),
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_report_id and status = 'pending'
    returning resource_id into v_resource_id;
    if not found then
        raise exception 'Pending report does not exist';
    end if;

    perform private.write_admin_activity(
        'resource-report-' || p_status,
        v_resource_id,
        null,
        jsonb_build_object('report_id', p_report_id)
    );
end;
$$;
revoke all on function public.review_resource_report(uuid, text, text) from public, anon;
grant execute on function public.review_resource_report(uuid, text, text) to authenticated;

create table if not exists public.admin_activity_log (
    id bigint generated always as identity primary key,
    actor_id uuid references auth.users(id) on delete set null,
    action text not null check (char_length(action) between 1 and 80),
    resource_id text,
    release_id uuid,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists admin_activity_log_created_idx
    on public.admin_activity_log (created_at desc);
alter table public.admin_activity_log enable row level security;
grant select on public.admin_activity_log to authenticated;
drop policy if exists "Staff read activity log" on public.admin_activity_log;
create policy "Staff read activity log"
    on public.admin_activity_log for select to authenticated
    using (public.is_staff());
create or replace function private.write_admin_activity(
    p_action text,
    p_resource_id text default null,
    p_release_id uuid default null,
    p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to log admin activity'
            using errcode = '42501';
    end if;
    if char_length(p_action) not between 1 and 80
        or pg_catalog.pg_column_size(coalesce(p_details, '{}'::jsonb)) > 4000 then
        raise exception 'Activity log entry is invalid';
    end if;
    insert into public.admin_activity_log (actor_id, action, resource_id, release_id, details)
    values (auth.uid(), p_action, p_resource_id, p_release_id, coalesce(p_details, '{}'::jsonb));
end;
$$;
revoke all on function private.write_admin_activity(text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function private.log_resource_metadata_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if (new.title, new.summary, new.category, new.tags, new.developer, new.author,
        new.license, new.support_url, new.privacy_policy_url, new.icon_url, new.screenshots)
        is distinct from
       (old.title, old.summary, old.category, old.tags, old.developer, old.author,
        old.license, old.support_url, old.privacy_policy_url, old.icon_url, old.screenshots) then
        perform private.write_admin_activity(
            'resource-metadata-updated',
            new.id,
            null,
            jsonb_build_object('resource_status', new.status)
        );
    end if;
    return new;
end;
$$;
revoke all on function private.log_resource_metadata_changes() from public, anon, authenticated;
drop trigger if exists resources_log_metadata_changes on public.resources;
create trigger resources_log_metadata_changes
    after update on public.resources
    for each row execute function private.log_resource_metadata_changes();

create or replace function public.record_storage_cleanup(p_file_count integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to record storage cleanup'
            using errcode = '42501';
    end if;
    if p_file_count is null or p_file_count not between 1 and 100000 then
        raise exception 'Storage cleanup file count is invalid';
    end if;
    perform private.write_admin_activity(
        'storage-orphans-removed',
        null,
        null,
        jsonb_build_object('file_count', p_file_count)
    );
end;
$$;
revoke all on function public.record_storage_cleanup(integer) from public, anon;
grant execute on function public.record_storage_cleanup(integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'resource-releases',
    'resource-releases',
    false,
    52428800,
    array[
        'application/zip',
        'application/x-zip-compressed',
        'application/vnd.android.package-archive',
        'application/octet-stream'
    ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Staff upload release files" on storage.objects;
create policy "Staff upload release files"
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'resource-releases'
        and public.is_staff()
        and (storage.foldername(name))[1] = 'resources'
        and (storage.foldername(name))[3] = 'releases'
        and exists (
            select 1
            from public.resources r
            join public.resource_releases rr
              on rr.resource_id = r.id
            where r.id = (storage.foldername(name))[2]
              and rr.id::text = (storage.foldername(name))[4]
              and r.status in ('draft', 'published')
              and rr.status = 'draft'
        )
    );
drop policy if exists "Authenticated users download published files" on storage.objects;
create policy "Authenticated users download published files"
    on storage.objects for select to authenticated
    using (
        bucket_id = 'resource-releases'
        and (
            public.is_staff()
            or (
                (storage.foldername(name))[1] = 'resources'
                and (storage.foldername(name))[3] = 'releases'
                and exists (
                    select 1
                    from public.resources r
                    join public.resource_releases rr
                      on rr.resource_id = r.id
                    where r.id = (storage.foldername(name))[2]
                      and rr.id::text = (storage.foldername(name))[4]
                      and r.status = 'published'
                      and rr.status = 'published'
                )
            )
        )
    );
drop policy if exists "Staff remove draft release files" on storage.objects;
create policy "Staff remove draft release files"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'resource-releases'
        and public.is_staff()
        and (storage.foldername(name))[1] = 'resources'
        and (storage.foldername(name))[3] = 'releases'
        and exists (
            select 1 from public.resource_releases rr
            where rr.resource_id = (storage.foldername(name))[2]
              and rr.id::text = (storage.foldername(name))[4]
              and rr.status = 'draft'
        )
    );
drop policy if exists "Staff remove orphan release files" on storage.objects;
create policy "Staff remove orphan release files"
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'resource-releases'
        and public.is_staff()
        and name ~ '^resources/[a-z0-9]+(-[a-z0-9]+)*/releases/[0-9a-f-]{36}/(build\.(apk|aab)|artifact\.zip|source\.zip)$'
        and not exists (
            select 1
            from public.resource_releases rr
            where rr.storage_path = name
               or rr.source_storage_path = name
        )
    );

create or replace function public.submit_resource_release_for_review(
    p_resource_id text,
    p_release_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_resource public.resources%rowtype;
    v_release public.resource_releases%rowtype;
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to submit a release for review'
            using errcode = '42501';
    end if;

    select * into v_resource from public.resources where id = p_resource_id for update;
    if not found or v_resource.status = 'retired' then
        raise exception 'Resource does not exist or is retired';
    end if;
    select * into v_release
    from public.resource_releases
    where id = p_release_id and resource_id = p_resource_id
    for update;
    if not found or v_release.status <> 'draft' then
        raise exception 'Draft release does not exist';
    end if;

    if v_resource.type = 'android-app' then
        if v_release.build_format not in ('apk', 'aab')
            or not exists (
                select 1 from storage.objects
                where bucket_id = 'resource-releases'
                  and name = v_release.storage_path
                  and coalesce((metadata->>'size')::bigint, -1) = v_release.file_size
                  and user_metadata->>'sha256' = v_release.sha256
            )
            or not exists (
                select 1 from storage.objects
                where bucket_id = 'resource-releases'
                  and name = v_release.source_storage_path
                  and coalesce((metadata->>'size')::bigint, -1) = v_release.source_file_size
                  and user_metadata->>'sha256' = v_release.source_sha256
            ) then
            raise exception 'Build and source files must be uploaded before submitting for review';
        end if;
    elsif v_release.build_format <> ''
        or not exists (
            select 1 from storage.objects
            where bucket_id = 'resource-releases'
              and name = v_release.storage_path
              and coalesce((metadata->>'size')::bigint, -1) = v_release.file_size
              and user_metadata->>'sha256' = v_release.sha256
        ) then
        raise exception 'Release archive must be uploaded before submitting for review';
    end if;

    update public.resource_releases
    set status = 'in_review', review_notes = ''
    where id = p_release_id;
    perform private.write_admin_activity(
        'release-submitted-for-review',
        p_resource_id,
        p_release_id,
        jsonb_build_object('version', v_release.version)
    );
end;
$$;
revoke all on function public.submit_resource_release_for_review(text, uuid) from public, anon;
grant execute on function public.submit_resource_release_for_review(text, uuid) to authenticated;

create or replace function public.publish_resource_release(
    p_resource_id text,
    p_release_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_resource public.resources%rowtype;
    v_release public.resource_releases%rowtype;
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to publish a release'
            using errcode = '42501';
    end if;

    select * into v_resource
    from public.resources
    where id = p_resource_id
    for update;
    if not found or v_resource.status = 'retired' then
        raise exception 'Resource does not exist or is retired';
    end if;

    select * into v_release
    from public.resource_releases
    where id = p_release_id and resource_id = p_resource_id
    for update;
    if not found or v_release.status <> 'in_review' then
        raise exception 'Release is not awaiting review';
    end if;

    if v_resource.type = 'android-app' then
        if v_release.build_format not in ('apk', 'aab')
            or not exists (
                select 1 from storage.objects
                where bucket_id = 'resource-releases'
                  and name = v_release.storage_path
                  and coalesce((metadata->>'size')::bigint, -1) = v_release.file_size
                  and user_metadata->>'sha256' = v_release.sha256
            )
            or not exists (
                select 1 from storage.objects
                where bucket_id = 'resource-releases'
                  and name = v_release.source_storage_path
                  and coalesce((metadata->>'size')::bigint, -1) = v_release.source_file_size
                  and user_metadata->>'sha256' = v_release.source_sha256
            ) then
            raise exception 'Build and source files must be uploaded before publishing';
        end if;
    else
        if v_release.build_format <> ''
            or not exists (
                select 1 from storage.objects
                where bucket_id = 'resource-releases'
                  and name = v_release.storage_path
                  and coalesce((metadata->>'size')::bigint, -1) = v_release.file_size
                  and user_metadata->>'sha256' = v_release.sha256
            ) then
            raise exception 'Release archive must be uploaded before publishing';
        end if;
    end if;

    update public.resource_releases
    set status = 'published',
        published_at = now(),
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = ''
    where id = p_release_id;

    update public.resources
    set status = 'published',
        latest_release_id = p_release_id,
        updated_at = now()
    where id = p_resource_id;
    perform private.write_admin_activity(
        'release-published',
        p_resource_id,
        p_release_id,
        jsonb_build_object('version', v_release.version)
    );
end;
$$;
revoke all on function public.publish_resource_release(text, uuid) from public, anon;
grant execute on function public.publish_resource_release(text, uuid) to authenticated;

create or replace function public.reject_resource_release(
    p_resource_id text,
    p_release_id uuid,
    p_review_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to review releases'
            using errcode = '42501';
    end if;
    if char_length(btrim(p_review_notes)) not between 10 and 2000 then
        raise exception 'Provide review feedback between 10 and 2000 characters';
    end if;

    update public.resource_releases
    set status = 'rejected',
        review_notes = btrim(p_review_notes),
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_release_id
      and resource_id = p_resource_id
      and status = 'in_review';
    if not found then
        raise exception 'Release is not awaiting review';
    end if;
    perform private.write_admin_activity(
        'release-rejected',
        p_resource_id,
        p_release_id,
        jsonb_build_object('review_notes', btrim(p_review_notes))
    );
end;
$$;
revoke all on function public.reject_resource_release(text, uuid, text) from public, anon;
grant execute on function public.reject_resource_release(text, uuid, text) to authenticated;

create or replace function public.set_resource_availability(
    p_resource_id text,
    p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_resource public.resources%rowtype;
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to change resource availability'
            using errcode = '42501';
    end if;

    if p_status not in ('published', 'retired') then
        raise exception 'Only published or retired resource status is allowed';
    end if;

    select * into v_resource
    from public.resources
    where id = p_resource_id
    for update;
    if not found then
        raise exception 'Resource does not exist';
    end if;

    if p_status = 'retired' and v_resource.status = 'published' then
        update public.resources
        set status = 'retired', updated_at = now()
        where id = p_resource_id;
    elsif p_status = 'published'
        and v_resource.status = 'retired'
        and v_resource.latest_release_id is not null
        and exists (
            select 1
            from public.resource_releases rr
            where rr.id = v_resource.latest_release_id
              and rr.resource_id = p_resource_id
              and rr.status = 'published'
        ) then
        update public.resources
        set status = 'published', updated_at = now()
        where id = p_resource_id;
    else
        raise exception 'Resource cannot transition from % to %', v_resource.status, p_status;
    end if;
    perform private.write_admin_activity(
        case when p_status = 'retired' then 'resource-retired' else 'resource-restored' end,
        p_resource_id,
        null,
        '{}'::jsonb
    );
end;
$$;
revoke all on function public.set_resource_availability(text, text) from public, anon;
grant execute on function public.set_resource_availability(text, text) to authenticated;

create or replace function public.set_resource_featured(
    p_resource_id text,
    p_featured boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_next_order integer;
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to feature resources'
            using errcode = '42501';
    end if;

    if not exists (
        select 1 from public.resources
        where id = p_resource_id and status = 'published'
    ) then
        raise exception 'Only published resources can be featured';
    end if;

    if p_featured then
        select coalesce(max(featured_order), 0) + 1 into v_next_order
        from public.resources
        where is_featured;

        update public.resources
        set is_featured = true, featured_order = v_next_order, updated_at = now()
        where id = p_resource_id;
    else
        update public.resources
        set is_featured = false, featured_order = 0, updated_at = now()
        where id = p_resource_id;
    end if;
    perform private.write_admin_activity(
        case when p_featured then 'resource-featured' else 'resource-unfeatured' end,
        p_resource_id,
        null,
        '{}'::jsonb
    );
end;
$$;
revoke all on function public.set_resource_featured(text, boolean) from public, anon;
grant execute on function public.set_resource_featured(text, boolean) to authenticated;

create or replace function public.move_featured_resource(
    p_resource_id text,
    p_direction integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_order integer;
    v_neighbor_id text;
    v_neighbor_order integer;
    v_temporary_order integer;
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to reorder featured resources'
            using errcode = '42501';
    end if;
    if p_direction not in (-1, 1) then
        raise exception 'Direction must be -1 or 1';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(48372016);

    select featured_order into v_order
    from public.resources
    where id = p_resource_id and status = 'published' and is_featured
    for update;
    if not found then
        raise exception 'Featured resource does not exist';
    end if;

    if p_direction = -1 then
        select id, featured_order into v_neighbor_id, v_neighbor_order
        from public.resources
        where is_featured and featured_order < v_order
        order by featured_order desc
        limit 1
        for update;
    else
        select id, featured_order into v_neighbor_id, v_neighbor_order
        from public.resources
        where is_featured and featured_order > v_order
        order by featured_order asc
        limit 1
        for update;
    end if;

    if v_neighbor_id is null then
        return;
    end if;

    select coalesce(max(featured_order), 0) + 1 into v_temporary_order
    from public.resources
    where is_featured;

    update public.resources set featured_order = v_temporary_order where id = p_resource_id;
    update public.resources set featured_order = v_order where id = v_neighbor_id;
    update public.resources set featured_order = v_neighbor_order where id = p_resource_id;
    perform private.write_admin_activity(
        'featured-resources-reordered',
        p_resource_id,
        null,
        jsonb_build_object('direction', p_direction)
    );
end;
$$;
revoke all on function public.move_featured_resource(text, integer) from public, anon;
grant execute on function public.move_featured_resource(text, integer) to authenticated;

create or replace function public.get_public_resource_download_counts()
returns table(resource_id text, download_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
    select dh.resource_id, count(*)::bigint
    from public.download_history dh
    join public.resources r on r.id = dh.resource_id
    where r.status = 'published'
    group by dh.resource_id;
$$;
revoke all on function public.get_public_resource_download_counts() from public;
grant execute on function public.get_public_resource_download_counts() to anon, authenticated;

create table if not exists public.admin_storage_snapshots (
    snapshot_date date primary key,
    total_bytes bigint not null check (total_bytes >= 0),
    created_at timestamptz not null default now()
);
alter table public.admin_storage_snapshots enable row level security;
revoke all on public.admin_storage_snapshots from public, anon, authenticated;

create or replace function public.get_admin_analytics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_result jsonb;
    v_today date := current_date;
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to view analytics'
            using errcode = '42501';
    end if;
    if p_days is null or p_days not in (30) then
        raise exception 'Analytics period must be 30 days';
    end if;

    insert into public.admin_storage_snapshots (snapshot_date, total_bytes)
    select
        v_today,
        coalesce(sum(
            case
                when so.metadata->>'size' ~ '^[0-9]+$' then (so.metadata->>'size')::bigint
                else 0
            end
        ), 0)
    from storage.objects so
    where so.bucket_id = 'resource-releases'
    on conflict (snapshot_date) do update
    set total_bytes = excluded.total_bytes;

    select jsonb_build_object(
        'period_days', p_days,
        'generated_at', now(),
        'downloads_last_30_days', (
            select count(*)::bigint
            from public.download_history dh
            where dh.downloaded_at >= v_today - interval '29 days'
              and dh.downloaded_at < v_today + interval '1 day'
        ),
        'downloads_previous_30_days', (
            select count(*)::bigint
            from public.download_history dh
            where dh.downloaded_at >= v_today - interval '59 days'
              and dh.downloaded_at < v_today - interval '29 days'
        ),
        'daily_downloads', (
            select coalesce(jsonb_agg(
                jsonb_build_object('date', day::date, 'count', coalesce(downloads.total, 0))
                order by day
            ), '[]'::jsonb)
            from generate_series(
                (v_today - interval '29 days')::timestamp,
                v_today::timestamp,
                interval '1 day'
            ) as days(day)
            left join lateral (
                select count(*)::bigint as total
                from public.download_history dh
                where dh.downloaded_at >= days.day
                  and dh.downloaded_at < days.day + interval '1 day'
            ) downloads on true
        ),
        'weekly_downloads', (
            select coalesce(jsonb_agg(
                jsonb_build_object('week', week_start::date, 'count', coalesce(downloads.total, 0))
                order by week_start
            ), '[]'::jsonb)
            from generate_series(
                date_trunc('week', v_today::timestamp) - interval '11 weeks',
                date_trunc('week', v_today::timestamp),
                interval '1 week'
            ) as weeks(week_start)
            left join lateral (
                select count(*)::bigint as total
                from public.download_history dh
                where dh.downloaded_at >= weeks.week_start
                  and dh.downloaded_at < weeks.week_start + interval '1 week'
            ) downloads on true
        ),
        'popular_resources', (
            select coalesce(jsonb_agg(
                jsonb_build_object(
                    'resource', ranked.title,
                    'type', ranked.type,
                    'downloads', ranked.downloads
                )
                order by ranked.downloads desc, ranked.title
            ), '[]'::jsonb)
            from (
                select r.title, r.type, count(*)::bigint as downloads
                from public.download_history dh
                join public.resources r on r.id = dh.resource_id
                where dh.downloaded_at >= v_today - interval '29 days'
                  and dh.downloaded_at < v_today + interval '1 day'
                group by r.id, r.title, r.type
                order by count(*) desc, r.title
                limit 10
            ) ranked
        ),
        'category_downloads', (
            select coalesce(jsonb_agg(
                jsonb_build_object('category', ranked.category, 'downloads', ranked.downloads)
                order by ranked.downloads desc, ranked.category
            ), '[]'::jsonb)
            from (
                select coalesce(nullif(btrim(r.category), ''), 'Uncategorized') as category,
                       count(*)::bigint as downloads
                from public.download_history dh
                join public.resources r on r.id = dh.resource_id
                where dh.downloaded_at >= v_today - interval '29 days'
                  and dh.downloaded_at < v_today + interval '1 day'
                group by coalesce(nullif(btrim(r.category), ''), 'Uncategorized')
                order by count(*) desc, category
            ) ranked
        ),
        'current_storage_bytes', (
            select total_bytes
            from public.admin_storage_snapshots
            where snapshot_date = v_today
        ),
        'storage_history', (
            select coalesce(jsonb_agg(
                jsonb_build_object('date', snapshot_date, 'bytes', total_bytes)
                order by snapshot_date
            ), '[]'::jsonb)
            from public.admin_storage_snapshots
            where snapshot_date >= v_today - 29
              and snapshot_date <= v_today
        )
    ) into v_result;

    return v_result;
end;
$$;
revoke all on function public.get_admin_analytics(integer) from public, anon;
grant execute on function public.get_admin_analytics(integer) to authenticated;

create table if not exists public.admin_dashboard_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    widget_order text[] not null default array['overview', 'activity', 'quick-actions', 'analytics'],
    updated_at timestamptz not null default now(),
    constraint admin_dashboard_preferences_widget_count
        check (cardinality(widget_order) = 4 and array_position(widget_order, null) is null)
);
alter table public.admin_dashboard_preferences enable row level security;
revoke all on public.admin_dashboard_preferences from public, anon, authenticated;

create or replace function public.get_admin_dashboard_layout()
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_widget_order text[];
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to view dashboard preferences'
            using errcode = '42501';
    end if;
    select preferences.widget_order into v_widget_order
    from public.admin_dashboard_preferences preferences
    where preferences.user_id = auth.uid();

    return coalesce(
        v_widget_order,
        array['overview', 'activity', 'quick-actions', 'analytics']::text[]
    );
end;
$$;
revoke all on function public.get_admin_dashboard_layout() from public, anon;
grant execute on function public.get_admin_dashboard_layout() to authenticated;

create or replace function public.save_admin_dashboard_layout(p_widget_order text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_allowed text[] := array['overview', 'activity', 'quick-actions', 'analytics'];
begin
    if not public.is_staff() then
        raise exception 'Staff access is required to save dashboard preferences'
            using errcode = '42501';
    end if;
    if p_widget_order is null
        or cardinality(p_widget_order) <> cardinality(v_allowed)
        or array_position(p_widget_order, null) is not null
        or not (p_widget_order @> v_allowed)
        or not (p_widget_order <@ v_allowed) then
        raise exception 'Dashboard layout contains an invalid widget order';
    end if;

    insert into public.admin_dashboard_preferences (user_id, widget_order, updated_at)
    values (auth.uid(), p_widget_order, now())
    on conflict (user_id) do update
    set widget_order = excluded.widget_order,
        updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.save_admin_dashboard_layout(text[]) from public, anon;
grant execute on function public.save_admin_dashboard_layout(text[]) to authenticated;
