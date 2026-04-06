"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, MessageCircle, Heart, UserPlus, HelpCircle, Pencil } from "lucide-react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTranslations } from "next-intl";

/** template id -> label（通知プレビュー用） */
const TEMPLATE_LABELS: Record<string, string> = {
  "visit:when": "行った時間帯（昼/夜）は？",
  "visit:day": "曜日はいつ？",
  "visit:duration": "滞在時間はどれくらい？",
  "visit:busy": "その時間帯、混んでた？",
  "visit:repeat": "リピあり？また行きたい？",

  "scene:who": "誰と行くのが良さそう？",
  "scene:best": "おすすめの使い方は？",
  "scene:solo": "1人でも行けそう？",
  "scene:group": "大人数でもいける？",
  "scene:family": "家族向き？",

  "mood:vibe": "雰囲気ってどんな感じ？",
  "mood:date": "デート向き？",
  "mood:lighting": "照明/店内の明るさは？",
  "mood:music": "音楽/空気感はどんな感じ？",
  "mood:photo": "写真映えする？（内装/料理）",

  "noise:level": "騒がしさどれくらい？",
  "noise:talk": "会話しやすい？（声の通り）",
  "noise:kids": "子どもの声とか気になりそう？",

  "work:wifi": "Wi-Fi/電源あった？",
  "work:stay": "長居できそう？",
  "work:space": "席の広さ・PC広げやすさは？",
  "work:rules": "作業NGっぽい雰囲気ある？",

  "food:must": "絶対頼むべきメニューは？",
  "food:portion": "量は多い？少ない？",
  "food:taste": "味の系統（濃い/あっさり）は？",
  "food:menu": "メニューの幅（選びやすさ）は？",
  "food:photo": "料理の写真もっと見たい！",

  "drink:menu": "お酒の充実度どう？",
  "drink:nonal": "ノンアル/ソフドリ充実してた？",
  "drink:pairing": "料理との相性（ペアリング）良い？",

  "resv:need": "予約した？必須？",
  "resv:wait": "待ち時間はどれくらい？",
  "resv:tip": "予約のコツある？（何時/何日前）",
  "resv:peak": "混む時間帯はいつ？",
  "resv:walkin": "飛び込みでも入れそう？",

  "comfort:seat": "席（個室/カウンター）どうだった？",
  "comfort:space": "席の間隔・狭さ/広さは？",
  "comfort:temp": "店内の温度（暑い/寒い）どう？",
  "comfort:clean": "清潔感どう？",

  "svc:staff": "接客どうだった？",
  "svc:speed": "提供スピードは？",
  "svc:explain": "説明が丁寧？おすすめ聞けた？",
  "svc:rule": "ルール厳しめ？（席時間/注文制）",

  "kids:ok": "子連れいけそう？",
  "kids:chair": "子ども椅子/取り皿ありそう？",
  "kids:space": "ベビーカーいけそう？通路広い？",

  "acc:walk": "駅からの体感距離は？",
  "acc:landmark": "迷わず行けた？目印ある？",
  "acc:weather": "雨の日つらい？（坂/屋外多め）",

  "pay:card": "カード使えた？",
  "pay:cashless": "電子マネー/QRは？",
  "pay:cash": "現金のみっぽい？",
  "pay:split": "割り勘しやすい？（個別会計）",

  "budget:pp": "結局いくらくらい？（1人あたり）",
  "budget:menu": "代表的なメニューの価格は？",
  "budget:drink": "お酒頼むとどれくらい上がる？",
  "budget:value": "コスパ感は？（満足度との釣り合い）",
  "budget:charge": "席料/チャージ/お通しあった？",
  "budget:timing": "ランチ/ディナーで価格差ある？",

  "health:allergy": "アレルギー/体質配慮できそう？",
  "health:veg": "ベジ/ヴィーガン対応ありそう？",
  "health:spice": "辛さ調整できそう？",
};

type Actor = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username?: string | null;
};

type Post = {
  id: string;
  content: string | null;
  image_urls: string[] | null;
  place_name: string | null;
  place_address: string | null;
  place_id: string | null;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
};

type DetailRequest = {
  id: string;
  category: string;
  template_ids: string[];
  free_text: string | null;
  reveal_name: boolean;
  created_at: string;
};

type NotificationType =
  | "like"
  | "want"
  | "comment"
  | "reply"
  | "follow"
  | "comment_like"
  | "detail_request"
  | "detail_answer";

type Notification = {
  id: string;
  type: NotificationType;
  created_at: string;
  read: boolean;
  actor: Actor | null;
  post: Post | null;
  comment: Comment | null;
  detail_request: DetailRequest | null;
};

function formatRelative(iso: string, t: (key: string, values?: any) => string) {
  const ts = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return t("justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  return t("daysAgo", { count: d });
}

function dayBucketKey(iso: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = dtf.format(new Date());
  const d = dtf.format(new Date(iso));
  const todayDate = new Date(`${today}T00:00:00+09:00`).getTime();
  const curDate = new Date(`${d}T00:00:00+09:00`).getTime();
  const diffDays = Math.floor((todayDate - curDate) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 7) return "past7days";
  return "older";
}

const LABEL_KEY_FOR_TYPE: Record<NotificationType, string> = {
  like: "liked",
  want: "wanted",
  comment: "commented",
  reply: "replied",
  follow: "followed",
  comment_like: "commentLiked",
  detail_request: "requested",
  detail_answer: "answered",
};

function iconForType(t: NotificationType) {
  switch (t) {
    case "like":
      return <Heart size={14} className="text-rose-500" />;
    case "want":
      return <Heart size={14} className="text-orange-500" />;
    case "comment":
    case "reply":
      return <MessageCircle size={14} className="text-slate-500 dark:text-gray-400" />;
    case "follow":
      return <UserPlus size={14} className="text-sky-600" />;
    case "comment_like":
      return <Heart size={14} className="text-rose-500" />;
    case "detail_request":
      return <HelpCircle size={14} className="text-orange-600" />;
    case "detail_answer":
      return <MessageCircle size={14} className="text-sky-600" />;
  }
}

function getThumbUrl(post: Post | null) {
  if (!post?.image_urls?.length) return null;
  return post.image_urls[0] ?? null;
}

function prettyTemplateLabel(id: string) {
  return TEMPLATE_LABELS[id] ?? id;
}

function buildRequestPreview(dr: DetailRequest | null, t: (key: string, values?: any) => string) {
  if (!dr) return null;
  const parts: string[] = [];

  if (Array.isArray(dr.template_ids) && dr.template_ids.length) {
    const head = dr.template_ids.slice(0, 3).map(prettyTemplateLabel);
    parts.push(...head);
    if (dr.template_ids.length > 3) parts.push(t("otherCount", { count: dr.template_ids.length - 3 }));
  }
  if (dr.free_text && dr.free_text.trim()) parts.push(dr.free_text.trim());

  const s = parts.join(" / ");
  return s || null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const t = useTranslations("notifications");

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [justReadIds, setJustReadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const emptyText = useMemo(() => {
    if (loading) return t("loading");
    return t("empty");
  }, [loading, t]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
          id, type, created_at, read,
          actor:actor_id ( id, display_name, avatar_url, username ),
          post:post_id ( id, content, image_urls, place_name, place_address, place_id ),
          comment:comment_id ( id, body, created_at ),
          detail_request:detail_request_id ( id, category, template_ids, free_text, reveal_name, created_at )
        `
        )
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) {
        console.error(error);
        setNotifs([]);
        setLoading(false);
        return;
      }

      const unreadIds = data?.filter((n: any) => !n.read).map((n: any) => n.id) ?? [];
      setJustReadIds(unreadIds);
      setNotifs((data as unknown as Notification[]) ?? []);

      try {
        await fetch("/api/notifications/read", { method: "POST" });
      } catch (e) {
        console.warn("failed to mark notifications as read", e);
      }

      setLoading(false);
    };

    load();
  }, [supabase]);

  const grouped = useMemo(() => {
    const m = new Map<string, Notification[]>();
    for (const n of notifs) {
      const b = dayBucketKey(n.created_at);
      const arr = m.get(b) ?? [];
      arr.push(n);
      m.set(b, arr);
    }
    const order = ["today", "yesterday", "past7days", "older"];
    return order.filter((k) => m.has(k)).map((k) => ({ key: k, label: t(k), items: m.get(k)! }));
  }, [notifs, t]);

  return (
    <main className="min-h-screen bg-[#fafafa] dark:bg-[#0e1117] text-slate-900 dark:text-gray-100">
      <div className="mx-auto w-full max-w-2xl px-0 pb-24">
        <div className="sticky top-0 z-20 border-b border-black/10 dark:border-white/10 bg-white/90 dark:bg-[#0e1117]/90 backdrop-blur pt-[env(safe-area-inset-top)]">
          <div className="flex h-12 items-center justify-between px-4">
            <h1 className="text-[16px] font-semibold tracking-tight">{t("title")}</h1>
            <Link
              href="/settings/notifications"
              className="text-[12px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
            >
              {t("settings")}
            </Link>
          </div>
        </div>

        {!notifs?.length ? (
          <div className="flex min-h-[60vh] items-center justify-center px-4 text-[12px] text-slate-500 dark:text-gray-500">
            {emptyText}
          </div>
        ) : (
          <div className="pb-6">
            {grouped.map((g) => (
              <section key={g.key} className="pt-4">
                <div className="px-4 pb-2 text-[13px] font-semibold text-slate-900 dark:text-gray-100">{g.label}</div>

                <div className="divide-y divide-black/5 dark:divide-white/5 bg-white dark:bg-[#16181e]">
                  {g.items.map((n) => {
                    const actor = n.actor;
                    const post = n.post;
                    const dr = n.detail_request;

                    const mapUrl = post?.place_id
                      ? `https://www.google.com/maps/place/?q=place_id:${post.place_id}`
                      : post?.place_address
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          post.place_address
                        )}`
                      : null;

                    // ★ ここが差分：detail_answer は /requests/[detail_request_id]
                    const href =
                      n.type === "detail_answer" && dr?.id
                        ? `/requests/${dr.id}`
                        : n.type === "follow" && actor?.id
                        ? `/u/${actor.username ?? actor.id}`
                        : post?.id
                        ? `/posts/${post.id}`
                        : "/timeline";

                    // actorがnullなら匿名（detail_request/detail_answer の場合の保険）
                    const actorName =
                      actor?.display_name ??
                      actor?.username ??
                      (n.type === "detail_request" ? t("anonymous") : t("user"));

                    const actorAvatar = actor?.avatar_url ?? null;
                    const initial = (actorName || "U").slice(0, 1).toUpperCase();

                    const commentPreview =
                      (n.type === "comment" || n.type === "reply" || n.type === "comment_like") &&
                      n.comment?.body
                        ? n.comment.body
                        : null;

                    const reqPreview =
                      n.type === "detail_request" || n.type === "detail_answer"
                        ? buildRequestPreview(dr, t)
                        : null;

                    const thumb = getThumbUrl(post);
                    const isJustRead = justReadIds.includes(n.id);

                    const showRequestActions = n.type === "detail_request" && !!dr?.id && !!post?.id;

                    return (
                      <Link
                        key={n.id}
                        href={href}
                        className={[
                          "flex items-center gap-3 px-4 py-3",
                          "active:bg-black/[.03] hover:bg-black/[.02] dark:active:bg-white/[.03] dark:hover:bg-white/[.02]",
                          isJustRead ? "bg-[#eef6ff] dark:bg-blue-900/20" : "bg-white dark:bg-transparent",
                        ].join(" ")}
                      >
                        <div className="shrink-0">
                          {actorAvatar && !(n.type === "detail_request" && !actor?.id) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={actorAvatar}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover bg-slate-200 dark:bg-white/10"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-white/10 text-[12px] font-bold text-slate-700 dark:text-gray-400">
                              {n.type === "detail_request" && !actor?.id ? "？" : initial}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] leading-snug text-slate-900 dark:text-gray-100">
                            <span className="inline-flex items-center gap-1.5">
                              {iconForType(n.type)}
                              <span className="font-semibold">{actorName}</span>
                            </span>{" "}
                            <span className="text-slate-700 dark:text-gray-300">{t(LABEL_KEY_FOR_TYPE[n.type])}</span>
                          </div>

                          {commentPreview ? (
                            <div className="mt-0.5 line-clamp-2 text-[12px] text-slate-500 dark:text-gray-400">
                              &ldquo;{commentPreview}&rdquo;
                            </div>
                          ) : null}

                          {reqPreview ? (
                            <div className="mt-1 line-clamp-2 text-[12px] text-slate-500 dark:text-gray-400">
                              &ldquo;{reqPreview}&rdquo;
                            </div>
                          ) : null}

                          {post?.place_name ? (
                            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500 dark:text-gray-400">
                              <MapPin size={12} className="text-slate-400 dark:text-gray-500" />
                              {mapUrl ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.open(mapUrl, "_blank", "noopener,noreferrer");
                                  }}
                                  className="truncate text-left hover:underline"
                                >
                                  {post.place_name}
                                </button>
                              ) : (
                                <span className="truncate">{post.place_name}</span>
                              )}
                            </div>
                          ) : null}

                          {/* detail_request のときだけ投稿者向けアクション */}
                          {showRequestActions ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/answers/${dr!.id}`);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10"
                              >
                                <MessageCircle size={14} className="text-slate-500 dark:text-gray-400" />
                                {t("answerDirectly")}
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/posts/${post!.id}/edit`);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 text-[12px] font-semibold text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                              >
                                <Pencil size={14} className="text-orange-600" />
                                {t("answerByEdit")}
                              </button>
                            </div>
                          ) : null}

                          <div className="mt-0.5 text-[11px] text-slate-400 dark:text-gray-500">{formatRelative(n.created_at, t)}</div>
                        </div>

                        <div className="shrink-0">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-11 w-11 rounded-xl object-cover bg-slate-200 dark:bg-white/10"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="h-11 w-11" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}