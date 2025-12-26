// src/lib/googleMaps.ts
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

type EnsureOpts = {
  apiKey: string;
  language?: string;
  region?: string;
  version?: string;
};

declare global {
  interface Window {
    __gmapsInitPromise?: Promise<void>;
    __gmapsOptionsSet?: boolean;
  }
}

export async function ensureGoogleMapsLoaded(opts: EnsureOpts): Promise<void> {
  if (typeof window === "undefined") return;

  // HMR/StrictMode でも setOptions が複数回呼ばれないように window に保持
  if (!window.__gmapsOptionsSet) {
    setOptions({
      key: opts.apiKey,
      v: opts.version ?? "weekly",
      language: opts.language ?? "ja",
      region: opts.region ?? "JP",
    });
    window.__gmapsOptionsSet = true;
  }

  if (!window.__gmapsInitPromise) {
    window.__gmapsInitPromise = (async () => {
      // 最低限 maps を読み込めば google.maps が利用可能になる
      await importLibrary("maps");
    })();
  }

  await window.__gmapsInitPromise;
}

export async function getMapsConstructors() {
  // maps / marker を importLibrary で読み込む（Loader は使わない）
  const mapsLib = (await importLibrary("maps")) as google.maps.MapsLibrary;
  const markerLib = (await importLibrary("marker")) as google.maps.MarkerLibrary;

  return {
    Map: mapsLib.Map,
    LatLngBounds: google.maps.LatLngBounds,
    InfoWindow: google.maps.InfoWindow,
    AdvancedMarkerElement: markerLib.AdvancedMarkerElement,
  };
}
