        // Client Token for message ownership
        let myUserId = localStorage.getItem('skycommerce_user_id');
        if (!myUserId) {
            myUserId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('skycommerce_user_id', myUserId);
        }

        // User Name State (Default from PC Hostname)
        let currentUserName = localStorage.getItem('skycommerce_user_name');
        if (!currentUserName) {
            fetch('/api/my-info')
                .then(r => r.json())
                .then(info => {
                    currentUserName = info.defaultName || 'Employee';
                    localStorage.setItem('skycommerce_user_name', currentUserName);
                    updateUserDisplay();
                })
                .catch(() => {
                    currentUserName = 'Employee';
                    updateUserDisplay();
                });
        } else {
            updateUserDisplay();
        }

        function updateUserDisplay() {
            document.getElementById('currentUserNameDisplay').innerText = currentUserName || 'Employee';
            const init = (currentUserName || 'EM').substring(0, 2).toUpperCase();
            document.getElementById('currentUserAvatar').innerText = init;
        }

        function promptChangeName() {
            const newName = prompt('আপনার নাম পরিবর্তন করুন (Enter your name for Team Chat):', currentUserName);
            if (newName && newName.trim().length > 0) {
                currentUserName = newName.trim();
                localStorage.setItem('skycommerce_user_name', currentUserName);
                updateUserDisplay();
                showToast('Name updated to: ' + currentUserName);
            }
        }

        let hubConfigData = null;

        async function fetchHubConfig() {
            try {
                const res = await fetch('/api/config');
                hubConfigData = await res.json();
                if (hubConfigData) {
                    if (hubConfigData.hubName) {
                        const titleEl = document.getElementById('hubTitleText');
                        if (titleEl) titleEl.innerText = hubConfigData.hubName;
                        document.title = hubConfigData.hubName + ' & Team Chat';
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
            if (!e || e.target.id === 'hubRenameModal' || e.target.classList.contains('modal-close-btn')) {
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
                    document.title = data.hubName + ' & Team Chat';
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

        // Notification & Audio Alert State
        let alertsEnabled = localStorage.getItem('hub_alerts_enabled') !== 'false';
        let currentActiveView = (window.innerWidth < 768) ? 'files' : 'split';
        let unreadChatCount = 0;
        let isFirstMessagesLoad = true;
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
            if (alertsEnabled) {
                txt.innerText = 'Alerts: On';
                btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                btn.style.color = '#34d399';
            } else {
                txt.innerText = 'Alerts: Off';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                btn.style.color = 'var(--text-muted)';
            }
        }

        function toggleDesktopNotifications() {
            alertsEnabled = !alertsEnabled;
            localStorage.setItem('hub_alerts_enabled', alertsEnabled ? 'true' : 'false');
            updateAlertsButtonDisplay();

            if (alertsEnabled) {
                if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission().then(perm => {
                        if (perm === 'granted') {
                            showToast('🔔 Browser & Desktop Corner Notifications enabled!');
                            playProfessionalChime();
                        }
                    });
                } else {
                    showToast('🔔 Chat notifications & sound turned ON');
                    playProfessionalChime();
                }
            } else {
                showToast('🔕 Notifications & sound turned OFF');
            }
        }

        function testChimeSound() {
            playProfessionalChime();
            showToast('🔊 Professional Chime Sound Played!');
            showCornerChatToast({
                id: 'test_' + Date.now(),
                user: 'System Bot',
                text: '🔔 Test Notification: This is how corner alerts & sound appear!'
            });
            if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                    try {
                        new Notification('System Bot (Team Chat)', {
                            body: '🔔 Test Notification: Audio & Desktop alerts are active!',
                            icon: '/favicon.ico',
                            silent: true
                        });
                    } catch (e) {}
                } else if (Notification.permission === 'default') {
                    Notification.requestPermission();
                }
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

        function updateChatUnreadBadge() {
            const badge = document.getElementById('chatUnreadBadge');
            if (!badge) return;
            if (unreadChatCount > 0) {
                badge.innerText = '+' + unreadChatCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        // Layout switching
        function switchView(view) {
            const container = document.getElementById('mainContainer');
            const filesWrapper = document.getElementById('filesSectionWrapper');
            const chatWrapper = document.getElementById('chatSectionWrapper');
            const tabMediaBtn = document.getElementById('tabMediaBtn');
            const tabFilesOnlyBtn = document.getElementById('tabFilesOnlyBtn');
            const tabChatOnlyBtn = document.getElementById('tabChatOnlyBtn');

            // On mobile devices, split view is not allowed
            if (window.innerWidth < 768 && view === 'split') {
                view = 'files';
            }

            currentActiveView = view;
            if (view === 'chat' || view === 'split') {
                unreadChatCount = 0;
                updateChatUnreadBadge();
            }

            tabMediaBtn.classList.remove('active');
            tabFilesOnlyBtn.classList.remove('active');
            tabChatOnlyBtn.classList.remove('active');

            if (view === 'split') {
                container.className = 'split-view';
                filesWrapper.style.display = 'block';
                chatWrapper.style.display = 'block';
                tabMediaBtn.classList.add('active');
            } else if (view === 'files') {
                container.className = 'content-grid';
                filesWrapper.style.display = 'block';
                chatWrapper.style.display = 'none';
                tabFilesOnlyBtn.classList.add('active');
            } else if (view === 'chat') {
                container.className = 'content-grid';
                filesWrapper.style.display = 'none';
                chatWrapper.style.display = 'block';
                tabChatOnlyBtn.classList.add('active');
                setTimeout(() => {
                    const msgBox = document.getElementById('chatMessages');
                    if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
                }, 50);
            }
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

        // Initialize & Live Polling
        if (window.innerWidth < 768) {
            switchView('files');
        }
        window.addEventListener('resize', () => {
            if (window.innerWidth < 768) {
                const container = document.getElementById('mainContainer');
                if (container && container.classList.contains('split-view')) {
                    switchView('files');
                }
            }
        });

        fetchHubConfig();
        updateAlertsButtonDisplay();
        loadFoldersList();
        loadFileList();
        loadMessages();

        setInterval(loadMessages, 2000);
        setInterval(loadFileList, 8000);
        setInterval(loadFoldersList, 8000);
    </script>

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

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
        installBtn.style.display = 'inline-flex';
    }
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
    showToast('ðŸŽ‰ App installed successfully to your device!');
});

function triggerPwaInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choiceResult) => {
            deferredInstallPrompt = null;
            const installBtn = document.getElementById('pwaInstallBtn');
            if (installBtn) installBtn.style.display = 'none';
        });
    } else {
        alert('To install this app on your device:\n\nâ€¢ On Chrome/Edge (Desktop): Click the install icon in the URL bar (top right)\nâ€¢ On Android Chrome: Tap Menu (â‹®) -> Add to Home screen / Install app\nâ€¢ On iPhone Safari: Tap Share (square with arrow) -> Add to Home Screen');
    }
}