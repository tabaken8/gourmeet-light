"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense } from "react";
import { MapPin, Navigation } from "lucide-react";
import { useTranslations } from "next-intl";

import PostImageCarousel from "@/components/PostImageCarousel";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostActions, { type LikerLite } from "@/components/PostActions";
import GenreVoteInline from "@/components/GenreVoteInline";
import FollowButton from "@/components/FollowButton";
import TranslateButton from "@/components/TranslateButton";
import DetailRequestModal from "./parts/DetailRequestModal";
import UserOtherPostsStrip from "./parts/UserOtherPostsStrip";

import { TAG_CATEGORIES, type TagCategory, findTagById, tagCategoryLabel } from "@/lib/postTags";
import * as DetailTemplates from "@/lib/detailTemplates";
import { queryKeys, fetchPostDetail } from "@/lib/queries";

const DT: any = DetailTemplates;

// ---- Utils ----

function buildQuestionTextSafe(r: any): string {
  if (typeof DT.buildQuestionTextFromTemplateIds === "function") {
    return String(DT.buildQuestionTextFromTemplateIds({ template_ids: r.template_ids, free_text: r.free_text }) ?? "");
  }
  const labelFor = typeof DT.labelForDetailTemplate === "function"
    ? (id: string) => String(DT.labelForDetailTemplate(id) ?? id)
    : (id: string) => {
        const labels = DT.DETAIL_TEMPLATE_LABELS as Record<string, string> | undefined;
        if (labels && typeof labels[id] === "string") return labels[id];
        const defs = DT.DETAIL_TEMPLATE_DEFS as Array<{ id: string; label: string }> | undefined;
        if (Array.isArray(defs)) { const hit = defs.find((x) => x?.id === id); if (hit?.label) return hit.label; }
        return id;
      };
  const parts: string[] = [];
  for (const id of (Array.isArray(r.template_ids) ? r.template_ids : [])) parts.push(labelFor(id));
  if (r.free_text?.trim()) parts.push(r.free_text.trim());
  return parts.filter(Boolean).join(" / ");
}

function formatJST(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatVisitedYYYYMMDD(isoOrDate: string) {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) {
    const m = isoOrDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}/${m[2]}/${m[3]}` : isoOrDate;
  }
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatYen(n: number) {
  try { return new Intl.NumberFormat("ja-JP").format(n); } catch { return String(n); }
}

function formatPrice(p: any): string | null {
  if (typeof p.price_yen === "number" && Number.isFinite(p.price_yen)) {
    return `¥${formatYen(Math.max(0, Math.floor(p.price_yen)))}`;
  }
  if (p.price_range) {
    const map: Record<string, string> = {
      "~999": "〜¥999", "1000-1999": "¥1,000〜¥1,999", "2000-2999": "¥2,000〜¥2,999",
      "3000-3999": "¥3,000〜¥3,999", "4000-4999": "¥4,000〜¥4,999", "5000-6999": "¥5,000〜¥6,999",
      "7000-9999": "¥7,000〜¥9,999", "10000-14999": "¥10,000〜¥14,999", "15000-19999": "¥15,000〜¥19,999",
      "20000-24999": "¥20,000〜¥24,999", "25000-29999": "¥25,000〜¥29,999",
      "30000-49999": "¥30,000〜¥49,999", "50000+": "¥50,000〜",
    };
    return map[p.price_range] ?? p.price_range;
  }
  return null;
}

function getAllImageUrls(p: any): string[] {
  const variants = Array.isArray(p.image_variants) ? p.image_variants : [];
  const fromVariants = variants.map((v: any) => v?.full ?? v?.thumb ?? null).filter((x: any): x is string => !!x);
  if (fromVariants.length > 0) return fromVariants;
  return (Array.isArray(p.image_urls) ? p.image_urls : []).filter((x: any): x is string => !!x);
}

function extractPrefCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const s = address.replace(/^日本[、,\s]*/u, "").replace(/〒\s*\d{3}-?\d{4}\s*/u, "").trim();
  const m = s.match(/(東京都|北海道|大阪府|京都府|.{2,3}県)([^0-9\s,、]{1,20}?(市|区|町|村))/u);
  if (!m) return null;
  return `${m[1]}${m[2]}`;
}

function timeOfDayLabel(v: string | null | undefined, t: (key: string) => string) {
  if (v === "day") return t("day");
  if (v === "night") return t("night");
  return null;
}

function metersToWalkMin(m: number | null): number | null {
  if (m == null || !Number.isFinite(m)) return null;
  return Math.max(1, Math.round(m / 80));
}

function buildDetailsRows(tagIds: string[] | null | undefined) {
  const ids = Array.isArray(tagIds) ? tagIds : [];
  const byCat = new Map<Exclude<TagCategory, "all">, string[]>();
  for (const id of ids) {
    const t = findTagById(id);
    if (!t) continue;
    const arr = byCat.get(t.category) ?? [];
    arr.push(t.label);
    byCat.set(t.category, arr);
  }
  const cats = TAG_CATEGORIES.map((x) => x.id).filter((x): x is Exclude<TagCategory, "all"> => x !== "all");
  return cats
    .map((cat) => {
      const labels = byCat.get(cat) ?? [];
      const uniq = Array.from(new Set(labels));
      return { cat, title: tagCategoryLabel(cat), value: uniq.join(" ・ "), has: uniq.length > 0 };
    })
    .filter((r) => r.has);
}

function clampScore(n: any): number | null {
  const v = typeof n === "number" ? n : n === null || n === undefined ? null : Number(n);
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(Math.min(10, Math.max(0, v)) * 10) / 10;
}

// ---- Component ----

type Props = {
  postId: string;
  meId: string | null;
  isMine: boolean;
  safeIndex: number;
  initiallyLiked: boolean;
  likeCount: number;
  initialLikers: LikerLite[];
  showFollowButton: boolean;
  followCtaLabel: string;
  nearestStation: { name: string; distance_m: number } | null;
  commentsSlot: React.ReactNode;
  placePhotosSlot: React.ReactNode;
  discoverSlot: React.ReactNode;
};

export default function PostMainContent({
  postId,
  meId,
  isMine,
  safeIndex,
  initiallyLiked,
  likeCount,
  initialLikers,
  showFollowButton,
  followCtaLabel,
  nearestStation,
  commentsSlot,
  placePhotosSlot,
  discoverSlot,
}: Props) {
  const t = useTranslations("postDetail");
  const { data } = useQuery({
    queryKey: queryKeys.postDetail(postId),
    queryFn: () => fetchPostDetail(postId),
  });

  const post = data?.post;
  const publicReqs = data?.publicReqs ?? [];
  const ansByReq = data?.ansByReq ?? {};
  const miniRecent = data?.miniRecent ?? [];
  const miniSameGenre = data?.miniSameGenre ?? [];

  if (!post) {
    // サーバーで setQueryData されているので通常ここには来ない
    return (
      <main className="mx-auto max-w-5xl px-3 md:px-6 py-6 md:py-10">
        <div className="gm-card p-8 text-center text-sm text-slate-500">{t("loading")}</div>
      </main>
    );
  }

  const prof = post.profiles;
  const display = prof?.display_name ?? t("user");
  const avatar = prof?.avatar_url ?? null;
  const isPublic = prof?.is_public ?? true;
  const initial = (display || "U").slice(0, 1).toUpperCase();

  const score = clampScore(post.recommend_score);
  const visitedLabel = post.visited_on ? formatVisitedYYYYMMDD(post.visited_on) : null;
  const tod = timeOfDayLabel(post.time_of_day, t);
  const priceLabel = formatPrice(post);
  const areaLabel = extractPrefCity(post.place_address);

  const mapUrl = post.place_id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.place_name ?? "place")}&query_place_id=${encodeURIComponent(post.place_id)}`
    : post.place_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.place_address)}`
    : null;

  const imageUrls = getAllImageUrls(post);
  const summaryLine = (post.content ?? "").trim().split("\n").map((s: string) => s.trim()).filter(Boolean)[0] ?? null;
  const detailRows = buildDetailsRows(post.tag_ids);
  const hasDetails = detailRows.length > 0;
  const currentGenre = (post.places?.primary_genre ?? "").trim() || null;

  const stationMin = metersToWalkMin(nearestStation?.distance_m ?? null);

  return (
    <>
      <main className="mx-auto max-w-5xl py-0 md:py-6">
        <article className="overflow-hidden">

          {/* 1. Place Header — text info first */}
          <section className="px-4 md:px-6 pt-5 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-extrabold text-slate-900 dark:text-gray-100 leading-tight">{post.place_name ?? t("unknownPlace")}</h1>

                {/* Location line: area + nearest station */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-slate-500 dark:text-gray-500">
                  {areaLabel ? <span>{areaLabel}</span> : null}
                  {nearestStation ? (
                    <span className="inline-flex items-center gap-1">
                      <Navigation size={11} className="text-slate-400 dark:text-gray-500" />
                      {nearestStation.name}{stationMin ? ` 徒歩${stationMin}分` : ""}
                    </span>
                  ) : null}
                </div>

                {/* Score + metadata inline */}
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {score !== null ? (
                    <span className="flex items-baseline gap-0.5">
                      <span className="text-2xl font-extrabold text-orange-500 dark:text-orange-400 leading-none">{score.toFixed(1)}</span>
                      <span className="text-[12px] font-semibold text-orange-400 dark:text-orange-500">/10</span>
                    </span>
                  ) : null}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500 dark:text-gray-500">
                    {priceLabel ? <span>{priceLabel}</span> : null}
                    {visitedLabel ? <span>{t("visitedOn")} {visitedLabel}</span> : null}
                    {tod ? <span>{tod}</span> : null}
                  </span>
                </div>

                {/* Google Maps link (above image) */}
                {mapUrl ? (
                  <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-medium text-orange-500 dark:text-orange-400 hover:underline">
                    <MapPin size={13} />Google Maps
                  </a>
                ) : null}
              </div>
              <PostMoreMenu postId={post.id} isMine={isMine} />
            </div>
          </section>

          {/* 2. Image Section */}
          {imageUrls.length > 0 ? (
            <div className="w-full">
              <div className="block w-full aspect-square overflow-hidden bg-slate-100 dark:bg-[#1e2026]">
                <PostImageCarousel
                  postId={post.id}
                  imageUrls={imageUrls}
                  initialIndex={safeIndex}
                  syncUrl={false}
                  eager={false as any}
                  preloadNeighbors={true as any}
                  fit={"cover" as any}
                  aspect={"square" as any}
                />
              </div>
            </div>
          ) : null}

          {/* 3. Below-image bar: Google Maps + Author */}
          <section className="px-4 md:px-6 pt-3 pb-3">
            <div className="flex items-center justify-between gap-3">
              {/* Author */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Link href={`/u/${(post as any).profiles?.username ?? post.user_id}`} className="gm-press flex h-9 w-9 shrink-0 flex-none aspect-square items-center justify-center overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900/30 text-xs font-semibold text-orange-700 dark:text-orange-400 ring-1 ring-black/[.06] dark:ring-white/[.08]">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initial
                  )}
                </Link>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Link href={`/u/${(post as any).profiles?.username ?? post.user_id}`} className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100 hover:underline">
                      {display}
                    </Link>
                    {!isPublic ? <span className="text-[11px] text-slate-400 dark:text-gray-500">🔒</span> : null}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500">{formatJST(post.created_at)}</span>
                </div>
              </div>
              {/* Right side: follow + map */}
              <div className="flex items-center gap-2 shrink-0">
                {showFollowButton ? (
                  <FollowButton targetUserId={post.user_id} initiallyFollowing={false} initiallyRequested={false} label={followCtaLabel} />
                ) : null}
                {mapUrl ? (
                  <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[.06] px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                    <MapPin size={12} />Maps
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          {/* 4. Content Section */}
          {post.content ? (
            <section className="px-4 md:px-6 pb-5">
              <TranslateButton text={post.content}>
                <p className="whitespace-pre-wrap text-[13.5px] leading-[1.75] text-slate-800 dark:text-gray-200">{post.content}</p>
              </TranslateButton>
            </section>
          ) : null}

          {/* 5. Details - flex-wrap chips */}
          <section className="px-4 md:px-6 pb-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-gray-100">Details</h2>
              <DetailRequestModal
                postId={post.id}
                postUserId={post.user_id}
                placeName={post.place_name}
                placeId={post.place_id}
                authorName={post.profiles?.display_name ?? null}
              />
            </div>
            {hasDetails ? (
              <div className="mt-3 space-y-3">
                {detailRows.map((r) => (
                  <div key={r.cat}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-1.5">{r.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.value.split(" ・ ").map((chip) => (
                        <span key={chip} className="inline-flex items-center rounded-full bg-slate-100 dark:bg-white/[.08] px-2.5 py-1 text-[12px] font-medium text-slate-700 dark:text-gray-300">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-slate-500 dark:text-gray-500">{t("noDetails")}</div>
            )}
          </section>

          {/* 6. Q&A Section */}
          {publicReqs.length > 0 ? (
            <section className="px-4 md:px-6 pb-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100">{t("supplementQA")}</h3>
                <div className="text-[11px] text-slate-400 dark:text-gray-500">{t("itemCount", { count: publicReqs.length })}</div>
              </div>
              <div className="mt-2 space-y-2">
                {publicReqs.map((r: any) => {
                  const q = buildQuestionTextSafe(r);
                  const ans = ansByReq[r.id] ?? [];
                  return (
                    <div key={r.id} className="rounded-2xl bg-slate-50 dark:bg-white/[.04] px-3.5 py-3">
                      <div className="text-[12px] font-bold text-slate-800 dark:text-gray-200">Q. <span className="font-semibold">{q || t("question")}</span></div>
                      <div className="mt-2 space-y-2">
                        {ans.map((a: any) => (
                          <div key={a.id} className="rounded-xl bg-white dark:bg-white/[.06] px-3 py-2">
                            <div className="text-[12px] font-bold text-slate-700 dark:text-gray-300">A.</div>
                            <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-900 dark:text-gray-100">{a.body}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* 7. Actions */}
          <div className="flex items-center justify-between px-4 md:px-6 py-4">
            <PostActions
              postId={post.id}
              postUserId={post.user_id}
              initialLiked={initiallyLiked}
              initialLikeCount={likeCount}
              initialLikers={initialLikers}
              meId={meId}
              initialWanted={false}
              initialBookmarked={false}
              initialWantCount={0}
              initialBookmarkCount={0}
            />
            {post.place_id ? (
              <div className="flex justify-end">
                <div className="inline-block w-auto max-w-full">
                  <Suspense fallback={<div className="text-xs text-slate-500">{t("genreLoading")}</div>}>
                    <GenreVoteInline placeId={post.place_id} />
                  </Suspense>
                </div>
              </div>
            ) : null}
          </div>

          {/* Brand separator before comments */}
          <div className="gm-brand-line" />

          {/* 8. Comments */}
          <div id="comments" className="px-4 md:px-6 py-5">
            {commentsSlot}
          </div>

          {/* 9. Place Photos */}
          {placePhotosSlot ? (
            <div className="px-4 md:px-6 py-5">
              {placePhotosSlot}
            </div>
          ) : null}
        </article>

        {/* この人の他の投稿 */}
        <div className="mt-8 px-3 md:px-6">
          <UserOtherPostsStrip
            title={t("userOtherPosts", { name: display })}
            currentPostId={post.id}
            initialTab="genre"
            genreLabel={currentGenre}
            recent={miniRecent}
            sameGenre={miniSameGenre}
          />
        </div>
      </main>

      {/* More Discover */}
      <div className="mx-auto max-w-5xl px-3 md:px-6 mt-0 mb-10">
        {discoverSlot}
      </div>
    </>
  );
}
