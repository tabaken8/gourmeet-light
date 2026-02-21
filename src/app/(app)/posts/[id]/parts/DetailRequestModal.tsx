"use client";

import React, { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { X, Loader2 } from "lucide-react";
import { TAG_CATEGORIES, type TagCategory, tagCategoryLabel } from "@/lib/postTags";

type Template = { id: string; label: string };

const TEMPLATE_BY_CATEGORY: Record<Exclude<TagCategory, "all">, Template[]> = {
  visit_time: [
    { id: "visit:when", label: "行った時間帯（昼/夜）は？" },
    { id: "visit:day", label: "曜日はいつ？" },
    { id: "visit:duration", label: "滞在時間はどれくらい？" },
  ],
  scene: [
    { id: "scene:who", label: "誰と行くのが良さそう？" },
    { id: "scene:best", label: "おすすめの使い方は？" },
  ],
  mood: [
    { id: "mood:vibe", label: "雰囲気ってどんな感じ？" },
    { id: "mood:date", label: "デート向き？" },
  ],
  noise: [{ id: "noise:level", label: "騒がしさどれくらい？" }],
  work: [
    { id: "work:wifi", label: "Wi-Fi/電源あった？" },
    { id: "work:stay", label: "長居できそう？" },
  ],
  food: [
    { id: "food:must", label: "絶対頼むべきメニューは？" },
    { id: "food:portion", label: "量は多い？少ない？" },
  ],
  drink: [{ id: "drink:menu", label: "お酒の充実度どう？" }],
  reservation: [
    { id: "resv:need", label: "予約した？必須？" },
    { id: "resv:wait", label: "待ち時間はどれくらい？" },
  ],
  comfort: [{ id: "comfort:seat", label: "席（個室/カウンター）どうだった？" }],
  service: [
    { id: "svc:staff", label: "接客どうだった？" },
    { id: "svc:speed", label: "提供スピードは？" },
  ],
  kids: [{ id: "kids:ok", label: "子連れいけそう？" }],
  access: [{ id: "acc:walk", label: "駅からの体感距離は？" }],
  payment: [
    { id: "pay:card", label: "カード使えた？" },
    { id: "pay:cashless", label: "電子マネー/QRは？" },
    { id: "pay:cash", label: "現金のみっぽい？" },
  ],
  budget: [
    { id: "budget:value", label: "コスパ感は？" },
    { id: "budget:pp", label: "結局いくらくらい？" },
  ],
  health: [{ id: "health:allergy", label: "アレルギー/体質配慮できそう？" }],
};

const CATS = TAG_CATEGORIES.map((x) => x.id).filter((x): x is Exclude<TagCategory, "all"> => x !== "all");

export default function DetailRequestModal({
  postId,
  placeName,
}: {
  postId: string;
  placeName: string | null;
  placeId: string | null;
}) {
  const supabase = createClientComponentClient();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [category, setCategory] = useState<Exclude<TagCategory, "all">>("visit_time");
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");

  const templates = useMemo(() => TEMPLATE_BY_CATEGORY[category] ?? [], [category]);

  function toggleTemplate(id: string) {
    setTemplateIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    setErr(null);
    if (templateIds.length === 0 && freeText.trim().length === 0) {
      setErr("テンプレを選ぶか、自由入力を1つ入れてください。");
      return;
    }

    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;

      const payload = {
        post_id: postId,
        requester_user_id: uid,
        category,
        template_ids: templateIds,
        free_text: freeText.trim() ? freeText.trim() : null,
      };

      const { error } = await supabase.from("post_detail_requests").insert(payload);
      if (error) throw error;

      setDone(true);
      setTemplateIds([]);
      setFreeText("");
    } catch (e: any) {
      setErr(e?.message ?? "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setErr(null);
    setDone(false);
    setTemplateIds([]);
    setFreeText("");
    setCategory("visit_time");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full border border-orange-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-orange-700 hover:bg-orange-50"
      >
        リクエスト
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80]">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={close} aria-label="close overlay" />

          <div className="absolute left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">リクエスト</div>
                <div className="mt-0.5 text-[12px] text-slate-500">
                  {placeName ? `「${placeName}」について` : "この投稿について"}、もっと知りたくなった点を匿名でリクエストできます。投稿者がリクエストを見て追記してくれるかも。気軽にリクエストしましょう！
                </div>
              </div>

              <button
                type="button"
                onClick={close}
                className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                aria-label="close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {done ? (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <div className="text-sm font-bold text-orange-800">送信しました</div>
                  <div className="mt-1 text-[12px] text-orange-700">投稿者が追記してくれるかも。ありがとう！</div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">カテゴリ</div>
                    <div className="flex flex-wrap gap-2">
                      {CATS.map((c) => {
                        const active = category === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setCategory(c);
                              setTemplateIds([]);
                            }}
                            className={[
                              "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                              active
                                ? "border-orange-200 bg-orange-50 text-orange-700"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                            ].join(" ")}
                            aria-pressed={active}
                          >
                            {tagCategoryLabel(c)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">テンプレ（複数OK）</div>
                    <div className="flex flex-wrap gap-2">
                      {templates.map((t) => {
                        const on = templateIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => toggleTemplate(t.id)}
                            className={[
                              "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                              on
                                ? "border-orange-200 bg-orange-50 text-orange-700"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                            ].join(" ")}
                            aria-pressed={on}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">自由入力（任意）</div>
                    <textarea
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      placeholder="他に聞きたいことがあれば一言（任意）"
                      className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-300"
                    />
                  </div>

                  {err ? <div className="text-[12px] font-semibold text-red-600">{err}</div> : null}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      disabled={busy}
                    >
                      キャンセル
                    </button>

                    <button
                      type="button"
                      onClick={submit}
                      disabled={busy}
                      className={[
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white",
                        busy ? "bg-orange-300" : "bg-orange-600 hover:bg-orange-700",
                      ].join(" ")}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      リクエストする
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}