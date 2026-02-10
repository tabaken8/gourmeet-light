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
    supabase
      .from("place_pins")
      .select("place_id")
      .eq("user_id", viewerId)
      .order("sort_order", { ascending: true })
      .limit(80),
  ]);

  const albumPosts: AlbumPost[] = (postsRes.data ?? []).map(normalizePlacesShape) as any;
  const pinnedPlaceIds: string[] = (pinsRes.data ?? []).map((r: any) => String(r.place_id));

  return <AlbumBrowser posts={albumPosts} pinnedPlaceIdsInitial={pinnedPlaceIds} isOwner={isOwner} />;
}
