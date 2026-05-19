// UI Component Rendering Module
import { state } from './state.js';
import { fmtDate } from './utils.js';

export function renderSidebar() {
    const nav = document.getElementById('habitNav');
    if (!nav) return;

    const dashboardNav = document.getElementById('navDashboard');
    if (dashboardNav) dashboardNav.classList.toggle('active', state.activeHabit === 'dashboard');

    const tagsNav = document.getElementById('navTags');
    if (tagsNav) tagsNav.classList.toggle('active', state.activeHabit === 'tags');

    const refNav = document.getElementById('navReflections');
    if (refNav) {
        refNav.classList.toggle('active', state.activeHabit === 'reflections');
        refNav.style.display = state.privateHabitsUnlocked ? 'flex' : 'none';
    }

    let html = '';
    const activeHabitsList = state.habits.filter(h => !h.is_deleted && !h.is_archived && (!h.is_private || state.privateHabitsUnlocked));
    const archivedHabitsList = state.habits.filter(h => !h.is_deleted && h.is_archived && (!h.is_private || state.privateHabitsUnlocked));

    const lockBtn = document.getElementById('privateToggleBtn');
    if (lockBtn) {
        const hasPrivate = state.habits.some(h => !h.is_deleted && h.is_private);
        lockBtn.style.display = hasPrivate ? 'block' : 'none';
        lockBtn.textContent = state.privateHabitsUnlocked ? '🔓' : '🔒';
        lockBtn.title = state.privateHabitsUnlocked ? 'Lock private habits' : 'Unlock private habits';
        lockBtn.style.background = state.privateHabitsUnlocked ? 'rgba(239, 68, 68, 0.15)' : 'transparent';
    }

    const groups = state.habitGroups || [];
    const ungrouped = activeHabitsList.filter(h => !h.group_id || !groups.find(g => g && g.id === h.group_id));

    if (ungrouped.length > 0) {
        if (groups.length > 0) html += `<div class="sidebar-section-label" style="margin-top:1rem; opacity:0.6;">GENERAL</div>`;
        html += renderHabitItems(ungrouped);
    }

    groups.forEach(g => {
        const gHabits = activeHabitsList.filter(h => h.group_id === g.id);
        if (gHabits.length > 0) {
            const isCollapsed = state.collapsedGroups.has(g.id);
            html += `
                <div class="group-header ${isCollapsed ? 'collapsed' : ''}" onclick="toggleGroup('${g.id}')">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:1.1rem;">${g.icon}</span>
                        <span style="font-size:0.75rem; font-weight:700; letter-spacing:1px; color:var(--dim);">${g.name.toUpperCase()}</span>
                    </div>
                    <span class="chevron">▼</span>
                </div>
                <div class="group-items-container ${isCollapsed ? 'collapsed' : ''}">
                    ${renderHabitItems(gHabits)}
                </div>
            `;
        }
    });

    if (archivedHabitsList.length > 0) {
        html += `<div class="sidebar-section-label" style="margin-top: 1.5rem; color: var(--dim);">ARCHIVED</div>`;
        html += renderHabitItems(archivedHabitsList, true);
    }

    nav.innerHTML = html;
}

export function renderHabitItems(list, isArchived = false) {
    const todayStr = fmtDate(new Date());
    return list.map(h => {
        const count = state.sessions.filter(s => s.habitId === h.id && (s.status === 'Approved' || s.status === 'Draft')).length;
        const isDoneToday = state.sessions.some(s => s.habitId === h.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted);
        
        return `<div class="habit-nav-item ${state.activeHabit === h.id ? 'active' : ''}" onclick="selectHabit('${h.id}')" style="${isArchived ? 'opacity: 0.6' : ''}">
            <span class="habit-nav-icon" style="${isArchived ? 'filter: grayscale(1)' : ''}">${h.icon}</span>
            <div class="habit-nav-info">
                <span class="habit-nav-name" style="display:flex; align-items:center; gap:4px;">
                    ${h.name}
                    ${h.is_private ? ' <span style="font-size:0.6rem; opacity:0.5;" title="Private">🔒</span>' : ''}
                </span>
                <span class="habit-nav-count">${count} sessions</span>
            </div>
            <div class="habit-nav-actions">
                ${!isArchived ? (isDoneToday 
                    ? `<span style="color:var(--green); font-size:1.1rem; font-weight:900; margin-right:6px; filter:drop-shadow(0 0 4px rgba(34,197,94,0.45));" title="Done Today">✓</span>`
                    : `<button class="quick-log-btn" onclick="event.stopPropagation(); quickLog('${h.id}')" title="Quick Log Today">+</button>`
                ) : ''}
                <span class="edit-icon" onclick="event.stopPropagation(); openEditHabit('${h.id}')">⚙</span>
            </div>
        </div>`;
    }).join('');
}

export function renderSidebarTags() {
    const el = document.getElementById('totalTagsLabel');
    if (el) el.textContent = `${state.tags.length} tags`;

    const rel = document.getElementById('totalReflectionsLabel');
    if (rel) rel.textContent = `${state.reflections.length} logs`;
}

export function renderDashboard() {
    const main = document.getElementById('mainContent');
    const activeHabitsList = state.habits.filter(h => h && h.is_archived !== true && (!h.is_private || state.privateHabitsUnlocked));

    if (activeHabitsList.length === 0) { renderWelcome(); return; }

    const priorityMap = { 'high': 3, 'medium': 2, 'low': 1 };
    const sortedHabits = [...activeHabitsList].sort((a, b) => {
        const pA = priorityMap[a.priority] || 2;
        const pB = priorityMap[b.priority] || 2;
        if (pA !== pB) return pB - pA;
        return a.name.localeCompare(b.name);
    });

    const quote = state.dailyQuotes.length > 0 ? state.dailyQuotes[Math.floor(Math.random() * state.dailyQuotes.length)] : { text: "Excellence is not an act, but a habit.", author: "Aristotle" };

    let totalSessionsAllTime = 0;
    let totalSessionsThisWeek = 0;
    const today = new Date();
    const dow = today.getDay(), off = dow === 0 ? 6 : dow - 1;
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - off); startOfWeek.setHours(0, 0, 0, 0);

    sortedHabits.forEach(h => {
        const ss = state.sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
        totalSessionsAllTime += ss.length;
        ss.forEach(s => { if (new Date(s.date) >= startOfWeek) totalSessionsThisWeek++; });
    });

    const highHabits = sortedHabits.filter(h => h.priority === 'high');
    const mediumHabits = sortedHabits.filter(h => h.priority === 'medium' || !h.priority);
    const lowHabits = sortedHabits.filter(h => h.priority === 'low');

    const todayStr = fmtDate(new Date());
    const donePriorityCount = highHabits.filter(h => state.sessions.some(s => s.habitId === h.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted)).length;

    const incompleteHighHabits = highHabits.filter(h => !state.sessions.some(s => s.habitId === h.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted));
    const completeHighHabits = highHabits.filter(h => state.sessions.some(s => s.habitId === h.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted));

    const sectionsHTML = [
        { title: '🔥 Priority Focus', habits: incompleteHighHabits, icon: '⭐️', color: '#fbbf24' },
        { title: '🏆 Completed Focus', habits: completeHighHabits, icon: '✨', color: 'var(--green)' },
        { title: 'Active Habits', habits: mediumHabits, icon: '⚡', color: 'var(--accent)' },
        { title: 'Background', habits: lowHabits, icon: '🍃', color: 'var(--dim)' }
    ].map(section => {
        if (section.habits.length === 0) return '';
        const doneInSection = section.habits.filter(h => state.sessions.some(s => s.habitId === h.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted)).length;
        const allDone = doneInSection === section.habits.length;

        const sortedSectionHabits = [...section.habits].sort((a, b) => {
            const doneA = state.sessions.some(s => s.habitId === a.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted);
            const doneB = state.sessions.some(s => s.habitId === b.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted);
            if (doneA !== doneB) {
                return doneA ? 1 : -1;
            }
            return 0;
        });

        return `
            <div class="dashboard-section" style="margin-bottom: 3.5rem;">
                <div style="display:flex; align-items:center; gap:15px; margin-bottom:1.5rem;">
                    <h3 style="font-size:0.9rem; text-transform:uppercase; letter-spacing:2px; color:var(--text); font-weight:900; opacity:0.9; margin:0;">
                        ${section.title}
                    </h3>
                    <div style="flex:1; height:1px; background:linear-gradient(90deg, rgba(255,255,255,0.1), transparent);"></div>
                    <span style="font-size:0.7rem; color:${allDone ? 'var(--green)' : 'var(--dim)'}; font-weight:700; background:${allDone ? 'var(--green-glow)' : 'rgba(255,255,255,0.05)'}; padding:3px 10px; border-radius:10px; border:1px solid ${allDone ? 'rgba(34,197,94,0.25)' : 'transparent'}; filter: ${allDone ? 'drop-shadow(0 0 4px rgba(34,197,94,0.2))' : 'none'}; transition: all 0.3s ease;">
                        ${doneInSection}/${section.habits.length} Done
                    </span>
                </div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:1.25rem;">
                    ${sortedSectionHabits.map(h => renderHabitCard(h, startOfWeek)).join('')}
                </div>
            </div>
        `;
    }).join('');

    main.innerHTML = `
        <div class="habit-header" style="margin-bottom: 2rem;">
            <div class="habit-title-group">
                <span class="habit-title-icon" style="background: linear-gradient(135deg, #8b5cf6, #d946ef); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">📊</span>
                <div>
                    <div class="habit-title">Overview</div>
                    <div class="habit-desc-header">Track your progress and stay consistent.</div>
                </div>
            </div>
        </div>

        <!-- Weekly Calendar Row -->
        ${renderWeeklyCalendarRow()}

        <!-- Horizontal Stats & Quote Bar -->
        <div style="display:grid; grid-template-columns: 1.3fr 1.2fr; gap:2rem; margin-bottom: 3.5rem; background:rgba(255,255,255,0.02); padding:1.5rem; border-radius:16px; border:1px solid var(--border);">
            <div style="border-right: 1px solid rgba(255,255,255,0.05); padding-right: 2rem; display:flex; flex-direction:column; justify-content:center;">
                <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--dim); margin-bottom: 0.8rem; font-weight: 800;">Daily Inspiration</div>
                <div style="font-size: 1rem; color: var(--text); line-height: 1.6; font-style: italic; opacity: 0.9;">
                    "${quote.text}"
                    <span style="font-size: 0.75rem; font-style: normal; opacity: 0.5; margin-left: 10px;">— ${quote.author}</span>
                </div>
            </div>
            <div style="display:flex; justify-content:space-around; align-items:center; gap:10px; width:100%;">
                <div style="text-align:center;">
                    <div style="font-size: 1.4rem; font-weight: 900; color: var(--accent);">${activeHabitsList.length}</div>
                    <div style="font-size: 0.58rem; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; font-weight:700;">Habits</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size: 1.4rem; font-weight: 900; color: #fbbf24;">${donePriorityCount}/${highHabits.length || activeHabitsList.length}</div>
                    <div style="font-size: 0.58rem; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; font-weight:700;">${highHabits.length > 0 ? 'Priority Done' : 'Done Today'}</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size: 1.4rem; font-weight: 900; color: var(--green);">${totalSessionsThisWeek}</div>
                    <div style="font-size: 0.58rem; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; font-weight:700;">Weekly</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size: 1.4rem; font-weight: 900; color: var(--amber);">${totalSessionsAllTime}</div>
                    <div style="font-size: 0.58rem; color: var(--dim); text-transform: uppercase; letter-spacing: 1px; font-weight:700;">Total</div>
                </div>
            </div>
        </div>

        <div class="dashboard-content">
            ${sectionsHTML}
        </div>
    `;
}

export function renderHabitCard(h, startOfWeek) {
    const ss = state.sessions.filter(s => s.habitId === h.id && (s.status === 'Approved' || s.status === 'Draft'));
    const stats = computeStats(ss);
    
    const target = h.goal_target || 30;
    const totalDaysLogged = new Set(ss.map(s => s.date)).size;
    const progressPct = Math.min((totalDaysLogged / target) * 100, 100);

    const todayStr = fmtDate(new Date());
    const isDoneToday = state.sessions.some(s => s.habitId === h.id && s.date === todayStr && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted);

    const isHigh = h.priority === 'high';
    const priorityBorder = isHigh ? 'border: 1px solid rgba(251, 191, 36, 0.45); box-shadow: 0 8px 32px rgba(251, 191, 36, 0.08); transform: translateY(-1px);' : 'border: 1px solid rgba(255, 255, 255, 0.08);';

    const lastSession = [...ss].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))[0];
    let lastText = 'Never';
    if (lastSession) {
        const now = new Date(); now.setHours(0,0,0,0);
        const sessionDate = new Date(lastSession.date); sessionDate.setHours(0,0,0,0);
        const diffDays = Math.round((now - sessionDate) / 86400000);
        const timeLabel = diffDays === 0 ? 'Today' : (diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`);
        const valLabel = lastSession.value != null ? `${lastSession.value} ${h.unit || ''}` : '';
        lastText = valLabel ? `${valLabel} (${timeLabel})` : timeLabel;
    }

    let sparklineHTML = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek); d.setDate(d.getDate() + i);
        const ds = fmtDate(d);
        const done = ss.some(s => s.date === ds);
        sparklineHTML += `<div style="width:12px; height:12px; border-radius:3px; background:${done ? h.color : 'rgba(255,255,255,0.06)'}; box-shadow: ${done ? `0 0 8px ${h.color}40` : 'none'};" title="${ds}"></div>`;
    }

    const completeActionHTML = isDoneToday
        ? `<div style="width:100%; text-align:center; font-size:0.7rem; color:var(--green); background:var(--green-glow); border:1px solid rgba(34,197,94,0.25); padding:6px 0; border-radius:8px; font-weight:800; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; justify-content:center; gap:4px; filter:drop-shadow(0 0 4px rgba(34,197,94,0.25));">✓ Completed Today ✨</div>`
        : `<button onclick="event.stopPropagation(); quickLog('${h.id}')" style="width:100%; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:1.1px; padding:8px 0; border-radius:8px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; border:none; cursor:pointer; box-shadow:0 4px 12px rgba(99,102,241,0.3); transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:4px;">✓ Complete</button>`;

    return `
        <div class="stat-card dashboard-habit-card ${isHigh ? 'priority-high' : ''}" onclick="selectHabit('${h.id}')" 
             style="cursor:pointer; padding:1.25rem; display:flex; flex-direction:column; gap:12px; min-height:200px; position:relative; overflow:hidden; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); border-radius: 20px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); ${priorityBorder}">
            
            ${isHigh ? `<div style="position:absolute; top:0; left:0; width:100%; height:3px; background:linear-gradient(90deg, transparent, #fbbf24, #d946ef, transparent); opacity:0.9; z-index: 2;"></div>` : ''}

            <div style="display:flex; justify-content:space-between; align-items:center; position:relative; z-index:1;">
                <div style="position:relative; width:48px; height:48px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <svg width="48" height="48" style="position:absolute; top:0; left:0; transform: rotate(-90deg);">
                        <circle stroke="rgba(255,255,255,0.06)" stroke-width="2.5" fill="transparent" r="20" cx="24" cy="24"/>
                        <circle stroke="${isDoneToday ? 'var(--green)' : h.color}" stroke-width="3" stroke-linecap="round" fill="transparent" r="20" cx="24" cy="24"
                                style="stroke-dasharray: 125.66; stroke-dashoffset: ${125.66 - (125.66 * progressPct) / 100}; transition: stroke-dashoffset 0.8s ease-in-out; filter: drop-shadow(0 0 5px ${isDoneToday ? 'var(--green)' : h.color}aa);"/>
                    </svg>
                    <span style="font-size:1.3rem; position:relative; z-index:1; filter: drop-shadow(0 0 3px rgba(255,255,255,0.2));">
                        ${isDoneToday ? '✨' : h.icon}
                    </span>
                </div>

                <div style="display:flex; align-items:center; gap:8px;">
                    ${isHigh ? '<span title="High Priority" style="color:#fbbf24; font-size:1rem; animation: starPulse 2s infinite alternate; display: inline-block;">⭐️</span>' : ''}
                    ${stats.current > 0 ? `<span style="font-size:0.75rem; color:var(--amber); background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); padding:3px 8px; border-radius:12px; font-weight:800; animation: firePulse 1.5s infinite alternate; display: inline-flex; align-items:center; gap:3px;">🔥 ${stats.current}d</span>` : ''}
                </div>
            </div>

            <div style="position:relative; z-index:1; margin-top:4px;">
                <div style="font-weight:900; font-size:1.2rem; color:var(--text); line-height:1.2; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${h.name}">
                    ${h.name}
                </div>
                <div style="font-size:0.7rem; color:var(--dim); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:4px; opacity:0.8;">
                    <span>⏱️ Last: <strong>${lastText}</strong></span>
                </div>
            </div>

            <div style="position:relative; z-index:1; margin-top:auto; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.6rem; color:var(--dim); text-transform:uppercase; letter-spacing:1px; font-weight:800;">Consistency (7d)</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:5px;">${sparklineHTML}</div>
                </div>
            </div>

            <div style="position:relative; z-index:1; margin-top:4px; padding-top:4px;">
                ${completeActionHTML}
            </div>

            <div style="position:absolute; top:-20px; right:-20px; width:120px; height:120px; background:radial-gradient(circle, ${isHigh ? '#fbbf24' : h.color} 0%, transparent 70%); opacity:0.12; filter:blur(30px); border-radius:50%; pointer-events:none;"></div>
            <div style="position:absolute; bottom:-30px; left:-30px; width:100px; height:100px; background:radial-gradient(circle, #8b5cf6 0%, transparent 70%); opacity:0.08; filter:blur(25px); border-radius:50%; pointer-events:none;"></div>
        </div>
    `;
}

export function renderWeeklyCalendarRow() {
    const today = new Date();
    const todayStr = fmtDate(today);
    
    const dow = today.getDay();
    const off = dow === 0 ? 6 : dow - 1;
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - off);
    startOfWeek.setHours(0,0,0,0);

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    let calendarHTML = '';

    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const dStr = fmtDate(d);
        const isToday = dStr === todayStr;
        const dayLabel = dayLabels[i];
        const dayNum = d.getDate();

        if (isToday) {
            calendarHTML += `
                <div style="display:flex; flex-direction:column; align-items:center; position:relative;">
                    <div class="today-pill" style="background:linear-gradient(135deg, #8b5cf6, #6366f1); color:#fff; border-radius:12px; padding:10px 14px; min-width:54px; text-align:center; font-weight:800; box-shadow:0 8px 24px rgba(99,102,241,0.35); border:1px solid rgba(255,255,255,0.1); transform:scale(1.05); transition: transform 0.2s ease;">
                        <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.5px; opacity:0.8;">${dayLabel}</div>
                        <div style="font-size:1.15rem; margin-top:2px;">${dayNum}</div>
                    </div>
                    <div style="width:5px; height:5px; border-radius:50%; background:#d946ef; position:absolute; bottom:-10px; left:50%; transform:translateX(-50%); box-shadow:0 0 8px #d946ef, 0 0 15px #d946ef;"></div>
                </div>
            `;
        } else {
            calendarHTML += `
                <div style="display:flex; flex-direction:column; align-items:center; padding:10px 14px; min-width:54px; text-align:center; color:var(--dim); opacity:0.75; font-weight:700;">
                    <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.5px;">${dayLabel}</div>
                    <div style="font-size:1.15rem; margin-top:2px; color:rgba(255,255,255,0.85);">${dayNum}</div>
                </div>
            `;
        }
    }

    const monthYearStr = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return `
        <style>
            @keyframes todayFloat {
                0% { transform: translateY(0px) scale(1.05); }
                100% { transform: translateY(-5px) scale(1.05); }
            }
            .today-pill {
                animation: todayFloat 1.8s ease-in-out infinite alternate;
            }
            .no-scrollbar::-webkit-scrollbar {
                display: none;
            }
        </style>
        <div style="background:rgba(15, 23, 42, 0.45); backdrop-filter:blur(12px); border:1px solid var(--border); border-radius:20px; padding:1.25rem 1.5rem; margin-bottom: 2rem; display:flex; flex-direction:column; gap:12px;">
            <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:2px; color:var(--dim); font-weight:800; display:flex; align-items:center; gap:6px;">
                <span>📅</span> ${monthYearStr}
            </div>
            <div class="no-scrollbar" style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px; overflow-x:auto; overflow-y:hidden; padding-bottom:4px; -ms-overflow-style:none; scrollbar-width:none;">
                ${calendarHTML}
            </div>
        </div>
    `;
}

export function renderWelcome() {
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

export function renderMain() {
    if (state.activeHabit === 'dashboard') {
        renderDashboard();
        return;
    }
    if (state.activeHabit === 'tags') {
        renderTagsDashboard();
        return;
    }
    if (state.activeHabit === 'reflections') {
        renderReflectionsDashboard();
        return;
    }
    const h = state.habits.find(x => x.id === state.activeHabit);
    if (!h) { renderWelcome(); return; }
    const ss = state.sessions.filter(s => s.habitId === h.id && (s.status === 'Approved' || s.status === 'Draft') && !s.is_deleted);
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
                            <circle class="ring-fill" stroke="${h.color}" stroke-width="7" fill="transparent" r="32" cx="40" cy="40" style="stroke-dashoffset:${201 - 201 * Math.min(stats.weekDays / 5, 1)};filter:drop-shadow(0 0 6px ${h.color}40)"/>
                        </svg>
                        <div class="ring-text">${Math.min(Math.round(stats.weekDays / 5 * 100), 100)}%</div>
                    </div>
                </div>
            </div>
        </div>

        ${h.goal_target ? `
        <div class="section-card mastery-card" style="margin-bottom:1.8rem; padding:1.8rem; position:relative; overflow:hidden; border: 1px solid ${h.color}30; background: linear-gradient(145deg, var(--card), ${h.color}0a);">
            <div style="position:absolute; top:-50%; right:-10%; width:200px; height:200px; background:${h.color}; filter:blur(100px); opacity:0.15; border-radius:50%; pointer-events:none;"></div>
            
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:1.2rem; position:relative; z-index:1;">
                <div>
                    <h3 style="font-size:1.1rem; font-weight:800; display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                        <span style="font-size:1.2rem;">✨</span> Mastery Progress
                    </h3>
                    <p style="font-size:0.8rem; color:var(--dim); font-weight:500;">
                        Target: <strong style="color:var(--text)">${h.goal_target} ${h.goal_type === 'value' ? (h.unit || 'units') : 'sessions'}</strong>
                    </p>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:2.8rem; font-weight:900; line-height:1; color:${h.color}; text-shadow: 0 0 25px ${h.color}60; font-variant-numeric: tabular-nums;">
                        ${Math.min(Math.round(((h.goal_type === 'value' ? Math.max(...ss.map(s => s.value || 0), 0) : stats.total) / h.goal_target) * 100), 100)}<span style="font-size:1.4rem;opacity:0.8">%</span>
                    </div>
                </div>
            </div>
            
            <div style="position:relative; z-index:1; margin-bottom:1rem;">
                <div style="height:16px; background:rgba(0,0,0,0.6); border-radius:8px; overflow:hidden; box-shadow:inset 0 2px 8px rgba(0,0,0,0.9); position:relative;">
                    <div style="height:100%; width:${Math.min(((h.goal_type === 'value' ? Math.max(...ss.map(s => s.value || 0), 0) : stats.total) / h.goal_target) * 100, 100)}%; background:linear-gradient(90deg, ${h.color}60, ${h.color}); box-shadow:0 0 20px ${h.color}90; border-radius:8px; transition:width 1s cubic-bezier(0.4, 0, 0.2, 1); position:relative; overflow:hidden;">
                        <div style="position:absolute; top:0; left:-100%; right:0; bottom:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent); transform:skewX(-20deg); animation:shimmer 2.5s infinite;"></div>
                    </div>
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; position:relative; z-index:1;">
                <p style="font-size:0.8rem; color:var(--dim); font-weight:500;">
                    Currently at: <strong style="color:var(--text)">${h.goal_type === 'value' ? Math.max(...ss.map(s => s.value || 0), 0) : stats.total}</strong>
                </p>
                ${Math.min(Math.round(((h.goal_type === 'value' ? Math.max(...ss.map(s => s.value || 0), 0) : stats.total) / h.goal_target) * 100), 100) >= 100 ? `<span style="font-size:0.8rem; font-weight:700; color:var(--green); background:var(--green-glow); padding:4px 10px; border-radius:12px; box-shadow: 0 0 10px var(--green-glow);">🎉 Goal Reached!</span>` : `<span style="font-size:0.8rem; color:var(--dim); font-weight:500;">Keep going! 🚀</span>`}
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
        ${h.show_time_breakdown ? renderTimeOfDayBreakdown(ss, h) : ''}
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

    renderHeatmap(state.currentYear, h, ss);
    renderYearPills(ss);
    renderTable();
    renderAchievements(h, stats);
}

export function renderProgressSection(h, ss) {
    const withVal = ss.filter(s => s.value != null).sort((a, b) => a.date.localeCompare(b.date));
    if (withVal.length < 2 || !h.unit) return '';
    const vals = withVal.map(s => parseFloat(s.value));
    const first = vals[0], last = vals[vals.length - 1], best = Math.max(...vals);
    const gain = first > 0 ? Math.round((best - first) / first * 100) : 0;
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
                    const pct = best > 0 ? Math.max(parseFloat(s.value) / best * 100, 8) : 50;
                    return `<div style="flex:1;height:${pct}%;background:${h.color};border-radius:3px 3px 0 0;opacity:0.7;transition:0.3s;min-width:4px" title="${s.date}: ${s.value} ${h.unit || ''}"></div>`;
                }).join('')}
            </div>
        </section>
    </div>`;
}

export function computeStats(ss) {
    const dates = [...new Set(ss.map(s => s.date))].sort();
    let current = 0, longest = 0;
    if (dates.length) {
        let t = 1;
        for (let i = 1; i < dates.length; i++) {
            const diff = Math.round((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000);
            if (diff === 1) t++; else { longest = Math.max(longest, t); t = 1; }
        }
        longest = Math.max(longest, t);
        const latest = new Date(dates[dates.length - 1]); latest.setHours(0, 0, 0, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (Math.round((today - latest) / 86400000) <= 1) {
            t = 1;
            for (let i = dates.length - 2; i >= 0; i--) {
                if (Math.round((new Date(dates[i + 1]) - new Date(dates[i])) / 86400000) === 1) t++; else break;
            }
            current = t;
        }
    }
    const today = new Date(), dow = today.getDay(), off = dow === 0 ? 6 : dow - 1;
    const mon = new Date(today); mon.setDate(today.getDate() - off); mon.setHours(0, 0, 0, 0);
    let weekDays = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); if (dates.includes(fmtDate(d))) weekDays++; }
    const bestValue = ss.length ? Math.max(...ss.map(s => parseFloat(s.value) || 0), 0) : 0;
    return { current, longest, total: ss.length, weekDays, bestValue };
}

export function renderHeatmap(year, h, ss) {
    const grid = document.getElementById('heatmapGrid');
    const monthRow = document.getElementById('monthLabels');
    if (!grid) return;
    grid.innerHTML = ''; monthRow.innerHTML = '';

    const dc = {}; ss.forEach(s => { dc[s.date] = (dc[s.date] || 0) + 1; });
    let yt = 0; ss.forEach(s => { if (s.date.startsWith(String(year))) yt++; });
    document.getElementById('yearlyTotal').textContent = `${yt} in ${year}`;

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const end = new Date(year, 11, 31), today = new Date(); today.setHours(0, 0, 0, 0);
    let cur = new Date(year, 0, 1);
    cur.setDate(cur.getDate() - (cur.getDay() === 0 ? 6 : cur.getDay() - 1));
    let lm = -1;
    for (let i = 0; i < 53 * 7; i++) {
        const ds = fmtDate(cur), day = document.createElement('div');
        day.className = 'heatmap-day';
        if (cur.getFullYear() === year) {
            const c = dc[ds] || 0;
            if (cur > today) { day.classList.add('future'); }
            else if (c > 0) { day.style.background = h.color; day.classList.add('level-' + Math.min(c, 4)); }
            
            if (state.selectedHeatmapDate === ds) day.classList.add('selected');
            
            day.onclick = () => {
                if (state.selectedHeatmapDate === ds) state.selectedHeatmapDate = null;
                else state.selectedHeatmapDate = ds;
                renderMain();
            };

            day.onmouseover = e => { const tt = document.getElementById('tooltip'); tt.textContent = `${c} session${c !== 1 ? 's' : ''} — ${ds}${state.selectedHeatmapDate === ds ? ' (Filtered)' : ''}`; tt.style.display = 'block'; tt.style.left = (e.clientX + 10) + 'px'; tt.style.top = (e.clientY + 10) + 'px'; };
            day.onmouseout = () => document.getElementById('tooltip').style.display = 'none';
            if (cur.getDate() <= 7 && cur.getMonth() !== lm && i % 7 === 0) { const ml = document.createElement('div'); ml.textContent = months[cur.getMonth()]; ml.style.gridColumn = Math.floor(i / 7) + 1; monthRow.appendChild(ml); lm = cur.getMonth(); }
        } else { day.style.opacity = '0.02'; }
        grid.appendChild(day);
        cur.setDate(cur.getDate() + 1);
        if (cur > end && cur.getDay() === 1) break;
    }
}

export function renderYearPills(ss) {
    const years = new Set(ss.map(s => parseInt(s.date.substring(0, 4)))); years.add(new Date().getFullYear());
    const pills = document.getElementById('yearPills');
    if (!pills) return;
    pills.innerHTML = [...years].sort((a, b) => b - a).map(y =>
        `<button class="year-pill ${y === state.currentYear ? 'active' : ''}" onclick="switchYear(${y})">${y}</button>`
    ).join('');
}

export function getTimeOfDay(createdAt) {
    if (!createdAt) return { symbol: '—', label: '', cls: '' };
    const hour = new Date(createdAt).getHours();
    if (hour >= 5 && hour < 12) return { symbol: '🌅', label: 'Morning', cls: 'time-morning' };
    if (hour >= 12 && hour < 18) return { symbol: '☀️', label: 'Afternoon', cls: 'time-afternoon' };
    return { symbol: '🌙', label: 'Night', cls: 'time-night' };
}

export function renderTimeOfDayBreakdown(ss, h) {
    const approved = ss.filter(s => s.status === 'Approved');
    if (approved.length === 0) return '';

    const buckets = [
        { key: 'morning', symbol: '🌅', label: 'Morning', cls: 'time-morning', range: '5 AM – 12 PM', count: 0, totalVal: 0, valCount: 0 },
        { key: 'afternoon', symbol: '☀️', label: 'Afternoon', cls: 'time-afternoon', range: '12 PM – 6 PM', count: 0, totalVal: 0, valCount: 0 },
        { key: 'night', symbol: '🌙', label: 'Night', cls: 'time-night', range: '6 PM – 5 AM', count: 0, totalVal: 0, valCount: 0 },
    ];

    approved.forEach(s => {
        const tod = getTimeOfDay(s.created_at);
        const bucket = buckets.find(b => b.cls === tod.cls);
        if (bucket) {
            bucket.count++;
            if (s.value != null && s.value !== '') {
                bucket.totalVal += parseFloat(s.value) || 0;
                bucket.valCount++;
            }
        }
    });

    const total = approved.length;
    const rows = buckets.map(b => {
        const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
        const avg = b.valCount > 0 ? (b.totalVal / b.valCount).toFixed(1) : '—';
        const barWidth = pct;
        return `<tr>
            <td>
                <span class="time-of-day-badge ${b.cls}" style="min-width:110px; justify-content:center;">
                    ${b.symbol}<span class="tod-label">${b.label}</span>
                </span>
            </td>
            <td style="color:var(--dim); font-size:0.72rem;">${b.range}</td>
            <td style="font-weight:700; font-variant-numeric:tabular-nums;">${b.count}</td>
            <td style="width:35%;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="flex:1; height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
                        <div style="height:100%; width:${barWidth}%; background:${h.color}; border-radius:4px; transition:width 0.6s ease; box-shadow:0 0 8px ${h.color}40;"></div>
                    </div>
                    <span style="font-size:0.72rem; color:var(--dim); font-weight:600; min-width:32px; text-align:right;">${pct}%</span>
                </div>
            </td>
            <td style="font-weight:700; color:${h.color}; font-variant-numeric:tabular-nums;">${avg}${avg !== '—' && h.unit ? ' <span style="font-size:0.7rem; color:var(--dim); font-weight:500;">' + h.unit + '</span>' : ''}</td>
        </tr>`;
    }).join('');

    return `
    <section class="section-card">
        <span class="section-title">⏰ Time of Day Breakdown</span>
        <div class="table-wrapper" style="margin-top:1rem;">
            <table>
                <thead><tr>
                    <th>Period</th>
                    <th>Hours</th>
                    <th>Sessions</th>
                    <th>Distribution</th>
                    <th>Avg Value</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </section>`;
}

export function renderTable() {
    const h = state.habits.find(x => x.id === state.activeHabit);
    if (!h) return;
    const wrap = document.getElementById('tableWrap');
    if (!wrap) return;

    let ss = state.sessions.filter(s => s.habitId === h.id);
    if (state.selectedHeatmapDate) {
        ss = ss.filter(s => s.date === state.selectedHeatmapDate);
    }
    const q = (document.getElementById('activitySearch')?.value || '').toLowerCase();

    if (q) ss = ss.filter(s => s.date.includes(q) || (s.notes || '').toLowerCase().includes(q));

    ss.sort((a, b) => {
        let va = a[state.sortField] || '', vb = b[state.sortField] || '';
        if (state.sortField === 'value') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
        return state.sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    let html = '';
    if (state.selectedHeatmapDate) {
        html += `<div style="display:flex; align-items:center; gap:10px; margin-bottom:1.5rem; padding:10px 15px; background:var(--accent-glow); border-radius:var(--radius-sm); border:1px solid var(--accent); animation: slideDown 0.3s ease;">
            <span style="font-size:0.85rem; font-weight:700; color:var(--accent)">📅 Filtering: ${state.selectedHeatmapDate}</span>
            <button class="btn btn-ghost" style="padding:4px 10px; font-size:0.75rem; height:auto; color:var(--text)" onclick="state.selectedHeatmapDate=null; renderMain();">Clear Filter</button>
        </div>`;
    }

    if (ss.length === 0) {
        wrap.innerHTML = html + `<div class="empty-state"><div class="empty-icon">📝</div><h3>No sessions yet on this day</h3><p>Select another day or clear the filter to see history.</p></div>`;
        return;
    }

    const totalCount = ss.length;
    const isSearching = q.length > 0;
    const limit = (isSearching || state.showAllSessions || state.selectedHeatmapDate) ? 100 : 5;
    const displayList = ss.slice(0, limit);

    html += `<div class="table-wrapper"><table><thead><tr>
        <th onclick="doSort('date')">Date${state.sortField === 'date' ? (state.sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>
        <th>Time</th>
        <th onclick="doSort('value')">Value${state.sortField === 'value' ? (state.sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>
        <th>Status</th>
        <th class="col-tags">Tags</th>
        <th class="col-evidence">Evidence</th>
        <th>Notes</th>
        <th>Actions</th></tr></thead><tbody>
        ${displayList.map(s => {
            const vd = s.value != null ? `<span class="value-tag" style="background:${h.color}20;color:${h.color}">${s.value}${h.unit ? ' ' + h.unit : ''}</span>` : '<span style="color:var(--dim)">—</span>';
            const mediaBtn = s.media ? `<button class="action-btn view-btn" onclick="openMedia('${s.id}')" style="background:${h.color}20; color:${h.color}">👁 View</button>` : '<span style="color:var(--dim); font-size:0.7rem">None</span>';
            const statusLabel = s.status === 'Approved' ? `<span style="color:var(--green); font-size:0.75rem; font-weight:700; padding:2px 6px; background:var(--green-glow); border-radius:4px; white-space:nowrap;">✓ Approved</span>` : `<span style="color:var(--dim); font-size:0.75rem; font-weight:600; padding:2px 6px; background:rgba(255,255,255,0.05); border-radius:4px; white-space:nowrap;">Draft</span>`;

            const sessionTags = (s.tag_ids || []).map(tid => state.tags.find(t => t.id === tid)).filter(Boolean);
            const tagsHTML = sessionTags.map(t => `<span class="tag-pill">${t.name}</span>`).join('');

            let actionsHTML = '';
            if (s.status !== 'Approved') {
                actionsHTML += `<button class="action-btn" onclick="approveSession('${s.id}')" title="Approve" style="margin-right:4px; color:var(--green)">✓</button>`;
                actionsHTML += `<button class="action-btn" onclick="openEditSession('${s.id}')" title="Edit" style="margin-right:4px">✏️</button>`;
                actionsHTML += `<button class="action-btn" onclick="confirmDeleteSession('${s.id}')" title="Delete">✕</button>`;
            } else {
                actionsHTML += `<span style="color:var(--dim); font-size:0.8rem">Locked</span>`;
            }

            const tod = getTimeOfDay(s.created_at);
            return `<tr>
                    <td>${s.date}</td>
                    <td><span class="time-of-day-badge ${tod.cls}" title="${tod.label}">${tod.symbol}<span class="tod-label">${tod.label}</span></span></td>
                    <td>${vd}</td>
                    <td>${statusLabel}</td>
                    <td class="col-tags">${tagsHTML}</td>
                    <td class="col-evidence">${mediaBtn}</td>
                    <td style="color:var(--dim);font-size:0.78rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.notes || '—'}</td>
                    <td style="white-space:nowrap">
                        ${actionsHTML}
                    </td>
                </tr>`;
        }).join('')}</tbody></table></div>`;

    if (!isSearching && totalCount > 5) {
        html += `<div style="text-align:center; margin-top:1rem;">
            <button class="btn btn-ghost" style="font-size:0.8rem" onclick="toggleShowAll()">
                ${state.showAllSessions ? '↑ Show Less' : `↓ View Full History (${totalCount} sessions)`}
            </button>
        </div>`;
    }
    wrap.innerHTML = html;
}

export function renderAchievements(habit, stats) {
    const habitMilestones = state.milestones.filter(m => m.habit_id === habit.id);

    const standardDefs = [
        { title: "First Step", desc: "Log 1 session", icon: "🌱", check: s => s.total >= 1 },
        { title: "Week Warrior", desc: "7-day streak", icon: "🔥", check: s => s.longest >= 7 },
        { title: "Unstoppable", desc: "30-day streak", icon: "💎", check: s => s.longest >= 30 },
        { title: "Centurion", desc: "100 sessions", icon: "👑", check: s => s.total >= 100 },
    ];

    const customDefs = habitMilestones.map(m => ({
        title: m.title,
        desc: `Reach ${m.target_count} ${habit.goal_type === 'value' ? (habit.unit || 'units') : 'sessions'}`,
        icon: m.icon || '🎯',
        check: s => (habit.goal_type === 'value' ? stats.bestValue : s.total) >= m.target_count
    }));

    const defs = [...standardDefs, ...customDefs];

    const el = document.getElementById('achieveGrid');
    if (!el) return;
    el.innerHTML = defs.map(a => {
        const earned = a.check(stats);
        return `<div class="achievement-item ${earned ? 'earned' : 'locked'}"><span class="achievement-emoji">${a.icon}</span><div class="achievement-info"><div class="achievement-title">${a.title}</div><div class="achievement-desc">${a.desc}</div></div></div>`;
    }).join('');
}

export function renderTagsDashboard() {
    const main = document.getElementById('mainContent');
    main.innerHTML = `
        <div class="habit-header">
            <div class="habit-title-group">
                <span class="habit-title-icon">🏷️</span>
                <div>
                    <div class="habit-title">Tags & Groups</div>
                    <div class="habit-desc-header">Organize your habits and sessions</div>
                </div>
            </div>
        </div>

        <div class="two-col">
            <section class="section-card">
                <span class="section-title">Session Tags</span>
                <div class="form-group" style="margin-top:1rem;">
                    <label>Create New Tag</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="newTagName" placeholder="Tag name..." style="flex:1">
                        <button class="btn btn-primary" onclick="handleAddTag()" style="padding: 0 16px;">Add</button>
                    </div>
                </div>
                <div id="tagManagerList" style="display:flex; flex-direction:column; gap:10px; margin-top:20px;"></div>
            </section>

            <section class="section-card">
                <span class="section-title">Habit Groups</span>
                <div class="form-group" style="margin-top:1rem;">
                    <label>Create New Group</label>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <input type="text" id="newGroupName" placeholder="Group name..." style="flex:2; min-width:150px;">
                        <input type="text" id="newGroupIcon" placeholder="📁" style="flex:0.5; min-width:60px; text-align:center;">
                        <button class="btn btn-primary" onclick="handleAddGroup()" style="flex:1; min-width:80px;">Add</button>
                    </div>
                </div>
                <div id="groupManagerList" style="display:flex; flex-direction:column; gap:10px; margin-top:20px;"></div>
            </section>
        </div>
    `;
    renderTagManager();
    renderGroupManager();
}

export function renderGroupManager() {
    const list = document.getElementById('groupManagerList');
    if (!list) return;
    list.innerHTML = state.habitGroups.map(g => {
        const count = state.habits.filter(h => h.group_id === g.id).length;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:1.4rem;">${g.icon}</span>
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-size:0.9rem; font-weight:700;">${g.name}</span>
                        <span style="font-size:0.7rem; color:var(--dim);">${count} habits in this group</span>
                    </div>
                </div>
                <button class="action-btn" onclick="handleDeleteGroup('${g.id}')" style="color:var(--red); border-color:transparent;">✕</button>
            </div>
        `;
    }).join('');
    if (state.habitGroups.length === 0) list.innerHTML = '<div style="text-align:center; color:var(--dim); padding:2rem;">No groups yet.</div>';
}

export function renderTagManager() {
    const list = document.getElementById('tagManagerList');
    if (!list) return;
    list.innerHTML = state.tags.map(t => {
        const usageCount = state.sessions.filter(s => (s.tag_ids || []).includes(t.id)).length;
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
    if (state.tags.length === 0) list.innerHTML = '<div style="text-align:center; color:var(--dim); font-size:0.85rem; padding:2rem;">No tags created yet. Start by adding one above!</div>';
}

export function renderEditMilestones(habitId) {
    const list = document.getElementById('editMilestonesList');
    if (!list) return;
    const ms = state.milestones.filter(m => m.habit_id === habitId);
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

export function renderLogTemplates(habitId) {
    const container = document.getElementById('logTemplatesContainer');
    const list = document.getElementById('logTemplatesList');
    if (!container || !list) return;

    const templates = state.sessionTemplates.filter(t => t.habit_id === habitId);
    if (templates.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = templates.map(t => `
        <button type="button" class="preset-pill" onclick="applyTemplate('${t.id}')">
            ⚡ ${t.name}
        </button>
    `).join('');
}

export function renderEditTemplates(habitId) {
    const list = document.getElementById('editTemplatesList');
    if (!list) return;

    const templates = state.sessionTemplates.filter(t => t.habit_id === habitId);
    list.innerHTML = templates.map(t => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px;">
            <div style="display:flex; flex-direction:column; gap: 2px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size:0.85rem; font-weight:700;">⚡ ${t.name}</span>
                    ${t.value != null ? `<span style="font-size:0.7rem; color:var(--accent); font-weight:600; background:var(--accent)15; padding: 2px 6px; border-radius: 4px;">Val: ${t.value}</span>` : ''}
                </div>
                <div style="font-size:0.7rem; color:var(--dim);">${t.notes || 'No default notes'}</div>
            </div>
            <button type="button" class="action-btn" onclick="handleDeleteTemplate('${t.id}')" style="color:var(--red); border-color:transparent;">✕</button>
        </div>
    `).join('');
    
    if (templates.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:var(--dim); font-size:0.75rem; padding: 10px;">No presets yet. Create one below!</div>';
    }
}

export function renderReflectionsDashboard() {
    const main = document.getElementById('mainContent');
    const today = fmtDate(new Date());
    const existing = state.reflections.find(r => r.date === today);

    main.innerHTML = `
        <div class="habit-header">
            <div class="habit-title-group">
                <span class="habit-title-icon">📔</span>
                <div>
                    <div class="habit-title">Daily Reflections</div>
                    <div class="habit-desc-header">Track your mindset, mood, and daily thoughts</div>
                </div>
            </div>
        </div>

        <div class="section-card" style="margin-bottom:1.5rem; padding: 1.5rem 1.8rem;">
            <span class="section-title" style="font-size: 0.85rem; letter-spacing: 1.5px;">MINDSET & ENERGY TREND (LAST 10 DAYS)</span>
            <div id="mindsetTrendChart" style="margin-top:1.5rem; height:160px; position:relative; width:100%;"></div>
        </div>

        <div class="two-col">
            <section class="section-card">
                <span class="section-title">${existing ? "Update Today's Reflection" : "Log Today's Reflection"}</span>
                <form id="reflectionForm" onsubmit="handleReflectionSubmit(event)" style="margin-top:1.5rem; display:flex; flex-direction:column; gap:1.5rem;">
                    <div class="form-group">
                        <label>How is your mood today?</label>
                        <div class="icon-picker" id="moodPicker">
                            ${state.moods.map(m => `
                                <div class="icon-opt ${existing?.mood === m.value ? 'selected' : ''}" 
                                     data-val="${m.value}" 
                                     title="${m.label}: ${m.description || ''}">${m.icon}</div>
                            `).join('')}
                        </div>
                        <div id="moodHint" style="font-size: 0.7rem; color: var(--dim); margin-top: 8px; min-height: 1em;">
                            ${existing?.mood ? state.moods.find(m => m.value === existing.mood)?.description || '' : 'Select a mood to see more...'}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Energy Level</label>
                        <div class="icon-picker" id="energyPicker">
                            ${state.energies.map(e => `
                                <div class="icon-opt ${existing?.energy === e.value ? 'selected' : ''}" 
                                     data-val="${e.value}" 
                                     title="${e.label}: ${e.description || ''}">${e.icon}</div>
                            `).join('')}
                        </div>
                        <div id="energyHint" style="font-size: 0.7rem; color: var(--dim); margin-top: 8px; min-height: 1em;">
                            ${existing?.energy ? state.energies.find(e => e.value === existing.energy)?.description || '' : 'Select energy level to see more...'}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes / Journal</label>
                        <textarea id="reflectionNotes" rows="4" placeholder="How was your day? What's on your mind?">${existing?.journal_text || ''}</textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%">${existing ? 'Update' : 'Save Reflection'}</button>
                </form>
            </section>

            <section class="section-card">
                <span class="section-title">History</span>
                <div id="reflectionHistory" style="margin-top:1.5rem; display:flex; flex-direction:column; gap:1rem; max-height:600px; overflow-y:auto; padding-right:8px;">
                    <!-- History injected here -->
                </div>
            </section>
        </div>
    `;

    document.querySelectorAll('#moodPicker .icon-opt, #energyPicker .icon-opt').forEach(opt => {
        opt.onclick = () => {
            const isMood = opt.parentElement.id === 'moodPicker';
            const list = isMood ? state.moods : state.energies;
            const hintId = isMood ? 'moodHint' : 'energyHint';
            const val = parseInt(opt.dataset.val);
            const item = list.find(x => x.value === val);

            opt.parentElement.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');

            if (item && document.getElementById(hintId)) {
                document.getElementById(hintId).textContent = item.description || '';
            }
        };
    });

    renderMindsetChart();
    renderReflectionHistory();
}

export function decryptNote(element, originalText) {
    if (!originalText) return;
    
    // Smooth matrix decryption aesthetic
    let currentIteration = 0;
    const chars = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789@#$%&*";
    const speed = 25; // millisecond tick speed
    const duration = 12; // ticks per character
    
    const container = element;
    container.style.filter = "none";
    container.style.opacity = "1";
    container.style.letterSpacing = "normal";
    
    const lockSymbol = container.nextElementSibling;
    if (lockSymbol && lockSymbol.textContent === '🔒') {
        lockSymbol.style.opacity = '0.9';
        lockSymbol.textContent = '🔓';
    }

    const interval = setInterval(() => {
        const progress = Math.floor(currentIteration / duration);
        let randomized = "";
        
        for (let i = 0; i < originalText.length; i++) {
            if (i < progress) {
                randomized += originalText[i];
            } else {
                randomized += chars[Math.floor(Math.random() * chars.length)];
            }
        }
        
        container.textContent = randomized;
        currentIteration++;
        
        if (progress >= originalText.length) {
            clearInterval(interval);
            container.textContent = originalText;
        }
    }, speed);
    
    // Disable clicking after first decryption trigger
    container.onclick = null;
    container.style.cursor = "default";
}

export function renderReflectionHistory() {
    const list = document.getElementById('reflectionHistory');
    if (!list) return;
    const sorted = [...state.reflections].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    if (state.reflections.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:var(--dim); padding:2rem;">No history yet.</div>';
        return;
    }

    list.innerHTML = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="width:100px">Date</th>
                        <th>Mood</th>
                        <th>Energy</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map((r, idx) => {
                        const moodObj = state.moods.find(m => m.value == r.mood);
                        const energyObj = state.energies.find(e => e.value == r.energy);
                        const mLabel = moodObj ? moodObj.label : '—';
                        const mIcon = moodObj ? moodObj.icon : '';
                        const eLabel = energyObj ? energyObj.label : '—';
                        const eIcon = energyObj ? energyObj.icon : '';
                        
                        const isRecent = idx < 2;
                        const displayNote = isRecent 
                            ? (r.journal_text || '—') 
                            : `<span class="revealable-note" onclick="decryptNote(this, \`${r.journal_text ? r.journal_text.replace(/`/g, '\\`').replace(/\$/g, '\\$') : ''}\`)" style="filter: blur(3.5px); opacity: 0.3; user-select: none; pointer-events: auto; cursor: pointer; transition: all 0.3s ease; display: inline-block; letter-spacing: 2px;" title="Click to decrypt entry">${r.journal_text ? '••••••••••••••••••••' : '—'}</span><span style="font-size:0.65rem; opacity:0.35; margin-left:6px; transition: opacity 0.3s ease;">🔒</span>`;
                            
                        return `
                            <tr>
                                <td style="font-weight:600; white-space:nowrap">${r.date}</td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span style="font-size:1.1rem">${mIcon}</span>
                                        <span style="font-size:0.75rem; font-weight:600">${mLabel}</span>
                                    </div>
                                </td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span style="font-size:1.1rem">${eIcon}</span>
                                        <span style="font-size:0.75rem; font-weight:600">${eLabel}</span>
                                    </div>
                                </td>
                                <td style="color:var(--dim); font-size:0.78rem; line-height:1.4; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" ${isRecent ? `title="${r.journal_text || ''}"` : ''}>
                                    ${displayNote}
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export function renderMindsetChart() {
    const container = document.getElementById('mindsetTrendChart');
    if (!container) return;

    const data = [...state.reflections]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-10);

    if (data.length < 2) {
        container.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--dim); font-size:0.8rem; border: 1px dashed rgba(255,255,255,0.06); border-radius:8px;">Add at least 2 reflections to view trends</div>`;
        return;
    }

    const width = container.clientWidth || 500;
    const height = 150;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    const minVal = 1;
    const maxVal = 5;
    const valRange = maxVal - minVal;

    const getX = (idx) => paddingLeft + (idx / (data.length - 1)) * chartW;
    const getY = (val) => {
        const v = parseFloat(val) || 3;
        const normalized = (v - minVal) / valRange;
        return height - paddingBottom - normalized * chartH;
    };

    let moodPoints = [];
    let energyPoints = [];

    data.forEach((r, idx) => {
        moodPoints.push(`${getX(idx)},${getY(r.mood)}`);
        energyPoints.push(`${getX(idx)},${getY(r.energy)}`);
    });

    const moodPath = `M ${moodPoints.join(' L ')}`;
    const energyPath = `M ${energyPoints.join(' L ')}`;

    let gridLinesHtml = '';
    for (let i = 1; i <= 5; i++) {
        const y = getY(i);
        let label = '';
        if (i === 1) label = 'Low';
        if (i === 3) label = 'Avg';
        if (i === 5) label = 'Peak';
        
        gridLinesHtml += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />
            ${label ? `<text x="${paddingLeft - 10}" y="${y + 4}" fill="var(--dim)" font-size="9" text-anchor="end" font-weight="600">${label}</text>` : ''}
        `;
    }

    let dateLabelsHtml = '';
    const step = Math.max(1, Math.floor(data.length / 4));
    data.forEach((r, idx) => {
        if (idx % step === 0 || idx === data.length - 1) {
            const x = getX(idx);
            const shortDate = r.date.substring(5);
            dateLabelsHtml += `
                <text x="${x}" y="${height - 10}" fill="var(--dim)" font-size="9" text-anchor="middle">${shortDate}</text>
            `;
        }
    });

    let dotsHtml = '';
    data.forEach((r, idx) => {
        const mx = getX(idx);
        const my = getY(r.mood);
        const ex = getX(idx);
        const ey = getY(r.energy);

        dotsHtml += `
            <circle cx="${mx}" cy="${my}" r="4" fill="#a855f7" stroke="var(--bg-card)" stroke-width="1.5" />
            <circle cx="${ex}" cy="${ey}" r="4" fill="#10b981" stroke="var(--bg-card)" stroke-width="1.5" />
        `;
    });

    container.innerHTML = `
        <svg width="100%" height="${height}" style="overflow:visible;">
            <defs>
                <linearGradient id="moodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#a855f7" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="#a855f7" stop-opacity="0.0" />
                </linearGradient>
                <linearGradient id="energyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#10b981" stop-opacity="0.15" />
                    <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
                </linearGradient>
            </defs>
            
            ${gridLinesHtml}

            <path d="${moodPath} L ${getX(data.length - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z" fill="url(#moodGrad)" />
            <path d="${energyPath} L ${getX(data.length - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z" fill="url(#energyGrad)" />

            <path d="${moodPath}" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px rgba(168,85,247,0.4));" />
            <path d="${energyPath}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px rgba(16,185,129,0.3));" />

            ${dotsHtml}
            ${dateLabelsHtml}
        </svg>
        <div style="display:flex; justify-content:center; gap:20px; font-size:0.75rem; font-weight:600; margin-top:2px;">
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="display:inline-block; width:10px; height:10px; background:#a855f7; border-radius:50%;"></span>
                <span style="color:var(--text);">Mood</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%;"></span>
                <span style="color:var(--text);">Energy</span>
            </div>
        </div>
    `;
}

export function switchYear(year) {
    state.currentYear = year;
    const h = state.habits.find(x => x.id === state.activeHabit);
    if (!h) return;
    const ss = state.sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
    renderHeatmap(state.currentYear, h, ss);
    renderYearPills(ss);
}
