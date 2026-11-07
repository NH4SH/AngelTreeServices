// Review metadata only. This cannot bind a runtime, key, database or sender.
import { OFFICE_CONTRACT, OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH } from './office-contract.mjs';
export const OFFICE_V2_REVIEW_PROFILE = Object.freeze({
  contract: OFFICE_CONTRACT, execution: 'isolated-office-v2-companion', namespace: 'fwofficev2_',
  paths: Object.freeze([OFFICE_PRICE_REQUEST_PATH, OFFICE_PRICE_STATUS_PATH, OFFICE_ORDER_STATUS_PATH]),
  enabled: false, liveOrdering: false, collectionEnabled: false, customerEmailEnabled: false, ownerEmailEnabled: false,
  database: null, transport: null, keyId: null, signingSecret: null, provider: null, sender: null,
  migrationFromOfficeV1: null,
});
