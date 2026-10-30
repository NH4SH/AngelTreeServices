export type LiveRuntimeMode = 'preparation' | 'status';
export type LiveRuntimeOperation = 'prepare' | 'renew' | 'status';
export type OfficeRuntimeOperation = 'price-request' | 'price-status' | 'order-status';
export type ProtectedHandoffDependencies = { config: any; db: { call(name: string, args: Record<string, unknown>): Promise<any> } };
export function classifyLiveHandoffRequest(request: Request): Readonly<{ mode: LiveRuntimeMode; operation: LiveRuntimeOperation }> | null;
export function classifyOfficeHandoffRequest(request: Request): OfficeRuntimeOperation | null;
export function getProtectedLiveDependencies(mode: LiveRuntimeMode, operation: LiveRuntimeOperation): ProtectedHandoffDependencies | null;
export function getProtectedOfficeDependencies(operation: OfficeRuntimeOperation): ProtectedHandoffDependencies | null;
