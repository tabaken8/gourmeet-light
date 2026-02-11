"use client";

import React, { useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Bell, Mail, ToggleLeft, ToggleRight, Search } from "lucide-react";

type Prefs = {
  email_enabled: boolean;
  email_like: boolean;
  email_comment: boolean;
  email_reply: boolean;
  email_follow: boolean;
  email_post: boolean;
  email_want: boolean;
};

type Target = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  enabled: boolean;
};

function Switch({
  on,
  label,
  sub,
  onToggle,
}: {
  on: boolean;
  label: string;
  sub?: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-start justify-between gap-4 rounded-xl border border-black/[.06] bg-white px-4 py-3 text-left hover:bg-slate-50"
    >
      <div className="min-w-0">
        <div className="text-sm font-extrabold text-slate-900">{label}</div>
        {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
      </div>
      <div className="shrink-0">
        {on ? (
          <ToggleRight className="text-orange-600" />
        ) : (
          <ToggleLeft className="text-slate-400" />
        )}
      </div>
    </button>
  );
}

export default function NotificationSettingsClient({
  initial,
  initialTargets,
}: {
  initial: Prefs;
  initialTargets: Target[];
}) {
  const supabase = createClientComponentClient();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [targets, setTargets] = useState<Target[]>(initialTargets);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredTargets = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return targets;
    return targets.filter((t) => {
      const name = (t.display_name ?? "").toLowerCase();
      const un = (t.username ?? "").toLowerCase();
      return name.includes(key) || un.includes(key);
    });
  }, [targets, q]);

  const upsertPrefs = async (next: Partial<Prefs>) => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("not logged in");

      const newPrefs = { ...prefs, ...next };
      setPrefs(newPrefs);

      const { error } = await supabase
        .from("user_notification_settings")
        .upsert({ user_id: uid, ...newPrefs }, { onConflict: "user_id" });

      if (error) throw new Error(error.message);
    } catch (e: any) {
      console.error("save prefs error:", e?.message ?? e);
    } finally {
      setSaving(false);
    }
  };

  const toggleTarget = async (targetUserId: string, nextEnabled: boolean) => {
    // UI先行
    setTargets((prev) =>
      prev.map((t) => (t.id === targetUserId ? { ...t, enabled: nextEnabled } : t))
    );

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("not logged in");

      if (nextEnabled) {
        const { error } = await supabase
          .from("user_post_subscriptions")
          .upsert(
            { user_id: uid, target_user_id: targetUserId, enabled: true },
            { onConflict: "user_id,target_user_id" }
          );
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("user_post_subscriptions")
          .update({ enabled: false })
          .eq("user_id", uid)
          .eq("target_user_id", targetUserId);
        if (error) throw new Error(error.message);
      }
    } catch (e: any) {
      console.error("toggle target error:", e?.message ?? e);
      // rollback
      setTargets((prev) =>
        prev.map((t) => (t.id === targetUserId ? { ...t, enabled: !nextEnabled } : t))
      );
    }
  };

  const setAllTargets = async (nextEnabled: boolean) => {
    setTargets((prev) => prev.map((t) => ({ ...t, enabled: nextEnabled })));

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("not logged in");

      if (nextEnabled) {
        // 一括ON：upsert（フォロー済みしかRLS通らない）
        const payload = targets.map((t) => ({
          user_id: uid,
          target_user_id: t.id,
          enabled: true,
        }));
        const { error } = await supabase
          .from("user_post_subscriptions")
          .upsert(payload, { onConflict: "user_id,target_user_id" });
        if (error) throw new Error(error.message);
      } else {
        // 一括OFF：update
        const { error } = await supabase
          .from("user_post_subscriptions")
          .update({ enabled: false })
          .eq("user_id", uid);
        if (error) throw new Error(error.message);
      }
    } catch (e: any) {
      console.error("setAllTargets error:", e?.message ?? e);
    }
  };

  return (
    <div className="space-y-6">
      {/* 全体 */}
      <section className="rounded-none border border-black/[.06] bg-white p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Mail size={18} className="text-orange-600" />
          <h2 className="text-sm font-extrabold text-slate-900 md:text-base">メール通知</h2>
          {saving ? <span className="text-xs font-semibold text-slate-500">保存中…</span> : null}
        </div>

        <div className="grid gap-3">
          <Switch
            on={prefs.email_enabled}
            label="メール通知を有効にする"
            sub="オフにすると全ての通知メールが止まります"
            onToggle={() => upsertPrefs({ email_enabled: !prefs.email_enabled })}
          />
        </div>
      </section>

      {/* タイプ別 */}
      <section className="rounded-none border border-black/[.06] bg-white p-4 md:p-5">
        <h2 className="mb-3 text-sm font-extrabold text-slate-900 md:text-base">種類ごとの設定</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <Switch
            on={prefs.email_follow}
            label="フォロー"
            sub="フォローされた通知"
            onToggle={() => upsertPrefs({ email_follow: !prefs.email_follow })}
          />
          <Switch
            on={prefs.email_like}
            label="いいね"
            sub="いいねされた通知"
            onToggle={() => upsertPrefs({ email_like: !prefs.email_like })}
          />
          <Switch
            on={prefs.email_comment}
            label="コメント"
            sub="コメントが届いた通知"
            onToggle={() => upsertPrefs({ email_comment: !prefs.email_comment })}
          />
          <Switch
            on={prefs.email_reply}
            label="返信"
            sub="返信が届いた通知"
            onToggle={() => upsertPrefs({ email_reply: !prefs.email_reply })}
          />
          <Switch
            on={prefs.email_post}
            label="投稿（ベル）"
            sub="フォロー中の人の新規投稿通知"
            onToggle={() => upsertPrefs({ email_post: !prefs.email_post })}
          />
          <Switch
            on={prefs.email_want}
            label="行きたい！"
            sub="（デフォルトOFF推奨）"
            onToggle={() => upsertPrefs({ email_want: !prefs.email_want })}
          />
        </div>
      </section>

      {/* ベル（人ごと） */}
      <section className="rounded-none border border-black/[.06] bg-white p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-orange-600" />
            <h2 className="text-sm font-extrabold text-slate-900 md:text-base">投稿通知（人ごと）</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAllTargets(true)}
              className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-extrabold text-orange-700 hover:bg-orange-100"
            >
              全員ON
            </button>
            <button
              type="button"
              onClick={() => setAllTargets(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
            >
              全員OFF
            </button>
          </div>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前 / username で検索"
            className="w-full rounded-full border border-orange-100 bg-white px-9 py-2 text-sm outline-none focus:border-orange-200"
          />
        </div>

        <div className="space-y-2">
          {filteredTargets.length === 0 ? (
            <div className="border border-black/[.06] bg-white p-6 text-center text-sm text-slate-600">
              フォロー中のユーザーがいません。
            </div>
          ) : (
            filteredTargets.map((t) => {
              const display = t.display_name || t.username || "User";
              const initial = (display || "U").slice(0, 1).toUpperCase();

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/[.06] bg-white px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {t.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.avatar_url}
                        alt=""
                        className="h-10 w-10 rounded-full border border-black/[.06] object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/[.06] bg-orange-50 font-extrabold text-orange-700">
                        {initial}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-slate-900">{display}</div>
                      {t.username ? (
                        <div className="truncate text-xs font-semibold text-slate-500">@{t.username}</div>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleTarget(t.id, !t.enabled)}
                    className={[
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold",
                      t.enabled
                        ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    ].join(" ")}
                    title={t.enabled ? "投稿通知：ON（クリックでOFF）" : "投稿通知：OFF（クリックでON）"}
                  >
                    <Bell size={14} />
                    {t.enabled ? "ON" : "OFF"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
