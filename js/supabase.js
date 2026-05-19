// Supabase Configuration Module with Dynamic Environment Loading
let sbUrl = '';
let sbKey = '';

try {
    const res = await fetch('/api/config');
    const config = await res.json();
    sbUrl = config.supabaseUrl;
    sbKey = config.supabaseKey;
} catch (e) {
    console.error('⚠️ Failed to load Supabase config from backend API:', e);
}

export const SB_URL = sbUrl;
export const SB_KEY = sbKey;

// Initialize Supabase Client
if (!SB_URL || !SB_KEY) {
    console.error('❌ Supabase credentials are empty! Please check your .env file.');
}

export const sbClient = supabase.createClient(SB_URL, SB_KEY);
