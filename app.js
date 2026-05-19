// ── Track Pro — Cloud Dashboard (Powered by Supabase) ─────────────────────
const SB_URL = 'REMOVED_URL';
const SB_KEY = 'REMOVED_KEY';

// The global 'supabase' object comes from the CDN script
const sbClient = supabase.createClient(SB_URL, SB_KEY);

let habits = [], sessions = [], tags = [], milestones = [], habitGroups = [], reflections = [], dailyQuotes = [], sessionTemplates = [];
let moods = [], energies = [];
let activeHabit = null, currentYear = new Date().getFullYear();
let sortField = 'date', sortDir = 'desc';
let showAllSessions = false;
let collapsedGroups = new Set(); // Track which groups are collapsed
let selectedHeatmapDate = null; // Filter for heatmap click
let privateHabitsUnlocked = false; // Whether private habits are currently visible

function setTheme(theme) {
    if (theme === 'default') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('tp_theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('tp_theme', theme);
    }
}
function initTheme() {
    const savedTheme = localStorage.getItem('tp_theme');
    if (savedTheme) setTheme(savedTheme);
}
initTheme();

// ── Persistence (Cloud) ──────────────────────────────────
const loadData = async () => {
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

        habits = (hRes.data || []).filter(h => !h.is_deleted);
        const validHabitIds = new Set(habits.map(h => h.id));
        sessions = (sRes.data || []).filter(s => validHabitIds.has(s.habit_id) && !s.is_deleted).map(s => ({ ...s, habitId: s.habit_id }));
        tags = tRes.data || [];
        milestones = mRes.data || [];
        habitGroups = gRes.data || [];
        reflections = rRes.data || [];
        dailyQuotes = qRes.data || [];
        sessionTemplates = stRes.data || [];
        moods = (moRes.data || []).sort((a, b) => a.value - b.value);
        energies = (enRes.data || []).sort((a, b) => a.value - b.value);

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
const fmtDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// ── Toast Notifications ──────────────────────────────────
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ── Loading Overlay ──────────────────────────────────────
function showLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.remove('hidden');
}
function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.add('hidden');
}

// ── Interactive Satisfying Feedback (Confetti & Chimes) ──
function playSuccessSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        // 1st note - high pure bell chime
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12); // E6 chime slide
        gain1.gain.setValueAtTime(0.08, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        
        // 2nd note - sweet warm harmonic helper
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1108.73, ctx.currentTime); // C#6 harmony
        gain2.gain.setValueAtTime(0.04, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.5);
        osc2.stop(ctx.currentTime + 0.45);
    } catch (e) {
        console.warn('Audio synthesis bypassed:', e);
    }
}

function fireConfetti() {
    // Play the satisfying completed chime sound!
    playSuccessSound();

    // Create high performance Canvas particle overlay
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '99999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const particles = [];
    const colors = ['#6366f1', '#a855f7', '#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#06b6d4'];
    
    // Radiate from mouse coordinates or center of screen
    const startX = lastClickX || window.innerWidth / 2;
    const startY = lastClickY || window.innerHeight / 2;

    // Spawn 55 dynamic particles
    for (let i = 0; i < 55; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 9 + 4; // premium velocity spread
        particles.push({
            x: startX,
            y: startY,
            radius: Math.random() * 4 + 2,
            width: Math.random() * 9 + 5,
            height: Math.random() * 5 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2, // upward burst bias
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.25,
            opacity: 1,
            decay: Math.random() * 0.016 + 0.012,
            gravity: 0.16,
            shape: Math.random() > 0.4 ? 'circle' : 'rect'
        });
    }

    function animate() {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        let active = false;

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.rotation += p.rotationSpeed;
            p.opacity -= p.decay;

            if (p.opacity > 0) {
                active = true;
                ctx.save();
                ctx.globalAlpha = p.opacity;
                ctx.fillStyle = p.color;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);

                // Add premium glowing shadow effect
                ctx.shadowBlur = 8;
                ctx.shadowColor = p.color;

                ctx.beginPath();
                if (p.shape === 'circle') {
                    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
                }
                ctx.restore();
            }
        });

        if (active) {
            requestAnimationFrame(animate);
        } else {
            canvas.remove();
        }
    }
    animate();
}

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
let loginPasswordHash = null; // The app login password hash from Supabase
let lastClickX = window.innerWidth / 2;
let lastClickY = window.innerHeight / 2;

window.addEventListener('click', (e) => {
    lastClickX = e.clientX;
    lastClickY = e.clientY;
});

function isSessionValid() {
    const authSession = sessionStorage.getItem('tp_authenticated') === 'true';
    const authLocal = localStorage.getItem('tp_authenticated') === 'true';
    if (!authSession && !authLocal) return false;

    const storedTimeStr = sessionStorage.getItem('tp_auth_time') || localStorage.getItem('tp_auth_time');
    if (!storedTimeStr) return false;

    const storedTime = parseInt(storedTimeStr, 10);
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (Date.now() - storedTime > oneDayMs) {
        // Expired! Clear storage
        sessionStorage.removeItem('tp_authenticated');
        sessionStorage.removeItem('tp_auth_time');
        localStorage.removeItem('tp_authenticated');
        localStorage.removeItem('tp_auth_time');
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', async () => {
    initPickers();
    // Check if already authenticated and session is still valid (less than 1 day old)
    if (isSessionValid()) {
        await bootApp();
        return;
    }
    // Load the login password hash from Supabase to determine first-time vs returning
    await loadLoginPasswordHash();
    setupLoginScreen();
});

async function loadLoginPasswordHash() {
    try {
        const { data, error } = await sbClient
            .from('app_settings')
            .select('value')
            .eq('key', 'login_password_hash')
            .maybeSingle();
        if (!error && data) {
            loginPasswordHash = data.value;
        }
    } catch (e) {
        console.warn('Could not load login password:', e);
    }
}

async function saveLoginPasswordHash(hash) {
    loginPasswordHash = hash;
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

function setupLoginScreen() {
    const isFirstTime = !loginPasswordHash;
    const heading = document.getElementById('loginHeading');
    const subheading = document.getElementById('loginSubheading');
    const confirmGroup = document.getElementById('loginConfirmGroup');
    const btnText = document.getElementById('loginBtnText');

    if (isFirstTime) {
        heading.textContent = 'Create Password';
        subheading.textContent = 'Set a password to protect your dashboard';
        confirmGroup.style.display = 'block';
        btnText.textContent = 'Set Password & Enter';
    } else {
        heading.textContent = 'Welcome Back';
        subheading.textContent = 'Enter your password to continue';
        confirmGroup.style.display = 'none';
        btnText.textContent = 'Unlock';
    }

    setTimeout(() => document.getElementById('loginPassword').focus(), 200);
}

function toggleLoginPwVisibility() {
    const input = document.getElementById('loginPassword');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
}

function showLoginError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideLoginError() {
    document.getElementById('loginError').style.display = 'none';
}

async function handleLogin(e) {
    e.preventDefault();
    hideLoginError();

    const password = document.getElementById('loginPassword').value;
    const isFirstTime = !loginPasswordHash;
    const btnText = document.getElementById('loginBtnText');
    const spinner = document.getElementById('loginSpinner');

    // Show loading state
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    try {
        if (isFirstTime) {
            const confirm = document.getElementById('loginPasswordConfirm').value;
            if (password.length < 4) {
                showLoginError('Password must be at least 4 characters');
                return;
            }
            if (password !== confirm) {
                showLoginError('Passwords do not match');
                return;
            }
            const hash = await hashPassword(password);
            await saveLoginPasswordHash(hash);
        } else {
            const hash = await hashPassword(password);
            if (hash !== loginPasswordHash) {
                showLoginError('Incorrect password');
                return;
            }
        }

        // Success — mark session as authenticated and store timestamp
        const remember = document.getElementById('loginRemember').checked;
        const now = Date.now().toString();
        if (remember) {
            localStorage.setItem('tp_authenticated', 'true');
            localStorage.setItem('tp_auth_time', now);
        } else {
            sessionStorage.setItem('tp_authenticated', 'true');
            sessionStorage.setItem('tp_auth_time', now);
        }

        // Animate out login screen
        const loginScreen = document.getElementById('loginScreen');
        loginScreen.classList.add('hiding');

        setTimeout(async () => {
            loginScreen.style.display = 'none';
            await bootApp();
        }, 450);

    } finally {
        btnText.style.display = 'inline';
        spinner.style.display = 'none';
    }
}

async function bootApp() {
    // Hide login screen if still visible (session restore case)
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';

    // Show the app
    document.getElementById('appLayout').style.display = 'flex';
    showLoading();
    await loadData();
    await loadPrivatePasswordHash();
    hideLoading();
    renderSidebar();
    renderSidebarTags();
    if (habits.length > 0) {
        activeHabit = habits[0].id;
        renderSidebar();
        renderMain();
    } else {
        renderWelcome();
    }
}


// ── Sidebar ────────────────────────────────────────────
function renderSidebar() {
    const nav = document.getElementById('habitNav');
    if (!nav) return;


    const dashboardNav = document.getElementById('navDashboard');
    if (dashboardNav) dashboardNav.classList.toggle('active', activeHabit === 'dashboard');

    const tagsNav = document.getElementById('navTags');
    if (tagsNav) tagsNav.classList.toggle('active', activeHabit === 'tags');

    const refNav = document.getElementById('navReflections');
    if (refNav) {
        refNav.classList.toggle('active', activeHabit === 'reflections');
        refNav.style.display = privateHabitsUnlocked ? 'flex' : 'none';
    }

    let html = '';
    const activeHabitsList = habits.filter(h => !h.is_deleted && !h.is_archived && (!h.is_private || privateHabitsUnlocked));
    const archivedHabitsList = habits.filter(h => !h.is_deleted && h.is_archived && (!h.is_private || privateHabitsUnlocked));

    // Update lock/unlock button appearance
    const lockBtn = document.getElementById('privateToggleBtn');
    if (lockBtn) {
        const hasPrivate = habits.some(h => !h.is_deleted && h.is_private);
        lockBtn.style.display = hasPrivate ? 'block' : 'none';
        lockBtn.textContent = privateHabitsUnlocked ? '🔓' : '🔒';
        lockBtn.title = privateHabitsUnlocked ? 'Lock private habits' : 'Unlock private habits';
        lockBtn.style.background = privateHabitsUnlocked ? 'rgba(239, 68, 68, 0.15)' : 'transparent';
    }

    // Grouping logic - Robust check for missing group_id or un-run SQL
    const groups = habitGroups || [];
    const ungrouped = activeHabitsList.filter(h => !h.group_id || !groups.find(g => g && g.id === h.group_id));

    if (ungrouped.length > 0) {
        if (groups.length > 0) html += `<div class="sidebar-section-label" style="margin-top:1rem; opacity:0.6;">GENERAL</div>`;
        html += renderHabitItems(ungrouped);
    }

    groups.forEach(g => {
        const gHabits = activeHabitsList.filter(h => h.group_id === g.id);
        if (gHabits.length > 0) {
            const isCollapsed = collapsedGroups.has(g.id);
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

function renderHabitItems(list, isArchived = false) {
    const todayStr = fmtDate(new Date());
    return list.map(h => {
        const count = sessions.filter(s => s.habitId === h.id && s.status === 'Approved').length;
        const isDoneToday = sessions.some(s => s.habitId === h.id && s.date === todayStr && s.status === 'Approved' && !s.is_deleted);
        
        return `<div class="habit-nav-item ${activeHabit === h.id ? 'active' : ''}" onclick="selectHabit('${h.id}')" style="${isArchived ? 'opacity: 0.6' : ''}">
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

function renderSidebarTags() {
    const el = document.getElementById('totalTagsLabel');
    if (el) el.textContent = `${tags.length} tags`;

    const rel = document.getElementById('totalReflectionsLabel');
    if (rel) rel.textContent = `${reflections.length} logs`;
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
        time: new Date().toTimeString().substring(0, 5),
        status: 'Draft',
        is_deleted: false
    };

    // Optimistic Update (Show it immediately!)
    sessions.push(newSession);
    renderSidebar();
    if (activeHabit === habitId) renderMain();
    fireConfetti();
    showToast('⚡ Quick log added as Draft');

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
    sortField = 'date'; sortDir = 'desc';
    showAllSessions = false;
    selectedHeatmapDate = null;
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

function selectReflections() {
    if (!privateHabitsUnlocked) {
        showToast('🔒 Reflections are private. Unlock first.', 'error');
        togglePrivateHabits();
        return;
    }
    activeHabit = 'reflections';
    renderSidebar();
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar();
}

function toggleGroup(groupId) {
    if (collapsedGroups.has(groupId)) {
        collapsedGroups.delete(groupId);
    } else {
        collapsedGroups.add(groupId);
    }
    renderSidebar();
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
    if (activeHabit === 'reflections') {
        renderReflectionsDashboard();
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
                            <circle class="ring-fill" stroke="${h.color}" stroke-width="7" fill="transparent" r="32" cx="40" cy="40" style="stroke-dashoffset:${201 - 201 * Math.min(stats.weekDays / 5, 1)};filter:drop-shadow(0 0 6px ${h.color}40)"/>
                        </svg>
                        <div class="ring-text">${Math.min(Math.round(stats.weekDays / 5 * 100), 100)}%</div>
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
                <!-- Track -->
                <div style="height:16px; background:rgba(0,0,0,0.6); border-radius:8px; overflow:hidden; box-shadow:inset 0 2px 8px rgba(0,0,0,0.9); position:relative;">
                    <!-- Fill -->
                    <div style="height:100%; width:${Math.min(((h.goal_type === 'value' ? Math.max(...ss.map(s => s.value || 0), 0) : stats.total) / h.goal_target) * 100, 100)}%; background:linear-gradient(90deg, ${h.color}60, ${h.color}); box-shadow:0 0 20px ${h.color}90; border-radius:8px; transition:width 1s cubic-bezier(0.4, 0, 0.2, 1); position:relative; overflow:hidden;">
                        <!-- Shimmer effect -->
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

    renderHeatmap(currentYear, h, ss);
    renderYearPills(ss);
    renderTable();
    renderAchievements(h, stats);
}

function renderDashboard() {
    const main = document.getElementById('mainContent');
    const activeHabitsList = habits.filter(h => h && h.is_archived !== true && (!h.is_private || privateHabitsUnlocked));

    if (activeHabitsList.length === 0) { renderWelcome(); return; }

    // Sort by Priority: High (3), Medium (2), Low (1)
    const priorityMap = { 'high': 3, 'medium': 2, 'low': 1 };
    const sortedHabits = [...activeHabitsList].sort((a, b) => {
        const pA = priorityMap[a.priority] || 2;
        const pB = priorityMap[b.priority] || 2;
        if (pA !== pB) return pB - pA;
        return a.name.localeCompare(b.name);
    });

    const quote = dailyQuotes.length > 0 ? dailyQuotes[Math.floor(Math.random() * dailyQuotes.length)] : { text: "Excellence is not an act, but a habit.", author: "Aristotle" };

    let totalSessionsAllTime = 0;
    let totalSessionsThisWeek = 0;
    const today = new Date();
    const dow = today.getDay(), off = dow === 0 ? 6 : dow - 1;
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - off); startOfWeek.setHours(0, 0, 0, 0);

    sortedHabits.forEach(h => {
        const ss = sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
        totalSessionsAllTime += ss.length;
        ss.forEach(s => { if (new Date(s.date) >= startOfWeek) totalSessionsThisWeek++; });
    });

    const highHabits = sortedHabits.filter(h => h.priority === 'high');
    const mediumHabits = sortedHabits.filter(h => h.priority === 'medium' || !h.priority);
    const lowHabits = sortedHabits.filter(h => h.priority === 'low');

    const todayStr = fmtDate(new Date());
    const donePriorityCount = highHabits.filter(h => sessions.some(s => s.habitId === h.id && s.date === todayStr && s.status === 'Approved' && !s.is_deleted)).length;
    const doneTodayCount = activeHabitsList.filter(h => sessions.some(s => s.habitId === h.id && s.date === todayStr && s.status === 'Approved' && !s.is_deleted)).length;

    const sectionsHTML = [
        { title: 'Priority Focus', habits: highHabits, icon: '⭐️', color: '#fbbf24' },
        { title: 'Active Habits', habits: mediumHabits, icon: '⚡', color: 'var(--accent)' },
        { title: 'Background', habits: lowHabits, icon: '🍃', color: 'var(--dim)' }
    ].map(section => {
        if (section.habits.length === 0) return '';
        const doneInSection = section.habits.filter(h => sessions.some(s => s.habitId === h.id && s.date === todayStr && s.status === 'Approved' && !s.is_deleted)).length;
        const allDone = doneInSection === section.habits.length;

        // Reorder: Not Done today first, Done today last
        const sortedSectionHabits = [...section.habits].sort((a, b) => {
            const doneA = sessions.some(s => s.habitId === a.id && s.date === todayStr && s.status === 'Approved' && !s.is_deleted);
            const doneB = sessions.some(s => s.habitId === b.id && s.date === todayStr && s.status === 'Approved' && !s.is_deleted);
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

function renderHabitCard(h, startOfWeek) {
    const ss = sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
    const stats = computeStats(ss);
    
    const target = h.goal_target || 30;
    const totalDaysLogged = new Set(ss.map(s => s.date)).size;
    const progressPct = Math.min((totalDaysLogged / target) * 100, 100);

    // Done today check (Approved or Draft)
    const todayStr = fmtDate(new Date());
    const isDoneToday = sessions.some(s => s.habitId === h.id && s.date === todayStr && s.status === 'Approved' && !s.is_deleted);

    // Priority Styling
    const isHigh = h.priority === 'high';
    const priorityBorder = isHigh ? 'border: 1px solid rgba(251, 191, 36, 0.45); box-shadow: 0 8px 32px rgba(251, 191, 36, 0.08); transform: translateY(-1px);' : 'border: 1px solid rgba(255, 255, 255, 0.08);';

    // Last Logged Logic
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

    // Mini 7-Day Sparkline
    let sparklineHTML = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek); d.setDate(d.getDate() + i);
        const ds = fmtDate(d);
        const done = ss.some(s => s.date === ds);
        sparklineHTML += `<div style="width:12px; height:12px; border-radius:3px; background:${done ? h.color : 'rgba(255,255,255,0.06)'}; box-shadow: ${done ? `0 0 8px ${h.color}40` : 'none'};" title="${ds}"></div>`;
    }

    // Full Width Button Actions
    const completeActionHTML = isDoneToday
        ? `<div style="width:100%; text-align:center; font-size:0.7rem; color:var(--green); background:var(--green-glow); border:1px solid rgba(34,197,94,0.25); padding:6px 0; border-radius:8px; font-weight:800; text-transform:uppercase; letter-spacing:1px; display:flex; align-items:center; justify-content:center; gap:4px; filter:drop-shadow(0 0 4px rgba(34,197,94,0.25));">✓ Completed Today ✨</div>`
        : `<button onclick="event.stopPropagation(); quickLog('${h.id}')" style="width:100%; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:1.1px; padding:8px 0; border-radius:8px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; border:none; cursor:pointer; box-shadow:0 4px 12px rgba(99,102,241,0.3); transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:4px;">✓ Complete</button>`;

    return `
        <div class="stat-card dashboard-habit-card ${isHigh ? 'priority-high' : ''}" onclick="selectHabit('${h.id}')" 
             style="cursor:pointer; padding:1.25rem; display:flex; flex-direction:column; gap:12px; min-height:200px; position:relative; overflow:hidden; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); border-radius: 20px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); ${priorityBorder}">
            
            ${isHigh ? `<div style="position:absolute; top:0; left:0; width:100%; height:3px; background:linear-gradient(90deg, transparent, #fbbf24, #d946ef, transparent); opacity:0.9; z-index: 2;"></div>` : ''}

            <!-- Header Row: Radial Ring & Streaks -->
            <div style="display:flex; justify-content:space-between; align-items:center; position:relative; z-index:1;">
                <!-- Holographic Radial Circle -->
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

                <!-- Streaks & Priority -->
                <div style="display:flex; align-items:center; gap:8px;">
                    ${isHigh ? '<span title="High Priority" style="color:#fbbf24; font-size:1rem; animation: starPulse 2s infinite alternate; display: inline-block;">⭐️</span>' : ''}
                    ${stats.current > 0 ? `<span style="font-size:0.75rem; color:var(--amber); background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); padding:3px 8px; border-radius:12px; font-weight:800; animation: firePulse 1.5s infinite alternate; display: inline-flex; align-items:center; gap:3px;">🔥 ${stats.current}d</span>` : ''}
                </div>
            </div>

            <!-- Title & Last Logged Block -->
            <div style="position:relative; z-index:1; margin-top:4px;">
                <div style="font-weight:900; font-size:1.2rem; color:var(--text); line-height:1.2; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${h.name}">
                    ${h.name}
                </div>
                <div style="font-size:0.7rem; color:var(--dim); font-weight:600; margin-top:4px; display:flex; align-items:center; gap:4px; opacity:0.8;">
                    <span>⏱️ Last: <strong>${lastText}</strong></span>
                </div>
            </div>

            <!-- Consistency & Progress Percentage Row -->
            <div style="position:relative; z-index:1; margin-top:auto; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.6rem; color:var(--dim); text-transform:uppercase; letter-spacing:1px; font-weight:800;">Consistency (7d)</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:5px;">${sparklineHTML}</div>
                </div>
            </div>

            <!-- Action Button: Full Width bottom block -->
            <div style="position:relative; z-index:1; margin-top:4px; padding-top:4px;">
                ${completeActionHTML}
            </div>

            <!-- Premium Holographic Aurora backdrop glows -->
            <div style="position:absolute; top:-20px; right:-20px; width:120px; height:120px; background:radial-gradient(circle, ${isHigh ? '#fbbf24' : h.color} 0%, transparent 70%); opacity:0.12; filter:blur(30px); border-radius:50%; pointer-events:none;"></div>
            <div style="position:absolute; bottom:-30px; left:-30px; width:100px; height:100px; background:radial-gradient(circle, #8b5cf6 0%, transparent 70%); opacity:0.08; filter:blur(25px); border-radius:50%; pointer-events:none;"></div>
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

// ── Stats Computation ──────────────────────────────────
function computeStats(ss) {
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

// ── Heatmap ────────────────────────────────────────────
function renderHeatmap(year, h, ss) {
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
            
            if (selectedHeatmapDate === ds) day.classList.add('selected');
            
            day.onclick = () => {
                if (selectedHeatmapDate === ds) selectedHeatmapDate = null;
                else selectedHeatmapDate = ds;
                renderMain(); // Re-render to update table and heatmap highlight
            };

            day.onmouseover = e => { const tt = document.getElementById('tooltip'); tt.textContent = `${c} session${c !== 1 ? 's' : ''} — ${ds}${selectedHeatmapDate === ds ? ' (Filtered)' : ''}`; tt.style.display = 'block'; tt.style.left = (e.clientX + 10) + 'px'; tt.style.top = (e.clientY + 10) + 'px'; };
            day.onmouseout = () => document.getElementById('tooltip').style.display = 'none';
            if (cur.getDate() <= 7 && cur.getMonth() !== lm && i % 7 === 0) { const ml = document.createElement('div'); ml.textContent = months[cur.getMonth()]; ml.style.gridColumn = Math.floor(i / 7) + 1; monthRow.appendChild(ml); lm = cur.getMonth(); }
        } else { day.style.opacity = '0.02'; }
        grid.appendChild(day);
        cur.setDate(cur.getDate() + 1);
        if (cur > end && cur.getDay() === 1) break;
    }
}

function renderYearPills(ss) {
    const years = new Set(ss.map(s => parseInt(s.date.substring(0, 4)))); years.add(new Date().getFullYear());
    const pills = document.getElementById('yearPills');
    if (!pills) return;
    pills.innerHTML = [...years].sort((a, b) => b - a).map(y =>
        `<button class="year-pill ${y === currentYear ? 'active' : ''}" onclick="switchYear(${y})">${y}</button>`
    ).join('');
}

function switchYear(y) {
    currentYear = y;
    const h = habits.find(x => x.id === activeHabit);
    if (!h) return;
    const ss = sessions.filter(s => s.habitId === h.id && s.status === 'Approved');
    renderHeatmap(y, h, ss); renderYearPills(ss);
}

// ── Time of Day Helper ─────────────────────────────────
function getTimeOfDay(createdAt) {
    if (!createdAt) return { symbol: '—', label: '', cls: '' };
    const hour = new Date(createdAt).getHours();
    if (hour >= 5 && hour < 12) return { symbol: '🌅', label: 'Morning', cls: 'time-morning' };
    if (hour >= 12 && hour < 18) return { symbol: '☀️', label: 'Afternoon', cls: 'time-afternoon' };
    return { symbol: '🌙', label: 'Night', cls: 'time-night' };
}

function renderTimeOfDayBreakdown(ss, h) {
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
    const maxCount = Math.max(...buckets.map(b => b.count), 1);

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

// ── Activity Table ─────────────────────────────────────
function renderTable() {
    const h = habits.find(x => x.id === activeHabit);
    if (!h) return;
    const wrap = document.getElementById('tableWrap');
    if (!wrap) return;

    let ss = sessions.filter(s => s.habitId === h.id);
    if (selectedHeatmapDate) {
        ss = ss.filter(s => s.date === selectedHeatmapDate);
    }
    const q = (document.getElementById('activitySearch')?.value || '').toLowerCase();

    if (q) ss = ss.filter(s => s.date.includes(q) || (s.notes || '').toLowerCase().includes(q));

    ss.sort((a, b) => {
        let va = a[sortField] || '', vb = b[sortField] || '';
        if (sortField === 'value') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
        return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    let html = '';
    if (selectedHeatmapDate) {
        html += `<div style="display:flex; align-items:center; gap:10px; margin-bottom:1.5rem; padding:10px 15px; background:var(--accent-glow); border-radius:var(--radius-sm); border:1px solid var(--accent); animation: slideDown 0.3s ease;">
            <span style="font-size:0.85rem; font-weight:700; color:var(--accent)">📅 Filtering: ${selectedHeatmapDate}</span>
            <button class="btn btn-ghost" style="padding:4px 10px; font-size:0.75rem; height:auto; color:var(--text)" onclick="selectedHeatmapDate=null; renderMain();">Clear Filter</button>
        </div>`;
    }

    if (ss.length === 0) {
        wrap.innerHTML = html + `<div class="empty-state"><div class="empty-icon">📝</div><h3>No sessions yet on this day</h3><p>Select another day or clear the filter to see history.</p></div>`;
        return;
    }

    const totalCount = ss.length;
    const isSearching = q.length > 0;
    const limit = (isSearching || showAllSessions || selectedHeatmapDate) ? 100 : 5;
    const displayList = ss.slice(0, limit);

    html += `<div class="table-wrapper"><table><thead><tr>
        <th onclick="doSort('date')">Date${sortField === 'date' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>
        <th>Time</th>
        <th onclick="doSort('value')">Value${sortField === 'value' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>
        <th>Status</th>
        <th class="col-tags">Tags</th>
        <th class="col-evidence">Evidence</th>
        <th>Notes</th>
        <th>Actions</th></tr></thead><tbody>
        ${displayList.map(s => {
        const vd = s.value != null ? `<span class="value-tag" style="background:${h.color}20;color:${h.color}">${s.value}${h.unit ? ' ' + h.unit : ''}</span>` : '<span style="color:var(--dim)">—</span>';
        const mediaBtn = s.media ? `<button class="action-btn view-btn" onclick="openMedia('${s.id}')" style="background:${h.color}20; color:${h.color}">👁 View</button>` : '<span style="color:var(--dim); font-size:0.7rem">None</span>';
        const statusLabel = s.status === 'Approved' ? `<span style="color:var(--green); font-size:0.75rem; font-weight:700; padding:2px 6px; background:var(--green-glow); border-radius:4px; white-space:nowrap;">✓ Approved</span>` : `<span style="color:var(--dim); font-size:0.75rem; font-weight:600; padding:2px 6px; background:rgba(255,255,255,0.05); border-radius:4px; white-space:nowrap;">Draft</span>`;

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
                ${showAllSessions ? '↑ Show Less' : `↓ View Full History (${totalCount} sessions)`}
            </button>
        </div>`;
    }
    wrap.innerHTML = html;
}

function toggleShowAll() { showAllSessions = !showAllSessions; renderTable(); }
function doSort(f) { if (sortField === f) sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else { sortField = f; sortDir = f === 'date' ? 'desc' : 'asc'; } renderTable(); }

// ── Achievements / Milestones ─────────────────────────
function renderAchievements(habit, stats) {
    const habitMilestones = milestones.filter(m => m.habit_id === habit.id);

    // Standard achievements that always exist
    const standardDefs = [
        { title: "First Step", desc: "Log 1 session", icon: "🌱", check: s => s.total >= 1 },
        { title: "Week Warrior", desc: "7-day streak", icon: "🔥", check: s => s.longest >= 7 },
        { title: "Unstoppable", desc: "30-day streak", icon: "💎", check: s => s.longest >= 30 },
        { title: "Centurion", desc: "100 sessions", icon: "👑", check: s => s.total >= 100 },
    ];

    // Custom milestones from the database
    const customDefs = habitMilestones.map(m => ({
        title: m.title,
        desc: `Reach ${m.target_count} ${habit.goal_type === 'value' ? (habit.unit || 'units') : 'sessions'}`,
        icon: m.icon || '🎯',
        check: s => (habit.goal_type === 'value' ? stats.bestValue : s.total) >= m.target_count
    }));

    // Combine both
    const defs = [...standardDefs, ...customDefs];

    const el = document.getElementById('achieveGrid');
    if (!el) return;
    el.innerHTML = defs.map(a => {
        const earned = a.check(stats);
        return `<div class="achievement-item ${earned ? 'earned' : 'locked'}"><span class="achievement-emoji">${a.icon}</span><div class="achievement-info"><div class="achievement-title">${a.title}</div><div class="achievement-desc">${a.desc}</div></div></div>`;
    }).join('');
}

// ── Add Habit ──────────────────────────────────────────
function openAddHabitModal() {
    initGroupDropdowns();
    openModal('addHabitModal');
    document.getElementById('habitName').value = '';
    document.getElementById('habitUnit').value = '';
    document.getElementById('habitDesc').value = '';
    document.getElementById('habitGoalType').value = 'count';
    document.getElementById('habitGoalTarget').value = '';
    document.getElementById('habitPriority').value = 'medium';
    document.getElementById('habitTimeBreakdown').checked = false;
    document.getElementById('habitPrivate').checked = false;
    // Reset Pickers
    document.querySelectorAll('#iconPicker .icon-opt').forEach((o, i) => o.classList.toggle('selected', i === 0));
    document.querySelectorAll('#colorPicker .color-opt').forEach((o, i) => o.classList.toggle('selected', i === 0));
    setTimeout(() => document.getElementById('habitName').focus(), 100);
}

function initGroupDropdowns() {
    const groups = habitGroups || [];
    const html = `<option value="">No Group</option>` + groups.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
    ['habitGroup', 'editHabitGroup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    });
}

async function handleAddHabit(e) {
    e.preventDefault();
    const name = document.getElementById('habitName').value.trim();
    const icon = document.querySelector('#iconPicker .icon-opt.selected')?.dataset.icon || '📌';
    const unit = document.getElementById('habitUnit').value.trim();
    const desc = document.getElementById('habitDesc').value.trim();
    const color = document.querySelector('#colorPicker .color-opt.selected')?.dataset.color || '#22c55e';
    const gType = document.getElementById('habitGoalType').value;
    const target = document.getElementById('habitGoalTarget').value;
    const priority = document.getElementById('habitPriority').value;
    const showTimeBreakdown = document.getElementById('habitTimeBreakdown').checked;
    const isPrivate = document.getElementById('habitPrivate').checked;

    if (!name) return;
    const id = 'h_' + Date.now();
    const { data, error } = await sbClient.from('habits').insert({
        id, name, icon, unit, description: desc, color,
        goal_type: gType, goal_target: target ? parseFloat(target) : null,
        is_archived: false,
        is_deleted: false,
        group_id: document.getElementById('habitGroup').value || null,
        priority: priority,
        show_time_breakdown: showTimeBreakdown,
        is_private: isPrivate
    });

    if (error) {
        showAlert('Error', 'Failed to create habit: ' + error.message);
        return;
    }

    await loadData();
    activeHabit = id;
    closeModal('addHabitModal');
    renderSidebar();
    renderMain();
    showToast(`${icon} ${name} created!`);
    fireConfetti();
}

function openEditHabit(id) {
    const h = habits.find(x => x.id === id);
    if (!h) return;
    document.getElementById('editHabitName').value = h.name;
    document.getElementById('editHabitUnit').value = h.unit || '';
    document.getElementById('editHabitDesc').value = h.description || '';
    document.getElementById('editHabitGoalType').value = h.goal_type || 'count';
    document.getElementById('editHabitGoalTarget').value = h.goal_target || '';
    document.getElementById('editHabitPriority').value = h.priority || 'medium';
    document.getElementById('editHabitPrivate').checked = !!h.is_private;
    document.getElementById('archiveHabitBtn').textContent = h.is_archived ? 'Unarchive' : 'Archive';
    // Set Pickers
    document.querySelectorAll('#editIconPicker .icon-opt').forEach(o => o.classList.toggle('selected', o.dataset.icon === h.icon));
    document.querySelectorAll('#editColorPicker .color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === h.color));
    document.getElementById('editHabitModal').dataset.habitId = id;

    initGroupDropdowns();
    document.getElementById('editHabitGroup').value = h.group_id || '';
    document.getElementById('editHabitTimeBreakdown').checked = !!h.show_time_breakdown;
    
    // Clear preset inputs
    document.getElementById('newTemplateName').value = '';
    document.getElementById('newTemplateValue').value = '';
    document.getElementById('newTemplateNotes').value = '';

    // Clear milestone inputs
    document.getElementById('newMilestoneTitle').value = '';
    document.getElementById('newMilestoneTarget').value = '';

    renderEditMilestones(id);
    renderEditTemplates(id);
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
    const priority = document.getElementById('editHabitPriority').value;
    const group_id = document.getElementById('editHabitGroup').value || null;

    const { error } = await sbClient.from('habits').update({
        name, icon, unit, description, color,
        goal_type, goal_target: goal_target ? parseFloat(goal_target) : null,
        priority: priority,
        group_id,
        show_time_breakdown: document.getElementById('editHabitTimeBreakdown').checked,
        is_private: document.getElementById('editHabitPrivate').checked
    }).eq('id', id);
    if (error) { 
        if (error.message.includes('column "priority" does not exist')) {
            showToast('DATABASE UPDATE REQUIRED: Please run the SQL command I provided to add the "priority" column.', 'error', 8000);
        } else {
            showToast('Failed to update: ' + error.message, 'error'); 
        }
        return; 
    }
    await loadData(); closeModal('editHabitModal'); renderSidebar(); renderMain();
    showToast('Habit updated!');
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
        descEl.innerHTML = `To build consistency, you cannot delete a habit in its first 7 days.< br > <br><strong>${8 - diffDays} days remaining</strong> until you can remove this.`;
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
    const h = habits.find(x => x.id === activeHabit);
    if (!h) return;
    document.getElementById('logModalTitle').textContent = `Log — ${h.icon} ${h.name}`;
    document.getElementById('logUnitHint').textContent = h.unit ? `(${h.unit})` : '(optional)';
    document.getElementById('logDate').valueAsDate = new Date();
    document.getElementById('logValue').value = '';
    document.getElementById('logNotes').value = '';
    document.getElementById('logFile').value = '';
    document.getElementById('uploadStatus').textContent = '';
    renderTagSelectors('logTagSelector');
    renderLogTemplates(activeHabit);
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

    const id = 's_' + Date.now();
    const { error: insertErr } = await sbClient.from('sessions').insert({
        id,
        habit_id: activeHabit,
        date,
        value: value ? parseFloat(value) : null,
        notes,
        media: mediaUrl,
        time: new Date().toTimeString().substring(0, 5),
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
    showToast('Session logged!');
    fireConfetti();
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
    const { error } = await sbClient.from('sessions').update({
        date,
        value: value ? parseFloat(value) : null,
        notes,
        media: mediaUrl,
        tag_ids: tagIds
    }).eq('id', id);

    if (error) { showToast('Save failed: ' + error.message, 'error'); }
    await loadData();
    submitBtn.disabled = false;
    renderMain();
    if (!error) showToast('Session updated!');
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
        const { error } = await sbClient.from('sessions').update({ status: 'Approved' }).eq('id', id);
        if (error) { showToast('Approve failed: ' + error.message, 'error'); }
        else { showToast('Session approved! ✓'); }
        await loadData();
        renderMain();
    };
}

// ── Export / Import ────────────────────────────────────
function exportData() {
    const blob = new Blob([JSON.stringify({ habits, sessions }, null, 2)], { type: 'application/json' });
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

function renderGroupManager() {
    const list = document.getElementById('groupManagerList');
    if (!list) return;
    list.innerHTML = habitGroups.map(g => {
        const count = habits.filter(h => h.group_id === g.id).length;
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
    if (habitGroups.length === 0) list.innerHTML = '<div style="text-align:center; color:var(--dim); padding:2rem;">No groups yet.</div>';
}

async function handleAddGroup() {
    const nameEl = document.getElementById('newGroupName');
    const iconEl = document.getElementById('newGroupIcon');
    const name = nameEl.value.trim();
    const icon = iconEl.value.trim() || '📁';
    if (!name) return;

    await sbClient.from('habit_groups').insert({ id: 'g_' + Date.now(), name, icon });
    nameEl.value = ''; iconEl.value = '';
    await loadData();
    renderTagsDashboard();
    renderSidebar();
}

async function handleDeleteGroup(id) {
    document.getElementById('deleteTitle').textContent = 'Delete Group?';
    document.getElementById('deleteDesc').textContent = 'Habits in this group will become ungrouped.';
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.style.display = 'block';
    openModal('deleteModal');
    confirmBtn.onclick = async () => {
        await sbClient.from('habit_groups').delete().eq('id', id);
        await loadData();
        closeModal('deleteModal');
        renderTagsDashboard();
        renderSidebar();
        showToast('Group deleted');
    };
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
    document.getElementById('deleteTitle').textContent = 'Delete Tag?';
    document.getElementById('deleteDesc').textContent = 'This tag will be removed from all sessions.';
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.style.display = 'block';
    openModal('deleteModal');
    confirmBtn.onclick = async () => {
        await sbClient.from('tags').delete().eq('id', id);
        await loadData();
        closeModal('deleteModal');
        if (activeHabit === 'tags') renderTagsDashboard();
        renderSidebarTags();
        showToast('Tag deleted');
    };
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

// ── Reflections Dashboard ──────────────────────────────
function renderReflectionsDashboard() {
    const main = document.getElementById('mainContent');
    const today = fmtDate(new Date());
    const existing = reflections.find(r => r.date === today);

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
                        <span class="section-title">${existing ? 'Update Today\'s Reflection' : 'Log Today\'s Reflection'}</span>
                        <form id="reflectionForm" onsubmit="handleReflectionSubmit(event)" style="margin-top:1.5rem; display:flex; flex-direction:column; gap:1.5rem;">
                            <div class="form-group">
                                <label>How is your mood today?</label>
                                <div class="icon-picker" id="moodPicker">
                                    ${moods.map(m => `
                                        <div class="icon-opt ${existing?.mood === m.value ? 'selected' : ''}" 
                                             data-val="${m.value}" 
                                             title="${m.label}: ${m.description || ''}">${m.icon}</div>
                                    `).join('')}
                                </div>
                                <div id="moodHint" style="font-size: 0.7rem; color: var(--dim); margin-top: 8px; min-height: 1em;">
                                    ${existing?.mood ? moods.find(m => m.value === existing.mood)?.description || '' : 'Select a mood to see more...'}
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Energy Level</label>
                                <div class="icon-picker" id="energyPicker">
                                    ${energies.map(e => `
                                        <div class="icon-opt ${existing?.energy === e.value ? 'selected' : ''}" 
                                             data-val="${e.value}" 
                                             title="${e.label}: ${e.description || ''}">${e.icon}</div>
                                    `).join('')}
                                </div>
                                <div id="energyHint" style="font-size: 0.7rem; color: var(--dim); margin-top: 8px; min-height: 1em;">
                                    ${existing?.energy ? energies.find(e => e.value === existing.energy)?.description || '' : 'Select energy level to see more...'}
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Notes / Journal</label>
                                <textarea id="reflectionNotes" rows="4" placeholder="How was your day? What's on your mind?"></textarea>
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

    // Init picker events
    document.querySelectorAll('#moodPicker .icon-opt, #energyPicker .icon-opt').forEach(opt => {
        opt.onclick = () => {
            const isMood = opt.parentElement.id === 'moodPicker';
            const list = isMood ? moods : energies;
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

function renderReflectionHistory() {
    const list = document.getElementById('reflectionHistory');
    if (!list) return;
    const sorted = [...reflections].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    if (reflections.length === 0) {
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
        const moodObj = moods.find(m => m.value == r.mood);
        const energyObj = energies.find(e => e.value == r.energy);
        const mLabel = moodObj ? moodObj.label : '—';
        const mIcon = moodObj ? moodObj.icon : '';
        const eLabel = energyObj ? energyObj.label : '—';
        const eIcon = energyObj ? energyObj.icon : '';
        
        const isRecent = idx < 2; // only show the 2 most recent notes completely clear
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

    renderMindsetChart();
}

function decryptNote(element, originalText) {
    if (!originalText || element.dataset.decrypted === 'true') return;
    element.dataset.decrypted = 'true';

    // Play subtle unlock audio tick (Web Audio API)
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.04, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        }
    } catch (e) {}

    // Animate matrix text reveal
    const targetLength = originalText.length;
    let iteration = 0;
    const interval = setInterval(() => {
        element.innerHTML = originalText
            .split("")
            .map((char, index) => {
                if (index < iteration) {
                    return originalText[index];
                }
                const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
                return chars[Math.floor(Math.random() * chars.length)];
            })
            .join("");

        if (iteration >= targetLength) {
            clearInterval(interval);
            element.innerHTML = originalText;
            element.style.filter = 'none';
            element.style.opacity = '1';
            element.style.userSelect = 'auto';
            element.style.pointerEvents = 'auto';
            element.style.cursor = 'default';
            
            // Remove lock icon sibling if present
            const lockIcon = element.nextElementSibling;
            if (lockIcon && lockIcon.textContent.includes('🔒')) {
                lockIcon.style.opacity = '0';
                setTimeout(() => lockIcon.remove(), 300);
            }
        }
        iteration += Math.ceil(targetLength / 10);
    }, 30);
}

function renderMindsetChart() {
    const container = document.getElementById('mindsetTrendChart');
    if (!container) return;

    // Use chronological order for time-series trend (oldest to newest)
    const data = [...reflections]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-10); // last 10 records chronologically

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

    // Scale values: moods and energies are usually 1 to 5
    const minVal = 1;
    const maxVal = 5;
    const valRange = maxVal - minVal;

    const getX = (idx) => paddingLeft + (idx / (data.length - 1)) * chartW;
    const getY = (val) => {
        const v = parseFloat(val) || 3;
        const normalized = (v - minVal) / valRange; // 0 to 1
        return height - paddingBottom - normalized * chartH;
    };

    // Construct path points
    let moodPoints = [];
    let energyPoints = [];

    data.forEach((r, idx) => {
        moodPoints.push(`${getX(idx)},${getY(r.mood)}`);
        energyPoints.push(`${getX(idx)},${getY(r.energy)}`);
    });

    const moodPath = `M ${moodPoints.join(' L ')}`;
    const energyPath = `M ${energyPoints.join(' L ')}`;

    // Draw standard horizontal grid lines (values 1 to 5)
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

    // X-axis date labels
    let dateLabelsHtml = '';
    const step = Math.max(1, Math.floor(data.length / 4));
    data.forEach((r, idx) => {
        if (idx % step === 0 || idx === data.length - 1) {
            const x = getX(idx);
            const shortDate = r.date.substring(5); // MM-DD
            dateLabelsHtml += `
                <text x="${x}" y="${height - 10}" fill="var(--dim)" font-size="9" text-anchor="middle">${shortDate}</text>
            `;
        }
    });

    // Draw glowing data dots
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
            
            <!-- Grid Lines -->
            ${gridLinesHtml}

            <!-- Area fills for depth -->
            <path d="${moodPath} L ${getX(data.length - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z" fill="url(#moodGrad)" />
            <path d="${energyPath} L ${getX(data.length - 1)},${height - paddingBottom} L ${getX(0)},${height - paddingBottom} Z" fill="url(#energyGrad)" />

            <!-- Stroke Trend lines -->
            <path d="${moodPath}" fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px rgba(168,85,247,0.4));" />
            <path d="${energyPath}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px rgba(16,185,129,0.3));" />

            <!-- Dots -->
            ${dotsHtml}

            <!-- Axis Labels -->
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

async function handleReflectionSubmit(e) {
    e.preventDefault();
    const mood = document.querySelector('#moodPicker .icon-opt.selected')?.dataset.val;
    const energy = document.querySelector('#energyPicker .icon-opt.selected')?.dataset.val;
    const text = document.getElementById('reflectionNotes').value.trim();
    const today = fmtDate(new Date());

    if (!mood || !energy) { showAlert("Wait", "Please select both mood and energy level."); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const existing = reflections.find(r => r.date === today);
    if (existing) {
        await sbClient.from('reflections').update({ mood, energy, journal_text: text }).eq('date', today);
    } else {
        await sbClient.from('reflections').insert({ id: 'r_' + Date.now(), date: today, mood, energy, journal_text: text });
    }

    await loadData();
    renderReflectionsDashboard();
    renderSidebarTags();
    submitBtn.disabled = false;
    fireConfetti();
}



// ── Session Templates / Presets ──────────────────────────
function renderLogTemplates(habitId) {
    const container = document.getElementById('logTemplatesContainer');
    const list = document.getElementById('logTemplatesList');
    if (!container || !list) return;

    const templates = sessionTemplates.filter(t => t.habit_id === habitId);
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

function applyTemplate(id) {
    const t = sessionTemplates.find(x => x.id === id);
    if (!t) return;

    if (t.value != null) document.getElementById('logValue').value = t.value;
    if (t.notes) document.getElementById('logNotes').value = t.notes;
    
    // Apply tags if template has any
    if (t.tag_ids && t.tag_ids.length > 0) {
        const tagOpts = document.querySelectorAll('#logTagSelector .tag-opt');
        tagOpts.forEach(opt => {
            const isSelected = t.tag_ids.includes(opt.dataset.id);
            opt.classList.toggle('selected', isSelected);
        });
    }
    
    showToast(`Applied preset: ${t.name}`);
}

function renderEditTemplates(habitId) {
    const list = document.getElementById('editTemplatesList');
    if (!list) return;

    const templates = sessionTemplates.filter(t => t.habit_id === habitId);
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

async function handleAddTemplate() {
    const habitId = document.getElementById('editHabitModal').dataset.habitId;
    const name = document.getElementById('newTemplateName').value.trim();
    const value = document.getElementById('newTemplateValue').value;
    const notes = document.getElementById('newTemplateNotes').value.trim();
    
    if (!name) {
        showToast('Please enter a preset name', 'error');
        return;
    }

    const id = 'st_' + Date.now();
    const { error } = await sbClient.from('session_templates').insert({
        id,
        habit_id: habitId,
        name,
        value: value ? parseFloat(value) : null,
        notes,
        tag_ids: [] 
    });

    if (error) { 
        if (error.message.includes('column "priority" does not exist')) {
            showToast('DATABASE UPDATE REQUIRED: Please run the SQL command I provided to add the "priority" column.', 'error', 8000);
        } else {
            showToast('Failed to save habit: ' + error.message, 'error'); 
        }
        return; 
    }

    document.getElementById('newTemplateName').value = '';
    document.getElementById('newTemplateValue').value = '';
    document.getElementById('newTemplateNotes').value = '';

    await loadData();
    renderEditTemplates(habitId);
    showToast('Preset created!');
}

async function handleDeleteTemplate(id) {
    const habitId = document.getElementById('editHabitModal').dataset.habitId;
    const { error } = await sbClient.from('session_templates').delete().eq('id', id);
    
    if (error) {
        showToast('Failed to delete preset', 'error');
        return;
    }

    await loadData();
    renderEditTemplates(habitId);
    showToast('Preset removed');
}

// ── Private Habits — Password Protection ─────────────────
let privatePasswordHash = null; // Loaded from Supabase on startup

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_trackpro_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadPrivatePasswordHash() {
    try {
        const { data, error } = await sbClient
            .from('app_settings')
            .select('value')
            .eq('key', 'private_password_hash')
            .maybeSingle();
        if (!error && data) {
            privatePasswordHash = data.value;
        }
    } catch (e) {
        console.warn('Could not load private password from cloud:', e);
    }
}

async function savePrivatePasswordHash(hash) {
    privatePasswordHash = hash;
    try {
        const { data: existing } = await sbClient
            .from('app_settings')
            .select('key')
            .eq('key', 'private_password_hash')
            .maybeSingle();

        if (existing) {
            await sbClient.from('app_settings')
                .update({ value: hash })
                .eq('key', 'private_password_hash');
        } else {
            await sbClient.from('app_settings')
                .insert({ key: 'private_password_hash', value: hash });
        }
    } catch (e) {
        console.error('Failed to save password to cloud:', e);
    }
}

function hasPrivatePassword() {
    return !!privatePasswordHash;
}

function togglePrivateHabits() {
    if (privateHabitsUnlocked) {
        // Lock them back
        privateHabitsUnlocked = false;
        
        // Secure Redirect: Boot user out of private views immediately
        if (activeHabit === 'reflections') {
            activeHabit = 'dashboard';
        } else {
            const h = habits.find(x => x.id === activeHabit);
            if (h && h.is_private) {
                activeHabit = 'dashboard';
            }
        }
        
        renderSidebar();
        renderMain();
        showToast('🔒 Private views locked');
        return;
    }

    // Need to unlock — show password modal
    const isFirstTime = !hasPrivatePassword();
    const titleEl = document.getElementById('privatePasswordTitle');
    const descEl = document.getElementById('privatePasswordDesc');
    const confirmGroup = document.getElementById('privatePasswordConfirmGroup');
    const submitBtn = document.getElementById('privatePasswordSubmitBtn');
    const inputEl = document.getElementById('privatePasswordInput');
    const confirmEl = document.getElementById('privatePasswordConfirm');

    inputEl.value = '';
    confirmEl.value = '';

    if (isFirstTime) {
        titleEl.textContent = '🔐 Set Private Password';
        descEl.textContent = 'Create a password to protect your private habits. You\'ll need this to view them.';
        confirmGroup.style.display = 'block';
        submitBtn.textContent = 'Set Password';
    } else {
        titleEl.textContent = '🔐 Enter Password';
        descEl.textContent = 'Enter your password to view private habits.';
        confirmGroup.style.display = 'none';
        submitBtn.textContent = 'Unlock';
    }

    openModal('privatePasswordModal');
    setTimeout(() => inputEl.focus(), 100);
}

async function handlePrivatePassword(e) {
    e.preventDefault();
    const password = document.getElementById('privatePasswordInput').value;
    const isFirstTime = !hasPrivatePassword();

    if (isFirstTime) {
        const confirm = document.getElementById('privatePasswordConfirm').value;
        if (password !== confirm) {
            showToast('Passwords do not match', 'error');
            return;
        }
        if (password.length < 4) {
            showToast('Password must be at least 4 characters', 'error');
            return;
        }
        const hash = await hashPassword(password);
        await savePrivatePasswordHash(hash);
        privateHabitsUnlocked = true;
        closeModal('privatePasswordModal');
        renderSidebar();
        renderMain();
        showToast('🔓 Password set & private habits unlocked!');
    } else {
        const hash = await hashPassword(password);
        if (hash === privatePasswordHash) {
            privateHabitsUnlocked = true;
            closeModal('privatePasswordModal');
            renderSidebar();
            renderMain();
            showToast('🔓 Private habits unlocked!');
        } else {
            showToast('❌ Wrong password', 'error');
        }
    }
}

// Also block navigating directly to a private habit
const _originalSelectHabit = selectHabit;
selectHabit = function(id) {
    const h = habits.find(x => x.id === id);
    if (h && h.is_private && !privateHabitsUnlocked) {
        showToast('🔒 This habit is private. Unlock first.', 'error');
        return;
    }
    _originalSelectHabit(id);
};

function logout() {
    sessionStorage.removeItem('tp_authenticated');
    sessionStorage.removeItem('tp_auth_time');
    localStorage.removeItem('tp_authenticated');
    localStorage.removeItem('tp_auth_time');
    showToast('🔒 Signed out successfully');
    setTimeout(() => {
        window.location.reload();
    }, 800);
}

