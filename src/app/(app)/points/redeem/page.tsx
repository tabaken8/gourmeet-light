// app/(app)/points/redeem/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RequestRedeemButton from "@/components/RequestRedeemButton";

type TicketRow = { balance: number } | null;




export default async function RedeemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/required?next=%2Fpoints%2Fredeem");

  const [{ data: balanceRow }, { data: ticketRow }] = await Promise.all([
    supabase
      .from("point_balances")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("exchange_tickets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const balance = balanceRow?.balance ?? 0;
  const tickets = (ticketRow as TicketRow)?.balance ?? 0;

  const canRedeem = balance >= 1000 && tickets >= 1;


  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">選べるe-ギフトに交換</h1>
          <p className="mt-1 text-sm text-gray-600">
            交換したギフトは「受け取り済みギフト」ページに届きます。
          </p>
        </div>
        <Link
          href="/points"
          className="text-sm font-semibold text-gray-700 hover:underline"
        >
          戻る
        </Link>
      </div>

      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Balance
            </div>
            <div className="mt-1 text-3xl font-extrabold">
              {balance.toLocaleString()} pt
            </div>

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-black/[.04] px-3 py-1 text-xs text-gray-700">
              <span className="font-semibold">交換チケット</span>
              <span className="font-mono font-semibold">{tickets}</span>
              <span>枚</span>
            </div>
          </div>

          <div className="text-right text-sm text-gray-600">
            交換条件：
            <div className="mt-1 font-bold text-gray-900">1000pt + チケット1枚</div>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          ※ チケットは「招待が成立（相手が初回投稿まで完了）」したときに付与されます。
        </p>

        <RequestRedeemButton canRedeem={canRedeem} points={1000} />

        {!canRedeem && (
          <div className="mt-3 text-xs text-gray-600 space-y-1">
            {balance < 1000 ? (
              <div>
                あと{" "}
                <span className="font-semibold">
                  {(1000 - balance).toLocaleString()}pt
                </span>{" "}
                で交換できます。
              </div>
            ) : null}
            {tickets < 1 ? (
              <div>
                交換チケットがありません。招待成立で{" "}
                <span className="font-semibold">+1枚</span> されます。
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Link
            href="/points/gifts"
            className="text-sm font-semibold text-gray-700 hover:underline"
          >
            受け取り済みギフトを見る
          </Link>

          <Link
            href="/points"
            className="text-sm font-semibold text-gray-700 hover:underline"
          >
            ポイントへ戻る
          </Link>
        </div>
      </section>
    </main>
  );
}
