-- Kaimono Clock ver3.2 user-facing ad visibility patch.
-- Run this in the Supabase SQL editor when store ads are visible in debug review
-- but do not appear for normal users who registered the same store in discount notes.

alter table public.ad_campaigns
  add column if not exists user_store_id text,
  add column if not exists store_name text not null default '',
  add column if not exists branch_name text,
  add column if not exists branch_map_url text,
  add column if not exists branch_latitude double precision,
  add column if not exists branch_longitude double precision;

update public.ad_campaigns campaign
   set user_store_id = coalesce(campaign.user_store_id, store.external_key),
       store_name = coalesce(nullif(campaign.store_name, ''), store.name)
  from public.stores store
 where campaign.store_id = store.id
   and (campaign.user_store_id is null or campaign.store_name = '');

update public.ad_campaigns campaign
   set user_store_id = 'sample-supermarket-1'
 where campaign.user_store_id is null
   and (
     campaign.store_name = '駅前サンプルスーパー'
     or exists (
       select 1
       from public.stores store
       where store.id = campaign.store_id
         and store.name = '駅前サンプルスーパー'
     )
   );

-- Remove only the synthetic row created by an earlier faulty revision of this
-- patch. User-created campaigns are never inserted, replaced or deleted here.
delete from public.ad_campaigns
 where external_key = 'sample-kakigori-syrup-campaign'
   and user_notice = '表示確認用のサンプル広告です。';

create index if not exists ad_campaigns_user_store_status_idx
  on public.ad_campaigns(user_store_id, status, starts_at, ends_at)
  where user_store_id is not null;

create or replace function public.active_ad_campaigns()
returns setof public.ad_campaigns
language sql stable security definer set search_path = public as $$
  select campaign.*
  from public.ad_campaigns campaign
  where campaign.status in ('approved', 'scheduled', 'active')
    and campaign.starts_at <= now()
    and campaign.ends_at >= now()
    and exists (
      select 1
      from public.nsp_user_discounts discount
      where discount.user_id = auth.uid()
        and (
          discount.store_id = campaign.user_store_id
          or discount.store_name = campaign.store_name
          or exists (
            select 1
            from public.stores store
            where store.id = campaign.store_id
              and (discount.store_id = store.external_key or discount.store_name = store.name)
          )
        )
    )
  order by campaign.starts_at desc
  limit 50;
$$;

create or replace function public.registered_store_ad_campaigns()
returns setof public.ad_campaigns
language sql stable security definer set search_path = public as $$
  select campaign.*
  from public.ad_campaigns campaign
  where campaign.status in ('approved', 'scheduled', 'active')
    and campaign.starts_at <= now()
    and campaign.ends_at >= now()
    and exists (
      select 1
      from public.nsp_user_discounts discount
      where discount.user_id = auth.uid()
        and (
          discount.store_id = campaign.user_store_id
          or discount.store_name = campaign.store_name
          or exists (
            select 1
            from public.stores store
            where store.id = campaign.store_id
              and (discount.store_id = store.external_key or discount.store_name = store.name)
          )
        )
    )
  order by campaign.starts_at desc
  limit 50;
$$;

-- Read-only diagnostics for campaigns tied to one of the current user's saved
-- stores. This intentionally includes inactive rows so status/date mismatches
-- can be identified without granting direct table access.
create or replace function public.registered_store_ad_campaign_diagnostics()
returns table (
  campaign_id uuid,
  product_name text,
  headline text,
  campaign_store_id text,
  campaign_store_name text,
  campaign_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_currently_deliverable boolean
)
language sql stable security definer set search_path = public as $$
  select
    campaign.id,
    campaign.product_name,
    campaign.headline,
    campaign.user_store_id,
    campaign.store_name,
    campaign.status::text,
    campaign.starts_at,
    campaign.ends_at,
    campaign.status in ('approved', 'scheduled', 'active')
      and campaign.starts_at <= now()
      and campaign.ends_at >= now()
  from public.ad_campaigns campaign
  where exists (
    select 1
    from public.nsp_user_discounts discount
    where discount.user_id = auth.uid()
      and (
        discount.store_id = campaign.user_store_id
        or discount.store_name = campaign.store_name
        or exists (
          select 1
          from public.stores store
          where store.id = campaign.store_id
            and (discount.store_id = store.external_key or discount.store_name = store.name)
        )
      )
  )
  order by campaign.updated_at desc;
$$;

grant execute on function public.active_ad_campaigns() to authenticated;
grant execute on function public.registered_store_ad_campaigns() to authenticated;
grant execute on function public.registered_store_ad_campaign_diagnostics() to authenticated;

notify pgrst, 'reload schema';
