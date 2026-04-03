"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Suspense } from "react";
import { MapPin } from "lucide-react";

import PostImageCarousel from "@/components/PostImageCarousel";
import PostMoreMenu from "@/components/PostMoreMenu";
import PostActions, { type LikerLite } from "@/components/PostActions";
import GenreVoteInline from "@/components/GenreVoteInline";
import FollowButton from "@/components/FollowButton";
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

function timeOfDayLabel(v: string | null | undefined) {
  if (v === "day") return "昼";
  if (v === "night") return "夜";
  return null;
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
  commentsSlot,
  placePhotosSlot,
  discoverSlot,
}: Props) {
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
        <div className="gm-card p-8 text-center text-sm text-slate-500">読み込み中...</div>
      </main>
    );
  }

  const prof = post.profiles;
  const display = prof?.display_name ?? "ユーザー";
  const avatar = prof?.avatar_url ?? null;
  const isPublic = prof?.is_public ?? true;
  const initial = (display || "U").slice(0, 1).toUpperCase();

  const score = clampScore(post.recommend_score);
  const visitedLabel = post.visited_on ? formatVisitedYYYYMMDD(post.visited_on) : null;
  const tod = timeOfDayLabel(post.time_of_day);
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

  return (
    <>
      <main className="mx-auto max-w-5xl px-3 md:px-6 py-6 md:py-10">
        <article className="gm-card overflow-hidden">
          {/* 店ヘッダー */}
          <section className="border-b border-black/[.06] px-4 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold text-slate-900">{post.place_name ?? "店名不明"}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-600">
                  {areaLabel ? <span className="font-semibold">{areaLabel}</span> : null}
                  {post.place_address ? <span className="truncate max-w-[520px]">{post.place_address}</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {mapUrl ? (
                    <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                      <MapPin size={14} />地図
                    </a>
                  ) : null}
                  {priceLabel ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">
                      価格: {priceLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <PostMoreMenu postId={post.id} isMine={isMine} />
            </div>
          </section>

          {/* 投稿サマリー */}
          <section className="border-b border-black/[.06] px-4 py-4">
            <div className="flex items-start gap-3 min-w-0">
              <Link href={`/u/${post.user_id}`} className="gm-press flex h-10 w-10 shrink-0 flex-none aspect-square items-center justify-center overflow-hidden rounded-full bg-orange-100 text-xs font-semibold text-orange-700 ring-1 ring-black/[.06]">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <Link href={`/u/${post.user_id}`} className="truncate text-sm font-semibold text-slate-900 hover:underline">
                      {display}
                    </Link>
                    {!isPublic ? <span className="text-[11px] text-slate-400">🔒</span> : null}
                  </div>
                  {showFollowButton ? (
                    <FollowButton targetUserId={post.user_id} initiallyFollowing={false} initiallyRequested={false} label={followCtaLabel} />
                  ) : null}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">{formatJST(post.created_at)}</div>
                {summaryLine ? <div className="mt-2 text-[12px] font-semibold text-slate-800 line-clamp-2">{summaryLine}</div> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                  {visitedLabel ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">来店日: {visitedLabel}</span>
                  ) : null}
                  {tod ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">時間帯: {tod}</span>
                  ) : null}
                  {score !== null ? (
                    <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 font-semibold text-orange-800">
                      おすすめ: <span className="ml-1 font-extrabold">{score.toFixed(1)}</span>/10
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* 写真 */}
          {imageUrls.length > 0 ? (
            <div className="-mx-3 md:mx-0 border-b border-black/[.06]">
              <div className="block w-full aspect-square overflow-hidden bg-slate-100">
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

          {/* 本文 */}
          {post.content ? (
            <section className="px-4 py-4 border-b border-black/[.06]">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{post.content}</p>
            </section>
          ) : null}

          {/* Details + Q&A */}
          <section className="px-4 py-4 border-b border-black/[.06]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-slate-900">Details</h2>
              <DetailRequestModal
                postId={post.id}
                postUserId={post.user_id}
                placeName={post.place_name}
                placeId={post.place_id}
                authorName={post.profiles?.display_name ?? null}
              />
            </div>
            {hasDetails ? (
              <div className="mt-3">
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {detailRows.map((r) => (
                      <div key={r.cat} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2">
                        <div className="text-[12px] font-semibold text-slate-600">{r.title}</div>
                        <div className="text-[12px] font-semibold text-slate-800">{r.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-slate-500">まだDetailsがありません。</div>
            )}
            {publicReqs.length > 0 ? (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-extrabold text-slate-900">補足 / Q&A</h3>
                  <div className="text-[11px] text-slate-400">{publicReqs.length}件</div>
                </div>
                <div className="mt-2 space-y-2">
                  {publicReqs.map((r: any) => {
                    const q = buildQuestionTextSafe(r);
                    const ans = ansByReq[r.id] ?? [];
                    return (
                      <div key={r.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <div className="text-[12px] font-bold text-slate-800">Q. <span className="font-semibold">{q || "（質問）"}</span></div>
                        <div className="mt-2 space-y-2">
                          {ans.map((a: any) => (
                            <div key={a.id} className="rounded-xl bg-slate-50 px-3 py-2">
                              <div className="text-[12px] font-bold text-slate-700">A.</div>
                              <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-900">{a.body}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          {/* Actions */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-black/[.06]">
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
                  <Suspense fallback={<div className="text-xs text-slate-500">ジャンルを読み込み中...</div>}>
                    <GenreVoteInline placeId={post.place_id} />
                  </Suspense>
                </div>
              </div>
            ) : null}
          </div>

          {/* Comments（Server Component スロット） */}
          <div id="comments" className="px-4 py-4 border-b border-black/[.06]">
            {commentsSlot}
          </div>

          {/* Place Photos（Server Component スロット） */}
          {placePhotosSlot ? (
            <div className="px-4 py-4 border-b border-black/[.06]">
              {placePhotosSlot}
            </div>
          ) : null}
        </article>

        {/* この人の他の投稿 */}
        <div className="mt-8">
          <UserOtherPostsStrip
            title={`${display} の他の投稿`}
            currentPostId={post.id}
            initialTab="genre"
            genreLabel={currentGenre}
            recent={miniRecent}
            sameGenre={miniSameGenre}
          />
        </div>
      </main>

      {/* More Discover（Server Component スロット） */}
      <div className="mx-auto max-w-5xl px-3 md:px-6 mt-0 mb-10">
        {discoverSlot}
      </div>
    </>
  );
}
