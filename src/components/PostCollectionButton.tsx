"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Collection = {
  id: string;
  name: string;
};

type PostCollectionButtonProps = {
  postId: string;
  className?: string;
};

type PendingUndo = {
  collectionId: string;
  postId: string;
};

type SuggestTypeResponse = {
  placeId: string;
  suggestedType: string | null;
  suggestedEmoji: string | null;
  needsManualPick: boolean;
  primaryType?: string | null;
  types?: string[] | null;
};

const EMOJI_PRESETS: Array<{ emoji: string; label: string }> = [
  { emoji: "🍜", label: "ラーメン" },
  { emoji: "🍣", label: "寿司" },
  { emoji: "🥟", label: "中華" },
  { emoji: "🍛", label: "カレー" },
  { emoji: "🍝", label: "イタリアン" },
  { emoji: "🍕", label: "ピザ" },
  { emoji: "🍔", label: "バーガー" },
  { emoji: "🥘", label: "韓国/アジア" },
  { emoji: "🍢", label: "焼き鳥/居酒屋" },
  { emoji: "☕️", label: "カフェ" },
  { emoji: "🥐", label: "パン/ベーカリー" },
  { emoji: "🍰", label: "スイーツ" },
  { emoji: "🍺", label: "バー/酒" },
  { emoji: "🍽️", label: "レストラン" },
  { emoji: "📍", label: "その他" },
];

export default function PostCollectionButton({ postId, className }: PostCollectionButtonProps) {
  const supabase = createClientComponentClient();

  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [includedIds, setIncludedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // toast/undo
  const [toastVisible, setToastVisible] = useState(false);
  const [toastShown, setToastShown] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mounted
  const [mounted, setMounted] = useState(false);

  // ✅ 2段目（絵文字提案/選択）用
  const [step, setStep] = useState<"collections" | "emoji">("collections");
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<SuggestTypeResponse | null>(null);
  const [emojiChoice, setEmojiChoice] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      setError(null);
      setLoading(true);
      setStep("collections");
      setPendingCollectionId(null);
      setPendingPlaceId(null);
      setSuggest(null);
      setEmojiChoice(null);
      setSuggestLoading(false);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (!cancelled) setError("ユーザー情報の取得に失敗しました");
        if (!cancelled) setLoading(false);
        return;
      }

      const user = session?.user;
      if (!user) {
        if (!cancelled) setError("コレクションを使うにはログインが必要です");
        if (!cancelled) setLoading(false);
        return;
      }

      const [collectionsRes, postCollectionsRes] = await Promise.all([
        supabase
          .from("collections")
          .select("id, name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase.from("post_collections").select("collection_id").eq("post_id", postId),
      ]);

      if (cancelled) return;

      if (collectionsRes.error) {
        setError("コレクションの取得に失敗しました");
      } else {
        setCollections((collectionsRes.data ?? []) as Collection[]);
      }

      if (!postCollectionsRes.error && postCollectionsRes.data) {
        setIncludedIds(
          (postCollectionsRes.data as { collection_id: string }[]).map((r) => r.collection_id)
        );
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, supabase, postId]);

  const includedSet = useMemo(() => new Set(includedIds), [includedIds]);

  const startToast = (collectionId: string) => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);

    setPendingUndo({ collectionId, postId });
    setToastVisible(true);
    setToastShown(true);

    autoHideTimerRef.current = setTimeout(() => {
      setToastShown(false);
      removeTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        setPendingUndo(null);
      }, 500);
    }, 4500);
  };

  const handleUndo = async () => {
    if (!pendingUndo) return;

    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);

    const { collectionId, postId: undoPostId } = pendingUndo;

    await supabase.from("post_collections").delete().eq("collection_id", collectionId).eq("post_id", undoPostId);

    setIncludedIds((prev) => prev.filter((id) => id !== collectionId));

    setToastShown(false);
    setTimeout(() => {
      setToastVisible(false);
      setPendingUndo(null);
    }, 300);
  };

  // ✅ places に place_id が無いと FK/trigger で死ぬので「事前に ensure」
  const ensurePlaceRowExistsForThisPost = async (): Promise<string> => {
    const { data: post, error: postErr } = await supabase
      .from("posts")
      .select("place_id")
      .eq("id", postId)
      .single();

    if (postErr || !post?.place_id) {
      throw new Error("投稿の place_id を取得できませんでした");
    }

    const res = await fetch("/api/places/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: post.place_id }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "places の ensure に失敗しました");
    }

    return post.place_id as string;
  };

  // ✅ PlaceType -> emoji を1つサジェスト（サーバAPI）
  const fetchSuggestEmoji = async (placeId: string): Promise<SuggestTypeResponse> => {
    const res = await fetch("/api/places/suggest-type", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error ?? "type サジェストに失敗しました");
    }

    return (await res.json()) as SuggestTypeResponse;
  };

  // ✅ 追加処理（ここで最終実行）
  const commitAddToCollection = async (collectionId: string) => {
    setError(null);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setError("ユーザー情報の取得に失敗しました");
      return;
    }
    const user = session?.user;
    if (!user) {
      setError("コレクションを使うにはログインが必要です");
      return;
    }

    const { error } = await supabase.from("post_collections").insert({
      collection_id: collectionId,
      post_id: postId,
    });

    if (error && (error as any).code !== "23505") {
      setError("コレクションへの追加に失敗しました");
      return;
    }

    // ✅ ここで絵文字を永続化したい場合は「次」でOK
    // 例: user_place_labels テーブルに upsert など（今はやらない）
    // if (pendingPlaceId) { await supabase.from("user_place_labels").upsert({ ... }) }

    setIncludedIds((prev) => (prev.includes(collectionId) ? prev : [...prev, collectionId]));
    setOpen(false);
    setStep("collections");
    setPendingCollectionId(null);
    setPendingPlaceId(null);
    setSuggest(null);
    setEmojiChoice(null);

    startToast(collectionId);
  };

  // ✅ 「追加」クリック → まずサジェストして絵文字選択へ
  const startAddFlow = async (collectionId: string) => {
    if (includedSet.has(collectionId)) return;

    setError(null);
    setSuggestLoading(true);

    try {
      const placeId = await ensurePlaceRowExistsForThisPost();
      setPendingCollectionId(collectionId);
      setPendingPlaceId(placeId);

      const s = await fetchSuggestEmoji(placeId);
      setSuggest(s);

      // デフォルト選択：サジェストがあればそれ、なければ null（＝なしで進められる）
      setEmojiChoice(s?.suggestedEmoji ?? null);

      setStep("emoji");
    } catch (e: any) {
      setError(e?.message ?? "場所情報の準備に失敗しました");
      // 失敗したら「従来どおり追加」はしない（FK/trigger関係で危険なので）
    } finally {
      setSuggestLoading(false);
    }
  };

  // ✅ 新規コレクション作成 → サジェスト → 追加
  const handleCreateAndAdd = async () => {
    if (!newName.trim()) {
      setError("コレクション名を入力してください");
      return;
    }

    setError(null);
    setCreating(true);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setError("ユーザー情報の取得に失敗しました");
      setCreating(false);
      return;
    }

    const user = session?.user;
    if (!user) {
      setError("コレクションを使うにはログインが必要です");
      setCreating(false);
      return;
    }

    try {
      const placeId = await ensurePlaceRowExistsForThisPost();

      const { data: created, error: createError } = await supabase
        .from("collections")
        .insert({
          user_id: user.id,
          name: newName.trim(),
        })
        .select("id, name")
        .single();

      if (createError || !created) {
        throw new Error("コレクションの作成に失敗しました");
      }

      setCollections((prev) => [...prev, { id: created.id, name: created.name }]);
      setNewName("");

      // ✅ ここからサジェスト段へ
      setPendingCollectionId(created.id);
      setPendingPlaceId(placeId);

      setSuggestLoading(true);
      const s = await fetchSuggestEmoji(placeId);
      setSuggest(s);
      setEmojiChoice(s?.suggestedEmoji ?? null);

      setStep("emoji");
    } catch (e: any) {
      setError(e?.message ?? "作成に失敗しました");
    } finally {
      setSuggestLoading(false);
      setCreating(false);
    }
  };

  const closeAll = () => {
    setOpen(false);
    setStep("collections");
    setPendingCollectionId(null);
    setPendingPlaceId(null);
    setSuggest(null);
    setEmojiChoice(null);
    setSuggestLoading(false);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm hover:bg-orange-600 transition-colors",
          className ?? "",
        ].join(" ")}
        aria-label="コレクションに追加"
      >
        <Plus className="h-5 w-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-3">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {step === "collections" ? "コレクションに追加" : "ジャンル（絵文字）を決める"}
                </h2>
                <button
                  type="button"
                  onClick={closeAll}
                  className="rounded-full p-1 text-black/50 hover:bg-black/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {error && (
                <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              {/* ✅ Step 1: コレクション選択 */}
              {step === "collections" && (
                <>
                  <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
                    {loading ? (
                      <p className="text-xs text-black/50">読み込み中...</p>
                    ) : collections.length === 0 ? (
                      <p className="text-xs text-black/50">まだコレクションがありません。</p>
                    ) : (
                      collections.map((c) => {
                        const included = includedSet.has(c.id);
                        const disabled = included || suggestLoading;

                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => (disabled ? undefined : startAddFlow(c.id))}
                            disabled={disabled}
                            className={[
                              "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                              included
                                ? "border-orange-300 bg-orange-50 text-orange-700 cursor-default"
                                : "border-black/10 hover:bg-black/5",
                              disabled && !included ? "opacity-60 cursor-not-allowed" : "",
                            ].join(" ")}
                          >
                            <span className="truncate">{c.name}</span>
                            <span
                              className={
                                included
                                  ? "text-xs font-semibold text-orange-500"
                                  : "text-xs text-black/40"
                              }
                            >
                              {included ? "追加済み" : suggestLoading ? "準備中..." : "追加"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="space-y-2 border-t border-black/10 pt-3">
                    <label className="block text-xs font-medium text-black/60">
                      新しいコレクションを作成
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="コレクション名"
                      className="w-full rounded-lg border border-black/20 px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={handleCreateAndAdd}
                      disabled={creating || suggestLoading}
                      className="flex w-full items-center justify-center rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {creating ? "作成中..." : "作成して追加"}
                    </button>
                  </div>
                </>
              )}

              {/* ✅ Step 2: 絵文字サジェスト/選択 */}
              {step === "emoji" && (
                <>
                  <div className="mb-3 rounded-xl border border-black/10 bg-black/[.02] p-3">
                    <div className="text-xs text-black/60">
                      Googleのカテゴリから1つ提案します。違ったら選び直してOK。
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {suggest?.suggestedEmoji ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xl">{suggest.suggestedEmoji}</span>
                              <span>おすすめ</span>
                            </span>
                          ) : (
                            <span>おすすめなし（選んでね）</span>
                          )}
                        </div>
                        {suggest?.suggestedType ? (
                          <div className="mt-0.5 text-[11px] text-black/45">
                            type: {suggest.suggestedType}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-black/45">
                            うまく判別できない店もあるので、手動でOK。
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setEmojiChoice(null)}
                        className="shrink-0 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/5"
                      >
                        なし
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mb-2 text-xs font-medium text-black/60">選ぶ（タップ）</div>
                    <div className="grid grid-cols-5 gap-2">
                      {EMOJI_PRESETS.map((x) => {
                        const active = emojiChoice === x.emoji;
                        return (
                          <button
                            key={x.emoji}
                            type="button"
                            onClick={() => setEmojiChoice(x.emoji)}
                            className={[
                              "h-11 rounded-xl border text-xl transition",
                              active ? "border-orange-400 bg-orange-50" : "border-black/10 bg-white hover:bg-black/5",
                            ].join(" ")}
                            aria-label={x.label}
                            title={x.label}
                          >
                            {x.emoji}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 text-[11px] text-black/45">
                      選んだ絵文字：{" "}
                      <span className="text-sm">{emojiChoice ? emojiChoice : "（なし）"}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        // 前段に戻る（コレクション選び直し）
                        setStep("collections");
                        setPendingCollectionId(null);
                        setPendingPlaceId(null);
                        setSuggest(null);
                        setEmojiChoice(null);
                        setError(null);
                      }}
                      className="rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5"
                    >
                      戻る
                    </button>

                    <button
                      type="button"
                      disabled={!pendingCollectionId}
                      onClick={() => {
                        if (!pendingCollectionId) return;
                        // emojiChoice はここで確定（今は保存しないが、次でDBへ）
                        commitAddToCollection(pendingCollectionId);
                      }}
                      className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                    >
                      {pendingCollectionId ? "この内容で追加" : "追加"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* toast */}
      {mounted &&
        toastVisible &&
        createPortal(
          <div className="fixed inset-x-0 top-4 z-[210] flex justify-center px-3">
            <div
              className={[
                "inline-flex items-center gap-4 rounded-2xl bg-black/85 px-5 py-3 text-sm text-white shadow-lg transition-all duration-500 transform",
                toastShown ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-5",
              ].join(" ")}
            >
              <span>コレクションに追加しました</span>
              {pendingUndo && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="text-[12px] underline underline-offset-2 cursor-pointer hover:text-orange-300"
                >
                  元に戻す
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
