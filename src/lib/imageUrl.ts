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
 *
 * 入力が /object/public/ でも /render/image/public/?width=540... でも
 * 必ず指定の width/quality で正規化して返す。
 */

const OBJECT_MARKER = "/storage/v1/object/public/";
const RENDER_MARKER = "/storage/v1/render/image/public/";

function supabaseTransform(
  src: string,
  width: number,
  quality: number,
): string {
  if (!src) return src;
  if (src.startsWith("blob:")) return src;

  let base: string;
  let path: string;

  const renderIdx = src.indexOf(RENDER_MARKER);
  if (renderIdx !== -1) {
    base = src.slice(0, renderIdx);
    path = src.slice(renderIdx + RENDER_MARKER.length);
  } else {
    const objectIdx = src.indexOf(OBJECT_MARKER);
    if (objectIdx === -1) return src;
    base = src.slice(0, objectIdx);
    path = src.slice(objectIdx + OBJECT_MARKER.length);
  }

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
