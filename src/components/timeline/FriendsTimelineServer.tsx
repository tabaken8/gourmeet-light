// src/components/timeline/FriendsTimelineServer.tsx
import { headers } from "next/headers";
import FriendsTimelineClient from "./FriendsTimelineClient";

export const dynamic = "force-dynamic";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

async function getBaseUrl() {
  const h = await headers(); // ✅ ここが修正点
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function FriendsTimelineServer({
  meId,
}: {
  meId: string | null;
}) {
  // 未ログインでも friends を見せる方針なので、meId=nullでもOK
  const baseUrl = await getBaseUrl();

  const params = new URLSearchParams();
  params.set("limit", "20");

  // ✅ Cookie認証が効くように server から同originに fetch
  const res = await fetch(`${baseUrl}/api/timeline/friends?${params.toString()}`, {
    cache: "no-store",
    // Nextのserver fetchでcookieは同一オリジンなら自動で付くケースが多いが、
    // 環境により差が出るので念のため headers を転送してもいい。
  });

  const json = res.ok ? await res.json() : { posts: [], nextCursor: null, meta: null };

  return (
    <FriendsTimelineClient
      meId={meId}
      initialPosts={(json.posts ?? []) as any[]}
      initialNextCursor={(json.nextCursor ?? null) as string | null}
      initialMeta={(json.meta ?? null) as any}
    />
  );
}
