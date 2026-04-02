"use client";

import React, { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Mail, AtSign, Globe, Lock, Trash2 } from "lucide-react";

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

type Props = {
  email: string;
  username: string;
  isPublic: boolean;
};

export default function AccountForm({ email, username: initUsername, isPublic: initIsPublic }: Props) {
  const supabase = createClientComponentClient();

  const [username, setUsername] = useState(initUsername);
  const [isPublic, setIsPublic] = useState(initIsPublic);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameBad = username ? !USERNAME_RE.test(username) : false;
  const hasChanges = username !== initUsername || isPublic !== initIsPublic;

  const handleSave = async () => {
    if (saving || !hasChanges) return;
    if (usernameBad) { setError("\u30E6\u30FC\u30B6\u30FCID\u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059"); return; }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059");

      // Check username availability if changed
      if (username !== initUsername && username) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username)
          .neq("id", user.id)
          .maybeSingle();
        if (existing) {
          setError(`@${username} \u306F\u65E2\u306B\u4F7F\u308F\u308C\u3066\u3044\u307E\u3059`);
          setSaving(false);
          return;
        }
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ username: username || null, is_public: isPublic })
        .eq("id", user.id);

      if (updateErr) throw updateErr;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message ?? "\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Email (read-only) */}
      <div>
        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
          {"\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9"}
        </label>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Mail size={16} className="text-slate-400 shrink-0" />
          <span className="text-[14px] text-slate-500">{email}</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 px-1">
          {"\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093"}
        </p>
      </div>

      {/* Username */}
      <div>
        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
          {"\u30E6\u30FC\u30B6\u30FCID"}
        </label>
        <div className={[
          "flex items-center gap-1 rounded-xl border px-3 py-2.5 transition",
          usernameBad ? "border-red-300 bg-red-50/50" : "border-slate-200 bg-white focus-within:border-slate-400",
        ].join(" ")}>
          <AtSign size={16} className="text-slate-400 shrink-0" />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/^@+/, "").toLowerCase())}
            placeholder="gourmeet_user"
            className="w-full bg-transparent text-[14px] text-slate-800 outline-none placeholder:text-slate-300"
          />
        </div>
        {usernameBad && (
          <p className="text-[11px] text-red-500 mt-1 px-1">
            {"\u534A\u89D2\u82F1\u5C0F\u6587\u5B57\u30FB\u6570\u5B57\u30FB\u30D4\u30EA\u30AA\u30C9\u306E\u307F\u30013\u301C30\u6587\u5B57"}
          </p>
        )}
      </div>

      {/* Public/Private toggle */}
      <div>
        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
          {"\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u516C\u958B\u8A2D\u5B9A"}
        </label>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setIsPublic(true)}
            className={[
              "flex items-center gap-2.5 w-full px-3 py-3 text-left transition",
              isPublic ? "bg-slate-50" : "bg-white hover:bg-slate-50/50",
            ].join(" ")}
          >
            <div className={[
              "h-4 w-4 rounded-full border-2 flex items-center justify-center transition",
              isPublic ? "border-slate-800" : "border-slate-300",
            ].join(" ")}>
              {isPublic && <div className="h-2 w-2 rounded-full bg-slate-800" />}
            </div>
            <Globe size={15} className="text-slate-500" />
            <div>
              <span className="text-[13px] font-medium text-slate-800">{"\u516C\u958B"}</span>
              <span className="text-[11px] text-slate-400 ml-2">{"\u8AB0\u3067\u3082\u6295\u7A3F\u3092\u898B\u3089\u308C\u307E\u3059"}</span>
            </div>
          </button>
          <div className="border-t border-slate-100" />
          <button
            type="button"
            onClick={() => setIsPublic(false)}
            className={[
              "flex items-center gap-2.5 w-full px-3 py-3 text-left transition",
              !isPublic ? "bg-slate-50" : "bg-white hover:bg-slate-50/50",
            ].join(" ")}
          >
            <div className={[
              "h-4 w-4 rounded-full border-2 flex items-center justify-center transition",
              !isPublic ? "border-slate-800" : "border-slate-300",
            ].join(" ")}>
              {!isPublic && <div className="h-2 w-2 rounded-full bg-slate-800" />}
            </div>
            <Lock size={15} className="text-slate-500" />
            <div>
              <span className="text-[13px] font-medium text-slate-800">{"\u975E\u516C\u958B"}</span>
              <span className="text-[11px] text-slate-400 ml-2">{"\u30D5\u30A9\u30ED\u30EF\u30FC\u306E\u307F"}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Save button */}
      {hasChanges && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || usernameBad}
          className={[
            "w-full rounded-xl py-2.5 text-[14px] font-semibold transition",
            saving ? "bg-slate-200 text-slate-400" : "bg-slate-900 text-white hover:bg-slate-800",
          ].join(" ")}
        >
          {saving ? "\u4FDD\u5B58\u4E2D..." : "\u4FDD\u5B58\u3059\u308B"}
        </button>
      )}

      {error && (
        <p className="text-[12px] text-red-600 text-center">{error}</p>
      )}
      {saved && (
        <p className="text-[12px] text-green-600 text-center">{"\u4FDD\u5B58\u3057\u307E\u3057\u305F"}</p>
      )}

      {/* Danger zone */}
      <div className="pt-4 border-t border-slate-100">
        <button
          type="button"
          className="flex items-center gap-2 text-[13px] text-red-500 hover:text-red-600 transition px-1"
          onClick={() => alert("\u30A2\u30AB\u30A6\u30F3\u30C8\u524A\u9664\u306F\u304A\u554F\u3044\u5408\u308F\u305B\u304F\u3060\u3055\u3044\u3002")}
        >
          <Trash2 size={15} />
          {"\u30A2\u30AB\u30A6\u30F3\u30C8\u3092\u524A\u9664"}
        </button>
      </div>
    </div>
  );
}
