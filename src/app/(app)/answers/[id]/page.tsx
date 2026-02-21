// src/app/(app)/answer/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
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

// Server Action（voidを返す）
async function submitAnswer(formData: FormData): Promise<void> {
  "use server";
  const supabase = await createClient();

  const requestId = String(formData.get("request_id") || "");
  const body = String(formData.get("body") || "").trim();
  const isPublic = String(formData.get("is_public") || "true") === "true";

  if (!requestId || !body) redirect(`/answer/${requestId}?err=empty`);

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/answer/${requestId}?err=auth`);

  // request
  const { data: pdr } = await supabase
    .from("post_detail_requests")
    .select("id, post_id, requester_user_id")
    .eq("id", requestId)
    .single();

  if (!pdr) redirect(`/answer/${requestId}?err=notfound`);

  // post（2段階）
  const { data: post } = await supabase.from("posts").select("id, user_id").eq("id", pdr.post_id).single();
  if (!post) redirect(`/answer/${requestId}?err=post`);

  if (post.user_id !== auth.user.id) redirect(`/answer/${requestId}?err=forbidden`);

  // save answer
  const { error: ierr } = await supabase.from("post_detail_request_answers").insert({
    request_id: requestId,
    responder_user_id: auth.user.id,
    body,
    is_public: isPublic,
  });
  if (ierr) redirect(`/answer/${requestId}?err=save`);

  await supabase.from("post_detail_requests").update({ status: "answered" }).eq("id", requestId);

  // notify requester
  if (pdr.requester_user_id && pdr.requester_user_id !== auth.user.id) {
    await supabase.from("notifications").insert({
      user_id: pdr.requester_user_id,
      actor_id: auth.user.id,
      post_id: pdr.post_id,
      type: "detail_answer",
      read: false,
      detail_request_id: requestId,
    });
  }

  redirect("/notifications");
}

export default async function AnswerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { err?: string };
}) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) notFound();

  // request（1段目）
  const { data: pdr, error: pdrErr } = await supabase
    .from("post_detail_requests")
    .select("id, post_id, requester_user_id, category, template_ids, free_text, reveal_name, status, created_at")
    .eq("id", params.id)
    .single();

  if (pdrErr || !pdr) notFound();

  // post（2段目）
  const { data: post } = await supabase
    .from("posts")
    .select("id, user_id, place_name, place_id, image_urls, content")
    .eq("id", (pdr as PDR).post_id)
    .single();

  if (!post) notFound();

  // owner check
  if ((post as PostRow).user_id !== auth.user.id) notFound();

  // requester profile（記名なら）
  let requester: ProfileLite | null = null;
  if ((pdr as PDR).reveal_name) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, username")
      .eq("id", (pdr as PDR).requester_user_id)
      .single();
    requester = (prof as any) ?? null;
  }

  const requesterName =
    (pdr as PDR).reveal_name && requester
      ? requester.display_name ?? requester.username ?? "ユーザー"
      : "匿名";
  const requesterAvatar = (pdr as PDR).reveal_name && requester ? requester.avatar_url ?? null : null;

  const templates = Array.isArray((pdr as PDR).template_ids) ? (pdr as PDR).template_ids : [];
  const freeText = (pdr as PDR).free_text?.trim() || null;

  const postHref = `/posts/${(post as PostRow).id}`;
  const err = searchParams?.err ?? null;
  const errMsg =
    err === "empty"
      ? "回答を入力してください"
      : err === "auth"
      ? "ログインが必要です"
      : err === "forbidden"
      ? "権限がありません"
      : err === "save"
      ? "保存に失敗しました"
      : err === "post"
      ? "投稿情報が取得できません"
      : err === "notfound"
      ? "リクエストが見つかりません"
      : null;

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
            <div className="text-[13px] font-bold text-slate-900">リクエストに答える</div>
            <div className="mt-1 text-[12px] text-slate-500">
              {(post as PostRow).place_name ? `「${(post as PostRow).place_name}」の投稿` : "この投稿"}へのリクエストです
            </div>
          </div>

          <div className="px-4 py-4 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={requesterName} url={requesterAvatar} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{requesterName}</div>
                <div className="text-[11px] text-slate-500">
                  {(pdr as PDR).status === "answered" ? "回答済み（追記も可能）" : "未回答"}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-[12px] font-bold text-slate-700">リクエスト内容</div>

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

            {errMsg ? <div className="text-[12px] font-semibold text-red-600">{errMsg}</div> : null}

            <form action={submitAnswer} className="space-y-3">
              <input type="hidden" name="request_id" value={(pdr as PDR).id} />

              <div className="space-y-2">
                <div className="text-[12px] font-semibold text-slate-700">回答</div>
                <textarea
                  name="body"
                  placeholder="例）1人あたり4,000円くらい。お通しなし。混んでたので予約推奨！"
                  className="h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-orange-300"
                  required
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_public"
                    value="true"
                    defaultChecked
                    className="mt-1 h-4 w-4 accent-orange-600"
                  />
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-slate-800">投稿の補足として残す</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      オンにすると、あとで投稿詳細に「補足/Q&A」として表示できます。
                    </div>
                  </div>
                </label>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 w-full rounded-full bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700"
              >
                <Loader2 className="h-4 w-4" />
                送信する
              </button>

              <div className="text-[11px] text-slate-400">※送信すると質問者に通知されます</div>
            </form>

            <div className="pt-2 flex items-center justify-between">
              <Link
                href={`/posts/${(post as PostRow).id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[12px] font-semibold text-orange-700 hover:bg-orange-100"
              >
                <Pencil size={14} className="text-orange-600" />
                追記で答える（投稿編集）
              </Link>

              <Link
                href={postHref}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                投稿を見る
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}