// Database Integration & Migration Module
import { sbClient } from './supabase.js';
import { state } from './state.js';

export const loadData = async () => {
    try {
        // Parallel fetch all tables for faster loading
        const [hRes, sRes, tRes, mRes, gRes, rRes, qRes, moRes, enRes, stRes] = await Promise.all([
            sbClient.from('habits').select('*'),
            sbClient.from('sessions').select('*'),
            sbClient.from('tags').select('*'),
            sbClient.from('milestones').select('*'),
            sbClient.from('habit_groups').select('*'),
            sbClient.from('reflections').select('*'),
            sbClient.from('daily_quotes').select('*'),
            sbClient.from('mood').select('*'),
            sbClient.from('energy').select('*'),
            sbClient.from('session_templates').select('*'),
        ]);

        // Log errors but don't crash if tables/columns are missing
        if (hRes.error) console.warn("Habits table error:", hRes.error.message);
        if (sRes.error) console.warn("Sessions table error:", sRes.error.message);

        state.habits = (hRes.data || []).filter(h => !h.is_deleted);
        const validHabitIds = new Set(state.habits.map(h => h.id));
        state.sessions = (sRes.data || []).filter(s => validHabitIds.has(s.habit_id) && !s.is_deleted).map(s => ({ ...s, habitId: s.habit_id }));
        state.tags = tRes.data || [];
        state.milestones = mRes.data || [];
        state.habitGroups = gRes.data || [];
        state.reflections = rRes.data || [];
        state.dailyQuotes = qRes.data || [];
        state.sessionTemplates = stRes.data || [];
        state.moods = (moRes.data || []).sort((a, b) => a.value - b.value);
        state.energies = (enRes.data || []).sort((a, b) => a.value - b.value);

        // Migration: If Cloud is empty but localStorage has data, push to Cloud
        const localHabits = JSON.parse(localStorage.getItem('tp_habits') || '[]');
        if (state.habits.length === 0 && localHabits.length > 0) {
            console.log("Migrating data to Cloud...");
            const localSessions = JSON.parse(localStorage.getItem('tp_sessions') || '[]');

            // Push habits
            await sbClient.from('habits').insert(localHabits);
            // Push sessions (mapping habitId -> habit_id)
            const mappedSessions = localSessions.map(s => {
                const { habitId, ...rest } = s;
                return { ...rest, habit_id: habitId };
            });
            await sbClient.from('sessions').insert(mappedSessions);

            // Reload
            return loadData();
        }
    } catch (e) {
        console.error("Cloud Error:", e);
        // Fallback to local storage
        state.habits = JSON.parse(localStorage.getItem('tp_habits') || '[]');
        state.sessions = JSON.parse(localStorage.getItem('tp_sessions') || '[]');
    }
};

export async function loadLoginPasswordHash() {
    try {
        const { data, error } = await sbClient
            .from('app_settings')
            .select('value')
            .eq('key', 'login_password_hash')
            .maybeSingle();
        if (!error && data) {
            state.loginPasswordHash = data.value;
        }
    } catch (e) {
        console.warn('Could not load login password:', e);
    }
}

export async function saveLoginPasswordHash(hash) {
    state.loginPasswordHash = hash;
    try {
        const { data: existing } = await sbClient
            .from('app_settings')
            .select('key')
            .eq('key', 'login_password_hash')
            .maybeSingle();
        if (existing) {
            await sbClient.from('app_settings')
                .update({ value: hash })
                .eq('key', 'login_password_hash');
        } else {
            await sbClient.from('app_settings')
                .insert({ key: 'login_password_hash', value: hash });
        }
    } catch (e) {
        console.error('Failed to save login password:', e);
    }
}
