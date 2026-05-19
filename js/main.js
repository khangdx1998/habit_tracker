// Core Application Bootstrapper Module
import { sbClient } from './supabase.js';
import { state } from './state.js';
import { initTheme, initPickers, closeModal, openModal, showToast, showLoading, hideLoading, playSuccessSound, fireConfetti, setTheme } from './utils.js';
import { loadData, loadLoginPasswordHash, saveLoginPasswordHash } from './db.js';
import {
    renderSidebar, renderSidebarTags, renderDashboard, renderMain, renderWelcome,
    switchYear, decryptNote, renderTable
} from './components.js';
import {
    quickLog, selectHabit, selectDashboard, selectTags, selectReflections, toggleGroup,
    toggleSidebar, openAddHabitModal, handleAddHabit, openEditHabit, handleEditHabit,
    confirmDeleteHabit, toggleArchiveHabit, openLogSession, handleLogSubmit, openEditSession,
    removeEditMedia, handleEditSession, openMedia, confirmDeleteSession, approveSession,
    exportData, importData, showAlert, openManageTagsModal, handleAddGroup, handleDeleteGroup,
    handleAddTag, handleDeleteTag, handleAddMilestone, handleDeleteMilestone, applyTemplate,
    handleAddTemplate, handleDeleteTemplate, togglePrivateHabits, handlePrivatePassword,
    handleReflectionSubmit, logout, hashPassword
} from './modals.js';

// Bind all necessary handlers to global window context for HTML inline compatibility
window.closeModal = closeModal;
window.openModal = openModal;
window.quickLog = quickLog;
window.selectHabit = selectHabit;
window.selectDashboard = selectDashboard;
window.selectTags = selectTags;
window.selectReflections = selectReflections;
window.toggleGroup = toggleGroup;
window.toggleSidebar = toggleSidebar;
window.openAddHabitModal = openAddHabitModal;
window.handleAddHabit = handleAddHabit;
window.openEditHabit = openEditHabit;
window.handleEditHabit = handleEditHabit;
window.confirmDeleteHabit = confirmDeleteHabit;
window.toggleArchiveHabit = toggleArchiveHabit;
window.openLogSession = openLogSession;
window.handleLogSubmit = handleLogSubmit;
window.openEditSession = openEditSession;
window.removeEditMedia = removeEditMedia;
window.handleEditSession = handleEditSession;
window.openMedia = openMedia;
window.confirmDeleteSession = confirmDeleteSession;
window.approveSession = approveSession;
window.exportData = exportData;
window.importData = importData;
window.showAlert = showAlert;
window.openManageTagsModal = openManageTagsModal;
window.handleAddGroup = handleAddGroup;
window.handleDeleteGroup = handleDeleteGroup;
window.handleAddTag = handleAddTag;
window.handleDeleteTag = handleDeleteTag;
window.handleAddMilestone = handleAddMilestone;
window.handleDeleteMilestone = handleDeleteMilestone;
window.applyTemplate = applyTemplate;
window.handleAddTemplate = handleAddTemplate;
window.handleDeleteTemplate = handleDeleteTemplate;
window.togglePrivateHabits = togglePrivateHabits;
window.handlePrivatePassword = handlePrivatePassword;
window.handleReflectionSubmit = handleReflectionSubmit;
window.logout = logout;
window.setTheme = setTheme;
window.switchYear = switchYear;
window.decryptNote = decryptNote;
window.renderTable = renderTable;

// Track last click coordinates for satisfying confetti effect
window.addEventListener('click', (e) => {
    state.lastClickX = e.clientX;
    state.lastClickY = e.clientY;
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
        sessionStorage.removeItem('tp_authenticated');
        sessionStorage.removeItem('tp_auth_time');
        localStorage.removeItem('tp_authenticated');
        localStorage.removeItem('tp_auth_time');
        return false;
    }
    return true;
}

async function initApp() {
    initTheme();
    initPickers();
    
    // Check if already authenticated and session is valid
    if (isSessionValid()) {
        await bootApp();
        return;
    }
    
    // Load login settings from cloud
    await loadLoginPasswordHash();
    setupLoginScreen();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

async function loadPrivatePasswordHash() {
    try {
        const { data, error } = await sbClient
            .from('app_settings')
            .select('value')
            .eq('key', 'private_password_hash')
            .maybeSingle();
        if (!error && data) {
            state.privatePasswordHash = data.value;
        }
    } catch (e) {
        console.warn('Could not load private password hash from cloud:', e);
    }
}

async function bootApp() {
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';

    document.getElementById('appLayout').style.display = 'flex';
    showLoading();
    await loadData();
    await loadPrivatePasswordHash();
    hideLoading();
    
    renderSidebar();
    renderSidebarTags();
    
    if (state.habits.length > 0) {
        state.activeHabit = 'dashboard';
        renderSidebar();
        renderMain();
    } else {
        renderWelcome();
    }
}

function setupLoginScreen() {
    const isFirstTime = !state.loginPasswordHash;
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

window.toggleLoginPwVisibility = function() {
    const input = document.getElementById('loginPassword');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
};

function showLoginError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideLoginError() {
    document.getElementById('loginError').style.display = 'none';
}

window.handleLogin = async function(e) {
    e.preventDefault();
    hideLoginError();

    const password = document.getElementById('loginPassword').value;
    const isFirstTime = !state.loginPasswordHash;
    const btnText = document.getElementById('loginBtnText');
    const spinner = document.getElementById('loginSpinner');

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
            if (hash !== state.loginPasswordHash) {
                showLoginError('Incorrect password');
                return;
            }
        }

        const remember = document.getElementById('loginRemember').checked;
        const now = Date.now().toString();
        if (remember) {
            localStorage.setItem('tp_authenticated', 'true');
            localStorage.setItem('tp_auth_time', now);
        } else {
            sessionStorage.setItem('tp_authenticated', 'true');
            sessionStorage.setItem('tp_auth_time', now);
        }

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
};
