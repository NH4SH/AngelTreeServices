import 'server-only';

// Deliberately no environment switch or credential loader. The current primary
// is not enrolled for this schema/profile. A future guarded installer must bind
// the reviewed release to real schema, key custody and fresh paired recovery
// evidence before installing a runtime dependency factory here.
export function getLiveHandoffDependencies(): null { return null; }
