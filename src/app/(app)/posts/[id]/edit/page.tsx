import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function EditPostPage({ params }: { params: { id: string } }) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");

    const { data: post } = await supabase
        .from("posts")
        .select("id,title,content,image_url,user_id")
        .eq("id", params.id)
        .single();

    if (!post || post.user_id !== user.id) {
        redirect("/timeline");
    }

    return (
        <main className="max-w-xl rounded-2xl bg-white p-8 shadow-sm">
            <h1 className="mb-4 text-2xl font-bold">投稿を編集</h1>
            <form action={`/posts/${post.id}/edit/update`} method="post" className="space-y-3">
                <input
                    name="title"
                    defaultValue={post.title}
                    className="w-full rounded border border-black/10 px-3 py-2"
                    required
                />
                <textarea
                    name="content"
                    defaultValue={post.content ?? ""}
                    className="h-40 w-full rounded border border-black/10 px-3 py-2"
                />
                <input type="hidden" name="image_url" value={post.image_url ?? ""} />
                <div className="flex gap-2">
                    <button className="inline-flex h-11 items-center rounded-full bg-orange-700 px-6 text-white">保存</button>
                    <a href="/timeline" className="inline-flex h-11 items-center rounded-full border border-black/15 px-6">
                        キャンセル
                    </a>
                </div>
            </form>
        </main>
    );
}
