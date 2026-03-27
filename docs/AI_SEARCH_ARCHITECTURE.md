# Gourmeet AI検索 アーキテクチャ

> Web版（Next.js）で実装済み。RN版移植の際にこのドキュメントを参照すること。

---

## 全体像

```
ユーザーの自然言語クエリ
        │
        ▼
  POST /api/search/ai-chat
        │
   ┌────┴──────────────────────────────┐
   │  LLM Tool Calling ループ（最大6回） │
   │                                    │
   │  resolve_station("渋谷")           │
   │       → suggest_stations_v1 RPC    │
   │                                    │
   │  resolve_username("alice")         │
   │       → profiles テーブル検索      │
   │                                    │
   │  get_my_taste_profile()            │
   │       → 自分の投稿embedding を平均 │
   │                                    │
   │  search_posts(...)                 │
   │       → generateEmbedding()        │
   │       → search_posts_semantic RPC  │
   │         (pgvector cosine類似度)    │
   └────────────────────────────────────┘
        │
        ▼
   rewrite層（gpt-4o-mini）
   自然な日本語に書き直し + 順位付け
        │
        ▼
   enrichCollectedPosts()
   プロフィール + 最寄り駅を付与
        │
        ▼
   { message, posts, detectedStations, detectedAuthor }
```

---

## 1. DB構成（Supabase / PostgreSQL）

### pgvector 拡張

```sql
create extension if not exists vector schema extensions;
```

### posts テーブルの追加カラム

```sql
alter table posts add column if not exists embedding vector(1536);
create index posts_embedding_hnsw
  on posts using hnsw (embedding vector_cosine_ops)
  with (m=16, ef_construction=64);
```

### search_posts_semantic 関数

```sql
create or replace function search_posts_semantic(
  query_embedding float8[],          -- ※ vector型ではなくfloat8[]。PostgRESTの制約
  p_user_id       uuid    default null,
  p_follow_only   boolean default false,
  p_station_place_ids text[] default null,  -- 複数駅OR条件対応
  p_radius_m      int     default 3000,
  p_threshold     float   default 0.1,
  p_limit         int     default 20,
  p_author_id     uuid    default null      -- @mention絞り込み
) returns table(...) language sql stable security definer as $$
  select ...
  from posts p
  where
    p.embedding is not null
    and (1 - (p.embedding <=> query_embedding::vector)) > p_threshold
    and (p_follow_only is false or exists(
      select 1 from follows f
      where f.follower_id = p_user_id
        and f.followee_id = p.user_id
        and f.status = 'accepted'
    ))
    and (p_station_place_ids is null or exists(
      select 1 from place_station_links psl
      where psl.place_id = p.place_id
        and psl.station_place_id = ANY(p_station_place_ids)
        and psl.distance_m <= p_radius_m
    ))
    and (p_author_id is null or p.user_id::uuid = p_author_id)
  order by p.embedding <=> query_embedding::vector
  limit p_limit;
$$;
```

**重要**: PostgRESTは `vector` 型のRPCパラメータをJSONから変換できない。
`float8[]` で受け取り、関数内で `query_embedding::vector` にキャストする。

---

## 2. Embedding生成パイプライン

### 投稿保存時（fire-and-forget）

```
新規投稿作成
    │
    ▼
.insert({...}).select("id").single()
    │
    ▼
fetch('/api/posts/${id}/embed', { method: 'POST' }).catch(() => {})
    ↑ await しない。失敗してもUXに影響させない
```

### /api/posts/[id]/embed の処理

```typescript
// buildEmbeddingText でテキストを構築
const text = buildEmbeddingText({
  area_label_ja,   // 例: "渋谷"
  primary_genre,   // 例: "イタリアン"
  place_name,      // 例: "リストランテ山田"
  content,         // 投稿本文
});
// → "渋谷 イタリアン 「リストランテ山田」 パスタが絶品でした"

// OpenAI text-embedding-3-small で1536次元ベクトル化
const embedding = await generateEmbedding(text);  // number[1536]

// DBに保存（number[] をそのまま渡すとSupabaseが自動変換）
await supabase.from("posts").update({ embedding }).eq("id", id);
```

### 投稿編集時（非同期）

content または place_id が変わった場合のみ再生成:

```typescript
if ("content" in patch || "place_id" in patch) {
  reembedPost(id, supabase).catch(console.error);  // non-blocking
}
```

---

## 3. AI検索の2モード

### モードA: シンプルセマンティック検索（/api/search/semantic）

テキストや選択されたジャンルがあるが、複雑なクエリではない場合に使用。
LLMオーバーヘッドなし、高速。

```
クエリ → parseSearchQuery（LLM）→ location/intent/mention に分解
                │
                ▼
  intent → generateEmbedding → search_posts_semantic RPC
  location → suggest_stations_v1 RPC → station_place_id
  mention → profiles テーブル → user_id
```

### モードB: AI Chatモード（/api/search/ai-chat）★メイン

自然言語クエリをLLMが解釈しツールを自律的に呼ぶ。

- OR条件（東京駅か渋谷駅）
- 複数ツールの組み合わせ（@alice の渋谷カフェ）
- パーソナライズ（僕と合いそう）
- ソート指定（おすすめ度順）

**フロントからのリクエスト:**

```typescript
const res = await fetch('/api/search/ai-chat', {
  method: 'POST',
  body: JSON.stringify({
    q: "渋谷でデートに使えるイタリアン",
    follow: false,          // フォローのみフィルタ
    history: [],            // 将来の会話履歴対応用
  })
});
const { message, posts, detectedStations, detectedAuthor } = await res.json();
```

**レスポンス:**

```typescript
{
  ok: true,
  message: "渋谷で2件のイタリアンが見つかったよ。...",  // LLMが生成した自然文
  posts: PostRow[],           // UI表示用フルデータ（profile, station付き）
  detectedStations: [         // 自動検出した駅（UIフィードバック用）
    { name: "渋谷", placeId: "ChIJ..." }
  ],
  detectedAuthor: null | {    // @mention があった場合
    username: "alice",
    displayName: "Alice"
  }
}
```

---

## 4. ツール定義（src/lib/aiSearchTools.ts）

### ToolContext（リクエストスコープの共有状態）

```typescript
type ToolContext = {
  supabase: any;
  userId: string;
  followOnly: boolean;             // UIのフォローのみチェックから来る
  tasteEmbedding: number[] | null; // get_my_taste_profile の結果
  collectedPosts: any[];           // search_posts が蓄積するUI用データ
  detectedStations: { name: string; placeId: string }[];
  detectedAuthor: { username: string; displayName: string | null } | null;
};
```

### 4ツールの役割

| ツール | 役割 | 呼ぶタイミング |
|--------|------|---------------|
| `resolve_station` | 地名→station_place_id | クエリに地名が含まれるとき（複数回OK） |
| `resolve_username` | @mention→user_id | @xxxが含まれるとき（必ず最初に） |
| `get_my_taste_profile` | 自分の過去投稿embeddingを平均化 | 「僕と合いそう」系のとき |
| `search_posts` | pgvector検索本体 | 上記で解決した情報をすべてここに渡す |

### get_my_taste_profile の仕組み

```typescript
// 自分の投稿を最大50件取得
const posts = await supabase.from("posts")
  .select("embedding")
  .eq("user_id", userId)
  .not("embedding", "is", null)
  .limit(50);

// 平均ベクトルを正規化（コサイン類似度用）
const avg = ... // 全ベクトルの要素ごとの平均
const norm = Math.sqrt(avg.reduce((s, x) => s + x * x, 0));
ctx.tasteEmbedding = avg.map(x => x / norm);

// → search_posts で use_taste_profile: true のときこれをクエリベクトルとして使う
```

---

## 5. 2段階LLM（tool calling → rewrite）

```
LLMツール呼び出しループ（gpt-4o-mini, temperature=0.3）
  → 構造化された検索結果文を生成
       │
       ▼
rewrite層（gpt-4o-mini, temperature=0.4）
  → 友人に話しかけるような自然な文体に書き直す
  → 1位/2位/3位の順位付け
  → マークダウン記法（**bold**など）を除去
```

rewriteが失敗しても元のメッセージでフォールバック。コストは合計1クエリ0.02円未満。

---

## 6. 重要な技術的注意点

### PostgREST × pgvector の落とし穴

```typescript
// ❌ NG: 文字列化するとPostgRESTがvectorに変換できない
supabase.rpc("search_posts_semantic", {
  query_embedding: JSON.stringify(embedding),  // "[0.1,0.2,...]"
})

// ✅ OK: number[]をそのまま渡す
supabase.rpc("search_posts_semantic", {
  query_embedding: embedding,  // number[]
})
```

SQL関数側で `query_embedding::vector` とキャストすることで解決。

### embeddingのDB格納・取得

```typescript
// 保存時: number[] をそのまま渡す（SupabaseがJSONに変換）
await supabase.from("posts").update({ embedding: numberArray });

// 取得時: PostgRESTはvectorカラムを文字列 "[0.1,...]" で返す場合がある
const vec = typeof p.embedding === "string"
  ? JSON.parse(p.embedding)
  : p.embedding;
```

### バックフィル（既存投稿へのembedding付与）

- サービスロールキー必須（RLSを回避するため）
- テキストが空の投稿にはゼロベクトルを入れてスキップ扱い（無限ループ防止）
- `hasMore: posts.length === limit && processed > 0` で終了判定

### 閾値チューニング

| 用途 | threshold |
|------|-----------|
| AI Chat（`search_posts` ツール内） | 0.15 |
| シンプルセマンティック（`/api/search/semantic`） | 0.1（クライアントから上書き可） |

フォローのみ + 対象ユーザー投稿数が少ない場合、0.15でも関係ない投稿が通ることがある。
LLMに「明らかにジャンルが違う場合は0件として扱う」よう指示することで補完。

---

## 7. RN版への移植アーキテクチャ

### 基本方針

**APIエンドポイントはそのまま流用する**。
RN版が追加で作る必要があるのはUI層のみ。

```
RN版クライアント
    │
    ├── POST /api/search/ai-chat    ← 変更不要（そのまま使う）
    ├── GET  /api/search/semantic   ← 変更不要
    └── POST /api/posts/[id]/embed  ← 変更不要
```

### 検索画面の状態設計（RN版）

```typescript
type SearchState = {
  // 入力
  query: string;
  selectedStation: { placeId: string; name: string } | null;
  selectedGenre: string | null;
  followOnly: boolean;

  // 結果
  resultMode: "ai" | "keyword" | null;
  posts: PostRow[];
  aiMessage: string | null;        // LLMの生成文
  detectedStations: { name: string; placeId: string }[];
  detectedAuthor: { username: string; displayName: string | null } | null;

  // ローディング
  isLoading: boolean;
  error: string | null;
};
```

### AI検索の呼び出し（RN版）

```typescript
async function loadAiSearch(q: string, follow: boolean) {
  setIsLoading(true);
  setAiMessage(null);

  const res = await fetch(`${API_BASE}/api/search/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ q, follow }),
  });

  const data = await res.json();
  if (data.ok) {
    setPosts(data.posts);
    setAiMessage(data.message);
    setDetectedStations(data.detectedStations);
    setDetectedAuthor(data.detectedAuthor);
    setResultMode('ai');
  }
  setIsLoading(false);
}
```

### 検索発火のロジック（RN版推奨）

```typescript
function onSearch() {
  const hasText = query.trim().length > 0;
  const hasGenre = selectedGenre !== null;
  const hasStation = selectedStation !== null;

  if (hasText || hasGenre) {
    // AI検索（テキスト or ジャンル指定があるとき）
    const combined = [selectedGenre, query.trim()].filter(Boolean).join(" ");
    loadAiSearch(combined, followOnly);
  } else if (hasStation) {
    // キーワード検索（駅のみ選択時）
    loadKeywordSearch({ stationId: selectedStation.placeId, follow: followOnly });
  }
}
```

### @mention サジェスト（RN版）

```typescript
// TextInputのonChangeTextで@が入力されたらサジェストを出す
const [mentionQuery, setMentionQuery] = useState<string | null>(null);
const [mentionSuggests, setMentionSuggests] = useState<Profile[]>([]);

function onQueryChange(text: string) {
  setQuery(text);
  const match = text.match(/@(\w*)$/);  // 末尾の@xxxを検出
  if (match) {
    setMentionQuery(match[1]);
    fetchFollowingSuggests(match[1]);   // /api/follows/suggest?q=xxx
  } else {
    setMentionQuery(null);
    setMentionSuggests([]);
  }
}

function onSelectMention(username: string) {
  setQuery(prev => prev.replace(/@\w*$/, `@${username} `));
  setMentionSuggests([]);
}
```

### AIメッセージの表示（RN版）

```typescript
// 思考中インジケーター
{isLoading && (
  <View style={styles.thinkingBubble}>
    <Text style={styles.thinkingDot}>●</Text>
    {/* アニメーションで3つの点を順番に光らせる */}
  </View>
)}

// AIメッセージ（結果の上に表示）
{aiMessage && (
  <View style={styles.aiMessage}>
    <Text style={styles.aiLabel}>Gourmeet AI</Text>
    <Text style={styles.aiText}>{aiMessage}</Text>
  </View>
)}

// 検出された駅タグ
{detectedStations.map(s => (
  <View key={s.placeId} style={styles.detectedChip}>
    <Text>📍 {s.name} 付近で検索</Text>
  </View>
))}
```

### 投稿カードに順位バッジ（RN版）

```typescript
// posts[0] が1位、posts[1] が2位...
{posts.map((post, index) => (
  <View key={post.id} style={styles.cardWrapper}>
    {resultMode === 'ai' && index < 3 && (
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{index + 1}位</Text>
      </View>
    )}
    <PostCard post={post} ... />
  </View>
))}
```

### 新規投稿後のembedding生成（RN版）

```typescript
// 投稿保存後、fire-and-forget でembeddingを生成
const { data: inserted } = await supabase
  .from("posts")
  .insert({ ...postData })
  .select("id")
  .single();

// awaitしない（失敗してもUXに影響させない）
fetch(`${API_BASE}/api/posts/${inserted.id}/embed`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${session.access_token}` },
}).catch(() => {});
```

---

## 8. 将来の拡張候補

### Phase 2: @mention検索の強化

現在: `@alice` 形式のみ対応
将来: `「aliceさんのおすすめ」` のような自然な言い回しにも対応

→ LLMの `resolve_username` ツールのプロンプトを拡張するだけで対応可能。
  ただし、ユーザー名の辞書（よく使われるユーザー名一覧）をコンテキストに渡す必要あり。

### Phase 3: 会話履歴（フォローアップ検索）

```typescript
// 「もう少し安めで」「渋谷じゃなくて恵比寿で」などを実現
POST /api/search/ai-chat
{
  q: "もう少し安めで",
  history: [
    { role: "user", content: "渋谷でイタリアン" },
    { role: "assistant", content: "3件見つかりました..." }
  ]
}
```

APIエンドポイントはすでに `history` パラメータを受け付けている。
RN版でconversation履歴を保持するstateを追加するだけで動く。

### Phase 4: パーソナライズ強化

- `get_my_taste_profile` は現在「自分の過去投稿の平均ベクトル」
- 将来: 「いいねした投稿の平均ベクトル」も組み合わせることでより精度UP
- SQL: `post_likes` テーブルから liked posts の embedding を取得して mix

---

## ファイル構成（Web版）

```
src/
├── lib/
│   ├── embedding.ts          # buildEmbeddingText, generateEmbedding
│   ├── aiSearchTools.ts      # ツール定義 + 実行ロジック（ToolContext含む）
│   └── parseSearchQuery.ts   # LLMによるクエリ分解（location/intent/mention）
│
└── app/api/search/
    ├── ai-chat/route.ts      # ★メインAI検索エンドポイント（tool callingループ）
    ├── semantic/route.ts     # シンプルセマンティック検索
    └── genres/route.ts       # ジャンル一覧取得
```
