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

export const optimisticPost = {
  get: (): OptimisticPostData | null => _data,

  set: (d: OptimisticPostData) => {
    _data = d;
    _notify();
  },

  clear: () => {
    _data = null;
    _notify();
  },

  markDone: () => {
    if (_data) {
      _data = { ..._data, status: "done" };
      _notify();
    }
  },

  markError: () => {
    if (_data) {
      _data = { ..._data, status: "error" };
      _notify();
    }
  },

  subscribe: (fn: () => void): (() => void) => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
