// src/lib/optimisticPost.ts
// 投稿フォーム → タイムライン間のOptimistic UIステート
// モジュールレベル変数なのでNext.jsのソフトナビゲーションをまたいで生存する

export type OptimisticPostData = {
  tempId: string;
  coverSquareUrl: string;
  placeName: string;
  placeAddress: string;
  content: string;
  recommendScore: number;
  status: "saving" | "done" | "error";
};

let _data: OptimisticPostData | null = null;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

// ── beforeunload 警告（保存中のみ） ──
function _onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // 古いブラウザ向け
  e.returnValue = "";
}

function _updateBeforeUnload() {
  if (_data?.status === "saving") {
    window.addEventListener("beforeunload", _onBeforeUnload);
  } else {
    window.removeEventListener("beforeunload", _onBeforeUnload);
  }
}

export const optimisticPost = {
  get: (): OptimisticPostData | null => _data,

  set: (d: OptimisticPostData) => {
    _data = d;
    _updateBeforeUnload();
    _notify();
  },

  clear: () => {
    _data = null;
    _updateBeforeUnload();
    _notify();
  },

  markDone: () => {
    if (_data) {
      _data = { ..._data, status: "done" };
      _updateBeforeUnload();
      _notify();
    }
  },

  markError: () => {
    if (_data) {
      _data = { ..._data, status: "error" };
      _updateBeforeUnload();
      _notify();
    }
  },

  /** 現在保存中かどうか */
  isSaving: (): boolean => _data?.status === "saving",

  subscribe: (fn: () => void): (() => void) => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
