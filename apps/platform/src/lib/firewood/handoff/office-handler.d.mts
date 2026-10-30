export function officeUnavailable(): Response;
export function handleOfficeHandoff(request: Request, deps: {config: any; db: any; now?: () => number; parsePriceRequest?: (value: unknown) => any}): Promise<Response>;
