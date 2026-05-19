// Supabase Configuration Module
export const SB_URL = 'REMOVED_URL';
export const SB_KEY = 'REMOVED_KEY';

// The global 'supabase' object comes from the CDN script in index.html
export const sbClient = supabase.createClient(SB_URL, SB_KEY);
