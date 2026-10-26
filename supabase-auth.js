import { supabase } from './supabase-client.js';

let mfaRedirectPending = false;

export function onAuthStateChanged(callback, onError = console.error) {
    if (!supabase) {
        onError(new Error('Supabase is not configured.'));
        return () => {};
    }

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => {
            if (active) callback(session?.user ?? null);
        }, 0);
    });

    return () => {
        active = false;
        subscription.unsubscribe();
    };
}

export async function userIsStaff() {
    if (!supabase) return false;
    const { data: staffIdentity, error: identityError } = await supabase.rpc('is_staff_identity');
    if (identityError) throw identityError;
    if (staffIdentity !== true) return false;

    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.currentLevel !== 'aal2') {
        if (!mfaRedirectPending) {
            mfaRedirectPending = true;
            const page = window.location.pathname.split('/').pop();
            const destinations = {
                'admin-dashboard.html': 'adminDashboard',
                'admin.html': 'adminInquiries',
                'admin-resources.html': 'adminPublishing',
                'admin-library.html': 'adminResources',
                'admin-review.html': 'adminReview',
                'admin-publish.html': 'adminPublish'
            };
            const returnTo = destinations[page];
            if (!returnTo) throw new Error('Staff MFA is required, but no safe return page is available.');

            const parameters = new URLSearchParams({ returnTo });
            const platform = new URLSearchParams(window.location.search).get('platform');
            if (returnTo === 'adminPublish' && ['wordpress', 'android', 'ios', 'web'].includes(platform)) {
                parameters.set('platform', platform);
            }
            const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
            if (signOutError) throw signOutError;
            window.location.replace(`auth.html?${parameters.toString()}#signin`);
        }
        return false;
    }

    const { data: staff, error } = await supabase.rpc('is_staff');
    if (error) throw error;
    return staff === true;
}
