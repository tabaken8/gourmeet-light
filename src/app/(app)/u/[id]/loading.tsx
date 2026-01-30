export default function Loading() {
  return (
    <div className="min-h-[40vh] w-full grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-black/10 border-t-black/70" />
        <div className="text-sm font-semibold text-slate-600">読み込み中…</div>
      </div>
    </div>
  );
}
