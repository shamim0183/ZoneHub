        // Drag & Drop Upload Logic (Files & Folders)
        const dropZone = document.getElementById('dropZone');
        const filesSection = document.getElementById('filesSectionWrapper');
        const progressContainer = document.getElementById('progressContainer');
        const progressFileName = document.getElementById('progressFileName');
        const progressPercent = document.getElementById('progressPercent');
        const progressBarFill = document.getElementById('progressBarFill');

        let dropZoneDragDepth = 0;

        async function scanFileEntry(item, pathSoFar, outList) {
            pathSoFar = pathSoFar || '';
            if (item.isFile) {
                await new Promise((resolve) => {
                    item.file((file) => {
                        file.customRelativePath = pathSoFar + file.name;
                        outList.push(file);
                        resolve();
                    }, () => resolve());
                });
            } else if (item.isDirectory) {
                const dirReader = item.createReader();
                const readBatch = async () => {
                    return new Promise((resolve) => {
                        dirReader.readEntries(async (entries) => {
                            if (!entries || entries.length === 0) {
                                resolve();
                            } else {
                                for (let i = 0; i < entries.length; i++) {
                                    await scanFileEntry(entries[i], pathSoFar + item.name + '/', outList);
                                }
                                await readBatch();
                                resolve();
                            }
                        }, () => resolve());
                    });
                };
                await readBatch();
            }
        }

        async function extractDroppedFiles(dataTransfer) {
            if (!dataTransfer) return [];

            // Check if any dropped item is a directory
            let hasDirectory = false;
            if (dataTransfer.items && dataTransfer.items.length > 0 && typeof dataTransfer.items[0].webkitGetAsEntry === 'function') {
                for (let i = 0; i < dataTransfer.items.length; i++) {
                    const entry = dataTransfer.items[i].webkitGetAsEntry ? dataTransfer.items[i].webkitGetAsEntry() : null;
                    if (entry && entry.isDirectory) {
                        hasDirectory = true;
                        break;
                    }
                }
            }

            // Direct sync path for regular files (images, videos, documents, zips)
            if (!hasDirectory && dataTransfer.files && dataTransfer.files.length > 0) {
                return Array.from(dataTransfer.files);
            }

            // Recursive scan path for directories
            const result = [];
            if (dataTransfer.items && dataTransfer.items.length > 0) {
                for (let i = 0; i < dataTransfer.items.length; i++) {
                    const item = dataTransfer.items[i];
                    if (item.kind === 'file') {
                        const entry = (typeof item.webkitGetAsEntry === 'function') ? item.webkitGetAsEntry() : null;
                        if (entry) {
                            await scanFileEntry(entry, '', result);
                        } else {
                            const f = item.getAsFile();
                            if (f) result.push(f);
                        }
                    }
                }
            }

            if (result.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
                return Array.from(dataTransfer.files);
            }
            return result;
        }

        function setDropZoneActive(active) {
            const dz = document.getElementById('dropZone');
            if (!dz) return;
            if (active) {
                dz.classList.add('dragover');
            } else {
                dz.classList.remove('dragover');
            }
        }

        if (dropZone) {
            dropZone.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDropZoneActive(true);
            }, false);

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDropZoneActive(true);
            }, false);

            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                const rect = dropZone.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
                    setDropZoneActive(false);
                }
            }, false);

            dropZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropZoneActive(false);

                if (!e.dataTransfer) return;
                const files = await extractDroppedFiles(e.dataTransfer);
                if (files && files.length > 0) {
                    if (typeof showToast === 'function') {
                        showToast('📥 Received ' + files.length + ' dropped file' + (files.length > 1 ? 's' : '') + ', uploading...');
                    }
                    uploadFilesQueue(files);
                }
            }, false);
        }

        // Entire Files Section Drag Catchment
        if (filesSection) {
            filesSection.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDropZoneActive(true);
            }, false);

            filesSection.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                setDropZoneActive(true);
            }, false);

            filesSection.addEventListener('dragleave', (e) => {
                e.preventDefault();
                const rect = filesSection.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
                    setDropZoneActive(false);
                }
            }, false);

            filesSection.addEventListener('drop', async (e) => {
                if (e.target.closest('#dropZone')) return; // dropZone handler handles direct drops
                e.preventDefault();
                setDropZoneActive(false);

                if (!e.dataTransfer) return;
                const files = await extractDroppedFiles(e.dataTransfer);
                if (files && files.length > 0) {
                    if (typeof showToast === 'function') {
                        showToast('📥 Received ' + files.length + ' dropped file' + (files.length > 1 ? 's' : '') + ', uploading...');
                    }
                    uploadFilesQueue(files);
                }
            }, false);
        }

        // Prevent accidental tab navigation if user drops file outside any dropzone
        window.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }, false);

        window.addEventListener('dragleave', (e) => {
            if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                setDropZoneActive(false);
            }
        }, false);

        window.addEventListener('drop', (e) => {
            setDropZoneActive(false);
            if (!e.target.closest('#dropZone') && !e.target.closest('#filesSectionWrapper') && !e.target.closest('#chatSectionWrapper')) {
                e.preventDefault();
            }
        }, false);

        function handleFileSelect(e) {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files && files.length > 0) {
                if (typeof showToast === 'function') {
                    showToast('📤 Preparing ' + files.length + ' file' + (files.length > 1 ? 's' : '') + ' for upload...');
                }
                uploadFilesQueue(files);
            }
        }
        window.handleFileSelect = handleFileSelect;

        function handleFolderSelect(e) {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files && files.length > 0) {
                if (typeof showToast === 'function') {
                    showToast('📁 Uploading folder with ' + files.length + ' files...');
                }
                uploadFilesQueue(files);
            }
        }
        window.handleFolderSelect = handleFolderSelect;

        function formatBytes(bytes) {
            if (!bytes || bytes <= 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
        }

        async function uploadFilesQueue(fileList) {
            if (!fileList || fileList.length === 0) return;

            // Security Policy: Reject dangerous executables & scripts for non-admin clients
            const blockedExts = ['.exe', '.bat', '.cmd', '.ps1', '.vbs', '.msi', '.scr', '.sh', '.reg', '.com', '.hta', '.cpl', '.pif', '.jar'];
            const safeList = [];
            let blockedCount = 0;
            for (let i = 0; i < fileList.length; i++) {
                const f = fileList[i];
                const dotIdx = f.name.lastIndexOf('.');
                const ext = dotIdx >= 0 ? f.name.substring(dotIdx).toLowerCase() : '';
                const isBlocked = blockedExts.includes(ext);
                if (isBlocked && (typeof isAdmin === 'undefined' || !isAdmin) && (typeof isCurrentHost === 'undefined' || !isCurrentHost)) {
                    blockedCount++;
                } else {
                    safeList.push(f);
                }
            }

            if (blockedCount > 0) {
                showToast('🚫 Security Block: ' + blockedCount + ' executable/script file(s) (.exe, .bat, etc.) were rejected for server safety.');
            }

            if (safeList.length === 0) return;
            fileList = safeList;

            const totalFiles = fileList.length;
            let totalBatchBytes = 0;
            for (let i = 0; i < totalFiles; i++) {
                totalBatchBytes += (fileList[i].size || 0);
            }

            const folderSelectEl = document.getElementById('uploadFolderSelect');
            let targetFolder = folderSelectEl ? folderSelectEl.value : 'auto';
            if (targetFolder === 'auto' && selectedFolderId) {
                targetFolder = selectedFolderId;
            }

            progressContainer.style.display = 'block';
            progressBarFill.style.width = '0%';
            progressPercent.innerText = '0%';
            progressFileName.innerText = totalFiles > 1 
                ? 'Uploading batch: ' + totalFiles + ' files (0 B / ' + formatBytes(totalBatchBytes) + ')'
                : 'Uploading: ' + fileList[0].name;

            const loadedBytesMap = {};
            let completedCount = 0;

            function updateBatchProgress() {
                let currentLoaded = 0;
                for (let k in loadedBytesMap) {
                    currentLoaded += loadedBytesMap[k];
                }
                const pct = totalBatchBytes > 0 
                    ? Math.min(99, Math.round((currentLoaded / totalBatchBytes) * 100)) 
                    : Math.round((completedCount / totalFiles) * 100);

                progressBarFill.style.width = pct + '%';
                progressPercent.innerText = pct + '%';
                if (totalFiles > 1) {
                    progressFileName.innerText = 'Uploading batch: ' + completedCount + '/' + totalFiles + ' files (' + formatBytes(currentLoaded) + ' / ' + formatBytes(totalBatchBytes) + ')';
                }
            }

            function uploadWorker(file, index) {
                return new Promise((resolve) => {
                    const xhr = new XMLHttpRequest();
                    const isZip = file.name && file.name.toLowerCase().endsWith('.zip');
                    let relPath = file.webkitRelativePath || file.customRelativePath || '';
                    let fileTargetFolder = targetFolder;
                    if (relPath && relPath.includes('/')) {
                        const lastSlash = relPath.lastIndexOf('/');
                        const folderPart = relPath.substring(0, lastSlash);
                        fileTargetFolder = (targetFolder === 'auto' || !targetFolder) ? folderPart : (targetFolder + '/' + folderPart);
                    }
                    const expirySelect = document.getElementById('uploadExpirySelect');
                    const expiryVal = expirySelect ? expirySelect.value : '15d';
                    let uploadUrl = '/upload?filename=' + encodeURIComponent(file.name) + '&folder=' + encodeURIComponent(fileTargetFolder) + '&expiry=' + encodeURIComponent(expiryVal);
                    if (isZip) uploadUrl += '&extract=true';

                    xhr.open('POST', uploadUrl, true);
                    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
                    xhr.setRequestHeader('X-Folder', encodeURIComponent(fileTargetFolder));
                    xhr.setRequestHeader('X-Expiry', encodeURIComponent(expiryVal));
                    xhr.setRequestHeader('X-Uploader', encodeURIComponent(currentUserName || 'Employee'));
                    if (isZip) xhr.setRequestHeader('X-Auto-Extract', 'true');

                    xhr.upload.onprogress = function(e) {
                        if (e.lengthComputable) {
                            loadedBytesMap[index] = e.loaded;
                            updateBatchProgress();
                        }
                    };

                    xhr.onload = function() {
                        loadedBytesMap[index] = file.size || 0;
                        completedCount++;
                        updateBatchProgress();
                        resolve({ success: xhr.status === 200 || xhr.status === 204, file: file });
                    };

                    xhr.onerror = function() {
                        loadedBytesMap[index] = file.size || 0;
                        completedCount++;
                        updateBatchProgress();
                        resolve({ success: false, file: file });
                    };

                    xhr.send(file);
                });
            }

            // Concurrency pool (up to 3 concurrent parallel uploads)
            const concurrency = Math.min(3, totalFiles);
            let queueIndex = 0;
            const workers = [];

            async function runNext() {
                while (queueIndex < totalFiles) {
                    const idx = queueIndex++;
                    await uploadWorker(fileList[idx], idx);
                }
            }

            for (let c = 0; c < concurrency; c++) {
                workers.push(runNext());
            }

            await Promise.all(workers);

            // Final state when entire batch completes
            progressBarFill.style.width = '100%';
            progressPercent.innerText = '100%';
            progressFileName.innerText = totalFiles > 1 
                ? '✓ All ' + totalFiles + ' files uploaded successfully!' 
                : '✓ ' + fileList[0].name + ' uploaded successfully!';

            showToast(totalFiles > 1 
                ? '✓ Batch upload complete: ' + totalFiles + ' files uploaded!' 
                : '✓ Upload complete!');

            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 1800);

            // Refresh UI once for the entire batch
            await loadFoldersList();
            if (selectedFolderId) {
                openFolder(selectedFolderId);
            } else {
                await loadFileList();
            }
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

                const deleteBtnHtml = (!folder.isSystem && isAdmin)
                    ? '<button onclick="event.stopPropagation(); deleteFolderPrompt(\'' + escapeQuotes(folder.id) + '\', ' + folder.fileCount + ')" class="folder-del-btn" title="Delete Folder">🗑️</button>'
                    : '';

                card.innerHTML = 
                    '<div class="folder-card-top">' +
                        '<div class="folder-icon-circle">' + folder.icon + '</div>' +
                        '<div style="display:flex;align-items:center;gap:6px;">' +
                            deleteBtnHtml +
                            '<span class="folder-count-pill">' + folder.fileCount + ' ' + (folder.fileCount === 1 ? 'file' : 'files') + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div class="folder-title-text">' + escapeHtml(folder.displayName) + '</div>' +
                        '<div class="folder-subtitle-text">' + getFolderDescription(folder.id) + '</div>' +
                    '</div>' +
                    '<div class="folder-stats-footer">' +
                        '<span>📁 ' + escapeHtml(folder.name) + '</span>' +
                        (folder.fileCount > 0 
                            ? '<button onclick="event.stopPropagation(); downloadFolderById(\'' + escapeQuotes(folder.id) + '\')" class="folder-dl-badge" title="Download all ' + folder.fileCount + ' files as 1 ZIP file">📦 Download ZIP (' + folder.fileCount + ')</button>'
                            : '<span style="font-weight:600;color:var(--text-main);">' + folder.sizeFormatted + '</span>'
                        ) +
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

        async function deleteFolderPrompt(folderId, fileCount) {
            if (!isAdmin) {
                if (typeof openAdminModal === 'function') openAdminModal();
                showToast('Admin permission required to delete folder.');
                return;
            }

            const count = fileCount || 0;
            const msg = `⚠️ Delete Folder "${folderId}"?\n\n` +
                `This will permanently delete this folder and ALL ${count} file(s) inside it from your computer storage.\n\n` +
                `Click OK to confirm deletion.`;
            if (!confirm(msg)) return;

            try {
                const adminToken = (typeof getAdminToken === 'function') ? getAdminToken() : (localStorage.getItem('zonehub_admin_pin') || '');
                const res = await fetch('/api/folders/delete?name=' + encodeURIComponent(folderId), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Token': adminToken
                    }
                });
                const data = await res.json();
                if (data.success) {
                    showToast('🗑️ Folder deleted: ' + folderId);
                    if (selectedFolderId && selectedFolderId.toLowerCase() === folderId.toLowerCase()) {
                        backToAllFolders();
                    }
                    await loadFoldersList();
                    await loadFileList();
                } else {
                    showToast(data.error || 'Failed to delete folder');
                }
            } catch (e) {
                showToast('Error deleting folder: ' + e.message);
            }
        }

        function deleteActiveFolderPrompt() {
            if (!selectedFolderId) return;
            const folderObj = allFolders.find(f => f.id.toLowerCase() === selectedFolderId.toLowerCase());
            const count = folderObj ? folderObj.fileCount : 0;
            deleteFolderPrompt(selectedFolderId, count);
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

        function classifyFileType(f) {
            if (!f) return 'document';
            const name = (f.name || '').toLowerCase();
            const type = (f.type || '').toLowerCase();
            if (type === 'video' || name.match(/\.(mp4|webm|mkv|mov|avi)$/i)) return 'video';
            if (type === 'image' || type === 'gif' || name.match(/\.(png|jpg|jpeg|webp|svg|bmp|gif)$/i)) return 'image';
            if (type === 'audio' || name.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) return 'audio';
            if (type === 'archive' || name.match(/\.(zip|rar|7z|tar|gz|iso|apk)$/i)) return 'archive';
            return 'document';
        }

        function updateCounts(files) {
            const list = files || [];
            const badge1 = document.getElementById('fileCountBadge');
            const badge2 = document.getElementById('allFilesCountBadge');
            const cAll = document.getElementById('countAll');
            const cVid = document.getElementById('countVideos');
            const cImg = document.getElementById('countImages');
            const cAud = document.getElementById('countAudio');
            const cDoc = document.getElementById('countDocuments');
            const cArc = document.getElementById('countArchives');

            if (badge1) badge1.innerText = list.length;
            if (badge2) badge2.innerText = list.length;
            if (cAll) cAll.innerText = list.length;
            if (cVid) cVid.innerText = list.filter(f => classifyFileType(f) === 'video').length;
            if (cImg) cImg.innerText = list.filter(f => classifyFileType(f) === 'image').length;
            if (cAud) cAud.innerText = list.filter(f => classifyFileType(f) === 'audio').length;
            if (cDoc) cDoc.innerText = list.filter(f => classifyFileType(f) === 'document').length;
            if (cArc) cArc.innerText = list.filter(f => classifyFileType(f) === 'archive').length;
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
                    const delActiveBtn = document.getElementById('deleteActiveFolderBtn');
                    if (delActiveBtn) delActiveBtn.style.display = 'none';
                } else {
                    foldersViewSection.style.display = 'none';
                    folderActiveBanner.style.display = 'flex';
                    filesListSection.style.display = 'block';

                    const folderObj = allFolders.find(f => f.id.toLowerCase() === selectedFolderId.toLowerCase());
                    const folderName = folderObj ? folderObj.displayName : selectedFolderId;
                    const folderFiles = allFiles.filter(f => f.folder.toLowerCase() === selectedFolderId.toLowerCase());
                    const isCustom = folderObj ? !folderObj.isSystem : true;

                    const delActiveBtn = document.getElementById('deleteActiveFolderBtn');
                    if (delActiveBtn) delActiveBtn.style.display = (isAdmin && isCustom) ? 'inline-flex' : 'none';

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
                const delActiveBtn = document.getElementById('deleteActiveFolderBtn');
                if (delActiveBtn) delActiveBtn.style.display = 'none';
                allFilesFilterBar.style.display = 'flex';
                filesListSection.style.display = 'block';
                filesListTitle.innerText = 'All Shared Media Files';
                renderFiles(allFiles);
            }
        }

        let currentActiveFiles = [];
        let currentSortMode = 'newest';
        let currentSearchQuery = '';

        function onFileSortChange() {
            const sel = document.getElementById('fileSortSelect');
            if (sel) currentSortMode = sel.value;
            renderFiles(currentActiveFiles);
        }

        function onFileSearchInput(val) {
            currentSearchQuery = (val || '').trim().toLowerCase();
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) {
                clearBtn.style.display = currentSearchQuery ? 'inline-flex' : 'none';
            }
            renderFiles(currentActiveFiles);
        }

        function clearFileSearch() {
            const input = document.getElementById('searchInput');
            if (input) input.value = '';
            currentSearchQuery = '';
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.style.display = 'none';
            renderFiles(currentActiveFiles);
        }

        function renderFiles(files) {
            currentActiveFiles = files || [];
            const listEl = document.getElementById('filesList');
            listEl.innerHTML = '';

            let filtered = currentActiveFiles.slice();
            if (currentViewMode === 'all' && currentFilter !== 'all') {
                filtered = filtered.filter(f => classifyFileType(f) === currentFilter);
            }

            if (currentSearchQuery) {
                filtered = filtered.filter(f => {
                    const name = (f.name || '').toLowerCase();
                    const folder = (f.folder || '').toLowerCase();
                    const uploader = (f.uploader || '').toLowerCase();
                    const type = classifyFileType(f).toLowerCase();
                    return name.includes(currentSearchQuery) || folder.includes(currentSearchQuery) || uploader.includes(currentSearchQuery) || type.includes(currentSearchQuery);
                });
            }

            filtered.sort((a, b) => {
                if (currentSortMode === 'name_asc') {
                    return (a.name || '').localeCompare(b.name || '');
                } else if (currentSortMode === 'name_desc') {
                    return (b.name || '').localeCompare(a.name || '');
                } else if (currentSortMode === 'size_desc') {
                    return (b.size || 0) - (a.size || 0);
                } else if (currentSortMode === 'size_asc') {
                    return (a.size || 0) - (b.size || 0);
                } else if (currentSortMode === 'oldest') {
                    const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
                    const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
                    return timeA - timeB;
                } else {
                    // Newest first
                    const timeA = a.timestamp || (a.date ? new Date(a.date).getTime() : 0);
                    const timeB = b.timestamp || (b.date ? new Date(b.date).getTime() : 0);
                    return timeB - timeA;
                }
            });

            const statsCountEl = document.getElementById('filterStatsCount');
            if (statsCountEl) {
                if (currentSearchQuery || (currentViewMode === 'all' && currentFilter !== 'all')) {
                    statsCountEl.innerHTML = `Showing <strong style="color:#38bdf8;">${filtered.length}</strong> of ${currentActiveFiles.length} files`;
                } else {
                    statsCountEl.innerHTML = `<strong style="color:#94a3b8;">${filtered.length}</strong> files`;
                }
            }

            if (filtered.length === 0) {
                listEl.innerHTML = '<div style="text-align:center;padding:35px 20px;color:var(--text-muted);font-size:13px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08);border-radius:12px;margin:10px 0;">🔍 No files match your current search or filter criteria.</div>';
                updateMultiSelectBar();
                return;
            }

            filtered.forEach(file => {
                const fileUrl = file.url || ('/' + encodeURIComponent(file.name));
                const fileType = file.type;
                const classified = classifyFileType(file);

                // Real Thumbnail Rendering!
                let thumbHtml = '';
                let reviewBtn = '';

                if (fileType === 'video' || classified === 'video') {
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
                } else if (fileType === 'image' || fileType === 'gif' || classified === 'image') {
                    thumbHtml = 
                        '<div class="file-thumb-box" onclick="previewMedia(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\', \'' + fileType + '\')" style="cursor:pointer;" title="Click to view full preview">' +
                            '<img src="' + fileUrl + '" class="file-thumb-media" loading="lazy" alt="Thumbnail" />' +
                        '</div>';

                    reviewBtn = '<button onclick="previewMedia(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\', \'' + fileType + '\')" class="btn ' + (fileType === 'gif' ? 'btn-amber' : 'btn-cyan') + '" title="Review in Browser">' +
                        '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> Review</button>';
                } else if (classified === 'audio') {
                    thumbHtml = 
                        '<div class="file-thumb-box" style="background:rgba(236,72,153,0.12);color:#f472b6;">' +
                            '<span style="font-size:22px;">🎵</span>' +
                        '</div>';
                    reviewBtn = '<a href="' + fileUrl + '" target="_blank" class="btn btn-secondary" style="border-color:rgba(244,114,182,0.4);color:#f472b6;" title="Listen to Audio in Browser">' +
                        '▶️ Play</a>';
                } else if (classified === 'archive') {
                    thumbHtml = 
                        '<div class="file-thumb-box" style="background:rgba(245,158,11,0.12);color:#fbbf24;">' +
                            '<span style="font-size:22px;">📦</span>' +
                        '</div>';
                } else if (file.name.match(/\.(csv|tsv)$/i)) {
                    thumbHtml = 
                        '<div class="file-thumb-box" onclick="openCsvViewer(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\')" style="background:rgba(16,185,129,0.12);color:#34d399;cursor:pointer;" title="Click to View Spreadsheet Grid">' +
                            '<span style="font-size:22px;">📊</span>' +
                        '</div>';
                    reviewBtn = '<button onclick="openCsvViewer(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\')" class="btn btn-secondary" style="border-color:rgba(52,211,153,0.4);color:#34d399;" title="View CSV Spreadsheet in Browser">' +
                        '📊 View Sheet</button>';
                } else if (file.name.match(/\.(txt|md|json|js|py|html|css|cs|sql|sh|log|env|xml|yml|yaml)$/i)) {
                    thumbHtml = 
                        '<div class="file-thumb-box" onclick="openCodeViewer(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\')" style="background:rgba(99,102,241,0.12);color:#818cf8;cursor:pointer;" title="Click to View / Edit Code">' +
                            '<span style="font-size:22px;">📝</span>' +
                        '</div>';
                    reviewBtn = '<button onclick="openCodeViewer(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\')" class="btn btn-secondary" style="border-color:rgba(129,140,248,0.4);color:#a5b4fc;" title="View & Edit Code/Text in Browser">' +
                        '📝 View / Edit</button>';
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

                let expiryTag = '';
                if (file.expiresInMs && file.expiresInMs > 0) {
                    const hoursLeft = Math.ceil(file.expiresInMs / (1000 * 60 * 60));
                    const daysLeft = Math.ceil(hoursLeft / 24);
                    const isUrgent = hoursLeft <= 24;
                    const badgeText = daysLeft > 1 ? (daysLeft + ' days left') : (hoursLeft + 'h left');
                    const badgeColor = isUrgent ? '#f59e0b' : '#10b981';
                    expiryTag = '<span class="meta-tag expiry-badge" style="color:' + badgeColor + ';border-color:' + badgeColor + '40;background:' + badgeColor + '18;font-weight:700;" title="Auto-deletes when policy expires. Files uploaded within 15 days remain safe.">⏳ ' + badgeText + '</span>';
                }

                const isChecked = selectedFilesMap.has(fileUrl);
                const checkboxHtml = '<input type="checkbox" class="file-select-checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="onFileCheckboxChanged(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\', this)" onclick="event.stopPropagation()" title="Select to batch download" />';

                const canDeleteFile = isAdmin || (file.uploader && file.uploader.toLowerCase() === (currentUserName || '').toLowerCase());
                const deleteFileBtnHtml = canDeleteFile
                    ? '<button onclick="deleteFilePrompt(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\')" class="btn btn-icon delete-file-btn" title="Delete File">🗑️</button>'
                    : '';

                card.innerHTML = 
                    '<div class="file-info">' +
                        checkboxHtml +
                        thumbHtml +
                        '<div class="file-details">' +
                            '<div class="file-name" title="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + '</div>' +
                            '<div class="file-meta">' +
                                '<span class="meta-tag size-badge">' + file.sizeFormatted + '</span>' +
                                folderTag +
                                expiryTag +
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
                        '<button type="button" onclick="openFileQrModal(\'' + escapeQuotes(fileUrl) + '\', \'' + escapeQuotes(file.name) + '\', \'' + escapeQuotes(file.sizeFormatted || '') + '\')" class="btn btn-icon btn-file-qr" title="Instant QR Code (Scan with phone camera to download)">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>' +
                        '</button>' +
                        '<button onclick="copyLink(\'' + escapeQuotes(fileUrl) + '\')" class="btn btn-icon" title="Copy Direct Link">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>' +
                        '</button>' +
                        deleteFileBtnHtml +
                    '</div>';

                listEl.appendChild(card);
            });

            updateMultiSelectBar();
        }
            updateMultiSelectBar();
        }

        async function deleteFilePrompt(fileUrl, fileName) {
            if (!confirm(`Delete file "${fileName}" from ZoneHub?`)) return;
            try {
                const adminToken = (typeof getAdminToken === 'function') ? getAdminToken() : (localStorage.getItem('zonehub_admin_pin') || '');
                const res = await fetch('/api/files/delete?path=' + encodeURIComponent(fileUrl), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Token': adminToken,
                        'X-Uploader': encodeURIComponent(currentUserName || '')
                    }
                });
                const data = await res.json();
                if (data.success) {
                    showToast('🗑️ File deleted: ' + fileName);
                    await loadFileList();
                    await loadFoldersList();
                } else {
                    showToast(data.error || 'Failed to delete file');
                }
            } catch (e) {
                showToast('Error deleting file: ' + e.message);
            }
        }

        // Multi-Select & Batch Download System
        const selectedFilesMap = new Map(); // url -> name

        function onFileCheckboxChanged(url, name, checkboxEl) {
            if (checkboxEl.checked) {
                selectedFilesMap.set(url, name);
            } else {
                selectedFilesMap.delete(url);
            }
            updateMultiSelectBar();
        }

        function updateMultiSelectBar() {
            const bar = document.getElementById('multiSelectBar');
            const countEl = document.getElementById('multiSelectCount');
            const dlCountEl = document.getElementById('multiSelectDlCount');
            if (!bar) return;

            const count = selectedFilesMap.size;
            if (count > 0) {
                bar.style.display = 'flex';
                if (countEl) countEl.innerText = count + ' Selected';
                if (dlCountEl) dlCountEl.innerText = count;
            } else {
                bar.style.display = 'none';
            }
        }

        function selectAllVisibleFiles() {
            const cards = document.querySelectorAll('.file-card');
            cards.forEach(card => {
                if (card.style.display !== 'none') {
                    const cb = card.querySelector('.file-select-checkbox');
                    if (cb) {
                        cb.checked = true;
                        const filename = card.getAttribute('data-filename');
                        const fileObj = allFiles.find(f => f.name === filename);
                        if (fileObj) {
                            selectedFilesMap.set(fileObj.url, fileObj.name);
                        }
                    }
                }
            });
            updateMultiSelectBar();
        }

        function clearFileSelection() {
            selectedFilesMap.clear();
            document.querySelectorAll('.file-select-checkbox').forEach(cb => cb.checked = false);
            updateMultiSelectBar();
        }

        function downloadSelectedFiles() {
            if (selectedFilesMap.size === 0) return;
            const entries = Array.from(selectedFilesMap.entries());
            const fileUrls = entries.map(([url]) => url);
            const prefix = selectedFolderId ? selectedFolderId : 'ZoneHub';
            const zipName = prefix + '_Selected_' + fileUrls.length + '_Files.zip';
            showToast('Creating ZIP for ' + fileUrls.length + ' selected files...');
            triggerDownloadTracked('/api/download-zip', zipName, { zipName: zipName, files: fileUrls });
            clearFileSelection();
        }

        function downloadActiveFolderAll() {
            if (!selectedFolderId) return;
            downloadFolderById(selectedFolderId);
        }

        function downloadFolderById(folderId) {
            if (!folderId) return;
            const folderFiles = allFiles.filter(f => f.folder && f.folder.toLowerCase() === folderId.toLowerCase());
            if (folderFiles.length === 0) {
                showToast('No files in folder: ' + folderId);
                return;
            }
            const zipName = folderId + '.zip';
            const zipUrl = '/api/download-zip?folder=' + encodeURIComponent(folderId);
            showToast('Starting 1-Click ZIP download for ' + folderId + ' (' + folderFiles.length + ' files)...');
            triggerDownloadTracked(zipUrl, zipName);
        }

        function filterFiles() {
            renderFiles(currentActiveFiles);
        }

        // 1-Click Instant File QR Modal Handlers
        let activeFileQrUrl = '';

        function openFileQrModal(fileUrl, fileName, fileSizeFormatted) {
            const modal = document.getElementById('fileQrModal');
            const container = document.getElementById('fileQrSvgContainer');
            const nameEl = document.getElementById('fileQrNameDisplay');
            const sizeEl = document.getElementById('fileQrSizeBadge');
            const urlInput = document.getElementById('fileQrUrlInput');
            if (!modal) return;

            // Resolve shareable Wi-Fi URL:
            const shareLink = document.getElementById('networkShareLink');
            let baseOrigin = (shareLink && shareLink.href) ? shareLink.href.replace(/\/$/, '') : window.location.origin;
            if (baseOrigin.includes('localhost') || baseOrigin.includes('127.0.0.1')) {
                if (shareLink && shareLink.href && !shareLink.href.includes('localhost') && !shareLink.href.includes('127.0.0.1')) {
                    baseOrigin = shareLink.href.replace(/\/$/, '');
                }
            }

            const cleanRel = fileUrl.startsWith('/') ? fileUrl : ('/' + fileUrl);
            activeFileQrUrl = baseOrigin + cleanRel;

            if (nameEl) nameEl.innerText = fileName || 'File';
            if (sizeEl) sizeEl.innerText = fileSizeFormatted || 'Shared File';
            if (urlInput) urlInput.value = activeFileQrUrl;

            modal.style.display = 'flex';

            if (typeof window.renderQRToSvg === 'function' && container) {
                window.renderQRToSvg(activeFileQrUrl, container, 220);
            }
        }

        function closeFileQrModal(e) {
            if (e && e.target && e.target !== e.currentTarget && !e.target.classList.contains('modal-close-btn')) return;
            const modal = document.getElementById('fileQrModal');
            if (modal) modal.style.display = 'none';
        }

        function copyFileQrUrl() {
            if (!activeFileQrUrl) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(activeFileQrUrl).then(() => {
                    if (typeof showToast === 'function') showToast('📋 Direct file link copied!');
                }).catch(() => fallbackCopy(activeFileQrUrl));
            } else {
                fallbackCopy(activeFileQrUrl);
            }
        }

        function fallbackCopy(text) {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.style.position = 'fixed';
            temp.style.opacity = '0';
            document.body.appendChild(temp);
            temp.select();
            try {
                document.execCommand('copy');
                if (typeof showToast === 'function') showToast('📋 Direct file link copied!');
            } catch (err) {}
            document.body.removeChild(temp);
        }

        // Tracked Download Manager (Live Speed & Progress)
        function triggerDownloadTracked(url, filename, postData = null) {
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
            speedEl.innerText = postData ? 'Preparing ZIP...' : 'Calculating...';
            widget.style.display = 'block';

            let startTime = Date.now();
            let lastLoaded = 0;
            let lastTime = startTime;

            const xhr = new XMLHttpRequest();
            xhr.open(postData ? 'POST' : 'GET', url, true);
            if (postData) {
                xhr.setRequestHeader('Content-Type', 'application/json');
            }
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
                    if (timeDiff >= 0.4) {
                        const bytesDiff = e.loaded - lastLoaded;
                        const speedMbps = ((bytesDiff / (1024 * 1024)) / timeDiff).toFixed(1);
                        speedEl.innerText = speedMbps + ' MB/s';
                        lastLoaded = e.loaded;
                        lastTime = now;
                    }
                } else {
                    transEl.innerText = formatBytes(e.loaded);
                    speedEl.innerText = 'Downloading...';
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
                    setTimeout(() => {
                        window.URL.revokeObjectURL(blobUrl);
                        document.body.removeChild(a);
                    }, 1000);

                    showToast('Downloaded to your PC: ' + filename);
                    setTimeout(() => {
                        widget.style.display = 'none';
                    }, 2500);
                } else {
                    showToast('Download error (HTTP ' + xhr.status + ')');
                    widget.style.display = 'none';
                }
            };

            xhr.onerror = function() {
                showToast('Download error. Falling back to direct link.');
                if (!postData) window.location.href = url;
                widget.style.display = 'none';
            };

            xhr.send(postData ? JSON.stringify(postData) : null);
        }

        // Media Preview Modal & WhatsApp Album Lightbox
        let currentAlbumList = [];
        let currentAlbumIndex = 0;
        let currentAlbumSender = '';

        function openAlbumLightbox(mediaUrls, startIndex, senderName) {
            if (!mediaUrls || mediaUrls.length === 0) return;
            currentAlbumList = mediaUrls;
            currentAlbumIndex = startIndex || 0;
            currentAlbumSender = senderName || '';
            renderAlbumLightboxItem();
            const modal = document.getElementById('mediaModal');
            if (modal) modal.classList.add('active');
        }

        function renderAlbumLightboxItem() {
            if (!currentAlbumList || currentAlbumList.length === 0) return;
            if (currentAlbumIndex < 0) currentAlbumIndex = currentAlbumList.length - 1;
            if (currentAlbumIndex >= currentAlbumList.length) currentAlbumIndex = 0;

            const url = currentAlbumList[currentAlbumIndex];
            const cleanUrl = url.split('?')[0];
            const filename = cleanUrl.split('/').pop() || 'media_item';
            const isVideo = /\.(mp4|webm|mov|mkv|avi)$/i.test(filename);

            const modalTitle = document.getElementById('modalFileName');
            const modalBody = document.getElementById('modalBody');
            const downloadBtn = document.getElementById('modalDownloadBtn');
            const counterBadge = document.getElementById('modalAlbumCounter');
            const prevBtn = document.getElementById('modalPrevBtn');
            const nextBtn = document.getElementById('modalNextBtn');
            const downloadAllBtn = document.getElementById('modalDownloadAllBtn');

            if (modalTitle) {
                modalTitle.innerText = filename + (currentAlbumSender ? ' • ' + currentAlbumSender : '');
            }
            if (downloadBtn) {
                downloadBtn.dataset.url = url;
                downloadBtn.dataset.title = filename;
            }

            if (currentAlbumList.length > 1) {
                if (counterBadge) {
                    counterBadge.style.display = 'inline-block';
                    counterBadge.innerText = (currentAlbumIndex + 1) + ' / ' + currentAlbumList.length;
                }
                if (prevBtn) prevBtn.style.display = 'flex';
                if (nextBtn) nextBtn.style.display = 'flex';
                if (downloadAllBtn) {
                    downloadAllBtn.style.display = 'inline-flex';
                    downloadAllBtn.innerText = '📦 Download ZIP (' + currentAlbumList.length + ')';
                }
            } else {
                if (counterBadge) counterBadge.style.display = 'none';
                if (prevBtn) prevBtn.style.display = 'none';
                if (nextBtn) nextBtn.style.display = 'none';
                if (downloadAllBtn) downloadAllBtn.style.display = 'none';
            }

            if (isVideo) {
                modalBody.innerHTML = '<video controls autoplay src="' + url + '" style="max-width:100%;max-height:75vh;border-radius:8px;"></video>';
            } else {
                modalBody.innerHTML = '<img src="' + url + '" alt="' + escapeHtml(filename) + '" style="max-width:100%;max-height:75vh;border-radius:8px;object-fit:contain;">';
            }
        }

        function navigateAlbum(direction) {
            if (!currentAlbumList || currentAlbumList.length <= 1) return;
            currentAlbumIndex += direction;
            renderAlbumLightboxItem();
        }

        function downloadCurrentAlbumAll() {
            if (!currentAlbumList || currentAlbumList.length === 0) return;
            const zipName = 'Album_' + currentAlbumList.length + '_Photos.zip';
            showToast('Downloading all ' + currentAlbumList.length + ' photos as 1 ZIP file...');
            triggerDownloadTracked('/api/download-zip', zipName, { zipName: zipName, files: currentAlbumList });
        }

        function previewMedia(url, title, type) {
            openAlbumLightbox([url], 0, title);
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
            const modal = document.getElementById('mediaModal');
            if (!modal || !modal.classList.contains('active')) return;
            if (e.key === 'Escape') closeMediaModal();
            else if (e.key === 'ArrowLeft') navigateAlbum(-1);
            else if (e.key === 'ArrowRight') navigateAlbum(1);
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

        // =============================================================
        // In-Browser Document & Code Viewer / Editor (CSV, Code & Text)
        // =============================================================
        let currentDocUrl = '';
        let currentDocName = '';
        let currentDocRawText = '';
        let isDocEditMode = false;

        function parseCSV(text, delimiter) {
            delimiter = delimiter || ',';
            const pattern = new RegExp(
                (
                    "(\\" + delimiter + "|\\r?\\n|\\r|^)" +
                    "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
                    "([^\"\\" + delimiter + "\\r\\n]*))"
                ), "gi"
            );
            const data = [[]];
            let matches = null;
            while (matches = pattern.exec(text)) {
                const matchedDelimiter = matches[1];
                if (matchedDelimiter.length && (matchedDelimiter !== delimiter)) {
                    data.push([]);
                }
                let matchedValue;
                if (matches[2]) {
                    matchedValue = matches[2].replace(new RegExp("\"\"", "g"), "\"");
                } else {
                    matchedValue = matches[3];
                }
                data[data.length - 1].push(matchedValue || '');
            }
            if (data.length > 0 && data[data.length - 1].length <= 1 && data[data.length - 1][0] === '') {
                data.pop();
            }
            return data;
        }

        async function openCsvViewer(url, fileName) {
            currentDocUrl = url;
            currentDocName = fileName;
            isDocEditMode = false;

            const modal = document.getElementById('docViewerModal');
            const iconEl = document.getElementById('docViewerIcon');
            const titleEl = document.getElementById('docViewerTitle');
            const metaEl = document.getElementById('docViewerMeta');
            const bodyEl = document.getElementById('docViewerBody');
            const searchInput = document.getElementById('docViewerSearchInput');
            const editBtn = document.getElementById('docEditToggleBtn');
            const saveBtn = document.getElementById('docSaveBtn');

            if (iconEl) iconEl.innerText = '📊';
            if (titleEl) titleEl.innerText = fileName;
            if (metaEl) metaEl.innerText = 'Loading spreadsheet data...';
            if (searchInput) { searchInput.value = ''; searchInput.style.display = 'inline-block'; }
            if (editBtn) editBtn.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'none';
            if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);"><span style="font-size:32px;display:block;margin-bottom:8px;">⏳</span>Loading Spreadsheet Grid...</div>';

            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('active');
            }

            try {
                const res = await fetch(url);
                currentDocRawText = await res.text();
                const isTsv = fileName.toLowerCase().endsWith('.tsv');
                const rows = parseCSV(currentDocRawText, isTsv ? '\t' : ',');

                if (!rows || rows.length === 0) {
                    if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">Spreadsheet is empty.</div>';
                    if (metaEl) metaEl.innerText = '0 Rows, 0 Columns';
                    return;
                }

                const rowCount = rows.length;
                const colCount = Math.max(...rows.map(r => r.length));
                if (metaEl) metaEl.innerText = 'Spreadsheet Grid • ' + rowCount + ' Rows, ' + colCount + ' Columns';

                let tableHtml = '<div class="csv-table-wrapper"><table class="csv-grid-table" id="csvDataTable">';
                
                // Header Row (Row 0)
                tableHtml += '<thead><tr><th class="csv-row-num-cell">#</th>';
                for (let c = 0; c < colCount; c++) {
                    const colLetter = String.fromCharCode(65 + (c % 26)) + (c >= 26 ? Math.floor(c / 26) : '');
                    const cellVal = rows[0] && rows[0][c] !== undefined ? escapeHtml(rows[0][c]) : ('Col ' + colLetter);
                    tableHtml += '<th><span class="csv-col-letter">' + colLetter + '</span>' + cellVal + '</th>';
                }
                tableHtml += '</tr></thead><tbody>';

                // Data Rows (Row 1 to End)
                const startRow = rowCount > 1 ? 1 : 0;
                for (let r = startRow; r < rowCount; r++) {
                    tableHtml += '<tr class="csv-data-row"><td class="csv-row-num-cell">' + r + '</td>';
                    for (let c = 0; c < colCount; c++) {
                        const val = rows[r] && rows[r][c] !== undefined ? rows[r][c] : '';
                        tableHtml += '<td>' + escapeHtml(val) + '</td>';
                    }
                    tableHtml += '</tr>';
                }
                tableHtml += '</tbody></table></div>';

                if (bodyEl) bodyEl.innerHTML = tableHtml;
            } catch (err) {
                if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:#f87171;">Failed to load CSV file: ' + escapeHtml(err.message) + '</div>';
            }
        }
        window.openCsvViewer = openCsvViewer;

        function filterDocViewerContent(query) {
            query = (query || '').toLowerCase().trim();
            const table = document.getElementById('csvDataTable');
            if (table) {
                const rows = table.querySelectorAll('tbody tr.csv-data-row');
                rows.forEach(tr => {
                    const txt = tr.innerText.toLowerCase();
                    tr.style.display = (!query || txt.includes(query)) ? '' : 'none';
                });
                return;
            }
            const textarea = document.getElementById('docCodeTextarea');
            if (textarea && query) {
                const idx = textarea.value.toLowerCase().indexOf(query);
                if (idx >= 0) {
                    textarea.focus();
                    textarea.setSelectionRange(idx, idx + query.length);
                }
            }
        }
        window.filterDocViewerContent = filterDocViewerContent;

        async function openCodeViewer(url, fileName) {
            currentDocUrl = url;
            currentDocName = fileName;
            isDocEditMode = false;

            const modal = document.getElementById('docViewerModal');
            const iconEl = document.getElementById('docViewerIcon');
            const titleEl = document.getElementById('docViewerTitle');
            const metaEl = document.getElementById('docViewerMeta');
            const bodyEl = document.getElementById('docViewerBody');
            const searchInput = document.getElementById('docViewerSearchInput');
            const editBtn = document.getElementById('docEditToggleBtn');
            const saveBtn = document.getElementById('docSaveBtn');

            const ext = fileName.split('.').pop().toLowerCase();
            const extIcons = {
                'json': '📦', 'js': '⚡', 'py': '🐍', 'html': '🌐', 'css': '🎨', 
                'cs': '🔷', 'sql': '🗄️', 'md': '📝', 'txt': '📄', 'sh': '⚙️', 'log': '📋'
            };
            if (iconEl) iconEl.innerText = extIcons[ext] || '📝';
            if (titleEl) titleEl.innerText = fileName;
            if (metaEl) metaEl.innerText = 'Loading document...';
            if (searchInput) { searchInput.value = ''; searchInput.style.display = 'inline-block'; }
            if (editBtn) { editBtn.innerText = '✏️ Edit'; editBtn.style.display = 'inline-flex'; }
            if (saveBtn) saveBtn.style.display = 'none';

            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('active');
            }

            try {
                const res = await fetch(url);
                currentDocRawText = await res.text();
                const lines = currentDocRawText.split('\n');
                if (metaEl) metaEl.innerText = ext.toUpperCase() + ' Source • ' + lines.length + ' Lines • ' + formatBytes(new Blob([currentDocRawText]).size);

                renderCodeViewerContent(currentDocRawText, false);
            } catch (err) {
                if (bodyEl) bodyEl.innerHTML = '<div style="padding:40px;text-align:center;color:#f87171;">Failed to load file: ' + escapeHtml(err.message) + '</div>';
            }
        }
        window.openCodeViewer = openCodeViewer;

        function renderCodeViewerContent(text, editable) {
            const bodyEl = document.getElementById('docViewerBody');
            if (!bodyEl) return;

            const lines = text.split('\n');
            let lineNumsHtml = '';
            for (let i = 1; i <= Math.max(1, lines.length); i++) {
                lineNumsHtml += '<span>' + i + '</span>\n';
            }

            if (editable) {
                bodyEl.innerHTML = 
                    '<div class="doc-code-editor-wrap is-editable">' +
                        '<div class="doc-line-numbers">' + lineNumsHtml + '</div>' +
                        '<textarea id="docCodeTextarea" class="doc-code-textarea" spellcheck="false">' + escapeHtml(text) + '</textarea>' +
                    '</div>';
                const ta = document.getElementById('docCodeTextarea');
                if (ta) {
                    ta.focus();
                    ta.addEventListener('input', () => {
                        const newLines = ta.value.split('\n').length;
                        let newNums = '';
                        for (let i = 1; i <= newLines; i++) newNums += '<span>' + i + '</span>\n';
                        const lnEl = bodyEl.querySelector('.doc-line-numbers');
                        if (lnEl) lnEl.innerHTML = newNums;
                    });
                }
            } else {
                bodyEl.innerHTML = 
                    '<div class="doc-code-editor-wrap">' +
                        '<div class="doc-line-numbers">' + lineNumsHtml + '</div>' +
                        '<pre class="doc-code-pre"><code class="doc-code-content">' + escapeHtml(text) + '</code></pre>' +
                    '</div>';
            }
        }

        function toggleDocEditMode() {
            isDocEditMode = !isDocEditMode;
            const editBtn = document.getElementById('docEditToggleBtn');
            const saveBtn = document.getElementById('docSaveBtn');
            const metaEl = document.getElementById('docViewerMeta');

            if (isDocEditMode) {
                const pre = document.querySelector('.doc-code-content');
                const text = pre ? pre.innerText : currentDocRawText;
                renderCodeViewerContent(text, true);
                if (editBtn) editBtn.innerText = '👁️ View Mode';
                if (saveBtn) saveBtn.style.display = 'inline-flex';
                if (metaEl) metaEl.innerText = '✏️ Editing Mode Active (Click 💾 Save when done)';
            } else {
                const ta = document.getElementById('docCodeTextarea');
                if (ta) currentDocRawText = ta.value;
                renderCodeViewerContent(currentDocRawText, false);
                if (editBtn) editBtn.innerText = '✏️ Edit';
                if (saveBtn) saveBtn.style.display = 'none';
                const lines = currentDocRawText.split('\n');
                if (metaEl) metaEl.innerText = 'Source View • ' + lines.length + ' Lines';
            }
        }
        window.toggleDocEditMode = toggleDocEditMode;

        async function saveDocEditorContent() {
            const ta = document.getElementById('docCodeTextarea');
            const content = ta ? ta.value : currentDocRawText;

            // Extract relative server path from currentDocUrl
            let relPath = currentDocUrl.replace(/^\/files\//i, '').replace(/^\/api\/files\/download\?path=/i, '');
            if (relPath.startsWith('/')) relPath = relPath.substring(1);
            try { relPath = decodeURIComponent(relPath); } catch(e) {}

            try {
                showToast('💾 Saving changes to server...');
                const headers = { 'Content-Type': 'application/json' };
                if (typeof currentUserName !== 'undefined' && currentUserName) {
                    headers['X-User-Name'] = encodeURIComponent(currentUserName);
                }
                const adminToken = (typeof getAdminToken === 'function') ? getAdminToken() : '';
                if (adminToken) headers['X-Admin-Token'] = adminToken;

                const res = await fetch('/api/save-file', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        path: relPath,
                        content: content
                    })
                });
                const data = await res.json();
                if (data.success) {
                    currentDocRawText = content;
                    showToast('✅ File saved successfully on server!');
                    toggleDocEditMode(); // Revert to view mode
                    if (typeof loadFileList === 'function') loadFileList();
                } else {
                    alert('Save Failed: ' + (data.error || 'Server rejected file edit'));
                }
            } catch (err) {
                alert('Save Error: ' + err.message);
            }
        }
        window.saveDocEditorContent = saveDocEditorContent;

        function downloadCurrentDocFile() {
            if (!currentDocUrl) return;
            triggerDownloadTracked(currentDocUrl, currentDocName || 'document.txt');
        }
        window.downloadCurrentDocFile = downloadCurrentDocFile;

        function closeDocViewerModal(e) {
            if (!e || e.target.id === 'docViewerModal' || (e.target.classList && e.target.classList.contains('modal-close-btn'))) {
                const modal = document.getElementById('docViewerModal');
                if (modal) {
                    modal.style.display = 'none';
                    modal.classList.remove('active');
                }
            }
        }
        window.closeDocViewerModal = closeDocViewerModal;
        window.openFileQrModal = openFileQrModal;
        window.closeFileQrModal = closeFileQrModal;
        window.copyFileQrUrl = copyFileQrUrl;
        window.onFileSortChange = onFileSortChange;
        window.onFileSearchInput = onFileSearchInput;
        window.clearFileSearch = clearFileSearch;
        window.loadFoldersList = loadFoldersList;
        window.loadFileList = loadFileList;
        window.uploadFilesQueue = uploadFilesQueue;
        window.formatBytes = formatBytes;
        window.openFolder = openFolder;
        window.backToAllFolders = backToAllFolders;
        window.switchViewMode = switchViewMode;
        window.setFilter = setFilter;
        window.promptCreateNewFolder = promptCreateNewFolder;
        window.onUploadFolderChanged = onUploadFolderChanged;
        window.deleteActiveFolderPrompt = deleteActiveFolderPrompt;
        window.downloadActiveFolderAll = downloadActiveFolderAll;
        window.downloadFolderById = downloadFolderById;
        window.selectAllVisibleFiles = selectAllVisibleFiles;
        window.clearFileSelection = clearFileSelection;
        window.downloadSelectedFiles = downloadSelectedFiles;

        // Auto-run on load
        if (typeof loadFoldersList === 'function') loadFoldersList();
        if (typeof loadFileList === 'function') loadFileList();

