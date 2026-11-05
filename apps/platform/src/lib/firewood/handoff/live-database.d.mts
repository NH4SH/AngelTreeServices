export function liveDatabaseError(error: unknown): Error;
export function nativeLiveDatabase(pool: any): {call(name: string, args: Record<string, unknown>): Promise<any>};
export function supabaseLiveDatabase(client: any): {call(name: string, args: Record<string, unknown>): Promise<any>};
