import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GiftSecretActions from "@/components/GiftSecretActions";

type Gift = {
  id: string;
  status: string;
  gift_label: string | null;
  points_spent: number | null;
  amount_yen: number | null;
  gift_code: string | null;
  gift_url: string | null;
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

export default async function GiftDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth/required?next=${encodeURIComponent(`/points/gifts/${params.id}`)}`);

  const { data, error } = await supabase
    .from("point_gifts")
    .select(
      "id,status,gift_label,points_spent,amount_yen,gift_code,gift_url,created_at,delivered_at,expires_at"
    )
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // 権限/存在しない等は notFound でもOK
    notFound();
  }
  if (!data) notFound();

  const g = data as Gift;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 md:pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ギフト詳細</h1>
          <p className="mt-1 text-sm text-gray-600">
            {g.gift_label ?? "選べるe-ギフト"} / 状態: <span className="font-semibold">{g.status}</span>
          </p>
        </div>
        <Link href="/points/gifts" className="text-sm font-semibold text-gray-700 hover:underline">
          一覧へ
        </Link>
      </div>

      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold">ギフトコード / シークレットリンク</div>

        {g.status !== "sent" ? (
          <div className="mt-3 rounded-xl bg-black/[.03] p-3 text-sm text-gray-700">
            まだギフトが反映されていません。送付後にここへ表示されます。
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500">ギフトコード</div>
            <div className="mt-1 break-all font-mono text-lg tracking-widest">
              {g.gift_code ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="text-xs text-gray-500">シークレットリンク</div>
            <div className="mt-1 break-all text-xs text-gray-700">
              {g.gift_url ?? "—"}
            </div>
          </div>

          <GiftSecretActions code={g.gift_code} url={g.gift_url} />
        </div>

        <div className="mt-4 text-xs text-gray-600">
          申請: {fmt(g.created_at)}
          {g.delivered_at ? ` / 送付: ${fmt(g.delivered_at)}` : ""}
          {g.expires_at ? ` / 期限: ${fmt(g.expires_at)}` : ""}
          <br />
          {g.points_spent ? `${g.points_spent.toLocaleString()}pt` : "—"}
          {g.amount_yen ? `（${g.amount_yen.toLocaleString()}円相当）` : ""}
        </div>

        <p className="mt-3 text-xs text-gray-500">
          ※ ギフトコード/リンクは第三者に共有しないでください。
        </p>
      </section>
    </main>
  );
}
