"use client";
import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function ResetPage() {
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/update`,
    });
    setLoading(false);
    setMsg(error ? error.message : "パスワード再設定用のメールを送信しました。");
  };

  return (
    <main className="rounded-2xl bg-white p-8 shadow-sm max-w-md">
      <h1 className="mb-4 text-2xl font-bold">パスワードをリセット</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full rounded border border-black/10 px-3 py-2"
               type="email" required placeholder="you@example.com"
               value={email} onChange={e=>setEmail(e.target.value)} />
        <button disabled={loading}
          className="inline-flex h-11 items-center rounded-full bg-orange-700 px-6 text-white disabled:opacity-60">
          {loading ? "送信中..." : "メールを送る"}
        </button>
      </form>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </main>
  );
}
