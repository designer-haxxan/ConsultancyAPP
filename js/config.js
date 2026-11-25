// App configuration. Change the agency name in Settings; these defaults are used before setup.
export const CONFIG = {
  APP_NAME: 'VisaFlow Pakistan',
  SHORT_NAME: 'VisaFlow',
  // Namespace for everything stored in the browser. Every app on the same origin must use its own id.
  APP_ID: 'visaflow',
  DB_NAME: 'visaflow_pk',
  APP_VERSION: '2.1.0',
  // IndexedDB schema version. Bump it when a store or index is added.
  SCHEMA_VERSION: 1,
  BACKUP_VERSION: 1,
  CURRENCY: 'PKR',
  // Used when the sign-in API does not send an expiry. Otherwise the session ends when the server says.
  SESSION_HOURS: 12,
  // eposwala account API. It accepts requests only from allowed websites (pos.eposwala.com and
  // designer-haxxan.github.io). Sign-in from other addresses, such as localhost, is blocked by the browser.
  AUTH_API_BASE: 'https://eposwala.com/api',
  SUPPORT_PHONE: '0302-8863131',
  MAX_UPLOAD_MB: 15,
  // Images above this size are resized before storing to keep the device database small.
  IMAGE_MAX_SIDE: 1800,
};

// LocalStorage key inside this app's namespace, e.g. storageKey('session') -> 'visaflow.session'.
export const storageKey = (name) => `${CONFIG.APP_ID}.${name}`;
