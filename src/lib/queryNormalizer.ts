// src/lib/queryNormalizer.ts
// クエリを正規化して構造化トークンに分解する。
// Fast path (DB index) で処理できるか、LLM が必要かを判定する。

// ---------- 辞書 ----------

/** ジャンル名一覧（検索 UI で使うカノニカル名） */
export const KNOWN_GENRES = new Set([
  "和食", "ラーメン", "カフェ", "イタリアン", "寿司", "焼肉", "中華",
  "フレンチ", "居酒屋", "韓国料理", "海鮮", "蕎麦", "うどん", "スイーツ",
  "焼き鳥", "天ぷら", "鍋", "とんかつ", "バー", "カレー", "パン", "ピザ",
  "タイ料理", "ベトナム料理", "ハンバーガー", "定食", "洋食", "そば",
  "喫茶店", "ビストロ", "鮨", "担々麺", "つけ麺", "油そば",
]);

/**
 * 助詞・接続助詞（トークン境界として扱い、除去する）
 * 長いものから先にマッチさせるためソート済み
 */
const PARTICLES = [
  "という", "っていう", "にある", "にある",
  "って", "から", "まで", "での", "での",
  "の", "で", "に", "は", "が", "を", "な", "と", "も", "へ",
];

/**
 * 装飾語（味・評判系。除去しても検索意図が変わらない）
 * 長いものから先にマッチさせる
 */
const DECORATIONS = [
  "美味しい", "おいしい", "おすすめ", "オススメ",
  "近くの", "付近の", "周辺の", "駅近の",
  "うまい", "旨い", "人気の", "人気", "有名な", "有名",
  "いい", "良い", "安い", "高い",
  "近く", "付近", "周辺", "駅近",
];

/**
 * メンション後の定型表現（除去してユーザー名だけ抽出する）
 * 長いものから先にマッチさせる
 */
const MENTION_TAILS = [
  "が紹介した", "が行ってた", "が行った",
  "のおすすめ", "の投稿", "の店",
];

/**
 * シーン・条件ワード（残っていたら自然言語 → AI path）
 * これらは「検索意図を変える修飾語」なので装飾語とは区別する
 */
const SCENE_WORDS = new Set([
  "デート", "デート向き", "接待", "一人飲み", "ひとり飲み", "子連れ",
  "女子会", "合コン", "記念日", "誕生日", "飲み会", "宴会",
  "ランチ", "ディナー", "モーニング", "深夜", "夜遅く",
  "コスパ", "雰囲気", "おしゃれ", "隠れ家", "個室",
  "食べ放題", "飲み放題", "テイクアウト", "テラス",
]);

// ---------- 正規化結果の型 ----------

export type NormalizedQuery = {
  /** Fast path で処理可能か */
  structured: boolean;
  /** 地名トークン (例: "新宿", "本郷三丁目") */
  locationToken: string | null;
  /** ジャンルトークン (例: "焼肉") */
  genreToken: string | null;
  /** メンションユーザー名 (例: "tanaka") — "@" は除去済み */
  mentionUser: string | null;
  /** LLM に渡すべき残テキスト (fast path なら null) */
  remainingText: string | null;
};

// ---------- メイン関数 ----------

/**
 * ユーザーの検索テキスト + ジャンルチップ選択を正規化し、
 * Fast path で処理できるかどうかを判定する。
 *
 * @param text  テキスト入力欄の値
 * @param chipGenre  ジャンルチップで選択中のジャンル（空文字 = 未選択）
 * @param extraGenres  動的に追加するジャンル名（API から取得したものなど）
 */
export function normalizeQuery(
  text: string,
  chipGenre: string = "",
  extraGenres: string[] = [],
): NormalizedQuery {
  const raw = text.trim();

  // ---- 空テキスト ----
  if (!raw && !chipGenre) {
    return empty();
  }
  // チップだけ選択（テキスト空）→ ジャンル単体 fast path
  if (!raw && chipGenre) {
    return {
      structured: true,
      locationToken: null,
      genreToken: chipGenre,
      mentionUser: null,
      remainingText: null,
    };
  }

  // ---- ジャンルセット構築 ----
  const genreSet = new Set(KNOWN_GENRES);
  for (const g of extraGenres) {
    if (g) genreSet.add(g);
  }

  // ---- @mention 抽出 ----
  let mentionUser: string | null = null;
  let working = raw;

  const mentionMatch = working.match(/^@(\w+)/);
  if (mentionMatch) {
    mentionUser = mentionMatch[1];
    working = working.slice(mentionMatch[0].length).trim();

    // メンション後の定型表現を除去
    for (const tail of MENTION_TAILS) {
      if (working.startsWith(tail)) {
        working = working.slice(tail.length).trim();
        break;
      }
    }
  }

  // ---- 装飾語を除去 ----
  for (const deco of DECORATIONS) {
    // 何度も出現しうるので繰り返し除去
    let safety = 3;
    while (working.includes(deco) && safety-- > 0) {
      working = working.replace(deco, " ");
    }
  }
  working = working.replace(/\s+/g, " ").trim();

  // ---- ジャンル名を先に最長一致で抽出 ----
  // 「とんかつ」の中の「と」を助詞として切らないように、
  // ジャンル名を先にマッチ → プレースホルダに置換 → 助詞分割 → 復元
  let extractedGenre: string | null = null;
  const sortedGenres = [...genreSet].sort((a, b) => b.length - a.length);
  for (const g of sortedGenres) {
    if (working.includes(g)) {
      extractedGenre = g;
      working = working.replace(g, " ").trim();
      break;
    }
  }

  // ---- 助詞で分割 ----
  let tokens: string[];
  if (working) {
    // まずスペースで分割
    const spaceSplit = working.split(/\s+/).filter(Boolean);
    // 各トークンを助詞で更に分割
    tokens = [];
    for (const seg of spaceSplit) {
      tokens.push(...splitByParticles(seg));
    }
  } else {
    tokens = [];
  }

  // ---- トークン分類 ----
  const genreToken = chipGenre || extractedGenre || null;
  let locationToken: string | null = null;
  const unmatched: string[] = [];

  for (const token of tokens) {
    if (!token) continue;

    // ジャンル名チェック（extractedGenre で取り逃した場合）
    if (!genreToken && genreSet.has(token)) {
      continue;
    }

    // シーン・条件ワード → 自然言語扱い（AI path 行き）
    if (SCENE_WORDS.has(token)) {
      unmatched.push(token);
      continue;
    }

    // 地名候補: 1〜8文字でジャンルでない
    if (token.length >= 1 && token.length <= 8 && !genreSet.has(token) && !locationToken) {
      locationToken = token;
    } else if (!genreSet.has(token)) {
      unmatched.push(token);
    }
  }

  // ---- 判定 ----
  // メンションのみ / メンション + ジャンル → fast path
  if (mentionUser) {
    // メンション後に未分類トークンが多ければ AI
    if (unmatched.length > 1) {
      return {
        structured: false,
        locationToken,
        genreToken,
        mentionUser,
        remainingText: raw,
      };
    }
    return {
      structured: true,
      locationToken,
      genreToken: genreToken || null,
      mentionUser,
      remainingText: null,
    };
  }

  // 未分類トークンがある → 自然言語 → AI path
  if (unmatched.length > 0) {
    return {
      structured: false,
      locationToken,
      genreToken,
      mentionUser: null,
      remainingText: raw,
    };
  }

  // 何もトークンが取れなかった
  if (!locationToken && !genreToken) {
    return empty();
  }

  return {
    structured: true,
    locationToken,
    genreToken,
    mentionUser: null,
    remainingText: null,
  };
}

// ---------- ヘルパー ----------

function empty(): NormalizedQuery {
  return {
    structured: false,
    locationToken: null,
    genreToken: null,
    mentionUser: null,
    remainingText: null,
  };
}

/**
 * テキストを助詞の位置で分割する。
 * 「本郷の焼肉」→ ["本郷", "焼肉"]
 * 「渋谷で」→ ["渋谷"]
 *
 * 1文字の助詞が単語内部にマッチするのを防ぐため、
 * 長い助詞から順に処理し、分割結果が2文字未満のトークンは無視する。
 */
function splitByParticles(text: string): string[] {
  if (!text) return [];

  let segments = [text];

  for (const p of PARTICLES) {
    const next: string[] = [];
    for (const seg of segments) {
      if (seg.length <= p.length) {
        // セグメントが助詞と同じかそれより短い → 分割しない
        next.push(seg);
        continue;
      }

      // 助詞で分割（ただし先頭・末尾のみ、の場合は内部でも分割）
      const parts = seg.split(p);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) next.push(trimmed);
      }
    }
    segments = next;
  }

  return segments;
}
