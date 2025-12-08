"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function ClientAuthNav() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

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
          会員登録
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
