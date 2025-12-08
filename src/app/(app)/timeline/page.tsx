import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MapPin } from "lucide-react";                 // ★ 追加
import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";

export const dynamic = "force-dynamic";

type SearchParams = {
  tab?: string;
};

type PostRow = {
  id: string;
  content: string | null;
  user_id: string;
  created_at: string;
  image_urls: string[] | null;
  place_name: string | null;
  place_address: string | null;
  place_id: string | null;
};

export default async function TimelinePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- タブ状態 ----------------------------------------------------
  const activeTab =
    searchParams?.tab === "discover" ? "discover" : "friends";

  // ---- 投稿 & プロフィール取得 --------------------------------------
  let posts: PostRow[] = [];
  let profiles: Record<
    string,
    { display_name: string | null; avatar_url: string | null }
  > = {};

  if (activeTab === "friends") {
    const { data: postRows } = await supabase
      .from("posts")
      .select(
        "id,content,user_id,created_at,image_urls,place_name,place_address,place_id"
      )
      .order("created_at", { ascending: false });

    posts = (postRows ?? []) as PostRow[];

    const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);
      for (const p of profs ?? []) {
        profiles[p.id] = {
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        };
      }
    }
  } else {
    const { data: rows } = await supabase
      .from("posts")
      .select(`
        id,
        content,
        user_id,
        created_at,
        image_urls,
        place_name,
        place_address,
        place_id,
        profiles!inner (
          id,
          display_name,
          avatar_url,
          is_public
        )
      `)
      .eq("profiles.is_public", true)
      .order("created_at", { ascending: false });

    for (const r of (rows ?? []) as any[]) {
      posts.push({
        id: r.id,
        content: r.content,
        user_id: r.user_id,
        created_at: r.created_at,
        image_urls: r.image_urls,
        place_name: r.place_name,
        place_address: r.place_address,
        place_id: r.place_id,
      });

      const prof = r.profiles;
      if (prof) {
        profiles[prof.id] = {
          display_name: prof.display_name,
          avatar_url: prof.avatar_url,
        };
      }
    }
  }

  // ---- Like のみ取得 ----------------------------------------------
  const ids = posts.map((p) => p.id);
  let likes: any[] = [];
  let myLikes: any[] = [];

  if (ids.length) {
    const l = await supabase
      .from("post_likes")
      .select("post_id")
      .in("post_id", ids);

    likes = l.data ?? [];

    if (user) {
      const ml = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", ids);

      myLikes = ml.data ?? [];
    }
  }

  const countBy = (rows: any[]) =>
    rows.reduce((m: Record<string, number>, r: any) => {
      m[r.post_id] = (m[r.post_id] ?? 0) + 1;
      return m;
    }, {});

  const likeCount = countBy(likes);
  const likedSet = new Set(myLikes.map((r) => r.post_id));

  // ---- UI ---------------------------------------------------------
  return (
    <main className="flex flex-col items-center">
      <div className="w-full max-w-[960px] px-4 py-4 space-y-4">
        {/* タブ行 */}
        <div className="flex border-b border-black/10">
          <Link
            href="?tab=friends"
            className={[
              "flex-1 px-3 py-2 text-center text-sm font-medium border-b-2 transition-colors",
              activeTab === "friends"
                ? "border-orange-500 text-orange-500"
                : "border-transparent text-black/50 hover:text-black/80",
            ].join(" ")}
          >
            友達
          </Link>
          <Link
            href="?tab=discover"
            className={[
              "flex-1 px-3 py-2 text-center text-sm font-medium border-b-2 transition-colors",
              activeTab === "discover"
                ? "border-orange-500 text-orange-500"
                : "border-transparent text-black/50 hover:text-black/80",
            ].join(" ")}
          >
            もっと見つける
          </Link>
        </div>

        {/* コンテンツ */}
        {posts.length === 0 ? (
          <div className="flex min-h-[50vh] items-center justify-center pt-4 text-sm text-black/60">
            {activeTab === "friends"
              ? "まだ投稿がありません。"
              : "まだ公開ユーザーの投稿がありません。"}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8 pt-4">
            {posts.map((p) => {
              const prof = profiles[p.user_id] ?? null;
              const display = prof?.display_name ?? "ユーザー";
              const avatar = prof?.avatar_url ?? null;
              const initial = (display || "U").slice(0, 1).toUpperCase();

              // ★ 位置情報用の URL 復活
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
                  className="w-full max-w-[600px] rounded-xl bg-white shadow-sm"
                >
                  {/* 投稿者ヘッダー */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/u/${p.user_id}`}
                        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 font-semibold text-orange-900"
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
                          className="truncate text-sm font-semibold hover:underline"
                        >
                          {display}
                        </Link>
                        <div className="text-xs text-black/50">
                          {new Date(p.created_at!).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <PostMoreMenu
                      postId={p.id}
                      isMine={user?.id === p.user_id}
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

                  {/* 本文 + 店舗情報（位置情報を復活） */}
                  <div className="space-y-2 px-4 py-3">
                    {p.content && (
                      <p className="whitespace-pre-wrap text-sm text-black/80">
                        {p.content}
                      </p>
                    )}
                    {p.place_name && (
                      <div className="flex items-center gap-1 text-sm text-orange-700">
                        <MapPin size={16} />
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {p.place_name}
                          </a>
                        ) : (
                          <span>{p.place_name}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* アクション（Like + コレクション追加） */}
                  <div className="flex items-center justify-between px-4 pb-4">
                    <PostActions
                      postId={p.id}
                      postUserId={p.user_id}
                      initialLiked={likedSet.has(p.id)}
                      initialLikeCount={likeCount[p.id] ?? 0}
                      initialWanted={false}
                      initialBookmarked={false}
                      initialWantCount={0}
                      initialBookmarkCount={0}
                    />
                    <PostCollectionButton postId={p.id} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
