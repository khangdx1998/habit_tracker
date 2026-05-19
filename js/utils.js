// General UI Utilities Module
import { state } from './state.js';

export function setTheme(theme) {
    if (theme === 'default') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('tp_theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('tp_theme', theme);
    }
}

export function initTheme() {
    const savedTheme = localStorage.getItem('tp_theme');
    if (savedTheme) setTheme(savedTheme);
}

export const closeModal = id => document.getElementById(id).classList.remove('open');
export const openModal = id => document.getElementById(id).classList.add('open');
export const fmtDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

export function showToast(message, type = 'success') {
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

export function showLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.remove('hidden');
}

export function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.add('hidden');
}

export function playSuccessSound() {
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

export function fireConfetti() {
    // Play sound
    playSuccessSound();

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
    
    const startX = state.lastClickX || window.innerWidth / 2;
    const startY = state.lastClickY || window.innerHeight / 2;

    for (let i = 0; i < 55; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 9 + 4;
        particles.push({
            x: startX,
            y: startY,
            radius: Math.random() * 4 + 2,
            width: Math.random() * 9 + 5,
            height: Math.random() * 5 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2,
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

export async function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
    if (!file.type.startsWith('image/')) return file;
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

export function initPickers() {
    document.querySelectorAll('.color-picker').forEach(picker => {
        picker.querySelectorAll('.color-opt').forEach(opt => {
            opt.onclick = () => {
                picker.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            };
        });
    });
    document.querySelectorAll('.icon-picker').forEach(picker => {
        picker.querySelectorAll('.icon-opt').forEach(opt => {
            opt.onclick = () => {
                picker.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            };
        });
    });
}
