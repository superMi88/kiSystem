

        // =========================================================================
        // Event Detail & Edit Modal Functions
        // =========================================================================

        // =========================================================================
        // Entity Picker Data & Helpers (Persons, Locations, Media)
        // =========================================================================
        let cachedPickerPeople = null;
        let cachedPickerLocations = null;
        let cachedPickerMedia = null;

        async function loadEntityPickerData(forceRefresh = false) {
            try {
                const promises = [];
                if (!cachedPickerPeople || forceRefresh) {
                    promises.push(fetch(getApiUrl('/api/memory/people')).then(r => r.ok ? r.json() : []).then(d => { cachedPickerPeople = d; }));
                }
                if (!cachedPickerLocations || forceRefresh) {
                    promises.push(fetch(getApiUrl('/api/locations')).then(r => r.ok ? r.json() : []).then(d => { cachedPickerLocations = d; }));
                }
                if (!cachedPickerMedia || forceRefresh) {
                    promises.push(fetch(getApiUrl('/api/media')).then(r => r.ok ? r.json() : []).then(d => { cachedPickerMedia = d; }));
                }
                await Promise.all(promises);
            } catch (err) {
                console.error("Fehler beim Laden von Entitäten für Picker:", err);
            }
        }

        function renderPickerChips(containerId, items, selectedIds = [], type = 'person') {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (!items || items.length === 0) {
                container.innerHTML = `<span style="font-size: 0.72rem; color: rgba(255,255,255,0.4);">Keine ${type === 'person' ? 'Personen' : 'Dokumente/Bilder'} vorhanden</span>`;
                return;
            }
            const selSet = new Set((selectedIds || []).map(id => Number(id)));
            container.innerHTML = items.map(item => {
                const id = item.id;
                const isSel = selSet.has(Number(id));
                const isImg = item.category === 'image' || (item.mimeType && item.mimeType.startsWith('image/')) || /\.(jpe?g|png|gif|webp|svg)$/i.test(item.fileName || '');
                const icon = type === 'person' ? '👤' : (isImg ? '🖼️' : '📄');
                const label = type === 'person' ? (item.name || `Person #${id}`) : (item.title || item.fileName || `Datei #${id}`);
                return `<div class="entity-picker-chip ${type} ${isSel ? 'selected' : ''}" data-id="${id}" onclick="this.classList.toggle('selected')">
                    <span>${icon}</span>
                    <span>${escapeHtml(label)}</span>
                </div>`;
            }).join('');
        }

        function getSelectedChipIds(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return [];
            const chips = container.querySelectorAll('.entity-picker-chip.selected');
            const ids = [];
            chips.forEach(c => {
                const id = Number(c.getAttribute('data-id'));
                if (!isNaN(id)) ids.push(id);
            });
            return ids;
        }

        function populateLocationSelect(selectId, locations, selectedId = null) {
            const selectEl = document.getElementById(selectId);
            if (!selectEl) return;
            let optionsHtml = '<option value="">-- Kein gespeicherter Ort zugeordnet --</option>';
            if (locations && locations.length > 0) {
                optionsHtml += locations.map(loc => {
                    const sel = Number(selectedId) === Number(loc.id) ? 'selected' : '';
                    const name = loc.name || loc.formattedAddress || `Ort #${loc.id}`;
                    return `<option value="${loc.id}" ${sel}>📍 ${escapeHtml(name)}</option>`;
                }).join('');
            }
            selectEl.innerHTML = optionsHtml;
        }

        window.handleEventLocationSelectChange = function(selectEl) {
            const locId = selectEl.value;
            const locInput = document.getElementById('event-edit-location-input');
            if (!locId) return;
            const loc = (cachedPickerLocations || []).find(l => String(l.id) === String(locId));
            if (loc && locInput) {
                locInput.value = loc.formattedAddress || loc.address || loc.name || '';
            }
        };

        window.openEventDetailModal = function(eventId, title, start, end, isAllDay, fuzzyTime, description, isRecurring, occurrenceDate, persons = [], isCancelled = false, cancellationReason = '', location = '', locationId = null, locationObj = null, media = []) {
            const modal = document.getElementById('event-detail-modal');
            if (Array.isArray(persons)) {
                persons = persons.map(p => p.person ? { id: p.person.id, name: (p.person.aliases?.find(a => a.isPrimary) || p.person.aliases?.[0])?.name || (p.person.isOwner ? 'Ich' : `Person #${p.person.id}`) } : p);
            }
            if (Array.isArray(media)) {
                media = media.map(m => m.media ? m.media : m);
            }
            if (!modal) return;

            document.getElementById('event-detail-id').value = eventId || '';
            document.getElementById('event-detail-date').value = occurrenceDate || (start ? start.split('T')[0] : '');
            document.getElementById('event-detail-is-rec').value = isRecurring ? 'true' : 'false';

            document.getElementById('event-detail-title').textContent = title || 'Termin';

            // Format time
            let timeText = '';
            const startDateObj = start ? new Date(start) : null;
            const endDateObj = end ? new Date(end) : null;
            
            if (isAllDay) {
                timeText = (startDateObj && !isNaN(startDateObj.getTime()) ? startDateObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : occurrenceDate) + ' (Ganztägig)';
            } else if (fuzzyTime) {
                timeText = (startDateObj && !isNaN(startDateObj.getTime()) ? startDateObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : occurrenceDate) + ` (${fuzzyTime})`;
            } else if (startDateObj && !isNaN(startDateObj.getTime())) {
                const datePart = startDateObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                const startPart = startDateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                const endPart = (endDateObj && !isNaN(endDateObj.getTime())) ? ' - ' + endDateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : ' Uhr';
                timeText = `${datePart}, ${startPart}${endPart}`;
            } else {
                timeText = occurrenceDate || 'Keine Zeitangabe';
            }
            document.getElementById('event-detail-time').textContent = timeText;

            // Location
            const locSection = document.getElementById('event-detail-location-section');
            if (locSection) {
                const locName = (locationObj && (locationObj.name || locationObj.formattedAddress)) || location || '';
                const locId = locationId || (locationObj ? locationObj.id : null);
                if (locName && locName.trim()) {
                    locSection.style.display = 'flex';
                    const locText = document.getElementById('event-detail-location-text');
                    if (locText) {
                        if (locId) {
                            locText.innerHTML = `<span class="meta-chip location" onclick="closeEventDetailModal(); handleEntityClick(event, 'location', ${locId});">📍 ${escapeHtml(locName)}</span>`;
                        } else {
                            locText.textContent = `📍 ${locName}`;
                        }
                    }
                    const mapsLink = document.getElementById('event-detail-maps-link');
                    if (mapsLink) mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locName)}`;
                } else {
                    locSection.style.display = 'none';
                }
            }

            // Status box
            const statusBox = document.getElementById('event-detail-status-box');
            if (isCancelled) {
                statusBox.style.display = 'block';
                statusBox.innerHTML = `<div style="background: rgba(243, 139, 168, 0.15); border: 1px solid rgba(243, 139, 168, 0.4); color: var(--off); padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: bold;">⚠️ Ausgefallen ${cancellationReason ? `(${escapeHtml(cancellationReason)})` : ''}</div>`;
            } else {
                statusBox.style.display = 'none';
                statusBox.innerHTML = '';
            }

            // Recurrence
            const recSection = document.getElementById('event-detail-rec-section');
            if (isRecurring) {
                recSection.style.display = 'flex';
                document.getElementById('event-detail-recurrence').textContent = '🔄 Wiederkehrender Termin';
            } else {
                recSection.style.display = 'none';
            }

            // Persons
            const personsSection = document.getElementById('event-detail-persons-section');
            const personsContainer = document.getElementById('event-detail-persons');
            if (personsSection && personsContainer) {
                if (persons && persons.length > 0) {
                    personsSection.style.display = 'flex';
                    personsContainer.innerHTML = persons.map(p => `
                        <span class="meta-chip person" onclick="closeEventDetailModal(); openPersonProfileModal(${p.id});">
                            👤 ${escapeHtml(p.name)}
                        </span>
                    `).join('');
                } else {
                    personsSection.style.display = 'none';
                    personsContainer.innerHTML = '';
                }
            }

            // Media & Documents
            const mediaSection = document.getElementById('event-detail-media-section');
            const mediaContainer = document.getElementById('event-detail-media');
            if (mediaSection && mediaContainer) {
                if (media && media.length > 0) {
                    mediaSection.style.display = 'flex';
                    mediaContainer.innerHTML = media.map(m => {
                        const isImg = m.category === 'image' || (m.mimeType && m.mimeType.startsWith('image/')) || /\.(jpe?g|png|gif|webp|svg)$/i.test(m.fileName || '');
                        return `
                            <span class="meta-chip media" onclick="closeEventDetailModal(); handleEntityClick(event, 'media', ${m.id});">
                                ${isImg ? '🖼️' : '📄'} ${escapeHtml(m.title || m.fileName || 'Datei')}
                            </span>
                        `;
                    }).join('');
                } else {
                    mediaSection.style.display = 'none';
                    mediaContainer.innerHTML = '';
                }
            }

            // Description
            const descEl = document.getElementById('event-detail-description');
            if (description && description.trim()) {
                descEl.textContent = description;
                descEl.style.opacity = '1';
            } else {
                descEl.textContent = 'Keine zusätzliche Beschreibung vorhanden.';
                descEl.style.opacity = '0.5';
            }

            // Buttons
            document.getElementById('event-detail-link-btn').onclick = () => {
                insertEntityLinkIntoChat(title, 'event', eventId);
                closeEventDetailModal();
            };

            document.getElementById('event-detail-delete-btn').onclick = () => {
                closeEventDetailModal();
                if (typeof window.deleteCalendarEvent === 'function') {
                    window.deleteCalendarEvent(eventId, occurrenceDate, isRecurring);
                } else if (typeof deleteCalendarEvent === 'function') {
                    deleteCalendarEvent(eventId, occurrenceDate, isRecurring);
                }
            };

            document.getElementById('event-detail-edit-btn').onclick = () => {
                closeEventDetailModal();
                const personIds = (persons || []).map(p => p.id);
                const mediaIds = (media || []).map(m => m.id);
                const locId = locationId || (locationObj ? locationObj.id : null);
                openEventEditModal(eventId, title, start, end, isAllDay, fuzzyTime, description, isRecurring, occurrenceDate, false, location, locId, personIds, mediaIds);
            };

            modal.style.display = 'block';
            document.body.classList.add('modal-active');
        };



        window.closeEventDetailModal = function() {
            const modal = document.getElementById('event-detail-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };



        window.openEventDetailModalFromData = function(data) {
            let persons = [];
            try {
                if (data.eventPersons) {
                    persons = JSON.parse(data.eventPersons);
                } else if (data.personId && data.personName) {
                    persons = [{ id: Number(data.personId), name: data.personName }];
                }
            } catch(e) {}

            let media = [];
            try {
                if (data.eventMedia) {
                    media = JSON.parse(data.eventMedia);
                }
            } catch(e) {}

            let locationObj = null;
            try {
                if (data.eventLocationObj) {
                    locationObj = JSON.parse(data.eventLocationObj);
                }
            } catch(e) {}

            openEventDetailModal(
                data.eventId || data.linkId,
                data.eventTitle || data.linkLabel,
                data.eventStart,
                data.eventEnd,
                data.eventIsAllday === 'true' || data.eventIsAllday === true,
                data.eventFuzzy || '',
                data.eventDesc || '',
                data.eventIsRec === 'true' || data.eventIsRec === true,
                data.eventDate || '',
                persons,
                data.eventIscancelled === 'true' || data.eventIscancelled === true,
                data.eventCancelreason || '',
                data.eventLocation || data.location || '',
                data.eventLocationId ? Number(data.eventLocationId) : (locationObj ? locationObj.id : null),
                locationObj,
                media
            );
        };



        window.openEventEditModal = function(eventId = null, title = '', start = '', end = '', isAllDay = false, fuzzyTime = '', description = '', isRecurring = false, occurrenceDate = '', isPlanned = false, location = '', locationId = null, personIds = [], mediaIds = []) {
            const modal = document.getElementById('event-edit-modal');
            if (!modal) return;

            document.getElementById('event-edit-id').value = eventId || '';
            document.getElementById('event-edit-occurrence-date').value = occurrenceDate || '';
            document.getElementById('event-edit-is-rec').value = isRecurring ? 'true' : 'false';

            document.getElementById('event-edit-modal-title').textContent = eventId ? 'Termin bearbeiten' : 'Neuer Termin';
            document.getElementById('event-edit-title-input').value = title || '';
            document.getElementById('event-edit-desc-input').value = description || '';

            const locationInput = document.getElementById('event-edit-location-input');
            if (locationInput) locationInput.value = location || '';

            const plannedInput = document.getElementById('event-edit-planned-input');
            if (plannedInput) plannedInput.checked = !!isPlanned;

            const dateInput = document.getElementById('event-edit-date-input');
            const fuzzyInput = document.getElementById('event-edit-fuzzy-input');
            const startTimeInput = document.getElementById('event-edit-start-time');
            const endTimeInput = document.getElementById('event-edit-end-time');
            const allDayInput = document.getElementById('event-edit-allday-input');

            allDayInput.checked = !!isAllDay;
            fuzzyInput.value = fuzzyTime || '';

            if (start) {
                const startObj = new Date(start);
                if (!isNaN(startObj.getTime())) {
                    dateInput.value = startObj.toISOString().split('T')[0];
                    startTimeInput.value = startObj.toTimeString().substring(0, 5);
                } else {
                    dateInput.value = occurrenceDate || getLocalDateString();
                    startTimeInput.value = '10:00';
                }
            } else {
                dateInput.value = occurrenceDate || getLocalDateString();
                startTimeInput.value = '10:00';
            }

            if (end) {
                const endObj = new Date(end);
                if (!isNaN(endObj.getTime())) {
                    endTimeInput.value = endObj.toTimeString().substring(0, 5);
                } else {
                    endTimeInput.value = '11:00';
                }
            } else {
                endTimeInput.value = '11:00';
            }

            const delBtn = document.getElementById('event-edit-delete-btn');
            if (delBtn) delBtn.style.display = eventId ? 'block' : 'none';

            // Populate Entity Pickers (Locations, Persons, Media)
            loadEntityPickerData().then(() => {
                populateLocationSelect('event-edit-location-select', cachedPickerLocations, locationId);
                renderPickerChips('event-edit-persons-container', cachedPickerPeople, personIds, 'person');
                renderPickerChips('event-edit-media-container', cachedPickerMedia, mediaIds, 'media');
            });

            modal.style.display = 'block';
            document.body.classList.add('modal-active');
        };

        window.deleteEventFromEditModal = function() {
            const eventId = document.getElementById('event-edit-id').value;
            const occDate = document.getElementById('event-edit-occurrence-date').value;
            const isRec = document.getElementById('event-edit-is-rec').value === 'true';
            if (!eventId) return;
            closeEventEditModal();
            if (typeof window.deleteCalendarEvent === 'function') {
                window.deleteCalendarEvent(eventId, occDate, isRec);
            } else if (typeof deleteCalendarEvent === 'function') {
                deleteCalendarEvent(eventId, occDate, isRec);
            }
        };

        window.closeEventEditModal = function() {
            const modal = document.getElementById('event-edit-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
            window.pendingEventNotificationDismiss = null;
            window.editingEventProposalNotifId = null;
        };



        window.saveEventFromModal = async function() {
            const id = document.getElementById('event-edit-id').value;
            const occurrenceDate = document.getElementById('event-edit-occurrence-date').value;
            const isRecurring = document.getElementById('event-edit-is-rec').value === 'true';
            const title = document.getElementById('event-edit-title-input').value.trim();
            const dateVal = document.getElementById('event-edit-date-input').value;
            const fuzzyVal = document.getElementById('event-edit-fuzzy-input').value;
            const startTime = document.getElementById('event-edit-start-time').value;
            const endTime = document.getElementById('event-edit-end-time').value;
            const isAllDay = document.getElementById('event-edit-allday-input').checked;
            const desc = document.getElementById('event-edit-desc-input').value.trim();
            const locationVal = document.getElementById('event-edit-location-input') ? document.getElementById('event-edit-location-input').value.trim() : '';

            if (!title) {
                alert("Bitte einen Titel für den Termin angeben.");
                return;
            }
            if (!dateVal) {
                alert("Bitte ein Datum angeben.");
                return;
            }

                        let startIso = `${dateVal}T${startTime || '00:00'}:00`;
            let endIso = `${dateVal}T${endTime || '01:00'}:00`;
            const isPlanned = document.getElementById('event-edit-planned-input')?.checked || false;

            if (window.editingEventProposalNotifId) {
                const notifId = window.editingEventProposalNotifId;
                window.editingEventProposalNotifId = null;
                closeEventEditModal();

                try {
                    const notifRes = await fetch(getApiUrl(`/api/notifications/${notifId}`));
                    let actData = {};
                    if (notifRes.ok) {
                        const notif = await notifRes.json();
                        actData = notif.actionData;
                        if (typeof actData === 'string') {
                            try { actData = JSON.parse(actData); } catch (_) {}
                        }
                    }
                    actData = actData || {};
                    actData.actionType = 'create_event';
                    actData.eventData = {
                        ...(actData.eventData || {}),
                        title,
                        date: dateVal,
                        startTime: isAllDay ? null : (startTime || null),
                        endTime: isAllDay ? null : (endTime || null),
                        isAllDay,
                        description: desc || null,
                        location: locationVal || null
                    };

                    await fetch(getApiUrl(`/api/notifications/${notifId}`), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: `📅 ${title}`,
                            actionData: actData
                        })
                    });

                    if (typeof loadTopWidgets === 'function') loadTopWidgets();
                    if (typeof currentConversationId !== 'undefined' && currentConversationId && typeof loadConversationNotifications === 'function') {
                        loadConversationNotifications(currentConversationId);
                    }
                } catch (err) {
                    console.error("Fehler beim Aktualisieren des Terminvorschlags:", err);
                    alert("Fehler beim Aktualisieren des Terminvorschlags.");
                }
                return;
            }

            closeEventEditModal();

            try {
                if (id) {
                    let nurDiesesVorkommen = false;
                    if (isRecurring) {
                        nurDiesesVorkommen = confirm("Möchtest du NUR DIESES EINE VORKOMMEN bearbeiten?\n\n(OK = Nur dieses Vorkommen, Abbrechen = Gesamte Serie)");
                    }
                    const locSelect = document.getElementById('event-edit-location-select');
                    const selectedLocId = locSelect && locSelect.value ? Number(locSelect.value) : null;
                    const selectedPersonIds = getSelectedChipIds('event-edit-persons-container');
                    const selectedMediaIds = getSelectedChipIds('event-edit-media-container');

                    await callTool('bearbeite_termin', {
                        eventId: String(id),
                        datum: occurrenceDate || dateVal,
                        nurDiesesVorkommen: nurDiesesVorkommen,
                        neuer_titel: title,
                        neues_datum: startIso,
                        neues_enddatum: endIso,
                        neue_beschreibung: desc,
                        ganztaegig: isAllDay,
                        tageszeit: fuzzyVal || undefined,
                        inPlanung: isPlanned,
                        standort: locationVal,
                        locationId: selectedLocId || undefined,
                        personIds: selectedPersonIds,
                        mediaIds: selectedMediaIds
                    });
                } else {
                    const locSelect = document.getElementById('event-edit-location-select');
                    const selectedLocId = locSelect && locSelect.value ? Number(locSelect.value) : null;
                    const selectedPersonIds = getSelectedChipIds('event-edit-persons-container');
                    const selectedMediaIds = getSelectedChipIds('event-edit-media-container');

                    await callTool('fuege_termin_hinzu', {
                        titel: title,
                        datum: startIso,
                        enddatum: endIso,
                        beschreibung: desc,
                        ganztaegig: isAllDay,
                        tageszeit: fuzzyVal || undefined,
                        inPlanung: isPlanned,
                        standort: locationVal,
                        locationId: selectedLocId || undefined,
                        personIds: selectedPersonIds,
                        mediaIds: selectedMediaIds
                    });
                }
                loadTopWidgets();

                if (window.pendingEventNotificationDismiss) {
                    const pendingDismiss = window.pendingEventNotificationDismiss;
                    window.pendingEventNotificationDismiss = null;
                    if (pendingDismiss.notifId) {
                        try {
                            await fetch(getApiUrl(`/api/notifications/${pendingDismiss.notifId}/dismiss`), { method: 'POST' });
                        } catch (_) {}
                    }
                    if (pendingDismiss.cardEl) {
                        pendingDismiss.cardEl.classList.add('dismissed');
                        const statusContainer = pendingDismiss.cardEl.querySelector('.chat-notification-status-container');
                        if (statusContainer) {
                            statusContainer.innerHTML = '<span class="chat-notification-status" style="background: rgba(166, 227, 161, 0.15); color: #a6e3a1; border: 1px solid rgba(166, 227, 161, 0.3);">✅ Im Kalender angelegt</span>';
                        }
                        pendingDismiss.cardEl.querySelectorAll('.chat-notification-btn').forEach(b => b.disabled = true);
                    }
                    if (typeof loadTopWidgets === 'function') loadTopWidgets();
                    if (typeof isElectron !== 'undefined' && isElectron && typeof ipcRenderer !== 'undefined' && ipcRenderer) {
                        ipcRenderer.send('widgets-updated');
                    }
                }
            } catch(e) {
                console.error("Fehler beim Speichern des Termins:", e);
                alert("Fehler beim Speichern des Termins.");
            }
        };



        window.switchTravelEventMode = async function(eventId, travelMode) {
            try {
                const cleanId = String(eventId).replace('rec-', '');
                const numericId = Number(cleanId);
                if (isNaN(numericId)) {
                    alert("Ungültige Termin-ID.");
                    return;
                }

                // Visual button feedback immediately
                const clickedBtns = document.querySelectorAll(`[onclick*="switchTravelEventMode('${eventId}'"][onclick*="'${travelMode}'"], [onclick*="selectEventTravelMode('${eventId}'"][onclick*="'${travelMode}'"]`);
                clickedBtns.forEach(btn => {
                    if (btn.parentElement) {
                        btn.parentElement.querySelectorAll('.mode-switch-btn, .route-choice-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    }
                });

                const res = await fetch(getApiUrl('/api/routes/switch-travel-event-mode'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        eventId: numericId,
                        travelMode
                    })
                });
                const data = await res.json();
                if (data.success) {
                    const targetDate = window.currentCalendarDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);
                    if (window.calendarTimelineCache) {
                        delete window.calendarTimelineCache[targetDate];
                    }
                    if (typeof jumpToTimelineDate === 'function') {
                        await jumpToTimelineDate(targetDate);
                    }
                    if (typeof loadTopWidgets === 'function') {
                        loadTopWidgets();
                    }
                } else {
                    alert("Fehler beim Wechseln des Reisemittels: " + (data.error || 'Unbekannter Fehler'));
                }
            } catch (err) {
                console.error("Fehler bei switchTravelEventMode:", err);
                alert("Verbindungsfehler beim Berechnen der Route.");
            }
        };
        window.selectEventTravelMode = window.switchTravelEventMode;



        window.renderTransitItineraryHtml = function(ev, locA, locB, travelMins, gMapsUrl) {
            let transitInfo = ev.travelTransitDetails;
            try {
                if (typeof transitInfo === 'string') transitInfo = JSON.parse(transitInfo);
            } catch (_) {}

            const currentMode = ev.travelMode || (
                (ev.title && ev.title.includes('🚗')) ? 'driving' :
                (ev.title && (ev.title.includes('🚆') || /bahn|zug|s-bahn|s\d+/i.test(ev.title))) ? 'transit' :
                (ev.title && (ev.title.includes('🚲') || /rad|fahrrad/i.test(ev.title))) ? 'bicycling' :
                (ev.title && (ev.title.includes('🚶') || /fuß|fuss/i.test(ev.title))) ? 'walking' : 'transit'
            );

            const originName = locA || ev.travelOriginLocation || 'Start';
            const destName = locB || ev.location || 'Ziel';
            const distText = ev.travelDistanceText ? ` • Distanz: <strong>${escapeHtml(ev.travelDistanceText)}</strong>` : '';

            if (currentMode === 'driving') {
                return `
                    <details class="travel-transit-accordion" onclick="event.stopPropagation()">
                        <summary class="travel-transit-summary" onclick="event.stopPropagation()">
                            <div class="travel-transit-summary-title">
                                <span style="font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('directions_car', '13px', 'fill: #ffffff;')} Route & Details anzeigen</span>
                            </div>
                            <span class="transit-toggle-arrow">▾</span>
                        </summary>
                        <div class="travel-transit-body">
                            <div style="font-size: 0.73rem; color: #a6adc8; padding: 4px 0 6px 0; line-height: 1.4;">
                                Fahrt mit dem Auto von <strong>${escapeHtml(originName)}</strong> nach <strong>${escapeHtml(destName)}</strong>.<br>
                                Fahrzeit: ca. <strong>${travelMins} Min.</strong>${distText}
                            </div>
                            <div style="margin-top: 6px;">
                                <a href="${gMapsUrl}" target="_blank" class="travel-maps-btn" style="display: inline-flex;">
                                    🗺️ In Google Maps öffnen ↗
                                </a>
                            </div>
                        </div>
                    </details>
                `;
            }

            if (currentMode === 'bicycling') {
                return `
                    <details class="travel-transit-accordion" onclick="event.stopPropagation()">
                        <summary class="travel-transit-summary" onclick="event.stopPropagation()">
                            <div class="travel-transit-summary-title">
                                <span style="font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('directions_bike', '13px', 'fill: #ffffff;')} Route & Details anzeigen</span>
                            </div>
                            <span class="transit-toggle-arrow">▾</span>
                        </summary>
                        <div class="travel-transit-body">
                            <div style="font-size: 0.73rem; color: #a6adc8; padding: 4px 0 6px 0; line-height: 1.4;">
                                Fahrradroute von <strong>${escapeHtml(originName)}</strong> nach <strong>${escapeHtml(destName)}</strong>.<br>
                                Fahrzeit: ca. <strong>${travelMins} Min.</strong>${distText}
                            </div>
                            <div style="margin-top: 6px;">
                                <a href="${gMapsUrl}" target="_blank" class="travel-maps-btn" style="display: inline-flex;">
                                    🗺️ In Google Maps öffnen ↗
                                </a>
                            </div>
                        </div>
                    </details>
                `;
            }

            if (currentMode === 'walking') {
                return `
                    <details class="travel-transit-accordion" onclick="event.stopPropagation()">
                        <summary class="travel-transit-summary" onclick="event.stopPropagation()">
                            <div class="travel-transit-summary-title">
                                <span style="font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('directions_walk', '13px', 'fill: #ffffff;')} Route & Details anzeigen</span>
                            </div>
                            <span class="transit-toggle-arrow">▾</span>
                        </summary>
                        <div class="travel-transit-body">
                            <div style="font-size: 0.73rem; color: #a6adc8; padding: 4px 0 6px 0; line-height: 1.4;">
                                Fußweg von <strong>${escapeHtml(originName)}</strong> nach <strong>${escapeHtml(destName)}</strong>.<br>
                                Gehzeit: ca. <strong>${travelMins} Min.</strong>${distText}
                            </div>
                            <div style="margin-top: 6px;">
                                <a href="${gMapsUrl}" target="_blank" class="travel-maps-btn" style="display: inline-flex;">
                                    🗺️ In Google Maps öffnen ↗
                                </a>
                            </div>
                        </div>
                    </details>
                `;
            }

            // Transit / Bahn
            if (transitInfo && Array.isArray(transitInfo.steps) && transitInfo.steps.length > 0) {
                const depStr = transitInfo.departureTime ? `Abfahrt: ${escapeHtml(transitInfo.departureTime)} Uhr` : '';
                const arrStr = transitInfo.arrivalTime ? `Ankunft: ${escapeHtml(transitInfo.arrivalTime)} Uhr` : '';

                let stepsHtml = '';
                transitInfo.steps.forEach(function(step) {
                    if (step.type === 'transit') {
                        const badgeColor = step.lineColor || '#00a092';
                        const vIcon = step.vehicleIcon && !step.vehicleIcon.includes('🚆') ? step.vehicleIcon : googleIcon('train', '12px', 'fill: currentColor;');
                        const vName = step.vehicleName || 'Bahn';
                        const lName = step.lineName || 'Linie';
                        const head = step.headsign ? ` Richtung ${escapeHtml(step.headsign)}` : '';
                        const stops = step.stopCount ? ` (${step.stopCount} Haltestellen)` : '';
                        const dep = step.departureTime ? `<strong style="color: #a6e3a1;">${escapeHtml(step.departureTime)} Uhr</strong>` : '';
                        const arr = step.arrivalTime ? `<strong style="color: #fab387;">${escapeHtml(step.arrivalTime)} Uhr</strong>` : '';

                        let transferBox = '';
                        if (step.transferWaitMinutes) {
                            transferBox = `
                                <div class="transit-step-transfer">
                                    <span class="transit-transfer-icon">${googleIcon('directions_walk', '13px', 'fill: #f9e2af;')}</span>
                                    <span>Umstieg an <strong>${escapeHtml(step.transferAtStop || step.departureStop)}</strong>: <strong style="color: #f9e2af;">${step.transferWaitMinutes} Min.</strong> Übergangszeit</span>
                                </div>
                            `;
                        }

                        stepsHtml += `
                            ${transferBox}
                            <div class="transit-step-row is-transit">
                                <div class="transit-step-badge-wrap">
                                    <span class="transit-line-badge" style="background-color: ${badgeColor};">${vIcon} ${escapeHtml(lName)}</span>
                                </div>
                                <div class="transit-step-info">
                                    <div class="transit-step-title">
                                        <span>${escapeHtml(vName)}</span>
                                        <span class="transit-step-headsign">${head}${stops}</span>
                                    </div>
                                    <div class="transit-step-stations">
                                        <div class="transit-station-row">
                                            <span class="station-dot dep">${googleIcon('location_on', '11px', 'fill: #a6e3a1;')}</span>
                                            ${dep ? `<span class="station-time">${dep}</span>` : ''}
                                            <span class="station-name">${escapeHtml(step.departureStop || '')}</span>
                                        </div>
                                        <div class="transit-station-row">
                                            <span class="station-dot arr">${googleIcon('home_pin', '11px', 'fill: #f38ba8;')}</span>
                                            ${arr ? `<span class="station-time">${arr}</span>` : ''}
                                            <span class="station-name">${escapeHtml(step.arrivalStop || '')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else if (step.type === 'walk') {
                        stepsHtml += `
                            <div class="transit-step-row is-walk">
                                <div class="transit-step-badge-wrap">
                                    <span class="transit-walk-icon">${googleIcon('directions_walk', '14px', 'fill: #a6adc8;')}</span>
                                </div>
                                <div class="transit-step-info">
                                    <span class="transit-walk-label">${escapeHtml(step.instruction || 'Fußweg')}</span>
                                    <span class="transit-walk-meta">${step.durationText ? escapeHtml(step.durationText) : ''}${step.distanceText ? ' (' + escapeHtml(step.distanceText) + ')' : ''}</span>
                                </div>
                            </div>
                        `;
                    }
                });

                return `
                    <details class="travel-transit-accordion" onclick="event.stopPropagation()">
                        <summary class="travel-transit-summary" onclick="event.stopPropagation()">
                            <div class="travel-transit-summary-title">
                                <span style="font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('train', '13px', 'fill: #ffffff;')} Bahnverlauf anzeigen</span>
                            </div>
                            <span class="transit-toggle-arrow">▾</span>
                        </summary>
                        <div class="travel-transit-body">
                            <div class="transit-times-overview">
                                ${depStr ? `<span style="display: inline-flex; align-items: center; gap: 3px;">${googleIcon('location_on', '11px', 'fill: #a6e3a1;')} ${depStr} ${transitInfo.departureStop ? '(' + escapeHtml(transitInfo.departureStop) + ')' : ''}</span>` : ''}
                                ${arrStr ? `<span style="display: inline-flex; align-items: center; gap: 3px;">${googleIcon('home_pin', '11px', 'fill: #f38ba8;')} ${arrStr} ${transitInfo.arrivalStop ? '(' + escapeHtml(transitInfo.arrivalStop) + ')' : ''}</span>` : ''}
                                <span style="display: inline-flex; align-items: center; gap: 3px;">${googleIcon('verified', '11px', 'fill: #89b4fa;')} Ca. ${travelMins} Min. Fahrzeit</span>
                                ${transitInfo.pauseBeforeMinutes !== undefined && transitInfo.pauseBeforeMinutes !== null && transitInfo.pauseBeforeMinutes > 0 && transitInfo.pauseBeforeMinutes <= 240 ? `<span style="display: inline-flex; align-items: center; gap: 3px; color: #f9e2af;">${googleIcon('coffee', '11px', 'fill: #f9e2af;')} ${transitInfo.pauseBeforeMinutes} Min. Pause vorher</span>` : ''}
                                ${transitInfo.pauseAfterMinutes !== undefined && transitInfo.pauseAfterMinutes !== null ? `<span style="display: inline-flex; align-items: center; gap: 3px; color: #a6e3a1;">${googleIcon('coffee', '11px', 'fill: #a6e3a1;')} ${transitInfo.pauseAfterMinutes} Min. Puffer nachher</span>` : ''}
                            </div>
                            <div class="transit-steps-list">
                                ${stepsHtml}
                            </div>
                            <div style="margin-top: 8px;">
                                <a href="${gMapsUrl}" target="_blank" class="travel-maps-btn" style="display: inline-flex;">
                                    🗺️ In Google Maps öffnen ↗
                                </a>
                            </div>
                        </div>
                    </details>
                `;
            } else {
                return `
                    <details class="travel-transit-accordion" onclick="event.stopPropagation()">
                        <summary class="travel-transit-summary" onclick="event.stopPropagation()">
                            <div class="travel-transit-summary-title">
                                <span style="font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('train', '13px', 'fill: #ffffff;')} Bahnverlauf anzeigen</span>
                            </div>
                            <span class="transit-toggle-arrow">▾</span>
                        </summary>
                        <div class="travel-transit-body">
                            <div style="font-size: 0.73rem; color: #a6adc8; padding: 4px 0 6px 0; line-height: 1.4;">
                                Verbindung von <strong>${escapeHtml(originName)}</strong> nach <strong>${escapeHtml(destName)}</strong>.<br>
                                Gesamtreisezeit: ca. <strong>${travelMins} Min.</strong>${distText}
                            </div>
                            <div style="margin-top: 6px;">
                                <a href="${gMapsUrl}" target="_blank" class="travel-maps-btn" style="display: inline-flex;">
                                    🗺️ In Google Maps öffnen ↗
                                </a>
                            </div>
                        </div>
                    </details>
                `;
            }
        };



        // =========================================================================
        // Task Detail Modal Functions
        // =========================================================================
        window.openTaskDetailModal = function(taskId, title, notes = '', due = '', listTitle = 'Standard', recurrence = 'none', projectId = null, completed = false, isPlanned = false, locationId = null, locationObj = null, persons = [], media = [], status = 'in_progress', isStarred = false) {
            const modal = document.getElementById('task-detail-modal');
            if (Array.isArray(persons)) {
                persons = persons.map(p => p.person ? { id: p.person.id, name: (p.person.aliases?.find(a => a.isPrimary) || p.person.aliases?.[0])?.name || (p.person.isOwner ? 'Ich' : `Person #${p.person.id}`) } : p);
            }
            if (Array.isArray(media)) {
                media = media.map(m => m.media ? m.media : m);
            }
            if (!modal) return;

            document.getElementById('task-detail-id').value = taskId || '';
            document.getElementById('task-detail-list').value = listTitle || 'Standard';
            document.getElementById('task-detail-project-id').value = projectId || '';
            document.getElementById('task-detail-raw-due').value = due || '';
            document.getElementById('task-detail-raw-rec').value = recurrence || 'none';

            const titleEl = document.getElementById('task-detail-title');
            if (isPlanned) {
                titleEl.innerHTML = `${escapeHtml(title || 'Aufgabe')} <span style="font-size: 0.72rem; background: rgba(249, 226, 175, 0.18); color: #f9e2af; border: 1px solid rgba(249, 226, 175, 0.35); border-radius: 4px; padding: 2px 7px; vertical-align: middle; font-weight: 600;">🟡 In Planung</span>`;
            } else {
                titleEl.textContent = title || 'Aufgabe';
            }
            
            // Status button
            const statusBtn = document.getElementById('task-detail-toggle-status-btn');
            if (completed) {
                statusBtn.textContent = '✔️ Erledigt';
                statusBtn.style.background = 'rgba(166, 227, 161, 0.2)';
                statusBtn.style.color = '#a6e3a1';
                statusBtn.setAttribute('data-completed', 'true');
            } else {
                statusBtn.textContent = '⏳ Offen';
                statusBtn.style.background = 'rgba(255, 255, 255, 0.08)';
                statusBtn.style.color = '#cdd6f4';
                statusBtn.setAttribute('data-completed', 'false');
            }

            // Due date
            const dueEl = document.getElementById('task-detail-due');
            if (due) {
                const dateObj = new Date(due);
                if (!isNaN(dateObj.getTime())) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isOverdue = !completed && (dateObj < today);
                    dueEl.innerHTML = `📅 ${dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} ${isOverdue ? '<span style="color: var(--off); font-weight: bold; margin-left: 6px;">(Überfällig!)</span>' : ''}`;
                } else {
                    dueEl.textContent = due;
                }
            } else {
                dueEl.textContent = 'Kein Fälligkeitsdatum';
            }

            // Recurrence
            const recSection = document.getElementById('task-detail-rec-section');
            if (recurrence && recurrence !== 'none') {
                recSection.style.display = 'flex';
                const recLabelsMap = { daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich', yearly: 'jährlich' };
                document.getElementById('task-detail-recurrence').textContent = `🔄 ${recLabelsMap[recurrence] || recurrence}`;
            } else {
                recSection.style.display = 'none';
            }

            // Project
            const projSection = document.getElementById('task-detail-project-section');
            if (projectId) {
                projSection.style.display = 'flex';
                document.getElementById('task-detail-project').textContent = `📁 Projekt #${projectId}`;
            } else {
                projSection.style.display = 'none';
            }

            // Location
            const locSection = document.getElementById('task-detail-location-section');
            if (locSection) {
                const locName = (locationObj && (locationObj.name || locationObj.formattedAddress)) || (locationId ? `Ort #${locationId}` : '');
                const locIdNum = locationId || (locationObj ? locationObj.id : null);
                if (locName) {
                    locSection.style.display = 'flex';
                    const locText = document.getElementById('task-detail-location-text');
                    if (locText) {
                        if (locIdNum) {
                            locText.innerHTML = `<span class="meta-chip location" onclick="closeTaskDetailModal(); handleEntityClick(event, 'location', ${locIdNum});">📍 ${escapeHtml(locName)}</span>`;
                        } else {
                            locText.textContent = `📍 ${locName}`;
                        }
                    }
                    const mapsLink = document.getElementById('task-detail-maps-link');
                    if (mapsLink) mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locName)}`;
                } else {
                    locSection.style.display = 'none';
                }
            }

            // Persons
            const personsSection = document.getElementById('task-detail-persons-section');
            const personsContainer = document.getElementById('task-detail-persons');
            if (personsSection && personsContainer) {
                if (persons && persons.length > 0) {
                    personsSection.style.display = 'flex';
                    personsContainer.innerHTML = persons.map(p => `
                        <span class="meta-chip person" onclick="closeTaskDetailModal(); openPersonProfileModal(${p.id});">
                            👤 ${escapeHtml(p.name)}
                        </span>
                    `).join('');
                } else {
                    personsSection.style.display = 'none';
                    personsContainer.innerHTML = '';
                }
            }

            // Media & Documents
            const mediaSection = document.getElementById('task-detail-media-section');
            const mediaContainer = document.getElementById('task-detail-media');
            if (mediaSection && mediaContainer) {
                if (media && media.length > 0) {
                    mediaSection.style.display = 'flex';
                    mediaContainer.innerHTML = media.map(m => {
                        const isImg = m.category === 'image' || (m.mimeType && m.mimeType.startsWith('image/')) || /\.(jpe?g|png|gif|webp|svg)$/i.test(m.fileName || '');
                        return `
                            <span class="meta-chip media" onclick="closeTaskDetailModal(); handleEntityClick(event, 'media', ${m.id});">
                                ${isImg ? '🖼️' : '📄'} ${escapeHtml(m.title || m.fileName || 'Datei')}
                            </span>
                        `;
                    }).join('');
                } else {
                    mediaSection.style.display = 'none';
                    mediaContainer.innerHTML = '';
                }
            }

            // Notes
            const notesEl = document.getElementById('task-detail-notes');
            if (notes && notes.trim()) {
                notesEl.textContent = notes;
                notesEl.style.opacity = '1';
            } else {
                notesEl.textContent = 'Keine zusätzlichen Notizen vorhanden.';
                notesEl.style.opacity = '0.5';
            }

            // Buttons
            document.getElementById('task-detail-link-btn').onclick = () => {
                insertEntityLinkIntoChat(title, 'task', taskId);
                closeTaskDetailModal();
            };

            document.getElementById('task-detail-delete-btn').onclick = () => {
                closeTaskDetailModal();
                deleteTask(taskId);
            };

            document.getElementById('task-detail-edit-btn').onclick = () => {
                closeTaskDetailModal();
                const personIds = (persons || []).map(p => p.id);
                const mediaIds = (media || []).map(m => m.id);
                const locId = locationId || (locationObj ? locationObj.id : null);
                openTaskModal(taskId, title, notes, due, listTitle, recurrence, projectId, isPlanned, status, isStarred, locId, personIds, mediaIds);
            };

            modal.style.display = 'block';
            document.body.classList.add('modal-active');
        };



        window.closeTaskDetailModal = function() {
            const modal = document.getElementById('task-detail-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };



        window.toggleTaskStatusFromDetail = async function() {
            const taskId = document.getElementById('task-detail-id').value;
            const listTitle = document.getElementById('task-detail-list').value || 'Standard';
            const statusBtn = document.getElementById('task-detail-toggle-status-btn');
            const isCompleted = statusBtn.getAttribute('data-completed') === 'true';
            
            if (!taskId) return;
            try {
                if (!isCompleted) {
                    await callTool('erledige_aufgabe', { taskId: String(taskId), tasklistId: listTitle });
                    statusBtn.textContent = '✔️ Erledigt';
                    statusBtn.style.background = 'rgba(166, 227, 161, 0.2)';
                    statusBtn.style.color = '#a6e3a1';
                    statusBtn.setAttribute('data-completed', 'true');
                } else {
                    await callTool('wiedereroeffnen_aufgabe', { taskId: String(taskId) });
                    statusBtn.textContent = '⏳ Offen';
                    statusBtn.style.background = 'rgba(255, 255, 255, 0.08)';
                    statusBtn.style.color = '#cdd6f4';
                    statusBtn.setAttribute('data-completed', 'false');
                }
                loadTopWidgets();
            } catch(e) {
                console.error("Fehler beim Umschalten des Aufgaben-Status:", e);
            }
        };



        window.openTaskDetailModalFromData = function(data) {
            let persons = [];
            try {
                if (data.taskPersons) persons = JSON.parse(data.taskPersons);
            } catch(e) {}

            let media = [];
            try {
                if (data.taskMedia) media = JSON.parse(data.taskMedia);
            } catch(e) {}

            let locationObj = null;
            try {
                if (data.taskLocationObj) locationObj = JSON.parse(data.taskLocationObj);
            } catch(e) {}

            openTaskDetailModal(
                data.taskId || data.linkId,
                data.taskTitle || data.linkLabel,
                data.taskNotes || '',
                data.taskDue || '',
                data.taskList || 'Standard',
                data.taskRecurrence || 'none',
                data.taskProjectId ? Number(data.taskProjectId) : (data.projectId ? Number(data.projectId) : null),
                data.taskCompleted === 'true' || data.taskCompleted === true,
                data.taskPlanned === 'true' || data.taskPlanned === true || data.isPlanned === 'true' || data.isPlanned === true,
                data.taskLocationId ? Number(data.taskLocationId) : (locationObj ? locationObj.id : null),
                locationObj,
                persons,
                media,
                data.taskStatus || 'in_progress',
                data.taskStarred === 'true' || data.taskStarred === true
            );
        };



        // =========================================================================
        // Timer Detail & Adjustment Functions
        // =========================================================================
        let activeTimerDetailInterval = null;



        window.openTimerDetailModal = function(timerId, title, createdAt, expiresAt) {
            const modal = document.getElementById('timer-detail-modal');
            if (!modal) return;

            document.getElementById('timer-detail-id').value = timerId || '';
            document.getElementById('timer-detail-title').textContent = title || 'Timer';

            const expiresDate = expiresAt ? new Date(expiresAt) : null;
            const createdDate = createdAt ? new Date(createdAt) : null;

            document.getElementById('timer-detail-expires').textContent = expiresDate ? expiresDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' Uhr' : '--';
            document.getElementById('timer-detail-created').textContent = createdDate ? createdDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' Uhr' : '--';

            const countdownEl = document.getElementById('timer-detail-countdown');
            const statusTextEl = document.getElementById('timer-detail-status-text');

            const updateCountdown = () => {
                if (!expiresDate) return;
                const now = Date.now();
                const diff = expiresDate.getTime() - now;
                if (diff <= 0) {
                    countdownEl.textContent = '00:00:00';
                    countdownEl.style.color = 'var(--off)';
                    statusTextEl.textContent = '🔔 Abgelaufen!';
                    statusTextEl.style.color = 'var(--off)';
                } else {
                    const totalSecs = Math.floor(diff / 1000);
                    const hrs = Math.floor(totalSecs / 3600);
                    const mins = Math.floor((totalSecs % 3600) / 60);
                    const secs = totalSecs % 60;
                    countdownEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                    countdownEl.style.color = 'var(--accent)';
                    statusTextEl.textContent = '⏳ Läuft';
                    statusTextEl.style.color = '#a6e3a1';
                }
            };

            updateCountdown();
            if (activeTimerDetailInterval) clearInterval(activeTimerDetailInterval);
            activeTimerDetailInterval = setInterval(updateCountdown, 1000);

            // Buttons
            document.getElementById('timer-detail-link-btn').onclick = () => {
                insertEntityLinkIntoChat(title, 'timer', timerId);
                closeTimerDetailModal();
            };

            document.getElementById('timer-detail-delete-btn').onclick = async () => {
                closeTimerDetailModal();
                stopAlarmSound();
                cancelScheduledTimerAlarm(Number(timerId));
                await callTool('loesche_timer', { id: Number(timerId) });
                loadTopWidgets();
            };

            modal.style.display = 'block';
            document.body.classList.add('modal-active');
        };



        window.closeTimerDetailModal = function() {
            if (activeTimerDetailInterval) {
                clearInterval(activeTimerDetailInterval);
                activeTimerDetailInterval = null;
            }
            const modal = document.getElementById('timer-detail-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };



        window.adjustTimerTime = async function(deltaSeconds) {
            const timerId = document.getElementById('timer-detail-id').value;
            if (!timerId) return;

            const timerCard = document.getElementById(`timer-card-${timerId}`);
            let currentExpires = timerCard ? timerCard.getAttribute('data-expires') : null;
            let newExpiresDate;
            if (currentExpires) {
                const curExp = new Date(currentExpires).getTime();
                const base = Math.max(Date.now(), curExp);
                newExpiresDate = new Date(base + deltaSeconds * 1000);
            } else {
                newExpiresDate = new Date(Date.now() + Math.max(60, deltaSeconds) * 1000);
            }

            try {
                await callTool('bearbeite_timer', {
                    id: Number(timerId),
                    expiresAt: newExpiresDate.toISOString()
                });
                loadTopWidgets();
                document.getElementById('timer-detail-expires').textContent = newExpiresDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' Uhr';
            } catch(e) {
                console.error("Fehler beim Anpassen des Timers:", e);
            }
        };



        window.openTimerDetailModalFromData = function(data) {
            const timerCard = document.getElementById(`timer-card-${data.timerId || data.linkId}`);
            const createdAt = (timerCard && timerCard.getAttribute('data-created')) || data.timerCreated || '';
            const expiresAt = (timerCard && timerCard.getAttribute('data-expires')) || data.timerExpires || '';

            openTimerDetailModal(
                data.timerId || data.linkId,
                data.timerTitle || data.linkLabel,
                createdAt,
                expiresAt
            );
        };



        window.deletePerson = async function(id) {
            if (confirm("Möchtest du diese Person wirklich aus dem Gedächtnis löschen?")) {
                await callTool('loesche_person', { id: Number(id) });
                loadTopWidgets();
            }
        };



        const recLabels = { daily: 'täglich', weekly: 'wöchentlich', monthly: 'monatlich', yearly: 'jährlich' };


        function renderSingleTaskHtml(t, isOverdue) {
            const isRecurring = t.recurrence && t.recurrence !== 'none';
            const recLabel = recLabels[t.recurrence] || t.recurrence;
            const repeatBadge = isRecurring ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrend: ${recLabel}">🔄</span>` : '';
            
            let dueBadge = '';
            if (t.due) {
                const dateObj = new Date(t.due);
                const dateStr = dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const color = isOverdue ? 'var(--off)' : 'rgba(255,255,255,0.4)';
                const weight = isOverdue ? 'bold' : 'normal';
                dueBadge = ` <span style="font-size: 0.7rem; color: ${color}; font-weight: ${weight}; margin-left: 6px; display: inline-flex; align-items: center; gap: 3px;" title="${isOverdue ? 'Überfällig!' : 'Fällig am'} ${dateObj.toLocaleDateString('de-DE')}">📅 ${dateStr}</span>`;
            }

            const escTitle = escapeHtml(t.title).replace(/"/g, '&quot;');
            const escNotes = escapeHtml(t.notes || '').replace(/"/g, '&quot;');
            const escListTitle = escapeHtml(t.listTitle || '').replace(/"/g, '&quot;');
            const recurrenceVal = t.recurrence || 'none';

            const bg = isOverdue ? 'rgba(243, 139, 168, 0.06)' : 'rgba(255,255,255,0.03)';
            const border = isOverdue ? '1px solid rgba(243, 139, 168, 0.25)' : '1px solid rgba(255,255,255,0.06)';

            const taskContent = `
                 <div class="task-item ${isOverdue ? 'overdue' : ''}" style="font-size: 0.8rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 7px 10px; border-radius: 6px; background: ${bg}; border: ${border}; width: 100%;">
                     <div style="display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0;">
                         <input type="checkbox" class="task-checkbox" data-task-id="${t.id}" data-tasklist-id="${t.tasklistId || t.listTitle || 'Standard'}" onchange="completeTask(this)" style="margin-top: 3px;">
                         <span style="line-height: 1.4; color: var(--text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; word-break: break-word; flex: 1;">
                            ${escapeHtml(t.title)}
                            ${repeatBadge}
                            ${dueBadge}
                         </span>
                     </div>
                 </div>`;
            const extraData = `data-task-id="${t.id}" data-task-title="${escTitle}" data-task-notes="${escNotes}" data-task-due="${t.due || ''}" data-task-list="${escListTitle}" data-task-recurrence="${recurrenceVal}" data-task-completed="${!!t.completed}" data-task-project-id="${t.projectId || ''}"`;
            return renderSwipeLinkWrapper(taskContent, t.title, 'task', t.id, '', '', '', extraData);
        }



        function getServerUrl() {
            if (window.location && window.location.protocol && window.location.protocol.startsWith('http') && !window.Capacitor) {
                return window.location.origin;
            }
            return (window.ENV_CONFIG && window.ENV_CONFIG.MOBILE_SERVER_URL) || 'https://ki.kleiner-wald-server.de';
        }



        // Helper to resolve API URLs (either absolute or relative depending on configuration)
        function getApiUrl(path) {
            if (path.startsWith('http://') || path.startsWith('https://')) {
                return path;
            }
            const cleanPath = path.startsWith('/') ? path : '/' + path;
            // Wenn wir direkt im Browser/Electron über HTTP laufen und nicht in Capacitor
            if (window.location && window.location.protocol && window.location.protocol.startsWith('http') && !window.Capacitor) {
                return cleanPath;
            }
            if (window.Capacitor || window.location.protocol === 'file:' || window.location.origin === 'null') {
                const baseUrl = getServerUrl().replace(/\/+$/, '');
                return baseUrl + cleanPath;
            }
            return cleanPath;
        }



        function safeBtoa(str) {
            try {
                return btoa(unescape(encodeURIComponent(str)));
            } catch (e) {
                return btoa(str);
            }
        }



        // Custom wrapper around fetch to automatically attach Basic Authentication headers if configured
        async function authFetch(url, options = {}) {
            options.headers = options.headers || {};
            const username = localStorage.getItem('api_username');
            const password = localStorage.getItem('api_password');
            if (username && password) {
                options.headers['Authorization'] = 'Basic ' + safeBtoa(username + ':' + password);
            }
            return window.fetch(url, options);
        }



        const fetch = authFetch;



        async function loadEntityConfigs() {
            try {
                const res = await fetch(getApiUrl('/api/plugins/entities'));
                if (res.ok) {
                    const configs = await res.json();
                    entityConfigs = {};
                    configs.forEach(cfg => {
                        entityConfigs[cfg.type] = cfg;
                    });
                    console.log("Entity-Konfigurationen geladen:", entityConfigs);
                }
            } catch (err) {
                console.error("Fehler beim Laden der Entity-Konfigurationen:", err);
            }
        }


        window.loadEntityConfigs = loadEntityConfigs;



        async function handleEntityClick(event, type, id) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            console.log(`Entity geklickt: ${type} - ${id}`);
            
            try {
                if (type === 'note') {
                    const res = await fetch(getApiUrl(`/api/entities/note/${id}`));
                    if (res.ok) {
                        const note = await res.json();
                        openNoteModal(note.id, note.title, note.content);
                    } else {
                        alert("Notiz konnte nicht geladen werden.");
                    }
                } else if (type === 'person') {
                    openPersonProfileModal(id);
                } else if (type === 'task') {
                    const res = await fetch(getApiUrl(`/api/entities/task/${id}`));
                    if (res.ok) {
                        const task = await res.json();
                        const dueStr = task.due ? new Date(task.due).toISOString().split('T')[0] : '';
                        const locObj = task.location || task.locationRef || null;
                        openTaskDetailModal(
                            task.id,
                            task.title,
                            task.notes || '',
                            dueStr,
                            task.listTitle || '',
                            task.recurrence || 'none',
                            task.projectId,
                            task.completed,
                            task.isPlanned,
                            task.locationId || (locObj ? locObj.id : null),
                            locObj,
                            task.persons || [],
                            task.media || [],
                            task.status || 'in_progress',
                            task.isStarred || false
                        );
                    } else {
                        alert("Aufgabe konnte nicht geladen werden.");
                    }
                } else if (type === 'project') {
                    focusWidget('projects');
                } else if (type === 'event') {
                    const res = await fetch(getApiUrl(`/api/entities/event/${id}`));
                    if (res.ok) {
                        const ev = await res.json();
                        const locObj = ev.locationRef || ev.locationObj || null;
                        openEventDetailModal(
                            ev.id,
                            ev.title,
                            ev.start,
                            ev.end,
                            ev.isAllDay,
                            ev.fuzzyTime,
                            ev.description,
                            ev.isRecurring,
                            ev.occurrenceDate || (ev.start ? String(ev.start).split('T')[0] : ''),
                            ev.persons || [],
                            ev.isCancelled,
                            ev.cancellationReason,
                            ev.location,
                            ev.locationId || (locObj ? locObj.id : null),
                            locObj,
                            ev.media || []
                        );
                    } else {
                        focusWidget('calendar');
                    }
                } else if (type === 'timer') {
                    focusWidget('timer');
                } else if (type === 'day') {
                    focusWidget('calendar');
                    jumpToTimelineDate(id);
                } else if (type === 'pause' || type === 'travel') {
                    focusWidget('dashboard');
                } else if (type === 'location') {
                    if (typeof openLocationEditModal === 'function') {
                        openLocationEditModal(Number(id));
                    } else {
                        focusWidget('locations');
                    }
                } else if (type === 'media' || type === 'file') {
                    const res = await fetch(getApiUrl(`/api/media/${id}`));
                    if (res.ok) {
                        const item = await res.json();
                        const isImg = item.fileType?.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg)$/i.test(item.fileName || '');
                        if (isImg && typeof openMediaLightbox === 'function') {
                            window.currentLightboxImages = [item];
                            openMediaLightbox(0);
                        } else if (typeof openMediaEditModal === 'function') {
                            openMediaEditModal(item.id);
                        } else {
                            window.open(item.url || `/uploads/${item.fileName}`, '_blank');
                        }
                    } else {
                        alert("Datei konnte nicht geladen werden.");
                    }
                }
            } catch (err) {
                console.error("Fehler beim Verarbeiten des Entity-Klicks:", err);
            }
        }


        window.handleEntityClick = handleEntityClick;



        function addLinkedPill(label, type, id) {
            const container = document.getElementById('linked-pills-bar');
            if (!container) return;

            // Prevent duplicates
            const existing = container.querySelector(`.link-pill[data-type="${type}"][data-id="${id}"]`);
            if (existing) return;

            const url = `app://${type}/${id}`;
            const pill = document.createElement('span');
            pill.className = 'link-pill';
            pill.setAttribute('data-type', type);
            pill.setAttribute('data-id', id);
            pill.setAttribute('data-url', url);
            pill.setAttribute('data-label', label);

            const fallbackEntityConfigs = {
                day: { icon: '📅', color: 'rgba(137, 180, 250, 0.15)', borderColor: '#89b4fa' },
                pause: { icon: '☕', color: 'rgba(249, 226, 175, 0.15)', borderColor: '#f9e2af' },
                travel: { icon: '🗺️', color: 'rgba(166, 227, 161, 0.15)', borderColor: '#a6e3a1' },
                location: { icon: '📍', color: 'rgba(166, 227, 161, 0.15)', borderColor: '#a6e3a1' },
                media: { icon: '📁', color: 'rgba(249, 226, 175, 0.15)', borderColor: '#f9e2af' },
                file: { icon: '📁', color: 'rgba(249, 226, 175, 0.15)', borderColor: '#f9e2af' }
            };
            const config = entityConfigs[type] || fallbackEntityConfigs[type] || { icon: '🔗', color: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' };
            pill.style.background = config.color;
            pill.style.border = `1px solid ${config.borderColor}`;
            pill.style.color = config.borderColor;

            const iconSpan = document.createElement('span');
            iconSpan.textContent = config.icon + ' ';
            pill.appendChild(iconSpan);

            const labelSpan = document.createElement('span');
            labelSpan.className = 'pill-label';
            labelSpan.textContent = label;
            labelSpan.style.cursor = 'pointer';
            labelSpan.onclick = (e) => {
                handleEntityClick(e, type, id);
            };
            pill.appendChild(labelSpan);

            const closeSpan = document.createElement('span');
            closeSpan.className = 'pill-close';
            closeSpan.innerHTML = ' &times;';
            closeSpan.onclick = (e) => {
                e.stopPropagation();
                pill.remove();
                updateLinkedPillsBarVisibility();
            };
            pill.appendChild(closeSpan);

            container.appendChild(pill);
            updateLinkedPillsBarVisibility();
            
            // Auto scroll to make new pill visible
            container.scrollLeft = container.scrollWidth;
        }



        function updateLinkedPillsBarVisibility() {
            const container = document.getElementById('linked-pills-bar');
            if (!container) return;
            const pills = container.querySelectorAll('.link-pill');
            if (pills.length > 0) {
                container.style.display = 'flex';
            } else {
                container.style.display = 'none';
            }
        }



        function insertEntityLinkIntoChat(label, type, id) {
            addLinkedPill(label, type, id);
        }


        window.insertEntityLinkIntoChat = insertEntityLinkIntoChat;



        // Modal für Personenprofile
        let personProfileModal, personProfileId, personProfileTitle, personProfileNames;


        let personNewAliasInput, personProfileBio, personProfileFacts, personNewFactInput;


        let personNewFactCat, personMergeTargetSelect, personProfileMemories;



        window.addEventListener('DOMContentLoaded', () => {
            personProfileModal = document.getElementById('person-profile-modal');
            personProfileId = document.getElementById('person-profile-id');
            personProfileTitle = document.getElementById('person-profile-title');
            personProfileNames = document.getElementById('person-profile-names');
            personNewAliasInput = document.getElementById('person-new-alias-input');
            personProfileBio = document.getElementById('person-profile-bio');
            personProfileFacts = document.getElementById('person-profile-facts');
            personNewFactInput = document.getElementById('person-new-fact-input');
            personNewFactCat = document.getElementById('person-new-fact-cat');
            personMergeTargetSelect = document.getElementById('person-merge-target-select');
            personProfileMemories = document.getElementById('person-profile-memories');
            if (typeof loadAgentSettings === 'function') {
                loadAgentSettings();
            }
            if (typeof loadSettings === 'function') {
                loadSettings();
            } else {
                syncWidgetSettings();
            }
        });



        window.openPersonProfileModal = async function(id) {
            try {
                const res = await fetch(getApiUrl(`/api/entities/person/${id}`));
                if (!res.ok) {
                    alert("Personenprofil konnte nicht geladen werden.");
                    return;
                }
                const person = await res.json();
                
                personProfileId.value = person.id;
                
                const primaryAlias = person.aliases.find(a => a.isPrimary) || person.aliases[0];
                const primaryName = primaryAlias ? primaryAlias.name : "Unbekannt";
                personProfileTitle.textContent = `👤 Profil: ${primaryName}`;
                
                // Favoriten-Button im Header konfigurieren
                const favBtn = document.getElementById('person-profile-fav-btn');
                if (favBtn) {
                    if (person.isOwner) {
                        favBtn.style.display = 'none';
                    } else {
                        favBtn.style.display = 'inline-flex';
                        favBtn.style.alignItems = 'center';
                        favBtn.style.gap = '4px';
                        if (person.isFavorite) {
                            favBtn.innerHTML = '⭐ <span style="font-size:0.75rem;">Favorit</span>';
                            favBtn.style.background = 'rgba(249, 226, 175, 0.2)';
                            favBtn.style.border = '1px solid #f9e2af';
                            favBtn.style.color = '#f9e2af';
                            favBtn.title = 'Aus Favoriten entfernen';
                        } else {
                            favBtn.innerHTML = '☆ <span style="font-size:0.75rem;">Favorit</span>';
                            favBtn.style.background = 'rgba(255, 255, 255, 0.05)';
                            favBtn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                            favBtn.style.color = 'rgba(255, 255, 255, 0.7)';
                            favBtn.title = 'Zu Favoriten hinzufügen';
                        }
                        favBtn.onclick = async () => {
                            await togglePersonFavorite(person.id, !person.isFavorite);
                            openPersonProfileModal(person.id);
                        };
                    }
                }

                // Link-Button im Header konfigurieren
                const linkBtn = document.getElementById('person-profile-link-btn');
                if (linkBtn) {
                    const escName = primaryName.replace(/'/g, "\\'");
                    linkBtn.onclick = () => {
                        insertEntityLinkIntoChat(escName, 'person', person.id);
                        closePersonProfileModal();
                    };
                }
                
                // Biografie
                personProfileBio.value = person.biography || '';

                // Geburtstag
                const bdayInput = document.getElementById('person-birthday-input');
                if (bdayInput) {
                    bdayInput.value = person.birthday ? person.birthday.split('T')[0] : '';
                }

                // E-Mail-Adressen
                const emailInput = document.getElementById('person-email-input');
                if (emailInput) {
                    const emailsList = [];
                    if (person.email) emailsList.push(person.email);
                    if (person.emails) emailsList.push(person.emails);
                    emailInput.value = emailsList.join(', ');
                }
                
                // Aliase / Namen
                personProfileNames.innerHTML = '';
                person.aliases.forEach(a => {
                    const badge = document.createElement('div');
                    badge.className = `alias-badge ${a.isPrimary ? 'primary' : ''}`;
                    badge.innerHTML = `
                        <span>${escapeHtml(a.name)}</span>
                        ${a.isPrimary ? '<span style="font-size: 0.65rem; opacity: 0.6; margin-left: 4px;">(primär)</span>' : `<span class="remove" onclick="deletePersonAlias('${escapeHtml(a.name)}')">&times;</span>`}
                    `;
                    personProfileNames.appendChild(badge);
                });
                personNewAliasInput.value = '';
                
                // Fakten
                personProfileFacts.innerHTML = '';
                if (!person.facts || person.facts.length === 0) {
                    personProfileFacts.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.5; margin: 5px 0;">Keine Fakten vorhanden.</p>';
                } else {
                    person.facts.forEach(f => {
                        const item = document.createElement('div');
                        item.className = 'fact-item';
                        const catHtml = f.category ? `<span class="category-badge">${escapeHtml(f.category)}</span>` : '';
                        const escContent = escapeHtml(f.content).replace(/'/g, "\\'");
                        item.innerHTML = `
                            <div style="display: flex; align-items: center;">
                                ${catHtml}
                                <span>${escapeHtml(f.content)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button onclick="insertEntityLinkIntoChat('${escContent}', 'person', ${person.id}); closePersonProfileModal();" style="background: transparent; border: none; color: var(--accent); cursor: pointer; font-size: 0.8rem;" title="In Chat verlinken">🔗</button>
                                <button onclick="deletePersonFact(${f.id})" style="background: transparent; border: none; color: var(--off); cursor: pointer; font-size: 0.8rem;">✖</button>
                            </div>
                        `;
                        personProfileFacts.appendChild(item);
                    });
                }
                personNewFactInput.value = '';
                personNewFactCat.value = '';
                
                // Merge Dropdown befüllen (alle anderen Personen außer der aktuellen)
                personMergeTargetSelect.innerHTML = '<option value="">Ziel-Person auswählen...</option>';
                try {
                    const widgetRes = await fetch(getApiUrl('/widgets'));
                    if (widgetRes.ok) {
                        const widgets = await widgetRes.json();
                        const memoryWidget = widgets.find(w => w.data && w.data.widgetType === 'memory_people_list');
                        if (memoryWidget && memoryWidget.data.people) {
                            memoryWidget.data.people.forEach(p => {
                                if (Number(p.id) !== Number(id)) {
                                    const opt = document.createElement('option');
                                    opt.value = p.id;
                                    opt.textContent = p.name;
                                    personMergeTargetSelect.appendChild(opt);
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error("Fehler beim Laden der Personen für das Merge-Dropdown:", e);
                }

                // Letzte Erinnerungen
                personProfileMemories.innerHTML = '';
                if (!person.langzeit_erinnerungen || person.langzeit_erinnerungen.length === 0) {
                    personProfileMemories.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.5; margin: 5px 0;">Keine Erinnerungen vorhanden.</p>';
                } else {
                    person.langzeit_erinnerungen.forEach(m => {
                        const item = document.createElement('div');
                        item.className = 'fact-item';
                        item.style.flexDirection = 'column';
                        item.style.alignItems = 'flex-start';
                        const date = new Date(m.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                        item.innerHTML = `
                            <div style="font-size: 0.65rem; opacity: 0.4; margin-bottom: 2px;">${date}</div>
                            <div style="line-height: 1.3;">${escapeHtml(m.text)}</div>
                        `;
                        personProfileMemories.appendChild(item);
                    });
                }

                // Orte & Adressen der Person laden
                if (typeof loadPersonLocationsIntoModal === 'function') {
                    loadPersonLocationsIntoModal(person.id);
                }

                // Fotos & Dokumente der Person laden
                if (typeof loadPersonMediaIntoModal === 'function') {
                    loadPersonMediaIntoModal(person.id);
                }

                personProfileModal.style.display = 'block';
                document.body.classList.add('modal-active');
            } catch (err) {
                console.error("Fehler beim Öffnen des Personenprofils:", err);
            }
        };



        window.closePersonProfileModal = function() {
            personProfileModal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };



        window.togglePersonFavorite = async function(personId, makeFavorite) {
            try {
                const res = await fetch(getApiUrl(`/api/entities/person/${personId}/favorite`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isFavorite: makeFavorite })
                });
                if (res.ok) {
                    if (currentMemoryPeopleList && currentMemoryPeopleList.length > 0) {
                        const p = currentMemoryPeopleList.find(x => Number(x.id) === Number(personId));
                        if (p) p.isFavorite = makeFavorite;
                        renderFilteredPeopleList();
                    }
                    if (navigator.vibrate) navigator.vibrate(20);
                    loadTopWidgets();
                } else {
                    const err = await res.json();
                    alert("Fehler beim Aktualisieren des Favoritenstatus: " + (err.error || "Unbekannter Fehler"));
                }
            } catch (err) {
                console.error("Fehler bei togglePersonFavorite:", err);
                alert("Fehler: " + err.message);
            }
        };



        window.savePersonBiography = async function() {
            const id = personProfileId.value;
            const bio = personProfileBio.value.trim();
            if (!id) return;
            
            await callTool('aktualisiere_person_biografie', { personId: parseInt(id), biografie: bio });
            alert("Biografie wurde aktualisiert.");
            loadTopWidgets();
        };



        window.savePersonBirthday = async function() {
            const id = personProfileId.value;
            const bdayInput = document.getElementById('person-birthday-input');
            const bday = bdayInput ? bdayInput.value.trim() : '';
            if (!id) return;
            
            try {
                const res = await callTool('setze_person_geburtstag', { personId: parseInt(id), geburtstag: bday });
                if (res && res.status === 'success') {
                    alert("Geburtstag wurde gespeichert.");
                    openPersonProfileModal(id);
                    loadTopWidgets();
                } else {
                    alert("Fehler: " + (res?.message || "Konnte Geburtstag nicht speichern."));
                }
            } catch (err) {
                alert("Fehler: " + err.message);
            }
        };



        window.savePersonEmail = async function() {
            const id = personProfileId.value;
            const emailInput = document.getElementById('person-email-input');
            const emailVal = emailInput ? emailInput.value.trim() : '';
            if (!id) return;

            try {
                const res = await fetch(getApiUrl(`/api/entities/person/${id}/email`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailVal })
                });
                if (res.ok) {
                    alert("E-Mail-Adresse wurde gespeichert!");
                    openPersonProfileModal(id);
                    loadTopWidgets();
                } else {
                    const data = await res.json();
                    alert("Fehler: " + (data.error || "Konnte E-Mail nicht speichern."));
                }
            } catch (err) {
                alert("Fehler: " + err.message);
            }
        };



        window.addPersonAlias = async function() {
            const id = personProfileId.value;
            const alias = personNewAliasInput.value.trim();
            if (!id || !alias) return;
            
            await callTool('verwalte_person_alias', { personId: parseInt(id), aktion: 'add', aliasName: alias });
            openPersonProfileModal(id); // Reload modal
        };



        window.deletePersonAlias = async function(aliasName) {
            const id = personProfileId.value;
            if (!id || !aliasName) return;
            
            if (confirm(`Möchtest du den Spitznamen '${aliasName}' wirklich entfernen?`)) {
                await callTool('verwalte_person_alias', { personId: parseInt(id), aktion: 'delete', aliasName: aliasName });
                openPersonProfileModal(id); // Reload modal
            }
        };



        window.addPersonFact = async function() {
            const id = personProfileId.value;
            const fact = personNewFactInput.value.trim();
            const cat = personNewFactCat.value.trim();
            if (!id || !fact) return;
            
            const args = { personId: parseInt(id), inhalt: fact };
            if (cat) args.kategorie = cat;
            
            await callTool('fuege_person_fakt_hinzu', args);
            openPersonProfileModal(id); // Reload modal
        };



        window.deletePersonFact = async function(faktId) {
            const id = personProfileId.value;
            if (!id || !faktId) return;
            
            if (confirm("Möchtest du diesen Fakt wirklich löschen?")) {
                await callTool('loesche_person_fakt', { faktId: parseInt(faktId) });
                openPersonProfileModal(id); // Reload modal
            }
        };



        window.mergePersonProfiles = async function() {
            const sourceId = personProfileId.value;
            const targetId = personMergeTargetSelect.value;
            if (!sourceId || !targetId) {
                alert("Bitte wähle eine Ziel-Person aus.");
                return;
            }
            
            const targetName = personMergeTargetSelect.options[personMergeTargetSelect.selectedIndex].text;
            
            if (confirm(`Bist du sicher, dass du dieses Profil in das Profil von '${targetName}' verschmelzen möchtest?\n\nDies löscht das aktuelle Profil permanent.`)) {
                try {
                    const res = await fetch(getApiUrl('/api/persons/merge'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sourceId: parseInt(sourceId), targetId: parseInt(targetId) })
                    });
                    
                    if (res.ok) {
                        alert("Profile erfolgreich zusammengeführt!");
                        closePersonProfileModal();
                        loadTopWidgets();
                    } else {
                        const err = await res.json();
                        alert(`Fehler beim Zusammenführen: ${err.error || "Unbekannter Fehler"}`);
                    }
                } catch (e) {
                    console.error("Fehler beim Mergen:", e);
                    alert("Netzwerkfehler beim Zusammenführen.");
                }
            }
        };



        // PWA Service Worker Registrierung
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('Service Worker registriert:', reg))
                    .catch(err => console.error('Service Worker Fehler:', err));
            });
        }



        let ipcRenderer = null;


        let webUtils = null;


        let isElectron = false;



        try {
            if (typeof require !== 'undefined') {
                const electron = require('electron');
                ipcRenderer = electron.ipcRenderer;
                webUtils = electron.webUtils;
                isElectron = true;
            }
        } catch (e) {
            console.log("Nicht in Electron-Umgebung gestartet. Nutze Web-Modus.");
        }



        // Routing basierend auf URL-Hash
        const isPluginsView = window.location.hash === '#plugins';



        // chatBox in core.js


        // userInput in core.js


        // sendBtn in core.js


        // micBtn in core.js


        // statusEl in core.js


        // notificationBar in core.js


        // notificationText in core.js


        // notificationAction in core.js


        // topWidgetsContainer in core.js



        let wasAlertActive = false;


        async function loadAlerts() {
            try {
                const res = await fetch(getApiUrl('/alerts'));
                const alerts = await res.json();
                
                if (alerts.length > 0) {
                    const alert = alerts[0]; // Wir zeigen erstmal nur den ersten an
                    notificationText.textContent = alert.message;
                    if (alert.actionLabel && alert.actionUrl) {
                        notificationAction.textContent = alert.actionLabel;
                        notificationAction.href = alert.actionUrl;
                        notificationAction.target = "_blank";
                        notificationAction.style.display = 'inline-block';
                    } else {
                        notificationAction.style.display = 'none';
                    }
                    notificationBar.classList.add('active');
                    wasAlertActive = true;
                } else {
                    notificationBar.classList.remove('active');
                    if (wasAlertActive) {
                        wasAlertActive = false;
                        // Notification ist weg (z.B. Login erfolgreich), also Widgets aktualisieren
                        loadTopWidgets();
                    }
                }
            } catch (e) {
                console.error("Fehler beim Laden der Alerts:", e);
            }
        }



        // Nav Elemente
        const navNew = document.getElementById('nav-new');


        const navHistory = document.getElementById('nav-history');


        const chatSection = document.getElementById('chat-section');


        const historySection = document.getElementById('history-section');


        const settingsSection = document.getElementById('settings-section');


        const settingsBackBtn = document.getElementById('settings-back-btn');


        const rightHeader = document.getElementById('right-header');


        const historyList = document.getElementById('history-list');


        const historyQuery = document.getElementById('history-query');


        const dropZone = document.getElementById('drop-zone');


        const closePanel = document.getElementById('close-panel');


        const namingModal = document.getElementById('naming-modal');


        const appNameInput = document.getElementById('app-name-input');


        const modalFilePath = document.getElementById('modal-file-path');


        const modalSave = document.getElementById('modal-save');


        const modalCancel = document.getElementById('modal-cancel');



        // Settings Elemente
        const openSettings = document.getElementById('open-settings');


        const settingsSave = document.getElementById('settings-save');


        const hotkeyBtn = document.getElementById('hotkey-btn');


        // plugins-list entfernt (Plugins sind immer aktiv)



        let currentHotkey = 'Ctrl+Shift+Space';


        let tempHotkey = '';


        let recordingHotkey = false;



        
        let availablePluginsForAgents = [];


        let availableTriggersForAgents = [];


        let currentAgentSettings = {};



        // Plugin-Kategorien für Einstellungen und Berechtigungs-Modal
        const AGENT_PLUGIN_CATEGORIES = [
            {
                name: 'Mail',
                icon: '✉️',
                title: 'Mail',
                description: 'E-Mails abrufen, analysieren und Antwort-Mails versenden',
                writeLabel: 'Senden',
                readLabel: 'Lesen',
                hasWriteAsk: true
            },
            {
                name: 'Calendar',
                icon: '📅',
                title: 'Kalender',
                description: 'Termine einsehen, prüfen und im Kalender eintragen',
                writeLabel: 'Termine erstellen & ändern',
                readLabel: 'Termine lesen',
                hasWriteAsk: true
            },
            {
                name: 'Tasks',
                icon: '✅',
                title: 'Aufgaben',
                description: 'To-Dos verwalten, anlegen und Status aktualisieren',
                writeLabel: 'Aufgaben erstellen & ändern',
                readLabel: 'Aufgaben lesen',
                hasWriteAsk: true
            },
            {
                name: 'Journal',
                icon: '📖',
                title: 'Tagebuch',
                description: 'Persönliche Reflexionen und Tagebucheinträge',
                writeLabel: 'Einträge verfassen',
                readLabel: 'Tagebuch lesen',
                hasWriteAsk: true
            },
            {
                name: 'Projects',
                icon: '📁',
                title: 'Projekte & Notizen',
                description: 'Projektordner, Dokumente und Notizen verwalten',
                writeLabel: 'Erstellen & ändern',
                readLabel: 'Lesen & einsehen',
                hasWriteAsk: true
            },
            {
                name: 'Memory',
                icon: '🧠',
                title: 'Gedächtnis (Memory)',
                description: 'Langzeitgedächtnis, persönliche Fakten und Vorlieben',
                writeLabel: 'Merken & speichern',
                readLabel: 'Erinnerungen abrufen',
                hasWriteAsk: true
            },
            {
                name: 'Timer',
                icon: '⏱️',
                title: 'Timer',
                description: 'Kurzzeitwecker, Countdowns und Alarm-Timer',
                writeLabel: 'Timer stellen & steuern',
                readLabel: 'Aktive Timer anzeigen',
                hasWriteAsk: true
            },
            {
                name: 'AppLauncher',
                icon: '🚀',
                title: 'Programm-Starter',
                description: 'Desktop-Programme und Anwendungen ausführen',
                writeLabel: 'Programme starten',
                readLabel: 'Programme suchen',
                hasWriteAsk: true
            },
            {
                name: 'Notifications',
                icon: '🔔',
                title: 'Benachrichtigungen & Rückfragen',
                description: 'Darf interaktive Meldungen und Fragen ins Agent-Briefing stellen',
                writeLabel: 'Rückfragen & Meldungen erstellen',
                readLabel: 'Status abfragen',
                hasWriteAsk: false
            },
            {
                name: 'Instructions',
                icon: '💡',
                title: 'Systemanweisungen & Workflows',
                description: 'Zugriff auf Systemanleitungen und Standard-Workflows',
                writeLabel: 'Workflows ausführen',
                readLabel: 'Anleitungen lesen',
                hasWriteAsk: false
            }
        ];



        async function loadAgentSettings() {
            try {
                const res = await fetch(getApiUrl('/settings/agents'));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                currentAgentSettings = data.agentSettings || {};
                window.currentAgentSettings = currentAgentSettings;
                if (data.plugins) availablePluginsForAgents = data.plugins;
                if (data.availableTriggers) availableTriggersForAgents = data.availableTriggers;
                return currentAgentSettings;
            } catch (err) {
                console.warn('Fehler beim Laden der Agenten-Einstellungen:', err);
                return currentAgentSettings;
            }
        }
        window.loadAgentSettings = loadAgentSettings;

        async function loadAgentSettingsUI() {
            const container = document.getElementById('agent-settings-container');
            if (container) {
                container.innerHTML = '<div style="text-align: center; padding: 12px; color: #a6adc8; font-size: 0.8rem;">Lade Agenten-Einstellungen...</div>';
            }

            try {
                await loadAgentSettings();
                if (container) {
                    renderAgentSettingsCards();
                }
            } catch (err) {
                console.warn('Fehler beim Laden der Agenten-Einstellungen:', err);
                if (container) {
                    container.innerHTML = '<div style="color: #f38ba8; font-size: 0.8rem; padding: 10px;">Konnte Agenten-Einstellungen nicht laden.</div>';
                }
            }
        }



        function getTriggerInfo(triggerId) {
            const found = availableTriggersForAgents.find(t => t.id === triggerId);
            if (found) return found;
            return {
                id: triggerId || "custom",
                name: triggerId || "Benutzerdefiniert",
                badge: (triggerId || "AGENT").toUpperCase(),
                color: "#cba6f7",
                bg: "rgba(203, 166, 247, 0.15)",
                icon: "🤖",
                description: "Benutzerdefinierter Trigger"
            };
        }



        function renderAgentSettingsCards() {
            const container = document.getElementById('agent-settings-container');
            if (!container) return;
            container.innerHTML = '';

            const agentKeys = Object.keys(currentAgentSettings);
            if (agentKeys.length === 0) {
                container.innerHTML = '<div style="color: #a6adc8; font-size: 0.8rem; padding: 12px; text-align: center;">Keine Agenten vorhanden. Klicke oben auf "➕ Agent erstellen", um einen neuen Agenten anzulegen.</div>';
                return;
            }

            agentKeys.forEach(key => {
                const conf = currentAgentSettings[key];
                const card = document.createElement('div');
                card.className = 'agent-setting-card';
                card.id = 'agent-card-' + key;
                const agentColor = conf.color || '#89b4fa';
                const agentAvatar = conf.avatar || '🤖';
                card.style.background = 'rgba(255, 255, 255, 0.03)';
                card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
                card.style.borderLeft = '5px solid ' + agentColor;
                card.style.borderRadius = '12px';
                card.style.padding = '14px 16px';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.gap = '10px';
                card.style.transition = 'border-color 0.2s, background 0.2s';

                const triggerInfo = getTriggerInfo(conf.trigger || key);
                const isEnabled = conf.isEnabled !== false;
                const isSystem = conf.isSystem === true || key === 'default';

                const badgeHtml = `<span style="font-size: 0.68rem; background: ${triggerInfo.bg}; color: ${triggerInfo.color}; padding: 3px 8px; border-radius: 6px; font-weight: 700; border: 1px solid ${triggerInfo.color}33; display: inline-flex; align-items: center; gap: 4px;">${triggerInfo.icon} ${triggerInfo.badge}</span>`;

                // Status Badge
                const statusBadge = isEnabled
                    ? `<span id="agent-status-label-${key}" style="font-size: 0.72rem; color: #a6e3a1; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">● Aktiv</span>`
                    : `<span id="agent-status-label-${key}" style="font-size: 0.72rem; color: #f38ba8; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">○ Deaktiviert</span>`;

                // Actions buttons
                let actionsHtml = `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button type="button" onclick="openEditAgentModal('${key}')" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cdd6f4; border-radius: 6px; padding: 4px 10px; font-size: 0.72rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                            ✏️ Bearbeiten
                        </button>
                `;

                if (!isSystem) {
                    actionsHtml += `
                        <button type="button" onclick="deleteAgent('${key}')" style="background: rgba(243, 139, 168, 0.1); border: 1px solid rgba(243, 139, 168, 0.25); color: #f38ba8; border-radius: 6px; padding: 4px 10px; font-size: 0.72rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" onmouseover="this.style.background='rgba(243, 139, 168, 0.2)'" onmouseout="this.style.background='rgba(243, 139, 168, 0.1)'" title="Agent löschen">
                            🗑️ Löschen
                        </button>
                    `;
                }

                actionsHtml += `</div>`;

                // Plugins Badges HTML
                let pluginsBadgesHtml = '';
                const allowedList = conf.allowedPlugins || [];
                const hasWildcard = allowedList.includes('*');

                AGENT_PLUGIN_CATEGORIES.forEach(cat => {
                    let det = conf.detailedPermissions ? conf.detailedPermissions[cat.name] : null;
                    if (!det) {
                        let perm = conf.pluginPermissions ? conf.pluginPermissions[cat.name] : null;
                        if (perm === 'allowed') det = { read: 'yes', write: 'yes' };
                        else if (perm === 'ask') det = { read: 'yes', write: 'ask' };
                        else if (hasWildcard) det = { read: 'yes', write: 'yes' };
                        else det = { read: 'no', write: 'no' };
                    }

                    if (det.write === 'yes' && det.read === 'yes') {
                        pluginsBadgesHtml += `<span class="detailed-perm-badge badge-green" title="${cat.title}: Vollzugriff (Aktionen & Lesen)">🟢 ${cat.icon} ${cat.title}: Vollzugriff</span>`;
                    } else if (det.write === 'ask') {
                        const readTxt = det.read === 'yes' ? 'Lesen: Ja' : 'Lesen: Nein';
                        pluginsBadgesHtml += `<span class="detailed-perm-badge badge-yellow" title="${cat.title}: Aktionen nur nach Bestätigung">🟡 ${cat.icon} ${cat.title}: Auf Anfrage <small style="opacity:0.85">(${readTxt})</small></span>`;
                    } else if (det.read === 'yes' && det.write === 'no') {
                        pluginsBadgesHtml += `<span class="detailed-perm-badge badge-yellow" title="${cat.title}: Nur Lesezugriff">🟡 ${cat.icon} ${cat.title}: Nur Lesen</span>`;
                    } else if (det.write === 'yes' && det.read === 'no') {
                        pluginsBadgesHtml += `<span class="detailed-perm-badge badge-yellow" title="${cat.title}: Nur Aktionen">🟡 ${cat.icon} ${cat.title}: Nur Aktionen</span>`;
                    } else {
                        pluginsBadgesHtml += `<span class="detailed-perm-badge badge-red" title="${cat.title}: Gesperrt">🔴 ${cat.icon} ${cat.title}: Gesperrt</span>`;
                    }
                });

                // Trigger details note
                let triggerNote = '';
                if (conf.trigger === 'webhook') {
                    triggerNote = `<div style="font-size: 0.72rem; color: #a6e3a1; background: rgba(166, 227, 161, 0.08); border: 1px solid rgba(166, 227, 161, 0.2); border-radius: 6px; padding: 6px 10px; margin-bottom: 2px;">
                        ⚡ <strong>Webhook Trigger:</strong> Aufruf via <code>POST /api/agent-runs/trigger</code> mit Body <code>{"agentId": "${key}", "prompt": "..."}</code>
                    </div>`;
                } else if (conf.triggerDescription) {
                    triggerNote = `<div style="font-size: 0.72rem; color: #89b4fa; background: rgba(137, 180, 250, 0.06); border: 1px solid rgba(137, 180, 250, 0.15); border-radius: 6px; padding: 6px 10px; margin-bottom: 2px;">
                        ⚡ <strong>Trigger:</strong> ${conf.triggerDescription}
                    </div>`;
                }

                // System Prompt Collapsible
                let promptDetailsHtml = '';
                if (conf.systemPrompt && conf.systemPrompt.trim()) {
                    const escapedPrompt = conf.systemPrompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    promptDetailsHtml = `
                        <details style="margin-top: 4px; font-size: 0.74rem; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 10px;">
                            <summary style="cursor: pointer; color: var(--accent); font-weight: 600;">📝 Spezielle Rollenanweisungen (System-Prompt) anzeigen</summary>
                            <div style="margin-top: 6px; white-space: pre-wrap; color: #cdd6f4; font-family: monospace; font-size: 0.72rem; line-height: 1.4;">${escapedPrompt}</div>
                        </details>
                    `;
                }

                // Remote Tools Pill
                const remoteToolsStatus = conf.allowAllDynamicTools 
                    ? '<span style="font-size: 0.7rem; color: #89b4fa; background: rgba(137, 180, 250, 0.1); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(137, 180, 250, 0.2);">🌐 Externe Tools: Vollzugriff</span>'
                    : (conf.allowedDynamicProviders && conf.allowedDynamicProviders.length > 0 
                        ? `<span style="font-size: 0.7rem; color: #89b4fa; background: rgba(137, 180, 250, 0.1); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(137, 180, 250, 0.2);">🌐 Externe Tools: ${conf.allowedDynamicProviders.join(', ')}</span>`
                        : '<span style="font-size: 0.7rem; color: #6c7086; background: rgba(255,255,255,0.05); padding: 2px 7px; border-radius: 4px;">🔒 Externe Tools: Gesperrt</span>');

                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <label class="switch" style="transform: scale(0.85); margin-right: -4px;" title="Agent aktivieren / deaktivieren">
                                <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleAgentActive('${key}', this.checked)">
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 1.3rem; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; background: ${agentColor}22; border: 1.5px solid ${agentColor}66;">${agentAvatar}</span>
                            <span style="font-weight: 700; font-size: 0.95rem; color: #ffffff;">${conf.name}</span>
                            <span style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${agentColor}; border: 1.5px solid rgba(255,255,255,0.4);" title="Akzentfarbe für Anfragen: ${agentColor}"></span>
                            <span style="font-size: 0.7rem; color: #a6adc8; font-family: monospace; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">#${key}</span>
                            ${badgeHtml}
                            ${statusBadge}
                        </div>
                        ${actionsHtml}
                    </div>

                    <div style="font-size: 0.76rem; color: #a6adc8; line-height: 1.4;">${conf.description || 'Keine Beschreibung angegeben.'}</div>

                    ${triggerNote}
                    ${promptDetailsHtml}

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px;">
                            Plugin-Berechtigungen & Zugriff:
                        </div>
                        ${remoteToolsStatus}
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${pluginsBadgesHtml}
                    </div>
                `;

                container.appendChild(card);
            });
        }



        // ==================== AGENT CRUD MODAL LOGIC ====================

        function setModalColor(hex) {
            const picker = document.getElementById('agent-modal-color');
            const input = document.getElementById('agent-modal-color-hex');
            if (picker) picker.value = hex;
            if (input) input.value = hex;
        }



        function populateModalTriggers(selectedTriggerId) {
            const select = document.getElementById('agent-modal-trigger');
            if (!select) return;
            select.innerHTML = '';

            availableTriggersForAgents.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.icon} ${t.name}`;
                if (t.id === selectedTriggerId) opt.selected = true;
                select.appendChild(opt);
            });

            onModalTriggerChange(select.value);
        }



        function onModalTriggerChange(triggerId) {
            const descEl = document.getElementById('agent-modal-trigger-desc');
            if (!descEl) return;
            const t = getTriggerInfo(triggerId);
            let extra = '';
            if (triggerId === 'webhook') {
                extra = '<br><strong>Trigger-Aufruf:</strong> <code>POST /api/agent-runs/trigger</code> mit JSON-Body <code>{"agentId": "&lt;id&gt;", "prompt": "Anweisung..."}</code>';
            } else if (triggerId === 'mail') {
                extra = '<br><strong>Automatisierung:</strong> Startet bei jeder neuen E-Mail die automatische Analyse und schlägt ggf. Benachrichtigungen, Termine oder Aufgaben vor.';
            } else if (triggerId === 'discord') {
                extra = '<br><strong>Discord Bot:</strong> Startet bei Erwähnung des Bots auf dem Discord-Server in berechtigten Kanälen.';
            }
            descEl.innerHTML = `${t.description}${extra}`;
        }



        function onAgentNameInput(val) {
            const keyInput = document.getElementById('agent-modal-key');
            const idInput = document.getElementById('agent-modal-id');
            if (!keyInput.value && idInput) {
                const slug = val.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
                idInput.value = slug;
            }
        }



        function populateModalPlugins(detailedPermissions = {}, pluginPermissions = {}, legacyAllowed = ['*']) {
            const container = document.getElementById('agent-modal-plugins-container');
            if (!container) return;
            container.innerHTML = '';

            const hasWildcard = Array.isArray(legacyAllowed) && legacyAllowed.includes('*');

            AGENT_PLUGIN_CATEGORIES.forEach(cat => {
                let currentDet = detailedPermissions ? detailedPermissions[cat.name] : null;
                if (!currentDet) {
                    const legacyPerm = pluginPermissions ? pluginPermissions[cat.name] : null;
                    if (legacyPerm === 'allowed') {
                        currentDet = { read: 'yes', write: 'yes' };
                    } else if (legacyPerm === 'ask') {
                        currentDet = { read: 'yes', write: 'ask' };
                    } else if (hasWildcard) {
                        currentDet = { read: 'yes', write: 'yes' };
                    } else if (Array.isArray(legacyAllowed) && legacyAllowed.includes(cat.name)) {
                        currentDet = { read: 'yes', write: cat.hasWriteAsk ? 'ask' : 'yes' };
                    } else {
                        currentDet = { read: 'no', write: 'no' };
                    }
                }

                const writeVal = currentDet.write || 'no';
                const readVal = currentDet.read || 'no';

                const card = document.createElement('div');
                card.className = 'plugin-perm-card';
                card.id = `modal-perm-card-${cat.name}`;

                card.innerHTML = `
                    <div class="plugin-perm-header">
                        <div class="plugin-perm-title">
                            <span style="font-size: 1.15rem;">${cat.icon}</span>
                            <span>${cat.title}</span>
                        </div>
                        <div class="plugin-perm-desc">${cat.description}</div>
                    </div>
                    <div class="plugin-perm-rows">
                        <!-- Row 1: Senden / Aktionen erstellen & ändern -->
                        <div class="plugin-perm-row">
                            <span class="perm-row-label">⚡ ${cat.writeLabel}:</span>
                            <div class="perm-btn-group" id="perm-group-${cat.name}-write" data-plugin="${cat.name}" data-type="write" data-val="${writeVal}">
                                <button type="button" class="perm-btn ${writeVal === 'no' ? 'active-no' : ''}" data-val="no" onclick="setPluginPermBtn('${cat.name}', 'write', 'no')">Nein</button>
                                ${cat.hasWriteAsk ? `<button type="button" class="perm-btn ${writeVal === 'ask' ? 'active-ask' : ''}" data-val="ask" onclick="setPluginPermBtn('${cat.name}', 'write', 'ask')">Ja, nur mit Abfrage</button>` : ''}
                                <button type="button" class="perm-btn ${writeVal === 'yes' ? 'active-yes' : ''}" data-val="yes" onclick="setPluginPermBtn('${cat.name}', 'write', 'yes')">Ja</button>
                            </div>
                        </div>
                        <!-- Row 2: Lesen & Einsehen -->
                        <div class="plugin-perm-row">
                            <span class="perm-row-label">👁️ ${cat.readLabel}:</span>
                            <div class="perm-btn-group" id="perm-group-${cat.name}-read" data-plugin="${cat.name}" data-type="read" data-val="${readVal}">
                                <button type="button" class="perm-btn ${readVal === 'no' ? 'active-no' : ''}" data-val="no" onclick="setPluginPermBtn('${cat.name}', 'read', 'no')">Nein</button>
                                <button type="button" class="perm-btn ${readVal === 'yes' ? 'active-yes' : ''}" data-val="yes" onclick="setPluginPermBtn('${cat.name}', 'read', 'yes')">Ja</button>
                            </div>
                        </div>
                    </div>
                `;

                container.appendChild(card);
            });
        }



        function setPluginPermBtn(pluginName, type, val) {
            const group = document.getElementById(`perm-group-${pluginName}-${type}`);
            if (!group) return;
            group.setAttribute('data-val', val);
            const btns = group.querySelectorAll('.perm-btn');
            btns.forEach(btn => {
                btn.classList.remove('active-no', 'active-ask', 'active-yes');
                const bVal = btn.getAttribute('data-val');
                if (bVal === val) {
                    btn.classList.add(`active-${val}`);
                }
            });
        }



        function setAllModalPluginPerms(level) {
            AGENT_PLUGIN_CATEGORIES.forEach(cat => {
                if (level === 'allowed') {
                    setPluginPermBtn(cat.name, 'write', 'yes');
                    setPluginPermBtn(cat.name, 'read', 'yes');
                } else if (level === 'disabled') {
                    setPluginPermBtn(cat.name, 'write', 'no');
                    setPluginPermBtn(cat.name, 'read', 'no');
                }
            });
        }



        function setSafeModalPluginPerms() {
            AGENT_PLUGIN_CATEGORIES.forEach(cat => {
                if (['Mail', 'Calendar', 'Tasks'].includes(cat.name)) {
                    setPluginPermBtn(cat.name, 'write', 'ask');
                    setPluginPermBtn(cat.name, 'read', 'yes');
                } else if (['Memory', 'Journal', 'Projects'].includes(cat.name)) {
                    setPluginPermBtn(cat.name, 'write', 'no');
                    setPluginPermBtn(cat.name, 'read', 'no');
                } else if (['Timer', 'AppLauncher'].includes(cat.name)) {
                    setPluginPermBtn(cat.name, 'write', 'ask');
                    setPluginPermBtn(cat.name, 'read', 'yes');
                } else {
                    setPluginPermBtn(cat.name, 'write', 'yes');
                    setPluginPermBtn(cat.name, 'read', 'yes');
                }
            });
        }



        function openCreateAgentModal() {
            try {
                const titleEl = document.getElementById('agent-modal-title');
                if (titleEl) titleEl.textContent = '✨ Neuen Agenten erstellen';
                const iconEl = document.getElementById('agent-modal-icon');
                if (iconEl) iconEl.textContent = '✨';
                const keyInput = document.getElementById('agent-modal-key');
                if (keyInput) keyInput.value = '';
                const isSysInput = document.getElementById('agent-modal-is-system');
                if (isSysInput) isSysInput.value = 'false';

                const idInput = document.getElementById('agent-modal-id');
                if (idInput) {
                    idInput.value = '';
                    idInput.disabled = false;
                    idInput.style.opacity = '1';
                }

                const nameInput = document.getElementById('agent-modal-name');
                if (nameInput) nameInput.value = '';
                const descInput = document.getElementById('agent-modal-desc');
                if (descInput) descInput.value = '';
                const promptInput = document.getElementById('agent-modal-system-prompt');
                if (promptInput) promptInput.value = '';
                const avatarInput = document.getElementById('agent-modal-avatar');
                if (avatarInput) avatarInput.value = '🤖';
                setModalColor('#89b4fa');
                const remoteInput = document.getElementById('agent-modal-remote-tools');
                if (remoteInput) remoteInput.checked = true;
                const enabledInput = document.getElementById('agent-modal-enabled');
                if (enabledInput) enabledInput.checked = true;

                populateModalTriggers('manual');
                populateModalPlugins({
                    Mail: { read: 'yes', write: 'ask' },
                    Calendar: { read: 'yes', write: 'ask' },
                    Tasks: { read: 'yes', write: 'ask' },
                    Notifications: { read: 'yes', write: 'yes' },
                    Instructions: { read: 'yes', write: 'yes' }
                });

                const overlay = document.getElementById('agent-crud-overlay');
                if (overlay) {
                    overlay.style.display = 'flex';
                }
            } catch (err) {
                console.error('Fehler beim Öffnen des Erstellen-Modals:', err);
            }
        }



        async function openEditAgentModal(key) {
            try {
                if (!currentAgentSettings || Object.keys(currentAgentSettings).length === 0) {
                    await loadAgentSettingsUI();
                }

                let conf = currentAgentSettings ? currentAgentSettings[key] : null;
                if (!conf) {
                    // Fallback-Suche nach ID oder case-insensitive
                    const foundKey = Object.keys(currentAgentSettings || {}).find(k => 
                        k.toLowerCase() === (key || '').toLowerCase() || 
                        (currentAgentSettings[k] && currentAgentSettings[k].id === key) ||
                        (currentAgentSettings[k] && currentAgentSettings[k].name === key)
                    );
                    if (foundKey) {
                        conf = currentAgentSettings[foundKey];
                        key = foundKey;
                    }
                }

                if (!conf) {
                    console.error('Agent mit Key nicht gefunden:', key, currentAgentSettings);
                    alert(`Agent '${key}' konnte nicht gefunden werden.`);
                    return;
                }

                const titleEl = document.getElementById('agent-modal-title');
                if (titleEl) titleEl.textContent = `✏️ Agent bearbeiten: ${conf.name || key}`;
                const iconEl = document.getElementById('agent-modal-icon');
                if (iconEl) iconEl.textContent = conf.avatar || '🤖';
                const keyInput = document.getElementById('agent-modal-key');
                if (keyInput) keyInput.value = key;
                const isSysInput = document.getElementById('agent-modal-is-system');
                if (isSysInput) isSysInput.value = (conf.isSystem || key === 'default') ? 'true' : 'false';

                const idInput = document.getElementById('agent-modal-id');
                if (idInput) {
                    idInput.value = key;
                    idInput.disabled = (conf.isSystem || key === 'default');
                    idInput.style.opacity = idInput.disabled ? '0.6' : '1';
                }

                const nameInput = document.getElementById('agent-modal-name');
                if (nameInput) nameInput.value = conf.name || '';
                const descInput = document.getElementById('agent-modal-desc');
                if (descInput) descInput.value = conf.description || '';
                const promptInput = document.getElementById('agent-modal-system-prompt');
                if (promptInput) promptInput.value = conf.systemPrompt || '';
                const avatarInput = document.getElementById('agent-modal-avatar');
                if (avatarInput) avatarInput.value = conf.avatar || '🤖';
                setModalColor(conf.color || '#89b4fa');
                const remoteInput = document.getElementById('agent-modal-remote-tools');
                if (remoteInput) remoteInput.checked = conf.allowAllDynamicTools !== false;
                const enabledInput = document.getElementById('agent-modal-enabled');
                if (enabledInput) enabledInput.checked = conf.isEnabled !== false;

                populateModalTriggers(conf.trigger || key);
                populateModalPlugins(conf.detailedPermissions || {}, conf.pluginPermissions || {}, conf.allowedPlugins || ['*']);

                const overlay = document.getElementById('agent-crud-overlay');
                if (overlay) {
                    overlay.style.display = 'flex';
                } else {
                    console.error('agent-crud-overlay Element nicht gefunden!');
                }
            } catch (err) {
                console.error('Fehler beim Öffnen des Bearbeiten-Modals:', err);
                alert('Fehler beim Öffnen des Bearbeiten-Modals: ' + err.message);
            }
        }



        function closeAgentCrudModal() {
            const overlay = document.getElementById('agent-crud-overlay');
            if (overlay) overlay.style.display = 'none';
        }



        async function saveAgentFromModal() {
            const keyInput = document.getElementById('agent-modal-key').value.trim();
            const nameInput = document.getElementById('agent-modal-name').value.trim();
            const idInput = document.getElementById('agent-modal-id').value.trim();
            const trigger = document.getElementById('agent-modal-trigger').value;
            const desc = document.getElementById('agent-modal-desc').value.trim();
            const systemPrompt = document.getElementById('agent-modal-system-prompt').value.trim();
            const avatar = document.getElementById('agent-modal-avatar').value.trim() || '🤖';
            const color = document.getElementById('agent-modal-color').value.trim() || '#89b4fa';
            const remoteTools = document.getElementById('agent-modal-remote-tools').checked;
            const isEnabled = document.getElementById('agent-modal-enabled').checked;

            if (!nameInput) {
                alert('Bitte gib einen Namen für den Agenten ein.');
                document.getElementById('agent-modal-name').focus();
                return;
            }

            const detailedPermissions = {};
            const pluginPermissions = {};
            const allowedPlugins = [];

            AGENT_PLUGIN_CATEGORIES.forEach(cat => {
                const writeGroup = document.getElementById(`perm-group-${cat.name}-write`);
                const readGroup = document.getElementById(`perm-group-${cat.name}-read`);
                const writeVal = writeGroup ? writeGroup.getAttribute('data-val') || 'no' : 'no';
                const readVal = readGroup ? readGroup.getAttribute('data-val') || 'no' : 'no';

                detailedPermissions[cat.name] = {
                    read: readVal,
                    write: writeVal
                };

                if (writeVal === 'yes') {
                    pluginPermissions[cat.name] = 'allowed';
                } else if (writeVal === 'ask' || readVal === 'yes') {
                    pluginPermissions[cat.name] = 'ask';
                } else {
                    pluginPermissions[cat.name] = 'disabled';
                }

                if (readVal === 'yes' || writeVal !== 'no') {
                    allowedPlugins.push(cat.name);
                }
            });

            const effectiveKey = keyInput || idInput || nameInput.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

            const payload = {
                id: effectiveKey,
                name: nameInput,
                avatar,
                color,
                description: desc,
                trigger: trigger,
                systemPrompt: systemPrompt,
                detailedPermissions,
                pluginPermissions,
                allowedPlugins,
                allowedDynamicProviders: ['discord-bot'],
                allowAllDynamicTools: remoteTools,
                isEnabled: isEnabled
            };

            try {
                const res = await fetch(getApiUrl('/settings/agents'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || 'HTTP ' + res.status);
                }

                const data = await res.json();
                currentAgentSettings = data.agentSettings;
                renderAgentSettingsCards();
                closeAgentCrudModal();

                if (typeof addMessage === 'function') {
                    addMessage(`✅ Agent '${nameInput}' (${avatar}) erfolgreich gespeichert.`, false);
                }
            } catch (err) {
                alert('Fehler beim Speichern des Agenten: ' + err.message);
            }
        }



        async function deleteAgent(key) {
            const conf = currentAgentSettings[key];
            const name = conf?.name || key;
            if (!confirm(`Möchtest du den Agenten '${name}' wirklich unwiderruflich löschen?`)) {
                return;
            }

            try {
                const res = await fetch(getApiUrl('/settings/agents/' + encodeURIComponent(key)), {
                    method: 'DELETE'
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || 'HTTP ' + res.status);
                }

                const data = await res.json();
                currentAgentSettings = data.agentSettings;
                renderAgentSettingsCards();

                if (typeof addMessage === 'function') {
                    addMessage(`🗑️ Agent '${name}' wurde gelöscht.`, false);
                }
            } catch (err) {
                alert('Fehler beim Löschen des Agenten: ' + err.message);
            }
        }



        async function toggleAgentActive(key, isEnabled) {
            try {
                const res = await fetch(getApiUrl('/settings/agents/' + encodeURIComponent(key) + '/toggle'), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isEnabled })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (currentAgentSettings[key]) {
                        currentAgentSettings[key].isEnabled = data.isEnabled;
                    }
                    const label = document.getElementById('agent-status-label-' + key);
                    if (label) {
                        label.innerHTML = data.isEnabled 
                            ? '● Aktiv' 
                            : '○ Deaktiviert';
                        label.style.color = data.isEnabled ? '#a6e3a1' : '#f38ba8';
                    }
                }
            } catch (err) {
                console.warn('Fehler beim Ändern des Agentenstatus:', err);
            }
        }



        // Globale Bindung für HTML-Events
        window.openEditAgentModal = openEditAgentModal;


        window.openCreateAgentModal = openCreateAgentModal;


        window.closeAgentCrudModal = closeAgentCrudModal;


        window.saveAgentFromModal = saveAgentFromModal;


        window.deleteAgent = deleteAgent;


        window.toggleAgentActive = toggleAgentActive;


        window.setPluginPermBtn = setPluginPermBtn;


        window.setAllModalPluginPerms = setAllModalPluginPerms;


        window.setSafeModalPluginPerms = setSafeModalPluginPerms;


        window.setModalColor = setModalColor;


        window.onModalTriggerChange = onModalTriggerChange;


        window.onAgentNameInput = onAgentNameInput;


        window.loadAgentSettingsUI = loadAgentSettingsUI;




        // ==========================================
        // Dynamische & Registrierte KI-Tools Übersicht
        // ==========================================
        let allRegisteredToolsCache = {
            dynamicTools: [],
            internalTools: []
        };



        function escapeToolHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }



        window.toggleToolParams = function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            const isVisible = el.style.display !== 'none';
            el.style.display = isVisible ? 'none' : 'block';
            const btn = el.previousElementSibling;
            if (btn && btn.tagName === 'BUTTON') {
                btn.textContent = isVisible ? '📋 Parameter anzeigen ▾' : '📋 Parameter ausblenden ▴';
            }
        };



        window.toggleDynamicToolStatus = async function(toolName, isEnabled) {
            try {
                const res = await fetch(getApiUrl('/api/tools/' + encodeURIComponent(toolName) + '/toggle'), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isEnabled: isEnabled })
                });
                if (res.ok) {
                    console.log(`Tool '${toolName}' Status aktualisiert:`, isEnabled);
                    const tool = allRegisteredToolsCache.dynamicTools.find(t => t.name === toolName);
                    if (tool) tool.isEnabled = isEnabled;
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`Fehler beim Ändern des Tool-Status: ${err.error || res.statusText}`);
                    loadRegisteredToolsOverview();
                }
            } catch (e) {
                console.error("Fehler beim Umschalten des Tool-Status:", e);
                alert(`Netzwerkfehler: ${e.message}`);
                loadRegisteredToolsOverview();
            }
        };



        window.deleteDynamicTool = async function(toolName) {
            if (!confirm(`Möchtest du das externe Tool '${toolName}' wirklich deregistrieren und löschen?`)) {
                return;
            }
            try {
                const res = await fetch(getApiUrl('/api/tools/' + encodeURIComponent(toolName)), {
                    method: 'DELETE'
                });
                if (res.ok) {
                    allRegisteredToolsCache.dynamicTools = allRegisteredToolsCache.dynamicTools.filter(t => t.name !== toolName);
                    filterRegisteredToolsView();
                    const badge = document.getElementById('tools-badge-count');
                    if (badge) {
                        const dynCount = allRegisteredToolsCache.dynamicTools.length;
                        badge.textContent = `${dynCount} Remote / ${dynCount + allRegisteredToolsCache.internalTools.length} Gesamt`;
                    }
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`Fehler beim Löschen des Tools: ${err.error || res.statusText}`);
                }
            } catch (e) {
                console.error("Fehler beim Löschen:", e);
                alert(`Fehler beim Löschen: ${e.message}`);
            }
        };



        window.loadRegisteredToolsOverview = async function() {
            const listEl = document.getElementById('registered-tools-list');
            const badgeEl = document.getElementById('tools-badge-count');
            if (listEl) {
                listEl.innerHTML = '<div style="text-align: center; padding: 15px; color: #a6adc8; font-size: 0.8rem;">Lade registrierte Werkzeuge...</div>';
            }

            try {
                // Versuche die umfassende Overview-API abzurufen
                const res = await fetch(getApiUrl('/api/tools/overview'));
                if (res.ok) {
                    const data = await res.json();
                    allRegisteredToolsCache = {
                        dynamicTools: Array.isArray(data.dynamicTools) ? data.dynamicTools : [],
                        internalTools: Array.isArray(data.internalTools) ? data.internalTools : []
                    };
                } else {
                    // Fallback: reine /api/tools Liste
                    const fbRes = await fetch(getApiUrl('/api/tools'));
                    if (fbRes.ok) {
                        const fbData = await fbRes.json();
                        allRegisteredToolsCache = {
                            dynamicTools: Array.isArray(fbData.tools) ? fbData.tools.map(t => ({ ...t, isDynamic: true })) : [],
                            internalTools: []
                        };
                    }
                }

                const dynCount = allRegisteredToolsCache.dynamicTools.length;
                const totalCount = dynCount + allRegisteredToolsCache.internalTools.length;
                if (badgeEl) {
                    badgeEl.textContent = `${dynCount} Remote / ${totalCount} Gesamt`;
                }

                filterRegisteredToolsView();
            } catch (err) {
                console.warn("Fehler beim Abrufen der registrierten Tools:", err);
                if (listEl) {
                    listEl.innerHTML = `<div style="text-align: center; padding: 15px; color: #f38ba8; font-size: 0.8rem;">Konnte Tools nicht laden (${escapeToolHtml(err.message)})</div>`;
                }
            }
        };



        window.filterRegisteredToolsView = function() {
            const listEl = document.getElementById('registered-tools-list');
            if (!listEl) return;

            const searchInput = document.getElementById('tools-search-input');
            const filterSelect = document.getElementById('tools-filter-type');
            
            const query = (searchInput?.value || '').toLowerCase().trim();
            const filterType = filterSelect?.value || 'dynamic';

            let itemsToDisplay = [];

            if (filterType === 'all') {
                itemsToDisplay = [
                    ...allRegisteredToolsCache.dynamicTools,
                    ...allRegisteredToolsCache.internalTools
                ];
            } else if (filterType === 'dynamic') {
                itemsToDisplay = [...allRegisteredToolsCache.dynamicTools];
            } else if (filterType === 'internal') {
                itemsToDisplay = [...allRegisteredToolsCache.internalTools];
            }

            if (query) {
                itemsToDisplay = itemsToDisplay.filter(item => {
                    const name = (item.name || '').toLowerCase();
                    const desc = (item.description || '').toLowerCase();
                    const prov = (item.provider || item.pluginName || '').toLowerCase();
                    return name.includes(query) || desc.includes(query) || prov.includes(query);
                });
            }

            if (itemsToDisplay.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 25px 15px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px;">
                        <span style="font-size: 1.5rem; display: block; margin-bottom: 6px;">🔍</span>
                        <span style="color: #a6adc8; font-size: 0.85rem;">Keine passenden Tools gefunden.</span>
                        <div style="color: #6c7086; font-size: 0.75rem; margin-top: 4px;">
                            ${filterType === 'dynamic' ? 'Bislang wurden keine externen Tools per Push registriert.' : 'Passe deinen Suchbegriff oder Filter an.'}
                        </div>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = '';
            itemsToDisplay.forEach(tool => {
                const card = document.createElement('div');
                card.className = 'registered-tool-card';
                card.style.cssText = 'background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s;';

                const isDyn = !!tool.isDynamic;
                const safeName = escapeToolHtml(tool.name);
                const safeDesc = escapeToolHtml(tool.description || 'Keine Beschreibung verfügbar.');
                const safeProvider = escapeToolHtml(tool.provider || tool.pluginName || (isDyn ? 'extern' : 'System'));
                const paramsId = `tool-params-${safeName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

                let headerRightHtml = '';
                if (isDyn) {
                    headerRightHtml = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <label class="switch" title="Tool aktivieren / deaktivieren">
                                <input type="checkbox" onchange="toggleDynamicToolStatus('${safeName}', this.checked)" ${tool.isEnabled !== false ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                            <button type="button" onclick="deleteDynamicTool('${safeName}')" title="Tool deregistrieren" style="background: transparent; border: none; color: #f38ba8; cursor: pointer; padding: 4px; font-size: 0.85rem; border-radius: 4px; opacity: 0.75;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.75'">🗑️</button>
                        </div>
                    `;
                } else {
                    const statusColor = tool.isEnabled !== false ? '#a6e3a1' : '#f38ba8';
                    const statusText = tool.isEnabled !== false ? '● Aktiv' : '○ Deaktiviert';
                    headerRightHtml = `
                        <span style="font-size: 0.72rem; color: ${statusColor}; font-weight: 600;">${statusText}</span>
                    `;
                }

                let metaDetailsHtml = '';
                if (isDyn && tool.endpointUrl) {
                    const safeEndpoint = escapeToolHtml(tool.endpointUrl);
                    const authText = tool.authentication?.type
                        ? `${escapeToolHtml(tool.authentication.type)} ${tool.authentication.header ? '(' + escapeToolHtml(tool.authentication.header) + ')' : ''}`
                        : 'keine';
                    metaDetailsHtml = `
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
                            <div style="font-size: 0.72rem; color: #89dceb; font-family: monospace; word-break: break-all; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 5px; display: flex; align-items: center; gap: 6px;">
                                <span>🔗</span>
                                <span>${safeEndpoint}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px; font-size: 0.7rem; color: #fab387;">
                                <span>🔑 Auth: <b>${authText}</b></span>
                                ${tool.updatedAt ? `<span style="color: #6c7086;">🕒 ${new Date(tool.updatedAt).toLocaleDateString('de-DE')}</span>` : ''}
                            </div>
                        </div>
                    `;
                }

                const paramsJson = JSON.stringify(tool.parameters || {}, null, 2);

                card.innerHTML = `
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <span style="background: ${isDyn ? 'rgba(137, 180, 250, 0.15)' : 'rgba(166, 227, 161, 0.15)'}; color: ${isDyn ? 'var(--accent)' : '#a6e3a1'}; border: 1px solid ${isDyn ? 'rgba(137, 180, 250, 0.3)' : 'rgba(166, 227, 161, 0.3)'}; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; letter-spacing: 0.5px;">
                                    ${isDyn ? '🌐 REMOTE' : '⚙️ SYSTEM'}
                                </span>
                                <span style="background: rgba(203, 166, 247, 0.15); color: #cba6f7; border: 1px solid rgba(203, 166, 247, 0.3); font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                                    ${safeProvider}
                                </span>
                            </div>
                            <span style="font-family: monospace; font-size: 0.88rem; font-weight: 700; color: #ffffff; letter-spacing: 0.2px;">${safeName}</span>
                        </div>
                        ${headerRightHtml}
                    </div>

                    <!-- Kurzbeschreibung -->
                    <div style="background: rgba(255, 255, 255, 0.02); border-left: 3px solid var(--accent); padding: 6px 10px; border-radius: 4px;">
                        <div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--accent); letter-spacing: 0.5px; margin-bottom: 2px;">
                            📝 Kurzbeschreibung:
                        </div>
                        <div style="font-size: 0.78rem; color: #cdd6f4; line-height: 1.4;">${safeDesc}</div>
                    </div>

                    <!-- Ausführliche Anweisungen / Vorgaben (zugeklappt) -->
                    <div style="margin-top: 2px;">
                        <details class="tool-instructions-details" style="background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 6px; padding: 6px 10px; font-size: 0.76rem;">
                            <summary style="cursor: pointer; color: #a6e3a1; font-weight: 600; user-select: none; display: flex; align-items: center; justify-content: space-between; outline: none;">
                                <span style="display: flex; align-items: center; gap: 6px;">
                                    <span>📖</span>
                                    <span>Ausführliche Anweisungen & Richtlinien (Langer Text)</span>
                                </span>
                                <span style="font-size: 0.7rem; color: #6c7086; font-weight: normal;">${tool.detailedInstructions ? '▾ Aufklappen' : '(Keine gesonderten Vorgaben)'}</span>
                            </summary>
                            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255, 255, 255, 0.08); color: #bac2de; line-height: 1.5; white-space: pre-wrap; font-family: inherit;">
                                ${tool.detailedInstructions ? escapeToolHtml(tool.detailedInstructions) : '<span style="color: #6c7086; font-style: italic;">Für dieses Werkzeug sind keine separaten ausführlichen Richtlinien hinterlegt. Die Kurzbeschreibung oben enthält alle relevanten Hinweise.</span>'}
                            </div>
                        </details>
                    </div>

                    ${metaDetailsHtml}

                    <div style="margin-top: 4px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.04);">
                        <button type="button" onclick="toggleToolParams('${paramsId}')" style="background: transparent; border: none; color: var(--accent); font-size: 0.72rem; cursor: pointer; padding: 0; text-align: left; text-decoration: underline;">
                            📋 Parameter anzeigen ▾
                        </button>
                        <div id="${paramsId}" style="display: none; margin-top: 6px; padding: 8px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; font-size: 0.72rem; font-family: monospace; white-space: pre-wrap; color: #cdd6f4; max-height: 160px; overflow-y: auto;">${escapeToolHtml(paramsJson)}</div>
                    </div>
                `;

                listEl.appendChild(card);
            });
        };



        openSettings.onclick = () => {
            loadSettings();
            showSection('settings');
        };



        settingsBackBtn.onclick = () => {
            recordingHotkey = false;
            hotkeyBtn.classList.remove('recording');
            if (document.body.classList.contains('mobile-mode')) {
                const targetView = (lastActiveView === 'chat' || lastActiveView === 'history') ? lastActiveView : 'chat';
                showSection(targetView);
                switchMobileView(lastActiveView);
            } else {
                showSection('chat');
            }
        };



        settingsSave.onclick = async () => {

            function collectAgentSettingsFromUI() {
                const result = { ...currentAgentSettings };
                document.querySelectorAll('.agent-plugin-cb').forEach(cb => {
                    const agentKey = cb.dataset.agentKey;
                    const pluginName = cb.dataset.plugin;
                    if (!result[agentKey]) return;
                    if (!Array.isArray(result[agentKey].allowedPlugins)) {
                        result[agentKey].allowedPlugins = [];
                    }
                    // Wenn Wildcard zuvor gesetzt war, jetzt konkretisieren
                    if (result[agentKey].allowedPlugins.includes('*')) {
                        result[agentKey].allowedPlugins = availablePluginsForAgents.map(p => p.name);
                    }
                    if (cb.checked) {
                        if (!result[agentKey].allowedPlugins.includes(pluginName)) {
                            result[agentKey].allowedPlugins.push(pluginName);
                        }
                    } else {
                        result[agentKey].allowedPlugins = result[agentKey].allowedPlugins.filter(p => p !== pluginName && p !== '*');
                    }
                });
                return result;
            }

            recordingHotkey = false;
            hotkeyBtn.classList.remove('recording');
            

            syncWidgetSettings();

            const disabledPlugins = [];
            document.querySelectorAll('.plugin-checkbox').forEach(cb => {
                if (!cb.checked) {
                    disabledPlugins.push(cb.dataset.pluginName);
                }
            });

            const autostartCheckbox = document.getElementById('autostart-checkbox');
            const autostart = autostartCheckbox ? autostartCheckbox.checked : false;

            const modelSelect = document.getElementById('settings-ai-model');
            const aiModel = modelSelect ? modelSelect.value : 'gemini-3.8-flash';

            const googleSearchCb = document.getElementById('settings-google-search');
            const googleSearchGrounding = googleSearchCb ? googleSearchCb.checked : true;
            
            try {
                const res = await fetch(getApiUrl('/settings'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        hotkey: tempHotkey,
                        disabledPlugins: disabledPlugins,
                        autostart: autostart,
                        aiModel: aiModel,
                        googleSearchGrounding: googleSearchGrounding,
                        agentSettings: collectAgentSettingsFromUI()
                    })
                });
                
                if (res.ok) {
                    if (isElectron && ipcRenderer) {
                        ipcRenderer.send('reload-hotkey');
                    }
                    showSection('chat');
                    loadTopWidgets(); // Top-Widgets sofort neu laden
                    
                    addMessage("✅ Einstellungen erfolgreich gespeichert.", false);
                } else {
                    alert("Fehler beim Speichern der Einstellungen auf dem Server.");
                }
            } catch (err) {
                console.error("Speichern-Fehler:", err);
                alert("Einstellungen lokal gespeichert, aber der Server ist derzeit nicht erreichbar.");
                showSection('chat');
                loadTopWidgets();
            }
        };



        // Login Handler
        const loginSubmitBtn = document.getElementById('login-submit-btn');


        if (loginSubmitBtn) {
            loginSubmitBtn.onclick = async () => {
                const usernameInput = document.getElementById('login-username-input');
                const passwordInput = document.getElementById('login-password-input');
                
                const serverUrl = getServerUrl();
                const username = usernameInput ? usernameInput.value.trim() : '';
                const password = passwordInput ? passwordInput.value.trim() : '';

                if (!username || !password) {
                    alert("Bitte gib einen Benutzernamen und ein Passwort ein.");
                    return;
                }

                // Save credentials and server URL to localStorage
                localStorage.setItem('api_username', username);
                localStorage.setItem('api_password', password);
                localStorage.setItem('api_server_url', serverUrl);

                try {
                    loginSubmitBtn.textContent = "Verbinde...";
                    loginSubmitBtn.disabled = true;

                    // Test connection to the plugins api
                    const res = await window.fetch(getApiUrl('/api/plugins/entities'), {
                        headers: { 'Authorization': 'Basic ' + safeBtoa(username + ':' + password) }
                    });

                    if (res.ok) {
                        loginSubmitBtn.textContent = "Anmelden";
                        loginSubmitBtn.disabled = false;
                        
                        // complete app initialization
                        await loadEntityConfigs();
                        await loadTopWidgets();
                        
                        // Sync credentials to Android widget
                        syncWidgetSettings();
                        
                        // Show chat view
                        showSection('chat');
                    } else {
                        throw new Error("HTTP Fehler " + res.status);
                    }
                } catch (err) {
                    console.error("Login-Verbindungsfehler:", err);
                    alert("Verbindung fehlgeschlagen! Bitte überprüfe deinen Benutzernamen und dein Passwort.");
                    
                    // Clear failed credentials
                    localStorage.removeItem('api_username');
                    localStorage.removeItem('api_password');
                    
                    loginSubmitBtn.textContent = "Anmelden";
                    loginSubmitBtn.disabled = false;
                }
            };
        }



        // Logout Handler
        const logoutBtn = document.getElementById('logout-btn');


        if (logoutBtn) {
            logoutBtn.onclick = () => {
                if (confirm("Möchtest du dich wirklich abmelden?")) {
                    localStorage.removeItem('api_username');
                    localStorage.removeItem('api_password');
                    
                    const userIn = document.getElementById('login-username-input');
                    if (userIn) userIn.value = '';
                    const passIn = document.getElementById('login-password-input');
                    if (passIn) passIn.value = '';

                    // Sync cleared settings to widget
                    syncWidgetSettings();
                    
                    // Show full screen login screen
                    showSection('login');
                }
            };
        }



        hotkeyBtn.onclick = () => {
            recordingHotkey = true;
            hotkeyBtn.classList.add('recording');
            hotkeyBtn.textContent = 'Bitte Tasten drücken...';
        };



        document.addEventListener('keydown', async (e) => {
            if (!recordingHotkey) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            let parts = [];
            if (e.ctrlKey) parts.push('Ctrl');
            if (e.altKey) parts.push('Alt');
            if (e.shiftKey) parts.push('Shift');
            if (e.metaKey) parts.push('Cmd');
            
            const key = e.key;
            if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta' && key !== 'CapsLock') {
                let keyName = key;
                if (keyName === ' ') keyName = 'Space';
                else if (keyName.length === 1) keyName = keyName.toUpperCase();
                parts.push(keyName);
            }
            
            if (parts.length > 0) {
                const hotkeyStr = parts.join('+');
                tempHotkey = hotkeyStr;
                hotkeyBtn.textContent = hotkeyStr;
                
                if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
                    recordingHotkey = false;
                    hotkeyBtn.classList.remove('recording');
                    
                    // Testen über IPC
                    if (isElectron && ipcRenderer) {
                        const testResult = await ipcRenderer.invoke('register-hotkey-test', hotkeyStr);
                        if (!testResult.success) {
                            alert("Hotkey Fehler: " + testResult.error);
                            tempHotkey = currentHotkey;
                            hotkeyBtn.textContent = currentHotkey;
                        }
                    } else {
                        tempHotkey = hotkeyStr;
                        hotkeyBtn.textContent = hotkeyStr;
                    }
                }
            }
        });



        let currentConversationId = null;
        window.currentConversationId = null;


        let pendingAppPath = null;



        // Modal Logik
        modalCancel.onclick = () => {
            namingModal.classList.remove('active');
            pendingAppPath = null;
        };



        modalSave.onclick = async () => {
            const name = appNameInput.value.trim();
            if (name && pendingAppPath) {
                await registerApp(name, pendingAppPath);
                namingModal.classList.remove('active');
                appNameInput.value = '';
                pendingAppPath = null;
            }
        };



        // Schließen Button
        closePanel.onclick = () => {
            if (isElectron && ipcRenderer) {
                ipcRenderer.send('hide-window');
            } else {
                document.body.classList.remove('active');
            }
        };



        window.closeNoteModal = function() {
            noteModal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };



        window.saveNote = async function() {
            const id = noteIdInput.value;
            const projectId = noteProjectIdInput.value;
            const title = noteTitleInput.value.trim();
            const content = noteContentInput.value.trim();
            if (!title || !content) {
                alert("Titel und Inhalt sind erforderlich.");
                return;
            }
            const args = {
                titel: title,
                inhalt: content,
                projectId: projectId ? parseInt(projectId) : null
            };
            if (id) {
                args.id = parseInt(id);
                await callTool('bearbeite_notiz', args);
            } else {
                await callTool('erstelle_notiz', args);
            }
            closeNoteModal();
        };



        window.deleteNote = async function(id) {
            if (confirm("Möchtest du diese Notiz wirklich löschen?")) {
                await callTool('loesche_notiz', { id: parseInt(id) });
            }
        };



        window.deleteCalendarEvent = async function(eventId, datum, isRecurring) {
            try {
                if (!eventId) {
                    alert("Keine Termin-ID übergeben.");
                    return;
                }
                const targetDate = datum || window.currentCalendarDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);
                const isRec = isRecurring === true || isRecurring === 'true' || String(eventId).startsWith('rec-');
                let nurDiesesVorkommen = false;

                if (isRec) {
                    const cancelOccurrence = confirm(
                        "Dies ist ein Serientermin.\n\nKlicke 'OK' um NUR DIESES EINE Vorkommen zu löschen.\nKlicke 'Abbrechen', um die GESAMTE SERIE zu löschen (oder ESC zum Abbrechen)."
                    );
                    nurDiesesVorkommen = cancelOccurrence;
                } else {
                    if (!confirm("Möchtest du diesen Termin wirklich löschen?")) return;
                }

                const res = await callTool('loesche_termin', { eventId: String(eventId), datum: targetDate, nurDiesesVorkommen });
                if (res && res.status === 'error') {
                    alert("Fehler beim Löschen des Termins: " + (res.message || 'Unbekannter Fehler'));
                    return;
                }

                if (window.calendarTimelineCache) {
                    delete window.calendarTimelineCache[targetDate];
                    if (window.currentCalendarDate) delete window.calendarTimelineCache[window.currentCalendarDate];
                }
                if (typeof jumpToTimelineDate === 'function') {
                    await jumpToTimelineDate(window.currentCalendarDate || targetDate);
                }
                if (typeof loadTopWidgets === 'function') {
                    loadTopWidgets();
                }
            } catch (err) {
                console.error("Fehler beim Löschen des Termins:", err);
                alert("Fehler beim Löschen des Termins: " + (err.message || err));
            }
        };



        const taskModal = document.getElementById('task-modal');


        const taskTitleInput = document.getElementById('task-title-input');


        const taskNotesInput = document.getElementById('task-notes-input');


        const taskDueInput = document.getElementById('task-due-input');



        window.openTaskModal = function(taskId = null, title = '', notes = '', due = '', listTitle = '', recurrence = 'none', projectId = null, isPlanned = false, status = 'in_progress', isStarred = false, locationId = null, personIds = [], mediaIds = []) {
            const taskIdInput = document.getElementById('task-id-input');
            const modalTitle = document.querySelector('#task-modal h3');
            const saveBtn = document.querySelector('#task-modal .save');
            const recurrenceInput = document.getElementById('task-recurrence-input');
            const plannedInput = document.getElementById('task-is-planned-input');
            const statusInput = document.getElementById('task-status-input');
            const starredInput = document.getElementById('task-is-starred-input');

            if (plannedInput) plannedInput.checked = !!isPlanned;
            if (starredInput) starredInput.checked = !!isStarred;

            const statusGroup = statusInput ? statusInput.closest('.settings-group') : null;
            if (statusInput) {
                const projects = (window.lastProjectsData && window.lastProjectsData.projects) || [];
                const currentProj = projectId ? projects.find(p => String(p.id) === String(projectId)) : null;
                let projCats = null;
                if (currentProj) {
                    if (typeof window.getProjectStateConfig === 'function') {
                        projCats = window.getProjectStateConfig(currentProj);
                    } else if (currentProj.categories) {
                        try {
                            projCats = typeof currentProj.categories === 'string' ? JSON.parse(currentProj.categories) : currentProj.categories;
                        } catch(e) {}
                    }
                }

                if (projCats && Array.isArray(projCats.items) && projCats.items.length > 0) {
                    if (statusGroup) statusGroup.style.display = 'block';
                    const statusStr = String(status || projCats.defaultId || projCats.items[0].id);
                    statusInput.innerHTML = projCats.items.map(c => `
                        <option value="${c.id}" ${String(c.id) === statusStr ? 'selected' : ''}>${c.icon || '📌'} ${escapeHtml(c.name)}</option>
                    `).join('');
                    statusInput.value = statusStr;
                } else if (projectId) {
                    if (statusGroup) statusGroup.style.display = 'none';
                    statusInput.value = 'in_progress';
                } else {
                    if (statusGroup) statusGroup.style.display = 'block';
                    statusInput.innerHTML = `
                        <option value="suggestion" ${status === 'suggestion' ? 'selected' : ''}>💡 Vorschlag (Idee / In Planung)</option>
                        <option value="in_progress" ${status === 'in_progress' ? 'selected' : ''}>⏳ In Arbeit</option>
                        <option value="done" ${status === 'done' ? 'selected' : ''}>✅ Fertig</option>
                    `;
                    statusInput.value = status || (isPlanned ? 'suggestion' : 'in_progress');
                }
            }
            
            if (taskIdInput) taskIdInput.value = taskId || '';
            const taskProjectIdInput = document.getElementById('task-project-id-input');
            if (taskProjectIdInput) taskProjectIdInput.value = projectId || '';
            taskTitleInput.value = title || '';
            taskNotesInput.value = notes || '';
            if (recurrenceInput) recurrenceInput.value = recurrence || 'none';
            
            const dueGroup = document.getElementById('task-due-group');
            const recGroup = document.getElementById('task-recurrence-group');
            if (projectId) {
                if (dueGroup) dueGroup.style.display = 'none';
                if (recGroup) recGroup.style.display = 'none';
                taskDueInput.value = '';
            } else {
                if (dueGroup) dueGroup.style.display = 'block';
                if (recGroup) recGroup.style.display = 'block';
                if (due) {
                    const dateObj = new Date(due);
                    if (!isNaN(dateObj.getTime())) {
                        taskDueInput.value = dateObj.toISOString().split('T')[0];
                    } else {
                        taskDueInput.value = '';
                    }
                } else {
                    taskDueInput.value = '';
                }
            }
            
            if (taskId) {
                if (modalTitle) modalTitle.textContent = "Aufgabe bearbeiten";
                if (saveBtn) saveBtn.textContent = "Speichern";
            } else {
                if (modalTitle) modalTitle.textContent = "Aufgabe erstellen";
                if (saveBtn) saveBtn.textContent = "Erstellen";
            }
            
            // Populate Entity Pickers (Locations, Persons, Media)
            loadEntityPickerData().then(() => {
                populateLocationSelect('task-location-select', cachedPickerLocations, locationId);
                renderPickerChips('task-persons-container', cachedPickerPeople, personIds, 'person');
                renderPickerChips('task-media-container', cachedPickerMedia, mediaIds, 'media');
            });

            taskModal.style.display = 'block';
            document.body.classList.add('modal-active');
        };



        window.closeTaskModal = function() {
            taskModal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };



        window.saveTask = async function() {
            const taskIdInput = document.getElementById('task-id-input');
            const taskId = taskIdInput ? taskIdInput.value : '';
            const taskProjectIdInput = document.getElementById('task-project-id-input');
            const projectId = taskProjectIdInput ? taskProjectIdInput.value : '';
            const title = taskTitleInput.value.trim();
            const notes = taskNotesInput.value.trim();
            const due = taskDueInput.value;
            const recurrenceInput = document.getElementById('task-recurrence-input');
            const recurrence = recurrenceInput ? recurrenceInput.value : 'none';
            const isPlanned = document.getElementById('task-is-planned-input')?.checked || false;
            const status = document.getElementById('task-status-input')?.value || (isPlanned ? 'suggestion' : 'in_progress');
            const isStarred = document.getElementById('task-is-starred-input')?.checked || false;

            if (!title) {
                alert("Titel ist erforderlich.");
                return;
            }
            
            const taskLocSelect = document.getElementById('task-location-select');
            const selectedLocId = taskLocSelect && taskLocSelect.value ? Number(taskLocSelect.value) : null;
            const selectedPersonIds = getSelectedChipIds('task-persons-container');
            const selectedMediaIds = getSelectedChipIds('task-media-container');

            const isNumericState = projectId && /^\d+$/.test(String(status));
            const stateIdNum = isNumericState ? Number(status) : undefined;

            if (taskId) {
                const args = {
                    taskId: taskId,
                    titel: title,
                    notizen: notes,
                    datum: due ? due : "null",
                    recurrence: recurrence,
                    projectId: projectId ? parseInt(projectId) : null,
                    zustandId: stateIdNum,
                    inPlanung: isPlanned || status === 'suggestion',
                    status: status,
                    isStarred: isStarred,
                    locationId: selectedLocId || undefined,
                    personIds: selectedPersonIds,
                    mediaIds: selectedMediaIds
                };
                await callTool('aktualisiere_aufgabe', args);
            } else {
                const args = {
                    titel: title,
                    projectId: projectId ? parseInt(projectId) : null,
                    zustandId: stateIdNum,
                    inPlanung: isPlanned || status === 'suggestion',
                    status: status,
                    isStarred: isStarred,
                    locationId: selectedLocId || undefined,
                    personIds: selectedPersonIds,
                    mediaIds: selectedMediaIds
                };
                if (notes) args.notizen = notes;
                if (due) args.datum = due;
                if (recurrence && recurrence !== 'none') args.recurrence = recurrence;
                await callTool('erstelle_aufgabe', args);
            }
            closeTaskModal();
        };



        window.deleteTask = async function(taskId) {
            if (confirm("Möchtest du diese Aufgabe wirklich löschen?")) {
                await callTool('loesche_aufgabe', { taskId: String(taskId) });
            }
        };



        window.editTask = function(taskId, title, notes, due, listTitle, recurrence = 'none', projectId = null, isPlanned = false, status = 'in_progress', isStarred = false, locationId = null, personIds = [], mediaIds = []) {
            openTaskModal(taskId, title, notes, due, listTitle, recurrence, projectId, isPlanned, status, isStarred, locationId, personIds, mediaIds);
        };



        // --- PROJECTS JS LOGIC ---
        const projectModal = document.getElementById('project-modal');


        const projectIdInput = document.getElementById('project-id-input');


        const projectNameInput = document.getElementById('project-name-input');


        const projectModalTitle = document.getElementById('project-modal-title');



        window.openProjectModal = function(id = null, name = '', isStarred = false) {
            projectIdInput.value = id || '';
            projectNameInput.value = name;
            const starredInput = document.getElementById('project-is-starred-input');
            if (starredInput) starredInput.checked = !!isStarred;
            projectModalTitle.textContent = id ? 'Projekt bearbeiten' : 'Projekt erstellen';
            projectModal.style.display = 'block';
            document.body.classList.add('modal-active');
        };



        window.closeProjectModal = function() {
            projectModal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };



        window.saveProject = async function() {
            const id = projectIdInput.value;
            const name = projectNameInput.value.trim();
            const isStarred = document.getElementById('project-is-starred-input')?.checked || false;
            if (!name) {
                alert("Projektname ist erforderlich.");
                return;
            }
            if (id) {
                await callTool('bearbeite_projekt', { id: parseInt(id), name: name, isStarred: isStarred });
            } else {
                await callTool('erstelle_projekt', { name: name, isStarred: isStarred });
            }
            closeProjectModal();
        };



        window.deleteProject = async function(id) {
            if (confirm("Möchtest du dieses Projekt wirklich löschen? Alle zugeordneten Aufgaben und Notizen werden ebenfalls gelöscht.")) {
                await callTool('loesche_projekt', { id: parseInt(id) });
            }
        };



        window.toggleProjectCollapse = function(id) {
            const body = document.getElementById('project-body-' + id);
            const arrow = document.getElementById('project-arrow-' + id);
            if (!body || !arrow) return;
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'flex' : 'none';
            arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
            
            // Save state to localStorage
            let states = JSON.parse(localStorage.getItem('project_collapsed_states') || '{}');
            states[id] = isHidden ? false : true; // false = expanded, true = collapsed
            localStorage.setItem('project_collapsed_states', JSON.stringify(states));
        };



        async function completeTask(checkbox) {
            const taskId = checkbox.getAttribute('data-task-id');
            const tasklistId = checkbox.getAttribute('data-tasklist-id');
            if (!taskId || !tasklistId) return;

            const isCompleted = checkbox.checked;
            checkbox.disabled = true;
            const textSpan = checkbox.nextElementSibling;
            if (textSpan) {
                if (isCompleted) {
                    textSpan.style.textDecoration = 'line-through';
                    textSpan.style.opacity = '0.5';
                } else {
                    textSpan.style.textDecoration = 'none';
                    textSpan.style.opacity = '1';
                }
            }

            try {
                const res = await fetch(getApiUrl('/tasks/complete'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tasklistId, taskId, completed: isCompleted })
                });
                
                if (res.ok) {
                    console.log("Aufgabe erfolgreich aktualisiert!");
                    setTimeout(() => {
                        loadTopWidgets();
                        if (isElectron && ipcRenderer) {
                            ipcRenderer.send('widgets-updated');
                        }
                    }, 400);
                } else {
                    throw new Error("Fehler beim Aktualisieren");
                }
            } catch (e) {
                console.error(e);
                checkbox.disabled = false;
                checkbox.checked = !isCompleted;
                if (textSpan) {
                    if (!isCompleted) {
                        textSpan.style.textDecoration = 'line-through';
                        textSpan.style.opacity = '0.5';
                    } else {
                        textSpan.style.textDecoration = 'none';
                        textSpan.style.opacity = '1';
                    }
                }
                alert("Aufgabe konnte nicht aktualisiert werden.");
            }
        }



        window.completeTask = completeTask;



        async function toggleTaskCompletion(taskId, tasklistId, newCompletedState, triggerEl) {
            if (!taskId) return;
            const listId = tasklistId || 'Standard';

            if (triggerEl) {
                triggerEl.style.pointerEvents = 'none';
                triggerEl.setAttribute('onclick', `event.stopPropagation(); toggleTaskCompletion('${taskId}', '${listId}', ${!newCompletedState}, this)`);
                if (newCompletedState) {
                    triggerEl.classList.add('is-done');
                    triggerEl.setAttribute('title', 'Als unerledigt markieren');
                    triggerEl.setAttribute('aria-label', 'Als unerledigt markieren');
                    triggerEl.innerHTML = googleIcon('check', '12px', 'fill: #11111b;');
                    const stepEl = triggerEl.closest('.timeline-step');
                    if (stepEl) {
                        stepEl.classList.add('is-past');
                        const itemEl = stepEl.querySelector('.arbeitstisch-item');
                        if (itemEl) itemEl.classList.add('is-completed-item');
                        const titleEl = stepEl.querySelector('.arbeitstisch-item span');
                        if (titleEl) {
                            titleEl.style.textDecoration = 'line-through';
                            titleEl.style.opacity = '0.55';
                        }
                    }
                    const generalItem = triggerEl.closest('.arbeitstisch-item, .task-item, .project-task-item');
                    if (generalItem) {
                        const titleEl = generalItem.querySelector('strong, span');
                        if (titleEl) {
                            titleEl.style.textDecoration = 'line-through';
                            titleEl.style.opacity = '0.55';
                        }
                    }
                } else {
                    triggerEl.classList.remove('is-done');
                    triggerEl.setAttribute('title', 'Aufgabe abhaken');
                    triggerEl.setAttribute('aria-label', 'Aufgabe abhaken');
                    triggerEl.innerHTML = '';
                    const stepEl = triggerEl.closest('.timeline-step');
                    if (stepEl) {
                        stepEl.classList.remove('is-past');
                        const itemEl = stepEl.querySelector('.arbeitstisch-item');
                        if (itemEl) itemEl.classList.remove('is-completed-item');
                        const titleEl = stepEl.querySelector('.arbeitstisch-item span');
                        if (titleEl) {
                            titleEl.style.textDecoration = 'none';
                            titleEl.style.opacity = '1';
                        }
                    }
                    const generalItem = triggerEl.closest('.arbeitstisch-item, .task-item, .project-task-item');
                    if (generalItem) {
                        const titleEl = generalItem.querySelector('strong, span');
                        if (titleEl) {
                            titleEl.style.textDecoration = 'none';
                            titleEl.style.opacity = '1';
                        }
                    }
                }
            }

            try {
                const res = await fetch(getApiUrl('/tasks/complete'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tasklistId: listId, taskId: String(taskId), completed: !!newCompletedState })
                });
                if (res.ok) {
                    setTimeout(() => {
                        loadTopWidgets();
                        if (isElectron && ipcRenderer) {
                            ipcRenderer.send('widgets-updated');
                        }
                    }, 350);
                } else {
                    throw new Error("Fehler beim Aktualisieren");
                }
            } catch (e) {
                console.error("Fehler beim Abhaken der Aufgabe:", e);
                if (triggerEl) triggerEl.style.pointerEvents = 'auto';
                loadTopWidgets();
            }
        }


        window.toggleTaskCompletion = toggleTaskCompletion;



        function updateInputRowButtons() {
            const text = userInput.value.trim();
            const hasContent = text.length > 0 || (typeof attachedFiles !== 'undefined' && attachedFiles.length > 0);
            if (hasContent) {
                micBtn.style.display = 'none';
                sendBtn.style.display = 'flex';
            } else {
                micBtn.style.display = 'flex';
                sendBtn.style.display = 'none';
            }
        }



        function autoResizeInput() {
            userInput.style.height = 'auto';
            if (!userInput.value) {
                userInput.style.height = '40px';
                userInput.style.overflowY = 'hidden';
                updateInputRowButtons();
                return;
            }
            const scrollHeight = userInput.scrollHeight;
            if (scrollHeight > 150) {
                userInput.style.height = '150px';
                userInput.style.overflowY = 'auto';
            } else {
                userInput.style.height = Math.max(40, scrollHeight) + 'px';
                userInput.style.overflowY = 'hidden';
            }
            updateInputRowButtons();
        }



        // sendBtn.onclick in chat.js



        window.restoreTaskFromTrash = async function(taskId) {
            try {
                await callTool('wiederherstellen_aufgabe', { taskId: String(taskId) });
                openTaskTrashModal();
                loadTopWidgets();
            } catch (e) {
                console.error("Fehler beim Wiederherstellen der Aufgabe:", e);
            }
        };



        // Popstate / Back button listener for Mail Read Modal & views
        window.addEventListener('popstate', function(e) {
            if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                closeMailReadModal(true);
            }
        });

        // Diary Modal Management
        window.openDiaryModal = function(dateStr = '', title = '', content = '', id = null) {
            const modal = document.getElementById('diary-modal');
            if (!modal) return;
            const dateInput = document.getElementById('diary-date-input');
            const idInput = document.getElementById('diary-id-input');
            const titleInput = document.getElementById('diary-title-input');
            const contentInput = document.getElementById('diary-content-input');
            const modalTitle = document.getElementById('diary-modal-title');
            const deleteBtn = document.getElementById('diary-delete-btn');

            const targetDate = dateStr || window.currentCalendarDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);
            if (dateInput) dateInput.value = targetDate;
            if (idInput) idInput.value = id || '';
            if (titleInput) titleInput.value = title || '';
            if (contentInput) {
                contentInput.value = content || '';
                setTimeout(() => contentInput.focus(), 60);
            }
            if (modalTitle) {
                modalTitle.textContent = id ? '📝 Tagebucheintrag bearbeiten' : '📝 Tagebucheintrag';
            }
            if (deleteBtn) {
                deleteBtn.style.display = id ? 'inline-block' : 'none';
            }
            modal.style.display = 'block';
            document.body.classList.add('modal-active');
        };

        window.openDiaryModalById = async function(id, dateStr) {
            const targetDate = dateStr || window.currentCalendarDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);
            let entry = null;
            if (window.calendarTimelineCache && window.calendarTimelineCache[targetDate] && Array.isArray(window.calendarTimelineCache[targetDate].diaryEntries)) {
                entry = window.calendarTimelineCache[targetDate].diaryEntries.find(d => Number(d.id) === Number(id));
            }
            if (!entry) {
                try {
                    const res = await fetch(getApiUrl(`/api/journal/day-summary?date=${targetDate}`));
                    if (res.ok) {
                        const data = await res.json();
                        if (data && Array.isArray(data.diaryEntries)) {
                            entry = data.diaryEntries.find(d => Number(d.id) === Number(id));
                        }
                    }
                } catch (e) {
                    console.error('Fehler beim Laden des Tagebucheintrags:', e);
                }
            }
            if (entry) {
                openDiaryModal(targetDate, entry.title, entry.content, entry.id);
            } else {
                openDiaryModal(targetDate, '', '', id);
            }
        };

        window.closeDiaryModal = function() {
            const modal = document.getElementById('diary-modal');
            if (modal) modal.style.display = 'none';
            const idInput = document.getElementById('diary-id-input');
            if (idInput) idInput.value = '';
            document.body.classList.remove('modal-active');
        };

        window.saveDiaryEntry = async function() {
            const dateInput = document.getElementById('diary-date-input');
            const idInput = document.getElementById('diary-id-input');
            const titleInput = document.getElementById('diary-title-input');
            const contentInput = document.getElementById('diary-content-input');
            const date = dateInput ? dateInput.value : (window.currentCalendarDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]));
            const id = idInput && idInput.value ? Number(idInput.value) : null;
            const title = titleInput ? titleInput.value.trim() : '';
            const content = contentInput ? contentInput.value.trim() : '';
            if (!content) {
                alert('Bitte gib einen Text für den Tagebucheintrag ein.');
                return;
            }
            try {
                const url = id ? getApiUrl(`/api/journal/entries/${id}`) : getApiUrl('/api/journal/entries');
                const method = id ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date, title, content })
                });
                if (res.ok) {
                    closeDiaryModal();
                    if (window.calendarTimelineCache && window.calendarTimelineCache[date]) {
                        delete window.calendarTimelineCache[date];
                    }
                    if (typeof jumpToTimelineDate === 'function') {
                        await jumpToTimelineDate(date);
                    }
                    if (typeof loadTopWidgets === 'function') {
                        loadTopWidgets();
                    }
                } else {
                    const errData = await res.json().catch(() => ({}));
                    alert('Fehler beim Speichern: ' + (errData.error || res.statusText));
                }
            } catch (e) {
                console.error('Fehler beim Speichern des Tagebucheintrags:', e);
                alert('Verbindungsfehler beim Speichern des Tagebucheintrags.');
            }
        };

        window.deleteCurrentDiaryEntry = async function() {
            const idInput = document.getElementById('diary-id-input');
            const dateInput = document.getElementById('diary-date-input');
            const id = idInput && idInput.value ? Number(idInput.value) : null;
            const date = dateInput ? dateInput.value : (window.currentCalendarDate || '');
            if (!id) return;
            if (!confirm('Möchtest du diesen Tagebucheintrag wirklich löschen?')) return;
            try {
                const res = await fetch(getApiUrl(`/api/journal/entries/${id}`), { method: 'DELETE' });
                if (res.ok) {
                    closeDiaryModal();
                    if (window.calendarTimelineCache && window.calendarTimelineCache[date]) {
                        delete window.calendarTimelineCache[date];
                    }
                    if (typeof jumpToTimelineDate === 'function') {
                        await jumpToTimelineDate(date);
                    }
                    if (typeof loadTopWidgets === 'function') {
                        loadTopWidgets();
                    }
                } else {
                    alert('Fehler beim Löschen des Eintrags.');
                }
            } catch (e) {
                console.error('Fehler beim Löschen des Tagebucheintrags:', e);
            }
        };

        window.closeDiaryPickerModal = function() {
            const modal = document.getElementById('diary-picker-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
        };

        window.openDiaryPickerModal = function(entries, targetDate) {
            const modal = document.getElementById('diary-picker-modal');
            const listEl = document.getElementById('diary-picker-list');
            if (!modal || !listEl) return;
            listEl.innerHTML = '';
            entries.forEach(e => {
                const timeStr = e.createdAt ? new Date(e.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
                const title = e.title || 'Tagebucheintrag';
                const snippet = (e.content || '').substring(0, 100);
                const item = document.createElement('div');
                item.style.cssText = 'padding: 10px 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(250, 179, 135, 0.2); border-radius: 8px; cursor: pointer; transition: background 0.15s;';
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong style="color: #fab387; font-size: 0.85rem;">${escapeHtml(title)}</strong>
                        <span style="font-size: 0.7rem; opacity: 0.5;">${timeStr ? timeStr + ' Uhr' : ''}</span>
                    </div>
                    <div style="font-size: 0.78rem; opacity: 0.8; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(snippet)}</div>
                `;
                item.onmouseenter = () => item.style.background = 'rgba(250, 179, 135, 0.12)';
                item.onmouseleave = () => item.style.background = 'rgba(255,255,255,0.04)';
                item.onclick = () => {
                    closeDiaryPickerModal();
                    openDiaryModal(targetDate, e.title, e.content, e.id);
                };
                listEl.appendChild(item);
            });
            modal.style.display = 'block';
            document.body.classList.add('modal-active');
        };

        window.handleDiaryButtonLongPress = async function() {
            const targetDate = window.currentCalendarDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);
            
            let entries = [];
            if (window.calendarTimelineCache && window.calendarTimelineCache[targetDate] && Array.isArray(window.calendarTimelineCache[targetDate].diaryEntries)) {
                entries = window.calendarTimelineCache[targetDate].diaryEntries;
            }

            if (entries.length === 0) {
                try {
                    const res = await fetch(getApiUrl(`/api/journal/day-summary?date=${targetDate}`));
                    if (res.ok) {
                        const data = await res.json();
                        if (data && Array.isArray(data.diaryEntries)) {
                            entries = data.diaryEntries;
                        }
                    }
                } catch (err) {
                    console.error('Fehler beim Laden der Tagebucheinträge:', err);
                }
            }

            if (entries.length === 0) {
                alert('Für diesen Tag (' + targetDate + ') ist noch kein Tagebucheintrag vorhanden. Es wird das Formular für einen neuen Eintrag geöffnet.');
                openDiaryModal(targetDate);
                return;
            }

            if (entries.length === 1) {
                const e = entries[0];
                openDiaryModal(targetDate, e.title, e.content, e.id);
                return;
            }

            openDiaryPickerModal(entries, targetDate);
        };

        function initHeaderDiaryButtonLongPress() {
            const btn = document.getElementById('header-calendar-diary-btn');
            if (!btn) return;
            if (btn._hasDiaryLongPressInitialized) return;
            btn._hasDiaryLongPressInitialized = true;

            let pressTimer = null;
            let isLongPress = false;

            const startPress = (e) => {
                isLongPress = false;
                if (pressTimer) clearTimeout(pressTimer);
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (navigator.vibrate) {
                        try { navigator.vibrate(40); } catch (_) {}
                    }
                    window.handleDiaryButtonLongPress();
                }, 450);
            };

            const cancelPress = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            };

            btn.addEventListener('mousedown', startPress);
            btn.addEventListener('mouseup', cancelPress);
            btn.addEventListener('mouseleave', cancelPress);
            btn.addEventListener('touchstart', startPress, { passive: true });
            btn.addEventListener('touchend', cancelPress);
            btn.addEventListener('touchcancel', cancelPress);

            btn.addEventListener('click', (e) => {
                if (isLongPress) {
                    e.preventDefault();
                    e.stopPropagation();
                    isLongPress = false;
                    return;
                }
                openDiaryModal(window.currentCalendarDate);
            });
        }

        window.initHeaderDiaryButtonLongPress = initHeaderDiaryButtonLongPress;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initHeaderDiaryButtonLongPress);
        } else {
            initHeaderDiaryButtonLongPress();
        }