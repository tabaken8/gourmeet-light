// src/lib/postTags.ts
export type TagCategory =
  | "all"
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

export type PostTag = {
  id: string; // 保存する値（安定ID）
  label: string; // 表示
  category: Exclude<TagCategory, "all">;
  // 同じ exclusiveGroup 内は同時に選べない（最後に選んだものが勝つ）
  exclusiveGroup?: string;
  // 検索用（任意）
  keywords?: string[];
};

export const TAG_CATEGORIES: { id: TagCategory; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "scene", label: "用途" },
  { id: "mood", label: "雰囲気" },
  { id: "noise", label: "騒がしさ" },
  { id: "work", label: "作業" },
  { id: "food", label: "料理" },
  { id: "drink", label: "お酒" },
  { id: "reservation", label: "予約/混雑" },
  { id: "comfort", label: "席/快適" },
  { id: "service", label: "サービス" },
  { id: "kids", label: "子連れ" },
  { id: "access", label: "アクセス" },
  { id: "payment", label: "支払い" },
  { id: "budget", label: "価格感" },
  { id: "health", label: "体質/健康" },
];

// いまの倍以上：カテゴリも多め＋予約系を厚く＋排他（昼/夜、静か/うるさい、予約ポリシー等）
export const POST_TAGS: PostTag[] = [
  // ---- scene ----
  { id: "scene:date", label: "デート向き", category: "scene", keywords: ["デート"] },
  { id: "scene:friends", label: "友達と", category: "scene", keywords: ["友達"] },
  { id: "scene:family", label: "家族で", category: "scene", keywords: ["家族"] },
  { id: "scene:solo", label: "1人でもOK", category: "scene", keywords: ["一人", "ソロ"] },
  { id: "scene:group", label: "大人数向き", category: "scene", keywords: ["団体"] },
  { id: "scene:business", label: "会食/接待", category: "scene", keywords: ["接待", "会食"] },
  { id: "scene:anniversary", label: "記念日", category: "scene", keywords: ["記念日"] },

  // ---- mood ----
  { id: "mood:cozy", label: "落ち着く", category: "mood", keywords: ["落ち着く", "居心地"] },
  { id: "mood:stylish", label: "おしゃれ", category: "mood", keywords: ["おしゃれ"] },
  { id: "mood:casual", label: "カジュアル", category: "mood", keywords: ["カジュアル"] },
  { id: "mood:luxury", label: "高級感", category: "mood", keywords: ["高級"] },
  { id: "mood:romantic", label: "雰囲気いい", category: "mood", keywords: ["雰囲気"] },
  { id: "mood:unique", label: "クセになる", category: "mood", keywords: ["クセ", "中毒"] },

  // ---- noise (exclusive) ----
  { id: "noise:quiet", label: "静か", category: "noise", exclusiveGroup: "noise", keywords: ["静か"] },
  { id: "noise:normal", label: "普通", category: "noise", exclusiveGroup: "noise", keywords: ["普通"] },
  { id: "noise:loud", label: "うるさい", category: "noise", exclusiveGroup: "noise", keywords: ["うるさい", "騒がしい"] },

  // ---- work ----
  { id: "work:ok", label: "作業OK", category: "work", keywords: ["作業", "PC"] },
  { id: "work:wifi", label: "Wi-Fiあり", category: "work", keywords: ["wifi"] },
  { id: "work:outlet", label: "電源あり", category: "work", keywords: ["電源", "コンセント"] },
  { id: "work:longstay", label: "長居しやすい", category: "work", keywords: ["長居"] },
  { id: "work:no", label: "作業向きではない", category: "work", keywords: ["作業不可"] },

  // ---- food ----
  { id: "food:meat", label: "肉", category: "food", keywords: ["肉", "焼肉", "ステーキ"] },
  { id: "food:seafood", label: "魚介", category: "food", keywords: ["魚", "寿司"] },
  { id: "food:noodle", label: "麺", category: "food", keywords: ["麺", "ラーメン", "そば", "うどん"] },
  { id: "food:spicy", label: "辛い/スパイス", category: "food", keywords: ["辛", "スパイス"] },
  { id: "food:veg", label: "野菜/ヘルシー", category: "food", keywords: ["野菜", "ヘルシー"] },
  { id: "food:sweets", label: "スイーツ", category: "food", keywords: ["甘", "スイーツ"] },
  { id: "food:bread", label: "パン", category: "food", keywords: ["パン"] },
  { id: "food:rice", label: "米/定食", category: "food", keywords: ["定食", "丼"] },

  // ---- drink ----
  { id: "drink:beer", label: "ビール", category: "drink", keywords: ["ビール"] },
  { id: "drink:wine", label: "ワイン", category: "drink", keywords: ["ワイン"] },
  { id: "drink:sake", label: "日本酒", category: "drink", keywords: ["日本酒"] },
  { id: "drink:cocktail", label: "カクテル", category: "drink", keywords: ["カクテル"] },
  { id: "drink:nonalcohol", label: "ノンアル充実", category: "drink", keywords: ["ノンアル"] },

  // ---- reservation / congestion ----
  { id: "resv:must", label: "予約必須", category: "reservation", exclusiveGroup: "reservation_policy", keywords: ["予約必須"] },
  { id: "resv:recommended", label: "予約推奨", category: "reservation", exclusiveGroup: "reservation_policy", keywords: ["予約推奨"] },
  { id: "resv:walkin", label: "予約なしでもOK", category: "reservation", exclusiveGroup: "reservation_policy", keywords: ["予約なし"] },
  { id: "resv:waitlist", label: "予約待ち", category: "reservation", keywords: ["待ち", "ウェイティング"] },
  { id: "resv:nobook", label: "予約不可", category: "reservation", exclusiveGroup: "reservation_policy", keywords: ["予約不可"] },
  { id: "cong:line", label: "並ぶ", category: "reservation", keywords: ["行列"] },
  { id: "cong:fast", label: "回転速い", category: "reservation", keywords: ["回転"] },
  { id: "cong:slow", label: "回転遅い", category: "reservation", keywords: ["回転"] },
  { id: "cong:late", label: "遅い時間も強い", category: "reservation", keywords: ["深夜"] },

  // ---- comfort ----
  { id: "seat:counter", label: "カウンター良い", category: "comfort", keywords: ["カウンター"] },
  { id: "seat:table", label: "テーブル中心", category: "comfort", keywords: ["テーブル"] },
  { id: "seat:private", label: "個室あり", category: "comfort", keywords: ["個室"] },
  { id: "seat:wide", label: "席広い", category: "comfort", keywords: ["広い"] },
  { id: "comfort:clean", label: "清潔", category: "comfort", keywords: ["清潔"] },

  // ---- service ----
  { id: "svc:kind", label: "接客よい", category: "service", keywords: ["接客"] },
  { id: "svc:fast", label: "提供速い", category: "service", keywords: ["提供"] },
  { id: "svc:slow", label: "提供ゆっくり", category: "service", keywords: ["提供"] },

  // ---- kids ----
  { id: "kids:ok", label: "子連れOK", category: "kids", keywords: ["子連れ"] },
  { id: "kids:stroller", label: "ベビーカーOK", category: "kids", keywords: ["ベビーカー"] },

  // ---- access ----
  { id: "acc:near", label: "駅近", category: "access", keywords: ["駅近"] },
  { id: "acc:far", label: "ちょい歩く", category: "access", keywords: ["歩く"] },

  // ---- payment ----
  { id: "pay:card", label: "カードOK", category: "payment", keywords: ["カード"] },
  { id: "pay:cashless", label: "キャッシュレス強い", category: "payment", keywords: ["paypay", "電子"] },
  { id: "pay:cash", label: "現金のみ", category: "payment", keywords: ["現金"] },

  // ---- budget ----
  { id: "budget:value", label: "コスパ良い", category: "budget", keywords: ["コスパ"] },
  { id: "budget:exp", label: "高いけど納得", category: "budget", keywords: ["高い"] },
  { id: "budget:cheap", label: "安い", category: "budget", keywords: ["安い"] },

  // ---- health ----
  { id: "health:vegok", label: "ベジ対応", category: "health", keywords: ["ベジ"] },
  { id: "health:allergy", label: "アレルギー配慮", category: "health", keywords: ["アレルギー"] },
  { id: "health:glutenfree", label: "グルテン配慮", category: "health", keywords: ["グルテン"] },
];

export function tagCategoryLabel(cat: TagCategory) {
  return TAG_CATEGORIES.find((x) => x.id === cat)?.label ?? cat;
}

export function findTagById(id: string) {
  return POST_TAGS.find((t) => t.id === id) ?? null;
}

export function normalizeForSearch(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function matchesTagQuery(tag: PostTag, q: string) {
  const qq = normalizeForSearch(q);
  if (!qq) return true;
  const hay = [
    tag.id,
    tag.label,
    ...(tag.keywords ?? []),
  ]
    .map(normalizeForSearch)
    .join(" ");
  return hay.includes(qq);
}