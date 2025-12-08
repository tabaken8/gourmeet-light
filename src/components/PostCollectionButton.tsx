"use client";

import { useEffect, useRef, useState } from "react";
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

export default function PostCollectionButton({
  postId,
  className,
}: PostCollectionButtonProps) {
  const supabase = createClientComponentClient();

  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [includedIds, setIncludedIds] = useState<string[]>([]); // 👈 この投稿が属しているコレクションID
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // トースト用
  const [toastVisible, setToastVisible] = useState(false);
  const [toastShown, setToastShown] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // タイマーのクリーンアップ
  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, []);

  // モーダルが開いたときに、自分のコレクション一覧 + この投稿が属しているコレクションを取得
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      setError(null);
      setLoading(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (!cancelled) setError("ユーザー情報の取得に失敗しました");
        setLoading(false);
        return;
      }

      const user = session?.user;

      if (!user) {
        if (!cancelled) setError("コレクションを使うにはログインが必要です");
        setLoading(false);
        return;
      }

      // 👇 コレクション一覧 + post_collections をまとめて取得
      const [collectionsRes, postCollectionsRes] = await Promise.all([
        supabase
          .from("collections")
          .select("id, name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("post_collections")
          .select("collection_id")
          .eq("post_id", postId),
      ]);

      if (cancelled) return;

      if (collectionsRes.error) {
        setError("コレクションの取得に失敗しました");
      } else {
        setCollections((collectionsRes.data ?? []) as Collection[]);
      }

      if (!postCollectionsRes.error && postCollectionsRes.data) {
        setIncludedIds(
          (postCollectionsRes.data as { collection_id: string }[]).map(
            (r) => r.collection_id
          )
        );
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, supabase, postId]);

  const includedSet = new Set(includedIds);

  // 🔔 トースト表示開始
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

  // 🧨 Undo（キャンセル）
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

    // 状態からも除去
    setIncludedIds((prev) => prev.filter((id) => id !== collectionId));

    setToastShown(false);
    setTimeout(() => {
      setToastVisible(false);
      setPendingUndo(null);
    }, 300);
  };

  // 既存コレクションに追加
  const handleAddToCollection = async (collectionId: string) => {
    // すでに含まれているコレクションなら何もしない
    if (includedSet.has(collectionId)) return;

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
      console.log("post_collections insert error:", error);
      setError("コレクションへの追加に失敗しました");
      return;
    }

    // 状態にも反映（その場で「追加済み」にする）
    setIncludedIds((prev) =>
      prev.includes(collectionId) ? prev : [...prev, collectionId]
    );

    setOpen(false);
    startToast(collectionId);
  };

  // 新規コレクションを作って、そこに追加
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

    // コレクション作成
    const { data: created, error: createError } = await supabase
      .from("collections")
      .insert({
        user_id: user.id,
        name: newName.trim(),
      })
      .select("id, name")
      .single();

    if (createError || !created) {
      setError("コレクションの作成に失敗しました");
      setCreating(false);
      return;
    }

    // 中間テーブルに追加
    const { error: linkError } = await supabase
      .from("post_collections")
      .insert({
        collection_id: created.id,
        post_id: postId,
      });

    if (linkError && (linkError as any).code !== "23505") {
      console.log("post_collections insert error:", linkError);
      setError("コレクションへの追加に失敗しました");
      setCreating(false);
      return;
    }

    // 状態にも反映
    setIncludedIds((prev) => [...prev, created.id]);

    setCreating(false);
    setOpen(false);
    setNewName("");
    startToast(created.id);
  };

  return (
    <>
      {/* プラスボタン本体 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          "flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm hover:bg-orange-600 transition-colors",
          className ?? "",
        ].join(" ")}
        aria-label="コレクションに追加"
      >
        <Plus className="h-5 w-5" />
      </button>

      {/* モーダル */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg">
            {/* ヘッダー */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">コレクションに追加</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-black/50 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* エラー表示 */}
            {error && (
              <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* 既存コレクション一覧 */}
            <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
              {loading ? (
                <p className="text-xs text-black/50">読み込み中...</p>
              ) : collections.length === 0 ? (
                <p className="text-xs text-black/50">
                  まだコレクションがありません。
                </p>
              ) : (
                collections.map((c) => {
                  const included = includedSet.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        included ? undefined : handleAddToCollection(c.id)
                      }
                      disabled={included}
                      className={[
                        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                        included
                          ? "border-orange-300 bg-orange-50 text-orange-700 cursor-default"
                          : "border-black/10 hover:bg-black/5",
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
                        {included ? "追加済み" : "追加"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* 新規作成エリア */}
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
                disabled={creating}
                className="flex w-full items-center justify-center rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "作成中..." : "作成して追加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト通知：画面上部からスライドイン */}
      {toastVisible && (
        <div className="fixed inset-x-0 top-4 z-[60] flex justify-center">
          <div
            className={[
              "inline-flex items-center gap-4 rounded-2xl bg-black/85 px-5 py-3 text-sm text-white shadow-lg transition-all duration-500 transform",
              toastShown
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-5",
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
        </div>
      )}
    </>
  );
}
