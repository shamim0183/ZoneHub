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
                diskFreeText.title = `Drive ${data.storage.drive || 'C:'} • Total: ${data.storage.totalFormatted} • Free: ${data.storage.freeFormatted}`;
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

        // 3. Active Devices Metric
        const devicesText = document.getElementById('activeDevicesText');
        if (data.devices && devicesText) {
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
            devicesText.innerText = breakdown;
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

    // Expose Global Handlers
    window.toggleGlobalTunnel = toggleGlobalTunnel;
    window.copyGlobalLink = copyGlobalLink;
    window.openGlobalQrModal = openGlobalQrModal;
    window.fetchHostStats = fetchHostStats;
})();
