// src/lib/analytics/track.ts
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

const EXCLUDED_USER_IDS = new Set<string>([
  "caab9c36-988c-4371-bbb4-360d765a35c5",
  "fab100cb-c54b-4b0f-9d53-f05635e1e1c9",
]);

export async function trackEvent(payload: {
  name: string;
  pathname?: string | null;
  props?: Record<string, any>;
}) {
  const supabase = createClientComponentClient();

  const { data: auth } = await supabase.auth.getUser();
  const user_id = auth.user?.id ?? null;

  // ログインしてない時は何もしない（現状の運用）
  if (!user_id) return;

  // ★ ここで除外（DBを汚さない）
  if (EXCLUDED_USER_IDS.has(user_id)) return;

  // ...（以下はあなたの既存の insert 処理のまま）
  const pathname =
    payload.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : null);
  const referrer = typeof document !== "undefined" ? document.referrer : null;

  await supabase.from("events").insert({
    user_id,
    // anon_id / session_id を入れてるならそれもここで
    name: payload.name,
    pathname,
    referrer,
    props: payload.props ?? {},
  });
}
