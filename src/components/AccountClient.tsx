"use client";

import { useState, useRef } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Props = {
  initialDisplayName: string;
  initialBio: string;
  initialAvatarUrl: string | null;
};

export default function AccountClient({ initialDisplayName, initialBio, initialAvatarUrl }: Props) {
  const supabase = createClientComponentClient();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f || null);
    if (f) {
      const url = URL.createObjectURL(f);
      setAvatarUrl(url); // 先にプレビュー
    }
  };

  const onSave = async () => {
    setBusy(true);
    try {
      // 現在ユーザー取得
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("ログインが必要です");

      // 画像アップロード（選択されていれば）
      let finalAvatarUrl = initialAvatarUrl || null;
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${uid}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, cacheControl: "3600" });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        finalAvatarUrl = data.publicUrl;
      }

      // メタデータ更新
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName, bio, avatar_url: finalAvatarUrl },
      });
      if (error) throw error;

      setEditing(false);
    } catch (e: any) {
      alert(e.message || "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white">
      <div className="flex items-center gap-4">
        <button
          className="relative h-16 w-16 overflow-hidden rounded-full bg-white/15"
          onClick={() => editing && inputRef.current?.click()}
          title={editing ? "画像を変更" : ""}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-bold">
              {(displayName || "U").slice(0, 1).toUpperCase()}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickAvatar}
          />
        </button>

        <div className="flex-1">
          {!editing ? (
            <>
              <h1 className="text-2xl font-semibold">{displayName}</h1>
              <p className="text-white/80 text-sm">{bio || "自己紹介はまだありません。"}</p>
            </>
          ) : (
            <div className="flex max-w-xl flex-wrap items-center gap-3">
              <input
                className="min-w-[220px] rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none backdrop-blur placeholder-white/60"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="表示名"
              />
              <input
                className="min-w-[260px] flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white outline-none backdrop-blur placeholder-white/60"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="自己紹介"
              />
            </div>
          )}
        </div>

        {!editing ? (
          <button className="rounded-full bg-white px-5 py-2 font-semibold text-brand-900 hover:bg-brand-50" onClick={() => setEditing(true)}>
            編集
          </button>
        ) : (
          <div className="flex gap-2">
            <button disabled={busy} className="rounded-full bg-white px-5 py-2 font-semibold text-brand-900 hover:bg-brand-50 disabled:opacity-60" onClick={onSave}>
              {busy ? "保存中…" : "保存"}
            </button>
            <button className="rounded-full border border-white/30 px-5 py-2 font-semibold hover:bg-white/10" onClick={() => { setEditing(false); setDisplayName(initialDisplayName); setBio(initialBio); setAvatarUrl(initialAvatarUrl); setFile(null); }}>
              キャンセル
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
