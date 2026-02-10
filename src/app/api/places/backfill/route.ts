import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  secret: string;
  limit?: number;
  cursorPlaceId?: string;
  force?: boolean;
};

type AddressComponent = { long_name: string; short_name: string; types: string[] };

function pick(ac: AddressComponent[] | undefined, type: string) {
  const hit = (ac ?? []).find((x) => Array.isArray(x.types) && x.types.includes(type));
  return hit ?? null;
}

function normSpace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
function buildSearchText(parts: Array<string | null | undefined>) {
  const joined = parts
    .filter((x) => typeof x === "string" && x.trim() !== "")
    .map((x) => normSpace(String(x)))
    .join(" | ");
  return joined.toLowerCase();
}

function buildAreaLabelJa(ac?: AddressComponent[]) {
  const country = pick(ac, "country");
  const pref = pick(ac, "administrative_area_level_1");
  const city =
    pick(ac, "locality") ||
    pick(ac, "administrative_area_level_2") ||
    pick(ac, "postal_town");
  const ward = pick(ac, "ward") || pick(ac, "sublocality_level_1");

  const countryName = country?.long_name ?? null;
  const isJapan = country?.short_name === "JP" || (countryName ? String(countryName).includes("日本") : false);

  let area_label_ja: string | null = null;
  if (isJapan) {
    const prefJa = pref?.long_name ?? null;
    const core = (ward?.long_name ?? city?.long_name ?? null) as string | null;
    area_label_ja = prefJa && core ? `${prefJa}${core}` : core || prefJa || "日本";
  } else {
    area_label_ja = countryName || "その他";
  }
  return { country_name: countryName, area_label_ja };
}

function buildAreaKeyAndEnFromEn(ac?: AddressComponent[]) {
  const country = pick(ac, "country");
  const pref = pick(ac, "administrative_area_level_1");
  const city =
    pick(ac, "locality") ||
    pick(ac, "administrative_area_level_2") ||
    pick(ac, "postal_town");
  const ward = pick(ac, "ward") || pick(ac, "sublocality_level_1");

  const countryEn = country?.short_name ?? country?.long_name ?? null;
  const isJapan = countryEn === "JP";

  let area_label_en: string | null = null;
  let area_key: string | null = null;

  if (isJapan) {
    const prefEn = pref?.short_name ?? pref?.long_name ?? null;
    const coreEn = (ward?.long_name ?? city?.long_name ?? null) as string | null;
    area_label_en = coreEn || prefEn || "Japan";

    const kp = (prefEn ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const kc = (coreEn ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    area_key = kp && kc ? `${kp}_${kc}` : kc || kp || "japan";
  } else {
    area_label_en = country?.long_name ?? countryEn ?? "Other";
    area_key =
      (area_label_en ?? "other").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "other";
  }

  return { area_label_en, area_key };
}

async function fetchDetails(placeId: string, googleKey: string, lang: "ja" | "en") {
  const fields = ["place_id", "name", "formatted_address", "geometry/location", "address_components"].join(",");
  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&language=${encodeURIComponent(lang)}` +
    `&key=${encodeURIComponent(googleKey)}`;

  const resp = await fetch(url);
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json || json.status !== "OK" || !json.result) {
    throw new Error(`Place Details error: ${json?.status ?? "HTTP_ERROR"}`);
  }
  return json.result as any;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const SECRET = process.env.ADMIN_BACKFILL_SECRET ?? "iLiFE";
    if (!body?.secret || body.secret !== SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
    const googleKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_PLACES_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }
    if (!googleKey) {
      return NextResponse.json({ error: "Missing Google env var: GOOGLE_PLACES_API_KEY" }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const limit = Math.min(Math.max(body.limit ?? 40, 1), 200);
    const force = !!body.force;
    const cursor = body.cursorPlaceId ?? null;

    let q = admin
      .from("places")
      .select("place_id, name, address, lat, lng, country_name, area_key, area_label_ja, area_label_en, search_text")
      .order("place_id", { ascending: true })
      .limit(limit);

    if (cursor) q = q.gt("place_id", cursor);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const targets = (rows ?? []).filter((r) => {
      if (force) return true;
      // 欠けてたら対象（“英語っぽい ja” も治したいなら force=true で回す）
      return !r.area_label_ja || !r.area_key || !r.search_text;
    });

    let ok = 0;
    let skipped = (rows?.length ?? 0) - targets.length;
    const failed: Array<{ place_id: string; reason: string }> = [];

    for (const r0 of targets) {
      const placeId = r0.place_id;
      try {
        const [ja, en] = await Promise.all([
          fetchDetails(placeId, googleKey, "ja"),
          fetchDetails(placeId, googleKey, "en"),
        ]);

        const lat = ja?.geometry?.location?.lat ?? r0.lat ?? null;
        const lng = ja?.geometry?.location?.lng ?? r0.lng ?? null;

        const { country_name, area_label_ja } = buildAreaLabelJa(ja?.address_components ?? []);
        const { area_label_en, area_key } = buildAreaKeyAndEnFromEn(en?.address_components ?? []);

        const name = (ja?.name ?? en?.name ?? r0.name ?? null) as string | null;
        const address = (ja?.formatted_address ?? en?.formatted_address ?? r0.address ?? null) as string | null;

        const search_text = buildSearchText([
          name,
          address,
          country_name,
          area_label_ja,
          area_label_en,
          area_key,
          placeId,
        ]);

        const patch = {
          place_id: placeId,
          name,
          address,
          lat: typeof lat === "number" ? lat : null,
          lng: typeof lng === "number" ? lng : null,
          country_name,
          area_key,
          area_label_ja,
          area_label_en,
          search_text,
          updated_at: new Date().toISOString(),
        };

        const { error: upErr } = await admin.from("places").upsert(patch, { onConflict: "place_id" });
        if (upErr) {
          failed.push({ place_id: placeId, reason: upErr.message });
          continue;
        }
        ok += 1;
      } catch (e: any) {
        failed.push({ place_id: placeId, reason: e?.message ?? "unknown" });
      }
    }

    const last = rows?.length ? rows[rows.length - 1].place_id : cursor;

    return NextResponse.json({
      ok: true,
      processed: ok,
      skipped,
      failed,
      nextCursorPlaceId: rows?.length === limit ? last : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
