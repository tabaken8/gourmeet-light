// src/app/auth/update/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTranslations } from "next-intl";

export default function UpdatePasswordPage() {
    const supabase = createClientComponentClient();
    const router = useRouter();
    const t = useTranslations("auth");
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
        <main className="rounded-2xl bg-white dark:bg-[#16181e] dark:border dark:border-white/[.08] p-8 shadow-sm max-w-md">
            <h1 className="mb-4 text-2xl font-bold dark:text-gray-100">{t("newPassword")}</h1>
            <form onSubmit={submit} className="space-y-3">
                <input className="w-full rounded border border-black/10 dark:border-white/15 bg-white dark:bg-white/[.06] px-3 py-2 text-slate-900 dark:text-gray-100 outline-none focus:border-orange-600 dark:focus:border-white/25 placeholder:text-slate-400 dark:placeholder:text-gray-500"
                    type="password" placeholder={t("sixCharsMin")}
                    value={pw} onChange={e => setPw(e.target.value)} minLength={6} required />
                <input className={"w-full rounded border px-3 py-2 bg-white dark:bg-white/[.06] text-slate-900 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 " + (pw2 ? (match ? "border-green-500" : "border-red-500") : "border-black/10 dark:border-white/15")}
                    type="password" placeholder={t("confirm")}
                    value={pw2} onChange={e => setPw2(e.target.value)} required />
                <button disabled={!match}
                    className={"inline-flex h-11 items-center rounded-full px-6 text-white " + (match ? "bg-orange-700" : "bg-orange-700/60 cursor-not-allowed")}>
                    {t("update")}
                </button>
                {msg && <p className="text-sm text-red-600">{msg}</p>}
            </form>
        </main>
    );
}
