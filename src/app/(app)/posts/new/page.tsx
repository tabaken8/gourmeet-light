"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Image as ImageIcon, MapPin, X } from "lucide-react";

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
 * 高品質縮小：
 * - EXIF orientation を反映（可能なら）
 * - 段階縮小（半分ずつ）でボケ/ジャギを抑える
 */
async function resizeToFile(
  input: File,
  opts: { maxLongEdge: number; mime: string; quality: number; outExt: string }
): Promise<File> {
  // EXIF orientation を反映（環境により未対応なので any で保険）
  const bitmap = await createImageBitmap(input, {
    imageOrientation: "from-image",
  } as any);

  const w = bitmap.width;
  const h = bitmap.height;

  const longEdge = Math.max(w, h);
  const scale = Math.min(1, opts.maxLongEdge / longEdge);

  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  // まず bitmap をキャンバスへ
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

  // 半分ずつ縮めて最終サイズへ（急激縮小の劣化を抑える）
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

  // 最終サイズに仕上げ
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
 * - thumb: 長辺1440px（Retinaでも粗が出にくい）
 * - full : 長辺3072px（拡大用に十分）
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
  { value: "10000+", label: "¥10,000〜" },
] as const;

type PriceMode = "none" | "exact" | "range";

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

export default function NewPostPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
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

  // ✅ おすすめ度（1〜10）
  const [recommendScore, setRecommendScore] = useState<number>(7);

  // ✅ 価格（実額 or レンジ）
  const [priceMode, setPriceMode] = useState<PriceMode>("none");
  const [priceYenText, setPriceYenText] = useState<string>("");
  const [priceRange, setPriceRange] = useState<(typeof PRICE_RANGES)[number]["value"]>(
    "3000-3999"
  );

  const priceYenValue = useMemo(() => {
    const digits = onlyDigits(priceYenText);
    if (!digits) return null;
    const n = Number(digits);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  }, [priceYenText]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

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

  // ✅ objectURL解放（アンマウント時のみ）
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return setMsg("ログインしてください。");
    if (processing) return setMsg("画像を処理中です。少し待ってください。");

    // 価格の整合（DB制約に合わせる）
    const price_yen = priceMode === "exact" ? priceYenValue : null;
    const price_range = priceMode === "range" ? priceRange : null;

    if (priceMode === "exact" && (price_yen === null || price_yen === 0)) {
      return setMsg("価格（実額）を入力してください（例: 3500）。不要なら「なし」にできます。");
    }

    setBusy(true);
    setMsg(null);

    try {
      const CACHE = "31536000"; // 1年（調整中は短くするのもおすすめ）
      const variants: Array<{ full: string; thumb: string }> = [];
      const compatFullUrls: string[] = [];

      for (const img of imgs) {
        const base = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const fullExt = img.full.name.split(".").pop() || "jpg";
        const thumbExt = img.thumb.name.split(".").pop() || "jpg";

        const fullPath = `${uid}/${base}_full.${fullExt}`;
        const thumbPath = `${uid}/${base}_thumb.${thumbExt}`;

        const upThumb = await supabase.storage
          .from("post-images")
          .upload(thumbPath, img.thumb, {
            cacheControl: CACHE,
            upsert: false,
            contentType: img.thumb.type,
          });
        if (upThumb.error) throw upThumb.error;

        const upFull = await supabase.storage
          .from("post-images")
          .upload(fullPath, img.full, {
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

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: uid,
        content,
        image_variants: variants,
        image_urls: compatFullUrls,
        place_id: selectedPlace?.place_id ?? null,
        place_name: selectedPlace?.name ?? null,
        place_address: selectedPlace?.formatted_address ?? null,

        // ✅ 追加
        recommend_score: recommendScore,
        price_yen,
        price_range,
      });
      if (insErr) throw insErr;

      router.push("/timeline");
      router.refresh();
    } catch (err: any) {
      setMsg(err.message ?? "投稿に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-8 md:px-6">
        <div className="mb-4">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            New Post
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            いまの “おいしい” を、写真と一緒にふわっと残しておく場所。
          </p>
        </div>

        <div className="rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-6">
          <form onSubmit={submit} className="space-y-5">
            {/* ✅ 画像追加（最上段へ移動） */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">写真</span>
                <span className="text-[11px] text-slate-400">
                  Command+V で貼り付けもOK
                </span>
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

                <button
                  type="submit"
                  disabled={busy || processing}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-orange-600 px-7 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60"
                >
                  {processing ? "画像処理中..." : busy ? "投稿中..." : "投稿する"}
                </button>
              </div>
            </div>

            {/* 画像プレビュー */}
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

            {/* ✅ おすすめ度（レンジのみ） */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  おすすめ度 <span className="text-orange-600">{recommendScore}</span>/10
                </span>
                <span className="text-[11px] text-slate-400">ポイント（あとで変えられる）</span>
              </div>

              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={recommendScore}
                onChange={(e) => setRecommendScore(Number(e.target.value))}
                className="w-full accent-orange-600"
                aria-label="おすすめ度"
              />
            </div>

            {/* ✅ 価格（実額/レンジ/なし） */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">価格</span>
                <span className="text-[11px] text-slate-400">あとで検索/絞り込みに使える</span>
              </div>

              <div className="inline-flex rounded-full border border-orange-100 bg-orange-50/60 p-1">
                {[
                  { v: "none", label: "なし" },
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
                        active
                          ? "bg-white shadow-sm text-slate-900"
                          : "text-slate-600 hover:text-slate-800",
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
                  <div className="text-[11px] text-slate-500 min-w-[88px] text-right">
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

              {priceMode === "none" && (
                <div className="text-[11px] text-slate-400">価格は未入力でもOK（あとから足せる）</div>
              )}
            </div>

            {/* 本文 */}
            <div>
              <textarea
                className="h-32 w-full resize-none rounded-2xl border border-orange-100 bg-orange-50/40 px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-orange-300 focus:bg-white focus:ring-0"
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

            {/* 店舗選択 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <MapPin className="h-3 w-3 text-orange-500" />
                  お店をつける
                </span>
                {isSearchingPlace && (
                  <span className="text-[11px] text-orange-500">検索中...</span>
                )}
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
                                  <div className="truncate font-medium text-slate-800">
                                    {p.name}
                                  </div>
                                  <div className="truncate text-[11px] text-slate-500">
                                    {p.formatted_address}
                                  </div>
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
            </div>

            {msg && <p className="text-xs text-red-600">{msg}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}
