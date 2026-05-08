// ── Track Pro — Cloud Dashboard (Powered by Supabase) ─────────────────────
const SB_URL = 'REMOVED_URL';
const SB_KEY = 'REMOVED_KEY';

// The global 'supabase' object comes from the CDN script
const sbClient = supabase.createClient(SB_URL, SB_KEY);

let habits = [], sessions = [], tags = [], milestones = [];
let activeHabit = null, currentYear = new Date().getFullYear();
let sortField = 'date', sortDir = 'desc';
let showAllSessions = false;

// ── Persistence (Cloud) ──────────────────────────────────
const loadData = async () => {
    try {
        const { data: hData, error: hErr } = await sbClient.from('habits').select('*');
        const { data: sData, error: sErr } = await sbClient.from('sessions').select('*');
        const { data: tData, error: tErr } = await sbClient.from('tags').select('*');
        const { data: mData, error: mErr } = await sbClient.from('milestones').select('*');
        
        if (hErr || sErr) throw hErr || sErr;

        // Map Supabase snake_case habit_id to habitId for JS compatibility
        // Filter out soft-deleted habits
        habits = (hData || []).filter(h => !h.is_deleted);
        const validHabitIds = new Set(habits.map(h => h.id));
        sessions = (sData || []).filter(s => validHabitIds.has(s.habit_id) && !s.is_deleted).map(s => ({ ...s, habitId: s.habit_id }));
        tags = tData || [];
        milestones = mData || [];

        // Migration: If Cloud is empty but localStorage has data, push to Cloud
        const localHabits = JSON.parse(localStorage.getItem('tp_habits') || '[]');
        if (habits.length === 0 && localHabits.length > 0) {
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
        habits = JSON.parse(localStorage.getItem('tp_habits') || '[]');
        sessions = JSON.parse(localStorage.getItem('tp_sessions') || '[]');
    }
};

const closeModal = id => document.getElementById(id).classList.remove('open');
const openModal = id => document.getElementById(id).classList.add('open');
const fmtDate = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

async function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
    if (!file.type.startsWith('image/')) return file; // Only compress images
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width, height = img.height;
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio; height *= ratio;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => {
                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// ── Color & Icon Pickers ──────────────────────────────
function initPickers() {
    // Color Pickers
    document.querySelectorAll('.color-picker').forEach(picker => {
        picker.querySelectorAll('.color-opt').forEach(opt => {
            opt.onclick = () => {
                picker.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            };
        });
    });
    // Icon Pickers
    document.querySelectorAll('.icon-picker').forEach(picker => {
        picker.querySelectorAll('.icon-opt').forEach(opt => {
            opt.onclick = () => {
                picker.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            };
        });
    });
}

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initPickers();
    await loadData();
    renderSidebar();
    renderSidebarTags();
    if (habits.length > 0) { 
        activeHabit = habits[0].id; 
        renderSidebar(); 
        renderMain(); 
    } else {
        renderWelcome();
    }
});

// ── Sidebar ────────────────────────────────────────────
function renderSidebar() {
    const nav = document.getElementById('habitNav');
    if (!nav) return;
    
    const activeHabitsList = habits.filter(h => !h.is_archived);
    const archivedHabitsList = habits.filter(h => h.is_archived);
    
    const dashboardLabel = document.getElementById('totalHabitsLabel');
    if (dashboardLabel) dashboardLabel.textContent = `${activeHabitsList.length} active`;
    
    const dashboardNav = document.getElementById('navDashboard');
    if (dashboardNav) dashboardNav.classList.toggle('active', activeHabit === 'dashboard');
    
    const tagsNav = document.getElementById('navTags');
    if (tagsNav) tagsNav.classList.toggle('active', activeHabit === 'tags');
    
    let html = '';
    
    html += activeHabitsList.map(h => {
        const count = sessions.filter(s => s.habitId === h.id && s.status === 'Approved').length;
        return `<div class="habit-nav-item ${activeHabit === h.id ? 'active' : ''}" onclick="selectHabit('${h.id}')">
            <span class="habit-nav-icon">${h.icon}</span>
            <div class="habit-nav-info">
                <span class="habit-nav-name">${h.name}</span>
                <span class="habit-nav-count">${count} sessions</span>
            </div>
            <div class="habit-nav-actions">
                <button class="quick-log-btn" onclick="event.stopPropagation(); quickLog('${h.id}')" title="Quick Log Today">+</button>
                <span class="edit-icon" onclick="event.stopPropagation(); openEditHabit('${h.id}')">⚙</span>
            </div>
        </div>`;
    }).join('');

    if (archivedHabitsList.length > 0) {
        html += `<div class="sidebar-section-label" style="margin-top: 1.5rem; color: var(--dim);">ARCHIVED</div>`;
        html += archivedHabitsList.map(h => {
            const count = sessions.filter(s => s.habitId === h.id && s.status === 'Approved').length;
            return `<div class="habit-nav-item ${activeHabit === h.id ? 'active' : ''}" onclick="selectHabit('${h.id}')" style="opacity: 0.6">
                <span class="habit-nav-icon" style="filter: grayscale(1)">${h.icon}</span>
                <div class="habit-nav-info">
                    <span class="habit-nav-name" style="text-decoration: line-through">${h.name}</span>
                    <span class="habit-nav-count">${count} sessions</span>
                </div>
                <div class="habit-nav-actions">
                    <span class="edit-icon" onclick="event.stopPropagation(); openEditHabit('${h.id}')">⚙</span>
                </div>
            </div>`;
        }).join('');
    }
    
    nav.innerHTML = html;
}

function renderSidebarTags() {
    const el = document.getElementById('totalTagsLabel');
    if (el) el.textContent = `${tags.length} tags`;
}

async function quickLog(habitId) {
    const today = fmtDate(new Date());
    const id = 's_' + Date.now();
    const newSession = { 
        id, 
        habit_id: habitId, 
        habitId: habitId,
        date: today, 
        value: null, 
        notes: 'Quick log', 
        time: new Date().toTimeString().substring(0,5),
        status: 'Draft',
        is_deleted: false
    };
    
    // Optimistic Update (Show it immediately!)
    sessions.push(newSession);
    renderSidebar();
    if (activeHabit === habitId) renderMain();
    fireConfetti();

    // Background Cloud Sync
    const { error } = await sbClient.from('sessions').insert({ 
        id, 
        habit_id: habitId, 
        date: today, 
        value: null, 
        notes: 'Quick log', 
        time: newSession.time,
        status: 'Draft',
        is_deleted: false
    });
    
    if (error) {
        console.error('Insert error:', error);
        showAlert('Save Failed', 'Could not save to Cloud: ' + error.message + '. (If this is a column error, make sure "status" is added in Supabase).');
        // Revert optimistic update
        sessions = sessions.filter(x => x.id !== id);
        renderSidebar(); renderMain();
    }
}

function selectHabit(id) { 
    activeHabit = id; 
    currentYear = new Date().getFullYear(); 
    sortField='date'; sortDir='desc'; 
    showAllSessions = false; 
    renderSidebar(); 
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar(); 
}

function selectDashboard() {
    activeHabit = 'dashboard';
    renderSidebar();
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar(); 
}

function selectTags() {
    activeHabit = 'tags';
    renderSidebar();
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar(); 
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ── Main Content ───────────────────────────────────────
function renderMain() {
    if (activeHabit === 'dashboard') {
        renderDashboard();
        return;
    }
    if (activeHabit === 'tags') {
        renderTagsDashboard();
        return;
    }
    const h = habits.find(x => x.id === activeHabit);
    if (!h) { renderWelcome(); return; }
    const ss = sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
    const stats = computeStats(ss);
    const main = document.getElementById('mainContent');

    main.innerHTML = `
        <div class="habit-header">
            <div class="habit-title-group">
                <span class="habit-title-icon">${h.icon}</span>
                <div>
                    <div class="habit-title">${h.name}</div>
                    <div class="habit-desc-header">${h.description || (h.unit ? 'Tracking in ' + h.unit : 'Progress tracker')}</div>
                </div>
            </div>
            <button class="btn btn-primary" onclick="openLogSession()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Log Session
            </button>
        </div>
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon-wrap">🔥</div><div class="stat-info"><div class="stat-value">${stats.current}</div><div class="stat-label">Current Streak</div></div></div>
            <div class="stat-card"><div class="stat-icon-wrap">🏆</div><div class="stat-info"><div class="stat-value">${stats.longest}</div><div class="stat-label">Longest Streak</div></div></div>
            <div class="stat-card"><div class="stat-icon-wrap">⚡</div><div class="stat-info"><div class="stat-value">${stats.total}</div><div class="stat-label">Total Sessions</div></div></div>
            <div class="stat-card">
                <div class="weekly-goal-content">
                    <div><div class="goal-num" style="color:${h.color}">${stats.weekDays}/5</div><div class="goal-label">Weekly Goal</div></div>
                    <div class="ring-container">
                        <svg class="progress-ring" width="60" height="60" viewBox="0 0 80 80">
                            <circle class="ring-bg" stroke-width="7" fill="transparent" r="32" cx="40" cy="40"/>
                            <circle class="ring-fill" stroke="${h.color}" stroke-width="7" fill="transparent" r="32" cx="40" cy="40" style="stroke-dashoffset:${201 - 201*Math.min(stats.weekDays/5,1)};filter:drop-shadow(0 0 6px ${h.color}40)"/>
                        </svg>
                        <div class="ring-text">${Math.min(Math.round(stats.weekDays/5*100),100)}%</div>
                    </div>
                </div>
            </div>
        </div>

        ${h.goal_target ? `
        <div class="section-card mastery-card" style="margin-bottom:1.8rem; padding:1.8rem; position:relative; overflow:hidden; border: 1px solid ${h.color}30; background: linear-gradient(145deg, var(--card), ${h.color}0a);">
            <!-- Subtle background glow -->
            <div style="position:absolute; top:-50%; right:-10%; width:200px; height:200px; background:${h.color}; filter:blur(100px); opacity:0.15; border-radius:50%; pointer-events:none;"></div>
            
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:1.2rem; position:relative; z-index:1;">
                <div>
                    <h3 style="font-size:1.1rem; font-weight:800; display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <span style="font-size:1.2rem;">✨</span> Mastery Progress
                    </h3>
                    <p style="font-size:0.8rem; color:var(--dim); font-weight:500;">
                        Target: <strong style="color:var(--text)">${h.goal_target} ${h.goal_type==='value'?(h.unit||'units'):'sessions'}</strong>
                    </p>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:2.8rem; font-weight:900; line-height:1; color:${h.color}; text-shadow: 0 0 25px ${h.color}60; font-variant-numeric: tabular-nums;">
                        ${Math.min(Math.round(((h.goal_type==='value'?Math.max(...ss.map(s=>s.value||0),0):stats.total)/h.goal_target)*100),100)}<span style="font-size:1.4rem;opacity:0.8">%</span>
                    </div>
                </div>
            </div>
            
            <div style="position:relative; z-index:1; margin-bottom:1rem;">
                <!-- Track -->
                <div style="height:16px; background:rgba(0,0,0,0.6); border-radius:8px; overflow:hidden; box-shadow:inset 0 2px 8px rgba(0,0,0,0.9); position:relative;">
                    <!-- Fill -->
                    <div style="height:100%; width:${Math.min(((h.goal_type==='value'?Math.max(...ss.map(s=>s.value||0),0):stats.total)/h.goal_target)*100,100)}%; background:linear-gradient(90deg, ${h.color}60, ${h.color}); box-shadow:0 0 20px ${h.color}90; border-radius:8px; transition:width 1s cubic-bezier(0.4, 0, 0.2, 1); position:relative; overflow:hidden;">
                        <!-- Shimmer effect -->
                        <div style="position:absolute; top:0; left:-100%; right:0; bottom:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); transform:skewX(-20deg); animation:shimmer 2.5s infinite;"></div>
                    </div>
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; position:relative; z-index:1;">
                <p style="font-size:0.8rem; color:var(--dim); font-weight:500;">
                    Currently at: <strong style="color:var(--text)">${h.goal_type==='value' ? Math.max(...ss.map(s=>s.value||0),0) : stats.total}</strong>
                </p>
                ${Math.min(Math.round(((h.goal_type==='value'?Math.max(...ss.map(s=>s.value||0),0):stats.total)/h.goal_target)*100),100) >= 100 ? `<span style="font-size:0.8rem; font-weight:700; color:var(--green); background:var(--green-glow); padding:4px 10px; border-radius:12px; box-shadow: 0 0 10px var(--green-glow);">🎉 Goal Reached!</span>` : `<span style="font-size:0.8rem; color:var(--dim); font-weight:500;">Keep going! 🚀</span>`}
            </div>
        </div>
        ` : ''}

        <section class="section-card" id="heatmapSection">
            <div class="section-header">
                <div><span class="section-title">📊 Activity</span> <span class="badge" id="yearlyTotal"></span></div>
                <div class="year-pills" id="yearPills"></div>
            </div>
            <div class="heatmap-wrapper">
                <div class="heatmap-labels"><div>Mon</div><div></div><div>Wed</div><div></div><div>Fri</div><div></div><div>Sun</div></div>
                <div class="heatmap-content"><div class="month-labels" id="monthLabels"></div><div class="heatmap-grid" id="heatmapGrid"></div></div>
            </div>
            <div class="heatmap-legend"><span>Less</span>
                <div class="legend-cell" style="background:rgba(255,255,255,0.04)"></div>
                <div class="legend-cell" style="background:${h.color};opacity:0.4"></div>
                <div class="legend-cell" style="background:${h.color};opacity:0.6"></div>
                <div class="legend-cell" style="background:${h.color};opacity:0.8"></div>
                <div class="legend-cell" style="background:${h.color}"></div>
                <span>More</span>
            </div>
        </section>
        ${renderProgressSection(h, ss)}
        <section class="section-card">
            <div class="section-header">
                <span class="section-title">🕒 Sessions History</span>
                <input type="text" class="search-input" id="activitySearch" placeholder="🔍 Filter..." oninput="renderTable()">
            </div>
            <div id="tableWrap"></div>
        </section>
        <section class="section-card">
            <span class="section-title">🏅 Milestones</span>
            <div class="achievement-grid" style="margin-top:0.8rem" id="achieveGrid"></div>
        </section>`;

    renderHeatmap(currentYear, h, ss);
    renderYearPills(ss);
    renderTable();
    renderAchievements(h, stats);
}

function renderDashboard() {
    const main = document.getElementById('mainContent');
    const activeHabitsList = habits.filter(h => !h.is_archived);
    
    if (activeHabitsList.length === 0) {
        renderWelcome();
        return;
    }

    let totalSessionsAllTime = 0;
    let totalSessionsThisWeek = 0;
    
    const today = new Date();
    const dow = today.getDay();
    const off = dow === 0 ? 6 : dow - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - off);
    startOfWeek.setHours(0,0,0,0);
    
    activeHabitsList.forEach(h => {
        const ss = sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
        totalSessionsAllTime += ss.length;
        
        ss.forEach(s => {
            const sd = new Date(s.date);
            if (sd >= startOfWeek) totalSessionsThisWeek++;
        });
    });

    const habitCardsHTML = activeHabitsList.map(h => {
        const ss = sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
        const stats = computeStats(ss);
        return `
            <div class="stat-card" style="cursor:pointer; transition:transform 0.2s;" onclick="selectHabit('${h.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <span style="font-size:1.5rem">${h.icon}</span>
                        <div style="font-weight:600">${h.name}</div>
                    </div>
                    <div style="color:${h.color}; font-weight:800">${stats.current} 🔥</div>
                </div>
                <div style="margin-top:1rem; font-size:0.8rem; color:var(--dim);">
                    ${stats.total} total sessions
                </div>
            </div>
        `;
    }).join('');

    main.innerHTML = `
        <div class="habit-header">
            <div class="habit-title-group">
                <span class="habit-title-icon">📊</span>
                <div>
                    <div class="habit-title">Dashboard Overview</div>
                    <div class="habit-desc-header">All active habits combined</div>
                </div>
            </div>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 2rem;">
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:rgba(99, 102, 241, 0.2); color:#6366f1">📋</div>
                <div class="stat-info">
                    <div class="stat-value">${activeHabitsList.length}</div>
                    <div class="stat-label">Active Habits</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:rgba(34, 197, 94, 0.2); color:#22c55e">📅</div>
                <div class="stat-info">
                    <div class="stat-value">${totalSessionsThisWeek}</div>
                    <div class="stat-label">Sessions This Week</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon-wrap" style="background:rgba(245, 158, 11, 0.2); color:#f59e0b">⚡</div>
                <div class="stat-info">
                    <div class="stat-value">${totalSessionsAllTime}</div>
                    <div class="stat-label">All-Time Logs</div>
                </div>
            </div>
        </div>
        
        <h3 style="margin-bottom:1rem; font-size:1.1rem;">Active Habits</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:1rem;">
            ${habitCardsHTML}
        </div>
    `;
}

function renderWelcome() {
    const main = document.getElementById('mainContent');
    if (!main) return;
    main.innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3.5rem;margin-bottom:1rem">🚀</div>
            <h2>Welcome to Track Pro</h2>
            <p>Create your first habit to start tracking progress. Each habit gets its own heatmap, streaks, and history.</p>
            <button class="btn btn-primary" onclick="openAddHabitModal()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create First Habit
            </button>
        </div>`;
}

// ── Progress Section ───────────────────────────────────
function renderProgressSection(h, ss) {
    const withVal = ss.filter(s => s.value != null).sort((a,b) => a.date.localeCompare(b.date));
    if (withVal.length < 2 || !h.unit) return '';
    const vals = withVal.map(s => parseFloat(s.value));
    const first = vals[0], last = vals[vals.length-1], best = Math.max(...vals);
    const gain = first > 0 ? Math.round((best-first)/first*100) : 0;
    return `<div class="two-col">
        <section class="section-card">
            <span class="section-title">📈 Progress</span>
            <div style="margin-top:1rem;display:flex;gap:1.5rem">
                <div><div style="font-size:1.4rem;font-weight:800;color:${h.color}">${first} <span style="font-size:0.7rem;color:var(--dim)">${h.unit}</span></div><div class="stat-label">Started At</div></div>
                <div><div style="font-size:1.4rem;font-weight:800;color:${h.color}">${best} <span style="font-size:0.7rem;color:var(--dim)">${h.unit}</span></div><div class="stat-label">Personal Best</div></div>
                <div><div style="font-size:1.4rem;font-weight:800;color:var(--green)">+${gain}%</div><div class="stat-label">Improvement</div></div>
            </div>
        </section>
        <section class="section-card">
            <span class="section-title">📊 Recent Trend</span>
            <div style="margin-top:0.8rem;display:flex;align-items:flex-end;gap:3px;height:80px">
                ${withVal.slice(-20).map(s => {
                    const pct = best > 0 ? Math.max(parseFloat(s.value)/best*100, 8) : 50;
                    return `<div style="flex:1;height:${pct}%;background:${h.color};border-radius:3px 3px 0 0;opacity:0.7;transition:0.3s;min-width:4px" title="${s.date}: ${s.value} ${h.unit||''}"></div>`;
                }).join('')}
            </div>
        </section>
    </div>`;
}

// ── Stats Computation ──────────────────────────────────
function computeStats(ss) {
    const dates = [...new Set(ss.map(s => s.date))].sort();
    let current = 0, longest = 0;
    if (dates.length) {
        let t = 1;
        for (let i = 1; i < dates.length; i++) {
            const diff = Math.round((new Date(dates[i]) - new Date(dates[i-1])) / 86400000);
            if (diff === 1) t++; else { longest = Math.max(longest, t); t = 1; }
        }
        longest = Math.max(longest, t);
        const latest = new Date(dates[dates.length-1]); latest.setHours(0,0,0,0);
        const today = new Date(); today.setHours(0,0,0,0);
        if (Math.round((today - latest)/86400000) <= 1) {
            t = 1;
            for (let i = dates.length-2; i >= 0; i--) {
                if (Math.round((new Date(dates[i+1]) - new Date(dates[i]))/86400000) === 1) t++; else break;
            }
            current = t;
        }
    }
    const today = new Date(), dow = today.getDay(), off = dow === 0 ? 6 : dow - 1;
    const mon = new Date(today); mon.setDate(today.getDate() - off); mon.setHours(0,0,0,0);
    let weekDays = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate()+i); if (dates.includes(fmtDate(d))) weekDays++; }
    const bestValue = ss.length ? Math.max(...ss.map(s => parseFloat(s.value) || 0), 0) : 0;
    return { current, longest, total: ss.length, weekDays, bestValue };
}

// ── Heatmap ────────────────────────────────────────────
function renderHeatmap(year, h, ss) {
    const grid = document.getElementById('heatmapGrid');
    const monthRow = document.getElementById('monthLabels');
    if (!grid) return;
    grid.innerHTML = ''; monthRow.innerHTML = '';

    const dc = {}; ss.forEach(s => { dc[s.date] = (dc[s.date]||0)+1; });
    let yt = 0; ss.forEach(s => { if (s.date.startsWith(String(year))) yt++; });
    document.getElementById('yearlyTotal').textContent = `${yt} in ${year}`;

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const end = new Date(year,11,31), today = new Date(); today.setHours(0,0,0,0);
    let cur = new Date(year,0,1);
    cur.setDate(cur.getDate() - (cur.getDay()===0?6:cur.getDay()-1));
    let lm = -1;
    for (let i = 0; i < 53*7; i++) {
        const ds = fmtDate(cur), day = document.createElement('div');
        day.className = 'heatmap-day';
        if (cur.getFullYear() === year) {
            const c = dc[ds]||0;
            if (cur > today) { day.classList.add('future'); }
            else if (c > 0) { day.style.background = h.color; day.classList.add('level-'+Math.min(c,4)); }
            day.onmouseover = e => { const tt=document.getElementById('tooltip'); tt.textContent=`${c} session${c!==1?'s':''} — ${ds}`; tt.style.display='block'; tt.style.left=(e.clientX+10)+'px'; tt.style.top=(e.clientY+10)+'px'; };
            day.onmouseout = () => document.getElementById('tooltip').style.display='none';
            if (cur.getDate()<=7 && cur.getMonth()!==lm && i%7===0) { const ml=document.createElement('div'); ml.textContent=months[cur.getMonth()]; ml.style.gridColumn=Math.floor(i/7)+1; monthRow.appendChild(ml); lm=cur.getMonth(); }
        } else { day.style.opacity='0.02'; }
        grid.appendChild(day);
        cur.setDate(cur.getDate()+1);
        if (cur>end && cur.getDay()===1) break;
    }
}

function renderYearPills(ss) {
    const years = new Set(ss.map(s => parseInt(s.date.substring(0,4)))); years.add(new Date().getFullYear());
    const pills = document.getElementById('yearPills');
    if (!pills) return;
    pills.innerHTML = [...years].sort((a,b)=>b-a).map(y =>
        `<button class="year-pill ${y===currentYear?'active':''}" onclick="switchYear(${y})">${y}</button>`
    ).join('');
}

function switchYear(y) {
    currentYear = y;
    const h = habits.find(x=>x.id===activeHabit);
    if (!h) return;
    const ss = sessions.filter(s=>s.habitId===h.id && s.status === 'Approved');
    renderHeatmap(y, h, ss); renderYearPills(ss);
}

// ── Activity Table ─────────────────────────────────────
function renderTable() {
    const h = habits.find(x=>x.id===activeHabit);
    if (!h) return;
    const wrap = document.getElementById('tableWrap');
    if (!wrap) return;
    
    let ss = sessions.filter(s=>s.habitId===h.id);
    const q = (document.getElementById('activitySearch')?.value||'').toLowerCase();
    
    if (q) ss = ss.filter(s => s.date.includes(q) || (s.notes||'').toLowerCase().includes(q));
    
    ss.sort((a,b) => { 
        let va=a[sortField]||'', vb=b[sortField]||''; 
        if(sortField==='value'){ va=parseFloat(va)||0; vb=parseFloat(vb)||0; } 
        return sortDir==='asc' ? (va>vb?1:-1) : (va<vb?1:-1); 
    });

    if (ss.length === 0) { 
        wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><h3>No sessions yet</h3><p>Click "Log Session" to start!</p></div>`; 
        return; 
    }

    const totalCount = ss.length;
    const isSearching = q.length > 0;
    const limit = (isSearching || showAllSessions) ? 100 : 5;
    const displayList = ss.slice(0, limit);

    let html = `<div class="table-wrapper"><table><thead><tr>
        <th onclick="doSort('date')">Date${sortField==='date'?(sortDir==='desc'?' ↓':' ↑'):''}</th>
        <th onclick="doSort('value')">Value${sortField==='value'?(sortDir==='desc'?' ↓':' ↑'):''}</th>
        <th>Status</th>
        <th>Tags</th>
        <th>Evidence</th>
        <th>Notes</th>
        <th>Actions</th></tr></thead><tbody>
        ${displayList.map(s => {
            const vd = s.value != null ? `<span class="value-tag" style="background:${h.color}20;color:${h.color}">${s.value}${h.unit?' '+h.unit:''}</span>` : '<span style="color:var(--dim)">—</span>';
            const mediaBtn = s.media ? `<button class="action-btn view-btn" onclick="openMedia('${s.id}')" style="background:${h.color}20; color:${h.color}">👁 View</button>` : '<span style="color:var(--dim); font-size:0.7rem">None</span>';
            const statusLabel = s.status === 'Approved' ? `<span style="color:var(--green); font-size:0.75rem; font-weight:700; padding:2px 6px; background:var(--green-glow); border-radius:4px;">✓ Approved</span>` : `<span style="color:var(--dim); font-size:0.75rem; font-weight:600; padding:2px 6px; background:rgba(255,255,255,0.05); border-radius:4px;">Draft</span>`;
            
            const sessionTags = (s.tag_ids || []).map(tid => tags.find(t => t.id === tid)).filter(Boolean);
            const tagsHTML = sessionTags.map(t => `<span class="tag-pill">${t.name}</span>`).join('');

            let actionsHTML = '';
            if (s.status !== 'Approved') {
                actionsHTML += `<button class="action-btn" onclick="approveSession('${s.id}')" title="Approve" style="margin-right:4px; color:var(--green)">✓</button>`;
                actionsHTML += `<button class="action-btn" onclick="openEditSession('${s.id}')" title="Edit" style="margin-right:4px">✏️</button>`;
                actionsHTML += `<button class="action-btn" onclick="confirmDeleteSession('${s.id}')" title="Delete">✕</button>`;
            } else {
                actionsHTML += `<span style="color:var(--dim); font-size:0.8rem">Locked</span>`;
            }
            
            return `<tr>
                <td>${s.date}</td>
                <td>${vd}</td>
                <td>${statusLabel}</td>
                <td>${tagsHTML}</td>
                <td>${mediaBtn}</td>
                <td style="color:var(--dim);font-size:0.78rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.notes||'—'}</td>
                <td style="white-space:nowrap">
                    ${actionsHTML}
                </td>
            </tr>`;
        }).join('')}</tbody></table></div>`;

    if (!isSearching && totalCount > 5) {
        html += `<div style="text-align:center; margin-top:1rem;">
            <button class="btn btn-ghost" style="font-size:0.8rem" onclick="toggleShowAll()">
                ${showAllSessions ? '↑ Show Less' : `↓ View Full History (${totalCount} sessions)`}
            </button>
        </div>`;
    }
    wrap.innerHTML = html;
}

function toggleShowAll() { showAllSessions = !showAllSessions; renderTable(); }
function doSort(f) { if(sortField===f) sortDir=sortDir==='asc'?'desc':'asc'; else { sortField=f; sortDir=f==='date'?'desc':'asc'; } renderTable(); }

// ── Achievements / Milestones ─────────────────────────
function renderAchievements(habit, stats) {
    const habitMilestones = milestones.filter(m => m.habit_id === habit.id);
    
    // Default fallback achievements if no custom milestones exist
    const defs = habitMilestones.length > 0 ? habitMilestones.map(m => ({
        title: m.title,
        desc: `Reach ${m.target_count} ${habit.goal_type==='value'?(habit.unit||'units'):'sessions'}`,
        icon: m.icon || '🎯',
        check: s => (habit.goal_type === 'value' ? stats.bestValue : s.total) >= m.target_count
    })) : [
        { title:"First Step", desc:"Log 1 session", icon:"🌱", check: s=>s.total>=1 },
        { title:"Week Warrior", desc:"7-day streak", icon:"🔥", check: s=>s.longest>=7 },
        { title:"Unstoppable", desc:"30-day streak", icon:"💎", check: s=>s.longest>=30 },
        { title:"Centurion", desc:"100 sessions", icon:"👑", check: s=>s.total>=100 },
    ];

    const el = document.getElementById('achieveGrid');
    if (!el) return;
    el.innerHTML = defs.map(a => {
        const earned = a.check(stats);
        return `<div class="achievement-item ${earned?'earned':'locked'}"><span class="achievement-emoji">${a.icon}</span><div class="achievement-info"><div class="achievement-title">${a.title}</div><div class="achievement-desc">${a.desc}</div></div></div>`;
    }).join('');
}

// ── Add Habit ──────────────────────────────────────────
function openAddHabitModal() { 
    openModal('addHabitModal'); 
    document.getElementById('habitName').value=''; 
    document.getElementById('habitUnit').value=''; 
    document.getElementById('habitDesc').value='';
    document.getElementById('habitGoalType').value='count';
    document.getElementById('habitGoalTarget').value='';
    // Reset Pickers
    document.querySelectorAll('#iconPicker .icon-opt').forEach((o,i)=>o.classList.toggle('selected',i===0));
    document.querySelectorAll('#colorPicker .color-opt').forEach((o,i)=>o.classList.toggle('selected',i===0));
    setTimeout(()=>document.getElementById('habitName').focus(),100); 
}

async function handleAddHabit(e) {
    e.preventDefault();
    const name = document.getElementById('habitName').value.trim();
    const icon = document.querySelector('#iconPicker .icon-opt.selected')?.dataset.icon || '📌';
    const unit = document.getElementById('habitUnit').value.trim();
    const description = document.getElementById('habitDesc').value.trim();
    const color = document.querySelector('#colorPicker .color-opt.selected')?.dataset.color || '#22c55e';
    const goal_type = document.getElementById('habitGoalType').value;
    const goal_target = document.getElementById('habitGoalTarget').value;
    
    if (!name) return;
    const id = 'h_' + Date.now();
    await sbClient.from('habits').insert({ 
        id, name, icon, unit, description, color,
        goal_type, goal_target: goal_target ? parseFloat(goal_target) : null,
        is_archived: false,
        is_deleted: false
    });
    await loadData(); activeHabit = id; closeModal('addHabitModal'); renderSidebar(); renderMain();
}

function openEditHabit(id) {
    const h = habits.find(x=>x.id===id);
    if (!h) return;
    document.getElementById('editHabitName').value = h.name;
    document.getElementById('editHabitUnit').value = h.unit || '';
    document.getElementById('editHabitDesc').value = h.description || '';
    document.getElementById('editHabitGoalType').value = h.goal_type || 'count';
    document.getElementById('editHabitGoalTarget').value = h.goal_target || '';
    document.getElementById('archiveHabitBtn').textContent = h.is_archived ? 'Unarchive' : 'Archive';
    // Set Pickers
    document.querySelectorAll('#editIconPicker .icon-opt').forEach(o => o.classList.toggle('selected', o.dataset.icon === h.icon));
    document.querySelectorAll('#editColorPicker .color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === h.color));
    document.getElementById('editHabitModal').dataset.habitId = id;
    
    renderEditMilestones(id);
    openModal('editHabitModal');
}

async function handleEditHabit(e) {
    e.preventDefault();
    const id = document.getElementById('editHabitModal').dataset.habitId;
    const name = document.getElementById('editHabitName').value.trim();
    const icon = document.querySelector('#editIconPicker .icon-opt.selected')?.dataset.icon;
    const unit = document.getElementById('editHabitUnit').value.trim();
    const description = document.getElementById('editHabitDesc').value.trim();
    const color = document.querySelector('#editColorPicker .color-opt.selected')?.dataset.color;
    const goal_type = document.getElementById('editHabitGoalType').value;
    const goal_target = document.getElementById('editHabitGoalTarget').value;
    
    await sbClient.from('habits').update({ 
        name, icon, unit, description, color,
        goal_type, goal_target: goal_target ? parseFloat(goal_target) : null
    }).eq('id', id);
    await loadData(); closeModal('editHabitModal'); renderSidebar(); renderMain();
}

function confirmDeleteHabit() {
    const id = document.getElementById('editHabitModal').dataset.habitId;
    const h = habits.find(x => x.id === id);
    if (!h) return;

    // Check if habit is at least 7 days old
    const created = h.created_at ? new Date(h.created_at) : new Date(parseInt(h.id.split('_')[1]));
    const now = new Date();
    const diffDays = Math.ceil((now - created) / (1000 * 60 * 60 * 24));
    const isLocked = diffDays <= 7;

    closeModal('editHabitModal');
    
    const titleEl = document.getElementById('deleteTitle');
    const descEl = document.getElementById('deleteDesc');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    if (isLocked) {
        titleEl.textContent = '🔒 Habit Locked';
        descEl.innerHTML = `To build consistency, you cannot delete a habit in its first 7 days.<br><br><strong>${8 - diffDays} days remaining</strong> until you can remove this.`;
        confirmBtn.style.display = 'none';
    } else {
        titleEl.textContent = 'Delete Habit?';
        descEl.textContent = 'This will hide the habit and all its sessions. It will not be permanently removed.';
        confirmBtn.style.display = 'block';
        confirmBtn.onclick = async () => {
            // Soft delete: update is_deleted flag instead of calling .delete()
            await sbClient.from('habits').update({ is_deleted: true }).eq('id', id);
            await loadData();
            activeHabit = habits.length ? habits[0].id : null;
            closeModal('deleteModal'); renderSidebar();
            if (activeHabit) renderMain(); else renderWelcome();
        };
    }
    openModal('deleteModal');
}

async function toggleArchiveHabit() {
    const id = document.getElementById('editHabitModal').dataset.habitId;
    const h = habits.find(x => x.id === id);
    if (!h) return;
    
    const isNowArchived = !h.is_archived;
    await sbClient.from('habits').update({ is_archived: isNowArchived }).eq('id', id);
    await loadData();
    closeModal('editHabitModal');
    
    // If we just archived the currently active habit, switch away from it if possible
    if (isNowArchived && activeHabit === id) {
        const firstActive = habits.find(x => !x.is_archived);
        activeHabit = firstActive ? firstActive.id : (habits.length ? habits[0].id : null);
    }
    
    renderSidebar();
    if (activeHabit) renderMain(); else renderWelcome();
}

// ── Log Session ────────────────────────────────────────
function openLogSession() {
    const h = habits.find(x=>x.id===activeHabit);
    if (!h) return;
    document.getElementById('logModalTitle').textContent = `Log — ${h.icon} ${h.name}`;
    document.getElementById('logUnitHint').textContent = h.unit ? `(${h.unit})` : '(optional)';
    document.getElementById('logDate').valueAsDate = new Date();
    document.getElementById('logValue').value = '';
    document.getElementById('logNotes').value = '';
    document.getElementById('logFile').value = ''; 
    document.getElementById('uploadStatus').textContent = '';
    renderTagSelectors('logTagSelector');
    openModal('logModal');
}

function renderTagSelectors(containerId, selectedIds = []) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = tags.map(t => `
        <div class="tag-opt ${selectedIds.includes(t.id) ? 'selected' : ''}" 
             onclick="this.classList.toggle('selected')" 
             data-id="${t.id}">${t.name}</div>
    `).join('');
}

async function handleLogSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const statusEl = document.getElementById('uploadStatus');
    const date = document.getElementById('logDate').value;
    const value = document.getElementById('logValue').value;
    const notes = document.getElementById('logNotes').value.trim();
    const fileInput = document.getElementById('logFile');
    
    const tagIds = Array.from(document.querySelectorAll('#logTagSelector .tag-opt.selected')).map(el => el.dataset.id);

    if (!date) return;
    let mediaUrl = null;

    if (fileInput.files.length > 0) {
        submitBtn.disabled = true;
        statusEl.textContent = '📤 Optimizing & Uploading...';
        let file = fileInput.files[0];
        
        // Resize if it's an image
        if (file.type.startsWith('image/')) {
            try { file = await compressImage(file); } catch (e) { console.error("Compression failed", e); }
        }

        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const { data, error } = await sbClient.storage.from('evidence').upload(fileName, file);
        if (error) { showAlert('Upload Error', error.message); submitBtn.disabled = false; return; }
        const { data: { publicUrl } } = sbClient.storage.from('evidence').getPublicUrl(fileName);
        mediaUrl = publicUrl;
    }

    const id = 's_'+Date.now();
    const { error: insertErr } = await sbClient.from('sessions').insert({ 
        id, 
        habit_id: activeHabit, 
        date, 
        value: value ? parseFloat(value) : null, 
        notes, 
        media: mediaUrl, 
        time: new Date().toTimeString().substring(0,5), 
        status: 'Draft',
        tag_ids: tagIds,
        is_deleted: false
    });
    
    if (insertErr) {
        showAlert('Save Failed', 'Could not save to Cloud: ' + insertErr.message);
        submitBtn.disabled = false;
        return;
    }
    
    await loadData(); 
    submitBtn.disabled = false;
    closeModal('logModal'); renderSidebar(); renderMain();
}

// ── Edit Session ──────────────────────────────────────
function openEditSession(id) {
    const s = sessions.find(x => x.id === id);
    const h = habits.find(x => x.id === s.habitId);
    if (!s || !h) return;

    document.getElementById('editSessionId').value = s.id;
    document.getElementById('editLogDate').value = s.date;
    document.getElementById('editLogValue').value = s.value || '';
    document.getElementById('editLogNotes').value = s.notes || '';
    document.getElementById('editLogUnitHint').textContent = h.unit ? `(${h.unit})` : '';
    document.getElementById('editLogFile').value = '';
    document.getElementById('editUploadStatus').textContent = '';

    renderTagSelectors('editLogTagSelector', s.tag_ids || []);
    
    const preview = document.getElementById('editMediaPreview');
    if (s.media) {
        const isVid = s.media.toLowerCase().match(/\.(mp4|mov|webm)$/);
        preview.innerHTML = `
            <div style="position:relative; display:inline-block">
                ${isVid ? `<video src="${s.media}" style="height:60px; border-radius:4px"></video>` : `<img src="${s.media}" style="height:60px; border-radius:4px">`}
                <button type="button" onclick="removeEditMedia()" style="position:absolute; top:-5px; right:-5px; background:var(--red); color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer">✕</button>
            </div>
        `;
        preview.dataset.currentMedia = s.media;
    } else {
        preview.innerHTML = '';
        preview.dataset.currentMedia = '';
    }
    
    openModal('editSessionModal');
}

function removeEditMedia() {
    const preview = document.getElementById('editMediaPreview');
    preview.innerHTML = '';
    preview.dataset.currentMedia = '';
}

async function handleEditSession(e) {
    e.preventDefault();
    const id = document.getElementById('editSessionId').value;
    const date = document.getElementById('editLogDate').value;
    const value = document.getElementById('editLogValue').value;
    const notes = document.getElementById('editLogNotes').value.trim();
    const fileInput = document.getElementById('editLogFile');
    const preview = document.getElementById('editMediaPreview');
    let mediaUrl = preview.dataset.currentMedia;

    const tagIds = Array.from(document.querySelectorAll('#editLogTagSelector .tag-opt.selected')).map(el => el.dataset.id);

    if (!date) return;

    const submitBtn = document.getElementById('saveEditSessionBtn');
    submitBtn.disabled = true;
    document.getElementById('editUploadStatus').textContent = fileInput.files.length ? 'Uploading new evidence...' : '';

    if (fileInput.files.length > 0) {
        let file = fileInput.files[0];
        if (file.type.startsWith('image/')) {
            try { file = await compressImage(file); } catch (e) { console.error("Compression failed", e); }
        }

        const path = `evidence/${Date.now()}_${file.name}`;
        await sbClient.storage.from('evidence').upload(path, file);
        const { data: { publicUrl } } = sbClient.storage.from('evidence').getPublicUrl(path);
        mediaUrl = publicUrl;
    }

    // Optimistic Update
    const idx = sessions.findIndex(x => x.id === id);
    if (idx !== -1) {
        sessions[idx].date = date;
        sessions[idx].value = value ? parseFloat(value) : null;
        sessions[idx].notes = notes;
        sessions[idx].media = mediaUrl;
    }
    closeModal('editSessionModal');
    renderMain();

    // Cloud Update
    await sbClient.from('sessions').update({ 
        date, 
        value: value ? parseFloat(value) : null, 
        notes,
        media: mediaUrl,
        tag_ids: tagIds
    }).eq('id', id);
    
    await loadData();
    submitBtn.disabled = false;
    renderMain();
}

// ── Media Review ───────────────────────────────────────
function openMedia(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s || !s.media) return;
    const viewer = document.getElementById('mediaViewer');
    const notes = document.getElementById('mediaNotes');
    const title = document.getElementById('mediaModalTitle');
    const h = habits.find(x => x.id === s.habitId);

    title.textContent = `${h?.icon || '📝'} Session — ${s.date}`;
    notes.textContent = s.notes || 'No notes.';
    const isVideo = s.media.match(/\.(mp4|webm|ogg|mov)/i);
    viewer.innerHTML = isVideo ? `<video src="${s.media}" controls style="max-width:100%; max-height:70vh;"></video>` : `<img src="${s.media}" style="max-width:100%; max-height:70vh; object-fit:contain;">`;
    openModal('mediaModal');
}

// ── Delete Session ─────────────────────────────────────
function confirmDeleteSession(id) {
    const s = sessions.find(x => x.id === id);
    if (s && s.status === 'Approved') {
        showAlert("Notice", "Approved sessions cannot be deleted.");
        return;
    }
    document.getElementById('deleteTitle').textContent = 'Delete Session?';
    document.getElementById('deleteDesc').textContent = 'This will hide the session. It will not be permanently removed.';
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.style.display = 'block';
    openModal('deleteModal');
    confirmBtn.onclick = async () => {
        // Soft delete for sessions
        await sbClient.from('sessions').update({ is_deleted: true }).eq('id', id);
        await loadData(); closeModal('deleteModal'); renderSidebar(); renderMain();
    };
}

function approveSession(id) {
    const confirmBtn = document.getElementById('confirmApproveBtn');
    openModal('approveModal');
    
    confirmBtn.onclick = async () => {
        closeModal('approveModal');
        // Optimistic Update
        const idx = sessions.findIndex(x => x.id === id);
        if (idx !== -1) sessions[idx].status = 'Approved';
        renderMain();
        
        // Cloud Sync
        await sbClient.from('sessions').update({ status: 'Approved' }).eq('id', id);
        await loadData();
        renderMain();
    };
}

// ── Export / Import ────────────────────────────────────
function exportData() {
    const blob = new Blob([JSON.stringify({habits,sessions},null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `trackpro_cloud_backup.json`; a.click(); URL.revokeObjectURL(a.href);
}
async function importData(e) {
    showAlert('Notice', 'Import disabled for Cloud version to prevent conflicts. Use the dashboard to add data!');
}

function showAlert(title, desc) {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertDesc').textContent = desc;
    openModal('alertModal');
}

// ── Tag Management ─────────────────────────────────────
function openManageTagsModal() {
    selectTags();
}

function renderTagsDashboard() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
        <div class="habit-header">
            <div class="habit-title-group">
                <span class="habit-title-icon">🏷️</span>
                <div>
                    <div class="habit-title">Tags Management</div>
                    <div class="habit-desc-header">Create and organize tags for your sessions</div>
                </div>
            </div>
        </div>
        
        <div class="section-card" style="max-width: 500px;">
            <div class="form-group">
                <label>Create New Tag</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="newTagName" placeholder="Tag name..." style="flex:1">
                    <button class="btn btn-primary" onclick="handleAddTag()" style="padding: 0 16px;">Add Tag</button>
                </div>
            </div>
            
            <div class="form-group" style="margin-top:2rem;">
                <label>Existing Tags (${tags.length})</label>
                <div id="tagManagerList" style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                    <!-- Tags injected here -->
                </div>
            </div>
        </div>
    `;
    renderTagManager();
}

function renderTagManager() {
    const list = document.getElementById('tagManagerList');
    if (!list) return;
    list.innerHTML = tags.map(t => {
        const usageCount = sessions.filter(s => (s.tag_ids || []).includes(t.id)).length;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px;">
                <div style="display:flex; flex-direction:column;">
                    <span style="font-size:0.9rem; font-weight:700; color:var(--text);">${t.name}</span>
                    <span style="font-size:0.7rem; color:var(--dim);">${usageCount} sessions using this tag</span>
                </div>
                <button class="action-btn" onclick="handleDeleteTag('${t.id}')" style="color:var(--red); border-color:rgba(239,68,68,0.2); padding:6px 10px;">✕ Delete</button>
            </div>
        `;
    }).join('');
    if (tags.length === 0) list.innerHTML = '<div style="text-align:center; color:var(--dim); font-size:0.85rem; padding:2rem;">No tags created yet. Start by adding one above!</div>';
}

async function handleAddTag() {
    const input = document.getElementById('newTagName');
    const name = input.value.trim();
    if (!name) return;
    
    const id = 't_' + Date.now();
    await sbClient.from('tags').insert({ id, name });
    input.value = '';
    await loadData();
    if (activeHabit === 'tags') renderTagsDashboard();
    renderSidebarTags();
}

async function handleDeleteTag(id) {
    if (!confirm('Delete this tag? It will be removed from all sessions.')) return;
    await sbClient.from('tags').delete().eq('id', id);
    await loadData();
    if (activeHabit === 'tags') renderTagsDashboard();
    renderSidebarTags();
}

// ── Milestone Management ───────────────────────────────
function renderEditMilestones(habitId) {
    const list = document.getElementById('editMilestonesList');
    if (!list) return;
    const ms = milestones.filter(m => m.habit_id === habitId);
    list.innerHTML = ms.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:8px;">
            <div style="display:flex; flex-direction:column;">
                <span style="font-size:0.8rem; font-weight:700;">${m.title}</span>
                <span style="font-size:0.7rem; color:var(--dim);">Target: ${m.target_count}</span>
            </div>
            <button type="button" class="action-btn" onclick="handleDeleteMilestone('${m.id}')" style="color:var(--red); border-color:transparent;">✕</button>
        </div>
    `).join('');
    if (ms.length === 0) list.innerHTML = '<div style="text-align:center; color:var(--dim); font-size:0.75rem;">No custom milestones yet.</div>';
}

async function handleAddMilestone() {
    const habitId = document.getElementById('editHabitModal').dataset.habitId;
    const title = document.getElementById('newMilestoneTitle').value.trim();
    const target = document.getElementById('newMilestoneTarget').value;
    
    if (!title || !target) return;
    
    const id = 'm_' + Date.now();
    await sbClient.from('milestones').insert({ 
        id, 
        habit_id: habitId, 
        title, 
        target_count: parseInt(target) 
    });
    
    document.getElementById('newMilestoneTitle').value = '';
    document.getElementById('newMilestoneTarget').value = '';
    
    await loadData();
    renderEditMilestones(habitId);
    renderMain();
}

async function handleDeleteMilestone(id) {
    const habitId = document.getElementById('editHabitModal').dataset.habitId;
    await sbClient.from('milestones').delete().eq('id', id);
    await loadData();
    renderEditMilestones(habitId);
    renderMain();
}
