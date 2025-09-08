// src/app/(app)/settings/username/page.tsx
"use client";

import { useEffect, useState } from "react";
import { validateUsernameLocal } from "@/lib/username";
import { supabase } from "@/lib/supabase/client"; // ← ここを修正（createClient ではなく supabase）

export default function UsernameSettings() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!username.trim()) {
      setError(null);
      setOk(null);
      return;
    }
    const id = setTimeout(async () => {
      const candidate = username.trim().replace(/^@+/, ""); // @は自動で剥がす
      const local = validateUsernameLocal(candidate);
      if (local) {
        setError(local);
        setOk(null);
        return;
      }
      setChecking(true);
      try {
        const { data, error } = await supabase.rpc("is_username_available", {
          in_name: candidate,
        });
        if (error) {
          setError("チェックに失敗しました");
          setOk(null);
          return;
        }
        setError(null);
        setOk(Boolean(data));
      } finally {
        setChecking(false);
      }
    }, 350); // デバウンス
    return () => clearTimeout(id);
  }, [username]);

  const canSave = ok === true && !checking;

  const onSave = async () => {
    const candidate = username.trim().replace(/^@+/, "");
    const local = validateUsernameLocal(candidate);
    if (local) {
      setError(local);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("ログインしてください");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ username: candidate })
      .eq("id", user.id);
    if (error) {
      setError(error.message);
      return;
    }
    alert("ユーザー名を更新しました");
  };

  return (
    <main className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">ユーザー名を設定</h1>
      <p className="text-sm text-black/60">
        プロフィールURL: gourmeet.app/u/{(username || "<yourname>").replace(/^@+/, "")}
      </p>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="w-full rounded-lg border px-3 py-2"
        placeholder="例: kenta.tabata（@を付けてもOK）"
      />
      {checking && <p className="text-sm">チェック中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && !error && <p className="text-sm text-green-600">利用できます</p>}
      {ok === false && !error && <p className="text-sm text-red-600">使用できません</p>}
      <button
        onClick={onSave}
        disabled={!canSave}
        className="rounded-xl px-4 py-2 bg-black text-white disabled:opacity-40"
      >
        保存
      </button>
    </main>
  );
}
