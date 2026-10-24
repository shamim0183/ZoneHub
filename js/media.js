        // Drag & Drop Upload Logic
        const dropZone = document.getElementById('dropZone');
        const progressContainer = document.getElementById('progressContainer');
        const progressFileName = document.getElementById('progressFileName');
        const progressPercent = document.getElementById('progressPercent');
        const progressBarFill = document.getElementById('progressBarFill');

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                uploadFilesQueue(Array.from(files));
            }
        });

        function handleFileSelect(e) {
            const files = e.target.files;
            if (files && files.length > 0) {
                uploadFilesQueue(Array.from(files));
            }
            e.target.value = '';
        }

        async function uploadFilesQueue(fileList) {
            for (let i = 0; i < fileList.length; i++) {
                await uploadSingleFile(fileList[i]);
            }
            showToast('All files uploaded successfully!');
            await loadFoldersList();
            await loadFileList();
        }

        function uploadSingleFile(file) {
            return new Promise((resolve) => {
                progressContainer.style.display = 'block';
                progressFileName.innerText = 'Uploading: ' + file.name;
                progressPercent.innerText = '0%';
                progressBarFill.style.width = '0%';

                const folderSelectEl = document.getElementById('uploadFolderSelect');
                let targetFolder = folderSelectEl ? folderSelectEl.value : 'auto';
                if (targetFolder === 'auto' && selectedFolderId) {
                    targetFolder = selectedFolderId;
                }

                const xhr = new XMLHttpRequest();
                const uploadUrl = '/upload?filename=' + encodeURIComponent(file.name) + '&folder=' + encodeURIComponent(targetFolder);
                xhr.open('POST', uploadUrl, true);
                xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
                xhr.setRequestHeader('X-Folder', encodeURIComponent(targetFolder));
                xhr.setRequestHeader('X-Uploader', encodeURIComponent(currentUserName || 'Employee'));

                xhr.upload.onprogress = function(e) {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        progressPercent.innerText = pct + '%';
                        progressBarFill.style.width = pct + '%';
                    }
                };

                xhr.onload = function() {
                    progressBarFill.style.width = '100%';
                    progressPercent.innerText = '100%';
                    setTimeout(() => {
                        progressContainer.style.display = 'none';
                        resolve();
                    }, 500);
                };

                xhr.onerror = function() {
                    showToast('Upload error: ' + file.name);
                    progressContainer.style.display = 'none';
                    resolve();
                };

                xhr.send(file);
            });
        }

        // Folder State & System
        let allFolders = [];
        let allFiles = [];
        let currentViewMode = 'folders'; // 'folders' or 'all'
        let selectedFolderId = null;
        let currentFilter = 'all';

        function getFolderDescription(id) {
            const low = id.toLowerCase();
            if (low === 'videos') return 'Screen recordings & MP4 videos';
            if (low === 'pictures') return 'Graphics, photos & image assets';
            if (low === 'chat_media') return 'Photos & voice notes from team chat';
            if (low === 'documents') return 'PDFs, docs, spreadsheets & archives';
            return 'Custom employee shared folder';
        }

        async function loadFoldersList() {
            try {
                const res = await fetch('/api/folders?t=' + Date.now());
                allFolders = await res.json();
                updateFolderSelectDropdown(allFolders);
                renderFoldersGrid(allFolders);
            } catch (err) {
                console.error('Error loading folders:', err);
            }
        }

        function updateFolderSelectDropdown(folders) {
            const sel = document.getElementById('uploadFolderSelect');
            if (!sel) return;
            const currentVal = sel.value;
            sel.innerHTML = '<option value="auto">⚡ Auto-Sort by Type (স্বয়ংক্রিয়)</option>';
            folders.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.innerText = f.icon + ' ' + f.displayName;
                sel.appendChild(opt);
            });
            if (currentVal && currentVal !== 'auto') {
                sel.value = currentVal;
            }
        }

        function onUploadFolderChanged(val) {
            if (val === 'auto') {
                showToast('Upload destination: Auto-Sort (ভিডিও/ছবি অনুযায়ী)');
            } else {
                showToast('Upload destination: ' + val);
            }
        }

        async function promptCreateNewFolder() {
            const name = prompt('নতুন ফোল্ডারের নাম লিখুন (Enter new folder name):');
            if (!name || !name.trim()) return;

            try {
                const res = await fetch('/api/folders/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name.trim() })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Folder created: ' + data.name);
                    await loadFoldersList();
                    openFolder(data.name);
                } else {
                    showToast(data.error || 'Failed to create folder');
                }
            } catch (err) {
                showToast('Error creating folder');
            }
        }

        function renderFoldersGrid(folders) {
            const container = document.getElementById('foldersGridContainer');
            if (!container) return;
            container.innerHTML = '';

            folders.forEach(folder => {
                const card = document.createElement('div');
                card.className = 'folder-card color-' + (folder.color || 'indigo');
                card.onclick = () => openFolder(folder.id);

                card.innerHTML = 
                    '<div class="folder-card-top">' +
                        '<div class="folder-icon-circle">' + folder.icon + '</div>' +
                        '<span class="folder-count-pill">' + folder.fileCount + ' ' + (folder.fileCount === 1 ? 'file' : 'files') + '</span>' +
                    '</div>' +
                    '<div>' +
                        '<div class="folder-title-text">' + escapeHtml(folder.displayName) + '</div>' +
                        '<div class="folder-subtitle-text">' + getFolderDescription(folder.id) + '</div>' +
                    '</div>' +
                    '<div class="folder-stats-footer">' +
                        '<span>📁 ' + escapeHtml(folder.name) + '</span>' +
                        '<span style="font-weight:600;color:var(--text-main);">' + folder.sizeFormatted + '</span>' +
                    '</div>';
                container.appendChild(card);
            });

            // New Folder Card
            const newFolderCard = document.createElement('div');
            newFolderCard.className = 'folder-card';
            newFolderCard.style.borderStyle = 'dashed';
            newFolderCard.style.background = 'rgba(255,255,255,0.02)';
            newFolderCard.style.cursor = 'pointer';
            newFolderCard.onclick = promptCreateNewFolder;
            newFolderCard.innerHTML = 
                '<div class="folder-card-top">' +
                    '<div class="folder-icon-circle" style="background:rgba(99,102,241,0.1);color:#818cf8;">➕</div>' +
                    '<span class="folder-count-pill" style="background:transparent;border:1px solid rgba(255,255,255,0.1);">Custom</span>' +
                '</div>' +
                '<div>' +
                    '<div class="folder-title-text">+ New Folder</div>' +
                    '<div class="folder-subtitle-text">নতুন ফোল্ডার তৈরি করুন</div>' +
                '</div>' +
                '<div class="folder-stats-footer">' +
                    '<span>Create custom folder</span>' +
                    '<span style="color:#818cf8;font-weight:600;">Click to Add</span>' +
                '</div>';
            container.appendChild(newFolderCard);
        }

        function openFolder(folderId) {
            selectedFolderId = folderId;
            currentViewMode = 'folders';

            // Auto-select folder in upload dropdown
            const sel = document.getElementById('uploadFolderSelect');
            if (sel) {
                let found = false;
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value.toLowerCase() === folderId.toLowerCase()) {
                        sel.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const opt = new Option(folderId, folderId, true, true);
                    sel.add(opt);
                }
            }

            updateViewDisplay();
        }

        function backToAllFolders() {
            selectedFolderId = null;
            const sel = document.getElementById('uploadFolderSelect');
            if (sel) sel.value = 'auto';
            updateViewDisplay();
        }

        function switchViewMode(mode) {
            currentViewMode = mode;
            if (mode === 'all') {
                selectedFolderId = null;
                const sel = document.getElementById('uploadFolderSelect');
                if (sel) sel.value = 'auto';
            }
            updateViewDisplay();
        }

        function setFilter(filterType, btnEl) {
            currentFilter = filterType;
            document.querySelectorAll('#allFilesFilterBar .filter-pill').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
            renderFiles(allFiles);
        }

        async function loadFileList() {
            try {
                const res = await fetch('/api/files?t=' + Date.now());
                allFiles = await res.json();
                updateCounts(allFiles);
                updateViewDisplay();
            } catch (err) {
                console.error('Error loading files:', err);
            }
        }

        function updateCounts(files) {
            document.getElementById('fileCountBadge').innerText = files.length;
            document.getElementById('allFilesCountBadge').innerText = files.length;
            document.getElementById('countAll').innerText = files.length;
            document.getElementById('countVideos').innerText = files.filter(f => f.type === 'video').length;
            document.getElementById('countImages').innerText = files.filter(f => f.type === 'image').length;
            document.getElementById('countGifs').innerText = files.filter(f => f.type === 'gif').length;
            if (document.getElementById('countDocuments')) {
                document.getElementById('countDocuments').innerText = files.filter(f => f.type === 'document').length;
            }
        }

        function updateViewDisplay() {
            const foldersViewSection = document.getElementById('foldersViewSection');
            const folderActiveBanner = document.getElementById('folderActiveBanner');
            const allFilesFilterBar = document.getElementById('allFilesFilterBar');
            const filesListSection = document.getElementById('filesListSection');
            const viewModeFoldersBtn = document.getElementById('viewModeFoldersBtn');
            const viewModeAllBtn = document.getElementById('viewModeAllBtn');
            const filesListTitle = document.getElementById('filesListTitle');

            if (currentViewMode === 'folders') {
                viewModeFoldersBtn.classList.add('active');
                viewModeAllBtn.classList.remove('active');
                allFilesFilterBar.style.display = 'none';

                if (selectedFolderId === null) {
                    foldersViewSection.style.display = 'block';
                    folderActiveBanner.style.display = 'none';
                    filesListSection.style.display = 'none';
                } else {
                    foldersViewSection.style.display = 'none';
                    folderActiveBanner.style.display = 'flex';
                    filesListSection.style.display = 'block';

                    const folderObj = allFolders.find(f => f.id.toLowerCase() === selectedFolderId.toLowerCase());
                    const folderName = folderObj ? folderObj.displayName : selectedFolderId;
                    const folderFiles = allFiles.filter(f => f.folder.toLowerCase() === selectedFolderId.toLowerCase());

                    document.getElementById('activeFolderNameText').innerHTML = (folderObj ? folderObj.icon + ' ' : '📁 ') + escapeHtml(folderName);
                    document.getElementById('activeFolderStatsText').innerText = folderFiles.length + ' ' + (folderFiles.length === 1 ? 'file' : 'files') + ' • ' + (folderObj ? folderObj.sizeFormatted : '');
                    filesListTitle.innerText = 'Files in ' + (folderObj ? folderObj.name : selectedFolderId);
                    renderFiles(folderFiles);
                }
            } else {
                // All Files View
                viewModeFoldersBtn.classList.remove('active');
                viewModeAllBtn.classList.add('active');
                foldersViewSection.style.display = 'none';
                folderActiveBanner.style.display = 'none';
                allFilesFilterBar.style.display = 'flex';
                filesListSection.style.display = 'block';
                filesListTitle.innerText = 'All Shared Media Files';
                renderFiles(allFiles);
            }
        }

        function renderFiles(files) {
            const listEl = document.getElementById('filesList');
            listEl.innerHTML = '';

            let filtered = files;
            if (currentViewMode === 'all' && currentFilter !== 'all') {
                filtered = files.filter(f => f.type === currentFilter);
            }

            if (filtered.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:13px;">No files found in this folder/category.</div>';
                return;
            }

            filtered.forEach(file => {
                const fileUrl = file.url || ('/' + encodeURIComponent(file.name));
                const fileType = file.type;

                // Real Thumbnail Rendering!
                let thumbHtml = '';
                let reviewBtn = '';

                if (fileType === 'video') {
                    thumbHtml = 
                        '<div class="file-thumb-box">' +
                            '<video src="' + fileUrl + '#t=0.5" preload="metadata" muted playsinline webkit-playsinline class="file-thumb-media"></video>' +
                            '<div class="thumb-play-overlay">' +
                                '<div class="thumb-play-icon">' +
                                    '<svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>' +
                                '</div>' +
                            '</div>' +
                        '</div>';

                    reviewBtn = '<button onclick="playVideo(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\')" class="btn btn-primary" title="Review & Watch in Browser">' +
                        '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg> Review</button>';
                } else if (fileType === 'image' || fileType === 'gif') {
                    thumbHtml = 
                        '<div class="file-thumb-box" onclick="previewMedia(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\', \'' + fileType + '\')" style="cursor:pointer;" title="Click to view full preview">' +
                            '<img src="' + fileUrl + '" class="file-thumb-media" loading="lazy" alt="Thumbnail" />' +
                        '</div>';

                    reviewBtn = '<button onclick="previewMedia(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\', \'' + fileType + '\')" class="btn ' + (fileType === 'gif' ? 'btn-amber' : 'btn-cyan') + '" title="Review in Browser">' +
                        '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> Review</button>';
                } else {
                    thumbHtml = 
                        '<div class="file-thumb-box" style="background:rgba(255,255,255,0.05);">' +
                            '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:var(--text-muted);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>' +
                        '</div>';
                }

                const card = document.createElement('div');
                card.className = 'file-card';
                card.setAttribute('data-filename', file.name);

                const uploaderName = file.uploader || 'obak3';
                const folderTag = file.folder ? '<span class="meta-tag folder-badge" onclick="event.stopPropagation(); openFolder(\'' + escapeQuotes(file.folder) + '\')" title="Click to view this folder">📁 ' + escapeHtml(file.folder) + '</span>' : '';

                card.innerHTML = 
                    '<div class="file-info">' +
                        thumbHtml +
                        '<div class="file-details">' +
                            '<div class="file-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</div>' +
                            '<div class="file-meta">' +
                                '<span class="meta-tag size-badge">' + file.sizeFormatted + '</span>' +
                                folderTag +
                                '<span class="meta-tag uploader-badge">👤 ' + escapeHtml(uploaderName) + '</span>' +
                                '<span class="meta-tag">' + file.date + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="file-actions">' +
                        reviewBtn +
                        '<button onclick="triggerDownloadTracked(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\')" class="btn btn-secondary" title="Download to My PC">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Download' +
                        '</button>' +
                        '<button onclick="copyLink(\'' + escapeQuotes(fileUrl) + '\')" class="btn btn-icon" title="Copy Link">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>' +
                        '</button>' +
                    '</div>';

                listEl.appendChild(card);
            });

            filterFiles();
        }

        function filterFiles() {
            const q = document.getElementById('searchInput').value.toLowerCase();
            const cards = document.querySelectorAll('.file-card');
            cards.forEach(card => {
                const name = card.getAttribute('data-filename').toLowerCase();
                card.style.display = name.includes(q) ? 'flex' : 'none';
            });
        }

        // Tracked Download Manager (Live Speed & Progress)
        function triggerDownloadTracked(url, filename) {
            const widget = document.getElementById('downloadWidget');
            const nameEl = document.getElementById('dlFileName');
            const pctEl = document.getElementById('dlPercent');
            const fillEl = document.getElementById('dlBarFill');
            const transEl = document.getElementById('dlTransferred');
            const speedEl = document.getElementById('dlSpeed');

            nameEl.innerText = filename;
            pctEl.innerText = '0%';
            fillEl.style.width = '0%';
            transEl.innerText = 'Starting...';
            speedEl.innerText = 'Calculating...';
            widget.style.display = 'block';

            let startTime = Date.now();
            let lastLoaded = 0;
            let lastTime = startTime;

            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'blob';

            xhr.onprogress = function(e) {
                if (e.lengthComputable) {
                    const now = Date.now();
                    const pct = Math.round((e.loaded / e.total) * 100);
                    pctEl.innerText = pct + '%';
                    fillEl.style.width = pct + '%';

                    const loadedMb = (e.loaded / (1024 * 1024)).toFixed(1);
                    const totalMb = (e.total / (1024 * 1024)).toFixed(1);
                    transEl.innerText = loadedMb + ' MB / ' + totalMb + ' MB';

                    const timeDiff = (now - lastTime) / 1000;
                    if (timeDiff >= 0.5) {
                        const bytesDiff = e.loaded - lastLoaded;
                        const speedMbps = ((bytesDiff / (1024 * 1024)) / timeDiff).toFixed(1);
                        speedEl.innerText = speedMbps + ' MB/s';
                        lastLoaded = e.loaded;
                        lastTime = now;
                    }
                }
            };

            xhr.onload = function() {
                if (xhr.status === 200 || xhr.status === 206) {
                    pctEl.innerText = '100%';
                    fillEl.style.width = '100%';
                    speedEl.innerText = 'Completed!';

                    const blob = xhr.response;
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(a);

                    showToast('Downloaded to your PC: ' + filename);
                    setTimeout(() => {
                        widget.style.display = 'none';
                    }, 3000);
                }
            };

            xhr.onerror = function() {
                showToast('Download error. Falling back to direct link.');
                window.location.href = url;
                widget.style.display = 'none';
            };

            xhr.send();
        }

        // Media Preview Modal (Pictures, GIFs, Videos)
        function previewMedia(url, title, type) {
            const modal = document.getElementById('mediaModal');
            const modalBody = document.getElementById('modalBody');
            const modalTitle = document.getElementById('modalFileName');
            const downloadBtn = document.getElementById('modalDownloadBtn');

            modalTitle.innerText = title;
            downloadBtn.dataset.url = url;
            downloadBtn.dataset.title = title;

            if (type === 'image' || type === 'gif') {
                modalBody.innerHTML = '<img src="' + url + '" alt="' + escapeHtml(title) + '">';
            } else if (type === 'video') {
                modalBody.innerHTML = '<video controls autoplay src="' + url + '"></video>';
            }

            modal.classList.add('active');
        }

        function closeMediaModal(e) {
            if (!e || e.target.id === 'mediaModal' || e.target.classList.contains('modal-close-btn')) {
                const modal = document.getElementById('mediaModal');
                const modalBody = document.getElementById('modalBody');
                modalBody.innerHTML = '';
                modal.classList.remove('active');
            }
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeMediaModal();
        });

        // Video Player Control
        function playVideo(url, title) {
            const mainVideo = document.getElementById('mainVideo');
            const videoSource = document.getElementById('videoSource');
            const currentVideoTitle = document.getElementById('currentVideoTitle');
            const playerDownloadBtn = document.getElementById('playerDownloadBtn');
            const playerSection = document.getElementById('playerSection');

            currentVideoTitle.innerText = title;
            videoSource.src = url;
            mainVideo.load();
            mainVideo.play();
            playerDownloadBtn.dataset.url = url;
            playerDownloadBtn.dataset.title = title;
            playerSection.style.display = 'block';
            playerSection.scrollIntoView({ behavior: 'smooth' });
        }

