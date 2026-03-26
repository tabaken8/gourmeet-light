// src/app/api/search/semantic/route.ts
// 自然言語クエリを embedding に変換し、pgvector で類似投稿を検索する
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embedding";
import { parseSearchQuery } from "@/lib/parseSearchQuery";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const followOnly = searchParams.get("follow") === "1";
    // フロントから明示的に指定された駅フィルタ（LocationFilter で選んだもの）
    const explicitStationPlaceId = searchParams.get("station_place_id") ?? null;
    const radiusM = Math.min(20000, Math.max(100, Number(searchParams.get("radius_m") ?? "3000")));
    const limit = Math.min(40, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const threshold = Number(searchParams.get("threshold") ?? "0.1");

    if (!q) {
      return NextResponse.json({ ok: false, error: "q is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ---- クエリ解析: 地名 + 検索意図を分離 ----
    const parsed = await parseSearchQuery(q);

    // 自動検出した駅情報（UIにフィードバックするため）
    let detectedStation: { name: string; placeId: string } | null = null;
    let effectiveStationPlaceId = explicitStationPlaceId;

    // 明示的な駅指定がなく、クエリに地名が含まれていた場合のみ自動解決
    if (!explicitStationPlaceId && parsed.location) {
      const { data: stationSuggests } = await supabase.rpc("suggest_stations_v1", {
        q: parsed.location,
        lim: 1,
      });
      const first = Array.isArray(stationSuggests) ? stationSuggests[0] : null;
      if (first?.station_place_id) {
        effectiveStationPlaceId = first.station_place_id;
        detectedStation = {
          name: first.station_name ?? parsed.location,
          placeId: first.station_place_id,
        };
      }
    }

    // @mention → user_id の解決
    let authorId: string | null = null;
    let detectedAuthor: { username: string; displayName: string | null } | null = null;
    let mentionNotFound = false;

    if (parsed.mention) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("username", parsed.mention)
        .single();

      if (profile) {
        authorId = profile.id;
        detectedAuthor = {
          username: profile.username ?? parsed.mention,
          displayName: profile.display_name ?? null,
        };
      } else {
        // ユーザーが見つからない場合はフラグだけ立てて続行（結果0件になる）
        mentionNotFound = true;
      }
    }

    // embedding は「意図」部分だけで生成（地名・メンションが含まれると意味空間がブレるため）
    const embeddingText = parsed.intent || q;
    const queryEmbedding = await generateEmbedding(embeddingText);

    // pgvector で類似投稿検索
    // ※ Supabase RPC には number[] をそのまま渡す（文字列化すると vector 型に変換されない）
    const { data: rawPosts, error: rpcErr } = await supabase.rpc(
      "search_posts_semantic",
      {
        query_embedding: queryEmbedding,
        p_user_id: user.id,
        p_follow_only: followOnly,
        p_station_place_id: effectiveStationPlaceId,
        p_radius_m: radiusM,
        p_threshold: threshold,
        p_limit: limit,
        p_author_id: authorId,
      }
    );

    if (rpcErr) {
      console.error("[semantic] rpc error:", rpcErr);
      return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
    }

    const posts: any[] = rawPosts ?? [];
    if (!posts.length) {
      return NextResponse.json({
        ok: true,
        mode: "semantic",
        posts: [],
        detectedStation,
        detectedAuthor,
        mentionNotFound,
        parsedQuery: { location: parsed.location, mention: parsed.mention, intent: parsed.intent },
      });
    }

    // プロフィールを一括取得
    const userIds = [...new Set(posts.map((p) => p.user_id).filter(Boolean))];
    const profileMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, username, is_public")
        .in("id", userIds);
      for (const p of profiles ?? []) profileMap[(p as any).id] = p;
    }

    // 最寄り駅を一括取得（place_station_links の rank=1）
    const placeIds = [...new Set(posts.map((p) => p.place_id).filter(Boolean))];
    const stationMap: Record<string, { nearest_station_name: string | null; nearest_station_distance_m: number | null }> = {};
    if (placeIds.length) {
      const { data: links } = await supabase
        .from("place_station_links")
        .select("place_id, station_name, distance_m")
        .in("place_id", placeIds)
        .eq("rank", 1);
      for (const l of links ?? []) {
        stationMap[(l as any).place_id] = {
          nearest_station_name: (l as any).station_name ?? null,
          nearest_station_distance_m: (l as any).distance_m ?? null,
        };
      }
    }

    // 結果を SearchPostList が受け取れる形に整形
    const enriched = posts.map((p) => {
      const profile = profileMap[p.user_id] ?? null;
      const station = stationMap[p.place_id] ?? null;
      return {
        ...p,
        profile,
        user: profile,
        nearest_station_name: station?.nearest_station_name ?? null,
        nearest_station_distance_m: station?.nearest_station_distance_m ?? null,
        _similarity: p.similarity,
      };
    });

    return NextResponse.json({
      ok: true,
      mode: "semantic",
      posts: enriched,
      // フロント向けメタ情報
      detectedStation,
      detectedAuthor,
      mentionNotFound,
      parsedQuery: { location: parsed.location, mention: parsed.mention, intent: parsed.intent },
    });
  } catch (e: any) {
    console.error("[semantic] unhandled:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
