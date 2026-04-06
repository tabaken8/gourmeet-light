"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTranslations } from "next-intl";

// =====================
// username rules (same as profile edit)
// =====================
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

function cleanHandle(v: string) {
  return (v || "").replace(/^@+/, "").trim().toLowerCase();
}

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
  const t = useTranslations("auth");

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  // ✅ username required
  const [username, setUsername] = useState("");
  const [usernameMsg, setUsernameMsg] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ invite
  const [invite, setInvite] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  // --- race guard for username checks ---
  const lastCheckRef = useRef(0);

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
      setInviteOpen(false);
    }

    if (fromUrl && typeof window !== "undefined") {
      localStorage.setItem("pending_invite", fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ✅ invite changes -> localStorage
  useEffect(() => {
    const trimmed = normalizeInvite(invite);
    if (typeof window === "undefined") return;
    if (trimmed) localStorage.setItem("pending_invite", trimmed);
  }, [invite]);

  // ✅ username changes -> localStorage (OAuth保険)
  useEffect(() => {
    const u = cleanHandle(username);
    if (typeof window === "undefined") return;
    if (u) localStorage.setItem("pending_username", u);
  }, [username]);

  const match = pw.length > 0 && pw === pw2;
  const strength = useMemo(() => strengthLabel(pw), [pw]);

  const usernameClean = cleanHandle(username);
  const usernameOk = USERNAME_RE.test(usernameClean);

  // canSubmit must include usernameOk
  const canSubmit =
    !!email && pw.length >= 6 && match && usernameOk && !loading && !checkingUsername;

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
        setInviteMsg(t("clipboardUnavailable"));
        return;
      }
      const text = await navigator.clipboard.readText();
      const normalized = normalizeInvite(text);

      if (!normalized) {
        setInviteMsg(t("clipboardEmpty"));
        return;
      }

      setInvite(normalized);
      setInviteOpen(true);
      setInviteMsg(t("pasted"));
      window.setTimeout(() => setInviteMsg(null), 1200);
    } catch {
      setInviteMsg(t("pasteFailed"));
    } finally {
      setPasting(false);
    }
  };

  // =====================
  // username availability check
  // - uses case-insensitive search to match DB unique index on lower(username)
  // - race-safe: only latest check updates the UI
  // =====================
  const checkUsername = async (u: string) => {
    const uu = cleanHandle(u);
    if (!uu) return;
    if (!USERNAME_RE.test(uu)) return;

    const myId = ++lastCheckRef.current;
    setCheckingUsername(true);
    setUsernameMsg(null);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", uu)
        .limit(1);

      // ignore stale responses
      if (myId !== lastCheckRef.current) return;

      if (error) {
        // RLS等で読めないならここは無視（DB制約が本命）
        setUsernameMsg(null);
        return;
      }
      if (data && data.length > 0) {
        setUsernameMsg(t("usernameTaken"));
      } else {
        setUsernameMsg(null);
      }
    } finally {
      if (myId === lastCheckRef.current) setCheckingUsername(false);
    }
  };

  // ✅ debounce check while typing (looks "realtime" without spamming)
  useEffect(() => {
    // typing -> clear previous availability message
    setUsernameMsg(null);

    // empty / invalid format: don't check server
    if (!usernameClean) return;
    if (!usernameOk) return;

    const t = window.setTimeout(() => {
      checkUsername(usernameClean);
    }, 450);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameClean, usernameOk]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    const trimmedDisplayName = displayName.trim();
    const trimmedInvite = normalizeInvite(invite);
    const trimmedUsername = cleanHandle(username);

    // hard guard
    if (!USERNAME_RE.test(trimmedUsername)) {
      setMsg(t("usernameInvalid"));
      return;
    }

    // optional check: if usernameMsg says already used, block
    if (usernameMsg) {
      setMsg(usernameMsg);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        data: {
          username: trimmedUsername,
          ...(trimmedDisplayName ? { display_name: trimmedDisplayName } : {}),
          ...(trimmedInvite ? { invite_code: trimmedInvite } : {}),
        },
      },
    });

    setLoading(false);

    if (error) return setMsg(error.message);

    // メール確認ありの場合：localStorage に残しておく
    if (data.user && !data.session) {
      if (typeof window !== "undefined") {
        localStorage.setItem("pending_username", trimmedUsername);
        if (trimmedInvite) localStorage.setItem("pending_invite", trimmedInvite);
      }
      setMsg(t("confirmEmailSent"));
      return;
    }

    // メール確認なしで即ログインされる場合の遷移（必要なら）
    // router.push("/(app)/...");
  };

  const handleGoogleContinue = async () => {
    setMsg(null);

    const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const trimmedInvite = normalizeInvite(invite);
    const trimmedUsername = cleanHandle(username);

    // ✅ Googleでも username を必須にする
    if (!USERNAME_RE.test(trimmedUsername)) {
      setMsg(t("googleUsernameRequired"));
      return;
    }
    if (usernameMsg) {
      setMsg(usernameMsg);
      return;
    }

    // ✅ OAuthに飛ぶ前に端末に覚えさせておく（保険）
    if (typeof window !== "undefined") {
      localStorage.setItem("pending_username", trimmedUsername);
      if (trimmedInvite) localStorage.setItem("pending_invite", trimmedInvite);
    }

    // ✅ callback に username / invite を持っていく（callback側で拾える）
    const redirectTo =
      `${origin}/auth/callback?username=${encodeURIComponent(trimmedUsername)}` +
      (trimmedInvite ? `&invite=${encodeURIComponent(trimmedInvite)}` : "");

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

  const emailConfirmNote = t("emailConfirmNote");

  return (
    <main className="min-h-screen bg-[#fffaf5] dark:bg-transparent py-12">
      <div className="mx-auto max-w-5xl px-4">
      <div className="grid gap-8 md:grid-cols-2">
      <section className="rounded-2xl bg-white p-8 shadow-sm dark:bg-[#16181e] dark:border dark:border-white/[.08]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight dark:text-gray-100">{t("register")}</h1>

        {/* ✅ 招待コード */}
        <div className="mb-5">
          {inviteApplied ? (
            <div className="rounded-2xl border border-black/10 bg-black/[.02] p-4 dark:bg-white/[.04] dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold dark:text-gray-100">✅ {t("inviteApplied")}</div>
                  <div className="mt-1 font-mono text-lg tracking-widest break-all dark:text-gray-100">
                    {normalizeInvite(invite)}
                  </div>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-500">
                    {t("inviteChangeNote")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setInviteOpen((v) => !v)}
                  className="shrink-0 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold hover:bg-black/[.03] dark:border-white/15 dark:bg-white/[.06] dark:text-gray-300 dark:hover:bg-white/10"
                >
                  {inviteOpen ? t("close") : t("change")}
                </button>
              </div>

              {inviteOpen && (
                <div className="mt-3">
                  <label className="block">
                    <span className="mb-1 block text-sm dark:text-gray-300">{t("inviteCode")}</span>

                    <div className="flex gap-2">
                      <input
                        className="w-full rounded-lg border border-black/10 px-3 py-2 font-mono tracking-widest outline-none focus:border-orange-600 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                        value={invite}
                        onChange={(e) => setInvite(e.target.value)}
                        placeholder={t("inviteExample")}
                        autoComplete="off"
                        inputMode="text"
                      />
                      <button
                        type="button"
                        onClick={pasteInviteFromClipboard}
                        disabled={pasting}
                        className="shrink-0 rounded-lg border border-black/10 px-3 text-sm font-semibold hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-300 dark:hover:bg-white/10"
                      >
                        {pasting ? "…" : t("paste")}
                      </button>
                    </div>
                  </label>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-600 dark:text-gray-500">{t("inviteOptional")}</p>
                    {inviteMsg && <p className="text-xs text-gray-600 dark:text-gray-500">{inviteMsg}</p>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setInviteOpen((v) => !v)}
                className="text-sm font-semibold text-gray-700 underline decoration-black/20 underline-offset-4 hover:text-black dark:text-gray-400 dark:hover:text-gray-200"
              >
                {t("invitePrompt")}
              </button>

              <button
                type="button"
                onClick={pasteInviteFromClipboard}
                disabled={pasting}
                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold hover:bg-black/[.03] disabled:opacity-50 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-300 dark:hover:bg-white/10"
                title={t("paste")}
              >
                {pasting ? "…" : t("paste")}
              </button>
            </div>
          )}

          {!inviteApplied && inviteOpen && (
            <div className="mt-3 rounded-2xl border border-black/10 bg-black/[.02] p-4 dark:bg-white/[.04] dark:border-white/10">
              <label className="block">
                <span className="mb-1 block text-sm dark:text-gray-300">{t("inviteCode")}</span>

                <div className="flex gap-2">
                  <input
                    className="w-full rounded-lg border border-black/10 px-3 py-2 font-mono tracking-widest outline-none focus:border-orange-600 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    placeholder={t("inviteExample")}
                    autoComplete="off"
                    inputMode="text"
                  />
                  <button
                    type="button"
                    onClick={pasteInviteFromClipboard}
                    disabled={pasting}
                    className="shrink-0 rounded-lg border border-black/10 px-3 text-sm font-semibold hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-300 dark:hover:bg-white/10"
                  >
                    {pasting ? "…" : t("paste")}
                  </button>
                </div>
              </label>

              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-600 dark:text-gray-500">{t("inviteOptional")}</p>
                {inviteMsg && <p className="text-xs text-gray-600 dark:text-gray-500">{inviteMsg}</p>}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* メールアドレス */}
          <label className="block">
            <span className="mb-1 block text-sm dark:text-gray-300">{t("email")}</span>
            <input
              className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-orange-600 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              required
              autoComplete="email"
              placeholder="gourmeet@gmail.com"
            />
            <p className="mt-1 text-xs text-black/60 dark:text-gray-500">{emailConfirmNote}</p>
          </label>

          {/* ✅ ユーザーID（必須） */}
          <label className="block">
            <span className="mb-1 block text-sm dark:text-gray-300">{t("userId")}</span>

            <div
              className={[
                "flex items-center rounded-lg border bg-white px-3 py-2 outline-none dark:bg-white/[.06] focus-within:border-orange-600 dark:focus-within:border-white/25",
                usernameClean.length === 0
                  ? "border-black/10 dark:border-white/15"
                  : usernameOk && !usernameMsg
                  ? "border-green-400 dark:border-green-500"
                  : "border-red-400 dark:border-red-500",
              ].join(" ")}
            >
              <span className="select-none text-sm font-semibold text-slate-300 dark:text-gray-600">@</span>
              <input
                className="w-full bg-transparent pl-1 outline-none text-sm dark:text-gray-100 dark:placeholder:text-gray-500"
                value={username}
                onChange={(e) => {
                  setUsername(cleanHandle(e.target.value));
                  setUsernameMsg(null);
                }}
                onBlur={() => checkUsername(username)}
                placeholder="gourmeet_user"
                required
                // --- autofill / iOS caps guards ---
                name="gourmeet_username"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
              />
            </div>

            {usernameClean.length > 0 && !usernameOk ? (
              <p className="mt-1 text-xs text-red-600">
                {t("usernameFormatHint")}
              </p>
            ) : null}

            {usernameOk && checkingUsername ? (
              <p className="mt-1 text-xs text-black/60 dark:text-gray-500">{t("checkingAvailability")}</p>
            ) : null}

            {usernameOk && usernameMsg ? (
              <p className="mt-1 text-xs text-red-600">{usernameMsg}</p>
            ) : null}

            {usernameOk && !checkingUsername && !usernameMsg ? (
              <p className="mt-1 text-xs text-black/60 dark:text-gray-500">
                {t("usernameHint")}
              </p>
            ) : null}
          </label>

          {/* 表示名 */}
          <label className="block">
            <span className="mb-1 block text-sm dark:text-gray-300">{t("displayName")}</span>
            <input
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-orange-600 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="グルミート太郎"
            />
            <p className="mt-1 text-xs text-black/60 dark:text-gray-500">
              {t("displayNameNote")}
            </p>
          </label>

          {/* パスワード */}
          <label className="block">
            <span className="mb-1 block text-sm dark:text-gray-300">{t("password")}</span>
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:border-orange-600 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
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
                className="rounded-lg border border-black/10 px-3 text-sm hover:bg-black/[.04] dark:border-white/15 dark:bg-white/[.06] dark:text-gray-300 dark:hover:bg-white/10"
              >
                {show ? t("hide") : t("show")}
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
                {t("strengthLabel", { level: t(strength === "strong" ? "strengthStrong" : strength === "medium" ? "strengthMedium" : "strengthWeak") })}
              </p>
            )}
          </label>

          {/* パスワード確認 */}
          <label className="block">
            <span className="mb-1 block text-sm dark:text-gray-300">{t("passwordConfirm")}</span>
            <input
              className={
                "w-full rounded-lg border px-3 py-2 outline-none dark:bg-white/[.06] dark:text-gray-100 dark:placeholder:text-gray-500 " +
                (pw2 ? (match ? "border-green-500 dark:border-green-500" : "border-red-500 dark:border-red-500") : "border-black/10 dark:border-white/15")
              }
              type={show ? "text" : "password"}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
              autoComplete="new-password"
            />
            {pw2 && !match && <p className="mt-1 text-xs text-red-600">{t("passwordMismatch")}</p>}
          </label>

          <p className="text-xs text-black/60 dark:text-gray-500">{emailConfirmNote}</p>

          {msg && <p className="text-sm text-orange-800 dark:text-orange-400">{msg}</p>}

          <button
            disabled={!canSubmit || loading}
            className={
              "inline-flex h-11 items-center rounded-full px-6 text-white transition-colors " +
              (canSubmit ? "bg-orange-700 hover:bg-orange-800" : "cursor-not-allowed bg-orange-700/60")
            }
          >
            {loading ? t("creating") : t("submit")}
          </button>
        </form>

        {/* Googleで続ける */}
        <button
          type="button"
          onClick={handleGoogleContinue}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-black/20 bg-white py-3 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:bg-white/[.06] dark:text-gray-200 dark:hover:bg-white/10"
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
          <span>{t("googleContinue")}</span>
        </button>
      </section>

      <aside className="rounded-2xl border border-orange-100 bg-[#fff7ed] p-8 dark:bg-[#1e1510] dark:border-orange-900/30">
        <h2 className="mb-2 text-lg font-bold dark:text-gray-100">{t("benefits")}</h2>
        <ul className="list-disc pl-5 text-sm leading-6 text-black/75 dark:text-gray-300">
          <li>{t("benefitPost")}</li>
          <li>{t("benefitFavorite")}</li>
          <li>{t("benefitNotify")}</li>
        </ul>
        <a
          href="/auth/login"
          className="mt-6 inline-flex h-11 items-center rounded-full border border-orange-800 px-6 font-medium text-orange-900 hover:bg-orange-800 hover:text-white dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-800 dark:hover:text-white"
        >
          {t("alreadyHaveAccount")}
        </a>
      </aside>
      </div>
      </div>
    </main>
  );
}