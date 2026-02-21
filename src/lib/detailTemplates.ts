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
  { id: "visit:when", label: "行った時間帯（昼/夜）は？", category: "visit_time" },
  { id: "visit:day", label: "曜日はいつ？", category: "visit_time" },
  { id: "visit:duration", label: "滞在時間はどれくらい？", category: "visit_time" },
  { id: "visit:busy", label: "その時間帯、混んでた？", category: "visit_time" },
  { id: "visit:repeat", label: "リピあり？また行きたい？", category: "visit_time" },

  // scene
  { id: "scene:who", label: "誰と行くのが良さそう？", category: "scene" },
  { id: "scene:best", label: "おすすめの使い方は？", category: "scene" },
  { id: "scene:solo", label: "1人でも行けそう？", category: "scene" },
  { id: "scene:group", label: "大人数でもいける？", category: "scene" },
  { id: "scene:family", label: "家族向き？", category: "scene" },

  // mood
  { id: "mood:vibe", label: "雰囲気ってどんな感じ？", category: "mood" },
  { id: "mood:date", label: "デート向き？", category: "mood" },
  { id: "mood:lighting", label: "照明/店内の明るさは？", category: "mood" },
  { id: "mood:music", label: "音楽/空気感はどんな感じ？", category: "mood" },
  { id: "mood:photo", label: "写真映えする？（内装/料理）", category: "mood" },

  // noise
  { id: "noise:level", label: "騒がしさどれくらい？", category: "noise" },
  { id: "noise:talk", label: "会話しやすい？（声の通り）", category: "noise" },
  { id: "noise:kids", label: "子どもの声とか気になりそう？", category: "noise" },

  // work
  { id: "work:wifi", label: "Wi-Fi/電源あった？", category: "work" },
  { id: "work:stay", label: "長居できそう？", category: "work" },
  { id: "work:space", label: "席の広さ・PC広げやすさは？", category: "work" },
  { id: "work:rules", label: "作業NGっぽい雰囲気ある？", category: "work" },

  // food
  { id: "food:must", label: "絶対頼むべきメニューは？", category: "food" },
  { id: "food:portion", label: "量は多い？少ない？", category: "food" },
  { id: "food:taste", label: "味の系統（濃い/あっさり）は？", category: "food" },
  { id: "food:menu", label: "メニューの幅（選びやすさ）は？", category: "food" },
  { id: "food:photo", label: "料理の写真もっと見たい！", category: "food" },

  // drink
  { id: "drink:menu", label: "お酒の充実度どう？", category: "drink" },
  { id: "drink:nonal", label: "ノンアル/ソフドリ充実してた？", category: "drink" },
  { id: "drink:pairing", label: "料理との相性（ペアリング）良い？", category: "drink" },

  // reservation
  { id: "resv:need", label: "予約した？必須？", category: "reservation" },
  { id: "resv:wait", label: "待ち時間はどれくらい？", category: "reservation" },
  { id: "resv:tip", label: "予約のコツある？（何時/何日前）", category: "reservation" },
  { id: "resv:peak", label: "混む時間帯はいつ？", category: "reservation" },
  { id: "resv:walkin", label: "飛び込みでも入れそう？", category: "reservation" },

  // comfort
  { id: "comfort:seat", label: "席（個室/カウンター）どうだった？", category: "comfort" },
  { id: "comfort:space", label: "席の間隔・狭さ/広さは？", category: "comfort" },
  { id: "comfort:temp", label: "店内の温度（暑い/寒い）どう？", category: "comfort" },
  { id: "comfort:clean", label: "清潔感どう？", category: "comfort" },

  // service
  { id: "svc:staff", label: "接客どうだった？", category: "service" },
  { id: "svc:speed", label: "提供スピードは？", category: "service" },
  { id: "svc:explain", label: "説明が丁寧？おすすめ聞けた？", category: "service" },
  { id: "svc:rule", label: "ルール厳しめ？（席時間/注文制）", category: "service" },

  // kids
  { id: "kids:ok", label: "子連れいけそう？", category: "kids" },
  { id: "kids:chair", label: "子ども椅子/取り皿ありそう？", category: "kids" },
  { id: "kids:space", label: "ベビーカーいけそう？通路広い？", category: "kids" },

  // access
  { id: "acc:walk", label: "駅からの体感距離は？", category: "access" },
  { id: "acc:landmark", label: "迷わず行けた？目印ある？", category: "access" },
  { id: "acc:weather", label: "雨の日つらい？（坂/屋外多め）", category: "access" },

  // payment
  { id: "pay:card", label: "カード使えた？", category: "payment" },
  { id: "pay:cashless", label: "電子マネー/QRは？", category: "payment" },
  { id: "pay:cash", label: "現金のみっぽい？", category: "payment" },
  { id: "pay:split", label: "割り勘しやすい？（個別会計）", category: "payment" },

  // budget
  { id: "budget:pp", label: "結局いくらくらい？（1人あたり）", category: "budget" },
  { id: "budget:menu", label: "代表的なメニューの価格は？", category: "budget" },
  { id: "budget:drink", label: "お酒頼むとどれくらい上がる？", category: "budget" },
  { id: "budget:value", label: "コスパ感は？（満足度との釣り合い）", category: "budget" },
  { id: "budget:charge", label: "席料/チャージ/お通しあった？", category: "budget" },
  { id: "budget:timing", label: "ランチ/ディナーで価格差ある？", category: "budget" },

  // health
  { id: "health:allergy", label: "アレルギー/体質配慮できそう？", category: "health" },
  { id: "health:veg", label: "ベジ/ヴィーガン対応ありそう？", category: "health" },
  { id: "health:spice", label: "辛さ調整できそう？", category: "health" },
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