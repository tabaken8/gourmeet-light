import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MapPin, Lock } from "lucide-react";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import FollowButton from "@/components/FollowButton";

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

type ProfileLite = {
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
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
  let profiles: Record<string, ProfileLite> = {};
  // discover 用：投稿者ごとのフォロー状況（フォロー済み / リクエスト中）
  let followStatus: Record<
    string,
    { following: boolean; requested: boolean }
  > = {};

  if (activeTab === "friends") {
    // 1. 自分が「承認済みで」フォローしているユーザーを取得
    let followeeIds: string[] = [];
    if (user) {
      const { data: follows } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id)
        .eq("status", "accepted");

      followeeIds = (follows ?? []).map((f: any) => f.followee_id);
    }

    // 2. 自分自身も TL 対象に含める
    const visibleUserIds = user
      ? Array.from(new Set<string>([user.id, ...followeeIds]))
      : followeeIds;

    // フォローしている人も自分もいなければ TL は空
    if (visibleUserIds.length) {
      const { data: postRows } = await supabase
        .from("posts")
        .select(
          "id,content,user_id,created_at,image_urls,place_name,place_address,place_id"
        )
        .in("user_id", visibleUserIds)
        .order("created_at", { ascending: false });

      posts = (postRows ?? []) as PostRow[];

      const userIds = Array.from(new Set(posts.map((p) => p.user_id)));
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, is_public")
          .in("id", userIds);

        for (const p of profs ?? []) {
          profiles[p.id] = {
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            is_public: p.is_public,
          };
        }
      }
    }
  } else {
    // discover: 公開プロフィールの投稿だけ
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
          is_public: prof.is_public,
        };
      }
    }

    // 自分とのフォロー関係を取得（discover タブ用）
    if (user && posts.length > 0) {
      // 投稿者IDの一覧（自分自身は除外）
      const userIds = Array.from(
        new Set(posts.map((p) => p.user_id))
      ).filter((id) => id !== user.id);

      if (userIds.length) {
        const { data: followRows } = await supabase
          .from("follows")
          .select("followee_id, status")
          .eq("follower_id", user.id)
          .in("followee_id", userIds);

        for (const f of followRows ?? []) {
          followStatus[f.followee_id] = {
            following: f.status === "accepted",
            requested: f.status === "pending",
          };
        }
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
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">
        {/* ヘッダー */}
        <header className="mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            友達や公開ユーザーの “いま食べてるもの” を、ふわっと流し見する場所。
          </p>
        </header>

        {/* カード全体 */}
        <section className="overflow-hidden rounded-2xl border border-orange-100 bg-white/95 shadow-sm backdrop-blur">
          {/* タブ行 */}
          <div className="border-b border-orange-50 px-4 pt-4">
            <div className="inline-flex w-full gap-1 rounded-full bg-orange-50/80 p-1 text-xs font-medium text-slate-600">
              <Link
                href="?tab=friends"
                className={[
                  "flex-1 rounded-full px-3 py-2 text-center transition",
                  activeTab === "friends"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500 hover:text-orange-500",
                ].join(" ")}
              >
                友達
              </Link>
              <Link
                href="?tab=discover"
                className={[
                  "flex-1 rounded-full px-3 py-2 text-center transition",
                  activeTab === "discover"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-500 hover:text-orange-500",
                ].join(" ")}
              >
                もっと見つけたい
              </Link>
            </div>
            <p className="mt-2 pb-3 text-[11px] text-slate-500">
              {activeTab === "friends"
                ? "フォローしている人と自分の投稿が時系列で流れます。"
                : "公開プロフィールのユーザーから、気になる人を見つけられます。"}
            </p>
          </div>

          {/* コンテンツ */}
          {posts.length === 0 ? (
            <div className="flex min-h-[50vh] items-center justify-center px-4 pb-6 text-xs text-slate-500">
              {activeTab === "friends"
                ? "まだタイムラインに投稿がありません。まずは誰かをフォローするか、自分で投稿してみましょう。"
                : "まだ公開ユーザーの投稿がありません。"}
            </div>
          ) : (
            <div className="flex flex-col items-stretch gap-6 px-4 pb-6 pt-3">
              {posts.map((p) => {
                const prof = profiles[p.user_id] ?? null;
                const display = prof?.display_name ?? "ユーザー";
                const avatar = prof?.avatar_url ?? null;
                const isPublic = prof?.is_public ?? true;
                const initial = (display || "U").slice(0, 1).toUpperCase();

                const mapUrl = p.place_id
                  ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
                  : p.place_address
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      p.place_address
                    )}`
                  : null;

                const fs = followStatus[p.user_id];

                return (
                  <article
                    key={p.id}
                    className="w-full rounded-2xl border border-orange-100 bg-white shadow-sm"
                  >
                    {/* 投稿者ヘッダー */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/u/${p.user_id}`}
                          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700 ring-1 ring-orange-200"
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
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/u/${p.user_id}`}
                              className="truncate text-xs font-medium text-slate-900 hover:underline"
                            >
                              {display}
                            </Link>
                            {/* 鍵垢なら小さめの鍵アイコン */}
                            {!isPublic && (
                              <Lock
                                size={12}
                                className="shrink-0 text-slate-500"
                              />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(p.created_at!).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* 右上エリア：フォロー状態 + メニュー */}
                      <div className="flex items-center gap-2">
                        {activeTab === "discover" &&
                          user &&
                          user.id !== p.user_id && (
                            <>
                              {fs?.following ? (
                                // フォロー済みラベル（薄め表示・押せない）
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-400">
                                  フォロー済み
                                </span>
                              ) : (
                                <FollowButton
                                  targetUserId={p.user_id}
                                  targetUsername={display}
                                  initiallyFollowing={!!fs?.following}
                                  initiallyRequested={!!fs?.requested}
                                  className="px-3 py-1 text-xs"
                                />
                              )}
                            </>
                          )}

                        <PostMoreMenu
                          postId={p.id}
                          isMine={user?.id === p.user_id}
                        />
                      </div>
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
                    <div className="space-y-2 px-4 py-3">
                      {p.content && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {p.content}
                        </p>
                      )}
                      {p.place_name && (
                        <div className="flex items-center gap-1 text-xs text-orange-700">
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

                    {/* アクション（Like + コレクション追加） */}
                    <div className="flex items-center justify-between px-4 pb-3 pt-1">
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
        </section>
      </div>
    </main>
  );
}
