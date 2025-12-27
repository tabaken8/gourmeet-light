"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Sparkles, Loader2, ExternalLink } from "lucide-react";

export type Poster = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type PostMini = {
  post_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at_ms: number;
  image_urls: string[];
  recommend_score: number | null;
  price_yen: number | null;
  price_range: string | null;
};

export type RecommendItem = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;

  // ai
  reason?: string | null;
  match_score?: number | null;

  // place aggregation
  images?: string[];
  price_yen?: number | null;
  price_range?: string | null;
  recommend_score?: number | null; // 最新投稿のおすすめ度

  genre_emoji?: string | null;
  is_saved?: boolean;

  posters?: Poster[];

  // 投稿へ飛ぶ
  latest_post_id?: string | null;

  // 同じ店の複数投稿（カード内横スクロール）
  posts_sample?: PostMini[];
};

function formatYen(n: number) {
  try {
    return new Intl.NumberFormat("ja-JP").format(Math.max(0, Math.floor(n)));
  } catch {
    return String(n);
  }
}

function formatPrice(priceYen?: number | null, priceRange?: string | null) {
  if (typeof priceYen === "number" && Number.isFinite(priceYen)) return `¥${formatYen(priceYen)}`;
  if (!priceRange) return null;

  switch (priceRange) {
    case "~999":
      return "〜¥999";
    case "1000-1999":
      return "¥1,000〜¥1,999";
    case "2000-2999":
      return "¥2,000〜¥2,999";
    case "3000-3999":
      return "¥3,000〜¥3,999";
    case "4000-4999":
      return "¥4,000〜¥4,999";
    case "5000-6999":
      return "¥5,000〜¥6,999";
    case "7000-9999":
      return "¥7,000〜¥9,999";
    case "10000+":
      return "¥10,000〜";
    default:
      return priceRange;
  }
}

function normalizeUrl(u?: string | null) {
  const s = (u ?? "").trim();
  return s.length ? s : null;
}

function uniqStrings(arr: Array<string | null | undefined>, limit = 50) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const v = normalizeUrl(raw);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function pickPostThumb(post: PostMini, avoid: Set<string>) {
  const urls = Array.isArray(post.image_urls) ? post.image_urls : [];
  // 1) avoidと被らない最初の画像
  for (const u of urls) {
    const v = normalizeUrl(u);
    if (!v) continue;
    if (!avoid.has(v)) return v;
  }
  // 2) 全部被る/1枚しかない場合のfallback（被り許容）
  for (const u of urls) {
    const v = normalizeUrl(u);
    if (v) return v;
  }
  return null;
}

function Thumb({ url, fallback }: { url?: string | null; fallback: string }) {
  if (!url) {
    return (
      <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-orange-50 to-slate-100 grid place-items-center text-lg">
        {fallback}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-black/5" loading="lazy" />;
}

function Avatar({ p }: { p: Poster }) {
  const label = p.display_name ?? "User";
  const initial = label.slice(0, 1).toUpperCase();

  return (
    <div className="shrink-0">
      <div
        className="h-8 w-8 overflow-hidden rounded-full border border-black/10 bg-orange-50 text-[11px] font-semibold text-orange-700 grid place-items-center"
        title={label}
      >
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt="" className="h-8 w-8 object-cover" referrerPolicy="no-referrer" />
        ) : (
          initial
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "orange";
}) {
  const cls =
    tone === "orange"
      ? "border-orange-200 bg-orange-50 text-orange-800"
      : "border-black/10 bg-white text-slate-700";

  return (
    <span
      className={[
        "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold",
        cls,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function MiniIdentity({
  displayName,
  avatarUrl,
}: {
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const label = displayName ?? "User";
  const initial = label.slice(0, 1).toUpperCase();
  return (
    <div
      className="absolute right-1 bottom-1 h-5 w-5 overflow-hidden rounded-full ring-2 ring-white bg-orange-50 grid place-items-center text-[10px] font-extrabold text-orange-700"
      title={label}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-5 w-5 object-cover" referrerPolicy="no-referrer" />
      ) : (
        initial
      )}
    </div>
  );
}

export default function MapRecommendPanel({
  query,
  onChangeQuery,
  maxResults,
  onChangeMaxResults,
  onRun,
  loading,
  understoodSummary,
  items,
  onFocusPlace,
}: {
  query: string;
  onChangeQuery: (s: string) => void;
  maxResults: number;
  onChangeMaxResults: (n: number) => void;
  onRun: () => void;
  loading: boolean;
  understoodSummary?: string | null;
  items: RecommendItem[];
  onFocusPlace: (placeId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const headerText = useMemo(() => {
    if (loading) return "考え中…";
    if (understoodSummary) return understoodSummary;
    return "自然言語で探せる（例：静かでデート向き、ワイン）";
  }, [loading, understoodSummary]);

  return (
    <div className="w-full">
      {/* search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            placeholder="本郷三丁目で一軒目。静かでデート向き、ワイン…"
            className="
              w-full rounded-2xl border border-black/10 bg-white
              pl-9 pr-3 py-2 text-sm
              shadow-sm
              focus:outline-none focus:ring-2 focus:ring-orange-400/60
            "
          />
        </div>

        <select
          value={String(maxResults)}
          onChange={(e) => onChangeMaxResults(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          title="表示件数"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n}件
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onRun}
          disabled={loading || query.trim().length === 0}
          className="
            inline-flex items-center gap-2 rounded-2xl bg-orange-600 px-4 py-2
            text-sm font-semibold text-white shadow-sm
            disabled:opacity-60
          "
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          結果を生成
        </button>
      </div>

      {/* summary */}
      <div className="mt-2 text-[12px] text-slate-600">{headerText}</div>

      {/* results */}
      {items.length > 0 && (
        <div className="mt-3">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {items.map((it) => {
              const posters = it.posters ?? [];

              // place aggregated images
              const placeImgs = uniqStrings(it.images ?? [], 12);
              const placeThumb = placeImgs[0] ?? null;
              const extraImgs = Math.max(0, placeImgs.length - 1);

              const expanded = expandedId === it.place_id;

              const postUrl = it.latest_post_id ? `/posts/${it.latest_post_id}` : null;

              const rs =
                typeof it.recommend_score === "number" && it.recommend_score >= 1 && it.recommend_score <= 10
                  ? it.recommend_score
                  : null;

              const priceLabel = formatPrice(it.price_yen ?? null, it.price_range ?? null);

              const postSamples = (it.posts_sample ?? []).slice(0, 8);

              // ✅ avoid: placeThumb と同じURLは「関連投稿サムネ」では極力避ける
              const avoid = new Set<string>();
              if (placeThumb) avoid.add(placeThumb);

              // 各投稿タイルで使うthumb（placeThumbと被らないものを優先）
              const postTiles = postSamples.map((p) => {
                const thumb = pickPostThumb(p, avoid);
                // ここで avoid に追加しない：同じ店で同じ写真が複数投稿に使われてても
                // “投稿の存在” が価値なので、完全排除はしない（ただ placeThumb だけは避ける）
                return { p, thumb };
              });

              const mapsHref = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(it.place_id)}`;

              return (
                <div
                  key={it.place_id}
                  className="
                    shrink-0 w-[360px] rounded-2xl bg-white
                    border border-black/10 shadow-sm
                    p-3
                  "
                >
                  {/* header / focus */}
                  <button type="button" onClick={() => onFocusPlace(it.place_id)} className="w-full text-left">
                    <div className="flex gap-3">
                      <div className="relative shrink-0">
                        <Thumb url={placeThumb} fallback={it.genre_emoji ?? "📍"} />
                        {extraImgs > 0 && (
                          <div className="absolute -right-1 -bottom-1 rounded-full bg-black/70 px-2 py-[2px] text-[10px] font-semibold text-white">
                            +{extraImgs}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-extrabold text-slate-900">{it.name}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                              <MapPin size={12} className="opacity-70" />
                              <span className="truncate">{it.address}</span>
                            </div>
                          </div>

                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-full border border-black/10 bg-white p-2 text-slate-600 hover:bg-slate-50"
                            title="Google Mapsで開く"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>

                        {/* chips row */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {it.genre_emoji ? <Chip>{it.genre_emoji}</Chip> : null}
                          {priceLabel ? <Chip>{priceLabel}</Chip> : null}
                          {rs ? <Chip tone="orange">おすすめ {rs}/10</Chip> : null}
                          {it.is_saved ? <Chip tone="orange">保存済み</Chip> : null}
                          {typeof it.match_score === "number" ? (
                            <span className="ml-auto inline-flex h-6 items-center rounded-full border border-black/10 bg-white px-2 text-[11px] font-extrabold text-slate-800">
                              {it.match_score}
                            </span>
                          ) : null}
                        </div>

                        {/* reason */}
                        {it.reason ? (
                          <div className="mt-2 text-[12px] leading-relaxed text-slate-700">
                            <span className={expanded ? "" : "line-clamp-2"}>{it.reason}</span>
                            <div className="mt-1">
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-orange-700 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedId((prev) => (prev === it.place_id ? null : it.place_id));
                                }}
                              >
                                {expanded ? "閉じる" : "もっと見る"}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {/* posters */}
                        {posters.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex gap-1 overflow-x-auto pb-1">
                              {posters.map((p) => (
                                <Avatar key={p.user_id} p={p} />
                              ))}
                            </div>
                            {posters.length >= 2 ? (
                              <div className="shrink-0 text-[11px] font-semibold text-slate-500">{posters.length}人</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* footer actions */}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {postUrl ? (
                      <Link
                        href={postUrl}
                        className="
                          inline-flex h-8 items-center rounded-full
                          border border-orange-200 bg-orange-50 px-3
                          text-[12px] font-extrabold text-orange-800
                          hover:bg-orange-100
                        "
                        title="最新の投稿を開く"
                      >
                        投稿を見る
                      </Link>
                    ) : (
                      <span className="text-[11px] text-slate-500">投稿リンクなし</span>
                    )}

                    {postTiles.length > 0 ? (
                      <span className="text-[11px] font-semibold text-slate-500">
                        関連投稿 {postTiles.length}件
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">関連投稿なし</span>
                    )}
                  </div>

                  {/* related posts strip (avoid duplicate placeThumb) */}
                  {postTiles.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                      {postTiles.map(({ p, thumb }) => {
                        const rs2 =
                          typeof p.recommend_score === "number" && p.recommend_score >= 1 && p.recommend_score <= 10
                            ? p.recommend_score
                            : null;

                        const price2 = formatPrice(p.price_yen, p.price_range);

                        return (
                          <Link
                            key={p.post_id}
                            href={`/posts/${p.post_id}`}
                            className="shrink-0 w-[92px]"
                            title={p.display_name ?? "ユーザー"}
                          >
                            <div className="relative h-[92px] w-[92px] overflow-hidden rounded-xl bg-slate-100 ring-1 ring-black/5">
                              {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <div className="h-full w-full grid place-items-center text-lg">📷</div>
                              )}

                              {/* score badge */}
                              {rs2 ? (
                                <div className="absolute left-1 top-1 rounded-full bg-black/70 px-2 py-[2px] text-[10px] font-extrabold text-white">
                                  {rs2}
                                </div>
                              ) : null}

                              {/* price micro-badge */}
                              {price2 ? (
                                <div className="absolute left-1 bottom-1 rounded-full bg-white/85 px-2 py-[2px] text-[10px] font-extrabold text-slate-800 backdrop-blur">
                                  {price2}
                                </div>
                              ) : null}

                              {/* identity */}
                              <MiniIdentity displayName={p.display_name} avatarUrl={p.avatar_url} />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
