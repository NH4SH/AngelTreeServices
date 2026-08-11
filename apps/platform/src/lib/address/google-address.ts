export type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types: string[];
};

export type StructuredAddress = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  formattedAddress?: string;
};

export function parseGoogleAddressComponents(
  components: GoogleAddressComponent[] | undefined,
  formattedAddress?: string,
): StructuredAddress {
  const component = (type: string) => components?.find((item) => item.types.includes(type));
  const streetNumber = component("street_number")?.longText?.trim();
  const route = component("route")?.longText?.trim();
  const city = component("locality")?.longText?.trim() || component("postal_town")?.longText?.trim();
  const stateComponent = component("administrative_area_level_1");
  const state = stateComponent?.shortText?.trim() || stateComponent?.longText?.trim();
  const postalCode = component("postal_code")?.longText?.trim();
  const street = [streetNumber, route].filter(Boolean).join(" ");

  return {
    ...(street ? { street } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(formattedAddress?.trim() ? { formattedAddress: formattedAddress.trim() } : {}),
  };
}

