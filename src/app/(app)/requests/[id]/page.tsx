// src/app/(app)/requests/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PDR = {
  id: string;
  post_id: string;
  requester_user_id: string;
  category: string;
  template_ids: string[];
  free_text: string | null;
  reveal_name: boolean;
  status: string;
  created_at: string;
};

type PostRow = {
  id: string;
  user_id: string;
  place_name: string | null;
  place_id: string | null;
  image_urls: string[] | null;
  content: string | null;
};

type ProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username?: string | null;
};

type AnswerRow = {
  id: string;
  request_id: string;
  responder_user_id: string;
  body: string;
  is_public: boolean;
  created_at: string;
};

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

function labelForTemplate(id: string) {
  return TEMPLATE_LABELS[id] ?? id;
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initial = (name || "U").slice(0, 1).toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-9 w-9 rounded-full object-cover bg-slate-200" />
  ) : (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-[12px] font-bold text-slate-700">
      {initial}
    </div>
  );
}

function showName(p: ProfileLite | null) {
  return p?.display_name ?? p?.username ?? "ユーザー";
}

function formatJp(iso: string) {
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export default async function RequestPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) notFound();

  // ---- request（1段目）
  const { data: pdr, error: pdrErr } = await supabase
    .from("post_detail_requests")
    .select("id, post_id, requester_user_id, category, template_ids, free_text, reveal_name, status, created_at")
    .eq("id", params.id)
    .single();

  if (pdrErr || !pdr) notFound();

  // ---- requester check（質問者本人のみ）
  if ((pdr as PDR).requester_user_id !== auth.user.id) notFound();

  // ---- post（2段目）
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id, user_id, place_name, place_id, image_urls, content")
    .eq("id", (pdr as PDR).post_id)
    .single();

  if (postErr || !post) notFound();

  // ---- post owner profile（3段目）
  const { data: ownerProf } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, username")
    .eq("id", (post as PostRow).user_id)
    .single();

  const owner = (ownerProf as any) ?? null;

  // ---- answers（4段目）
  const { data: answersRaw, error: ansErr } = await supabase
    .from("post_detail_request_answers")
    .select("id, request_id, responder_user_id, body, is_public, created_at")
    .eq("request_id", (pdr as PDR).id)
    .order("created_at", { ascending: true });

  if (ansErr) notFound();

  const answers = (answersRaw as unknown as AnswerRow[]) ?? [];

  // ---- responder profiles（5段目）
  const responderIds = Array.from(new Set(answers.map((a) => a.responder_user_id).filter(Boolean)));
  let responderProfiles: Record<string, ProfileLite> = {};
  if (responderIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, username")
      .in("id", responderIds);
    const map: Record<string, ProfileLite> = {};
    for (const p of (profs as any[]) ?? []) if (p?.id) map[p.id] = p;
    responderProfiles = map;
  }

  const templates = Array.isArray((pdr as PDR).template_ids) ? (pdr as PDR).template_ids : [];
  const freeText = (pdr as PDR).free_text?.trim() || null;

  const postHref = `/posts/${(post as PostRow).id}`;
  const ownerName = showName(owner);

  return (
    <main className="min-h-screen bg-[#fafafa] text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/notifications" className="text-[12px] font-semibold text-slate-600 hover:underline">
            ← 通知へ
          </Link>
          <Link href={postHref} className="text-[12px] font-semibold text-slate-600 hover:underline">
            投稿へ
          </Link>
        </div>

        <div className="rounded-3xl bg-white ring-1 ring-black/10 shadow-sm overflow-hidden">
          <div className="border-b border-black/5 px-4 py-3">
            <div className="text-[13px] font-bold text-slate-900">あなたのリクエスト</div>
            <div className="mt-1 text-[12px] text-slate-500">
              {(post as PostRow).place_name ? `「${(post as PostRow).place_name}」の投稿` : "この投稿"}へのリクエストです
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* 投稿者 */}
            <div className="flex items-center gap-3">
              <Avatar name={ownerName} url={owner?.avatar_url ?? null} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{ownerName}</div>
                <div className="text-[11px] text-slate-500">
                  {answers.length ? "回答が届いています" : "まだ回答はありません"}
                </div>
              </div>
            </div>

            {/* リクエスト内容 */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-bold text-slate-700">リクエスト内容</div>
                <div className="text-[11px] text-slate-400">{(pdr as PDR).reveal_name ? "記名で送信" : "匿名で送信"}</div>
              </div>

              {templates.length ? (
                <ul className="mt-2 space-y-1">
                  {templates.map((tid) => (
                    <li key={tid} className="text-[12px] text-slate-700">
                      ・{labelForTemplate(tid)}
                    </li>
                  ))}
                </ul>
              ) : null}

              {freeText ? (
                <div className="mt-2 text-[12px] text-slate-700">
                  <span className="font-semibold text-slate-600">自由入力：</span> {freeText}
                </div>
              ) : null}
            </div>

            {/* 回答 */}
            <div className="space-y-2">
              <div className="text-[12px] font-semibold text-slate-700">回答</div>

              {answers.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[12px] text-slate-500">
                  まだ回答が届いていません。しばらく待ってみてください。
                </div>
              ) : (
                <div className="space-y-2">
                  {answers.map((a) => {
                    const responder = responderProfiles[a.responder_user_id] ?? null;
                    const responderName = showName(responder);

                    return (
                      <div key={a.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={responderName} url={responder?.avatar_url ?? null} />
                          <div className="min-w-0">
                            <div className="text-[12px] font-bold text-slate-900">{responderName}</div>
                            <div className="text-[11px] text-slate-400">{formatJp(a.created_at)}</div>
                          </div>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-900">
                          {a.body}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <Link
                href={postHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                投稿を見る
              </Link>

              <Link
                href="/notifications"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                通知へ戻る
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}