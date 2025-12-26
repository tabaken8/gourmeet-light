// app/debug/map/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

/** PromiseLike 対応（Supabaseのクエリは thenable） */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(`timeout(${ms}ms): ${label}`)), ms);
    Promise.resolve(p)
      .then((v) => {
        window.clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        window.clearTimeout(id);
        reject(e);
      });
  });
}

function now() {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

type FollowRow = { followee_id: string; status: string };
type ProfileRow = { id: string; avatar_url: string | null };
type PostRow = {
  id: string;
  user_id: string;
  place_id: string | null;
  place_name: string | null;
  place_address: string | null;
  created_at: string | null;
  image_urls?: string[] | null;
  price_yen?: number | null;
  price_range?: string | null;
};
type PlaceRow = {
  place_id: string;
  lat: number | null;
  lng: number | null;
  name: string | null;
  address: string | null;
  photo_url: string | null;
};

type PlacePin = {
  place_id: string;
  lat: number;
  lng: number;
  place_name: string;
  place_address: string;
  latest_user_id: string;
  latest_avatar_url: string | null;
  latest_created_ms: number;
};

function toMs(ts: string | null) {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureGmapsOptionsOnce(opts: Parameters<typeof setOptions>[0]) {
  const g = globalThis as any;
  if (!g.__GMAPS_OPTIONS_SET__) {
    setOptions(opts);
    g.__GMAPS_OPTIONS_SET__ = true;
  }
}

function snapshotMapDiv(el: HTMLDivElement | null) {
  if (!el) return { ok: false as const, reason: "no el" };
  const r = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  const centerX = Math.round(r.left + r.width / 2);
  const centerY = Math.round(r.top + r.height / 2);
  const topEl = document.elementFromPoint(centerX, centerY) as HTMLElement | null;
  const inside = topEl ? el.contains(topEl) : false;

  return {
    ok: true as const,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    position: cs.position,
    zIndex: cs.zIndex,
    overflow: cs.overflow,
    pointerEvents: cs.pointerEvents,
    background: cs.backgroundColor,
    gmStyle: !!el.querySelector(".gm-style"),
    canvas: el.querySelectorAll("canvas").length,
    img: el.querySelectorAll("img").length,
    insideMapDiv: inside,
    topBg: topEl ? window.getComputedStyle(topEl).backgroundColor : "(none)",
  };
}

export default function DebugMapPage() {
  const supabase = createClientComponentClient();

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ||
    "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "";

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<any[]>([]);

  const libsRef = useRef<{
    Map: typeof google.maps.Map;
    AdvancedMarkerElement: any;
    InfoWindow: typeof google.maps.InfoWindow;
  } | null>(null);

  // ✅ これが重要：ref に値が入っても rerender されないので state を立てる
  const [gmapsReady, setGmapsReady] = useState(false);

  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [err, setErr] = useState<string>("");

  const [logs, setLogs] = useState<string[]>([]);
  const push = (s: string) => setLogs((prev) => [...prev.slice(-400), `${now()} ${s}`]);

  const [pins, setPins] = useState<PlacePin[]>([]);
  const [tick, setTick] = useState(0);

  const bump = () => setTick((t) => t + 1);

  const envOk = useMemo(() => {
    const missing: string[] = [];
    if (!apiKey) missing.push("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
    if (!mapId) missing.push("NEXT_PUBLIC_GOOGLE_MAP_ID");
    return { ok: missing.length === 0, missing };
  }, [apiKey, mapId]);

  /** 1) Google Maps ライブラリ読み込み */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      push("---- gmaps load start ----");

      if (!envOk.ok) {
        setPhase("error");
        setErr(`env missing: ${envOk.missing.join(", ")}`);
        push(`❌ env missing: ${envOk.missing.join(", ")}`);
        return;
      }

      try {
        ensureGmapsOptionsOnce({
          key: apiKey,
          v: "weekly",
          language: "ja",
          region: "JP",
        });

        push("importLibrary(maps) ...");
        const mapsLib = await withTimeout(importLibrary("maps") as PromiseLike<any>, 15000, "importLibrary(maps)");

        push("importLibrary(marker) ...");
        const markerLib = await withTimeout(importLibrary("marker") as PromiseLike<any>, 15000, "importLibrary(marker)");

        libsRef.current = {
          Map: mapsLib.Map,
          AdvancedMarkerElement: markerLib.AdvancedMarkerElement,
          InfoWindow: mapsLib.InfoWindow,
        };

        if (cancelled) return;
        push("✅ gmaps libs loaded");

        // ✅ ここで rerender を起こして map init を確実に走らせる
        setGmapsReady(true);
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message ?? String(e);
        setPhase("error");
        setErr(msg);
        push(`❌ gmaps load failed: ${msg}`);
      } finally {
        push("---- gmaps load done ----");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, envOk.ok, envOk.missing, mapId]);

  /** 2) Map 初期化（gmapsReady を deps にする） */
  useEffect(() => {
    if (!gmapsReady) return;
    if (!libsRef.current) return;
    if (!mapDivRef.current) return;
    if (mapRef.current) return;

    push("---- map init start ----");
    push("mapDiv snapshot(before): " + JSON.stringify(snapshotMapDiv(mapDivRef.current)));

    const { Map, InfoWindow } = libsRef.current;

    try {
      mapRef.current = new Map(mapDivRef.current, {
        center: { lat: 35.681236, lng: 139.767125 },
        zoom: 12,
        mapId,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        clickableIcons: false,
      });

      infoRef.current = new InfoWindow();

      mapRef.current.addListener("idle", () => push("event: idle ✅"));
      mapRef.current.addListener("tilesloaded", () => push("event: tilesloaded ✅"));

      push("✅ Map created");

      window.setTimeout(() => push("mapDiv t+200ms: " + JSON.stringify(snapshotMapDiv(mapDivRef.current))), 200);
      window.setTimeout(() => push("mapDiv t+800ms: " + JSON.stringify(snapshotMapDiv(mapDivRef.current))), 800);
      window.setTimeout(() => push("mapDiv t+2000ms: " + JSON.stringify(snapshotMapDiv(mapDivRef.current))), 2000);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setPhase("error");
      setErr(msg);
      push(`❌ map init failed: ${msg}`);
    } finally {
      push("---- map init done ----");
    }
  }, [gmapsReady, mapId]);

  /** 3) Supabase データ取得（tickで再実行できる） */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPhase("loading");
      setErr("");
      push("==== data fetch start ====");

      try {
        push("supabase.auth.getUser() ...");
        const userRes = await withTimeout(supabase.auth.getUser(), 15000, "auth.getUser()");
        const myUid = userRes.data.user?.id;
        if (!myUid) throw new Error("auth user is null");
        push(`auth ok user=${myUid}`);

        push("follows query ...");
        const followsRes = await withTimeout(
          supabase
            .from("follows")
            .select("followee_id, status")
            .eq("follower_id", myUid)
            .eq("status", "accepted"),
          15000,
          "follows select"
        );
        if (followsRes.error) throw new Error(`follows error: ${followsRes.error.message}`);

        const followeeIds = ((followsRes.data as FollowRow[] | null) ?? []).map((r) => r.followee_id);
        push(`followees accepted = ${followeeIds.length}`);

        if (followeeIds.length === 0) {
          if (cancelled) return;
          setPins([]);
          setPhase("ready");
          push("no followees => ready");
          return;
        }

        push("profiles query ...");
        const profilesRes = await withTimeout(
          supabase.from("profiles").select("id, avatar_url").in("id", followeeIds),
          15000,
          "profiles select"
        );
        if (profilesRes.error) push(`warn: profiles error: ${profilesRes.error.message}`);

        const avatarByUser = new Map<string, string | null>();
        ((profilesRes.data as ProfileRow[] | null) ?? []).forEach((p) => avatarByUser.set(p.id, p.avatar_url ?? null));

        push("posts query ...");
        const postsRes = await withTimeout(
          supabase
            .from("posts")
            .select("id, user_id, place_id, place_name, place_address, created_at, image_urls, price_yen, price_range")
            .in("user_id", followeeIds)
            .not("place_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(800),
          20000,
          "posts select"
        );
        if (postsRes.error) throw new Error(`posts error: ${postsRes.error.message}`);

        const postRows = ((postsRes.data as PostRow[] | null) ?? []).filter((p) => !!p.place_id);
        const placeIds = Array.from(new Set(postRows.map((p) => p.place_id!).filter(Boolean)));
        push(`posts(with place_id) = ${postRows.length}, placeIds = ${placeIds.length}`);

        if (placeIds.length === 0) {
          if (cancelled) return;
          setPins([]);
          setPhase("ready");
          push("no placeIds => ready");
          return;
        }

        push("places query ...");
        const placesRes = await withTimeout(
          supabase.from("places").select("place_id, lat, lng, name, address, photo_url").in("place_id", placeIds),
          20000,
          "places select"
        );
        if (placesRes.error) throw new Error(`places error: ${placesRes.error.message}`);

        const placeById = new Map<string, PlaceRow>();
        ((placesRes.data as PlaceRow[] | null) ?? []).forEach((p) => placeById.set(p.place_id, p));

        const bestByPlace = new Map<string, PlacePin>();

        for (const p of postRows) {
          const pid = p.place_id!;
          const plc = placeById.get(pid);
          if (!plc || plc.lat == null || plc.lng == null) continue;

          const created = toMs(p.created_at);
          const existing = bestByPlace.get(pid);

          if (!existing || created > existing.latest_created_ms) {
            bestByPlace.set(pid, {
              place_id: pid,
              lat: plc.lat,
              lng: plc.lng,
              place_name: p.place_name || plc.name || "(no name)",
              place_address: p.place_address || plc.address || "",
              latest_user_id: p.user_id,
              latest_avatar_url: avatarByUser.get(p.user_id) ?? null,
              latest_created_ms: created,
            });
          }
        }

        const pinsSorted = Array.from(bestByPlace.values()).sort((a, b) => b.latest_created_ms - a.latest_created_ms);

        push(`places rows = ${(placesRes.data as any[] | null)?.length ?? 0}`);
        push(`places with lat/lng = ${pinsSorted.length}`);
        push(`pins = ${pinsSorted.length}`);

        if (cancelled) return;
        setPins(pinsSorted);
        setPhase("ready");
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message ?? String(e);
        setPhase("error");
        setErr(msg);
        push(`❌ data fetch failed: ${msg}`);
      } finally {
        push("==== data fetch done ====");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, tick]);

  /** 4) マーカー描画（pinsが変わるたび） */
  useEffect(() => {
    const map = mapRef.current;
    const libs = libsRef.current;
    if (!map || !libs) return;

    // cleanup
    for (const m of markersRef.current) {
      try {
        m.map = null;
      } catch {}
    }
    markersRef.current = [];
    try {
      infoRef.current?.close();
    } catch {}

    if (pins.length === 0) {
      push("markers: pins=0 (no markers)");
      return;
    }

    // ✅ ここが修正点：LatLngBoundsは google.maps を直接使う
    const bounds = new google.maps.LatLngBounds();

    for (const pin of pins) {
      const wrap = document.createElement("div");
      wrap.style.width = "42px";
      wrap.style.height = "42px";
      wrap.style.borderRadius = "9999px";
      wrap.style.display = "grid";
      wrap.style.placeItems = "center";
      wrap.style.background = "white";
      wrap.style.border = "2px solid rgba(255,255,255,0.95)";
      wrap.style.boxShadow = "0 6px 18px rgba(0,0,0,0.22)";
      wrap.style.fontWeight = "900";
      wrap.style.fontSize = "12px";
      wrap.style.cursor = "pointer";
      wrap.textContent = "📍";

      const marker = new libs.AdvancedMarkerElement({
        map,
        position: { lat: pin.lat, lng: pin.lng },
        content: wrap,
      });

      wrap.addEventListener("click", () => {
        const html = `
          <div style="min-width:220px">
            <div style="font-weight:900;margin-bottom:6px;">${escapeHtml(pin.place_name)}</div>
            ${
              pin.place_address
                ? `<div style="color:#374151;font-size:12px;margin-bottom:6px;">${escapeHtml(pin.place_address)}</div>`
                : ""
            }
            <div style="font-size:12px;color:#111827;">latest_user: ${escapeHtml(pin.latest_user_id)}</div>
            <div style="font-size:12px;color:#6b7280;">created_ms: ${pin.latest_created_ms}</div>
          </div>
        `;
        infoRef.current?.setContent(html);
        infoRef.current?.open({ map, anchor: marker });
      });

      markersRef.current.push(marker);
      bounds.extend({ lat: pin.lat, lng: pin.lng });
    }

    try {
      map.fitBounds(bounds, 60);
    } catch {}
    push(`markers rendered: ${pins.length}`);
  }, [pins]);

  const copyLogs = async () => {
    const text = logs.join("\n");
    await navigator.clipboard.writeText(text);
    push("copied logs ✅");
  };

  return (
    <div style={{ width: "100%", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>debug/map（本番寄り・timeout付き）</div>

        {phase === "loading" && <div style={{ fontSize: 12, color: "#6b7280" }}>読み込み中…</div>}
        {phase === "ready" && <div style={{ fontSize: 12, color: "#16a34a" }}>ready ✅</div>}
        {phase === "error" && <div style={{ fontSize: 12, color: "#ef4444" }}>error ❌ {err}</div>}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={bump}
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 800,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "white",
              cursor: "pointer",
            }}
            title="再描画・再fetch（本番っぽい状態変化を再現）"
          >
            bump tick={tick}
          </button>

          <button
            type="button"
            onClick={() => push("manual snapshot: " + JSON.stringify(snapshotMapDiv(mapDivRef.current)))}
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 800,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(0,0,0,0.03)",
              cursor: "pointer",
            }}
          >
            snapshot
          </button>

          <button
            type="button"
            onClick={copyLogs}
            style={{
              borderRadius: 12,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 800,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(0,0,0,0.03)",
              cursor: "pointer",
            }}
          >
            copy logs
          </button>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
        gmapsReady: {String(gmapsReady)} / pins: {pins.length}
      </div>

      <div
        style={{
          marginTop: 12,
          borderRadius: 16,
          overflow: "hidden",
          background: "#f3f4f6",
          height: "calc(100dvh - 210px)",
          border: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div
          ref={mapDivRef}
          style={{
            width: "100%",
            height: "100%",
            background: "#f3f4f6",
          }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 6 }}>console mirror</div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "rgba(0,0,0,0.03)",
            padding: 12,
            borderRadius: 12,
            fontSize: 11,
            lineHeight: 1.35,
            maxHeight: 260,
            overflow: "auto",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {logs.join("\n")}
        </pre>
      </div>
    </div>
  );
}
