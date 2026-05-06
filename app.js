// ── Track Pro — Cloud Dashboard (Powered by Supabase) ─────────────────────
const SB_URL = 'REMOVED_URL';
const SB_KEY = 'REMOVED_KEY';

// The global 'supabase' object comes from the CDN script
const sbClient = supabase.createClient(SB_URL, SB_KEY);

let habits = [], sessions = [];
let activeHabit = null, currentYear = new Date().getFullYear();
let sortField = 'date', sortDir = 'desc';
let showAllSessions = false;

// ── Persistence (Cloud) ──────────────────────────────────
const loadData = async () => {
    try {
        const { data: hData, error: hErr } = await sbClient.from('habits').select('*');
        const { data: sData, error: sErr } = await sbClient.from('sessions').select('*');
        
        if (hErr || sErr) throw hErr || sErr;

        // Map Supabase snake_case habit_id to habitId for JS compatibility
        habits = hData || [];
        sessions = (sData || []).map(s => ({ ...s, habitId: s.habit_id }));

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

// ── Color Pickers ──────────────────────────────────────
function initColorPickers() {
    document.querySelectorAll('.color-picker').forEach(picker => {
        picker.querySelectorAll('.color-opt').forEach(opt => {
            opt.onclick = () => {
                picker.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            };
        });
    });
}

// ── Init ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initColorPickers();
    await loadData();
    renderSidebar();
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
    nav.innerHTML = habits.map(h => {
        const count = sessions.filter(s => s.habitId === h.id).length;
        return `<div class="habit-nav-item ${activeHabit === h.id ? 'active' : ''}" onclick="selectHabit('${h.id}')">
            <span class="habit-nav-icon">${h.icon}</span>
            <span class="habit-nav-name">${h.name}</span>
            <span class="habit-nav-count">${count}</span>
            <span class="edit-icon" onclick="event.stopPropagation(); openEditHabit('${h.id}')">⚙</span>
        </div>`;
    }).join('');
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

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// ── Main Content ───────────────────────────────────────
function renderMain() {
    const h = habits.find(x => x.id === activeHabit);
    if (!h) { renderWelcome(); return; }
    const ss = sessions.filter(s => s.habitId === h.id);
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
                <span class="section-title">🕒 Sessions</span>
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
    renderAchievements(stats);
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
    return { current, longest, total: ss.length, weekDays };
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
    const ss = sessions.filter(s=>s.habitId===h.id);
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
        <th>Evidence</th>
        <th>Notes</th>
        <th>Actions</th></tr></thead><tbody>
        ${displayList.map(s => {
            const vd = s.value != null ? `<span class="value-tag" style="background:${h.color}20;color:${h.color}">${s.value}${h.unit?' '+h.unit:''}</span>` : '<span style="color:var(--dim)">—</span>';
            const mediaBtn = s.media ? `<button class="action-btn view-btn" onclick="openMedia('${s.id}')" style="background:${h.color}20; color:${h.color}">👁 View</button>` : '<span style="color:var(--dim); font-size:0.7rem">None</span>';
            return `<tr>
                <td>${s.date}</td>
                <td>${vd}</td>
                <td>${mediaBtn}</td>
                <td style="color:var(--dim);font-size:0.78rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.notes||'—'}</td>
                <td><button class="action-btn" onclick="confirmDeleteSession('${s.id}')">✕</button></td>
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

// ── Achievements ───────────────────────────────────────
function renderAchievements(stats) {
    const defs = [
        { title:"First Step", desc:"Log 1 session", icon:"🌱", check: s=>s.total>=1 },
        { title:"Week Warrior", desc:"7-day streak", icon:"🔥", check: s=>s.longest>=7 },
        { title:"Unstoppable", desc:"30-day streak", icon:"💎", check: s=>s.longest>=30 },
        { title:"Half Century", desc:"50 sessions", icon:"⚡", check: s=>s.total>=50 },
        { title:"Centurion", desc:"100 sessions", icon:"👑", check: s=>s.total>=100 },
        { title:"Perfect Week", desc:"5 days this week", icon:"🌟", check: s=>s.weekDays>=5 },
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
    document.getElementById('habitIcon').value='📌'; 
    document.getElementById('habitUnit').value=''; 
    document.getElementById('habitDesc').value='';
    document.querySelectorAll('#colorPicker .color-opt').forEach((o,i)=>{o.classList.toggle('selected',i===0);}); 
    setTimeout(()=>document.getElementById('habitName').focus(),100); 
}

async function handleAddHabit(e) {
    e.preventDefault();
    const name = document.getElementById('habitName').value.trim();
    const icon = document.getElementById('habitIcon').value.trim() || '📌';
    const unit = document.getElementById('habitUnit').value.trim();
    const description = document.getElementById('habitDesc').value.trim();
    const color = document.querySelector('#colorPicker .color-opt.selected')?.dataset.color || '#22c55e';
    if (!name) return;
    const id = 'h_' + Date.now();
    await sbClient.from('habits').insert({ id, name, icon, unit, description, color });
    await loadData(); activeHabit = id; closeModal('addHabitModal'); renderSidebar(); renderMain();
}

function openEditHabit(id) {
    const h = habits.find(x=>x.id===id);
    if (!h) return;
    document.getElementById('editHabitName').value = h.name;
    document.getElementById('editHabitIcon').value = h.icon;
    document.getElementById('editHabitUnit').value = h.unit || '';
    document.getElementById('editHabitDesc').value = h.description || '';
    document.querySelectorAll('#editColorPicker .color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === h.color));
    document.getElementById('editHabitModal').dataset.habitId = id;
    openModal('editHabitModal');
}

async function handleEditHabit(e) {
    e.preventDefault();
    const id = document.getElementById('editHabitModal').dataset.habitId;
    const name = document.getElementById('editHabitName').value.trim();
    const icon = document.getElementById('editHabitIcon').value.trim();
    const unit = document.getElementById('editHabitUnit').value.trim();
    const description = document.getElementById('editHabitDesc').value.trim();
    const color = document.querySelector('#editColorPicker .color-opt.selected')?.dataset.color;
    await sbClient.from('habits').update({ name, icon, unit, description, color }).eq('id', id);
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
        descEl.textContent = 'This will remove the habit and all its sessions permanently.';
        confirmBtn.style.display = 'block';
        confirmBtn.onclick = async () => {
            await sbClient.from('habits').delete().eq('id', id);
            await loadData();
            activeHabit = habits.length ? habits[0].id : null;
            closeModal('deleteModal'); renderSidebar();
            if (activeHabit) renderMain(); else renderWelcome();
        };
    }
    openModal('deleteModal');
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
    openModal('logModal');
}

async function handleLogSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const statusEl = document.getElementById('uploadStatus');
    const date = document.getElementById('logDate').value;
    const value = document.getElementById('logValue').value;
    const notes = document.getElementById('logNotes').value.trim();
    const fileInput = document.getElementById('logFile');
    
    if (!date) return;
    let mediaUrl = null;

    if (fileInput.files.length > 0) {
        submitBtn.disabled = true;
        statusEl.textContent = '📤 Uploading to Cloud...';
        const file = fileInput.files[0];
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const { data, error } = await sbClient.storage.from('evidence').upload(fileName, file);
        if (error) { alert('Upload error: ' + error.message); submitBtn.disabled = false; return; }
        const { data: { publicUrl } } = sbClient.storage.from('evidence').getPublicUrl(fileName);
        mediaUrl = publicUrl;
    }

    const id = 's_'+Date.now();
    await sbClient.from('sessions').insert({ id, habit_id: activeHabit, date, value: value ? parseFloat(value) : null, notes, media: mediaUrl, time: new Date().toTimeString().substring(0,5) });
    await loadData(); 
    submitBtn.disabled = false;
    closeModal('logModal'); renderSidebar(); renderMain();
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
    document.getElementById('deleteTitle').textContent = 'Delete Session?';
    document.getElementById('deleteDesc').textContent = 'This cannot be undone.';
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.style.display = 'block';
    openModal('deleteModal');
    confirmBtn.onclick = async () => {
        await sbClient.from('sessions').delete().eq('id', id);
        await loadData(); closeModal('deleteModal'); renderSidebar(); renderMain();
    };
}

// ── Export / Import ────────────────────────────────────
function exportData() {
    const blob = new Blob([JSON.stringify({habits,sessions},null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `trackpro_cloud_backup.json`; a.click(); URL.revokeObjectURL(a.href);
}
async function importData(e) {
    alert('Import disabled for Cloud version to prevent conflicts. Use the dashboard to add data!');
}
