# ver3.2 広告・店舗機能のSupabase設定

`supabase_ads_schema.sql` を Supabase の SQL Editor で実行してください。既存の家計簿・割引メモのテーブルは削除しません。

ブラウザ側では anon key だけを使います。`service_role` key はアプリへ置かないでください。

## 1. スキーマを更新する

SQL Editor で `supabase_ads_schema.sql` の全内容を実行します。

このSQLは再実行を想定しています。店舗、広告、審査、集計イベント、監査ログ、エラーログ、RLSポリシー、RPCを作成・更新します。

今回の重要な変更:

- 店舗画面の直接テーブル参照は、所属している契約店舗のデータだけに制限します。
- ユーザー向け広告表示は `registered_store_ad_campaigns()` RPC から取得します。
- 表示条件は、ログインユーザーの `nsp_user_discounts.store_id` と広告の `ad_campaigns.user_store_id` が一致することです。
- 開発者は `create_debug_sample_campaign()` で、駅前サンプルスーパーに紐づく配信中サンプル広告をDBへ作成できます。

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

insert into public.stores (name, external_key, profile)
values ('マルナカOO店', 'marunaka-oo', '店舗プロフィール')
returning id;
```

返された `STORE_UUID` を使って、その店舗アカウントへ権限を付けます。

```sql
insert into public.store_members (store_id, user_id, member_role)
values ('STORE_UUID', 'STORE_USER_UUID', 'owner');
```

契約は1店舗ごとに管理します。チェーン店でも「マルナカOO店」「△△店」のように店舗ごとに `stores` を分けてください。

`stores.external_key` は、ユーザー側の割引メモに保存される `nsp_user_discounts.store_id` と一致させます。これが一致する店舗の広告だけがユーザーへ表示されます。

## 5. 駅前サンプルスーパーをDBに作る

開発者roleの実アカウントでログインし、`debug.html` の「サンプル広告を生成」を押すと、次のデータがDBに保存されます。

- `stores.external_key = sample-supermarket-1`
- 店舗名: 駅前サンプルスーパー
- `ad_campaigns.user_store_id = sample-supermarket-1`
- 広告状態: 配信中

ログイン中のユーザーが割引メモの「サンプルで試す」を押すと、`seed_user_sample_discount()` により `store_id = sample-supermarket-1` のサンプル割引メモが作成されます。その後、同じ店舗IDのサンプル広告が表示対象になります。

特殊入力の `debug@kaimono.local` / `store@kaimono.local` はUI確認用のデモです。Supabase認証セッションがないためDB保存は行いません。

## 6. 確認項目

- 店舗roleのアカウントで `store.html` を開き、自分の契約店舗だけが表示される
- 別店舗の広告が一覧に出ない
- 広告を下書き保存し、審査へ申請できる
- 開発者roleのアカウントで `debug.html` を開き、申請広告を確認・承認できる
- 配信中かつ同じ店舗IDの割引メモがある広告だけが、買い物メモ・割引メモの「登録した店舗からのお知らせ」に表示される
