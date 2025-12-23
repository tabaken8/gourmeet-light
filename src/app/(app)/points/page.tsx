// app/(app)/points/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InviteCodeModalTrigger from "../../../components/InviteCodeModalTrigger";

type Tx = {
  id: number;
  amount: number;
  reason: string;
  created_at: string;
  exchange_ticket_events?: { source_tx_id: number }[] | null;
};

type TicketRow = { balance: number; updated_at: string } | null;

function reasonLabel(reason: string) {
  switch (reason) {
    case "signup_bonus":
      return "初回投稿ボーナス";
    case "daily_post":
      return "投稿（1日1回）";
    case "invite_bonus":
      return "招待ボーナス";
    case "visit_conversion":
      return "保存した店に来店(導入予定)";
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

  const [{ data: balanceRow }, { data: txs }, { data: ticketRow }] =
    await Promise.all([
      supabase
        .from("point_balances")
        .select("balance, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),

      // ✅ invite_bonus のときに「このtxでチケット付与が起きたか」をJOINで判定する
      supabase
        .from("point_transactions")
        .select("id, amount, reason, created_at, exchange_ticket_events(source_tx_id)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),

      supabase
        .from("exchange_tickets")
        .select("balance, updated_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const balance = balanceRow?.balance ?? 0;

  const tickets = (ticketRow as TicketRow)?.balance ?? 0;
  const canRedeem = balance >= 1000 && tickets >= 1;

  const redeemableByPoints = Math.floor(balance / 1000) * 1000;
  const nextTarget = redeemableByPoints + 1000;
  const progress = clamp(((balance - redeemableByPoints) / 1000) * 100, 0, 100);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ポイント</h1>

          <p className="mt-1 text-sm text-gray-600">
            貯めたポイントは{" "}
            <span className="font-semibold">1000pt = 1000円分</span>{" "}
            として「選べるe-ギフト」に交換できます。
            <br className="hidden sm:block" />
            交換には <span className="font-semibold">1000pt</span> と{" "}
            <span className="font-semibold">交換チケット1枚</span> が必要です（チケットは招待成立で獲得）。
          </p>
        </div>

        {/* CTAs */}
        <div className="shrink-0 flex flex-col gap-2 w-[260px]">
          <Link
            href="/points/redeem"
            className={[
              "rounded-2xl border border-black/10 bg-white p-3",
              "shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition",
              "hover:-translate-y-[1px] hover:shadow-[0_14px_40px_rgba(0,0,0,0.08)]",
              "focus:outline-none focus:ring-2 focus:ring-orange-700/30",
            ].join(" ")}
            title={canRedeem ? "交換申請へ" : "交換条件を確認"}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold tracking-tight">ギフトに交換</div>
                <div className="mt-1 text-xs text-gray-600">
                  {canRedeem ? "交換申請へ進む" : "1000pt + チケット1枚"}
                </div>
              </div>

              <div
                className={[
                  "rounded-full px-3 py-1 text-xs font-bold",
                  canRedeem
                    ? "bg-orange-700 text-white"
                    : "bg-orange-700/10 text-orange-900",
                ].join(" ")}
              >
                {canRedeem ? "申請" : "条件"}
              </div>
            </div>
          </Link>

          <Link
            href="/points/gifts"
            className={[
              "rounded-2xl border border-black/10 bg-white p-3",
              "shadow-[0_10px_30px_rgba(0,0,0,0.06)] transition",
              "hover:-translate-y-[1px] hover:shadow-[0_14px_40px_rgba(0,0,0,0.08)]",
              "focus:outline-none focus:ring-2 focus:ring-orange-700/30",
            ].join(" ")}
            title="受け取り済みギフトを見る"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold tracking-tight">受け取り済みギフト</div>
                <div className="mt-1 text-xs text-gray-600">ギフトの保管庫</div>
              </div>

              <div className="rounded-full bg-black/[.06] px-3 py-1 text-xs font-bold text-gray-800">
                見る
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Balance card */}
      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">現在</div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="text-4xl font-extrabold tracking-tight">
                {balance.toLocaleString()}
              </div>
              <div className="text-lg font-bold text-gray-700">pt</div>
            </div>

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/[.04] px-3 py-1 text-xs text-gray-700">
              <span className="font-semibold">交換チケット</span>
              <span className="font-mono font-semibold">{tickets}</span>
              <span>枚</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">交換条件</div>
            <div className="mt-1 text-sm font-bold text-gray-900">1000pt + チケット1枚</div>
            <div className="mt-1 text-xs text-gray-500">
              更新：
              {balanceRow?.updated_at
                ? new Date(balanceRow.updated_at).toLocaleString()
                : "—"}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              次の1000ptまで{" "}
              <span className="font-semibold">
                {Math.max(0, nextTarget - balance).toLocaleString()}pt
              </span>
            </span>
            <span>{Math.round(progress)}%</span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
            <div className="h-2 rounded-full bg-orange-700" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="rounded-full bg-black/[.04] px-2 py-1">
              交換単位：<span className="font-semibold">1000pt</span>
            </span>
            <span className="rounded-full bg-black/[.04] px-2 py-1">
              必要チケット：<span className="font-semibold">1枚</span>
            </span>
            <span className="rounded-full bg-black/[.04] px-2 py-1">
              1日の獲得上限：<span className="font-semibold">1000pt</span>
            </span>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            ※ チケットは「招待が成立（相手が初回投稿まで完了）」したときに付与されます。
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
            </div>
          </div>

          <div className="rounded-2xl bg-black/[.03] p-4">
            <div className="text-sm font-semibold">② 投稿（1日1回まで）</div>
            <div className="mt-1 text-sm text-gray-700">
              投稿すると <span className="font-bold">+50pt</span>（1日1投稿まで）。
            </div>
          </div>

          <div className="rounded-2xl bg-black/[.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold">③ 招待ボーナス</div>
              <InviteCodeModalTrigger />
            </div>

            <div className="mt-1 text-sm text-gray-700">
              招待コード経由で新規ユーザーが参加し、
              <span className="font-semibold">初回投稿</span>まで完了すると
              招待した側に <span className="font-bold">+200pt</span> かつ{" "}
              <span className="font-bold">交換チケット +1枚</span>。
            </div>
          </div>

          <div className="rounded-2xl bg-black/[.03] p-4">
            <div className="text-sm font-semibold">④ 保存したお店に来店</div>
            <div className="mt-1 text-sm text-gray-700">
              「投稿が来店のきっかけ」になった場合、
              <span className="font-semibold">投稿者</span> と{" "}
              <span className="font-semibold">来店者</span> の両方に
              <span className="font-bold"> +300pt</span>。
            </div>
          </div>
        </div>

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
              {(txs as Tx[]).map((t) => {
                const ticketGranted =
                  t.reason === "invite_bonus" && (t.exchange_ticket_events?.length ?? 0) > 0;

                return (
                  <li key={t.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">{reasonLabel(t.reason)}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(t.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {ticketGranted ? (
                        <div className="rounded-full bg-black/[.06] px-3 py-1 text-xs font-bold text-gray-800">
                          チケット +1
                        </div>
                      ) : null}

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
                    </div>
                  </li>
                );
              })}
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
