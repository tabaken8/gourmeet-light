// src/lib/genre/genreGraph.ts
// ジャンルの関連グラフ: 検索時に「和食」→ 寿司・鍋・蕎麦 等もヒットさせる

/**
 * 各ジャンルに対して「検索時に含めるべき関連ジャンル」を定義。
 * 双方向ではなく、検索クエリ→ヒット対象 の方向で定義する。
 * 例: "和食" で検索 → 寿司、鍋、蕎麦、うどん、天ぷら… もヒットする
 *      "寿司" で検索 → 寿司のみ（和食全体は出さない）
 */
const GENRE_GRAPH: Record<string, string[]> = {
  // 上位カテゴリ → 下位ジャンル
  和食: ["寿司", "鮨", "蕎麦", "うどん", "天ぷら", "鍋", "おでん", "割烹", "懐石", "定食", "とんかつ", "丼もの", "お好み焼き", "たこ焼き", "串揚げ"],
  中華: ["中華料理", "餃子", "点心", "火鍋", "台湾料理", "四川料理", "麻婆", "小籠包"],
  イタリアン: ["パスタ", "ピザ", "ピッツァ", "トラットリア", "リストランテ"],
  フレンチ: ["ビストロ", "ブラッスリー"],
  韓国料理: ["韓国", "チゲ", "サムギョプサル", "ビビンバ"],
  ラーメン: ["二郎系ラーメン", "つけ麺", "油そば", "中華そば", "台湾まぜそば", "担々麺"],
  カフェ: ["喫茶", "喫茶店", "コーヒー", "紅茶", "ティー"],
  居酒屋: ["焼き鳥", "焼鳥", "串焼き", "立ち飲み", "もつ焼き"],
  スイーツ: ["ケーキ", "パフェ", "和菓子", "甘味処", "アイス", "ドーナツ", "チョコレート"],
  焼肉: ["ホルモン", "ジンギスカン"],
  海鮮: ["寿司", "鮨", "刺身", "海鮮丼", "魚介"],

  // 同レベルの近いジャンル（片方向）
  蕎麦: ["そば"],
  そば: ["蕎麦"],
  鮨: ["寿司"],
};

/**
 * 検索ジャンルに対して、ヒットさせるべき全ジャンル名のセットを返す。
 * 自身も含む。
 *
 * 例: expandGenre("和食") → Set{"和食", "寿司", "鮨", "蕎麦", "そば", "うどん", ...}
 *     expandGenre("寿司") → Set{"寿司"}（上位には展開しない）
 */
export function expandGenre(genre: string): Set<string> {
  const result = new Set<string>();
  result.add(genre);

  const related = GENRE_GRAPH[genre];
  if (related) {
    for (const r of related) {
      result.add(r);
    }
  }

  return result;
}

/**
 * place_genre が検索ジャンルに合致するか判定。
 * expandGenre で展開した上で完全一致チェック。
 * 部分一致（"台湾まぜそば" ⊃ "そば"）による偽陽性を防ぐため、
 * 完全一致 or place_genre が展開ジャンルで始まる/終わる場合のみマッチ。
 */
export function matchesGenre(searchGenre: string, placeGenre: string | null | undefined): boolean {
  if (!placeGenre) return false;
  const pgLower = placeGenre.toLowerCase().trim();
  const expanded = expandGenre(searchGenre);

  for (const g of expanded) {
    const gLower = g.toLowerCase().trim();
    // 完全一致
    if (pgLower === gLower) return true;
    // place_genre が展開ジャンルのサブカテゴリ ("二郎系ラーメン" → "ラーメン"で検索)
    // → place_genre が展開ジャンルを「末尾に含む」場合のみ (e.g. "二郎系ラーメン" ends with "ラーメン")
    if (gLower.length >= 2 && pgLower.endsWith(gLower)) return true;
    // 展開ジャンルが place_genre を含む場合 (e.g. 展開に"焼き鳥"があり place_genre="焼鳥")
    if (pgLower.length >= 2 && gLower.endsWith(pgLower)) return true;
  }
  return false;
}
