"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function strengthLabel(pw: string) {
  const len = pw.length;
  const varc =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) +
    Number(/[^a-zA-Z0-9]/.test(pw));
  const score =
    (len >= 12 ? 2 : len >= 8 ? 1 : 0) +
    (varc >= 3 ? 2 : varc >= 2 ? 1 : 0);
  return score >= 3 ? "strong" : score === 2 ? "medium" : "weak";
}

export default function SignUpPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const match = pw.length > 0 && pw === pw2;
  const strength = useMemo(() => strengthLabel(pw), [pw]);
  const canSubmit = !!email && pw.length >= 6 && match && !loading;

  const handleEmailChange = (value: string) => {
    setEmail(value);

    // 表示名がまだ空なら、メールのローカル部を初期値として入れてあげる
    if (!displayName) {
      const localPart = value.split("@")[0] ?? "";
      if (localPart) {
        setDisplayName(localPart);
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setMsg(null);

    const trimmedDisplayName = displayName.trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      // signup 時点で user_metadata に display_name を持たせる
      options: trimmedDisplayName
        ? {
            data: {
              display_name: trimmedDisplayName,
            },
          }
        : undefined,
    });

    setLoading(false);

    if (error) return setMsg(error.message);

    if (data.user && !data.session) {
      setMsg(
        "確認メールを送信しました。受信ボックスをご確認ください。"
      );
    } else {
      router.push("/");
      router.refresh();
    }
  };

const handleGoogleContinue = async () => {
  const redirectTo = `${window.location.origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    console.error(error);
    alert("Googleログインに失敗しました: " + error.message);
  }
};


  return (
    <main className="grid gap-8 md:grid-cols-2">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">会員登録</h1>

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
            />
          </label>

          {/* 表示名（ハンドルネーム） */}
          <label className="block">
            <span className="mb-1 block text-sm">
              表示名（ハンドルネーム）
            </span>
            <input
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-orange-600"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例: けんた / gourmeet好きの人"
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
                (pw2
                  ? match
                    ? "border-green-500"
                    : "border-red-500"
                  : "border-black/10")
              }
              type={show ? "text" : "password"}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
              autoComplete="new-password"
            />
            {pw2 && !match && (
              <p className="mt-1 text-xs text-red-600">一致しません。</p>
            )}
          </label>

          {msg && <p className="text-sm text-orange-800">{msg}</p>}

          <button
            disabled={!canSubmit || loading}
            className={
              "inline-flex h-11 items-center rounded-full px-6 text-white transition-colors " +
              (canSubmit
                ? "bg-orange-700 hover:bg-orange-800"
                : "cursor-not-allowed bg-orange-700/60")
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 48 48"
          >
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
