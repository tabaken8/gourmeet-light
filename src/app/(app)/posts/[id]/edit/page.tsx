// src/app/(app)/posts/[id]/edit/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PostEditForm, { type EditInitialPost } from "@/components/PostEditForm";

export const dynamic = "force-dynamic";

type DbTimeOfDay = "day" | "night" | "unknown";

function finiteOrNull(v: any) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeTimeOfDay(v: any): DbTimeOfDay | null {
  if (v === "day" || v === "night" || v === "unknown") return v;
  return null;
}

// ✅ Next 15/16: params が Promise になることがあるので await する
export default async function PostEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  // ログイン必須
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // 対象投稿（taste/atmosphere/service は廃止済みなので取らない）
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      id,
      user_id,
      content,
      created_at,
      visited_on,
      time_of_day,
      recommend_score,
      price_yen,
      price_range,
      place_id,
      place_name,
      place_address,
      image_variants,
      image_urls,
      tag_ids
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return notFound();

  // 自分の投稿のみ編集可
  if (String(data.user_id) !== user.id) return notFound();

  const initial: EditInitialPost = {
    id: String(data.id),
    user_id: String(data.user_id),
    created_at: String(data.created_at),
    visited_on: (data as any).visited_on ?? null,

    content: (data as any).content ?? "",

    recommend_score: finiteOrNull((data as any).recommend_score),
    price_yen: finiteOrNull((data as any).price_yen),
    price_range: (data as any).price_range ?? null,

    place_id: (data as any).place_id ?? null,
    place_name: (data as any).place_name ?? null,
    place_address: (data as any).place_address ?? null,

    image_variants: (data as any).image_variants ?? null,
    image_urls: (data as any).image_urls ?? null,

    // ✅ edit UI に初期反映させる用（PostEditForm 側は optional にしてある想定）
    tag_ids: Array.isArray((data as any).tag_ids) ? ((data as any).tag_ids as string[]) : [],
    time_of_day: normalizeTimeOfDay((data as any).time_of_day),
  };

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto w-full max-w-3xl px-3 py-6 md:px-6 md:py-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">投稿を編集</h1>
            <p className="mt-1 text-xs text-slate-500">内容・お店・おすすめ度・価格・来店日を変更できます。</p>
          </div>

          <Link
            href={`/posts/${id}`}
            className="gm-chip gm-press inline-flex items-center px-3 py-1.5 text-xs text-slate-700"
          >
            戻る
          </Link>
        </div>

        <PostEditForm initial={initial} />
      </div>
    </main>
  );
}