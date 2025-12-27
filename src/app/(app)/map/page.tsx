// src/app/(app)/map/page.tsx
import SavedPlacesMapAI from "@/components/map/SavedPlacesMapAI";

export default function MapPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <SavedPlacesMapAI />
    </main>
  );
}
