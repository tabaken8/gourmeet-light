// src/components/timeline/FriendsTimelineServer.tsx
import { createClient } from "@/lib/supabase/server";
import FriendsTimelineClient from "./FriendsTimelineClient";
import { headers } from "next/headers";

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
  image_assets?: any[] | null;

  cover_square_url?: string | null;
  cover_full_url?: string | null;
  cover_pin_url?: string | null;

  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;

  author_display_name: string | null;
  author_avatar_url: string | null;
  author_is_public: boolean | null;

  like_count?: number | null;
  liked_by_me?: boolean | null;
};

async function getBaseUrl() {
  // Next.js の型定義差分対策：Promiseになる環境があるので await
  const h = await headers();

  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function FriendsTimelineServer({
  meId,
}: {
  meId: string | null;
}) {
  // 未ログインは空で返す（Client側で表示制御）
  if (!meId) {
    return <FriendsTimelineClient meId={null} initialPosts={[]} initialNextCursor={null} />;
  }

  // もし server component から自前で /api を叩く構成なら baseUrl が必要
  // rpc直叩きなら不要だけど、エラー修正のため関数は残しておく
  // const baseUrl = await getBaseUrl();

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("timeline_friends_v1", {
    p_limit: 20,
    p_cursor: null,
  });

  if (error) {
    return <FriendsTimelineClient meId={meId} initialPosts={[]} initialNextCursor={null} />;
  }

  const rows = (data ?? []) as RpcRow[];
  const nextCursor = rows.length > 0 ? rows[rows.length - 1].created_at : null;

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
    image_assets: (r as any).image_assets ?? null,

    cover_square_url: (r as any).cover_square_url ?? null,
    cover_full_url: (r as any).cover_full_url ?? null,
    cover_pin_url: (r as any).cover_pin_url ?? null,

    recommend_score: r.recommend_score,
    price_yen: r.price_yen,
    price_range: r.price_range,

    profile: {
      id: r.user_id,
      display_name: r.author_display_name,
      avatar_url: r.author_avatar_url,
      is_public: r.author_is_public ?? true,
    },

    likeCount: (r as any).like_count ?? 0,
    likedByMe: !!(r as any).liked_by_me,
    initialLikers: [],
  }));

  return (
    <FriendsTimelineClient
      meId={meId}
      initialPosts={initialPosts}
      initialNextCursor={nextCursor}
    />
  );
}
