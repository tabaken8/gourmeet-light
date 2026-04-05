"use client";

import React, { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Mail, AtSign, Globe, Lock, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

type Props = {
  email: string;
  username: string;
  isPublic: boolean;
};

export default function AccountForm({ email, username: initUsername, isPublic: initIsPublic }: Props) {
  const supabase = createClientComponentClient();
  const t = useTranslations("settings");

  const [username, setUsername] = useState(initUsername);
  const [isPublic, setIsPublic] = useState(initIsPublic);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameBad = username ? !USERNAME_RE.test(username) : false;
  const hasChanges = username !== initUsername || isPublic !== initIsPublic;

  const handleSave = async () => {
    if (saving || !hasChanges) return;
    if (usernameBad) { setError(t("usernameInvalid")); return; }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("loginRequired"));

      // Check username availability if changed
      if (username !== initUsername && username) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", username)
          .neq("id", user.id)
          .maybeSingle();
        if (existing) {
          setError(t("usernameTaken", { username }));
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
      setError(e?.message ?? t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Email (read-only) */}
      <div>
        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
          {t("email")}
        </label>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Mail size={16} className="text-slate-400 shrink-0" />
          <span className="text-[14px] text-slate-500">{email}</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1 px-1">
          {t("emailCannotChange")}
        </p>
      </div>

      {/* Username */}
      <div>
        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
          {t("userId")}
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
            {t("usernameRule")}
          </p>
        )}
      </div>

      {/* Public/Private toggle */}
      <div>
        <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
          {t("accountVisibility")}
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
              <span className="text-[13px] font-medium text-slate-800">{t("public")}</span>
              <span className="text-[11px] text-slate-400 ml-2">{t("publicDesc")}</span>
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
              <span className="text-[13px] font-medium text-slate-800">{t("private")}</span>
              <span className="text-[11px] text-slate-400 ml-2">{t("privateDesc")}</span>
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
          {saving ? t("saving") : t("save")}
        </button>
      )}

      {error && (
        <p className="text-[12px] text-red-600 text-center">{error}</p>
      )}
      {saved && (
        <p className="text-[12px] text-green-600 text-center">{t("saved")}</p>
      )}

      {/* Danger zone */}
      <div className="pt-4 border-t border-slate-100">
        <button
          type="button"
          className="flex items-center gap-2 text-[13px] text-red-500 hover:text-red-600 transition px-1"
          onClick={() => alert(t("deleteAccountAlert"))}
        >
          <Trash2 size={15} />
          {t("deleteAccount")}
        </button>
      </div>
    </div>
  );
}
