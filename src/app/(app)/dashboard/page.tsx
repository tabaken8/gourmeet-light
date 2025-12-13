import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedPage() {
    const supabase = await createClient();;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login"); // 未ログインはログイン画面へ
    }

    return (
        <main className="grid gap-8 md:grid-cols-2">
            <section className="rounded-2xl bg-white p-8 shadow-sm">
                <h1 className="mb-2 text-2xl font-bold tracking-tight">
                    会員専用ページ
                </h1>
                <p className="text-black/70">
                    ようこそ、<span className="font-semibold">{user.email}</span> さん
                </p>

                <div className="mt-6 rounded-xl border border-orange-100 bg-[#fff7ed] p-4">
                    <h2 className="mb-2 text-lg font-bold">あなた専用の情報</h2>
                    <ul className="list-disc pl-5 text-sm leading-6 text-black/75">
                        <li>ここに投稿一覧やマイページ機能を追加できます</li>
                        <li>Supabase DB からユーザーデータを読み込む想定</li>
                    </ul>
                </div>

                <form action="/auth/logout" method="post" className="mt-6">
                    <button className="inline-flex h-11 items-center rounded-full border border-black/15 px-6 hover:bg-black/[.04]">
                        ログアウト
                    </button>
                </form>
            </section>

            <aside className="rounded-2xl border border-orange-100 bg-[#fff7ed] p-8">
                <h2 className="mb-2 text-lg font-bold">お知らせ</h2>
                <p className="text-sm leading-6 text-black/75">
                    このページはログインした会員だけがアクセスできます。
                </p>
                <p className="mt-4 text-xs text-black/50">
                    （UIはデモ用
                </p>
            </aside>
        </main>
    );
}
