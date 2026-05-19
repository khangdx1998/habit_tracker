// Shared Global Application State Module
export const state = {
    habits: [],
    sessions: [],
    tags: [],
    milestones: [],
    habitGroups: [],
    reflections: [],
    dailyQuotes: [],
    sessionTemplates: [],
    moods: [],
    energies: [],
    activeHabit: null,
    currentYear: new Date().getFullYear(),
    sortField: 'date',
    sortDir: 'desc',
    showAllSessions: false,
    collapsedGroups: new Set(),
    selectedHeatmapDate: null,
    privateHabitsUnlocked: false,
    loginPasswordHash: null,
    lastClickX: null,
    lastClickY: null
};
