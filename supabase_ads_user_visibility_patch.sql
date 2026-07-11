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

-- Repair the approved sample campaign used for the end-to-end display test.
-- Older debug builds could keep the review result only in browser storage, or
-- leave the database row outside its delivery window. Keep this migration
-- idempotent so it is safe to run again.
do $$
declare
  sample_store_id uuid;
  sample_campaign_id uuid;
begin
  select id
    into sample_store_id
    from public.stores
   where external_key = 'sample-supermarket-1'
   order by created_at
   limit 1;

  if sample_store_id is null then
    select id
      into sample_store_id
      from public.stores
     where name = '駅前サンプルスーパー'
     order by created_at
     limit 1;

    if sample_store_id is not null then
      update public.stores
         set external_key = 'sample-supermarket-1'
       where id = sample_store_id;
    else
      insert into public.stores(external_key, name, profile, contact_note)
      values (
        'sample-supermarket-1',
        '駅前サンプルスーパー',
        'ユーザー向けサンプル店舗です。',
        'sample campaign visibility test'
      )
      returning id into sample_store_id;
    end if;
  end if;

  select id
    into sample_campaign_id
    from public.ad_campaigns
   where (
       product_name ilike '%かき氷%'
       or headline ilike '%かき氷%'
     )
   order by updated_at desc
   limit 1;

  perform set_config('app.campaign_transition', 'allowed', true);

  if sample_campaign_id is not null then
    update public.ad_campaigns
       set store_id = sample_store_id,
           user_store_id = 'sample-supermarket-1',
           store_name = '駅前サンプルスーパー',
           status = 'active',
           starts_at = least(starts_at, now() - interval '1 minute'),
           ends_at = greatest(ends_at, now() + interval '14 days'),
           approved_at = coalesce(approved_at, now()),
           rejection_reason = null,
           paused_at = null,
           ended_at = null
     where id = sample_campaign_id;
  else
    insert into public.ad_campaigns(
      external_key, store_id, user_store_id, store_name,
      product_name, headline, regular_price, sale_price,
      discount_conditions, starts_at, ends_at, category,
      stock_note, user_notice, status, submitted_at, approved_at
    ) values (
      'sample-kakigori-syrup-campaign',
      sample_store_id,
      'sample-supermarket-1',
      '駅前サンプルスーパー',
      'かき氷シロップ',
      'かき氷シロップの割引',
      null,
      null,
      '価格と在庫は店舗でご確認ください',
      now() - interval '1 minute',
      now() + interval '14 days',
      'food',
      '在庫状況は店舗でご確認ください',
      '表示確認用のサンプル広告です。',
      'active',
      now(),
      now()
    )
    on conflict (external_key) do update
      set store_id = excluded.store_id,
          user_store_id = excluded.user_store_id,
          store_name = excluded.store_name,
          product_name = excluded.product_name,
          headline = excluded.headline,
          status = 'active',
          starts_at = excluded.starts_at,
          ends_at = excluded.ends_at,
          approved_at = now(),
          rejection_reason = null,
          paused_at = null,
          ended_at = null;
  end if;
end $$;

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

grant execute on function public.active_ad_campaigns() to authenticated;
grant execute on function public.registered_store_ad_campaigns() to authenticated;

notify pgrst, 'reload schema';
