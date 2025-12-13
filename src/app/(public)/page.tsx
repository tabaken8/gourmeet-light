import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // ① 認証情報が取れた場合
  if (user) {
    redirect("/timeline");
  }

  // ② 本当に未ログインの場合のみ
  if (!user && error) {
    redirect("/auth/login");
  }

  // ③ “まだセッションが読めない段階” への対応
  // ここで一瞬ローディングを返す
  return <p>Loading...</p>;
}
