# ver3.2 広告・店舗機能のSupabase設定

`supabase_ads_schema.sql` を Supabase の SQL Editor で実行してください。既存の家計簿・割引メモのテーブルは削除しません。

ブラウザ側では anon key だけを使います。`service_role` key はアプリへ置かないでください。

## 1. スキーマを更新する

SQL Editor で `supabase_ads_schema.sql` の全内容を実行します。

このSQLは再実行を想定しています。店舗、支店、広告、審査、集計イベント、監査ログ、エラーログ、RLSポリシー、RPCを作成・更新します。

今回の重要な変更:

- 店舗画面の直接テーブル参照は、所属している契約店舗のデータだけに制限します。
- ユーザー向け広告表示は `active_ad_campaigns()` RPC から取得します。
- 開発者は `create_debug_sample_campaign()` で、駅前サンプルスーパーに紐づく審査待ち広告をDBへ作成できます。

## 2. Supabase AuthのユーザーIDを確認する

```sql
select id, email
from auth.users
order by created_at desc;
```

## 3. 開発者roleを設定する

```sql
insert into public.app_roles (user_id, role)
values ('DEVELOPER_USER_UUID', 'developer')
on conflict (user_id) do update set role = excluded.role;
```

## 4. 店舗アカウントと契約店舗を設定する

```sql
insert into public.app_roles (user_id, role)
values ('STORE_USER_UUID', 'store')
on conflict (user_id) do update set role = excluded.role;

insert into public.stores (name, profile)
values ('店舗名', '店舗プロフィール')
returning id;
```

返された `STORE_UUID` を使って、その店舗アカウントへ権限を付けます。

```sql
insert into public.store_members (store_id, user_id, member_role)
values ('STORE_UUID', 'STORE_USER_UUID', 'owner');
```

支店は店舗画面から追加できます。SQLで作る場合は次の形です。

```sql
insert into public.store_branches (store_id, name, address, latitude, longitude, map_url)
values (
  'STORE_UUID',
  '駅前店',
  '住所',
  35.000000,
  139.000000,
  'https://www.google.com/maps'
);
```

## 5. 駅前サンプルスーパーをDBに作る

開発者roleの実アカウントでログインし、`debug.html` の「サンプル広告を生成」を押すと、次のデータがDBに保存されます。

- `stores.external_key = sample-supermarket-1`
- 店舗名: 駅前サンプルスーパー
- 支店: 駅前店
- 座標: ユーザー向けの「サンプルで試す」の駅前サンプルスーパーと同じ座標
- 広告状態: 審査待ち

特殊入力の `debug@kaimono.local` / `store@kaimono.local` はUI確認用のデモです。Supabase認証セッションがないためDB保存は行いません。

## 6. 確認項目

- 店舗roleのアカウントで `store.html` を開き、自分の契約店舗だけが表示される
- 別店舗の支店・広告が一覧に出ない
- 支店を追加できる
- 広告を下書き保存し、審査へ申請できる
- 開発者roleのアカウントで `debug.html` を開き、審査待ち広告を確認・承認できる
- 承認済みかつ配信期間内の広告だけが、買い物メモ・割引メモの「店舗からのお知らせ」に表示される
