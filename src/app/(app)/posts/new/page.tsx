"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Image as ImageIcon, MapPin, X } from "lucide-react";
import { searchPlaces } from "@/lib/google/places";

export default function NewPostPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 店舗関連
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<any[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<any | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, [supabase]);

  // 入力ごとに場所候補を検索（デバウンス付き）
  useEffect(() => {
    if (placeQuery.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(placeQuery)}`);
        const data = await res.json();
        setPlaceResults(data.results ?? []);
      } catch (e) {
        console.error(e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [placeQuery]);

  // クリップボードからペーストで画像追加
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const pastedFiles = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (pastedFiles.length > 0) {
        setFiles((prev) => [...prev, ...pastedFiles]);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return setMsg("ログインしてください。");
    setBusy(true);
    setMsg(null);

    const urls: string[] = [];

    try {
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `${uid}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage
          .from("post-images")
          .getPublicUrl(path);
        urls.push(pub.publicUrl);
      }

      const { error: insErr } = await supabase.from("posts").insert({
        user_id: uid,
        content,
        image_urls: urls,
        place_id: selectedPlace?.place_id ?? null,
        place_name: selectedPlace?.name ?? null,
        place_address: selectedPlace?.formatted_address ?? null,
      });
      if (insErr) throw insErr;

      router.push("/timeline");
      router.refresh();
    } catch (err: any) {
      setMsg(err.message ?? "投稿に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (newFiles) setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  };

  return (
    <main className="rounded-2xl bg-white p-6 shadow-sm max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        {/* 本文 */}
        <textarea
          className="w-full rounded border border-black/10 px-3 py-2 h-28"
          placeholder="いま何食べてる？（ここにCommand+Vでも画像追加できます）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {/* 店舗名があれば表示 */}
        {selectedPlace && (
          <p className="text-sm text-orange-700">
            📍 {selectedPlace.name} ({selectedPlace.formatted_address})
          </p>
        )}

        {/* プレビュー */}
        {files.length > 0 && (
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <li key={i} className="relative group">
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="aspect-square w-full object-cover rounded"
                />
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 opacity-80 hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* ボタン群 */}
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            {/* 画像追加 */}
            <label className="cursor-pointer">
              <ImageIcon size={22} className="text-black/70 hover:text-black" />
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>

            {/* 店舗追加 */}
            <div className="relative">
              <input
                type="text"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="お店を検索"
                className="border rounded px-2 py-1 text-sm"
              />
              {placeResults.length > 0 && (
                <ul className="absolute z-10 bg-white border rounded w-full mt-1 max-h-40 overflow-y-auto">
                  {placeResults.map((p) => (
                    <li
                      key={p.place_id}
                      className="px-3 py-2 hover:bg-orange-50 cursor-pointer"
                      onClick={() => {
                        setSelectedPlace(p);
                        setPlaceQuery("");
                        setPlaceResults([]);
                      }}
                    >
                      {p.name} <span className="text-xs text-gray-500">{p.formatted_address}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <button
            disabled={busy}
            className="inline-flex h-10 items-center rounded-full bg-orange-700 px-5 text-white disabled:opacity-60"
          >
            {busy ? "投稿中..." : "投稿"}
          </button>
        </div>

        {msg && <p className="text-sm text-red-600">{msg}</p>}
      </form>
    </main>
  );
}
