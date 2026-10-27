        // Real-time Team Chat Logic
        let currentMessages = [];
        let isFirstMessagesLoad = true;

        async function loadMessages() {
            try {
                const res = await fetch('/api/messages?t=' + Date.now());
                const messages = await res.json();
                renderMessages(messages);
            } catch (err) {
                console.error('Error fetching messages:', err);
            }
        }

        function formatMessageText(rawText) {
            if (!rawText) return '';
            let text = escapeHtml(rawText);

            // Extract YouTube video IDs if present
            const ytVideoIds = [];
            const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi;
            let m;
            while ((m = ytRegex.exec(rawText)) !== null) {
                if (!ytVideoIds.includes(m[1])) {
                    ytVideoIds.push(m[1]);
                }
            }

            // Convert URLs into safe, styled clickable links
            const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
            text = text.replace(urlPattern, (matchedUrl) => {
                let trailing = '';
                while (/[.,!?:;)]$/.test(matchedUrl)) {
                    trailing = matchedUrl.slice(-1) + trailing;
                    matchedUrl = matchedUrl.slice(0, -1);
                }

                let fullHref = matchedUrl;
                if (matchedUrl.toLowerCase().startsWith('www.')) {
                    fullHref = 'https://' + matchedUrl;
                }

                const isYt = /youtube\.com|youtu\.be/i.test(matchedUrl);
                const icon = isYt ? '<span style="color:#ef4444;margin-right:3px;">▶️</span>' : '<span style="color:#38bdf8;margin-right:3px;">🔗</span>';
                const ytClass = isYt ? 'chat-yt-link' : '';

                return '<a href="' + fullHref + '" target="_blank" rel="noopener noreferrer" class="chat-link ' + ytClass + '" title="Open link in new tab">' + icon + matchedUrl + '</a>' + trailing;
            });

            // Append interactive YouTube video preview cards
            if (ytVideoIds.length > 0) {
                let ytCardsHtml = '<div class="chat-yt-cards-wrapper">';
                ytVideoIds.forEach(vidId => {
                    const ytWatchUrl = 'https://www.youtube.com/watch?v=' + vidId;
                    const thumbUrl = 'https://img.youtube.com/vi/' + vidId + '/hqdefault.jpg';
                    ytCardsHtml += 
                        '<a href="' + ytWatchUrl + '" target="_blank" rel="noopener noreferrer" class="yt-preview-card" title="Click to watch on YouTube">' +
                            '<div class="yt-thumb-box">' +
                                '<img src="' + thumbUrl + '" alt="YouTube Thumbnail" class="yt-thumb-img" loading="lazy" onload="scrollChatToBottom()" />' +
                                '<div class="yt-play-icon">▶</div>' +
                            '</div>' +
                            '<div class="yt-card-info">' +
                                '<div class="yt-card-badge">🔴 YouTube</div>' +
                                '<div class="yt-card-url">' + ytWatchUrl + '</div>' +
                            '</div>' +
                        '</a>';
                });
                ytCardsHtml += '</div>';
                text += ytCardsHtml;
            }

            return text;
        }

        function scrollChatToBottom(force) {
            const container = document.getElementById('chatMessages');
            if (!container) return;
            container.scrollTop = container.scrollHeight;
            setTimeout(() => { if (container) container.scrollTop = container.scrollHeight; }, 60);
            setTimeout(() => { if (container) container.scrollTop = container.scrollHeight; }, 180);
            setTimeout(() => { if (container) container.scrollTop = container.scrollHeight; }, 400);
        }

        function renderMessages(messages) {
            const container = document.getElementById('chatMessages');
            document.getElementById('chatCountBadge').innerText = messages.length;

            const oldJson = JSON.stringify(currentMessages);
            const newJson = JSON.stringify(messages);
            if (oldJson === newJson) return;

            // Trigger Professional Sound and Corner Notification on new incoming messages
            if (!isFirstMessagesLoad && messages.length > currentMessages.length) {
                const existingIds = new Set(currentMessages.map(m => m.id));
                const newArrivals = messages.filter(m => !existingIds.has(m.id) && !m.deleted);
                const incomingFromOthers = newArrivals.filter(m => {
                    const isOwn = (m.userId && m.userId === myUserId) || (m.user === currentUserName);
                    return !isOwn;
                });

                if (incomingFromOthers.length > 0) {
                    const latestMsg = incomingFromOthers[incomingFromOthers.length - 1];
                    if (alertsEnabled) {
                        playProfessionalChime();
                        if (typeof triggerSystemNotification === 'function') {
                            triggerSystemNotification(latestMsg);
                        }
                        if (document.hidden && typeof startTitleBlink === 'function') {
                            startTitleBlink(latestMsg.user);
                        }
                        showCornerChatToast(latestMsg);
                    }

                    if (currentActiveView !== 'chat' && currentActiveView !== 'split') {
                        unreadChatCount += incomingFromOthers.length;
                        updateChatUnreadBadge();
                    }
                }
            }

            const isScrolledToBottom = isFirstMessagesLoad || (container.scrollHeight - container.clientHeight <= container.scrollTop + 80);

            container.innerHTML = '';
            if (messages.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;">No messages yet. Send a message or photo to start chatting!</div>';
            }

            messages.forEach(msg => {
                const bubble = document.createElement('div');
                const isDeleted = msg.deleted;
                bubble.className = 'chat-message-bubble' + (isDeleted ? ' is-deleted' : '');
                bubble.id = 'msg_' + msg.id;

                const initials = (msg.user || 'E').substring(0, 2).toUpperCase();
                const editedBadge = msg.edited && !isDeleted ? '<span class="msg-edited-tag">(edited)</span>' : '';

                // Content rendering: text, voice, or instant inline picture!
                let contentHtml = '';
                if (isDeleted) {
                    contentHtml = '<div class="msg-text">' + escapeHtml(msg.text) + '</div>';
                } else if ((msg.type === 'image' || msg.type === 'media_group') && (msg.imageUrl || (msg.mediaUrls && msg.mediaUrls.length > 0))) {
                    let mediaList = [];
                    if (msg.mediaUrls && Array.isArray(msg.mediaUrls) && msg.mediaUrls.length > 0) {
                        mediaList = msg.mediaUrls;
                    } else if (msg.imageUrl) {
                        mediaList = msg.imageUrl.split('|').map(s => s.trim()).filter(Boolean);
                    }

                    const caption = msg.text ? '<div class="msg-text" style="margin-top:6px;">' + formatMessageText(msg.text) + '</div>' : '';

                    if (mediaList.length === 1) {
                        const singleUrl = mediaList[0];
                        const isVid = /\.(mp4|webm|mov|mkv|avi)$/i.test(singleUrl.split('?')[0]);
                        contentHtml = 
                            '<div class="chat-photo-wrapper">' +
                                (isVid 
                                    ? '<video src="' + singleUrl + '" class="chat-inline-photo" controls style="max-height:240px;"></video>'
                                    : '<img src="' + singleUrl + '" class="chat-inline-photo" loading="lazy" onclick="previewMedia(\'' + escapeQuotes(singleUrl) + '\', \'Picture from ' + escapeQuotes(msg.user) + '\', \'image\')" title="Click for Fullscreen View" onload="scrollChatToBottom()" />'
                                ) +
                                '<div class="chat-photo-overlay">' +
                                    '<button onclick="triggerDownloadTracked(\'' + escapeQuotes(singleUrl) + '\', \'' + (isVid ? 'chat_video.mp4' : 'chat_photo.jpg') + '\')" class="chat-photo-dl-btn" title="Download to PC">' +
                                        '<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Download' +
                                    '</button>' +
                                '</div>' +
                            '</div>' + caption;
                    } else if (mediaList.length > 1) {
                        // WhatsApp-Style Multi-Media Collage Grid
                        window.__chatAlbums = window.__chatAlbums || {};
                        window.__chatAlbums[msg.id] = mediaList;

                        let gridClass = 'album-grid-4plus';
                        let displayCount = 4;
                        if (mediaList.length === 2) {
                            gridClass = 'album-grid-2';
                            displayCount = 2;
                        } else if (mediaList.length === 3) {
                            gridClass = 'album-grid-3';
                            displayCount = 3;
                        }

                        let cellsHtml = '';
                        const showMax = Math.min(displayCount, mediaList.length);

                        for (let c = 0; c < showMax; c++) {
                            const mUrl = mediaList[c];
                            const isVid = /\.(mp4|webm|mov|mkv|avi)$/i.test(mUrl.split('?')[0]);
                            const isLastSlot = (c === showMax - 1);
                            const hasRemaining = (isLastSlot && mediaList.length > showMax);
                            const remainingCount = mediaList.length - showMax;

                            let mediaTag = isVid 
                                ? '<video src="' + mUrl + '#t=0.1" preload="metadata"></video><div class="album-vid-badge"><svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></div>'
                                : '<img src="' + mUrl + '" loading="lazy" alt="Media ' + (c + 1) + '" onload="scrollChatToBottom()" />';

                            let moreOverlay = '';
                            if (hasRemaining) {
                                moreOverlay = '<div class="album-more-overlay"><span>+' + remainingCount + '</span></div>';
                            }

                            cellsHtml += 
                                '<div class="album-cell" onclick="openAlbumById(\'' + msg.id + '\', ' + c + ')" title="View in Album">' +
                                    mediaTag +
                                    moreOverlay +
                                '</div>';
                        }

                        contentHtml = 
                            '<div class="chat-album-wrapper">' +
                                '<div class="chat-album-grid ' + gridClass + '">' +
                                    cellsHtml +
                                '</div>' +
                                '<div class="chat-album-overlay-tools">' +
                                    '<button onclick="event.stopPropagation(); downloadAlbumById(\'' + msg.id + '\')" class="chat-photo-dl-btn" title="Download all ' + mediaList.length + ' files as 1 ZIP file">' +
                                        '<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> 📦 ' + mediaList.length + ' ZIP' +
                                    '</button>' +
                                '</div>' +
                            '</div>' + caption;
                    }
                } else if (msg.type === 'voice' && msg.audioUrl) {
                    const durFormatted = (msg.duration && msg.duration > 0) ? formatTimeSec(msg.duration) : 'Voice Note';
                    const durParam = msg.duration || 0;
                    
                    // Generate WhatsApp / Telegram style waveform bars
                    let waveBarsHtml = '';
                    const wavePattern = [10, 16, 22, 14, 20, 12, 24, 18, 10, 16, 22, 14, 18, 24, 12, 16, 20, 14, 10, 16, 12, 8];
                    for (let b = 0; b < wavePattern.length; b++) {
                        waveBarsHtml += '<span class="wave-bar" style="height:' + wavePattern[b] + 'px;"></span>';
                    }

                    contentHtml = 
                        '<div class="voice-player" id="voicePlayer_' + msg.id + '">' +
                            '<button type="button" onclick="playVoiceAudio(\'' + msg.audioUrl + '\', this, \'' + msg.id + '\', ' + durParam + ')" class="voice-play-btn" title="Play Voice Message">' +
                                '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>' +
                            '</button>' +
                            '<div class="voice-track" onclick="seekVoiceAudio(event, \'' + msg.id + '\')">' +
                                '<div class="voice-waveform" id="wave_' + msg.id + '">' + waveBarsHtml + '</div>' +
                                '<div class="voice-progress-bar"><div class="voice-progress-fill" id="fill_' + msg.id + '"></div></div>' +
                                '<div class="voice-meta-row">' +
                                    '<span class="voice-time-current" id="time_' + msg.id + '">0:00</span>' +
                                    '<span class="voice-time-total" id="dur_' + msg.id + '">' + durFormatted + '</span>' +
                                '</div>' +
                            '</div>' +
                        '</div>';
                } else {
                    contentHtml = '<div class="msg-text">' + formatMessageText(msg.text) + '</div>';
                }

                // Reactions bar
                let reactionsHtml = '';
                if (!isDeleted && msg.reactions) {
                    const reactionKeys = Object.keys(msg.reactions);
                    if (reactionKeys.length > 0) {
                        reactionsHtml = '<div class="msg-reactions-bar">';
                        reactionKeys.forEach(emoji => {
                            const users = msg.reactions[emoji] || [];
                            if (users.length > 0) {
                                const hasReacted = users.includes(currentUserName);
                                reactionsHtml += 
                                    '<button onclick="toggleReaction(\'' + msg.id + '\', \'' + emoji + '\')" class="reaction-pill ' + (hasReacted ? 'user-reacted' : '') + '" title="' + escapeHtml(users.join(', ')) + '">' +
                                        '<span>' + emoji + '</span>' +
                                        '<span class="reaction-count">' + users.length + '</span>' +
                                    '</button>';
                            }
                        });
                        reactionsHtml += '</div>';
                    }
                }

                // Action buttons: Edit and Delete ONLY for own messages!
                let actionsHtml = '';
                if (!isDeleted) {
                    const isOwnMessage = (msg.userId && msg.userId === myUserId) || (msg.user === currentUserName);
                    
                    const quickEmojis = 
                        '<div class="quick-emoji-row">' +
                            '<button onclick="toggleReaction(\'' + msg.id + '\', \'👍\')" class="quick-emoji-btn" title="Like">👍</button>' +
                            '<button onclick="toggleReaction(\'' + msg.id + '\', \'❤️\')" class="quick-emoji-btn" title="Love">❤️</button>' +
                            '<button onclick="toggleReaction(\'' + msg.id + '\', \'😂\')" class="quick-emoji-btn" title="Haha">😂</button>' +
                            '<button onclick="toggleReaction(\'' + msg.id + '\', \'😮\')" class="quick-emoji-btn" title="Wow">😮</button>' +
                            '<button onclick="toggleReaction(\'' + msg.id + '\', \'🔥\')" class="quick-emoji-btn" title="Fire">🔥</button>' +
                        '</div>';

                    let ownActions = '';
                    if (isOwnMessage) {
                        const editText = (msg.type !== 'voice' && msg.type !== 'image') ? '<button onclick="startEditMessage(\'' + msg.id + '\')" class="msg-act-btn">✏️ Edit</button>' : '';
                        ownActions = 
                            '<div style="display:flex;gap:4px;">' +
                                editText +
                                '<button onclick="deleteMessage(\'' + msg.id + '\')" class="msg-act-btn delete-btn">🗑️ Delete</button>' +
                            '</div>';
                    }

                    actionsHtml = 
                        '<div class="msg-actions">' +
                            quickEmojis +
                            ownActions +
                        '</div>';
                }

                bubble.innerHTML = 
                    '<div class="msg-top">' +
                        '<div class="msg-author">' +
                            '<div class="author-avatar">' + initials + '</div>' +
                            '<span class="author-name">' + escapeHtml(msg.user) + '</span>' +
                            editedBadge +
                        '</div>' +
                        '<span class="msg-time">' + escapeHtml(msg.timestamp) + '</span>' +
                    '</div>' +
                    contentHtml +
                    reactionsHtml +
                    actionsHtml;

                container.appendChild(bubble);
            });

            currentMessages = messages;

            if (isScrolledToBottom || isFirstMessagesLoad || messages.length === 1) {
                scrollChatToBottom();
            }
            isFirstMessagesLoad = false;
        }

        // WhatsApp Album Lightbox Helpers
        function openAlbumById(msgId, startIndex) {
            const list = (window.__chatAlbums && window.__chatAlbums[msgId]) || [];
            const msg = currentMessages.find(m => m.id === msgId);
            openAlbumLightbox(list, startIndex, msg ? msg.user : '');
        }

        function downloadAlbumById(msgId) {
            const list = (window.__chatAlbums && window.__chatAlbums[msgId]) || [];
            if (!list.length) return;
            const zipName = 'Chat_Album_' + list.length + '_Media.zip';
            showToast('Downloading all ' + list.length + ' album files as 1 ZIP file...');
            triggerDownloadTracked('/api/download-zip', zipName, { zipName: zipName, files: list });
        }

        // Multi-Photo & Video Upload Handler
        async function handleChatPhotoUpload(e) {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            e.target.value = '';
            await uploadChatMediaBatch(files);
        }

        // Paste Image & Video Support from Clipboard (Ctrl+V)
        document.getElementById('chatInput').addEventListener('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const mediaFiles = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1 || items[i].type.indexOf('video') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) mediaFiles.push(blob);
                }
            }
            if (mediaFiles.length > 0) {
                e.preventDefault();
                await uploadChatMediaBatch(mediaFiles);
            }
        });

        // Drag & Drop Multiple Media directly onto Chat Section
        const chatWrapper = document.getElementById('chatSectionWrapper');
        if (chatWrapper) {
            ['dragenter', 'dragover'].forEach(eventName => {
                chatWrapper.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    chatWrapper.classList.add('chat-drag-active');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                chatWrapper.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    chatWrapper.classList.remove('chat-drag-active');
                }, false);
            });

            chatWrapper.addEventListener('drop', async (e) => {
                const files = Array.from(e.dataTransfer.files || []).filter(f => {
                    return (f.type && (f.type.startsWith('image/') || f.type.startsWith('video/'))) ||
                           /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mkv)$/i.test(f.name);
                });
                if (files.length > 0) {
                    await uploadChatMediaBatch(files);
                }
            });
        }

        async function uploadChatMediaBatch(files) {
            if (!files || files.length === 0) return;

            const caption = document.getElementById('chatInput').value.trim();
            document.getElementById('chatInput').value = '';

            const total = files.length;
            showToast(total > 1 ? 'Uploading batch of ' + total + ' media files...' : 'Uploading picture...');

            const uploadPromises = files.map((file, i) => {
                return new Promise((resolve) => {
                    const ext = file.name ? file.name.split('.').pop() : 'jpg';
                    const isVid = file.type && file.type.startsWith('video');
                    const prefix = isVid ? 'chat_vid_' : 'chat_img_';
                    const filename = prefix + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 4) + '.' + ext;

                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', '/upload?filename=' + encodeURIComponent(filename), true);
                    xhr.setRequestHeader('X-Filename', encodeURIComponent(filename));
                    xhr.setRequestHeader('X-Uploader', encodeURIComponent(currentUserName || 'Employee'));
                    xhr.onload = () => {
                        if (xhr.status === 200 || xhr.status === 204) {
                            resolve('/' + encodeURIComponent(filename));
                        } else {
                            resolve(null);
                        }
                    };
                    xhr.onerror = () => resolve(null);
                    xhr.send(file);
                });
            });

            const results = await Promise.all(uploadPromises);
            const uploadedUrls = results.filter(url => url !== null);

            if (uploadedUrls.length === 0) {
                showToast('Failed to upload media files');
                return;
            }

            try {
                await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user: currentUserName,
                        userId: myUserId,
                        text: caption,
                        type: uploadedUrls.length > 1 ? 'media_group' : 'image',
                        imageUrl: uploadedUrls.join('|'),
                        mediaUrls: uploadedUrls
                    })
                });
                await loadMessages();
                showToast(total > 1 ? 'WhatsApp Album with ' + uploadedUrls.length + ' items sent!' : 'Media sent!');
                scrollChatToBottom(true);
            } catch (err) {
                showToast('Failed to post media album message');
            }
        }

        // Format seconds to mm:ss
        function formatTimeSec(sec) {
            if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        // Voice Message Audio Player Handler
        let activeVoicePlayer = null;

        function playVoiceAudio(audioUrl, btn, msgId, savedDuration) {
            const playerEl = document.getElementById('voicePlayer_' + msgId);
            const fillEl = document.getElementById('fill_' + msgId);
            const waveEl = document.getElementById('wave_' + msgId);
            const timeEl = document.getElementById('time_' + msgId);
            const durEl = document.getElementById('dur_' + msgId);

            // Toggle play/pause if clicking currently playing audio
            if (activeVoicePlayer && activeVoicePlayer.msgId === msgId) {
                if (activeVoicePlayer.audio.paused) {
                    activeVoicePlayer.audio.play();
                    if (playerEl) playerEl.classList.add('playing');
                    btn.innerHTML = '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>';
                } else {
                    activeVoicePlayer.audio.pause();
                    if (playerEl) playerEl.classList.remove('playing');
                    btn.innerHTML = '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>';
                }
                return;
            }

            // Stop any previously playing audio
            if (activeVoicePlayer) {
                stopCurrentVoicePlayer();
            }

            const audio = new Audio(audioUrl);
            audio.volume = 1.0;

            activeVoicePlayer = {
                msgId: msgId,
                audio: audio,
                playerEl: playerEl,
                btn: btn,
                fillEl: fillEl,
                waveEl: waveEl,
                timeEl: timeEl,
                durEl: durEl,
                totalDuration: savedDuration || 0
            };

            if (playerEl) playerEl.classList.add('playing');
            btn.innerHTML = '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>';

            if (savedDuration && durEl) {
                durEl.innerText = formatTimeSec(savedDuration);
            }

            audio.onloadedmetadata = () => {
                if (isFinite(audio.duration) && audio.duration > 0) {
                    activeVoicePlayer.totalDuration = audio.duration;
                    if (durEl) durEl.innerText = formatTimeSec(audio.duration);
                }
            };

            // Fix Chromium WebM duration Infinity bug
            if (!savedDuration) {
                audio.addEventListener('durationchange', () => {
                    if (audio.duration === Infinity) {
                        audio.currentTime = 1e101;
                        audio.ontimeupdate = function() {
                            this.ontimeupdate = null;
                            this.currentTime = 0;
                        };
                    } else if (isFinite(audio.duration)) {
                        activeVoicePlayer.totalDuration = audio.duration;
                        if (durEl) durEl.innerText = formatTimeSec(audio.duration);
                    }
                });
            }

            audio.ontimeupdate = () => {
                if (!activeVoicePlayer || activeVoicePlayer.msgId !== msgId) return;
                const cur = audio.currentTime;
                let dur = activeVoicePlayer.totalDuration || (isFinite(audio.duration) ? audio.duration : 0);
                if (cur > dur) dur = cur;

                const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

                if (fillEl) fillEl.style.width = pct + '%';
                if (timeEl) timeEl.innerText = formatTimeSec(cur) + (dur > 0 ? ' / ' + formatTimeSec(dur) : '');

                if (waveEl) {
                    const bars = waveEl.querySelectorAll('.wave-bar');
                    const activeBarIdx = Math.floor((pct / 100) * bars.length);
                    bars.forEach((bar, idx) => {
                        if (idx < activeBarIdx) {
                            bar.classList.add('played');
                            bar.classList.remove('current');
                        } else if (idx === activeBarIdx) {
                            bar.classList.add('played', 'current');
                        } else {
                            bar.classList.remove('played', 'current');
                        }
                    });
                }
            };

            audio.onended = () => {
                stopCurrentVoicePlayer();
            };

            audio.onerror = () => {
                showToast('Could not play audio track');
                stopCurrentVoicePlayer();
            };

            audio.play().catch(err => {
                console.error('Audio play error:', err);
                stopCurrentVoicePlayer();
            });
        }

        function stopCurrentVoicePlayer() {
            if (!activeVoicePlayer) return;
            try { activeVoicePlayer.audio.pause(); } catch(e) {}
            if (activeVoicePlayer.btn) {
                activeVoicePlayer.btn.innerHTML = '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>';
            }
            if (activeVoicePlayer.playerEl) {
                activeVoicePlayer.playerEl.classList.remove('playing');
            }
            if (activeVoicePlayer.fillEl) {
                activeVoicePlayer.fillEl.style.width = '0%';
            }
            if (activeVoicePlayer.timeEl && activeVoicePlayer.totalDuration) {
                activeVoicePlayer.timeEl.innerText = '0:00 / ' + formatTimeSec(activeVoicePlayer.totalDuration);
            }
            if (activeVoicePlayer.waveEl) {
                activeVoicePlayer.waveEl.querySelectorAll('.wave-bar').forEach(b => b.classList.remove('played', 'current'));
            }
            activeVoicePlayer = null;
        }

        function seekVoiceAudio(event, msgId) {
            if (!activeVoicePlayer || activeVoicePlayer.msgId !== msgId) return;
            const trackEl = event.currentTarget;
            const rect = trackEl.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, clickX / rect.width));
            const dur = activeVoicePlayer.totalDuration || (isFinite(activeVoicePlayer.audio.duration) ? activeVoicePlayer.audio.duration : 0);
            if (dur > 0) {
                activeVoicePlayer.audio.currentTime = pct * dur;
            }
        }

        // Voice Message Recording (MediaRecorder API)
        let mediaRecorder = null;
        let audioChunks = [];
        let recInterval = null;
        let recSeconds = 0;
        let recAudioContext = null;
        let recAnalyser = null;
        let recVisualizerAnim = null;

        async function toggleVoiceRecording() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopAndSendVoiceRecording();
            } else {
                startVoiceRecording();
            }
        }

        async function startVoiceRecording() {
            try {
                // Audio constraints with autoGainControl to boost quiet PC microphones
                const audioConstraints = {
                    echoCancellation: true,
                    noiseSuppression: false, // Don't suppress voice aggressively
                    autoGainControl: true    // Automatically boost mic sensitivity!
                };
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
                } catch (e) {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                }

                let mimeType = 'audio/webm;codecs=opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
                    else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
                    else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
                    else mimeType = '';
                }

                mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = e => {
                    if (e.data && e.data.size > 0) audioChunks.push(e.data);
                };

                // Continuous chunks every 200ms
                mediaRecorder.start(200);

                // Setup live AudioContext level analyser to test microphone input
                try {
                    recAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = recAudioContext.createMediaStreamSource(stream);
                    recAnalyser = recAudioContext.createAnalyser();
                    recAnalyser.fftSize = 64;
                    source.connect(recAnalyser);

                    const dataArray = new Uint8Array(recAnalyser.frequencyBinCount);
                    const meterBars = document.querySelectorAll('.rec-meter-bar');
                    let silentFrames = 0;

                    function updateMeter() {
                        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
                        recAnalyser.getByteFrequencyData(dataArray);
                        let sum = 0;
                        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                        let avg = sum / dataArray.length;

                        if (avg < 2.5) silentFrames++;
                        else silentFrames = 0;

                        const warnEl = document.getElementById('micSilentWarning');
                        if (warnEl) {
                            if (silentFrames > 30 && recSeconds >= 2) {
                                warnEl.style.display = 'block';
                            } else {
                                warnEl.style.display = 'none';
                            }
                        }

                        if (meterBars.length > 0) {
                            meterBars.forEach((bar, idx) => {
                                const val = dataArray[idx % dataArray.length] || 0;
                                const h = Math.max(3, Math.min(18, (val / 255) * 18));
                                bar.style.height = h + 'px';
                                if (val > 10) bar.style.background = '#10b981'; // Green when sound detected!
                                else bar.style.background = '#f43f5e';
                            });
                        }
                        recVisualizerAnim = requestAnimationFrame(updateMeter);
                    }
                    recVisualizerAnim = requestAnimationFrame(updateMeter);
                } catch (audioCtxErr) {
                    console.log('AudioContext visualizer:', audioCtxErr);
                }

                document.getElementById('recordingBanner').classList.add('active');
                document.getElementById('chatInput').style.display = 'none';
                document.getElementById('voiceRecBtn').classList.add('recording');

                recSeconds = 0;
                document.getElementById('recTimer').innerText = '0:00';
                recInterval = setInterval(() => {
                    recSeconds++;
                    const m = Math.floor(recSeconds / 60);
                    const s = recSeconds % 60;
                    document.getElementById('recTimer').innerText = m + ':' + (s < 10 ? '0' : '') + s;
                }, 1000);
            } catch (err) {
                alert('Microphone access is needed to record voice messages.\nError: ' + err.message);
            }
        }

        function cancelVoiceRecording() {
            if (mediaRecorder) {
                mediaRecorder.onstop = null;
                mediaRecorder.stop();
                if (mediaRecorder.stream) mediaRecorder.stream.getTracks().forEach(t => t.stop());
            }
            cleanupRecUI();
        }

        function stopAndSendVoiceRecording() {
            if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
            const finalDuration = recSeconds || 1;

            mediaRecorder.onstop = async () => {
                if (mediaRecorder.stream) mediaRecorder.stream.getTracks().forEach(t => t.stop());
                cleanupRecUI();

                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                const ext = mimeType.includes('mp4') ? '.mp4' : (mimeType.includes('ogg') ? '.ogg' : '.webm');
                const filename = 'voice_' + Date.now() + ext;

                showToast('Sending voice note (' + formatTimeSec(finalDuration) + ')...');
                try {
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', '/upload?filename=' + encodeURIComponent(filename), true);
                    xhr.setRequestHeader('X-Filename', encodeURIComponent(filename));
                    xhr.setRequestHeader('X-Uploader', encodeURIComponent(currentUserName));

                    xhr.onload = async function() {
                        await fetch('/api/messages', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                user: currentUserName,
                                userId: myUserId,
                                text: '🎤 Voice Message',
                                type: 'voice',
                                audioUrl: '/' + encodeURIComponent(filename),
                                duration: finalDuration
                            })
                        });
                        await loadMessages();
                    };
                    xhr.send(audioBlob);
                } catch (e) {
                    showToast('Failed to send voice note');
                }
            };

            mediaRecorder.stop();
        }

        function cleanupRecUI() {
            clearInterval(recInterval);
            if (recVisualizerAnim) cancelAnimationFrame(recVisualizerAnim);
            if (recAudioContext) {
                try { recAudioContext.close(); } catch(e) {}
                recAudioContext = null;
            }
            const warnEl = document.getElementById('micSilentWarning');
            if (warnEl) warnEl.style.display = 'none';

            document.getElementById('recordingBanner').classList.remove('active');
            document.getElementById('chatInput').style.display = 'block';
            document.getElementById('voiceRecBtn').classList.remove('recording');
        }

        // Chat Messaging Handlers
        function handleChatKeyDown(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        }

        async function sendMessage() {
            const input = document.getElementById('chatInput');
            const text = input.value.trim();
            if (!text) return;

            input.value = '';
            try {
                await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user: currentUserName,
                        userId: myUserId,
                        text: text,
                        type: 'text'
                    })
                });
                await loadMessages();
                const container = document.getElementById('chatMessages');
                container.scrollTop = container.scrollHeight;
            } catch (err) {
                showToast('Failed to send message');
            }
        }

        async function toggleReaction(id, emoji) {
            try {
                await fetch('/api/messages/react', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: id,
                        emoji: emoji,
                        user: currentUserName
                    })
                });
                await loadMessages();
            } catch (err) {
                console.error(err);
            }
        }

        async function startEditMessage(id) {
            const msg = currentMessages.find(m => m.id === id);
            if (!msg) return;

            const newText = prompt('Edit your message:', msg.text);
            if (newText !== null && newText.trim().length > 0 && newText !== msg.text) {
                try {
                    const res = await fetch('/api/messages/edit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: id, text: newText.trim(), userId: myUserId })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast('Message edited successfully');
                        await loadMessages();
                    } else {
                        showToast(data.error || 'Permission denied');
                    }
                } catch (err) {
                    showToast('Failed to edit message');
                }
            }
        }

        async function deleteMessage(id) {
            if (confirm('Are you sure you want to delete this message for everyone?')) {
                try {
                    const res = await fetch('/api/messages/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: id, userId: myUserId })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast('Message deleted');
                        await loadMessages();
                    } else {
                        showToast(data.error || 'You can only delete your own message!');
                    }
                } catch (err) {
                    showToast('Failed to delete message');
                }
            }
        }

        // Helpers
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
