import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app-check.js';
import { connectAuthEmulator, getAuth } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import { connectFirestoreEmulator, getFirestore } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';
import { connectStorageEmulator, getStorage } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js';
import { firebaseConfig, isAppCheckConfigured, isFirebaseConfigured } from './firebase-config.js';

export let firebaseApp = null;
export let auth = null;
export let firestore = null;
export let storage = null;
export const isFirebaseEmulator = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    && ['3000', '8765'].includes(window.location.port);

function showEmulatorNotice() {
    if (document.querySelector('.firebase-emulator-notice')) return;

    const notice = document.createElement('div');
    notice.className = 'firebase-emulator-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = 'LOCAL TEST MODE — Firebase Auth, Firestore, and Storage use local emulators. No cloud data is changed.';
    Object.assign(notice.style, {
        position: 'fixed',
        inset: '0 0 auto',
        zIndex: '10000',
        padding: '0.65rem 1rem',
        background: '#fff4c2',
        color: '#332600',
        borderBottom: '1px solid #c99b22',
        font: '600 0.875rem/1.4 system-ui, sans-serif',
        textAlign: 'center'
    });
    document.body.prepend(notice);
}

if (isFirebaseConfigured(firebaseConfig) && (isFirebaseEmulator || isAppCheckConfigured(firebaseConfig))) {
    try {
        const localConfig = isFirebaseEmulator
            ? {
                ...firebaseConfig,
                apiKey: 'demo-api-key',
                authDomain: 'localhost',
                projectId: 'demo-desalu-resource-library',
                appId: 'demo-desalu-resource-library',
                storageBucket: 'demo-desalu-resource-library.appspot.com'
            }
            : firebaseConfig;
        firebaseApp = initializeApp(localConfig);
        auth = getAuth(firebaseApp);
        firestore = getFirestore(firebaseApp);
        storage = getStorage(firebaseApp);

        if (isFirebaseEmulator) {
            connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
            connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
            connectStorageEmulator(storage, '127.0.0.1', 9199);
            showEmulatorNotice();
        } else {
            initializeAppCheck(firebaseApp, {
                provider: new ReCaptchaEnterpriseProvider(firebaseConfig.recaptchaEnterpriseSiteKey),
                isTokenAutoRefreshEnabled: true
            });
        }
    } catch (error) {
        console.error('Could not initialize Firebase for public features.', error);
    }
}
