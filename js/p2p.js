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
    const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk (industry standard for maximum LAN throughput)
    const READ_BLOCK_SIZE = 1024 * 1024; // 1 MB disk read block (reduces async slice promises by 94%)
    const HIGH_WATER_MARK = 8 * 1024 * 1024; // 8 MB high-water mark keeps Wi-Fi/Gigabit pipe saturated
    const LOW_WATER_MARK = 2 * 1024 * 1024;   // 2 MB resume threshold

    let activePeerConnections = new Map(); // targetPeerId -> RTCPeerConnection
    let activeDataChannels = new Map();    // targetPeerId -> RTCDataChannel
    let pendingFileOffer = null;          // file waiting to send
    let targetPeerForTransfer = null;
    let currentIncomingTransfer = null;
    let heartbeatTimer = null;
    let signalTimer = null;

    window.__p2pOnlinePeers = [];

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
                showToast('⚡ ' + fromName + ' accepted! Direct P2P transfer started...');
                if (pendingFileOffer && targetPeerForTransfer === fromId) {
                    await initiateSenderWebRTC(fromId, pendingFileOffer);
                }
                break;

            case 'file-decline':
                showToast('❌ ' + fromName + ' declined the P2P transfer.');
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
    async function initiateSenderWebRTC(toId, file) {
        const pc = new RTCPeerConnection(STUN_CONFIG);
        activePeerConnections.set(toId, pc);

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                postSignal(toId, 'candidate', JSON.stringify(e.candidate));
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed' && typeof pc.restartIce === 'function') {
                pc.restartIce();
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
        };

        dc.onopen = async () => {
            showToast('⚡ Direct connection active! Streaming ' + file.name + ' (' + formatBytes(file.size) + ')...');
            try {
                await streamFileOverDataChannel(dc, file);
            } catch (err) {
                console.error('[P2P] Streaming failed:', err);
                showToast('❌ Transfer interrupted: ' + (err.message || 'Connection lost'));
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
            if (pc.iceConnectionState === 'failed' && typeof pc.restartIce === 'function') {
                pc.restartIce();
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
            };
        };

        const sdp = JSON.parse(sdpStr);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await postSignal(fromId, 'answer', JSON.stringify(answer));
    }

    async function handleWebRTCAnswer(fromId, sdpStr) {
        const pc = activePeerConnections.get(fromId);
        if (pc) {
            const sdp = JSON.parse(sdpStr);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
    }

    async function handleWebRTCCandidate(fromId, candStr) {
        const pc = activePeerConnections.get(fromId);
        if (pc) {
            try {
                const cand = JSON.parse(candStr);
                await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {}
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
        showToast('🎉 Sent ' + file.name + ' via direct P2P successfully (0 host storage used)!');

        if (typeof window.onP2PTransferCompleted === 'function') {
            try { window.onP2PTransferCompleted(file); } catch (e) {}
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
        a.click();
        document.body.removeChild(a);

        // Keep card visible with direct manual click link in case Mac Safari popup blocker blocks auto-click
        const card = document.getElementById('p2pTransferCard');
        const titleEl = document.getElementById('p2pTransferTitle');
        const statsEl = document.getElementById('p2pTransferStats');
        if (titleEl) titleEl.innerHTML = '🎉 Download Ready: ' + escapeHtml(fileName);
        if (statsEl) {
            statsEl.innerHTML = '<a href="' + url + '" download="' + escapeHtml(fileName) + '" style="color:#38bdf8;font-weight:700;text-decoration:underline;">Click here to save file</a>';
        }

        if (typeof playProfessionalChime === 'function') {
            playProfessionalChime();
        }
        showToast('🎉 Received "' + fileName + '" directly via P2P! Saved to your device.');

        setTimeout(() => {
            if (card) card.style.display = 'none';
            URL.revokeObjectURL(url);
        }, 15000);

        currentIncomingTransfer = null;
    }

    function resetTransferState() {
        pendingFileOffer = null;
        targetPeerForTransfer = null;
        setTimeout(() => {
            const card = document.getElementById('p2pTransferCard');
            if (card) card.style.display = 'none';
        }, 4000);
    }

    // -------------------------------------------------------------
    // UI Progress Card
    // -------------------------------------------------------------
    function showP2PProgressCard(title, pct, loaded, total) {
        const card = document.getElementById('p2pTransferCard');
        const titleEl = document.getElementById('p2pTransferTitle');
        if (card) card.style.display = 'block';
        if (titleEl) titleEl.innerText = title;
        updateP2PProgress(pct, loaded, total, 0);
    }

    function updateP2PProgress(pct, loaded, total, speedBytes) {
        const pctEl = document.getElementById('p2pTransferPercent');
        const fillEl = document.getElementById('p2pTransferBarFill');
        const statsEl = document.getElementById('p2pTransferStats');
        const speedEl = document.getElementById('p2pTransferSpeed');

        if (pctEl) pctEl.innerText = pct + '%';
        if (fillEl) fillEl.style.width = pct + '%';
        if (statsEl) statsEl.innerText = formatBytes(loaded) + ' / ' + formatBytes(total);
        if (speedEl) speedEl.innerText = speedBytes > 0 ? (formatBytes(speedBytes) + '/s') : '';
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
        sendHeartbeat();
        pollSignals();

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
