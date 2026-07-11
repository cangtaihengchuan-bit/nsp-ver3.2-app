-- Kaimono Clock ver3.2: roles, store campaigns, reviews and privacy-safe metrics.
-- Run this after the existing nsp_user_* schemas in the Supabase SQL editor.
-- Initial roles must be assigned by a trusted administrator (example at the end).

create extension if not exists pgcrypto;

create table if not exists public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'store', 'developer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.app_roles where user_id = auth.uid()), 'user');
$$;

create or replace function public.is_app_developer()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_app_role() = 'developer';
$$;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profile text,
  contact_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'manager' check (member_role in ('owner', 'manager', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create or replace function public.can_manage_store(target_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_developer() or exists (
    select 1 from public.store_members
    where store_id = target_store_id
      and user_id = auth.uid()
      and member_role in ('owner', 'manager', 'editor')
  );
$$;

create or replace function public.can_manage_store_path(object_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare target_store_id uuid;
begin
  target_store_id := split_part(object_name, '/', 1)::uuid;
  return public.can_manage_store(target_store_id);
exception when invalid_text_representation then return false;
end; $$;

create table if not exists public.store_branches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  map_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type public.ad_campaign_status as enum ('draft', 'submitted', 'approved', 'scheduled', 'active', 'paused', 'ended', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  branch_id uuid references public.store_branches(id) on delete set null,
  store_name text not null default '',
  branch_name text,
  branch_map_url text,
  branch_latitude double precision,
  branch_longitude double precision,
  product_name text not null,
  headline text not null,
  regular_price numeric check (regular_price is null or regular_price >= 0),
  sale_price numeric check (sale_price is null or sale_price >= 0),
  discount_conditions text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  weekday_mask smallint[] not null default '{}',
  start_time time,
  end_time time,
  category text not null default 'other',
  stock_note text,
  image_path text,
  delivery_radius_km numeric not null default 5 check (delivery_radius_km > 0 and delivery_radius_km <= 50),
  delivery_categories text[] not null default '{}',
  user_notice text,
  status public.ad_campaign_status not null default 'draft',
  rejection_reason text,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  paused_at timestamptz,
  ended_at timestamptz,
  plan text,
  budget numeric check (budget is null or budget >= 0),
  billing_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.ad_campaigns
  add column if not exists store_name text not null default '',
  add column if not exists branch_name text,
  add column if not exists branch_map_url text,
  add column if not exists branch_latitude double precision,
  add column if not exists branch_longitude double precision;

create table if not exists public.ad_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  category text,
  max_distance_km numeric check (max_distance_km is null or (max_distance_km > 0 and max_distance_km <= 50)),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_campaign_reviews (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected', 'paused')),
  reason text,
  created_at timestamptz not null default now()
);

-- No user id, email, receipt content or exact coordinates are stored here.
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'detail_view', 'save_discount', 'add_to_shopping', 'map_open', 'hide')),
  event_day date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Client error logs deliberately exclude user identifiers, passwords, files and precise locations.
create table if not exists public.app_error_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  page text not null,
  operation text not null,
  error_type text not null,
  reproduction text,
  app_version text,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

create index if not exists ad_campaigns_store_status_idx on public.ad_campaigns(store_id, status, starts_at, ends_at);
create index if not exists campaign_events_campaign_day_idx on public.campaign_events(campaign_id, event_day, event_type);
create index if not exists store_branches_store_idx on public.store_branches(store_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

-- Stores can edit campaign contents, but status changes are permitted only through the
-- audited RPCs below. This prevents a direct REST update from bypassing review.
create or replace function public.enforce_campaign_status_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not public.is_app_developer() then
    new.status := 'draft';
  end if;
  if tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and coalesce(current_setting('app.campaign_transition', true), '') <> 'allowed' then
    raise exception 'campaign status must be changed through an approved workflow';
  end if;
  return new;
end; $$;

drop trigger if exists app_roles_updated_at on public.app_roles;
create trigger app_roles_updated_at before update on public.app_roles for each row execute function public.set_updated_at();
drop trigger if exists stores_updated_at on public.stores;
create trigger stores_updated_at before update on public.stores for each row execute function public.set_updated_at();
drop trigger if exists store_branches_updated_at on public.store_branches;
create trigger store_branches_updated_at before update on public.store_branches for each row execute function public.set_updated_at();
drop trigger if exists ad_campaigns_updated_at on public.ad_campaigns;
create trigger ad_campaigns_updated_at before update on public.ad_campaigns for each row execute function public.set_updated_at();
drop trigger if exists enforce_campaign_status_transition on public.ad_campaigns;
create trigger enforce_campaign_status_transition before insert or update on public.ad_campaigns for each row execute function public.enforce_campaign_status_transition();

-- State transitions that change review status always go through these RPC functions.
create or replace function public.submit_campaign(target_campaign_id uuid)
returns public.ad_campaigns language plpgsql security definer set search_path = public as $$
declare result public.ad_campaigns;
begin
  select * into result from public.ad_campaigns where id = target_campaign_id for update;
  if result.id is null or not public.can_manage_store(result.store_id) then raise exception 'campaign not found'; end if;
  if result.status not in ('draft', 'rejected') then raise exception 'campaign cannot be submitted'; end if;
  perform set_config('app.campaign_transition', 'allowed', true);
  update public.ad_campaigns set status = 'submitted', submitted_at = now(), rejection_reason = null where id = target_campaign_id returning * into result;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id) values (auth.uid(), 'submitted', 'campaign', target_campaign_id);
  return result;
end; $$;

create or replace function public.review_campaign(target_campaign_id uuid, decision text, reason text default null)
returns public.ad_campaigns language plpgsql security definer set search_path = public as $$
declare result public.ad_campaigns; next_status public.ad_campaign_status;
begin
  if not public.is_app_developer() then raise exception 'developer role required'; end if;
  if decision not in ('approved', 'rejected', 'paused') then raise exception 'invalid decision'; end if;
  select * into result from public.ad_campaigns where id = target_campaign_id for update;
  if result.id is null then raise exception 'campaign not found'; end if;
  if decision in ('approved', 'rejected') and result.status <> 'submitted' then raise exception 'campaign is not awaiting review'; end if;
  if decision = 'paused' and result.status not in ('approved', 'scheduled', 'active') then raise exception 'campaign cannot be paused'; end if;
  next_status := case
    when decision = 'approved' and result.starts_at > now() then 'scheduled'::public.ad_campaign_status
    when decision = 'approved' then 'active'::public.ad_campaign_status
    else decision::public.ad_campaign_status
  end;
  perform set_config('app.campaign_transition', 'allowed', true);
  update public.ad_campaigns
    set status = next_status,
        approved_at = case when decision = 'approved' then now() else approved_at end,
        approved_by = case when decision = 'approved' then auth.uid() else approved_by end,
        paused_at = case when decision = 'paused' then now() else paused_at end,
        rejection_reason = case when decision = 'rejected' then nullif(trim(reason), '') else rejection_reason end
    where id = target_campaign_id returning * into result;
  if result.id is null then raise exception 'campaign not found'; end if;
  insert into public.ad_campaign_reviews(campaign_id, reviewer_id, decision, reason) values (target_campaign_id, auth.uid(), decision, nullif(trim(reason), ''));
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, detail) values (auth.uid(), decision, 'campaign', target_campaign_id, jsonb_build_object('reason', coalesce(nullif(trim(reason), ''), '')));
  return result;
end; $$;

create or replace function public.stop_campaign(target_campaign_id uuid)
returns public.ad_campaigns language plpgsql security definer set search_path = public as $$
declare result public.ad_campaigns;
begin
  select * into result from public.ad_campaigns where id = target_campaign_id for update;
  if result.id is null or not (public.is_app_developer() or public.can_manage_store(result.store_id)) then raise exception 'campaign not found'; end if;
  if result.status not in ('approved', 'scheduled', 'active') then raise exception 'campaign cannot be stopped'; end if;
  perform set_config('app.campaign_transition', 'allowed', true);
  update public.ad_campaigns set status = 'paused', paused_at = now() where id = target_campaign_id returning * into result;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id) values (auth.uid(), 'paused', 'campaign', target_campaign_id);
  return result;
end; $$;

create or replace function public.store_campaign_metrics(target_store_id uuid)
returns table(campaign_id uuid, impressions bigint, detail_views bigint, discount_saves bigint, shopping_adds bigint, map_opens bigint, hides bigint)
language sql stable security definer set search_path = public as $$
  select c.id,
    count(e.id) filter (where e.event_type = 'impression'),
    count(e.id) filter (where e.event_type = 'detail_view'),
    count(e.id) filter (where e.event_type = 'save_discount'),
    count(e.id) filter (where e.event_type = 'add_to_shopping'),
    count(e.id) filter (where e.event_type = 'map_open'),
    count(e.id) filter (where e.event_type = 'hide')
  from public.ad_campaigns c
  left join public.campaign_events e on e.campaign_id = c.id
  where c.store_id = target_store_id and public.can_manage_store(target_store_id)
  group by c.id;
$$;

create or replace function public.developer_data_counts()
returns table(user_count bigint, store_count bigint, campaign_count bigint, discount_count bigint, error_count bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from auth.users),
    (select count(*) from public.stores),
    (select count(*) from public.ad_campaigns),
    (select count(*) from public.nsp_user_discounts),
    (select count(*) from public.app_error_logs);
$$;

alter table public.app_roles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.store_branches enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_campaign_targets enable row level security;
alter table public.ad_campaign_reviews enable row level security;
alter table public.campaign_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_error_logs enable row level security;
alter table public.feature_flags enable row level security;

-- Roles can only be read by their owner. No browser-side role update policy exists.
drop policy if exists "read own app role" on public.app_roles;
drop policy if exists "developer reads stores" on public.stores;
drop policy if exists "store members read own membership" on public.store_members;
drop policy if exists "store members read own branches" on public.store_branches;
drop policy if exists "store members edit own branches" on public.store_branches;
drop policy if exists "store members edit own stores" on public.stores;
drop policy if exists "campaign owner manages own store" on public.ad_campaigns;
drop policy if exists "users read active approved ads" on public.ad_campaigns;
drop policy if exists "campaign targets managed by owner" on public.ad_campaign_targets;
drop policy if exists "users read active campaign targets" on public.ad_campaign_targets;
drop policy if exists "developers read campaign reviews" on public.ad_campaign_reviews;
drop policy if exists "store reads own review results" on public.ad_campaign_reviews;
drop policy if exists "authenticated records allowed event" on public.campaign_events;
drop policy if exists "developer reads aggregate event rows" on public.campaign_events;
drop policy if exists "developers read audit logs" on public.audit_logs;
drop policy if exists "authenticated writes sanitized errors" on public.app_error_logs;
drop policy if exists "developers read errors" on public.app_error_logs;
drop policy if exists "developers manage flags" on public.feature_flags;
create policy "read own app role" on public.app_roles for select to authenticated using (user_id = auth.uid() or public.is_app_developer());
create policy "developer reads stores" on public.stores for select to authenticated using (public.is_app_developer() or public.can_manage_store(id));
create policy "store members read own membership" on public.store_members for select to authenticated using (user_id = auth.uid() or public.is_app_developer());
create policy "store members read own branches" on public.store_branches for select to authenticated using (public.can_manage_store(store_id));
create policy "store members edit own branches" on public.store_branches for all to authenticated using (public.can_manage_store(store_id)) with check (public.can_manage_store(store_id));
create policy "store members edit own stores" on public.stores for update to authenticated using (public.can_manage_store(id)) with check (public.can_manage_store(id));

-- Store members can only manage campaigns belonging to their store. A user can only read live ads.
create policy "campaign owner manages own store" on public.ad_campaigns for all to authenticated using (public.can_manage_store(store_id)) with check (public.can_manage_store(store_id));
create policy "users read active approved ads" on public.ad_campaigns for select to authenticated using (
  status in ('approved', 'scheduled', 'active') and starts_at <= now() and ends_at >= now()
);
create policy "campaign targets managed by owner" on public.ad_campaign_targets for all to authenticated using (
  exists (select 1 from public.ad_campaigns c where c.id = campaign_id and public.can_manage_store(c.store_id))
) with check (exists (select 1 from public.ad_campaigns c where c.id = campaign_id and public.can_manage_store(c.store_id)));
create policy "users read active campaign targets" on public.ad_campaign_targets for select to authenticated using (
  exists (select 1 from public.ad_campaigns c where c.id = campaign_id and c.status in ('approved', 'scheduled', 'active') and c.starts_at <= now() and c.ends_at >= now())
);
create policy "developers read campaign reviews" on public.ad_campaign_reviews for select to authenticated using (public.is_app_developer());
create policy "store reads own review results" on public.ad_campaign_reviews for select to authenticated using (exists (select 1 from public.ad_campaigns c where c.id = campaign_id and public.can_manage_store(c.store_id)));

-- Event rows contain aggregate-only fields. Stores receive aggregates through store_campaign_metrics(), never raw rows.
create policy "authenticated records allowed event" on public.campaign_events for insert to authenticated with check (
  exists (select 1 from public.ad_campaigns c where c.id = campaign_id and c.status in ('approved', 'scheduled', 'active') and c.starts_at <= now() and c.ends_at >= now())
);
create policy "developer reads aggregate event rows" on public.campaign_events for select to authenticated using (public.is_app_developer());
create policy "developers read audit logs" on public.audit_logs for select to authenticated using (public.is_app_developer());
create policy "authenticated writes sanitized errors" on public.app_error_logs for insert to authenticated with check (length(page) <= 80 and length(operation) <= 120 and length(error_type) <= 120 and length(coalesce(reproduction, '')) <= 500);
create policy "developers read errors" on public.app_error_logs for select to authenticated using (public.is_app_developer());
create policy "developers manage flags" on public.feature_flags for all to authenticated using (public.is_app_developer()) with check (public.is_app_developer());

grant usage on schema public to authenticated;
grant select on public.app_roles, public.stores, public.store_members, public.store_branches, public.ad_campaigns, public.ad_campaign_targets, public.ad_campaign_reviews to authenticated;
grant insert, update, delete on public.stores, public.store_branches, public.ad_campaigns, public.ad_campaign_targets to authenticated;
grant insert on public.campaign_events, public.app_error_logs to authenticated;
grant execute on function public.current_app_role(), public.is_app_developer(), public.can_manage_store(uuid), public.can_manage_store_path(text), public.submit_campaign(uuid), public.review_campaign(uuid, text, text), public.stop_campaign(uuid), public.store_campaign_metrics(uuid), public.developer_data_counts() to authenticated;

-- Optional campaign image storage. The object path always begins with the owning store UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-campaign-images', 'ad-campaign-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads campaign images" on storage.objects;
drop policy if exists "store uploads campaign images" on storage.objects;
drop policy if exists "store updates campaign images" on storage.objects;
drop policy if exists "store deletes campaign images" on storage.objects;
create policy "public reads campaign images" on storage.objects for select using (bucket_id = 'ad-campaign-images');
create policy "store uploads campaign images" on storage.objects for insert to authenticated with check (bucket_id = 'ad-campaign-images' and public.can_manage_store_path(name));
create policy "store updates campaign images" on storage.objects for update to authenticated using (bucket_id = 'ad-campaign-images' and public.can_manage_store_path(name)) with check (bucket_id = 'ad-campaign-images' and public.can_manage_store_path(name));
create policy "store deletes campaign images" on storage.objects for delete to authenticated using (bucket_id = 'ad-campaign-images' and public.can_manage_store_path(name));

-- Trusted initial setup examples (replace UUID values; do not expose service_role in the browser):
-- insert into public.app_roles(user_id, role) values ('AUTH_USER_UUID', 'developer') on conflict (user_id) do update set role = excluded.role;
-- insert into public.app_roles(user_id, role) values ('AUTH_STORE_USER_UUID', 'store') on conflict (user_id) do update set role = excluded.role;
-- insert into public.stores(name) values ('店舗名') returning id;
-- insert into public.store_members(store_id, user_id, member_role) values ('STORE_UUID', 'AUTH_STORE_USER_UUID', 'owner');
