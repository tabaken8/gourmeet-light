import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MapPin } from "lucide-react";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions from "@/components/PostActions";
import CollectionListClient from "@/components/CollectionListClient";
import UncollectButton from "@/components/UncollectButton";

export const dynamic = "force-dynamic";

type SearchParams = {
  c?: string; // active collection id
};

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-orange-50 text-slate-700">
        <p className="text-sm">ログインが必要です。</p>
      </main>
    );
  }

  const sp = await searchParams;

  // 1. コレクション一覧
  const { data: collections } = await supabase
    .from("collections")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const collectionList = collections ?? [];

  const requestedId = sp.c;
  const activeCollectionId =
    requestedId && collectionList.some((c) => c.id === requestedId)
      ? requestedId
      : collectionList[0]?.id ?? null;

  type JoinedRow = {
    posts: {
      id: string;
      content: string | null;
      user_id: string;
      created_at: string;
      image_urls: string[] | null;
      place_name: string | null;
      place_address: string | null;
      place_id: string | null;
      profiles: {
        id: string;
        display_name: string | null;
        avatar_url: string | null;
      } | null;
    } | null;
    collections: {
      id: string;
    } | null;
  };

  let posts: any[] = [];
  const profiles: Record<
    string,
    { display_name: string | null; avatar_url: string | null }
  > = {};

  // 2. アクティブコレクションの投稿取得
  if (activeCollectionId) {
    const { data: rows } = await supabase
      .from("post_collections")
      .select(
        `
        posts (
          id,
          content,
          user_id,
          created_at,
          image_urls,
          place_name,
          place_address,
          place_id,
          profiles (
            id,
            display_name,
            avatar_url
          )
        ),
        collections ( id )
      `
      )
      .eq("collection_id", activeCollectionId);

    const joined = (rows as JoinedRow[] | null) ?? [];

    posts = joined
      .map((row) => row.posts)
      .filter((p): p is NonNullable<JoinedRow["posts"]> => !!p);

    for (const row of joined) {
      const prof = row.posts?.profiles;
      if (prof) {
        profiles[prof.id] = {
          display_name: prof.display_name,
          avatar_url: prof.avatar_url,
        };
      }
    }
  }

  // 3. アクション集計（ロジックはそのまま）
  let likeCount: Record<string, number> = {};
  let wantCount: Record<string, number> = {};
  let bookmarkCount: Record<string, number> = {};
  let likedSet = new Set<string>();
  let wantedSet = new Set<string>();
  let bookmarkedSet = new Set<string>();

  if (posts.length) {
    const ids = posts.map((p) => p.id);
    let likes: any[] = [],
      wants: any[] = [],
      bookmarks: any[] = [];
    let myLikes: any[] = [],
      myWants: any[] = [],
      myBookmarks: any[] = [];

    const [l, w, b] = await Promise.all([
      supabase.from("post_likes").select("post_id").in("post_id", ids),
      supabase.from("post_wants").select("post_id").in("post_id", ids),
      supabase.from("post_bookmarks").select("post_id").in("post_id", ids),
    ]);

    likes = l.data ?? [];
    wants = w.data ?? [];
    bookmarks = b.data ?? [];

    if (user) {
      const [ml, mw, mb] = await Promise.all([
        supabase
          .from("post_likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", ids),
        supabase
          .from("post_wants")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", ids),
        supabase
          .from("post_bookmarks")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", ids),
      ]);
      myLikes = ml.data ?? [];
      myWants = mw.data ?? [];
      myBookmarks = mb.data ?? [];
    }

    const countBy = (rows: any[]) =>
      rows.reduce((m: Record<string, number>, r: any) => {
        m[r.post_id] = (m[r.post_id] ?? 0) + 1;
        return m;
      }, {} as Record<string, number>);

    likeCount = countBy(likes);
    wantCount = countBy(wants);
    bookmarkCount = countBy(bookmarks);

    likedSet = new Set(myLikes.map((r) => r.post_id));
    wantedSet = new Set(myWants.map((r) => r.post_id));
    bookmarkedSet = new Set(myBookmarks.map((r) => r.post_id));
  }

  const activeCollection = collectionList.find(
    (c) => c.id === activeCollectionId
  );

  // 4. UI レイアウト（ホワイト＋淡オレンジ）
  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      {/* 上部ヘッダー */}
      <div className="border-b border-orange-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 md:px-6">
          <div>
            <h1 className="text-xs font-semibold tracking-[0.18em] text-orange-500 uppercase">
              Collections
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              自分だけの“行きたい”リストを、やわらかいボードみたいに並べて眺める場所。
            </p>
          </div>
        </div>
      </div>

      {/* メイン 2カラム */}
      <div className="mx-auto flex w-full gap-6 px-4 py-8 md:px-6">
        {/* 左サイドバー：クライアントで追加/削除可能に */}
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-24 space-y-4">
            <CollectionListClient
              collections={collectionList}
              activeCollectionId={activeCollectionId}
            />
          </div>
        </aside>

        {/* 右側：コンテンツ */}
        <section className="flex min-h-[60vh] flex-1 flex-col">
          {/* スマホ用：上部にコレクション選択 */}
          {collectionList.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
              {collectionList.map((c) => {
                const isActive = c.id === activeCollectionId;
                return (
                  <Link
                    key={c.id}
                    href={`/collection?c=${c.id}`}
                    className={[
                      "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition",
                      isActive
                        ? "border-orange-400 bg-orange-400 text-white"
                        : "border-orange-100 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-500",
                    ].join(" ")}
                  >
                    {c.name}
                  </Link>
                );
              })}
            </div>
          )}

          {/* タイトル行 */}
          <div className="mb-4 flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-slate-800">
                {activeCollection
                  ? activeCollection.name
                  : "コレクションが選択されていません"}
              </h2>
              {activeCollection && (
                <span className="rounded-full border border-orange-100 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                  {posts.length} posts
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {activeCollection
                ? "保存した投稿を、スクラップブックのように一覧できます。"
                : "左のコレクション一覧から、表示したいリストを選択してください。"}
            </p>
          </div>

          {/* 中身 */}
          {!activeCollectionId ? (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
              コレクションを選択すると、ここに投稿が表示されます。
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-xs text-slate-500">
              <span className="mb-2 text-lg">☕</span>
              まだこのコレクションには投稿がありません。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {posts.map((p) => {
                const prof = profiles[p.user_id] ?? null;
                const display = prof?.display_name ?? "ユーザー";
                const avatar = prof?.avatar_url ?? null;
                const initial = (display || "U").slice(0, 1).toUpperCase();

                const mapUrl = p.place_id
                  ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
                  : p.place_address
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      p.place_address
                    )}`
                    : null;

                return (
                  <article
                    key={p.id}
                    className="flex h-full flex-col overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    {/* 投稿者ヘッダー */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/u/${p.user_id}`}
                          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-600 ring-1 ring-orange-200"
                        >
                          {avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatar}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            initial
                          )}
                        </Link>
                        <div className="min-w-0">
                          <Link
                            href={`/u/${p.user_id}`}
                            className="truncate text-xs font-medium text-slate-800 hover:underline"
                          >
                            {display}
                          </Link>
                          <div className="text-[10px] text-slate-500">
                            {new Date(p.created_at!).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <PostMoreMenu
                        postId={p.id}
                        isMine={user.id === p.user_id}
                      />
                    </div>

                    {/* 画像カルーセル */}
                    {p.image_urls && p.image_urls.length > 0 && (
                      <PostImageCarousel
                        postId={p.id}
                        imageUrls={p.image_urls}
                        syncUrl={false}
                      />
                    )}

                    {/* 本文 + 店舗情報 */}
                    <div className="flex flex-1 flex-col gap-2 px-4 py-3">
                      {p.content && (
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                          {p.content}
                        </p>
                      )}
                      {p.place_name && (
                        <div className="mt-auto flex items-center gap-1 text-[11px] text-orange-600">
                          <MapPin size={14} />
                          {mapUrl ? (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate hover:underline"
                            >
                              {p.place_name}
                            </a>
                          ) : (
                            <span className="truncate">{p.place_name}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* アクション + アンコレクション */}
                    <div className="px-3 pb-3 pt-1 space-y-2">
                      <PostActions
                        postId={p.id}
                        postUserId={p.user_id}
                        initialLiked={likedSet.has(p.id)}
                        initialWanted={wantedSet.has(p.id)}
                        initialBookmarked={bookmarkedSet.has(p.id)}
                        initialLikeCount={likeCount[p.id] ?? 0}
                        initialWantCount={wantCount[p.id] ?? 0}
                        initialBookmarkCount={bookmarkCount[p.id] ?? 0}
                      />
                      {activeCollectionId && (
                        <div className="flex justify-end">
                          <UncollectButton
                            collectionId={activeCollectionId}
                            postId={p.id}
                          />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
