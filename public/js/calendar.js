
        // =========================================================================
        // Day-by-Day Vertical Timeline Calendar & Diary (Main Calendar System)
        // =========================================================================

        window.currentCalendarDate = typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0];
        window.calendarTimelineCache = window.calendarTimelineCache || {};

        function getBedtimeRecommendation(tomorrowEvents) {
            if (!tomorrowEvents || tomorrowEvents.length === 0) {
                return {
                    hasEvent: false,
                    earliestEvent: null,
                    bedtimeStr: '23:00 - 00:00 Uhr',
                    wakeUpStr: '07:00 - 08:00 Uhr',
                    adviceText: 'Keine Termine für morgen eingetragen',
                    timeStr: null,
                    title: null
                };
            }
            const validEvents = tomorrowEvents.filter(e => !e.isCancelled);
            if (validEvents.length === 0) {
                return {
                    hasEvent: false,
                    earliestEvent: null,
                    bedtimeStr: '23:00 - 00:00 Uhr',
                    wakeUpStr: '07:00 - 08:00 Uhr',
                    adviceText: 'Keine aktiven Termine für morgen eingetragen',
                    timeStr: null,
                    title: null
                };
            }

            const sorted = [...validEvents].sort((a, b) => {
                const ta = new Date(a.time || a.start || 0).getTime();
                const tb = new Date(b.time || b.start || 0).getTime();
                return ta - tb;
            });

            const first = sorted[0];
            if (first.isAllDay) {
                return {
                    hasEvent: true,
                    earliestEvent: first,
                    timeStr: 'Ganztägig',
                    bedtimeStr: '23:00 Uhr',
                    wakeUpStr: '07:00 Uhr',
                    title: first.title
                };
            }

            const startDate = new Date(first.time || first.start);
            const startH = startDate.getHours();
            const startM = startDate.getMinutes();
            const timeStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')} Uhr`;

            const totalMinutesTomorrow = startH * 60 + startM;
            const wakeMinutes = totalMinutesTomorrow - 60;
            const bedMinutes = totalMinutesTomorrow - (9 * 60);

            const wakeH = Math.floor((wakeMinutes + 1440) % 1440 / 60);
            const wakeM = Math.floor((wakeMinutes + 1440) % 1440 % 60);
            const wakeUpStr = `${String(wakeH).padStart(2, '0')}:${String(wakeM).padStart(2, '0')} Uhr`;

            const bedStartH = Math.floor((bedMinutes + 1440) % 1440 / 60);
            const bedStartM = Math.floor((bedMinutes + 1440) % 1440 % 60);
            const bedEndH = Math.floor((bedMinutes + 60 + 1440) % 1440 / 60);
            const bedEndM = Math.floor((bedMinutes + 60 + 1440) % 1440 % 60);
            const bedtimeStr = `${String(bedStartH).padStart(2, '0')}:${String(bedStartM).padStart(2, '0')} - ${String(bedEndH).padStart(2, '0')}:${String(bedEndM).padStart(2, '0')} Uhr`;

            return {
                hasEvent: true,
                earliestEvent: first,
                timeStr,
                bedtimeStr,
                wakeUpStr,
                title: first.title,
                adviceText: `Frühester Termin morgen: ${first.title || 'Termin'} um ${timeStr}`
            };
        }
        window.getBedtimeRecommendation = getBedtimeRecommendation;

        function navigateCalendarDay(delta) {
            const cur = window.currentCalendarDate || getLocalDateString();
            const parts = cur.split('-').map(Number);
            const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
            d.setDate(d.getDate() + delta);
            const newDateStr = getLocalDateString(d);
            jumpToTimelineDate(newDateStr);
        }
        window.navigateCalendarDay = navigateCalendarDay;

        async function jumpToTimelineDate(dateStr) {
            if (!dateStr || dateStr === 'today') {
                dateStr = getLocalDateString();
            }

            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }

            window.currentCalendarDate = dateStr;

            const headerDateInput = document.getElementById('header-calendar-date');
            if (headerDateInput) headerDateInput.value = dateStr;
            const inPageDateInput = document.getElementById('calendar-active-date-picker');
            if (inPageDateInput) inPageDateInput.value = dateStr;

            if (document.body.classList.contains('mobile-mode') && !document.body.classList.contains('view-calendar')) {
                if (typeof switchMobileView === 'function') {
                    switchMobileView('calendar');
                }
            }

            const widgetCalendar = document.getElementById('widget-calendar');
            if (!widgetCalendar) return;

            // Check if day data is already cached
            if (window.calendarTimelineCache && window.calendarTimelineCache[dateStr]) {
                renderVerticalDayTimeline(dateStr, window.calendarTimelineCache[dateStr], widgetCalendar);
                return;
            }

            // Otherwise fetch day data from API
            try {
                widgetCalendar.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: var(--accent); font-size: 0.85rem;">
                        <span style="display: inline-block; animation: spin 1s infinite linear;">⏳</span> Lade Kalender für ${dateStr}...
                    </div>
                `;
                const res = await fetch(getApiUrl(`/api/calendar/timeline?start=${dateStr}&end=${dateStr}`));
                if (res.ok) {
                    const data = await res.json();
                    const dayItem = (data.days && data.days.length > 0) ? data.days[0] : {
                        date: dateStr,
                        events: [],
                        diaryEntries: [],
                        completedTasks: []
                    };
                    window.calendarTimelineCache = window.calendarTimelineCache || {};
                    window.calendarTimelineCache[dateStr] = dayItem;
                    renderVerticalDayTimeline(dateStr, dayItem, widgetCalendar);
                }
            } catch (e) {
                console.error("Fehler beim Laden des Ziel-Datums:", e);
                widgetCalendar.innerHTML = `
                    <div style="padding: 15px; color: var(--off); font-size: 0.8rem; text-align: center;">
                        Fehler beim Laden des Datums. Bitte versuche es erneut.
                    </div>
                `;
            }
        }
        window.jumpToTimelineDate = jumpToTimelineDate;

        async function renderTimelineWidget(data, containerDiv, forceIncludeDateStr = null, widgets = null) {
            if (!containerDiv) return;
            if (widgets) {
                window.allCurrentWidgets = widgets;
            }

            const todayStr = getLocalDateString();
            const targetDate = forceIncludeDateStr || window.currentCalendarDate || todayStr;
            window.currentCalendarDate = targetDate;

            // Cache all days received
            window.calendarTimelineCache = window.calendarTimelineCache || {};
            if (data && data.timeline && Array.isArray(data.timeline)) {
                data.timeline.forEach(day => {
                    if (day && day.date) {
                        window.calendarTimelineCache[day.date] = day;
                    }
                });
            }

            // Also cache overdueTasks if provided
            if (data && data.overdueTasks) {
                window.timelineOverdueTasks = data.overdueTasks;
            }

            // If day is already in cache
            if (window.calendarTimelineCache[targetDate]) {
                renderVerticalDayTimeline(targetDate, window.calendarTimelineCache[targetDate], containerDiv);
                return;
            }

            // Fetch day if missing
            await jumpToTimelineDate(targetDate);
        }
        window.renderTimelineWidget = renderTimelineWidget;

        function renderVerticalDayTimeline(dateStr, dayData, containerDiv) {
            if (!containerDiv) return;
            dayData = dayData || { date: dateStr, events: [], diaryEntries: [], completedTasks: [] };

            const todayStr = getLocalDateString();
            const isToday = (dateStr === todayStr);
            const isPast = (dateStr < todayStr);
            const isFuture = (dateStr > todayStr);

            const parts = dateStr.split('-').map(Number);
            const dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
            const weekdayLong = dateObj.toLocaleDateString('de-DE', { weekday: 'long' });
            const dayMonthLong = dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

            const yesterdayObj = new Date(); yesterdayObj.setDate(yesterdayObj.getDate() - 1);
            const yesterdayStr = getLocalDateString(yesterdayObj);
            const tomorrowObj = new Date(); tomorrowObj.setDate(tomorrowObj.getDate() + 1);
            const tomorrowStr = getLocalDateString(tomorrowObj);

            let dayBadgeHtml = '';
            if (isToday) {
                dayBadgeHtml = '<span class="calendar-nav-badge today">Heute</span>';
            } else if (dateStr === yesterdayStr) {
                dayBadgeHtml = '<span class="calendar-nav-badge yesterday">Gestern</span>';
            } else if (dateStr === tomorrowStr) {
                dayBadgeHtml = '<span class="calendar-nav-badge tomorrow">Morgen</span>';
            }

            const rawEvents = dayData.events || [];
            const diaryEntries = dayData.diaryEntries || [];
            const completedTasks = dayData.completedTasks || [];
            const overdueTasks = isToday ? (window.timelineOverdueTasks || dayData.overdueTasks || []) : [];

            // Tomorrow events for bedtime recommendation
            const nextDayDate = new Date(dateObj);
            nextDayDate.setDate(nextDayDate.getDate() + 1);
            const nextDayStr = getLocalDateString(nextDayDate);
            const tomorrowDayData = (window.calendarTimelineCache && window.calendarTimelineCache[nextDayStr]) ? window.calendarTimelineCache[nextDayStr] : null;
            const tomorrowEvents = tomorrowDayData ? (tomorrowDayData.events || []) : [];
            const bedtimeAdvice = getBedtimeRecommendation(tomorrowEvents);

            // Sync top header input
            const headerDateInput = document.getElementById('header-calendar-date');
            if (headerDateInput) headerDateInput.value = dateStr;

            let html = `
                <div class="calendar-day-timeline-wrapper">
                    <!-- Day Navigation Bar -->
                    <div class="calendar-day-nav-bar glass-card">
                        <div class="calendar-nav-controls">
                            <button type="button" class="calendar-nav-btn" onclick="navigateCalendarDay(-1)" title="Vorheriger Tag">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <button type="button" class="calendar-nav-btn today-btn ${isToday ? 'active' : ''}" onclick="jumpToTimelineDate('today')" title="Zu Heute springen">
                                Heute
                            </button>
                            <button type="button" class="calendar-nav-btn" onclick="navigateCalendarDay(1)" title="Nächster Tag">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        </div>
                        <div class="calendar-nav-date-box" onclick="document.getElementById('calendar-active-date-picker').showPicker ? document.getElementById('calendar-active-date-picker').showPicker() : document.getElementById('calendar-active-date-picker').focus()">
                            <input type="date" id="calendar-active-date-picker" value="${dateStr}" onchange="jumpToTimelineDate(this.value)" class="calendar-native-date-input">
                            <div class="calendar-date-text">
                                <span class="calendar-weekday">${weekdayLong},</span>
                                <span class="calendar-date-number">${dayMonthLong}</span>
                                ${dayBadgeHtml}
                            </div>
                        </div>
                        <div class="calendar-nav-actions">
                            <button type="button" class="calendar-action-btn diary-btn" onclick="openDiaryModal('${dateStr}')" title="Tagebucheintrag verfassen">
                                <span>📝</span> <span class="btn-text">+ Tagebuch</span>
                            </button>
                            <button type="button" class="calendar-action-btn event-btn" onclick="openEventEditModal(null, '', '${dateStr}T10:00:00', '${dateStr}T11:00:00', false, '', '', false, '${dateStr}')" title="Neuen Termin an diesem Tag erstellen">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                <span class="btn-text">+ Termin</span>
                            </button>
                        </div>
                    </div>
            `;

            // Overdue tasks (for today)
            if (isToday && overdueTasks.length > 0) {
                const uncompleted = overdueTasks.filter(t => !t.completed && t.status !== 'done');
                const completed = overdueTasks.filter(t => t.completed || t.status === 'done');
                const badgeText = completed.length > 0 ? `${uncompleted.length} offen, ${completed.length} erledigt` : `${overdueTasks.length}`;
                html += `
                    <div class="calendar-overdue-box glass-card">
                        <div class="calendar-overdue-header">
                            ${googleIcon('verified', '13px', 'fill: var(--off);')} Ausstehende Aufgaben (${badgeText})
                        </div>
                        <div class="calendar-overdue-list">
                `;
                overdueTasks.forEach(t => {
                    const rawTaskId = String(t.id).replace('task-', '');
                    const escTitle = escapeHtml(t.title || 'Aufgabe');
                    const escListTitle = escapeHtml(t.listTitle || 'Standard');
                    const isDone = !!t.completed || t.status === 'done';
                    const recurrenceVal = t.recurrence || 'none';
                    const isRecurring = recurrenceVal && recurrenceVal !== 'none';
                    const repeatBadge = isRecurring ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrend: ${recurrenceVal}">🔄</span>` : '';
                    let dueText = '';
                    if (t.due) {
                        const dateObj = new Date(t.due);
                        dueText = dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                    }
                    const textStyle = isDone ? 'text-decoration: line-through; opacity: 0.5;' : '';
                    const itemHtml = `
                        <div class="arbeitstisch-task-card ${isDone ? 'is-done' : 'is-overdue'}">
                            <div style="display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0;">
                                <button type="button" 
                                        class="task-circle-check ${isDone ? 'is-done' : 'is-expired'}" 
                                        onclick="event.stopPropagation(); toggleTaskCompletion('${rawTaskId}', '${escListTitle}', ${!isDone}, this)"
                                        style="margin-top: 2px; flex-shrink: 0;"
                                        title="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}">
                                    ${isDone ? googleIcon('check', '12px', 'fill: #11111b;') : ''}
                                </button>
                                <div style="flex: 1; min-width: 0; ${textStyle}">
                                    <div style="font-weight: 600; font-size: 0.82rem; color: var(--text); word-break: break-word;">
                                        ${escTitle} ${repeatBadge}
                                    </div>
                                    <div style="font-size: 0.68rem; color: ${isDone ? '#a6e3a1' : 'var(--off)'}; margin-top: 2px;">
                                        ${isDone ? '✓ Erledigt' : '⚠ Fällig seit ' + dueText}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    const extraData = `data-task-id="${rawTaskId}" data-task-title="${escTitle}" data-task-notes="${escapeHtml(t.notes || '')}" data-task-due="${t.due || ''}" data-task-list="${escListTitle}" data-task-recurrence="${recurrenceVal}" data-task-completed="${isDone}"`;
                    html += renderSwipeLinkWrapper(itemHtml, t.title, 'task', rawTaskId, '', '', '', extraData);
                });
                html += `
                        </div>
                    </div>
                `;
            }

            // Events & Tasks Vertical Timeline
            if (rawEvents.length > 0) {
                const sortedEvents = [...rawEvents].sort((a, b) => {
                    const ta = new Date(a.time || a.start || 0).getTime();
                    const tb = new Date(b.time || b.start || 0).getTime();
                    return ta - tb;
                });

                const nowMs = Date.now();
                let foundNext = false;
                let prevEventEndMs = null;
                let prevEventLocation = null;

                html += `<div class="today-vertical-timeline" style="margin-top: 10px;">`;

                sortedEvents.forEach(ev => {
                    let evIsPast = isPast;
                    let evIsCurrent = false;
                    let evIsFuture = isFuture;
                    let evIsNext = false;
                    let progressPercent = 0;
                    let remainingMinutes = 0;
                    let elapsedMinutes = 0;
                    let totalMinutes = 0;

                    let currStartMs = null;
                    let currEndMs = null;
                    let isExpiredTask = false;

                    if (ev.isTask) {
                        if (ev.completed) {
                            evIsPast = true;
                        } else if (ev.time) {
                            currStartMs = new Date(ev.time).getTime();
                            currEndMs = currStartMs + 30 * 60 * 1000;
                            if (isToday) {
                                if (nowMs >= currStartMs) isExpiredTask = true;
                                else {
                                    evIsFuture = true;
                                    if (!foundNext) { evIsNext = true; foundNext = true; }
                                }
                            }
                        } else {
                            if (isToday) {
                                evIsFuture = true;
                                if (!foundNext) { evIsNext = true; foundNext = true; }
                            }
                        }
                    } else {
                        if (ev.isAllDay) {
                            if (isToday) evIsCurrent = true;
                        } else if (ev.time || ev.start) {
                            currStartMs = new Date(ev.time || ev.start).getTime();
                            currEndMs = (ev.endTime || ev.end) ? new Date(ev.endTime || ev.end).getTime() : currStartMs + 60 * 60 * 1000;

                            if (isToday) {
                                if (nowMs >= currEndMs) {
                                    evIsPast = true;
                                } else if (nowMs >= currStartMs && nowMs < currEndMs) {
                                    if (!ev.isCancelled) {
                                        evIsCurrent = true;
                                        totalMinutes = Math.max(1, Math.round((currEndMs - currStartMs) / 60000));
                                        elapsedMinutes = Math.max(0, Math.round((nowMs - currStartMs) / 60000));
                                        remainingMinutes = Math.max(0, Math.round((currEndMs - nowMs) / 60000));
                                        progressPercent = Math.min(100, Math.max(5, Math.round((elapsedMinutes / totalMinutes) * 100)));
                                    }
                                } else {
                                    evIsFuture = true;
                                    if (!foundNext && !ev.isCancelled) { evIsNext = true; foundNext = true; }
                                }
                            }
                        }
                    }

                    // Pauses and travel times between events
                    if (prevEventEndMs !== null && currStartMs !== null && currStartMs > prevEventEndMs) {
                        const gapMinutes = Math.round((currStartMs - prevEventEndMs) / 60000);
                        const locA = (prevEventLocation || '').trim();
                        const locB = (!ev.isTask && ev.location ? ev.location : '').trim();
                        const isLocChange = locA && locB && locA.toLowerCase() !== locB.toLowerCase();

                        if (isLocChange && ev.travelMode) {
                            const transitInfo = ev.travelTransitDetails;
                            const travelMins = ev.travelDurationMinutes || 15;
                            let travelStartMs = currStartMs - (travelMins * 60000);
                            let travelEndMs = currStartMs;

                            if (transitInfo) {
                                if (transitInfo.journeyStartDateTime) travelStartMs = new Date(transitInfo.journeyStartDateTime).getTime();
                                if (transitInfo.journeyEndDateTime) travelEndMs = new Date(transitInfo.journeyEndDateTime).getTime();
                            }

                            const pauseBeforeTravel = Math.round((travelStartMs - prevEventEndMs) / 60000);
                            if (pauseBeforeTravel >= 3) {
                                const pStart = new Date(prevEventEndMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                const pEnd = new Date(travelStartMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                const isPPast = isPast || (isToday && nowMs >= travelStartMs);
                                const isPCurr = isToday && nowMs >= prevEventEndMs && nowMs < travelStartMs;
                                const pRemaining = isPCurr ? Math.max(0, Math.round((travelStartMs - nowMs) / 60000)) : 0;
                                const pElapsed = isPCurr ? Math.max(0, Math.round((nowMs - prevEventEndMs) / 60000)) : 0;
                                const pTotal = Math.max(1, pauseBeforeTravel);
                                const pProgress = isPCurr ? Math.min(100, Math.max(5, Math.round((pElapsed / pTotal) * 100))) : 0;
                                const pauseLabel = `Pause: ${pStart} – ${pEnd} Uhr (${pauseBeforeTravel} Min.)`;
                                const pauseId = `pause_${pStart.replace(':', '')}_${pEnd.replace(':', '')}`;

                                const pauseItemHtml = `
                                    <div class="timeline-pause-row ${isPCurr ? 'is-current' : ''}">
                                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 6px;">
                                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                                <span class="timeline-time-badge pause-time-badge">${pStart} – ${pEnd} Uhr</span>
                                                <strong style="color: rgba(255,255,255,0.9); font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('coffee', '13px', 'fill: #f9e2af;')} Pause vor Abreise (${pauseBeforeTravel} Min.)</strong>
                                            </div>
                                            ${isPCurr ? `<span class="timeline-active-badge pause-active-badge"><span class="active-pulse-dot"></span> Läuft gerade (${pProgress}% • noch ${pRemaining} Min.)</span>` : ''}
                                        </div>
                                    </div>
                                `;

                                html += `
                                    <div class="timeline-step is-pause ${isPPast ? 'is-past' : (isPCurr ? 'is-current' : 'is-future')}">
                                        <div class="timeline-step-indicator">
                                            ${isPCurr ? `
                                                <div class="timeline-step-line timeline-current-line" title="Pause läuft: ${pElapsed} von ${pTotal} Min">
                                                    <div class="timeline-line-progress-fill pause-progress-fill" style="height: ${pProgress}%;"></div>
                                                </div>
                                            ` : `
                                                <div class="timeline-step-line"></div>
                                            `}
                                        </div>
                                        <div class="timeline-step-body">
                                            ${renderSwipeLinkWrapper(pauseItemHtml, pauseLabel, 'pause', pauseId, 'pause-swipe-item', 'background: transparent; border: none; padding: 0;', 'margin-bottom: 0;')}
                                        </div>
                                    </div>
                                `;
                            }

                            // Travel block
                            const travelStartStr = new Date(travelStartMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const travelEndStr = new Date(travelEndMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const isTPast = isPast || (isToday && nowMs >= travelEndMs);
                            const isTCurr = isToday && nowMs >= travelStartMs && nowMs < travelEndMs;
                            const tElapsed = isTCurr ? Math.max(0, Math.round((nowMs - travelStartMs) / 60000)) : 0;
                            const tTotal = Math.max(1, travelMins);
                            const tProgress = isTCurr ? Math.min(100, Math.max(5, Math.round((tElapsed / tTotal) * 100))) : 0;
                            const tRemaining = isTCurr ? Math.max(0, Math.round((travelEndMs - nowMs) / 60000)) : 0;

                            const gMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(locA)}&destination=${encodeURIComponent(locB)}&travelmode=${ev.travelMode}`;
                            const travelItemHtml = `
                                <div class="arbeitstisch-item ${isTPast ? 'is-past' : ''} ${isTCurr ? 'is-current' : ''}">
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            <span class="timeline-time-badge travel-time-badge">${travelStartStr} – ${travelEndStr} Uhr</span>
                                            <strong style="font-size: 0.8rem; color: #a6e3a1; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('directions_bike', '14px', 'fill: #a6e3a1;')} Wegezeit nach ${escapeHtml(locB)}</strong>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <a href="${gMapsUrl}" target="_blank" rel="noopener" class="timeline-maps-btn" onclick="event.stopPropagation();" title="In Google Maps öffnen">
                                                ${googleIcon('map', '12px', 'fill: currentColor;')} Maps ↗
                                            </a>
                                            ${isTCurr ? `<span class="timeline-active-badge travel-active-badge"><span class="active-pulse-dot"></span> Unterwegs (${tProgress}% • noch ${tRemaining} Min.)</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;

                            html += `
                                <div class="timeline-step is-travel ${isTPast ? 'is-past' : (isTCurr ? 'is-current' : 'is-future')}">
                                    <div class="timeline-step-indicator">
                                        ${isTCurr ? `
                                            <div class="timeline-step-line timeline-current-line" title="Wegezeit läuft">
                                                <div class="timeline-line-progress-fill travel-progress-fill" style="height: ${tProgress}%;"></div>
                                            </div>
                                        ` : `
                                            <div class="timeline-step-line"></div>
                                        `}
                                    </div>
                                    <div class="timeline-step-body">
                                        ${renderSwipeLinkWrapper(travelItemHtml, 'Wegezeit', 'travel', String(ev.id), '', '', '')}
                                    </div>
                                </div>
                            `;
                        } else if (gapMinutes >= 15) {
                            // Standard Pause
                            const pStart = new Date(prevEventEndMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const pEnd = new Date(currStartMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const isPPast = isPast || (isToday && nowMs >= currStartMs);
                            const isPCurr = isToday && nowMs >= prevEventEndMs && nowMs < currStartMs;
                            const pRemaining = isPCurr ? Math.max(0, Math.round((currStartMs - nowMs) / 60000)) : 0;
                            const pElapsed = isPCurr ? Math.max(0, Math.round((nowMs - prevEventEndMs) / 60000)) : 0;
                            const pTotal = Math.max(1, gapMinutes);
                            const pProgress = isPCurr ? Math.min(100, Math.max(5, Math.round((pElapsed / pTotal) * 100))) : 0;

                            const pauseItemHtml = `
                                <div class="timeline-pause-row ${isPCurr ? 'is-current' : ''}">
                                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 6px;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            <span class="timeline-time-badge pause-time-badge">${pStart} – ${pEnd} Uhr</span>
                                            <strong style="color: rgba(255,255,255,0.85); font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${googleIcon('coffee', '13px', 'fill: #f9e2af;')} Pause (${gapMinutes} Min.)</strong>
                                        </div>
                                        ${isPCurr ? `<span class="timeline-active-badge pause-active-badge"><span class="active-pulse-dot"></span> Läuft gerade (${pProgress}% • noch ${pRemaining} Min.)</span>` : ''}
                                    </div>
                                </div>
                            `;

                            html += `
                                <div class="timeline-step is-pause ${isPPast ? 'is-past' : (isPCurr ? 'is-current' : 'is-future')}">
                                    <div class="timeline-step-indicator">
                                        ${isPCurr ? `
                                            <div class="timeline-step-line timeline-current-line" title="Pause läuft">
                                                <div class="timeline-line-progress-fill pause-progress-fill" style="height: ${pProgress}%;"></div>
                                            </div>
                                        ` : `
                                            <div class="timeline-step-line"></div>
                                        `}
                                    </div>
                                    <div class="timeline-step-body">
                                        ${renderSwipeLinkWrapper(pauseItemHtml, 'Pause', 'pause', `pause_${pStart}`, 'pause-swipe-item', 'background: transparent; border: none; padding: 0;', 'margin-bottom: 0;')}
                                    </div>
                                </div>
                            `;
                        }
                    }

                    // Render Step Item (Event or Task)
                    let stepClass = 'timeline-step';
                    let statusBadgeHtml = '';

                    if (isExpiredTask) {
                        stepClass += ' is-expired-task';
                    } else if (evIsPast) {
                        stepClass += ' is-past';
                    } else if (evIsCurrent) {
                        stepClass += ' is-current';
                        statusBadgeHtml = (totalMinutes > 0)
                            ? `<span class="timeline-active-badge"><span class="active-pulse-dot"></span> Läuft gerade (${progressPercent}% • noch ${remainingMinutes} Min.)</span>`
                            : `<span class="timeline-active-badge"><span class="active-pulse-dot"></span> Läuft gerade</span>`;
                    } else {
                        stepClass += ' is-future';
                        if (evIsNext) {
                            stepClass += ' is-next';
                            statusBadgeHtml = '<span class="timeline-next-badge">Als Nächstes</span>';
                        }
                    }

                    if (!ev.isTask) {
                        if (ev.isBirthday) stepClass += ' is-birthday';
                        if (ev.originalStart) stepClass += ' is-rescheduled';
                        if (ev.isCancelled) {
                            stepClass += ' is-cancelled';
                            statusBadgeHtml = '<span class="timeline-cancelled-badge">🚫 Fällt aus</span>';
                        }
                    }

                    let lineHtml = '';
                    if (evIsCurrent && totalMinutes > 0) {
                        lineHtml = `
                            <div class="timeline-step-line timeline-current-line" title="Termin läuft: ${elapsedMinutes} von ${totalMinutes} Min (${progressPercent}%)">
                                <div class="timeline-line-progress-fill" style="height: ${progressPercent}%;"></div>
                            </div>
                        `;
                    } else if (evIsCurrent) {
                        lineHtml = `
                            <div class="timeline-step-line timeline-current-line" title="Läuft gerade">
                                <div class="timeline-line-progress-fill" style="height: 100%;"></div>
                            </div>
                        `;
                    } else if (ev.isCancelled) {
                        lineHtml = '<div class="timeline-step-line timeline-cancelled-line" title="Termin fällt aus"></div>';
                    } else {
                        lineHtml = '<div class="timeline-step-line"></div>';
                    }

                    if (ev.isTask) {
                        stepClass += ' is-task';
                        const rawTaskId = String(ev.id).replace('task-', '');
                        const escTitle = escapeHtml(ev.title || 'Aufgabe');
                        const escNotes = escapeHtml(ev.description || '');
                        const escListTitle = escapeHtml(ev.listTitle || 'Standard');
                        const recurrenceVal = ev.recurrence || 'none';
                        const isDone = !!ev.completed || ev.status === 'done';
                        const repeatBadge = (ev.recurring || recurrenceVal !== 'none') ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrend: ${recurrenceVal}">🔄</span>` : '';
                        const timeBadge = ev.time ? `<span class="timeline-time-badge task-time-badge">${new Date(ev.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>` : '';

                        let personsHtml = '';
                        if (ev.persons && ev.persons.length > 0) {
                            ev.persons.forEach(p => {
                                personsHtml += `<span onclick="openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;">👤 ${escapeHtml(p.name)}</span>`;
                            });
                        }

                        const taskContent = `
                            <div class="arbeitstisch-item is-task-item ${isDone ? 'is-past' : ''} ${isExpiredTask ? 'is-expired' : ''}">
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                        ${timeBadge}
                                        <strong style="color: ${isDone ? '#a6e3a1' : (isExpiredTask ? 'var(--off)' : 'inherit')}; font-size: 0.8rem;">[Aufgabe]</strong>
                                        <span style="font-weight: 600; font-size: 0.82rem; ${isDone ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escTitle}</span>
                                        ${repeatBadge}
                                        ${personsHtml}
                                    </div>
                                    ${statusBadgeHtml}
                                </div>
                            </div>
                        `;

                        const extraData = `data-task-id="${rawTaskId}" data-task-title="${escTitle}" data-task-notes="${escNotes}" data-task-due="${ev.time || ''}" data-task-list="${escListTitle}" data-task-recurrence="${recurrenceVal}" data-task-completed="${isDone}"`;

                        html += `
                            <div class="${stepClass}">
                                <div class="timeline-step-indicator">
                                    <button type="button" 
                                            class="timeline-step-dot dot-task-check ${isDone ? 'is-done' : ''} ${isExpiredTask ? 'is-expired' : ''}" 
                                            onclick="event.stopPropagation(); toggleTaskCompletion('${rawTaskId}', '${escListTitle}', ${!isDone}, this)"
                                            title="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}">
                                        ${isDone ? googleIcon('check', '12px', 'fill: #11111b;') : ''}
                                    </button>
                                </div>
                                <div class="timeline-step-body">
                                    ${renderSwipeLinkWrapper(taskContent, ev.title, 'task', rawTaskId, '', '', '', extraData)}
                                </div>
                            </div>
                        `;
                    } else {
                        // Calendar event
                        let timeRangeStr = 'Ganztägig';
                        if (!ev.isAllDay && (ev.time || ev.start)) {
                            const sStr = new Date(ev.time || ev.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const eStr = (ev.endTime || ev.end) ? new Date(ev.endTime || ev.end).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
                            timeRangeStr = eStr ? `${sStr} – ${eStr} Uhr` : `${sStr} Uhr`;
                        }

                        let personsHtml = '';
                        if (ev.persons && ev.persons.length > 0) {
                            ev.persons.forEach(p => {
                                personsHtml += `<span onclick="openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;">👤 ${escapeHtml(p.name)}</span>`;
                            });
                        }

                        const occDateStr = ev.occurrenceDate || dateStr;
                        const eventContent = `
                            <div class="arbeitstisch-item ${evIsPast ? 'is-past' : ''} ${evIsCurrent ? 'is-current' : ''}">
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                        <span class="timeline-time-badge event-time-badge">${timeRangeStr}</span>
                                        <strong class="arbeitstisch-item-title" style="font-size: 0.82rem; ${ev.isCancelled ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(ev.title || 'Termin')}</strong>
                                        ${ev.recurring ? '🔄' : ''}
                                        ${personsHtml}
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        ${statusBadgeHtml}
                                        <button type="button" class="timeline-edit-btn" onclick="event.stopPropagation(); openEventDetailModal('${ev.id}', '${escapeHtml(ev.title)}', '${ev.time || ev.start || ''}', '${ev.endTime || ev.end || ''}', ${ev.isAllDay ? 'true' : 'false'}, '${escapeHtml(ev.description || '')}', ${ev.recurring ? 'true' : 'false'}, '${occDateStr}', false, '${escapeHtml(ev.location || '')}')" title="Termin-Details">
                                            ✏️
                                        </button>
                                    </div>
                                </div>
                                ${ev.location ? `
                                    <div style="font-size: 0.72rem; color: #89b4fa; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                                        ${googleIcon('location_on', '12px', 'fill: currentColor;')} ${escapeHtml(ev.location)}
                                    </div>
                                ` : ''}
                            </div>
                        `;

                        const extraData = `data-event-id="${ev.id}" data-event-title="${escapeHtml(ev.title)}" data-event-start="${ev.time || ev.start || ''}" data-event-end="${ev.endTime || ev.end || ''}" data-event-allday="${ev.isAllDay ? 'true' : 'false'}" data-event-desc="${escapeHtml(ev.description || '')}" data-event-recurring="${ev.recurring ? 'true' : 'false'}" data-event-occ="${occDateStr}" data-event-location="${escapeHtml(ev.location || '')}"`;

                        html += `
                            <div class="${stepClass}">
                                <div class="timeline-step-indicator">
                                    ${lineHtml}
                                </div>
                                <div class="timeline-step-body">
                                    ${renderSwipeLinkWrapper(eventContent, ev.title, 'event', String(ev.id), '', '', '', extraData)}
                                </div>
                            </div>
                        `;
                    }

                    if (currEndMs !== null) prevEventEndMs = currEndMs;
                    if (!ev.isTask && ev.location) prevEventLocation = ev.location;
                });

                // Sleep & next day recommendation at bottom (for today and future)
                if (!isPast && bedtimeAdvice) {
                    html += `
                        <div class="timeline-step timeline-step-sleep">
                            <div class="timeline-step-indicator">
                                <div class="timeline-step-line"></div>
                                <div class="timeline-step-dot dot-sleep">${googleIcon('bedtime', '11px', 'fill: #cba6f7;')}</div>
                            </div>
                            <div class="timeline-step-body">
                                <div class="timeline-sleep-card">
                                    <div class="timeline-sleep-title">
                                        ${googleIcon('bedtime', '13px', 'fill: #cba6f7;')} Nächster Tag & Schlafempfehlung
                                    </div>
                                    <div class="timeline-sleep-meta">
                                        <span class="timeline-sleep-badge">${escapeHtml(bedtimeAdvice.adviceText)}</span>
                                    </div>
                                    <div class="timeline-sleep-time-box">
                                        Schlafempfehlung: spätestens um <span class="timeline-sleep-target">${bedtimeAdvice.bedtimeStr}</span> ins Bett gehen
                                    </div>
                                    <div class="timeline-sleep-duration">
                                        🛌 Für 8 Std. erholsamen Schlaf (Wecker um ${bedtimeAdvice.wakeUpStr})
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }

                html += `</div>`;
            }

            // Tagebucheinträge (Diary Entries) for this day!
            html += `
                <div class="calendar-diary-section glass-card" style="margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid rgba(250, 179, 135, 0.25);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="font-size: 0.76rem; font-weight: 700; color: #fab387; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 5px;">
                            <span>📝</span> Tagebucheinträge (${diaryEntries.length})
                        </div>
                        <button type="button" class="calendar-action-btn diary-btn" onclick="openDiaryModal('${dateStr}')" style="padding: 4px 8px; font-size: 0.72rem;">
                            + Eintrag
                        </button>
                    </div>
            `;

            if (diaryEntries.length > 0) {
                html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
                diaryEntries.forEach(e => {
                    const timeStr = e.createdAt ? new Date(e.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
                    const escTitle = escapeHtml(e.title || "Tagebucheintrag");
                    const diaryContentHtml = `
                        <div class="diary-entry-card" style="background: rgba(250, 179, 135, 0.06); border: 1px solid rgba(250, 179, 135, 0.2); padding: 9px 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px; width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="color: #fab387; font-size: 0.82rem;">${escTitle}</strong>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 0.68rem; opacity: 0.5;">${timeStr ? timeStr + ' Uhr' : ''}</span>
                                    <button type="button" onclick="event.stopPropagation(); deleteJournalEntry(${e.id}, '${dateStr}')" style="background: none; border: none; color: var(--off); opacity: 0.6; cursor: pointer; padding: 2px 4px; font-size: 0.75rem;" title="Löschen">🗑️</button>
                                </div>
                            </div>
                            <div style="white-space: pre-wrap; word-break: break-word; line-height: 1.35; font-size: 0.78rem; opacity: 0.9; color: var(--text);">${escapeHtml(e.content)}</div>
                        </div>
                    `;
                    const extraData = `data-journal-id="${e.id}" data-journal-title="${escTitle}" data-journal-date="${dateStr}"`;
                    html += renderSwipeLinkWrapper(diaryContentHtml, escTitle, 'journal', e.id, '', '', '', extraData);
                });
                html += `</div>`;
            } else {
                html += `
                    <div style="padding: 10px; text-align: center; color: rgba(255, 255, 255, 0.45); font-size: 0.75rem; border: 1px dashed rgba(250, 179, 135, 0.15); border-radius: 8px;">
                        Noch keine Tagebucheinträge für ${isToday ? 'heute' : (isPast ? 'diesen Tag' : 'diesen Tag')} eingetragen.
                    </div>
                `;
            }

            html += `</div>`;

            // Empty state if completely no events and no entries
            if (rawEvents.length === 0 && overdueTasks.length === 0 && diaryEntries.length === 0) {
                html += `
                    <div class="calendar-empty-day glass-card" style="margin-top: 10px; padding: 22px 15px; text-align: center; border-radius: 12px; border: 1px dashed rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.6); font-size: 0.82rem; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <div>✨ Keine Termine oder Aufgaben für diesen Tag vorhanden.</div>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
                            <button type="button" class="nav-btn" onclick="openEventEditModal(null, '', '${dateStr}T10:00:00', '${dateStr}T11:00:00', false, '', '', false, '${dateStr}')" style="padding: 6px 12px; font-size: 0.75rem;">
                                + Termin erstellen
                            </button>
                            <button type="button" class="nav-btn" onclick="openDiaryModal('${dateStr}')" style="padding: 6px 12px; font-size: 0.75rem; color: #fab387; border-color: rgba(250, 179, 135, 0.3);">
                                + Tagebuch schreiben
                            </button>
                        </div>
                    </div>
                `;
            }
            // Pinned Tasks & Timers for Today
            if (isToday && window.allCurrentWidgets) {
                const widgets = window.allCurrentWidgets;
                const taskWidget = widgets.find(w => w.type === 'custom' && w.data && w.data.widgetType === 'tasks_overview');
                const tasksList = (taskWidget && taskWidget.data && taskWidget.data.tasks) ? taskWidget.data.tasks : [];
                const pinnedTasks = tasksList.filter(t => t.isStarred && !t.completed && t.status !== 'done');
                
                if (pinnedTasks.length > 0) {
                    html += `
                        <div class="arbeitstisch-card glass-card" style="margin-top: 14px; border-radius: 12px; padding: 12px; border: 1px solid rgba(250, 179, 135, 0.25);">
                            <div class="arbeitstisch-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div class="arbeitstisch-card-title" style="display: flex; align-items: center; gap: 6px;">
                                    <span style="display: inline-flex; align-items: center;">${googleIcon('keep', '14px', 'fill: #fab387;')}</span>
                                    <h4 style="margin: 0; font-size: 0.8rem; font-weight: 700; color: #fab387; text-transform: uppercase; letter-spacing: 0.5px;">Angepinnte Aufgaben</h4>
                                    <span style="background: rgba(250, 179, 135, 0.2); color: #fab387; font-size: 0.68rem; padding: 1px 6px; border-radius: 10px; font-weight: 600;">${pinnedTasks.length}</span>
                                </div>
                                <button type="button" onclick="focusWidget('tasks')" class="nav-btn" style="padding: 3px 8px; font-size: 0.72rem;">Aufgaben ➔</button>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                    `;
                    pinnedTasks.forEach(t => {
                        const rawId = String(t.id).replace('task-', '');
                        const escTitle = escapeHtml(t.title || 'Aufgabe');
                        const listTitle = escapeHtml(t.listTitle || t.tasklistId || 'Standard');
                        const dueObj = t.due ? new Date(t.due) : null;
                        let dueBadge = '';
                        if (dueObj && !isNaN(dueObj.getTime())) {
                            const dueDateStr = dueObj.toISOString().split('T')[0];
                            if (dueDateStr < todayStr) {
                                dueBadge = `<span style="font-size: 0.65rem; color: var(--off); font-weight: bold; background: rgba(243, 139, 168, 0.15); padding: 1px 5px; border-radius: 4px;">Überfällig</span>`;
                            } else if (dueDateStr === todayStr) {
                                dueBadge = `<span style="font-size: 0.65rem; color: var(--accent); font-weight: bold; background: rgba(137, 180, 250, 0.15); padding: 1px 5px; border-radius: 4px;">Heute</span>`;
                            }
                        }
                        const taskItemHtml = `
                            <div class="arbeitstisch-item pinned-task-item" style="border-left: 3.5px solid #fab387; padding: 8px 12px; background: rgba(250, 179, 135, 0.04); border: 1px solid rgba(250, 179, 135, 0.12); border-left: 3.5px solid #fab387; border-radius: 8px; display: flex; align-items: center; gap: 8px; width: 100%;">
                                <button type="button" 
                                        class="task-circle-check" 
                                        onclick="event.stopPropagation(); toggleTaskCompletion('${rawId}', '${listTitle}', true, this)" 
                                        style="flex-shrink: 0;"
                                        title="Aufgabe abhaken">
                                </button>
                                <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; cursor: pointer;" onclick="handleEntityClick(event, 'task', '${rawId}')">
                                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                        <span style="font-size: 0.8rem; font-weight: 500; color: #ffffff;">${escTitle}</span>
                                        ${dueBadge}
                                    </div>
                                </div>
                                <button type="button" class="pin-btn is-pinned" onclick="toggleTaskStar('${rawId}', event)" title="Aufgabe entpinnen" style="margin-left: auto; background: none; border: none; cursor: pointer;">
                                    ${googleIcon('keep', '15px', 'fill: #fab387;')}
                                </button>
                            </div>
                        `;
                        html += renderSwipeLinkWrapper(taskItemHtml, t.title || 'Aufgabe', 'task', rawId);
                    });
                    html += `</div></div>`;
                }

                // Timers
                const timerWidget = widgets.find(w => w.type === 'timer_list');
                const activeTimers = (timerWidget && timerWidget.data && timerWidget.data.timers) ? timerWidget.data.timers : [];
                if (activeTimers.length > 0) {
                    html += `
                        <div class="arbeitstisch-card glass-card" style="margin-top: 14px; border-radius: 12px; padding: 12px; border: 1px solid rgba(137, 180, 250, 0.2);">
                            <div class="arbeitstisch-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div class="arbeitstisch-card-title" style="display: flex; align-items: center; gap: 6px;">
                                    <span>⏱️</span>
                                    <h4 style="margin: 0; font-size: 0.8rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px;">Timer (${activeTimers.length})</h4>
                                </div>
                                <button type="button" onclick="openTimerModal()" class="nav-btn" style="padding: 3px 8px; font-size: 0.72rem;">+ Timer</button>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                    `;
                    activeTimers.forEach(t => {
                        const escTitle = escapeHtml(t.title || 'Timer');
                        html += `
                            <div class="timer-card" id="timer-card-${t.id}" data-created="${t.createdAt}" data-expires="${t.expiresAt}" onclick="openTimerDetailModal('${t.id}', '${escTitle}', '${t.createdAt}', '${t.expiresAt}')" style="padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); width: 100%; box-sizing: border-box; cursor: pointer;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span style="font-size: 0.82rem; font-weight: bold; color: var(--text);">${escTitle}</span>
                                    <span style="font-size: 0.65rem; opacity: 0.5;">Bis ${new Date(t.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div class="timer-countdown" style="font-family: monospace; font-size: 1.05rem; font-weight: bold; color: var(--accent); margin-bottom: 4px;">--:--:--</div>
                                <div class="timer-progress-bg" style="width: 100%; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">
                                    <div class="timer-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--accent), var(--on)); border-radius: 2px; transition: width 0.5s linear;"></div>
                                </div>
                            </div>
                        `;
                    });
                    html += `</div></div>`;
                }
            }

            html += `
                <!-- Spacer so cards never sit behind floating input bar -->
                <div class="arbeitstisch-scroll-spacer" style="height: 180px; min-height: 180px; width: 100%; flex-shrink: 0; pointer-events: none; display: block;"></div>
            `;

            html += `</div>`;

            containerDiv.innerHTML = html;
        }
        window.renderVerticalDayTimeline = renderVerticalDayTimeline;

        async function deleteCalendarEvent(eventId, occurrenceDate, isRecurring) {
            const isRec = isRecurring === true || isRecurring === 'true';
            let deleteType = 'single';
            
            if (isRec) {
                const choice = confirm("Dies ist ein Serientermin.\n\nKlicke 'OK' um NUR DIESEN EINEN Termin am " + occurrenceDate + " zu löschen.\nKlicke 'Abbrechen', wenn du den Löschvorgang abbrechen möchtest.");
                if (!choice) return;
                deleteType = 'occurrence';
            } else {
                if (!confirm("Möchtest du diesen Termin wirklich löschen?")) return;
            }

            try {
                const args = { terminId: eventId };
                if (deleteType === 'occurrence' && occurrenceDate) {
                    args.datum = occurrenceDate;
                }
                await callTool('loesche_termin', args);
                if (typeof jumpToTimelineDate === 'function') {
                    await jumpToTimelineDate(window.currentCalendarDate);
                }
                if (typeof loadTopWidgets === 'function') {
                    loadTopWidgets();
                }
            } catch (e) {
                console.error("Fehler beim Löschen des Termins:", e);
            }
        }
        window.deleteCalendarEvent = deleteCalendarEvent;
