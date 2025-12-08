"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

type Props = {
  collectionId: string;
  postId: string;
};

export default function UncollectButton({ collectionId, postId }: Props) {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    const ok = window.confirm("このコレクションからこの投稿を削除しますか？");
    if (!ok) return;

    setLoading(true);
    const { error } = await supabase
      .from("post_collections")
      .delete()
      .eq("collection_id", collectionId)
      .eq("post_id", postId);

    setLoading(false);

    if (error) {
      console.error(error);
      alert("削除に失敗しました");
      return;
    }

    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-full border border-neutral-600 px-2 py-1 text-[10px] text-neutral-200 hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <X className="h-3 w-3" />
      <span>このコレクションから削除</span>
    </button>
  );
}
