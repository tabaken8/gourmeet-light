"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Check } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Collection = { id: string; name: string };

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

type GenreOption = { key: string; emoji: string; label: string };

const GENRES: GenreOption[] = [
  { key: "ramen", emoji: "🍜", label: "ラーメン" },
  { key: "sushi", emoji: "🍣", label: "寿司" },
  { key: "yakiniku", emoji: "🥩", label: "焼肉" },
  { key: "izakaya", emoji: "🍺", label: "焼き鳥/居酒屋" },
  { key: "chinese", emoji: "🥟", label: "中華" },
  { key: "curry", emoji: "🍛", label: "カレー" },
  { key: "italian", emoji: "🍝", label: "イタリアン" },
  { key: "pizza", emoji: "🍕", label: "ピザ" },
  { key: "burger", emoji: "🍔", label: "バーガー" },
  { key: "cafe", emoji: "☕️", label: "カフェ" },
  { key: "sweets", emoji: "🍰", label: "スイーツ" },
  { key: "bar", emoji: "🍷", label: "バー/酒" },
  { key: "other", emoji: "📍", label: "その他" },
];

function labelForEmoji(emoji: string | null | undefined) {
  if (!emoji) return "";
  return GENRES.find((g) => g.emoji === emoji)?.label ?? "";
}

export default function PostCollectionButton({ postId, className }: PostCollectionButtonProps) {
  const supabase = createClientComponentClient();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [includedIds, setIncludedIds] = useState<string[]>([]);
  const includedSet = useMemo(() => new Set(includedIds), [includedIds]);

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

  // Step2
  const [step, setStep] = useState<"collections" | "emoji">("collections");
  const [pendingCollectionId, setPendingCollectionId] = useState<string | null>(null);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);

  const [suggest, setSuggest] = useState<SuggestTypeResponse | null>(null);
  const [emojiChoice, setEmojiChoice] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [genreQuery, setGenreQuery] = useState("");

  useEffect(() => {
    setMounted(true);
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, []);

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
      }, 450);
    }, 4200);
  };

  const handleUndo = async () => {
    if (!pendingUndo) return;

    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);

    const { collectionId, postId: undoPostId } = pendingUndo;
    await supabase
      .from("post_collections")
      .delete()
      .eq("collection_id", collectionId)
      .eq("post_id", undoPostId);

    setIncludedIds((prev) => prev.filter((id) => id !== collectionId));

    setToastShown(false);
    setTimeout(() => {
      setToastVisible(false);
      setPendingUndo(null);
    }, 250);
  };

  const closeAll = () => {
    setOpen(false);
    setStep("collections");
    setPendingCollectionId(null);
    setPendingPlaceId(null);
    setSuggest(null);
    setEmojiChoice(null);
    setGenreQuery("");
    setSuggestLoading(false);
    setError(null);
  };

  const refreshModalData = async () => {
    setError(null);
    setLoading(true);

    setStep("collections");
    setPendingCollectionId(null);
    setPendingPlaceId(null);
    setSuggest(null);
    setEmojiChoice(null);
    setGenreQuery("");
    setSuggestLoading(false);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setError("ユーザー情報の取得に失敗しました");
      setLoading(false);
      return;
    }

    const user = session?.user;
    if (!user) {
      setError("コレクションを使うにはログインが必要です");
      setLoading(false);
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
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      await refreshModalData();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  // ✅ places に place_id が無いとFK/triggerで死ぬので事前ensure
  const ensurePlaceRowExistsForThisPost = async (): Promise<string> => {
    const { data: post, error: postErr } = await supabase
      .from("posts")
      .select("place_id")
      .eq("id", postId)
      .single();

    if (postErr || !post?.place_id) throw new Error("投稿の place_id を取得できませんでした");

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

  // ✅ ここがUX要：絵文字確定を永続化（user_place_pins にupsert）
  const persistEmojiChoiceIfAny = async (uid: string, placeId: string, emoji: string | null) => {
    if (!emoji) return; // 「なし」は何もしない（既存ピンは保持）
    const e = emoji.trim();
    if (!e) return;

    const { error } = await supabase
      .from("user_place_pins")
      .upsert({ user_id: uid, place_id: placeId, emoji: e }, { onConflict: "user_id,place_id" });

    if (error) throw new Error(error.message);
  };

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

    const { error: insErr } = await supabase.from("post_collections").insert({
      collection_id: collectionId,
      post_id: postId,
    });

    if (insErr && (insErr as any).code !== "23505") {
      setError("コレクションへの追加に失敗しました");
      return;
    }

    // ✅ ジャンル確定（選んだら保存）
    if (pendingPlaceId) {
      try {
        await persistEmojiChoiceIfAny(user.id, pendingPlaceId, emojiChoice);
      } catch (e: any) {
        // ここで追加自体を失敗にするかは好みだが、今回は「追加は成功・絵文字だけ警告」にする
        console.warn("[persistEmojiChoiceIfAny failed]", e);
      }
    }

    setIncludedIds((prev) => (prev.includes(collectionId) ? prev : [...prev, collectionId]));
    setOpen(false);
    setStep("collections");
    setPendingCollectionId(null);
    setPendingPlaceId(null);
    setSuggest(null);
    setEmojiChoice(null);
    setGenreQuery("");

    startToast(collectionId);
  };

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

      setEmojiChoice(s?.suggestedEmoji ?? null); // デフォルトは提案
      setGenreQuery("");

      setStep("emoji");
    } catch (e: any) {
      setError(e?.message ?? "場所情報の準備に失敗しました");
    } finally {
      setSuggestLoading(false);
    }
  };

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
        .insert({ user_id: user.id, name: newName.trim() })
        .select("id, name")
        .single();

      if (createError || !created) throw new Error("コレクションの作成に失敗しました");

      setCollections((prev) => [...prev, { id: created.id, name: created.name }]);
      setNewName("");

      // ここから絵文字へ
      setPendingCollectionId(created.id);
      setPendingPlaceId(placeId);

      setSuggestLoading(true);
      const s = await fetchSuggestEmoji(placeId);
      setSuggest(s);
      setEmojiChoice(s?.suggestedEmoji ?? null);
      setGenreQuery("");
      setStep("emoji");
    } catch (e: any) {
      setError(e?.message ?? "作成に失敗しました");
    } finally {
      setSuggestLoading(false);
      setCreating(false);
    }
  };

  const filteredGenres = useMemo(() => {
    const q = genreQuery.trim();
    if (!q) return GENRES;
    return GENRES.filter((g) => g.label.includes(q) || g.emoji.includes(q));
  }, [genreQuery]);

  const choiceLabel = useMemo(() => labelForEmoji(emojiChoice), [emojiChoice]);

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
          <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm">
            {/* sheet layout */}
            <div className="absolute inset-0 flex items-end justify-center sm:items-center px-3 pb-3 sm:pb-0">
              <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white shadow-xl overflow-hidden">
                {/* header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      {step === "collections" ? "コレクションに追加" : "ジャンルを選ぶ"}
                    </div>
                    {step === "emoji" && (
                      <div className="mt-0.5 text-[12px] text-black/50">
                        現在：{" "}
                        <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[.03] px-2 py-0.5">
                          <span className="text-base">{emojiChoice ?? "—"}</span>
                          <span>{choiceLabel ? choiceLabel : emojiChoice ? "（未ラベル）" : "未選択"}</span>
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={closeAll}
                    className="rounded-full p-2 text-black/50 hover:bg-black/5"
                    aria-label="閉じる"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {error && (
                  <div className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </div>
                )}

                {/* Step 1: collections */}
                {step === "collections" && (
                  <div className="p-4">
                    <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
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
                                "flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm transition-colors",
                                included
                                  ? "border-orange-300 bg-orange-50 text-orange-700 cursor-default"
                                  : "border-black/10 hover:bg-black/5",
                                disabled && !included ? "opacity-60 cursor-not-allowed" : "",
                              ].join(" ")}
                            >
                              <span className="truncate">{c.name}</span>
                              <span className={included ? "text-xs font-semibold" : "text-xs text-black/40"}>
                                {included ? "追加済み" : suggestLoading ? "準備中..." : "追加"}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 space-y-2 border-t border-black/10 pt-3">
                      <label className="block text-xs font-medium text-black/60">
                        新しいコレクションを作成
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="コレクション名"
                        className="w-full rounded-xl border border-black/20 px-3 py-3 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                      <button
                        type="button"
                        onClick={handleCreateAndAdd}
                        disabled={creating || suggestLoading}
                        className="flex w-full items-center justify-center rounded-xl bg-orange-500 px-3 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {creating ? "作成中..." : "作成して追加"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: emoji */}
                {step === "emoji" && (
                  <div className="p-4">
                    <div className="rounded-2xl border border-black/10 bg-black/[.02] p-3">
                      <div className="text-xs text-black/60">
                        Googleのカテゴリから提案します。違ったらすぐ直せます。
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {suggest?.suggestedEmoji ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-xl">{suggest.suggestedEmoji}</span>
                                <span>
                                  おすすめ{" "}
                                  <span className="text-black/45 font-normal">
                                    {labelForEmoji(suggest.suggestedEmoji) ? `（${labelForEmoji(suggest.suggestedEmoji)}）` : ""}
                                  </span>
                                </span>
                              </span>
                            ) : (
                              <span>おすすめなし（手動でOK）</span>
                            )}
                          </div>
                          {suggest?.suggestedType ? (
                            <div className="mt-0.5 text-[11px] text-black/45">type: {suggest.suggestedType}</div>
                          ) : (
                            <div className="mt-0.5 text-[11px] text-black/45">判別できない店もあるので手動で。</div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setEmojiChoice(null)}
                          className="shrink-0 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/5"
                        >
                          なし
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <input
                        value={genreQuery}
                        onChange={(e) => setGenreQuery(e.target.value)}
                        placeholder="ジャンルを検索（例: 焼肉, 寿司）"
                        className="w-full rounded-xl border border-black/20 px-3 py-3 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                    </div>

                    <div className="mt-3 max-h-[42vh] overflow-y-auto pr-1 space-y-2">
                      {filteredGenres.map((g) => {
                        const active = emojiChoice === g.emoji;
                        const isSuggested = suggest?.suggestedEmoji === g.emoji;

                        return (
                          <button
                            key={g.key}
                            type="button"
                            onClick={() => setEmojiChoice(g.emoji)}
                            className={[
                              "w-full rounded-2xl border px-3 py-3 text-left transition",
                              active
                                ? "border-orange-400 bg-orange-50"
                                : "border-black/10 bg-white hover:bg-black/5",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-2xl border border-black/10 bg-white flex items-center justify-center text-2xl">
                                  {g.emoji}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate">{g.label}</div>
                                  <div className="text-[11px] text-black/45">
                                    {isSuggested ? "おすすめ" : " "}
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0">
                                {active ? (
                                  <span className="inline-flex items-center gap-1 text-orange-700 text-xs font-semibold">
                                    <Check className="h-4 w-4" />
                                    選択中
                                  </span>
                                ) : (
                                  <span className="text-xs text-black/35">選ぶ</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-black/10 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("collections");
                          setPendingCollectionId(null);
                          setPendingPlaceId(null);
                          setSuggest(null);
                          setEmojiChoice(null);
                          setGenreQuery("");
                          setError(null);
                        }}
                        className="rounded-xl border border-black/10 px-4 py-3 text-sm hover:bg-black/5"
                      >
                        戻る
                      </button>

                      <button
                        type="button"
                        disabled={!pendingCollectionId}
                        onClick={() => pendingCollectionId && commitAddToCollection(pendingCollectionId)}
                        className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                      >
                        この内容で追加
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* toast */}
            {toastVisible &&
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
          </div>,
          document.body
        )}
    </>
  );
}
