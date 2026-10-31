

        function updateProjectsHeader(activeProject) {
            const titleContainer = document.getElementById('header-projects-title-container');
            const editBtn = document.getElementById('header-project-edit-btn');
            const settingsBtn = document.getElementById('header-project-settings-btn');
            const addBtn = document.getElementById('header-project-add-btn');

            if (!activeProject) {
                if (titleContainer) {
                    titleContainer.innerHTML = '<span id="header-projects-title">📁 Projekte</span>';
                }
                if (editBtn) {
                    editBtn.style.display = 'none';
                    editBtn.onclick = null;
                }
                if (settingsBtn) {
                    settingsBtn.style.display = 'none';
                    settingsBtn.onclick = null;
                }
                if (addBtn) {
                    addBtn.title = 'Neues Projekt erstellen';
                    addBtn.onclick = () => openProjectModal();
                }
            } else {
                const escName = escapeHtml(activeProject.name || 'Projekt');
                if (titleContainer) {
                    titleContainer.innerHTML = `
                        <span style="cursor: pointer; opacity: 0.8; transition: opacity 0.2s; white-space: nowrap;" onclick="closeProjectDetail()" title="Zurück zu allen Projekten">📁 Projekte</span>
                        <span style="opacity: 0.4; font-size: 0.85rem; margin: 0 2px;">&gt;</span>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; color: #ffffff;" title="${escName}">${escName}</span>
                    `;
                }
                if (activeProject.isUnassigned) {
                    if (editBtn) {
                        editBtn.style.display = 'none';
                        editBtn.onclick = null;
                    }
                    if (settingsBtn) {
                        settingsBtn.style.display = 'none';
                        settingsBtn.onclick = null;
                    }
                } else {
                    if (settingsBtn) {
                        settingsBtn.style.display = 'inline-flex';
                        settingsBtn.title = 'Projekt-Zustände & Kategorien anpassen';
                        settingsBtn.onclick = () => openProjectSettingsModal(activeProject.id);
                    }
                    if (editBtn) {
                        editBtn.style.display = 'inline-flex';
                        editBtn.title = 'Projekt bearbeiten';
                        editBtn.onclick = () => openProjectModal(activeProject.id, activeProject.name, !!activeProject.isStarred);
                    }
                }
                if (addBtn) {
                    const targetStatus = (window.activeProjectStatusTab === 'all' || !window.activeProjectStatusTab) ? 'in_progress' : window.activeProjectStatusTab;
                    addBtn.title = 'Neue Aufgabe erstellen';
                    addBtn.onclick = () => openTaskModalForProject(activeProject.isUnassigned ? null : activeProject.id, targetStatus);
                }
            }
        }


        window.updateProjectsHeader = updateProjectsHeader;

        window.activeProjectStatusTab = 'in_progress';

        window.switchProjectStatusTab = function(tab) {
            window.activeProjectStatusTab = tab || 'in_progress';
            document.querySelectorAll('.project-status-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.statusTab === window.activeProjectStatusTab);
            });
            document.querySelectorAll('.project-task-column').forEach(col => {
                col.classList.toggle('is-active-tab', col.dataset.statusCol === window.activeProjectStatusTab);
            });
            const addBtn = document.getElementById('header-project-add-btn');
            if (addBtn && window.activeProjectDetailId !== null && window.activeProjectDetailId !== undefined) {
                const pid = window.activeProjectDetailId === 'unassigned' ? null : window.activeProjectDetailId;
                const targetStatus = window.activeProjectStatusTab || 'in_progress';
                addBtn.onclick = () => openTaskModalForProject(pid, targetStatus);
            }
        };


        window.openProjectDetailPage = function(id) {
            window.activeProjectDetailId = id;
            const projects = (window.lastProjectsData && window.lastProjectsData.projects) || [];
            const proj = projects.find(p => String(p.id) === String(id));
            let catConfig = null;
            if (proj && proj.categories) {
                try {
                    catConfig = typeof proj.categories === 'string' ? JSON.parse(proj.categories) : proj.categories;
                } catch(e) {}
            }
            if (catConfig && Array.isArray(catConfig.items) && catConfig.items.length > 0) {
                window.activeProjectStatusTab = catConfig.defaultId || catConfig.items[0].id;
            } else {
                window.activeProjectStatusTab = 'all';
            }
            if (typeof focusWidget === 'function') {
                focusWidget('projects');
            }
            if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                window.AppRouter.updateUrl(`/projekte/${id}`);
            }
            loadTopWidgets();
        };

        // --- PROJEKT-ZUSTÄNDE / KATEGORIEN SETTINGS MODAL ---

        window.openProjectSettingsModal = function(projectId) {
            if (!projectId || projectId === 'unassigned') return;
            const projects = (window.lastProjectsData && window.lastProjectsData.projects) || [];
            const proj = projects.find(p => String(p.id) === String(projectId));
            if (!proj) return;

            const idInput = document.getElementById('project-settings-id-input');
            const titleEl = document.getElementById('project-settings-modal-title');
            if (idInput) idInput.value = proj.id;
            if (titleEl) titleEl.textContent = `Zustände für „${proj.name}“`;

            let catConfig = null;
            if (proj.categories) {
                try {
                    catConfig = typeof proj.categories === 'string' ? JSON.parse(proj.categories) : proj.categories;
                } catch(e) {}
            }

            renderProjectSettingsCategoryRows(catConfig);

            const modal = document.getElementById('project-settings-modal');
            if (modal) {
                modal.style.display = 'flex';
                document.body.classList.add('modal-active');
            }
        };

        window.closeProjectSettingsModal = function() {
            const modal = document.getElementById('project-settings-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };

        window.renderProjectSettingsCategoryRows = function(catConfig) {
            const listEl = document.getElementById('project-settings-categories-list');
            if (!listEl) return;
            listEl.innerHTML = '';

            const items = (catConfig && Array.isArray(catConfig.items)) ? catConfig.items : [];
            const defaultId = (catConfig && catConfig.defaultId) ? catConfig.defaultId : (items[0]?.id || null);

            if (items.length === 0) {
                listEl.innerHTML = `
                    <div id="project-settings-empty-hint" style="padding: 16px; text-align: center; font-size: 0.78rem; opacity: 0.6; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">
                        Standard: Dieses Projekt hat aktuell keine eigenen Kategorien/Zustände.<br>Alle Aufgaben werden als einfache Liste angezeigt.
                    </div>
                `;
                return;
            }

            items.forEach((cat, idx) => {
                const isDefault = (cat.id === defaultId) || (!defaultId && idx === 0);
                addProjectSettingCategoryRow(cat.id, cat.name, cat.icon, isDefault);
            });
        };

        window.addProjectSettingCategoryRow = function(id = '', name = '', icon = '📌', isDefault = false) {
            const listEl = document.getElementById('project-settings-categories-list');
            if (!listEl) return;

            const emptyHint = document.getElementById('project-settings-empty-hint');
            if (emptyHint) emptyHint.remove();

            const catId = id || `cat_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const row = document.createElement('div');
            row.className = 'project-setting-cat-row';
            row.setAttribute('data-cat-id', catId);
            row.style.cssText = 'display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 8px 10px; border-radius: 8px;';

            const checkedRadios = listEl.querySelectorAll('input[name="project-default-cat"]:checked');
            const shouldCheck = isDefault || checkedRadios.length === 0;

            row.innerHTML = `
                <input type="text" class="cat-icon-input" value="${escapeHtml(icon || '📌')}" placeholder="Icon" maxlength="4" style="width: 44px; text-align: center; font-size: 1.15rem; padding: 6px 4px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.25); color: white; outline: none;" title="Icon / Emoji für diesen Zustand">
                <input type="text" class="cat-name-input" value="${escapeHtml(name || '')}" placeholder="Zustandsname (z. B. Uneingepackt)" style="flex: 1; min-width: 0; padding: 7px 10px; font-size: 0.85rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.25); color: white; outline: none;">
                <label style="display: flex; align-items: center; gap: 4px; font-size: 0.72rem; cursor: pointer; color: var(--accent); white-space: nowrap; user-select: none;" title="Dieser Zustand wird beim Öffnen des Projekts standardmäßig angezeigt">
                    <input type="radio" name="project-default-cat" value="${catId}" ${shouldCheck ? 'checked' : ''} style="cursor: pointer; accent-color: var(--accent);">
                    <span>Start</span>
                </label>
                <button type="button" onclick="this.closest('.project-setting-cat-row').remove(); if(document.querySelectorAll('.project-setting-cat-row').length===0) window.renderProjectSettingsCategoryRows(null);" style="background: transparent; border: none; color: #f38ba8; cursor: pointer; font-size: 0.9rem; padding: 4px; opacity: 0.75; transition: opacity 0.2s;" title="Zustand entfernen">🗑️</button>
            `;

            listEl.appendChild(row);
        };

        window.setProjectSettingsDefaultTemplate = function() {
            const listEl = document.getElementById('project-settings-categories-list');
            if (!listEl) return;
            listEl.innerHTML = '';
            addProjectSettingCategoryRow('suggestion', 'Vorschläge', '💡', false);
            addProjectSettingCategoryRow('in_progress', 'In Arbeit', '⏳', true);
            addProjectSettingCategoryRow('done', 'Fertig', '✅', false);
        };

        window.clearProjectSettingsCategories = function() {
            renderProjectSettingsCategoryRows(null);
        };

        window.saveProjectSettingsCategories = async function() {
            const projectIdInput = document.getElementById('project-settings-id-input');
            const projectId = projectIdInput ? Number(projectIdInput.value) : null;
            if (!projectId) return;

            const listEl = document.getElementById('project-settings-categories-list');
            const rows = listEl ? listEl.querySelectorAll('.project-setting-cat-row') : [];

            let categoriesPayload = null;
            if (rows.length > 0) {
                const items = [];
                let defaultId = null;

                rows.forEach((row, index) => {
                    const id = row.getAttribute('data-cat-id') || `cat_${Date.now()}_${index}`;
                    const icon = row.querySelector('.cat-icon-input')?.value?.trim() || '📌';
                    const name = row.querySelector('.cat-name-input')?.value?.trim() || `Zustand ${index + 1}`;
                    const isDefault = row.querySelector('input[type="radio"]')?.checked;
                    if (isDefault) {
                        defaultId = id;
                    }
                    items.push({ id, name, icon });
                });

                if (items.length > 0) {
                    if (!defaultId) {
                        defaultId = items[0].id;
                    }
                    categoriesPayload = {
                        items,
                        defaultId
                    };
                }
            }

            try {
                const res = await fetch(getApiUrl(`/api/projects/${projectId}/categories`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ categories: categoriesPayload })
                });
                if (res.ok) {
                    closeProjectSettingsModal();
                    if (String(window.activeProjectDetailId) === String(projectId)) {
                        window.activeProjectStatusTab = categoriesPayload?.defaultId || categoriesPayload?.items[0]?.id || 'in_progress';
                    }
                    if (typeof loadTopWidgets === 'function') {
                        loadTopWidgets();
                    }
                } else {
                    alert("Fehler beim Speichern der Projekt-Zustände.");
                }
            } catch (e) {
                console.error("Fehler beim Speichern der Projekt-Kategorien:", e);
                alert("Verbindungsfehler beim Speichern.");
            }
        };



        window.closeProjectDetail = function() {
            window.activeProjectDetailId = null;
            updateProjectsHeader(null);
            if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                window.AppRouter.updateUrl('/projekte');
            }
            loadTopWidgets();
        };



        window.navigateToProjects = function() {
            window.activeProjectDetailId = null;
            updateProjectsHeader(null);
            if (typeof focusWidget === 'function') {
                focusWidget('projects');
            }
            if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                window.AppRouter.updateUrl('/projekte');
            }
            loadTopWidgets();
        };



        window.toggleProjectStar = async function(id, ev) {
            if (ev) {
                ev.stopPropagation();
                ev.preventDefault();
            }
            try {
                const res = await fetch(getApiUrl(`/api/projects/${id}/star`), { method: 'POST' });
                if (res.ok) {
                    loadTopWidgets();
                }
            } catch (e) {
                console.error('Fehler beim Markieren des Projekts:', e);
            }
        };


        window.toggleProjectPin = window.toggleProjectStar;



        window.toggleTaskStar = async function(id, ev) {
            if (ev) {
                ev.stopPropagation();
                ev.preventDefault();
            }
            try {
                const rawId = String(id).replace('task-', '');
                const res = await fetch(getApiUrl(`/api/tasks/${rawId}/star`), { method: 'POST' });
                if (res.ok) {
                    loadTopWidgets();
                }
            } catch (e) {
                console.error('Fehler beim Markieren der Aufgabe:', e);
            }
        };


        window.toggleTaskPin = window.toggleTaskStar;



        window.updateTaskStatus = async function(id, status, ev) {
            if (ev) {
                ev.stopPropagation();
                ev.preventDefault();
            }
            try {
                const rawId = String(id).replace('task-', '');
                const res = await fetch(getApiUrl(`/api/tasks/${rawId}/status`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                if (res.ok) {
                    loadTopWidgets();
                }
            } catch (e) {
                console.error('Fehler beim Ändern des Aufgabenstatus:', e);
            }
        };



        window.openTaskModalForProject = function(projectId, status = 'in_progress') {
            const targetStatus = (status === 'all' || !status) ? 'in_progress' : status;
            openTaskModal(null, '', '', '', '', 'none', projectId, targetStatus === 'suggestion', targetStatus, false);
        };



        function renderProjectsWidget(data, container) {
            const projects = data.projects || [];
            const unassignedTasks = data.unassignedTasks || [];
            const unassignedNotes = data.unassignedNotes || [];

            const activeId = window.activeProjectDetailId;
            let activeProject = null;

            if (activeId === 'unassigned') {
                activeProject = {
                    id: 'unassigned',
                    name: '📥 Allgemein / Inbox',
                    description: 'Aufgaben und Notizen ohne Projektzuordnung',
                    isStarred: false,
                    tasks: unassignedTasks,
                    notes: unassignedNotes,
                    isUnassigned: true
                };
            } else if (activeId !== null && activeId !== undefined) {
                activeProject = projects.find(p => String(p.id) === String(activeId));
            }

            // Sync Header with current project state (Breadcrumbs & Actions)
            updateProjectsHeader(activeProject);

            // --- 1. DEDICATED PROJECT DETAIL PAGE ---
            if (activeProject) {
                const p = activeProject;
                const escName = escapeHtml(p.name);
                const pTasks = p.tasks || [];
                const pNotes = p.notes || [];

                let catConfig = null;
                if (p.categories) {
                    try {
                        catConfig = typeof p.categories === 'string' ? JSON.parse(p.categories) : p.categories;
                    } catch(e) {}
                }
                let customCats = (catConfig && Array.isArray(catConfig.items) && catConfig.items.length > 0) ? catConfig.items : null;

                // For Inbox/Allgemein fallback to default 3 columns if not explicitly configured
                if (p.isUnassigned && !customCats) {
                    customCats = [
                        { id: 'suggestion', name: 'Vorschläge', icon: '💡' },
                        { id: 'in_progress', name: 'In Arbeit', icon: '⏳' },
                        { id: 'done', name: 'Fertig', icon: '✅' }
                    ];
                    catConfig = { items: customCats, defaultId: 'in_progress' };
                }

                let activeTab = window.activeProjectStatusTab;
                if (customCats) {
                    if (!activeTab || !customCats.some(c => c.id === activeTab)) {
                        activeTab = (catConfig && catConfig.defaultId) || customCats[0].id;
                        window.activeProjectStatusTab = activeTab;
                    }
                } else {
                    activeTab = 'all';
                    window.activeProjectStatusTab = 'all';
                }

                // Partition tasks by category
                const tasksByCat = {};
                if (customCats) {
                    customCats.forEach(c => { tasksByCat[c.id] = []; });
                    pTasks.forEach(t => {
                        const st = t.status;
                        if (st && tasksByCat[st]) {
                            tasksByCat[st].push(t);
                        } else if (tasksByCat['done'] && (t.completed || st === 'done')) {
                            tasksByCat['done'].push(t);
                        } else if (tasksByCat['suggestion'] && (t.isPlanned || st === 'suggestion')) {
                            tasksByCat['suggestion'].push(t);
                        } else if (tasksByCat['in_progress'] && (st === 'in_progress' || !st)) {
                            tasksByCat['in_progress'].push(t);
                        } else {
                            const fallbackCat = (catConfig && catConfig.defaultId) || customCats[0].id;
                            if (tasksByCat[fallbackCat]) {
                                tasksByCat[fallbackCat].push(t);
                            } else {
                                tasksByCat[customCats[0].id].push(t);
                            }
                        }
                    });
                }

                function renderColumnTask(t, currentCol) {
                    const rawId = String(t.id).replace('task-', '');
                    const escT = escapeHtml(t.title || 'Aufgabe');
                    const escN = escapeHtml(t.notes || '');
                    const isDone = currentCol === 'done' || t.status === 'done' || !!t.completed;
                    const checkedAttr = isDone ? 'checked' : '';
                    const textStyle = isDone ? 'text-decoration: line-through; opacity: 0.55;' : '';

                    const dueObj = t.due ? new Date(t.due) : null;
                    let dueBadge = '';
                    if (dueObj && !isNaN(dueObj.getTime())) {
                        const todayStr = getLocalDateString();
                        const dueStr = dueObj.toISOString().split('T')[0];
                        if (dueStr < todayStr) {
                            dueBadge = `<span style="font-size: 0.65rem; color: var(--off); font-weight: bold; background: rgba(243, 139, 168, 0.15); padding: 1px 5px; border-radius: 4px;">⚠️ Überfällig</span>`;
                        } else if (dueStr === todayStr) {
                            dueBadge = `<span style="font-size: 0.65rem; color: var(--accent); font-weight: bold; background: rgba(137, 180, 250, 0.15); padding: 1px 5px; border-radius: 4px;">📅 Heute</span>`;
                        } else {
                            dueBadge = `<span style="font-size: 0.65rem; opacity: 0.6;">📅 ${dueObj.toLocaleDateString('de-DE')}</span>`;
                        }
                    }

                    let catSelectHtml = '';
                    if (customCats && customCats.length > 1) {
                        const currentCatVal = t.status || currentCol || customCats[0].id;
                        catSelectHtml = `
                            <select class="task-category-select" onclick="event.stopPropagation()" onchange="updateTaskStatus('${rawId}', this.value, event)" title="Zustand ändern" style="font-size: 0.68rem; padding: 2px 4px; border-radius: 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.85); cursor: pointer; outline: none; max-width: 110px;">
                                ${customCats.map(c => `
                                    <option value="${escapeHtml(c.id)}" ${c.id === currentCatVal ? 'selected' : ''} style="background: #1e1e2e; color: #fff;">
                                        ${escapeHtml(c.icon || '📌')} ${escapeHtml(c.name)}
                                    </option>
                                `).join('')}
                            </select>
                        `;
                    }

                    const itemHtml = `
                        <div class="project-task-item">
                            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                                <div style="display: flex; align-items: flex-start; gap: 8px; min-width: 0; flex: 1;">
                                    <input type="checkbox" class="task-checkbox" data-task-id="${rawId}" data-tasklist-id="Standard" onchange="completeTask(this)" ${checkedAttr} style="margin-top: 2px;" onclick="event.stopPropagation()">
                                    <span style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word; font-size: 0.82rem; line-height: 1.35; flex: 1; cursor: pointer; ${textStyle}">
                                        ${escT}
                                    </span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                    ${catSelectHtml}
                                    ${t.isStarred ? `<span class="pinned-task-indicator" title="Angepinnt">📌</span>` : ''}
                                </div>
                            </div>
                            ${dueBadge ? `<div style="margin-left: 22px;">${dueBadge}</div>` : ''}
                        </div>
                    `;
                    const effectiveStatus = t.status || currentCol || 'in_progress';
                    const extraData = `data-task-id="${rawId}" data-task-title="${escT.replace(/"/g, '&quot;')}" data-task-notes="${escN.replace(/"/g, '&quot;')}" data-task-due="${t.due || ''}" data-task-list="Standard" data-task-recurrence="${t.recurrence || 'none'}" data-task-project="${p.id}" data-task-project-id="${p.isUnassigned ? '' : p.id}" data-task-status="${effectiveStatus}" data-task-completed="${isDone}" data-task-starred="${!!t.isStarred}" data-task-planned="${!!(t.isPlanned || t.status === 'suggestion')}"`;
                    return renderSwipeLinkWrapper(itemHtml, t.title, 'task', rawId, '', '', 'margin-bottom: 0;', extraData);
                }

                let html = `
                    <div class="project-detail-container">
                `;

                if (!p.isUnassigned) {
                    html += `
                        <div class="media-drag-overlay" id="project-drag-overlay">
                            <div class="media-drag-overlay-box">
                                <span class="media-drag-overlay-icon" style="display: inline-flex; justify-content: center; color: #89b4fa;">
                                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                </span>
                                <div class="media-drag-overlay-title">Dateien & Bilder in „${escName}“ ablegen</div>
                                <div class="media-drag-overlay-sub">Werden direkt hochgeladen und diesem Projekt zugewiesen</div>
                            </div>
                        </div>
                    `;
                }

                if (p.description) {
                    html += `<div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 4px;">${escapeHtml(p.description)}</div>`;
                }

                if (customCats) {
                    // Render Mobile Status Tabs
                    html += `
                        <div class="project-mobile-status-tabs" style="grid-template-columns: repeat(${customCats.length}, minmax(0, 1fr));">
                    `;
                    customCats.forEach(cat => {
                        const count = (tasksByCat[cat.id] || []).length;
                        const isActive = activeTab === cat.id;
                        const escCatName = escapeHtml(cat.name);
                        const catIcon = escapeHtml(cat.icon || '📌');
                        html += `
                            <button type="button" class="project-status-tab-btn tab-${escapeHtml(cat.id)} ${isActive ? 'active' : ''}" data-status-tab="${escapeHtml(cat.id)}" onclick="switchProjectStatusTab('${escapeHtml(cat.id)}')">
                                <span>${catIcon}</span>
                                <span>${escCatName}</span>
                                <span class="project-tag-badge in_progress" style="padding: 1px 6px;">${count}</span>
                            </button>
                        `;
                    });
                    html += `</div>`;

                    // Render Task Columns
                    html += `
                        <div class="project-task-columns" style="grid-template-columns: repeat(${customCats.length}, minmax(0, 1fr));">
                    `;
                    customCats.forEach(cat => {
                        const catTasks = tasksByCat[cat.id] || [];
                        const isActive = activeTab === cat.id;
                        const escCatName = escapeHtml(cat.name);
                        const catIcon = escapeHtml(cat.icon || '📌');
                        html += `
                            <div class="project-task-column ${isActive ? 'is-active-tab' : ''}" data-status-col="${escapeHtml(cat.id)}">
                                <div class="project-column-header col-${escapeHtml(cat.id)}">
                                    <div class="project-column-title">
                                        <span>${catIcon}</span>
                                        <span>${escCatName}</span>
                                        <span class="project-tag-badge in_progress" style="padding: 1px 6px;">${catTasks.length}</span>
                                    </div>
                                    <button type="button" class="task-action-btn" onclick="openTaskModalForProject(${p.isUnassigned ? 'null' : p.id}, '${escapeHtml(cat.id)}')" title="Aufgabe für „${escCatName}“ hinzufügen">➕</button>
                                </div>
                                <div class="project-column-body">
                                    ${catTasks.length === 0 ? `<div style="font-size: 0.75rem; opacity: 0.45; text-align: center; padding: 25px 0;">Keine Aufgaben in „${escCatName}“</div>` : catTasks.map(t => renderColumnTask(t, cat.id)).join('')}
                                </div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                } else {
                    // Flat view (Default when project has no categories)
                    html += `
                        <div class="project-task-columns" style="grid-template-columns: 1fr;">
                            <div class="project-task-column is-active-tab" data-status-col="all" style="min-height: 200px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); border-top-left-radius: 10px; border-top-right-radius: 10px;">
                                    <div style="font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 6px; color: #ffffff;">
                                        <span>📋</span>
                                        <span>Aufgaben</span>
                                        <span class="project-tag-badge in_progress" style="padding: 1px 7px;">${pTasks.length}</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        ${!p.isUnassigned ? `<button type="button" class="task-action-btn" onclick="openProjectSettingsModal(${p.id})" title="Zustände wie Vorschläge, In Arbeit etc. einrichten">⚙️ Zustände einrichten</button>` : ''}
                                        <button type="button" class="task-action-btn" onclick="openTaskModalForProject(${p.isUnassigned ? 'null' : p.id})" title="Neue Aufgabe hinzufügen">➕ Aufgabe</button>
                                    </div>
                                </div>
                                <div class="project-column-body">
                                    ${pTasks.length === 0 ? `
                                        <div style="font-size: 0.8rem; opacity: 0.5; text-align: center; padding: 40px 10px;">
                                            Keine Aufgaben in diesem Projekt.<br>
                                            <button type="button" class="arbeitstisch-quick-btn" style="margin-top: 14px;" onclick="openTaskModalForProject(${p.isUnassigned ? 'null' : p.id})">
                                                ➕ Erste Aufgabe erstellen
                                            </button>
                                        </div>
                                    ` : pTasks.map(t => renderColumnTask(t, null)).join('')}
                                </div>
                            </div>
                        </div>
                    `;
                }

                // Notes section if any
                if (pNotes.length > 0) {
                    html += `
                        <div style="margin-top: 10px;">
                            <div class="arbeitstisch-section-badge">📝 Notizen (${pNotes.length})</div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; margin-top: 6px;">
                    `;
                    pNotes.forEach(n => {
                        const escNTitle = escapeHtml(n.title);
                        const escNContent = escapeHtml(n.content);
                        const noteHtml = `
                            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 10px 12px; border-radius: 8px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px;">
                                <strong style="color: var(--accent); font-size: 0.8rem;">${escNTitle}</strong>
                                <div style="opacity: 0.8; white-space: pre-wrap; word-break: break-word; line-height: 1.35; font-size: 0.75rem;">${escNContent}</div>
                            </div>
                        `;
                        const extraNoteData = `data-note-id="${n.id}" data-note-title="${escNTitle.replace(/"/g, '&quot;')}" data-note-content="${escNContent.replace(/"/g, '&quot;')}" data-project-id="${p.id}"`;
                        html += renderSwipeLinkWrapper(noteHtml, n.title, 'note', n.id, '', '', '', extraNoteData);
                    });
                    html += `
                            </div>
                        </div>
                    `;
                }

                // Media & Dateien des Projekts
                if (!p.isUnassigned) {
                    html += `
                        <div id="project-media-container-${p.id}"></div>
                    `;
                    setTimeout(() => {
                        const mCont = document.getElementById(`project-media-container-${p.id}`);
                        if (mCont && typeof loadProjectMediaSection === 'function') {
                            loadProjectMediaSection(p.id, mCont);
                        }
                    }, 50);
                }

                html += `</div>`;
                container.innerHTML = html;
                return;
            }

            // --- 2. PROJECTS OVERVIEW GRID (WHEN NO PROJECT OPENED) ---
            let html = `
                <div style="text-align: left; padding: 0 0 15px 0;">
            `;

            if (projects.length === 0 && unassignedTasks.length === 0 && unassignedNotes.length === 0) {
                html += `<p style="font-size: 0.8rem; opacity: 0.6; text-align: center; margin: 20px 0;">Keine Projekte oder Aufgaben vorhanden. Erstelle dein erstes Projekt!</p>`;
            } else {
                html += `<div class="projects-overview-grid">`;

                // Render Projects
                projects.forEach(p => {
                    const escProjName = escapeHtml(p.name);
                    const pTasks = p.tasks || [];

                    let personsHtml = '';
                    if (p.persons && p.persons.length > 0) {
                        p.persons.forEach(person => {
                            personsHtml += `
                                <span class="clickable-tag" onclick="event.stopPropagation(); openPersonProfileModal(${person.id})" style="display: inline-flex; align-items: center; gap: 2px; font-size: 0.65rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.6); padding: 1px 5px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); cursor: pointer;">
                                    👤 ${escapeHtml(person.name)}
                                </span>
                            `;
                        });
                    }

                    let badgesHtml = '';
                    let pCatConfig = null;
                    if (p.categories) {
                        try {
                            pCatConfig = typeof p.categories === 'string' ? JSON.parse(p.categories) : p.categories;
                        } catch(e) {}
                    }
                    const pCustomCats = (pCatConfig && Array.isArray(pCatConfig.items) && pCatConfig.items.length > 0) ? pCatConfig.items : null;

                    if (pCustomCats) {
                        const tasksByCat = {};
                        pCustomCats.forEach(c => { tasksByCat[c.id] = 0; });
                        pTasks.forEach(t => {
                            if (t.status && tasksByCat[t.status] !== undefined) {
                                tasksByCat[t.status]++;
                            } else {
                                const fallback = pCatConfig.defaultId || pCustomCats[0].id;
                                if (tasksByCat[fallback] !== undefined) tasksByCat[fallback]++;
                                else tasksByCat[pCustomCats[0].id]++;
                            }
                        });
                        badgesHtml = pCustomCats.map(c => `
                            <span class="project-tag-badge in_progress">${escapeHtml(c.icon || '📌')} ${tasksByCat[c.id] || 0} ${escapeHtml(c.name)}</span>
                        `).join('');
                    } else {
                        const completedCount = pTasks.filter(t => t.completed || t.status === 'done').length;
                        badgesHtml = `
                            <span class="project-tag-badge in_progress">📋 ${pTasks.length} ${pTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}</span>
                            ${completedCount > 0 ? `<span class="project-tag-badge done">✅ ${completedCount} erledigt</span>` : ''}
                        `;
                    }

                    const cardInner = `
                        <div class="project-overview-header">
                            <div class="project-overview-title">
                                <span>📁</span>
                                <span>${escProjName}</span>
                            </div>
                            ${p.isStarred ? `<span class="pinned-task-indicator" title="Angepinnt" style="font-size: 1rem;">📌</span>` : ''}
                        </div>
                        ${personsHtml ? `<div style="display: flex; gap: 4px; flex-wrap: wrap;">${personsHtml}</div>` : ''}
                        ${p.description ? `<div style="font-size: 0.74rem; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.description)}</div>` : ''}
                        <div class="project-overview-badges">
                            ${badgesHtml}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--accent); display: flex; align-items: center; gap: 4px; font-weight: 600; margin-top: auto; padding-top: 4px;">
                            Aufgaben ansehen ➔
                        </div>
                    `;

                    const extraProjectData = `data-project-id="${p.id}" data-project-name="${escProjName.replace(/"/g, '&quot;')}" data-project-starred="${!!p.isStarred}"`;
                    html += `
                        <div class="project-overview-card" onclick="openProjectDetailPage(${p.id})">
                            ${renderSwipeLinkWrapper(cardInner, p.name, 'project', p.id, '', '', 'width: 100%; border-radius: 0; background: transparent;', extraProjectData)}
                        </div>
                    `;
                });

                // Render "Allgemein / Inbox"
                if (unassignedTasks.length > 0 || unassignedNotes.length > 0) {
                    const sugCount = unassignedTasks.filter(t => !t.completed && (t.status === 'suggestion' || t.isPlanned)).length;
                    const inProgCount = unassignedTasks.filter(t => !t.completed && t.status !== 'suggestion' && !t.isPlanned && t.status !== 'done').length;
                    const doneCount = unassignedTasks.filter(t => t.completed || t.status === 'done').length;

                    html += `
                        <div class="project-overview-card" onclick="openProjectDetailPage('unassigned')" style="border-style: dashed; border-color: rgba(255,255,255,0.15);">
                            <div class="project-overview-header">
                                <div class="project-overview-title" style="color: rgba(255,255,255,0.8);">
                                    <span>📥</span>
                                    <span>Allgemein / Inbox</span>
                                </div>
                            </div>
                            <div style="font-size: 0.74rem; color: rgba(255,255,255,0.5);">Aufgaben & Notizen ohne Projekt</div>
                            <div class="project-overview-badges">
                                <span class="project-tag-badge suggestion">💡 ${sugCount} Vorschläge</span>
                                <span class="project-tag-badge in_progress">⏳ ${inProgCount} in Arbeit</span>
                                <span class="project-tag-badge done">✅ ${doneCount} fertig</span>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--accent); display: flex; align-items: center; gap: 4px; font-weight: 600; margin-top: auto; padding-top: 4px;">
                                Aufgaben ansehen ➔
                            </div>
                        </div>
                    `;
                }

                html += `</div>`;
            }

            html += `</div>`;
            container.innerHTML = html;
        }
