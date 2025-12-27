// src/app/(app)/map/page.tsx
import SavedPlacesMapAI from "@/components/map/SavedPlacesMapAI";
import BackfillPlacesGeoButton from "@/components/admin/BackfillPlacesGeoButton";

export default function MapPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <BackfillPlacesGeoButton />
      <SavedPlacesMapAI />
    </main>
  );
}
