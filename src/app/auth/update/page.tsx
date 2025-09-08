// src/app/auth/update/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function UpdatePasswordPage() {
    const supabase = createClientComponentClient();
    const router = useRouter();
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [msg, setMsg] = useState<string | null>(null);
    const match = pw.length >= 6 && pw === pw2;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) return setMsg(error.message);
        router.push("/auth/login");
        router.refresh();
    };

    return (
        <main className="rounded-2xl bg-white p-8 shadow-sm max-w-md">
            <h1 className="mb-4 text-2xl font-bold">新しいパスワード</h1>
            <form onSubmit={submit} className="space-y-3">
                <input className="w-full rounded border border-black/10 px-3 py-2"
                    type="password" placeholder="6文字以上"
                    value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />
                <input className={"w-full rounded border px-3 py-2 " + (pw2 ? (match ? "border-green-500" : "border-red-500") : "border-black/10")}
                    type="password" placeholder="確認"
                    value={pw2} onChange={e => setPw2(e.target.value)} required />
                <button disabled={!match}
                    className={"inline-flex h-11 items-center rounded-full px-6 text-white " + (match ? "bg-orange-700" : "bg-orange-700/60 cursor-not-allowed")}>
                    更新する
                </button>
                {msg && <p className="text-sm text-red-600">{msg}</p>}
            </form>
        </main>
    );
}
