

        async function loadTopWidgets() {
            try {
                const res = await fetch(getApiUrl('/widgets'));
                const widgets = await res.json();
                topWidgetsContainer.innerHTML = '';
                
                // 1. Kalender (Neuer Hauptkalender an Stelle von 'Heute')
                try {
                    const calDiv = document.createElement('div');
                    calDiv.id = 'widget-calendar';
                    calDiv.style.marginBottom = '15px';
                    const calWidget = widgets.find(w => w.type === 'calendar_overview');
                    if (typeof renderTimelineWidget === 'function') {
                        renderTimelineWidget(calWidget ? calWidget.data : null, calDiv, window.currentCalendarDate, widgets);
                    }
                    topWidgetsContainer.appendChild(calDiv);
                } catch (calErr) {
                    console.error("Fehler beim Rendern des Kalender-Widgets:", calErr);
                }

                // 2. Agent-Briefing Dashboard (Dedicated Tab)
                try {
                    const briefingDiv = document.createElement('div');
                    briefingDiv.id = 'widget-briefing';
                    briefingDiv.style.marginBottom = '15px';
                    if (typeof renderBriefingWidget === 'function') {
                        renderBriefingWidget(widgets, briefingDiv);
                    }
                    topWidgetsContainer.appendChild(briefingDiv);
                } catch (briefErr) {
                    console.error("Fehler beim Rendern des Briefing-Widgets:", briefErr);
                }

                // 3. Render normal widgets
                widgets.forEach(widget => {
                    try {
                        if (widget.pluginName === 'Notifications') return;
                        if (widget.type === 'calendar_overview') return; // Bereits an Stelle 1 gerendert
                        const widgetDiv = document.createElement('div');
                        widgetDiv.style.marginBottom = '15px';
                        
                        if (widget.pluginName) {
                            widgetDiv.id = 'widget-' + widget.pluginName.toLowerCase();
                        } else if (widget.type === 'timer_list') {
                            widgetDiv.id = 'widget-timer';
                        }
                        
                        if (widget.type === 'timer_list' || widget.pluginName === 'Timer') {
                            widgetDiv.id = 'widget-timer';
                            let html = `<div class="timer-list-container" style="display: flex; flex-direction: column; gap: 10px; width: 100%; padding: 4px 0;">`;
                            if (!widget.data || !widget.data.timers || widget.data.timers.length === 0) {
                                html += `
                                    <div style="text-align: center; padding: 40px 16px; color: rgba(255, 255, 255, 0.45); font-size: 0.85rem; font-weight: 500;">
                                        Keine aktiven Wecker oder Timer.
                                    </div>
                                `;
                            } else {
                                widget.data.timers.forEach(t => {
                                    const escTitle = escapeHtml(t.title).replace(/"/g, '&quot;');
                                    const expDate = new Date(t.expiresAt);
                                    const isToday = expDate.toDateString() === new Date().toDateString();
                                    const timeStr = expDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                    const dateStr = isToday ? 'Heute' : expDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

                                    const timerContent = `
                                        <div class="timer-card" id="timer-card-${t.id}" data-id="${t.id}" data-title="${escTitle}" data-created="${t.createdAt}" data-expires="${t.expiresAt}" style="padding: 12px 14px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); width: 100%; position: relative;">
                                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; gap: 8px;">
                                                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                                                    <span style="font-size: 1rem;">⏰</span>
                                                    <span class="timer-title" style="font-size: 0.88rem; font-weight: 700; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.title)}</span>
                                                </div>
                                                <button type="button" onclick="event.stopPropagation(); deleteTimer('${t.id}')" style="background: none; border: none; color: #f38ba8; cursor: pointer; font-size: 0.85rem; opacity: 0.75; padding: 2px 4px; transition: opacity 0.2s;" title="Wecker / Timer löschen">🗑️</button>
                                            </div>
                                            <div class="timer-countdown" style="font-family: monospace; font-size: 1.25rem; font-weight: 800; color: var(--accent); margin-bottom: 6px; letter-spacing: 1px;">--:--:--</div>
                                            <div class="timer-progress-bg" style="width: 100%; height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-bottom: 6px;">
                                                <div class="timer-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--accent), var(--on)); border-radius: 3px; transition: width 0.5s linear;"></div>
                                            </div>
                                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Zielzeit: ${dateStr}, ${timeStr} Uhr</div>
                                        </div>
                                    `;
                                    const extraTimerData = `data-timer-id="${t.id}" data-timer-title="${escTitle}"`;
                                    html += renderSwipeLinkWrapper(timerContent, t.title, 'timer', t.id, '', '', '', extraTimerData);
                                });
                            }
                            html += `</div>`;
                            widgetDiv.innerHTML = html;
                            if (typeof updateAllCountdowns === 'function') {
                                updateAllCountdowns();
                            }
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
                            } else if (widget.data.widgetType === 'locations_list') {
                                widgetDiv.id = 'widget-locations';
                                if (typeof renderLocationsWidget === 'function') {
                                    renderLocationsWidget(widget.data, widgetDiv);
                                }
                            } else if (widget.data.widgetType === 'photos_gallery') {
                                widgetDiv.id = 'widget-photos';
                                if (typeof renderPhotosWidget === 'function') {
                                    renderPhotosWidget(widget.data, widgetDiv);
                                }
                            } else if (widget.data.widgetType === 'docs_overview') {
                                widgetDiv.id = 'widget-docs';
                                if (typeof renderDocsWidget === 'function') {
                                    renderDocsWidget(widget.data, widgetDiv);
                                }
                            } else if (widget.data.widgetType === 'media_gallery') {
                                widgetDiv.id = 'widget-media';
                                if (typeof renderMediaWidget === 'function') {
                                    renderMediaWidget(widget.data, widgetDiv);
                                }
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
                    } catch (singleWidgetErr) {
                        console.error("Fehler beim Rendern eines Widgets (" + (widget.pluginName || widget.type) + "):", singleWidgetErr);
                    }
                });

                // Append guaranteed bottom scroll spacer for mobile/single-column mode
                const topWidgetsSpacer = document.createElement('div');
                topWidgetsSpacer.className = 'top-widgets-scroll-spacer';
                topWidgetsSpacer.style.cssText = 'height: 180px; min-height: 180px; width: 100%; flex-shrink: 0; pointer-events: none; display: block;';
                topWidgetsContainer.appendChild(topWidgetsSpacer);
                
                // Update navigation badges and visibility based on active plugins
                try {
                    updateBadges(widgets);
                } catch (bErr) {
                    console.error("Fehler beim Aktualisieren der Badges:", bErr);
                }
                
                // Sofort prüfen, ob ein Widget (wie Calendar) Fehler geworfen hat und Authentifizierung fordert
                try {
                    loadAlerts();
                } catch (aErr) {
                    console.error("Fehler bei loadAlerts:", aErr);
                }

                if (typeof updateAllCountdowns === 'function') {
                    updateAllCountdowns();
                }
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

            const timerW = widgets.find(w => w.type === 'timer_list' || w.pluginName === 'Timer');
            const timerCount = (timerW && timerW.data && timerW.data.timers) ? timerW.data.timers.length : 0;
            const drawerTimerBadge = document.getElementById('drawer-timer-badge');
            if (drawerTimerBadge) {
                if (timerCount > 0) {
                    drawerTimerBadge.textContent = timerCount;
                    drawerTimerBadge.style.display = 'inline-block';
                } else {
                    drawerTimerBadge.style.display = 'none';
                }
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


        function isMobileDevice() {
            if (window.Capacitor || window.AndroidWidgetInterface) return true;
            const ua = navigator.userAgent || navigator.vendor || window.opera || '';
            return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
        }

        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.isComposing) return;

                // Auf dem PC: Enter schickt ab, Shift+Enter erzeugt eine neue Zeile
                // Auf dem Handy: Enter erzeugt wie bisher eine neue Zeile
                if (!isMobileDevice()) {
                    if (!e.shiftKey) {
                        e.preventDefault();
                        if (typeof sendMessage === 'function') {
                            sendMessage();
                        }
                        if (userInput) {
                            userInput.focus();
                        }
                        return;
                    }
                }

                // Shift+Enter auf dem PC oder normales Enter auf dem Handy:
                // Browser fügt Zeilenumbruch ein und Input wird angepasst
                setTimeout(autoResizeInput, 0);
            }
        });


        userInput.addEventListener('input', autoResizeInput);


        updateInputRowButtons();



        // Plus button and file input listeners
        // plusBtn in core.js


        // fileInput in core.js



        async function initializeApp() {
            let username = localStorage.getItem('api_username');
            let password = localStorage.getItem('api_password');
            
            const isLocalhost = window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

            if ((!username || !password) && isLocalhost) {
                username = username || 'admin';
                password = password || 'local';
                localStorage.setItem('api_username', username);
                localStorage.setItem('api_password', password);
            }

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

            if (window.AppRouter && typeof window.AppRouter.init === 'function') {
                await window.AppRouter.init();
            }
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

        // =========================================================================
        // Universal Pull-to-Refresh (Swipe Down at Top of Any View)
        // =========================================================================
        function initPullToRefresh() {
            if (document.getElementById('pull-to-refresh-indicator')) return;

            const indicator = document.createElement('div');
            indicator.id = 'pull-to-refresh-indicator';
            indicator.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
            `;
            document.body.appendChild(indicator);
            const iconSvg = indicator.querySelector('svg');

            let startY = 0;
            let startX = 0;
            let currentPull = 0;
            let isPulling = false;
            let isRefreshing = false;
            let activeScrollEl = null;

            const PULL_THRESHOLD = 72;
            const MAX_PULL = 125;

            function getActiveScrollableContainer(target) {
                // Ignore pulls starting inside open popup modals, inputs, or the side drawer
                if (!target || target.closest('#mobile-drawer, .glass-card[id$="-modal"]:not(#mail-read-modal), .input-area, input, textarea, select')) {
                    return null;
                }

                const setSec = document.getElementById('settings-section');
                if (setSec && setSec.style.display !== 'none' && target.closest('#settings-section')) {
                    return setSec.querySelector('.settings-body') || setSec;
                }

                const histSec = document.getElementById('history-section');
                if (histSec && histSec.style.display !== 'none' && target.closest('#history-section')) {
                    return document.getElementById('history-list') || histSec;
                }

                if (document.body.classList.contains('view-chat') && target.closest('#chat-box')) {
                    return document.getElementById('chat-box');
                }

                const topPanel = document.querySelector('.top-panel');
                if (topPanel && target.closest('.top-panel')) {
                    return topPanel;
                }

                return null;
            }

            async function performActiveViewRefresh() {
                const setSec = document.getElementById('settings-section');
                if (setSec && setSec.style.display !== 'none') {
                    if (typeof loadSettings === 'function') await loadSettings();
                    if (typeof loadRegisteredToolsOverview === 'function') await loadRegisteredToolsOverview();
                    return;
                }

                const histSec = document.getElementById('history-section');
                if (histSec && histSec.style.display !== 'none') {
                    if (typeof loadHistory === 'function') await loadHistory();
                    return;
                }

                if (document.body.classList.contains('view-chat')) {
                    if (window.currentConversationId && typeof loadConversation === 'function') {
                        await loadConversation(window.currentConversationId);
                    }
                    await loadTopWidgets();
                    return;
                }

                // Mail-Ansicht: E-Mails vom Server synchronisieren (wie früher der Sync-Button)
                if (document.body.classList.contains('view-mail')) {
                    if (document.body.classList.contains('mail-read-active') && window.currentReadMailId && typeof openMailReadModal === 'function') {
                        await openMailReadModal(window.currentReadMailId);
                    } else if (typeof syncAllMailsManual === 'function') {
                        await syncAllMailsManual(false);
                    } else {
                        await loadTopWidgets();
                    }
                    return;
                }

                // Kalender: Timeline-Cache für den aktuellen Tag leeren und neu laden
                if (document.body.classList.contains('view-calendar') || document.body.classList.contains('view-dashboard')) {
                    if (window.calendarTimelineCache) {
                        window.calendarTimelineCache = {};
                    }
                    await loadTopWidgets();
                    return;
                }

                // Orte
                if (document.body.classList.contains('view-locations') && typeof refreshLocationsData === 'function') {
                    await refreshLocationsData();
                    await loadTopWidgets();
                    return;
                }

                // Fotos / Dokumente / Medien
                if ((document.body.classList.contains('view-photos') || document.body.classList.contains('view-docs') || document.body.classList.contains('view-media')) && typeof refreshMediaData === 'function') {
                    await refreshMediaData();
                    await loadTopWidgets();
                    return;
                }

                // Alle anderen Ansichten (insb. Agent-Briefing, Projekte, Personen, Timer, Aufgaben)
                await loadTopWidgets();
            }

            document.addEventListener('touchstart', (e) => {
                if (isRefreshing || e.touches.length !== 1) return;
                const scrollEl = getActiveScrollableContainer(e.target);
                if (!scrollEl || scrollEl.scrollTop > 2) {
                    activeScrollEl = null;
                    isPulling = false;
                    return;
                }
                activeScrollEl = scrollEl;
                startY = e.touches[0].clientY;
                startX = e.touches[0].clientX;
                currentPull = 0;
                isPulling = false;
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (isRefreshing || !activeScrollEl || e.touches.length !== 1) return;
                if (activeScrollEl.scrollTop > 2) {
                    if (isPulling) {
                        isPulling = false;
                        indicator.classList.remove('dragging', 'ready');
                        indicator.style.transform = 'translate(-50%, -80px) scale(0.6)';
                        indicator.style.opacity = '0';
                    }
                    return;
                }

                const dy = e.touches[0].clientY - startY;
                const dx = Math.abs(e.touches[0].clientX - startX);

                if (dy <= 8) return;
                if (!isPulling && dx > dy) {
                    // Horizontal swipe (e.g. swipe-to-link or day navigation), ignore pull-to-refresh
                    activeScrollEl = null;
                    return;
                }

                isPulling = true;
                if (e.cancelable) {
                    e.preventDefault();
                }

                // gedämpfte Zugkurve wie in nativen Apps
                currentPull = Math.min(MAX_PULL, Math.pow(dy, 0.82) * 1.65);
                const progress = Math.min(1, currentPull / PULL_THRESHOLD);
                const topOffset = document.body.classList.contains('mobile-mode') ? 54 : 16;
                const translateY = -60 + (currentPull * 0.75) + (topOffset * progress * 0.5);

                indicator.classList.add('dragging');
                indicator.classList.toggle('ready', currentPull >= PULL_THRESHOLD);
                indicator.style.opacity = String(Math.min(1, progress * 1.15));
                indicator.style.transform = `translate(-50%, ${translateY}px) scale(${0.65 + progress * 0.35})`;
                if (iconSvg) {
                    iconSvg.style.transform = `rotate(${currentPull * 3.2}deg)`;
                }
            }, { passive: false });

            async function finishPull() {
                if (!isPulling || isRefreshing) return;
                isPulling = false;
                indicator.classList.remove('dragging');

                if (currentPull >= PULL_THRESHOLD) {
                    isRefreshing = true;
                    const restY = document.body.classList.contains('mobile-mode') ? 56 : 20;
                    indicator.classList.remove('ready');
                    indicator.classList.add('refreshing');
                    indicator.style.opacity = '1';
                    indicator.style.transform = `translate(-50%, ${restY}px) scale(1)`;

                    try {
                        await performActiveViewRefresh();
                    } catch (err) {
                        console.error('Pull-to-refresh Fehler:', err);
                    } finally {
                        setTimeout(() => {
                            indicator.classList.remove('refreshing');
                            indicator.style.opacity = '0';
                            indicator.style.transform = 'translate(-50%, -80px) scale(0.6)';
                            isRefreshing = false;
                            currentPull = 0;
                        }, 220);
                    }
                } else {
                    indicator.classList.remove('ready');
                    indicator.style.opacity = '0';
                    indicator.style.transform = 'translate(-50%, -80px) scale(0.6)';
                    currentPull = 0;
                }
                activeScrollEl = null;
            }

            document.addEventListener('touchend', finishPull, { passive: true });
            document.addEventListener('touchcancel', finishPull, { passive: true });
        }

        initPullToRefresh();