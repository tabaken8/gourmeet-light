/**
 * Supabase Storage Image Transforms を使って画像を軽量化する
 *
 * Supabase Pro Plan の機能:
 *   /storage/v1/object/public/... → /storage/v1/render/image/public/...
 *   + ?width=540&resize=contain&quality=75
 *
 * CDN キャッシュされるので 2 回目以降は即配信。
 *
 * - タイムライン: 540px, q=75（Retina 2x で十分）
 * - マップカード: 400px, q=70
 * - 詳細ページ : 元 URL そのまま（1080px square）
 */

function supabaseTransform(
  src: string,
  width: number,
  quality: number,
): string {
  if (!src) return src;
  // blob URL はそのまま（optimistic post 用）
  if (src.startsWith("blob:")) return src;

  // Supabase Storage URL かどうか判定
  // 例: https://xxx.supabase.co/storage/v1/object/public/post-images/...
  const marker = "/storage/v1/object/public/";
  const idx = src.indexOf(marker);
  if (idx === -1) return src; // Supabase 以外の URL はそのまま

  // /object/ → /render/image/ に差し替え
  const base = src.slice(0, idx);
  const path = src.slice(idx + marker.length);

  // パスに既存のクエリパラメータがあれば除去
  const cleanPath = path.split("?")[0];

  return `${base}/storage/v1/render/image/public/${cleanPath}?width=${width}&resize=contain&quality=${quality}`;
}

/** タイムライン用: 540px にリサイズ */
export function timelineImageUrl(src: string, width = 540): string {
  return supabaseTransform(src, width, 75);
}

/** 詳細ページ用: 元の URL をそのまま返す */
export function detailImageUrl(src: string): string {
  return src;
}
