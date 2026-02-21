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
    { id: "visit:busy", label: "その時間帯、混んでた？" },
    { id: "visit:repeat", label: "リピあり？また行きたい？" },
  ],
  scene: [
    { id: "scene:who", label: "誰と行くのが良さそう？" },
    { id: "scene:best", label: "おすすめの使い方は？" },
    { id: "scene:solo", label: "1人でも行けそう？" },
    { id: "scene:group", label: "大人数でもいける？" },
    { id: "scene:family", label: "家族向き？" },
  ],
  mood: [
    { id: "mood:vibe", label: "雰囲気ってどんな感じ？" },
    { id: "mood:date", label: "デート向き？" },
    { id: "mood:lighting", label: "照明/店内の明るさは？" },
    { id: "mood:music", label: "音楽/空気感はどんな感じ？" },
    { id: "mood:photo", label: "写真映えする？（内装/料理）" },
  ],
  noise: [
    { id: "noise:level", label: "騒がしさどれくらい？" },
    { id: "noise:talk", label: "会話しやすい？（声の通り）" },
    { id: "noise:kids", label: "子どもの声とか気になりそう？" },
  ],
  work: [
    { id: "work:wifi", label: "Wi-Fi/電源あった？" },
    { id: "work:stay", label: "長居できそう？" },
    { id: "work:space", label: "席の広さ・PC広げやすさは？" },
    { id: "work:rules", label: "作業NGっぽい雰囲気ある？" },
  ],
  food: [
    { id: "food:must", label: "絶対頼むべきメニューは？" },
    { id: "food:portion", label: "量は多い？少ない？" },
    { id: "food:taste", label: "味の系統（濃い/あっさり）は？" },
    { id: "food:menu", label: "メニューの幅（選びやすさ）は？" },
    { id: "food:photo", label: "料理の写真もっと見たい！" },
  ],
  drink: [
    { id: "drink:menu", label: "お酒の充実度どう？" },
    { id: "drink:nonal", label: "ノンアル/ソフドリ充実してた？" },
    { id: "drink:pairing", label: "料理との相性（ペアリング）良い？" },
  ],
  reservation: [
    { id: "resv:need", label: "予約した？必須？" },
    { id: "resv:wait", label: "待ち時間はどれくらい？" },
    { id: "resv:tip", label: "予約のコツある？（何時/何日前）" },
    { id: "resv:peak", label: "混む時間帯はいつ？" },
    { id: "resv:walkin", label: "飛び込みでも入れそう？" },
  ],
  comfort: [
    { id: "comfort:seat", label: "席（個室/カウンター）どうだった？" },
    { id: "comfort:space", label: "席の間隔・狭さ/広さは？" },
    { id: "comfort:temp", label: "店内の温度（暑い/寒い）どう？" },
    { id: "comfort:clean", label: "清潔感どう？" },
  ],
  service: [
    { id: "svc:staff", label: "接客どうだった？" },
    { id: "svc:speed", label: "提供スピードは？" },
    { id: "svc:explain", label: "説明が丁寧？おすすめ聞けた？" },
    { id: "svc:rule", label: "ルール厳しめ？（席時間/注文制）" },
  ],
  kids: [
    { id: "kids:ok", label: "子連れいけそう？" },
    { id: "kids:chair", label: "子ども椅子/取り皿ありそう？" },
    { id: "kids:space", label: "ベビーカーいけそう？通路広い？" },
  ],
  access: [
    { id: "acc:walk", label: "駅からの体感距離は？" },
    { id: "acc:landmark", label: "迷わず行けた？目印ある？" },
    { id: "acc:weather", label: "雨の日つらい？（坂/屋外多め）" },
  ],
  payment: [
    { id: "pay:card", label: "カード使えた？" },
    { id: "pay:cashless", label: "電子マネー/QRは？" },
    { id: "pay:cash", label: "現金のみっぽい？" },
    { id: "pay:split", label: "割り勘しやすい？（個別会計）" },
  ],
  budget: [
    { id: "budget:pp", label: "結局いくらくらい？（1人あたり）" },
    { id: "budget:menu", label: "代表的なメニューの価格は？" },
    { id: "budget:drink", label: "お酒頼むとどれくらい上がる？" },
    { id: "budget:value", label: "コスパ感は？（満足度との釣り合い）" },
    { id: "budget:charge", label: "席料/チャージ/お通しあった？" },
    { id: "budget:timing", label: "ランチ/ディナーで価格差ある？" },
  ],
  health: [
    { id: "health:allergy", label: "アレルギー/体質配慮できそう？" },
    { id: "health:veg", label: "ベジ/ヴィーガン対応ありそう？" },
    { id: "health:spice", label: "辛さ調整できそう？" },
  ],
};

const CATEGORY_PRIORITY: Exclude<TagCategory, "all">[] = [
  "budget",
  "food",
  "reservation",
  "mood",
  "scene",
  "visit_time",
  "service",
  "comfort",
  "noise",
  "drink",
  "work",
  "access",
  "payment",
  "kids",
  "health",
];

function uniqueKeepOrder<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

type Cat = Exclude<TagCategory, "all">;

export default function DetailRequestModal({
  postId,
  postUserId, // ★追加：通知先
  placeName,
  placeId,
  authorName,
}: {
  postId: string;
  postUserId: string; // ★追加
  placeName: string | null;
  placeId: string | null;
  authorName: string | null;
}) {
  const supabase = createClientComponentClient();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [category, setCategory] = useState<Cat>("budget");

  // ★カテゴリ別に選択保持
  const [selectedByCat, setSelectedByCat] = useState<Record<string, string[]>>({});

  const [freeText, setFreeText] = useState("");
  const [revealName, setRevealName] = useState(false);

  const cats = useMemo(() => {
    const available = new Set(
      TAG_CATEGORIES.map((x) => x.id).filter((x): x is Cat => x !== "all")
    );
    const ordered = uniqueKeepOrder(CATEGORY_PRIORITY).filter((c) => available.has(c));
    const rest = Array.from(available).filter((c) => !ordered.includes(c));
    return [...ordered, ...rest];
  }, []);

  const templates = useMemo(() => TEMPLATE_BY_CATEGORY[category] ?? [], [category]);

  const templateLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const cat of Object.keys(TEMPLATE_BY_CATEGORY) as Cat[]) {
      for (const t of TEMPLATE_BY_CATEGORY[cat]) m.set(t.id, t.label);
    }
    return m;
  }, []);

  const selectedIdsInCurrent = useMemo(() => {
    const a = selectedByCat[category] ?? [];
    return Array.isArray(a) ? a : [];
  }, [selectedByCat, category]);

  const allSelectedIds = useMemo(() => {
    const all = Object.values(selectedByCat).flat().filter(Boolean);
    return Array.from(new Set(all));
  }, [selectedByCat]);

  function toggleTemplate(id: string) {
    setSelectedByCat((prev) => {
      const cur = Array.isArray(prev[category]) ? prev[category] : [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, [category]: next };
    });
  }

  function removeSelected(id: string) {
    setSelectedByCat((prev) => {
      const next: Record<string, string[]> = { ...prev };
      for (const c of Object.keys(next)) {
        next[c] = (next[c] ?? []).filter((x) => x !== id);
        if (next[c].length === 0) delete next[c];
      }
      return next;
    });
  }

  async function submit() {
    setErr(null);

    if (allSelectedIds.length === 0 && freeText.trim().length === 0) {
      setErr("質問候補を選ぶか、自由入力を1つ入れてください。");
      return;
    }

    setBusy(true);
    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const uid = auth.user?.id ?? null;
      if (!uid) {
        setErr("リクエスト送信にはログインが必要です。");
        return;
      }

      // 1) リクエスト本体 insert
      const payload = {
        post_id: postId,
        requester_user_id: uid,
        category, // 最後に見てたカテゴリ（参考）
        template_ids: allSelectedIds,
        free_text: freeText.trim() ? freeText.trim() : null,
        reveal_name: revealName,
      };

      const { error } = await supabase.from("post_detail_requests").insert(payload);

      if (error) {
        if ((error as any)?.code === "23505") {
          setErr("今日はすでにリクエスト済みです（1日1回まで）。また明日送ってね。");
          return;
        }
        throw error;
      }

      // 2) 投稿者へ通知（自分の投稿ならスキップ）
      if (postUserId && postUserId !== uid) {
        const notif = {
          user_id: postUserId,
          actor_id: revealName ? uid : null, // ★匿名なら null
          post_id: postId,
          type: "detail_request",
          read: false,
          // comment_id は null のまま
        };

        const { error: nerr } = await supabase.from("notifications").insert(notif);
        if (nerr) {
          // 通知失敗はリクエスト自体を失敗にしない（ログだけ）
          console.warn("notification insert failed:", nerr);
        }
      }

      setDone(true);
      setSelectedByCat({});
      setFreeText("");
      setRevealName(false);
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
    setSelectedByCat({});
    setFreeText("");
    setCategory("budget");
    setRevealName(false);
  }

  const freePlaceholder =
    "例）もっと写真見たい！／おすすめメニューは？／混み具合は？／1人いくらくらい？";

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
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={close}
            aria-label="close overlay"
          />

          <div className="absolute left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">リクエスト</div>
                <div className="mt-0.5 text-[12px] text-slate-500">
                  {placeName ? `「${placeName}」について` : "この投稿について"}、もっと知りたい点を{" "}
                  <span className="font-semibold text-slate-700">
                    {authorName ? `${authorName}さん` : "投稿者"}
                  </span>{" "}
                  にリクエストできます。{" "}
                  <span className="text-slate-500">
                    ※{authorName ? `${authorName}さん` : "投稿者"}にだけ届きます
                  </span>
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
                  {/* カテゴリ */}
                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">カテゴリ</div>
                    <div className="-mx-4 border border-slate-200 bg-slate-50 px-2 py-2">
                      <div className="flex items-center gap-2 overflow-x-auto px-2 no-scrollbar">
                        {cats.map((c) => {
                          const active = category === c;
                          const cnt = (selectedByCat[c]?.length ?? 0) as number;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setCategory(c)}
                              className={[
                                "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                                active
                                  ? "bg-white text-orange-700 ring-1 ring-orange-200"
                                  : "bg-transparent text-slate-600 hover:bg-white/70",
                              ].join(" ")}
                              aria-pressed={active}
                            >
                              {tagCategoryLabel(c)}
                              {cnt > 0 ? (
                                <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                                  {cnt}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 全体プレビュー */}
                  {allSelectedIds.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[12px] font-semibold text-slate-700">選択中</div>
                        <div className="text-[11px] text-slate-400">{allSelectedIds.length}件</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {allSelectedIds.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => removeSelected(id)}
                            className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[12px] font-semibold text-orange-700 hover:bg-orange-100"
                          >
                            {templateLabelById.get(id) ?? id}
                            <X size={14} className="opacity-70" />
                          </button>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400">※タップで外せます</div>
                    </div>
                  ) : null}

                  {/* テンプレ */}
                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">質問候補（複数OK）</div>
                    <div className="flex flex-wrap gap-2">
                      {templates.map((t) => {
                        const on = selectedIdsInCurrent.includes(t.id);
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

                  {/* 自由入力 */}
                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-slate-700">自由に入力することもできます</div>
                    <textarea
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      placeholder={freePlaceholder}
                      className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-300"
                    />
                  </div>

                  {/* 匿名/記名 */}
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={revealName}
                        onChange={(e) => setRevealName(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-orange-600"
                      />
                      <div className="min-w-0">
                        <div className="text-[12px] font-bold text-slate-800">投稿者にアカウントを表示する</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">オフのままだと匿名で届きます。</div>
                      </div>
                    </label>
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

                  <div className="text-[11px] text-slate-400">※リクエストは1日1回まで（日本時間基準）</div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}