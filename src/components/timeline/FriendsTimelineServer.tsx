// src/components/timeline/FriendsTimelineServer.tsx
import FriendsTimelineClient from "./FriendsTimelineClient";
import { headers, cookies } from "next/headers";

export const dynamic = "force-dynamic";

type Meta =
  | {
      suggestOnce: boolean;
      suggestAtIndex: number;
      suggestion: {
        title: string;
        subtitle?: string | null;
        users: Array<{
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          is_following: boolean;
          reason?: string | null;
        }>;
      };
    }
  | null;

function getBaseUrlFromHeaders(h: Headers) {
  // Vercel/Proxy想定。localhostでも動く
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function FriendsTimelineServer({ meId }: { meId: string | null }) {
  if (!meId) {
    return <FriendsTimelineClient meId={null} initialPosts={[]} initialNextCursor={null} initialMeta={null} />;
  }

  // ✅ Next15 の headers()/cookies() は Promise になることがあるので await
  const h = await headers();
  const baseUrl = getBaseUrlFromHeaders(h as unknown as Headers);

  // ✅ cookie を明示で API に渡す（ここが超重要）
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  const params = new URLSearchParams({ limit: "20" });
  const url = `${baseUrl}/api/timeline/friends?${params.toString()}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader, // ✅ これで auth.getUser() が生きる
    },
  });

  if (!res.ok) {
    return <FriendsTimelineClient meId={meId} initialPosts={[]} initialNextCursor={null} initialMeta={null} />;
  }

  const json = (await res.json()) as {
    posts?: any[];
    nextCursor?: string | null;
    meta?: Meta;
  };

// FriendsTimelineServer.tsx の return をこれにする（差分）
return (
  <FriendsTimelineClient
    meId={meId}
    initialPosts={(json.posts ?? []) as any[]}
    initialNextCursor={(json.nextCursor ?? null) as string | null}
    initialMeta={(json.meta ?? null) as any}
  />
);

}
