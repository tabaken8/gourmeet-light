// src/components/SuggestFollowCard.tsx
"use client";

import React from "react";
import Link from "next/link";
import FollowButton from "@/components/FollowButton";

export type SuggestUser = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_following: boolean;
  reason?: string | null;
};

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initial = (name || "U").slice(0, 1).toUpperCase();
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-200">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-10 w-10 object-cover" loading="lazy" decoding="async" />
      ) : (
        <span className="text-sm font-bold text-slate-600">{initial}</span>
      )}
    </span>
  );
}

export default function SuggestFollowCard({
  title,
  subtitle,
  users,
}: {
  title: string;
  subtitle?: string | null;
  users: SuggestUser[];
}) {
  if (!users || users.length === 0) return null;

  return (
    <section className="gm-card overflow-hidden">
      <div className="px-4 py-3">
        <div className="text-sm font-bold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div> : null}
      </div>

      <div className="px-2 pb-3">
        {users.slice(0, 6).map((u) => {
          const name = u.display_name ?? "ユーザー";
          return (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2 hover:bg-slate-50"
            >
              <Link href={`/u/${u.id}`} className="flex min-w-0 items-center gap-3">
                <Avatar url={u.avatar_url} name={name} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
                  {u.reason ? <div className="truncate text-xs text-slate-500">{u.reason}</div> : null}
                </div>
              </Link>

              <FollowButton
                targetId={u.id}
                initialFollowing={u.is_following}
                mode="follow"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
