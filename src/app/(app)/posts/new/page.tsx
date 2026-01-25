"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Image as ImageIcon, MapPin, X, Check, Loader2 } from "lucide-react";
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

  // ✅ ここから新レンジ（閾値ベース）
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

function ProgressPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold",
        ok ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500",
      ].join(" ")}
    >
      {ok ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />
      )}
      <span>{label}</span>
    </div>
  );
}

function Section({
  title,
  subtitle,
  required,
  children,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  required?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {required && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                必須
              </span>
            )}
          </div>
          {subtitle && <div className="mt-0.5 text-[12px] text-slate-500">{subtitle}</div>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>

      {/* ガチ全幅：カードも端まで使う */}
      <div className="border-t border-orange-100 bg-white p-3">
        {children}
      </div>
    </section>
  );
}

export default function NewPostPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);

  // 投稿済み判定（自分の投稿が1件でもあるか）
  const [hasPosted, setHasPosted] = useState<boolean | null>(null);

  // 今日の +50（daily_post）が付与済みか（4:00 JST基準）
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

  // ✅ おすすめ度（0.1刻み）…未選択を作るため、選択フラグを別で持つ
  const [recommendSelected, setRecommendSelected] = useState(false);
  const [recommendScore, setRecommendScore] = useState<number>(7.0);

  // 価格（実額 or レンジ）
  const [priceMode, setPriceMode] = useState<PriceMode>("exact");
  const [priceYenText, setPriceYenText] = useState<string>("");
  const [priceRange, setPriceRange] = useState<(typeof PRICE_RANGES)[number]["value"]>("3000-3999");

  // ✅ 来店日（任意） visited_on
  const [visitedOn, setVisitedOn] = useState<string>(""); // "YYYY-MM-DD" or ""

  // 付与演出モーダル
  const [award, setAward] = useState<{ points: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const isRecommendComplete = recommendSelected;

  // ✅ 必須は4つ（写真/おすすめ度/価格/本文）
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
        // ① 投稿済みか
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

        // ② 今日のdaily_post(+50)が付与済みか
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
      const imageFiles = files.filter((f) => (f.type || "").startsWith("image/"));
      const limited = imageFiles.slice(0, Math.max(0, MAX - imgs.length));
      if (limited.length === 0) return;

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

  const onDropZone = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) await addImages(files);
  };

  // ✅ places に最低限データを upsert
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

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!uid) return setMsg("ログインしてください。");
    if (processing) return setMsg("画像を処理中です。少し待ってください。");

    if (!imgs.length) return setMsg("写真を追加してください。");
    if (!recommendSelected) return setMsg("おすすめ度を選んでください。");
    if (!isPriceComplete) return setMsg(priceMode === "exact" ? "価格（実額）を入力してください。" : "価格を選んでください。");
    if (!content.trim()) return setMsg("本文を入力してください。");

    const price_yen = priceMode === "exact" ? priceYenValue : null;
    const price_range = priceMode === "range" ? priceRange : null;

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

      const visited_on = visitedOn ? visitedOn : null;

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: uid,
        content,
        image_variants: variants,
        image_urls: compatFullUrls,

        place_id: selectedPlace?.place_id ?? null,
        place_name: normalizedPlaceName ?? selectedPlace?.name ?? null,
        place_address: normalizedPlaceAddress ?? selectedPlace?.formatted_address ?? null,

        // 0.0〜10.0 / 0.1刻み
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

  const progressRow = (
    <div className="flex flex-wrap gap-2">
      <ProgressPill ok={isPhotoComplete} label="写真" />
      <ProgressPill ok={isRecommendComplete} label="おすすめ度" />
      <ProgressPill ok={isPriceComplete} label="価格" />
      <ProgressPill ok={isContentComplete} label="本文" />
    </div>
  );

  const priceModeSwitch = (
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
              "h-8 rounded-full px-4 text-xs font-semibold transition",
              active ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-800",
            ].join(" ")}
          >
            {x.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      {/* ガチ全幅：左右余白ゼロ。下のCTAぶんだけ余白 */}
      <div className="w-full pb-32 pt-6">
        <header className="border-b border-orange-100 bg-white/70 p-3 backdrop-blur">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            New Post
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            いまの “おいしい” を、写真と一緒にふわっと残す。
          </p>
          <div className="mt-3">{progressRow}</div>
        </header>

        {/* ポイント案内（現状維持・薄く） */}
        {(hasPosted !== null || dailyAwarded !== null) && (
          <div className="border-b border-orange-100 bg-white/90 p-3">
            {hasPosted === false ? (
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                  🎁 初回投稿ボーナス
                </div>
                <div className="text-base font-bold text-slate-900">
                  初めての投稿で <span className="text-orange-600">+500pt</span>
                </div>
                <div className="text-sm text-slate-700">
                  {dailyAwarded === true ? "今日の +50pt は付与済み" : "毎日最初の投稿で +50pt"}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">
                  {dailyAwarded === true ? "今日の投稿ボーナス" : "投稿ボーナス"}
                </div>
                <div className="text-sm text-slate-700">
                  {dailyAwarded === true ? "今日の +50pt は付与済み" : "毎日最初の投稿で +50pt"}
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} className="bg-white">
          {/* 写真 */}
          <div className="p-3">
            <Section
              title="写真"
              required
              subtitle={<span className="hidden sm:inline">ドラッグ＆ドロップ / Command+V で貼り付けもOK</span>}
              right={
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-orange-100"
                >
                  <ImageIcon className="h-4 w-4" />
                  追加
                </button>
              }
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={onDropZone}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                className={[
                  "cursor-pointer rounded-2xl border-2 border-dashed p-4 transition",
                  imgs.length
                    ? "border-orange-100 bg-orange-50/40 hover:bg-orange-50/60"
                    : "border-orange-200 bg-orange-50/60 hover:bg-orange-50",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-sm">
                    {processing ? (
                      <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-orange-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {imgs.length ? "写真を追加する" : "ここに写真を追加"}
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-500">
                      {processing ? "HEIC変換 / 圧縮中…" : "タップして選択、またはドラッグ＆ドロップ"}
                    </div>
                  </div>
                </div>
              </div>

              {imgs.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-semibold text-slate-700">
                      プレビュー（{imgs.length}/9）
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        imgs.forEach((x) => URL.revokeObjectURL(x.previewUrl));
                        setImgs([]);
                      }}
                      className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                    >
                      全て削除
                    </button>
                  </div>

                  {/* ガチ全幅：左右に余白なし */}
                  <div className="mt-2 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                    {imgs.map((img) => (
                      <div key={img.id} className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.previewUrl}
                          alt={img.label}
                          className="h-24 w-24 rounded-2xl object-cover shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white shadow-sm hover:bg-black/70"
                          aria-label="remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          </div>

          {/* おすすめ度 */}
          <div className="p-3">
            <Section
              title="おすすめ度"
              required
              subtitle={
                recommendSelected ? (
                  <span>
                    <span className="font-semibold text-orange-600">{recommendScore.toFixed(1)}</span>
                    <span className="text-slate-400"> / 10.0</span>
                  </span>
                ) : (
                  <span className="text-slate-400">未選択</span>
                )
              }
              right={
                recommendSelected ? (
                  <button
                    type="button"
                    onClick={() => setRecommendSelected(false)}
                    className="rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    クリア
                  </button>
                ) : null
              }
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3">
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

                  <div className="w-[92px]">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.1}
                      inputMode="decimal"
                      value={recommendSelected ? recommendScore.toFixed(1) : ""}
                      placeholder="0.0"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setRecommendSelected(false);
                          return;
                        }
                        const n = Number(v);
                        if (!Number.isFinite(n)) return;
                        const clamped = Math.min(10, Math.max(0, n));
                        const rounded = Math.round(clamped * 10) / 10;
                        setRecommendSelected(true);
                        setRecommendScore(rounded);
                      }}
                      className="w-full rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-orange-300"
                      aria-label="おすすめ度（数値入力）"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>0.0</span>
                  <span>10.0</span>
                </div>
              </div>
            </Section>
          </div>

          {/* 価格 */}
          <div className="p-3">
            <Section title="価格" required right={priceModeSwitch}>
              <div className="space-y-3">
                {priceMode === "exact" && (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center gap-2 rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2">
                      <span className="text-xs font-semibold text-slate-500">¥</span>
                      <input
                        inputMode="numeric"
                        value={priceYenText}
                        onChange={(e) => setPriceYenText(onlyDigits(e.target.value))}
                        placeholder="例: 3500"
                        className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                        aria-label="価格（実額）"
                      />
                    </div>
                    <div className="min-w-[90px] text-right text-[12px] text-slate-500">
                      {priceYenValue ? `¥${formatYen(priceYenValue)}` : ""}
                    </div>
                  </div>
                )}

                {priceMode === "range" && (
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2">
                    <select
                      value={priceRange}
                      onChange={(e) => setPriceRange(e.target.value as any)}
                      className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                      aria-label="価格（レンジ）"
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
                  <div className="text-[12px] text-slate-500">実額を入力してください。</div>
                )}
              </div>
            </Section>
          </div>

          {/* 本文 */}
          <div className="p-3">
            <Section title="本文" required subtitle={<span className="hidden sm:inline">Cmd/Ctrl + Enter で投稿</span>}>
              <textarea
                className="h-28 w-full resize-none rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-300 focus:bg-white md:h-36"
                placeholder="いま何食べてる？"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                aria-label="本文"
              />
            </Section>
          </div>

          {/* 来店日（任意） */}
          <div className="p-3">
            <Section title="いつ行った？" subtitle={<span className="text-slate-400">任意</span>}>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={visitedOn}
                  onChange={(e) => setVisitedOn(e.target.value)}
                  className="w-full rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-orange-300 focus:bg-white"
                  aria-label="来店日"
                />
                {visitedOn && (
                  <button
                    type="button"
                    onClick={() => setVisitedOn("")}
                    className="shrink-0 rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    クリア
                  </button>
                )}
              </div>
            </Section>
          </div>

          {/* 店舗（任意） */}
          <div className="p-3">
            <Section
              title="お店をつける"
              subtitle={<span className="text-slate-400">任意</span>}
              right={
                isSearchingPlace ? (
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-orange-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    検索中
                  </div>
                ) : null
              }
            >
              <div className="space-y-3">
                {selectedPlace && (
                  <div className="flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50/60 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{selectedPlace.name}</div>
                      <div className="truncate text-[12px] text-slate-500">{selectedPlace.formatted_address}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPlace(null)}
                      className="ml-3 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[12px] font-semibold text-slate-600 hover:bg-white"
                      aria-label="clear place"
                    >
                      <X className="h-4 w-4" />
                      クリア
                    </button>
                  </div>
                )}

                <div className="relative">
                  <div className="flex items-center gap-2 rounded-2xl border border-orange-100 bg-orange-50/40 px-3 py-2 focus-within:border-orange-300 focus-within:bg-white">
                    <MapPin className="h-4 w-4 text-orange-600" />
                    <input
                      type="text"
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      placeholder="店名やエリアで検索（例: 渋谷 カフェ）"
                      className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                      aria-label="店舗検索"
                    />
                  </div>

                  {placeQuery.length >= 2 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2">
                      {placeResults.length > 0 ? (
                        <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-lg">
                          <ul className="max-h-64 overflow-y-auto py-1">
                            {placeResults.map((p) => (
                              <li
                                key={p.place_id}
                                className="cursor-pointer px-3 py-2 transition hover:bg-orange-50"
                                onClick={() => {
                                  setSelectedPlace(p);
                                  setPlaceQuery("");
                                  setPlaceResults([]);
                                }}
                              >
                                <div className="flex items-start gap-2">
                                  <MapPin className="mt-1 h-4 w-4 text-orange-600" />
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                                    <div className="truncate text-[12px] text-slate-500">{p.formatted_address}</div>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        !isSearchingPlace && (
                          <div className="rounded-2xl border border-orange-100 bg-white px-3 py-2 text-[12px] text-slate-500 shadow-sm">
                            候補が見つかりませんでした。
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          </div>

          {msg && <div className="px-3 pb-3 text-sm font-semibold text-red-600">{msg}</div>}
        </form>
      </div>

      {/* ✅ 画面下 fixed CTA：ガチ全幅（左右余白ゼロ） */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        <div
          className="border-t border-orange-100 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-slate-700">
                {isAllRequiredComplete ? "準備OK" : "必須項目を埋める"}
              </div>
              <div className="mt-1">{progressRow}</div>
            </div>

            <button
              type="button"
              onClick={() => submit()}
              disabled={busy || processing || !isAllRequiredComplete}
              className={[
                "inline-flex h-11 shrink-0 items-center justify-center rounded-full px-6 text-sm font-bold shadow-sm transition",
                busy || processing || !isAllRequiredComplete
                  ? "bg-orange-200 text-white opacity-80"
                  : "bg-orange-600 text-white hover:bg-orange-700",
              ].join(" ")}
            >
              {processing ? "画像処理中…" : busy ? "投稿中…" : "投稿する"}
            </button>
          </div>
        </div>
      </div>

      {/* 付与演出モーダル（現状維持） */}
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
