"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Search } from "lucide-react";

type UserLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const DEBOUNCE_MS = 220;

export default function SearchPage() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [suggests, setSuggests] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setSuggests([]);
      setActive(0);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("search_users", {
          q,
          limit_n: 8,
        });
        if (!error && Array.isArray(data)) {
          setSuggests(data as UserLite[]);
        } else {
          const qAt = q.replace(/^@+/, "");
          const [byUser, byName] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .ilike("username", `${qAt}%`)
              .limit(8),
            supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .ilike("display_name", `%${q}%`)
              .limit(8),
          ]);
          const map = new Map<string, UserLite>();
          (byUser.data ?? []).forEach((r) => map.set(r.id, r as UserLite));
          (byName.data ?? []).forEach((r) => map.set(r.id, r as UserLite));
          setSuggests(Array.from(map.values()).slice(0, 8));
        }
      } finally {
        setLoading(false);
        setActive(0);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [q]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggests.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, suggests.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = suggests[active];
      if (pick?.id) router.push(`/u/${pick.id}`);
    }
  };

  const goProfile = (u: UserLite) => {
    router.push(`/u/${u.id}`);
  };

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-8 md:px-6">
        {/* ヘッダー */}
        <header className="mb-5">
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
            Search
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            気になる人の “顔” を探して、タイムラインの向こう側に会いにいく。
          </p>
        </header>

        {/* 検索カード */}
        <section className="relative rounded-2xl border border-orange-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5">
          {/* 入力ボックス（ピル型） */}
          <div className="relative">
            <div className="group flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50/60 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus-within:border-orange-300 focus-within:bg-white focus-within:shadow-sm">
              <Search className="h-4 w-4 flex-shrink-0 text-orange-500" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="表示名 または @ユーザーID で検索"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                autoFocus
                inputMode="search"
              />
            </div>

            {/* ドロップダウン */}
            {q.trim() && (loading || suggests.length > 0) && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2">
                <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white/95 shadow-lg backdrop-blur">
                  {loading && suggests.length === 0 && (
                    <div className="px-4 py-3 text-xs text-slate-500">
                      検索中…
                    </div>
                  )}

                  {suggests.length > 0 && (
                    <ul className="max-h-72 overflow-y-auto py-1">
                      {suggests.map((u, idx) => {
                        const name = u.display_name || u.username || "ユーザー";
                        const initial = (name || "U")
                          .slice(0, 1)
                          .toUpperCase();

                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => goProfile(u)}
                              className={[
                                "group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs transition",
                                idx === active
                                  ? "bg-orange-50"
                                  : "hover:bg-orange-50/80",
                              ].join(" ")}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                {u.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={u.avatar_url}
                                    alt=""
                                    className="h-9 w-9 rounded-full border border-orange-100 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-600 ring-1 ring-orange-200">
                                    {initial}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="truncate text-[13px] font-medium text-slate-800">
                                    {u.display_name ?? "（表示名なし）"}
                                  </div>
                                  <div className="truncate text-[11px] text-slate-500">
                                    {u.username ? `@${u.username}` : ""}
                                  </div>
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {!loading && suggests.length === 0 && (
                    <div className="px-4 py-3 text-xs text-slate-500">
                      該当ユーザーが見つかりませんでした
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ヒント */}
          <p className="mt-3 text-[11px] text-slate-500">
            ↑↓ で候補を選択、Enter でプロフィールに移動できます。
          </p>

          <p className="mt-1 text-[11px] text-slate-400">
            例: <span className="font-mono">@kenta</span> /{" "}
            <span className="font-mono">Ken</span>
          </p>
        </section>
      </div>
    </main>
  );
}
