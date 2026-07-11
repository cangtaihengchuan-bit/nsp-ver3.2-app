# ver3.2 広告機能のSupabase初期設定

この手順は、`supabase_ads_schema.sql` を実行してから行います。ブラウザには匿名キーだけを置き、`service_role` キーは使いません。

## 1. スキーマを作成する

Supabase Dashboard の SQL Editor で、`supabase_ads_schema.sql` の全内容を実行します。

作成される主な対象は、ロール、店舗、支店、広告、審査、集計イベント、監査ログ、エラーログです。既存の家計簿・割引メモのテーブルは削除しません。

## 2. Supabase AuthのユーザーIDを確認する

管理者だけが SQL Editor で次を実行し、roleを設定する対象のUUIDを確認します。

```sql
select id, email
from auth.users
order by created_at desc;
```

この結果は管理者用です。アプリ画面や店舗画面にはメールアドレス・ユーザーIDを表示しません。

## 3. 開発者roleを設定する

`DEVELOPER_USER_UUID` を実際のUUIDに置き換えて実行します。

```sql
insert into public.app_roles (user_id, role)
values ('DEVELOPER_USER_UUID', 'developer')
on conflict (user_id) do update set role = excluded.role;
```

## 4. 店舗と店舗アカウントを設定する

`STORE_USER_UUID` を実際の店舗アカウントのUUIDに置き換えます。`store_id` は表示されたUUIDを次のSQLへ使います。

```sql
insert into public.app_roles (user_id, role)
values ('STORE_USER_UUID', 'store')
on conflict (user_id) do update set role = excluded.role;

insert into public.stores (name, profile)
values ('サンプルストア', '店舗プロフィール')
returning id;
```

返された`STORE_UUID`を使って、店舗アカウントへ所有者権限を付けます。

```sql
insert into public.store_members (store_id, user_id, member_role)
values ('STORE_UUID', 'STORE_USER_UUID', 'owner');
```

必要に応じて支店も追加します。緯度・経度は、ユーザーとの距離判定だけに使用します。

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

## 5. 確認すること

- 開発者roleのアカウントでログインし、`debug.html`を開けること
- 店舗roleのアカウントでログインし、`store.html`で自店舗だけが見えること
- 通常ユーザーでは`debug.html`と`store.html`が利用不可であること
- 承認済みかつ配信期間内の広告だけが、割引メモ・買い物メモの「店舗からのお知らせ」に表示されること

固定入力のデバッグ・店舗モードはUI確認用のデモであり、実データの権限には使用しません。
