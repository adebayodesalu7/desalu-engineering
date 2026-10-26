// Copy this configuration from Firebase Console > Project settings > Your apps.
// Firebase web config is public client configuration; never put service-account keys here.
export const firebaseConfig = {
    apiKey: 'AIzaSyCJi2H0uBEHE7SFOitPH-a0VZzycup3nRA',
    authDomain: 'signup-5c807.firebaseapp.com',
    projectId: 'signup-5c807',
    appId: '1:17248194756:web:5ff57af82b2cefee787991',
    recaptchaEnterpriseSiteKey: '6LdfIv8tAAAAACxXpAUcu1diZfEVfy-tKVmtovpr', // Optional, only needed for App Check
};

export function isFirebaseConfigured(config) {
    return ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) =>
        typeof config[key] === 'string' && config[key].length > 0 && !config[key].startsWith('YOUR_')
    );
}

export function isAppCheckConfigured(config) {
    return typeof config.recaptchaEnterpriseSiteKey === 'string'
        && config.recaptchaEnterpriseSiteKey.length > 0
        && !config.recaptchaEnterpriseSiteKey.startsWith('YOUR_');
}