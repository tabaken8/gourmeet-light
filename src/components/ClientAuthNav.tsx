// components/ClientAuthNav.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export default async function ClientAuthNav() {
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <Link className="hover:underline" href="/auth/login">
          ログイン
        </Link>
        <Link
          className="inline-flex h-9 items-center rounded-full border border-orange-800 px-4 font-medium text-orange-900 hover:bg-orange-800 hover:text-white"
          href="/auth/signup"
        >
          会員登録する
        </Link>
      </>
    );
  }

  return (
    <>
      <Link className="hover:underline" href="/account">
        アカウント
      </Link>
      <form action="/auth/logout" method="post">
        <button className="inline-flex h-9 items-center rounded-full border border-black/15 px-4 hover:bg-black/[.04]">
          ログアウト
        </button>
      </form>
    </>
  );
}
