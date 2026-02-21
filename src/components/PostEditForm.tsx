"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  Image as ImageIcon,
  MapPin,
  X,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";

import confetti from "canvas-confetti";

import {
  POST_TAGS,
  TAG_CATEGORIES,
  type TagCategory,
  findTagById,
  matchesTagQuery,
} from "@/lib/postTags";

// =====================
// types
// =====================
export type EditInitialPost = {
  id: string;
  user_id: string;
  created_at: string;
  visited_on: string | null;

  content: string;

  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;

  place_id: string | null;
  place_name: string | null;
  place_address: string | null;

  image_variants: any[] | null;
  image_urls: string[] | null;

  // ✅ editでも tags / time_of_day を持てるように（無くても動く）
  tag_ids?: string[] | null;
  time_of_day?: DbTimeOfDay | null;
};

type PlaceResult = {
  place_id: string;
  name: string;
  formatted_address: string;
};

type PreparedImage = {
  id: string;
  pin: File;
  square: File;
  full: File;
  previewUrl: string;
  label: string;
  origW: number;
  origH: number;
  exifDate?: Date | null; // UIには出さない
};

// 既存画像（DBにすでにあるURL）
type ExistingImage = {
  id: string;
  pin?: string | null;
  square?: string | null;
  full: string; // 表示と保存の中心
  preview: string; // UI用（square優先）
};

type TimeOfDay = "day" | "night" | null;
type DbTimeOfDay = "day" | "night" | "unknown";

// =====================
// utils: date/time
// =====================
function guessTimeOfDayFromDate(dt: Date): Exclude<TimeOfDay, null> {
  const h = dt.getHours();
  return h >= 6 && h <= 17 ? "day" : "night";
}
function toYmd(dt: Date): string {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function jstTodayKey() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

// =====================
// utils: heic + image prep (from posts/new)
// =====================
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
  const blob: Blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.86 });
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
function pickOutputFormat() {
  const avif = typeof window !== "undefined" && canUseAvif();
  const webp = typeof window !== "undefined" && canUseWebp();
  if (avif) return { mime: "image/avif", ext: "avif" as const };
  if (webp) return { mime: "image/webp", ext: "webp" as const };
  return { mime: "image/jpeg", ext: "jpg" as const };
}

/** 高品質段階縮小（半分ずつ） */
function scaleCanvasHighQuality(src: HTMLCanvasElement, tw: number, th: number) {
  let cur = src;
  let curW = src.width;
  let curH = src.height;

  while (curW / 2 > tw && curH / 2 > th) {
    const next = document.createElement("canvas");
    const nextW = Math.max(tw, Math.floor(curW / 2));
    const nextH = Math.max(th, Math.floor(curH / 2));
    next.width = nextW;
    next.height = nextH;

    const ctx = next.getContext("2d");
    if (!ctx) throw new Error("Canvas ctx error");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, curW, curH, 0, 0, nextW, nextH);

    cur = next;
    curW = nextW;
    curH = nextH;
  }

  if (curW !== tw || curH !== th) {
    const out = document.createElement("canvas");
    out.width = tw;
    out.height = th;
    const octx = out.getContext("2d");
    if (!octx) throw new Error("Canvas ctx error");
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(cur, 0, 0, curW, curH, 0, 0, tw, th);
    return out;
  }
  return cur;
}

async function canvasToFile(
  canvas: HTMLCanvasElement,
  nameBase: string,
  opts: { mime: string; quality: number; ext: string }
): Promise<File> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), opts.mime, opts.quality);
  });
  return new File([blob], `${nameBase}.${opts.ext}`, { type: opts.mime });
}

/** 中心クロップで正方形キャンバスを作る */
function cropCenterSquare(bitmap: ImageBitmap) {
  const w = bitmap.width;
  const h = bitmap.height;
  const s = Math.min(w, h);
  const sx = Math.floor((w - s) / 2);
  const sy = Math.floor((h - s) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas ctx error");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, s, s, 0, 0, s, s);

  return canvas;
}

/** 長辺指定で（アスペクト維持で）縮小キャンバスを作る */
function resizeKeepAspect(bitmap: ImageBitmap, maxLongEdge: number) {
  const w = bitmap.width;
  const h = bitmap.height;
  const long = Math.max(w, h);
  const scale = Math.min(1, maxLongEdge / long);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const base = document.createElement("canvas");
  base.width = w;
  base.height = h;
  {
    const ctx = base.getContext("2d");
    if (!ctx) throw new Error("Canvas ctx error");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
  }
  return scaleCanvasHighQuality(base, tw, th);
}

/** EXIFから撮影日時を取る（来店日の自動入力にのみ使う） */
async function parseExifDate(file: File): Promise<Date | null> {
  try {
    const mod: any = await import("exifr");
    const exifr = mod.default ?? mod;

    const tags = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] });
    const dtRaw = tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.ModifyDate;

    const dt =
      dtRaw instanceof Date
        ? dtRaw
        : typeof dtRaw === "string" || typeof dtRaw === "number"
          ? new Date(dtRaw)
          : null;

    if (!dt || !Number.isFinite(dt.getTime())) return null;
    return dt;
  } catch {
    return null;
  }
}

/**
 * 画像を用意：
 * - square: 正方形（中心クロップ）→ 1080px
 * - pin   : square をさらに 160px
 * - full  : 元アスペクト維持で長辺 3072px
 */
async function prepareImage(file: File): Promise<PreparedImage> {
  const normalized = isHeicLike(file) ? await convertHeicToJpeg(file) : file;
  const fmt = pickOutputFormat();

  const bitmap = await createImageBitmap(normalized, { imageOrientation: "from-image" } as any);
  const origW = bitmap.width;
  const origH = bitmap.height;

  const baseName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const squareBase = cropCenterSquare(bitmap);

  const [squareCanvas, pinCanvas, fullCanvas] = await Promise.all([
    Promise.resolve(scaleCanvasHighQuality(squareBase, 1080, 1080)),
    Promise.resolve(scaleCanvasHighQuality(squareBase, 160, 160)),
    Promise.resolve(resizeKeepAspect(bitmap, 3072)),
  ]);

  const [squareFile, pinFile, fullFile] = await Promise.all([
    canvasToFile(squareCanvas, `${baseName}_square`, {
      mime: fmt.mime,
      quality: fmt.ext === "avif" ? 0.65 : fmt.ext === "webp" ? 0.88 : 0.92,
      ext: fmt.ext,
    }),
    canvasToFile(pinCanvas, `${baseName}_pin`, {
      mime: fmt.mime,
      quality: fmt.ext === "avif" ? 0.55 : fmt.ext === "webp" ? 0.8 : 0.86,
      ext: fmt.ext,
    }),
    canvasToFile(fullCanvas, `${baseName}_full`, {
      mime: fmt.mime,
      quality: fmt.ext === "avif" ? 0.7 : fmt.ext === "webp" ? 0.9 : 0.94,
      ext: fmt.ext,
    }),
  ]);

  const previewUrl = URL.createObjectURL(squareFile);
  const exifDate = await parseExifDate(file);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    square: squareFile,
    pin: pinFile,
    full: fullFile,
    previewUrl,
    label: file.name,
    origW,
    origH,
    exifDate,
  };
}

/** 同時実行数を制限する簡易プール */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let i = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

// =====================
// price helpers (posts/new)
// =====================
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

function ProgressPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold",
        ok ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500",
      ].join(" ")}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}
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
      <div className="flex items-end justify-between gap-3 px-3">
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

      <div className="border-t border-orange-100 bg-white p-3">{children}</div>
    </section>
  );
}

// =====================
// initial images (from DB) -> ExistingImage[]
// =====================
function buildExistingImages(initial: EditInitialPost): ExistingImage[] {
  const variants = Array.isArray(initial.image_variants) ? initial.image_variants : [];
  const fromVariants: ExistingImage[] = variants
    .map((v: any, idx: number) => {
      const square = typeof v?.thumb === "string" ? v.thumb : null;
      const full = typeof v?.full === "string" ? v.full : null;
      if (!full && !square) return null;
      const preview = square ?? full ?? "";
      const f = full ?? square ?? "";
      return {
        id: `existing-${idx}-${f}`,
        pin: null,
        square,
        full: f,
        preview,
      };
    })
    .filter(Boolean) as ExistingImage[];

  if (fromVariants.length > 0) return fromVariants;

  const urls = Array.isArray(initial.image_urls) ? initial.image_urls : [];
  const fromUrls: ExistingImage[] = urls
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((u, idx) => ({
      id: `existing-url-${idx}-${u}`,
      full: u,
      preview: u,
      square: null,
      pin: null,
    }));
  return fromUrls;
}

// =====================
// main
// =====================
export default function PostEditForm({ initial }: { initial: EditInitialPost }) {
  const supabase = createClientComponentClient();
  const router = useRouter();

  // ---- auth uid
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  // ---- core
  const [content, setContent] = useState(initial.content ?? "");
  const [visitedOn, setVisitedOn] = useState<string>(initial.visited_on ?? "");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(() => {
    const t = initial.time_of_day ?? null;
    return t === "day" ? "day" : t === "night" ? "night" : null;
  });
  const [timeOfDayTouched, setTimeOfDayTouched] = useState(false);

  // recommend (same UX as new)
  const [recommendSelected, setRecommendSelected] = useState<boolean>(() => initial.recommend_score != null);
  const [recommendScore, setRecommendScore] = useState<number>(() => {
    const v = typeof initial.recommend_score === "number" ? initial.recommend_score : 7.0;
    const clamped = Math.min(10, Math.max(0, v));
    return Math.round(clamped * 10) / 10;
  });

  // tags (optional)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(Array.isArray(initial.tag_ids) ? initial.tag_ids : []);
  const [tagCategory, setTagCategory] = useState<TagCategory>("all");
  const [tagQuery, setTagQuery] = useState("");
  const [showDetails, setShowDetails] = useState(true);

  // place
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(() => {
    if (initial.place_id && initial.place_name) {
      return { place_id: initial.place_id, name: initial.place_name, formatted_address: initial.place_address ?? "" };
    }
    return null;
  });
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);

  // price
  const [priceMode, setPriceMode] = useState<PriceMode>(() => {
    if (typeof initial.price_yen === "number" && initial.price_yen > 0) return "exact";
    if (initial.price_range) return "range";
    return "exact";
  });
  const [priceYenText, setPriceYenText] = useState<string>(() => {
    if (typeof initial.price_yen === "number" && initial.price_yen > 0) return String(initial.price_yen);
    return "";
  });
  const [priceRange, setPriceRange] = useState<(typeof PRICE_RANGES)[number]["value"]>(() => {
    const v = initial.price_range as any;
    const hit = PRICE_RANGES.find((x) => x.value === v);
    return (hit?.value ?? "3000-3999") as any;
  });

  // images
  const [existingImgs, setExistingImgs] = useState<ExistingImage[]>(() => buildExistingImages(initial));
  const [newImgs, setNewImgs] = useState<PreparedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // ---- place search debounce
  useEffect(() => {
    if (placeQuery.trim().length < 2) {
      setPlaceResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setIsSearchingPlace(true);
        const res = await fetch(`/api/places?q=${encodeURIComponent(placeQuery.trim())}`);
        const data = await res.json().catch(() => ({}));
        const normalized: PlaceResult[] = Array.isArray(data?.results)
          ? data.results
              .map((r: any) => ({
                place_id: r?.place_id ?? "",
                name: r?.name ?? "",
                formatted_address: r?.formatted_address ?? r?.vicinity ?? r?.formattedAddress ?? "",
              }))
              .filter((r: PlaceResult) => r.place_id && r.name)
              .slice(0, 6)
          : [];
        setPlaceResults(normalized);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingPlace(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [placeQuery]);

  // ---- objectURL cleanup
  const newImgsRef = useRef<PreparedImage[]>([]);
  useEffect(() => {
    newImgsRef.current = newImgs;
  }, [newImgs]);
  useEffect(() => {
    return () => {
      newImgsRef.current.forEach((x) => URL.revokeObjectURL(x.previewUrl));
    };
  }, []);

  // ---- paste images (Command+V)
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const files: File[] = [];
      for (const it of items) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        await addImages(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newImgs, existingImgs, visitedOn, timeOfDay, timeOfDayTouched]);

  // ---- tags helpers
  const selectedTagIdSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);
  const visibleTags = useMemo(() => {
    const q = tagQuery.trim();
    if (q) return POST_TAGS.filter((t) => matchesTagQuery(t, q));
    return POST_TAGS.filter((t) => (tagCategory === "all" ? true : t.category === tagCategory));
  }, [tagCategory, tagQuery]);

  function toggleTag(id: string) {
    const tag = findTagById(id);
    if (!tag) return;

    setSelectedTagIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);

      const group = tag.exclusiveGroup;
      if (!group) return [...prev, id];

      const removed = prev.filter((tid) => {
        const t = findTagById(tid);
        return t?.exclusiveGroup !== group;
      });
      return [...removed, id];
    });
  }
  function removeTag(id: string) {
    setSelectedTagIds((prev) => prev.filter((x) => x !== id));
  }

  // ---- images: add / remove
  const MAX = 9;

  const addImages = async (files: File[]) => {
    const currentCount = existingImgs.length + newImgs.length;
    if (currentCount >= MAX) return;

    setProcessing(true);
    setMsg(null);

    try {
      const imageFiles = files.filter((f) => (f.type || "").startsWith("image/") || isHeicLike(f));
      const limited = imageFiles.slice(0, Math.max(0, MAX - currentCount));
      if (limited.length === 0) return;

      const prepared = await mapWithConcurrency(limited, 2, async (f) => prepareImage(f));
      setNewImgs((prev) => [...prev, ...prepared]);

      // 1枚目追加タイミングで visitedOn/timeOfDay を静かに補完（未入力の場合のみ）
      if (!visitedOn && prepared.length > 0) {
        const dt = prepared[0]?.exifDate ?? null;
        if (dt) setVisitedOn(toYmd(dt));
        if (dt && timeOfDay === null && !timeOfDayTouched) setTimeOfDay(guessTimeOfDayFromDate(dt));
      }
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

  const removeExistingImage = (id: string) => {
    setExistingImgs((prev) => prev.filter((x) => x.id !== id));
  };

  const removeNewImage = (id: string) => {
    setNewImgs((prev) => {
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

  // ---- derived
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

  const imgCount = existingImgs.length + newImgs.length;
  const isPhotoComplete = imgCount > 0;
  const isPlaceComplete = !!selectedPlace?.place_id;
  const isContentComplete = content.trim().length > 0;
  const isRecommendComplete = recommendSelected;

  const isAllRequiredComplete = isPhotoComplete && isPlaceComplete && isPriceComplete && isContentComplete && isRecommendComplete;

  const progressRow = (
    <div className="flex flex-wrap gap-2">
      <ProgressPill ok={isPhotoComplete} label="写真" />
      <ProgressPill ok={isPlaceComplete} label="お店" />
      <ProgressPill ok={isPriceComplete} label="価格" />
      <ProgressPill ok={isContentComplete} label="本文" />
      <ProgressPill ok={isRecommendComplete} label="おすすめ度" />
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

  // ---- ensure places lat/lng
  const ensurePlaceWithLatLng = async (): Promise<string> => {
    if (!selectedPlace?.place_id) throw new Error("お店を選んでください。");

    const res = await fetch("/api/places/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: selectedPlace.place_id }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "places の ensure に失敗しました");
    }

    return selectedPlace.place_id;
  };

  // =====================
  // submit (edit)
  // =====================
  const submit = async () => {
    setAttempted(true);

    if (!uid) return setMsg("ログインしてください。");
    if (processing) return setMsg("画像を処理中です。少し待ってください。");
    if (imgCount === 0) return setMsg("写真を追加してください。");
    if (!selectedPlace?.place_id) return setMsg("お店を選んでください。");
    if (!isPriceComplete)
      return setMsg(priceMode === "exact" ? "価格（実額）を入力してください。" : "価格を選んでください。");
    if (!content.trim()) return setMsg("本文を入力してください。");
    if (!recommendSelected) return setMsg("おすすめ度を選んでください。");

    setBusy(true);
    setMsg(null);

    try {
      const ensuredPlaceId = await ensurePlaceWithLatLng();

      // 1) 新規画像を storage にアップロード（posts/new と同じ）
      const uploadedNew = await (async () => {
        if (newImgs.length === 0) return [];
        const CACHE = "31536000"; // 1年
        const bucket = supabase.storage.from("post-images");

        return await mapWithConcurrency(newImgs, 2, async (img) => {
          const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

          const pinExt = img.pin.name.split(".").pop() || "jpg";
          const squareExt = img.square.name.split(".").pop() || "jpg";
          const fullExt = img.full.name.split(".").pop() || "jpg";

          const pinPath = `${uid}/${base}_pin.${pinExt}`;
          const squarePath = `${uid}/${base}_square.${squareExt}`;
          const fullPath = `${uid}/${base}_full.${fullExt}`;

          const [upPin, upSquare, upFull] = await Promise.all([
            bucket.upload(pinPath, img.pin, { cacheControl: CACHE, upsert: false, contentType: img.pin.type }),
            bucket.upload(squarePath, img.square, { cacheControl: CACHE, upsert: false, contentType: img.square.type }),
            bucket.upload(fullPath, img.full, { cacheControl: CACHE, upsert: false, contentType: img.full.type }),
          ]);

          if (upPin.error) throw upPin.error;
          if (upSquare.error) throw upSquare.error;
          if (upFull.error) throw upFull.error;

          const { data: pubPin } = bucket.getPublicUrl(pinPath);
          const { data: pubSquare } = bucket.getPublicUrl(squarePath);
          const { data: pubFull } = bucket.getPublicUrl(fullPath);

          return {
            pin: pubPin.publicUrl,
            square: pubSquare.publicUrl,
            full: pubFull.publicUrl,
            orig_w: img.origW,
            orig_h: img.origH,
          };
        });
      })();

      // 2) 既存保持分 + 新規分を結合して posts/new と同じカラムを生成
      const existingAsAssets = existingImgs.map((x) => ({
        pin: x.pin ?? null,
        square: x.square ?? null,
        full: x.full,
        // origは不明でもOK（型が許すなら null / undefined で）
      }));

      const image_assets = [...existingAsAssets, ...uploadedNew];
      const image_variants = image_assets.map((x: any) => ({
        thumb: x.square ?? x.full,
        full: x.full,
      }));
      const image_urls = image_assets.map((x: any) => x.full);

      const cover_pin_url = image_assets[0]?.pin ?? null;
      const cover_square_url = image_assets[0]?.square ?? (image_assets[0]?.full ?? null);
      const cover_full_url = image_assets[0]?.full ?? null;

      const price_yen = priceMode === "exact" ? priceYenValue : null;
      const price_range = priceMode === "range" ? priceRange : null;

      const visited_on = visitedOn ? visitedOn : null;
      const time_of_day: DbTimeOfDay = (timeOfDay ?? "unknown") as DbTimeOfDay;

      // 3) edit/update にまとめて送る（posts/new 互換）
      const payload: Record<string, any> = {
        content,

        image_assets,
        cover_pin_url,
        cover_square_url,
        cover_full_url,

        image_variants,
        image_urls,

        place_id: ensuredPlaceId,
        place_name: selectedPlace?.name ?? null,
        place_address: selectedPlace?.formatted_address ?? null,

        recommend_score: Number(recommendScore.toFixed(1)),
        price_yen,
        price_range,

        visited_on,
        time_of_day,

        tag_ids: selectedTagIds,
      };

      const res = await fetch(`/posts/${initial.id}/edit/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Update failed (${res.status})`);
      }

      confetti({ particleCount: 40, spread: 70, origin: { y: 0.75 } });
      router.push(`/posts/${initial.id}`);
      router.refresh();
    } catch (err: any) {
      setMsg(err?.message ?? "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  // =====================
  // UI
  // =====================
  return (
    <div className="bg-white">
      {/* header (posts/new風) */}
      <header className="border-b border-orange-100 bg-white/70 p-3 backdrop-blur">
        <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Edit Post</h1>
        <p className="mt-1 text-sm text-slate-600">投稿を編集する（写真 / 店 / 価格 / 本文 / おすすめ度）</p>
        <div className="mt-3">{progressRow}</div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="bg-white pb-32"
      >
        {/* 写真 */}
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
            accept="image/*,.heic,.heif"
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
              imgCount
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
                <div className="text-sm font-semibold text-slate-900">{imgCount ? "写真を追加する" : "ここに写真を追加"}</div>
                <div className="mt-0.5 text-[12px] text-slate-500">{processing ? "変換 / 生成中…" : "タップして選択"}</div>
              </div>
            </div>
          </div>

          {imgCount > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-slate-700">プレビュー（{imgCount}/{MAX}）</div>
                <button
                  type="button"
                  onClick={() => {
                    // 既存は消すだけ（URLはそのまま）
                    setExistingImgs([]);
                    // 新規は objectURL 解放して消す
                    newImgs.forEach((x) => URL.revokeObjectURL(x.previewUrl));
                    setNewImgs([]);
                  }}
                  className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  全て削除
                </button>
              </div>

              <div className="mt-2 -mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                {existingImgs.map((img) => (
                  <div key={img.id} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.preview} alt="existing" className="h-24 w-24 rounded-2xl object-cover shadow-sm" />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(img.id)}
                      className="absolute right-1 bottom-1 rounded-full bg-black/60 p-1 text-white shadow-sm hover:bg-black/70"
                      aria-label="remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {newImgs.map((img) => (
                  <div key={img.id} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt={img.label} className="h-24 w-24 rounded-2xl object-cover shadow-sm" />
                    <button
                      type="button"
                      onClick={() => removeNewImage(img.id)}
                      className="absolute right-1 bottom-1 rounded-full bg-black/60 p-1 text-white shadow-sm hover:bg-black/70"
                      aria-label="remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                ※「差し替え」は、消してから追加すればOK（UI的に同じ操作）
              </div>
            </div>
          )}
        </Section>

        {/* 来店日 */}
        <Section title="来店日" subtitle={<span className="text-slate-500">任意</span>}>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-[12px] font-semibold text-slate-700">いつ行った？</div>

              {visitedOn ? (
                <button
                  type="button"
                  onClick={() => setVisitedOn("")}
                  className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  クリア
                </button>
              ) : (
                <div className="shrink-0 text-[11px] text-slate-400">任意</div>
              )}
            </div>

            <div className="mt-2">
              <input
                type="date"
                name="visited_on"
                value={visitedOn}
                onChange={(e) => setVisitedOn(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="block w-full rounded-2xl border border-orange-100 bg-white px-4 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-orange-300"
                style={{ WebkitAppearance: "none" }}
                aria-label="来店日"
              />
            </div>
          </div>
        </Section>

        {/* 昼 / 夜（任意） */}
        <Section title="">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-orange-100 bg-orange-50/60 p-1">
              {[
                { v: "day" as const, label: "昼" },
                { v: "night" as const, label: "夜" },
              ].map((x) => {
                const active = timeOfDay === x.v;
                return (
                  <button
                    key={x.v}
                    type="button"
                    onClick={() => {
                      setTimeOfDayTouched(true);
                      setTimeOfDay(x.v);
                    }}
                    className={[
                      "h-9 rounded-full px-5 text-sm font-semibold transition",
                      active ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-800",
                    ].join(" ")}
                    aria-pressed={active}
                  >
                    {x.label}
                  </button>
                );
              })}
            </div>

            {timeOfDay !== null ? (
              <button
                type="button"
                onClick={() => {
                  setTimeOfDayTouched(true);
                  setTimeOfDay(null);
                }}
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200"
              >
                未選択に戻す
              </button>
            ) : (
              <div className="text-[12px] font-semibold text-slate-400">未選択</div>
            )}
          </div>
        </Section>

        {/* お店（必須） */}
        <Section
          title="お店"
          required
          subtitle={
            selectedPlace ? (
              <span className="text-slate-500">選択済み（変更するならクリア→再検索）</span>
            ) : (
              <span className="text-slate-500">店名やエリアで検索して、候補から選択</span>
            )
          }
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
                  onClick={() => {
                    setSelectedPlace(null);
                    setPlaceQuery("");
                    setPlaceResults([]);
                  }}
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
                  placeholder="例: 渋谷 カフェ / 焼肉"
                  className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                  aria-label="店舗検索"
                />
              </div>

              {placeQuery.trim().length >= 2 && (
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

            {attempted && !selectedPlace && (
              <div className="text-[12px] font-semibold text-red-600">候補からお店を1つ選んでください。</div>
            )}
          </div>
        </Section>

        {/* 価格 */}
        <Section title="1人あたりの料金" required right={priceModeSwitch}>
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

            {attempted && priceMode === "exact" && !isPriceComplete && (
              <div className="text-[12px] text-red-600 font-semibold">実額を入力してください。</div>
            )}
          </div>
        </Section>

        {/* 本文 */}
        <Section title="本文" required>
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
          {attempted && !content.trim() && (
            <div className="mt-2 text-[12px] text-red-600 font-semibold">本文を入力してください。</div>
          )}
        </Section>

        {/* おすすめ度（必須） */}
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

            {attempted && !recommendSelected && (
              <div className="text-[12px] text-red-600 font-semibold">おすすめ度を選んでください。</div>
            )}
          </div>
        </Section>

        {/* タグ（任意） */}
        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3 px-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">タグ</h2>
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  任意
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  閉じる
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  開く
                </>
              )}
            </button>
          </div>

          {showDetails && (
            <div className="border-t border-orange-100 bg-white p-3 space-y-3">
              {selectedTagIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedTagIds.map((id) => {
                    const t = findTagById(id);
                    if (!t) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => removeTag(id)}
                        className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[12px] font-semibold text-orange-700 hover:bg-orange-100"
                        title="タップで外す"
                      >
                        <span>{t.label}</span>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-semibold text-slate-600 shrink-0">絞り込み:</div>

                <div className="flex-1 overflow-x-auto">
                  <div className="flex gap-2 pb-1">
                    {TAG_CATEGORIES.map((c) => {
                      const active = tagCategory === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setTagCategory(c.id)}
                          className={[
                            "shrink-0 px-2 py-1 text-[12px] font-semibold transition",
                            active
                              ? "text-orange-700 border-b-2 border-orange-600"
                              : "text-slate-500 hover:text-slate-700 border-b-2 border-transparent",
                          ].join(" ")}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="relative w-[160px] shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="タグ検索"
                    className="w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 py-2 text-[12px] font-semibold text-slate-800 outline-none focus:border-orange-300"
                    aria-label="tag search"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {visibleTags.map((t) => {
                  const on = selectedTagIdSet.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                        on
                          ? "border-orange-200 bg-orange-50 text-orange-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800",
                      ].join(" ")}
                      aria-pressed={on}
                      title={t.id}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {visibleTags.length === 0 && (
                <div className="text-[12px] text-slate-500">
                  見つかりませんでした。検索語を変えるか、絞り込みを「すべて」に戻してみてください。
                </div>
              )}
            </div>
          )}
        </section>

        {msg && <div className="px-3 pb-3 text-sm font-semibold text-red-600">{msg}</div>}
      </form>

      {/* 画面下 fixed CTA（posts/new風） */}
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
              {processing ? "画像生成中…" : busy ? "保存中…" : "保存する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}