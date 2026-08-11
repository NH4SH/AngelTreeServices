"use client";

import { LoaderCircle, MapPin } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { parseGoogleAddressComponents, type StructuredAddress } from "@/lib/address/google-address";
import { loadGooglePlacesLibrary, type PlacePrediction, type PlacesLibrary } from "@/lib/address/google-places-loader";

type AddressFieldNames = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
};

type AddressFieldValues = Partial<StructuredAddress>;

type AddressFieldRequirements = Partial<Record<keyof AddressFieldNames, boolean>>;

type PopupPosition = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
const FREDERICKSBURG_BIAS = {
  center: { lat: 38.3032, lng: -77.4605 },
  radius: 100_000,
};

export function StructuredAddressFields({
  className = "",
  defaultValues = {},
  names,
  required = {},
  streetLabel = "Street address",
}: {
  className?: string;
  defaultValues?: AddressFieldValues;
  names: AddressFieldNames;
  required?: AddressFieldRequirements;
  streetLabel?: string;
}) {
  const [values, setValues] = useState({
    street: defaultValues.street ?? "",
    city: defaultValues.city ?? "",
    state: defaultValues.state ?? "",
    postalCode: defaultValues.postalCode ?? "",
  });

  return (
    <div className={`crm-structured-address ${className}`.trim()}>
      <AddressAutocompleteInput
        name={names.street}
        onAddressSelected={(address) => setValues((current) => ({
          street: address.street || current.street,
          city: address.city || current.city,
          state: address.state || current.state,
          postalCode: address.postalCode || current.postalCode,
        }))}
        onChange={(street) => setValues((current) => ({ ...current, street }))}
        required={required.street}
        streetLabel={streetLabel}
        value={values.street}
      />
      <div className="form-grid-three crm-address-locality-fields">
        <label>
          City
          <input
            autoComplete="address-level2"
            name={names.city}
            onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))}
            placeholder="City"
            required={required.city}
            value={values.city}
          />
        </label>
        <label>
          State
          <input
            autoCapitalize="characters"
            autoComplete="address-level1"
            maxLength={2}
            name={names.state}
            onChange={(event) => setValues((current) => ({ ...current, state: event.target.value }))}
            placeholder="VA"
            required={required.state}
            value={values.state}
          />
        </label>
        <label>
          ZIP
          <input
            autoComplete="postal-code"
            inputMode="numeric"
            name={names.postalCode}
            onChange={(event) => setValues((current) => ({ ...current, postalCode: event.target.value }))}
            placeholder="ZIP"
            required={required.postalCode}
            value={values.postalCode}
          />
        </label>
      </div>
    </div>
  );
}

function AddressAutocompleteInput({
  name,
  onAddressSelected,
  onChange,
  required,
  streetLabel,
  value,
}: {
  name: string;
  onAddressSelected(address: StructuredAddress): void;
  onChange(value: string): void;
  required?: boolean;
  streetLabel: string;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const libraryRef = useRef<PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<unknown>(null);
  const requestIdRef = useRef(0);
  const suppressNextSearchRef = useRef(false);
  const listboxId = `${useId().replaceAll(":", "")}-address-suggestions`;
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [focused, setFocused] = useState(false);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);
  const canSuggest = Boolean(GOOGLE_MAPS_API_KEY);
  const open = focused && value.trim().length >= 3 && (loading || suggestions.length > 0);

  useEffect(() => {
    if (!canSuggest || value.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    const requestId = ++requestIdRef.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const library = libraryRef.current ?? await loadGooglePlacesLibrary(GOOGLE_MAPS_API_KEY);
        libraryRef.current = library;
        sessionTokenRef.current ??= new library.AutocompleteSessionToken();
        const response = await library.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value.trim(),
          includedRegionCodes: ["us"],
          locationBias: FREDERICKSBURG_BIAS,
          region: "us",
          sessionToken: sessionTokenRef.current,
        });
        if (requestId !== requestIdRef.current) return;
        setSuggestions(response.suggestions.flatMap((suggestion) => suggestion.placePrediction ? [suggestion.placePrediction] : []));
        setActiveIndex(-1);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setSuggestions([]);
        setError(true);
        sessionTokenRef.current = null;
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [canSuggest, value]);

  useEffect(() => {
    if (!open) {
      setPopupPosition(null);
      return;
    }

    const positionPopup = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const margin = 10;
      const gap = 6;
      const availableBelow = window.innerHeight - rect.bottom - margin;
      const availableAbove = rect.top - margin;
      const openAbove = availableBelow < 180 && availableAbove > availableBelow;
      const width = Math.min(rect.width, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
      setPopupPosition(openAbove
        ? { bottom: window.innerHeight - rect.top + gap, left, maxHeight: Math.max(120, availableAbove - gap), width }
        : { top: rect.bottom + gap, left, maxHeight: Math.max(120, availableBelow - gap), width });
    };

    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
    };
  }, [open]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!inputRef.current?.contains(target) && !popupRef.current?.contains(target)) setFocused(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  async function selectPrediction(prediction: PlacePrediction) {
    setLoading(true);
    setSuggestions([]);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["addressComponents", "formattedAddress"] });
      const address = parseGoogleAddressComponents(place.addressComponents, place.formattedAddress);
      suppressNextSearchRef.current = Boolean(address.street && address.street !== value);
      onAddressSelected(address);
      setError(false);
      setFocused(false);
    } catch {
      setError(true);
    } finally {
      sessionTokenRef.current = null;
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setFocused(false);
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void selectPrediction(suggestions[activeIndex]);
    }
  }

  const popup = open && popupPosition ? createPortal(
    <div
      className="crm-address-suggestions"
      id={listboxId}
      ref={popupRef}
      role="listbox"
      style={popupPosition}
    >
      {loading && suggestions.length === 0 ? (
        <div className="crm-address-loading" role="status"><LoaderCircle aria-hidden="true" size={16} />Finding addresses...</div>
      ) : suggestions.map((prediction, index) => (
        <button
          aria-selected={index === activeIndex}
          className={index === activeIndex ? "crm-address-suggestion is-active" : "crm-address-suggestion"}
          id={`${listboxId}-${index}`}
          key={`${prediction.text.text}-${index}`}
          onClick={() => void selectPrediction(prediction)}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          role="option"
          type="button"
        >
          <MapPin aria-hidden="true" size={17} />
          <span>
            <strong>{prediction.mainText?.text || prediction.text.text}</strong>
            {prediction.secondaryText?.text ? <small>{prediction.secondaryText.text}</small> : null}
          </span>
        </button>
      ))}
      {suggestions.length > 0 ? (
        <div className="crm-address-attribution" aria-label="Powered by Google">
          {/* Google requires its supplied attribution when predictions are shown without a map. */}
          <img
            alt="Powered by Google"
            height="14"
            src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
            width="120"
          />
        </div>
      ) : null}
    </div>,
    document.body,
  ) : null;

  return (
    <label className="crm-address-street-field">
      {streetLabel}
      <input
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        autoComplete="address-line1"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder="Start typing a street address"
        ref={inputRef}
        required={required}
        role="combobox"
        value={value}
      />
      {error ? <small className="crm-address-status" role="status">Suggestions unavailable. Continue entering the address manually.</small> : null}
      {popup}
    </label>
  );
}
