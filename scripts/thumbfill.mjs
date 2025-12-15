import "dotenv/config";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

// ---- env ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = process.env.BUCKET || "post-images";
const THUMB_MAX = Number(process.env.THUMB_MAX || 1600);
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY || 92);
const WEBP_EFFORT = Math.min(Math.max(Number(process.env.WEBP_EFFORT || 5), 0), 6);
const BATCH = Math.min(Number(process.env.BATCH || 50), 200);
const CONCURRENCY = Math.min(Number(process.env.CONCURRENCY || 2), 6);
const FORCE_REGEN = (process.env.FORCE_REGEN || "0") === "1";

// ★キャッシュ回避のためのタグ（ここを変えると別ファイル名になる）
const THUMB_TAG = (process.env.THUMB_TAG || "v3").replace(/[^a-zA-Z0-9_-]/g, "");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です (.env.thumbfill)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractStoragePathFromPublicUrl(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

// foo.jpg -> foo_thumb_v3.webp（タグ付きで別名生成）
function makeThumbPath(originalPath) {
  const dir = path.posix.dirname(originalPath);
  const base = path.posix.basename(originalPath).replace(/\.[^.]+$/, "");
  return path.posix.join(dir, `${base}_thumb_${THUMB_TAG}.webp`);
}

function needsWork(post) {
  const urls = Array.isArray(post.image_urls) ? post.image_urls : [];
  if (urls.length === 0) return false;

  if (FORCE_REGEN) return true;

  const vars = Array.isArray(post.image_variants) ? post.image_variants : [];
  if (vars.length === 0) return true;

  // thumb が「現タグ」じゃないなら作り直す
  for (let i = 0; i < urls.length; i++) {
    const v = vars[i];
    if (!v || !v.thumb) return true;
    if (typeof v.thumb === "string" && !v.thumb.includes(`_thumb_${THUMB_TAG}.webp`)) return true;
  }
  return false;
}

async function downloadAsBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function toThumbWebp(buf) {
  return await sharp(buf, { failOn: "none" })
    .rotate()
    .resize({
      width: THUMB_MAX,
      height: THUMB_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: WEBP_QUALITY,
      effort: WEBP_EFFORT,
      smartSubsample: true,
    })
    .toBuffer();
}

async function uploadThumb(thumbPath, webpBuffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(thumbPath, webpBuffer, {
    contentType: "image/webp",
    // ★キャッシュは短め推奨（あとで長くしてもOK）
    cacheControl: "86400", // 1日
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(thumbPath);
  return data.publicUrl;
}

function mergeVariants(image_urls, image_variants, thumbUrlsByIndex) {
  const urls = Array.isArray(image_urls) ? image_urls : [];
  const old = Array.isArray(image_variants) ? image_variants : [];

  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const full = urls[i];
    const prev = old[i] || {};
    out.push({
      full: prev.full ?? full,
      thumb: thumbUrlsByIndex[i] ?? prev.thumb ?? null,
    });
  }
  return out;
}

async function pMap(items, worker, concurrency) {
  const ret = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return ret;
}

async function main() {
  console.log("🚀 thumbfill start");
  console.log({
    BUCKET,
    THUMB_MAX,
    WEBP_QUALITY,
    WEBP_EFFORT,
    THUMB_TAG,
    BATCH,
    CONCURRENCY,
    FORCE_REGEN,
  });

  let offset = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("posts")
      .select("id, created_at, image_urls, image_variants")
      .order("created_at", { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!rows || rows.length === 0) break;

    const targets = rows.filter(needsWork);
    console.log(`📦 batch offset=${offset} fetched=${rows.length} targets=${targets.length}`);

    await pMap(
      targets,
      async (post) => {
        const urls = Array.isArray(post.image_urls) ? post.image_urls : [];
        const vars = Array.isArray(post.image_variants) ? post.image_variants : [];

        const thumbUrlsByIndex = {};

        for (let i = 0; i < urls.length; i++) {
          const fullUrl = urls[i];
          const storagePath = extractStoragePathFromPublicUrl(fullUrl);
          if (!storagePath) {
            console.log(`⚠️ skip (not public url): post=${post.id} url=${fullUrl}`);
            totalSkipped++;
            continue;
          }

          // 既存thumbが「現タグ」ならスキップ（FORCE_REGEN=1なら作り直し）
          const existing = vars?.[i]?.thumb;
          const alreadyThisTag =
            typeof existing === "string" && existing.includes(`_thumb_${THUMB_TAG}.webp`);
          if (alreadyThisTag && !FORCE_REGEN) continue;

          const thumbPath = makeThumbPath(storagePath);

          try {
            const buf = await downloadAsBuffer(fullUrl);
            const webp = await toThumbWebp(buf);
            const thumbUrl = await uploadThumb(thumbPath, webp);
            thumbUrlsByIndex[i] = thumbUrl;
            console.log(`✅ thumb ok post=${post.id} i=${i}`);
          } catch (e) {
            console.log(`⚠️ thumb failed post=${post.id} i=${i} err=${e?.message ?? e}`);
            totalSkipped++;
          }

          await sleep(20);
        }

        const newVariants = mergeVariants(urls, vars, thumbUrlsByIndex);
        const before = JSON.stringify(vars ?? null);
        const after = JSON.stringify(newVariants ?? null);
        if (before === after) return;

        const { error: upErr } = await supabase
          .from("posts")
          .update({ image_variants: newVariants })
          .eq("id", post.id);

        if (upErr) {
          console.log(`❌ update failed post=${post.id} err=${upErr.message}`);
          totalSkipped++;
          return;
        }

        totalUpdated++;
      },
      CONCURRENCY
    );

    offset += BATCH;
  }

  console.log("🎉 done", { totalUpdated, totalSkipped });
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});
