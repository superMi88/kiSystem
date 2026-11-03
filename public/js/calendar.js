
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

            const todayStr = typeof getLocalDateString === 'function' ? getLocalDateString() : '';
            if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                if (dateStr && dateStr !== todayStr) {
                    window.AppRouter.updateUrl(`/kalender/${dateStr}`);
                } else {
                    window.AppRouter.updateUrl('/kalender');
                }
            }

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
                const hasExistingRender = !!widgetCalendar.querySelector('.calendar-timeline-root');
                if (!hasExistingRender) {
                    widgetCalendar.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: var(--accent); font-size: 0.85rem;">
                            <span style="display: inline-block; animation: spin 1s infinite linear;">⏳</span> Lade Kalender für ${dateStr}...
                        </div>
                    `;
                }
                const res = await fetch(getApiUrl(`/api/calendar/timeline?start=${dateStr}&end=${dateStr}`));
                if (res.ok) {
                    const data = await res.json();
                    window.calendarTimelineCache = window.calendarTimelineCache || {};
                    if (data.days && Array.isArray(data.days)) {
                        data.days.forEach(d => {
                            if (d && d.date) {
                                window.calendarTimelineCache[d.date] = d;
                            }
                        });
                    }
                    if (data.overdueTasks) {
                        window.timelineOverdueTasks = data.overdueTasks;
                    }

                    const dayItem = (data.days && data.days.length > 0)
                        ? (data.days.find(d => d.date === dateStr) || data.days[0])
                        : {
                            date: dateStr,
                            events: [],
                            diaryEntries: [],
                            completedTasks: []
                        };
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
            window.eventsData = rawEvents;
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
                                    <div style="font-weight: 600; font-size: 0.82rem; color: var(--text); word-break: break-word; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                                        <span>${escTitle} ${repeatBadge}</span>
                                        ${t.isStarred ? `<span class="pinned-task-indicator" title="Angepinnt">📌</span>` : ''}
                                    </div>
                                    <div style="font-size: 0.68rem; color: ${isDone ? '#a6e3a1' : 'var(--off)'}; margin-top: 2px;">
                                        ${isDone ? '✓ Erledigt' : '⚠ Fällig seit ' + dueText}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    const extraData = `data-task-id="${rawTaskId}" data-task-title="${escTitle}" data-task-notes="${escapeHtml(t.notes || '')}" data-task-due="${t.due || ''}" data-task-list="${escListTitle}" data-task-recurrence="${recurrenceVal}" data-task-completed="${isDone}" data-task-starred="${!!t.isStarred}" data-task-status="${t.status || 'in_progress'}" data-task-location-id="${t.locationId || (t.locationObj ? t.locationObj.id : '')}" data-task-location-obj="${escapeHtml(JSON.stringify(t.locationObj || null))}" data-task-persons="${escapeHtml(JSON.stringify(t.persons || []))}" data-task-media="${escapeHtml(JSON.stringify(t.media || []))}"`;
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

                html += `<div class="today-vertical-timeline">`;

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

                    // Pausen & Zeitüberschneidungen zwischen Terminen
                    if (prevEventEndMs !== null && currStartMs !== null) {
                        const gapMinutes = Math.round((currStartMs - prevEventEndMs) / 60000);

                        if (gapMinutes >= 3) {
                            // Prüfe ob der anstehende Termin eine Wegezeit ist
                            const isUpcomingTravel = !ev.isTask && (
                                ev.isTravelTime || !!ev.travelMode ||
                                /\b(fahrt|wegzeit|wegezeit|anreise|abreise|hinfahrt|rückfahrt|rueckfahrt|reise|zugfahrt|flug|heimweg)\b/i.test((ev.title || '').trim()) ||
                                (ev.title && (ev.title.includes('🚗') || ev.title.includes('🚆') || ev.title.includes('🚲') || ev.title.includes('🚶') || ev.title.includes('✈️') || ev.title.includes('🗺️')))
                            );

                            const pStart = new Date(prevEventEndMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const pEnd = new Date(currStartMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const isPPast = isPast || (isToday && nowMs >= currStartMs);
                            const isPCurr = isToday && nowMs >= prevEventEndMs && nowMs < currStartMs;
                            const pRemaining = isPCurr ? Math.max(0, Math.round((currStartMs - nowMs) / 60000)) : 0;
                            const pElapsed = isPCurr ? Math.max(0, Math.round((nowMs - prevEventEndMs) / 60000)) : 0;
                            const pTotal = Math.max(1, gapMinutes);
                            const pProgress = isPCurr ? Math.min(100, Math.max(5, Math.round((pElapsed / pTotal) * 100))) : 0;

                            const gapIcon = isUpcomingTravel ? googleIcon('schedule', '13px', 'fill: #f9e2af;') : googleIcon('coffee', '13px', 'fill: #f9e2af;');
                            const gapTypeLabel = isUpcomingTravel ? 'Wartezeit / Puffer bis zur Abfahrt' : 'Pause';
                            const pauseLabel = `${gapIcon} ${gapTypeLabel}: ${pStart} – ${pEnd} Uhr (${gapMinutes} Min.)`;
                            const pauseId = `pause_${pStart.replace(':', '')}_${pEnd.replace(':', '')}_${gapMinutes}m`;

                            const activeStatusText = isUpcomingTravel
                                ? `Warten auf Abfahrt (${pProgress}% • noch ${pRemaining} Min.)`
                                : `Läuft gerade (${pProgress}% • noch ${pRemaining} Min.)`;

                            const pauseItemHtml = `
                                <div class="timeline-pause-row ${isPCurr ? 'is-current' : ''}">
                                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 6px;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            <span class="timeline-time-badge pause-time-badge start-time-badge">${pStart} Uhr</span>
                                            <strong style="color: rgba(255,255,255,0.85); font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                                ${gapIcon} ${gapTypeLabel} (${gapMinutes} Min.)
                                            </strong>
                                        </div>
                                        ${isPCurr ? `<span class="timeline-active-badge pause-active-badge"><span class="active-pulse-dot"></span> ${activeStatusText}</span>` : ''}
                                    </div>
                                    <div class="timeline-event-end-row" style="margin-top: 3px;">
                                        <span class="timeline-time-badge pause-time-badge end-time-badge">${pEnd} Uhr</span>
                                    </div>
                                </div>
                            `;

                            html += `
                                <div class="timeline-step is-pause ${isPPast ? 'is-past' : (isPCurr ? 'is-current' : 'is-future')}">
                                    <div class="timeline-step-indicator">
                                        ${isPCurr ? `
                                            <div class="timeline-step-line timeline-current-line" title="${gapTypeLabel} läuft">
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
                        } else if (gapMinutes < 0) {
                            // Zeitüberschneidung zwischen Terminen
                            const conflictMins = Math.abs(gapMinutes);
                            const pStart = new Date(prevEventEndMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const pEnd = new Date(currStartMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const conflictTimeBadge = `<span class="timeline-time-badge conflict-time-badge">${pEnd} Uhr</span>`;
                            const conflictHtml = `
                                <div class="arbeitstisch-item" style="border: 1px solid rgba(243, 139, 168, 0.4); background: rgba(243, 139, 168, 0.12); padding: 7px 10px; border-radius: 8px;">
                                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                        ${conflictTimeBadge}
                                        <div style="color: #f38ba8; font-weight: bold; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 5px;">
                                            ⚠️ Zeitüberschneidung (${conflictMins} Min.)
                                        </div>
                                    </div>
                                    <div style="font-size: 0.72rem; color: #cdd6f4; margin-top: 3px;">
                                        Beginn um <strong>${pEnd} Uhr</strong> überschneidet sich mit vorherigem Termin (Ende: <strong>${pStart} Uhr</strong>).
                                    </div>
                                </div>
                            `;
                            html += `
                                <div class="timeline-step is-warning">
                                    <div class="timeline-step-indicator">
                                        <div class="timeline-step-line"></div>
                                        <div class="timeline-step-dot" style="background: #f38ba8; color: #11111b; font-size: 10px; font-weight: bold;">!</div>
                                    </div>
                                    <div class="timeline-step-body">
                                        ${conflictHtml}
                                    </div>
                                </div>
                            `;
                        }
                    }

                    // Render Step Item (Event or Task)
                    let stepClass = 'timeline-step';
                    let statusBadgeHtml = '';

                    const isTravelEvent = !ev.isTask && (
                        ev.isTravelTime || !!ev.travelMode ||
                        /\b(fahrt|wegzeit|wegezeit|anreise|abreise|hinfahrt|rückfahrt|rueckfahrt|reise|zugfahrt|flug|heimweg)\b/i.test((ev.title || '').trim()) ||
                        (ev.title && (ev.title.includes('🚗') || ev.title.includes('🚆') || ev.title.includes('🚲') || ev.title.includes('🚶') || ev.title.includes('✈️') || ev.title.includes('🗺️')))
                    );

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
                        if (isTravelEvent) stepClass += ' is-travel';
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

                        let taskMetaChipsHtml = '';
                        if (ev.locationObj) {
                            const locId = ev.locationObj.id;
                            const locName = ev.locationObj.name || ev.locationObj.formattedAddress;
                            taskMetaChipsHtml += `<span class="meta-chip location" onclick="event.stopPropagation(); handleEntityClick(event, 'location', ${locId});" title="Ort: ${escapeHtml(locName)}">📍 ${escapeHtml(locName)}</span>`;
                        }
                        if (ev.persons && ev.persons.length > 0) {
                            ev.persons.forEach(p => {
                                taskMetaChipsHtml += `<span class="meta-chip person" onclick="event.stopPropagation(); openPersonProfileModal(${p.id});" title="Person: ${escapeHtml(p.name)}">👤 ${escapeHtml(p.name)}</span>`;
                            });
                        }
                        if (ev.media && ev.media.length > 0) {
                            ev.media.forEach(m => {
                                const isImg = m.category === 'image' || (m.mimeType && m.mimeType.startsWith('image/')) || /\.(jpe?g|png|gif|webp|svg)$/i.test(m.fileName || '');
                                taskMetaChipsHtml += `<span class="meta-chip media" onclick="event.stopPropagation(); handleEntityClick(event, 'media', ${m.id});" title="Datei: ${escapeHtml(m.title || m.fileName)}">${isImg ? '🖼️' : '📄'} ${escapeHtml(m.title || m.fileName)}</span>`;
                            });
                        }

                        const taskDescText = ev.description ? `
                            <div style="font-size: 0.72rem; opacity: 0.75; margin-top: 3px; line-height: 1.35; white-space: pre-wrap; word-break: break-word; color: #cdd6f4;">
                                ${escapeHtml(ev.description)}
                            </div>
                        ` : '';

                        const taskContent = `
                            <div class="arbeitstisch-item is-task-item ${isDone ? 'is-past' : ''} ${isExpiredTask ? 'is-expired' : ''}">
                                <div style="display: flex; flex-direction: column; gap: 2px; width: 100%;">
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            ${timeBadge}
                                            <strong style="color: ${isDone ? '#a6e3a1' : (isExpiredTask ? 'var(--off)' : 'inherit')}; font-size: 0.8rem;">[Aufgabe]</strong>
                                            <span style="font-weight: 600; font-size: 0.82rem; ${isDone ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escTitle}</span>
                                            ${ev.isStarred ? `<span class="pinned-task-indicator" title="Angepinnt">📌</span>` : ''}
                                            ${repeatBadge}
                                        </div>
                                        ${statusBadgeHtml}
                                    </div>
                                    ${taskMetaChipsHtml ? `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 3px;">${taskMetaChipsHtml}</div>` : ''}
                                    ${taskDescText}
                                </div>
                            </div>
                        `;

                        const extraData = `data-task-id="${rawTaskId}" data-task-title="${escTitle}" data-task-notes="${escNotes}" data-task-due="${ev.time || ''}" data-task-list="${escListTitle}" data-task-recurrence="${recurrenceVal}" data-task-completed="${isDone}" data-task-starred="${!!ev.isStarred}" data-task-status="${ev.status || 'in_progress'}" data-task-location-id="${ev.locationId || (ev.locationObj ? ev.locationObj.id : '')}" data-task-location-obj="${escapeHtml(JSON.stringify(ev.locationObj || null))}" data-task-persons="${escapeHtml(JSON.stringify(ev.persons || []))}" data-task-media="${escapeHtml(JSON.stringify(ev.media || []))}"`;

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
                        const escTitle = escapeHtml(ev.title || 'Termin');
                        const isRec = ev.recurring || ev.isRecurring;
                        const repeatBadge = isRec ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrender Termin">🔄</span>` : '';
                        const rescheduleBadge = ev.originalStart ? ` <span style="background: rgba(249, 226, 175, 0.15); color: #f9e2af; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase;" title="Dieser Termin wurde verschoben">verschoben</span>` : '';
                        const originalTimeText = ev.originalStart ? ` <span style="font-size: 0.68rem; opacity: 0.65; color: #f9e2af;">(ursprünglich: ${new Date(ev.originalStart).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})} ${new Date(ev.originalStart).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})})</span>` : '';
                        const reasonHtml = (ev.isCancelled && ev.cancellationReason) ? ` <span style="font-size: 0.7rem; color: var(--off); text-decoration: none; font-style: italic;">(${escapeHtml(ev.cancellationReason)})</span>` : (ev.isCancelled ? ' <span style="font-size: 0.7rem; color: var(--off); text-decoration: none; font-style: italic;">(Ausgefallen)</span>' : '');
                        const inPlanningBadge = ev.isPlanned ? `<span style="font-size: 0.65rem; color: #f9e2af; font-weight: bold; background: rgba(249, 226, 175, 0.15); border: 1px solid rgba(249, 226, 175, 0.3); padding: 1px 5px; border-radius: 4px;">🟡 In Planung</span>` : '';
                        const titleCancelStyle = ev.isCancelled ? 'color: var(--off); text-decoration: line-through;' : '';
                        const rescheduleBorder = ev.originalStart ? 'border-left: 3px solid #f9e2af;' : '';
                        const birthdayStyle = ev.isBirthday ? 'background: rgba(245, 194, 231, 0.08); border-color: rgba(245, 194, 231, 0.25); border-left: 3px solid #f5c2e7;' : '';
                        const travelBadge = isTravelEvent ? `<span class="timeline-badge" style="background: rgba(166, 227, 161, 0.15); color: #a6e3a1; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px;">🗺️ Wegezeit</span>` : '';
                        const travelStyle = isTravelEvent ? 'background: rgba(166, 227, 161, 0.05); border-left: 3px solid #a6e3a1;' : '';

                        const timeBadges = (typeof window.getEventTimeBadges === 'function')
                            ? window.getEventTimeBadges(ev, dateStr)
                            : { startBadge: `<span class="timeline-time-badge event-time-badge">Termin</span>`, endBadge: '' };
                        const startBadge = timeBadges.startBadge;
                        const endBadge = timeBadges.endBadge;

                        let eventMetaChipsHtml = '';
                        if (ev.locationObj) {
                            const locId = ev.locationObj.id;
                            const locName = ev.locationObj.name || ev.locationObj.formattedAddress;
                            eventMetaChipsHtml += `<span class="meta-chip location" onclick="event.stopPropagation(); handleEntityClick(event, 'location', ${locId});" title="Ort: ${escapeHtml(locName)}">📍 ${escapeHtml(locName)}</span>`;
                        } else if (ev.location) {
                            eventMetaChipsHtml += `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}" target="_blank" onclick="event.stopPropagation()" class="meta-chip location" title="Standort auf Google Maps anzeigen">📍 ${escapeHtml(ev.location)}</a>`;
                        }
                        if (ev.persons && ev.persons.length > 0) {
                            ev.persons.forEach(p => {
                                eventMetaChipsHtml += `<span class="meta-chip person" onclick="event.stopPropagation(); openPersonProfileModal(${p.id});" title="Person: ${escapeHtml(p.name)}">👤 ${escapeHtml(p.name)}</span>`;
                            });
                        }
                        if (ev.media && ev.media.length > 0) {
                            ev.media.forEach(m => {
                                const isImg = m.category === 'image' || (m.mimeType && m.mimeType.startsWith('image/')) || /\.(jpe?g|png|gif|webp|svg)$/i.test(m.fileName || '');
                                eventMetaChipsHtml += `<span class="meta-chip media" onclick="event.stopPropagation(); handleEntityClick(event, 'media', ${m.id});" title="Datei: ${escapeHtml(m.title || m.fileName)}">${isImg ? '🖼️' : '📄'} ${escapeHtml(m.title || m.fileName)}</span>`;
                            });
                        }

                        const occDateStr = ev.occurrenceDate || dateStr;
                        const descText = ev.description ? `
                            <div class="timeline-event-description" style="font-size: 0.73rem; opacity: 0.85; margin-top: 5px; line-height: 1.4; color: #cdd6f4; white-space: pre-wrap; word-break: break-word;">
                                ${escapeHtml(ev.description)}
                            </div>
                        ` : '';

                        let eventContent = '';
                        if (isTravelEvent) {
                            const currentMode = ev.travelMode || (
                                (ev.title && ev.title.includes('🚗')) ? 'driving' :
                                (ev.title && (ev.title.includes('🚆') || /bahn|zug|s-bahn|s\d+/i.test(ev.title))) ? 'transit' :
                                (ev.title && (ev.title.includes('🚲') || /rad|fahrrad/i.test(ev.title))) ? 'bicycling' :
                                (ev.title && (ev.title.includes('🚶') || /fuß|fuss/i.test(ev.title))) ? 'walking' : 'transit'
                            );

                            let originLoc = (ev.travelOriginLocation || '').trim();
                            let destLoc = (ev.location || '').trim();
                            if (!destLoc && ev.title) {
                                const clean = ev.title.replace(/^[🚗🚆🚲🚶✈️🗺️]\s*/, '').replace(/^(fahrt|anreise|hinfahrt|rückfahrt|rueckfahrt|reise|wegzeit|wegezeit)\s+(zu|nach|zum|zur)?\s*/i, '').trim();
                                if (clean) destLoc = clean;
                            }
                            if (!originLoc) originLoc = 'Start';
                            if (!destLoc) destLoc = 'Ziel';

                            const gMapsUrl = (originLoc !== 'Start' || destLoc !== 'Ziel')
                                ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originLoc === 'Start' ? '' : originLoc)}&destination=${encodeURIComponent(destLoc === 'Ziel' ? '' : destLoc)}&travelmode=${currentMode}`
                                : '#';

                            const switcherHtml = `
                                <div class="travel-mode-switch-inline" onclick="event.stopPropagation()" style="display: inline-flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); margin-left: auto;">
                                    <button type="button" class="mode-switch-btn ${currentMode === 'driving' ? 'active' : ''}" onclick="switchTravelEventMode('${ev.id}', 'driving')" title="Auto (Google Maps)">${googleIcon('directions_car', '13px', 'fill: #ffffff;')}</button>
                                    <button type="button" class="mode-switch-btn ${currentMode === 'transit' ? 'active' : ''}" onclick="switchTravelEventMode('${ev.id}', 'transit')" title="Bahn / ÖPNV (Google Maps)">${googleIcon('train', '13px', 'fill: #ffffff;')}</button>
                                    <button type="button" class="mode-switch-btn ${currentMode === 'bicycling' ? 'active' : ''}" onclick="switchTravelEventMode('${ev.id}', 'bicycling')" title="Fahrrad (Google Maps)">${googleIcon('directions_bike', '13px', 'fill: #ffffff;')}</button>
                                    <button type="button" class="mode-switch-btn ${currentMode === 'walking' ? 'active' : ''}" onclick="switchTravelEventMode('${ev.id}', 'walking')" title="Zu Fuß (Google Maps)">${googleIcon('directions_walk', '13px', 'fill: #ffffff;')}</button>
                                </div>
                            `;

                            let itineraryAccordion = '';
                            if (typeof window.renderTransitItineraryHtml === 'function') {
                                itineraryAccordion = window.renderTransitItineraryHtml(ev, originLoc, destLoc, ev.travelDurationMinutes || 0, gMapsUrl);
                            }

                            const timeBadge = (typeof window.getEventTimeBadge === 'function') ? window.getEventTimeBadge(ev) : startBadge;
                            const durationInfo = ev.travelDurationMinutes ? `<span style="font-size: 0.72rem; color: #a6e3a1; font-weight: 500; white-space: nowrap;">(${ev.travelDurationMinutes} Min.${ev.travelDistanceText ? ' • ' + escapeHtml(ev.travelDistanceText) : ''})</span>` : '';

                            eventContent = `
                                <div class="arbeitstisch-item ${evIsPast ? 'is-past' : ''} ${evIsCurrent ? 'is-current' : ''}" 
                                     onclick="openEventDetailModal('${ev.id}', '${escapeHtml(ev.title || 'Termin')}', '${ev.time || ev.start || ''}', '${ev.endTime || ev.end || ''}', ${!!ev.isAllDay}, '${ev.fuzzyTime || ''}', '${escapeHtml(ev.description || '')}', ${!!isRec}, '${occDateStr}', [], ${!!ev.isCancelled}, '${escapeHtml(ev.cancellationReason || '')}', '${escapeHtml(ev.location || '')}')" 
                                     style="cursor: pointer; ${birthdayStyle} ${rescheduleBorder} ${travelStyle}">
                                    <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; width: 100%;">
                                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0;">
                                                ${timeBadge}
                                                <span class="travel-route-title" style="font-size: 0.82rem; font-weight: 600; color: #cdd6f4; display: inline-flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis;">
                                                    <span>${escapeHtml(originLoc)}</span>
                                                    <span style="color: #89b4fa; font-weight: bold;">→</span>
                                                    <strong style="color: #ffffff;">${escapeHtml(destLoc)}</strong>
                                                </span>
                                                ${durationInfo}
                                                ${repeatBadge}
                                                ${rescheduleBadge}
                                                ${originalTimeText}
                                                ${reasonHtml}
                                                ${inPlanningBadge}
                                            </div>
                                            ${switcherHtml}
                                        </div>
                                        ${itineraryAccordion}
                                    </div>
                                </div>
                            `;
                        } else {
                            eventContent = `
                                <div class="arbeitstisch-item ${evIsPast ? 'is-past' : ''} ${evIsCurrent ? 'is-current' : ''}" 
                                     onclick="openEventDetailModal('${ev.id}', '${escapeHtml(ev.title || 'Termin')}', '${ev.time || ev.start || ''}', '${ev.endTime || ev.end || ''}', ${!!ev.isAllDay}, '${ev.fuzzyTime || ''}', '${escapeHtml(ev.description || '')}', ${!!isRec}, '${occDateStr}', ${escapeHtml(JSON.stringify(ev.persons || []))}, ${!!ev.isCancelled}, '${escapeHtml(ev.cancellationReason || '')}', '${escapeHtml(ev.location || '')}', ${ev.locationId || (ev.locationObj ? ev.locationObj.id : 'null')}, ${escapeHtml(JSON.stringify(ev.locationObj || null))}, ${escapeHtml(JSON.stringify(ev.media || []))})" 
                                     style="cursor: pointer; ${birthdayStyle} ${rescheduleBorder}">
                                    <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; width: 100%;">
                                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                                ${startBadge}
                                                <strong class="arbeitstisch-item-title" style="font-size: 0.82rem; ${titleCancelStyle}">${escTitle}</strong>
                                                ${repeatBadge}
                                                ${rescheduleBadge}
                                                ${originalTimeText}
                                                ${reasonHtml}
                                                ${inPlanningBadge}
                                            </div>
                                        </div>
                                        ${eventMetaChipsHtml ? `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 4px;">${eventMetaChipsHtml}</div>` : ''}
                                        ${descText}
                                        ${endBadge ? `
                                            <div class="timeline-event-end-row">
                                                ${endBadge}
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }

                        const extraData = `data-event-id="${ev.id}" data-event-title="${escapeHtml(ev.title)}" data-event-start="${ev.time || ev.start || ''}" data-event-end="${ev.endTime || ev.end || ''}" data-event-allday="${ev.isAllDay ? 'true' : 'false'}" data-event-desc="${escapeHtml(ev.description || '')}" data-event-recurring="${ev.recurring ? 'true' : 'false'}" data-event-occ="${occDateStr}" data-event-location="${escapeHtml(ev.location || '')}" data-event-location-id="${ev.locationId || (ev.locationObj ? ev.locationObj.id : '')}" data-event-location-obj="${escapeHtml(JSON.stringify(ev.locationObj || null))}" data-event-persons="${escapeHtml(JSON.stringify(ev.persons || []))}" data-event-media="${escapeHtml(JSON.stringify(ev.media || []))}"`;

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

            // Vereinfachte Tagebucheinträge (werden nur angezeigt, wenn Einträge vorhanden sind)
            if (diaryEntries.length > 0) {
                html += `<div class="calendar-diary-entries-simple" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">`;
                diaryEntries.forEach(e => {
                    const escTitle = escapeHtml(e.title || "Tagebucheintrag");
                    const diaryContentHtml = `
                        <div class="diary-entry-card" onclick="openDiaryModalById(${e.id}, '${dateStr}')" style="background: rgba(250, 179, 135, 0.06); border: 1px solid rgba(250, 179, 135, 0.22); padding: 10px 14px; border-radius: 10px; cursor: pointer; transition: background 0.15s, border-color 0.15s; width: 100%; box-sizing: border-box;" title="Klicken zum Bearbeiten">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                <span style="font-size: 0.95rem;">📝</span>
                                <strong style="color: #fab387; font-size: 0.84rem;">${escTitle}</strong>
                            </div>
                            <div style="white-space: pre-wrap; word-break: break-word; line-height: 1.4; font-size: 0.8rem; opacity: 0.9; color: var(--text);">${escapeHtml(e.content)}</div>
                        </div>
                    `;
                    const extraData = `data-journal-id="${e.id}" data-journal-title="${escTitle}" data-journal-date="${dateStr}"`;
                    html += typeof renderSwipeLinkWrapper === 'function' ? renderSwipeLinkWrapper(diaryContentHtml, escTitle, 'journal', e.id, '', '', '', extraData) : diaryContentHtml;
                });
                html += `</div>`;
            }

            // Leerer Zustand nur wenn weder Termine, noch Aufgaben, noch Tagebucheinträge vorhanden sind
            if (rawEvents.length === 0 && overdueTasks.length === 0 && diaryEntries.length === 0) {
                html += `
                    <div class="calendar-empty-day" style="margin-top: 10px; padding: 22px 15px; text-align: center; color: rgba(255, 255, 255, 0.6); font-size: 0.82rem;">
                        ✨ Keine Termine oder Aufgaben für diesen Tag vorhanden.
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
            try {
                const isRec = isRecurring === true || isRecurring === 'true';
                const targetDate = occurrenceDate || window.currentCalendarDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : new Date().toISOString().split('T')[0]);
                let deleteType = 'single';
                
                if (isRec) {
                    const choice = confirm("Dies ist ein Serientermin.\n\nKlicke 'OK' um NUR DIESEN EINEN Termin zu löschen.\nKlicke 'Abbrechen', um die GESAMTE SERIE zu löschen (oder ESC zum Abbrechen).");
                    deleteType = choice ? 'occurrence' : 'series';
                } else {
                    if (!confirm("Möchtest du diesen Termin wirklich löschen?")) return;
                }

                const args = {
                    eventId: String(eventId),
                    datum: targetDate,
                    nurDiesesVorkommen: deleteType === 'occurrence'
                };
                const res = await callTool('loesche_termin', args);
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
            } catch (e) {
                console.error("Fehler beim Löschen des Termins:", e);
                alert("Fehler beim Löschen des Termins: " + (e.message || e));
            }
        }
        window.deleteCalendarEvent = deleteCalendarEvent;
