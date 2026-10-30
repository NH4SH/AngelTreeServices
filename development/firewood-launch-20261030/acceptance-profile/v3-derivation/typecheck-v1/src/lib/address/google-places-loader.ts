import type { GoogleAddressComponent } from "./google-address";

export type PlacePrediction = {
  mainText?: { text: string };
  secondaryText?: { text: string };
  text: { text: string };
  toPlace(): {
    addressComponents?: GoogleAddressComponent[];
    formattedAddress?: string;
    fetchFields(options: { fields: string[] }): Promise<void>;
  };
};

type AutocompleteSuggestion = { placePrediction?: PlacePrediction };

export type PlacesLibrary = {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      includedRegionCodes: string[];
      locationBias: { center: { lat: number; lng: number }; radius: number };
      region: string;
      sessionToken: unknown;
    }): Promise<{ suggestions: AutocompleteSuggestion[] }>;
  };
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      importLibrary?: (name: string) => Promise<unknown>;
    };
  };
  __angelTreeGoogleMapsReady?: () => void;
};

let placesLibraryPromise: Promise<PlacesLibrary> | null = null;

export function loadGooglePlacesLibrary(apiKey: string): Promise<PlacesLibrary> {
  if (placesLibraryPromise) return placesLibraryPromise;

  placesLibraryPromise = new Promise<void>((resolve, reject) => {
    const mapsWindow = window as GoogleMapsWindow;
    if (mapsWindow.google?.maps?.importLibrary) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-angel-tree-google-maps]");
    const timeout = window.setTimeout(() => {
      document.querySelector("script[data-angel-tree-google-maps]")?.remove();
      reject(new Error("Google Maps did not finish loading."));
    }, 12_000);
    mapsWindow.__angelTreeGoogleMapsReady = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    if (existingScript) {
      existingScript.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.angelTreeGoogleMaps = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly&callback=__angelTreeGoogleMapsReady`;
    script.addEventListener("error", () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error("Google Maps could not load."));
    }, { once: true });
    document.head.append(script);
  }).then(async () => {
    const importLibrary = (window as GoogleMapsWindow).google?.maps?.importLibrary;
    if (!importLibrary) throw new Error("Google Maps Places is unavailable.");
    return await importLibrary("places") as PlacesLibrary;
  }).catch((error) => {
    placesLibraryPromise = null;
    throw error;
  });

  return placesLibraryPromise;
}
