CREATE OR REPLACE FUNCTION public.search_posts_semantic(
  query_embedding double precision[],
  p_user_id uuid DEFAULT NULL::uuid,
  p_follow_only boolean DEFAULT false,
  p_station_place_id text DEFAULT NULL::text,
  p_radius_m integer DEFAULT 3000,
  p_threshold double precision DEFAULT 0.1,
  p_limit integer DEFAULT 20,
  p_author_id uuid DEFAULT NULL::uuid  -- @mention 絞り込み用（新規追加）
)
RETURNS TABLE(
  id text,
  user_id text,
  content text,
  created_at timestamp with time zone,
  visited_on text,
  image_urls text[],
  image_variants jsonb,
  cover_square_url text,
  place_id text,
  place_name text,
  place_address text,
  recommend_score double precision,
  price_yen integer,
  price_range text,
  similarity double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  select
    p.id::text,
    p.user_id::text,
    p.content,
    p.created_at,
    p.visited_on,
    p.image_urls,
    p.image_variants,
    p.cover_square_url,
    p.place_id,
    p.place_name,
    p.place_address,
    p.recommend_score::float,
    p.price_yen,
    p.price_range,
    (1 - (p.embedding <=> query_embedding::vector))::float as similarity
  from posts p
  where
    p.embedding is not null
    and (1 - (p.embedding <=> query_embedding::vector)) > p_threshold
    and (p_author_id is null or p.user_id::uuid = p_author_id)  -- @mention フィルタ（新規追加）
    and (
      not p_follow_only
      or p_user_id is null
      or exists (
        select 1 from follows f
        where f.follower_id = p_user_id
          and f.followee_id = p.user_id
          and f.status = 'accepted'
      )
    )
    and (
      p_station_place_id is null
      or exists (
        select 1 from place_station_links psl
        where psl.place_id = p.place_id
          and psl.station_place_id = p_station_place_id
          and psl.distance_m <= p_radius_m
      )
    )
  order by p.embedding <=> query_embedding::vector
  limit p_limit;
$function$
