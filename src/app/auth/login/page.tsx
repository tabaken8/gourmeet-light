"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [pw, setPw] = useState("");
    const [show, setShow] = useState(false);
    const [remember, setRemember] = useState(true);
    const [msg, setMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const supabase = createClientComponentClient();

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsg(null);
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: pw,
        });
        setLoading(false);
        if (error) return setMsg(error.message);
        router.push("/");
        router.refresh();
    };

    return (
        <main className="min-h-screen bg-[#fffaf5] py-12">
            <div className="mx-auto max-w-5xl px-4">
                <h1 className="sr-only">Log in</h1>

                <div className="grid gap-8 md:grid-cols-2">
                    {/* 左：ログインフォーム */}
                    <section aria-label="ログイン" className="rounded-2xl bg-white p-8 shadow-sm">
                        <h2 className="mb-6 text-2xl font-bold tracking-tight">ログイン</h2>

                        <form onSubmit={onSubmit} className="space-y-4">
                            <label className="block">
                                <span className="mb-1 block text-sm">メールアドレス</span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                    className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none focus:border-orange-600"
                                />
                            </label>

                            <label className="block">
                                <span className="mb-1 block text-sm">パスワード</span>
                                <div className="flex items-stretch gap-2">
                                    <input
                                        type={show ? "text" : "password"}
                                        value={pw}
                                        onChange={(e) => setPw(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 outline-none focus:border-orange-600"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShow((v) => !v)}
                                        className="whitespace-nowrap rounded-lg border border-black/10 px-3 text-sm hover:bg-black/[.04]"
                                        aria-pressed={show}
                                    >
                                        {show ? "隠す" : "表示"}
                                    </button>
                                </div>
                            </label>

                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(e) => setRemember(e.target.checked)}
                                    className="h-4 w-4 accent-orange-700"
                                />
                                <span className="text-sm">ログイン状態を保持する</span>
                            </label>

                            {msg && <p className="text-sm text-red-600">{msg}</p>}

                            <button
                                disabled={loading}
                                className="inline-flex h-11 items-center justify-center rounded-full bg-orange-700 px-6 text-white transition-colors hover:bg-orange-800 disabled:opacity-60"
                            >
                                {loading ? "ログイン中..." : "ログイン"}
                            </button>

                            <div className="mt-2">
                                <a href="/auth/reset" className="text-sm text-orange-800 underline">
                                    パスワードをお忘れの方はこちら
                                </a>
                            </div>
                        </form>
                    </section>

                    {/* 右：新規登録カード */}
                    <aside
                        aria-label="新規会員登録"
                        className="rounded-2xl border border-orange-100 bg-[#fff7ed] p-8"
                    >
                        <h2 className="mb-2 text-lg font-bold">新規会員登録（無料）</h2>
                        <p className="mb-6 text-sm leading-6 text-black/70">
                            おいしいを友達とシェアしよう。
                            
                        </p>
                        <a
                            href="/auth/signup"
                            className="inline-flex h-11 items-center justify-center rounded-full border border-orange-800 px-6 font-medium text-orange-900 hover:bg-orange-800 hover:text-white"
                        >
                            会員登録する
                        </a>

                        <div className="mt-6 text-sm">
                            <a href="/auth/signup" className="text-orange-800 underline">
                                くわしく見る
                            </a>
                        </div>
                    </aside>
                </div>

                <p className="mt-8 text-center text-xs text-black/60">
                    セキュリティ保護のため、他サイトと同じパスワードの使い回しはお控えください。
                </p>
            </div>
        </main>
    );
}
