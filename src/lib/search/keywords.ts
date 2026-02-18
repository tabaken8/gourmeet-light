// src/lib/search/keywords.ts

export type KeywordEntry = {
  canonical: string; // UI/DBの正規ジャンル名（日本語想定）
  aliases: string[]; // 入力揺れ（ひらがな/カタカナ/表記ゆれ等）
  priority?: number; // 同点のときの優先（大きいほど優先）
};

function norm(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\u3000/g, " ") // 全角スペース
    .replace(/\s+/g, " ");
}

/**
 * 運営が育てる “入力ゆれ” 辞書
 * - canonical は DB の primary_genre と一致しているのが理想（=網羅しやすい）
 * - ただし DB の canonical が増えるのはAPI側で吸収するので、ここは alias に集中でOK
 */
export const KEYWORDS: KeywordEntry[] = [
  { canonical: "焼肉", aliases: ["やきにく", "焼き肉", "ホルモン"], priority: 5 },
  { canonical: "寿司", aliases: ["すし", "鮨"], priority: 5 },
  { canonical: "ラーメン", aliases: ["らーめん", "拉麺", "中華そば"], priority: 5 },
  { canonical: "カフェ", aliases: ["喫茶", "喫茶店", "coffee", "caf\u00e9"], priority: 3 },
  { canonical: "居酒屋", aliases: ["いざかや", "飲み屋"], priority: 4 },
  { canonical: "イタリアン", aliases: ["いたりあん", "パスタ", "ピザ"], priority: 4 },
  { canonical: "中華", aliases: ["ちゅうか", "チャイナ", "中国料理"], priority: 4 },
  { canonical: "和食", aliases: ["わしょく", "日本食", "割烹", "定食"], priority: 3 },
  { canonical: "フレンチ", aliases: ["ふれんち", "ビストロ"], priority: 3 },
  { canonical: "バー", aliases: ["bar", "ばー"], priority: 2 },

  // 必要に応じて運営が追加していく
];

type MatchResult = {
  matched: string | null;  // canonical genre
  rest: string;            // genre部分を除いた残り（"焼肉 ひとり" -> "ひとり"）
};

/**
 * Enter/検索クリック時にだけ呼ぶ想定の “自動チップ化”。
 *
 * ルール（安全寄り）：
 * - 入力を空白で分割し、各トークンが genre/canonical/alias に一致したら変換候補
 * - 最も強い候補（長い一致 + priority）を採用
 * - マッチしたトークンだけ入力から取り除き、残りを rest として返す
 */
export function matchGenreFromInput(args: {
  input: string;
  availableGenres: string[]; // DBから取得した primary_genre（日本語）
}): MatchResult {
  const input = norm(args.input);
  if (!input) return { matched: null, rest: "" };

  const availableSet = new Set(args.availableGenres.map(norm).filter(Boolean));
  if (availableSet.size === 0) return { matched: null, rest: args.input.trim() };

  // 辞書（alias -> canonical）を作る
  const aliasToCanonical = new Map<string, { canonical: string; priority: number; len: number }>();
  for (const e of KEYWORDS) {
    const c = norm(e.canonical);
    const pr = e.priority ?? 0;

    // canonical 自体も入力一致対象に含める
    if (c) aliasToCanonical.set(c, { canonical: e.canonical, priority: pr, len: c.length });

    for (const a of e.aliases ?? []) {
      const na = norm(a);
      if (!na) continue;
      // 長いaliasを優先するため、同キーなら len が長い方を残す
      const prev = aliasToCanonical.get(na);
      const cur = { canonical: e.canonical, priority: pr, len: na.length };
      if (!prev || cur.len > prev.len || (cur.len === prev.len && cur.priority > prev.priority)) {
        aliasToCanonical.set(na, cur);
      }
    }
  }

  const rawTokens = input.split(" ").filter(Boolean);

  // 入力にスペースがない場合でも tokens は 1個になる
  // まず “トークン一致” のみを見る（IME事故回避）
  let best: { token: string; canonical: string; score: number } | null = null;

  for (const token of rawTokens) {
    const nt = norm(token);

    // まず DBに存在する canonical に直一致（辞書なしでもOK）
    if (availableSet.has(nt)) {
      const score = 1000 + nt.length; // DB直一致を最優先
      if (!best || score > best.score) best = { token, canonical: token, score };
    }

    // 次に alias 辞書で一致 → canonical が DB に存在するなら採用
    const hit = aliasToCanonical.get(nt);
    if (hit) {
      const cNorm = norm(hit.canonical);
      if (availableSet.has(cNorm)) {
        const score = 500 + hit.len * 10 + hit.priority; // aliasはDB直一致より弱い
        if (!best || score > best.score) best = { token, canonical: hit.canonical, score };
      }
    }
  }

  if (!best) return { matched: null, rest: args.input.trim() };

  // rest を作る：マッチした token を 1つだけ取り除く
  const restTokens = rawTokens.filter((t) => t !== best!.token);
  const rest = restTokens.join(" ").trim();

  return {
    matched: best.canonical,
    rest,
  };
}
