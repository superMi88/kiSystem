

        function scrollElementInsideTopPanel(targetEl, block = 'start', behavior = 'smooth') {
            const topPanel = document.querySelector('.top-panel');
            if (!topPanel || !targetEl) return;

            const panelHeight = topPanel.clientHeight;
            if (panelHeight === 0) {
                setTimeout(() => scrollElementInsideTopPanel(targetEl, block, behavior), 60);
                return;
            }

            const panelRect = topPanel.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            let relativeTop;
            if (panelRect.height > 0 && targetRect.height > 0) {
                relativeTop = (targetRect.top - panelRect.top) + topPanel.scrollTop;
            } else {
                relativeTop = getElementTopRelativeToParent(targetEl, topPanel);
            }

            const targetHeight = targetRect.height || targetEl.offsetHeight || 80;
            let targetScrollTop = relativeTop;

            if (block === 'center') {
                targetScrollTop = relativeTop - (panelHeight / 2) + (targetHeight / 2);
            } else if (block === 'start' || block === 'top') {
                const isMobile = document.body.classList.contains('mobile-mode');
                const headerOffset = isMobile ? 80 : 15;
                targetScrollTop = relativeTop - headerOffset;
            }

            const finalScrollTop = Math.max(0, targetScrollTop);

            topPanel.scrollTo({
                top: finalScrollTop,
                behavior: behavior
            });

            // Prevent outer page/window from ever scrolling out of view
            window.scrollTo(0, 0);
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
        }



        function hasTimelineDayContent(dayData) {
            if (!dayData) return false;
            const isToday = (dayData.date === getLocalDateString());
            const hasOverdue = isToday && ((dayData.overdueTasks && dayData.overdueTasks.length > 0) || (window.timelineOverdueTasks && window.timelineOverdueTasks.length > 0));
            const hasEntries = dayData.diaryEntries && dayData.diaryEntries.length > 0;
            const hasEvents = dayData.events && dayData.events.length > 0;
            const hasCompletedTasks = dayData.completedTasks && dayData.completedTasks.length > 0;
            return !!(hasOverdue || hasEntries || hasEvents || hasCompletedTasks);
        }



        function getTimelineDayDiff(dateStr1, dateStr2) {
            if (!dateStr1 || !dateStr2) return 0;
            const d1 = new Date(dateStr1 + 'T12:00:00');
            const d2 = new Date(dateStr2 + 'T12:00:00');
            const diffTime = Math.abs(d2.getTime() - d1.getTime());
            return Math.round(diffTime / (1000 * 60 * 60 * 24));
        }



        function renderTimelineDayHtml(dayData) {
            const dateStr = dayData.date;
            const parts = dateStr.split('-').map(Number);
            const dateObj = (parts.length === 3 && !isNaN(parts[0])) ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0) : new Date();
            const formattedDate = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
            const longFormattedDate = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            
            const todayStr = getLocalDateString();
            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayStr = getLocalDateString(yesterdayDate);

            const tomorrowDate = new Date();
            tomorrowDate.setDate(tomorrowDate.getDate() + 1);
            const tomorrowStr = getLocalDateString(tomorrowDate);

            const isToday = (dateStr === todayStr);
            const isYesterday = (dateStr === yesterdayStr);
            const isTomorrow = (dateStr === tomorrowStr);
            const isFuture = (dateStr > todayStr);

            let dayBadge = '';
            let boxClass = 'timeline-day-box';

            if (isToday) {
                dayBadge = `<span style="background: rgba(137, 180, 250, 0.2); color: #89b4fa; font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: bold; border: 1px solid rgba(137, 180, 250, 0.4);">Heute</span>`;
                boxClass += ' today-box';
            } else if (isYesterday) {
                dayBadge = `<span style="background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.8); font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: 500;">Gestern</span>`;
            } else if (isTomorrow) {
                dayBadge = `<span style="background: rgba(166, 227, 161, 0.15); color: #a6e3a1; font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: bold; border: 1px solid rgba(166, 227, 161, 0.3);">Morgen</span>`;
            }

            let overdueList = (isToday && ((dayData.overdueTasks && dayData.overdueTasks.length > 0) ? dayData.overdueTasks : (window.timelineOverdueTasks || []))) || [];
            if (isToday && dayData.completedTasks && dayData.completedTasks.length > 0) {
                dayData.completedTasks.forEach(t => {
                    const rawId = String(t.id).replace('task-', '');
                    const exists = overdueList.some(ot => String(ot.id).replace('task-', '') === rawId);
                    if (!exists && t.due && new Date(t.due) < new Date(todayStr + 'T00:00:00')) {
                        overdueList.push({ ...t, id: rawId, isTask: true, isOverdue: true, completed: true, status: 'done' });
                    }
                });
            }
            if (isToday && overdueList.length > 0) {
                overdueList.sort((a, b) => {
                    const aDone = (a.completed || a.status === 'done') ? 1 : 0;
                    const bDone = (b.completed || b.status === 'done') ? 1 : 0;
                    if (aDone !== bDone) return aDone - bDone;
                    return new Date(a.due || 0).getTime() - new Date(b.due || 0).getTime();
                });
            }
            const hasOverdue = overdueList.length > 0;
            const hasEntries = dayData.diaryEntries && dayData.diaryEntries.length > 0;
            const hasEvents = dayData.events && dayData.events.length > 0;
            const hasCompletedTasks = dayData.completedTasks && dayData.completedTasks.length > 0;

            const dayTitleLabel = escapeHtml(dayData.displayDate || formattedDate);

            let dayInnerHtml = `
                <div style="flex: 1; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; width: 100%;">
                    
                    <!-- Datum Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <div style="font-size: 0.84rem; font-weight: bold; color: ${isToday ? 'var(--accent)' : 'var(--text)'}; display: flex; align-items: center; gap: 8px;" title="${longFormattedDate}">
                            <span>📅 ${dayData.displayDate || formattedDate}</span>
                        </div>
                        ${dayBadge}
                    </div>
            `;

            if (!hasOverdue && !hasEntries && !hasEvents && (!hasCompletedTasks || isToday)) {
                dayInnerHtml += `<p style="font-size: 0.72rem; opacity: 0.35; margin: 2px 0; font-style: italic;">Keine Termine oder Einträge.</p>`;
            } else {
                // 0. Ausstehende / Überfällige Aufgaben (für Heute)
                if (hasOverdue) {
                    const uncompletedOverdue = overdueList.filter(t => !t.completed && t.status !== 'done');
                    const completedOverdue = overdueList.filter(t => t.completed || t.status === 'done');
                    const badgeOverdueLabel = completedOverdue.length > 0
                        ? `${uncompletedOverdue.length} offen, ${completedOverdue.length} erledigt`
                        : `${overdueList.length}`;

                    dayInnerHtml += `
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px;">
                            <div style="font-size: 0.7rem; font-weight: 700; color: var(--off); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                                <span>⚠️ Ausstehende Aufgaben (${badgeOverdueLabel})</span>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                    `;
                    overdueList.forEach(t => {
                        const rawTaskId = String(t.id).replace('task-', '');
                        const escTitle = escapeHtml(t.title).replace(/"/g, '&quot;');
                        const escNotes = escapeHtml(t.notes || t.description || '').replace(/"/g, '&quot;');
                        const escListTitle = escapeHtml(t.listTitle || 'Standard').replace(/"/g, '&quot;');
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

                        const cardBg = isDone ? 'rgba(166, 227, 161, 0.05)' : 'rgba(243, 139, 168, 0.07)';
                        const cardBorder = isDone ? 'rgba(166, 227, 161, 0.25)' : 'rgba(243, 139, 168, 0.3)';
                        const cardBorderLeft = isDone ? '#a6e3a1' : 'var(--off)';
                        const titleColor = isDone ? '#a6adc8' : '#ffffff';
                        const textDecor = isDone ? 'line-through' : 'none';
                        const opacityVal = isDone ? '0.75' : '1';
                        const badgeIcon = isDone ? '✔️' : '⚠️';
                        const badgeColor = isDone ? '#a6e3a1' : 'var(--off)';

                        const taskContent = `
                            <div class="task-item overdue" style="font-size: 0.8rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 6px; background: ${cardBg}; border: 1px solid ${cardBorder}; border-left: 3.5px solid ${cardBorderLeft}; width: 100%; cursor: pointer; opacity: ${opacityVal};">
                                <div style="display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; min-width: 0; flex: 1;">
                                    <button type="button" 
                                            class="task-circle-check ${isDone ? 'is-done' : ''} ${!isDone ? 'is-expired' : ''}" 
                                            onclick="event.stopPropagation(); toggleTaskCompletion('${rawTaskId}', '${escListTitle}', ${!isDone}, this)"
                                            style="margin-top: 2px; flex-shrink: 0;"
                                            title="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}"
                                            aria-label="${isDone ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}">
                                        ${isDone ? googleIcon('check', '12px', 'fill: #11111b;') : ''}
                                    </button>
                                    <div style="line-height: 1.35; color: var(--text); overflow: hidden; text-overflow: ellipsis; word-break: break-word; flex: 1;">
                                        <span style="font-weight: 600; color: ${titleColor}; text-decoration: ${textDecor};">${escapeHtml(t.title)}</span>
                                        ${repeatBadge}
                                        <div style="font-size: 0.7rem; color: ${badgeColor}; font-weight: 700; margin-top: 2px; display: flex; align-items: center; gap: 3px;">
                                            <span>${badgeIcon} ${escapeHtml(dueText)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                        const extraDayTaskData = `data-task-id="${rawTaskId}" data-task-title="${escTitle}" data-task-notes="${escNotes}" data-task-due="${t.due || ''}" data-task-list="${escListTitle}" data-task-recurrence="${recurrenceVal}" data-task-completed="${isDone}" data-task-project-id="${t.projectId || ''}"`;
                        dayInnerHtml += renderSwipeLinkWrapper(taskContent, t.title, 'task', rawTaskId, '', '', '', extraDayTaskData);
                    });
                    dayInnerHtml += `
                            </div>
                        </div>
                    `;
                }

                // 1. Tagebucheinträge (falls vorhanden)
                if (hasEntries) {
                    dayInnerHtml += `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: #fab387; text-transform: uppercase; letter-spacing: 0.5px;">📝 Tagebucheinträge</div>
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                    `;
                    dayData.diaryEntries.forEach(e => {
                        const timeStr = new Date(e.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        const escTitle = escapeHtml(e.title || "Tagebucheintrag").replace(/"/g, '&quot;');
                        const entryContent = `
                            <div style="background: rgba(250, 179, 135, 0.06); border: 1px solid rgba(250, 179, 135, 0.2); padding: 7px 10px; border-radius: 6px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 2px; width: 100%;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <strong style="color: #fab387; font-size: 0.78rem;">${escapeHtml(e.title || "Tagebucheintrag")}</strong>
                                    <span style="font-size: 0.65rem; opacity: 0.5;">${timeStr} Uhr</span>
                                </div>
                                <div style="white-space: pre-wrap; word-break: break-word; line-height: 1.25;">${escapeHtml(e.content)}</div>
                            </div>
                        `;
                        const extraJournalData = `data-journal-id="${e.id}" data-journal-title="${escTitle}" data-journal-date="${dateStr}"`;
                        dayInnerHtml += renderSwipeLinkWrapper(entryContent, e.title || "Tagebucheintrag", 'journal', e.id, '', '', '', extraJournalData);
                    });
                    dayInnerHtml += `
                            </div>
                        </div>
                    `;
                }

                // 2. Kalender-Events & Aufgaben mit Fälligkeit
                if (hasEvents) {
                    dayInnerHtml += `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                    `;
                    dayData.events.forEach(ev => {
                        if (ev.isTask) {
                            const escTitle = escapeHtml(ev.title).replace(/"/g, '&quot;');
                            const escNotes = escapeHtml(ev.description || '').replace(/"/g, '&quot;');
                            const escListTitle = escapeHtml(ev.listTitle || '').replace(/"/g, '&quot;');
                            const recurrenceVal = ev.recurrence || 'none';
                            const isRecurring = ev.recurring || false;
                            const repeatBadge = isRecurring ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrend: ${ev.recurrence}">🔄</span>` : '';
                            
                            let personsHtml = "";
                            if (ev.persons && ev.persons.length > 0) {
                                ev.persons.forEach(p => {
                                    personsHtml += `
                                        <span onclick="openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer; transition: all 0.2s;">
                                          👤 ${escapeHtml(p.name)}
                                        </span>
                                    `;
                                });
                            }

                            const rawTaskId = ev.id.replace('task-', '');
                            const checkedAttr = ev.completed ? 'checked' : '';
                            const textStyle = ev.completed ? 'text-decoration: line-through; opacity: 0.5;' : '';

                            const isExpiredTaskWithTime = !ev.completed && ev.time && (Date.now() >= new Date(ev.time).getTime());
                            const taskExpiredStyle = isExpiredTaskWithTime ? 'border: 1.5px solid var(--off) !important; background: rgba(243, 139, 168, 0.06);' : 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);';

                            const taskContent = `
                                <div class="task-item" style="font-size: 0.8rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 6px; ${taskExpiredStyle} width: 100%;">
                                    <div style="display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; min-width: 0; flex: 1;">
                                        <button type="button" 
                                                class="task-circle-check ${ev.completed ? 'is-done' : ''} ${isExpiredTaskWithTime ? 'is-expired' : ''}" 
                                                onclick="event.stopPropagation(); toggleTaskCompletion('${rawTaskId}', '${ev.listTitle || 'Standard'}', ${!ev.completed}, this)"
                                                style="margin-top: 2px; flex-shrink: 0;"
                                                title="${ev.completed ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}"
                                                aria-label="${ev.completed ? 'Als unerledigt markieren' : 'Aufgabe abhaken'}">
                                            ${ev.completed ? googleIcon('check', '12px', 'fill: #11111b;') : ''}
                                        </button>
                                        <div style="line-height: 1.35; color: var(--text); overflow: hidden; text-overflow: ellipsis; word-break: break-word; flex: 1; ${textStyle}">
                                            <strong style="color: ${isExpiredTaskWithTime ? 'var(--off)' : 'inherit'};">[Aufgabe]</strong> ${escapeHtml(ev.title)}
                                            ${repeatBadge}
                                            ${personsHtml}
                                        </div>
                                    </div>
                                </div>
                            `;
                            const extraDayTaskData = `data-task-id="${rawTaskId}" data-task-title="${escTitle}" data-task-notes="${escNotes}" data-task-due="${ev.time || ''}" data-task-list="${escListTitle}" data-task-recurrence="${recurrenceVal}" data-task-completed="${!!ev.completed}" data-task-project-id="${ev.projectId || ''}"`;
                            dayInnerHtml += renderSwipeLinkWrapper(taskContent, ev.title, 'task', rawTaskId, '', '', '', extraDayTaskData);
                        } else {
                            const isRec = ev.recurring || ev.isRecurring;
                            const repeatBadge = isRec ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrender Termin">🔄</span>` : '';
                            const rescheduleBadge = ev.originalStart ? ` <span style="background: rgba(249, 226, 175, 0.15); color: #f9e2af; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase;" title="Dieser Termin wurde verschoben">verschoben</span>` : '';
                            const targetDate = ev.occurrenceDate || (ev.time ? ev.time.split('T')[0] : dateStr);
                            
                            const cancelStyle = ev.isCancelled ? 'color: var(--off); text-decoration: line-through;' : '';
                            const titleCancelStyle = ev.isCancelled ? 'color: var(--off); font-weight: 500;' : 'font-weight: 500;';
                            const reasonHtml = (ev.isCancelled && ev.cancellationReason) ? ` <span style="font-size: 0.7rem; color: var(--off); text-decoration: none; font-style: italic;">(${escapeHtml(ev.cancellationReason)})</span>` : (ev.isCancelled ? ' <span style="font-size: 0.7rem; color: var(--off); text-decoration: none; font-style: italic;">(Ausgefallen)</span>' : '');
                            
                            const rescheduleBorder = ev.originalStart ? 'border-left: 3px solid #f9e2af; padding-left: 6px;' : '';
                            const escTitle = escapeHtml(ev.title).replace(/"/g, '&quot;');
                            const escDesc = escapeHtml(ev.description || '').replace(/"/g, '&quot;');
                            const escPersonsJson = escapeHtml(JSON.stringify(ev.persons || [])).replace(/"/g, '&quot;');
                            const escReason = escapeHtml(ev.cancellationReason || '').replace(/"/g, '&quot;');
                            
                            const timeBadgeHtml = getEventTimeBadge(ev);
                            let todayStatusBadge = '';
                            if (isToday && !ev.isAllDay && (ev.time || ev.start)) {
                                const startMs = new Date(ev.time || ev.start).getTime();
                                const endMs = (ev.endTime || ev.end) ? new Date(ev.endTime || ev.end).getTime() : startMs + 60 * 60 * 1000;
                                const nowMs = Date.now();
                                if (nowMs >= endMs) {
                                    todayStatusBadge = '';
                                } else if (nowMs >= startMs && nowMs < endMs) {
                                    todayStatusBadge = `<span class="timeline-active-badge"><span class="active-pulse-dot"></span> Läuft gerade</span>`;
                                }
                            }
                            
                            let personsHtml = "";
                            if (ev.persons && ev.persons.length > 0) {
                                ev.persons.forEach(p => {
                                    personsHtml += `
                                        <span onclick="openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer; transition: all 0.2s;">
                                          👤 ${escapeHtml(p.name)}
                                        </span>
                                    `;
                                });
                            }

                            let birthdayStyle = "border-bottom: 1px solid rgba(255,255,255,0.02); padding: 4px 0;";
                            if (ev.isBirthday) {
                                birthdayStyle = "background: rgba(245, 194, 231, 0.08); border: 1px solid rgba(245, 194, 231, 0.2); border-left: 3px solid #f5c2e7; padding: 5px 8px; border-radius: 6px; margin: 2px 0;";
                            }

                            const originalTimeText = ev.originalStart ? ` <span style="font-size: 0.7rem; opacity: 0.65; color: #f9e2af;">(ursprünglich: ${new Date(ev.originalStart).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})} ${new Date(ev.originalStart).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})})</span>` : '';

                            const eventContent = `
                                <div style="font-size: 0.8rem; display: flex; justify-content: space-between; align-items: flex-start; width: 100%; ${birthdayStyle} ${rescheduleBorder} ${cancelStyle}">
                                    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            <span style="${titleCancelStyle}">${escapeHtml(ev.title)}</span>
                                            ${repeatBadge}
                                            ${rescheduleBadge}
                                            ${originalTimeText}
                                            ${reasonHtml}
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
                                            ${timeBadgeHtml}
                                            ${todayStatusBadge}
                                            ${personsHtml}
                                        </div>
                                        ${ev.description ? `<div style="font-size: 0.72rem; opacity: 0.6; margin-top: 2px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(ev.description)}</div>` : ''}
                                    </div>
                                </div>
                            `;
                            const linkType = ev.isBirthday && ev.persons && ev.persons.length > 0 ? 'person' : 'event';
                            const linkId = ev.isBirthday && ev.persons && ev.persons.length > 0 ? ev.persons[0].id : ev.id;
                            const extraTimelineEventData = `data-event-id="${ev.id}" data-event-title="${escTitle}" data-event-date="${targetDate}" data-event-start="${ev.start || ev.time || ''}" data-event-end="${ev.end || ''}" data-event-is-allday="${!!ev.isAllDay}" data-event-fuzzy="${ev.fuzzyTime || ''}" data-event-desc="${escDesc}" data-event-is-rec="${isRec}" data-event-is-birthday="${!!ev.isBirthday}" data-person-id="${ev.persons && ev.persons.length > 0 ? ev.persons[0].id : ''}" data-event-persons="${escPersonsJson}" data-event-iscancelled="${!!ev.isCancelled}" data-event-cancelreason="${escReason}" data-event-originalstart="${ev.originalStart || ''}"`;
                            dayInnerHtml += renderSwipeLinkWrapper(eventContent, ev.title, linkType, linkId, '', '', '', extraTimelineEventData);
                        }
                    });
                    dayInnerHtml += `</div>`;
                }

                // 3. Erledigte Aufgaben (für vergangene Tage; für Heute stehen erledigte ausstehende Aufgaben oben und andere erledigte Aufgaben werden nicht angezeigt)
                if (hasCompletedTasks && !isToday) {
                    dayInnerHtml += `
                        <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 2px;">
                            <div style="font-size: 0.7rem; font-weight: bold; color: #89b4fa; text-transform: uppercase; letter-spacing: 0.5px;">✅ Erledigte Aufgaben</div>
                            <div style="display: flex; flex-direction: column; gap: 3px;">
                    `;
                    dayData.completedTasks.forEach(t => {
                        const doneTime = t.completedAt ? new Date(t.completedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
                        dayInnerHtml += `
                            <div style="background: rgba(137, 180, 250, 0.05); border: 1px solid rgba(137, 180, 250, 0.2); padding: 4px 6px; border-radius: 6px; font-size: 0.74rem; display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text);">✔️ ${escapeHtml(t.title)}</span>
                                <span style="font-size: 0.65rem; color: #89b4fa;">${doneTime ? 'um ' + doneTime + ' Uhr' : 'erledigt'}</span>
                            </div>
                        `;
                    });
                    dayInnerHtml += `
                            </div>
                        </div>
                    `;
                }
            }

            dayInnerHtml += `</div>`;

            const dayBorderColor = isToday ? 'rgba(137, 180, 250, 0.35)' : 'rgba(255, 255, 255, 0.08)';
            const dayBg = isToday ? 'rgba(137, 180, 250, 0.025)' : 'transparent';
            const extraDayData = `id="timeline-day-${dateStr}" data-date="${dateStr}" data-day-date="${dateStr}" data-day-label="${dayTitleLabel}"`;
            return renderSwipeLinkWrapper(
                dayInnerHtml,
                dayData.displayDate || formattedDate,
                'day',
                dateStr,
                boxClass,
                `display: flex; flex-direction: column; width: 100%; background: ${dayBg}; border-top: 1px solid ${dayBorderColor}; border-bottom: 1px solid ${dayBorderColor}; border-left: none; border-right: none; border-radius: 0; box-shadow: none; margin-bottom: 0;`,
                'margin-bottom: 12px; border-radius: 0;',
                extraDayData
            );
        }



        function checkAndLoadMoreTimelineIfNoScrollbar() {
            const topPanel = document.querySelector('.top-panel');
            const widgetCalendar = document.getElementById('widget-calendar');
            if (widgetCalendar && topPanel) {
                if (topPanel.scrollHeight <= topPanel.clientHeight && timelineCanScrollFuture && !isTimelineLoadingFuture) {
                    const today = new Date();
                    const newestParts = timelineNewestLoadedDateStr ? timelineNewestLoadedDateStr.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
                    const newestDate = new Date(newestParts[0], newestParts[1] - 1, newestParts[2]);
                    const loadedDays = Math.ceil((newestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (loadedDays < 90) {
                        loadMoreFutureTimelineDays().then(() => {
                            setTimeout(checkAndLoadMoreTimelineIfNoScrollbar, 200);
                        });
                    }
                }
            }
        }



        async function renderTimelineWidget(data, containerDiv, forceIncludeDateStr = null) {
            let rawDays = [];
            if (data && data.timeline) {
                rawDays = data.timeline;
            } else if (Array.isArray(data)) {
                rawDays = data;
            } else if (data && data.days) {
                rawDays = data.days;
            }

            const todayStr = getLocalDateString();
            window.timelineOverdueTasks = (data && data.overdueTasks) || [];

            if (!rawDays || rawDays.length === 0) {
                rawDays = [{ date: todayStr, displayDate: 'Heute', events: [], diaryEntries: [], completedTasks: [], overdueTasks: window.timelineOverdueTasks }];
            } else {
                const todayDay = rawDays.find(d => d.date === todayStr);
                if (todayDay) {
                    todayDay.overdueTasks = window.timelineOverdueTasks;
                }
            }

            rawDays.sort((a, b) => a.date.localeCompare(b.date));
            timelineOldestLoadedDateStr = rawDays[0].date;
            timelineNewestLoadedDateStr = rawDays[rawDays.length - 1].date;
            timelineCanScrollPast = true;
            timelineCanScrollFuture = true;

            // Render all days continuously
            let visibleDays = [...rawDays];
            visibleDays.sort((a, b) => a.date.localeCompare(b.date)); // Chronological ascending

            // Keep header date input updated
            const headerDateInput = document.getElementById('header-calendar-date');
            if (headerDateInput) {
                headerDateInput.value = forceIncludeDateStr || todayStr;
            }

            let html = `
                <div style="text-align: left; padding: 0 0 15px 0; display: flex; flex-direction: column; gap: 10px;">
                    <div id="timeline-loading-past" style="display: none; text-align: center; padding: 6px; font-size: 0.72rem; color: #fab387; opacity: 0.85;">⬆️ Lade vergangene Tage...</div>
                    
                    <!-- Scrollbare Tage-Liste (Oben: Vergangenheit, Unten: Zukunft) -->
                    <div id="timeline-days-list" style="display: flex; flex-direction: column;">
            `;

            for (let i = 0; i < visibleDays.length; i++) {
                html += renderTimelineDayHtml(visibleDays[i]);
            }

            html += `
                    </div>
                    
                    <div id="timeline-loading-future" style="display: none; text-align: center; padding: 6px; font-size: 0.72rem; color: #2ecc71; opacity: 0.85;">⬇️ Lade zukünftige Tage...</div>
                </div>
            `;

            containerDiv.innerHTML = html;

            const scrollTargetDate = forceIncludeDateStr || todayStr;
            setTimeout(() => {
                const targetEl = document.getElementById(`timeline-day-${scrollTargetDate}`);
                if (targetEl) {
                    scrollElementInsideTopPanel(targetEl, 'start', forceIncludeDateStr ? 'smooth' : 'auto');
                    if (forceIncludeDateStr) {
                        flashTimelineDay(targetEl);
                    }
                }
                checkAndLoadMoreTimelineIfNoScrollbar();
            }, 60);
        }



        async function loadMorePastTimelineDays() {
            if (isTimelineLoadingPast || !timelineOldestLoadedDateStr || !timelineCanScrollPast) return;
            isTimelineLoadingPast = true;

            const loadingIndicator = document.getElementById('timeline-loading-past');
            if (loadingIndicator) loadingIndicator.style.display = 'block';

            const topPanel = document.querySelector('.top-panel');
            const prevScrollHeight = topPanel ? topPanel.scrollHeight : 0;
            const prevScrollTop = topPanel ? topPanel.scrollTop : 0;

            try {
                const oldestParts = timelineOldestLoadedDateStr.split('-').map(Number);
                const endDate = new Date(oldestParts[0], oldestParts[1] - 1, oldestParts[2] - 1, 12, 0, 0);
                const startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 13); // 14 Tage Vergangenheit nachladen

                const startStr = getLocalDateString(startDate);
                const endStr = getLocalDateString(endDate);

                const res = await fetch(getApiUrl(`/api/calendar/timeline?start=${startStr}&end=${endStr}`));
                if (!res.ok) throw new Error("Fehler beim Laden");
                const data = await res.json();
                const rawDays = data.days || [];

                timelineOldestLoadedDateStr = startStr;

                const visibleDays = [...rawDays];

                const daysListDiv = document.getElementById('timeline-days-list');
                if (daysListDiv && visibleDays.length > 0) {
                    visibleDays.sort((a, b) => a.date.localeCompare(b.date));

                    let prependHtml = '';
                    for (let i = 0; i < visibleDays.length; i++) {
                        if (!document.getElementById(`timeline-day-${visibleDays[i].date}`)) {
                            prependHtml += renderTimelineDayHtml(visibleDays[i]);
                        }
                    }

                    if (prependHtml) {
                        daysListDiv.insertAdjacentHTML('afterbegin', prependHtml);
                        if (topPanel) {
                            const newScrollHeight = topPanel.scrollHeight;
                            topPanel.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
                        }
                    }
                }
            } catch (e) {
                console.error("Fehler beim Nachladen vergangener Tage:", e);
            } finally {
                isTimelineLoadingPast = false;
                if (loadingIndicator) loadingIndicator.style.display = 'none';
            }
        }



        async function loadMoreFutureTimelineDays() {
            if (isTimelineLoadingFuture || !timelineNewestLoadedDateStr || !timelineCanScrollFuture) return;
            isTimelineLoadingFuture = true;

            const loadingIndicator = document.getElementById('timeline-loading-future');
            if (loadingIndicator) loadingIndicator.style.display = 'block';

            try {
                const newestParts = timelineNewestLoadedDateStr.split('-').map(Number);
                const startDate = new Date(newestParts[0], newestParts[1] - 1, newestParts[2] + 1, 12, 0, 0);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 13); // 14 Tage Zukunft

                const startStr = getLocalDateString(startDate);
                const endStr = getLocalDateString(endDate);

                const res = await fetch(getApiUrl(`/api/calendar/timeline?start=${startStr}&end=${endStr}`));
                if (!res.ok) throw new Error("Fehler beim Laden");
                const data = await res.json();
                const rawDays = data.days || [];

                timelineNewestLoadedDateStr = endStr;

                const visibleDays = [...rawDays];

                const daysListDiv = document.getElementById('timeline-days-list');
                if (daysListDiv && visibleDays.length > 0) {
                    visibleDays.sort((a, b) => a.date.localeCompare(b.date));

                    let appendHtml = '';
                    for (let i = 0; i < visibleDays.length; i++) {
                        if (!document.getElementById(`timeline-day-${visibleDays[i].date}`)) {
                            appendHtml += renderTimelineDayHtml(visibleDays[i]);
                        }
                    }

                    if (appendHtml) {
                        daysListDiv.insertAdjacentHTML('beforeend', appendHtml);
                    }
                }
            } catch (e) {
                console.error("Fehler beim Nachladen zukünftiger Tage:", e);
            } finally {
                isTimelineLoadingFuture = false;
                if (loadingIndicator) loadingIndicator.style.display = 'none';
            }
        }



        async function jumpToTimelineDate(dateStr) {
            if (!dateStr) return;
            if (dateStr === 'today') {
                dateStr = getLocalDateString();
            }

            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }

            const inputEl = document.getElementById('timeline-jump-date-input');
            if (inputEl) inputEl.value = dateStr;
            const headerDateInput = document.getElementById('header-calendar-date');
            if (headerDateInput) headerDateInput.value = dateStr;

            if (document.body.classList.contains('mobile-mode') && !document.body.classList.contains('view-calendar')) {
                switchMobileView('calendar');
            }

            let targetEl = document.getElementById(`timeline-day-${dateStr}`);
            if (targetEl) {
                const doScroll = () => {
                    scrollElementInsideTopPanel(targetEl, 'start', 'smooth');
                    flashTimelineDay(targetEl);
                };
                doScroll();
                requestAnimationFrame(doScroll);
                setTimeout(doScroll, 80);
                return;
            }

            try {
                const parts = dateStr.split('-').map(Number);
                const targetObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
                const startObj = new Date(targetObj);
                startObj.setDate(startObj.getDate() - 7);
                const endObj = new Date(targetObj);
                endObj.setDate(endObj.getDate() + 7);

                const startStr = getLocalDateString(startObj);
                const endStr = getLocalDateString(endObj);

                const res = await fetch(getApiUrl(`/api/calendar/timeline?start=${startStr}&end=${endStr}`));
                if (res.ok) {
                    const data = await res.json();
                    const widgetCalendar = document.getElementById('widget-calendar');
                    if (widgetCalendar) {
                        renderTimelineWidget(data, widgetCalendar, dateStr);
                    }
                }
            } catch (e) {
                console.error("Fehler beim Laden des Ziel-Datums:", e);
            }
        }


        window.jumpToTimelineDate = jumpToTimelineDate;



        function flashTimelineDay(el) {
            if (!el) return;
            el.classList.add('timeline-jump-highlight');
            setTimeout(() => {
                el.classList.remove('timeline-jump-highlight');
            }, 1800);
        }



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
                const res = await callTool('loesche_termin', args);
                loadTopWidgets();
            } catch (e) {
                console.error("Fehler beim Löschen des Termins:", e);
            }
        }


        window.deleteCalendarEvent = deleteCalendarEvent;