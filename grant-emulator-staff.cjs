const fs = require('node:fs');
const path = require('node:path');

const projectId = 'demo-desalu-resource-library';
const emulatorHost = '127.0.0.1:9099';
const email = process.argv[2];

if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== emulatorHost) {
    throw new Error(`Set FIREBASE_AUTH_EMULATOR_HOST=${emulatorHost} before running this script.`);
}

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Unset GOOGLE_APPLICATION_CREDENTIALS; this script is for local emulator use only.');
}

if (!email || !email.includes('@')) {
    throw new Error('Pass the email address of an existing disposable emulator account.');
}

const adminPackagePath = (process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => path.resolve(entry, '..', 'firebase-admin'))
    .find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));

if (!adminPackagePath) {
    throw new Error('Run this script through npx with the firebase-admin package available.');
}

const admin = require(adminPackagePath);
const app = admin.initializeApp({ projectId });
const auth = admin.auth(app);

auth.getUserByEmail(email)
    .then(async (user) => {
        await auth.setCustomUserClaims(user.uid, { ...user.customClaims, staff: true });
        console.log(`Granted staff: true to ${email} in the ${projectId} Auth emulator.`);
    })
    .catch((error) => {
        console.error('Could not grant emulator staff access.', error);
        process.exitCode = 1;
    })
    .finally(() => app.delete());
