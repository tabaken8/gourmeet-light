// app/(app)/map/page.tsx
import SavedPlacesMap from "@/components/SavedPlacesMap";

export default function MapPage() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-4">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">Map</h1>
          <p className="mt-1 text-sm text-black/60">
            コレクションに追加した場所が、ここにピンとして表示されます。
          </p>
        </div>

        <SavedPlacesMap />
      </div>
    </div>
  );
}
