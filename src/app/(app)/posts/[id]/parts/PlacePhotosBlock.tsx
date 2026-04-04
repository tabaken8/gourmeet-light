import PlacePhotoGallery from "@/components/PlacePhotoGallery";

export default async function PlacePhotosBlock({
  placeId,
  placeName,
  mapUrl,
}: {
  placeId: string;
  placeName: string | null;
  mapUrl: string | null;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium text-slate-700 dark:text-gray-300"></div>
        {mapUrl ? (
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-orange-700 dark:text-orange-400 hover:underline">
            Googleで開く
          </a>
        ) : null}
      </div>

      <div className="rounded-2xl border border-black/[.06] dark:border-white/[.08] bg-white/70 dark:bg-white/[.04] p-3">
        <PlacePhotoGallery placeId={placeId} placeName={placeName} per={8} maxThumbs={8} />
      </div>
    </div>
  );
}
