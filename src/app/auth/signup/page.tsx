"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function strengthLabel(pw: string) {
  const len = pw.length;
  const varc =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) +
    Number(/[^a-zA-Z0-9]/.test(pw));
  const score =
    (len >= 12 ? 2 : len >= 8 ? 1 : 0) + (varc >= 3 ? 2 : varc >= 2 ? 1 : 0);
  return score >= 3 ? "strong" : score === 2 ? "medium" : "weak";
}

function normalizeInvite(raw: string) {
  return (raw || "").trim().replace(/\s+/g, "").toUpperCase();
}

export default function SignUpPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ 招待コード
  const [invite, setInvite] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  // 1) URL ?invite= を拾う  2) localStorage の pending を拾う
  useEffect(() => {
    const fromUrl =
      normalizeInvite(searchParams.get("invite") || "") ||
      normalizeInvite(searchParams.get("code") || "");

    const fromLs =
      typeof window !== "undefined"
        ? normalizeInvite(localStorage.getItem("pending_invite") || "")
        : "";

    const picked = fromUrl || fromLs;

    if (picked && !normalizeInvite(invite)) {
      setInvite(picked);
      setInviteOpen(false); // 自動適用時は畳む
    }

    if (fromUrl && typeof window !== "undefined") {
      localStorage.setItem("pending_invite", fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ✅ invite が手入力/貼り付けで変わったら localStorage を更新（保険）
  useEffect(() => {
    const trimmed = normalizeInvite(invite);
    if (typeof window === "undefined") return;
    if (trimmed) localStorage.setItem("pending_invite", trimmed);
  }, [invite]);

  const match = pw.length > 0 && pw === pw2;
  const strength = useMemo(() => strengthLabel(pw), [pw]);
  const canSubmit = !!email && pw.length >= 6 && match && !loading;

  const handleEmailChange = (value: string) => {
    setEmail(value);

    if (!displayName) {
      const localPart = value.split("@")[0] ?? "";
      if (localPart) setDisplayName(localPart);
    }
  };

  const pasteInviteFromClipboard = async () => {
    setInviteMsg(null);
    setPasting(true);
    try {
      if (!navigator.clipboard?.readText) {
        setInviteMsg("このブラウザでは貼り付けが使えません。手入力してください。");
        return;
      }
      const text = await navigator.clipboard.readText();
      const normalized = normalizeInvite(text);

      if (!normalized) {
        setInviteMsg("クリップボードに招待コードが見つかりませんでした。");
        return;
      }

      setInvite(normalized);
      setInviteOpen(true); // 貼り付けたら見える状態に
      setInviteMsg("貼り付けました。");
      window.setTimeout(() => setInviteMsg(null), 1200);
    } catch (e) {
      setInviteMsg("貼り付けに失敗しました。手入力してください。");
    } finally {
      setPasting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setMsg(null);

    const trimmedDisplayName = displayName.trim();
    const trimmedInvite = normalizeInvite(invite);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options:
        trimmedDisplayName || trimmedInvite
          ? {
              data: {
                ...(trimmedDisplayName ? { display_name: trimmedDisplayName } : {}),
                ...(trimmedInvite ? { invite_code: trimmedInvite } : {}),
              },
            }
          : undefined,
    });

    setLoading(false);

    if (error) return setMsg(error.message);

    // メール確認ありの場合：localStorage に残しておく
    if (data.user && !data.session) {
      if (trimmedInvite && typeof window !== "undefined") {
        localStorage.setItem("pending_invite", trimmedInvite);
      }
      setMsg("確認メールを送信しました。受信ボックスをご確認ください。");
    }
  };

  const handleGoogleContinue = async () => {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const trimmedInvite = normalizeInvite(invite);

    // ✅ OAuthに飛ぶ前に端末に覚えさせておく（保険）
    if (trimmedInvite) {
      localStorage.setItem("pending_invite", trimmedInvite);
    }

    // ✅ callback に invite を持っていく（callback側で拾える）
    const redirectTo = trimmedInvite
      ? `${origin}/auth/callback?invite=${encodeURIComponent(trimmedInvite)}`
      : `${origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error(error);
      alert("Googleログインに失敗しました: " + error.message);
    }
  };

  const inviteApplied = !!normalizeInvite(invite);

  // ✅ ボタン付近にも出す補足文（入力欄を見落としても伝わる）
  const emailConfirmNote = "「登録する」を押すと、このメールアドレス宛に確認メールが届きます。";

  return (
    <main className="grid gap-8 md:grid-cols-2">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">会員登録</h1>

        {/* ✅ 招待コード */}
        <div className="mb-5">
          {inviteApplied ? (
            <div className="rounded-2xl border border-black/10 bg-black/[.02] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">✅ 招待コードを適用しました</div>
                  <div className="mt-1 font-mono text-lg tracking-widest break-all">
                    {normalizeInvite(invite)}
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    変更したい場合は「変更する」から編集できます。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setInviteOpen((v) => !v)}
                  className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold hover:bg-black/[.03]"
                >
                  {inviteOpen ? "閉じる" : "変更する"}
                </button>
              </div>

              {inviteOpen && (
                <div className="mt-3">
                  <label className="block">
                    <span className="mb-1 block text-sm">招待コード（任意）</span>

                    <div className="flex gap-2">
                      <input
                        className="w-full rounded-lg border border-black/10 px-3 py-2 font-mono tracking-widest outline-none focus:border-orange-600"
                        value={invite}
                        onChange={(e) => setInvite(e.target.value)}
                        placeholder="例: ABCDEFGH12"
                        autoComplete="off"
                        inputMode="text"
                      />
                      <button
                        type="button"
                        onClick={pasteInviteFromClipboard}
                        disabled={pasting}
                        className="shrink-0 rounded-lg border border-black/10 px-3 text-sm font-semibold hover:bg-black/[.04] disabled:opacity-50"
                      >
                        {pasting ? "…" : "貼り付け"}
                      </button>
                    </div>
                  </label>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-600">招待コードがなくても登録できます。</p>
                    {inviteMsg && <p className="text-xs text-gray-600">{inviteMsg}</p>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setInviteOpen((v) => !v)}
                className="text-sm font-semibold text-gray-700 underline decoration-black/20 underline-offset-4 hover:text-black"
              >
                招待コードをお持ちの方はこちら
              </button>

              {/* ✅ 自力で来た人向け：すぐ貼れる導線 */}
              <button
                type="button"
                onClick={pasteInviteFromClipboard}
                disabled={pasting}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold hover:bg-black/[.03] disabled:opacity-50"
                title="クリップボードから貼り付け"
              >
                {pasting ? "…" : "貼り付け"}
              </button>
            </div>
          )}

          {!inviteApplied && inviteOpen && (
            <div className="mt-3 rounded-2xl border border-black/10 bg-black/[.02] p-4">
              <label className="block">
                <span className="mb-1 block text-sm">招待コード（任意）</span>

                <div className="flex gap-2">
                  <input
                    className="w-full rounded-lg border border-black/10 px-3 py-2 font-mono tracking-widest outline-none focus:border-orange-600"
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    placeholder="例: ABCDEFGH12"
                    autoComplete="off"
                    inputMode="text"
                  />
                  <button
                    type="button"
                    onClick={pasteInviteFromClipboard}
                    disabled={pasting}
                    className="shrink-0 rounded-lg border border-black/10 px-3 text-sm font-semibold hover:bg-black/[.04] disabled:opacity-50"
                  >
                    {pasting ? "…" : "貼り付け"}
                  </button>
                </div>
              </label>

              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-600">招待コードがなくても登録できます。</p>
                {inviteMsg && <p className="text-xs text-gray-600">{inviteMsg}</p>}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* メールアドレス */}
          <label className="block">
            <span className="mb-1 block text-sm">メールアドレス</span>
            <input
              className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-orange-600"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              required
              autoComplete="email"
              placeholder="例: gourmeet@gmail.com"
            />
            <p className="mt-1 text-xs text-black/60">{emailConfirmNote}</p>
          </label>

          {/* 表示名 */}
          <label className="block">
            <span className="mb-1 block text-sm">表示名（ハンドルネーム）</span>
            <input
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-orange-600"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: たばけん"
            />
            <p className="mt-1 text-xs text-black/60">
              タイムラインなどに表示される名前です(@つきユーザーIDとは別)。未入力の場合はメールアドレスから自動的に補完されます。
            </p>
          </label>

          {/* パスワード */}
          <label className="block">
            <span className="mb-1 block text-sm">パスワード</span>
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-orange-600"
                type={show ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={6}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="rounded-lg border border-black/10 px-3 text-sm hover:bg-black/[.04]"
              >
                {show ? "隠す" : "表示"}
              </button>
            </div>
            {pw && (
              <p
                className={
                  "mt-1 text-xs " +
                  (strength === "strong"
                    ? "text-green-600"
                    : strength === "medium"
                    ? "text-amber-600"
                    : "text-red-600")
                }
              >
                強度: {strength}
              </p>
            )}
          </label>

          {/* パスワード確認 */}
          <label className="block">
            <span className="mb-1 block text-sm">パスワード（確認）</span>
            <input
              className={
                "w-full rounded-lg border px-3 py-2 outline-none " +
                (pw2 ? (match ? "border-green-500" : "border-red-500") : "border-black/10")
              }
              type={show ? "text" : "password"}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
              autoComplete="new-password"
            />
            {pw2 && !match && <p className="mt-1 text-xs text-red-600">一致しません。</p>}
          </label>

          {/* ✅ ちょい改善：ボタン近くにも同じ補足を出す（見落とし防止） */}
          <p className="text-xs text-black/60">{emailConfirmNote}</p>

          {msg && <p className="text-sm text-orange-800">{msg}</p>}

          <button
            disabled={!canSubmit || loading}
            className={
              "inline-flex h-11 items-center rounded-full px-6 text-white transition-colors " +
              (canSubmit ? "bg-orange-700 hover:bg-orange-800" : "cursor-not-allowed bg-orange-700/60")
            }
          >
            {loading ? "作成中..." : "登録する"}
          </button>
        </form>

        {/* Googleで続ける */}
        <button
          type="button"
          onClick={handleGoogleContinue}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-black/20 bg-white py-3 text-sm font-medium hover:bg-black/5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48">
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.7 1.2 9.1 3.5l6.8-6.8C35.3 2.7 29.9 0 24 0 14.8 0 6.7 5.1 2.4 12.6l7.9 6.1C12.4 12.1 17.8 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.1 24.5c0-1.6-.2-3.2-.5-4.7H24v9h12.3c-.5 2.7-2.1 5-4.5 6.5v5.4h7.3c4.3-4 6.8-9.9 6.8-16.2z"
            />
            <path
              fill="#FBBC04"
              d="M10.3 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6v-5.4H2.4c-1.6 3.2-2.4 6.9-2.4 10.9s.9 7.7 2.4 10.9l7.9-6.2z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.3-5.4c-2 1.4-4.6 2.3-7.9 2.3-6.2 0-11.6-3.6-14-8.8l-7.9 6.2C6.7 42.9 14.8 48 24 48z"
            />
          </svg>
          <span>Googleで続ける</span>
        </button>
      </section>

      <aside className="rounded-2xl border border-orange-100 bg-[#fff7ed] p-8">
        <h2 className="mb-2 text-lg font-bold">会員特典</h2>
        <ul className="list-disc pl-5 text-sm leading-6 text-black/75">
          <li>投稿の作成・保存ができます</li>
          <li>お気に入りの管理ができます</li>
          <li>通知やメール連携（今後）</li>
        </ul>
        <a
          href="/auth/login"
          className="mt-6 inline-flex h-11 items-center rounded-full border border-orange-800 px-6 font-medium text-orange-900 hover:bg-orange-800 hover:text-white"
        >
          すでにアカウントをお持ちの方
        </a>
      </aside>
    </main>
  );
}
