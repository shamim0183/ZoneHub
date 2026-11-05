// ============================================================================
// ZoneHub - WebRTC Peer-to-Peer (P2P) Direct Drop Engine (0 Host Storage Used)
// Large File (1GB+) Resilient Streaming with Backpressure Flow Control
// ============================================================================

(function() {
    'use strict';

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatBytes(bytes) {
        if (typeof window.formatBytes === 'function') return window.formatBytes(bytes);
        if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    const STUN_CONFIG = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' }
        ]
    };

    // High-performance WebRTC SCTP parameters (RFC 8831)
    // Universal High-performance WebRTC SCTP parameters (Mobile & Desktop Safe)
    const CHUNK_SIZE = 32 * 1024;        // 32 KB chunk (guaranteed safe across iOS WebKit, Android Chrome & Desktop)
    const READ_BLOCK_SIZE = 512 * 1024;  // 512 KB slice blocks
    const HIGH_WATER_MARK = 1024 * 1024; // 1 MB high-water mark (prevents mobile SCTP buffer rejection)
    const LOW_WATER_MARK = 256 * 1024;   // 256 KB resume threshold

    let activePeerConnections = new Map(); // targetPeerId -> RTCPeerConnection
    let activeDataChannels = new Map();    // targetPeerId -> RTCDataChannel
    let pendingFileOffer = null;          // file waiting to send
    let targetPeerForTransfer = null;
    let targetPeerNameForTransfer = '';
    let currentIncomingTransfer = null;
    let activeTransferInProgress = false;
    let isTransferCardMinimized = false;
    let pendingCandidates = new Map();     // targetPeerId -> Array of RTCIceCandidate
    let heartbeatTimer = null;
    let signalTimer = null;

    window.__p2pOnlinePeers = [];
    window.__zonehubActiveBlobs = window.__zonehubActiveBlobs || new Map();
    window.__zonehubTransferRecords = window.__zonehubTransferRecords || [];

    // -------------------------------------------------------------
    // AirDrop Persistent Transfer History Manager
    // -------------------------------------------------------------
    function getAirDropHistory() {
        try {
            const raw = localStorage.getItem('zonehub_airdrop_history');
            return raw ? JSON.parse(raw) : [];
        } catch(e) {
            return [];
        }
    }
    window.getAirDropHistory = getAirDropHistory;

    function saveAirDropHistory(list) {
        try {
            const cleanList = (list || []).slice(0, 100).map(t => ({
                id: t.id,
                direction: t.direction,
                fileName: t.fileName,
                fileSize: t.fileSize,
                mime: t.mime,
                peerName: t.peerName,
                peerId: t.peerId,
                timestamp: t.timestamp,
                savedLocation: t.savedLocation,
                status: t.status
            }));
            localStorage.setItem('zonehub_airdrop_history', JSON.stringify(cleanList));
            window.__zonehubTransferRecords = cleanList;
        } catch(e) {}
    }
    window.saveAirDropHistory = saveAirDropHistory;

    function addAirDropTransferRecord(record, blobOrFile, blobUrl) {
        if (!record || !record.id) return;
        if (blobOrFile && window.__zonehubActiveBlobs) {
            window.__zonehubActiveBlobs.set(record.id, {
                id: record.id,
                fileName: record.fileName,
                blob: blobOrFile,
                file: blobOrFile,
                blobUrl: blobUrl,
                mime: record.mime
            });
            window.__zonehubActiveBlobs.set(record.fileName, {
                id: record.id,
                fileName: record.fileName,
                blob: blobOrFile,
                file: blobOrFile,
                blobUrl: blobUrl,
                mime: record.mime
            });
        }

        let history = getAirDropHistory();
        history = history.filter(h => h.id !== record.id);
        history.unshift(record);
        saveAirDropHistory(history);
        renderAirDropHistory();
    }
    window.addAirDropTransferRecord = addAirDropTransferRecord;

    function isAutoAcceptEnabled() {
        return localStorage.getItem('zonehub_auto_accept_airdrop') !== 'false';
    }
    window.isAutoAcceptEnabled = isAutoAcceptEnabled;

    window.toggleAutoAccept = function(enabled) {
        localStorage.setItem('zonehub_auto_accept_airdrop', enabled ? 'true' : 'false');
        if (typeof showToast === 'function') {
            showToast(enabled ? '⚡ Auto-Accept ON: Beamed files download immediately' : 'ℹ️ Auto-Accept OFF: Confirmation prompt required');
        }
    };

    window.minimizeP2PTransferCard = function() {
        isTransferCardMinimized = true;
        const card = document.getElementById('p2pTransferCard');
        const pill = document.getElementById('p2pTransferMiniPill');
        if (card) card.style.display = 'none';
        if (pill) pill.style.display = 'flex';
        if (typeof showToast === 'function' && activeTransferInProgress) {
            showToast('⚡ Transfer minimized to floating pill. Tap it anytime to reopen.');
        }
    };

    window.expandP2PTransferCard = function() {
        isTransferCardMinimized = false;
        const card = document.getElementById('p2pTransferCard');
        const pill = document.getElementById('p2pTransferMiniPill');
        if (pill) pill.style.display = 'none';
        if (card) card.style.display = 'block';
    };

    window.closeP2PTransferCard = function() {
        if (activeTransferInProgress) {
            // Do not abort if user clicked close merely to type or view screen
            window.minimizeP2PTransferCard();
            return;
        }
        isTransferCardMinimized = false;
        const card = document.getElementById('p2pTransferCard');
        const pill = document.getElementById('p2pTransferMiniPill');
        if (card) card.style.display = 'none';
        if (pill) pill.style.display = 'none';
    };

    window.openAirDropFolder = async function(folderType, fileName) {
        try {
            const url = '/api/open-folder?folder=' + encodeURIComponent(folderType || 'downloads') + (fileName ? '&file=' + encodeURIComponent(fileName) : '');
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.success) {
                if (data.opened) {
                    showToast('📂 Opened folder in Windows Explorer: ' + (data.path || 'Downloads'));
                } else {
                    showToast('📁 Saved directory: ' + (data.path || 'Downloads'));
                }
            } else {
                showToast('📁 Saved location: C:\\Users\\...\\Downloads');
            }
        } catch (e) {
            showToast('📁 Saved location: C:\\Users\\...\\Downloads');
        }
        if (folderType && folderType !== 'downloads' && typeof switchView === 'function') {
            switchView('files');
        }
    };

    function cleanupPeerSession(peerId) {
        if (peerId) {
            if (activeDataChannels.has(peerId)) {
                try { activeDataChannels.get(peerId).close(); } catch (e) {}
                activeDataChannels.delete(peerId);
            }
            if (activePeerConnections.has(peerId)) {
                try { activePeerConnections.get(peerId).close(); } catch (e) {}
                activePeerConnections.delete(peerId);
            }
            if (pendingCandidates.has(peerId)) {
                pendingCandidates.delete(peerId);
            }
        }
        activeTransferInProgress = false;
    }

    window.cancelActiveP2PTransfer = function() {
        if (!confirm('Are you sure you want to stop and cancel this AirDrop transfer?')) return;
        activeTransferInProgress = false;
        isTransferCardMinimized = false;

        const otherPeerId = targetPeerForTransfer || (currentIncomingTransfer ? currentIncomingTransfer.fromId : '');
        if (otherPeerId) {
            postSignal(otherPeerId, 'transfer-canceled', { by: getMyName() });
        }

        for (const [id, dc] of activeDataChannels.entries()) {
            try { dc.close(); } catch (e) {}
        }
        for (const [id, pc] of activePeerConnections.entries()) {
            try { pc.close(); } catch (e) {}
        }
        activeDataChannels.clear();
        activePeerConnections.clear();
        pendingCandidates.clear();

        currentIncomingTransfer = null;
        pendingFileOffer = null;
        targetPeerForTransfer = null;

        const card = document.getElementById('p2pTransferCard');
        const pill = document.getElementById('p2pTransferMiniPill');
        if (card) card.style.display = 'none';
        if (pill) pill.style.display = 'none';

        if (typeof showToast === 'function') {
            showToast('⏹ AirDrop transfer canceled.');
        }
    };

    window.deleteAirDropHistoryItem = function(id) {
        let history = getAirDropHistory();
        history = history.filter(h => h.id !== id);
        saveAirDropHistory(history);
        renderAirDropHistory();
        showToast('Removed from AirDrop history');
    };

    window.clearAirDropHistory = function() {
        if (!confirm('Clear all AirDrop transfer records from this device?')) return;
        localStorage.removeItem('zonehub_airdrop_history');
        window.__zonehubTransferRecords = [];
        renderAirDropHistory();
        showToast('AirDrop history cleared.');
    };

    window.openAirDropMedia = function(idOrName) {
        const entry = (window.__zonehubActiveBlobs && (window.__zonehubActiveBlobs.get(idOrName) || window.__zonehubActiveBlobs.get(idOrName.toLowerCase()))) ||
                      (window.__zonehubTransferRecords && window.__zonehubTransferRecords.find(t => t.id === idOrName || t.fileName === idOrName));
        
        let blobUrl = entry && (entry.blobUrl || (entry.blob ? URL.createObjectURL(entry.blob) : null));
        const fileName = (entry && entry.fileName) || idOrName || 'media_item';
        const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(fileName);
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);

        if (!blobUrl) {
            const hist = getAirDropHistory();
            const found = hist.find(h => h.id === idOrName || h.fileName === idOrName);
            if (found && window.__zonehubActiveBlobs) {
                const active = window.__zonehubActiveBlobs.get(found.id) || window.__zonehubActiveBlobs.get(found.fileName);
                if (active) blobUrl = active.blobUrl || (active.blob ? URL.createObjectURL(active.blob) : null);
            }
        }

        if (blobUrl) {
            if (isVideo) {
                if (typeof openAlbumLightbox === 'function') {
                    openAlbumLightbox([blobUrl], 0, fileName);
                } else if (typeof playVideo === 'function') {
                    playVideo(blobUrl, fileName);
                } else {
                    window.open(blobUrl, '_blank');
                }
            } else if (isImage) {
                if (typeof openAlbumLightbox === 'function') {
                    openAlbumLightbox([blobUrl], 0, fileName);
                } else {
                    window.open(blobUrl, '_blank');
                }
            } else {
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { if (a.parentNode) document.body.removeChild(a); }, 1000);
            }
        } else {
            showToast('📁 "' + fileName + '" is saved in your local Downloads folder. Open it from your PC or browser download shelf.');
        }
    };

    window.saveAirDropAs = async function(idOrName) {
        const entry = (window.__zonehubActiveBlobs && (window.__zonehubActiveBlobs.get(idOrName) || window.__zonehubActiveBlobs.get(idOrName.toLowerCase()))) ||
                      (window.__zonehubTransferRecords && window.__zonehubTransferRecords.find(t => t.id === idOrName || t.fileName === idOrName));
        const fileName = (entry && entry.fileName) || idOrName || 'download';
        const blob = entry && (entry.blob || entry.file);

        if (blob && 'showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                showToast('🎉 Saved directly to: ' + handle.name);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }

        const url = (entry && entry.blobUrl) || (blob ? URL.createObjectURL(blob) : null);
        if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { if (a.parentNode) document.body.removeChild(a); }, 1000);
            showToast('💾 Saved to Downloads folder!');
        } else {
            showToast('📁 "' + fileName + '" is already saved in your Downloads folder.');
        }
    };

    window.uploadAirDropToServer = async function(idOrName, btnElement) {
        const entry = (window.__zonehubActiveBlobs && (window.__zonehubActiveBlobs.get(idOrName) || window.__zonehubActiveBlobs.get(idOrName.toLowerCase()))) ||
                      (window.__zonehubTransferRecords && window.__zonehubTransferRecords.find(t => t.id === idOrName || t.fileName === idOrName));
        const blob = entry && (entry.blob || entry.file);
        const fileName = (entry && entry.fileName) || idOrName || 'media_item';

        if (!blob) {
            showToast('⚠️ File binary is not in memory. Check your Downloads folder.');
            return;
        }

        const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(fileName);
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
        const targetFolder = isVideo ? 'Videos' : (isImage ? 'Pictures' : 'Files');

        if (btnElement) {
            btnElement.disabled = true;
            btnElement.innerHTML = '⏳ Uploading...';
        }
        showToast('☁️ Saving "' + fileName + '" to ZoneHub Shared Library (' + targetFolder + ')...');

        try {
            const url = '/upload?filename=' + encodeURIComponent(fileName) + '&folder=' + encodeURIComponent(targetFolder) + '&expiry=15d';
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('X-Filename', encodeURIComponent(fileName));
            xhr.setRequestHeader('X-Folder', encodeURIComponent(targetFolder));
            xhr.setRequestHeader('X-Expiry', '15d');
            const uploaderName = (typeof getCurrentUserName === 'function' ? getCurrentUserName() : (localStorage.getItem('zonehub_user_name') || 'Employee'));
            xhr.setRequestHeader('X-Uploader', encodeURIComponent(uploaderName));

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    showToast('🎉 Saved to ZoneHub Server! Visible in ' + targetFolder + ' tab for all PCs.');
                    if (btnElement) {
                        btnElement.disabled = true;
                        btnElement.innerHTML = '✓ Saved to Server';
                        btnElement.style.background = '#059669';
                        btnElement.style.borderColor = '#059669';
                        btnElement.style.color = '#fff';
                    }
                    if (typeof loadFileList === 'function') loadFileList();
                    if (typeof loadFoldersList === 'function') loadFoldersList();
                    let history = getAirDropHistory();
                    const item = history.find(h => h.id === idOrName || h.fileName === fileName);
                    if (item) {
                        item.savedLocation = 'ZoneHub Library (' + targetFolder + '/)';
                        item.savedFolder = targetFolder;
                        item.isLibrarySaved = true;
                        saveAirDropHistory(history);
                        renderAirDropHistory();
                    }
                } else {
                    showToast('❌ Server upload error: HTTP ' + xhr.status);
                    if (btnElement) {
                        btnElement.disabled = false;
                        btnElement.innerHTML = '☁️ Save to Library';
                    }
                }
            };
            xhr.onerror = function() {
                showToast('❌ Upload failed: Network connection error');
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.innerHTML = '☁️ Save to Library';
                }
            };
            xhr.send(blob);
        } catch(e) {
            showToast('❌ Upload failed: ' + e.message);
            if (btnElement) {
                btnElement.disabled = false;
                btnElement.innerHTML = '☁️ Save to Library';
            }
        }
    };

    function renderAirDropHistory() {
        const listEl = document.getElementById('p2pHistoryList');
        const countBadge = document.getElementById('p2pHistoryCount');
        if (!listEl) return;

        const history = getAirDropHistory();
        if (countBadge) countBadge.innerText = history.length;

        if (history.length === 0) {
            listEl.innerHTML = 
                '<div class="p2p-history-empty">' +
                    '<div style="font-size:28px;margin-bottom:8px;">📦</div>' +
                    '<div style="font-weight:700;color:#fff;margin-bottom:4px;">No AirDrop transfers yet on this PC</div>' +
                    '<div style="font-size:12px;color:var(--text-muted);">' +
                        'Files you send or receive via AirDrop beam will appear here with instant video playback and save options.' +
                    '</div>' +
                '</div>';
            return;
        }

        let html = '';
        history.forEach(tx => {
            const isSent = tx.direction === 'sent';
            const fileName = tx.fileName || 'file';
            const fileSizeStr = typeof formatBytes === 'function' ? formatBytes(tx.fileSize || 0) : (tx.fileSize + ' B');
            const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(fileName);
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
            const isAudio = /\.(mp3|wav|m4a|ogg|flac)$/i.test(fileName);
            
            const iconChar = isVideo ? '🎬' : (isImage ? '🖼️' : (isAudio ? '🎵' : '📄'));
            const iconClass = isVideo ? 'video' : (isImage ? 'image' : '');

            const timeStr = tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const dateStr = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
            const timeFormatted = (dateStr ? dateStr + ' ' : '') + timeStr;

            const badgeHtml = isSent 
                ? '<span class="p2p-badge-sent">⬆️ Sent to ' + escapeHtml(tx.peerName || 'Peer') + '</span>'
                : '<span class="p2p-badge-received">⬇️ Received from ' + escapeHtml(tx.peerName || 'Peer') + '</span>';

            const isLib = tx.isLibrarySaved;
            const targetFolder = tx.savedFolder || (isVideo ? 'Videos' : (isImage ? 'Pictures' : 'Files'));
            const locHtml = isSent
                ? '<span class="p2p-saved-path">💻 Original on this PC</span>'
                : (isLib
                    ? '<span class="p2p-saved-path p2p-saved-library p2p-clickable-path" onclick="openAirDropFolder(\'' + targetFolder.toLowerCase() + '\', \'' + escapeHtml(fileName) + '\')" title="Saved in ZoneHub Shared Storage (' + targetFolder + '/). Click to open in File Explorer or view in ZoneHub">☁️ ' + escapeHtml(tx.savedLocation || ('ZoneHub: ' + targetFolder + '/')) + '</span>'
                    : '<span class="p2p-saved-path p2p-clickable-path" onclick="openAirDropFolder(\'downloads\', \'' + escapeHtml(fileName) + '\')" title="Auto-saved to Windows Downloads folder. Click to open in File Explorer">📁 ' + escapeHtml(tx.savedLocation || 'Saved in Downloads') + '</span>'
                  );

            let playBtn = '';
            if (isVideo) {
                playBtn = '<button type="button" class="btn btn-primary btn-icon-sm" onclick="openAirDropMedia(\'' + tx.id + '\')" title="Watch Video" style="font-size:11.5px;padding:4px 10px;gap:5px;background:linear-gradient(135deg,#38bdf8,#6366f1);"><svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg> Watch Video</button>';
            } else if (isImage) {
                playBtn = '<button type="button" class="btn btn-primary btn-icon-sm" onclick="openAirDropMedia(\'' + tx.id + '\')" title="Preview Photo" style="font-size:11.5px;padding:4px 10px;gap:5px;background:linear-gradient(135deg,#ec4899,#db2777);"><svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> View Photo</button>';
            }

            const openFolderBtn = !isSent
                ? (isLib
                    ? '<button type="button" class="btn btn-secondary btn-icon-sm" onclick="openAirDropFolder(\'' + targetFolder.toLowerCase() + '\', \'' + escapeHtml(fileName) + '\')" title="Open directory in Windows Explorer" style="font-size:11.5px;padding:4px 10px;gap:5px;color:#34d399;border-color:rgba(16,185,129,0.35);">📂 Open Folder</button>'
                    : '<button type="button" class="btn btn-secondary btn-icon-sm" onclick="openAirDropFolder(\'downloads\', \'' + escapeHtml(fileName) + '\')" title="Open Downloads folder in Windows Explorer" style="font-size:11.5px;padding:4px 10px;gap:5px;color:#38bdf8;border-color:rgba(56,189,248,0.35);">📂 Open Folder</button>'
                  )
                : '';

            html += 
                '<div class="p2p-history-item" id="p2pItem_' + tx.id + '">' +
                    '<div class="p2p-history-left">' +
                        '<div class="p2p-history-icon ' + iconClass + '">' + iconChar + '</div>' +
                        '<div class="p2p-history-info">' +
                            '<div class="p2p-history-title" title="' + escapeHtml(fileName) + '">' + escapeHtml(fileName) + '</div>' +
                            '<div class="p2p-history-meta">' +
                                badgeHtml +
                                '<span>•</span>' +
                                '<span style="font-weight:600;color:#e2e8f0;">' + fileSizeStr + '</span>' +
                                '<span>•</span>' +
                                '<span>' + timeFormatted + '</span>' +
                                '<span>•</span>' +
                                locHtml +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="p2p-history-actions">' +
                        playBtn +
                        openFolderBtn +
                        '<button type="button" class="btn btn-secondary btn-icon-sm" onclick="saveAirDropAs(\'' + tx.id + '\')" title="Save to local folder" style="font-size:11.5px;padding:4px 10px;gap:5px;">💾 Save As...</button>' +
                        '<button type="button" class="btn btn-secondary btn-icon-sm" onclick="uploadAirDropToServer(\'' + tx.id + '\', this)" title="Upload to ZoneHub Shared Library" style="font-size:11.5px;padding:4px 10px;gap:5px;color:#38bdf8;border-color:rgba(56,189,248,0.35);">☁️ Save to Library</button>' +
                        '<button type="button" class="btn btn-secondary btn-icon-sm" onclick="deleteAirDropHistoryItem(\'' + tx.id + '\')" title="Remove from list" style="font-size:11px;padding:4px 8px;color:#f43f5e;">✕</button>' +
                    '</div>' +
                '</div>';
        });

        listEl.innerHTML = html;
    }
    window.renderAirDropHistory = renderAirDropHistory;

    function getMyId() {
        return (typeof myUserId !== 'undefined' && myUserId ? myUserId : (localStorage.getItem('zonehub_user_id') || localStorage.getItem('skycommerce_user_id'))) || '';
    }

    function getMyName() {
        return (typeof currentUserName !== 'undefined' && currentUserName ? currentUserName : (localStorage.getItem('zonehub_user_name') || localStorage.getItem('skycommerce_user_name') || 'Colleague'));
    }

    // -------------------------------------------------------------
    // Signaling API Helpers
    // -------------------------------------------------------------
    async function postSignal(toId, type, data) {
        try {
            await fetch('/api/p2p/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromId: getMyId(),
                    fromName: getMyName(),
                    toId: toId,
                    type: type,
                    data: typeof data === 'string' ? data : JSON.stringify(data)
                })
            });
            setTimeout(pollSignals, 60);
        } catch (e) {
            console.error('[P2P] Failed to send signal:', e);
        }
    }

    // -------------------------------------------------------------
    // Heartbeat & Online Peers Discovery
    // -------------------------------------------------------------
    async function sendHeartbeat() {
        const myId = getMyId();
        const myName = getMyName();
        if (!myId) return;

        try {
            await fetch('/api/p2p/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: myId,
                    userName: myName
                })
            });

            const res = await fetch('/api/p2p/peers?userId=' + encodeURIComponent(myId) + '&user=' + encodeURIComponent(myName) + '&t=' + Date.now());
            const data = await res.json();
            if (data && data.success && Array.isArray(data.peers)) {
                const myNameNorm = myName.trim().toLowerCase();
                const isHostCurrent = (typeof isCurrentHost !== 'undefined' && isCurrentHost);
                window.__p2pOnlinePeers = data.peers.filter(p => {
                    const pNorm = (p.userName || '').trim().toLowerCase();
                    if (pNorm === myNameNorm || p.userId === myId) return false;
                    // Exclude raw IP dummy names (e.g. 127.0.0.1, 192.168.0.114)
                    if (/^(\d{1,3}\.){3}\d{1,3}$/.test((p.userName || '').trim()) || p.userName === '::1') return false;
                    // If browsing from Host PC, do not show other host aliases of the same machine
                    if (isHostCurrent && p.isHost) return false;
                    return true;
                });
                if (typeof updateDmUsersMenu === 'function') {
                    updateDmUsersMenu();
                }
                renderP2PPeersGrid();
            }
        } catch (e) {}
    }

    // -------------------------------------------------------------
    // Signal Polling
    // -------------------------------------------------------------
    async function pollSignals() {
        const myId = getMyId();
        if (!myId) return;

        try {
            const res = await fetch('/api/p2p/signal?userId=' + encodeURIComponent(myId) + '&t=' + Date.now());
            const data = await res.json();
            if (data && data.success && Array.isArray(data.signals)) {
                for (const sig of data.signals) {
                    await handleIncomingSignal(sig);
                }
            }
        } catch (e) {}
    }

    async function handleIncomingSignal(sig) {
        const fromId = sig.fromId;
        const fromName = sig.fromName || 'Colleague';

        switch (sig.type) {
            case 'file-offer':
                handleFileOfferPrompt(sig);
                break;

            case 'file-accept':
                showToast('⚡ ' + fromName + ' accepted! Connecting direct P2P link...');
                if (pendingFileOffer) {
                    targetPeerForTransfer = fromId;
                    targetPeerNameForTransfer = fromName;
                    await initiateSenderWebRTC(fromId, pendingFileOffer);
                }
                break;

            case 'file-decline':
                showToast('❌ ' + fromName + ' declined the P2P transfer.');
                resetTransferState();
                break;

            case 'transfer-canceled':
                showToast('⏹ Transfer was canceled by ' + fromName + '.');
                cleanupPeerSession(fromId);
                resetTransferState();
                break;

            case 'transfer-error':
                showToast('⚠️ Transfer interrupted: Connection issue with ' + fromName + '.');
                cleanupPeerSession(fromId);
                resetTransferState();
                break;

            case 'offer':
                await handleWebRTCOffer(fromId, sig.data);
                break;

            case 'answer':
                await handleWebRTCAnswer(fromId, sig.data);
                break;

            case 'candidate':
                await handleWebRTCCandidate(fromId, sig.data);
                break;
        }
    }

    // -------------------------------------------------------------
    // File Offer & Prompt Dialog
    // -------------------------------------------------------------
    let pendingIncomingOffer = null;

    function handleFileOfferPrompt(sig) {
        let meta = {};
        try { meta = JSON.parse(sig.data); } catch (e) {}

        const fromName = sig.fromName || 'Colleague';
        const fileName = meta.name || 'file';
        const fileSizeStr = formatBytes(meta.size || 0);

        // Sound chime for incoming P2P transfer request
        if (typeof playProfessionalChime === 'function') {
            playProfessionalChime();
        }

        pendingIncomingOffer = {
            sig: sig,
            meta: meta,
            fromName: fromName,
            fileName: fileName,
            fileSizeStr: fileSizeStr
        };

        if (isAutoAcceptEnabled()) {
            if (typeof showToast === 'function') {
                showToast('⚡ Auto-accepting ' + fileName + ' (' + fileSizeStr + ') from ' + fromName + '...');
            }
            window.acceptIncomingAirDrop();
            return;
        }

        const modal = document.getElementById('incomingAirDropModal');
        const senderText = document.getElementById('airDropSenderText');
        const fileEl = document.getElementById('airDropFileName');
        const sizeEl = document.getElementById('airDropFileSize');

        if (senderText) senderText.innerText = fromName + ' wants to beam you:';
        if (fileEl) fileEl.innerText = fileName;
        if (sizeEl) sizeEl.innerText = fileSizeStr;

        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        } else {
            if (window.confirm('⚡ [ZoneHub AirDrop Beam]\n\n' + fromName + ' wants to send you:\n📄 ' + fileName + ' (' + fileSizeStr + ')\n\nTransfer directly between devices at full Wi-Fi speed (0 host storage used)?')) {
                window.acceptIncomingAirDrop();
            } else {
                window.declineIncomingAirDrop();
            }
        }
    }

    window.acceptIncomingAirDrop = function() {
        if (!pendingIncomingOffer) return;
        const offer = pendingIncomingOffer;
        const modal = document.getElementById('incomingAirDropModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }

        currentIncomingTransfer = {
            fromId: offer.sig.fromId,
            fromName: offer.fromName,
            name: offer.fileName,
            size: offer.meta.size || 0,
            mime: offer.meta.mime || 'application/octet-stream',
            blobParts: [],
            tempBatch: [],
            batchBytes: 0,
            receivedBytes: 0,
            startTime: Date.now(),
            lastUiUpdate: 0
        };

        showP2PProgressCard('Receiving: ' + offer.fileName, 0, 0, offer.meta.size || 0);
        postSignal(offer.sig.fromId, 'file-accept', { accepted: true });
        pendingIncomingOffer = null;
    };

    window.declineIncomingAirDrop = function() {
        if (!pendingIncomingOffer) return;
        const offer = pendingIncomingOffer;
        const modal = document.getElementById('incomingAirDropModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }
        postSignal(offer.sig.fromId, 'file-decline', { accepted: false });
        pendingIncomingOffer = null;
    };

    // -------------------------------------------------------------
    // Sender WebRTC Setup
    // -------------------------------------------------------------
    async function drainPendingCandidates(peerId, pc) {
        const list = pendingCandidates.get(peerId) || [];
        pendingCandidates.delete(peerId);
        for (const cand of list) {
            try {
                await pc.addIceCandidate(cand);
            } catch (e) {
                console.warn('[P2P] Queued candidate add error:', e);
            }
        }
    }

    async function initiateSenderWebRTC(toId, file) {
        const pc = new RTCPeerConnection(STUN_CONFIG);
        activePeerConnections.set(toId, pc);

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                postSignal(toId, 'candidate', JSON.stringify(e.candidate));
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                if (typeof pc.restartIce === 'function') {
                    pc.restartIce();
                } else {
                    showToast('⚠️ P2P connection failed with ' + targetPeerNameForTransfer);
                    postSignal(toId, 'transfer-error', { error: 'ICE failed' });
                }
            } else if (pc.iceConnectionState === 'disconnected') {
                showToast('⚠️ P2P link disconnected with ' + targetPeerNameForTransfer);
            }
        };

        const dc = pc.createDataChannel('zonehub_p2p', { ordered: true });
        activeDataChannels.set(toId, dc);

        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = LOW_WATER_MARK;

        dc.onmessage = (msgEvent) => {
            handleDataChannelMessage(msgEvent.data, dc);
        };

        dc.onerror = (err) => {
            console.error('[P2P] Sender DataChannel error:', err);
            postSignal(toId, 'transfer-error', { error: 'DataChannel error' });
        };

        dc.onopen = async () => {
            showToast('⚡ Direct connection active! Streaming ' + file.name + ' (' + formatBytes(file.size) + ')...');
            try {
                await streamFileOverDataChannel(dc, file);
            } catch (err) {
                console.error('[P2P] Streaming failed:', err);
                showToast('❌ Transfer interrupted: ' + (err.message || 'Connection lost'));
                postSignal(toId, 'transfer-error', { error: err.message || 'Connection lost' });
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await postSignal(toId, 'offer', JSON.stringify(offer));
    }

    // -------------------------------------------------------------
    // Receiver WebRTC Setup
    // -------------------------------------------------------------
    async function handleWebRTCOffer(fromId, sdpStr) {
        const pc = new RTCPeerConnection(STUN_CONFIG);
        activePeerConnections.set(fromId, pc);

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                postSignal(fromId, 'candidate', JSON.stringify(e.candidate));
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                if (typeof pc.restartIce === 'function') {
                    pc.restartIce();
                } else {
                    showToast('⚠️ P2P connection failed with peer');
                    postSignal(fromId, 'transfer-error', { error: 'ICE failed' });
                }
            } else if (pc.iceConnectionState === 'disconnected') {
                showToast('⚠️ P2P link disconnected with peer');
            }
        };

        pc.ondatachannel = (e) => {
            const dc = e.channel;
            activeDataChannels.set(fromId, dc);
            dc.binaryType = 'arraybuffer';
            dc.bufferedAmountLowThreshold = LOW_WATER_MARK;

            dc.onmessage = (msgEvent) => {
                handleDataChannelMessage(msgEvent.data, dc);
            };

            dc.onerror = (err) => {
                console.error('[P2P] Receiver DataChannel error:', err);
                postSignal(fromId, 'transfer-error', { error: 'DataChannel error' });
            };
        };

        const sdp = JSON.parse(sdpStr);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await drainPendingCandidates(fromId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await postSignal(fromId, 'answer', JSON.stringify(answer));
    }

    async function handleWebRTCAnswer(fromId, sdpStr) {
        const pc = activePeerConnections.get(fromId);
        if (pc) {
            const sdp = JSON.parse(sdpStr);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            await drainPendingCandidates(fromId, pc);
        }
    }

    async function handleWebRTCCandidate(fromId, candStr) {
        try {
            const cand = JSON.parse(candStr);
            const rtcCand = new RTCIceCandidate(cand);
            const pc = activePeerConnections.get(fromId);
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(rtcCand);
            } else {
                if (!pendingCandidates.has(fromId)) {
                    pendingCandidates.set(fromId, []);
                }
                pendingCandidates.get(fromId).push(rtcCand);
            }
        } catch (e) {
            console.warn('[P2P] ICE candidate queue note:', e);
        }
    }

    // -------------------------------------------------------------
    // WebRTC Backpressure Flow Control Helper
    // -------------------------------------------------------------
    function waitForDrain(dc) {
        if (!dc || dc.readyState !== 'open') {
            return Promise.resolve();
        }
        if (dc.bufferedAmount <= LOW_WATER_MARK) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            let timer = null;
            const onLow = () => {
                try { dc.removeEventListener('bufferedamountlow', onLow); } catch (e) {}
                if (timer) clearTimeout(timer);
                resolve();
            };

            try {
                dc.addEventListener('bufferedamountlow', onLow);
            } catch (e) {
                onLow();
                return;
            }

            // Quick 10ms fallback timer to ensure maximum throughput
            timer = setTimeout(() => {
                try { dc.removeEventListener('bufferedamountlow', onLow); } catch (e) {}
                resolve();
            }, 10);
        });
    }

    // -------------------------------------------------------------
    // File Chunk Streaming (Sender with Backpressure & Block Buffering)
    // -------------------------------------------------------------
    async function streamFileOverDataChannel(dc, file) {
        showP2PProgressCard('Sending: ' + file.name, 0, 0, file.size);

        // Send metadata header first
        dc.send(JSON.stringify({
            type: 'meta',
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream'
        }));

        const totalBytes = file.size;
        let offset = 0;
        let lastUiUpdate = 0;
        const startTime = Date.now();

        while (offset < totalBytes) {
            if (dc.readyState !== 'open') {
                throw new Error('Connection closed by peer');
            }

            // Read a 1MB block from disk/Blob once into memory
            // This reduces async promise overhead by 94% compared to 16KB slices
            const blockEnd = Math.min(offset + READ_BLOCK_SIZE, totalBytes);
            const blockBlob = file.slice(offset, blockEnd);
            const blockBuffer = await blockBlob.arrayBuffer();
            let blockOffset = 0;

            // Stream the 1MB in-memory block as 64KB SCTP chunks directly into the channel
            while (blockOffset < blockBuffer.byteLength) {
                if (dc.readyState !== 'open') throw new Error('DataChannel closed unexpectedly');

                // Flow control: If internal SCTP queue exceeds 8MB, wait for it to drain to 2MB
                if (dc.bufferedAmount >= HIGH_WATER_MARK) {
                    await waitForDrain(dc);
                    continue;
                }

                const chunkEnd = Math.min(blockOffset + CHUNK_SIZE, blockBuffer.byteLength);
                const chunk = blockBuffer.slice(blockOffset, chunkEnd);

                let sent = false;
                let retries = 0;
                while (!sent && retries < 30) {
                    if (dc.readyState !== 'open') throw new Error('DataChannel closed unexpectedly');
                    try {
                        dc.send(chunk);
                        sent = true;
                        blockOffset += chunk.byteLength;
                        offset += chunk.byteLength;
                    } catch (err) {
                        retries++;
                        await waitForDrain(dc);
                        await new Promise(r => setTimeout(r, 10));
                    }
                }

                if (!sent) {
                    throw new Error('Transfer stalled: buffer did not drain');
                }

                // Throttle UI DOM updates to every 100ms for smooth 60fps rendering
                const now = Date.now();
                if (now - lastUiUpdate > 100 || offset >= totalBytes) {
                    lastUiUpdate = now;
                    const pct = Math.min(99, Math.round((offset / totalBytes) * 100));
                    const elapsed = Math.max(0.1, (now - startTime) / 1000);
                    const speedBytesPerSec = offset / elapsed;
                    updateP2PProgress(pct, offset, totalBytes, speedBytesPerSec);
                }
            }
        }

        // Wait until remaining bytes leave the host machine's SCTP buffer (max 2s safety)
        const drainStart = Date.now();
        while (dc.bufferedAmount > 0 && dc.readyState === 'open' && (Date.now() - drainStart < 2000)) {
            await new Promise(r => setTimeout(r, 20));
        }

        // Send completion signal
        if (dc.readyState === 'open') {
            try { dc.send(JSON.stringify({ type: 'done', name: file.name, size: totalBytes })); } catch (e) {}
        }

        updateP2PProgress(100, totalBytes, totalBytes, 0);
        activeTransferInProgress = false;
        const cancelEl = document.getElementById('p2pCancelContainer');
        if (cancelEl) cancelEl.style.display = 'none';
        const pill = document.getElementById('p2pTransferMiniPill');
        if (pill) {
            pill.classList.add('completed');
            const pillText = document.getElementById('p2pMiniPillText');
            if (pillText) pillText.innerText = '🎉 Sent! Tap to view';
        }
        if (isTransferCardMinimized) {
            window.expandP2PTransferCard();
        }
        showToast('🎉 Sent ' + file.name + ' via direct P2P successfully (0 host storage used)!');

        const txId = 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        let blobUrl = '';
        try { blobUrl = URL.createObjectURL(file); } catch (e) {}
        const record = {
            id: txId,
            direction: 'sent',
            fileName: file.name,
            fileSize: totalBytes,
            mime: file.type || 'application/octet-stream',
            peerName: targetPeerNameForTransfer || 'Colleague',
            peerId: targetPeerForTransfer || '',
            timestamp: Date.now(),
            savedLocation: 'Local PC (Original)',
            status: 'completed'
        };
        addAirDropTransferRecord(record, file, blobUrl);

        // Update floating card actions
        const actionsEl = document.getElementById('p2pTransferActions');
        const titleEl = document.getElementById('p2pTransferTitle');
        if (titleEl) {
            titleEl.innerText = '🎉 ' + file.name;
            titleEl.title = file.name;
        }
        if (actionsEl) {
            actionsEl.style.display = 'flex';
            const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
            actionsEl.innerHTML = 
                '<div style="font-size:11px;font-weight:700;color:#fff;word-break:break-all;line-height:1.35;max-height:36px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" title="' + escapeHtml(file.name) + '">' +
                    escapeHtml(file.name) +
                '</div>' +
                '<div style="font-size:11.5px;color:#38bdf8;background:rgba(56,189,248,0.1);padding:6px 10px;border-radius:6px;border:1px solid rgba(56,189,248,0.25);">' +
                    '✓ <strong>Sent to ' + escapeHtml(record.peerName) + '</strong> (0 host storage used)' +
                '</div>' +
                (isVideo ? '<button type="button" class="btn btn-primary" onclick="openAirDropMedia(\'' + txId + '\')" style="justify-content:center;font-size:12px;padding:6px 12px;background:linear-gradient(135deg,#38bdf8,#6366f1);font-weight:700;">▶ Preview Video</button>' : '') +
                (isImage ? '<button type="button" class="btn btn-primary" onclick="openAirDropMedia(\'' + txId + '\')" style="justify-content:center;font-size:12px;padding:6px 12px;">👁️ Preview Photo</button>' : '') +
                '<button type="button" class="btn btn-secondary" onclick="uploadAirDropToServer(\'' + txId + '\', this)" style="justify-content:center;font-size:11.5px;padding:6px 10px;color:#38bdf8;border-color:rgba(56,189,248,0.35);">☁️ Save to ZoneHub Shared Library</button>' +
                '<button type="button" class="btn btn-secondary" onclick="closeP2PTransferCard()" style="width:100%;justify-content:center;font-size:11.5px;padding:6px;background:transparent;border:1px solid rgba(255,255,255,0.12);color:#94a3b8;margin-top:2px;">✕ Close Window (Dismiss)</button>';
        }

        if (typeof window.onP2PTransferCompleted === 'function') {
            try { 
                window.onP2PTransferCompleted(file, { 
                    transferId: txId, 
                    targetUserId: targetPeerForTransfer, 
                    targetUserName: targetPeerNameForTransfer 
                }); 
            } catch (e) {}
        }
    }

    // -------------------------------------------------------------
    // Incoming Message Handler (Receiver with Batched Blob Allocation)
    // -------------------------------------------------------------
    function handleDataChannelMessage(data, dc) {
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'meta') {
                    if (!currentIncomingTransfer) {
                        currentIncomingTransfer = {
                            name: msg.name,
                            size: msg.size,
                            mime: msg.mime,
                            blobParts: [],
                            tempBatch: [],
                            batchBytes: 0,
                            receivedBytes: 0,
                            startTime: Date.now(),
                            lastUiUpdate: 0
                        };
                    } else {
                        if (msg.name) currentIncomingTransfer.name = msg.name;
                        if (msg.size) currentIncomingTransfer.size = msg.size;
                        if (msg.mime) currentIncomingTransfer.mime = msg.mime;
                    }
                    showP2PProgressCard('Receiving: ' + currentIncomingTransfer.name, 0, 0, currentIncomingTransfer.size);
                } else if (msg.type === 'done') {
                    finalizeIncomingTransfer(dc);
                } else if (msg.type === 'ack') {
                    // Confirmation that recipient saved file to disk
                    showToast('🎉 ' + (msg.name || 'File') + ' delivered directly to peer successfully!');
                    updateP2PProgress(100, 100, 100, 0);
                    resetTransferState();
                }
            } catch (e) {}
            return;
        }

        // Binary ArrayBuffer chunk
        if (data instanceof ArrayBuffer && currentIncomingTransfer) {
            currentIncomingTransfer.tempBatch.push(data);
            currentIncomingTransfer.batchBytes += data.byteLength;
            currentIncomingTransfer.receivedBytes += data.byteLength;

            // Memory optimization for 1GB+ files: Batch chunks into Blobs every 8MB
            // This prevents holding 65,000 separate ArrayBuffer references in Safari / Mac RAM
            if (currentIncomingTransfer.batchBytes >= 8 * 1024 * 1024) {
                currentIncomingTransfer.blobParts.push(new Blob(currentIncomingTransfer.tempBatch));
                currentIncomingTransfer.tempBatch = [];
                currentIncomingTransfer.batchBytes = 0;
            }

            const now = Date.now();
            if (currentIncomingTransfer.size && currentIncomingTransfer.receivedBytes >= currentIncomingTransfer.size) {
                // All bytes arrived! Finalize immediately without waiting
                finalizeIncomingTransfer(dc);
                return;
            }

            if (now - currentIncomingTransfer.lastUiUpdate > 100) {
                currentIncomingTransfer.lastUiUpdate = now;
                const total = currentIncomingTransfer.size || 1;
                const received = currentIncomingTransfer.receivedBytes;
                const pct = Math.min(99, Math.round((received / total) * 100));
                const elapsed = Math.max(0.1, (now - currentIncomingTransfer.startTime) / 1000);
                const speedBytes = received / elapsed;
                updateP2PProgress(pct, received, total, speedBytes);
            }
        }
    }

    function finalizeIncomingTransfer(dc) {
        if (!currentIncomingTransfer || currentIncomingTransfer.isFinalized) return;
        currentIncomingTransfer.isFinalized = true;

        updateP2PProgress(100, currentIncomingTransfer.size, currentIncomingTransfer.size, 0);

        // Flush any remaining chunks in the temporary batch
        if (currentIncomingTransfer.tempBatch.length > 0) {
            currentIncomingTransfer.blobParts.push(new Blob(currentIncomingTransfer.tempBatch));
            currentIncomingTransfer.tempBatch = [];
        }

        const fileName = currentIncomingTransfer.name || 'p2p_file.dat';
        const finalBlob = new Blob(currentIncomingTransfer.blobParts, {
            type: currentIncomingTransfer.mime || 'application/octet-stream'
        });

        const url = URL.createObjectURL(finalBlob);

        // Send delivery ACK back to sender over WebRTC
        if (dc && dc.readyState === 'open') {
            try {
                dc.send(JSON.stringify({ type: 'ack', name: fileName }));
            } catch (e) {}
        }

        // Trigger automatic instant download
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        try {
            a.click();
        } catch (err) {
            console.warn('[P2P] Auto-click blocked by browser, manual save button is active:', err);
        }
        setTimeout(() => { if (a.parentNode) document.body.removeChild(a); }, 1000);

        const txId = 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        const record = {
            id: txId,
            direction: 'received',
            fileName: fileName,
            fileSize: finalBlob.size,
            mime: currentIncomingTransfer.mime || 'application/octet-stream',
            peerName: currentIncomingTransfer.fromName || 'Colleague',
            peerId: currentIncomingTransfer.fromId || '',
            timestamp: Date.now(),
            savedLocation: 'Downloads folder (C:\\Users\\...\\Downloads)',
            status: 'completed'
        };
        addAirDropTransferRecord(record, finalBlob, url);

        // Keep card prominent with complete actions
        activeTransferInProgress = false;
        const cancelEl = document.getElementById('p2pCancelContainer');
        if (cancelEl) cancelEl.style.display = 'none';
        const pill = document.getElementById('p2pTransferMiniPill');
        if (pill) {
            pill.classList.add('completed');
            const pillText = document.getElementById('p2pMiniPillText');
            if (pillText) pillText.innerText = '🎉 Received! Tap to view';
        }
        if (isTransferCardMinimized) {
            window.expandP2PTransferCard();
        }
        const card = document.getElementById('p2pTransferCard');
        const titleEl = document.getElementById('p2pTransferTitle');
        const percentEl = document.getElementById('p2pTransferPercent');
        const barEl = document.getElementById('p2pTransferBarFill');
        const speedEl = document.getElementById('p2pTransferSpeed');
        const statsEl = document.getElementById('p2pTransferStats');
        const actionsEl = document.getElementById('p2pTransferActions');

        if (percentEl) percentEl.innerText = '100%';
        if (barEl) barEl.style.width = '100%';
        if (speedEl) speedEl.innerText = 'Complete!';
        if (titleEl) {
            titleEl.innerText = '🎉 ' + fileName;
            titleEl.title = fileName;
        }
        if (statsEl) statsEl.innerText = formatBytes(finalBlob.size) + ' / ' + formatBytes(finalBlob.size);

        if (actionsEl) {
            actionsEl.style.display = 'flex';
            const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(fileName);
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName);
            actionsEl.innerHTML = 
                '<div style="font-size:11px;font-weight:700;color:#fff;word-break:break-all;line-height:1.35;max-height:36px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" title="' + escapeHtml(fileName) + '">' +
                    escapeHtml(fileName) +
                '</div>' +
                '<div style="font-size:11.5px;color:#34d399;background:rgba(16,185,129,0.1);padding:6px 10px;border-radius:6px;border:1px solid rgba(16,185,129,0.25);">' +
                    '📁 <strong>Saved in Downloads folder</strong><br/>' +
                    '<span style="color:#94a3b8;font-size:10.5px;">Auto-downloaded to: <code>C:\\Users\\...\\Downloads</code></span>' +
                '</div>' +
                '<button type="button" class="btn btn-secondary" onclick="openAirDropFolder(\'downloads\', \'' + escapeHtml(fileName) + '\')" style="justify-content:center;font-size:12px;padding:6px 10px;color:#38bdf8;border-color:rgba(56,189,248,0.35);font-weight:700;">📂 Open in Windows Explorer</button>' +
                (isVideo ? '<button type="button" class="btn btn-primary" onclick="openAirDropMedia(\'' + txId + '\')" style="justify-content:center;font-size:12px;padding:7px 12px;background:linear-gradient(135deg,#10b981,#059669);font-weight:700;box-shadow:0 2px 8px rgba(16,185,129,0.4);">▶ Watch Video in ZoneHub</button>' : '') +
                (isImage ? '<button type="button" class="btn btn-primary" onclick="openAirDropMedia(\'' + txId + '\')" style="justify-content:center;font-size:12px;padding:7px 12px;background:linear-gradient(135deg,#ec4899,#db2777);font-weight:700;">👁️ View Photo</button>' : '') +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button type="button" class="btn btn-secondary" onclick="saveAirDropAs(\'' + txId + '\')" style="flex:1;justify-content:center;font-size:11.5px;padding:6px 10px;">💾 Save As...</button>' +
                    '<button type="button" class="btn btn-secondary" onclick="uploadAirDropToServer(\'' + txId + '\', this)" style="flex:1;justify-content:center;font-size:11.5px;padding:6px 10px;color:#38bdf8;border-color:rgba(56,189,248,0.35);">☁️ Save to Library</button>' +
                '</div>' +
                '<button type="button" class="btn btn-secondary" onclick="closeP2PTransferCard()" style="width:100%;justify-content:center;font-size:11.5px;padding:6px;background:transparent;border:1px solid rgba(255,255,255,0.12);color:#94a3b8;margin-top:2px;">✕ Close Window (Dismiss)</button>';
        }

        if (typeof playProfessionalChime === 'function') {
            playProfessionalChime();
        }
        showToast('🎉 Successfully received "' + fileName + '" via AirDrop! Check your Downloads folder.');

        if (typeof window.onP2PTransferCompleted === 'function') {
            try { 
                window.onP2PTransferCompleted({ name: fileName, size: finalBlob.size }, { 
                    transferId: txId, 
                    targetUserId: currentIncomingTransfer.fromId, 
                    targetUserName: currentIncomingTransfer.fromName 
                }); 
            } catch (e) {}
        }

        currentIncomingTransfer = null;
    }

    function resetTransferState() {
        activeTransferInProgress = false;
        pendingFileOffer = null;
        targetPeerForTransfer = null;
        setTimeout(() => {
            const card = document.getElementById('p2pTransferCard');
            const pill = document.getElementById('p2pTransferMiniPill');
            if (card && !activeTransferInProgress) card.style.display = 'none';
            if (pill && !activeTransferInProgress) pill.style.display = 'none';
        }, 4000);
    }

    // -------------------------------------------------------------
    // UI Progress Card
    // -------------------------------------------------------------
    function showP2PProgressCard(title, pct, loaded, total) {
        activeTransferInProgress = true;
        const card = document.getElementById('p2pTransferCard');
        const pill = document.getElementById('p2pTransferMiniPill');
        const titleEl = document.getElementById('p2pTransferTitle');
        const actionsEl = document.getElementById('p2pTransferActions');
        const cancelEl = document.getElementById('p2pCancelContainer');

        if (actionsEl) {
            actionsEl.style.display = 'none';
            actionsEl.innerHTML = '';
        }
        if (cancelEl) {
            cancelEl.style.display = 'flex';
        }
        if (pill) {
            pill.classList.remove('completed');
        }

        if (isTransferCardMinimized) {
            if (pill) pill.style.display = 'flex';
            if (card) card.style.display = 'none';
        } else {
            if (card) card.style.display = 'block';
            if (pill) pill.style.display = 'none';
        }

        if (titleEl) {
            titleEl.innerText = title;
            titleEl.title = title;
        }
        updateP2PProgress(pct, loaded, total, 0);
    }

    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeP2PTransferCard();
        }
    });

    function updateP2PProgress(pct, loaded, total, speedBytes) {
        const pctEl = document.getElementById('p2pTransferPercent');
        const fillEl = document.getElementById('p2pTransferBarFill');
        const statsEl = document.getElementById('p2pTransferStats');
        const speedEl = document.getElementById('p2pTransferSpeed');
        const pillText = document.getElementById('p2pMiniPillText');

        if (pctEl) pctEl.innerText = pct + '%';
        if (fillEl) fillEl.style.width = pct + '%';
        if (statsEl) statsEl.innerText = formatBytes(loaded) + ' / ' + formatBytes(total);
        if (speedEl) speedEl.innerText = speedBytes > 0 ? (formatBytes(speedBytes) + '/s') : '';

        if (pillText) {
            const dirIcon = currentIncomingTransfer ? '⬇️ ' : '⬆️ ';
            const speedStr = speedBytes > 0 ? (' • ' + formatBytes(speedBytes) + '/s') : '';
            pillText.innerText = dirIcon + pct + '% (' + formatBytes(loaded) + ' / ' + formatBytes(total) + ')' + speedStr;
        }
    }

    // -------------------------------------------------------------
    // Peer Grid Renderer
    // -------------------------------------------------------------
    window.refreshPeersList = function() {
        sendHeartbeat();
    };

    function renderP2PPeersGrid() {
        const grid = document.getElementById('p2pPeersGrid');
        const countEl = document.getElementById('p2pOnlineCount');
        const badge = document.getElementById('p2pPeersCountBadge');
        const myNameEl = document.getElementById('p2pMyNameDisplay');

        if (myNameEl) myNameEl.innerText = getMyName();

        const peers = window.__p2pOnlinePeers || [];
        if (countEl) countEl.innerText = peers.length;
        if (badge) {
            badge.innerText = peers.length;
            badge.style.display = peers.length > 0 ? 'inline-block' : 'none';
        }

        if (!grid) return;
        grid.innerHTML = '';

        if (peers.length === 0) {
            grid.innerHTML = 
                '<div class="p2p-empty-state">' +
                    '<div style="font-size:36px;margin-bottom:8px;">📡</div>' +
                    '<div style="font-weight:700;font-size:15px;color:#fff;">Searching for Devices in Your Network...</div>' +
                    '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' +
                        'When other computers or phones open ZoneHub on Wi-Fi or Internet Tunnel, they will appear here instantly.' +
                    '</div>' +
                '</div>';
            return;
        }

        peers.forEach(peer => {
            const card = document.createElement('div');
            card.className = 'p2p-peer-card';

            const isHost = peer.isHost;
            const uNameLower = (peer.userName || '').toLowerCase();
            const avatarIcon = isHost ? '🖥️' : (uNameLower.includes('phone') || uNameLower.includes('android') || uNameLower.includes('iphone') || uNameLower.includes('mobile') ? '📱' : '💻');

            card.innerHTML = 
                '<div class="p2p-peer-top">' +
                    '<div class="p2p-peer-avatar">' + avatarIcon + '</div>' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div class="p2p-peer-name">' + escapeHtml(peer.userName) + (isHost ? ' <span class="p2p-host-badge">Host</span>' : '') + '</div>' +
                        '<div class="p2p-peer-meta">🟢 Ready for Direct P2P</div>' +
                    '</div>' +
                '</div>' +
                '<div class="p2p-peer-actions">' +
                    '<button type="button" class="btn btn-primary btn-p2p-send" onclick="startSendFileToPeer(\'' + peer.userId + '\')">' +
                        '⚡ Send File' +
                    '</button>' +
                    '<button type="button" class="btn btn-secondary btn-p2p-send" onclick="startSendFolderToPeer(\'' + peer.userId + '\')">' +
                        '📁 Send Folder' +
                    '</button>' +
                '</div>';

            grid.appendChild(card);
        });
    }

    // -------------------------------------------------------------
    // File / Folder Selection for Peer
    // -------------------------------------------------------------
    window.startSendFileToPeer = function(peerId) {
        targetPeerForTransfer = peerId;
        const input = document.getElementById('p2pFilePicker');
        if (input) {
            input.value = '';
            input.click();
        }
    };

    window.startSendFolderToPeer = function(peerId) {
        targetPeerForTransfer = peerId;
        const input = document.getElementById('p2pFolderPicker');
        if (input) {
            input.value = '';
            input.click();
        }
    };

    window.findOnlinePeer = function(userName, userId) {
        if (!window.__p2pOnlinePeers || !Array.isArray(window.__p2pOnlinePeers)) return null;
        const uNorm = (userName || '').trim().toLowerCase();
        return window.__p2pOnlinePeers.find(p => {
            const pNorm = (p.userName || '').trim().toLowerCase();
            return (uNorm && pNorm === uNorm) || (userId && p.userId === userId);
        }) || null;
    };

    window.sendP2PFileDirectly = async function(targetUserId, targetUserName, file) {
        if (!file || !targetUserId) return;
        targetPeerForTransfer = targetUserId;
        targetPeerNameForTransfer = targetUserName || 'Colleague';
        pendingFileOffer = file;

        showToast('⚡ Requesting ' + targetUserName + ' to accept ' + file.name + ' via Direct P2P (0 host storage)...');
        showP2PProgressCard('Waiting for ' + targetUserName + ' to accept...', 0, 0, file.size);

        await postSignal(targetUserId, 'file-offer', {
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream'
        });
    };

    window.handleP2PFileSelected = async function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file || !targetPeerForTransfer) return;

        pendingFileOffer = file;
        const targetPeer = window.__p2pOnlinePeers.find(p => p.userId === targetPeerForTransfer);
        const peerName = targetPeer ? targetPeer.userName : 'Colleague';
        targetPeerNameForTransfer = peerName;

        showToast('📤 Requesting ' + peerName + ' to accept ' + file.name + '...');
        showP2PProgressCard('Waiting for ' + peerName + ' to accept...', 0, 0, file.size);

        // Send file offer signal
        await postSignal(targetPeerForTransfer, 'file-offer', {
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream'
        });
    };

    window.handleP2PFolderSelected = async function(e) {
        const files = Array.from(e.target.files || []);
        if (files.length === 0 || !targetPeerForTransfer) return;

        const firstFile = files[0];
        showToast('📦 Sending ' + firstFile.name + ' via direct P2P...');
        window.handleP2PFileSelected({ target: { files: [firstFile] } });
    };

    // -------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------
    function initP2P() {
        const toggleEl = document.getElementById('p2pAutoAcceptToggle');
        if (toggleEl) {
            toggleEl.checked = isAutoAcceptEnabled();
        }
        sendHeartbeat();
        pollSignals();
        renderAirDropHistory();

        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (signalTimer) clearInterval(signalTimer);

        heartbeatTimer = setInterval(sendHeartbeat, 3000);
        signalTimer = setInterval(pollSignals, 1500);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initP2P);
    } else {
        initP2P();
    }
})();
