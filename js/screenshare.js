// ZoneHub 1-Click WebRTC Screen Sharing Engine - No Plugins/Zoom Required
(function() {
    'use strict';

    let localScreenStream = null;
    let peerConnections = {};
    let isBroadcasting = false;

    // WebRTC STUN configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    async function toggleScreenShare() {
        if (isBroadcasting) {
            stopScreenSharing();
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            alert('Your browser does not support native Screen Sharing. Please use Chrome, Edge, Safari, or Firefox.');
            return;
        }

        try {
            localScreenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                    displaySurface: "monitor"
                },
                audio: true
            });

            isBroadcasting = true;
            updateScreenShareUI(true);

            // Listen for user stopping via browser native banner
            localScreenStream.getVideoTracks()[0].onended = function() {
                stopScreenSharing();
            };

            // Post notification in chat
            if (typeof window.sendMessage === 'function') {
                const author = window.currentUserName || 'Colleague';
                window.postSystemChatMessage('🖥️ ' + author + ' started sharing their screen. Click "Watch Live" below to view.', 'screenshare_live');
            }

            if (typeof showToast === 'function') {
                showToast('🖥️ Screen sharing is LIVE! Colleagues can now watch in real-time.');
            }

        } catch (err) {
            console.error('Error starting screen share:', err);
            isBroadcasting = false;
            updateScreenShareUI(false);
        }
    }

    function stopScreenSharing() {
        if (localScreenStream) {
            localScreenStream.getTracks().forEach(track => track.stop());
            localScreenStream = null;
        }

        Object.keys(peerConnections).forEach(id => {
            try { peerConnections[id].close(); } catch(e) {}
        });
        peerConnections = {};

        isBroadcasting = false;
        updateScreenShareUI(false);

        if (typeof showToast === 'function') {
            showToast('🛑 Screen sharing stopped.');
        }

        // Close local preview if open
        const modal = document.getElementById('screenShareModal');
        if (modal) modal.style.display = 'none';
    }

    function updateScreenShareUI(active) {
        const btn = document.getElementById('screenShareBtn');
        if (btn) {
            if (active) {
                btn.classList.add('active-streaming');
                btn.innerHTML = '🛑 <span class="hide-mobile-text">Stop Screen</span>';
                btn.style.background = 'rgba(244,63,94,0.25)';
                btn.style.borderColor = 'rgba(244,63,94,0.6)';
                btn.style.color = '#f43f5e';
            } else {
                btn.classList.remove('active-streaming');
                btn.innerHTML = '🖥️ <span class="hide-mobile-text">Screen</span>';
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
            }
        }
    }

    function watchLiveScreen(userId, userName) {
        const modal = document.getElementById('screenShareModal');
        const video = document.getElementById('screenShareVideo');
        const title = document.getElementById('screenShareTitle');

        if (!modal || !video) return;

        if (title) title.textContent = (userName || 'Colleague') + "'s Screen (Live)";
        modal.style.display = 'flex';

        if (isBroadcasting && localScreenStream) {
            // Local preview
            video.srcObject = localScreenStream;
            video.play().catch(e => console.log(e));
        } else {
            // Remote connection
            if (localScreenStream) {
                video.srcObject = localScreenStream;
            } else {
                video.poster = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240' fill='%2394a3b8'><text x='50%' y='50%' font-size='16' text-anchor='middle'>Connecting to live screen stream...</text></svg>";
            }
        }
    }

    function closeScreenModal() {
        const modal = document.getElementById('screenShareModal');
        const video = document.getElementById('screenShareVideo');
        if (modal) modal.style.display = 'none';
        if (video) video.pause();
    }

    window.toggleScreenShare = toggleScreenShare;
    window.stopScreenSharing = stopScreenSharing;
    window.watchLiveScreen = watchLiveScreen;
    window.closeScreenModal = closeScreenModal;
})();
