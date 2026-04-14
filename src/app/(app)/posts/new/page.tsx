"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useTranslations } from "next-intl";
import { optimisticPost } from "@/lib/optimisticPost";
import {
  type Draft,
  type DraftImage,
  saveDraft,
  loadDraft,
  clearDraft,
} from "@/lib/draftStore";

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

  // UIには出さない（来店日の自動入力にのみ使う）
  exifDate?: Date | null;
};

type TimeOfDay = "day" | "night" | null;

// DBに入れる型（posts.time_of_day が NOT NULL 'unknown' なので）
type DbTimeOfDay = "day" | "night" | "unknown";

function guessTimeOfDayFromDate(dt: Date): Exclude<TimeOfDay, null> {
  // ざっくり：6:00〜17:59 = day、それ以外 = night
  const h = dt.getHours();
  return h >= 6 && h <= 17 ? "day" : "night";
}

// =====================
// utils: heic
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

/** EXIFから撮影日時を取る（UIには出さない。来店日の自動入力にのみ使う） */
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

function toYmd(dt: Date): string {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

  // EXIFは元ファイルから読む（変換後に失う場合があるので）
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
// price helpers
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

function Section({
  title,
  required,
  optional,
  children,
  right,
  noPadding,
  requiredLabel,
  optionalLabel,
}: {
  title?: string;
  required?: boolean;
  optional?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
  requiredLabel?: string;
  optionalLabel?: string;
}) {
  return (
    <section>
      {title && (
        <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-bold text-slate-900 dark:text-gray-100 tracking-wide">{title}</h2>
            {required && (
              <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                {requiredLabel ?? "\u5FC5\u9808"}
              </span>
            )}
            {optional && (
              <span className="text-[11px] text-slate-400 dark:text-gray-500 font-medium">
                {optionalLabel ?? "\u4EFB\u610F"}
              </span>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "px-4 pb-4"}>{children}</div>
    </section>
  );
}

// =====================
// main
// =====================
export default function NewPostPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const t = useTranslations("post");
  const [uid, setUid] = useState<string | null>(null);

  // core
  const [content, setContent] = useState("");
  const [imgs, setImgs] = useState<PreparedImage[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // place
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [isSearchingPlace, setIsSearchingPlace] = useState(false);

  // price
  const [priceMode, setPriceMode] = useState<PriceMode>("exact");
  const [priceYenText, setPriceYenText] = useState<string>("");
  const [priceRange, setPriceRange] = useState<(typeof PRICE_RANGES)[number]["value"]>("3000-3999");

  // recommend
  const [recommendSelected, setRecommendSelected] = useState(false);
  const [recommendScore, setRecommendScore] = useState<number>(7.0);

  // visited
  const [visitedOn, setVisitedOn] = useState<string>(""); // yyyy-mm-dd

  // time of day (optional UI state)
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(null);
  const [timeOfDayTouched, setTimeOfDayTouched] = useState(false);

  // tags
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagCategory, setTagCategory] = useState<TagCategory>("all");
  const [tagQuery, setTagQuery] = useState("");

  // show optional (tags section) — default collapsed
  const [showDetails, setShowDetails] = useState(false);

  // draft
  const [draftRestorePrompt, setDraftRestorePrompt] = useState<"loading" | "ask" | "none">("loading");
  const pendingDraftRef = useRef<Draft | null>(null);
  const submittedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  // ---- draft: check on mount ----
  useEffect(() => {
    loadDraft().then((d) => {
      if (d) {
        pendingDraftRef.current = d;
        setDraftRestorePrompt("ask");
      } else {
        setDraftRestorePrompt("none");
      }
    }).catch(() => setDraftRestorePrompt("none"));
  }, []);

  // ---- draft: restore handler ----
  const restoreDraft = useCallback(async () => {
    const d = pendingDraftRef.current;
    if (!d) return;

    setContent(d.content);
    setSelectedPlace(d.selectedPlace);
    setPriceMode(d.priceMode as PriceMode);
    setPriceYenText(d.priceYenText);
    setPriceRange(d.priceRange as any);
    setRecommendSelected(d.recommendSelected);
    setRecommendScore(d.recommendScore);
    setVisitedOn(d.visitedOn);
    setTimeOfDay(d.timeOfDay);
    setTimeOfDayTouched(d.timeOfDayTouched);
    setSelectedTagIds(d.selectedTagIds);

    // 画像の blob -> PreparedImage に復元
    const restored: PreparedImage[] = d.images.map((di) => ({
      id: di.id,
      pin: new File([di.pinBlob], `${di.id}_pin`, { type: di.pinBlob.type }),
      square: new File([di.squareBlob], `${di.id}_square`, { type: di.squareBlob.type }),
      full: new File([di.fullBlob], `${di.id}_full`, { type: di.fullBlob.type }),
      previewUrl: URL.createObjectURL(di.previewBlob),
      label: di.label,
      origW: di.origW,
      origH: di.origH,
      exifDate: di.exifDate ? new Date(di.exifDate) : null,
    }));
    setImgs(restored);

    pendingDraftRef.current = null;
    setDraftRestorePrompt("none");
    // 復元したら下書き削除（二重復元防止）
    await clearDraft();
  }, []);

  // ---- form has content? ----
  const formHasContent = useMemo(() => {
    return content.trim().length > 0 || imgs.length > 0 || !!selectedPlace;
  }, [content, imgs, selectedPlace]);

  // ---- auto-save: ref で最新値を保持（イベントハンドラから参照） ----
  const formSnapshotRef = useRef({
    content, imgs, selectedPlace, priceMode, priceYenText, priceRange,
    recommendSelected, recommendScore, visitedOn, timeOfDay, timeOfDayTouched, selectedTagIds,
  });
  useEffect(() => {
    formSnapshotRef.current = {
      content, imgs, selectedPlace, priceMode, priceYenText, priceRange,
      recommendSelected, recommendScore, visitedOn, timeOfDay, timeOfDayTouched, selectedTagIds,
    };
  }, [content, imgs, selectedPlace, priceMode, priceYenText, priceRange, recommendSelected, recommendScore, visitedOn, timeOfDay, timeOfDayTouched, selectedTagIds]);

  const formHasContentRef = useRef(formHasContent);
  useEffect(() => { formHasContentRef.current = formHasContent; }, [formHasContent]);

  // ---- auto-save: 共通の保存ロジック ----
  const doSave = useCallback(() => {
    if (submittedRef.current || !formHasContentRef.current) return;
    const s = formSnapshotRef.current;

    const draftImages: DraftImage[] = s.imgs.map((img) => ({
      id: img.id,
      pinBlob: img.pin,
      squareBlob: img.square,
      fullBlob: img.full,
      previewBlob: img.square,
      label: img.label,
      origW: img.origW,
      origH: img.origH,
      exifDate: img.exifDate?.toISOString() ?? null,
    }));

    const draft: Draft = {
      content: s.content,
      images: draftImages,
      selectedPlace: s.selectedPlace,
      priceMode: s.priceMode,
      priceYenText: s.priceYenText,
      priceRange: s.priceRange,
      recommendSelected: s.recommendSelected,
      recommendScore: s.recommendScore,
      visitedOn: s.visitedOn,
      timeOfDay: s.timeOfDay,
      timeOfDayTouched: s.timeOfDayTouched,
      selectedTagIds: s.selectedTagIds,
      savedAt: Date.now(),
    };
    saveDraft(draft).catch(() => {});
  }, []);

  // ---- auto-save: visibilitychange (タブ切替) + beforeunload (リフレッシュ/タブ閉じ) ----
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === "hidden") doSave();
    };
    const onBeforeUnload = () => doSave();

    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [doSave]);

  // ---- auto-save: コンポーネント unmount 時（SPA 内遷移: router.back() やリンク等） ----
  useEffect(() => {
    return () => doSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- place search debounce ----
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

  // objectURL cleanup
  const imgsRef = useRef<PreparedImage[]>([]);
  useEffect(() => {
    imgsRef.current = imgs;
  }, [imgs]);
  useEffect(() => {
    return () => {
      imgsRef.current.forEach((x) => URL.revokeObjectURL(x.previewUrl));
    };
  }, []);

  // --- tags helpers ---
  const selectedTagIdSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds]);

  const visibleTags = useMemo(() => {
    const q = tagQuery.trim();

    // 検索中はカテゴリ無視で全体検索
    if (q) {
      return POST_TAGS.filter((t) => matchesTagQuery(t, q));
    }

    // 検索してない時だけカテゴリ絞り込み
    return POST_TAGS.filter((t) => (tagCategory === "all" ? true : t.category === tagCategory));
  }, [tagCategory, tagQuery]);

  function toggleTag(id: string) {
    const tag = findTagById(id);
    if (!tag) return;

    setSelectedTagIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);

      // exclusiveGroup があれば同グループのタグを外す
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

  // --- images ---
  const addImages = async (files: File[]) => {
    const MAX = 9;
    if (imgs.length >= MAX) return;

    setProcessing(true);
    setMsg(null);

    try {
      const imageFiles = files.filter((f) => (f.type || "").startsWith("image/") || isHeicLike(f));
      const limited = imageFiles.slice(0, Math.max(0, MAX - imgs.length));
      if (limited.length === 0) return;

      const prepared = await mapWithConcurrency(limited, 2, async (f) => prepareImage(f));
      setImgs((prev) => [...prev, ...prepared]);

      // 1枚目追加のタイミングで、visitedOnだけ静かに自動入力（UIには何も出さない）
      if (imgs.length === 0 && prepared.length > 0) {
        const dt = prepared[0]?.exifDate ?? null;
        if (dt && !visitedOn) {
          setVisitedOn(toYmd(dt));
        }
        // 初期値だけ入れる：未選択で、かつユーザーが触ってない場合のみ
        if (dt && timeOfDay === null && !timeOfDayTouched) {
          setTimeOfDay(guessTimeOfDayFromDate(dt));
        }
      }
    } catch (e: any) {
      setMsg(e?.message ?? t("imagePreprocessFailed"));
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

  // price derived
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

  const isAllRequiredComplete =
    imgs.length > 0 && !!selectedPlace?.place_id && isPriceComplete && content.trim().length > 0 && recommendSelected;

  const priceModeSwitch = (
    <div className="inline-flex rounded-full border border-orange-100 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-900/20 p-1">
      {[
        { v: "exact", label: t("exact") },
        { v: "range", label: t("range") },
      ].map((x) => {
        const active = priceMode === (x.v as PriceMode);
        return (
          <button
            key={x.v}
            type="button"
            onClick={() => setPriceMode(x.v as PriceMode)}
            className={[
              "h-8 rounded-full px-4 text-xs font-semibold transition",
              active ? "bg-white dark:bg-[#16181e] shadow-sm text-slate-900 dark:text-gray-100" : "text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200",
            ].join(" ")}
          >
            {x.label}
          </button>
        );
      })}
    </div>
  );

  // ensure places lat/lng
  const ensurePlaceWithLatLng = async (): Promise<string> => {
    if (!selectedPlace?.place_id) throw new Error("select place required");

    const res = await fetch("/api/places/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: selectedPlace.place_id }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "Failed to ensure place");
    }

    return selectedPlace.place_id;
  };

  const submit = async () => {
    setAttempted(true);

    if (!uid) return setMsg(t("loginRequired"));
    if (processing) return setMsg(t("waitForProcessing"));
    if (!imgs.length) return setMsg(t("addPhotos"));
    if (!selectedPlace?.place_id) return setMsg(t("selectPlaceRequired"));
    if (!isPriceComplete)
      return setMsg(priceMode === "exact" ? t("exactPriceRequired") : t("selectPriceRequired"));
    if (!content.trim()) return setMsg(t("bodyRequired"));
    if (!recommendSelected) return setMsg(t("recommendRequired"));

    setBusy(true);
    setMsg(null);

    // 投稿開始フラグ（下書き自動保存を止める）
    // ※ clearDraft は DB INSERT 成功後に行う（失敗時に下書き復元するため）
    submittedRef.current = true;

    // ── Step 1: バリデーション通過直後にoptimisticを開始してすぐ遷移 ──────
    // アップロード完了を待たず、ローカルのblob URLでプレビューを表示
    optimisticPost.set({
      tempId: `opt_${Date.now()}`,
      coverSquareUrl: imgs[0]?.previewUrl ?? "",   // blob URL（アップロード前から存在）
      placeName: selectedPlace?.name ?? "",
      placeAddress: selectedPlace?.formatted_address ?? "",
      content,
      recommendScore: Number(recommendScore.toFixed(1)),
      status: "saving",
    });
    // origin.y はビューポート基準で計算（ページ全体高さではなく表示画面内）
    const viewportOriginY =
      (window.scrollY + window.innerHeight * 0.7) / document.documentElement.scrollHeight;
    confetti({ particleCount: 60, spread: 80, origin: { y: viewportOriginY } });
    router.push("/timeline");
    // ここ以降コンポーネントはアンマウントされる。setState は呼ばない。

    // ── Step 2: アップロード → insert → embedding をすべてバックグラウンドで実行 ──
    ;(async () => {
      try {
        const CACHE = "31536000"; // 1年
        const bucket = supabase.storage.from("post-images");

        // ensurePlace と全画像アップロードを並列実行
        const [ensuredPlaceId, uploaded] = await Promise.all([
          ensurePlaceWithLatLng(),
          mapWithConcurrency(imgs, 2, async (img) => {
            const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

            const pinExt    = img.pin.name.split(".").pop()    || "jpg";
            const squareExt = img.square.name.split(".").pop() || "jpg";
            const fullExt   = img.full.name.split(".").pop()   || "jpg";

            const pinPath    = `${uid}/${base}_pin.${pinExt}`;
            const squarePath = `${uid}/${base}_square.${squareExt}`;
            const fullPath   = `${uid}/${base}_full.${fullExt}`;

            const [upPin, upSquare, upFull] = await Promise.all([
              bucket.upload(pinPath,    img.pin,    { cacheControl: CACHE, upsert: false, contentType: img.pin.type }),
              bucket.upload(squarePath, img.square, { cacheControl: CACHE, upsert: false, contentType: img.square.type }),
              bucket.upload(fullPath,   img.full,   { cacheControl: CACHE, upsert: false, contentType: img.full.type }),
            ]);

            if (upPin.error)    throw upPin.error;
            if (upSquare.error) throw upSquare.error;
            if (upFull.error)   throw upFull.error;

            const { data: pubPin }    = bucket.getPublicUrl(pinPath);
            const { data: pubSquare } = bucket.getPublicUrl(squarePath);
            const { data: pubFull }   = bucket.getPublicUrl(fullPath);

            return {
              pin: pubPin.publicUrl,
              square: pubSquare.publicUrl,
              full: pubFull.publicUrl,
              orig_w: img.origW,
              orig_h: img.origH,
            };
          }),
        ]);

        const image_assets   = uploaded;
        const image_variants = uploaded.map((x) => ({ thumb: x.square, full: x.full }));
        const image_urls     = uploaded.map((x) => x.full);

        const cover_pin_url    = uploaded[0]?.pin    ?? null;
        const cover_square_url = uploaded[0]?.square ?? null;
        const cover_full_url   = uploaded[0]?.full   ?? null;

        const price_yen   = priceMode === "exact"  ? priceYenValue : null;
        const price_range = priceMode === "range"  ? priceRange    : null;

        const place_id      = ensuredPlaceId;
        const place_name    = selectedPlace?.name               ?? null;
        const place_address = selectedPlace?.formatted_address  ?? null;
        const visited_on    = visitedOn ?? null;
        const tag_ids       = selectedTagIds;
        const time_of_day: DbTimeOfDay = (timeOfDay ?? "unknown") as DbTimeOfDay;

        const { data: inserted, error: insErr } = await Promise.resolve(
          supabase.from("posts").insert({
            user_id: uid,
            content,
            image_assets,
            cover_pin_url,
            cover_square_url,
            cover_full_url,
            image_variants,
            image_urls,
            place_id,
            place_name,
            place_address,
            recommend_score: Number(recommendScore.toFixed(1)),
            price_yen,
            price_range,
            visited_on,
            time_of_day,
            tag_ids,
          }).select("id").single()
        );

        if (insErr) { optimisticPost.markError(); return; }

        // embedding 生成（fire-and-forget）
        if (inserted?.id) {
          fetch(`/api/posts/${inserted.id}/embed`, { method: "POST" }).catch(() => {});
        }

        // 成功 → 下書きを削除
        clearDraft().catch(() => {});
        optimisticPost.markDone();
      } catch {
        // 失敗 → 下書きを復元（submittedRef を戻してから doSave）
        submittedRef.current = false;
        doSave();
        optimisticPost.markError();
      }
    })();
  };

  return (
    <main className="min-h-screen bg-white dark:bg-[#0e1117] text-slate-800 dark:text-gray-200 -mb-6">
      <div className="w-full">
        {/* ── header ── */}
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-white/[.08] bg-white/80 dark:bg-[#0e1117]/80 backdrop-blur-lg">
          <div className="flex h-12 items-center justify-between px-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm font-medium text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition"
            >
              {t("cancel")}
            </button>
            <h1 className="text-sm font-bold text-slate-900 dark:text-gray-100">{t("newPost")}</h1>
            <div className="w-[60px]" />{/* spacer for centering */}
          </div>
        </header>

        {/* draft restore */}
        {draftRestorePrompt === "ask" && (
          <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3 border-b border-amber-200 dark:border-amber-800/40">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t("draftFound")}</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={restoreDraft}
                  className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 transition">
                  {t("restore")}
                </button>
                <button type="button" onClick={async () => { setDraftRestorePrompt("none"); pendingDraftRef.current = null; await clearDraft(); }}
                  className="rounded-full border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] px-3 py-1 text-xs font-semibold text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/[.1] transition">
                  {t("discard")}
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="divide-y divide-slate-100 dark:divide-white/[.06] pb-40">

          {/* ── 写真 ── */}
          <Section title={t("photos")} required requiredLabel={t("required")} right={
            imgs.length > 0 ? (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 transition">
                + {t("add")}
              </button>
            ) : null
          }>
            <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />

            {imgs.length === 0 ? (
              <button type="button"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={onDropZone as any}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-50 dark:bg-white/[.04] py-10 transition hover:bg-slate-100 dark:hover:bg-white/[.06] active:bg-slate-100 dark:active:bg-white/[.06]"
              >
                {processing ? (
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-slate-400 dark:text-gray-500" />
                )}
                <span className="text-sm font-semibold text-slate-500 dark:text-gray-400">
                  {processing ? t("processing") : t("tapToAddPhoto")}
                </span>
              </button>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-semibold text-slate-500 dark:text-gray-400">{imgs.length} / 9</span>
                  <button type="button" onClick={() => { imgs.forEach((x) => URL.revokeObjectURL(x.previewUrl)); setImgs([]); }}
                    className="text-[12px] font-medium text-slate-400 dark:text-gray-500 hover:text-red-500 transition">
                    {t("deleteAll")}
                  </button>
                </div>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={onDropZone}
                >
                  {imgs.map((img) => (
                    <div key={img.id} className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.previewUrl} alt={img.label} className="h-20 w-20 rounded-xl object-cover" />
                      <button type="button" onClick={() => removeImage(img.id)}
                        className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white shadow"
                        aria-label="remove"><X size={12} /></button>
                    </div>
                  ))}
                  {/* add more */}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-slate-50 dark:bg-white/[.04] text-slate-400 dark:text-gray-500 hover:bg-slate-100 dark:hover:bg-white/[.06] transition">
                    <ImageIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* ── お店 ── */}
          <Section title={t("place")} required requiredLabel={t("required")} right={
            isSearchingPlace ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> : null
          }>
            {selectedPlace ? (
              <div className="flex items-center justify-between rounded-xl bg-orange-50 dark:bg-orange-900/20 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-orange-500" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900 dark:text-gray-100">{selectedPlace.name}</div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-gray-400">{selectedPlace.formatted_address}</div>
                  </div>
                </div>
                <button type="button" onClick={() => { setSelectedPlace(null); setPlaceQuery(""); setPlaceResults([]); }}
                  className="ml-2 shrink-0 rounded-full p-1 text-slate-400 dark:text-gray-500 transition hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-slate-600 dark:hover:text-gray-300"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] px-3 py-2.5 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 dark:focus-within:ring-orange-900/30 transition">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400 dark:text-gray-500" />
                    <input type="text" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)}
                      placeholder={t("placePlaceholder")}
                      className="w-full bg-transparent text-[16px] text-slate-900 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 leading-tight" aria-label="store search" />
                  </div>
                  {placeQuery.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1">
                      {placeResults.length > 0 ? (
                        <ul className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/[.08] bg-white dark:bg-[#16181e] shadow-lg">
                          {placeResults.map((p) => (
                            <li key={p.place_id} className="cursor-pointer px-3 py-2.5 transition hover:bg-orange-50 dark:hover:bg-orange-900/20"
                              onClick={() => { setSelectedPlace(p); setPlaceQuery(""); setPlaceResults([]);
                                fetch("/api/places/ensure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeId: p.place_id }) }).catch(() => {}); }}>
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{p.name}</div>
                              <div className="truncate text-[11px] text-slate-500 dark:text-gray-400">{p.formatted_address}</div>
                            </li>
                          ))}
                        </ul>
                      ) : !isSearchingPlace && (
                        <div className="rounded-xl border border-slate-200 dark:border-white/[.08] bg-white dark:bg-[#16181e] px-3 py-2 text-[12px] text-slate-500 dark:text-gray-400 shadow-sm">
                          {t("noResults")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {attempted && (
                  <p className="text-[12px] font-semibold text-red-500">{t("selectPlace")}</p>
                )}
              </div>
            )}
          </Section>

          {/* ── 本文 ── */}
          <Section title={t("body")} required requiredLabel={t("required")}>
            <textarea
              className="h-28 w-full resize-none rounded-xl border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] px-4 py-3 text-[16px] leading-relaxed text-slate-900 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/30 transition md:h-36"
              placeholder={t("bodyPlaceholder")}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
              aria-label="content"
            />
            {attempted && !content.trim() && (
              <p className="mt-1 text-[12px] font-semibold text-red-500">{t("bodyRequired")}</p>
            )}
          </Section>

          {/* ── おすすめ度 ── */}
          <Section title={t("recommend")} required requiredLabel={t("required")} right={
            recommendSelected ? (
              <span className="text-sm font-bold text-orange-600">{recommendScore.toFixed(1)}<span className="text-slate-400 dark:text-gray-500 font-normal"> / 10</span></span>
            ) : null
          }>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={10} step={0.1} value={recommendScore}
                  onChange={(e) => { setRecommendSelected(true); setRecommendScore(Number(e.target.value)); }}
                  className={["w-full", recommendSelected ? "accent-orange-600" : "accent-slate-300 dark:accent-gray-600"].join(" ")}
                  aria-label="recommend" />
                <input type="number" min={0} max={10} step={0.1} inputMode="decimal"
                  value={recommendSelected ? recommendScore.toFixed(1) : ""} placeholder="0.0"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { setRecommendSelected(false); return; }
                    const n = Number(v); if (!Number.isFinite(n)) return;
                    setRecommendSelected(true); setRecommendScore(Math.round(Math.min(10, Math.max(0, n)) * 10) / 10);
                  }}
                  className="w-16 rounded-lg border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] px-2 py-1.5 text-center text-[16px] font-bold text-slate-900 dark:text-gray-100 outline-none focus:border-orange-400"
                  aria-label="recommend number" />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 dark:text-gray-500"><span>0</span><span>10</span></div>
              {attempted && !recommendSelected && (
                <p className="text-[12px] font-semibold text-red-500">{t("recommendRequired")}</p>
              )}
            </div>
          </Section>

          {/* ── 料金 ── */}
          <Section title={t("price")} required requiredLabel={t("required")} right={priceModeSwitch}>
            <div className="space-y-2">
              {priceMode === "exact" ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] px-3 py-2.5 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 dark:focus-within:ring-orange-900/30 transition">
                  <span className="text-sm font-medium text-slate-400 dark:text-gray-500">&yen;</span>
                  <input inputMode="numeric" value={priceYenText} onChange={(e) => setPriceYenText(onlyDigits(e.target.value))}
                    placeholder={t("pricePlaceholder")} className="w-full bg-transparent text-[16px] text-slate-900 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 leading-tight" aria-label="price" />
                  {priceYenValue ? <span className="shrink-0 text-[12px] text-slate-400 dark:text-gray-500">&yen;{formatYen(priceYenValue)}</span> : null}
                </div>
              ) : (
                <select value={priceRange} onChange={(e) => setPriceRange(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] px-3 py-2.5 text-[16px] text-slate-900 dark:text-gray-100 outline-none focus:border-orange-400 leading-tight" aria-label="price range">
                  {PRICE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}
              {attempted && priceMode === "exact" && !isPriceComplete && (
                <p className="text-[12px] font-semibold text-red-500">{t("exactRequired")}</p>
              )}
            </div>
          </Section>

          {/* ── 来店日 + 昼/夜（1行にまとめる） ── */}
          <Section title={t("visitedOn")} optional optionalLabel={t("optional")}>
            <div className="flex items-center gap-3">
              <input type="date" name="visited_on" value={visitedOn} onChange={(e) => setVisitedOn(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] px-3 py-2 text-[16px] text-slate-900 dark:text-gray-100 outline-none focus:border-orange-400 transition leading-tight"
                style={{ WebkitAppearance: "none" } as any} aria-label="visited date" />
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/[.08] p-0.5">
                {([{ v: "day" as const, l: t("day") }, { v: "night" as const, l: t("night") }]).map((x) => (
                  <button key={x.v} type="button"
                    onClick={() => { setTimeOfDayTouched(true); setTimeOfDay(timeOfDay === x.v ? null : x.v); }}
                    className={["rounded-md px-3 py-1.5 text-xs font-semibold transition",
                      timeOfDay === x.v ? "bg-orange-600 text-white shadow-sm" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                    ].join(" ")} aria-pressed={timeOfDay === x.v}>
                    {x.l}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* ── タグ ── */}
          <section>
            <button type="button" onClick={() => setShowDetails((v) => !v)}
              className="flex w-full items-center justify-between px-4 pt-5 pb-2">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-slate-900 dark:text-gray-100 tracking-wide">{t("tags")}</h2>
                <span className="text-[11px] text-slate-400 dark:text-gray-500 font-medium">{t("optional")}</span>
                {selectedTagIds.length > 0 && (
                  <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
                    {selectedTagIds.length}
                  </span>
                )}
              </div>
              {showDetails ? <ChevronUp className="h-4 w-4 text-slate-400 dark:text-gray-500" /> : <ChevronDown className="h-4 w-4 text-slate-400 dark:text-gray-500" />}
            </button>

            {/* collapsed state */}
            {!showDetails && (
              <div className="px-4 pb-4">
                {selectedTagIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTagIds.map((id) => {
                      const tag = findTagById(id); if (!tag) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-900/20 px-2 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-300">
                          {tag.label}
                          <button type="button" onClick={() => removeTag(id)} className="text-orange-400 hover:text-orange-600"><X size={10} /></button>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-slate-400 dark:text-gray-500">{t("tapToAddTag")}</p>
                )}
              </div>
            )}

            {showDetails && (
              <div className="px-4 pb-4 space-y-3">
                {/* selected */}
                {selectedTagIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTagIds.map((id) => {
                      const tag = findTagById(id); if (!tag) return null;
                      return (
                        <button key={id} type="button" onClick={() => removeTag(id)}
                          className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900/30 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition">
                          {tag.label}<X size={10} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* filter + search */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 overflow-x-auto">
                    <div className="flex gap-1 pb-0.5">
                      {TAG_CATEGORIES.map((c) => {
                        const active = tagCategory === c.id;
                        return (
                          <button key={c.id} type="button" onClick={() => setTagCategory(c.id)}
                            className={["shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                              active ? "bg-slate-900 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-slate-100 dark:bg-white/[.06] text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/[.1]"
                            ].join(" ")}>{c.label}</button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="relative w-28 shrink-0">
                    <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400 dark:text-gray-500" />
                    <input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder={t("search")}
                      className="w-full rounded-full border border-slate-200 dark:border-white/[.08] bg-white dark:bg-white/[.06] py-1 pl-7 pr-2 text-[16px] text-slate-800 dark:text-gray-200 outline-none focus:border-orange-400 leading-tight" aria-label="tag search" />
                  </div>
                </div>

                {/* tag list */}
                <div className="flex flex-wrap gap-1.5">
                  {visibleTags.map((tg) => {
                    const on = selectedTagIdSet.has(tg.id);
                    return (
                      <button key={tg.id} type="button" onClick={() => toggleTag(tg.id)}
                        className={["rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                          on ? "bg-orange-600 text-white" : "bg-slate-100 dark:bg-white/[.06] text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-white/[.1]"
                        ].join(" ")} aria-pressed={on}>{tg.label}</button>
                    );
                  })}
                  {visibleTags.length === 0 && (
                    <p className="text-[11px] text-slate-400 dark:text-gray-500">{t("notFound")}</p>
                  )}
                </div>
              </div>
            )}
          </section>

          {msg && <div className="px-4 py-3 text-sm font-semibold text-red-600">{msg}</div>}
        </form>
      </div>

      {/* ── bottom CTA ── */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        {/* white fill to cover any layout background peeking above */}
        <div className="absolute inset-x-0 -top-16 h-16 bg-white dark:bg-[#0e1117] pointer-events-none" />
        <div className="border-t border-slate-100 dark:border-white/[.08] bg-white dark:bg-[#0e1117] px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={() => submit()} disabled={busy || processing || !isAllRequiredComplete}
            className={["flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-bold transition",
              busy || processing || !isAllRequiredComplete
                ? "bg-slate-100 dark:bg-white/[.06] text-slate-400 dark:text-gray-500"
                : "bg-orange-600 text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700 active:scale-[0.98]"
            ].join(" ")}>
            {processing ? t("processingImages") : busy ? t("posting") : t("submit")}
          </button>
        </div>
      </div>
    </main>
  );
}