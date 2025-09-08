"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function strengthLabel(pw: string) {
    const len = pw.length;
    const varc = Number(/[a-z]/.test(pw)) + Number(/[A-Z]/.test(pw)) + Number(/[0-9]/.test(pw)) + Number(/[^a-zA-Z0-9]/.test(pw));
    const score = (len >= 12 ? 2 : len >= 8 ? 1 : 0) + (varc >= 3 ? 2 : varc >= 2 ? 1 : 0);
    return score >= 3 ? "strong" : score === 2 ? "medium" : "weak";
}

export default function SignUpPage() {
    const supabase = createClientComponentClient();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [show, setShow] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const match = pw.length > 0 && pw === pw2;
    const strength = useMemo(() => strengthLabel(pw), [pw]);
    const canSubmit = email && pw.length >= 6 && match && !loading;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        setMsg(null);
        const { data, error } = await supabase.auth.signUp({ email, password: pw });
        setLoading(false);
        if (error) return setMsg(error.message);
        if (data.user && !data.session) setMsg("確認メールを送信しました。受信ボックスをご確認ください。");
        else { router.push("/"); router.refresh(); }
    };

    return (
        <main className="grid gap-8 md:grid-cols-2">
            <section className="rounded-2xl bg-white p-8 shadow-sm">
                <h1 className="mb-6 text-2xl font-bold tracking-tight">会員登録</h1>
                <form onSubmit={submit} className="space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-sm">メールアドレス</span>
                        <input className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-orange-600"
                            type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-sm">パスワード</span>
                        <div className="flex gap-2">
                            <input className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-orange-600"
                                type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required autoComplete="new-password" />
                            <button type="button" onClick={() => setShow(v => !v)} className="rounded-lg border border-black/10 px-3 text-sm hover:bg-black/[.04]">
                                {show ? "隠す" : "表示"}
                            </button>
                        </div>
                        {pw && (
                            <p className={"mt-1 text-xs " + (strength === "strong" ? "text-green-600" : strength === "medium" ? "text-amber-600" : "text-red-600")}>
                                強度: {strength}
                            </p>
                        )}
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-sm">パスワード（確認）</span>
                        <input className={"w-full rounded-lg border px-3 py-2 outline-none " + (pw2 ? (match ? "border-green-500" : "border-red-500") : "border-black/10")}
                            type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" />
                        {pw2 && !match && <p className="mt-1 text-xs text-red-600">一致しません。</p>}
                    </label>

                    {msg && <p className="text-sm text-orange-800">{msg}</p>}

                    <button disabled={!canSubmit || loading}
                        className={"inline-flex h-11 items-center rounded-full px-6 text-white transition-colors " + (canSubmit ? "bg-orange-700 hover:bg-orange-800" : "bg-orange-700/60 cursor-not-allowed")}>
                        {loading ? "作成中..." : "登録する"}
                    </button>
                </form>
            </section>

            <aside className="rounded-2xl border border-orange-100 bg-[#edf7f1] p-8">
                <h2 className="mb-2 text-lg font-bold">会員特典</h2>
                <ul className="list-disc pl-5 text-sm leading-6 text-black/75">
                    <li>投稿の作成・保存ができます</li>
                    <li>お気に入りの管理ができます</li>
                    <li>通知やメール連携（今後）</li>
                </ul>
                <a href="/auth/login" className="mt-6 inline-flex h-11 items-center rounded-full border border-orange-800 px-6 font-medium text-orange-900 hover:bg-orange-800 hover:text-white">
                    すでにアカウントをお持ちの方
                </a>
            </aside>
        </main>
    );
}
