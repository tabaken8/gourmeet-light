# パフォーマンス監査レポート

> 2026-08-12 実施。コード静的解析のみ。実測データなし。

---

## 3-1. 往復回数（タイムライン1画面）

### サーバー側クエリ

#### ゲスト（未ログイン）: 4回、全て直列

| # | ファイル:行 | テーブル/RPC | 直列/並列 | 備考 |
|---|------------|-------------|----------|------|
| S1 | `timeline/page.tsx:14` | `auth.getUser()` | 起点 | |
| S2 | `FriendsTimelineServer.tsx:167` | `posts` + `profiles` join | S1待ち | `.eq("is_public",true).order("created_at",desc).limit(160)` |
| S3 | `FriendsTimelineServer.tsx:127` | `place_station_links` | S2待ち | `.in("place_id",...).eq("rank",1)` |
| S4 | `FriendsTimelineServer.tsx:40` | `profiles` | S2待ち | `.eq("is_public",true).order("created_at",desc).limit(40)` |

**問題:** S3とS4は互いに独立しているが直列に実行されている。`Promise.all` で並列化可能。

#### ログインユーザー: 9〜12回

| # | ファイル:行 | テーブル/RPC | 直列/並列 |
|---|------------|-------------|----------|
| S1 | `timeline/page.tsx:14` | `auth.getUser()` | 起点 |
| S2a | `FriendsTimelineServer.tsx:203` | RPC `timeline_friends_v1` | **並列**（S2b,S2cと） |
| S2b | `FriendsTimelineServer.tsx:63` | `follows` (count) | **並列**（S2a,S2cと） |
| S2c | `timeline-fof.ts:26-37` | `follows` x2 | **並列**（S2a,S2bと）、内部も2並列 |
| S3-L | `FriendsTimelineServer.tsx:73` | `follows` | S2b待ち（条件付き） |
| S4-L | `FriendsTimelineServer.tsx:40` | `profiles` | S3-L待ち（条件付き） |
| S5-L | `timeline-fof.ts:60` | `follows` | S2c待ち |
| S6-L | `timeline-fof.ts:83` | `profiles` | S5-L待ち |
| S7-L | `timeline-fof.ts:128` | `posts` + `profiles` join | S2cチェーン待ち |
| S8-L | `timeline-fof.ts:152` | `post_likes` | S7-L待ち |
| S9-L | `FriendsTimelineServer.tsx:259` | `posts` | S2a待ち（条件付き） |
| S10-L | `FriendsTimelineServer.tsx:278` | `place_station_links` | 全投稿組み立て後 |

### クライアント側クエリ

| # | ファイル:行 | テーブル/API | トリガー | N+1 |
|---|------------|-------------|---------|-----|
| C1 | `FriendsTimelineClient.tsx:667` | `/api/timeline/discover` | useEffect（ゲスト/フォロー0） | No |
| C2 | `FriendsTimelineClient.tsx:592` | `/api/timeline/friends` | IntersectionObserver | No |
| C3a | `PostComments.tsx:137` | `comments` | **投稿ごとにマウント時** | **Yes** |
| C3b | `PostComments.tsx:165` | `profiles` | C3a待ち | **Yes** |
| C3c | `PostComments.tsx:203` | `comment_likes` | C3a待ち | **Yes** |
| C4 | `PlacePhotoGallery.tsx:79` | `/api/places/photos` | **投稿ごと（デスクトップ）** | **Yes** |

### 合計クエリ数の推定

| シナリオ | サーバー | クライアント | 合計 |
|---------|---------|-------------|------|
| ゲスト・20投稿 | 4 | 60 (PostComments) + 20 (PlacePhoto) | **~84** |
| ログイン・20投稿 | 9〜12 | 60 + 20 | **~92** |

### 直列await（並列化可能な箇所）

| ファイル:行 | 内容 | 並列化可能な相手 |
|------------|------|----------------|
| `FriendsTimelineServer.tsx:127→40` (ゲスト) | 最寄り駅 → サジェストユーザー | 互いに独立 |
| `timeline-fof.ts:83` と `timeline-fof.ts:128` | FoFプロフィール取得 / FoF投稿取得 | 異なるデータに依存、並列化可能 |

### map/forEach 内のクエリ発行（N+1パターン）

| ファイル:行 | 内容 | 影響 |
|------------|------|------|
| `PostComments.tsx:137` | 投稿ごとに `comments` テーブルへクエリ | 20投稿 = 20クエリ |
| `PostComments.tsx:165` | 投稿ごとに `profiles` テーブルへクエリ | 20投稿 = 20クエリ |
| `PostComments.tsx:203` | 投稿ごとに `comment_likes` テーブルへクエリ | 20投稿 = 20クエリ |
| `PlacePhotoGallery.tsx:79` | 投稿ごとに `/api/places/photos` へfetch | 20投稿 = 20リクエスト |

---

## 3-2. インデックスの棚卸し

### スキーマ定義の所在

- `supabase/migrations/` ディレクトリは**存在しない**
- リポジトリ内のSQLファイルは `supabase_search_posts_semantic.sql`（RPC定義のみ）1件
- TypeScript型定義 `src/lib/supabase/database.types.ts` に `posts` と `places` の部分的な型あり
- `docs/AI_SEARCH_ARCHITECTURE.md` に embedding 関連のスキーマ断片あり

**結論: スキーマと既存インデックスの完全な定義はリポジトリ内に存在しない。以下の表の「インデックス有無」は、リポジトリ内で確認できたもの以外は全て「不明」。**

### コードから参照されるテーブル一覧（34テーブル）

ai_thread_messages, ai_threads, collections, comment_likes, comments, events,
exchange_tickets, follows, hub_stations, invite_codes, messages, notifications,
place_photo_refs_cache, place_pins, place_station_links, places, point_balances,
point_gifts, point_transactions, post_bookmarks, post_collections,
post_detail_request_answers, post_detail_requests, post_likes, post_pins,
post_wants, posts, profiles, user_notification_settings, user_place_pins,
user_places, user_post_subscriptions

### 確認できたインデックス

| インデックス名 | テーブル | カラム | 種別 | 出典 |
|--------------|--------|--------|------|------|
| `posts_embedding_hnsw` | posts | embedding | HNSW (vector_cosine_ops) | docs/AI_SEARCH_ARCHITECTURE.md |
| (PK) | posts | id | B-tree | 暗黙 |
| (PK) | profiles | id | B-tree | 暗黙 |
| (PK) | places | place_id | B-tree | 暗黙 |

### 高頻度クエリパターンとインデックス対応状況

#### 高優先度

| テーブル | カラム | クエリ例 | インデックス |
|---------|--------|---------|-------------|
| posts | user_id | `.eq("user_id",...)` — プロフィール、タイムライン、コレクション | 不明 |
| posts | (user_id, created_at DESC) | `.eq("user_id",...).order("created_at",desc)` — 複合条件 | 不明 |
| post_likes | (post_id, user_id) | `.eq("post_id",...).eq("user_id",...)` — いいねトグル | 不明 |
| post_wants | (post_id, user_id) | 同上 — 行きたいトグル | 不明 |
| post_bookmarks | (post_id, user_id) | 同上 — ブックマークトグル | 不明 |
| follows | (follower_id, followee_id) | `.eq("follower_id",...).eq("followee_id",...)` — フォロー確認 | 不明 |
| follows | (follower_id, status) | `.eq("follower_id",...).eq("status","accepted")` — タイムラインRPC | 不明 |
| follows | (followee_id, status) | `.eq("followee_id",...).eq("status",...)` — フォロワー一覧 | 不明 |
| profiles | username | `.eq("username",...)` — @メンション解決、プロフィールURL | 不明 |

#### 中優先度

| テーブル | カラム | インデックス |
|---------|--------|-------------|
| place_station_links | (place_id, rank) | 不明 |
| place_station_links | (station_place_id, distance_m) | 不明 |
| post_collections | collection_id | 不明 |
| post_pins | (user_id, sort_order) | 不明 |
| post_detail_requests | post_id | 不明 |
| post_detail_request_answers | request_id | 不明 |
| ai_threads | user_id | 不明 |
| ai_thread_messages | thread_id | 不明 |
| comments | post_id | 不明 |
| user_notification_settings | user_id | 不明 |

### RPC関数一覧

| RPC名 | 呼び出し元 |
|-------|-----------|
| `timeline_friends_v1` | FriendsTimelineServer.tsx, api/timeline/friends/route.ts |
| `timeline_discover_v1` | api/timeline/discover/route.ts |
| `search_posts_semantic` | lib/aiSearchTools.ts, api/search/semantic/route.ts |
| `search_posts_v3` | api/search/route.ts（2箇所） |
| `suggest_stations_v1` | api/search/suggest/station/route.ts, api/search/semantic/route.ts, lib/aiSearchTools.ts |
| `get_profile_counts` | u/[id]/page.tsx, profile/page.tsx, lib/queries.ts |
| `get_earliest_post_key` | u/[id]/page.tsx, profile/page.tsx, lib/queries.ts |
| `get_heatmap_days` | u/[id]/page.tsx, profile/page.tsx, lib/queries.ts |
| `is_username_available` | settings/username/page.tsx, profile/update/route.ts |
| `reserve_invite_code` | auth/callback/route.ts, api/invites/reserve/route.ts |
| `get_my_reserved_invite` | api/invites/reserve/route.ts |
| `posts_by_place` | api/place-posts/route.ts |
| `places_missing_station_links` | api/admin/backfill-stations/route.ts |
| `request_point_redeem` | api/points/redeem/route.ts |

---

## 3-3. RLSポリシー

**リポジトリ内に RLS ポリシーの定義は存在しない。**

- `CREATE POLICY` や `ENABLE ROW LEVEL SECURITY` の記述はSQLファイル・ドキュメントいずれにもない
- コード内のコメントで RLS の存在が言及されている箇所:
  - `api/comments/[id]/route.ts:22` — 「RLSでも守る想定だが二重に安全」
  - `api/admin/backfill-embeddings/route.ts:10` — 「RLS をバイパスするサービスロールクライアント」
  - `docs/AI_SEARCH_ARCHITECTURE.md:303` — 「サービスロールキー必須（RLSを回避するため）」
  - `api/place-genre-vote/route.ts:38` — 「RLSで見えない場合は rows が空でもOK」
  - `api/points/redeem/route.ts:79` — 「RLSもユーザー文脈で動く」

RLS はSupabaseダッシュボード上で設定されていると推測されるが、ポリシー定義がバージョン管理されていないため以下の監査は**実施不可能**:

- [ ] `auth.uid()` を `(select auth.uid())` で包んでいるか
- [ ] ポリシー内で他テーブルへサブクエリしているか
- [ ] USING句に関数呼び出しを含むか

---

## 3-4. 画像配信

### next/image の使用状況

**next/image は一切使用されていない。** 全画像は `<img>` タグで描画。

`next.config.ts:9` のコメント:
> 「Supabase Storage Image Transforms（Pro Plan）を使うので Next.js Image Optimization は不要。」

### Supabase Storage 変換パラメータの適用状況

集中管理: `src/lib/imageUrl.ts` の `timelineImageUrl()` — width=1080, quality=82 で変換。

| 用途 | 変換 | ファイル:行 |
|------|------|-----------|
| タイムライン投稿画像 | ✅ `timelineImageUrl()` width=1080, quality=82 | `TimelineFeed.tsx:107,117` |
| 年間統計マップピン | ✅ カスタム変換（width/height/quality指定） | `ProfileYearStats.tsx:481-491` |
| **アバター画像（10+箇所）** | ❌ **原寸配信** | `PostMainContent.tsx:289`, `PostComments.tsx:390`, `search/page.tsx:1159,1420`, `followers/page.tsx:52`, `following/page.tsx:51`, `MapRecommendPanel.tsx:149,181` 他 |
| **OptimisticPostCard** | ❌ **原寸配信** | `OptimisticPostCard.tsx:108` |
| Place写真 | N/A (Google Places由来) | `PlacePhotoGallery.tsx:161,210` |

**問題:** アバターは CSS 上 24〜40px 幅で表示されるが、アップロード時の原寸（数百px〜数千px）で配信されている。Retina考慮しても80px幅で十分。

### タイムライン1画面あたりの画像枚数

| 種類 | 枚数（20投稿時） | 遅延読み込み |
|------|----------------|-------------|
| アバター | 20枚 | ✅ `loading="lazy"` |
| 投稿画像 | 20枚（各1枚以上） | ✅ `loading="lazy"` |
| Place写真（デスクトップ） | 最大160枚（8枚×20投稿） | ✅ IntersectionObserver |
| **合計** | **最大200枚** | |

**問題:** 最初の投稿画像に `fetchPriority="high"` が設定されていない。`PostImageCarousel` の `eager` モードは `false` でタイムラインに渡されている (`TimelineFeed.tsx:918`)。LCPに悪影響の可能性。

---

## 3-5. キャッシュとレンダリング境界

### `export const dynamic` の状況

**`src/app/layout.tsx:1` で `force-dynamic` が設定されており、アプリ全体が動的レンダリング。**

全29ファイルが `force-dynamic` を指定しているが、ルートレイアウトの設定で全て継承されるため**個別指定は全て冗長**。

静的化できる可能性があるページ:
- `(app)/legal/privacy/page.tsx` — 純粋な静的コンテンツ
- `(app)/legal/terms/page.tsx` — 純粋な静的コンテンツ
- `(public)/page.tsx` — ランディングページ
- `auth/required/page.tsx` — 静的な案内ページ
- `auth/login/page.tsx`, `signup/page.tsx`, `reset/page.tsx` — フォーム（クライアント側で完結）

### `export const revalidate` の状況

5ファイルが `revalidate = 0` を設定しているが、同じファイルで `force-dynamic` も設定されているため**全て冗長**。

### `'use client'` の境界

76ファイルが `'use client'` を使用。

**不必要な `'use client'`:**

| ファイル | 理由 |
|---------|------|
| `LoadingCenter.tsx` | フック・イベントハンドラ・ブラウザAPI一切なし。純粋な静的マークアップ + CSSアニメーション |

**ページレベルの `'use client'` で分割検討余地があるもの:**

| ファイル | 現状 | サーバー側に移せる部分 |
|---------|------|---------------------|
| `follow-requests/page.tsx` | ページ全体がクライアント | 初期データ取得をサーバーコンポーネントに |
| `notifications/page.tsx` | ページ全体がクライアント | 初期データ取得をサーバーコンポーネントに |
| `settings/username/page.tsx` | ページ全体がクライアント | ページ枠をサーバーコンポーネントに |
| `settings/notifications/page.tsx` | ページ全体がクライアント | 設定レイアウトをサーバーコンポーネントに |

---

## (b) 推定インパクト順の仮説リスト

| # | 仮説 | 根拠 | なぜ遅いと考えるか | 検証状態 |
|---|------|------|-------------------|---------|
| 1 | **PostComments の N+1 が最大のボトルネック** | `PostComments.tsx:137,165,203` | 20投稿で60クライアント側Supabaseクエリ。各クエリが直列3段（comments→profiles→comment_likes）。レイテンシ合計はRTT×60 | 未検証 |
| 2 | **PlacePhotoGallery の N+1** | `PlacePhotoGallery.tsx:79` | デスクトップで投稿ごとにAPI fetch。20投稿で20リクエスト | 未検証 |
| 3 | **ルートレイアウトの force-dynamic が全ページを動的化** | `app/layout.tsx:1` | 静的化可能なページ（legal、landing、auth）も毎リクエスト再レンダリング。Vercel Edge Cacheが無効化されている | 未検証 |
| 4 | **アバター画像が原寸配信** | `PostComments.tsx:390`, `PostMainContent.tsx:289` 他10箇所 | 24-40px表示に対して原寸（数百〜数千px）を配信。20投稿のタイムラインで20枚の不要に大きい画像 | 未検証 |
| 5 | **タイムライン初画面のLCP画像にpriority未設定** | `TimelineFeed.tsx:918`（eager=false） | 最初の投稿画像が `loading="lazy"` で読み込まれるため、LCPが遅延する可能性 | 未検証 |
| 6 | **ゲストパスの直列ウォーターフォール** | `FriendsTimelineServer.tsx:127→40` | 最寄り駅クエリとサジェストユーザークエリが直列だが独立。Promise.allで並列化可能 | 未検証 |
| 7 | **time_of_day バックフィルの追加クエリ** | `FriendsTimelineServer.tsx:259` | RPC結果に `time_of_day` が無い場合、追加でpostsテーブルへクエリ。RPC自体に含めるべき | 未検証 |
| 8 | **インデックス不足の可能性** | セクション3-2参照 | 高頻度クエリ（follows, post_likes, posts.user_id等）のインデックス有無がリポジトリから確認不能。存在しない場合はフルスキャン | 未検証 |
| 9 | **RLSポリシーの最適化不足の可能性** | セクション3-3参照 | `auth.uid()` の非インライン化やサブクエリがあればクエリごとに余分なコスト。定義が未確認のため影響不明 | 未検証 |

---

## (c) 実測が必要な項目

| 項目 | 理由 | 推奨する計測方法 |
|------|------|----------------|
| PostComments N+1 の実際のレイテンシ | 60クエリの合計時間がUXに与える影響の定量化 | ブラウザDevToolsのNetworkタブでタイムライン読み込み時のSupabase REST呼び出し数と合計時間を計測 |
| タイムラインの TTFB / LCP | サーバー側9-12クエリの合計がTTFBにどう影響するか | Lighthouse または Web Vitals でタイムラインページを計測 |
| Supabase側の既存インデックス一覧 | リポジトリ内にスキーマがないため不明 | Supabase Dashboard → Table Editor → 各テーブルのインデックス確認、または `SELECT * FROM pg_indexes WHERE schemaname = 'public'` を実行 |
| RLSポリシーの定義 | リポジトリ内に存在しないため監査不可 | Supabase Dashboard → Authentication → Policies、または `SELECT * FROM pg_policies` を実行 |
| アバター画像の実際のファイルサイズ | 原寸配信の実コストの定量化 | ブラウザDevToolsでavatar画像の転送サイズを確認 |
| force-dynamic 解除時の静的ページのビルドサイズ | 静的化による改善幅の確認 | ルートレイアウトの `force-dynamic` を除去してビルドし、静的生成されるページを確認 |
| Google Places写真APIのレスポンスタイム | PlacePhotoGallery N+1 の実コスト | DevToolsで `/api/places/photos` の個別レスポンス時間を計測 |

---

## 免責

- スキーマ定義（テーブル構造、インデックス、RLSポリシー）はリポジトリ内に存在しないため、「不明」と記載した項目は**Supabaseダッシュボードまたは直接SQLでの確認が必要**。
- `docs/AI_SEARCH_ARCHITECTURE.md` は全文を読んで確認した。デプロイ・ブランチ運用に関する記述は含まれていなかった。
- 本レポートのクエリ数はコードの静的解析に基づく推定値。実行時の条件分岐により実際の数は変動する。
- RPC関数の内部実装はリポジトリ内に `search_posts_semantic` の1件のみ存在。他のRPCの内部クエリ数は不明。
