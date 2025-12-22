// app/(app)/points/redeem/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RedeemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/required?next=%2Fpoints%2Fredeem");

  const { data: balanceRow } = await supabase
    .from("point_balances")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  const balance = balanceRow?.balance ?? 0;
  const canRedeem = balance >= 1000;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-24 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Amazonギフト券に交換</h1>
          <p className="mt-1 text-sm text-gray-600">
            ギフト券はメールで届きます（送信元：<span className="font-mono">rewards@gourmeet.jp</span>）。
          </p>
        </div>
        <Link href="/points" className="text-sm font-semibold text-gray-700 hover:underline">
          戻る
        </Link>
      </div>

      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Balance</div>
            <div className="mt-1 text-3xl font-extrabold">{balance.toLocaleString()} pt</div>
          </div>
          <div className="text-right text-sm text-gray-600">
            交換単位：<span className="font-bold text-gray-900">1000 pt</span>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          ※ 交換は「申請 → 確認 → 送付」の流れです。
        </p>

        {/* ✅ ここでブロック（ギリギリ） */}
        <button
          disabled={!canRedeem}
          className={[
            "mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold shadow-sm transition",
            canRedeem
              ? "bg-orange-700 text-white hover:bg-orange-800"
              : "bg-orange-700/10 text-orange-900/40 cursor-not-allowed",
          ].join(" ")}
          title={!canRedeem ? "1000pt以上で交換できます" : "交換申請（次の実装でDBに書き込み）"}
        >
          1000ptを交換申請する
        </button>

        {!canRedeem && (
          <div className="mt-3 text-xs text-gray-600">
            あと <span className="font-semibold">{(1000 - balance).toLocaleString()}pt</span> で交換できます。
          </div>
        )}
      </section>
    </main>
  );
}
