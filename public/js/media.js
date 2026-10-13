// ==========================================================================
// Media & Files Module
// ==========================================================================

(function() {
    window.currentMediaList = [];
    window.currentMediaCategory = 'all'; // 'all', 'image', 'document', 'fav'
    window.currentMediaProjectFilter = '';
    window.currentMediaPersonFilter = '';
    window.mediaSearchQuery = '';

    // Dedicated Photos Page State
    window.photosFilterTab = 'all'; // 'all'
    window.photosProjectFilter = '';
    window.photosPersonFilter = '';
    window.photosSearchQuery = '';

    // Dedicated Docs Page State
    window.docsFilterTab = 'all'; // 'all', 'pdf', 'office', 'txt'
    window.docsProjectFilter = '';
    window.docsPersonFilter = '';
    window.docsSearchQuery = '';

    // Carousel / Lightbox State
    window.currentLightboxImages = [];
    window.currentLightboxIndex = 0;

    const escapeHtml = (str) => typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Text-Dateien Erkennung
    function isTextMedia(m) {
        if (!m) return false;
        const ft = (m.fileType || '').toLowerCase();
        const fn = (m.fileName || '').toLowerCase();
        const textExtensions = ['.txt', '.md', '.json', '.csv', '.log', '.js', '.ts', '.html', '.css', '.py', '.xml', '.yml', '.yaml', '.ini', '.env', '.sh', '.bash', '.sql'];
        return textExtensions.some(ext => fn.endsWith(ext)) || ft.includes('text/') || ft.includes('application/json') || ft.includes('application/javascript');
    }
    window.isTextMedia = isTextMedia;

    // Helfer zur Bestimmung von Dokument-Typ und Icon
    function getDocTypeInfo(fileType, fileName) {
        const ft = (fileType || '').toLowerCase();
        const fn = (fileName || '').toLowerCase();
        if (ft.includes('pdf') || fn.endsWith('.pdf')) {
            return { icon: '📕', label: 'PDF', cls: 'pdf' };
        }
        if (ft.includes('word') || ft.includes('doc') || fn.endsWith('.doc') || fn.endsWith('.docx')) {
            return { icon: '📄', label: 'DOC', cls: 'doc' };
        }
        if (ft.includes('sheet') || ft.includes('excel') || ft.includes('csv') || fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) {
            return { icon: '📊', label: 'TAB', cls: 'sheet' };
        }
        if (isTextMedia({ fileType, fileName })) {
            return { icon: '📝', label: 'TXT', cls: 'txt' };
        }
        if (ft.includes('zip') || ft.includes('tar') || fn.endsWith('.zip') || fn.endsWith('.rar')) {
            return { icon: '📦', label: 'ZIP', cls: 'doc' };
        }
        return { icon: '📁', label: 'DATEI', cls: 'doc' };
    }

    // Google Fotos Quadrat-Kachel
    function renderPhotoTile(m, imgIdx) {
        const isFav = !!m.isFavorite;
        const encodedUrl = encodeURI(m.filePath);
        return `
            <div class="media-photo-tile" id="media-card-${m.id}" onclick="openMediaLightbox(${imgIdx})" title="${escapeHtml(m.title)}">
                <img src="${encodedUrl}" class="media-photo-img" alt="${escapeHtml(m.title)}" loading="lazy">
                <button type="button" class="media-photo-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleMediaFavorite(${m.id}, ${!isFav})" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
                    ${isFav ? '⭐' : '☆'}
                </button>
                <div class="media-photo-scrim">
                    <div class="media-photo-title">${escapeHtml(m.title)}</div>
                    <div class="media-photo-actions" onclick="event.stopPropagation()">
                        <button type="button" class="media-photo-action-btn" onclick="linkMediaToChat(${m.id}, '${escapeHtml(m.title).replace(/'/g, "\\'")}')" title="In Chat verlinken">🔗</button>
                        <button type="button" class="media-photo-action-btn" onclick="openMediaEditModal(${m.id})" title="Bearbeiten">✏️</button>
                        <a href="${encodedUrl}" download="${escapeHtml(m.fileName)}" class="media-photo-action-btn" title="Herunterladen">💾</a>
                        <button type="button" class="media-photo-action-btn" onclick="deleteMediaItem(${m.id})" style="color: #f38ba8;" title="Löschen">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Kompakte Dokumenten-Zeile
    function renderDocumentRow(m) {
        const isFav = !!m.isFavorite;
        const encodedUrl = encodeURI(m.filePath);
        const typeInfo = getDocTypeInfo(m.fileType, m.fileName);
        const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString('de-DE') : '';
        const isText = isTextMedia(m);
        const clickAction = isText ? `openTextEditorModal(${m.id})` : `window.open('${encodedUrl}', '_blank')`;

        return `
            <div class="media-doc-row" id="media-card-${m.id}" onclick="${clickAction}" title="${isText ? 'Klicken zum Öffnen & Bearbeiten: ' + escapeHtml(m.title) : escapeHtml(m.title)}">
                <div class="media-doc-left">
                    <div class="media-doc-badge-icon ${typeInfo.cls}">
                        <span>${typeInfo.icon}</span>
                    </div>
                    <div class="media-doc-text-block">
                        <div class="media-doc-title-line">
                            <span class="media-doc-title">${escapeHtml(m.title)}</span>
                            <span class="media-doc-type-pill">${typeInfo.label}</span>
                        </div>
                        <div class="media-doc-meta-line">
                            <span>${m.fileSizeFormatted || ''}</span>
                            ${dateStr ? `<span>&bull; ${dateStr}</span>` : ''}
                            ${(m.projects && m.projects.length > 0) ? `
                                <span class="media-doc-chips">
                                    ${m.projects.map(p => `
                                        <span class="media-doc-inline-chip project" onclick="event.stopPropagation(); openProjectDetailPage(${p.id})" title="Projekt: ${escapeHtml(p.name)}">
                                            📁 ${escapeHtml(p.name)}
                                        </span>
                                    `).join('')}
                                </span>
                            ` : ''}
                            ${(m.persons && m.persons.length > 0) ? `
                                <span class="media-doc-chips">
                                    ${m.persons.map(p => `
                                        <span class="media-doc-inline-chip person" onclick="event.stopPropagation(); openPersonProfileModal(${p.id})" title="Person: ${escapeHtml(p.name)}">
                                            👤 ${escapeHtml(p.name)}
                                        </span>
                                    `).join('')}
                                </span>
                            ` : ''}
                        </div>
                        ${m.extractedTextSnippet ? `
                            <div style="font-size: 0.68rem; color: rgba(255,255,255,0.4); margin-top: 3px; max-width: 550px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                📝 ${escapeHtml(m.extractedTextSnippet)}
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="media-doc-actions" onclick="event.stopPropagation()">
                    ${isText ? `
                        <button type="button" class="media-doc-action-btn edit-text" onclick="openTextEditorModal(${m.id})" title="Text anzeigen & bearbeiten" style="color: #89dceb;">
                            📝
                        </button>
                    ` : ''}
                    <button type="button" class="media-doc-action-btn fav ${isFav ? 'active' : ''}" onclick="toggleMediaFavorite(${m.id}, ${!isFav})" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
                        ${isFav ? '⭐' : '☆'}
                    </button>
                    <button type="button" class="media-doc-action-btn" onclick="linkMediaToChat(${m.id}, '${escapeHtml(m.title).replace(/'/g, "\\'")}')" title="In Chat verlinken">🔗</button>
                    <button type="button" class="media-doc-action-btn" onclick="openMediaEditModal(${m.id})" title="Metadaten bearbeiten">✏️</button>
                    <a href="${encodedUrl}" download="${escapeHtml(m.fileName)}" class="media-doc-action-btn" title="Herunterladen">💾</a>
                    <button type="button" class="media-doc-action-btn delete" onclick="deleteMediaItem(${m.id})" title="Löschen">🗑️</button>
                </div>
            </div>
        `;
    }

    // ==========================================================================
    // 1. DEDIZIERTE SEITE: FOTOS & BILDER (Google Fotos Style)
    // ==========================================================================

    function renderPhotosWidget(data, container) {
        if (!container) return;
        window.lastPhotosContainer = container;
        window.lastPhotosData = data;

        const allItems = (data && data.items) ? data.items : (window.currentMediaList || []);
        // Nur Bilder berücksichtigen
        const photos = allItems.filter(m => m.category === 'image');

        const projectFilter = window.photosProjectFilter || '';
        const personFilter = window.photosPersonFilter || '';
        const query = (window.photosSearchQuery || '').toLowerCase().trim();

        // Zähler für Fotos
        const totalCount = photos.length;

        // Projekte & Personen für Dropdowns
        const allProjectsMap = new Map();
        const allPersonsMap = new Map();
        photos.forEach(m => {
            (m.projects || []).forEach(p => allProjectsMap.set(p.id, p.name));
            (m.persons || []).forEach(p => allPersonsMap.set(p.id, p.name));
        });

        // Gefilterte Fotos
        const filtered = photos.filter(m => {
            if (projectFilter && !(m.projects || []).some(p => String(p.id) === String(projectFilter))) {
                return false;
            }

            if (personFilter && !(m.persons || []).some(p => String(p.id) === String(personFilter))) {
                return false;
            }

            if (query) {
                const matchTitle = (m.title || '').toLowerCase().includes(query);
                const matchFile = (m.fileName || '').toLowerCase().includes(query);
                const matchDesc = (m.description || '').toLowerCase().includes(query);
                const matchProj = (m.projects || []).some(p => (p.name || '').toLowerCase().includes(query) || (p.tag || '').toLowerCase().includes(query));
                const matchPers = (m.persons || []).some(p => (p.name || '').toLowerCase().includes(query));
                if (!matchTitle && !matchFile && !matchDesc && !matchProj && !matchPers) return false;
            }
            return true;
        });

        // Favoriten immer zuerst sortieren, danach chronologisch
        filtered.sort((a, b) => ((b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0)) || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));

        // Speichere gefilterte Bilder für Lightbox
        window.currentLightboxImages = filtered;

        let html = `
            <div class="media-dashboard photos-dashboard" ondragenter="handlePhotosDragEnter(event)" ondragover="handlePhotosDragOver(event)" ondragleave="handlePhotosDragLeave(event)" ondrop="handlePhotosDrop(event)">
                <!-- Unsichtbarer Input für Header-Upload-Button -->
                <input type="file" id="photos-global-file-input" style="display: none;" accept="image/*" multiple onchange="handlePhotosFilesSelected(this.files)">

                <!-- Drag & Drop Full-Surface Overlay (erscheint nur beim Hineinziehen) -->
                <div class="media-drag-overlay photos" id="photos-drag-overlay">
                    <div class="media-drag-overlay-box">
                        <span class="media-drag-overlay-icon">📸</span>
                        <div class="media-drag-overlay-title">Fotos hier ablegen</div>
                        <div class="media-drag-overlay-sub">Bilder werden automatisch in deine Galerie hochgeladen</div>
                    </div>
                </div>

                <!-- Filterleiste für Fotos -->
                <div class="media-filter-bar photos-filter-bar">
                    <span class="media-filter-pill active" style="cursor: default;">
                        <span>✨ Alle Fotos</span>
                        <span class="media-filter-count">${totalCount}</span>
                    </span>

                    <!-- Projekt-Filter Dropdown -->
                    <select class="media-filter-select ${projectFilter ? 'is-active' : ''}" onchange="filterPhotosByProject(this.value)">
                        <option value="">📁 Alle Projekte</option>
                        ${Array.from(allProjectsMap.entries()).map(([pid, pname]) => `
                            <option value="${pid}" ${String(projectFilter) === String(pid) ? 'selected' : ''}>📁 ${escapeHtml(pname)}</option>
                        `).join('')}
                    </select>

                    <!-- Personen-Filter Dropdown -->
                    <select class="media-filter-select ${personFilter ? 'is-active' : ''}" onchange="filterPhotosByPerson(this.value)">
                        <option value="">👤 Alle Personen</option>
                        ${Array.from(allPersonsMap.entries()).map(([pid, pname]) => `
                            <option value="${pid}" ${String(personFilter) === String(pid) ? 'selected' : ''}>👤 ${escapeHtml(pname)}</option>
                        `).join('')}
                    </select>
                </div>
        `;

        if (filtered.length === 0) {
            html += `
                <div style="text-align: center; padding: 45px 20px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(249,226,175,0.2); margin-top: 6px;">
                    <span style="font-size: 2.6rem;">🖼️</span>
                    <h4 style="margin: 8px 0 4px 0; color: #ffffff;">Keine Fotos gefunden</h4>
                    <p style="margin: 0; font-size: 0.8rem; color: rgba(255,255,255,0.5);">
                        ${query || projectFilter || personFilter ? 'Kein Foto entspricht den ausgewählten Filtern.' : 'Lade Bilder hoch, um deine Galerie wie bei Google Fotos zu genießen.'}
                    </p>
                </div>
            `;
        } else {
            html += `
                <div class="media-photos-grid">
                    ${filtered.map((m, idx) => renderPhotoTile(m, idx)).join('')}
                </div>
            `;
        }

        html += `</div>`;
        container.innerHTML = html;
        container.ondragenter = window.handlePhotosDragEnter;
        container.ondragover = window.handlePhotosDragOver;
        container.ondragleave = window.handlePhotosDragLeave;
        container.ondrop = window.handlePhotosDrop;
    }

    window.renderPhotosWidget = renderPhotosWidget;

    // Filter-Aktionen für Fotos
    window.switchPhotosFilterTab = function(t) {
        window.photosFilterTab = t;
        if (window.lastPhotosContainer) {
            renderPhotosWidget(window.lastPhotosData, window.lastPhotosContainer);
        }
    };

    window.filterPhotosByProject = function(pid) {
        window.photosProjectFilter = pid;
        if (window.lastPhotosContainer) {
            renderPhotosWidget(window.lastPhotosData, window.lastPhotosContainer);
        }
    };

    window.filterPhotosByPerson = function(pid) {
        window.photosPersonFilter = pid;
        if (window.lastPhotosContainer) {
            renderPhotosWidget(window.lastPhotosData, window.lastPhotosContainer);
        }
    };

    window.filterPhotosBySearch = function(q) {
        window.photosSearchQuery = q;
        if (window.lastPhotosContainer) {
            renderPhotosWidget(window.lastPhotosData, window.lastPhotosContainer);
        }
    };

    window.handlePhotosSearchInput = function(query) {
        filterPhotosBySearch(query);
    };

    window.togglePhotosSearch = function() {
        const searchBar = document.getElementById('header-photos-search-bar');
        const defaultBar = document.getElementById('header-photos-default-bar');
        if (searchBar && defaultBar) {
            const isHidden = searchBar.style.display === 'none';
            searchBar.style.display = isHidden ? 'flex' : 'none';
            defaultBar.style.display = isHidden ? 'none' : 'flex';
            if (isHidden) {
                const inp = document.getElementById('header-photos-search-input');
                if (inp) {
                    inp.focus();
                    inp.value = window.photosSearchQuery || '';
                }
            } else {
                filterPhotosBySearch('');
            }
        }
    };

    window.triggerPhotosUpload = function() {
        let inp = document.getElementById('photos-global-file-input');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file';
            inp.id = 'photos-global-file-input';
            inp.style.display = 'none';
            inp.accept = 'image/*';
            inp.multiple = true;
            inp.onchange = function() { handlePhotosFilesSelected(this.files); };
            document.body.appendChild(inp);
        }
        inp.click();
    };

    let photosDragCounter = 0;

    window.handlePhotosDragEnter = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        photosDragCounter++;
        const overlay = document.getElementById('photos-drag-overlay');
        if (overlay) overlay.classList.add('is-active');
    };

    window.handlePhotosDragOver = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.dataTransfer) {
            ev.dataTransfer.dropEffect = 'copy';
        }
        const overlay = document.getElementById('photos-drag-overlay');
        if (overlay && !overlay.classList.contains('is-active')) {
            overlay.classList.add('is-active');
        }
    };

    window.handlePhotosDragLeave = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        photosDragCounter--;
        if (photosDragCounter <= 0) {
            photosDragCounter = 0;
            const overlay = document.getElementById('photos-drag-overlay');
            if (overlay) overlay.classList.remove('is-active');
        }
    };

    window.handlePhotosDrop = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        photosDragCounter = 0;
        const overlay = document.getElementById('photos-drag-overlay');
        if (overlay) overlay.classList.remove('is-active');
        if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
            handlePhotosFilesSelected(ev.dataTransfer.files);
        }
    };

    window.handlePhotosFilesSelected = async function(files) {
        await handleMediaFilesSelected(files);
    };

    // ==========================================================================
    // 2. DEDIZIERTE SEITE: DOKUMENTE & DATEIEN (Kompakte Liste untereinander)
    // ==========================================================================

    function renderDocsWidget(data, container) {
        if (!container) return;
        window.lastDocsContainer = container;
        window.lastDocsData = data;

        const allItems = (data && data.items) ? data.items : (window.currentMediaList || []);
        // Nur Nicht-Bilder (Dokumente, PDFs, Tabellen, Notizen, etc.) berücksichtigen
        const docs = allItems.filter(m => m.category !== 'image');

        const tab = window.docsFilterTab || 'all';
        const projectFilter = window.docsProjectFilter || '';
        const personFilter = window.docsPersonFilter || '';
        const query = (window.docsSearchQuery || '').toLowerCase().trim();

        // Zähler für Filter-Optionen
        const totalCount = docs.length;
        const pdfCount = docs.filter(d => (d.fileType || '').toLowerCase().includes('pdf') || (d.fileName || '').toLowerCase().endsWith('.pdf')).length;
        const officeCount = docs.filter(d => {
            const s = ((d.fileType || '') + ' ' + (d.fileName || '')).toLowerCase();
            return s.includes('doc') || s.includes('xls') || s.includes('sheet') || s.includes('csv') || s.includes('ppt');
        }).length;
        const txtCount = docs.filter(d => isTextMedia(d)).length;

        // Projekte & Personen für Dropdowns
        const allProjectsMap = new Map();
        const allPersonsMap = new Map();
        docs.forEach(m => {
            (m.projects || []).forEach(p => allProjectsMap.set(p.id, p.name));
            (m.persons || []).forEach(p => allPersonsMap.set(p.id, p.name));
        });

        // Gefilterte Dokumente
        const filtered = docs.filter(d => {
            const typeStr = ((d.fileType || '') + ' ' + (d.fileName || '')).toLowerCase();

            if (tab === 'pdf' && !typeStr.includes('pdf')) return false;
            if (tab === 'office' && !(typeStr.includes('doc') || typeStr.includes('xls') || typeStr.includes('sheet') || typeStr.includes('csv') || typeStr.includes('ppt'))) return false;
            if (tab === 'txt' && !isTextMedia(d)) return false;

            if (projectFilter && !(d.projects || []).some(p => String(p.id) === String(projectFilter))) {
                return false;
            }

            if (personFilter && !(d.persons || []).some(p => String(p.id) === String(personFilter))) {
                return false;
            }

            if (query) {
                const matchTitle = (d.title || '').toLowerCase().includes(query);
                const matchFile = (d.fileName || '').toLowerCase().includes(query);
                const matchDesc = (d.description || '').toLowerCase().includes(query);
                const matchText = (d.extractedTextSnippet || '').toLowerCase().includes(query);
                const matchProj = (d.projects || []).some(p => (p.name || '').toLowerCase().includes(query) || (p.tag || '').toLowerCase().includes(query));
                const matchPers = (d.persons || []).some(p => (p.name || '').toLowerCase().includes(query));
                if (!matchTitle && !matchFile && !matchDesc && !matchText && !matchProj && !matchPers) return false;
            }
            return true;
        });

        // Favoriten immer zuerst sortieren, danach chronologisch
        filtered.sort((a, b) => ((b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0)) || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));

        let html = `
            <div class="media-dashboard docs-dashboard" ondragenter="handleDocsDragEnter(event)" ondragover="handleDocsDragOver(event)" ondragleave="handleDocsDragLeave(event)" ondrop="handleDocsDrop(event)">
                <!-- Unsichtbarer Input für Header-Upload-Button -->
                <input type="file" id="docs-global-file-input" style="display: none;" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.zip,.rar,text/*,application/*" multiple onchange="handleDocsFilesSelected(this.files)">

                <!-- Drag & Drop Full-Surface Overlay (erscheint nur beim Hineinziehen) -->
                <div class="media-drag-overlay docs" id="docs-drag-overlay">
                    <div class="media-drag-overlay-box">
                        <span class="media-drag-overlay-icon">📑</span>
                        <div class="media-drag-overlay-title">Dokumente hier ablegen</div>
                        <div class="media-drag-overlay-sub">PDFs, Office & Notizen werden direkt hochgeladen</div>
                    </div>
                </div>

                <!-- Filterleiste für Dokumente: Dokumenttypen, Projekte, Personen als Dropdowns -->
                <div class="media-filter-bar docs-filter-bar">
                    <!-- Aufklappbares Dropdown für Dokument-Typen -->
                    <select class="media-filter-select ${tab !== 'all' ? 'is-active' : ''}" onchange="switchDocsFilterTab(this.value)">
                        <option value="all" ${tab === 'all' ? 'selected' : ''}>📄 Alle Dokumente (${totalCount})</option>
                        <option value="pdf" ${tab === 'pdf' ? 'selected' : ''}>📕 PDFs (${pdfCount})</option>
                        <option value="office" ${tab === 'office' ? 'selected' : ''}>📊 Office (${officeCount})</option>
                        <option value="txt" ${tab === 'txt' ? 'selected' : ''}>📝 Notizen & Text (${txtCount})</option>
                    </select>

                    <!-- Projekt-Filter Dropdown -->
                    <select class="media-filter-select ${projectFilter ? 'is-active' : ''}" onchange="filterDocsByProject(this.value)">
                        <option value="">📁 Alle Projekte</option>
                        ${Array.from(allProjectsMap.entries()).map(([pid, pname]) => `
                            <option value="${pid}" ${String(projectFilter) === String(pid) ? 'selected' : ''}>📁 ${escapeHtml(pname)}</option>
                        `).join('')}
                    </select>

                    <!-- Personen-Filter Dropdown -->
                    <select class="media-filter-select ${personFilter ? 'is-active' : ''}" onchange="filterDocsByPerson(this.value)">
                        <option value="">👤 Alle Personen</option>
                        ${Array.from(allPersonsMap.entries()).map(([pid, pname]) => `
                            <option value="${pid}" ${String(personFilter) === String(pid) ? 'selected' : ''}>👤 ${escapeHtml(pname)}</option>
                        `).join('')}
                    </select>
                </div>
        `;

        if (filtered.length === 0) {
            html += `
                <div style="text-align: center; padding: 45px 20px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(137,220,235,0.2); margin-top: 6px;">
                    <span style="font-size: 2.6rem;">📄</span>
                    <h4 style="margin: 8px 0 4px 0; color: #ffffff;">Keine Dokumente gefunden</h4>
                    <p style="margin: 0; font-size: 0.8rem; color: rgba(255,255,255,0.5);">
                        ${query || projectFilter || personFilter || tab !== 'all' ? 'Kein Dokument entspricht den ausgewählten Filtern.' : 'Lade PDFs, Unterlagen oder Verträge hoch, um sie ordentlich sortiert zu verwalten.'}
                    </p>
                </div>
            `;
        } else {
            html += `
                <div class="media-docs-list">
                    ${filtered.map(m => renderDocumentRow(m)).join('')}
                </div>
            `;
        }

        html += `</div>`;
        container.innerHTML = html;
        container.ondragenter = window.handleDocsDragEnter;
        container.ondragover = window.handleDocsDragOver;
        container.ondragleave = window.handleDocsDragLeave;
        container.ondrop = window.handleDocsDrop;
    }

    window.renderDocsWidget = renderDocsWidget;

    // Filter-Aktionen für Dokumente
    window.switchDocsFilterTab = function(t) {
        window.docsFilterTab = t;
        if (window.lastDocsContainer) {
            renderDocsWidget(window.lastDocsData, window.lastDocsContainer);
        }
    };

    window.filterDocsByProject = function(pid) {
        window.docsProjectFilter = pid;
        if (window.lastDocsContainer) {
            renderDocsWidget(window.lastDocsData, window.lastDocsContainer);
        }
    };

    window.filterDocsByPerson = function(pid) {
        window.docsPersonFilter = pid;
        if (window.lastDocsContainer) {
            renderDocsWidget(window.lastDocsData, window.lastDocsContainer);
        }
    };

    window.filterDocsBySearch = function(q) {
        window.docsSearchQuery = q;
        if (window.lastDocsContainer) {
            renderDocsWidget(window.lastDocsData, window.lastDocsContainer);
        }
    };

    window.handleDocsSearchInput = function(query) {
        filterDocsBySearch(query);
    };

    window.toggleDocsSearch = function() {
        const searchBar = document.getElementById('header-docs-search-bar');
        const defaultBar = document.getElementById('header-docs-default-bar');
        if (searchBar && defaultBar) {
            const isHidden = searchBar.style.display === 'none';
            searchBar.style.display = isHidden ? 'flex' : 'none';
            defaultBar.style.display = isHidden ? 'none' : 'flex';
            if (isHidden) {
                const inp = document.getElementById('header-docs-search-input');
                if (inp) {
                    inp.focus();
                    inp.value = window.docsSearchQuery || '';
                }
            } else {
                filterDocsBySearch('');
            }
        }
    };

    window.triggerDocsUpload = function() {
        let inp = document.getElementById('docs-global-file-input');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file';
            inp.id = 'docs-global-file-input';
            inp.style.display = 'none';
            inp.accept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.zip,.rar,text/*,application/*';
            inp.multiple = true;
            inp.onchange = function() { handleDocsFilesSelected(this.files); };
            document.body.appendChild(inp);
        }
        inp.click();
    };

    let docsDragCounter = 0;

    window.handleDocsDragEnter = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        docsDragCounter++;
        const overlay = document.getElementById('docs-drag-overlay');
        if (overlay) overlay.classList.add('is-active');
    };

    window.handleDocsDragOver = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.dataTransfer) {
            ev.dataTransfer.dropEffect = 'copy';
        }
        const overlay = document.getElementById('docs-drag-overlay');
        if (overlay && !overlay.classList.contains('is-active')) {
            overlay.classList.add('is-active');
        }
    };

    window.handleDocsDragLeave = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        docsDragCounter--;
        if (docsDragCounter <= 0) {
            docsDragCounter = 0;
            const overlay = document.getElementById('docs-drag-overlay');
            if (overlay) overlay.classList.remove('is-active');
        }
    };

    window.handleDocsDrop = function(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        docsDragCounter = 0;
        const overlay = document.getElementById('docs-drag-overlay');
        if (overlay) overlay.classList.remove('is-active');
        if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
            handleDocsFilesSelected(ev.dataTransfer.files);
        }
    };

    window.handleDocsFilesSelected = async function(files) {
        await handleMediaFilesSelected(files);
    };

    // ==========================================================================
    // Legacy / Fallback: renderMediaWidget
    // ==========================================================================

    function renderMediaWidget(data, container) {
        if (!container) return;
        window.lastMediaContainer = container;
        window.lastMediaData = data;
        const items = (data && data.items) ? data.items : (window.currentMediaList || []);
        window.currentMediaList = items;

        const photos = items.filter(m => m.category === 'image');
        const docs = items.filter(m => m.category !== 'image');

        if (container.id === 'widget-photos') {
            renderPhotosWidget({ items: photos }, container);
        } else if (container.id === 'widget-docs') {
            renderDocsWidget({ items: docs }, container);
        } else {
            // Falls ein generisches Widget verwendet wird: Rendere Fotos
            renderPhotosWidget({ items: photos }, container);
        }
    }

    window.renderMediaWidget = renderMediaWidget;

    // Legacy Filter-Wrapper
    window.switchMediaCategory = function(cat) {
        if (cat === 'image') {
            focusWidget('photos');
        } else if (cat === 'document') {
            focusWidget('docs');
        } else {
            focusWidget('photos');
        }
    };

    window.filterMediaByProject = function(pid) {
        filterPhotosByProject(pid);
        filterDocsByProject(pid);
    };

    window.filterMediaByPerson = function(pid) {
        filterPhotosByPerson(pid);
        filterDocsByPerson(pid);
    };

    window.filterMediaBySearch = function(q) {
        filterPhotosBySearch(q);
        filterDocsBySearch(q);
    };

    window.toggleMediaSearch = function() {
        togglePhotosSearch();
    };

    window.handleHeaderMediaSearchInput = function(q) {
        filterPhotosBySearch(q);
        filterDocsBySearch(q);
    };

    // Drawer Navigation
    window.handleDrawerPhotos = function() {
        closeMobileDrawer();
        if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
            closeMailReadModal();
        }
        focusWidget('photos');
    };

    window.handleDrawerDocs = function() {
        closeMobileDrawer();
        if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
            closeMailReadModal();
        }
        focusWidget('docs');
    };

    window.handleDrawerMedia = function() {
        closeMobileDrawer();
        if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
            closeMailReadModal();
        }
        focusWidget('photos');
    };

    // Favorit umschalten
    window.toggleMediaFavorite = async function(id, isFav) {
        try {
            const res = await fetch(getApiUrl(`/api/media/${id}/favorite`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFavorite: isFav })
            });
            if (res.ok) {
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Aktualisieren des Favoritenstatus:', e);
        }
    };

    // Datei löschen
    window.deleteMediaItem = async function(id) {
        if (!confirm('Möchtest du diese Datei wirklich löschen?')) return;
        try {
            const res = await fetch(getApiUrl(`/api/media/${id}`), { method: 'DELETE' });
            if (res.ok) {
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Löschen der Datei:', e);
        }
    };

    // Upload ausführen
    window.handleMediaFilesSelected = async function(files, projectId, personId, tag) {
        if (!files || files.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        if (projectId) formData.append('projectIds', projectId);
        if (personId) formData.append('personIds', personId);
        if (tag) formData.append('tag', tag);

        try {
            const res = await fetch(getApiUrl('/api/media/upload'), {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                await refreshMediaData();
            } else {
                const err = await res.json();
                alert(`Upload fehlgeschlagen: ${err.error || 'Serverfehler'}`);
            }
        } catch (e) {
            console.error('Fehler beim Upload:', e);
            alert('Netzwerkfehler beim Hochladen.');
        }
    };

    // Daten neu laden & Widgets synchronisieren
    async function refreshMediaData() {
        try {
            const res = await fetch(getApiUrl('/api/media'));
            if (res.ok) {
                const list = await res.json();
                window.currentMediaList = list;

                const photos = list.filter(m => m.category === 'image');
                const docs = list.filter(m => m.category !== 'image');

                if (window.lastPhotosContainer) {
                    renderPhotosWidget({ items: photos }, window.lastPhotosContainer);
                }
                if (window.lastDocsContainer) {
                    renderDocsWidget({ items: docs }, window.lastDocsContainer);
                }
                if (window.lastMediaContainer && !window.lastPhotosContainer && !window.lastDocsContainer) {
                    renderMediaWidget({ items: list }, window.lastMediaContainer);
                }
                if (!window.lastPhotosContainer && !window.lastDocsContainer && typeof loadTopWidgets === 'function') {
                    loadTopWidgets();
                }
            }
        } catch (e) {
            console.error('Fehler beim Aktualisieren der Mediendaten:', e);
        }
    }

    window.refreshMediaData = refreshMediaData;

    // ==========================================================================
    // Lightbox / Carousel für Fotos & Bilder
    // ==========================================================================

    window.openMediaLightbox = function(index) {
        if (!window.currentLightboxImages || window.currentLightboxImages.length === 0) return;
        if (index < 0) index = 0;
        if (index >= window.currentLightboxImages.length) index = window.currentLightboxImages.length - 1;

        window.currentLightboxIndex = index;
        const modal = document.getElementById('media-lightbox-modal');
        if (!modal) return;

        updateLightboxView();
        modal.classList.add('active');
        document.body.classList.add('modal-active');

        // Tastatursteuerung
        document.addEventListener('keydown', handleLightboxKeyDown);
    };

    window.closeMediaLightbox = function() {
        const modal = document.getElementById('media-lightbox-modal');
        if (modal) modal.classList.remove('active');
        document.body.classList.remove('modal-active');
        document.removeEventListener('keydown', handleLightboxKeyDown);
    };

    window.lightboxNext = function() {
        if (!window.currentLightboxImages.length) return;
        window.currentLightboxIndex = (window.currentLightboxIndex + 1) % window.currentLightboxImages.length;
        updateLightboxView();
    };

    window.lightboxPrev = function() {
        if (!window.currentLightboxImages.length) return;
        window.currentLightboxIndex = (window.currentLightboxIndex - 1 + window.currentLightboxImages.length) % window.currentLightboxImages.length;
        updateLightboxView();
    };

    function handleLightboxKeyDown(e) {
        if (e.key === 'ArrowRight') {
            lightboxNext();
        } else if (e.key === 'ArrowLeft') {
            lightboxPrev();
        } else if (e.key === 'Escape') {
            closeMediaLightbox();
        }
    }

    function updateLightboxView() {
        const img = window.currentLightboxImages[window.currentLightboxIndex];
        if (!img) return;

        const imgEl = document.getElementById('lightbox-img');
        const counterEl = document.getElementById('lightbox-counter');
        const titleEl = document.getElementById('lightbox-title');
        const descEl = document.getElementById('lightbox-desc-display');
        const descInp = document.getElementById('lightbox-desc-input');
        const sizeEl = document.getElementById('lightbox-size');
        const dateEl = document.getElementById('lightbox-date');
        const chipsEl = document.getElementById('lightbox-chips');
        const downloadBtn = document.getElementById('lightbox-download-btn');

        if (imgEl) imgEl.src = encodeURI(img.filePath);
        if (counterEl) counterEl.textContent = `${window.currentLightboxIndex + 1} / ${window.currentLightboxImages.length}`;
        if (titleEl) titleEl.textContent = img.title;
        if (descEl) descEl.textContent = img.description || 'Keine Beschreibung hinterlegt.';
        if (descInp) descInp.value = img.description || '';
        if (sizeEl) sizeEl.textContent = img.fileSizeFormatted;
        if (dateEl) dateEl.textContent = new Date(img.createdAt).toLocaleDateString('de-DE');
        if (downloadBtn) {
            downloadBtn.href = encodeURI(img.filePath);
            downloadBtn.download = img.fileName;
        }

        if (chipsEl) {
            let chipsHtml = '';
            (img.projects || []).forEach(p => {
                chipsHtml += `<span class="media-chip project" style="cursor: pointer;" onclick="closeMediaLightbox(); openProjectDetailPage(${p.id})">📁 ${escapeHtml(p.name)}</span>`;
            });
            (img.persons || []).forEach(p => {
                chipsHtml += `<span class="media-chip person" style="cursor: pointer;" onclick="closeMediaLightbox(); openPersonProfileModal(${p.id})">👤 ${escapeHtml(p.name)}</span>`;
            });
            chipsEl.innerHTML = chipsHtml || '<span style="font-size: 0.72rem; opacity: 0.5;">Keine Verknüpfungen</span>';
        }
    }

    window.saveLightboxDescription = async function() {
        const img = window.currentLightboxImages[window.currentLightboxIndex];
        if (!img) return;
        const descInp = document.getElementById('lightbox-desc-input');
        const newDesc = descInp ? descInp.value.trim() : '';

        try {
            const res = await fetch(getApiUrl(`/api/media/${img.id}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: newDesc })
            });
            if (res.ok) {
                img.description = newDesc;
                const descEl = document.getElementById('lightbox-desc-display');
                if (descEl) descEl.textContent = newDesc || 'Keine Beschreibung hinterlegt.';
                alert('Beschreibung gespeichert!');
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Speichern der Beschreibung:', e);
        }
    };

    // ==========================================================================
    // Media Edit & Modal Handlers
    // ==========================================================================

    window.openMediaEditModal = async function(mediaId) {
        try {
            const res = await fetch(getApiUrl(`/api/media/${mediaId}`));
            if (!res.ok) return;
            const item = await res.json();

            document.getElementById('media-edit-id').value = item.id;
            document.getElementById('media-edit-title').value = item.title;
            document.getElementById('media-edit-desc').value = item.description || '';
            document.getElementById('media-edit-favorite').checked = !!item.isFavorite;

            const textEditorBtn = document.getElementById('media-edit-text-editor-container');
            if (textEditorBtn) {
                textEditorBtn.style.display = isTextMedia(item) ? 'block' : 'none';
            }

            // Personen-Auswahl befüllen
            const personSelect = document.getElementById('media-edit-person-select');
            if (personSelect) {
                const pRes = await fetch(getApiUrl('/widgets'));
                const w = await pRes.json();
                const memWidget = w.find(x => x.data && x.data.widgetType === 'memory_people_list');
                const people = memWidget?.data?.people || [];
                personSelect.innerHTML = '<option value="">-- Person auswählen --</option>' +
                    people.map(p => {
                        const name = p.aliases?.[0]?.name || p.name || 'Person #' + p.id;
                        return `<option value="${p.id}">${escapeHtml(name)}</option>`;
                    }).join('');
            }

            // Projekt-Auswahl befüllen
            const projSelect = document.getElementById('media-edit-project-select');
            if (projSelect) {
                const pRes = await fetch(getApiUrl('/widgets'));
                const w = await pRes.json();
                const prWidget = w.find(x => x.data && x.data.widgetType === 'projects_list');
                const projs = prWidget?.data?.projects || [];
                projSelect.innerHTML = '<option value="">-- Projekt auswählen --</option>' +
                    projs.map(pr => `<option value="${pr.id}">${escapeHtml(pr.name)}</option>`).join('');
            }

            renderMediaEditLinks(item);

            const modal = document.getElementById('media-edit-modal');
            if (modal) modal.style.display = 'block';
            document.body.classList.add('modal-active');
        } catch (e) {
            console.error('Fehler beim Laden der Datei:', e);
        }
    };

    function renderMediaEditLinks(item) {
        const personsContainer = document.getElementById('media-edit-persons-list');
        if (personsContainer) {
            personsContainer.innerHTML = (item.persons || []).map(p => `
                <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(203,166,247,0.15); color: #cba6f7; border: 1px solid rgba(203,166,247,0.3); border-radius: 12px; padding: 2px 8px; font-size: 0.72rem;">
                    <span>👤 ${escapeHtml(p.name)}</span>
                    <button type="button" onclick="unlinkPersonFromMedia(${item.id}, ${p.id})" style="background: none; border: none; color: #f38ba8; cursor: pointer; font-size: 0.8rem;">✕</button>
                </div>
            `).join('') || '<span style="font-size: 0.72rem; opacity: 0.4;">Keine Personen verknüpft</span>';
        }

        const projsContainer = document.getElementById('media-edit-projects-list');
        if (projsContainer) {
            projsContainer.innerHTML = (item.projects || []).map(p => `
                <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(137,180,250,0.15); color: #89b4fa; border: 1px solid rgba(137,180,250,0.3); border-radius: 12px; padding: 2px 8px; font-size: 0.72rem;">
                    <span>📁 ${escapeHtml(p.name)} ${p.tag ? `[${escapeHtml(p.tag)}]` : ''}</span>
                    <button type="button" onclick="unlinkProjectFromMedia(${item.id}, ${p.id})" style="background: none; border: none; color: #f38ba8; cursor: pointer; font-size: 0.8rem;">✕</button>
                </div>
            `).join('') || '<span style="font-size: 0.72rem; opacity: 0.4;">Keine Projekte verknüpft</span>';
        }
    }

    window.closeMediaEditModal = function() {
        const modal = document.getElementById('media-edit-modal');
        if (modal) modal.style.display = 'none';
        document.body.classList.remove('modal-active');
    };

    window.saveMediaEditModal = async function() {
        const id = document.getElementById('media-edit-id').value;
        const title = document.getElementById('media-edit-title').value.trim();
        const description = document.getElementById('media-edit-desc').value.trim();
        const isFavorite = document.getElementById('media-edit-favorite').checked;

        if (!title) {
            alert('Bitte gib einen Titel ein.');
            return;
        }

        try {
            const res = await fetch(getApiUrl(`/api/media/${id}`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, isFavorite })
            });
            if (res.ok) {
                closeMediaEditModal();
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Speichern:', e);
        }
    };

    window.addPersonToMediaInModal = async function() {
        const mediaId = document.getElementById('media-edit-id').value;
        const personId = document.getElementById('media-edit-person-select').value;
        if (!mediaId || !personId) return;

        try {
            const res = await fetch(getApiUrl(`/api/media/${mediaId}/persons`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personId })
            });
            if (res.ok) {
                openMediaEditModal(mediaId);
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Verknüpfen der Person:', e);
        }
    };

    window.unlinkPersonFromMedia = async function(mediaId, personId) {
        try {
            const res = await fetch(getApiUrl(`/api/media/${mediaId}/persons/${personId}`), { method: 'DELETE' });
            if (res.ok) {
                openMediaEditModal(mediaId);
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Lösen der Person:', e);
        }
    };

    window.addProjectToMediaInModal = async function() {
        const mediaId = document.getElementById('media-edit-id').value;
        const projectId = document.getElementById('media-edit-project-select').value;
        const tag = document.getElementById('media-edit-project-tag').value.trim();
        if (!mediaId || !projectId) return;

        try {
            const res = await fetch(getApiUrl(`/api/media/${mediaId}/projects`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, tag })
            });
            if (res.ok) {
                document.getElementById('media-edit-project-tag').value = '';
                openMediaEditModal(mediaId);
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Verknüpfen des Projekts:', e);
        }
    };

    window.unlinkProjectFromMedia = async function(mediaId, projectId) {
        try {
            const res = await fetch(getApiUrl(`/api/media/${mediaId}/projects/${projectId}`), { method: 'DELETE' });
            if (res.ok) {
                openMediaEditModal(mediaId);
                await refreshMediaData();
            }
        } catch (e) {
            console.error('Fehler beim Lösen des Projekts:', e);
        }
    };

    // ==========================================================================
    // In-App Text-Editor & Viewer Modal (TXT, MD, JSON, Code, Notizen)
    // ==========================================================================

    window.openTextEditorModal = async function(mediaId) {
        try {
            const backdrop = document.getElementById('media-text-editor-backdrop');
            if (!backdrop) return;

            const statusEl = document.getElementById('media-text-editor-status');
            if (statusEl) {
                statusEl.textContent = '⏳ Lade...';
                statusEl.style.color = '#f9e2af';
            }

            backdrop.style.display = 'flex';
            document.body.classList.add('modal-active');

            const res = await fetch(getApiUrl(`/api/media/${mediaId}/content`));
            if (!res.ok) {
                alert('Fehler beim Laden des Dateiinhalts.');
                closeTextEditorModal();
                return;
            }
            const data = await res.json();

            document.getElementById('media-text-editor-id').value = data.id;
            document.getElementById('media-text-editor-title').value = data.title || data.fileName || '';
            
            const fnLabel = document.getElementById('media-text-editor-filename-label');
            if (fnLabel) fnLabel.textContent = data.fileName || '';

            const fsLabel = document.getElementById('media-text-editor-filesize-label');
            if (fsLabel) {
                fsLabel.textContent = data.media?.fileSizeFormatted || (data.fileSize ? `${Math.round(data.fileSize / 1024 * 10) / 10} KB` : '');
            }

            const ext = (data.fileName && data.fileName.includes('.')) ? data.fileName.split('.').pop().toUpperCase() : 'TXT';
            const extPill = document.getElementById('media-text-editor-ext-pill');
            if (extPill) extPill.textContent = ext;

            const downloadLink = document.getElementById('media-text-editor-download-link');
            if (downloadLink) {
                downloadLink.href = encodeURI(data.filePath);
                downloadLink.download = data.fileName;
            }

            const textarea = document.getElementById('media-text-editor-content');
            if (textarea) {
                textarea.value = data.content || '';
                textarea.focus();
            }

            // Tags in footer
            const tagsContainer = document.getElementById('media-text-editor-meta-tags');
            if (tagsContainer) {
                let tagsHtml = '';
                if (data.media?.projects && data.media.projects.length > 0) {
                    tagsHtml += data.media.projects.map(p => `<span class="media-chip project" style="cursor: pointer;" onclick="closeTextEditorModal(); openProjectDetailPage(${p.id})">📁 ${escapeHtml(p.name)}</span>`).join('');
                }
                if (data.media?.persons && data.media.persons.length > 0) {
                    tagsHtml += data.media.persons.map(p => `<span class="media-chip person" style="cursor: pointer;" onclick="closeTextEditorModal(); openPersonProfileModal(${p.id})">👤 ${escapeHtml(p.name)}</span>`).join('');
                }
                tagsContainer.innerHTML = tagsHtml;
            }

            updateTextEditorStats();
            if (statusEl) {
                statusEl.textContent = '🟢 Bereit';
                statusEl.style.color = '#a6e3a1';
            }
        } catch (e) {
            console.error('Fehler beim Öffnen des Text-Editors:', e);
            alert('Konnte Datei nicht öffnen.');
            closeTextEditorModal();
        }
    };

    window.closeTextEditorModal = function() {
        const backdrop = document.getElementById('media-text-editor-backdrop');
        if (backdrop) backdrop.style.display = 'none';
        document.body.classList.remove('modal-active');
    };

    window.saveTextEditorContent = async function() {
        const id = document.getElementById('media-text-editor-id').value;
        if (!id) return;

        const content = document.getElementById('media-text-editor-content').value;
        const title = document.getElementById('media-text-editor-title').value.trim();
        const statusEl = document.getElementById('media-text-editor-status');
        const saveBtn = document.getElementById('media-text-editor-save-btn');

        if (statusEl) {
            statusEl.textContent = '💾 Speichere...';
            statusEl.style.color = '#f9e2af';
        }
        if (saveBtn) saveBtn.disabled = true;

        try {
            const res = await fetch(getApiUrl(`/api/media/${id}/content`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, title })
            });

            if (res.ok) {
                const result = await res.json();
                if (statusEl) {
                    statusEl.textContent = '✅ Gespeichert!';
                    statusEl.style.color = '#a6e3a1';
                }
                if (result.item?.fileSizeFormatted) {
                    const fsLabel = document.getElementById('media-text-editor-filesize-label');
                    if (fsLabel) fsLabel.textContent = result.item.fileSizeFormatted;
                }
                setTimeout(() => {
                    if (statusEl && statusEl.textContent.includes('Gespeichert')) {
                        statusEl.textContent = '🟢 Bereit';
                        statusEl.style.color = '#a6e3a1';
                    }
                }, 2000);
                await refreshMediaData();
            } else {
                const err = await res.json();
                alert(`Fehler beim Speichern: ${err.error || 'Serverfehler'}`);
                if (statusEl) {
                    statusEl.textContent = '❌ Fehler';
                    statusEl.style.color = '#f38ba8';
                }
            }
        } catch (e) {
            console.error('Fehler beim Speichern:', e);
            alert('Netzwerkfehler beim Speichern.');
            if (statusEl) {
                statusEl.textContent = '❌ Fehler';
                statusEl.style.color = '#f38ba8';
            }
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    };

    window.copyTextEditorContent = async function() {
        const textarea = document.getElementById('media-text-editor-content');
        if (!textarea) return;
        try {
            await navigator.clipboard.writeText(textarea.value);
            const statusEl = document.getElementById('media-text-editor-status');
            if (statusEl) {
                const prev = statusEl.textContent;
                const prevColor = statusEl.style.color;
                statusEl.textContent = '📋 Kopiert!';
                statusEl.style.color = '#89b4fa';
                setTimeout(() => {
                    statusEl.textContent = prev;
                    statusEl.style.color = prevColor;
                }, 1500);
            }
        } catch (e) {
            console.error('Clipboard error:', e);
        }
    };

    window.handleTextEditorKeyDown = function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveTextEditorContent();
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            closeTextEditorModal();
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = e.target;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 4;
            handleTextEditorContentChanged();
        }
    };

    window.handleTextEditorContentChanged = function() {
        const statusEl = document.getElementById('media-text-editor-status');
        if (statusEl && !statusEl.textContent.includes('Ungespeichert')) {
            statusEl.textContent = '🟠 Ungespeichert';
            statusEl.style.color = '#fab387';
        }
        updateTextEditorStats();
    };

    function updateTextEditorStats() {
        const textarea = document.getElementById('media-text-editor-content');
        if (!textarea) return;
        const val = textarea.value;
        const lines = val ? val.split('\n').length : 0;
        const words = val.trim() ? val.trim().split(/\s+/).length : 0;
        const chars = val.length;

        const linesEl = document.getElementById('media-text-stat-lines');
        const wordsEl = document.getElementById('media-text-stat-words');
        const charsEl = document.getElementById('media-text-stat-chars');
        if (linesEl) linesEl.textContent = lines;
        if (wordsEl) wordsEl.textContent = words;
        if (charsEl) charsEl.textContent = chars;
    }
    window.updateTextEditorStats = updateTextEditorStats;

    window.toggleTextEditorWrap = function(checked) {
        const textarea = document.getElementById('media-text-editor-content');
        if (textarea) {
            textarea.style.whiteSpace = checked ? 'pre-wrap' : 'pre';
            textarea.style.overflowX = checked ? 'hidden' : 'auto';
        }
    };

    // ==========================================================================
    // Projekt-Detail Integration
    // ==========================================================================

    window.loadProjectMediaSection = async function(projectId, container) {
        if (!container) return;
        try {
            const res = await fetch(getApiUrl(`/api/projects/${projectId}/media`));
            if (!res.ok) return;
            const items = await res.json();

            let html = `
                <div class="project-media-section">
                    <div class="project-media-header">
                        <span class="arbeitstisch-section-badge">📎 Dateien & Dokumente (${items.length})</span>
                        <button type="button" class="nav-btn" onclick="document.getElementById('project-upload-file-input-${projectId}').click()" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">
                            ➕ Datei hochladen
                        </button>
                        <input type="file" id="project-upload-file-input-${projectId}" style="display: none;" multiple onchange="handleMediaFilesSelected(this.files, ${projectId})">
                    </div>
            `;

            if (items.length === 0) {
                html += `
                    <div style="font-size: 0.75rem; opacity: 0.45; text-align: center; padding: 14px 0; background: rgba(255,255,255,0.015); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.06);">
                        Keine Unterlagen oder Dateien in diesem Projekt hinterlegt (z.B. Lebenslauf, Anschreiben).
                    </div>
                `;
            } else {
                const projectImages = items.filter(m => m.category === 'image');
                const projectDocs = items.filter(m => m.category !== 'image');

                if (projectImages.length > 0) {
                    html += `
                        <div style="font-size: 0.74rem; font-weight: 700; color: rgba(255,255,255,0.7); margin: 8px 0 6px 0;">🖼️ Fotos (${projectImages.length})</div>
                        <div class="media-photos-grid" style="grid-template-columns: repeat(auto-fill, minmax(95px, 1fr)); margin-bottom: 10px;">
                            ${projectImages.map(m => {
                                const enc = encodeURI(m.filePath);
                                return `
                                    <div class="media-photo-tile" onclick="window.open('${enc}', '_blank')" title="${escapeHtml(m.title)}">
                                        <img src="${enc}" class="media-photo-img" alt="${escapeHtml(m.title)}" loading="lazy">
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                }

                if (projectDocs.length > 0) {
                    if (projectImages.length > 0) {
                        html += `<div style="font-size: 0.74rem; font-weight: 700; color: rgba(255,255,255,0.7); margin: 8px 0 6px 0;">📄 Dokumente (${projectDocs.length})</div>`;
                    }
                    html += `
                        <div class="media-docs-list">
                            ${projectDocs.map(m => renderDocumentRow(m)).join('')}
                        </div>
                    `;
                }
            }

            html += `</div>`;
            container.innerHTML = html;
        } catch (e) {
            console.error('Fehler beim Laden der Projekt-Medien:', e);
        }
    };

    // ==========================================================================
    // Personen-Profil Integration
    // ==========================================================================

    window.loadPersonMediaIntoModal = async function(personId) {
        const container = document.getElementById('person-profile-media-list');
        if (!container) return;

        try {
            const res = await fetch(getApiUrl(`/api/persons/${personId}/media`));
            if (!res.ok) {
                container.innerHTML = '<span style="font-size: 0.75rem; opacity: 0.5;">Konnte Fotos nicht laden.</span>';
                return;
            }
            const list = await res.json();

            if (list.length === 0) {
                container.innerHTML = `
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.45); padding: 4px 0;">
                        Noch keine Fotos oder Dokumente verknüpft.
                    </div>
                `;
                return;
            }

            const personImages = list.filter(m => m.category === 'image');
            const personDocs = list.filter(m => m.category !== 'image');

            let html = '';
            if (personImages.length > 0) {
                html += `
                    <div class="media-photos-grid" style="grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); gap: 5px; margin-bottom: 8px;">
                        ${personImages.map(m => {
                            const encodedUrl = encodeURI(m.filePath);
                            return `
                                <div class="media-photo-tile" onclick="window.open('${encodedUrl}', '_blank')" title="${escapeHtml(m.title)}">
                                    <img src="${encodedUrl}" class="media-photo-img" loading="lazy">
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
            if (personDocs.length > 0) {
                html += `
                    <div class="media-docs-list">
                        ${personDocs.map(m => renderDocumentRow(m)).join('')}
                    </div>
                `;
            }

            container.innerHTML = html;
        } catch (e) {
            console.error('Fehler beim Laden der Personen-Medien:', e);
        }
    };

    // =========================================================================
    // Chat Media Linking & Picker Modal
    // =========================================================================
    window.linkMediaToChat = function(mediaId, title) {
        if (typeof insertEntityLinkIntoChat === 'function') {
            insertEntityLinkIntoChat(title, 'media', mediaId);
        }
        if (typeof switchMobileView === 'function') {
            switchMobileView('chat');
        }
    };

    window.toggleChatAttachmentMenu = function(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const menu = document.getElementById('chat-attachment-dropdown');
        if (!menu) return;
        const isVisible = menu.style.display === 'flex';
        menu.style.display = isVisible ? 'none' : 'flex';
    };

    window.closeChatAttachmentMenu = function() {
        const menu = document.getElementById('chat-attachment-dropdown');
        if (menu) menu.style.display = 'none';
    };

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('chat-attachment-dropdown');
        const btn = document.getElementById('plus-btn');
        if (menu && menu.style.display === 'flex') {
            if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                menu.style.display = 'none';
            }
        }
    });

    let mediaPickerItems = [];
    let mediaPickerCategory = 'all';
    let mediaPickerSearchQuery = '';

    window.openMediaPickerModal = async function() {
        const modal = document.getElementById('media-picker-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        document.body.classList.add('modal-active');

        mediaPickerSearchQuery = '';
        const searchInput = document.getElementById('media-picker-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        setMediaPickerCategory('all');

        const listContainer = document.getElementById('media-picker-items-list');
        if (listContainer) listContainer.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.4); font-size: 0.85rem; padding: 20px;">Lade Dateien...</div>';

        try {
            const res = await fetch(getApiUrl('/api/media?limit=100'));
            if (res.ok) {
                const data = await res.json();
                mediaPickerItems = Array.isArray(data) ? data : (data.items || []);
                renderMediaPickerItems();
            } else {
                if (listContainer) listContainer.innerHTML = '<div style="text-align: center; color: #f38ba8; font-size: 0.85rem; padding: 20px;">Fehler beim Laden der Dateien.</div>';
            }
        } catch (e) {
            console.error('Fehler beim Laden für Media-Picker:', e);
            if (listContainer) listContainer.innerHTML = '<div style="text-align: center; color: #f38ba8; font-size: 0.85rem; padding: 20px;">Netzwerkfehler.</div>';
        }
    };

    window.closeMediaPickerModal = function() {
        const modal = document.getElementById('media-picker-modal');
        if (modal) modal.style.display = 'none';
        document.body.classList.remove('modal-active');
    };

    window.setMediaPickerCategory = function(cat) {
        mediaPickerCategory = cat;
        ['all', 'docs', 'images'].forEach(t => {
            const btn = document.getElementById(`media-picker-tab-${t}`);
            if (btn) btn.classList.remove('active');
        });
        const activeTab = cat === 'all' ? 'all' : (cat === 'document' ? 'docs' : 'images');
        const btn = document.getElementById(`media-picker-tab-${activeTab}`);
        if (btn) btn.classList.add('active');
        renderMediaPickerItems();
    };

    window.filterMediaPickerItems = function(q) {
        mediaPickerSearchQuery = (q || '').toLowerCase().trim();
        renderMediaPickerItems();
    };

    function renderMediaPickerItems() {
        const listContainer = document.getElementById('media-picker-items-list');
        if (!listContainer) return;

        let filtered = mediaPickerItems.filter(item => {
            if (mediaPickerCategory !== 'all' && item.category !== mediaPickerCategory) return false;
            if (mediaPickerSearchQuery) {
                const matchTitle = (item.title || '').toLowerCase().includes(mediaPickerSearchQuery);
                const matchDesc = (item.description || '').toLowerCase().includes(mediaPickerSearchQuery);
                const matchFile = (item.fileName || '').toLowerCase().includes(mediaPickerSearchQuery);
                if (!matchTitle && !matchDesc && !matchFile) return false;
            }
            return true;
        });

        // Favoriten immer oben sortieren
        filtered.sort((a, b) => ((b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0)) || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.4); font-size: 0.85rem; padding: 30px;">Keine Dateien gefunden.</div>';
            return;
        }

        let html = '';
        filtered.forEach(m => {
            const isImg = m.category === 'image';
            const encodedUrl = encodeURI(m.filePath);
            const icon = isImg 
                ? `<img src="${encodedUrl}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0;" loading="lazy">` 
                : `<span style="font-size: 1.3rem; flex-shrink: 0;">${m.fileType?.includes('pdf') ? '📕' : '📄'}</span>`;
            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(137,180,250,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'" onclick="selectMediaPickerItem(${m.id}, '${escapeHtml(m.title).replace(/'/g, "\\'")}')">
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                        ${icon}
                        <div style="min-width: 0; flex: 1;">
                            <div style="font-weight: 700; font-size: 0.84rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(m.title)}</div>
                            <div style="font-size: 0.72rem; color: rgba(255,255,255,0.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${escapeHtml(m.fileName)} &bull; ${m.fileSizeFormatted || ''}
                            </div>
                        </div>
                    </div>
                    <button type="button" class="nav-btn" style="background: rgba(137, 180, 250, 0.2); color: #89b4fa; border: 1px solid rgba(137, 180, 250, 0.4); padding: 5px 10px; font-size: 0.75rem; border-radius: 6px; font-weight: 700; flex-shrink: 0;">
                        🔗 Verlinken
                    </button>
                </div>
            `;
        });

        listContainer.innerHTML = html;
    }

    window.selectMediaPickerItem = function(id, title) {
        linkMediaToChat(id, title);
        closeMediaPickerModal();
    };

    window.handleMediaPickerUpload = async function(input) {
        const file = input.files && input.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name);

        try {
            const res = await fetch(getApiUrl('/api/media/upload'), {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                const created = await res.json();
                linkMediaToChat(created.id, created.title || file.name);
                closeMediaPickerModal();
                if (typeof refreshMediaData === 'function') refreshMediaData();
            } else {
                alert('Upload fehlgeschlagen.');
            }
        } catch (e) {
            console.error('Upload-Fehler:', e);
            alert('Netzwerkfehler beim Upload.');
        }
        input.value = '';
    };

})();
