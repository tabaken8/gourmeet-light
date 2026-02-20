// src/components/timeline/FriendsTimelineServer.tsx
import FriendsTimelineClient from "./FriendsTimelineClient";
import { headers, cookies } from "next/headers";

export const dynamic = "force-dynamic";

// 「suggestionが無い」状態も許容しておく（= 空meta）
export type Meta =
  | {
      suggestOnce?: boolean;
      suggestAtIndex?: number;
      suggestion?: {
        title: string;
        subtitle?: string | null;
        users: Array<{
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          is_following?: boolean;
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

function emptyMeta(): Meta {
  return { suggestOnce: false, suggestAtIndex: 1 };
}

export default async function FriendsTimelineServer({ meId }: { meId: string | null }) {
  // 未ログインでも「真っ白」回避のため、Client側でログイン誘導UIを出す
  if (!meId) {
    return (
      <FriendsTimelineClient
        meId={null}
        initialPosts={[]}
        initialNextCursor={null}
        initialMeta={emptyMeta()}
      />
    );
  }

  const h = await headers();
  const baseUrl = getBaseUrlFromHeaders(h);

  // ✅ cookie は encode しない（壊れる可能性がある）
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const params = new URLSearchParams({ limit: "20" });
  const url = `${baseUrl}/api/timeline/friends?${params.toString()}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      cookie: cookieHeader,
      accept: "application/json",
    },
  });

  // 失敗時も「空状態UI」を出したいので、nullにせず空metaを渡す
  if (!res.ok) {
    return (
      <FriendsTimelineClient
        meId={meId}
        initialPosts={[]}
        initialNextCursor={null}
        initialMeta={emptyMeta()}
      />
    );
  }

  const json = (await res.json()) as {
    posts?: any[];
    nextCursor?: string | null;
    meta?: Meta;
  };

  return (
    <FriendsTimelineClient
      meId={meId}
      initialPosts={(json.posts ?? []) as any[]}
      initialNextCursor={(json.nextCursor ?? null) as string | null}
      initialMeta={(json.meta ?? emptyMeta()) as any}
    />
  );
}