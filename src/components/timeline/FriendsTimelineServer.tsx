// src/components/timeline/FriendsTimelineServer.tsx
import { createClient } from "@/lib/supabase/server";
import FriendsTimelineClient from "./FriendsTimelineClient";

type RpcRow = {
  id: string;
  user_id: string;
  created_at: string;
  visited_on: string | null;
  content: string | null;

  place_id: string | null;
  place_name: string | null;
  place_address: string | null;

  image_urls: any[] | null;
  image_variants: any[] | null;

  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;

  author_display_name: string | null;
  author_avatar_url: string | null;
  author_is_public: boolean | null;
};

export default async function FriendsTimelineServer({
  meId,
}: {
  meId: string | null;
}) {
  const supabase = await createClient();

  // 認証ユーザーがいない場合は空で返す（Client側で表示制御）
  if (!meId) {
    return <FriendsTimelineClient meId={null} initialPosts={[]} initialNextCursor={null} />;
  }

  const { data, error } = await supabase.rpc("timeline_friends_v1", {
    p_limit: 20,
    p_cursor: null,
  });

  if (error) {
    // ここは好みでUIにエラー出してもOK
    return <FriendsTimelineClient meId={meId} initialPosts={[]} initialNextCursor={null} />;
  }

  const rows = (data ?? []) as RpcRow[];
  const nextCursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

  // Client側で使いやすい形に整形（TimelineFeedのPostRowに寄せる）
  const initialPosts = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    visited_on: r.visited_on,
    content: r.content,

    place_id: r.place_id,
    place_name: r.place_name,
    place_address: r.place_address,

    image_urls: r.image_urls ?? null,
    image_variants: r.image_variants ?? null,

    recommend_score: r.recommend_score,
    price_yen: r.price_yen,
    price_range: r.price_range,

    // author/profile
    profile: {
      id: r.user_id,
      display_name: r.author_display_name,
      avatar_url: r.author_avatar_url,
      is_public: r.author_is_public ?? true,
    },
  }));

  return (
    <FriendsTimelineClient
      meId={meId}
      initialPosts={initialPosts}
      initialNextCursor={nextCursor}
    />
  );
}
