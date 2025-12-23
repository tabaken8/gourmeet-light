import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Gift = {
  id: string;
  status: string;
  gift_label: string | null;
  points_spent: number | null;
  amount_yen: number | null;
  created_at: string;
  delivered_at: string | null;
  expires_at: string | null;
};

function fmt(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("ja-JP");
  } catch {
    return d;
  }
}

function statusLabel(s: string) {
  switch (s) {
    case "pending":
      return { text: "準備中", cls: "bg-black/[.06] text-gray-800" };
    case "sent":
      return { text: "受け取り可", cls: "bg-orange-700/10 text-orange-900" };
    case "failed":
      return { text: "失敗", cls: "bg-rose-500/10 text-rose-700" };
    case "expired":
      return { text: "期限切れ", cls: "bg-black/[.06] text-gray-700" };
    default:
      return { text: s, cls: "bg-black/[.06] text-gray-800" };
  }
}

export default async function GiftsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/required?next=%2Fpoints%2Fgifts");

  const { data, error } = await supabase
    .from("point_gifts")
    .select(
      "id,status,gift_label,points_spent,amount_yen,created_at,delivered_at,expires_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const items = (data ?? []) as Gift[];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">受け取り済みギフト</h1>
          <p className="mt-1 text-sm text-gray-600">
            交換して届いた「選べるe-ギフト」の控えです。メールが見つからない時もここから確認できます。
          </p>
        </div>
        <Link href="/points" className="text-sm font-semibold text-gray-700 hover:underline">
          ポイントへ戻る
        </Link>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          読み込みに失敗しました: {error.message}
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-2xl border border-black/10 bg-white">
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-600">
            まだ受け取り済みギフトがありません。<br />
            <Link href="/points/redeem" className="font-semibold text-orange-800 hover:underline">
              交換申請へ
            </Link>
            <Link href="/points/gifts" className="text-sm font-semibold text-gray-700 hover:underline">
  受け取り済みギフト
</Link>

          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((g) => {
              const st = statusLabel(g.status);
              return (
                <li key={g.id} className="px-4 py-4">
                  <Link
                    href={`/points/gifts/${g.id}`}
                    className="block rounded-xl hover:bg-black/[.02]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {g.gift_label ?? "選べるe-ギフト"}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          申請: {fmt(g.created_at)}
                          {g.delivered_at ? ` / 送付: ${fmt(g.delivered_at)}` : ""}
                          {g.expires_at ? ` / 期限: ${fmt(g.expires_at)}` : ""}
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {g.points_spent ? `${g.points_spent.toLocaleString()}pt` : "—"}
                          {g.amount_yen ? `（${g.amount_yen.toLocaleString()}円相当）` : ""}
                        </div>
                      </div>

                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${st.cls}`}>
                        {st.text}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-3 text-xs text-gray-500">
        ※ ギフトコード/リンクは第三者に共有しないでください。
      </p>
    </main>
  );
}
