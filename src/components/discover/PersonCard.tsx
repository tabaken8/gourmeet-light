// src/components/discover/PersonCard.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { MapPin, Sparkles, ChevronLeft, ChevronRight, Utensils, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PersonMapItem } from "@/app/api/people-map/route";

function timeAgo(iso: string, t: (key: string, values?: any) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("minutesAgo", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("hoursAgo", { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("daysAgo", { count: day });
  const mon = Math.floor(day / 30);
  return t("monthsAgo", { count: mon });
}

function PersonCardItem({
  person,
  active,
  onTap,
  t,
}: {
  person: PersonMapItem;
  active: boolean;
  onTap: () => void;
  t: (key: string, values?: any) => string;
}) {
  const initial = (person.display_name || person.username || "U").slice(0, 1).toUpperCase();
  const topPosts = person.top_posts ?? [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter") onTap(); }}
      className={[
        "group relative rounded-2xl overflow-hidden shrink-0 transition-all duration-200 cursor-pointer",
        "bg-white dark:bg-[#16181e] border shadow-sm",
        active
          ? "border-orange-400 dark:border-orange-500/60 ring-2 ring-orange-100 dark:ring-orange-500/20 scale-[1.02]"
          : "border-slate-200/80 dark:border-white/[.08] hover:border-slate-300 dark:hover:border-white/15",
      ].join(" ")}
      style={{ width: 240 }}
    >
      {/* Top: Avatar + Name + Stats */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="h-11 w-11 rounded-full overflow-hidden bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            {person.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.avatar_url}
                alt={person.display_name || ""}
                className="h-11 w-11 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-base font-bold text-orange-700 dark:text-orange-400">{initial}</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-gray-100">
                {person.display_name || person.username || t("user")}
              </span>
              {!person.is_following && (
                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 px-1.5 py-px text-[8px] font-semibold text-blue-600 dark:text-blue-400">
                  <UserPlus size={7} />
                  {t("recommended")}
                </span>
              )}
            </div>
            {person.username && (
              <div className="truncate text-[10px] text-slate-400 dark:text-gray-500">
                @{person.username}
              </div>
            )}
            {!person.is_following && person.mutual_context && (
              <div className="truncate text-[9px] text-slate-400 dark:text-gray-600 mt-0.5">
                {person.mutual_context}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 font-medium text-slate-600 dark:text-gray-300">
            <Utensils size={8} className="opacity-60" />
            {t("items", { count: person.post_count })}
          </span>
          {person.avg_score > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 font-bold text-orange-600 dark:text-orange-300">
              <Sparkles size={8} />
              {person.avg_score.toFixed(1)}
            </span>
          )}
          {person.top_genre && (
            <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 font-medium text-slate-500 dark:text-gray-400 truncate max-w-[80px]">
              {person.top_genre}
            </span>
          )}
        </div>
      </div>

      {/* Area */}
      {person.area_name && (
        <div className="px-3 pb-1.5 flex items-center gap-1 text-[10px] text-slate-500 dark:text-gray-500">
          <MapPin size={9} className="shrink-0 opacity-60" />
          <span className="truncate">{person.area_name}</span>
        </div>
      )}

      {/* Top posts preview (up to 2) */}
      {topPosts.length > 0 && (
        <div className="mx-3 mb-2.5 space-y-1.5">
          {topPosts.map((post, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-white/[.04] border border-slate-100 dark:border-white/[.06] p-2"
            >
              {post.image_url && (
                <div className="h-10 w-10 rounded-md overflow-hidden bg-slate-200 dark:bg-[#1e2026] shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.image_url} alt="" className="h-10 w-10 object-cover" loading="lazy" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium text-slate-700 dark:text-gray-200">
                  {post.place_name ?? t("shop")}
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-slate-400 dark:text-gray-500">
                  {post.recommend_score != null && (
                    <span className="font-bold text-orange-500 dark:text-orange-400">
                      {post.recommend_score.toFixed(1)}
                    </span>
                  )}
                  <span>{timeAgo(post.created_at, t)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA — only when active */}
      {active && (
        <div className="px-3 pb-3">
          <Link
            href={`/u/${person.username ?? person.user_id}`}
            onClick={(e) => e.stopPropagation()}
            className={[
              "flex items-center justify-center gap-1 w-full rounded-full py-1.5 text-[11px] font-bold !text-white transition",
              person.is_following
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-blue-600 hover:bg-blue-700",
            ].join(" ")}
          >
            {person.is_following ? t("viewPosts") : t("viewProfile")}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function PersonCardCarousel({
  people,
  selectedUserId,
  onSelect,
}: {
  people: PersonMapItem[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
}) {
  const t = useTranslations("common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScroll, { passive: true });
    return () => el.removeEventListener("scroll", updateScroll);
  }, [people]);

  // Auto-scroll to selected
  useEffect(() => {
    if (!selectedUserId || !scrollRef.current) return;
    const idx = people.findIndex((p) => p.user_id === selectedUserId);
    if (idx < 0) return;
    const el = scrollRef.current;
    const cardW = 240 + 12; // width + gap
    const targetX = idx * cardW - el.clientWidth / 2 + cardW / 2;
    requestAnimationFrame(() => {
      el.scrollTo({ left: Math.max(0, targetX), behavior: "smooth" });
    });
  }, [selectedUserId, people]);

  if (people.length === 0) return null;

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  };

  return (
    <div className="relative mt-2">
      {/* Cards */}
      <div
        ref={scrollRef}
        className="people-card-strip flex gap-3 overflow-x-auto px-1 py-1 scroll-smooth"
        style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
      >
        {people.map((person) => (
          <div key={person.user_id} style={{ scrollSnapAlign: "center" }}>
            <PersonCardItem
              person={person}
              active={selectedUserId === person.user_id}
              onTap={() => onSelect(person.user_id)}
              t={t}
            />
          </div>
        ))}
      </div>

      {/* Chevrons (desktop) */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-white/90 dark:bg-[#1e2026]/90 shadow border border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-[#1e2026] transition"
        >
          <ChevronLeft size={16} className="text-slate-600 dark:text-gray-300" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-white/90 dark:bg-[#1e2026]/90 shadow border border-slate-200 dark:border-white/10 hover:bg-white dark:hover:bg-[#1e2026] transition"
        >
          <ChevronRight size={16} className="text-slate-600 dark:text-gray-300" />
        </button>
      )}

      {/* Count */}
      <div className="text-center text-[10px] text-slate-400 dark:text-gray-600 mt-1 pb-0.5">
        {t("peopleCount", { count: people.length })}
      </div>

      <style jsx global>{`
        .people-card-strip::-webkit-scrollbar { display: none; }
        .people-card-strip { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
