"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Image as ImageIcon, MapPin, X, Check } from "lucide-react";
import confetti from "canvas-confetti";

type PlaceResult = {
  place_id: string;
  name: string;
  formatted_address: string;
};

type PreparedImage = {
  id: string;
  full: File;
  thumb: File;
  previewUrl: string; // thumbのobjectURL
  label: string;
};

function isHeicLike(file: File) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type.includes("image/heic") ||
    type.includes("image/heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const mod: any = await import("heic2any");
  const heic2any = mod.default ?? mod;
  const blob: Blob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.86,
  });
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}

function canUseAvif(): boolean {
  try {
    const c = document.createElement("canvas");
    return c.toDataURL("image/avif").startsWith("data:image/avif");
  } catch {
    return false;
  }
}

function canUseWebp(): boolean {
  try {
    const c = document.createElement("canvas");
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/**
 * Gourmeet day_key（毎日4:00 JSTで切り替え）
 * - JSTで 00:00〜03:59 は「前日扱い」
 * - それ以外は「当日扱い」
 */
function getGourmeetDayKey(now = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(dtf.formatToParts(now).map((p) => [p.type, p.value])) as any;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour);

  let day = new Date(Date.UTC(y, m - 1, d));
  if (h < 4) day = new Date(day.getTime() - 24 * 60 * 60 * 1000);

  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ✅ JSTの「今日」を YYYY-MM-DD で返す（visited_on のデフォ用） */
function getJstTodayYmd(now = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(now); // "YYYY-MM-DD"
}

/**
 * 高品質縮小：
 * - EXIF orientation を反映（可能なら）
 * - 段階縮小（半分ずつ）でボケ/ジャギを抑える
 */
async function resizeToFile(
  input: File,
  opts: { maxLongEdge: number; mime: string; quality: number; outExt: string }
): Promise<File> {
  const bitmap = await createImageBitmap(input, {
    imageOrientation: "from-image",
  } as any);

  const w = bitmap.width;
  const h = bitmap.height;

  const longEdge = Math.max(w, h);
  const scale = Math.min(1, opts.maxLongEdge / longEdge);

  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  let curCanvas = document.createElement("canvas");
  let curW = w;
  let curH = h;
  curCanvas.width = curW;
  curCanvas.height = curH;

  {
    const ctx = curCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context を取得できませんでした。");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, curW, curH);
  }

  while (curW / 2 > tw && curH / 2 > th) {
    const nextCanvas = document.createElement("canvas");
    const nextW = Math.max(tw, Math.floor(curW / 2));
    const nextH = Math.max(th, Math.floor(curH / 2));
    nextCanvas.width = nextW;
    nextCanvas.height = nextH;

    const nctx = nextCanvas.getContext("2d");
    if (!nctx) throw new Error("Canvas context を取得できませんでした。");
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);

    curCanvas = nextCanvas;
    curW = nextW;
    curH = nextH;
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = tw;
  outCanvas.height = th;

  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Canvas context を取得できませんでした。");
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, tw, th);

  const blob: Blob = await new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("画像変換に失敗しました。"))),
      opts.mime,
      opts.quality
    );
  });

  const base = input.name.replace(/\.[^.]+$/, "");
  const outName = `${base}.${opts.outExt}`;
  return new File([blob], outName, { type: opts.mime });
}

/**
 * 「タイムライン=thumb」でも不快にならない画質寄り
 * - thumb: 長辺1440px
 * - full : 長辺3072px
 * - 形式: AVIF > WebP > JPEG
 */
async function prepareImage(file: File): Promise<PreparedImage> {
  const normalized = isHeicLike(file) ? await convertHeicToJpeg(file) : file;

  const avif = typeof window !== "undefined" && canUseAvif();
  const webp = typeof window !== "undefined" && canUseWebp();

  const mime = avif ? "image/avif" : webp ? "image/webp" : "image/jpeg";
  const outExt = avif ? "avif" : webp ? "webp" : "jpg";

  const thumb = await resizeToFile(normalized, {
    maxLongEdge: 1440,
    mime,
    quality: avif ? 0.68 : webp ? 0.9 : 0.92,
    outExt,
  });

  const full = await resizeToFile(normalized, {
    maxLongEdge: 3072,
    mime,
    quality: avif ? 0.72 : webp ? 0.92 : 0.94,
    outExt,
  });

  const previewUrl = URL.createObjectURL(thumb);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    full,
    thumb,
    previewUrl,
    label: file.name,
  };
}

// 価格レンジ候補（DBのチェック制約と一致させる）
const PRICE_RANGES = [
  { value: "~999", label: "〜¥999" },
  { value: "1000-1999", label: "¥1,000〜¥1,999" },
  { value: "2000-2999", label: "¥2,000〜¥2,999" },
  { value: "3000-3999", label: "¥3,000〜¥3,999" },
  { value: "4000-4999", label: "¥4,000〜¥4,999" },
  { value: "5000-6999", label: "¥5,000〜¥6,999" },
  { value: "7000-9999", label: "¥7,000〜¥9,999" },
  { value: "10000-14999", label: "¥10,000〜¥14,999" },
  { value: "15000-19999", label: "¥15,000〜¥19,999" },
  { value: "20000-24999", label: "¥20,000〜¥24,999" },
  { value: "25000-29999", label: "¥25,000〜¥29,999" },
  { value: "30000-49999", label: "¥30,000〜¥49,999" },
  { value: "50000+", label: "¥50,000〜" },
] as const;

type PriceMode = "exact" | "range";

function onlyDigits(s: string) {
  return s.replace(/[^\d]/g, "");
}

function formatYen(n: number) {
  try {
    return new Intl.NumberFormat("ja-JP").format(n);
  } catch {
    return String(n);
  }
}

/** points差分演出用：point_balances.balance を読む */
async function fetchPointBalance(supabase: any, uid: string): Promise<number | null> {
  const { data, error } = await supabase.from("point_balances").select("balance").eq("user_id", uid).single();
  if (error) {
    console.warn("fetchPointBalance error:", error);
    return null;
  }
  const n = Number((data as any)?.balance);
  return Number.isFinite(n) ? n : null;
}

/** 付与が遅れることがあるので、最大 ~10秒くらい差分が出るまで待つ */
async function waitForDelta(
  getAfter: () => Promise<number | null>,
  before: number | null,
  { tries = 10, delayMs = 220 } = {}
): Promise<number | null> {
  if (before === null) return null;

  for (let i = 0; i < tries; i++) {
    const after = await getAfter();
    if (after !== null) {
      const delta = after - before;
      if (delta !== 0) return delta;
    }
    await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
  }
  return 0;
}

function RailDot({
  done,
  label,
  optional,
  dotRef,
}: {
  done: boolean;
  label: string;
  optional?: boolean;
  dotRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex items-center justify-center pt-6">
      <div ref={dotRef} className="relative z-10">
        <div
          className={[
            "grid h-6 w-6 place-items-center rounded-full transition",
            done
              ? "bg-orange-600 text-white shadow-sm"
              : optional
                ? "border border-dashed border-slate-300 bg-white/70 text-slate-300"
                : "border border-slate-300 bg-white/70 text-slate-300",
          ].join(" ")}
          aria-label={label}
          title={optional ? `${label}（任意）` : label}
        >
          {done ? <Check className="h-4 w-4" /> : <div className="h-1.5 w-1.5 rounded-full bg-current" />}
        </div>
        {optional && !done && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-slate-400">
            任意
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewPostPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);

  const [hasPosted, setHasPosted] = useState<boolean | null>(null);
  const [dailyAwarded, setDailyAwarded] = useState<boolean | null>(null);

  const dayKey = useMemo(() => getGourmeetDayKey(new Date()), []);

  const [content, setContent] = useState("");
  const [imgs, setImgs] = useState<PreparedImage[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 店舗関連
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);

  // おすすめ度
  const [recommendSelected, setRecommendSelected] = useState(false);
  const [recommendScore, setRecommendScore] = useState<number>(7.0);

  // 価格
  const [priceMode, setPriceMode] = useState<PriceMode>("exact");
  const [priceYenText, setPriceYenText] = useState<string>("");
  const [priceRange, setPriceRange] = useState<(typeof PRICE_RANGES)[number]["value"]>("3000-3999");

  // ✅ 来店日：未入力なら今日が入ってる（=デフォ今日）
  const [visitedOn, setVisitedOn] = useState<string>(() => getJstTodayYmd(new Date())); // "YYYY-MM-DD"

  // 付与演出モーダル
  const [award, setAward] = useState<{ points: number } | null>(null);

  const priceYenValue = useMemo(() => {
    const digits = onlyDigits(priceYenText);
    if (!digits) return null;
    const n = Number(digits);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  }, [priceYenText]);

  const isPriceComplete = useMemo(() => {
    if (priceMode === "range") return true;
    return !!priceYenValue && priceYenValue > 0;
  }, [priceMode, priceYenValue]);

  const isContentComplete = content.trim().length > 0;
  const isPhotoComplete = imgs.length > 0;
  const isPlaceComplete = !!selectedPlace;
  const isRecommendComplete = recommendSelected;

  const isAllRequiredComplete = isPhotoComplete && isRecommendComplete && isPriceComplete && isContentComplete;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  useEffect(() => {
    if (!uid) {
      setHasPosted(null);
      setDailyAwarded(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { count: postCount, error: postErr } = await supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid);

        if (cancelled) return;

        if (postErr) {
          console.error(postErr);
          setHasPosted(null);
        } else {
          setHasPosted((postCount ?? 0) > 0);
        }

        const { count: dailyCount, error: dailyErr } = await supabase
          .from("point_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("reason", "daily_post")
          .eq("day_key", dayKey);

        if (cancelled) return;

        if (dailyErr) {
          console.error(dailyErr);
          setDailyAwarded(null);
        } else {
          setDailyAwarded((dailyCount ?? 0) > 0);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setHasPosted(null);
          setDailyAwarded(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, supabase, dayKey]);

  // 場所候補検索（デバウンス）
  useEffect(() => {
    if (placeQuery.trim().length < 2) {
      setPlaceResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingPlace(true);
        const res = await fetch(`/api/places?q=${encodeURIComponent(placeQuery.trim())}`);
        const data = await res.json();
        setPlaceResults((data.results ?? []).slice(0, 6));
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingPlace(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [placeQuery]);

  // クリップボード貼り付け
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const pastedFiles = Array.from(e.clipboardData.files).filter((f) =>
        (f.type || "").startsWith("image/")
      );
      if (pastedFiles.length > 0) {
        await addImages(pastedFiles);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // objectURL解放（アンマウント時のみ）
  const imgsRef = useRef<PreparedImage[]>([]);
  useEffect(() => {
    imgsRef.current = imgs;
  }, [imgs]);
  useEffect(() => {
    return () => {
      imgsRef.current.forEach((x) => URL.revokeObjectURL(x.previewUrl));
    };
  }, []);

  const addImages = async (files: File[]) => {
    const MAX = 9;
    if (imgs.length >= MAX) return;

    setProcessing(true);
    setMsg(null);

    try {
      const limited = files.slice(0, Math.max(0, MAX - imgs.length));
      const prepared: PreparedImage[] = [];
      for (const f of limited) prepared.push(await prepareImage(f));
      setImgs((prev) => [...prev, ...prepared]);
    } catch (e: any) {
      setMsg(e?.message ?? "画像の前処理に失敗しました");
    } finally {
      setProcessing(false);
    }
  };

  const handleFiles = async (newFiles: FileList | null) => {
    if (!newFiles) return;
    await addImages(Array.from(newFiles));
  };

  const removeImage = (id: string) => {
    setImgs((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  // places に最低限データを upsert
  async function upsertPlaceIfNeeded(placeId: string) {
    try {
      const res = await fetch(`/api/place-details?place_id=${encodeURIComponent(placeId)}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`place-details failed: ${res.status}`);

      const d = await res.json();
      const nowIso = new Date().toISOString();

      const row: any = {
        place_id: d.place_id,
        updated_at: nowIso,
        types_fetched_at: nowIso,
      };

      if (typeof d.name === "string" && d.name) row.name = d.name;
      if (typeof d.address === "string" && d.address) row.address = d.address;
      if (Number.isFinite(d.lat)) row.lat = d.lat;
      if (Number.isFinite(d.lng)) row.lng = d.lng;
      if (typeof d.photo_url === "string" && d.photo_url) row.photo_url = d.photo_url;
      if (Array.isArray(d.place_types) && d.place_types.length) row.place_types = d.place_types;
      if (typeof d.primary_type === "string" && d.primary_type) row.primary_type = d.primary_type;

      const { error } = await supabase.from("places").upsert(row, { onConflict: "place_id" });
      if (error) throw error;

      return {
        name: typeof d.name === "string" && d.name ? d.name : null,
        address: typeof d.address === "string" && d.address ? d.address : null,
      };
    } catch (e) {
      console.warn("upsertPlaceIfNeeded failed:", e);
      return { name: null, address: null };
    }
  }

  // レール線アニメ
  const formRef = useRef<HTMLFormElement | null>(null);
  const dotPhotoRef = useRef<HTMLDivElement | null>(null);
  const dotRecRef = useRef<HTMLDivElement | null>(null);
  const dotPriceRef = useRef<HTMLDivElement | null>(null);
  const dotContentRef = useRef<HTMLDivElement | null>(null);
  const dotPlaceRef = useRef<HTMLDivElement | null>(null);

  const [railGeom, setRailGeom] = useState<{ top: number; height: number }>({ top: 0, height: 0 });
  const [railOn, setRailOn] = useState(false);
  const prevAllRef = useRef(false);

  const computeRail = () => {
    const formEl = formRef.current;
    const firstEl = dotPhotoRef.current;
    const lastEl = dotPlaceRef.current ?? dotContentRef.current;
    if (!formEl || !firstEl || !lastEl) return;

    const fr = formEl.getBoundingClientRect();
    const r1 = firstEl.getBoundingClientRect();
    const rN = lastEl.getBoundingClientRect();

    const top = r1.top - fr.top + r1.height / 2;
    const height = rN.top - fr.top + rN.height / 2 - top;

    setRailGeom({ top, height: Math.max(0, height) });
  };

  useLayoutEffect(() => {
    computeRail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgs.length, recommendSelected, recommendScore, priceMode, priceYenText, priceRange, content, selectedPlace, visitedOn]);

  useEffect(() => {
    const onResize = () => computeRail();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prev = prevAllRef.current;
    if (!prev && isAllRequiredComplete) {
      setRailOn(true);
    }
    if (!isAllRequiredComplete) {
      setRailOn(false);
    }
    prevAllRef.current = isAllRequiredComplete;
  }, [isAllRequiredComplete]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return setMsg("ログインしてください。");
    if (processing) return setMsg("画像を処理中です。少し待ってください。");

    if (!recommendSelected) {
      return setMsg("おすすめ度を選んでください（スライダーを動かすと選択されます）。");
    }

    const price_yen = priceMode === "exact" ? priceYenValue : null;
    const price_range = priceMode === "range" ? priceRange : null;

    if (priceMode === "exact" && (price_yen === null || price_yen === 0)) {
      return setMsg("価格（実額）を入力してください（例: 3500）。");
    }

    setBusy(true);
    setMsg(null);

    const beforePoints = await fetchPointBalance(supabase, uid);

    try {
      const CACHE = "31536000"; // 1年
      const variants: Array<{ full: string; thumb: string }> = [];
      const compatFullUrls: string[] = [];

      for (const img of imgs) {
        const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const fullExt = img.full.name.split(".").pop() || "jpg";
        const thumbExt = img.thumb.name.split(".").pop() || "jpg";

        const fullPath = `${uid}/${base}_full.${fullExt}`;
        const thumbPath = `${uid}/${base}_thumb.${thumbExt}`;

        const upThumb = await supabase.storage.from("post-images").upload(thumbPath, img.thumb, {
          cacheControl: CACHE,
          upsert: false,
          contentType: img.thumb.type,
        });
        if (upThumb.error) throw upThumb.error;

        const upFull = await supabase.storage.from("post-images").upload(fullPath, img.full, {
          cacheControl: CACHE,
          upsert: false,
          contentType: img.full.type,
        });
        if (upFull.error) throw upFull.error;

        const { data: pubThumb } = supabase.storage.from("post-images").getPublicUrl(thumbPath);
        const { data: pubFull } = supabase.storage.from("post-images").getPublicUrl(fullPath);

        variants.push({ thumb: pubThumb.publicUrl, full: pubFull.publicUrl });
        compatFullUrls.push(pubFull.publicUrl);
      }

      let normalizedPlaceName: string | null = null;
      let normalizedPlaceAddress: string | null = null;

      if (selectedPlace?.place_id) {
        const norm = await upsertPlaceIfNeeded(selectedPlace.place_id);
        normalizedPlaceName = norm.name;
        normalizedPlaceAddress = norm.address;
      }

      // ✅ ここ：未設定なら null（でもUIはデフォで今日が入ってる）
      const visited_on = visitedOn ? visitedOn : null;

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: uid,
        content,
        image_variants: variants,
        image_urls: compatFullUrls,

        place_id: selectedPlace?.place_id ?? null,
        place_name: normalizedPlaceName ?? selectedPlace?.name ?? null,
        place_address: normalizedPlaceAddress ?? selectedPlace?.formatted_address ?? null,

        recommend_score: Number(recommendScore.toFixed(1)),
        price_yen,
        price_range,

        visited_on,
      });
      if (insErr) throw insErr;

      const delta = await waitForDelta(() => fetchPointBalance(supabase, uid), beforePoints);

      if (delta && delta > 0) {
        setAward({ points: delta });
        confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 } });
        confetti({ particleCount: 60, spread: 120, origin: { y: 0.6 } });
        return;
      }

      router.push("/timeline");
      router.refresh();
    } catch (err: any) {
      setMsg(err.message ?? "投稿に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const resetNote = (
    <span className="text-xs text-slate-500">
      ※ リセットは <span className="font-semibold">毎日 4:00（JST）</span>（day_key:{" "}
      <span className="font-mono">{dayKey}</span>）
    </span>
  );

  const dailyLine = () => {
    if (dailyAwarded === true) {
      return (
        <div className="text-sm text-slate-700">
          今日の <span className="font-semibold text-orange-600">+50pt</span> は{" "}
          <span className="font-semibold">付与済み</span>です（明日4:00にリセット）
        </div>
      );
    }
    if (dailyAwarded === false) {
      return (
        <div className="text-sm text-slate-700">
          <span className="font-semibold">毎日最初の投稿</span>で{" "}
          <span className="font-semibold text-orange-600">+50pt</span>（1日1回）
        </div>
      );
    }
    return (
      <div className="text-sm text-slate-600">
        毎日最初の投稿で <span className="font-semibold text-orange-600">+50pt</span>（1日1回）
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-7 md:px-6 md:py-8">
        <div className="mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            New Post
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            いまの “おいしい” を、写真と一緒にふわっと残しておく場所。
          </p>
        </div>

        {(hasPosted !== null || dailyAwarded !== null) && (
          <div className="mb-4 rounded-2xl border border-orange-100 bg-white/90 p-4 shadow-sm">
            {hasPosted === false ? (
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                  🎁 初回投稿ボーナス
                </div>

                <div className="text-base font-bold text-slate-900">
                  初めての投稿で <span className="text-orange-600">+500pt</span> もらえます
                </div>

                {dailyLine()}
                <div>{resetNote}</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  {dailyAwarded === true ? "今日の投稿ボーナス" : "投稿ボーナス"}
                </div>
                {dailyLine()}
                <div>{resetNote}</div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-6">
          <form
            ref={formRef}
            onSubmit={submit}
            className="relative grid grid-cols-[1fr_28px] gap-x-3 gap-y-5"
          >
            <div className="pointer-events-none absolute right-0 top-0 h-full w-[28px]">
              <div
                className="absolute left-1/2 -translate-x-1/2 rounded-full bg-orange-500/90 transition-[height] duration-700 ease-out"
                style={{
                  top: `${railGeom.top}px`,
                  width: "2px",
                  height: railOn ? `${railGeom.height}px` : "0px",
                  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.08))",
                }}
              />
            </div>

            {/* 写真 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">写真</span>
                <span className="text-[11px] text-slate-400">Command+V で貼り付けもOK</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-orange-100 bg-orange-50/70 px-4 text-xs font-medium text-slate-800 transition hover:border-orange-300 hover:bg-orange-100">
                  <ImageIcon className="h-4 w-4" />
                  画像を追加
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </label>

                <div className="flex flex-col items-end gap-1">
                  <button
                    type="submit"
                    disabled={busy || processing}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-orange-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60"
                  >
                    {processing ? "画像処理中..." : busy ? "投稿中..." : "投稿する"}
                  </button>
                  <div className="text-[11px] text-slate-400">
                    ※ 環境によって投稿完了まで <span className="font-semibold">最大10秒</span>ほどかかる場合があります
                  </div>
                </div>
              </div>

              {imgs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    画像プレビュー{" "}
                    {processing && <span className="text-orange-500">（HEIC変換/圧縮中…）</span>}
                  </p>
                  <ul className="grid grid-cols-3 gap-2">
                    {imgs.map((img) => (
                      <li key={img.id} className="group relative overflow-hidden rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl}
                          alt={img.label}
                          className="aspect-square w-full object-cover transition group-hover:scale-[1.02]"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-80 shadow-sm transition hover:opacity-100"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <RailDot done={isPhotoComplete} label="写真" dotRef={dotPhotoRef} />

            {/* おすすめ度 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  おすすめ度{" "}
                  {recommendSelected ? (
                    <span className="text-orange-600">{recommendScore.toFixed(1)}</span>
                  ) : (
                    <span className="text-slate-400">未選択</span>
                  )}
                  <span className="text-slate-400">/10</span>
                </span>
                {!recommendSelected && (
                  <span className="text-[11px] text-slate-400">スライダーを動かして選択</span>
                )}
              </div>

              <div
                className={[
                  "rounded-2xl border px-4 py-3 transition",
                  recommendSelected ? "border-orange-100 bg-orange-50/40" : "border-slate-200 bg-white",
                ].join(" ")}
              >
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.1}
                  value={recommendScore}
                  onChange={(e) => {
                    setRecommendSelected(true);
                    setRecommendScore(Number(e.target.value));
                  }}
                  className={["w-full", recommendSelected ? "accent-orange-600" : "accent-slate-400"].join(" ")}
                  aria-label="おすすめ度"
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>0.0</span>
                  <span>10.0</span>
                </div>
              </div>
            </div>
            <RailDot done={isRecommendComplete} label="おすすめ度" dotRef={dotRecRef} />

            {/* 価格 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">価格</span>
              </div>

              <div className="inline-flex rounded-full border border-orange-100 bg-orange-50/60 p-1">
                {[
                  { v: "exact", label: "実額" },
                  { v: "range", label: "レンジ" },
                ].map((x) => {
                  const active = priceMode === (x.v as PriceMode);
                  return (
                    <button
                      key={x.v}
                      type="button"
                      onClick={() => setPriceMode(x.v as PriceMode)}
                      className={[
                        "h-8 rounded-full px-4 text-xs font-medium transition",
                        active ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-800",
                      ].join(" ")}
                    >
                      {x.label}
                    </button>
                  );
                })}
              </div>

              {priceMode === "exact" && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-full border border-orange-100 bg-white px-3 py-2">
                    <span className="text-xs text-slate-400">¥</span>
                    <input
                      inputMode="numeric"
                      value={priceYenText}
                      onChange={(e) => setPriceYenText(onlyDigits(e.target.value))}
                      placeholder="例: 3500"
                      className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <div className="min-w-[88px] text-right text-[11px] text-slate-500">
                    {priceYenValue ? `≈ ¥${formatYen(priceYenValue)}` : ""}
                  </div>
                </div>
              )}

              {priceMode === "range" && (
                <div className="rounded-2xl border border-orange-100 bg-white px-3 py-2">
                  <select
                    value={priceRange}
                    onChange={(e) => setPriceRange(e.target.value as any)}
                    className="w-full bg-transparent text-xs outline-none"
                  >
                    {PRICE_RANGES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {priceMode === "exact" && !isPriceComplete && (
                <p className="text-[11px] text-slate-400">実額の場合は入力が必要です。</p>
              )}
            </div>
            <RailDot done={isPriceComplete} label="価格" dotRef={dotPriceRef} />

            {/* 本文 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">本文</span>
                <span className="text-[11px] text-slate-400">Cmd/Ctrl + Enter で投稿</span>
              </div>

              <textarea
                className="h-24 w-full resize-none rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-0 md:h-32"
                placeholder="いま何食べてる？（ここに Command+V でも画像を貼り付けできます）"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                  }
                }}
              />
            </div>
            <RailDot done={isContentComplete} label="本文" dotRef={dotContentRef} />

            {/* ✅ 来店日：デフォ今日 / 未設定（代表日付でcreated_at使用）も可能 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">いつ行った？</span>
                <span className="text-[11px] text-slate-400">デフォ: 今日</span>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-orange-100 bg-white px-3 py-2">
                <input
                  type="date"
                  value={visitedOn}
                  onChange={(e) => setVisitedOn(e.target.value)}
                  className="w-full bg-transparent text-xs outline-none"
                  aria-label="来店日"
                />

                <button
                  type="button"
                  onClick={() => setVisitedOn(getJstTodayYmd(new Date()))}
                  className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-orange-100"
                >
                  今日
                </button>

                <button
                  type="button"
                  onClick={() => setVisitedOn("")}
                  className="shrink-0 rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  title="未設定にすると代表日付は投稿日（created_at）になります"
                >
                  未設定
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                ※ 未設定の場合、ヒートマップ等は投稿日（created_at）で扱います
              </p>
            </div>
            <div />

            {/* 店舗選択（任意） */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <MapPin className="h-3 w-3 text-orange-500" />
                  お店をつける
                </span>
                {isSearchingPlace && <span className="text-[11px] text-orange-500">検索中...</span>}
              </div>

              {selectedPlace && (
                <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50/70 px-3 py-2 text-xs text-slate-700">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{selectedPlace.name}</span>
                    <span className="truncate text-[11px] text-slate-500">
                      {selectedPlace.formatted_address}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPlace(null)}
                    className="ml-3 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[10px] text-slate-500 hover:bg-white"
                  >
                    <X className="h-3 w-3" />
                    クリア
                  </button>
                </div>
              )}

              <div className="relative">
                <div className="group flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50/50 px-3 py-2 text-xs text-slate-700 outline-none transition focus-within:border-orange-300 focus-within:bg-white focus-within:shadow-sm">
                  <MapPin className="h-4 w-4 text-orange-500" />
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    placeholder="店名やエリアで検索（例: 渋谷 カフェ）"
                    className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
                  />
                </div>

                {placeQuery.length >= 2 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2">
                    {placeResults.length > 0 ? (
                      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white/95 shadow-lg backdrop-blur">
                        <ul className="max-h-64 overflow-y-auto py-1">
                          {placeResults.map((p) => (
                            <li
                              key={p.place_id}
                              className="cursor-pointer px-3 py-2 text-xs transition hover:bg-orange-50"
                              onClick={() => {
                                setSelectedPlace(p);
                                setPlaceQuery("");
                                setPlaceResults([]);
                              }}
                            >
                              <div className="flex items-start gap-2">
                                <div className="mt-[2px]">
                                  <MapPin className="h-3 w-3 text-orange-500" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-slate-800">{p.name}</div>
                                  <div className="truncate text-[11px] text-slate-500">{p.formatted_address}</div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      !isSearchingPlace && (
                        <div className="rounded-2xl border border-orange-50 bg-white/95 px-3 py-2 text-[11px] text-slate-400 shadow-sm">
                          候補が見つかりませんでした。
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-slate-400">※ お店は任意です（後で編集したい人向け）</p>
            </div>
            <RailDot done={isPlaceComplete} label="お店" optional dotRef={dotPlaceRef} />

            {msg && <p className="col-span-2 text-xs text-red-600">{msg}</p>}
          </form>
        </div>
      </div>

      {award && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-orange-100 bg-white p-5 shadow-xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
              Points Get!
            </div>

            <div className="mt-2 text-lg font-bold text-slate-900">
              🎉 {award.points}pt 獲得しました！
            </div>

            <p className="mt-1 text-sm text-slate-600">
              {award.points >= 500 ? "初回投稿ボーナスです。" : "今日の投稿ボーナスです。"}
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-orange-100"
                onClick={() => {
                  setAward(null);
                  router.push("/points");
                }}
              >
                詳しく見る
              </button>

              <button
                type="button"
                className="flex-1 rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                onClick={() => {
                  setAward(null);
                  router.push("/timeline");
                  router.refresh();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
