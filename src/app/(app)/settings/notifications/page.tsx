"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Bell, Mail, Smartphone, ArrowLeft } from "lucide-react";
import Link from "next/link";
import XSwitch from "@/components/XSwitch";

type SettingsRow = {
  user_id: string;

  // master
  email_enabled: boolean;
  inapp_enabled: boolean;

  // per type (NO want)
  email_follow: boolean;
  email_like: boolean;
  email_comment: boolean;
  email_reply: boolean;
  email_post: boolean;

  inapp_follow: boolean;
  inapp_like: boolean;
  inapp_comment: boolean;
  inapp_reply: boolean;
  inapp_post: boolean;

  updated_at?: string | null;
};

function Row({
  title,
  desc,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {desc ? <div className="mt-0.5 text-xs text-gray-600">{desc}</div> : null}
      </div>
      <XSwitch checked={checked} onChange={onChange} disabled={disabled} aria-label={title} />
    </div>
  );
}

export default function NotificationsSettingsPage() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [s, setS] = useState<SettingsRow | null>(null);

  const canEmail = !!s?.email_enabled;
  const canInapp = !!s?.inapp_enabled;

  const patch = async (partial: Partial<SettingsRow>, keyForLoading?: string) => {
    if (!meId) return;
    setSavingKey(keyForLoading ?? "x");
    setS((prev) => (prev ? { ...prev, ...partial } : prev));

    const { error } = await supabase
      .from("user_notification_settings")
      .upsert({ user_id: meId, ...partial }, { onConflict: "user_id" });

    setSavingKey(null);

    if (error) {
      // 巻き戻し（シンプルに再取得）
      console.error("update settings error:", error.message);
      const { data } = await supabase
        .from("user_notification_settings")
        .select("*")
        .eq("user_id", meId)
        .maybeSingle();
      if (data) setS(data as any);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setMeId(uid);
      if (!uid) {
        setLoading(false);
        return;
      }

      // 既存設定取得。無ければデフォルトで作る（フォロー通知など全部ON）
      const { data } = await supabase
        .from("user_notification_settings")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();

      if (data) {
        setS(data as any);
        setLoading(false);
        return;
      }

      const defaults: SettingsRow = {
        user_id: uid,
        email_enabled: true,
        inapp_enabled: true,

        email_follow: true,
        email_like: true,
        email_comment: true,
        email_reply: true,
        email_post: true,

        inapp_follow: true,
        inapp_like: true,
        inapp_comment: true,
        inapp_reply: true,
        inapp_post: true,
      };

      await supabase.from("user_notification_settings").insert(defaults as any);
      setS(defaults);
      setLoading(false);
    })();
  }, [supabase]);

  const skeleton = (
    <div className="space-y-2">
      <div className="h-[72px] rounded-2xl border border-black/10 bg-white/70" />
      <div className="h-[72px] rounded-2xl border border-black/10 bg-white/70" />
      <div className="h-[72px] rounded-2xl border border-black/10 bg-white/70" />
    </div>
  );

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/settings" className="rounded-xl border border-black/10 bg-white p-2 shadow-sm">
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </Link>
          <div className="text-lg font-bold">通知設定</div>
        </div>
        {skeleton}
      </main>
    );
  }

  if (!meId || !s) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
        <div className="rounded-2xl border border-black/10 bg-white p-6 text-sm text-gray-700 shadow-sm">
          ログインが必要です。
        </div>
      </main>
    );
  }

  const busy = (k: string) => savingKey === k;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/settings" className="mt-0.5 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">通知設定</h1>
            <p className="mt-1 text-sm text-gray-600">メール通知とアプリ内通知を管理します。</p>
          </div>
        </div>
        <div className="mt-1 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
          <Bell className="h-5 w-5 text-gray-700" />
        </div>
      </div>

      {/* master toggles */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Mail className="h-4 w-4" />
          メール通知
        </div>

        <Row
          title="メール通知を有効にする"
          desc="OFFにすると、すべてのメール通知が停止します。"
          checked={s.email_enabled}
          onChange={(v) => patch({ email_enabled: v }, "email_enabled")}
          disabled={busy("email_enabled")}
        />

        <div className="space-y-2">
          <Row
            title="フォロー"
            desc="フォローされたとき"
            checked={s.email_follow && canEmail}
            onChange={(v) => patch({ email_follow: v }, "email_follow")}
            disabled={!canEmail || busy("email_follow")}
          />
          <Row
            title="いいね"
            desc="あなたの投稿にいいねされたとき"
            checked={s.email_like && canEmail}
            onChange={(v) => patch({ email_like: v }, "email_like")}
            disabled={!canEmail || busy("email_like")}
          />
          <Row
            title="コメント"
            desc="コメントが付いたとき"
            checked={s.email_comment && canEmail}
            onChange={(v) => patch({ email_comment: v }, "email_comment")}
            disabled={!canEmail || busy("email_comment")}
          />
          <Row
            title="返信"
            desc="返信が来たとき"
            checked={s.email_reply && canEmail}
            onChange={(v) => patch({ email_reply: v }, "email_reply")}
            disabled={!canEmail || busy("email_reply")}
          />
          <Row
            title="新規投稿（ベル）"
            desc="あなたがベルONにしている人が投稿したとき"
            checked={s.email_post && canEmail}
            onChange={(v) => patch({ email_post: v }, "email_post")}
            disabled={!canEmail || busy("email_post")}
          />
        </div>
      </section>

      <div className="my-8 h-px bg-black/10" />

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Smartphone className="h-4 w-4" />
          アプリ内通知
        </div>

        <Row
          title="アプリ内通知を有効にする"
          desc="OFFにすると、通知ボックスには表示されません。"
          checked={s.inapp_enabled}
          onChange={(v) => patch({ inapp_enabled: v }, "inapp_enabled")}
          disabled={busy("inapp_enabled")}
        />

        <div className="space-y-2">
          <Row
            title="フォロー"
            desc="通知ボックスに表示"
            checked={s.inapp_follow && canInapp}
            onChange={(v) => patch({ inapp_follow: v }, "inapp_follow")}
            disabled={!canInapp || busy("inapp_follow")}
          />
          <Row
            title="いいね"
            desc="通知ボックスに表示"
            checked={s.inapp_like && canInapp}
            onChange={(v) => patch({ inapp_like: v }, "inapp_like")}
            disabled={!canInapp || busy("inapp_like")}
          />
          <Row
            title="コメント"
            desc="通知ボックスに表示"
            checked={s.inapp_comment && canInapp}
            onChange={(v) => patch({ inapp_comment: v }, "inapp_comment")}
            disabled={!canInapp || busy("inapp_comment")}
          />
          <Row
            title="返信"
            desc="通知ボックスに表示"
            checked={s.inapp_reply && canInapp}
            onChange={(v) => patch({ inapp_reply: v }, "inapp_reply")}
            disabled={!canInapp || busy("inapp_reply")}
          />
          <Row
            title="新規投稿（ベル）"
            desc="ベルONの人の新規投稿を通知ボックスに表示"
            checked={s.inapp_post && canInapp}
            onChange={(v) => patch({ inapp_post: v }, "inapp_post")}
            disabled={!canInapp || busy("inapp_post")}
          />
        </div>
      </section>

      <div className="mt-8 rounded-2xl border border-black/10 bg-white p-4 text-xs text-gray-600 shadow-sm">
        <div className="font-semibold text-gray-900">メモ</div>
        <div className="mt-1 leading-relaxed">
          「新規投稿（ベル）」は、プロフィールでベルをONにしている相手の投稿に対してのみ発火します。
          （フォローしているだけでは通知は飛びません）
        </div>
      </div>
    </main>
  );
}
