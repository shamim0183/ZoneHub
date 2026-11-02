/**
 * ZoneHub Host PC Live System & Speed Dashboard + Cloudflare Remote Access Manager
 */
(function() {
    let statsTimer = null;
    let warnedLowSpace = false;
    let isTunnelBusy = false;
    let currentGlobalUrl = '';

    async function fetchHostStats() {
        try {
            const res = await fetch('/api/stats', { cache: 'no-cache' });
            if (!res.ok) return;
            const data = await res.json();
            if (data && data.success) {
                renderHostDashboard(data);
            }
        } catch (err) {
            // Server temporarily restarting or offline
        }
    }

    function renderHostDashboard(data) {
        // 1. Storage Metric
        const diskFreeText = document.getElementById('diskFreeText');
        const diskBar = document.getElementById('diskProgressBar');
        if (data.storage) {
            const usedPct = data.storage.usedPercent || 0;
            if (diskFreeText) {
                diskFreeText.innerText = `${data.storage.freeFormatted || '0 GB'} free (${usedPct}% used)`;
                const dirInfo = data.storage.storageDir ? ` • Location: ${data.storage.storageDir}` : '';
                diskFreeText.title = `Drive ${data.storage.drive || 'C:'}${dirInfo} • Total: ${data.storage.totalFormatted} • Free: ${data.storage.freeFormatted}`;
            }
            if (diskBar) {
                diskBar.style.width = Math.min(100, Math.max(2, usedPct)) + '%';
                diskBar.classList.remove('warning', 'danger');
                if (usedPct >= 90) {
                    diskBar.classList.add('danger');
                    if (!warnedLowSpace && typeof showToast === 'function') {
                        warnedLowSpace = true;
                        showToast('⚠️ Host PC storage is over 90% full! Please free up disk space.');
                    }
                } else if (usedPct >= 75) {
                    diskBar.classList.add('warning');
                }
            }
        }

        // 2. Real-time LAN Speed & Traffic Metric
        const speedText = document.getElementById('lanSpeedText');
        const trafficTotal = document.getElementById('lanTrafficTotal');
        if (data.traffic) {
            if (speedText) {
                const dl = data.traffic.downloadSpeed || '0 KB/s';
                const ul = data.traffic.uploadSpeed || '0 KB/s';
                speedText.innerText = `↓ ${dl}  ↑ ${ul}`;
            }
            if (trafficTotal) {
                const totalSent = data.traffic.totalSentFormatted || '0 B';
                const totalRecv = data.traffic.totalReceivedFormatted || '0 B';
                trafficTotal.innerText = `↓ ${totalSent} • ↑ ${totalRecv}`;
            }
        }

        // 3. Active Devices Metric & Popover Details
        const devicesText = document.getElementById('activeDevicesText');
        const countTag = document.getElementById('activePeersCountTag');
        const peersList = document.getElementById('activePeersList');
        if (data.devices) {
            const total = data.devices.total || 1;
            const pc = data.devices.desktop || 0;
            const mob = data.devices.mobile || 0;
            let breakdown = `${total} Online`;
            if (pc > 0 && mob > 0) {
                breakdown += ` (${pc} PC, ${mob} Phone)`;
            } else if (mob > 0) {
                breakdown += ` (${mob} Phone)`;
            } else if (pc > 0) {
                breakdown += ` (${pc} PC)`;
            }
            if (devicesText) devicesText.innerText = breakdown;
            if (countTag) countTag.innerText = `${total} Online`;

            // Populate Active Peers details in popover
            if (peersList && Array.isArray(data.devices.peers)) {
                if (data.devices.peers.length === 0) {
                    peersList.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:12px;">No colleagues currently active</div>';
                } else {
                    peersList.innerHTML = data.devices.peers.map(p => {
                        const isHost = p.isHost;
                        const icon = p.icon || (isHost ? '💻' : '📱');
                        const hostBadge = isHost ? '<span class="peer-host-badge">Host</span>' : '';
                        const ipText = p.ip ? `<span>${escapeHtml(p.ip)}</span> • ` : '';
                        const devType = p.deviceType || (p.isMobile ? 'Mobile' : 'PC');
                        const lastSeen = p.lastSeen || 'Just now';
                        const name = p.name || 'Anonymous';
                        return `
                            <div class="active-peer-row">
                                <div class="peer-avatar-wrap">
                                    <span class="peer-avatar-icon">${icon}</span>
                                    <span class="peer-status-dot"></span>
                                </div>
                                <div class="peer-info-wrap">
                                    <div class="peer-name-line">
                                        <span class="peer-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                                        ${hostBadge}
                                    </div>
                                    <div class="peer-meta-line">
                                        ${ipText}<span>${escapeHtml(devType)}</span> • <span class="peer-time">${escapeHtml(lastSeen)}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        }

        // 4. Remote Internet Access (Cloudflare Tunnel)
        const remoteText = document.getElementById('remoteStatusText');
        const globalPill = document.getElementById('globalTunnelLinkGroup');
        const globalLink = document.getElementById('globalShareLink');
        const adminBadge = document.getElementById('adminTunnelStatusBadge');
        const adminBtn = document.getElementById('adminTunnelToggleBtn');
        const adminUrlBox = document.getElementById('adminTunnelUrlBox');
        const adminUrlLink = document.getElementById('adminTunnelUrlLink');

        const isRunning = data.tunnel && data.tunnel.running && data.tunnel.url;
        currentGlobalUrl = isRunning ? data.tunnel.url : '';

        if (remoteText) {
            remoteText.innerText = isRunning ? '🟢 Live Worldwide' : '⚪ Local Only';
            remoteText.style.color = isRunning ? '#34d399' : 'var(--text-muted)';
        }

        const quickBtn = document.getElementById('remoteToggleQuickBtn');
        if (quickBtn) {
            quickBtn.style.display = (typeof isAdmin !== 'undefined' && isAdmin) ? 'inline-block' : 'none';
            quickBtn.innerText = isRunning ? 'Manage ▾' : 'Go Global';
            quickBtn.style.color = isRunning ? '#34d399' : '#a5b4fc';
            quickBtn.style.borderColor = isRunning ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)';
            quickBtn.style.background = isRunning ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.15)';
        }

        const hostStorageChangeBtn = document.getElementById('hostStorageChangeBtn');
        if (hostStorageChangeBtn) {
            hostStorageChangeBtn.style.display = (typeof isAdmin !== 'undefined' && isAdmin) ? 'inline-block' : 'none';
        }

        if (globalPill) {
            globalPill.style.display = isRunning ? 'flex' : 'none';
            if (isRunning && globalLink) {
                globalLink.href = currentGlobalUrl;
                globalLink.innerText = currentGlobalUrl;
                globalLink.title = currentGlobalUrl;
            }
        }

        if (adminBadge) {
            adminBadge.innerText = isRunning ? '🟢 Live Worldwide (HTTPS)' : '⚪ Local LAN Only (Office Wi-Fi)';
            adminBadge.className = 'admin-badge-status ' + (isRunning ? 'active' : 'inactive');
        }

        if (adminBtn && !isTunnelBusy) {
            adminBtn.innerText = isRunning ? '🛑 Stop Remote Access' : '🚀 Enable Worldwide Access';
            adminBtn.className = isRunning ? 'btn btn-secondary' : 'btn btn-primary';
            adminBtn.style.color = isRunning ? '#f87171' : '#fff';
            adminBtn.style.borderColor = isRunning ? 'rgba(239,68,68,0.3)' : '';
        }

        if (adminUrlBox) {
            adminUrlBox.style.display = isRunning ? 'block' : 'none';
            if (isRunning && adminUrlLink) {
                adminUrlLink.href = currentGlobalUrl;
                adminUrlLink.innerText = currentGlobalUrl;
            }
        }
    }

    async function toggleGlobalTunnel() {
        if (isTunnelBusy) return;
        const adminBtn = document.getElementById('adminTunnelToggleBtn');
        const adminPin = localStorage.getItem('zonehub_admin_pin') || '';

        isTunnelBusy = true;
        const isCurrentlyActive = !!currentGlobalUrl;

        if (adminBtn) {
            adminBtn.disabled = true;
            adminBtn.innerText = isCurrentlyActive ? 'Stopping Tunnel...' : 'Starting Secure Tunnel (Cloudflare)...';
        }

        try {
            const endpoint = isCurrentlyActive ? '/api/tunnel/stop' : '/api/tunnel/start';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminPin,
                    'x-admin-pin': adminPin
                }
            });
            const data = await res.json();
            if (data.success) {
                if (!isCurrentlyActive && data.url) {
                    currentGlobalUrl = data.url;
                    if (typeof showToast === 'function') {
                        showToast('🌐 Global Remote Access Enabled!');
                    }
                } else {
                    currentGlobalUrl = '';
                    if (typeof showToast === 'function') {
                        showToast('⚪ Remote Access Stopped. Now Local LAN only.');
                    }
                }
                await fetchHostStats();
            } else {
                if (typeof showToast === 'function') {
                    showToast('⚠️ ' + (data.error || 'Failed to toggle tunnel'));
                }
            }
        } catch (err) {
            if (typeof showToast === 'function') {
                showToast('⚠️ Error: ' + err.message);
            }
        } finally {
            isTunnelBusy = false;
            if (adminBtn) adminBtn.disabled = false;
        }
    }

    function copyGlobalLink() {
        if (!currentGlobalUrl) {
            if (typeof showToast === 'function') showToast('No active global link');
            return;
        }
        navigator.clipboard.writeText(currentGlobalUrl).then(() => {
            if (typeof showToast === 'function') showToast('📋 Global Internet Link Copied!');
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = currentGlobalUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (typeof showToast === 'function') showToast('📋 Global Internet Link Copied!');
        });
    }

    function openGlobalQrModal() {
        if (!currentGlobalUrl) {
            if (typeof showToast === 'function') showToast('Please enable Global Access first');
            return;
        }
        const modal = document.getElementById('qrModal');
        const container = document.getElementById('qrCodeContainer');
        const display = document.getElementById('qrUrlDisplay');
        if (display) display.innerText = currentGlobalUrl;
        if (modal) modal.style.display = 'flex';
        if (typeof window.renderQRToSvg === 'function' && container) {
            window.renderQRToSvg(currentGlobalUrl, container, 200);
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function closeActivePeersPopover(e) {
        if (e) {
            e.stopPropagation();
            if (e.preventDefault) e.preventDefault();
        }
        const popover = document.getElementById('activePeersPopover');
        if (popover) {
            popover.classList.remove('active');
        }
        const metricDevices = document.getElementById('metricDevices');
        if (metricDevices) {
            metricDevices.blur();
        }
    }

    function positionActivePeersPopover() {
        const popover = document.getElementById('activePeersPopover');
        const metricDevices = document.getElementById('metricDevices');
        if (!popover || !metricDevices) return;
        if (window.innerWidth <= 600) {
            popover.style.top = '';
            popover.style.left = '';
            return;
        }
        const rect = metricDevices.getBoundingClientRect();
        popover.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        popover.style.left = Math.max(12, Math.min(window.innerWidth - 370, rect.left + window.scrollX)) + 'px';
    }

    function toggleActivePeersPopover(e) {
        if (e) e.stopPropagation();
        const popover = document.getElementById('activePeersPopover');
        if (popover) {
            if (popover.classList.contains('active')) {
                closeActivePeersPopover(e);
            } else {
                positionActivePeersPopover();
                popover.classList.add('active');
            }
        }
    }

    // Close popover when clicked outside
    document.addEventListener('click', function(e) {
        const popover = document.getElementById('activePeersPopover');
        if (popover && popover.classList.contains('active')) {
            const metricDevices = document.getElementById('metricDevices');
            if (!metricDevices || !metricDevices.contains(e.target)) {
                closeActivePeersPopover(e);
            }
        }
    });

    // Initialize Polling on DOM Ready
    function init() {
        fetchHostStats();
        if (statsTimer) clearInterval(statsTimer);
        statsTimer = setInterval(fetchHostStats, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Admin Storage Drive Management Handlers
    async function loadAdminDrives() {
        const listEl = document.getElementById('adminDrivesList');
        const inputEl = document.getElementById('adminStoragePathInput');
        const badgeEl = document.getElementById('adminCurrentDriveBadge');
        if (!listEl) return;

        try {
            const adminToken = localStorage.getItem('zonehub_admin_pin') || '';
            const res = await fetch('/api/admin/drives', {
                headers: { 'X-Admin-Pin': adminToken }
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.drives)) {
                if (inputEl && (!inputEl.value || inputEl.value === '')) {
                    inputEl.value = data.currentDir || '';
                }
                if (badgeEl) {
                    badgeEl.innerText = data.currentDrive ? (data.currentDrive.replace(/\\$/, '') + ' Drive') : 'Current Storage';
                }

                let html = '';
                data.drives.forEach(d => {
                    const isCur = !!d.isCurrent;
                    const labelTxt = d.label ? ` (${escapeHtml(d.label)})` : '';
                    const freeTxt = `${d.freeFormatted} free of ${d.totalFormatted}`;
                    const defaultFolder = d.name.endsWith('\\') ? `${d.name}ZoneHub_Storage` : `${d.name}\\ZoneHub_Storage`;
                    const safeFolderStr = defaultFolder.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                    html += `
                        <div style="background:rgba(255,255,255,${isCur ? '0.08' : '0.03'});border:1px solid ${isCur ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.08)'};border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                            <div style="min-width:0;">
                                <div style="font-size:12px;font-weight:700;color:${isCur ? '#60a5fa' : '#fff'};display:flex;align-items:center;gap:6px;">
                                    <span>💽</span>
                                    <span>${escapeHtml(d.name)}${labelTxt}</span>
                                    ${isCur ? '<span style="font-size:10px;background:rgba(59,130,246,0.25);color:#93c5fd;padding:2px 6px;border-radius:4px;font-weight:800;">Active</span>' : ''}
                                </div>
                                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                                    ${freeTxt} (${d.usedPercent}% used)
                                </div>
                            </div>
                            <button type="button" onclick="selectDrivePath('${safeFolderStr}')" class="btn btn-secondary" style="font-size:11px;padding:4px 10px;font-weight:700;white-space:nowrap;height:28px;">
                                ${isCur ? '✓ Selected' : 'Use Drive'}
                            </button>
                        </div>
                    `;
                });
                listEl.innerHTML = html;
            } else {
                listEl.innerHTML = `<div style="font-size:11px;color:#f87171;padding:6px;text-align:center;">${escapeHtml(data.error || 'Failed to detect drives')}</div>`;
            }
        } catch (err) {
            listEl.innerHTML = `<div style="font-size:11px;color:#f87171;padding:6px;text-align:center;">Error communicating with server</div>`;
        }
    }

    function selectDrivePath(folderPath) {
        const inputEl = document.getElementById('adminStoragePathInput');
        if (inputEl) {
            inputEl.value = folderPath;
            inputEl.focus();
        }
    }

    async function applyStorageLocation() {
        const inputEl = document.getElementById('adminStoragePathInput');
        const msgEl = document.getElementById('adminStorageMsg');
        const btn = document.getElementById('adminApplyStorageBtn');
        if (!inputEl) return;
        const newPath = inputEl.value.trim();
        if (!newPath) {
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.background = 'rgba(239,68,68,0.15)';
                msgEl.style.color = '#f87171';
                msgEl.innerText = 'Please specify a folder path.';
            }
            return;
        }

        if (btn) { btn.disabled = true; btn.innerText = 'Applying...'; }
        if (msgEl) msgEl.style.display = 'none';

        try {
            const adminToken = localStorage.getItem('zonehub_admin_pin') || '';
            const res = await fetch('/api/admin/set-storage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Pin': adminToken
                },
                body: JSON.stringify({ path: newPath })
            });
            const data = await res.json();
            if (data.success) {
                if (msgEl) {
                    msgEl.style.display = 'block';
                    msgEl.style.background = 'rgba(16,185,129,0.15)';
                    msgEl.style.color = '#34d399';
                    msgEl.innerText = '✅ ' + (data.message || 'Storage directory updated successfully!');
                }
                if (typeof showToast === 'function') showToast('💽 Storage location updated successfully!');
                loadAdminDrives();
                fetchHostStats();
                if (typeof window.loadFoldersList === 'function') window.loadFoldersList();
                if (typeof window.loadFileList === 'function') window.loadFileList();
            } else {
                if (msgEl) {
                    msgEl.style.display = 'block';
                    msgEl.style.background = 'rgba(239,68,68,0.15)';
                    msgEl.style.color = '#f87171';
                    msgEl.innerText = '❌ ' + (data.error || 'Failed to update storage path.');
                }
            }
        } catch (e) {
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.background = 'rgba(239,68,68,0.15)';
                msgEl.style.color = '#f87171';
                msgEl.innerText = '❌ Connection failed.';
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = '💾 Apply'; }
        }
    }

    function handleStorageMetricClick() {
        if (typeof isAdmin !== 'undefined' && !isAdmin) {
            if (typeof showToast === 'function') showToast('Host Storage status (Admin required to change drives).');
            return;
        }
        if (typeof window.openAdminModal === 'function') {
            window.openAdminModal();
            setTimeout(() => {
                const el = document.getElementById('adminDrivesList');
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 250);
        }
    }

    function handleRemoteMetricClick() {
        if (typeof isAdmin !== 'undefined' && !isAdmin) {
            if (typeof showToast === 'function') {
                showToast(currentGlobalUrl ? 'ZoneHub is live worldwide!' : 'ZoneHub is in Local Office Wi-Fi mode.');
            }
            return;
        }
        if (typeof window.openAdminModal === 'function') {
            window.openAdminModal();
        }
    }

    // Expose Global Handlers
    window.toggleGlobalTunnel = toggleGlobalTunnel;
    window.copyGlobalLink = copyGlobalLink;
    window.openGlobalQrModal = openGlobalQrModal;
    window.fetchHostStats = fetchHostStats;
    window.toggleActivePeersPopover = toggleActivePeersPopover;
    window.closeActivePeersPopover = closeActivePeersPopover;
    window.loadAdminDrives = loadAdminDrives;
    window.selectDrivePath = selectDrivePath;
    window.applyStorageLocation = applyStorageLocation;
    window.handleStorageMetricClick = handleStorageMetricClick;
    window.handleRemoteMetricClick = handleRemoteMetricClick;
})();

