"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("collection");
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
      alert(t("loginRequiredAlert"));
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
      alert(t("createFailed"));
      return;
    }

    setNewName("");
    router.push(`/collection?c=${data.id}`);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    const ok = window.confirm(t("deleteConfirm"));
    if (!ok) return;

    setDeletingId(id);

    const { error } = await supabase
      .from("collections")
      .delete()
      .eq("id", id);

    setDeletingId(null);

    if (error) {
      console.error(error);
      alert(t("deleteFailed"));
      return;
    }

    if (activeCollectionId === id) {
      router.push("/collection");
    }
    router.refresh();
  };

  return (
    <div className="rounded-3xl border border-orange-100 dark:border-white/[.08] bg-white/95 dark:bg-[#16181e] px-4 py-4 shadow-sm">
      {/* 見出し */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700 dark:text-gray-300 tracking-wide">
          {t("title")}
        </p>
        <span className="text-[11px] text-slate-400 dark:text-gray-500">
          {collections.length} lists
        </span>
      </div>

      {/* 追加フォーム */}
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("newCollectionPlaceholder")}
          className="h-9 flex-1 rounded-full border border-orange-100 dark:border-white/[.10] bg-white dark:bg-white/[.06] px-3 text-xs text-slate-800 dark:text-gray-200 placeholder:text-slate-300 dark:placeholder:text-gray-500 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={t("createCollection")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* リスト */}
      {collections.length === 0 ? (
        <div className="mt-4 text-xs leading-relaxed text-slate-400 dark:text-gray-500">
          {t("emptyList")}
          <br />
          {t("createHint")}
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
                    ? "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30"
                    : "bg-transparent text-slate-700 dark:text-gray-300 border border-transparent hover:bg-orange-50 dark:hover:bg-white/[.06]",
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
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 dark:text-gray-500 hover:bg-orange-50 dark:hover:bg-white/[.08] hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={t("deleteCollection")}
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
