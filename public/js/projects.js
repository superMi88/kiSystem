



window.isProjectArchiveActive = false;
window.projectArchiveFilter = 'all';
window.projectArchiveFilterOpen = false;
window.projectArchiveSortOrder = 'desc';
window.archivedTasksList = [];
window.projectArchiveSearchQuery = '';

function getProjectArchiveFilterLabel(filterVal) {
    if (filterVal === 'unassigned') return 'Offene Aufgaben';
    if (!filterVal || filterVal === 'all') return 'Alle Projekte';
    const projects = (window.lastProjectsData && window.lastProjectsData.projects) || [];
    const p = projects.find(item => String(item.id) === String(filterVal));
    return p ? (p.name || `Projekt #${filterVal}`) : `Projekt #${filterVal}`;
}
window.getProjectArchiveFilterLabel = getProjectArchiveFilterLabel;

function updateProjectsHeader(activeProject) {
    const titleContainer = document.getElementById('header-projects-title-container');
    const editBtn = document.getElementById('header-project-edit-btn');
    const settingsBtn = document.getElementById('header-project-settings-btn');
    const addBtn = document.getElementById('header-project-add-btn');
    const archiveBtn = document.getElementById('header-project-archive-btn');
    const filterBtn = document.getElementById('header-project-filter-btn');

    if (window.isProjectArchiveActive) {
        const filterVal = window.projectArchiveFilter || 'all';
        const label = getProjectArchiveFilterLabel(filterVal);
        const iconPrefix = filterVal === 'unassigned' ? '📋 ' : '📁 ';

        if (titleContainer) {
            titleContainer.innerHTML = `
                <span style="cursor: pointer; opacity: 0.8; transition: opacity 0.2s; white-space: nowrap;" onclick="closeProjectsArchive(true)" title="Zurück zu allen Projekten">📁 Projekte</span>
                <span style="opacity: 0.4; font-size: 0.85rem; margin: 0 2px;">&gt;</span>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; color: #ffffff;" title="${iconPrefix}${escapeHtml(label)}">${iconPrefix}${escapeHtml(label)}</span>
                <span class="project-tag-badge" style="background: rgba(137, 180, 250, 0.2); color: #89b4fa; border: 1px solid rgba(137, 180, 250, 0.4); font-size: 0.72rem; padding: 2px 7px; border-radius: 12px; margin-left: 4px; font-weight: 600; vertical-align: middle; display: inline-flex; align-items: center; gap: 3px;">📦 Archiv</span>
            `;
        }
        if (filterBtn) {
            filterBtn.style.display = 'inline-flex';
            filterBtn.title = 'Filter umschalten';
            if (window.projectArchiveFilterOpen) filterBtn.classList.add('active');
            else filterBtn.classList.remove('active');
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
            addBtn.style.display = 'none';
            addBtn.onclick = null;
        }
        if (archiveBtn) {
            archiveBtn.style.display = 'inline-flex';
            archiveBtn.title = 'Archivansicht aktiv (Klicken zum Verlassen)';
            archiveBtn.style.background = 'rgba(137, 180, 250, 0.25)';
            archiveBtn.style.borderColor = 'rgba(137, 180, 250, 0.5)';
            archiveBtn.onclick = () => closeProjectsArchive();
        }
        return;
    }

    if (filterBtn) {
        filterBtn.style.display = 'none';
        filterBtn.classList.remove('active');
    }

    if (archiveBtn) {
        archiveBtn.style.display = 'inline-flex';
        archiveBtn.style.background = '';
        archiveBtn.style.borderColor = '';
        archiveBtn.title = 'Aufgaben-Archiv';
        archiveBtn.onclick = () => {
            const curFilter = activeProject ? (activeProject.isUnassigned ? 'unassigned' : String(activeProject.id)) : 'all';
            openProjectsArchive(curFilter);
        };
    }

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
            addBtn.style.display = 'inline-flex';
            addBtn.title = 'Neues Projekt erstellen';
            addBtn.onclick = () => openProjectModal();
        }
    } else {
        const escName = activeProject.isUnassigned ? 'Offene Aufgaben' : escapeHtml(activeProject.name || 'Projekt');
        const iconPrefix = activeProject.isUnassigned ? '📋 ' : '';
        if (titleContainer) {
            titleContainer.innerHTML = `
                        <span style="cursor: pointer; opacity: 0.8; transition: opacity 0.2s; white-space: nowrap;" onclick="closeProjectDetail()" title="Zurück zu allen Projekten">📁 Projekte</span>
                        <span style="opacity: 0.4; font-size: 0.85rem; margin: 0 2px;">&gt;</span>
                        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; color: #ffffff;" title="${iconPrefix}${escName}">${iconPrefix}${escName}</span>
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
                settingsBtn.title = 'Projekt-Zustände anpassen';
                settingsBtn.onclick = () => openProjectSettingsModal(activeProject.id);
            }
            if (editBtn) {
                editBtn.style.display = 'inline-flex';
                editBtn.title = 'Projekt bearbeiten';
                editBtn.onclick = () => openProjectModal(activeProject.id, activeProject.name, !!activeProject.isStarred);
            }
        }
        if (addBtn) {
            addBtn.style.display = 'inline-flex';
            const targetStatus = (window.activeProjectStatusTab === 'all' || !window.activeProjectStatusTab) ? 'in_progress' : window.activeProjectStatusTab;
            addBtn.title = 'Neue Aufgabe erstellen';
            addBtn.onclick = () => openTaskModalForProject(activeProject.isUnassigned ? null : activeProject.id, targetStatus);
        }
    }
}


window.updateProjectsHeader = updateProjectsHeader;

function getProjectStateConfig(proj) {
    if (!proj) return null;
    if (Array.isArray(proj.states) && proj.states.length > 0) {
        const items = proj.states.map(s => ({
            id: String(s.id),
            dbId: s.id,
            name: s.name,
            icon: s.icon || '📌',
            isDefault: !!s.isDefault
        }));
        const defState = items.find(s => s.isDefault) || items[0];
        return {
            items,
            defaultId: String(defState.id)
        };
    }
    if (proj.categories) {
        try {
            const raw = typeof proj.categories === 'string' ? JSON.parse(proj.categories) : proj.categories;
            const rawItems = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
            if (rawItems.length > 0) {
                const items = rawItems.map((c, idx) => {
                    if (typeof c === 'string') {
                        return { id: c, name: c, icon: '📌', isDefault: idx === 0 };
                    }
                    const idStr = String(c.id !== undefined && c.id !== null ? c.id : c.name);
                    return {
                        id: idStr,
                        dbId: /^\d+$/.test(idStr) ? Number(idStr) : null,
                        name: c.name || idStr,
                        icon: c.icon || '📌',
                        isDefault: !!c.isDefault
                    };
                });
                const defId = (raw && raw.defaultId !== undefined && raw.defaultId !== null)
                    ? String(raw.defaultId)
                    : String((items.find(i => i.isDefault) || items[0]).id);
                return { items, defaultId: defId };
            }
        } catch (e) { }
    }
    return null;
}
window.getProjectStateConfig = getProjectStateConfig;

window.activeProjectStatusTab = 'in_progress';

window.switchProjectStatusTab = function (tab) {
    window.activeProjectStatusTab = String(tab || 'in_progress');
    document.querySelectorAll('.project-status-tab-btn').forEach(btn => {
        btn.classList.toggle('active', String(btn.dataset.statusTab) === String(window.activeProjectStatusTab));
    });
    document.querySelectorAll('.project-task-column').forEach(col => {
        col.classList.toggle('is-active-tab', String(col.dataset.statusCol) === String(window.activeProjectStatusTab));
    });
    const addBtn = document.getElementById('header-project-add-btn');
    if (addBtn && window.activeProjectDetailId !== null && window.activeProjectDetailId !== undefined) {
        const pid = window.activeProjectDetailId === 'unassigned' ? null : window.activeProjectDetailId;
        const targetStatus = window.activeProjectStatusTab || 'in_progress';
        addBtn.onclick = () => openTaskModalForProject(pid, targetStatus);
    }
};


window.openProjectDetailPage = async function (id) {
    window.isProjectArchiveActive = false;
    window.activeProjectDetailId = id;
    const projects = (window.lastProjectsData && window.lastProjectsData.projects) || [];
    const proj = projects.find(p => String(p.id) === String(id));
    const catConfig = getProjectStateConfig(proj);
    if (catConfig && Array.isArray(catConfig.items) && catConfig.items.length > 0) {
        window.activeProjectStatusTab = String(catConfig.defaultId || catConfig.items[0].id);
    } else {
        window.activeProjectStatusTab = 'all';
    }
    if (typeof focusWidget === 'function') {
        focusWidget('projects');
    }
    if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
        window.AppRouter.updateUrl(`/projekte/${id}`);
    }
    await loadTopWidgets();
};

// --- PROJEKT-ZUSTÄNDE / KATEGORIEN SETTINGS MODAL ---

window.openProjectSettingsModal = async function (projectId) {
    if (!projectId || projectId === 'unassigned') return;
    const projects = (window.lastProjectsData && window.lastProjectsData.projects) || [];
    let proj = projects.find(p => String(p.id) === String(projectId));

    try {
        const res = await fetch(getApiUrl(`/api/projects/${projectId}`));
        if (res.ok) {
            proj = await res.json();
        }
    } catch (e) {
        console.error("[Projects] Fehler beim Laden des Projekts:", e);
    }

    if (!proj) {
        const headerTitle = document.getElementById('project-detail-title');
        const projName = headerTitle ? headerTitle.textContent.trim() : 'Projekt';
        proj = { id: Number(projectId), name: projName, states: [], categories: null };
    }

    const idInput = document.getElementById('project-settings-id-input');
    const titleEl = document.getElementById('project-settings-modal-title');
    if (idInput) idInput.value = proj.id;
    if (titleEl) titleEl.textContent = `Zustände für „${proj.name}“`;

    const catConfig = getProjectStateConfig(proj);

    renderProjectSettingsCategoryRows(catConfig);

    const modal = document.getElementById('project-settings-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-active');
    }
};

window.closeProjectSettingsModal = function () {
    const modal = document.getElementById('project-settings-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-active');
};

window.renderProjectSettingsCategoryRows = function (catConfig) {
    const listEl = document.getElementById('project-settings-categories-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const items = (catConfig && Array.isArray(catConfig.items)) ? catConfig.items : [];
    const defaultId = (catConfig && catConfig.defaultId) ? String(catConfig.defaultId) : (items[0] ? String(items[0].id) : null);

    if (items.length === 0) {
        listEl.innerHTML = `
                    <div id="project-settings-empty-hint" style="padding: 16px; text-align: center; font-size: 0.78rem; opacity: 0.6; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">
                        Standard: Dieses Projekt hat aktuell keine eigenen Kategorien/Zustände.<br>Alle Aufgaben werden als einfache Liste angezeigt.
                    </div>
                `;
        return;
    }

    items.forEach((cat, idx) => {
        const isDefault = (String(cat.id) === String(defaultId)) || (!defaultId && idx === 0);
        addProjectSettingCategoryRow(String(cat.id), cat.name, cat.icon, isDefault);
    });
};

window.addProjectSettingCategoryRow = function (id = '', name = '', icon = '📌', isDefault = false) {
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

window.setProjectSettingsBewerbungTemplate = function () {
    const listEl = document.getElementById('project-settings-categories-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    addProjectSettingCategoryRow('inPlanung', 'In Planung', '📋', true);
    addProjectSettingCategoryRow('beworben', 'Beworben', '📨', false);
    addProjectSettingCategoryRow('angenommen', 'Angenommen', '🎉', false);
    addProjectSettingCategoryRow('abgelehnt', 'Abgelehnt', '❌', false);
};

window.setProjectSettingsDefaultTemplate = function () {
    const listEl = document.getElementById('project-settings-categories-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    addProjectSettingCategoryRow('suggestion', 'Vorschläge', '💡', false);
    addProjectSettingCategoryRow('in_progress', 'In Arbeit', '⏳', true);
    addProjectSettingCategoryRow('done', 'Fertig', '✅', false);
};

window.clearProjectSettingsCategories = function () {
    renderProjectSettingsCategoryRows(null);
};

window.saveProjectSettingsCategories = async function () {
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
            const dbIdAttr = row.getAttribute('data-cat-db-id');
            const dbId = dbIdAttr && /^\d+$/.test(dbIdAttr) ? Number(dbIdAttr) : (/^\d+$/.test(String(id)) ? Number(id) : null);
            const icon = row.querySelector('.cat-icon-input')?.value?.trim() || '📌';
            const name = row.querySelector('.cat-name-input')?.value?.trim() || `Zustand ${index + 1}`;
            const isDefault = !!row.querySelector('input[type="radio"]')?.checked;
            if (isDefault) {
                defaultId = id;
            }
            items.push({ id: dbId || id, name, icon, isDefault });
        });

        if (items.length > 0) {
            if (!defaultId) {
                defaultId = String(items[0].id);
                items[0].isDefault = true;
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
            const resData = await res.json().catch(() => ({}));
            closeProjectSettingsModal();
            if (String(window.activeProjectDetailId) === String(projectId)) {
                if (resData && Array.isArray(resData.states) && resData.states.length > 0) {
                    const defState = resData.states.find(s => s.isDefault) || resData.states[0];
                    window.activeProjectStatusTab = String(defState.id);
                } else {
                    window.activeProjectStatusTab = 'all';
                }
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



window.closeProjectDetail = async function () {
    window.isProjectArchiveActive = false;
    window.activeProjectDetailId = null;
    updateProjectsHeader(null);
    if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
        window.AppRouter.updateUrl('/projekte');
    }
    await loadTopWidgets();
};



window.navigateToProjects = function () {
    window.isProjectArchiveActive = false;
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



window.toggleProjectStar = async function (id, ev) {
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



window.toggleTaskStar = async function (id, ev) {
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



window.updateTaskStatus = async function (id, status, ev) {
    if (ev) {
        ev.stopPropagation();
        ev.preventDefault();
    }
    try {
        const rawId = String(id).replace('task-', '');
        const statusStr = String(status);
        const isNumericState = /^\d+$/.test(statusStr);
        const res = await fetch(getApiUrl(`/api/tasks/${rawId}/status`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: statusStr,
                stateId: isNumericState ? Number(statusStr) : undefined
            })
        });
        if (res.ok) {
            loadTopWidgets();
        }
    } catch (e) {
        console.error('Fehler beim Ändern des Aufgabenstatus:', e);
    }
};



window.onTaskStateSelectChange = async function (taskId, status, ev) {
    if (ev) {
        ev.stopPropagation();
        ev.preventDefault();
    }
    const val = String(status || '').trim();
    if (val === 'archive' || val === 'archiv') {
        if (confirm("Möchtest du diese Aufgabe ins Archiv verschieben?")) {
            await callTool('loesche_aufgabe', { taskId: String(taskId) });
            if (typeof loadTopWidgets === 'function') loadTopWidgets();
        } else {
            if (typeof loadTopWidgets === 'function') loadTopWidgets();
        }
        return;
    }
    await updateTaskStatus(taskId, val, ev);
};

window.archiveSingleTask = async function (taskId, ev) {
    if (ev) {
        ev.stopPropagation();
        ev.preventDefault();
    }
    if (confirm("Möchtest du diese Aufgabe ins Archiv verschieben?")) {
        await callTool('loesche_aufgabe', { taskId: String(taskId) });
        if (typeof loadTopWidgets === 'function') loadTopWidgets();
    }
};

window.openTaskModalForProject = function (projectId, status = 'in_progress') {
    const statusStr = String(status || 'in_progress');
    let targetStatus = (statusStr === 'all' || !statusStr) ? 'in_progress' : statusStr;
    if (targetStatus === 'unerledigt') targetStatus = 'in_progress';
    if (targetStatus === 'erledigt') targetStatus = 'done';
    openTaskModal(null, '', '', '', '', 'none', projectId, targetStatus === 'suggestion', targetStatus, false);
};



function renderProjectsWidget(data, container) {
    window.lastProjectsData = data;
    window.lastProjectsContainer = container;

    if (window.isProjectArchiveActive) {
        if (!window.archivedTasksList || window.archivedTasksList.length === 0) {
            refreshProjectsArchive();
        } else {
            renderProjectsArchiveFullPage(data, container);
        }
        return;
    }

    const projects = data.projects || [];
    const unassignedTasks = data.unassignedTasks || [];
    const unassignedNotes = data.unassignedNotes || [];

    const activeId = window.activeProjectDetailId;
    let activeProject = null;

    if (activeId === 'unassigned') {
        activeProject = {
            id: 'unassigned',
            name: 'Offene Aufgaben',
            description: 'Aufgaben ohne Projektzuordnung',
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

        let catConfig = getProjectStateConfig(p);
        let customCats = (catConfig && Array.isArray(catConfig.items) && catConfig.items.length > 0) ? catConfig.items : null;

        // Für "Offene Aufgaben": Genau zwei Zustände – unerledigt und erledigt
        if (p.isUnassigned) {
            customCats = [
                { id: 'unerledigt', name: 'Unerledigt', icon: '⏳' },
                { id: 'erledigt', name: 'Erledigt', icon: '✅' }
            ];
            catConfig = { items: customCats, defaultId: 'unerledigt' };
        }

        let activeTab = String(window.activeProjectStatusTab || '');
        if (customCats) {
            if (!activeTab || !customCats.some(c => String(c.id) === activeTab)) {
                activeTab = String((catConfig && catConfig.defaultId) || customCats[0].id);
                window.activeProjectStatusTab = activeTab;
            }
        } else {
            activeTab = 'all';
            window.activeProjectStatusTab = 'all';
        }

        // Partition tasks by ProjectState ID (stateId) first, then legacy status / listTitle
        const tasksByCat = {};
        if (customCats) {
            customCats.forEach(c => { tasksByCat[String(c.id)] = []; });
            if (p.isUnassigned) {
                pTasks.forEach(t => {
                    const isDone = !!t.completed || t.status === 'done';
                    if (isDone) {
                        tasksByCat['erledigt'].push(t);
                    } else {
                        tasksByCat['unerledigt'].push(t);
                    }
                });
            } else {
                pTasks.forEach(t => {
                    const stateIdStr = t.stateId !== undefined && t.stateId !== null ? String(t.stateId) : null;
                    const st = t.status !== undefined && t.status !== null ? String(t.status) : null;
                    if (stateIdStr && tasksByCat[stateIdStr]) {
                        tasksByCat[stateIdStr].push(t);
                    } else if (st && tasksByCat[st]) {
                        tasksByCat[st].push(t);
                    } else if (tasksByCat['done'] && (t.completed || st === 'done')) {
                        tasksByCat['done'].push(t);
                    } else if (tasksByCat['suggestion'] && (t.isPlanned || st === 'suggestion')) {
                        tasksByCat['suggestion'].push(t);
                    } else if (tasksByCat['in_progress'] && (st === 'in_progress' || !st)) {
                        tasksByCat['in_progress'].push(t);
                    } else {
                        // Check if state name matches listTitle or status
                        const matchedByName = customCats.find(c =>
                            (t.listTitle && c.name.toLowerCase() === String(t.listTitle).toLowerCase()) ||
                            (st && c.name.toLowerCase() === st.toLowerCase())
                        );
                        if (matchedByName && tasksByCat[String(matchedByName.id)]) {
                            tasksByCat[String(matchedByName.id)].push(t);
                        } else {
                            const fallbackCat = String((catConfig && catConfig.defaultId) || customCats[0].id);
                            if (tasksByCat[fallbackCat]) {
                                tasksByCat[fallbackCat].push(t);
                            } else {
                                tasksByCat[String(customCats[0].id)].push(t);
                            }
                        }
                    }
                });
            }
        }

        const hasMultipleStates = !p.isUnassigned && customCats && customCats.length > 1;

        function renderColumnTask(t, currentCol) {
            const rawId = String(t.id).replace('task-', '');
            const escT = escapeHtml(t.title || 'Aufgabe');
            const escN = escapeHtml(t.notes || '');
            const isDone = currentCol === 'erledigt' || currentCol === 'done' || t.status === 'done' || !!t.completed;
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

            let checkboxHtml = '';
            let catSelectHtml = '';

            if (hasMultipleStates) {
                // Aufgaben mit mehreren Zuständen: KEINE Checkbox, sondern Dropdown-Menü
                checkboxHtml = '';
                const currentCatVal = String((t.stateId !== undefined && t.stateId !== null ? t.stateId : null) || currentCol || t.status || customCats[0].id);
                catSelectHtml = `
                    <select class="task-category-select" onclick="event.stopPropagation()" onchange="onTaskStateSelectChange('${rawId}', this.value, event)" title="Zustand ändern" style="font-size: 0.72rem; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.18); color: rgba(255,255,255,0.92); cursor: pointer; outline: none; max-width: 140px;">
                        ${customCats.map(c => `
                            <option value="${escapeHtml(String(c.id))}" ${String(c.id) === currentCatVal ? 'selected' : ''} style="background: #1e1e2e; color: #fff;">
                                ${escapeHtml(c.icon || '📌')} ${escapeHtml(c.name)}
                            </option>
                        `).join('')}
                        <option value="archive" style="background: #1e1e2e; color: #fab387;">📦 Ins Archiv</option>
                    </select>
                `;
            } else {
                // Offene Aufgaben oder Projekt ohne mehrere Zustände: Checkbox vorhanden, kein Dropdown
                checkboxHtml = `
                    <input type="checkbox" class="task-checkbox" data-task-id="${rawId}" data-tasklist-id="Standard" onchange="completeTask(this)" ${checkedAttr} style="margin-top: 2px;" onclick="event.stopPropagation()">
                `;
            }

            const archiveBtnHtml = `
                <button type="button" class="task-archive-quick-btn" onclick="archiveSingleTask('${rawId}', event)" title="Ins Archiv verschieben" style="background: transparent; border: none; color: rgba(255,255,255,0.38); cursor: pointer; padding: 2px 4px; font-size: 0.85rem; border-radius: 4px; transition: color 0.2s;" onmouseover="this.style.color='#fab387'" onmouseout="this.style.color='rgba(255,255,255,0.38)'">
                    📦
                </button>
            `;

            let taskMetaChipsHtml = '';
            if (t.locationObj) {
                const locId = t.locationObj.id;
                const locName = t.locationObj.name || t.locationObj.formattedAddress;
                taskMetaChipsHtml += `<span class="meta-chip location" onclick="event.stopPropagation(); handleEntityClick(event, 'location', ${locId});" title="Ort: ${escapeHtml(locName)}">📍 ${escapeHtml(locName)}</span>`;
            }
            if (t.persons && t.persons.length > 0) {
                t.persons.forEach(p => {
                    taskMetaChipsHtml += `<span class="meta-chip person" onclick="event.stopPropagation(); openPersonProfileModal(${p.id});" title="Person: ${escapeHtml(p.name)}">👤 ${escapeHtml(p.name)}</span>`;
                });
            }
            if (t.media && t.media.length > 0) {
                t.media.forEach(m => {
                    const isImg = m.category === 'image' || (m.mimeType && m.mimeType.startsWith('image/')) || /\.(jpe?g|png|gif|webp|svg)$/i.test(m.fileName || '');
                    taskMetaChipsHtml += `<span class="meta-chip media" onclick="event.stopPropagation(); handleEntityClick(event, 'media', ${m.id});" title="Datei: ${escapeHtml(m.title || m.fileName)}">${isImg ? '🖼️' : '📄'} ${escapeHtml(m.title || m.fileName)}</span>`;
                });
            }

            const itemHtml = `
                <div class="project-task-item">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                        <div style="display: flex; align-items: flex-start; gap: 8px; min-width: 0; flex: 1;">
                            ${checkboxHtml}
                            <span style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word; font-size: 0.82rem; line-height: 1.35; flex: 1; cursor: pointer; ${textStyle}">
                                ${escT}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                            ${catSelectHtml}
                            ${t.isStarred ? `<span class="pinned-task-indicator" title="Angepinnt">📌</span>` : ''}
                            ${archiveBtnHtml}
                        </div>
                    </div>
                    ${(dueBadge || taskMetaChipsHtml) ? `<div style="margin-left: ${hasMultipleStates ? '4px' : '22px'}; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 4px;">${dueBadge || ''}${taskMetaChipsHtml}</div>` : ''}
                </div>
            `;
            const effectiveStatus = String((t.stateId !== undefined && t.stateId !== null ? t.stateId : null) || currentCol || t.status || 'in_progress');
            const extraData = `data-task-id="${rawId}" data-task-title="${escT.replace(/"/g, '&quot;')}" data-task-notes="${escN.replace(/"/g, '&quot;')}" data-task-due="${t.due || ''}" data-task-list="Standard" data-task-recurrence="${t.recurrence || 'none'}" data-task-project="${p.id}" data-task-project-id="${p.isUnassigned ? '' : p.id}" data-task-state-id="${t.stateId || ''}" data-task-status="${effectiveStatus}" data-task-completed="${isDone}" data-task-starred="${!!t.isStarred}" data-task-planned="${!!(t.isPlanned || t.status === 'suggestion')}" data-task-location-id="${t.locationId || (t.locationObj ? t.locationObj.id : '')}" data-task-location-obj="${escapeHtml(JSON.stringify(t.locationObj || null))}" data-task-persons="${escapeHtml(JSON.stringify(t.persons || []))}" data-task-media="${escapeHtml(JSON.stringify(t.media || []))}"`;
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
                const catIdStr = String(cat.id);
                const count = (tasksByCat[catIdStr] || []).length;
                const isActive = activeTab === catIdStr;
                const escCatName = escapeHtml(cat.name);
                const catIcon = escapeHtml(cat.icon || '📌');
                html += `
                            <button type="button" class="project-status-tab-btn tab-${escapeHtml(catIdStr)} ${isActive ? 'active' : ''}" data-status-tab="${escapeHtml(catIdStr)}" onclick="switchProjectStatusTab('${escapeHtml(catIdStr)}')">
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
                const catIdStr = String(cat.id);
                const catTasks = tasksByCat[catIdStr] || [];
                const isActive = activeTab === catIdStr;
                const escCatName = escapeHtml(cat.name);
                const catIcon = escapeHtml(cat.icon || '📌');
                html += `
                            <div class="project-task-column ${isActive ? 'is-active-tab' : ''}" data-status-col="${escapeHtml(catIdStr)}">
                                <div class="project-column-header col-${escapeHtml(catIdStr)}">
                                    <div class="project-column-title">
                                        <span>${catIcon}</span>
                                        <span>${escCatName}</span>
                                        <span class="project-tag-badge in_progress" style="padding: 1px 6px;">${catTasks.length}</span>
                                    </div>
                                    <button type="button" class="task-action-btn" onclick="openTaskModalForProject(${p.isUnassigned ? 'null' : p.id}, '${escapeHtml(catIdStr)}')" title="Aufgabe für „${escCatName}“ hinzufügen">➕</button>
                                </div>
                                <div class="project-column-body">
                                    ${catTasks.length === 0 ? `<div style="font-size: 0.75rem; opacity: 0.45; text-align: center; padding: 25px 0;">Keine Aufgaben in „${escCatName}“</div>` : catTasks.map(t => renderColumnTask(t, catIdStr)).join('')}
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
            const pCatConfig = getProjectStateConfig(p);
            const pCustomCats = (pCatConfig && Array.isArray(pCatConfig.items) && pCatConfig.items.length > 0) ? pCatConfig.items : null;

            if (pCustomCats) {
                const tasksByCat = {};
                pCustomCats.forEach(c => { tasksByCat[String(c.id)] = 0; });
                pTasks.forEach(t => {
                    const stId = t.stateId !== undefined && t.stateId !== null ? String(t.stateId) : null;
                    const st = t.status !== undefined && t.status !== null ? String(t.status) : null;
                    if (stId && tasksByCat[stId] !== undefined) {
                        tasksByCat[stId]++;
                    } else if (st && tasksByCat[st] !== undefined) {
                        tasksByCat[st]++;
                    } else {
                        const fallback = String(pCatConfig.defaultId || pCustomCats[0].id);
                        if (tasksByCat[fallback] !== undefined) tasksByCat[fallback]++;
                        else tasksByCat[String(pCustomCats[0].id)]++;
                    }
                });
                badgesHtml = pCustomCats.map(c => `
                            <span class="project-tag-badge in_progress">${escapeHtml(c.icon || '📌')} ${tasksByCat[String(c.id)] || 0} ${escapeHtml(c.name)}</span>
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

        // Render "Offene Aufgaben"
        const uncompletedCount = unassignedTasks.filter(t => !t.completed && t.status !== 'done').length;
        const doneCount = unassignedTasks.filter(t => t.completed || t.status === 'done').length;

        html += `
                    <div class="project-overview-card" onclick="openProjectDetailPage('unassigned')" style="border-style: dashed; border-color: rgba(255,255,255,0.22);">
                        <div class="project-overview-header">
                            <div class="project-overview-title" style="color: rgba(255,255,255,0.95); font-weight: 700;">
                                <span>📋</span>
                                <span>Offene Aufgaben</span>
                            </div>
                        </div>
                        <div style="font-size: 0.74rem; color: rgba(255,255,255,0.5);">Aufgaben ohne Projektzuordnung</div>
                        <div class="project-overview-badges">
                            <span class="project-tag-badge in_progress">⏳ ${uncompletedCount} unerledigt</span>
                            <span class="project-tag-badge done">✅ ${doneCount} erledigt</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--accent); display: flex; align-items: center; gap: 4px; font-weight: 600; margin-top: auto; padding-top: 4px;">
                            Aufgaben ansehen ➔
                        </div>
                    </div>
                `;

        html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

// --- DEDICATED FULL-PAGE PROJECTS ARCHIVE ---

window.openProjectsArchive = async function (filter) {
    window.isProjectArchiveActive = true;
    if (filter !== undefined && filter !== null) {
        window.projectArchiveFilter = String(filter);
    } else if (window.activeProjectDetailId) {
        window.projectArchiveFilter = String(window.activeProjectDetailId);
    } else {
        window.projectArchiveFilter = 'all';
    }

    if (typeof focusWidget === 'function') {
        focusWidget('projects');
    }
    if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
        window.AppRouter.updateUrl('/projekte/archiv');
    }

    updateProjectsHeader(null);
    await refreshProjectsArchive();
};

window.closeProjectsArchive = async function (forceOverview = false) {
    window.isProjectArchiveActive = false;
    window.projectArchiveFilterOpen = false;
    const addBtn = document.getElementById('header-project-add-btn');
    if (addBtn) addBtn.style.display = 'inline-flex';
    const returnTarget = (!forceOverview && window.projectArchiveFilter && window.projectArchiveFilter !== 'all')
        ? window.projectArchiveFilter
        : (window.activeProjectDetailId || null);

    if (returnTarget) {
        await openProjectDetailPage(returnTarget);
    } else {
        window.activeProjectDetailId = null;
        updateProjectsHeader(null);
        if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
            window.AppRouter.updateUrl('/projekte');
        }
        await loadTopWidgets();
    }
};

window.toggleProjectsArchiveFilter = function () {
    window.projectArchiveFilterOpen = !window.projectArchiveFilterOpen;
    const filterBtn = document.getElementById('header-project-filter-btn');
    if (filterBtn) {
        if (window.projectArchiveFilterOpen) filterBtn.classList.add('active');
        else filterBtn.classList.remove('active');
    }
    const filterBar = document.getElementById('project-archive-filter-bar');
    if (filterBar) {
        filterBar.style.display = window.projectArchiveFilterOpen ? 'flex' : 'none';
    }
};

window.changeProjectArchiveFilter = function (newFilter) {
    window.projectArchiveFilter = String(newFilter || 'all');
    updateProjectsHeader(null);
    renderProjectsArchiveFullPage(window.lastProjectsData, window.lastProjectsContainer);
};

window.resetProjectArchiveFilter = function () {
    window.projectArchiveFilter = 'all';
    window.projectArchiveSearchQuery = '';
    updateProjectsHeader(null);
    renderProjectsArchiveFullPage(window.lastProjectsData, window.lastProjectsContainer);
};

window.changeProjectArchiveSort = function (order) {
    window.projectArchiveSortOrder = order || 'desc';
    renderProjectsArchiveTasksList();
};

window.handleProjectArchiveSearch = function (val) {
    window.projectArchiveSearchQuery = String(val || '');
    renderProjectsArchiveTasksList();
};

window.refreshProjectsArchive = async function () {
    const initialContainer = document.getElementById('widget-projects') || window.lastProjectsContainer;
    if (initialContainer && (!window.archivedTasksList || window.archivedTasksList.length === 0)) {
        initialContainer.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: rgba(255,255,255,0.7); font-size: 0.85rem;">
                <div style="margin-bottom: 10px; font-size: 1.6rem;">📦</div>
                Lade archivierte Aufgaben...
            </div>
        `;
    }

    try {
        const res = await callTool('hole_aufgaben', { zeigeGeloeschte: true });
        window.archivedTasksList = (res && Array.isArray(res.tasks)) ? res.tasks : [];
    } catch (e) {
        console.error("Fehler beim Laden des Aufgaben-Archivs:", e);
        window.archivedTasksList = [];
    }

    const currentContainer = document.getElementById('widget-projects') || window.lastProjectsContainer;
    if (currentContainer) {
        renderProjectsArchiveFullPage(window.lastProjectsData, currentContainer);
    }
};

window.renderProjectsArchiveFullPage = function (data, container) {
    if (!container) container = document.getElementById('widget-projects') || window.lastProjectsContainer;
    if (!container) return;

    window.lastProjectsContainer = container;
    updateProjectsHeader(null);

    const projects = (data && data.projects) || (window.lastProjectsData && window.lastProjectsData.projects) || [];
    const currentFilter = window.projectArchiveFilter || 'all';
    const allTasks = window.archivedTasksList || [];
    const allCount = allTasks.length;
    const unassignedCount = allTasks.filter(t => !t.projectId).length;
    const isFilterOpen = Boolean(window.projectArchiveFilterOpen);
    const hasActiveFilter = Boolean((currentFilter && currentFilter !== 'all') || window.projectArchiveSearchQuery);

    let pillsHtml = `
        <button type="button" onclick="changeProjectArchiveFilter('all')" class="locations-filter-pill ${currentFilter === 'all' ? 'active' : ''}">
            <span>✨ Alle</span>
            <span class="locations-filter-count">${allCount}</span>
        </button>
        <button type="button" onclick="changeProjectArchiveFilter('unassigned')" class="locations-filter-pill ${currentFilter === 'unassigned' ? 'active' : ''}">
            <span>📋 Offene Aufgaben</span>
            <span class="locations-filter-count">${unassignedCount}</span>
        </button>
    `;
    projects.forEach(p => {
        const count = allTasks.filter(t => String(t.projectId) === String(p.id)).length;
        pillsHtml += `
            <button type="button" onclick="changeProjectArchiveFilter('${p.id}')" class="locations-filter-pill ${String(currentFilter) === String(p.id) ? 'active' : ''}">
                <span>📁 ${escapeHtml(p.name)}</span>
                <span class="locations-filter-count">${count}</span>
            </button>
        `;
    });

    let html = `
        <div class="projects-archive-fullpage" style="padding: 4px 0 20px 0; text-align: left; display: flex; flex-direction: column; gap: 12px;">
            <!-- Filter Bar (toggled by header filter button) -->
            <div class="locations-filter-bar" id="project-archive-filter-bar" style="display: ${isFilterOpen ? 'flex' : 'none'}; flex-direction: column; gap: 10px; margin-bottom: 2px; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); padding: 10px 12px; border-radius: 12px; width: 100%;">
                <!-- Pills Row -->
                <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; width: 100%; scrollbar-width: none;">
                    ${pillsHtml}
                </div>
                <!-- Controls Row: Search, Sort, Reset -->
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; width: 100%;">
                    <div style="display: flex; align-items: center; position: relative; flex: 1; min-width: 170px;">
                        <input type="text" id="project-archive-search-input" value="${escapeHtml(window.projectArchiveSearchQuery || '')}" placeholder="Archiv durchsuchen..." oninput="handleProjectArchiveSearch(this.value)" class="media-filter-select" style="width: 100%; height: 32px; padding: 4px 10px 4px 28px; font-size: 0.8rem; border-radius: 8px; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.12); outline: none;">
                        <span style="position: absolute; left: 9px; font-size: 0.75rem; opacity: 0.5; pointer-events: none;">🔍</span>
                    </div>
                    <select class="media-filter-select" onchange="changeProjectArchiveSort(this.value)" style="height: 32px; font-size: 0.78rem;" title="Sortierreihenfolge">
                        <option value="desc" ${window.projectArchiveSortOrder === 'desc' ? 'selected' : ''}>⬇️ Neueste oben</option>
                        <option value="asc" ${window.projectArchiveSortOrder === 'asc' ? 'selected' : ''}>⬆️ Älteste oben</option>
                    </select>
                    ${hasActiveFilter ? `
                        <button type="button" class="media-filter-reset-btn" onclick="resetProjectArchiveFilter()" title="Filter zurücksetzen" style="height: 32px; padding: 0 10px; font-size: 0.75rem; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: var(--accent); cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
                            ✕ Filter zurücksetzen
                        </button>
                    ` : ''}
                </div>
            </div>

            <!-- Dynamic Tasks Container -->
            <div id="project-archive-tasks-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>
    `;

    container.innerHTML = html;
    renderProjectsArchiveTasksList();
};

window.renderProjectsArchiveTasksList = function () {
    const listContainer = document.getElementById('project-archive-tasks-container');
    if (!listContainer) return;

    const allTasks = window.archivedTasksList || [];
    const filter = window.projectArchiveFilter || 'all';
    const query = (window.projectArchiveSearchQuery || '').trim().toLowerCase();

    // 1. Filter by Project
    let filtered = allTasks.filter(t => {
        if (filter === 'unassigned') {
            return !t.projectId;
        }
        if (filter !== 'all') {
            return String(t.projectId) === String(filter);
        }
        return true;
    });

    // 2. Filter by Search Query
    if (query) {
        filtered = filtered.filter(t => {
            const titelMatch = t.titel && t.titel.toLowerCase().includes(query);
            const notizenMatch = t.notizen && t.notizen.toLowerCase().includes(query);
            const projMatch = t.projektName && t.projektName.toLowerCase().includes(query);
            const zustandMatch = t.zustandName && t.zustandName.toLowerCase().includes(query);
            return titelMatch || notizenMatch || projMatch || zustandMatch;
        });
    }

    // 3. Sort: newest (oben) to oldest (unten) or vice versa
    filtered.sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return window.projectArchiveSortOrder === 'asc' ? (timeA - timeB) : (timeB - timeA);
    });

    if (filtered.length === 0) {
        const filterName = getProjectArchiveFilterLabel(filter);
        listContainer.innerHTML = `
            <div style="padding: 35px 20px; text-align: center; color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 10px; font-size: 0.85rem; margin-top: 6px;">
                <div style="font-size: 1.6rem; margin-bottom: 8px;">📦</div>
                ${query ? 'Keine archivierten Aufgaben für diese Suche gefunden.' : `Keine archivierten Aufgaben in „${escapeHtml(filterName)}“ vorhanden.`}
            </div>
        `;
        return;
    }

    let itemsHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; font-size: 0.75rem; color: rgba(255,255,255,0.5);">
            <span>${filtered.length} ${filtered.length === 1 ? 'archivierte Aufgabe' : 'archivierte Aufgaben'}</span>
            <span style="font-size: 0.7rem; opacity: 0.8;">Sortierung: Neueste oben</span>
        </div>
    `;

    filtered.forEach(t => {
        const dateObj = t.updatedAt ? new Date(t.updatedAt) : (t.createdAt ? new Date(t.createdAt) : null);
        const dateFormatted = dateObj ? dateObj.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const projLabel = t.projektName ? `📁 ${escapeHtml(t.projektName)}` : '📋 Offene Aufgaben';
        const stateLabel = t.zustandName ? `📌 ${escapeHtml(t.zustandName)}` : '';
        const dueText = t.faellig ? `📅 Fällig: ${new Date(t.faellig).toLocaleDateString('de-DE')}` : '';

        itemsHtml += `
            <div class="archive-task-card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; gap: 12px; transition: background 0.2s;">
                <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.88rem; font-weight: 600; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.titel || 'Aufgabe')}</span>
                    </div>
                    ${t.notizen ? `<div style="font-size: 0.74rem; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 480px;">${escapeHtml(t.notizen)}</div>` : ''}
                    <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
                        <span style="color: var(--accent); background: rgba(137, 180, 250, 0.12); padding: 1px 6px; border-radius: 6px; border: 1px solid rgba(137, 180, 250, 0.25); font-weight: 500;">${projLabel}</span>
                        ${stateLabel ? `<span style="background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">${stateLabel}</span>` : ''}
                        ${dueText ? `<span style="color: #f38ba8; background: rgba(243, 139, 168, 0.1); padding: 1px 6px; border-radius: 6px; border: 1px solid rgba(243, 139, 168, 0.2);">${dueText}</span>` : ''}
                        ${dateFormatted ? `<span style="opacity: 0.7; margin-left: auto;">📦 ${dateFormatted}</span>` : ''}
                    </div>
                </div>
                <button type="button" id="restore-archive-btn-${t.id}" onclick="restoreTaskFromArchive('${t.id}')" class="save" style="padding: 7px 12px; font-size: 0.75rem; border-radius: 8px; border: none; cursor: pointer; background: rgba(166, 227, 161, 0.2); color: #a6e3a1; border: 1px solid rgba(166, 227, 161, 0.4); font-weight: bold; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" title="Aufgabe aus dem Archiv wiederherstellen">
                    <span>♻️</span> Wiederherstellen
                </button>
            </div>
        `;
    });

    listContainer.innerHTML = itemsHtml;
};

window.restoreTaskFromArchive = async function (taskId) {
    try {
        const btn = document.getElementById(`restore-archive-btn-${taskId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳</span> Wird wiederhergestellt...';
        }
        await callTool('wiederherstellen_aufgabe', { taskId: String(taskId) });
        await refreshProjectsArchive();
        if (typeof loadTopWidgets === 'function') {
            loadTopWidgets();
        }
    } catch (e) {
        console.error("Fehler beim Wiederherstellen der archivierten Aufgabe:", e);
        alert("Fehler beim Wiederherstellen: " + (e.message || e));
    }
};
