// Supabase project URL and publishable key are public client configuration.
// Never put a service_role key or database password in this file.
export const supabaseConfig = {
    url: 'https://fsnpssnfgciqykhlaxxd.supabase.co',
    publishableKey: 'sb_publishable_lGVcQqyLXyllNRT4DrVoJQ__OIk8kj5',
    turnstileSiteKey: 'YOUR_CLOUDFLARE_TURNSTILE_SITE_KEY'
};

export function isSupabaseConfigured(config = supabaseConfig) {
    return typeof config.url === 'string'
        && config.url.startsWith('https://')
        && !config.url.includes('YOUR_')
        && typeof config.publishableKey === 'string'
        && config.publishableKey.length > 0
        && !config.publishableKey.startsWith('YOUR_');
}
