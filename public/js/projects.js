

        function updateProjectsHeader(activeProject) {
            const titleContainer = document.getElementById('header-projects-title-container');
            const editBtn = document.getElementById('header-project-edit-btn');
            const addBtn = document.getElementById('header-project-add-btn');

            if (!activeProject) {
                if (titleContainer) {
                    titleContainer.innerHTML = '<span id="header-projects-title">📁 Projekte</span>';
                }
                if (editBtn) {
                    editBtn.style.display = 'none';
                    editBtn.onclick = null;
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
                if (editBtn) {
                    if (activeProject.isUnassigned) {
                        editBtn.style.display = 'none';
                        editBtn.onclick = null;
                    } else {
                        editBtn.style.display = 'inline-flex';
                        editBtn.title = 'Projekt bearbeiten';
                        editBtn.onclick = () => openProjectModal(activeProject.id, activeProject.name, !!activeProject.isStarred);
                    }
                }
                if (addBtn) {
                    addBtn.title = 'Neue Aufgabe erstellen';
                    addBtn.onclick = () => openTaskModalForProject(activeProject.isUnassigned ? null : activeProject.id, 'in_progress');
                }
            }
        }


        window.updateProjectsHeader = updateProjectsHeader;



        window.openProjectDetailPage = function(id) {
            window.activeProjectDetailId = id;
            if (typeof focusWidget === 'function') {
                focusWidget('projects');
            }
            loadTopWidgets();
        };



        window.closeProjectDetail = function() {
            window.activeProjectDetailId = null;
            updateProjectsHeader(null);
            loadTopWidgets();
        };



        window.navigateToProjects = function() {
            window.activeProjectDetailId = null;
            updateProjectsHeader(null);
            if (typeof focusWidget === 'function') {
                focusWidget('projects');
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
            openTaskModal(null, '', '', '', '', 'none', projectId, status === 'suggestion', status, false);
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

            // --- 1. DEDICATED PROJECT DETAIL PAGE (3 COLUMNS) ---
            if (activeProject) {
                const p = activeProject;
                const escName = escapeHtml(p.name);
                const pTasks = p.tasks || [];
                const pNotes = p.notes || [];

                const suggestions = [];
                const inProgress = [];
                const done = [];

                pTasks.forEach(t => {
                    const isCompleted = !!t.completed || t.status === 'done';
                    if (isCompleted) {
                        done.push(t);
                    } else if (t.status === 'suggestion' || t.isPlanned) {
                        suggestions.push(t);
                    } else {
                        inProgress.push(t);
                    }
                });

                function renderColumnTask(t, currentCol) {
                    const rawId = String(t.id).replace('task-', '');
                    const escT = escapeHtml(t.title || 'Aufgabe');
                    const escN = escapeHtml(t.notes || '');
                    const isDone = currentCol === 'done' || !!t.completed;
                    const checkedAttr = isDone ? 'checked' : '';
                    const textStyle = isDone ? 'text-decoration: line-through; opacity: 0.55;' : '';
                    const starClass = t.isStarred ? 'is-starred' : '';

                    let moverHtml = '';
                    if (currentCol === 'suggestion') {
                        moverHtml = `
                            <button type="button" class="task-action-btn" onclick="updateTaskStatus('${rawId}', 'in_progress', event)" title="In Arbeit verschieben">
                                ⏳ In Arbeit ➔
                            </button>
                            <button type="button" class="task-action-btn btn-done" onclick="updateTaskStatus('${rawId}', 'done', event)" title="Als erledigt markieren">
                                ✅ Fertig
                            </button>
                        `;
                    } else if (currentCol === 'in_progress') {
                        moverHtml = `
                            <button type="button" class="task-action-btn" onclick="updateTaskStatus('${rawId}', 'suggestion', event)" title="Zu Vorschlägen verschieben">
                                💡 Vorschlag
                            </button>
                            <button type="button" class="task-action-btn btn-done" onclick="updateTaskStatus('${rawId}', 'done', event)" title="Als erledigt markieren">
                                ✅ Fertig
                            </button>
                        `;
                    } else if (currentCol === 'done') {
                        moverHtml = `
                            <button type="button" class="task-action-btn" onclick="updateTaskStatus('${rawId}', 'in_progress', event)" title="Wieder in Arbeit nehmen">
                                ↩ Reaktivieren
                            </button>
                        `;
                    }

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

                    const itemHtml = `
                        <div class="project-task-item">
                            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                                <div style="display: flex; align-items: flex-start; gap: 6px; min-width: 0; flex: 1;">
                                    <input type="checkbox" class="task-checkbox" data-task-id="${rawId}" data-tasklist-id="Standard" onchange="completeTask(this)" ${checkedAttr} style="margin-top: 2px;" onclick="event.stopPropagation()">
                                    <span style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; word-break: break-word; font-size: 0.8rem; line-height: 1.35; flex: 1; cursor: pointer; ${textStyle}" onclick="openTaskModal('${rawId}', '${escT.replace(/'/g, "\\'")}', '${escN.replace(/'/g, "\\'")}', '${t.due || ''}', 'Standard', 'none', ${p.isUnassigned ? 'null' : p.id}, ${t.isPlanned || t.status === 'suggestion'}, '${t.status || 'in_progress'}', ${!!t.isStarred})">
                                        ${escT}
                                    </span>
                                </div>
                                <button type="button" class="pin-btn ${t.isStarred ? 'is-pinned' : ''}" onclick="toggleTaskStar('${rawId}', event)" title="${t.isStarred ? 'Aufgabe entpinnen' : 'Aufgabe anpinnen'}" style="font-size: 0.9rem;">
                                    📌
                                </button>
                            </div>
                            ${dueBadge ? `<div style="margin-left: 20px;">${dueBadge}</div>` : ''}
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-top: 2px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap;">
                                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                    ${moverHtml}
                                </div>
                                <div style="display: flex; gap: 2px;">
                                    <button type="button" class="task-action-btn" onclick="openTaskModal('${rawId}', '${escT.replace(/'/g, "\\'")}', '${escN.replace(/'/g, "\\'")}', '${t.due || ''}', 'Standard', 'none', ${p.isUnassigned ? 'null' : p.id}, ${t.isPlanned || t.status === 'suggestion'}, '${t.status || 'in_progress'}', ${!!t.isStarred})" title="Bearbeiten">✏️</button>
                                    <button type="button" class="task-action-btn" onclick="deleteTask('${rawId}')" title="Löschen" style="color: var(--off);">🗑️</button>
                                </div>
                            </div>
                        </div>
                    `;
                    const extraData = `data-task-id="${rawId}" data-task-title="${escT.replace(/"/g, '&quot;')}" data-task-project="${p.id}" data-task-status="${t.status || ''}" data-task-completed="${isDone}"`;
                    return renderSwipeLinkWrapper(itemHtml, t.title, 'task', rawId, '', '', 'margin-bottom: 0;', extraData);
                }

                let html = `
                    <div class="project-detail-container">
                `;

                if (p.description) {
                    html += `<div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 8px;">${escapeHtml(p.description)}</div>`;
                }

                // 3 COLUMNS
                html += `
                    <div class="project-task-columns">
                        <!-- Spalte 1: Vorschläge -->
                        <div class="project-task-column">
                            <div class="project-column-header col-suggestion">
                                <div class="project-column-title">
                                    <span>💡</span>
                                    <span>Vorschläge</span>
                                    <span class="project-tag-badge suggestion">${suggestions.length}</span>
                                </div>
                                <button type="button" class="task-action-btn" onclick="openTaskModalForProject(${p.isUnassigned ? 'null' : p.id}, 'suggestion')" title="Neuen Vorschlag hinzufügen">➕</button>
                            </div>
                            <div class="project-column-body">
                                ${suggestions.length === 0 ? '<div style="font-size: 0.75rem; opacity: 0.45; text-align: center; padding: 20px 0;">Keine Vorschläge</div>' : suggestions.map(t => renderColumnTask(t, 'suggestion')).join('')}
                            </div>
                        </div>

                        <!-- Spalte 2: In Arbeit -->
                        <div class="project-task-column">
                            <div class="project-column-header col-in_progress">
                                <div class="project-column-title">
                                    <span>⏳</span>
                                    <span>In Arbeit</span>
                                    <span class="project-tag-badge in_progress">${inProgress.length}</span>
                                </div>
                                <button type="button" class="task-action-btn" onclick="openTaskModalForProject(${p.isUnassigned ? 'null' : p.id}, 'in_progress')" title="Neue Aufgabe hinzufügen">➕</button>
                            </div>
                            <div class="project-column-body">
                                ${inProgress.length === 0 ? '<div style="font-size: 0.75rem; opacity: 0.45; text-align: center; padding: 20px 0;">Keine offenen Aufgaben</div>' : inProgress.map(t => renderColumnTask(t, 'in_progress')).join('')}
                            </div>
                        </div>

                        <!-- Spalte 3: Fertig -->
                        <div class="project-task-column">
                            <div class="project-column-header col-done">
                                <div class="project-column-title">
                                    <span>✅</span>
                                    <span>Fertig</span>
                                    <span class="project-tag-badge done">${done.length}</span>
                                </div>
                            </div>
                            <div class="project-column-body">
                                ${done.length === 0 ? '<div style="font-size: 0.75rem; opacity: 0.45; text-align: center; padding: 20px 0;">Keine erledigten Aufgaben</div>' : done.map(t => renderColumnTask(t, 'done')).join('')}
                            </div>
                        </div>
                    </div>
                `;

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
                    const sugCount = pTasks.filter(t => !t.completed && (t.status === 'suggestion' || t.isPlanned)).length;
                    const inProgCount = pTasks.filter(t => !t.completed && t.status !== 'suggestion' && !t.isPlanned && t.status !== 'done').length;
                    const doneCount = pTasks.filter(t => t.completed || t.status === 'done').length;

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

                    const cardInner = `
                        <div class="project-overview-header">
                            <div class="project-overview-title">
                                <span>📁</span>
                                <span>${escProjName}</span>
                            </div>
                            <button type="button" class="pin-btn ${p.isStarred ? 'is-pinned' : ''}" onclick="toggleProjectStar(${p.id}, event)" title="${p.isStarred ? 'Projekt entpinnen' : 'Projekt anpinnen'}" style="font-size: 1.1rem;">
                                📌
                            </button>
                        </div>
                        ${personsHtml ? `<div style="display: flex; gap: 4px; flex-wrap: wrap;">${personsHtml}</div>` : ''}
                        ${p.description ? `<div style="font-size: 0.74rem; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.description)}</div>` : ''}
                        <div class="project-overview-badges">
                            <span class="project-tag-badge suggestion">💡 ${sugCount} Vorschläge</span>
                            <span class="project-tag-badge in_progress">⏳ ${inProgCount} in Arbeit</span>
                            <span class="project-tag-badge done">✅ ${doneCount} fertig</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--accent); display: flex; align-items: center; gap: 4px; font-weight: 600; margin-top: auto; padding-top: 4px;">
                            Aufgaben ansehen ➔
                        </div>
                    `;

                    const extraProjectData = `data-project-id="${p.id}" data-project-name="${escProjName.replace(/"/g, '&quot;')}"`;
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