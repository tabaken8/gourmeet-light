import { AMBIGUOUS_TOKENS, GENRE_SYNONYMS, GenreKey } from "./genreSynonyms";

export function detectGenreFromText(text: string): { key: GenreKey | null; confidence: number; matched: string[] } {
  const t = (text ?? "").trim();
  if (!t) return { key: null, confidence: 0, matched: [] };

  // “肉”単体みたいな誤爆を防ぐ
  const onlyAmbiguous =
    AMBIGUOUS_TOKENS.some((w) => t === w || t === `${w}屋` || t === `${w}食べたい`);
  if (onlyAmbiguous) return { key: null, confidence: 0.1, matched: [] };

  let best: { key: GenreKey | null; score: number; matched: string[] } = { key: null, score: 0, matched: [] };

  for (const [key, words] of Object.entries(GENRE_SYNONYMS) as Array<[GenreKey, string[]]>) {
    let score = 0;
    const matched: string[] = [];
    for (const w of words) {
      if (!w) continue;
      if (t.includes(w)) {
        score += w.length >= 3 ? 2 : 1; // 雑に強弱
        matched.push(w);
      }
    }
    if (score > best.score) best = { key, score, matched };
  }

  if (!best.key) return { key: null, confidence: 0, matched: [] };

  // スコア→確信度（雑でOK、後で調整）
  const conf = Math.min(0.95, 0.4 + best.score * 0.15);
  return { key: best.key, confidence: conf, matched: best.matched };
}
