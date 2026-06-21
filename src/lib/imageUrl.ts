/**
 * Supabase Storage Image Transforms を使って画像を軽量化する
 *
 * Supabase Pro Plan の機能:
 *   /storage/v1/object/public/... → /storage/v1/render/image/public/...
 *   + ?width=1080&resize=contain&quality=82
 *
 * CDN キャッシュされるので 2 回目以降は即配信。
 *
 * - タイムライン: 1080px, q=82（Retina 端末でも鮮明）
 * - マップカード: 400px, q=70
 * - 詳細ページ : 元 URL そのまま
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

/** タイムライン用: 1080px にリサイズ（Retina 端末でも鮮明） */
export function timelineImageUrl(src: string, width = 1080): string {
  return supabaseTransform(src, width, 82);
}

/** 詳細ページ用: 元の URL をそのまま返す */
export function detailImageUrl(src: string): string {
  return src;
}
