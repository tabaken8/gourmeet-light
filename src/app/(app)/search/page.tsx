"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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
      if (pick?.id) router.push(`/u/${pick.id}`); // ★ id ベース
    }
  };

  // ★ ここを id に変更
  const goProfile = (u: UserLite) => {
    router.push(`/u/${u.id}`);
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">検索</h1>

      <div className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="表示名 または @ユーザーID で検索"
          className="w-full rounded-xl border px-4 py-3 outline-none focus:border-black/40"
          autoFocus
          inputMode="search"
        />

        {q.trim() && (loading || suggests.length > 0) && (
          <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border bg-white shadow-lg">
            {loading && suggests.length === 0 && (
              <div className="px-4 py-3 text-sm text-black/60">検索中…</div>
            )}

            {suggests.map((u, idx) => (
              <button
                key={u.id}
                onClick={() => goProfile(u)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/5 ${
                  idx === active ? "bg-black/5" : ""
                }`}
              >
                {u.avatar_url ? (
                  <img
                    src={u.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover border"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-gray-200" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {u.display_name ?? ""}
                  </div>
                  <div className="truncate text-xs text-black/60">
                    {u.username ? `@${u.username}` : ""}
                  </div>
                </div>
              </button>
            ))}

            {!loading && suggests.length === 0 && (
              <div className="px-4 py-3 text-sm text-black/60">
                該当ユーザーが見つかりませんでした
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-black/60">
        例: <span className="font-mono">@kenta</span> /{" "}
        <span className="font-mono">Ken</span>
      </p>
    </main>
  );
}
