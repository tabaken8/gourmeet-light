// src/app/(app)/map/page.tsx
import SavedPlacesMap from "@/components/SavedPlacesMap";

export default function MapPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <SavedPlacesMap />
    </main>
  );
}
