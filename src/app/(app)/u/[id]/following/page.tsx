// src/app/(app)/u/[id]/following/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FollowingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const userId = params.id;

  const { data: prof } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (!prof) return notFound();

  // followee_id を取得
  const { data: rows } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId)
    .eq("status", "accepted") 
    .order("created_at", { ascending: false })
    .limit(500);

  const ids = (rows ?? []).map((r: any) => r.followee_id);
  let users: any[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids);
    users = data ?? [];
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold">フォロー中</h1>
      {users.length === 0 ? (
        <p className="text-black/60">まだ誰もフォローしていません。</p>
      ) : (
        <ul className="space-y-3">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover border" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-200" />
              )}
              <div className="min-w-0">
                <Link href={`/u/${u.id}`} className="block truncate font-medium hover:underline">
                  {u.display_name ?? u.username ?? "ユーザー"}
                </Link>
                {u.username && <div className="truncate text-xs text-black/60">@{u.username}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
