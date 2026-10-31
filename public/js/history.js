

        // Schließen wenn auf den transparenten Hintergrund (außerhalb der Kacheln) geklickt wird
        document.addEventListener('click', (e) => {
            if (e.target === document.body || e.target.classList.contains('side-panel-container')) {
                if (isElectron && ipcRenderer) {
                    ipcRenderer.send('hide-window');
                } else {
                    document.body.classList.remove('active');
                }
            }
        });



        // Drag & Drop Logik
        const handleDrag = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };



        const isProjectDropActive = (e) => {
            if (!window.activeProjectDetailId || window.activeProjectDetailId === 'unassigned') return false;
            if (document.body.classList.contains('view-projects')) return true;
            if (e && e.target && e.target.closest && e.target.closest('.project-detail-container')) return true;
            const projOverlay = document.getElementById('project-drag-overlay');
            if (projOverlay) return true;
            return false;
        };

        const isMediaDropActive = (e) => {
            if (document.body.classList.contains('view-photos') || document.body.classList.contains('view-docs') || document.body.classList.contains('view-media')) {
                return true;
            }
            if (e && e.target && e.target.closest && (e.target.closest('#widget-photos') || e.target.closest('#widget-docs') || e.target.closest('.media-dashboard'))) {
                return true;
            }
            return false;
        };

        document.addEventListener('dragenter', (e) => {
            if (isProjectDropActive(e)) {
                handleDrag(e);
                const projOverlay = document.getElementById('project-drag-overlay');
                if (projOverlay) projOverlay.classList.add('is-active');
                return;
            }
            if (isMediaDropActive(e)) {
                handleDrag(e);
                if (document.body.classList.contains('view-docs')) {
                    const docOverlay = document.getElementById('docs-drag-overlay');
                    if (docOverlay) docOverlay.classList.add('is-active');
                } else {
                    const photoOverlay = document.getElementById('photos-drag-overlay');
                    if (photoOverlay) photoOverlay.classList.add('is-active');
                }
                return;
            }
            handleDrag(e);
            if (typeof isElectron !== 'undefined' && isElectron && typeof dropZone !== 'undefined' && dropZone) {
                dropZone.classList.add('active');
            }
        });

        document.addEventListener('dragover', (e) => {
            if (isProjectDropActive(e)) {
                handleDrag(e);
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
                const projOverlay = document.getElementById('project-drag-overlay');
                if (projOverlay && !projOverlay.classList.contains('is-active')) projOverlay.classList.add('is-active');
                return;
            }
            if (isMediaDropActive(e)) {
                handleDrag(e);
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
                if (document.body.classList.contains('view-docs')) {
                    const docOverlay = document.getElementById('docs-drag-overlay');
                    if (docOverlay && !docOverlay.classList.contains('is-active')) docOverlay.classList.add('is-active');
                } else {
                    const photoOverlay = document.getElementById('photos-drag-overlay');
                    if (photoOverlay && !photoOverlay.classList.contains('is-active')) photoOverlay.classList.add('is-active');
                }
                return;
            }
            handleDrag(e);
            if (typeof isElectron !== 'undefined' && isElectron && typeof dropZone !== 'undefined' && dropZone) {
                dropZone.classList.add('active');
            }
        });

        document.addEventListener('dragleave', (e) => {
            if (isProjectDropActive(e)) {
                handleDrag(e);
                if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight || !e.relatedTarget) {
                    const projOverlay = document.getElementById('project-drag-overlay');
                    if (projOverlay) projOverlay.classList.remove('is-active');
                }
                return;
            }
            if (isMediaDropActive(e)) {
                handleDrag(e);
                if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight || !e.relatedTarget) {
                    const photoOverlay = document.getElementById('photos-drag-overlay');
                    if (photoOverlay) photoOverlay.classList.remove('is-active');
                    const docOverlay = document.getElementById('docs-drag-overlay');
                    if (docOverlay) docOverlay.classList.remove('is-active');
                }
                return;
            }
            handleDrag(e);
            if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                if (typeof dropZone !== 'undefined' && dropZone) {
                    dropZone.classList.remove('active');
                }
            }
        });

        document.addEventListener('drop', async (e) => {
            if (typeof dropZone !== 'undefined' && dropZone) {
                dropZone.classList.remove('active');
            }

            // Wenn ein Projekt geöffnet ist, Dateien direkt dem Projekt zuweisen
            if (isProjectDropActive(e)) {
                handleDrag(e);
                const projOverlay = document.getElementById('project-drag-overlay');
                if (projOverlay) projOverlay.classList.remove('is-active');

                const files = e.dataTransfer ? e.dataTransfer.files : null;
                if (files && files.length > 0 && typeof handleMediaFilesSelected === 'function') {
                    await handleMediaFilesSelected(files, window.activeProjectDetailId);
                }
                return;
            }

            // Wenn wir in Fotos oder Dokumenten sind, Drop direkt an die Medien-Verarbeitung weiterleiten
            if (isMediaDropActive(e)) {
                handleDrag(e);
                const photoOverlay = document.getElementById('photos-drag-overlay');
                if (photoOverlay) photoOverlay.classList.remove('is-active');
                const docOverlay = document.getElementById('docs-drag-overlay');
                if (docOverlay) docOverlay.classList.remove('is-active');

                const files = e.dataTransfer ? e.dataTransfer.files : null;
                if (files && files.length > 0) {
                    if (document.body.classList.contains('view-docs') || Boolean(e.target && e.target.closest && e.target.closest('.docs-dashboard'))) {
                        if (typeof handleDocsFilesSelected === 'function') {
                            handleDocsFilesSelected(files);
                        }
                    } else {
                        if (typeof handlePhotosFilesSelected === 'function') {
                            handlePhotosFilesSelected(files);
                        }
                    }
                }
                return;
            }

            handleDrag(e);
            try {
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    const file = files[0];
                    let filePath = "";
                    try {
                        filePath = webUtils ? webUtils.getPathForFile(file) : file.path;
                    } catch (pathErr) {
                        filePath = file.path;
                    }

                    if (filePath && filePath.toLowerCase().endsWith('.exe')) {
                        pendingAppPath = filePath;
                        modalFilePath.textContent = filePath;
                        namingModal.classList.add('active');
                        appNameInput.focus();
                    } else if (typeof dropZone !== 'undefined' && dropZone && dropZone.classList.contains('active')) {
                        alert("Bitte ziehe eine echte .EXE Datei direkt aus dem Explorer hierher.");
                    }
                }
            } catch (err) {
                alert("Fehler beim Drop: " + err.message);
            }
        });



        async function registerApp(name, path) {
            console.log("Registriere App:", name, path);
            try {
                const res = await fetch(getApiUrl('/apps'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, path })
                });
                const data = await res.json();
                console.log("Server Antwort:", data);
                if (res.ok) {
                    addMessage(`✅ Programm "${name}" wurde registriert.`, false);
                }
            } catch (e) {
                console.error("Registrierungs-Fehler:", e);
                addMessage("Fehler beim Registrieren.", false);
            }
        }



        // Anhänge Logik
        let attachedFiles = [];


        const attachmentsBar = document.getElementById('attachments-bar');



        if (isElectron && ipcRenderer) {
            ipcRenderer.on('process-dropped-files', async (event, filePaths) => {
                console.log("Verarbeite gedroppte Dateien:", filePaths);
                for (const path of filePaths) {
                    await addAttachment(path);
                }
            });
        }



        async function addAttachment(filePath) {
            const fs = require('fs');
            const path = require('path');
            
            try {
                const stats = fs.statSync(filePath);
                if (stats.isDirectory()) return;

                const fileName = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const buffer = fs.readFileSync(filePath);
                const base64 = buffer.toString('base64');
                
                let mimeType = 'application/octet-stream';
                if (ext === '.png') mimeType = 'image/png';
                else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
                else if (ext === '.webp') mimeType = 'image/webp';
                else if (ext === '.gif') mimeType = 'image/gif';
                else if (ext === '.pdf') mimeType = 'application/pdf';
                else if (ext === '.txt' || ext === '.md' || ext === '.ts' || ext === '.js') mimeType = 'text/plain';
                else if (ext === '.mp3') mimeType = 'audio/mpeg';
                else if (ext === '.wav') mimeType = 'audio/wav';
                else if (ext === '.mp4') mimeType = 'video/mp4';

                const attachment = {
                    name: fileName,
                    path: filePath,
                    base64: base64,
                    mimeType: mimeType,
                    isImage: mimeType.startsWith('image/')
                };

                console.log("Anhang hinzugefügt:", fileName, mimeType);
                attachedFiles.push(attachment);
                renderAttachments();
            } catch (err) {
                console.error("Fehler beim Lesen der Datei:", err);
            }
        }



        function renderAttachments() {
            attachmentsBar.innerHTML = '';
            if (attachedFiles.length > 0) {
                attachmentsBar.classList.add('active');
                attachedFiles.forEach((file, index) => {
                    const chip = document.createElement('div');
                    chip.className = 'attachment-chip';
                    
                    if (file.isImage) {
                        const img = document.createElement('img');
                        img.src = `data:${file.mimeType};base64,${file.base64}`;
                        chip.appendChild(img);
                    }

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = file.name;
                    chip.appendChild(nameSpan);

                    const removeBtn = document.createElement('span');
                    removeBtn.className = 'remove';
                    removeBtn.innerHTML = '&times;';
                    removeBtn.onclick = () => {
                        attachedFiles.splice(index, 1);
                        renderAttachments();
                    };
                    chip.appendChild(removeBtn);

                    attachmentsBar.appendChild(chip);
                });
            } else {
                attachmentsBar.classList.remove('active');
            }
            if (typeof updateInputRowButtons === 'function') {
                updateInputRowButtons();
            }
        }



        // Fokus beim Start (nur auf Desktop/Electron)
        if (isElectron && !document.body.classList.contains('mobile-mode')) {
            userInput.focus();
        }



        // Fokus-Trigger bei Electron-Aktivierung (nur auf Desktop/Electron)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class' && document.body.classList.contains('active')) {
                    setTimeout(() => {
                        if (!isElectron || document.body.classList.contains('mobile-mode')) return;
                        if (!isPluginsView && chatSection.style.display !== 'none') userInput.focus();
                    }, 100);
                }
            });
        });


        observer.observe(document.body, { attributes: true });



        // Navigation
        navNew.onclick = () => {
            currentConversationId = null;
            window.currentConversationId = null;
            chatBox.innerHTML = '<div class="message ai">Ein neuer Chat wurde gestartet. Wie kann ich dir helfen?</div>';
            showSection('chat');
            if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                window.AppRouter.updateUrl('/chat');
            }
        };



        navHistory.onclick = () => {
            showSection('history');
            loadHistory();
        };



        function showSection(name) {
            if (name !== 'login' && (name === 'chat' || name === 'history' || name === 'settings')) {
                if (window.isClosingMailReadModal !== true && document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                    closeMailReadModal();
                }
            }
            const loginSec = document.getElementById('login-section');
            const mobileTopBar = document.getElementById('mobile-top-bar');
            if (name === 'login') {
                chatSection.style.display = 'none';
                historySection.style.display = 'none';
                settingsSection.style.display = 'none';
                rightHeader.style.display = 'none';
                if (loginSec) loginSec.style.display = 'flex';
                if (mobileTopBar) mobileTopBar.style.display = 'none';
                
                // Hide sidebar/bottom nav bar on login screen
                const sidebar = document.querySelector('.sidebar-nav');
                if (sidebar) sidebar.style.display = 'none';
                const bottomNav = document.querySelector('.bottom-nav');
                if (bottomNav) bottomNav.style.display = 'none';
                const rightSide = document.querySelector('.right-side');
                if (rightSide) rightSide.style.display = 'none';

                // Remove all view classes from body
                document.body.classList.remove('view-chat', 'view-calendar', 'view-timer', 'view-tasks', 'view-projects', 'view-plugins', 'view-settings', 'view-history', 'view-memory', 'view-journal');
                document.body.classList.add('view-login');
            } else {
                if (loginSec) loginSec.style.display = 'none';
                document.body.classList.remove('view-login');
                if (mobileTopBar && document.body.classList.contains('mobile-mode')) {
                    mobileTopBar.style.display = 'flex';
                }
                
                // Show sidebar/bottom nav bar
                const sidebar = document.querySelector('.sidebar-nav');
                if (sidebar) sidebar.style.display = 'flex';
                const bottomNav = document.querySelector('.bottom-nav');
                if (bottomNav) bottomNav.style.display = 'flex';
                const rightSide = document.querySelector('.right-side');
                if (rightSide) rightSide.style.display = 'flex';

                if (name === 'chat') {
                    chatSection.style.display = 'flex';
                    historySection.style.display = 'none';
                    settingsSection.style.display = 'none';
                    rightHeader.style.display = 'flex';
                    navNew.classList.add('active');
                    navHistory.classList.remove('active');
                    
                    const mobNew = document.getElementById('mobile-nav-new');
                    const mobHist = document.getElementById('mobile-nav-history');
                    if (mobNew) mobNew.classList.add('active');
                    if (mobHist) mobHist.classList.remove('active');
                    
                    if (document.body.classList.contains('mobile-mode')) {
                        switchMobileView('chat');
                    }
                } else if (name === 'history') {
                    chatSection.style.display = 'none';
                    historySection.style.display = 'flex';
                    settingsSection.style.display = 'none';
                    rightHeader.style.display = 'flex';
                    navNew.classList.remove('active');
                    navHistory.classList.add('active');
                    
                    const mobNew = document.getElementById('mobile-nav-new');
                    const mobHist = document.getElementById('mobile-nav-history');
                    if (mobNew) mobNew.classList.remove('active');
                    if (mobHist) mobHist.classList.add('active');
                    
                    if (document.body.classList.contains('mobile-mode')) {
                        switchMobileView('history');
                    }
                } else if (name === 'settings') {
                    chatSection.style.display = 'none';
                    historySection.style.display = 'none';
                    settingsSection.style.display = 'flex';
                    rightHeader.style.display = 'none';
                    navNew.classList.remove('active');
                    navHistory.classList.remove('active');
                    
                    if (document.body.classList.contains('mobile-mode')) {
                        switchMobileView('settings');
                    }
                }

                if (window.AppRouter && typeof window.AppRouter.onViewChanged === 'function') {
                    window.AppRouter.onViewChanged(name, { conversationId: window.currentConversationId });
                }
            }
        }



        // Verlauf laden & filtern
        let allLoadedConversations = [];


        let currentHistoryFilter = 'all';


        let currentDrawerHistoryFilter = 'all';



        window.setHistoryFilter = function(filter) {
            currentHistoryFilter = filter;
            document.querySelectorAll('.history-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.historyFilter === filter);
            });
            applyHistoryFilter();
        };



        window.setDrawerHistoryFilter = function(filter) {
            currentDrawerHistoryFilter = filter;
            document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.drawerFilter === filter);
            });
            applyDrawerHistoryFilter();
        };



        function applyHistoryFilter() {
            const query = (historyQuery ? historyQuery.value : '').toLowerCase().trim();
            let filtered = allLoadedConversations;
            if (currentHistoryFilter === 'chat') {
                filtered = filtered.filter(c => !c.isAgentRun);
            } else if (currentHistoryFilter === 'agent_run') {
                filtered = filtered.filter(c => !!c.isAgentRun);
            }
            if (query) {
                filtered = filtered.filter(c => (c.title || '').toLowerCase().includes(query) || (c.summary || '').toLowerCase().includes(query));
            }
            renderHistoryListOnly(filtered);
        }



        function applyDrawerHistoryFilter() {
            const drawerQueryInput = document.getElementById('drawer-history-query');
            const query = (drawerQueryInput ? drawerQueryInput.value : '').toLowerCase().trim();
            let filtered = allLoadedConversations;
            if (currentDrawerHistoryFilter === 'chat') {
                filtered = filtered.filter(c => !c.isAgentRun);
            } else if (currentDrawerHistoryFilter === 'agent_run') {
                filtered = filtered.filter(c => !!c.isAgentRun);
            }
            if (query) {
                filtered = filtered.filter(c => (c.title || '').toLowerCase().includes(query) || (c.summary || '').toLowerCase().includes(query));
            }
            renderDrawerHistoryListOnly(filtered);
        }



        async function loadHistory() {
            try {
                const res = await fetch(getApiUrl('/conversations'));
                allLoadedConversations = await res.json();
                applyHistoryFilter();
                applyDrawerHistoryFilter();
            } catch (err) {
                console.error("Fehler beim Laden des Verlaufs:", err);
            }
        }



        function renderHistory(conversations) {
            allLoadedConversations = conversations;
            applyHistoryFilter();
            applyDrawerHistoryFilter();
        }



        
        function getAgentRunStatus(conv) {
            if (!conv) return { isRunning: false, statusClass: 'completed', statusText: '✅ Erledigt', shortText: '✅' };
            const hasActiveNotif = conv.notifications && conv.notifications.some(n => !n.isDismissed);
            const isRunning = conv.status === 'running' || conv.status === 'waiting_for_user' || hasActiveNotif;
            const isError = conv.status === 'error';

            if (isRunning) {
                return { isRunning: true, statusClass: 'running', statusText: '⏳ Läuft', shortText: '⏳' };
            }
            if (isError) {
                return { isRunning: false, statusClass: 'error', statusText: '❌ Fehler', shortText: '❌' };
            }
            return { isRunning: false, statusClass: 'completed', statusText: '✅ Erledigt', shortText: '✅' };
        }


        window.getAgentRunStatus = getAgentRunStatus;


        let activeRunPollInterval = null;



        function renderHistoryListOnly(conversations) {
            if (!historyList) return;
            historyList.innerHTML = '';
            if (conversations.length === 0) {
                historyList.innerHTML = `<div style="text-align: center; padding: 25px 15px; opacity: 0.5; font-size: 0.85rem;">Keine Einträge gefunden.</div>`;
                return;
            }
            conversations.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'history-item' + (conv.isAgentRun ? ' agent-run' : '');
                const date = new Date(conv.createdAt).toLocaleString('de-DE', { 
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                });

                let badgeHtml = '';
                if (conv.isAgentRun) {
                    const runInfo = getAgentRunStatus(conv);
                    const statusClass = runInfo.statusClass;
                    const statusText = runInfo.statusText;
                    const triggerIcon = conv.triggerType === 'mail' ? '✉️ E-Mail' : '🤖 Agent';
                    badgeHtml = `
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="font-size: 0.68rem; color: #cba6f7; background: rgba(203, 166, 247, 0.15); border: 1px solid rgba(203, 166, 247, 0.3); padding: 1px 6px; border-radius: 6px; font-weight: 700;">${triggerIcon}</span>
                            <span class="agent-status-pill ${statusClass}">${statusText}</span>
                        </div>
                    `;
                } else {
                    badgeHtml = `<span style="font-size: 0.68rem; color: var(--accent); opacity: 0.8;">💬 Chat</span>`;
                }

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 6px;">
                        <div class="date" style="margin-bottom: 0;">${date}</div>
                        ${badgeHtml}
                    </div>
                    <div class="title" style="${conv.isAgentRun ? 'color: #cdd6f4; font-weight: 600;' : ''}">${escapeHtml(conv.title)}</div>
                    ${conv.summary ? `<div style="font-size: 0.74rem; opacity: 0.7; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.3;">${escapeHtml(conv.summary)}</div>` : ''}
                `;
                item.onclick = () => loadConversation(conv.id);
                historyList.appendChild(item);
            });
        }



        function renderDrawerHistoryListOnly(conversations) {
            const drawerHistoryList = document.getElementById('drawer-history-list');
            if (!drawerHistoryList) return;
            drawerHistoryList.innerHTML = '';
            if (conversations.length === 0) {
                drawerHistoryList.innerHTML = `<div style="text-align: center; padding: 20px 10px; opacity: 0.5; font-size: 0.8rem;">Keine Einträge gefunden.</div>`;
                return;
            }
            conversations.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'drawer-history-item' + (conv.isAgentRun ? ' agent-run' : '');
                const date = new Date(conv.createdAt).toLocaleString('de-DE', { 
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                });

                let badgeHtml = '';
                if (conv.isAgentRun) {
                    const runInfo = getAgentRunStatus(conv);
                    const statusClass = runInfo.statusClass;
                    const statusText = runInfo.shortText;
                    badgeHtml = `
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span style="font-size: 0.65rem; color: #cba6f7; background: rgba(203, 166, 247, 0.15); border: 1px solid rgba(203, 166, 247, 0.3); padding: 1px 5px; border-radius: 6px; font-weight: 700;">🤖</span>
                            <span class="agent-status-pill ${statusClass}" style="padding: 1px 4px;">${statusText}</span>
                        </div>
                    `;
                }

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                        <div class="date" style="margin-bottom: 0;">${date}</div>
                        ${badgeHtml}
                    </div>
                    <div class="title">${escapeHtml(conv.title)}</div>
                    ${conv.summary ? `<div style="font-size: 0.72rem; opacity: 0.65; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(conv.summary)}</div>` : ''}
                `;
                item.onclick = () => {
                    loadConversation(conv.id);
                    closeMobileDrawer();
                };
                drawerHistoryList.appendChild(item);
            });
        }



        async function loadConversation(id) {
            let messages = [];
            let conversationMeta = null;
            try {
                const metaRes = await fetch(getApiUrl(`/conversations/${id}/meta`));
                if (metaRes.ok) {
                    const data = await metaRes.json();
                    conversationMeta = data.conversation;
                    messages = data.messages || [];
                    currentConversationNotifications = data.notifications || [];
                    currentConversationNotifications.forEach(n => n._rendered = false);
                } else {
                    const res = await fetch(getApiUrl(`/conversations/${id}`));
                    messages = await res.json();
                }
            } catch (err) {
                try {
                    const res = await fetch(getApiUrl(`/conversations/${id}`));
                    messages = await res.json();
                } catch (e2) {
                    console.error("Fehler beim Laden der Konversation:", e2);
                }
            }
            
            currentConversationId = id;
            window.currentConversationId = id;
            if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                window.AppRouter.updateUrl(`/chat/${id}`);
            }
            chatBox.innerHTML = '';

            // Wenn dies ein Agent Run ist, ein informatives Banner oben anzeigen
            if (conversationMeta && conversationMeta.isAgentRun) {
                const banner = document.createElement('div');
                banner.className = 'agent-run-chat-banner';
                
                const hasActiveNotifs = currentConversationNotifications && currentConversationNotifications.some(n => !n.isDismissed);
                const isRunActive = conversationMeta.status === 'running' || conversationMeta.status === 'waiting_for_user' || hasActiveNotifs;
                const statusClass = isRunActive ? 'running' : (conversationMeta.status === 'error' ? 'error' : 'completed');
                const statusText = isRunActive 
                    ? '<span class="agent-status-pill running">⏳ Läuft...</span>' 
                    : (conversationMeta.status === 'error' 
                        ? '<span class="agent-status-pill error">❌ Fehler</span>' 
                        : '<span class="agent-status-pill completed">✅ Erledigt</span>');

                // Live-Polling starten, solange der Agent Run noch aktiv/in Bearbeitung ist
                if (typeof activeRunPollInterval !== 'undefined' && activeRunPollInterval) {
                    clearInterval(activeRunPollInterval);
                    activeRunPollInterval = null;
                }
                if (isRunActive) {
                    activeRunPollInterval = setInterval(async () => {
                        if (currentConversationId !== id) {
                            clearInterval(activeRunPollInterval);
                            return;
                        }
                        try {
                            const pollRes = await fetch(getApiUrl(`/conversations/${id}/meta`));
                            if (!pollRes.ok) return;
                            const pollData = await pollRes.json();
                            const pMeta = pollData.conversation;
                            const pNotifs = pollData.notifications || [];
                            const stillActive = pMeta.status === 'running' || pMeta.status === 'waiting_for_user' || pNotifs.some(n => !n.isDismissed);
                            if (!stillActive) {
                                clearInterval(activeRunPollInterval);
                                activeRunPollInterval = null;
                                await loadConversation(id);
                                if (typeof loadHistory === 'function') loadHistory();
                            }
                        } catch (e) {}
                    }, 2500);
                }
                        
                const triggerLabel = conversationMeta.triggerType === 'mail' ? '✉️ E-Mail-Eingang' : (conversationMeta.triggerType || 'System');
                
                let mailBtnHtml = '';
                if (conversationMeta.triggerType === 'mail' && conversationMeta.triggerId) {
                    mailBtnHtml = `
                        <button type="button" onclick="openMailReadModal(${conversationMeta.triggerId}, 'chat')" class="nav-btn" style="padding: 5px 12px; font-size: 0.74rem; background: var(--accent); color: #11111b; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseover="this.style.opacity='0.9'" title="Zur verknüpften E-Mail springen">
                            ✉️ Zur E-Mail
                        </button>
                    `;
                }

                const actionBtnsHtml = `
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto;">
                        <button type="button" onclick="focusWidget('dashboard')" class="nav-btn" style="padding: 5px 10px; font-size: 0.74rem; background: rgba(255, 255, 255, 0.08); color: var(--text); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" title="Zurück zu Heute">
                            📅 Zu Heute
                        </button>
                        ${mailBtnHtml}
                    </div>
                `;
                
                banner.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 9px; min-width: 0;">
                        <span style="font-size: 1.3rem;">🤖</span>
                        <div style="min-width: 0;">
                            <div style="font-size: 0.92rem; font-weight: 700; color: #cba6f7; display: flex; align-items: center; gap: 6px;">
                                <span>Autonomer Agent Run</span>
                                ${statusText}
                            </div>
                            <div style="font-size: 0.76rem; opacity: 0.75; color: var(--text);">
                                Auslöser: ${triggerLabel} &bull; ${new Date(conversationMeta.createdAt).toLocaleString('de-DE')}
                            </div>
                        </div>
                    </div>
                    ${actionBtnsHtml}
                `;
                chatBox.appendChild(banner);
            }

            messages.forEach(msg => addMessage(msg.text, msg.role === 'user'));
            if (currentConversationNotifications && currentConversationNotifications.length > 0) {
                currentConversationNotifications.forEach(n => {
                    if (!n._rendered && !n.isDismissed) {
                        const card = createNotificationCardElement(n, id);
                        if (card) {
                            chatBox.appendChild(card);
                            n._rendered = true;
                        }
                    }
                });
            }
            showSection('chat');
        }



        // Suche
        if (historyQuery) {
            historyQuery.oninput = () => applyHistoryFilter();
        }



        // Audio Aufnahme (MediaRecorder API)
        let mediaRecorder;


        let audioChunks = [];


        let isRecording = false;



        async function startRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = async () => {
                        const base64Audio = reader.result.split(',')[1];
                        sendAudioMessage(base64Audio);
                    };
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.start();
                isRecording = true;
                const inputRow = document.querySelector('.input-row');
                if (inputRow) {
                    inputRow.classList.add('recording');
                }
                userInput.placeholder = "Ich höre zu...";
            } catch (err) {
                userInput.placeholder = "Fehler: Mikrofon-Zugriff verweigert.";
            }
        }



        function stopRecording() {
            if (mediaRecorder && isRecording) {
                mediaRecorder.stop();
                isRecording = false;
                const inputRow = document.querySelector('.input-row');
                if (inputRow) {
                    inputRow.classList.remove('recording');
                }
                userInput.placeholder = "Nachricht an Gemini...";
            }
        }



        async function sendAudioMessage(base64Audio) {
            if (document.body.classList.contains('mobile-mode')) {
                switchMobileView('chat');
            }
            addMessage("🎤 Sprachnachricht gesendet...", true);
            
            const thinkingDiv = document.createElement('div');
            thinkingDiv.className = 'message ai thinking';
            thinkingDiv.innerHTML = `
                <div class="thinking-header">
                    Gemini denkt nach
                    <div class="thinking-dots"><span></span><span></span><span></span></div>
                </div>
                <div class="thinking-tools-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
            `;
            chatBox.appendChild(thinkingDiv);
            chatBox.scrollTop = chatBox.scrollHeight;

            const thinkingToolsList = thinkingDiv.querySelector('.thinking-tools-list');

            const toolFriendlyNames = {
                'suche_im_gedaechtnis': 'Semantische Suche im Gedächtnis',
                'hole_person_info': 'Profil & Fakten abrufen',
                'aktualisiere_person_biografie': 'Biografie aktualisieren',
                'fuege_person_fakt_hinzu': 'Fakt hinzufügen',
                'erstelle_timer': 'Timer erstellen',
                'loesche_timer': 'Timer abbrechen',
                'quittiere_timer': 'Timer quittieren',
                'fuege_termin_hinzu': 'Termin eintragen'
            };

            let renderedToolsCount = 0;
            const pollInterval = setInterval(async () => {
                try {
                    const pollRes = await fetch(getApiUrl('/chat/active-tools'));
                    if (!pollRes.ok) return;
                    const activeTools = await pollRes.json();
                    
                    if (activeTools.length > renderedToolsCount) {
                        for (let i = renderedToolsCount; i < activeTools.length; i++) {
                            const t = activeTools[i];
                            const friendlyName = toolFriendlyNames[t.name] || t.name;
                            
                            const toolItem = document.createElement('div');
                            toolItem.className = 'live-tool-item';
                            toolItem.innerHTML = `⚙️ ${friendlyName}: <span class="live-tool-name">${t.name}</span>`;
                            thinkingToolsList.appendChild(toolItem);
                            chatBox.scrollTop = chatBox.scrollHeight;
                        }
                        renderedToolsCount = activeTools.length;
                    }
                } catch (pollErr) {
                    console.error("Fehler beim Polling der aktiven Tools:", pollErr);
                }
            }, 300);

            try {
                const res = await fetch(getApiUrl('/chat'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        audio: base64Audio,
                        conversationId: currentConversationId 
                    })
                });
                const data = await res.json();
                
                clearInterval(pollInterval);
                thinkingDiv.remove();
 
                currentConversationId = data.conversationId;
                addMessage(data.text, false, data.widget, [], null, data.notification);
                loadTopWidgets();
                if (isElectron && ipcRenderer) {
                    ipcRenderer.send('widgets-updated');
                }
                userInput.placeholder = "Nachricht an Gemini...";
            } catch (e) {
                clearInterval(pollInterval);
                thinkingDiv.remove();
                addMessage("Fehler bei der Audio-Verarbeitung.", false);
            }
        }



        micBtn.onclick = () => isRecording ? stopRecording() : startRecording();



        window.copyCodeBlock = function(btn) {
            const codeBlock = btn.closest('.chat-code-block');
            if (!codeBlock) return;
            const codeEl = codeBlock.querySelector('.chat-code-content');
            if (!codeEl) return;
            const text = codeEl.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                const orig = btn.innerHTML;
                btn.innerHTML = '✅ Kopiert!';
                btn.style.color = '#a6e3a1';
                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.style.color = '';
                }, 2000);
            }).catch(err => {
                console.error('Kopieren fehlgeschlagen:', err);
            });
        };



        window.copyMessageText = function(btn) {
            const msg = btn.closest('.message');
            if (!msg) return;
            const rawText = msg.getAttribute('data-msg-text') || '';
            navigator.clipboard.writeText(rawText).then(() => {
                const orig = btn.innerHTML;
                btn.innerHTML = '✅';
                btn.style.color = '#a6e3a1';
                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.style.color = '';
                }, 2000);
            }).catch(err => {
                console.error('Kopieren fehlgeschlagen:', err);
            });
        };