// App configuration. Change the agency name in Settings; these defaults are used before setup.
export const CONFIG = {
  APP_NAME: 'VisaFlow Pakistan',
  SHORT_NAME: 'VisaFlow',
  // Namespace for everything stored in the browser. Every app on the same origin must use its own id.
  APP_ID: 'visaflow',
  DB_NAME: 'visaflow_pk',
  APP_VERSION: '2.0.0',
  // IndexedDB schema version. Bump it when a store or index is added.
  SCHEMA_VERSION: 1,
  BACKUP_VERSION: 1,
  CURRENCY: 'PKR',
  // Login session length on this device. After it ends the owner signs in again with the local password.
  SESSION_HOURS: 12,
  PBKDF2_ITERATIONS: 210000,
  MAX_UPLOAD_MB: 15,
  // Images above this size are resized before storing to keep the device database small.
  IMAGE_MAX_SIDE: 1800,
};

// LocalStorage key inside this app's namespace, e.g. storageKey('session') -> 'visaflow.session'.
export const storageKey = (name) => `${CONFIG.APP_ID}.${name}`;
