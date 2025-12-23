"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RequestRedeemButton({
  canRedeem,
  points = 1000,
}: {
  canRedeem: boolean;
  points?: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function requestRedeem() {
    if (!canRedeem || loading) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/points/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(json?.error ?? "申請に失敗しました");
        return;
      }

      const giftId = json?.gift_id as string | undefined;
      if (giftId) {
        router.push(`/points/gifts/${giftId}`);
        router.refresh();
      } else {
        router.push(`/points/gifts`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        disabled={!canRedeem || loading}
        onClick={requestRedeem}
        className={[
          "w-full rounded-2xl px-4 py-3 text-sm font-bold shadow-sm transition",
          canRedeem && !loading
            ? "bg-orange-700 text-white hover:bg-orange-800"
            : "bg-orange-700/10 text-orange-900/40 cursor-not-allowed",
        ].join(" ")}
      >
        {loading ? "申請中..." : `${points}ptを交換申請する`}
      </button>

      {err ? (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}
    </div>
  );
}
