// ==========================================
// ZoneHub - Core App Engine
// ==========================================

// Client Token for message ownership
let myUserId = localStorage.getItem('zonehub_user_id') || localStorage.getItem('skycommerce_user_id');
if (!myUserId) {
    myUserId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('zonehub_user_id', myUserId);
}

// User Name State
let isCurrentHost = false;
let currentUserName = localStorage.getItem('zonehub_user_name') || localStorage.getItem('skycommerce_user_name') || '';

function initUserInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlUser = urlParams.get('user') || urlParams.get('name') || urlParams.get('pc');
    if (urlUser && urlUser.trim()) {
        currentUserName = urlUser.trim();
        localStorage.setItem('zonehub_user_name', currentUserName);
        updateUserDisplay();
        return;
    }

    fetch('/api/my-info')
        .then(r => r.json())
        .then(info => {
            isCurrentHost = !!info.isHost;
            const roleLabel = document.getElementById('userBadgeRoleLabel');
            if (roleLabel) {
                roleLabel.innerText = isCurrentHost ? 'Host:' : 'You:';
            }

            let stored = localStorage.getItem('zonehub_user_name');
            const isPlaceholder = !stored || stored.startsWith('Employee_') || stored === 'Employee';
            if (stored && !isPlaceholder && (isCurrentHost || stored !== 'obak3')) {
                currentUserName = stored;
            } else if (info.defaultName && !info.defaultName.startsWith('Employee_')) {
                currentUserName = info.defaultName;
                localStorage.setItem('zonehub_user_name', currentUserName);
            } else if (isCurrentHost) {
                currentUserName = info.defaultName || 'Host';
                localStorage.setItem('zonehub_user_name', currentUserName);
            } else {
                currentUserName = info.defaultName || 'Employee';
                localStorage.setItem('zonehub_user_name', currentUserName);
            }
            updateUserDisplay();
        })
        .catch(() => {
            if (!currentUserName) currentUserName = 'Employee';
            updateUserDisplay();
        });
}

function updateUserDisplay() {
    const nameEl = document.getElementById('currentUserNameDisplay');
    const avatarEl = document.getElementById('currentUserAvatar');
    if (nameEl) nameEl.innerText = currentUserName || 'You';
    const init = (currentUserName || 'EM').substring(0, 2).toUpperCase();
    if (avatarEl) avatarEl.innerText = init;
}

function promptChangeName() {
    const newName = prompt('আপনার নাম পরিবর্তন করুন (Enter your name for Team Chat):', currentUserName);
    if (newName && newName.trim().length > 0) {
        currentUserName = newName.trim();
        localStorage.setItem('zonehub_user_name', currentUserName);
        updateUserDisplay();
        showToast('Name updated to: ' + currentUserName);
    }
}

// Dynamic Hub Configuration & Rename Modal
let hubConfigData = null;

async function fetchHubConfig() {
    try {
        const res = await fetch('/api/config');
        hubConfigData = await res.json();
        if (hubConfigData) {
            if (hubConfigData.hubName) {
                const titleEl = document.getElementById('hubTitleText');
                if (titleEl) titleEl.innerText = hubConfigData.hubName;
                document.title = hubConfigData.hubName + ' & Team Chat • ZoneHub';
            }
            const chipUser = document.getElementById('chipUserHub');
            const chipUserText = document.getElementById('chipUserHubText');
            if (chipUser && chipUserText && hubConfigData.userHubName) {
                chipUser.dataset.name = hubConfigData.userHubName;
                chipUserText.innerText = '👤 ' + hubConfigData.userHubName;
            }
            const chipMachine = document.getElementById('chipMachineHub');
            const chipMachineText = document.getElementById('chipMachineHubText');
            if (chipMachine && chipMachineText && hubConfigData.machineHubName) {
                chipMachine.dataset.name = hubConfigData.machineHubName;
                chipMachineText.innerText = '💻 ' + hubConfigData.machineHubName;
            }

            // Minimalist Cloudflare URL display (clean host without https:// clutter)
            const onlineLink = document.getElementById('onlineTunnelLink');
            if (onlineLink && onlineLink.href && onlineLink.href.includes('trycloudflare.com')) {
                const cleanHost = onlineLink.href.replace(/^https?:\/\//, '').replace(/\/$/, '');
                onlineLink.innerText = cleanHost;
                onlineLink.title = onlineLink.href + ' (Click to open online link)';
            }
        }
    } catch (e) {
        console.warn('Could not fetch hub config:', e);
    }
}

function openHubRenameModal() {
    fetchHubConfig();
    const currentTitleEl = document.getElementById('hubTitleText');
    const input = document.getElementById('customHubNameInput');
    if (input && currentTitleEl) {
        input.value = currentTitleEl.innerText.trim();
    }
    const modal = document.getElementById('hubRenameModal');
    if (modal) modal.classList.add('active');
    setTimeout(() => { if (input) input.focus(); }, 100);
}

function closeHubRenameModal(e) {
    if (!e || e.target.id === 'hubRenameModal' || (e.target.classList && e.target.classList.contains('modal-close-btn'))) {
        const modal = document.getElementById('hubRenameModal');
        if (modal) modal.classList.remove('active');
    }
}

function applySuggestedName(name) {
    if (!name) return;
    const input = document.getElementById('customHubNameInput');
    if (input) input.value = name;
    saveCustomHubName();
}

async function saveCustomHubName() {
    const input = document.getElementById('customHubNameInput');
    const newName = input ? input.value.trim() : '';
    if (!newName) {
        showToast('Please enter a valid hub name');
        return;
    }
    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hubName: newName })
        });
        const data = await res.json();
        if (data.success) {
            const titleEl = document.getElementById('hubTitleText');
            if (titleEl) titleEl.innerText = data.hubName;
            document.title = data.hubName + ' & Team Chat • ZoneHub';
            showToast('Hub Name updated: ' + data.hubName);
            const modal = document.getElementById('hubRenameModal');
            if (modal) modal.classList.remove('active');
        } else {
            showToast(data.error || 'Failed to update name');
        }
    } catch (err) {
        showToast('Error saving hub name: ' + err.message);
    }
}

// Common UI Utility Helpers
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

function escapeQuotes(text) {
    if (!text) return '';
    return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function copyLink(relUrl) {
    const shareEl = document.getElementById('networkShareLink');
    let base = window.location.origin;
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && shareEl && shareEl.href) {
        base = shareEl.href.replace(/\/+$/, '');
    }
    const fullUrl = base + relUrl;
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('Link copied for mobile & employees: ' + fullUrl);
    });
}

function copyFullShareUrl() {
    const shareEl = document.getElementById('networkShareLink');
    let shareUrl = shareEl ? shareEl.href : window.location.origin;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        if (shareEl && shareEl.href) {
            shareUrl = shareEl.href;
        }
    }
    navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Mobile & Employees link copied: ' + shareUrl);
    });
}

// Notification & Audio Alert State
let alertsEnabled = localStorage.getItem('hub_alerts_enabled') !== 'false';
let currentActiveView = (window.innerWidth < 768) ? 'files' : 'split';
let unreadChatCount = 0;
let chatToastTimer = null;
let notificationAudioCtx = null;

function getNotificationAudioCtx() {
    if (!notificationAudioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) notificationAudioCtx = new AudioContextClass();
    }
    if (notificationAudioCtx && notificationAudioCtx.state === 'suspended') {
        notificationAudioCtx.resume();
    }
    return notificationAudioCtx;
}

// Professional Executive Notification Chime (Harmonic 2-Tone Marimba Chime)
function playProfessionalChime() {
    try {
        const ctx = getNotificationAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        // Tone 1: Warm resonant marimba base note (Eb5 = 622.25 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(622.25, now);
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.018);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.6);

        // Tone 2: Crisp crystal overtone (Bb5 = 932.33 Hz) starting 80ms later
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(932.33, now + 0.08);
        gain2.gain.setValueAtTime(0.0001, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.8);

        // Subtle harmonic shimmer (1864 Hz) for luxury polish
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1864.66, now + 0.08);
        gain3.gain.setValueAtTime(0.0001, now + 0.08);
        gain3.gain.exponentialRampToValueAtTime(0.04, now + 0.1);
        gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(now + 0.08);
        osc3.stop(now + 0.5);
    } catch (err) {
        console.warn('Notification audio chime error:', err);
    }
}

function updateAlertsButtonDisplay() {
    const btn = document.getElementById('notifToggleBtn');
    const txt = document.getElementById('notifStatusText');
    if (!btn || !txt) return;

    if (!('Notification' in window)) {
        txt.innerText = 'Alerts: Unsupported';
        return;
    }

    if (Notification.permission === 'denied') {
        txt.innerText = 'Alerts: Blocked';
        btn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        btn.style.color = '#f87171';
        btn.title = 'Notifications are blocked in your browser settings. Click the lock icon near URL to allow notifications.';
        return;
    }

    if (Notification.permission === 'default') {
        txt.innerText = '🔔 Enable Alerts';
        btn.style.borderColor = 'rgba(245, 158, 11, 0.5)';
        btn.style.color = '#fbbf24';
        btn.title = 'Click to enable Desktop & Sound alerts when working in other apps/tabs';
        return;
    }

    if (alertsEnabled) {
        txt.innerText = 'Alerts: On';
        btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        btn.style.color = '#34d399';
        btn.title = 'Desktop notifications & sound are active even in other apps';
    } else {
        txt.innerText = 'Alerts: Off';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        btn.style.color = 'var(--text-muted)';
        btn.title = 'Notifications muted';
    }
}

function toggleDesktopNotifications() {
    if (!('Notification' in window)) {
        showToast('Browser does not support desktop notifications');
        return;
    }

    if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                alertsEnabled = true;
                localStorage.setItem('hub_alerts_enabled', 'true');
                updateAlertsButtonDisplay();
                showToast('🔔 Desktop notifications & sound enabled!');
                playProfessionalChime();
                triggerSystemNotification({
                    id: 'welcome_' + Date.now(),
                    user: 'System Bot',
                    text: '🎉 Notifications active! You will now receive alerts when working in other apps or tabs.'
                });
            } else if (perm === 'denied') {
                updateAlertsButtonDisplay();
                showToast('⚠️ Notifications blocked in browser settings');
            }
        });
        return;
    }

    if (Notification.permission === 'denied') {
        alert('Notifications are currently blocked in your browser settings.\n\nTo allow notifications:\n1. Click the site settings / lock / tune icon on the left of your browser address bar.\n2. Set "Notifications" to "Allow".\n3. Refresh the page.');
        return;
    }

    alertsEnabled = !alertsEnabled;
    localStorage.setItem('hub_alerts_enabled', alertsEnabled ? 'true' : 'false');
    updateAlertsButtonDisplay();

    if (alertsEnabled) {
        showToast('🔔 Chat notifications & sound turned ON');
        playProfessionalChime();
    } else {
        showToast('🔕 Notifications & sound turned OFF');
    }
}

function autoRequestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                alertsEnabled = true;
                localStorage.setItem('hub_alerts_enabled', 'true');
                updateAlertsButtonDisplay();
            } else {
                updateAlertsButtonDisplay();
            }
        }).catch(() => {});
    }
}

function triggerSystemNotification(msg) {
    if (!alertsEnabled) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        let bodyText = msg.text || '';
        if (msg.type === 'voice') bodyText = '🎤 Voice note (' + (msg.duration ? msg.duration + 's' : 'audio') + ')';
        else if (msg.type === 'image') bodyText = '📷 Sent a picture';

        const title = (msg.user || 'Team Member') + ' • Team Chat';
        const options = {
            body: bodyText,
            icon: '/favicon.png',
            badge: '/favicon.png',
            tag: 'chat_' + (msg.id || Date.now()),
            renotify: true,
            silent: false, // Ensures Windows Action Center / OS plays its native sound chime
            requireInteraction: false
        };

        // Prefer Service Worker notification for native Windows / Android / Mac reliability across apps
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, options).catch(() => {
                    fallbackNotification(title, options);
                });
            }).catch(() => {
                fallbackNotification(title, options);
            });
        } else {
            fallbackNotification(title, options);
        }
    } else if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function fallbackNotification(title, options) {
    try {
        const notif = new Notification(title, options);
        notif.onclick = function() {
            window.focus();
            if (typeof switchView === 'function') switchView('chat');
            notif.close();
        };
    } catch (e) {}
}

let titleBlinkInterval = null;

function startTitleBlink(senderName) {
    if (!document.hidden) return;
    if (titleBlinkInterval) clearInterval(titleBlinkInterval);
    
    let isBlink = false;
    const baseTitle = (hubConfigData && hubConfigData.hubName ? hubConfigData.hubName : 'Media Hub') + ' & Team Chat';
    const alertTitle = '💬 (' + (unreadChatCount || 1) + ') New message from ' + (senderName || 'Team') + '!';

    titleBlinkInterval = setInterval(() => {
        if (!document.hidden) {
            stopTitleBlink();
            return;
        }
        document.title = isBlink ? alertTitle : baseTitle;
        isBlink = !isBlink;
    }, 1200);
}

function stopTitleBlink() {
    if (titleBlinkInterval) {
        clearInterval(titleBlinkInterval);
        titleBlinkInterval = null;
    }
    const baseTitle = (hubConfigData && hubConfigData.hubName ? hubConfigData.hubName : 'Media Hub') + ' & Team Chat • ZoneHub';
    document.title = baseTitle;
}

window.addEventListener('focus', stopTitleBlink);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) stopTitleBlink();
});

function testChimeSound() {
    playProfessionalChime();
    showToast('🔊 Professional Chime Sound Played!');
    showCornerChatToast({
        id: 'test_' + Date.now(),
        user: 'System Bot',
        text: '🔔 Test Notification: Audio & Desktop alerts are active even in other apps!'
    });
    triggerSystemNotification({
        id: 'test_' + Date.now(),
        user: 'System Bot',
        text: '🔔 Test Notification: You can see this popup and hear the sound from any browser or app!'
    });
    if (document.hidden) {
        startTitleBlink('System Bot');
    }
}

function showCornerChatToast(msg) {
    const toast = document.getElementById('cornerChatToast');
    const avatar = document.getElementById('toastAvatar');
    const user = document.getElementById('toastUser');
    const preview = document.getElementById('toastPreview');
    if (!toast || !avatar || !user || !preview) return;

    avatar.innerText = (msg.user || 'E').substring(0, 2).toUpperCase();
    user.innerText = msg.user || 'Team Member';

    let textPreview = msg.text || '';
    if (msg.type === 'voice') textPreview = '🎤 Voice note (' + (msg.duration ? msg.duration + 's' : 'audio') + ')';
    else if (msg.type === 'image') textPreview = '📷 Sent a picture';
    preview.innerText = textPreview;

    toast.style.display = 'flex';
    showChatHeadTeaser(msg);

    if (chatToastTimer) clearTimeout(chatToastTimer);
    chatToastTimer = setTimeout(() => {
        closeChatToast();
    }, 5500);
}

function closeChatToast() {
    const toast = document.getElementById('cornerChatToast');
    if (toast) toast.style.display = 'none';
    if (chatToastTimer) clearTimeout(chatToastTimer);
}

function onToastClicked() {
    closeChatToast();
    switchView('chat');
}

let teaserTimer = null;
function showChatHeadTeaser(msg) {
    const teaser = document.getElementById('chatHeadTeaser');
    const userEl = document.getElementById('teaserUser');
    const textEl = document.getElementById('teaserText');
    const avatarEl = document.getElementById('teaserAvatar');
    if (!teaser || !userEl || !textEl) return;

    userEl.innerText = msg.user || 'Team Member';
    if (avatarEl) avatarEl.innerText = (msg.user || 'TM').substring(0, 2).toUpperCase();

    let preview = msg.text || '';
    if (msg.type === 'voice') preview = '🎤 Voice note (' + (msg.duration ? msg.duration + 's' : '') + ')';
    else if (msg.type === 'image') preview = '📷 Sent a picture';
    textEl.innerText = preview;

    teaser.classList.add('show');
    if (teaserTimer) clearTimeout(teaserTimer);
    teaserTimer = setTimeout(dismissTeaser, 5000);
}

function dismissTeaser() {
    const teaser = document.getElementById('chatHeadTeaser');
    if (teaser) teaser.classList.remove('show');
    if (teaserTimer) clearTimeout(teaserTimer);
}

function onTeaserClicked() {
    dismissTeaser();
    toggleChatHeadClick();
}

function toggleChatHeadClick() {
    unreadChatCount = 0;
    updateChatUnreadBadge();
    dismissTeaser();

    // If currently inside standalone bubble-compact-view, click expands back to full dock:
    if (document.body.classList.contains('bubble-compact-view')) {
        document.body.classList.remove('bubble-compact-view');
        return;
    }

    // Toggle in-page Corner Mini Dock Card:
    toggleCornerDock();
}

// In-Page Corner Mini Dock Card Toggle (Messenger / Intercom style)
function toggleCornerDock(forceState) {
    const card = document.getElementById('cornerDockCard');
    const iframe = document.getElementById('cornerDockIframe');
    const head = document.getElementById('floatingChatHead');
    if (!card) return;

    const shouldOpen = typeof forceState === 'boolean' ? forceState : !card.classList.contains('active');
    if (shouldOpen) {
        if (iframe && (!iframe.src || iframe.src === 'about:blank' || iframe.getAttribute('src') === '')) {
            iframe.src = window.location.origin + '/?view=mini';
        }
        card.classList.add('active');
        dismissTeaser();
        unreadChatCount = 0;
        updateChatUnreadBadge();
        if (head) head.classList.add('dock-open');
    } else {
        card.classList.remove('active');
        if (head) head.classList.remove('dock-open');
    }
}

// Standalone Mini Window Bubble Mode Toggle
function toggleMiniWindowBubbleMode() {
    document.body.classList.toggle('bubble-compact-view');
}

function updateChatUnreadBadge() {
    const badge = document.getElementById('chatUnreadBadge');
    if (badge) {
        if (unreadChatCount > 0) {
            badge.innerText = '+' + unreadChatCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    const headBadge = document.getElementById('chatHeadBadge');
    const headEl = document.getElementById('floatingChatHead');
    if (headBadge) {
        if (unreadChatCount > 0) {
            headBadge.innerText = unreadChatCount > 99 ? '99+' : unreadChatCount;
            headBadge.style.display = 'flex';
            if (headEl) headEl.classList.add('has-new-msg');
        } else {
            headBadge.style.display = 'none';
            if (headEl) headEl.classList.remove('has-new-msg');
        }
    }
}

// Layout Switching (Files & Chat tabs)
function switchView(view) {
    const container = document.getElementById('mainContainer');
    const filesWrapper = document.getElementById('filesSectionWrapper');
    const chatWrapper = document.getElementById('chatSectionWrapper');
    const tabMediaBtn = document.getElementById('tabMediaBtn');
    const tabFilesOnlyBtn = document.getElementById('tabFilesOnlyBtn');
    const tabChatOnlyBtn = document.getElementById('tabChatOnlyBtn');

    if (!container || !filesWrapper || !chatWrapper) return;

    // On mobile devices, split view is not allowed
    if (window.innerWidth < 768 && view === 'split') {
        view = 'files';
    }

    currentActiveView = view;
    if (view === 'chat' || view === 'split') {
        unreadChatCount = 0;
        updateChatUnreadBadge();
    }

    if (tabMediaBtn) tabMediaBtn.classList.remove('active');
    if (tabFilesOnlyBtn) tabFilesOnlyBtn.classList.remove('active');
    if (tabChatOnlyBtn) tabChatOnlyBtn.classList.remove('active');

    if (view === 'split') {
        container.className = 'split-view';
        filesWrapper.style.display = 'block';
        chatWrapper.style.display = 'block';
        if (tabMediaBtn) tabMediaBtn.classList.add('active');
    } else if (view === 'files') {
        container.className = 'content-grid';
        filesWrapper.style.display = 'block';
        chatWrapper.style.display = 'none';
        if (tabFilesOnlyBtn) tabFilesOnlyBtn.classList.add('active');
    } else if (view === 'chat') {
        container.className = 'content-grid';
        filesWrapper.style.display = 'none';
        chatWrapper.style.display = 'block';
        if (tabChatOnlyBtn) tabChatOnlyBtn.classList.add('active');
        if (typeof scrollChatToBottom === 'function') {
            scrollChatToBottom(true);
        }
    }
}

// Mini Dock & Corner Floating Mode
let activePipWindow = null;

async function toggleMiniDock() {
    if (window.location.search.includes('view=mini') || document.body.classList.contains('mini-dock-mode')) {
        expandToFullView();
        return;
    }

    // Open true Always-On-Top mini window over Premiere / Photoshop / Folders
    openAlwaysOnTopOsWindow();
}

// Detach into Always-On-Top OS Window (stays above Premiere, Photoshop, Folders)
async function openAlwaysOnTopOsWindow() {
    toggleCornerDock(false);

    const width = 390;
    const height = 660;

    // 1. Modern Chromium True Always-on-Top (Document Picture-in-Picture API)
    if ('documentPictureInPicture' in window) {
        try {
            if (activePipWindow && !activePipWindow.closed) {
                activePipWindow.close();
                activePipWindow = null;
                showToast('📌 Closed Always-on-Top Mini Dock');
                return;
            }

            const pipWindow = await window.documentPictureInPicture.requestWindow({
                width: width,
                height: height
            });
            activePipWindow = pipWindow;

            pipWindow.document.title = 'ZoneHub • Always on Top';
            pipWindow.document.body.style.margin = '0';
            pipWindow.document.body.style.padding = '0';
            pipWindow.document.body.style.overflow = 'hidden';
            pipWindow.document.body.style.backgroundColor = '#0b0f19';

            const iframe = pipWindow.document.createElement('iframe');
            iframe.src = window.location.origin + '/?view=mini';
            iframe.style.width = '100vw';
            iframe.style.height = '100vh';
            iframe.style.border = 'none';
            iframe.allow = 'microphone; clipboard-read; clipboard-write; autoplay';
            pipWindow.document.body.appendChild(iframe);

            pipWindow.addEventListener('pagehide', () => {
                activePipWindow = null;
            });

            showToast('📌 ZoneHub is now ALWAYS ON TOP of all folders & apps!');
            return;
        } catch (e) {
            console.warn('Document Picture-in-Picture fallback:', e);
        }
    }

    // 2. Standard popup window fallback
    const left = Math.max(0, (window.screen.availWidth || 1366) - width - 15);
    const top = 50;
    const miniUrl = window.location.origin + '/?view=mini';
    try {
        const miniWin = window.open(
            miniUrl,
            'ZoneHubMiniDock',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,location=no,toolbar=no,menubar=no`
        );
        if (miniWin && !miniWin.closed) {
            miniWin.focus();
            showToast('📌 ZoneHub opened in Screen Corner Window!');
            return;
        }
    } catch (e) {
        console.warn('Popup blocked, falling back to in-page mini dock:', e);
    }

    // 3. In-page fallback if browser blocks popups:
    document.body.classList.add('mini-dock-mode');
    switchView('chat');
    showToast('📌 Switched to Compact Corner Mode!');
}

function expandToFullView() {
    try {
        if (window.parent && window.parent !== window) {
            if (window.parent.close) window.parent.close();
            return;
        }
    } catch (e) {}

    if (activePipWindow && !activePipWindow.closed) {
        activePipWindow.close();
        activePipWindow = null;
        return;
    }

    if (window.opener && !window.opener.closed) {
        window.close();
        window.opener.focus();
        return;
    }
    if (window.location.search.includes('view=mini')) {
        window.location.href = window.location.origin + '/';
        return;
    }
    document.body.classList.remove('mini-dock-mode');
    if (window.innerWidth >= 768) {
        switchView('split');
    } else {
        switchView('files');
    }
    showToast('⤢ Restored to Full View');
}

// ==========================================
// PWA (Progressive Web App) & Install Logic
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('PWA ServiceWorker registered with scope:', reg.scope))
            .catch(err => console.warn('PWA ServiceWorker registration note:', err));
    });
}

function isPwaStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true || 
           document.referrer.includes('android-app://');
}

function getDeviceType() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'desktop';
}

function initPwaInstallState() {
    const installBtn = document.getElementById('pwaInstallBtn');
    if (!installBtn) return;

    if (isPwaStandalone()) {
        // App is already running in installed standalone mode!
        installBtn.style.display = 'none';
        return;
    }

    // Always show Install button for browser users so they can install with 1-click or guide
    installBtn.style.display = 'inline-flex';
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn && !isPwaStandalone()) {
        installBtn.style.display = 'inline-flex';
    }
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
    closePwaGuideModal();
    showToast('🎉 App installed successfully to your device!');
});

function triggerPwaInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choiceResult) => {
            if (choiceResult && choiceResult.outcome === 'accepted') {
                deferredInstallPrompt = null;
                const installBtn = document.getElementById('pwaInstallBtn');
                if (installBtn) installBtn.style.display = 'none';
            }
        }).catch(err => {
            console.warn('PWA install prompt error:', err);
            openPwaGuideModal();
        });
    } else {
        openPwaGuideModal();
    }
}

function openPwaGuideModal() {
    const modal = document.getElementById('pwaGuideModal');
    if (!modal) return;
    const dev = getDeviceType();
    switchPwaTab(dev);
    modal.classList.add('active');
}

function closePwaGuideModal(event) {
    if (event && event.target && event.target.id !== 'pwaGuideModal') return;
    const modal = document.getElementById('pwaGuideModal');
    if (modal) modal.classList.remove('active');
}

function switchPwaTab(tabName) {
    const tabs = ['ios', 'android', 'desktop'];
    tabs.forEach(t => {
        const btn = document.getElementById('pwaTab' + t.charAt(0).toUpperCase() + t.slice(1));
        const panel = document.getElementById('pwaPanel' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.classList.toggle('active', t === tabName);
        if (panel) panel.classList.toggle('active', t === tabName);
    });
}

// ==========================================
// Bootstrap & Live Polling Initializer
// ==========================================
// Live UI Signal for Target Tab (from Desktop Bubble or URL)
async function checkTargetTabSignal() {
    try {
        const res = await fetch('/api/target-tab?t=' + Date.now());
        const data = await res.json();
        if (data && data.targetTab) {
            switchView(data.targetTab);
            if (typeof scrollChatToBottom === 'function') {
                scrollChatToBottom(true);
            }
        }
    } catch (e) {}
}

window.addEventListener('DOMContentLoaded', () => {
    // Check if opened as Corner Mini Dock:
    if (window.location.search.includes('view=mini')) {
        document.body.classList.add('mini-dock-mode');
        switchView('chat');
    } else if (window.location.search.includes('tab=chat')) {
        switchView('chat');
    } else if (window.innerWidth < 768) {
        switchView('files');
    }

    window.addEventListener('resize', () => {
        if (!document.body.classList.contains('mini-dock-mode') && window.innerWidth < 768) {
            const container = document.getElementById('mainContainer');
            if (container && container.classList.contains('split-view')) {
                switchView('files');
            }
        }
    });

    initUserInfo();
    fetchHubConfig();
    initPwaInstallState();
    autoRequestNotificationPermission();
    updateAlertsButtonDisplay();
    if (typeof loadFoldersList === 'function') loadFoldersList();
    if (typeof loadFileList === 'function') loadFileList();
    if (typeof loadMessages === 'function') loadMessages();

    if (typeof loadMessages === 'function') setInterval(loadMessages, 2000);
    if (typeof loadFileList === 'function') setInterval(loadFileList, 8000);
    if (typeof loadFoldersList === 'function') setInterval(loadFoldersList, 8000);
    setInterval(checkTargetTabSignal, 400);
});

// Auto-switch & scroll on window focus
window.addEventListener('focus', () => {
    checkTargetTabSignal();
    if (typeof scrollChatToBottom === 'function' && (currentActiveView === 'chat' || currentActiveView === 'split')) {
        scrollChatToBottom(true);
    }
});

// Auto-unlock Web Audio chime and prompt Notification permission on first click anywhere
document.addEventListener('click', function unlockAudioAndAlertsOnce() {
    getNotificationAudioCtx();
    autoRequestNotificationPermission();
}, { once: true });