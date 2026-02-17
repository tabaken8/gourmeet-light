// src/app/(app)/profile/edit/parts/ProfileEditForm.client.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, X as XLucide, Link2 } from "lucide-react";

// ✅ you already created these
import InstagramIcon from "@/components/icons/InstagramIcon";
import XIcon from "@/components/icons/XIcon";

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;
const IG_RE = /^[A-Za-z0-9._]{1,30}$/;
const X_RE = /^[A-Za-z0-9_]{1,15}$/;

type Props = {
  initial: {
    displayName: string;
    bio: string;
    avatarUrl: string;
    username: string;
    isPublic: boolean;
    instagram: string;
    x: string;
  };
};

function cleanHandle(v: string) {
  return v.replace(/^@+/, "").trim();
}

function FieldShell({
  label,
  children,
  rightSlot,
}: {
  label: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-900">{label}</p>
        {rightSlot ? <div className="text-[12px] text-slate-500">{rightSlot}</div> : null}
      </div>
      {children}
    </div>
  );
}

function TextInput({
  name,
  value,
  onChange,
  placeholder,
  isBad,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  isBad?: boolean;
}) {
  return (
    <input
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={[
        "h-11 w-full rounded-xl border bg-white px-3 text-[15px] font-medium text-slate-900 outline-none",
        "border-black/[.08] hover:border-black/[.12]",
        "transition focus:ring-4 focus:ring-orange-200/40 focus:border-orange-300",
        isBad ? "border-red-300" : "",
        "placeholder:text-slate-400",
      ].join(" ")}
    />
  );
}

function TextArea({
  name,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      className={[
        "w-full resize-none rounded-xl border bg-white px-3 py-3 text-[15px] font-medium text-slate-900 outline-none",
        "border-black/[.08] hover:border-black/[.12]",
        "transition focus:ring-4 focus:ring-orange-200/40 focus:border-orange-300",
        "placeholder:text-slate-400",
      ].join(" ")}
    />
  );
}

/**
 * ✅ single textbox, "@xxx" feeling
 * - @ is not deletable (separate span)
 * - visually tight (no gap)
 */
function AtInput({
  name,
  value,
  onChange,
  placeholder,
  isBad,
  leftBadge,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  isBad?: boolean;
  leftBadge?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "relative flex items-center rounded-xl border bg-white",
        "shadow-[0_1px_0_rgba(0,0,0,0.02)] transition",
        "focus-within:ring-4 focus-within:ring-orange-200/40",
        isBad ? "border-red-300" : "border-black/[.08] hover:border-black/[.12]",
      ].join(" ")}
    >
      {leftBadge ? <div className="pl-2 pr-2 py-2">{leftBadge}</div> : null}

      <div className="relative flex w-full items-center pr-3">
        <span className="select-none pl-3 text-[15px] font-semibold text-slate-300">
          @
        </span>
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(cleanHandle(e.target.value))}
          placeholder={placeholder}
          inputMode="text"
          autoComplete="off"
          className={[
            "h-11 w-full bg-transparent outline-none",
            "pl-0 pr-0",
            "text-[15px] font-medium text-slate-900",
            "placeholder:text-slate-400",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

function InstagramBadge() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-lg border border-black/[.08] bg-white shadow-sm">
      <InstagramIcon className="h-5 w-5" />
    </div>
  );
}

function XBadge() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-lg border border-black/[.08] bg-white shadow-sm">
      <XIcon className="h-5 w-5 text-slate-900" />
    </div>
  );
}

export default function ProfileEditForm({ initial }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [username, setUsername] = useState(initial.username);
  const [isPublic, setIsPublic] = useState(initial.isPublic);

  const [instagram, setInstagram] = useState(initial.instagram);
  const [x, setX] = useState(initial.x);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // instant preview
  const previewUrl = useMemo(() => {
    if (!avatarFile) return null;
    return URL.createObjectURL(avatarFile);
  }, [avatarFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentAvatar = previewUrl || initial.avatarUrl || null;
  const initialLetter = (displayName || "U").slice(0, 1).toUpperCase();

  // keep validation (no “length text” shown)
  const usernameBad = username ? !USERNAME_RE.test(username) : false;
  const igBad = instagram ? !IG_RE.test(instagram) : false;
  const xBad = x ? !X_RE.test(x) : false;

  return (
    <section className="rounded-2xl border border-orange-100 bg-white/95 shadow-sm overflow-hidden">
      {/* header / preview */}
      <div className="px-4 pt-4 pb-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-black/[.08] bg-orange-100"
            aria-label="アイコン画像を変更"
          >
            {currentAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatar}
                alt="avatar preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-orange-700">
                {initialLetter}
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/35">
              <div className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                <Camera size={14} />
                変更
              </div>
            </div>
          </button>

          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-slate-900 leading-tight">
              {displayName || "User"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {username ? `@${username}` : "ユーザーID未設定"}
            </p>

            {avatarFile ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500 truncate max-w-[240px]">
                  選択中: {avatarFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-black/[.08] bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <XLucide size={14} />
                  取り消し
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <form
        action="/profile/update"
        method="post"
        encType="multipart/form-data"
        className="px-4 pb-4 space-y-4"
      >
        {/* important: inside form */}
        <input
          ref={fileRef}
          type="file"
          name="avatar"
          accept="image/*"
          className="hidden"
          onChange={(e) => setAvatarFile(e.currentTarget.files?.[0] ?? null)}
        />

        <FieldShell label="表示名">
          <TextInput
            name="display_name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="表示名"
          />
        </FieldShell>

        <FieldShell label="ユーザーID">
          <AtInput
            name="username"
            value={username}
            onChange={setUsername}
            placeholder="gourmeet_user"
            isBad={usernameBad}
          />
          {usernameBad ? (
            <p className="text-xs text-red-600">ユーザーIDの形式が不正です。</p>
          ) : null}
        </FieldShell>

        <FieldShell label="自己紹介">
          <TextArea
            name="bio"
            value={bio}
            onChange={setBio}
            placeholder="ひとこと"
          />
        </FieldShell>

        <div className="rounded-2xl border border-black/[.06] bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-slate-900">
            <Link2 size={16} />
            外部SNS連携(任意)
          </div>

          <div className="space-y-3">
            <AtInput
              name="instagram"
              value={instagram}
              onChange={setInstagram}
              placeholder="instagram_id"
              isBad={igBad}
              leftBadge={<InstagramBadge />}
            />
            {igBad ? (
              <p className="text-xs text-red-600">Instagram IDの形式が不正です。</p>
            ) : null}

            <AtInput
              name="x"
              value={x}
              onChange={setX}
              placeholder="x_id"
              isBad={xBad}
              leftBadge={<XBadge />}
            />
            {xBad ? (
              <p className="text-xs text-red-600">X IDの形式が不正です。</p>
            ) : null}
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-black/[.06] bg-white px-3 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <input
            type="checkbox"
            name="is_public"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border border-slate-300"
          />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-900">
              公開アカウント
            </p>
            <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
              チェックを外すと非公開アカウントになります。
            </p>
          </div>
        </label>

        <div className="pt-1">
          <button className="w-full rounded-2xl bg-black px-5 py-3 text-[15px] font-semibold text-white hover:opacity-90">
            保存する
          </button>
        </div>
      </form>
    </section>
  );
}
