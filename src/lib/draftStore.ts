/**
 * IndexedDB ベースの下書きストア
 *
 * 画像 blob を含むフォーム全体をローカルに即時保存/復元する。
 * ネットワーク不要・一瞬で完了。X (Twitter) アプリと同じアプローチ。
 * 下書きは 1 件のみ保持（上書き）。
 */

const DB_NAME = "gourmeet_drafts";
const DB_VERSION = 1;
const STORE_NAME = "draft";
const DRAFT_KEY = "current";

// =====================
// types
// =====================

/** 画像 1 枚分（blob で保持） */
export type DraftImage = {
  id: string;
  pinBlob: Blob;
  squareBlob: Blob;
  fullBlob: Blob;
  previewBlob: Blob;       // square の blob（復元後に URL.createObjectURL する）
  label: string;
  origW: number;
  origH: number;
  exifDate: string | null;  // ISO string or null
};

/** 下書き全体 */
export type Draft = {
  content: string;
  images: DraftImage[];
  selectedPlace: {
    place_id: string;
    name: string;
    formatted_address: string;
  } | null;
  priceMode: "exact" | "range";
  priceYenText: string;
  priceRange: string;
  recommendSelected: boolean;
  recommendScore: number;
  visitedOn: string;
  timeOfDay: "day" | "night" | null;
  timeOfDayTouched: boolean;
  selectedTagIds: string[];
  savedAt: number;
};

// =====================
// DB helpers
// =====================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// =====================
// public API
// =====================

/** 下書きを保存（上書き）。画像 blob 含めて一瞬。 */
export async function saveDraft(draft: Draft): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(draft, DRAFT_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** 下書きを取得。なければ null。 */
export async function loadDraft(): Promise<Draft | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(DRAFT_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

/** 下書きがあるか（軽量チェック） */
export async function hasDraft(): Promise<boolean> {
  try {
    const draft = await loadDraft();
    return draft !== null;
  } catch {
    return false;
  }
}

/** 下書きを削除 */
export async function clearDraft(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(DRAFT_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}
