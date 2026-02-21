"use client";

import React, { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { X, Loader2 } from "lucide-react";
import { TAG_CATEGORIES, type TagCategory, tagCategoryLabel } from "@/lib/postTags";
import { templatesByCategory, templateLabelMap } from "@/lib/detailTemplates";

type Template = { id: string; label: string };

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
  postUserId,
  placeName,
  placeId,
  authorName,
}: {
  postId: string;
  postUserId: string;
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
  const [selectedByCat, setSelectedByCat] = useState<Record<string, string[]>>({});
  const [freeText, setFreeText] = useState("");
  const [revealName, setRevealName] = useState(false);

  // ✅ 共通テンプレ定義から生成（初回だけ）
  const TEMPLATE_BY_CATEGORY = useMemo(() => templatesByCategory(), []);
  const templateLabelById = useMemo(() => templateLabelMap(), []);

  const cats = useMemo(() => {
    const available = new Set(TAG_CATEGORIES.map((x) => x.id).filter((x): x is Cat => x !== "all"));
    const ordered = uniqueKeepOrder(CATEGORY_PRIORITY).filter((c) => available.has(c));
    const rest = Array.from(available).filter((c) => !ordered.includes(c));
    return [...ordered, ...rest];
  }, []);

  const templates: Template[] = useMemo(
    () => TEMPLATE_BY_CATEGORY[category] ?? [],
    [TEMPLATE_BY_CATEGORY, category]
  );

  const selectedIdsInCurrent = useMemo(
    () => selectedByCat[category] ?? [],
    [selectedByCat, category]
  );

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

      const payload = {
        post_id: postId,
        requester_user_id: uid,
        category,
        template_ids: allSelectedIds,
        free_text: freeText.trim() ? freeText.trim() : null,
        reveal_name: revealName,
      };

      const { data: reqRow, error: reqErr } = await supabase
        .from("post_detail_requests")
        .insert(payload)
        .select("id")
        .single();
      if (reqErr) throw reqErr;

      if (postUserId && postUserId !== uid && reqRow?.id) {
        const { error: nerr } = await supabase.from("notifications").insert({
          user_id: postUserId,
          actor_id: revealName ? uid : null,
          post_id: postId,
          type: "detail_request",
          detail_request_id: reqRow.id,
          read: false,
        });
        if (nerr) console.warn("notification insert failed:", nerr);
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

  const freePlaceholder = "例）もっと写真見たい！／おすすめメニューは？／混み具合は？／1人いくらくらい？";

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

          <div className="absolute left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2">
            {/* ✅ 外枠：常に大きめ固定（Webでも動かない） */}
            <div className="flex h-[90vh] max-h-[920px] min-h-[620px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
              {/* Header（固定） */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">リクエスト</div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {placeName ? `「${placeName}」について` : "この投稿について"}、もっと知りたい点を{" "}
                    <span className="font-semibold text-slate-700">{authorName ? `${authorName}さん` : "投稿者"}</span>{" "}
                    にリクエストできます。{" "}
                    <span className="text-slate-500">※{authorName ? `${authorName}さん` : "投稿者"}にだけ届きます</span>
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

              {/* Body（スクロール領域）
                  ✅ Webの“横幅ブレ→折り返しブレ”対策：
                  - overflow-y-scroll でスクロールバー領域を常に確保
                  - scrollbarGutter: stable が効くブラウザではさらに安定
              */}
              <div
                className="flex-1 overflow-y-scroll px-4 py-4"
                style={{ scrollbarGutter: "stable" as any }}
              >
                {done ? (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                    <div className="text-sm font-bold text-orange-800">送信しました</div>
                    <div className="mt-1 text-[12px] text-orange-700">投稿者が追記してくれるかも。ありがとう！</div>
                  </div>
                ) : (
                  <div className="space-y-4">
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

                    {/* 選択中（全カテゴリ） */}
                    {allSelectedIds.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[12px] font-semibold text-slate-700">選択中</div>
                          <div className="text-[11px] text-slate-400">{allSelectedIds.length}件</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {allSelectedIds.map((tid) => (
                            <button
                              key={tid}
                              type="button"
                              onClick={() => removeSelected(tid)}
                              className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[12px] font-semibold text-orange-700 hover:bg-orange-100"
                            >
                              {templateLabelById.get(tid) ?? tid}
                              <X size={14} className="opacity-70" />
                            </button>
                          ))}
                        </div>
                        <div className="text-[11px] text-slate-400">※タップで外せます</div>
                      </div>
                    ) : null}

                    {/* 質問候補
                        ✅ “最大ケースに合わせて高さ固定” + “中だけスクロール”
                        ✅ チップは 1行省略（折り返しで段数が揺れにくくなる）
                    */}
                    <div className="space-y-2">
                      <div className="text-[12px] font-semibold text-slate-700">質問候補（複数OK）</div>

                      <div
                        className="rounded-2xl border border-slate-200 bg-white p-2"
                        // この高さは好みで。まずは “大手っぽい余裕” を出すため少し広め。
                      >
                        <div
                          className="h-[220px] overflow-y-scroll p-1"
                          style={{ scrollbarGutter: "stable" as any }}
                        >
                          <div className="flex flex-wrap gap-2">
                            {templates.map((t) => {
                              const on = selectedIdsInCurrent.includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => toggleTemplate(t.id)}
                                  className={[
                                    "max-w-full rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                                    "whitespace-nowrap truncate",
                                    on
                                      ? "border-orange-200 bg-orange-50 text-orange-700"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                                  ].join(" ")}
                                  aria-pressed={on}
                                  title={t.label}
                                >
                                  {t.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400">※スクロールできます</div>
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

                    {err ? <div className="text-[12px] font-semibold text-red-600">{err}</div> : null}
                  </div>
                )}
              </div>

              {/* Footer（固定）
                  ✅ 「投稿者にアカウントを表示する」をCTAと同じ高さで常時表示
              */}
              <div className="border-t border-slate-200 bg-white px-4 py-3">
                {done ? (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
                    >
                      閉じる
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* 左：チェック（固定表示） */}
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={revealName}
                        onChange={(e) => setRevealName(e.target.checked)}
                        className="h-4 w-4 accent-orange-600"
                      />
                      <span className="text-[12px] font-bold text-slate-800">投稿者にアカウントを表示する</span>
                      <span className="text-[11px] text-slate-500">オフのままだと匿名で届きます。</span>
                    </label>

                    {/* 右：ボタン */}
                    <div className="flex items-center justify-end gap-2">
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}