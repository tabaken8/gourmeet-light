// src/app/(app)/discover/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Compass, Users } from "lucide-react";
import PersonCardCarousel from "@/components/discover/PersonCard";
import type { PersonMapItem, PeopleMapResponse } from "@/app/api/people-map/route";

const PeopleMap = dynamic(() => import("@/components/discover/PeopleMap"), { ssr: false });

export default function DiscoverPage() {
  const router = useRouter();
  const [people, setPeople] = useState<PersonMapItem[]>([]);
  const [myCentroid, setMyCentroid] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/people-map");
        if (!res.ok) throw new Error("Failed to fetch");
        const data: PeopleMapResponse = await res.json();
        if (cancelled) return;
        setPeople(data.people ?? []);
        setMyCentroid(data.my_centroid ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSelectPerson = useCallback((userId: string | null) => {
    setSelectedUserId(userId);
  }, []);

  const handleCardSelect = useCallback((userId: string) => {
    setSelectedUserId(userId);
  }, []);

  const followingCount = people.filter((p) => p.is_following).length;
  const suggestedCount = people.filter((p) => !p.is_following).length;

  return (
    <main className="min-h-screen text-slate-800 dark:text-gray-200 bg-white dark:bg-transparent">
      <div className="mx-auto w-full max-w-6xl px-2 py-3 md:px-6 md:py-6">

        {/* Search bar (navigates to /search on tap) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => router.push("/search")}
          onKeyDown={(e) => { if (e.key === "Enter") router.push("/search"); }}
          className="
            mb-3 flex items-center gap-2 rounded-xl
            border border-slate-200 dark:border-white/10
            bg-slate-50 dark:bg-white/[.06]
            px-3 py-2.5 cursor-pointer
            hover:bg-slate-100 dark:hover:bg-white/[.08] transition
          "
        >
          <Search size={15} className="text-slate-400 dark:text-gray-500 shrink-0" />
          <span className="text-[13px] text-slate-400 dark:text-gray-500">
            お店やユーザーを検索…
          </span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="space-y-3">
            <div className="w-full rounded-xl bg-slate-100 dark:bg-[#1e2026] animate-pulse" style={{ height: "40vh", minHeight: 240 }} />
            <div className="flex gap-3 overflow-hidden">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-[240px] shrink-0 rounded-2xl bg-slate-100 dark:bg-[#1e2026] animate-pulse h-[180px]" />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-12 text-sm text-red-500">
            データの取得に失敗しました。リロードしてください。
          </div>
        )}

        {/* Empty state — no followees with posts */}
        {!loading && !error && people.length === 0 && (
          <div className="text-center py-16 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
              <Users size={28} className="text-orange-400" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-slate-700 dark:text-gray-200">
                フォロー中のユーザーの投稿がまだありません
              </p>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-gray-500">
                ユーザーをフォローすると、ここにみんなの食の地図が表示されます
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/search")}
              className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 hover:bg-orange-700 px-5 py-2 text-[12px] font-bold text-white transition"
            >
              <Search size={13} />
              ユーザーを探す
            </button>
          </div>
        )}

        {/* Map + Cards */}
        {!loading && !error && people.length > 0 && (
          <>
            {/* Section title */}
            <div className="mb-2 flex items-center gap-2 px-1">
              <Compass size={14} className="text-orange-500" />
              <h2 className="text-[13px] font-semibold text-slate-700 dark:text-gray-300">
                みんなの食の地図
              </h2>
              <span className="text-[10px] text-slate-400 dark:text-gray-600">
                {followingCount}人{suggestedCount > 0 ? ` + おすすめ${suggestedCount}人` : ""}
              </span>
            </div>

            <PeopleMap
              people={people}
              selectedUserId={selectedUserId}
              onSelectPerson={handleSelectPerson}
              initialCenter={myCentroid}
            />

            <PersonCardCarousel
              people={people}
              selectedUserId={selectedUserId}
              onSelect={handleCardSelect}
            />
          </>
        )}
      </div>
    </main>
  );
}
