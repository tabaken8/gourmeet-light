"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Collection = {
  id: string;
  name: string;
};

type Props = {
  collections: Collection[];
  activeCollectionId: string | null;
};

export default function CollectionListClient({
  collections,
  activeCollectionId,
}: Props) {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      alert("ログインが必要です");
      setCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from("collections")
      .insert({
        user_id: user.id,
        name: newName.trim(),
      })
      .select("id, name")
      .single();

    setCreating(false);

    if (error || !data) {
      console.error(error);
      alert("コレクションの作成に失敗しました");
      return;
    }

    setNewName("");
    router.push(`/collection?c=${data.id}`);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    const ok = window.confirm(
      "このコレクションを削除しますか？\n中の『紐づけ』は消えますが、投稿自体は削除されません。"
    );
    if (!ok) return;

    setDeletingId(id);

    const { error } = await supabase
      .from("collections")
      .delete()
      .eq("id", id);

    setDeletingId(null);

    if (error) {
      console.error(error);
      alert("コレクションの削除に失敗しました");
      return;
    }

    if (activeCollectionId === id) {
      router.push("/collection");
    }
    router.refresh();
  };

  return (
    <div className="rounded-3xl border border-orange-100 bg-white/95 px-4 py-4 shadow-sm">
      {/* 見出し */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700 tracking-wide">
          コレクション
        </p>
        <span className="text-[11px] text-slate-400">
          {collections.length} lists
        </span>
      </div>

      {/* 追加フォーム（真っ黒→白ベースに変更） */}
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新しいコレクション名"
          className="h-9 flex-1 rounded-full border border-orange-100 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-300 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="コレクションを作成"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* リスト */}
      {collections.length === 0 ? (
        <div className="mt-4 text-xs leading-relaxed text-slate-400">
          まだコレクションがありません。
          <br />
          上のフォームから新しく作成できます。
        </div>
      ) : (
        <nav className="mt-1 space-y-1.5">
          {collections.map((c) => {
            const isActive = c.id === activeCollectionId;
            const isDeleting = deletingId === c.id;
            return (
              <div
                key={c.id}
                className={[
                  "group flex items-center justify-between rounded-2xl px-2 py-1.5 text-xs transition",
                  isActive
                    ? "bg-orange-50 text-orange-700 border border-orange-200"
                    : "bg-transparent text-slate-700 border border-transparent hover:bg-orange-50",
                ].join(" ")}
              >
                <Link
                  href={`/collection?c=${c.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <span
                    className={[
                      "h-1.5 w-1.5 rounded-full",
                      isActive ? "bg-orange-500" : "bg-orange-200",
                    ].join(" ")}
                  />
                  <span className="truncate">{c.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={isDeleting}
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-orange-50 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="コレクションを削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
