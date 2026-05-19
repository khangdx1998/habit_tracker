// Modal Interactions & Session CRUD Operations Module
import { sbClient } from './supabase.js';
import { state } from './state.js';
import { fmtDate, closeModal, openModal, showToast, fireConfetti, compressImage } from './utils.js';
import {
    renderSidebar, renderMain, renderWelcome, renderEditMilestones,
    renderEditTemplates, renderTagsDashboard, renderSidebarTags,
    renderReflectionsDashboard, renderReflectionHistory
} from './components.js';

export async function quickLog(habitId) {
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

    // Optimistic Update
    state.sessions.push(newSession);
    renderSidebar();
    if (state.activeHabit === habitId || state.activeHabit === 'dashboard') renderMain();
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
        showAlert('Save Failed', 'Could not save to Cloud: ' + error.message);
        // Revert optimistic update
        state.sessions = state.sessions.filter(x => x.id !== id);
        renderSidebar(); renderMain();
    }
}

export function selectHabit(id) {
    const h = state.habits.find(x => x.id === id);
    if (h && h.is_private && !state.privateHabitsUnlocked) {
        showToast('🔒 This habit is private. Unlock first.', 'error');
        return;
    }
    state.activeHabit = id;
    state.currentYear = new Date().getFullYear();
    state.sortField = 'date'; state.sortDir = 'desc';
    state.showAllSessions = false;
    state.selectedHeatmapDate = null;
    renderSidebar();
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar();
}

export function selectDashboard() {
    state.activeHabit = 'dashboard';
    renderSidebar();
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar();
}

export function selectTags() {
    state.activeHabit = 'tags';
    renderSidebar();
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar();
}

export function selectReflections() {
    if (!state.privateHabitsUnlocked) {
        showToast('🔒 Reflections are private. Unlock first.', 'error');
        togglePrivateHabits();
        return;
    }
    state.activeHabit = 'reflections';
    renderSidebar();
    renderMain();
    if (window.innerWidth <= 850) toggleSidebar();
}

export function toggleGroup(groupId) {
    if (state.collapsedGroups.has(groupId)) {
        state.collapsedGroups.delete(groupId);
    } else {
        state.collapsedGroups.add(groupId);
    }
    renderSidebar();
}

export function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

export function openAddHabitModal() {
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
    
    document.querySelectorAll('#iconPicker .icon-opt').forEach((o, i) => o.classList.toggle('selected', i === 0));
    document.querySelectorAll('#colorPicker .color-opt').forEach((o, i) => o.classList.toggle('selected', i === 0));
    setTimeout(() => document.getElementById('habitName').focus(), 100);
}

export function initGroupDropdowns() {
    const groups = state.habitGroups || [];
    const html = `<option value="">No Group</option>` + groups.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');
    ['habitGroup', 'editHabitGroup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    });
}

export async function handleAddHabit(e) {
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
    const { error } = await sbClient.from('habits').insert({
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

    // Refresh memory
    const { data: fetchHabits } = await sbClient.from('habits').select('*');
    state.habits = (fetchHabits || []).filter(h => !h.is_deleted);

    state.activeHabit = id;
    closeModal('addHabitModal');
    renderSidebar();
    renderMain();
    showToast(`${icon} ${name} created!`);
    fireConfetti();
}

export function openEditHabit(id) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    document.getElementById('editHabitName').value = h.name;
    document.getElementById('editHabitUnit').value = h.unit || '';
    document.getElementById('editHabitDesc').value = h.description || '';
    document.getElementById('editHabitGoalType').value = h.goal_type || 'count';
    document.getElementById('editHabitGoalTarget').value = h.goal_target || '';
    document.getElementById('editHabitPriority').value = h.priority || 'medium';
    document.getElementById('editHabitPrivate').checked = !!h.is_private;
    document.getElementById('archiveHabitBtn').textContent = h.is_archived ? 'Unarchive' : 'Archive';
    
    document.querySelectorAll('#editIconPicker .icon-opt').forEach(o => o.classList.toggle('selected', o.dataset.icon === h.icon));
    document.querySelectorAll('#editColorPicker .color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === h.color));
    document.getElementById('editHabitModal').dataset.habitId = id;

    initGroupDropdowns();
    document.getElementById('editHabitGroup').value = h.group_id || '';
    document.getElementById('editHabitTimeBreakdown').checked = !!h.show_time_breakdown;
    
    document.getElementById('newTemplateName').value = '';
    document.getElementById('newTemplateValue').value = '';
    document.getElementById('newTemplateNotes').value = '';

    document.getElementById('newMilestoneTitle').value = '';
    document.getElementById('newMilestoneTarget').value = '';

    renderEditMilestones(id);
    renderEditTemplates(id);
    openModal('editHabitModal');
}

export async function handleEditHabit(e) {
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
        showToast('Failed to update: ' + error.message, 'error'); 
        return; 
    }
    
    // Refresh memory
    const { data: fetchHabits } = await sbClient.from('habits').select('*');
    state.habits = (fetchHabits || []).filter(h => !h.is_deleted);
    
    closeModal('editHabitModal');
    renderSidebar();
    renderMain();
    showToast('Habit updated!');
}

export function confirmDeleteHabit() {
    const id = document.getElementById('editHabitModal').dataset.habitId;
    const h = state.habits.find(x => x.id === id);
    if (!h) return;

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
            await sbClient.from('habits').update({ is_deleted: true }).eq('id', id);
            
            const { data: fetchHabits } = await sbClient.from('habits').select('*');
            state.habits = (fetchHabits || []).filter(h => !h.is_deleted);
            
            state.activeHabit = state.habits.length ? state.habits[0].id : null;
            closeModal('deleteModal'); renderSidebar();
            if (state.activeHabit) renderMain(); else renderWelcome();
        };
    }
    openModal('deleteModal');
}

export async function toggleArchiveHabit() {
    const id = document.getElementById('editHabitModal').dataset.habitId;
    const h = state.habits.find(x => x.id === id);
    if (!h) return;

    const isNowArchived = !h.is_archived;
    await sbClient.from('habits').update({ is_archived: isNowArchived }).eq('id', id);
    
    const { data: fetchHabits } = await sbClient.from('habits').select('*');
    state.habits = (fetchHabits || []).filter(h => !h.is_deleted);
    
    closeModal('editHabitModal');

    if (isNowArchived && state.activeHabit === id) {
        const firstActive = state.habits.find(x => !x.is_archived);
        state.activeHabit = firstActive ? firstActive.id : (state.habits.length ? state.habits[0].id : null);
    }

    renderSidebar();
    if (state.activeHabit) renderMain(); else renderWelcome();
}

export function openLogSession() {
    const h = state.habits.find(x => x.id === state.activeHabit);
    if (!h) return;
    document.getElementById('logModalTitle').textContent = `Log — ${h.icon} ${h.name}`;
    document.getElementById('logUnitHint').textContent = h.unit ? `(${h.unit})` : '(optional)';
    document.getElementById('logDate').valueAsDate = new Date();
    document.getElementById('logValue').value = '';
    document.getElementById('logNotes').value = '';
    document.getElementById('logFile').value = '';
    document.getElementById('uploadStatus').textContent = '';
    renderTagSelectors('logTagSelector');
    renderLogTemplates(state.activeHabit);
    openModal('logModal');
}

export function renderTagSelectors(containerId, selectedIds = []) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = state.tags.map(t => `
            <div class="tag-opt ${selectedIds.includes(t.id) ? 'selected' : ''}"
                onclick="this.classList.toggle('selected')"
                data-id="${t.id}">${t.name}</div>
            `).join('');
}

export async function handleLogSubmit(e) {
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
        habit_id: state.activeHabit,
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

    // Refresh memory
    const { data: fetchSessions } = await sbClient.from('sessions').select('*');
    const validHabitIds = new Set(state.habits.map(h => h.id));
    state.sessions = (fetchSessions || []).filter(s => validHabitIds.has(s.habit_id) && !s.is_deleted).map(s => ({ ...s, habitId: s.habit_id }));

    submitBtn.disabled = false;
    closeModal('logModal'); renderSidebar(); renderMain();
    showToast('Session logged!');
    fireConfetti();
}

export function openEditSession(id) {
    const s = state.sessions.find(x => x.id === id);
    const h = state.habits.find(x => x.id === s.habitId);
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

export function removeEditMedia() {
    const preview = document.getElementById('editMediaPreview');
    preview.innerHTML = '';
    preview.dataset.currentMedia = '';
}

export async function handleEditSession(e) {
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
    const idx = state.sessions.findIndex(x => x.id === id);
    if (idx !== -1) {
        state.sessions[idx].date = date;
        state.sessions[idx].value = value ? parseFloat(value) : null;
        state.sessions[idx].notes = notes;
        state.sessions[idx].media = mediaUrl;
    }
    closeModal('editSessionModal');
    renderMain();

    const { error } = await sbClient.from('sessions').update({
        date,
        value: value ? parseFloat(value) : null,
        notes,
        media: mediaUrl,
        tag_ids: tagIds
    }).eq('id', id);

    if (error) { showToast('Save failed: ' + error.message, 'error'); }
    
    // Refresh sessions memory
    const { data: fetchSessions } = await sbClient.from('sessions').select('*');
    const validHabitIds = new Set(state.habits.map(h => h.id));
    state.sessions = (fetchSessions || []).filter(s => validHabitIds.has(s.habit_id) && !s.is_deleted).map(s => ({ ...s, habitId: s.habit_id }));

    submitBtn.disabled = false;
    renderMain();
    if (!error) showToast('Session updated!');
}

export function openMedia(sessionId) {
    const s = state.sessions.find(x => x.id === sessionId);
    if (!s || !s.media) return;
    const viewer = document.getElementById('mediaViewer');
    const notes = document.getElementById('mediaNotes');
    const title = document.getElementById('mediaModalTitle');
    const h = state.habits.find(x => x.id === s.habitId);

    title.textContent = `${h?.icon || '📝'} Session — ${s.date}`;
    notes.textContent = s.notes || 'No notes.';
    const isVideo = s.media.match(/\.(mp4|webm|ogg|mov)/i);
    viewer.innerHTML = isVideo ? `<video src="${s.media}" controls style="max-width:100%; max-height:70vh;"></video>` : `<img src="${s.media}" style="max-width:100%; max-height:70vh; object-fit:contain;">`;
    openModal('mediaModal');
}

export function confirmDeleteSession(id) {
    const s = state.sessions.find(x => x.id === id);
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
        await sbClient.from('sessions').update({ is_deleted: true }).eq('id', id);
        
        // Refresh sessions memory
        const { data: fetchSessions } = await sbClient.from('sessions').select('*');
        const validHabitIds = new Set(state.habits.map(h => h.id));
        state.sessions = (fetchSessions || []).filter(s => validHabitIds.has(s.habit_id) && !s.is_deleted).map(s => ({ ...s, habitId: s.habit_id }));

        closeModal('deleteModal'); renderSidebar(); renderMain();
        showToast('Session deleted.');
    };
}

export function approveSession(id) {
    const confirmBtn = document.getElementById('confirmApproveBtn');
    openModal('approveModal');

    confirmBtn.onclick = async () => {
        closeModal('approveModal');
        const idx = state.sessions.findIndex(x => x.id === id);
        if (idx !== -1) state.sessions[idx].status = 'Approved';
        renderMain();

        const { error } = await sbClient.from('sessions').update({ status: 'Approved' }).eq('id', id);
        if (error) { showToast('Approve failed: ' + error.message, 'error'); }
        else { showToast('Session approved! ✓'); }
        
        // Refresh sessions memory
        const { data: fetchSessions } = await sbClient.from('sessions').select('*');
        const validHabitIds = new Set(state.habits.map(h => h.id));
        state.sessions = (fetchSessions || []).filter(s => validHabitIds.has(s.habit_id) && !s.is_deleted).map(s => ({ ...s, habitId: s.habit_id }));

        renderMain();
    };
}

export function exportData() {
    const blob = new Blob([JSON.stringify({ habits: state.habits, sessions: state.sessions }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `trackpro_cloud_backup.json`; a.click(); URL.revokeObjectURL(a.href);
}

export async function importData(e) {
    showAlert('Notice', 'Import disabled for Cloud version to prevent conflicts. Use the dashboard to add data!');
}

export function showAlert(title, desc) {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertDesc').textContent = desc;
    openModal('alertModal');
}

export function openManageTagsModal() {
    selectTags();
}

export async function handleAddGroup() {
    const nameEl = document.getElementById('newGroupName');
    const iconEl = document.getElementById('newGroupIcon');
    const name = nameEl.value.trim();
    const icon = iconEl.value.trim() || '📁';
    if (!name) return;

    await sbClient.from('habit_groups').insert({ id: 'g_' + Date.now(), name, icon });
    nameEl.value = ''; iconEl.value = '';
    
    // Refresh memory
    const { data: gRes } = await sbClient.from('habit_groups').select('*');
    state.habitGroups = gRes || [];

    renderTagsDashboard();
    renderSidebar();
}

export async function handleDeleteGroup(id) {
    document.getElementById('deleteTitle').textContent = 'Delete Group?';
    document.getElementById('deleteDesc').textContent = 'Habits in this group will become ungrouped.';
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.style.display = 'block';
    openModal('deleteModal');
    confirmBtn.onclick = async () => {
        await sbClient.from('habit_groups').delete().eq('id', id);
        
        // Refresh memory
        const { data: gRes } = await sbClient.from('habit_groups').select('*');
        state.habitGroups = gRes || [];
        
        closeModal('deleteModal');
        renderTagsDashboard();
        renderSidebar();
        showToast('Group deleted');
    };
}

export async function handleAddTag() {
    const input = document.getElementById('newTagName');
    const name = input.value.trim();
    if (!name) return;

    const id = 't_' + Date.now();
    await sbClient.from('tags').insert({ id, name });
    input.value = '';
    
    // Refresh memory
    const { data: tRes } = await sbClient.from('tags').select('*');
    state.tags = tRes || [];

    if (state.activeHabit === 'tags') renderTagsDashboard();
    renderSidebarTags();
}

export async function handleDeleteTag(id) {
    document.getElementById('deleteTitle').textContent = 'Delete Tag?';
    document.getElementById('deleteDesc').textContent = 'This tag will be removed from all sessions.';
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.style.display = 'block';
    openModal('deleteModal');
    confirmBtn.onclick = async () => {
        await sbClient.from('tags').delete().eq('id', id);
        
        // Refresh memory
        const { data: tRes } = await sbClient.from('tags').select('*');
        state.tags = tRes || [];

        closeModal('deleteModal');
        if (state.activeHabit === 'tags') renderTagsDashboard();
        renderSidebarTags();
        showToast('Tag deleted');
    };
}

export async function handleAddMilestone() {
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

    // Refresh memory
    const { data: mRes } = await sbClient.from('milestones').select('*');
    state.milestones = mRes || [];

    renderEditMilestones(habitId);
    renderMain();
}

export async function handleDeleteMilestone(id) {
    const habitId = document.getElementById('editHabitModal').dataset.habitId;
    await sbClient.from('milestones').delete().eq('id', id);
    
    // Refresh memory
    const { data: mRes } = await sbClient.from('milestones').select('*');
    state.milestones = mRes || [];

    renderEditMilestones(habitId);
    renderMain();
}

export function applyTemplate(id) {
    const t = state.sessionTemplates.find(x => x.id === id);
    if (!t) return;

    if (t.value != null) document.getElementById('logValue').value = t.value;
    if (t.notes) document.getElementById('logNotes').value = t.notes;
    
    if (t.tag_ids && t.tag_ids.length > 0) {
        const tagOpts = document.querySelectorAll('#logTagSelector .tag-opt');
        tagOpts.forEach(opt => {
            const isSelected = t.tag_ids.includes(opt.dataset.id);
            opt.classList.toggle('selected', isSelected);
        });
    }
    
    showToast(`Applied preset: ${t.name}`);
}

export async function handleAddTemplate() {
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
        showToast('Failed to save preset: ' + error.message, 'error'); 
        return; 
    }

    document.getElementById('newTemplateName').value = '';
    document.getElementById('newTemplateValue').value = '';
    document.getElementById('newTemplateNotes').value = '';

    // Refresh memory
    const { data: stRes } = await sbClient.from('session_templates').select('*');
    state.sessionTemplates = stRes || [];

    renderEditTemplates(habitId);
    showToast('Preset created!');
}

export async function handleDeleteTemplate(id) {
    const habitId = document.getElementById('editHabitModal').dataset.habitId;
    const { error } = await sbClient.from('session_templates').delete().eq('id', id);
    
    if (error) {
        showToast('Failed to delete preset', 'error');
        return;
    }

    // Refresh memory
    const { data: stRes } = await sbClient.from('session_templates').select('*');
    state.sessionTemplates = stRes || [];

    renderEditTemplates(habitId);
    showToast('Preset removed');
}

export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_trackpro_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function togglePrivateHabits() {
    if (state.privateHabitsUnlocked) {
        state.privateHabitsUnlocked = false;
        
        if (state.activeHabit === 'reflections') {
            state.activeHabit = 'dashboard';
        } else {
            const h = state.habits.find(x => x.id === state.activeHabit);
            if (h && h.is_private) {
                state.activeHabit = 'dashboard';
            }
        }
        
        renderSidebar();
        renderMain();
        showToast('🔒 Private views locked');
        return;
    }

    const isFirstTime = !state.loginPasswordHash; // Using the hash setting loaded from cloud to determine if private pw is setup or first-time
    // Wait, let's see if we should load the private password hash from setting
    const hasPrivatePw = !!state.privatePasswordHash;
    const titleEl = document.getElementById('privatePasswordTitle');
    const descEl = document.getElementById('privatePasswordDesc');
    const confirmGroup = document.getElementById('privatePasswordConfirmGroup');
    const submitBtn = document.getElementById('privatePasswordSubmitBtn');
    const inputEl = document.getElementById('privatePasswordInput');
    const confirmEl = document.getElementById('privatePasswordConfirm');

    inputEl.value = '';
    confirmEl.value = '';

    if (!hasPrivatePw) {
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

export async function handlePrivatePassword(e) {
    e.preventDefault();
    const password = document.getElementById('privatePasswordInput').value;
    const hasPrivatePw = !!state.privatePasswordHash;

    if (!hasPrivatePw) {
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
        
        // Save to DB
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
            state.privatePasswordHash = hash;
        } catch (err) {
            console.error('Failed to save private hash:', err);
        }

        state.privateHabitsUnlocked = true;
        closeModal('privatePasswordModal');
        renderSidebar();
        renderMain();
        showToast('🔓 Password set & private habits unlocked!');
    } else {
        const hash = await hashPassword(password);
        if (hash === state.privatePasswordHash) {
            state.privateHabitsUnlocked = true;
            closeModal('privatePasswordModal');
            renderSidebar();
            renderMain();
            showToast('🔓 Private habits unlocked!');
        } else {
            showToast('❌ Wrong password', 'error');
        }
    }
}

export async function handleReflectionSubmit(e) {
    e.preventDefault();
    const mood = document.querySelector('#moodPicker .icon-opt.selected')?.dataset.val;
    const energy = document.querySelector('#energyPicker .icon-opt.selected')?.dataset.val;
    const text = document.getElementById('reflectionNotes').value.trim();
    const today = fmtDate(new Date());

    if (!mood || !energy) { showAlert("Wait", "Please select both mood and energy level."); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const existing = state.reflections.find(r => r.date === today);
    if (existing) {
        await sbClient.from('reflections').update({ mood, energy, journal_text: text }).eq('date', today);
    } else {
        await sbClient.from('reflections').insert({ id: 'r_' + Date.now(), date: today, mood, energy, journal_text: text });
    }

    // Refresh memory
    const { data: rRes } = await sbClient.from('reflections').select('*');
    state.reflections = rRes || [];

    renderReflectionsDashboard();
    renderSidebarTags();
    submitBtn.disabled = false;
    fireConfetti();
}

export function logout() {
    sessionStorage.removeItem('tp_authenticated');
    sessionStorage.removeItem('tp_auth_time');
    localStorage.removeItem('tp_authenticated');
    localStorage.removeItem('tp_auth_time');
    showToast('🔒 Signed out successfully');
    setTimeout(() => {
        window.location.reload();
    }, 800);
}
