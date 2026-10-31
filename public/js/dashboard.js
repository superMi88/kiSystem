

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

            // Sort ascending by time
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

            // 1 hour morning routine buffer -> wake up time
            // 8 hours sleep -> bedtime 9 hours before appointment
            const totalMinutesTomorrow = startH * 60 + startM;
            const wakeMinutes = totalMinutesTomorrow - 60;
            const bedMinutes = totalMinutesTomorrow - (9 * 60);

            const wakeH = Math.floor((wakeMinutes + 1440) % 1440 / 60);
            const wakeM = Math.floor((wakeMinutes + 1440) % 1440 % 60);
            const wakeUpStr = `${String(wakeH).padStart(2, '0')}:${String(wakeM).padStart(2, '0')} Uhr`;

            const bedH = Math.floor((bedMinutes + 1440) % 1440 / 60);
            const bedM = Math.floor((bedMinutes + 1440) % 1440 % 60);
            const bedtimeStr = `${String(bedH).padStart(2, '0')}:${String(bedM).padStart(2, '0')} Uhr`;

            return {
                hasEvent: true,
                earliestEvent: first,
                timeStr: timeStr,
                bedtimeStr: bedtimeStr,
                wakeUpStr: wakeUpStr,
                title: first.title
            };
        }



        function renderArbeitstischWidget(widgets, container) {
            const todayStr = getLocalDateString();
            const todayDateObj = new Date();

            // 1. Calendar: Today's Appointments & Tasks (Matches Timeline Day for Today 1:1)
            const calendarWidget = widgets.find(w => w.type === 'calendar_overview');
            let todayEvents = [];
            let todayOverdueTasks = [];
            let todayCompletedTasks = [];
            let todayDiaryEntries = [];
            let calTasks = [];
            let tomorrowEvents = [];

            if (calendarWidget && calendarWidget.data) {
                const days = calendarWidget.data.timeline || calendarWidget.data.days || [];
                const todayDay = days.find(d => d.date === todayStr);
                const globalOverdue = calendarWidget.data.overdueTasks || window.timelineOverdueTasks || [];

                if (todayDay) {
                    todayOverdueTasks = (todayDay.overdueTasks && todayDay.overdueTasks.length > 0) ? todayDay.overdueTasks : globalOverdue;
                    todayEvents = todayDay.events || [];
                    todayCompletedTasks = todayDay.completedTasks || [];
                    todayDiaryEntries = todayDay.diaryEntries || [];
                } else if (globalOverdue.length > 0) {
                    todayOverdueTasks = globalOverdue;
                }

                // Sicherstellen, dass an diesem Tag erledigte ausstehende Aufgaben in todayOverdueTasks enthalten sind
                if (todayCompletedTasks.length > 0) {
                    todayCompletedTasks.forEach(t => {
                        const rawId = String(t.id).replace('task-', '');
                        const exists = todayOverdueTasks.some(ot => String(ot.id).replace('task-', '') === rawId);
                        if (!exists && t.due && new Date(t.due) < new Date(todayStr + 'T00:00:00')) {
                            todayOverdueTasks.push({
                                ...t,
                                id: rawId,
                                isTask: true,
                                isOverdue: true,
                                completed: true,
                                status: 'done'
                            });
                        }
                    });
                }

                if (todayOverdueTasks.length > 0) {
                    todayOverdueTasks.sort((a, b) => {
                        const aDone = (a.completed || a.status === 'done') ? 1 : 0;
                        const bDone = (b.completed || b.status === 'done') ? 1 : 0;
                        if (aDone !== bDone) return aDone - bDone;
                        return new Date(a.due || 0).getTime() - new Date(b.due || 0).getTime();
                    });
                }

                // Look for tomorrow's events for bedtime advice
                const tomorrowDateObj = new Date(todayDateObj);
                tomorrowDateObj.setDate(tomorrowDateObj.getDate() + 1);
                const tomorrowStr = getLocalDateString(tomorrowDateObj);
                const tomorrowDay = days.find(d => d.date === tomorrowStr);
                if (tomorrowDay && tomorrowDay.events) {
                    tomorrowEvents = tomorrowDay.events;
                }

                // Collect tasks for Arbeitstisch Card 3 (Aufgaben)
                todayEvents.filter(e => e.isTask).forEach(t => calTasks.push(t));
                todayOverdueTasks.forEach(t => calTasks.push(t));
            } else if (window.timelineOverdueTasks && window.timelineOverdueTasks.length > 0) {
                todayOverdueTasks = window.timelineOverdueTasks;
                todayOverdueTasks.forEach(t => calTasks.push(t));
            }

            // 2. Projects & Starred Items
            const projectWidget = widgets.find(w => (w.pluginName === 'Projects' || (w.data && w.data.widgetType === 'projects_list')));
            let allProjects = [];
            let starredProjects = [];
            let allProjectTasks = [];
            if (projectWidget && projectWidget.data) {
                allProjects = projectWidget.data.projects || [];
                starredProjects = allProjects.filter(p => p.isStarred);
                (projectWidget.data.unassignedTasks || []).forEach(t => allProjectTasks.push({ ...t, projectName: 'Allgemein' }));
                allProjects.forEach(p => {
                    if (p.tasks) {
                        p.tasks.forEach(t => allProjectTasks.push({ ...t, projectName: p.name, projectId: p.id }));
                    }
                });
            }

            // Merge & deduplicate all tasks for Arbeitstisch
            const taskMap = new Map();
            allProjectTasks.forEach(t => {
                const rawId = String(t.id).replace('task-', '');
                const isDone = !!t.completed || t.status === 'done';
                if (!isDone) {
                    taskMap.set(rawId, { ...t, id: rawId });
                }
            });
            calTasks.forEach(t => {
                const rawId = String(t.id).replace('task-', '');
                const existing = taskMap.get(rawId);
                if (!existing) {
                    taskMap.set(rawId, { ...t, id: rawId });
                } else {
                    taskMap.set(rawId, { ...t, ...existing, id: rawId, isStarred: existing.isStarred ?? t.isStarred });
                }
            });

            // Filter pinned tasks for Heute (pinned projects are removed from today view per user request)
            const allActiveTasks = Array.from(taskMap.values());
            const pinnedTasks = allActiveTasks.filter(t => t.isStarred);

            // 3. Mail: E-Mails & Analysen für Agent-Briefing
            const mailWidget = widgets.find(w => w.pluginName === 'Mail' || (w.data && w.data.emails));
            let unreadMails = [];
            let allMails = [];
            let analyzedMails = [];
            if (mailWidget && mailWidget.data) {
                allMails = mailWidget.data.emails || [];
                unreadMails = allMails.filter(m => !m.isRead);
                analyzedMails = allMails.filter(m => m.agentRunId || m.agentRunSummary);
            }

            // 4. Agent-Benachrichtigungen / Handlungsbedarf
            const notifWidget = widgets.find(w => w.pluginName === 'Notifications' || w.type === 'agent_notifications');
            const agentNotifications = (notifWidget && notifWidget.data && notifWidget.data.notifications) ? notifWidget.data.notifications : [];
            const activeNotifs = agentNotifications.filter(n => !n.isDismissed);
            const filteredMails = analyzedMails.filter(m => !activeNotifs.some(n => String(n.sourceId) === String(m.id)));
            const currentArbeitstischNotifTab = window.currentArbeitstischNotifTab || 'relevant';

            // 4. Timers
            const timerWidget = widgets.find(w => w.type === 'timer_list');
            let activeTimers = [];
            if (timerWidget && timerWidget.data) {
                activeTimers = timerWidget.data.timers || [];
            }

            // --- HTML RENDERING ---
            let html = `
                <div class="arbeitstisch-dashboard">
                    <div class="arbeitstisch-grid">
            `;

            // 1. Heutige Termine (Timeline Parity: Overdue Tasks, Today Events & Tasks, Diary, Completed)
            html += `
                <div class="arbeitstisch-card today-timeline-card">
                    <div class="arbeitstisch-card-body">
            `;

            // 1a. Ausstehende Aufgaben (Overdue)
            if (todayOverdueTasks.length > 0) {
                const uncompletedOverdue = todayOverdueTasks.filter(t => !t.completed && t.status !== 'done');
                const completedOverdue = todayOverdueTasks.filter(t => t.completed || t.status === 'done');
                const badgeText = completedOverdue.length > 0
                    ? `${uncompletedOverdue.length} offen, ${completedOverdue.length} erledigt`
                    : `${todayOverdueTasks.length}`;

                html += `
                    <div style="display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px;">
                        <div style="font-size: 0.7rem; font-weight: 700; color: var(--off); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: space-between;">
                            <span style="display: inline-flex; align-items: center; gap: 4px;">${googleIcon('verified', '13px', 'fill: var(--off);')} Ausstehende Aufgaben (${badgeText})</span>
                        </div>
                `;
                todayOverdueTasks.forEach(t => {
                    const rawTaskId = String(t.id).replace('task-', '');
                    const escTitle = escapeHtml(t.title || 'Aufgabe');
                    const escListTitle = escapeHtml(t.listTitle || 'Standard');
                    const recurrenceVal = t.recurrence || 'none';
                    const isRecurring = recurrenceVal && recurrenceVal !== 'none';
                    const repeatBadge = isRecurring ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrend: ${recurrenceVal}">🔄</span>` : '';
                    const isDone = !!t.completed || t.status === 'done';
                    
                    let dueText = '';
                    if (t.due) {
                        const dateObj = new Date(t.due);
                        const dueStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : t.due;
                        dueText = isDone ? `Erledigt (fällig war ${dueStr})` : `Ausstehend (fällig seit ${dueStr})`;
                    } else {
                        dueText = isDone ? 'Erledigt' : 'Ausstehend (ohne Datum)';
                    }

                    const cardBg = isDone ? 'rgba(166, 227, 161, 0.05)' : 'rgba(243, 139, 168, 0.08)';
                    const cardBorder = isDone ? 'rgba(166, 227, 161, 0.25)' : 'rgba(243, 139, 168, 0.25)';
                    const cardBorderLeft = isDone ? '#a6e3a1' : 'var(--off)';
                    const titleColor = isDone ? '#a6adc8' : '#ffffff';
                    const textDecor = isDone ? 'line-through' : 'none';
                    const opacityVal = isDone ? '0.75' : '1';
                    const badgeIcon = isDone ? googleIcon('check', '12px', 'fill: #a6e3a1;') : googleIcon('verified', '12px', 'fill: var(--off);');
                    const badgeColor = isDone ? '#a6e3a1' : 'var(--off)';

                    const overdueInner = `
                        <div class="arbeitstisch-item" style="border-left: 3.5px solid ${cardBorderLeft}; background: ${cardBg}; border-color: ${cardBorder}; opacity: ${opacityVal};">
                            <button type="button" 
                                    class="task-circle-check ${isDone ? 'is-done' : ''} ${!isDone ? 'is-expired' : ''}" 
                                    onclick="event.stopPropagation(); toggleTaskCompletion('${rawTaskId}', '${escListTitle}', ${!isDone}, this)"
                                    style="margin-top: 2px; flex-shrink: 0;"
                                    title="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}"
                                    aria-label="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}">
                                ${isDone ? googleIcon('check', '12px', 'fill: #11111b;') : ''}
                            </button>
                            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; cursor: pointer;" onclick="handleEntityClick(event, 'task', '${rawTaskId}')">
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                    <strong style="font-size: 0.82rem; color: ${titleColor}; line-height: 1.3; word-break: break-word; text-decoration: ${textDecor};">${escTitle}</strong>
                                    ${repeatBadge}
                                </div>
                                <div style="font-size: 0.7rem; color: ${badgeColor}; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                                    <span>${badgeIcon} ${escapeHtml(dueText)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                    html += renderSwipeLinkWrapper(overdueInner, t.title || 'Aufgabe', 'task', rawTaskId);
                });
                html += `</div>`;
            }

            // 1b. Termine & heutige Aufgaben als Vertikale Timeline
            const bedtimeAdvice = getBedtimeRecommendation(tomorrowEvents);

            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: ${todayOverdueTasks.length > 0 ? '10px' : '2px'}; margin-bottom: 6px;">
                    <div style="font-size: 0.72rem; font-weight: 700; color: rgba(255, 255, 255, 0.75); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px; cursor: pointer;" onclick="focusWidget('calendar'); jumpToTimelineDate('today');" title="Zu Heute im Kalender springen">
                        <span style="display: inline-flex; align-items: center; gap: 5px;">${googleIcon('calendar_add_on', '14px', 'fill: var(--accent);')} Termine & Aufgaben heute</span>
                    </div>
                    <button type="button" onclick="focusWidget('calendar'); jumpToTimelineDate('today');" class="arbeitstisch-card-link" title="Zu Heute im Kalender">Kalender ➔</button>
                </div>
            `;

            if (todayEvents.length > 0) {
                
                // Chronologisch aufsteigend sortieren
                const sortedTodayEvents = [...todayEvents].sort((a, b) => {
                    const ta = new Date(a.time || a.start || 0).getTime();
                    const tb = new Date(b.time || b.start || 0).getTime();
                    return ta - tb;
                });

                const nowMs = Date.now();
                let foundNext = false;
                let prevEventEndMs = null;
                let prevEventLocation = null;
                let prevEventTitle = null;

                html += `<div class="today-vertical-timeline">`;
                
                sortedTodayEvents.forEach(ev => {
                    let isPast = false;
                    let isCurrent = false;
                    let isFuture = false;
                    let isNext = false;
                    let progressPercent = 0;
                    let remainingMinutes = 0;
                    let elapsedMinutes = 0;
                    let totalMinutes = 0;

                    let currStartMs = null;
                    let currEndMs = null;

                    let isExpiredTask = false;

                    if (ev.isTask) {
                        if (ev.completed) {
                            isPast = true;
                        } else if (ev.time) {
                            currStartMs = new Date(ev.time).getTime();
                            currEndMs = currStartMs + 30 * 60 * 1000;
                            if (nowMs >= currStartMs) {
                                isExpiredTask = true;
                            } else {
                                isFuture = true;
                                if (!foundNext) { isNext = true; foundNext = true; }
                            }
                        } else {
                            isFuture = true;
                            if (!foundNext) { isNext = true; foundNext = true; }
                        }
                    } else {
                        // Kalender-Termin
                        if (ev.isAllDay) {
                            isCurrent = true;
                        } else if (ev.time || ev.start) {
                            currStartMs = new Date(ev.time || ev.start).getTime();
                            if (ev.endTime || ev.end) {
                                currEndMs = new Date(ev.endTime || ev.end).getTime();
                            } else {
                                currEndMs = currStartMs + 60 * 60 * 1000;
                            }

                            if (nowMs >= currEndMs) {
                                isPast = true;
                            } else if (nowMs >= currStartMs && nowMs < currEndMs) {
                                if (ev.isCancelled) {
                                    isPast = false;
                                    isCurrent = false;
                                } else {
                                    isCurrent = true;
                                    totalMinutes = Math.max(1, Math.round((currEndMs - currStartMs) / 60000));
                                    elapsedMinutes = Math.max(0, Math.round((nowMs - currStartMs) / 60000));
                                    remainingMinutes = Math.max(0, Math.round((currEndMs - nowMs) / 60000));
                                    progressPercent = Math.min(100, Math.max(5, Math.round((elapsedMinutes / totalMinutes) * 100)));
                                }
                            } else {
                                isFuture = true;
                                if (!foundNext && !ev.isCancelled) {
                                    isNext = true;
                                    foundNext = true;
                                }
                            }
                        }
                    }

                    // --- Pausen & Zeitüberschneidungen zwischen Terminen ---
                    if (prevEventEndMs !== null && currStartMs !== null) {
                        const gapMinutes = Math.round((currStartMs - prevEventEndMs) / 60000);

                        if (gapMinutes < 0) {
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
                        } else if (gapMinutes >= 3) {
                            const isUpcomingTravel = !ev.isTask && (
                                ev.isTravelTime || !!ev.travelMode ||
                                /\b(fahrt|wegzeit|wegezeit|anreise|abreise|hinfahrt|rückfahrt|rueckfahrt|reise|zugfahrt|flug|heimweg)\b/i.test((ev.title || '').trim()) ||
                                (ev.title && (ev.title.includes('🚗') || ev.title.includes('🚆') || ev.title.includes('🚲') || ev.title.includes('🚶') || ev.title.includes('✈️') || ev.title.includes('🗺️')))
                            );

                            const pStart = new Date(prevEventEndMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const pEnd = new Date(currStartMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                            const isPPast = nowMs >= currStartMs;
                            const isPCurr = nowMs >= prevEventEndMs && nowMs < currStartMs;
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
                                            <strong style="color: rgba(255,255,255,0.9); font-size: 0.78rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
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
                                            <div class="timeline-step-line timeline-current-line" title="${gapTypeLabel} läuft: ${pElapsed} von ${pTotal} Min (${pProgress}%) – noch ${pRemaining} Min">
                                                <div class="timeline-line-progress-fill pause-progress-fill" style="height: ${pProgress}%;"></div>
                                            </div>
                                        ` : `
                                            <div class="timeline-step-line"></div>
                                        `}
                                    </div>
                                    <div class="timeline-step-body">
                                        ${renderSwipeLinkWrapper(pauseItemHtml, pauseLabel, 'pause', pauseId, 'pause-swipe-item', 'background: transparent; border: none; box-shadow: none; padding: 0;', 'margin-bottom: 0; border-radius: 0; background: transparent;')}
                                    </div>
                                </div>
                            `;
                        }
                    }

                    // Merke Endzeit und Ort für nächsten Zwischenschritt
                    if (currEndMs !== null) {
                        prevEventEndMs = currEndMs;
                        if (!ev.isTask && ev.location && ev.location.trim()) {
                            prevEventLocation = ev.location.trim();
                        }
                        prevEventTitle = ev.title;
                    }

                    let stepClass = 'timeline-step';
                    let dotHtml = '';
                    let statusBadgeHtml = '';

                    if (isExpiredTask) {
                        stepClass += ' is-expired-task';
                        dotHtml = `<div class="timeline-step-dot dot-expired" title="Aufgabe abgelaufen (fällig)">${googleIcon('verified', '11px', 'fill: var(--off);')}</div>`;
                        statusBadgeHtml = '';
                    } else if (isPast) {
                        stepClass += ' is-past';
                        dotHtml = `<div class="timeline-step-dot dot-past" title="Erledigt">${googleIcon('check', '11px', 'fill: #a6e3a1;')}</div>`;
                        statusBadgeHtml = '';
                    } else if (isCurrent) {
                        stepClass += ' is-current';
                        const progressTitle = totalMinutes > 0 ? `Läuft gerade: ${elapsedMinutes} von ${totalMinutes} Min (${progressPercent}%) – noch ${remainingMinutes} Min` : 'Läuft gerade';
                        dotHtml = `<div class="timeline-step-dot dot-current" title="${progressTitle}"><div class="dot-pulse-core"></div></div>`;
                        statusBadgeHtml = (totalMinutes > 0)
                            ? `<span class="timeline-active-badge"><span class="active-pulse-dot"></span> Läuft gerade (${progressPercent}% • noch ${remainingMinutes} Min.)</span>`
                            : `<span class="timeline-active-badge"><span class="active-pulse-dot"></span> Läuft gerade</span>`;
                    } else {
                        stepClass += ' is-future';
                        if (isNext) {
                            stepClass += ' is-next';
                            dotHtml = `<div class="timeline-step-dot dot-future" title="Als Nächstes"></div>`;
                            statusBadgeHtml = `<span class="timeline-next-badge">Als Nächstes</span>`;
                        } else {
                            dotHtml = `<div class="timeline-step-dot dot-future" title="Geplant"></div>`;
                        }
                    }
                    const isTravelEvent = !ev.isTask && (
                        ev.isTravelTime || !!ev.travelMode ||
                        /\b(fahrt|wegzeit|wegezeit|anreise|abreise|hinfahrt|rückfahrt|rueckfahrt|reise|zugfahrt|flug|heimweg)\b/i.test((ev.title || '').trim()) ||
                        (ev.title && (ev.title.includes('🚗') || ev.title.includes('🚆') || ev.title.includes('🚲') || ev.title.includes('🚶') || ev.title.includes('✈️') || ev.title.includes('🗺️')))
                    );
                    if (!ev.isTask) {
                        if (ev.isBirthday) stepClass += ' is-birthday';
                        if (ev.originalStart) stepClass += ' is-rescheduled';
                        if (isTravelEvent) stepClass += ' is-travel';
                        if (ev.isCancelled) {
                            stepClass += ' is-cancelled';
                            statusBadgeHtml = `<span class="timeline-cancelled-badge">🚫 Fällt aus</span>`;
                        }
                    }

                    // Vertikaler Fortschrittsbalken für laufenden Termin (von oben nach unten)
                    let lineHtml = '';
                    if (isCurrent && totalMinutes > 0) {
                        lineHtml = `
                            <div class="timeline-step-line timeline-current-line" title="Termin läuft: ${elapsedMinutes} von ${totalMinutes} Min (${progressPercent}%) – noch ${remainingMinutes} Min">
                                <div class="timeline-line-progress-fill" style="height: ${progressPercent}%;"></div>
                            </div>
                        `;
                    } else if (isCurrent) {
                        lineHtml = `
                            <div class="timeline-step-line timeline-current-line" title="Läuft gerade">
                                <div class="timeline-line-progress-fill" style="height: 100%;"></div>
                            </div>
                        `;
                    } else if (ev.isCancelled) {
                        lineHtml = `<div class="timeline-step-line timeline-cancelled-line" title="Termin fällt aus"></div>`;
                    } else {
                        lineHtml = `<div class="timeline-step-line"></div>`;
                    }

                    if (ev.isTask) {
                        const rawTaskId = String(ev.id).replace('task-', '');
                        const escTitle = escapeHtml(ev.title || 'Aufgabe');
                        const escListTitle = escapeHtml(ev.listTitle || 'Standard');
                        const isRecurring = ev.recurring || (ev.recurrence && ev.recurrence !== 'none');
                        const repeatBadge = isRecurring ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrend: ${ev.recurrence}">🔄</span>` : '';
                        const isDone = !!ev.completed || ev.status === 'done';
                        const textStyle = isDone ? 'text-decoration: line-through; opacity: 0.55;' : '';

                        let taskTimeBadge = '';
                        if (ev.time) {
                            const d = new Date(ev.time);
                            if (!isNaN(d.getTime())) {
                                if (d.getHours() !== 0 || d.getMinutes() !== 0) {
                                    let timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                    if (ev.endTime && !isNaN(new Date(ev.endTime).getTime())) {
                                        const endD = new Date(ev.endTime);
                                        if (endD.getTime() > d.getTime()) {
                                            timeStr = `${timeStr} – ${endD.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
                                        }
                                    }
                                    if (isExpiredTask && !isDone) {
                                        taskTimeBadge = `<span class="timeline-time-badge conflict-time-badge">${timeStr} Uhr</span>`;
                                    } else {
                                        taskTimeBadge = `<span class="timeline-time-badge task-time-badge">${timeStr} Uhr</span>`;
                                    }
                                } else {
                                    taskTimeBadge = `<span class="timeline-time-badge task-time-badge" style="display: inline-flex; align-items: center; gap: 3px;">${googleIcon('calendar_add_on', '11px')} Heute</span>`;
                                }
                            }
                        }

                        let personsHtml = '';
                        if (ev.persons && ev.persons.length > 0) {
                            ev.persons.forEach(p => {
                                personsHtml += `
                                    <span onclick="event.stopPropagation(); openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 1px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;">
                                      ${googleIcon('person', '11px')} ${escapeHtml(p.name)}
                                    </span>
                                `;
                            });
                        }

                        const descText = ev.description ? `<div style="font-size: 0.7rem; opacity: 0.6; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(ev.description)}</div>` : '';
                        const taskExpiredItemStyle = (isExpiredTask && !isDone) ? 'border: 1.5px solid var(--off) !important; background: rgba(243, 139, 168, 0.06) !important; box-shadow: 0 0 10px rgba(243, 139, 168, 0.15) !important;' : '';
                        const taskCompletedItemStyle = isDone ? 'background: rgba(166, 227, 161, 0.04); border-color: rgba(166, 227, 161, 0.2);' : '';

                        const taskItemHtml = `
                            <div class="arbeitstisch-item" style="${taskExpiredItemStyle} ${taskCompletedItemStyle}">
                                <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; cursor: pointer;" onclick="handleEntityClick(event, 'task', '${rawTaskId}')">
                                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                        ${taskTimeBadge}
                                        <span style="font-size: 0.82rem; color: #ffffff; line-height: 1.3; ${textStyle}"><strong style="color: ${isExpiredTask && !isDone ? 'var(--off)' : (isDone ? '#a6e3a1' : 'var(--accent)')};">[Aufgabe]</strong> ${escTitle}</span>
                                        ${repeatBadge}
                                        ${statusBadgeHtml}
                                        ${ev.isPlanned ? `<span style="font-size: 0.65rem; color: #f9e2af; font-weight: bold; background: rgba(249, 226, 175, 0.15); border: 1px solid rgba(249, 226, 175, 0.3); padding: 1px 5px; border-radius: 4px;">🟡 In Planung</span>` : ''}
                                    </div>
                                    ${personsHtml ? `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 2px;">${personsHtml}</div>` : ''}
                                    ${descText}
                                </div>
                            </div>
                        `;

                        const taskDotHtml = `
                            <button type="button" 
                                    class="timeline-step-dot dot-task-check ${isDone ? 'is-done' : ''} ${isExpiredTask && !isDone ? 'is-expired' : ''}" 
                                    onclick="event.stopPropagation(); toggleTaskCompletion('${rawTaskId}', '${escListTitle}', ${!isDone}, this)" 
                                    title="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}"
                                    aria-label="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}">
                                ${isDone ? googleIcon('check', '12px', 'fill: #11111b;') : ''}
                            </button>
                        `;

                        html += `
                            <div class="${stepClass} is-task ${isDone ? 'is-past' : ''}">
                                <div class="timeline-step-indicator">
                                    ${taskDotHtml}
                                </div>
                                <div class="timeline-step-body">
                                    ${renderSwipeLinkWrapper(taskItemHtml, ev.title || 'Aufgabe', 'task', rawTaskId)}
                                </div>
                            </div>
                        `;
                    } else {
                        const escTitle = escapeHtml(ev.title || 'Termin');
                        const isRec = ev.recurring || ev.isRecurring;
                        const repeatBadge = isRec ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrender Termin">🔄</span>` : '';
                        const rescheduleBadge = ev.originalStart ? ` <span style="background: rgba(249, 226, 175, 0.15); color: #f9e2af; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase;" title="Dieser Termin wurde verschoben">verschoben</span>` : '';
                        const originalTimeText = ev.originalStart ? ` <span style="font-size: 0.68rem; opacity: 0.65; color: #f9e2af;">(ursprünglich: ${new Date(ev.originalStart).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})} ${new Date(ev.originalStart).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})})</span>` : '';
                        const reasonHtml = (ev.isCancelled && ev.cancellationReason) ? ` <span style="font-size: 0.7rem; color: var(--off); text-decoration: none; font-style: italic;">(${escapeHtml(ev.cancellationReason)})</span>` : (ev.isCancelled ? ' <span style="font-size: 0.7rem; color: var(--off); text-decoration: none; font-style: italic;">(Ausgefallen)</span>' : '');
                        const titleCancelStyle = ev.isCancelled ? 'color: var(--off); text-decoration: line-through;' : '';
                        const rescheduleBorder = ev.originalStart ? 'border-left: 3px solid #f9e2af;' : '';
                        const birthdayStyle = ev.isBirthday ? 'background: rgba(245, 194, 231, 0.08); border-color: rgba(245, 194, 231, 0.25); border-left: 3px solid #f5c2e7;' : '';
                        const travelBadge = isTravelEvent ? `<span class="timeline-badge" style="background: rgba(166, 227, 161, 0.15); color: #a6e3a1; font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px;">🗺️ Wegezeit</span>` : '';
                        const travelStyle = isTravelEvent ? 'background: rgba(166, 227, 161, 0.05); border-left: 3px solid #a6e3a1;' : '';
                        const timeBadges = (typeof window.getEventTimeBadges === 'function')
                            ? window.getEventTimeBadges(ev, ev.occurrenceDate || (typeof getLocalDateString === 'function' ? getLocalDateString() : ''))
                            : { startBadge: getEventTimeBadge(ev), endBadge: '' };
                        const startBadge = timeBadges.startBadge;
                        const endBadge = timeBadges.endBadge;

                        let personsHtml = '';
                        if (ev.persons && ev.persons.length > 0) {
                            ev.persons.forEach(p => {
                                 personsHtml += `
                                    <span onclick="event.stopPropagation(); openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 1px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer;">
                                      ${googleIcon('person', '11px')} ${escapeHtml(p.name)}
                                    </span>
                                `;
                            });
                        }

                        const descText = ev.description ? `<div style="font-size: 0.7rem; opacity: 0.6; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(ev.description)}</div>` : '';

                        let eventItemHtml = '';
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

                            eventItemHtml = `
                                <div class="arbeitstisch-item" onclick="openEventDetailModal('${ev.id}', '${escapeHtml(ev.title || 'Termin')}', '${ev.time || ev.start || ''}', '${ev.endTime || ev.end || ''}', ${!!ev.isAllDay}, '${ev.fuzzyTime || ''}', '${escapeHtml(ev.description || '')}', ${!!isRec}, '${ev.occurrenceDate || ''}', [], ${!!ev.isCancelled}, '${escapeHtml(ev.cancellationReason || '')}', '${escapeHtml(ev.location || '')}')" style="${birthdayStyle} ${rescheduleBorder} ${travelStyle}">
                                    <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;">
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
                                                ${ev.isPlanned ? `<span style="font-size: 0.65rem; color: #f9e2af; font-weight: bold; background: rgba(249, 226, 175, 0.15); border: 1px solid rgba(249, 226, 175, 0.3); padding: 1px 5px; border-radius: 4px;">🟡 In Planung</span>` : ''}
                                            </div>
                                            ${switcherHtml}
                                        </div>
                                        ${itineraryAccordion}
                                    </div>
                                </div>
                            `;
                        } else {
                            eventItemHtml = `
                                <div class="arbeitstisch-item" onclick="openEventDetailModal('${ev.id}', '${escapeHtml(ev.title || 'Termin')}', '${ev.time || ev.start || ''}', '${ev.endTime || ev.end || ''}', ${!!ev.isAllDay}, '${ev.fuzzyTime || ''}', '${escapeHtml(ev.description || '')}', ${!!isRec}, '${ev.occurrenceDate || ''}', [], ${!!ev.isCancelled}, '${escapeHtml(ev.cancellationReason || '')}', '${escapeHtml(ev.location || '')}')" style="${birthdayStyle} ${rescheduleBorder}">
                                    <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            ${startBadge}
                                            <strong style="font-size: 0.82rem; color: #ffffff; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; ${titleCancelStyle}">${escTitle}</strong>
                                            ${repeatBadge}
                                            ${rescheduleBadge}
                                            ${originalTimeText}
                                            ${reasonHtml}
                                            ${ev.isPlanned ? `<span style="font-size: 0.65rem; color: #f9e2af; font-weight: bold; background: rgba(249, 226, 175, 0.15); border: 1px solid rgba(249, 226, 175, 0.3); padding: 1px 5px; border-radius: 4px;">🟡 In Planung</span>` : ''}
                                        </div>
                                        ${ev.location ? `
                                            <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 0.72rem; color: #89b4fa;">
                                                <span style="display: inline-flex; align-items: center;">${googleIcon('location_on', '13px', 'fill: #89b4fa;')}</span>
                                                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}" target="_blank" onclick="event.stopPropagation()" style="color: #89b4fa; text-decoration: underline;" title="Standort auf Google Maps anzeigen">
                                                    ${escapeHtml(ev.location)}
                                                </a>
                                            </div>
                                        ` : ''}
                                        ${personsHtml ? `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 2px;">${personsHtml}</div>` : ''}
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

                        html += `
                            <div class="${stepClass}">
                                <div class="timeline-step-indicator">
                                    ${lineHtml}
                                </div>
                                <div class="timeline-step-body">
                                    ${renderSwipeLinkWrapper(eventItemHtml, ev.title || 'Termin', 'event', ev.id)}
                                </div>
                            </div>
                        `;
                    }
                });

                // Abschluss der Timeline: Frühester Termin nächster Tag & Schlafempfehlung
                html += `
                    <div class="timeline-step timeline-step-sleep">
                        <div class="timeline-step-indicator">
                            <div class="timeline-step-line"></div>
                        </div>
                        <div class="timeline-step-body" style="padding-bottom: 0;">
                            <div class="timeline-sleep-card">
                                <div class="timeline-sleep-header">
                                    <div class="timeline-sleep-title">
                                        <span style="display: inline-flex; align-items: center; gap: 5px;">${googleIcon('bedtime', '14px', 'fill: #cba6f7;')} Nächster Tag & Schlafempfehlung</span>
                                    </div>
                                </div>
                                <div class="timeline-sleep-content-body">
                                    <div class="timeline-sleep-earliest-row">
                                        <span class="timeline-sleep-earliest-badge">Frühester Termin morgen</span>
                                        ${bedtimeAdvice.hasEvent 
                                            ? `<strong>${bedtimeAdvice.timeStr}</strong> – <span style="color: rgba(255,255,255,0.85);">${escapeHtml(bedtimeAdvice.title)}</span>` 
                                            : `<span style="opacity: 0.7;">Keine Termine für morgen</span>`}
                                    </div>
                                    <div class="timeline-sleep-advice-row">
                                        <span style="opacity: 0.85;">Schlafempfehlung:</span>
                                        <span>spätestens um <span class="timeline-bedtime-highlight">${bedtimeAdvice.bedtimeStr}</span> ins Bett gehen</span>
                                    </div>
                                    <div class="timeline-sleep-details">
                                        <span>🛌 Für 8 Std. erholsamen Schlaf (Wecker um ${bedtimeAdvice.wakeUpStr})</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                html += `</div>`;
            }

            // 1c. Tagebucheinträge heute (falls vorhanden)
            if (todayDiaryEntries.length > 0) {
                html += `
                    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
                        <div style="font-size: 0.7rem; font-weight: bold; color: #fab387; text-transform: uppercase; letter-spacing: 0.5px;">📝 Tagebucheinträge (${todayDiaryEntries.length})</div>
                `;
                todayDiaryEntries.forEach(e => {
                    const timeStr = new Date(e.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                    html += `
                        <div style="background: rgba(250, 179, 135, 0.06); border: 1px solid rgba(250, 179, 135, 0.2); padding: 6px 9px; border-radius: 6px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 2px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="color: #fab387; font-size: 0.78rem;">${escapeHtml(e.title || "Tagebucheintrag")}</strong>
                                <span style="font-size: 0.65rem; opacity: 0.5;">${timeStr} Uhr</span>
                            </div>
                            <div style="white-space: pre-wrap; word-break: break-word; line-height: 1.25; font-size: 0.72rem; opacity: 0.85;">${escapeHtml(e.content)}</div>
                        </div>
                    `;
                });
                html += `</div>`;
            }

            // 1e. Empty state (wenn keinerlei Einträge für heute)
            if (todayOverdueTasks.length === 0 && todayEvents.length === 0 && todayDiaryEntries.length === 0) {
                html += `
                    <div style="padding: 14px 10px; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 8px; text-align: center; color: rgba(255, 255, 255, 0.6); font-size: 0.78rem;">
                        <span>✨ Keine Termine oder fälligen Aufgaben für heute – Dein Kalender ist frei.</span>
                    </div>
                `;
            } else if (todayEvents.length === 0 && todayOverdueTasks.length > 0 && todayDiaryEntries.length === 0) {
                html += `
                    <div style="padding: 10px; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.08); border-radius: 8px; text-align: center; color: rgba(255, 255, 255, 0.5); font-size: 0.75rem;">
                        <span>✨ Keine weiteren Termine für heute</span>
                    </div>
                `;
            }
            if (todayEvents.length === 0) {
                html += `
                    <div style="margin-top: 8px;">
                        <div class="timeline-sleep-card">
                            <div class="timeline-sleep-header">
                                <div class="timeline-sleep-title">
                                    <span style="display: inline-flex; align-items: center; gap: 5px;">${googleIcon('bedtime', '14px', 'fill: #cba6f7;')} Nächster Tag & Schlafempfehlung</span>
                                </div>
                            </div>
                            <div class="timeline-sleep-content-body">
                                <div class="timeline-sleep-earliest-row">
                                    <span class="timeline-sleep-earliest-badge">Frühester Termin morgen</span>
                                    ${bedtimeAdvice.hasEvent 
                                        ? `<strong>${bedtimeAdvice.timeStr}</strong> – <span style="color: rgba(255,255,255,0.85);">${escapeHtml(bedtimeAdvice.title)}</span>` 
                                        : `<span style="opacity: 0.7;">Keine Termine für morgen</span>`}
                                </div>
                                <div class="timeline-sleep-advice-row">
                                    <span style="opacity: 0.85;">Schlafempfehlung:</span>
                                    <span>spätestens um <span class="timeline-bedtime-highlight">${bedtimeAdvice.bedtimeStr}</span> ins Bett gehen</span>
                                </div>
                                <div class="timeline-sleep-details">
                                    <span>🛌 Für 8 Std. erholsamen Schlaf (Wecker um ${bedtimeAdvice.wakeUpStr})</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            html += `
                    </div>
                </div>
            `;

            // 2. Bereich "Angepinnte Aufgaben" (nur wenn angepinnte Aufgaben vorhanden sind; angepinnte Projekte entfernt)
            if (pinnedTasks.length > 0) {
                html += `
                    <div class="arbeitstisch-card">
                        <div class="arbeitstisch-card-header">
                            <div class="arbeitstisch-card-title">
                                <span style="display: inline-flex; align-items: center;">${googleIcon('keep', '15px', 'fill: #fab387;')}</span>
                                <h4>Angepinnte Aufgaben</h4>
                                <span style="background: rgba(250, 179, 135, 0.2); color: #fab387; font-size: 0.72rem; padding: 2px 7px; border-radius: 12px; margin-left: 6px; font-weight: 600;">${pinnedTasks.length}</span>
                            </div>
                            <button type="button" onclick="focusWidget('tasks')" class="arbeitstisch-card-link" title="Zu allen Aufgaben">Aufgaben ➔</button>
                        </div>
                        <div class="arbeitstisch-card-body">
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                `;

                pinnedTasks.forEach(t => {
                    const rawId = String(t.id).replace('task-', '');
                    const escTitle = escapeHtml(t.title || 'Aufgabe');
                    const listTitle = escapeHtml(t.listTitle || t.tasklistId || 'Standard');
                    const dueObj = t.due ? new Date(t.due) : (t.time ? new Date(t.time) : null);
                    let dueBadge = '';
                    if (dueObj && !isNaN(dueObj.getTime())) {
                        const dueDateStr = dueObj.toISOString().split('T')[0];
                        if (dueDateStr < todayStr) {
                            dueBadge = `<span style="font-size: 0.65rem; color: var(--off); font-weight: bold; background: rgba(243, 139, 168, 0.15); padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">${googleIcon('verified', '10px', 'fill: var(--off);')} Überfällig</span>`;
                        } else if (dueDateStr === todayStr) {
                            dueBadge = `<span style="font-size: 0.65rem; color: var(--accent); font-weight: bold; background: rgba(137, 180, 250, 0.15); padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">${googleIcon('calendar_add_on', '11px')} Heute</span>`;
                        } else {
                            dueBadge = `<span style="font-size: 0.65rem; color: rgba(255,255,255,0.7); background: rgba(255, 255, 255, 0.08); padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">${googleIcon('calendar_add_on', '11px')} ${dueObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>`;
                        }
                    }

                    const projectTag = t.projectName ? `<span style="font-size: 0.68rem; color: rgba(255,255,255,0.65);">📁 ${escapeHtml(t.projectName)}</span>` : '';

                    const taskItemHtml = `
                        <div class="arbeitstisch-item pinned-task-item" style="border-left: 3.5px solid #fab387; padding: 8px 12px; background: rgba(250, 179, 135, 0.04); border: 1px solid rgba(250, 179, 135, 0.12); border-left: 3.5px solid #fab387; border-radius: 8px; transition: all 0.2s;">
                            <button type="button" 
                                    class="task-circle-check" 
                                    onclick="event.stopPropagation(); toggleTaskCompletion('${rawId}', '${listTitle}', true, this)" 
                                    style="margin-top: 2px; flex-shrink: 0;"
                                    title="Aufgabe abhaken"
                                    aria-label="Aufgabe abhaken">
                            </button>
                            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; cursor: pointer;" onclick="handleEntityClick(event, 'task', '${rawId}')">
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                    <span style="font-size: 0.65rem; background: rgba(250, 179, 135, 0.2); color: #fab387; padding: 1px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase;">AUFGABE</span>
                                    <span style="font-size: 0.83rem; font-weight: 500; color: #ffffff; line-height: 1.3; word-break: break-word;">${escTitle}</span>
                                    ${dueBadge}
                                    ${t.isPlanned || t.status === 'suggestion' ? `<span style="font-size: 0.65rem; color: #f9e2af; font-weight: bold; background: rgba(249, 226, 175, 0.15); border: 1px solid rgba(249, 226, 175, 0.3); padding: 1px 5px; border-radius: 4px;">💡 Vorschlag</span>` : ''}
                                </div>
                                ${projectTag ? `<div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">${projectTag}</div>` : ''}
                            </div>
                            <span class="pinned-task-indicator" title="Angepinnt" style="margin-left: auto; display: inline-flex; align-items: center; justify-content: center;">
                                ${googleIcon('keep', '16px', 'fill: #fab387;')}
                            </span>
                        </div>
                    `;
                    const extraTaskData = `data-task-id="${rawId}" data-task-title="${escTitle.replace(/"/g, '&quot;')}" data-task-notes="${escapeHtml(t.notes || '').replace(/"/g, '&quot;')}" data-task-due="${t.due || ''}" data-task-list="${listTitle}" data-task-recurrence="${t.recurrence || 'none'}" data-task-project-id="${t.projectId || ''}" data-task-status="${t.status || 'in_progress'}" data-task-completed="${!!t.completed}" data-task-starred="true" data-task-planned="${!!(t.isPlanned || t.status === 'suggestion')}"`;
                    html += renderSwipeLinkWrapper(taskItemHtml, t.title || 'Aufgabe', 'task', rawId, '', '', '', extraTaskData);
                });

                html += `
                            </div>
                        </div>
                    </div>
                `;
            }

            // 5. Wecker & Timer (nur wenn vorhanden)
            if (activeTimers.length > 0) {
                html += `
                    <div class="arbeitstisch-card">
                        <div class="arbeitstisch-card-header">
                            <div class="arbeitstisch-card-title">
                                <span>⏱️</span>
                                <h4>Timer</h4>
                            </div>
                            <button type="button" onclick="openTimerModal()" class="arbeitstisch-card-link" title="Neuen Timer erstellen">+ Timer</button>
                        </div>
                        <div class="arbeitstisch-card-body">
                `;
                activeTimers.forEach(t => {
                    const escTitle = escapeHtml(t.title || 'Timer');
                    html += `
                        <div class="timer-card" id="timer-card-${t.id}" data-created="${t.createdAt}" data-expires="${t.expiresAt}" onclick="openTimerDetailModal('${t.id}', '${escTitle}', '${t.createdAt}', '${t.expiresAt}')" style="padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); width: 100%; min-width: 0; box-sizing: border-box; position: relative; cursor: pointer;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 6px;">
                                <span style="font-size: 0.82rem; font-weight: bold; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escTitle}</span>
                                <span style="font-size: 0.65rem; opacity: 0.5; flex-shrink: 0;">Bis ${new Date(t.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div class="timer-countdown" style="font-family: monospace; font-size: 1.05rem; font-weight: bold; color: var(--accent); margin-bottom: 4px;">--:--:--</div>
                            <div class="timer-progress-bg" style="width: 100%; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden;">
                                <div class="timer-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--accent), var(--on)); border-radius: 2px; transition: width 0.5s linear;"></div>
                            </div>
                        </div>
                    `;
                });
                html += `
                        </div>
                    </div>
                `;
            }

            html += `
                    </div>
                    <!-- Guaranteed physical bottom scroll spacer so cards never sit behind the floating input bar -->
                    <div class="arbeitstisch-scroll-spacer" style="height: 180px; min-height: 180px; width: 100%; flex-shrink: 0; pointer-events: none; display: block;"></div>
                </div>
            `;

            container.innerHTML = html;
        }