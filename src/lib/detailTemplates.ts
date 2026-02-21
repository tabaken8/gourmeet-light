// src/lib/detailTemplates.ts

// ✅ 追加：カテゴリ別テンプレ（並び順をここで一元管理）
export type DetailTemplateCategory =
  | "visit_time"
  | "scene"
  | "mood"
  | "noise"
  | "work"
  | "food"
  | "drink"
  | "reservation"
  | "comfort"
  | "service"
  | "kids"
  | "access"
  | "payment"
  | "budget"
  | "health";

export type DetailTemplateDef = {
  id: string;
  label: string;
  category: DetailTemplateCategory;
};

export const DETAIL_TEMPLATE_DEFS: DetailTemplateDef[] = [
  // visit_time
  { id: "visit:when", label: "行った時間帯（昼/夜）はいつでしたか？", category: "visit_time" },
  { id: "visit:day", label: "曜日はいつでしたか？", category: "visit_time" },
  { id: "visit:duration", label: "滞在時間はどれくらいでしたか？", category: "visit_time" },
  { id: "visit:busy", label: "その時間帯は混んでいましたか？", category: "visit_time" },
  { id: "visit:repeat", label: "リピートはありそうですか？また行きたいですか？", category: "visit_time" },

  // scene
  { id: "scene:who", label: "誰と行くのが良さそうですか？", category: "scene" },
  { id: "scene:best", label: "おすすめの使い方はありますか？", category: "scene" },
  { id: "scene:solo", label: "お一人でも行けそうですか？", category: "scene" },
  { id: "scene:group", label: "大人数でも行けそうですか？", category: "scene" },
  { id: "scene:family", label: "家族向きですか？", category: "scene" },

  // mood
  { id: "mood:vibe", label: "雰囲気はどんな感じでしたか？", category: "mood" },
  { id: "mood:date", label: "デート向きですか？", category: "mood" },
  { id: "mood:lighting", label: "照明/店内の明るさはいかがでしたか？", category: "mood" },
  { id: "mood:music", label: "音楽/空気感はどんな感じでしたか？", category: "mood" },
  { id: "mood:photo", label: "写真映えしますか？（内装/料理）", category: "mood" },

  // noise
  { id: "noise:level", label: "騒がしさはどれくらいでしたか？", category: "noise" },
  { id: "noise:talk", label: "会話しやすいですか？（声の通り）", category: "noise" },
  { id: "noise:kids", label: "子どもの声などは気になりそうですか？", category: "noise" },

  // work
  { id: "work:wifi", label: "Wi-Fi/電源はありましたか？", category: "work" },
  { id: "work:stay", label: "長居できそうでしたか？", category: "work" },
  { id: "work:space", label: "席の広さ・PCの広げやすさはいかがでしたか？", category: "work" },
  { id: "work:rules", label: "作業NGっぽい雰囲気はありましたか？", category: "work" },

  // food
  { id: "food:must", label: "絶対に頼むべきメニューはありますか？", category: "food" },
  { id: "food:portion", label: "量は多めでしたか？少なめでしたか？", category: "food" },
  { id: "food:taste", label: "味の系統（濃い/あっさり）はどちらでしたか？", category: "food" },
  { id: "food:menu", label: "メニューの幅（選びやすさ）はどうでしたか？", category: "food" },
  { id: "food:photo", label: "料理の写真をもっと見たいです。", category: "food" },

  // drink
  { id: "drink:menu", label: "お酒の充実度はいかがでしたか？", category: "drink" },
  { id: "drink:nonal", label: "ノンアル/ソフトドリンクは充実していましたか？", category: "drink" },
  { id: "drink:pairing", label: "料理との相性（ペアリング）は良さそうでしたか？", category: "drink" },

  // reservation
  { id: "resv:need", label: "予約しましたか？また、予約は必須でしたか？", category: "reservation" },
  { id: "resv:wait", label: "待ち時間はどれくらいでしたか？", category: "reservation" },
  { id: "resv:tip", label: "予約のコツはありますか？（何時/何日前など）", category: "reservation" },
  { id: "resv:peak", label: "混む時間帯はいつでしたか？", category: "reservation" },
  { id: "resv:walkin", label: "飛び込みでも入れそうでしたか？", category: "reservation" },

  // comfort
  { id: "comfort:seat", label: "席（個室/カウンター）はどうでしたか？", category: "comfort" },
  { id: "comfort:space", label: "席の間隔・狭さ/広さはいかがでしたか？", category: "comfort" },
  { id: "comfort:temp", label: "店内の温度（暑い/寒い）はどうでしたか？", category: "comfort" },
  { id: "comfort:clean", label: "清潔感はいかがでしたか？", category: "comfort" },

  // service
  { id: "svc:staff", label: "接客はいかがでしたか？", category: "service" },
  { id: "svc:speed", label: "提供スピードはどうでしたか？", category: "service" },
  { id: "svc:explain", label: "説明は丁寧でしたか？おすすめを聞けましたか？", category: "service" },
  { id: "svc:rule", label: "ルールは厳しめでしたか？（席時間/注文制など）", category: "service" },

  // kids
  { id: "kids:ok", label: "子連れでも行けそうですか？", category: "kids" },
  { id: "kids:chair", label: "子ども椅子/取り皿はありそうでしたか？", category: "kids" },
  { id: "kids:space", label: "ベビーカーでも行けそうですか？通路は広めでしたか？", category: "kids" },

  // access
  { id: "acc:walk", label: "駅からの体感距離はどれくらいでしたか？", category: "access" },
  { id: "acc:landmark", label: "迷わず行けましたか？目印はありましたか？", category: "access" },
  { id: "acc:weather", label: "雨の日はつらそうでしたか？（坂/屋外が多いなど）", category: "access" },

  // payment
  { id: "pay:card", label: "カードは使えましたか？", category: "payment" },
  { id: "pay:cashless", label: "電子マネー/QR決済は使えましたか？", category: "payment" },
  { id: "pay:cash", label: "現金のみの可能性はありそうでしたか？", category: "payment" },
  { id: "pay:split", label: "割り勘しやすいですか？（個別会計など）", category: "payment" },

  // budget
  { id: "budget:pp", label: "結局いくらくらいでしたか？（1人あたり）", category: "budget" },
  { id: "budget:menu", label: "代表的なメニューの価格はどれくらいでしたか？", category: "budget" },
  { id: "budget:drink", label: "お酒を頼むとどれくらい上がりそうでしたか？", category: "budget" },
  { id: "budget:value", label: "コスパ感はどうでしたか？（満足度との釣り合い）", category: "budget" },
  { id: "budget:charge", label: "席料/チャージ/お通しはありましたか？", category: "budget" },
  { id: "budget:timing", label: "ランチ/ディナーで価格差はありましたか？", category: "budget" },

  // health
  { id: "health:allergy", label: "アレルギー/体質への配慮はできそうでしたか？", category: "health" },
  { id: "health:veg", label: "ベジ/ヴィーガン対応はありそうでしたか？", category: "health" },
  { id: "health:spice", label: "辛さの調整はできそうでしたか？", category: "health" },
];

// ✅ 便利：カテゴリ→テンプレ配列
export function templatesByCategory(): Record<DetailTemplateCategory, { id: string; label: string }[]> {
  const out = {} as Record<DetailTemplateCategory, { id: string; label: string }[]>;
  for (const t of DETAIL_TEMPLATE_DEFS) {
    (out[t.category] ||= []).push({ id: t.id, label: t.label });
  }
  return out;
}

// ✅ 便利：id→label Map
export function templateLabelMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of DETAIL_TEMPLATE_DEFS) m.set(t.id, t.label);
  return m;
}