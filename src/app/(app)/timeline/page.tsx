// src/app/(app)/timeline/page.tsx
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MapPin, Lock, Images } from "lucide-react";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions from "@/components/PostActions";
import PostCollectionButton from "@/components/PostCollectionButton";
import FollowButton from "@/components/FollowButton";
import PostComments from "@/components/PostComments";
import { getPlacePhotoRefs } from "@/lib/google/getPlacePhotoRefs";
import PlacePhotoGallery from "@/components/PlacePhotoGallery";


export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };

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

function formatJST(iso: string) {
  const dt = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const supabase = await createClient();;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = await searchParams; // ✅ await
  const activeTab = sp?.tab === "discover" ? "discover" : "friends";

  // ---- 投稿 & プロフィール取得 --------------------------------------
  let posts: PostRow[] = [];
  let profiles: Record<string, ProfileLite> = {};

  // discover 用：投稿者ごとのフォロー状況
  let followStatus: Record<string, { following: boolean; requested: boolean }> =
    {};

  if (activeTab === "friends") {
    // 1) 自分が「承認済みで」フォローしているユーザー
    let followeeIds: string[] = [];
    if (user) {
      const { data: follows } = await supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id)
        .eq("status", "accepted");

      followeeIds = (follows ?? []).map((f: any) => f.followee_id);
    }

    // 2) 自分自身も含める
    const visibleUserIds = user
      ? Array.from(new Set<string>([user.id, ...followeeIds]))
      : followeeIds;

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
    // discover: 公開プロフィールの投稿だけ（profiles inner join）
    const { data: rows } = await supabase
      .from("posts")
      .select(
        "id, content, user_id, created_at, image_urls, place_name, place_address, place_id, profiles!inner ( id, display_name, avatar_url, is_public )"
      )
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

    // 自分とのフォロー関係（discover用）
    if (user && posts.length > 0) {
      const userIds = Array.from(new Set(posts.map((p) => p.user_id))).filter(
        (id) => id !== user.id
      );

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

  // ---- Places photos（place_id → refs） -----------------------------
  const placePhotoMap: Record<
    string,
    { refs: string[]; attributionsHtml: string }
  > = {};

  const placeIds = Array.from(
    new Set(posts.map((p) => p.place_id).filter(Boolean) as string[])
  );

await Promise.all(
  placeIds.map(async (pid) => {
    try {
      placePhotoMap[pid] = await getPlacePhotoRefs(pid, 4);
    } catch (e) {
      console.error("[getPlacePhotoRefs failed]", pid, e);
      placePhotoMap[pid] = { refs: [], attributionsHtml: "" };
    }
  })
);


  // ---- UI ---------------------------------------------------------
  return (
    <main className="min-h-screen bg-white text-slate-800">
      {/* 外側は広めに確保（Place写真の横幅用） */}
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            Timeline
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            友達や公開ユーザーの “いま食べてるもの” を、ふわっと流し見する場所。
          </p>
        </header>

        {/* タブ */}
        <section className="rounded-2xl bg-white">
          <div className="px-1 pb-3">
            <div className="inline-flex w-full gap-1 rounded-full bg-slate-50 p-1 text-xs font-medium text-slate-600">
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

            <p className="mt-2 text-[11px] text-slate-500">
              {activeTab === "friends"
                ? "フォローしている人と自分の投稿が時系列で流れます。"
                : "公開プロフィールのユーザーから、気になる人を見つけられます。"}
            </p>
          </div>

          {posts.length === 0 ? (
            <div className="flex min-h-[50vh] items-center justify-center px-2 text-xs text-slate-500">
              {activeTab === "friends"
                ? "まだタイムラインに投稿がありません。まずは誰かをフォローするか、自分で投稿してみましょう。"
                : "まだ公開ユーザーの投稿がありません。"}
            </div>
          ) : (
            <div className="flex flex-col items-stretch gap-6">
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

                const placePhotos =
                  p.place_id && placePhotoMap[p.place_id]
                    ? placePhotoMap[p.place_id]
                    : null;

                return (
                  <article
                    key={p.id}
                    className="rounded-2xl bg-white shadow-sm hover:shadow-md transition"
                  >
                    {/* ✅ ここが肝：投稿(左)は幅固定、Place写真(右)で横幅を使う */}
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
                      {/* ---------------- 左：投稿本体（広げない） ---------------- */}
                      <div className="md:border-r md:border-black/[.05]">
                        {/* 投稿者ヘッダー */}
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/u/${p.user_id}`}
                              className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700"
                            >
                              {avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={avatar}
                                  alt=""
                                  className="h-9 w-9 rounded-full object-cover"
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

                                {!isPublic && (
                                  <Lock
                                    size={12}
                                    className="shrink-0 text-slate-500"
                                  />
                                )}
                              </div>

                              <div className="text-[11px] text-slate-500">
                                {formatJST(p.created_at)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {activeTab === "discover" &&
                              user &&
                              user.id !== p.user_id && (
                                <>
                                  {fs?.following ? (
                                    <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-400">
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

                        {/* 画像カルーセル（投稿の画像） */}
                        {p.image_urls && p.image_urls.length > 0 && (
                          <PostImageCarousel
                            postId={p.id}
                            imageUrls={p.image_urls}
                            syncUrl={false}
                          />
                        )}

                        {/* 本文 + 店舗情報（テキストはこの幅のまま） */}
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

                        {/* アクション */}
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

                        {/* コメント（タイムラインでは少しだけ表示） */}
                        <div className="px-4 pb-4">
                          <PostComments
                            postId={p.id}
                            postUserId={p.user_id}
                            meId={user?.id ?? null}
                            previewCount={2}
                          />
                        </div>
                      </div>

                      {/* ---------------- 右：Place写真（横幅を使う） ---------------- */}
<aside className="hidden md:block p-4">
  {p.place_id && placePhotos?.refs?.length ? (
    <PlacePhotoGallery
      refs={placePhotos.refs}
      placeName={p.place_name}
      attributionsHtml={placePhotos.attributionsHtml}
    />
  ) : (
    <div className="text-xs text-slate-400">
      写真を取得できませんでした
    </div>
  )}
</aside>


                    </div>

                    {/* モバイル：Place写真は下に出す（邪魔なら消してOK） */}
{p.place_id && placePhotos?.refs?.length ? (
  <div className="md:hidden px-4 pb-4">
    <PlacePhotoGallery
      refs={placePhotos.refs}
      placeName={p.place_name}
      attributionsHtml={placePhotos.attributionsHtml}
    />
  </div>
) : null}

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
