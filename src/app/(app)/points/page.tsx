// app/(points)/points/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Tx = {
  id: number;
  amount: number;
  reason: string;
  created_at: string;
};

function reasonLabel(reason: string) {
  switch (reason) {
    case "signup_bonus":
      return "初回投稿ボーナス";
    case "daily_post":
      return "投稿（1日1回）";
    case "invite_bonus":
      return "招待ボーナス";
    case "visit_conversion":
      return "保存した店に来店";
    case "redeem_request":
      return "交換申請";
    default:
      return reason;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default async function PointsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/required?next=%2Fpoints");

  const [{ data: balanceRow }, { data: txs }] = await Promise.all([
    supabase
      .from("point_balances")
      .select("balance, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("point_transactions")
      .select("id, amount, reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const balance = balanceRow?.balance ?? 0;
  const redeemable = Math.floor(balance / 1000) * 1000;
  const nextTarget = redeemable + 1000;
  const progress = clamp(((balance - redeemable) / 1000) * 100, 0, 100);

  const canRedeem = balance >= 1000;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ポイント</h1>

          <p className="mt-1 text-sm text-gray-600">
            貯めたポイントは <span className="font-semibold">1000pt = 1000円分</span> としてAmazonギフト券に交換できます。
            <br className="hidden sm:block" />
            ギフト券は <span className="font-semibold">メール</span> で届きます（送信元：
            <span className="ml-1 font-mono">rewards@gourmeet.jp</span>）。
          </p>
        </div>

        {/* ✅ 1000pt未満でも押せる（= redeemページへは行ける） */}
        <Link
          href="/points/redeem"
          className={[
            "shrink-0 rounded-full px-4 py-2 text-sm font-semibold",
            "shadow-sm transition",
            // 交換可能/不可で見た目は変えるが、クリックは常に可能
            canRedeem
              ? "bg-orange-700 text-white hover:bg-orange-800"
              : "bg-orange-700/10 text-orange-900 hover:bg-orange-700/15",
          ].join(" ")}
          title={canRedeem ? "交換申請へ" : "交換条件を確認"}
        >
          ここからAmazonギフト券に交換する
        </Link>
      </div>

      {/* Balance card */}
      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Current Balance
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-4xl font-extrabold tracking-tight">
                {balance.toLocaleString()}
              </div>
              <div className="text-lg font-bold text-gray-700">pt</div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">交換可能</div>
            <div className="mt-1 text-lg font-bold">
              {redeemable.toLocaleString()} <span className="text-gray-600">pt</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              更新：{balanceRow?.updated_at ? new Date(balanceRow.updated_at).toLocaleString() : "—"}
            </div>
          </div>
        </div>

        {/* progress */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              次の交換まで{" "}
              <span className="font-semibold">
                {Math.max(0, nextTarget - balance).toLocaleString()}pt
              </span>
            </span>
            <span>{Math.round(progress)}%</span>
          </div>

          {/* ✅ オレンジ寄せ */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className="h-2 rounded-full bg-orange-700"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="rounded-full bg-black/[.04] px-2 py-1">
              交換単位：<span className="font-semibold">1000pt</span>
            </span>
            <span className="rounded-full bg-black/[.04] px-2 py-1">

            </span>
            <span className="rounded-full bg-black/[.04] px-2 py-1">
              送付：<span className="font-mono font-semibold">rewards@gourmeet.jp</span>
            </span>
          </div>

          {/* ✅ “※”を枠で囲まず自然に */}
          <p className="mt-3 text-xs text-gray-500">
            ※ 交換申請はいつでも行うことができます。実際に送付されるのは <span className="font-semibold">1000pt以上</span> の場合に限ります。
          </p>
        </div>
      </section>

      {/* How to earn */}
      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-base font-bold">ポイントの貯め方</h2>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-black/[.03] p-4">
            <div className="text-sm font-semibold">① 初回投稿ボーナス</div>
            <div className="mt-1 text-sm text-gray-700">
              1回でも投稿したユーザーに <span className="font-bold">+500pt</span>。
              <div className="mt-1 text-xs text-gray-600">
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-black/[.03] p-4">
            <div className="text-sm font-semibold">② 継続投稿（1日1回まで）</div>
            <div className="mt-1 text-sm text-gray-700">
              投稿すると <span className="font-bold">+50pt</span>（1日1投稿まで）。
            </div>
          </div>

          <div className="rounded-2xl bg-black/[.03] p-4">
            <div className="text-sm font-semibold">③ 招待ボーナス</div>
            <div className="mt-1 text-sm text-gray-700">
              招待コード経由で新規ユーザーが参加し、<span className="font-semibold">初回投稿</span>まで完了すると
              招待した側に <span className="font-bold">+200pt</span>。
            </div>
          </div>

          <div className="rounded-2xl bg-black/[.03] p-4">
            <div className="text-sm font-semibold">④ 保存したお店に来店</div>
            <div className="mt-1 text-sm text-gray-700">
              「投稿が来店のきっかけ」になった場合、
              <span className="font-semibold">投稿者</span> と <span className="font-semibold">来店者</span> の両方に
              <span className="font-bold"> +300pt</span>。
              <div className="mt-1 text-xs text-gray-600">
              </div>
            </div>
          </div>
        </div>

        {/* ✅ “※”を1行で自然に */}
        <p className="mt-4 text-xs text-gray-500">
          ※ 1日の獲得上限は <span className="font-semibold">1000pt</span> です。
        </p>
      </section>

      {/* History */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">最近の履歴</h2>
          <span className="text-xs text-gray-500">最新30件</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
          {(txs as Tx[] | null)?.length ? (
            <ul className="divide-y divide-black/5">
              {(txs as Tx[]).map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">{reasonLabel(t.reason)}</div>
                    <div className="text-xs text-gray-500">{new Date(t.created_at).toLocaleString()}</div>
                  </div>

                  <div
                    className={[
                      "rounded-full px-3 py-1 text-sm font-bold",
                      t.amount >= 0
                        ? "bg-orange-700/10 text-orange-900"
                        : "bg-rose-500/10 text-rose-700",
                    ].join(" ")}
                  >
                    {t.amount >= 0 ? `+${t.amount}` : t.amount} pt
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-gray-600">
              まだ履歴がありません。まずは1件投稿して +500pt を受け取ろう。
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
