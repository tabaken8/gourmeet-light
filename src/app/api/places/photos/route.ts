import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type PlacePhoto = {
  name?: string; // places/{place_id}/photos/{photo_ref}
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
};

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers });
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s: string) {
  // href向け（最低限）
  return escapeHtml(s).replaceAll("`", "&#096;");
}

function buildAttributionsHtml(photos: PlacePhoto[]) {
  const seen = new Set<string>();
  const items: Array<{ displayName: string; uri: string }> = [];

  for (const p of photos) {
    for (const a of p.authorAttributions ?? []) {
      const displayName = (a.displayName ?? "").trim();
      const uri = (a.uri ?? "").trim();
      if (!displayName || !uri) continue;
      const key = `${displayName}__${uri}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ displayName, uri });
    }
  }

  if (items.length === 0) return "";

  // “Photo by …” の集合をリンクにして並べる（Google要件を満たすための枠）
  return items
    .map(
      (x) =>
        `<a href="${escapeAttr(x.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          x.displayName
        )}</a>`
    )
    .join(" · ");
}

async function fetchFromGoogle(placeId: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_MAPS_API_KEY");

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      // photos だけを取得（不要フィールドは取らない＝課金/遅延を抑える）
      "X-Goog-FieldMask": "photos",
    },
    // Next.jsのfetchキャッシュは使わない（Supabase TTL を信頼）
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Google Places failed (${res.status})`);
  }

  const photos: PlacePhoto[] = Array.isArray(body?.photos) ? body.photos : [];
  const refsAll = photos.map((p) => p?.name).filter((x): x is string => !!x).slice(0, 10);
  const attributionsHtml = buildAttributionsHtml(photos);

  return { refsAll, attributionsHtml };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const placeId = (u.searchParams.get("place_id") ?? "").trim();
  const perRaw = u.searchParams.get("per") ?? "8";
  const per = Math.max(1, Math.min(10, Number(perRaw) || 8));

  if (!placeId) return json({ error: "place_id is required" }, 400);

  const supabase = await createClient();
  const now = new Date();

  // 1) Supabaseキャッシュを見る
  const { data: cached, error: cacheErr } = await supabase
    .from("place_photo_refs_cache")
    .select("refs, attributions_html, expires_at")
    .eq("place_id", placeId)
    .maybeSingle();

  if (!cacheErr && cached?.expires_at) {
    const exp = new Date(cached.expires_at);
    const refs = Array.isArray(cached.refs) ? cached.refs : [];
    if (exp.getTime() > now.getTime() && refs.length > 0) {
      return json(
        {
          refs: refs.slice(0, per),
          attributionsHtml: cached.attributions_html ?? "",
          source: "cache",
        },
        200,
        {
          // ここは短めでOK（実体はSupabase TTL）
          "Cache-Control": "public, max-age=0, s-maxage=600",
        }
      );
    }
  }

  // 2) 期限切れ/未存在 → Googleへ
  try {
    const { refsAll, attributionsHtml } = await fetchFromGoogle(placeId);

    const ttlDays = 30; // 規約上の一時キャッシュ上限を意識
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    // upsert
    await supabase.from("place_photo_refs_cache").upsert({
      place_id: placeId,
      refs: refsAll,
      attributions_html: attributionsHtml,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    return json(
      { refs: refsAll.slice(0, per), attributionsHtml, source: "google" },
      200,
      { "Cache-Control": "public, max-age=0, s-maxage=600" }
    );
  } catch (e: any) {
    return json({ error: e?.message ?? "failed" }, 500);
  }
}
