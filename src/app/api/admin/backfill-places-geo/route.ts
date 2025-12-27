import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // サーバー専用
  { auth: { persistSession: false } }
);

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY!;

// ざっくり並列数（増やしすぎるとGoogle側で弾かれたりする）
const CONCURRENCY = 6;

async function getLatLngFromGoogle(placeId: string): Promise<{ lat: number | null; lng: number | null }> {
  // Places API (New) GetPlace: locationだけ取る
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=ja&regionCode=JP`;

  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "location",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google GetPlace ${res.status}: ${t || res.statusText}`);
  }

  const data: any = await res.json();
  const loc = data?.location;
  const lat = typeof loc?.latitude === "number" ? loc.latitude : null;
  const lng = typeof loc?.longitude === "number" ? loc.longitude : null;
  return { lat, lng };
}

// シンプルなPromiseプール
async function mapPool<T, R>(items: T[], worker: (x: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;

  async function runOne() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  }

  const runners = Array.from({ length: Math.max(1, concurrency) }, () => runOne());
  await Promise.all(runners);
  return results;
}

export async function POST(req: Request) {
  // 任意：簡易ガード（後でRLS付ける前提でも、今だけ事故防止したいなら）
  // const token = req.headers.get("x-admin-token");
  // if (token !== process.env.ADMIN_TOKEN) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const onlyMissing = body?.onlyMissing !== false; // デフォルトtrue
  const limit = Math.min(Math.max(Number(body?.limit ?? 1000), 1), 5000);

  // 1) placesから対象place_id取得（全件 or 欠損のみ）
  let q = supabaseAdmin.from("places").select("place_id, lat, lng").limit(limit);
  if (onlyMissing) q = q.or("lat.is.null,lng.is.null");

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).filter((r: any) => typeof r.place_id === "string");
  const targets = rows.map((r: any) => r.place_id as string);
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0, updated: 0, message: "no targets" });
  }

  // 2) Googleから座標取得（並列）
  const fetched = await mapPool(
    targets,
    async (pid) => {
      try {
        const { lat, lng } = await getLatLngFromGoogle(pid);
        if (lat == null || lng == null) return { place_id: pid, lat: null, lng: null, ok: false as const };
        return { place_id: pid, lat, lng, ok: true as const };
      } catch (e: any) {
        return { place_id: pid, lat: null, lng: null, ok: false as const, err: e?.message ?? "error" };
      }
    },
    CONCURRENCY
  );

  const payload = fetched
    .filter((x) => x.ok && x.lat != null && x.lng != null)
    .map((x) => ({ place_id: x.place_id, lat: x.lat!, lng: x.lng!, updated_at: new Date().toISOString() }));

  // 3) upsertで反映（place_idがPK/UNIQUE前提）
  let updated = 0;
  if (payload.length > 0) {
    // Supabaseは一度に大きい配列投げると失敗しやすいのでchunk推奨
    const CHUNK = 200;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      const { error: upErr } = await supabaseAdmin
        .from("places")
        .upsert(chunk, { onConflict: "place_id" });

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      updated += chunk.length;
    }
  }

  const failed = fetched.filter((x: any) => !x.ok).map((x: any) => ({ place_id: x.place_id, err: x.err ?? "" }));

  return NextResponse.json({
    ok: true,
    attempted: targets.length,
    fetched_ok: payload.length,
    updated,
    failed_count: failed.length,
    failed: failed.slice(0, 30), // 多すぎるとレス重いので先頭だけ
  });
}
