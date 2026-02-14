import { createClient } from "@/lib/supabase/server";
import AlbumBrowser, { type AlbumPost } from "@/components/AlbumBrowser";

function normalizePlacesShape(row: any) {
  const pl = row?.places;
  const places = Array.isArray(pl) ? (pl[0] ?? null) : (pl ?? null);
  return { ...row, places };
}

export default async function AlbumBlock({
  userId,
  viewerId,
  isOwner,
}: {
  userId: string;
  viewerId: string;
  isOwner: boolean;
}) {
  const supabase = await createClient();

  const [postsRes, pinsRes] = await Promise.all([
    supabase
      .from("posts")
      .select(`
        id,
        place_id,
        created_at,
        visited_on,
        recommend_score,
        image_urls,
        image_variants,
        places:places (
          place_id,
          name,
          address,
          photo_url,
          primary_genre,
          genre_tags,
          area_label_ja,
          area_label_en,
          area_key,
          country_name,
          search_text
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(400),

    // ✅ post_pins からは post_id を取る
    supabase
      .from("post_pins")
      .select("post_id")
      .eq("user_id", viewerId)
      .order("sort_order", { ascending: true })
      .limit(80),
  ]);

  const albumPosts: AlbumPost[] = (postsRes.data ?? []).map(normalizePlacesShape) as any;

  // ✅ pinned は post_id 配列
  const pinnedPostIds: string[] = (pinsRes.data ?? []).map((r: any) => String(r.post_id));

  // ✅ props名も変更
  return <AlbumBrowser posts={albumPosts} pinnedPostIdsInitial={pinnedPostIds} isOwner={isOwner} />;
}
