// ============================================================================
// ZoneHub - WebRTC Peer-to-Peer (P2P) Direct Drop Engine (0 Host Storage Used)
// ============================================================================

(function() {
    'use strict';

    const STUN_CONFIG = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' }
        ]
    };

    const CHUNK_SIZE = 64 * 1024; // 64 KB chunks for smooth WebRTC SCTP streaming
    const BUFFER_LIMIT = 16 * 1024 * 1024; // 16 MB buffer ceiling

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
            chunks: [],
            receivedBytes: 0,
            startTime: Date.now()
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

        const dc = pc.createDataChannel('zonehub_p2p', { ordered: true });
        activeDataChannels.set(toId, dc);

        dc.binaryType = 'arraybuffer';
        dc.onbufferedamountlow = () => {};

        dc.onopen = async () => {
            showToast('⚡ P2P Direct connection established! Streaming ' + file.name + '...');
            await streamFileOverDataChannel(dc, file);
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

        pc.ondatachannel = (e) => {
            const dc = e.channel;
            activeDataChannels.set(fromId, dc);
            dc.binaryType = 'arraybuffer';

            dc.onmessage = (msgEvent) => {
                handleDataChannelMessage(msgEvent.data);
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
    // File Chunk Streaming (Sender)
    // -------------------------------------------------------------
    async function streamFileOverDataChannel(dc, file) {
        showP2PProgressCard('Sending: ' + file.name, 0, 0, file.size);

        // Send metadata first
        dc.send(JSON.stringify({
            type: 'meta',
            name: file.name,
            size: file.size,
            mime: file.type || 'application/octet-stream'
        }));

        const totalBytes = file.size;
        let offset = 0;
        const startTime = Date.now();

        while (offset < totalBytes) {
            if (dc.bufferedAmount > BUFFER_LIMIT) {
                await new Promise((resolve) => {
                    dc.onbufferedamountlow = () => {
                        dc.onbufferedamountlow = null;
                        resolve();
                    };
                });
            }

            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const buffer = await slice.arrayBuffer();
            dc.send(buffer);
            offset += buffer.byteLength;

            const pct = Math.min(99, Math.round((offset / totalBytes) * 100));
            const elapsed = Math.max(0.1, (Date.now() - startTime) / 1000);
            const speedBytesPerSec = offset / elapsed;

            updateP2PProgress(pct, offset, totalBytes, speedBytesPerSec);
        }

        // Send completion footer
        dc.send(JSON.stringify({ type: 'done' }));
        updateP2PProgress(100, totalBytes, totalBytes, 0);
        showToast('🎉 Sent ' + file.name + ' via direct P2P successfully (0 host storage used)!');
        if (typeof window.onP2PTransferCompleted === 'function') {
            try { window.onP2PTransferCompleted(file); } catch(e) {}
        }
        resetTransferState();
    }

    // -------------------------------------------------------------
    // Incoming Message Handler (Receiver)
    // -------------------------------------------------------------
    function handleDataChannelMessage(data) {
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'meta') {
                    if (!currentIncomingTransfer) {
                        currentIncomingTransfer = {
                            name: msg.name,
                            size: msg.size,
                            mime: msg.mime,
                            chunks: [],
                            receivedBytes: 0,
                            startTime: Date.now()
                        };
                    }
                    showP2PProgressCard('Receiving: ' + msg.name, 0, 0, msg.size);
                } else if (msg.type === 'done') {
                    finalizeIncomingTransfer();
                }
            } catch (e) {}
            return;
        }

        // Binary ArrayBuffer chunk
        if (data instanceof ArrayBuffer && currentIncomingTransfer) {
            currentIncomingTransfer.chunks.push(data);
            currentIncomingTransfer.receivedBytes += data.byteLength;

            const total = currentIncomingTransfer.size || 1;
            const received = currentIncomingTransfer.receivedBytes;
            const pct = Math.min(99, Math.round((received / total) * 100));
            const elapsed = Math.max(0.1, (Date.now() - currentIncomingTransfer.startTime) / 1000);
            const speedBytes = received / elapsed;

            updateP2PProgress(pct, received, total, speedBytes);
        }
    }

    function finalizeIncomingTransfer() {
        if (!currentIncomingTransfer) return;

        updateP2PProgress(100, currentIncomingTransfer.size, currentIncomingTransfer.size, 0);

        const blob = new Blob(currentIncomingTransfer.chunks, {
            type: currentIncomingTransfer.mime || 'application/octet-stream'
        });

        // Trigger browser instant download to user's disk
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = currentIncomingTransfer.name || 'p2p_file.dat';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);

        if (typeof playProfessionalChime === 'function') {
            playProfessionalChime();
        }
        showToast('🎉 Received "' + currentIncomingTransfer.name + '" directly via P2P! Saved to your PC.');

        setTimeout(() => {
            const card = document.getElementById('p2pTransferCard');
            if (card) card.style.display = 'none';
        }, 3000);

        currentIncomingTransfer = null;
    }

    function resetTransferState() {
        pendingFileOffer = null;
        targetPeerForTransfer = null;
        setTimeout(() => {
            const card = document.getElementById('p2pTransferCard');
            if (card) card.style.display = 'none';
        }, 3000);
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

        // If multiple files selected in folder, alert that we package or send root folder
        const firstFile = files[0];
        const folderName = (firstFile.webkitRelativePath ? firstFile.webkitRelativePath.split('/')[0] : 'Folder') + '.zip';

        showToast('📦 Packaging folder with ' + files.length + ' files for direct P2P...');
        // For clean browser P2P, we can offer the files or single file
        window.handleP2PFileSelected({ target: { files: [files[0]] } });
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

