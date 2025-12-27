export type GenreKey =
  | "yakiniku"
  | "ramen"
  | "sushi"
  | "izakaya"
  | "cafe"
  | "bar"
  | "italian"
  | "chinese"
  | "curry"
  | "burger"
  | "sweets"
  | "other";

export const GENRE_SYNONYMS: Record<GenreKey, string[]> = {
  yakiniku: ["焼肉", "焼き肉", "ヤキニク", "ホルモン", "タン", "カルビ", "ハラミ", "七輪", "網焼", "炭火"],
  ramen: ["ラーメン", "らーめん", "中華そば", "つけ麺", "油そば", "二郎", "家系"],
  sushi: ["寿司", "鮨", "すし"],
  izakaya: ["居酒屋", "焼き鳥", "焼鳥", "串焼", "立ち飲み"],
  cafe: ["カフェ", "喫茶", "コーヒー", "珈琲"],
  bar: ["バー", "ワイン", "wine", "ビストロ", "バル"],
  italian: ["イタリアン", "パスタ", "ピッツァ", "pizza"],
  chinese: ["中華", "餃子", "点心", "麻婆", "火鍋"],
  curry: ["カレー", "咖喱", "スパイスカレー"],
  burger: ["バーガー", "ハンバーガー"],
  sweets: ["スイーツ", "ケーキ", "パフェ", "和菓子", "甘味"],
  other: [],
};

// 危険語（単独だと誤爆するやつ）
export const AMBIGUOUS_TOKENS = ["肉"]; // “肉”単体はジャンル確定しない
