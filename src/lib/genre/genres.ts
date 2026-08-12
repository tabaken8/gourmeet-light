/**
 * Canonical genre definitions — single source of truth.
 *
 * Every component that needs genre data should import from here
 * instead of maintaining its own list.
 */

/* ------------------------------------------------------------------ */
/*  Structured genres (key + emoji + i18n key + fallback label)       */
/* ------------------------------------------------------------------ */

export type GenreDef = {
  key: string;
  emoji: string;
  labelKey: string; // i18n key, e.g. "genreRamen"
  label: string; // fallback Japanese label
};

export const GENRES: GenreDef[] = [
  { key: "ramen", emoji: "🍜", labelKey: "genreRamen", label: "ラーメン" },
  { key: "sushi", emoji: "🍣", labelKey: "genreSushi", label: "寿司" },
  { key: "yakiniku", emoji: "🥩", labelKey: "genreYakiniku", label: "焼肉" },
  { key: "izakaya", emoji: "🍺", labelKey: "genreIzakaya", label: "焼き鳥/居酒屋" },
  { key: "chinese", emoji: "🥟", labelKey: "genreChinese", label: "中華" },
  { key: "curry", emoji: "🍛", labelKey: "genreCurry", label: "カレー" },
  { key: "italian", emoji: "🍝", labelKey: "genreItalian", label: "イタリアン" },
  { key: "pizza", emoji: "🍕", labelKey: "genrePizza", label: "ピザ" },
  { key: "burger", emoji: "🍔", labelKey: "genreBurger", label: "バーガー" },
  { key: "cafe", emoji: "☕️", labelKey: "genreCafe", label: "カフェ" },
  { key: "sweets", emoji: "🍰", labelKey: "genreSweets", label: "スイーツ" },
  { key: "bar", emoji: "🍷", labelKey: "genreBar", label: "バー/酒" },
  { key: "other", emoji: "📍", labelKey: "genreOther", label: "その他" },
];

/* ------------------------------------------------------------------ */
/*  Convenience derived exports                                       */
/* ------------------------------------------------------------------ */

/** All structured genre keys, e.g. ["ramen", "sushi", …] */
export const GENRE_KEYS: string[] = GENRES.map((g) => g.key);

/** key → emoji lookup */
export const GENRE_EMOJI_MAP: Record<string, string> = Object.fromEntries(
  GENRES.map((g) => [g.key, g.emoji]),
);

/** emoji → label lookup */
export const GENRE_LABEL_BY_EMOJI: Record<string, string> = Object.fromEntries(
  GENRES.map((g) => [g.emoji, g.label]),
);

/* ------------------------------------------------------------------ */
/*  Genre vote labels (used by GenreVoteInline)                       */
/* ------------------------------------------------------------------ */

/** Default genre labels shown in the vote UI. */
export const DEFAULT_GENRE_LABELS: string[] = [
  "ラーメン",
  "寿司",
  "焼肉",
  "居酒屋",
  "カフェ",
  "喫茶店",
  "イタリアン",
  "フレンチ",
  "中華",
  "韓国料理",
  "カレー",
  "ハンバーガー",
  "そば",
  "うどん",
  "定食",
  "和食",
  "洋食",
  "スイーツ",
];

/* ------------------------------------------------------------------ */
/*  AI chat genre detection labels                                    */
/* ------------------------------------------------------------------ */

/** Genre labels used for text-matching in the AI chat search route. */
export const KNOWN_GENRE_LABELS: string[] = [
  "和食",
  "ラーメン",
  "カフェ",
  "イタリアン",
  "寿司",
  "焼肉",
  "中華",
  "フレンチ",
  "居酒屋",
  "韓国料理",
  "海鮮",
  "蕎麦",
  "うどん",
  "スイーツ",
  "焼き鳥",
  "天ぷら",
  "鍋",
  "とんかつ",
];
