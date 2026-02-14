// src/app/(app)/posts/[id]/edit/page.tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PostEditForm, { EditInitialPost } from "@/components/PostEditForm";

export const dynamic = "force-dynamic";

export default async function PostEditPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  // ログイン必須
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // 対象投稿
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      id,
      user_id,
      content,
      created_at,
      visited_on,
      recommend_score,
      price_yen,
      price_range,
      place_id,
      place_name,
      place_address,
      image_variants,
      image_urls,
      taste_score,
      atmosphere_score,
      service_score
    `
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !data) return notFound();

  // 自分の投稿のみ編集可
  if (data.user_id !== user.id) return notFound();

  const finiteOrNull = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const initial: EditInitialPost = {
    id: String(data.id),
    user_id: String(data.user_id),
    created_at: String(data.created_at),
    visited_on: data.visited_on ?? null,
    content: data.content ?? "",

    recommend_score: finiteOrNull(data.recommend_score),
    price_yen: finiteOrNull(data.price_yen),
    price_range: data.price_range ?? null,

    place_id: data.place_id ?? null,
    place_name: data.place_name ?? null,
    place_address: data.place_address ?? null,

    image_variants: (data as any).image_variants ?? null,
    image_urls: (data as any).image_urls ?? null,

    // ✅ NEW
    taste_score: finiteOrNull((data as any).taste_score),
    atmosphere_score: finiteOrNull((data as any).atmosphere_score),
    service_score: finiteOrNull((data as any).service_score),
  };

  return (
    <main className="min-h-screen bg-orange-50 text-slate-800">
      <div className="mx-auto w-full max-w-3xl px-3 py-6 md:px-6 md:py-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">投稿を編集</h1>
            <p className="mt-1 text-xs text-slate-500">
              内容・お店・スコア・価格・来店日を変更できます。
            </p>
          </div>

          <Link
            href={`/posts/${params.id}`}
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
