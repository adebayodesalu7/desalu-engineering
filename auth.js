import { supabase } from './supabase-client.js';
import { isSupabaseConfigured } from './supabase-config.js';
import { onAuthStateChanged } from './supabase-auth.js';

const authView = document.querySelector('#auth-view');
const accountView = document.querySelector('#account-view');
const authHeading = document.querySelector('#auth-heading');
const authIntro = document.querySelector('#auth-intro');
const authMessage = document.querySelector('#auth-message');
const accountEmail = document.querySelector('#account-email');
const accountMessage = document.querySelector('#account-message');
const signInForm = document.querySelector('#signin-panel');
const signUpForm = document.querySelector('#signup-panel');
const resetPasswordForm = document.querySelector('#reset-password-panel');
const authTabs = document.querySelector('.tabs');
const resetPasswordButton = document.querySelector('#reset-password');
const signOutButton = document.querySelector('#signout-button');
const authSignOutButton = document.querySelector('#auth-signout');
const mfaPanel = document.querySelector('#staff-mfa-panel');
const mfaTitle = document.querySelector('#staff-mfa-title');
const mfaInstructions = document.querySelector('#staff-mfa-instructions');
const mfaQr = document.querySelector('#staff-mfa-qr');
const mfaSecretRow = document.querySelector('#staff-mfa-secret-row');
const mfaSecret = document.querySelector('#staff-mfa-secret');
const mfaCodeForm = document.querySelector('#staff-mfa-code-form');
const mfaCodeInput = document.querySelector('#staff-mfa-code');
const mfaSubmitLabel = document.querySelector('#staff-mfa-submit-label');
const mfaRestartButton = document.querySelector('#staff-mfa-restart');
const mfaRetryButton = document.querySelector('#staff-mfa-retry');
const mfaMessage = document.querySelector('#staff-mfa-message');
const submitButtons = document.querySelectorAll('.auth-form .submit-button');
const returnTo = new URLSearchParams(window.location.search).get('returnTo');
const resourceId = new URLSearchParams(window.location.search).get('resourceId');
const requestedPlatform = new URLSearchParams(window.location.search).get('platform');
const returnPaths = {
    planner: 'index.html#planner',
    library: 'resources.html',
    resourceAdmin: 'admin-resources.html',
    resourceDetail: 'resource-detail.html',
    adminDashboard: 'admin-dashboard.html',
    adminInquiries: 'admin.html',
    adminPublishing: 'admin-resources.html',
    adminResources: 'admin-library.html',
    adminReview: 'admin-review.html',
    adminPublish: 'admin-publish.html'
};
let passwordRecoveryActive = false;
let activeUserId = null;
let activeFactorId = '';
let activeChallengeId = '';
let activeMfaMode = '';
let activeUser = null;
let securityCheckPending = false;
let formActionPending = false;

function showMessage(element, message, kind = '') {
    element.textContent = message;
    element.dataset.kind = kind;
}

function authErrorMessage(error) {
    if (!error?.code && error?.message) return error.message;
    const messages = {
        invalid_credentials: 'That email and password combination was not recognized.',
        email_not_confirmed: 'Confirm your email address before signing in.',
        user_already_exists: 'An account already uses that email. Try signing in instead.',
        weak_password: 'Choose a stronger password with at least 6 characters.',
        over_email_send_rate_limit: 'Too many attempts. Wait a little while and try again.',
        email_address_invalid: 'Enter a valid email address.'
    };
    return messages[error.code] ?? `Supabase could not complete the request (${error.code ?? 'unknown error'}).`;
}

function setBusy(isBusy) {
    formActionPending = isBusy;
    const busy = formActionPending || securityCheckPending;
    submitButtons.forEach((button) => {
        button.disabled = busy;
    });
    document.querySelector('#staff-mfa-verify').disabled = busy;
    mfaRestartButton.disabled = busy;
    mfaRetryButton.disabled = busy;
    authSignOutButton.disabled = formActionPending;
}

function setSecurityCheckPending(isPending) {
    securityCheckPending = isPending;
    setBusy(formActionPending);
}

function showSignInForms() {
    authView.hidden = false;
    accountView.hidden = true;
    mfaPanel.hidden = true;
    authTabs.hidden = false;
    authSignOutButton.hidden = true;
    selectAuthTab('signin');
    resetPasswordForm.hidden = true;
    authHeading.textContent = 'Sign in';
    authIntro.textContent = 'Use your email and password to continue.';
}

function selectAuthTab(tabName) {
    const isSignIn = tabName === 'signin';
    signInForm.hidden = !isSignIn;
    signUpForm.hidden = isSignIn;
    document.querySelector('#signin-tab').setAttribute('aria-selected', String(isSignIn));
    document.querySelector('#signin-tab').tabIndex = isSignIn ? 0 : -1;
    document.querySelector('#signup-tab').setAttribute('aria-selected', String(!isSignIn));
    document.querySelector('#signup-tab').tabIndex = isSignIn ? -1 : 0;
    document.querySelector('#signin-tab').classList.toggle('is-active', isSignIn);
    document.querySelector('#signup-tab').classList.toggle('is-active', !isSignIn);
    authHeading.textContent = isSignIn ? 'Sign in' : 'Create account';
    authIntro.textContent = isSignIn
        ? 'Use your email and password to continue.'
        : 'Create an account to save project briefs and resources.';
}

function getReturnDestination() {
    if (!Object.hasOwn(returnPaths, returnTo)) return '';
    if (returnTo === 'resourceDetail') {
        return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resourceId ?? '')
            ? `${returnPaths[returnTo]}?id=${encodeURIComponent(resourceId)}`
            : returnPaths.library;
    }
    if (returnTo === 'adminPublish' && ['wordpress', 'android', 'ios', 'web'].includes(requestedPlatform)) {
        return `${returnPaths.adminPublish}?platform=${encodeURIComponent(requestedPlatform)}`;
    }
    return returnPaths[returnTo];
}

function showAuthenticatedAccount(user, message = '', { redirect = true } = {}) {
    authView.hidden = true;
    accountView.hidden = false;
    const displayName = user.user_metadata?.display_name;
    accountEmail.textContent = displayName ? `${displayName} · ${user.email}` : user.email ?? '';
    showMessage(accountMessage, message);
    const destination = redirect ? getReturnDestination() : '';
    if (destination) window.location.replace(destination);
}

function showAccountWithoutStaffAccess(user) {
    const isStaffDestination = returnTo?.startsWith('admin');
    showAuthenticatedAccount(
        user,
        isStaffDestination
            ? 'This account does not have the staff role. Ask a trusted project owner to verify its staff access.'
            : '',
        { redirect: !isStaffDestination }
    );
}

function showMfaPanel({ mode, factorId, challengeId = '', qrCode = '', secret = '' }) {
    activeFactorId = factorId;
    activeChallengeId = challengeId;
    activeMfaMode = mode;
    authView.hidden = false;
    accountView.hidden = true;
    authTabs.hidden = true;
    authSignOutButton.hidden = false;
    signInForm.hidden = true;
    signUpForm.hidden = true;
    resetPasswordForm.hidden = true;
    mfaPanel.hidden = false;
    authHeading.textContent = 'Secure your staff account';
    mfaTitle.textContent = 'Verify your staff sign-in';
    authIntro.textContent = '';
    mfaQr.hidden = !qrCode;
    mfaQr.removeAttribute('src');
    if (qrCode) mfaQr.src = qrCode;
    mfaSecretRow.hidden = !secret;
    mfaSecret.textContent = secret;
    mfaCodeForm.hidden = !challengeId;
    mfaRestartButton.hidden = mode !== 'restart-enrollment';
    mfaRetryButton.hidden = true;
    mfaCodeInput.value = '';
    mfaSubmitLabel.textContent = mode === 'enroll' ? 'Enable MFA' : 'Verify code';
    showMessage(mfaMessage, '');
    mfaInstructions.textContent = mode === 'enroll'
        ? 'Keep this setup code private. Scan the QR code with an authenticator app, then enter its 6-digit code to enable staff MFA.'
        : mode === 'restart-enrollment'
            ? 'An unfinished authenticator setup was found. Restart it to generate a new QR code, then verify the code from your authenticator app.'
            : 'Enter the current 6-digit code from your authenticator app to continue to the staff workspace.';
}

function showStaffSecurityError(message) {
    authView.hidden = false;
    accountView.hidden = true;
    authTabs.hidden = true;
    authSignOutButton.hidden = !activeUser;
    signInForm.hidden = true;
    signUpForm.hidden = true;
    resetPasswordForm.hidden = true;
    mfaPanel.hidden = false;
    mfaTitle.textContent = 'Staff security check failed';
    mfaInstructions.textContent = message;
    mfaQr.hidden = true;
    mfaSecretRow.hidden = true;
    mfaCodeForm.hidden = true;
    mfaRestartButton.hidden = true;
    mfaRetryButton.hidden = false;
    showMessage(authMessage, '');
    showMessage(mfaMessage, 'Staff access remains blocked until this issue is resolved.', 'error');
}

async function startMfaEnrollment(unverifiedFactors = []) {
    for (const factor of unverifiedFactors) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
    }
    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Desalu staff authenticator ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
    if (error) throw error;
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: data.id
    });
    if (challengeError) throw challengeError;
    showMfaPanel({
        mode: 'enroll',
        factorId: data.id,
        challengeId: challenge.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret
    });
}

async function prepareStaffMfa(user) {
    const { data: staffIdentity, error: roleError } = await supabase.rpc('is_staff_identity');
    if (roleError) {
        if (['PGRST202', '42883'].includes(roleError.code)) {
            const { data: existingStaff, error: legacyRoleError } = await supabase.rpc('is_staff');
            if (legacyRoleError) throw legacyRoleError;
            if (existingStaff === true) {
                throw new Error('Staff MFA is not active yet. Apply the latest Supabase schema before using staff tools.');
            }
            showAccountWithoutStaffAccess(user);
            return;
        }
        throw roleError;
    }
    if (staffIdentity !== true) {
        showAccountWithoutStaffAccess(user);
        return;
    }

    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.currentLevel === 'aal2') {
        showAuthenticatedAccount(user);
        return;
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const verifiedFactor = factors.totp.find((factor) => factor.status === 'verified');
    if (verifiedFactor) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
            factorId: verifiedFactor.id
        });
        if (challengeError) throw challengeError;
        showMfaPanel({
            mode: 'verify',
            factorId: verifiedFactor.id,
            challengeId: challenge.id
        });
        return;
    }

    const unverifiedFactors = factors.totp.filter((factor) => factor.status !== 'verified');
    if (unverifiedFactors.length) {
        showMfaPanel({
            mode: 'restart-enrollment',
            factorId: unverifiedFactors[0].id
        });
        return;
    }
    await startMfaEnrollment();
}

if (!isSupabaseConfigured() || !supabase) {
    showMessage(authMessage, 'Supabase is not configured. Add the project URL and publishable key to supabase-config.js.', 'error');
    setBusy(true);
} else {
    onAuthStateChanged((user) => {
        if (passwordRecoveryActive) return;
        if (!user) {
            activeUserId = null;
            activeUser = null;
            showSignInForms();
            showMessage(authMessage, '');
            return;
        }
        if (user.id === activeUserId) return;
        activeUserId = user.id;
        activeUser = user;
        authView.hidden = false;
        accountView.hidden = true;
        mfaPanel.hidden = true;
        authTabs.hidden = true;
        authSignOutButton.hidden = false;
        signInForm.hidden = true;
        signUpForm.hidden = true;
        resetPasswordForm.hidden = true;
        showMessage(authMessage, 'Checking staff account security…');
        setSecurityCheckPending(true);
        void prepareStaffMfa(user).catch((error) => {
            console.error('Could not verify staff MFA requirements.', error);
            showStaffSecurityError(error.message || 'Staff account security could not be checked. Reload and try again.');
        }).finally(() => {
            showMessage(authMessage, '');
            setSecurityCheckPending(false);
        });
    }, (error) => {
        console.error('Could not check the current Supabase account.', error);
        showMessage(authMessage, 'Account status could not be checked. Reload and try again.', 'error');
    });
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
            passwordRecoveryActive = true;
            authView.hidden = false;
            accountView.hidden = true;
            authTabs.hidden = true;
            signInForm.hidden = true;
            signUpForm.hidden = true;
            resetPasswordForm.hidden = false;
            authHeading.textContent = 'Create a new password';
            authIntro.textContent = 'Choose a new password to secure your account.';
            showMessage(authMessage, 'Choose a new password for your account.');
        }
    });
}

signInForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabase || !signInForm.reportValidity()) return;

    showMessage(authMessage, '');
    setBusy(true);
    const formData = new FormData(signInForm);
    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: formData.get('email').trim(),
            password: formData.get('password')
        });
        if (error) throw error;
    } catch (error) {
        showMessage(authMessage, authErrorMessage(error), 'error');
    } finally {
        setBusy(false);
    }
});

mfaCodeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabase || !mfaCodeForm.reportValidity() || !activeFactorId || !activeChallengeId) return;
    setBusy(true);
    showMessage(mfaMessage, '');
    try {
        const { data, error } = await supabase.auth.mfa.verify({
            factorId: activeFactorId,
            challengeId: activeChallengeId,
            code: mfaCodeInput.value.trim()
        });
        if (error) throw error;
        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError) throw assuranceError;
        if (assurance.currentLevel !== 'aal2') {
            throw new Error('The code was accepted, but the staff session has not reached the required security level. Try again.');
        }
        activeUser = data.user ?? activeUser;
        activeChallengeId = '';
        showAuthenticatedAccount(activeUser, activeMfaMode === 'enroll'
            ? 'Authenticator MFA is enabled for this staff account.'
            : 'Staff sign-in verified.');
    } catch (error) {
        console.error('Could not verify the staff authenticator code.', error);
        showMessage(mfaMessage, authErrorMessage(error), 'error');
    } finally {
        setBusy(false);
    }
});

mfaRestartButton.addEventListener('click', async () => {
    if (!supabase) return;
    setBusy(true);
    showMessage(mfaMessage, 'Preparing authenticator setup…');
    try {
        const { data: factors, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        await startMfaEnrollment(factors.totp.filter((factor) => factor.status !== 'verified'));
        mfaCodeInput.focus();
    } catch (error) {
        console.error('Could not restart staff authenticator enrollment.', error);
        showMessage(mfaMessage, authErrorMessage(error), 'error');
    } finally {
        setBusy(false);
    }
});

mfaRetryButton.addEventListener('click', async () => {
    if (!supabase || !activeUser) return;
    setBusy(true);
    showMessage(mfaMessage, 'Checking staff security…');
    try {
        await prepareStaffMfa(activeUser);
    } catch (error) {
        console.error('Could not retry the staff security check.', error);
        showStaffSecurityError(error.message || 'Staff account security could not be checked. Try again or sign out.');
    } finally {
        showMessage(authMessage, '');
        setBusy(false);
    }
});

authSignOutButton.addEventListener('click', async () => {
    if (!supabase) return;
    setBusy(true);
    try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
    } catch (error) {
        console.error('Could not sign out of the current browser session.', error);
        showMessage(authMessage, authErrorMessage(error), 'error');
    } finally {
        setBusy(false);
    }
});

authTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-auth-tab]');
    if (!tab) return;
    selectAuthTab(tab.dataset.authTab);
    tab.focus();
});

authTabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === 'Home' || event.key === 'ArrowLeft'
        ? document.querySelector('#signin-tab')
        : document.querySelector('#signup-tab');
    selectAuthTab(nextTab.dataset.authTab);
    nextTab.focus();
});

signUpForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabase || !signUpForm.reportValidity()) return;

    showMessage(authMessage, '');
    setBusy(true);
    const formData = new FormData(signUpForm);
    try {
        const { data, error } = await supabase.auth.signUp({
            email: formData.get('email').trim(),
            password: formData.get('password'),
            options: {
                data: { display_name: formData.get('name').trim() },
                emailRedirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
        if (!data.session) {
            showMessage(authMessage, 'Check your email to confirm your account, then sign in.', 'success');
        } else {
            showMessage(accountMessage, 'Your account has been created.', 'success');
        }
    } catch (error) {
        showMessage(authMessage, authErrorMessage(error), 'error');
    } finally {
        setBusy(false);
    }
});

resetPasswordButton.addEventListener('click', async () => {
    if (!supabase) return;
    const email = document.querySelector('#signin-email').value.trim();
    if (!email) {
        showMessage(authMessage, 'Enter your email address first, then choose “Forgot password?”.', 'error');
        document.querySelector('#signin-email').focus();
        return;
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}${window.location.pathname}#reset-password`
        });
        if (error) throw error;
        showMessage(authMessage, 'If an account exists for that email, a password reset link has been sent.', 'success');
    } catch (error) {
        showMessage(authMessage, authErrorMessage(error), 'error');
    }
});

resetPasswordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabase || !resetPasswordForm.reportValidity()) return;

    const formData = new FormData(resetPasswordForm);
    const password = formData.get('password');
    if (password !== formData.get('confirmPassword')) {
        showMessage(authMessage, 'The passwords do not match.', 'error');
        return;
    }

    setBusy(true);
    try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        passwordRecoveryActive = false;
        resetPasswordForm.hidden = true;
        authTabs.hidden = false;
        signInForm.hidden = false;
        authView.hidden = true;
        accountView.hidden = false;
        showMessage(accountMessage, 'Your password has been updated.', 'success');
    } catch (error) {
        showMessage(authMessage, authErrorMessage(error), 'error');
    } finally {
        setBusy(false);
    }
});

signOutButton.addEventListener('click', async () => {
    if (!supabase) return;
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    } catch (error) {
        showMessage(accountMessage, authErrorMessage(error), 'error');
    }
});
