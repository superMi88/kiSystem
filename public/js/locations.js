// ==========================================================================
// Locations & Places Module
// ==========================================================================

(function() {
    window.currentLocationsList = [];
    window.currentLocationsFilter = 'all';
    window.locationSearchQuery = '';

    /**
     * Haupt-Renderfunktion für das Orte-Widget
     */
    function renderLocationsWidget(data, container) {
        if (!container) return;
        window.lastLocationsContainer = container;
        window.lastLocationsData = data;

        const locations = (data && data.locations) ? data.locations : (window.currentLocationsList || []);
        window.currentLocationsList = locations;

        const filter = window.currentLocationsFilter || 'all';
        const query = (window.locationSearchQuery || '').toLowerCase().trim();

        // 1. Filter zählen
        const totalCount = locations.length;
        const residenceCount = locations.filter(l => l.type === 'residence').length;
        const officeCount = locations.filter(l => l.type === 'office').length;
        const regionCount = locations.filter(l => l.type === 'city' || l.type === 'state').length;
        const favCount = locations.filter(l => !!l.isFavorite).length;

        // 2. Gefilterte Liste erstellen
        let filtered = locations.filter(loc => {
            if (filter === 'residence' && loc.type !== 'residence') return false;
            if (filter === 'office' && loc.type !== 'office') return false;
            if (filter === 'city_state' && loc.type !== 'city' && loc.type !== 'state') return false;
            if (filter === 'fav' && !loc.isFavorite) return false;

            if (query) {
                const matchName = (loc.name || '').toLowerCase().includes(query);
                const matchAddr = (loc.formattedAddress || loc.address || '').toLowerCase().includes(query);
                const matchCity = (loc.city || '').toLowerCase().includes(query);
                const matchState = (loc.state || '').toLowerCase().includes(query);
                const matchNotes = (loc.notes || '').toLowerCase().includes(query);
                const matchPerson = (loc.persons || []).some(p => (p.name || '').toLowerCase().includes(query));
                if (!matchName && !matchAddr && !matchCity && !matchState && !matchNotes && !matchPerson) return false;
            }
            return true;
        });

        let html = `
            <div class="locations-dashboard">
                <!-- Filter Pills -->
                <div class="locations-filter-bar">
                    <button type="button" onclick="switchLocationsFilter('all')" class="locations-filter-pill ${filter === 'all' ? 'active' : ''}">
                        <span>✨ Alle</span>
                        <span class="locations-filter-count">${totalCount}</span>
                    </button>
                    <button type="button" onclick="switchLocationsFilter('residence')" class="locations-filter-pill ${filter === 'residence' ? 'active' : ''}">
                        <span>🏠 Wohnsitze</span>
                        <span class="locations-filter-count">${residenceCount}</span>
                    </button>
                    <button type="button" onclick="switchLocationsFilter('office')" class="locations-filter-pill ${filter === 'office' ? 'active' : ''}">
                        <span>🏢 Büros</span>
                        <span class="locations-filter-count">${officeCount}</span>
                    </button>
                    <button type="button" onclick="switchLocationsFilter('city_state')" class="locations-filter-pill ${filter === 'city_state' ? 'active' : ''}">
                        <span>🗺️ Städte & Regionen</span>
                        <span class="locations-filter-count">${regionCount}</span>
                    </button>
                    <button type="button" onclick="switchLocationsFilter('fav')" class="locations-filter-pill ${filter === 'fav' ? 'active' : ''}">
                        <span>⭐ Favoriten</span>
                        <span class="locations-filter-count">${favCount}</span>
                    </button>
                </div>

                <!-- Liste der Orte -->
                <div class="locations-grid">
        `;

        if (filtered.length === 0) {
            html += `
                <div class="locations-empty-state">
                    <span style="font-size: 2.2rem;">📍</span>
                    <h4 style="margin: 0; color: #ffffff;">Keine Orte gefunden</h4>
                    <p style="margin: 0; font-size: 0.8rem; color: rgba(255,255,255,0.6); max-width: 320px;">
                        ${query ? 'Kein Ort passt zu deiner aktuellen Suche.' : 'Erstelle Adressen, Wohnsitze oder Regionen und verbinde sie mit Personen.'}
                    </p>
                    <button type="button" onclick="openLocationEditModal()" class="nav-btn primary" style="margin-top: 6px; padding: 6px 14px; font-size: 0.8rem; border-radius: 8px;">
                        ➕ Neuen Ort erstellen
                    </button>
                </div>
            `;
        } else {
            filtered.forEach(loc => {
                const isFav = !!loc.isFavorite;
                const typeIcon = loc.type === 'residence' ? '🏠' : loc.type === 'office' ? '🏢' : loc.type === 'city' ? '🏙️' : loc.type === 'state' ? '🗺️' : '📍';
                const typeLabel = loc.type === 'residence' ? 'Wohnsitz' : loc.type === 'office' ? 'Büro / Arbeit' : loc.type === 'city' ? 'Stadt' : loc.type === 'state' ? 'Bundesland' : 'Ort';
                const typeClass = loc.type === 'residence' ? 'residence' : loc.type === 'office' ? 'office' : loc.type === 'city' ? 'city' : loc.type === 'state' ? 'state' : 'other';

                const formattedAddr = loc.formattedAddress || loc.address || loc.name;
                const encodedMaps = encodeURIComponent(formattedAddr);
                const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedMaps}`;

                const persons = loc.persons || [];
                const directPersons = persons.filter(p => p.isDirect !== false);
                const regionalPersons = persons.filter(p => p.isDirect === false);

                html += `
                    <div class="location-card" id="location-card-${loc.id}">
                        <div class="location-card-header">
                            <div class="location-title-box">
                                <div class="location-name-line">
                                    <span style="font-size: 1.15rem; line-height: 1;">${typeIcon}</span>
                                    <span class="location-name">${escapeHtml(loc.name)}</span>
                                    <span class="location-type-badge ${typeClass}">${typeLabel}</span>
                                </div>
                                <div class="location-address">
                                    <span>📍 ${escapeHtml(formattedAddr)}</span>
                                    <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="color: #a6e3a1; text-decoration: underline; font-size: 0.72rem; margin-left: 4px;" title="In Google Maps öffnen">
                                        Maps ↗
                                    </a>
                                </div>
                                ${loc.notes ? `<div style="font-size: 0.74rem; color: rgba(255,255,255,0.55); margin-top: 2px;">💡 ${escapeHtml(loc.notes)}</div>` : ''}
                            </div>
                            <div class="location-actions">
                                <button type="button" class="location-action-icon-btn fav ${isFav ? 'active' : ''}" onclick="toggleLocationFavorite(${loc.id}, ${!isFav})" title="${isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}">
                                    ${isFav ? '⭐' : '☆'}
                                </button>
                                <button type="button" class="location-action-icon-btn" onclick="openLocationEditModal(${loc.id})" title="Ort bearbeiten">
                                    ✏️
                                </button>
                                <button type="button" class="location-action-icon-btn" onclick="deleteLocation(${loc.id})" title="Ort löschen" style="color: rgba(243, 139, 168, 0.7);">
                                    🗑️
                                </button>
                            </div>
                        </div>
                `;

                // Personen-Abschnitt
                if (directPersons.length > 0 || regionalPersons.length > 0) {
                    html += `<div class="location-persons-section">`;

                    if (directPersons.length > 0) {
                        html += `
                            <div class="location-persons-label">
                                <span>👤</span> Verknüpfte Personen (${directPersons.length}):
                            </div>
                            <div class="location-persons-list">
                        `;
                        directPersons.forEach(p => {
                            html += `
                                <div class="location-person-chip" onclick="openPersonProfileModal(${p.id})" title="Profil von ${escapeHtml(p.name)} öffnen">
                                    <span>👤</span>
                                    <span>${escapeHtml(p.name)}</span>
                                    <span class="location-person-chip-badge">${escapeHtml(p.label || 'Wohnsitz')}</span>
                                </div>
                            `;
                        });
                        html += `</div>`;
                    }

                    if (regionalPersons.length > 0) {
                        html += `
                            <div class="location-persons-label" style="margin-top: 6px; color: #a6e3a1;">
                                <span>🗺️</span> Personen in diesem ${loc.type === 'state' ? 'Bundesland' : 'Ort'} (${regionalPersons.length}):
                            </div>
                            <div class="location-persons-list">
                        `;
                        regionalPersons.forEach(p => {
                            html += `
                                <div class="location-person-chip regional" onclick="openPersonProfileModal(${p.id})" title="${escapeHtml(p.name)} wohnt in ${escapeHtml(p.originCity || p.originLocationName || loc.name)}">
                                    <span>👤</span>
                                    <span>${escapeHtml(p.name)}</span>
                                    <span class="location-person-chip-badge" style="background: rgba(166, 227, 161, 0.2); color: #a6e3a1;">
                                        ${escapeHtml(p.originCity || p.originLocationName || 'Hier')}
                                    </span>
                                </div>
                            `;
                        });
                        html += `</div>`;
                    }

                    html += `</div>`;
                }

                html += `</div>`; // location-card
            });
        }

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    window.renderLocationsWidget = renderLocationsWidget;

    /**
     * Filter wechseln
     */
    window.switchLocationsFilter = function(filter) {
        window.currentLocationsFilter = filter;
        if (window.lastLocationsContainer) {
            renderLocationsWidget(window.lastLocationsData, window.lastLocationsContainer);
        }
    };

    /**
     * Suche filtern
     */
    window.filterLocationsBySearch = function(query) {
        window.locationSearchQuery = query;
        if (window.lastLocationsContainer) {
            renderLocationsWidget(window.lastLocationsData, window.lastLocationsContainer);
        }
    };

    /**
     * Suchleiste im Header togglen
     */
    window.toggleHeaderLocationsSearch = function() {
        const searchBar = document.getElementById('header-locations-search-bar');
        const defaultBar = document.getElementById('header-locations-default-bar');
        const input = document.getElementById('header-locations-search-input');
        if (!searchBar || !defaultBar) return;

        if (searchBar.style.display === 'none' || !searchBar.style.display) {
            searchBar.style.display = 'flex';
            defaultBar.style.display = 'none';
            if (input) {
                input.focus();
                input.value = window.locationSearchQuery || '';
            }
        } else {
            searchBar.style.display = 'none';
            defaultBar.style.display = 'flex';
            if (input) input.value = '';
            filterLocationsBySearch('');
        }
    };

    /**
     * Zu Orten navigieren (Drawer)
     */
    window.handleDrawerLocations = function() {
        closeMobileDrawer();
        if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
            closeMailReadModal();
        }
        focusWidget('locations');
    };

    /**
     * Favorit umschalten
     */
    window.toggleLocationFavorite = async function(id, isFav) {
        try {
            const res = await fetch(getApiUrl(`/api/locations/${id}/favorite`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFavorite: isFav })
            });
            if (res.ok) {
                await refreshLocationsData();
            }
        } catch (e) {
            console.error('Fehler beim Aktualisieren des Favoritenstatus:', e);
        }
    };

    /**
     * Ort löschen
     */
    window.deleteLocation = async function(id) {
        if (!confirm('Möchtest du diesen Ort wirklich löschen?')) return;
        try {
            const res = await fetch(getApiUrl(`/api/locations/${id}`), {
                method: 'DELETE'
            });
            if (res.ok) {
                await refreshLocationsData();
            }
        } catch (e) {
            console.error('Fehler beim Löschen des Ortes:', e);
        }
    };

    /**
     * Daten neu laden
     */
    async function refreshLocationsData() {
        if (typeof loadTopWidgets === 'function') {
            await loadTopWidgets();
        } else {
            const res = await fetch(getApiUrl('/api/locations'));
            const list = await res.json();
            window.currentLocationsList = list;
            if (window.lastLocationsContainer) {
                renderLocationsWidget({ locations: list }, window.lastLocationsContainer);
            }
        }
    }
    window.refreshLocationsData = refreshLocationsData;

    /**
     * Ort erstellen / bearbeiten Modal öffnen
     */
    window.openLocationEditModal = async function(id, prefillPersonId) {
        const modal = document.getElementById('location-edit-modal');
        if (!modal) return;

        // Reset fields
        document.getElementById('location-edit-id').value = id || '';
        document.getElementById('location-edit-name').value = '';
        document.getElementById('location-edit-type').value = 'residence';
        document.getElementById('location-edit-address').value = '';
        document.getElementById('location-edit-postal').value = '';
        document.getElementById('location-edit-city').value = '';
        document.getElementById('location-edit-state').value = '';
        document.getElementById('location-edit-country').value = 'Deutschland';
        document.getElementById('location-edit-notes').value = '';

        const titleEl = document.getElementById('location-edit-modal-title');
        titleEl.textContent = id ? '📍 Ort bearbeiten' : '📍 Neuen Ort erstellen';

        // Personen-Auswahl vorbereiten
        await populatePeopleDropdownForLocation(prefillPersonId);

        const personsSection = document.getElementById('location-edit-persons-section');
        if (personsSection) {
            personsSection.style.display = id ? 'block' : 'block';
        }

        const personsListEl = document.getElementById('location-edit-linked-persons-list');
        if (personsListEl) personsListEl.innerHTML = '';

        if (id) {
            try {
                const res = await fetch(getApiUrl(`/api/locations/${id}`));
                if (res.ok) {
                    const loc = await res.json();
                    document.getElementById('location-edit-name').value = loc.name || '';
                    document.getElementById('location-edit-type').value = loc.type || 'residence';
                    document.getElementById('location-edit-address').value = loc.address || '';
                    document.getElementById('location-edit-postal').value = loc.postalCode || '';
                    document.getElementById('location-edit-city').value = loc.city || '';
                    document.getElementById('location-edit-state').value = loc.state || '';
                    document.getElementById('location-edit-country').value = loc.country || 'Deutschland';
                    document.getElementById('location-edit-notes').value = loc.notes || '';

                    // Liste der verknüpften Personen rendern
                    renderLinkedPersonsInModal(loc.id, loc.persons || []);
                }
            } catch (e) {
                console.error('Fehler beim Laden der Ortsdetails:', e);
            }
        }

        modal.style.display = 'flex';
        document.body.classList.add('modal-active');
    };

    window.closeLocationEditModal = function() {
        const modal = document.getElementById('location-edit-modal');
        if (modal) modal.style.display = 'none';
        document.body.classList.remove('modal-active');
    };

    /**
     * Personen in Dropdown laden
     */
    async function populatePeopleDropdownForLocation(prefillPersonId) {
        const select = document.getElementById('location-person-select');
        if (!select) return;

        try {
            const res = await fetch(getApiUrl('/api/memory/people'));
            const people = await res.json();
            let options = '<option value="">-- Person auswählen (optional) --</option>';
            people.forEach(p => {
                const isSelected = prefillPersonId && Number(prefillPersonId) === p.id;
                options += `<option value="${p.id}" ${isSelected ? 'selected' : ''}>👤 ${escapeHtml(p.name)}</option>`;
            });
            select.innerHTML = options;
        } catch (e) {
            console.error('Fehler beim Laden der Personen für Dropdown:', e);
        }
    }

    /**
     * Verknüpfte Personen in Modal rendern
     */
    function renderLinkedPersonsInModal(locationId, persons) {
        const container = document.getElementById('location-edit-linked-persons-list');
        if (!container) return;

        const direct = persons.filter(p => p.isDirect !== false);
        if (direct.length === 0) {
            container.innerHTML = '<span style="font-size: 0.75rem; color: rgba(255,255,255,0.4);">Noch keine Personen direkt mit diesem Ort verknüpft.</span>';
            return;
        }

        let html = '';
        direct.forEach(p => {
            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: rgba(255,255,255,0.04); border-radius: 6px; font-size: 0.78rem;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span>👤</span>
                        <strong style="color: #ffffff;">${escapeHtml(p.name)}</strong>
                        <span style="font-size: 0.68rem; color: #a6e3a1; background: rgba(166,227,161,0.15); padding: 1px 5px; border-radius: 4px;">${escapeHtml(p.label || p.relationType || 'Wohnsitz')}</span>
                    </div>
                    <button type="button" onclick="unlinkPersonFromLocation(${locationId}, ${p.id})" style="background: none; border: none; color: rgba(243,139,168,0.8); cursor: pointer; font-size: 0.9rem;" title="Verknüpfung lösen">
                        ✕
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    /**
     * Person von Ort entkoppeln
     */
    window.unlinkPersonFromLocation = async function(locationId, personId) {
        try {
            const res = await fetch(getApiUrl(`/api/locations/${locationId}/persons/${personId}`), {
                method: 'DELETE'
            });
            if (res.ok) {
                const data = await res.json();
                renderLinkedPersonsInModal(locationId, data.persons || []);
                await refreshLocationsData();
            }
        } catch (e) {
            console.error('Fehler beim Entkoppeln der Person:', e);
        }
    };

    /**
     * Person im Modal zum Ort hinzufügen
     */
    window.linkSelectedPersonToLocation = async function() {
        const locationId = Number(document.getElementById('location-edit-id').value);
        const personId = Number(document.getElementById('location-person-select').value);
        const relationType = document.getElementById('location-person-rel-type').value;
        const label = document.getElementById('location-person-label').value.trim();

        if (!locationId) {
            alert('Bitte speichere den Ort zuerst, bevor du Personen hinzufügst.');
            return;
        }
        if (!personId) {
            alert('Bitte wähle eine Person aus.');
            return;
        }

        try {
            const res = await fetch(getApiUrl(`/api/locations/${locationId}/persons`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personId, relationType, label, isPrimary: true })
            });
            if (res.ok) {
                const data = await res.json();
                renderLinkedPersonsInModal(locationId, data.persons || []);
                document.getElementById('location-person-select').value = '';
                document.getElementById('location-person-label').value = '';
                await refreshLocationsData();
            }
        } catch (e) {
            console.error('Fehler beim Verknüpfen der Person:', e);
        }
    };

    /**
     * Ort im Modal speichern
     */
    window.saveLocationEditModal = async function() {
        const id = document.getElementById('location-edit-id').value;
        const name = document.getElementById('location-edit-name').value.trim();
        const type = document.getElementById('location-edit-type').value;
        const address = document.getElementById('location-edit-address').value.trim();
        const postalCode = document.getElementById('location-edit-postal').value.trim();
        const city = document.getElementById('location-edit-city').value.trim();
        const state = document.getElementById('location-edit-state').value.trim();
        const country = document.getElementById('location-edit-country').value.trim() || 'Deutschland';
        const notes = document.getElementById('location-edit-notes').value.trim();

        const personId = document.getElementById('location-person-select') ? document.getElementById('location-person-select').value : '';
        const relationType = document.getElementById('location-person-rel-type') ? document.getElementById('location-person-rel-type').value : 'residence';
        const label = document.getElementById('location-person-label') ? document.getElementById('location-person-label').value.trim() : '';

        if (!name) {
            alert('Bitte gib einen Namen für den Ort ein.');
            return;
        }

        const payload = {
            name,
            type,
            address,
            postalCode,
            city,
            state,
            country,
            notes,
            ...(personId && !id ? { personId: Number(personId), relationType, label, isPrimary: true } : {})
        };

        try {
            const url = id ? `/api/locations/${id}` : '/api/locations';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(getApiUrl(url), {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                closeLocationEditModal();
                await refreshLocationsData();
            } else {
                const err = await res.json();
                alert(`Fehler beim Speichern: ${err.error || 'Unbekannter Fehler'}`);
            }
        } catch (e) {
            console.error('Fehler beim Speichern des Ortes:', e);
            alert('Netzwerkfehler beim Speichern des Ortes.');
        }
    };

    /**
     * Orte einer Person für das Personenprofil-Modal laden
     */
    window.loadPersonLocationsIntoModal = async function(personId) {
        const container = document.getElementById('person-profile-locations-list');
        if (!container) return;

        container.innerHTML = '<span style="font-size: 0.75rem; opacity: 0.5;">Lade Orte...</span>';

        try {
            const res = await fetch(getApiUrl(`/api/persons/${personId}/locations`));
            if (!res.ok) {
                container.innerHTML = '<span style="font-size: 0.75rem; color: var(--off);">Konnte Orte nicht laden.</span>';
                return;
            }
            const list = await res.json();

            if (list.length === 0) {
                container.innerHTML = `
                    <div style="font-size: 0.76rem; color: rgba(255,255,255,0.45); padding: 6px 0;">
                        Noch keine Adressen oder Wohnsitze für diese Person hinterlegt.
                    </div>
                `;
                return;
            }

            let html = '<div style="display: flex; flex-direction: column; gap: 6px;">';
            list.forEach(item => {
                const loc = item.location;
                const typeIcon = loc.type === 'residence' ? '🏠' : loc.type === 'office' ? '🏢' : loc.type === 'city' ? '🏙️' : '📍';
                const formatted = loc.formattedAddress || loc.address || loc.name;
                const encodedMaps = encodeURIComponent(formatted);

                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; gap: 8px;">
                        <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                            <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                                <span>${typeIcon}</span>
                                <strong style="color: #ffffff; font-size: 0.82rem;">${escapeHtml(loc.name)}</strong>
                                <span style="font-size: 0.65rem; color: #a6e3a1; background: rgba(166,227,161,0.15); padding: 1px 6px; border-radius: 10px; font-weight: 700;">
                                    ${escapeHtml(item.label || item.relationType)}
                                </span>
                                ${item.isPrimary ? '<span style="font-size: 0.65rem; color: #cba6f7; background: rgba(203,166,247,0.15); padding: 1px 5px; border-radius: 6px;">Hauptwohnsitz</span>' : ''}
                            </div>
                            <div style="font-size: 0.74rem; color: rgba(255,255,255,0.65); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                📍 ${escapeHtml(formatted)}
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                            <a href="https://www.google.com/maps/search/?api=1&query=${encodedMaps}" target="_blank" rel="noopener noreferrer" style="font-size: 0.72rem; color: #a6e3a1; text-decoration: underline;" title="In Maps öffnen">Maps ↗</a>
                            <button type="button" onclick="unlinkPersonFromLocation(${loc.id}, ${personId}); loadPersonLocationsIntoModal(${personId});" style="background: none; border: none; color: rgba(243,139,168,0.7); cursor: pointer; font-size: 0.85rem;" title="Verknüpfung lösen">✕</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            container.innerHTML = html;
        } catch (e) {
            console.error('Fehler beim Laden der Personenorte:', e);
            container.innerHTML = '<span style="font-size: 0.75rem; color: var(--off);">Fehler beim Laden.</span>';
        }
    };

    /**
     * Button "+ Ort verknüpfen" im Personenprofil
     */
    window.openAddLocationForPersonModal = function(personId) {
        openLocationEditModal(null, personId);
    };

})();
