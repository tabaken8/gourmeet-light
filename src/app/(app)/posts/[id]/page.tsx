import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostImageCarousel from "@/components/PostImageCarousel";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { img_index?: string };
}) {
  const supabase = createClient();

  const { data: post } = await supabase
    .from("posts")
    .select("id, title, content, user_id, created_at, image_urls")
    .eq("id", params.id)
    .maybeSingle();

  if (!post) return notFound();

  const index = searchParams?.img_index ? parseInt(searchParams.img_index, 10) - 1 : 0;

  return (
    <main className="mx-auto max-w-3xl py-8 space-y-6">
      {/* 画像カルーセル */}
      {post.image_urls && post.image_urls.length > 0 && (
        <PostImageCarousel postId={post.id} imageUrls={post.image_urls} initialIndex={Math.max(0, index)} />
      )}

      {/* 本文 */}
      <section className="px-4">
        {post.title && <h1 className="text-xl font-bold mb-2">{post.title}</h1>}
        {post.content && <p className="text-sm whitespace-pre-wrap">{post.content}</p>}
      </section>
    </main>
  );
}
