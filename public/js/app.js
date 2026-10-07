

        async function loadTopWidgets() {
            try {
                const res = await fetch(getApiUrl('/widgets'));
                const widgets = await res.json();
                topWidgetsContainer.innerHTML = '';
                
                // 1. Kalender (Neuer Hauptkalender an Stelle von 'Heute')
                const calDiv = document.createElement('div');
                calDiv.id = 'widget-calendar';
                calDiv.style.marginBottom = '15px';
                const calWidget = widgets.find(w => w.type === 'calendar_overview');
                renderTimelineWidget(calWidget ? calWidget.data : null, calDiv, window.currentCalendarDate, widgets);
                topWidgetsContainer.appendChild(calDiv);

                // 2. Agent-Briefing Dashboard (Dedicated Tab)
                const briefingDiv = document.createElement('div');
                briefingDiv.id = 'widget-briefing';
                briefingDiv.style.marginBottom = '15px';
                renderBriefingWidget(widgets, briefingDiv);
                topWidgetsContainer.appendChild(briefingDiv);

                // 3. Render normal widgets
                widgets.forEach(widget => {
                    if (widget.pluginName === 'Notifications') return;
                    if (widget.type === 'calendar_overview') return; // Bereits an Stelle 1 gerendert
                    const widgetDiv = document.createElement('div');
                    widgetDiv.style.marginBottom = '15px';
                    
                    if (widget.pluginName) {
                        widgetDiv.id = 'widget-' + widget.pluginName.toLowerCase();
                    } else if (widget.type === 'timer_list') {
                        widgetDiv.id = 'widget-timer';
                    }
                    
                    if (widget.type === 'timer_list') {
                        let html = `<div class="timer-list-container" style="display: flex; flex-direction: column; gap: 10px; width: 100%;">`;
                        if (widget.data.timers.length === 0) {
                            html += `<p style="font-size: 0.75rem; opacity: 0.6; margin: 0; padding: 10px; text-align: center; background: rgba(0,0,0,0.15); border-radius: 8px;">Keine aktiven Timer.</p>`;
                        } else {
                            widget.data.timers.forEach(t => {
                                const escTitle = escapeHtml(t.title).replace(/"/g, '&quot;');
                                const timerContent = `
                                    <div class="timer-card" id="timer-card-${t.id}" data-created="${t.createdAt}" data-expires="${t.expiresAt}" style="padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); width: 100%; position: relative;">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                                            <span style="font-size: 0.85rem; font-weight: bold; color: var(--text);">${escapeHtml(t.title)}</span>
                                        </div>
                                        <div class="timer-countdown" style="font-family: monospace; font-size: 1.1rem; font-weight: bold; color: var(--accent); margin-bottom: 6px;">--:--:--</div>
                                        <div class="timer-progress-bg" style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; margin-bottom: 4px;">
                                            <div class="timer-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--accent), var(--on)); border-radius: 2px; transition: width 0.5s linear;"></div>
                                        </div>
                                        <div style="font-size: 0.65rem; opacity: 0.4;">Bis: ${new Date(t.expiresAt).toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</div>
                                    </div>
                                `;
                                const extraTimerData = `data-timer-id="${t.id}" data-timer-title="${escTitle}"`;
                                html += renderSwipeLinkWrapper(timerContent, t.title, 'timer', t.id, '', '', '', extraTimerData);
                            });
                        }
                        html += `</div>`;
                        widgetDiv.innerHTML = html;
                    } else if (widget.type === 'custom') {
                        if (widget.data.widgetType === 'projects_list') {
                            widgetDiv.id = 'widget-projects';
                            renderProjectsWidget(widget.data, widgetDiv);
                        } else if (widget.data.widgetType === 'memory_people_list') {
                            widgetDiv.id = 'widget-memory';
                            currentMemoryPeopleList = widget.data.people || [];
                            let html = `<div id="memory-people-list-container" style="text-align: left; padding: 5px 0 15px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 8px;">`;
                            html += getFilteredPeopleListHtml(currentMemoryPeopleList, personSearchQuery);
                            html += `</div>`;
                            widgetDiv.innerHTML = html;
                        } else if (widget.data.widgetType === 'tasks_overview') {
                            let html = `<div style="text-align: left; padding: 5px 0 15px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">`;
                            
                            html += `<button onclick="openTaskModal()" class="nav-btn" style="width: 100%; font-size: 0.8rem; margin-bottom: 5px;">➕ Neue Aufgabe</button>`;
                            
                            if (!widget.data.tasks || widget.data.tasks.length === 0) {
                                html += `<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 10px 0;">Keine offenen Aufgaben.</p>`;
                            } else {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);

                                const overdueTasks = [];
                                const activeTasks = [];

                                widget.data.tasks.forEach(t => {
                                    if (t.due) {
                                        const dueObj = new Date(t.due);
                                        dueObj.setHours(0, 0, 0, 0);
                                        if (dueObj < today) {
                                            overdueTasks.push(t);
                                            return;
                                        }
                                    }
                                    activeTasks.push(t);
                                });

                                if (overdueTasks.length > 0) {
                                    html += `<div style="font-weight: 600; font-size: 0.7rem; color: var(--off); margin: 8px 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ Überfällig</div>`;
                                    html += `<div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">`;
                                    overdueTasks.forEach(t => {
                                        html += renderSingleTaskHtml(t, true);
                                    });
                                    html += `</div>`;
                                }

                                const groupedTasks = {};
                                activeTasks.forEach(t => {
                                    const listName = t.listTitle || "Meine Aufgaben";
                                    if (!groupedTasks[listName]) groupedTasks[listName] = [];
                                    groupedTasks[listName].push(t);
                                });
  
                                Object.keys(groupedTasks).forEach(listName => {
                                    html += `<div style="font-weight: 600; font-size: 0.7rem; color: rgba(255,255,255,0.5); margin: 8px 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">${listName}</div>`;
                                    html += `<div style="display: flex; flex-direction: column; gap: 4px;">`;
                                    groupedTasks[listName].forEach(t => {
                                         html += renderSingleTaskHtml(t, false);
                                    });
                                    html += `</div>`;
                                });
                            }
                            html += `</div>`;
                            widgetDiv.innerHTML = html;
                        } else if (widget.data.widgetType === 'mail_overview') {
                            widgetDiv.id = 'widget-mail';
                            renderMailWidget(widget.data, widgetDiv);
                        }
                    }
                    
                    topWidgetsContainer.appendChild(widgetDiv);
                });

                // Append guaranteed bottom scroll spacer for mobile/single-column mode
                const topWidgetsSpacer = document.createElement('div');
                topWidgetsSpacer.className = 'top-widgets-scroll-spacer';
                topWidgetsSpacer.style.cssText = 'height: 180px; min-height: 180px; width: 100%; flex-shrink: 0; pointer-events: none; display: block;';
                topWidgetsContainer.appendChild(topWidgetsSpacer);
                
                // Update navigation badges and visibility based on active plugins
                updateBadges(widgets);
                
                // Sofort prüfen, ob ein Widget (wie Calendar) Fehler geworfen hat und Authentifizierung fordert
                loadAlerts();
            } catch (e) {
                console.error("Fehler beim Laden der Top-Widgets:", e);
            }
        }



        function updateBadges(widgets) {
            const activePluginNames = new Set();
            let calendarCount = 0;
            let mailUnreadCount = 0;
            
            const today = new Date();
            
            widgets.forEach(widget => {
                if (widget.pluginName) {
                    activePluginNames.add(widget.pluginName);
                } else if (widget.type === 'calendar_overview') {
                    activePluginNames.add('Calendar');
                } else if (widget.type === 'timer_list') {
                    activePluginNames.add('Timer');
                }
                
                if (widget.type === 'calendar_overview') {
                    const events = widget.data.events || [];
                    events.forEach(ev => {
                        const start = new Date(ev.time);
                        const isSameDay = start.getDate() === today.getDate() &&
                                          start.getMonth() === today.getMonth() &&
                                          start.getFullYear() === today.getFullYear();
                        if (isSameDay && !ev.isCancelled) {
                            calendarCount++;
                        }
                    });
                }

                if (widget.pluginName === 'Mail' || widget.data?.widgetType === 'mail_overview') {
                    mailUnreadCount = widget.data.unreadCount || 0;
                }
            });

            // Update button visibilities
            const btnCal = document.getElementById('btn-nav-calendar');
            const btnTimer = document.getElementById('btn-nav-timer');
            const btnTasks = document.getElementById('btn-nav-tasks');
            const btnProjects = document.getElementById('btn-nav-projects');
            const btnJournal = document.getElementById('btn-nav-journal');
            const btnMemory = document.getElementById('btn-nav-memory');
            const btnMail = document.getElementById('btn-nav-mail');

            if (btnCal) btnCal.style.display = activePluginNames.has('Calendar') ? 'flex' : 'none';
            if (btnTimer) btnTimer.style.display = activePluginNames.has('Timer') ? 'flex' : 'none';
            if (btnTasks) btnTasks.style.display = activePluginNames.has('Tasks') ? 'flex' : 'none';
            if (btnProjects) btnProjects.style.display = activePluginNames.has('Projects') ? 'flex' : 'none';
            if (btnJournal) btnJournal.style.display = activePluginNames.has('Journal') ? 'flex' : 'none';
            if (btnMemory) btnMemory.style.display = activePluginNames.has('Memory') ? 'flex' : 'none';
            if (btnMail) btnMail.style.display = activePluginNames.has('Mail') ? 'flex' : 'none';

            // Update Calendar badge
            const calBadge = document.getElementById('badge-calendar');
            if (calBadge) {
                if (calendarCount > 0) {
                    calBadge.textContent = calendarCount;
                    calBadge.style.display = 'flex';
                } else {
                    calBadge.style.display = 'none';
                }
            }

            // Update Mail badge
            const mailBadge = document.getElementById('badge-mail');
            if (mailBadge) {
                if (mailUnreadCount > 0) {
                    mailBadge.textContent = mailUnreadCount;
                    mailBadge.style.display = 'flex';
                } else {
                    mailBadge.style.display = 'none';
                }
            }

            // Update Briefing badges
            const notifWidget = widgets.find(w => w.pluginName === 'Notifications' || w.type === 'agent_notifications');
            const activeNotifs = (notifWidget && notifWidget.data && notifWidget.data.notifications) ? notifWidget.data.notifications.filter(n => !n.isDismissed) : [];
            const notifCount = activeNotifs.length;
            
            const tabBriefBadge = document.getElementById('tab-briefing-badge');
            if (tabBriefBadge) {
                if (notifCount > 0) {
                    tabBriefBadge.textContent = notifCount;
                    tabBriefBadge.style.display = 'inline-flex';
                } else {
                    tabBriefBadge.style.display = 'none';
                }
            }

            const hDashBadge = document.getElementById('header-dash-briefing-badge');
            if (hDashBadge) {
                hDashBadge.textContent = notifCount;
                hDashBadge.style.display = notifCount > 0 ? 'inline-block' : 'none';
            }

            const hBriefCount = document.getElementById('header-briefing-count-badge');
            if (hBriefCount) {
                hBriefCount.textContent = notifCount > 0 ? `${notifCount} offen` : '0 offen';
                hBriefCount.style.display = notifCount > 0 ? 'inline-block' : 'none';
            }

            const drawerBadge = document.getElementById('drawer-briefing-badge');
            if (drawerBadge) {
                drawerBadge.textContent = notifCount;
                drawerBadge.style.display = notifCount > 0 ? 'inline-block' : 'none';
            }
            
            // Also trigger real-time timer badge update
            updateTimerBadge();
        }



        function getLocalDateString(d = new Date()) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }



        async function deleteJournalEntry(id, dateStr) {
            if (!confirm("Möchtest du diesen Tagebucheintrag wirklich löschen?")) return;
            try {
                const res = await fetch(getApiUrl(`/api/journal/entries/${id}`), { method: 'DELETE' });
                if (res.ok) {
                    if (window.calendarTimelineCache && dateStr) {
                        delete window.calendarTimelineCache[dateStr];
                    }
                    if (typeof jumpToTimelineDate === 'function') {
                        await jumpToTimelineDate(dateStr || window.currentCalendarDate);
                    }
                    loadTopWidgets();
                }
            } catch (e) {
                console.error("Fehler beim Löschen des Tagebucheintrags:", e);
            }
        }

        window.deleteJournalEntry = deleteJournalEntry;



        function updateTimerBadge() {
            const timerBadge = document.getElementById('badge-timer');
            if (!timerBadge) return;
            
            let expiredCount = 0;
            document.querySelectorAll('.timer-card').forEach(card => {
                const expiresTime = new Date(card.dataset.expires).getTime();
                if (expiresTime <= Date.now()) {
                    expiredCount++;
                }
            });
            
            if (expiredCount > 0) {
                timerBadge.textContent = expiredCount;
                timerBadge.style.display = 'flex';
            } else {
                timerBadge.style.display = 'none';
            }
        }


        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Let browser insert newline naturally and resize input
                setTimeout(autoResizeInput, 0);
            }
        });


        userInput.addEventListener('input', autoResizeInput);


        updateInputRowButtons();



        // Plus button and file input listeners
        // plusBtn in core.js


        // fileInput in core.js



        async function initializeApp() {
            const username = localStorage.getItem('api_username');
            const password = localStorage.getItem('api_password');
            
            if (!username || !password) {
                showSection('login');
                return;
            }

            try {
                await loadEntityConfigs();
            } catch (err) {
                console.error("Fehler beim ersten Laden der Entity-Konfigurationen:", err);
            }
            try {
                await loadTopWidgets();
                syncWidgetSettings();
            } catch (err) {
                console.error("Konnte keine Verbindung zum Server herstellen:", err);
            }

            requestNotificationPermissions();
            checkMailNotificationsForeground(true);
            handleMailHashRouting();
            window.addEventListener('hashchange', handleMailHashRouting);
        }


        initializeApp();


        setInterval(loadAlerts, 3000);

 // Alle 3 Sekunden prüfen
        setInterval(checkMailNotificationsForeground, 15000);

 // Alle 15 Sekunden auf neue Mails prüfen
        // Timeline Live-Update: Alle 30 Sekunden Widgets aktualisieren, damit Fortschrittsbalken sichtbar ablaufen
        setInterval(() => {
            if (document.querySelector('.today-vertical-timeline')) {
                loadTopWidgets();
            }
        }, 30000);



        function handleMailHashRouting() {
            // Android Pending Mail Intent prüfen
            if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.getPendingOpenMailId === 'function') {
                try {
                    const pendingId = window.AndroidWidgetInterface.getPendingOpenMailId();
                    if (pendingId && pendingId !== 0) {
                        dismissMailNotification(pendingId);
                        setTimeout(() => {
                            if (typeof openMailReadModal === 'function') {
                                openMailReadModal(pendingId);
                            }
                        }, 200);
                        return;
                    }
                } catch (e) {
                    console.error("Error reading pending open mail id:", e);
                }
            }

            if (window.location.hash && window.location.hash.startsWith('#mail-')) {
                const raw = window.location.hash.replace('#mail-', '');
                const mailId = Number(raw);
                if (mailId !== 0 && !isNaN(mailId)) {
                    dismissMailNotification(mailId);
                    setTimeout(() => {
                        if (typeof openMailReadModal === 'function') {
                            openMailReadModal(mailId);
                        }
                    }, 200);
                }
            }
        }



        function dismissMailNotification(mailId) {
            const id = Number(mailId);
            if (!id) return;
            try {
                if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.cancelMailNotification === 'function') {
                    window.AndroidWidgetInterface.cancelMailNotification(id);
                } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.cancelMailNotification === 'function') {
                    window.Capacitor.Plugins.WidgetSettings.cancelMailNotification({ mailId: id });
                }
            } catch (e) {
                console.error("Error dismissing mail notification:", e);
            }
        }


        window.dismissMailNotification = dismissMailNotification;



        function dismissAllMailNotifications() {
            try {
                if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.cancelAllMailNotifications === 'function') {
                    window.AndroidWidgetInterface.cancelAllMailNotifications();
                } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.cancelAllMailNotifications === 'function') {
                    window.Capacitor.Plugins.WidgetSettings.cancelAllMailNotifications();
                }
            } catch (e) {
                console.error("Error dismissing all mail notifications:", e);
            }
        }


        window.dismissAllMailNotifications = dismissAllMailNotifications;



        // Capacitor Android hardware / gesture back button support
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            try {
                window.Capacitor.Plugins.App.addListener('backButton', function(data) {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal();
                    }
                });
            } catch (err) {
                console.error("Capacitor backButton listener registration error:", err);
            }
        }