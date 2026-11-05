export function liveHandoffUnavailable(): Response;
export function readLiveHandoffBody(request: Request): Promise<string>;
export function isLiveHandoffConfiguration(config: unknown): boolean;
export function handleLiveHandoff(request: Request, deps: {config: any; db: any; now?: () => number; parsePrepare?: (value: unknown, options?: any) => any}): Promise<Response>;
