import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MapPin } from "lucide-react";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostImageCarousel from "@/components/PostImageCarousel";
import PostActions from "@/components/PostActions";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 投稿取得（店舗情報も含める）
  const { data: posts } = await supabase
    .from("posts")
    .select(
      "id,title,content,user_id,created_at,image_urls,place_name,place_address,place_id"
    )
    .order("created_at", { ascending: false });
  // これで{ data: posts }っていうデータを取得した！

  // プロフィール取得
  const userIds = Array.from(new Set((posts ?? []).map((p) => p.user_id)));
  let profiles: Record<
    string,
    { display_name: string | null; avatar_url: string | null }
  > = {};
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

  // アクション集計
  const ids = (posts ?? []).map((p) => p.id);
  let likes: any[] = [],
    wants: any[] = [],
    bookmarks: any[] = [];
  let myLikes: any[] = [],
    myWants: any[] = [],
    myBookmarks: any[] = [];

  if (ids.length) {
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
  }

  const countBy = (rows: any[]) =>
    rows.reduce((m: Record<string, number>, r: any) => {
      m[r.post_id] = (m[r.post_id] ?? 0) + 1;
      return m;
    }, {});
  const likeCount = countBy(likes);
  const wantCount = countBy(wants);
  const bookmarkCount = countBy(bookmarks);

  const likedSet = new Set(myLikes.map((r) => r.post_id));
  const wantedSet = new Set(myWants.map((r) => r.post_id));
  const bookmarkedSet = new Set(myBookmarks.map((r) => r.post_id));

  return (
    <main className="flex flex-col items-center gap-8">


      {(posts ?? []).map((p) => {
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
            className="w-full max-w-[600px] rounded-xl bg-white shadow-sm"
          >
            {/* 投稿者ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Link
                  href={`/u/${p.user_id}`}
                  className="h-9 w-9 overflow-hidden rounded-full bg-orange-100 text-orange-900 flex items-center justify-center font-semibold"
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
              <PostMoreMenu postId={p.id} isMine={user?.id === p.user_id} />
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
            <div className="px-4 py-3 space-y-2">
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

            {/* アクション */}
            <PostActions
              postId={p.id}
              postUserId={p.user_id} // 👈 通知用に追加
              initialLiked={likedSet.has(p.id)}
              initialWanted={wantedSet.has(p.id)}
              initialBookmarked={bookmarkedSet.has(p.id)}
              initialLikeCount={likeCount[p.id] ?? 0}
              initialWantCount={wantCount[p.id] ?? 0}
              initialBookmarkCount={bookmarkCount[p.id] ?? 0}
            />
          </article>
        );
      })}
    </main>
  );
}
