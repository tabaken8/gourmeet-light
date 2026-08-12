// src/types/index.ts
// Shared domain types used across lib/ and UI components.

/** Place row as returned by Supabase joins on the `places` table. */
export type PlaceRow = {
  place_id: string;
  name: string | null;
  address?: string | null;
  primary_genre: string | null;
  area_label_ja?: string | null;
  search_text?: string | null;
};

/** One cell in the visit-frequency heatmap (JST date bucket). */
export type HeatmapDay = {
  date: string; // "YYYY-MM-DD" (JST基準の代表日付)
  count: number;
  maxScore: number | null;
  posts: Array<{ id: string; thumbUrl: string | null }>;
};

/** A post as displayed in the album / grid view. */
export type AlbumPost = {
  id: string;
  place_id: string | null;
  created_at?: string | null;
  visited_on?: string | null;
  recommend_score?: number | string | null;
  content?: string | null;
  image_urls?: string[] | null;
  image_variants?: any[] | null;
  places?: PlaceRow | null;
};

/** A lightweight post used in "other posts by this user" strips. */
export type MiniPost = {
  id: string;
  place_id: string | null;
  created_at?: string | null;
  visited_on?: string | null;
  recommend_score?: number | string | null;
  image_urls?: string[] | null;
  image_variants?: any[] | null;
  places?: PlaceRow | null;
  place_name?: string | null;
  place_address?: string | null;
};
