

        function renderBriefingWidget(widgets, container) {
            // Cache current state for instant re-rendering on filter/tab switches
            window.lastBriefingWidgets = widgets;
            window.lastBriefingContainer = container;

            // 1. Agent-Benachrichtigungen / Handlungsbedarf
            const notifWidget = widgets.find(w => w.pluginName === 'Notifications' || w.type === 'agent_notifications');
            const allNotifications = (notifWidget && notifWidget.data && notifWidget.data.notifications) ? notifWidget.data.notifications : [];
            const allActiveNotifs = allNotifications.filter(n => !n.isDismissed);
            const allHistoryNotifs = allNotifications.filter(n => n.isDismissed);

            // 2. Build Agent Registry with Counts (strictly the 3 canonical configured agents)
            const agentsMap = {};
            const canonicalList = (typeof CANONICAL_AGENTS === 'object' && CANONICAL_AGENTS) ? CANONICAL_AGENTS : {
                mail: { id: 'mail', name: 'E-Mail Agent', avatar: '✉️', color: '#fab387' },
                discord: { id: 'discord', name: 'Discord Bot Agent', avatar: '🌐', color: '#89b4fa' },
                default: { id: 'default', name: 'Haupt-Assistent (Web / App)', avatar: '🤖', color: '#cba6f7' }
            };

            const sourceSettings = (typeof currentAgentSettings === 'object' && currentAgentSettings && Object.keys(currentAgentSettings).length > 0)
                ? currentAgentSettings
                : canonicalList;

            // Strictly register the 3 configured agents:
            ['mail', 'discord', 'default'].forEach(key => {
                const conf = sourceSettings[key] || canonicalList[key];
                if (!conf || conf.isEnabled === false) return;
                agentsMap[key] = {
                    id: key,
                    name: conf.name || canonicalList[key].name,
                    avatar: (conf.avatar || canonicalList[key].avatar || '🤖').replace(/^\?\?$/, '🤖'),
                    color: conf.color || canonicalList[key].color || '#89b4fa',
                    activeCount: 0,
                    historyCount: 0,
                    totalCount: 0
                };
            });

            // 2b. Map all notifications strictly to the 3 canonical agents & accumulate counts
            allNotifications.forEach(n => {
                const info = getNotifAgentInfo(n);
                const targetId = agentsMap[info.id] ? info.id : 'default';
                if (!agentsMap[targetId]) return;

                if (n.isDismissed) {
                    agentsMap[targetId].historyCount++;
                } else {
                    agentsMap[targetId].activeCount++;
                }
                agentsMap[targetId].totalCount++;
            });

            // 2c. Stable canonical order for filter pills: Mail, Discord, Haupt-Assistent
            const sortedAgents = ['mail', 'discord', 'default']
                .filter(k => Boolean(agentsMap[k]))
                .map(k => agentsMap[k]);

            // 3. Current active filter & tab
            let currentFilter = window.currentBriefingAgentFilter || 'all';
            const currentTab = window.currentBriefingTab || 'active';

            // If selected filter agent no longer exists, reset to 'all'
            if (currentFilter !== 'all' && !agentsMap[currentFilter]) {
                currentFilter = 'all';
                window.currentBriefingAgentFilter = 'all';
            }
            const selectedAgent = currentFilter !== 'all' ? agentsMap[currentFilter] : null;

            // 4. Filter notifications according to selected agent
            const filteredActiveNotifs = currentFilter === 'all'
                ? allActiveNotifs
                : allActiveNotifs.filter(n => getNotifAgentInfo(n).id === currentFilter);

            const filteredHistoryNotifs = currentFilter === 'all'
                ? allHistoryNotifs
                : allHistoryNotifs.filter(n => getNotifAgentInfo(n).id === currentFilter);

            // 5. Total count for 'Alle' pill based on current subtab
            const allPillCount = currentTab === 'active' ? allActiveNotifs.length : allHistoryNotifs.length;

            let html = `
                <div class="arbeitstisch-dashboard briefing-dashboard">
                    <div style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <!-- Agent Filter Bar (Nur Profilbilder / Avatare) -->
                        <div class="briefing-agent-filter-wrapper" style="padding-top: 0;">
                            <div class="briefing-agent-filter-bar">
                                <!-- Alle Pill -->
                                <button type="button" 
                                        onclick="switchBriefingAgentFilter('all')" 
                                        class="briefing-agent-filter-pill ${currentFilter === 'all' ? 'active' : ''}"
                                        title="Alle Agenten"
                                        style="${currentFilter === 'all' ? 'border-color: #cba6f7; background: rgba(203, 166, 247, 0.2); color: #ffffff; box-shadow: 0 0 12px rgba(203, 166, 247, 0.25);' : ''}">
                                    <span class="agent-avatar-icon">✨</span>
                                    <span class="briefing-agent-filter-count ${allActiveNotifs.length > 0 && currentTab === 'active' ? 'has-active' : ''}"
                                          style="${currentFilter === 'all' ? 'background: #cba6f7; color: #11111b; font-weight: 800;' : ''}">
                                        ${allPillCount}
                                    </span>
                                </button>
            `;

            sortedAgents.forEach(ag => {
                const isSelected = currentFilter === ag.id;
                const pillCount = currentTab === 'active' ? ag.activeCount : ag.historyCount;
                const agColor = ag.color || '#89b4fa';
                const hasPending = ag.activeCount > 0 && currentTab === 'active';

                html += `
                    <button type="button" 
                            onclick="switchBriefingAgentFilter('${escapeHtml(ag.id)}')" 
                            class="briefing-agent-filter-pill ${isSelected ? 'active' : ''}"
                            data-agent-id="${escapeHtml(ag.id)}"
                            title="${escapeHtml(ag.name)}"
                            style="${isSelected ? `border-color: ${agColor}; background: ${hexToRgba(agColor, 0.2)}; color: #ffffff; box-shadow: 0 0 12px ${hexToRgba(agColor, 0.3)};` : ''}">
                        <span class="agent-avatar-icon">${ag.avatar}</span>
                        <span class="briefing-agent-filter-count ${hasPending ? 'has-active' : ''}"
                              style="${isSelected ? `background: ${agColor}; color: #11111b; font-weight: 800;` : ''}">
                            ${pillCount}
                        </span>
                    </button>
                `;
            });

            html += `
                            </div>
                        </div>

                        <!-- Filter Tabs: Offen vs Historie -->
                        <div style="display: flex; gap: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px; margin-top: 2px;">
                            <button id="briefing-tab-active" type="button" onclick="switchBriefingTab('active')" class="nav-btn" style="padding: 4px 12px; font-size: 0.78rem; border-radius: 20px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; border: 1px solid ${currentTab === 'active' ? '#cba6f7' : 'rgba(255,255,255,0.1)'}; background: ${currentTab === 'active' ? 'rgba(203, 166, 247, 0.2)' : 'rgba(255,255,255,0.03)'}; color: ${currentTab === 'active' ? '#cba6f7' : 'rgba(255,255,255,0.7)'};">
                                ⚡ Handlungsbedarf
                                <span style="background: ${filteredActiveNotifs.length > 0 ? '#cba6f7' : 'rgba(255,255,255,0.15)'}; color: ${filteredActiveNotifs.length > 0 ? '#11111b' : '#cdd6f4'}; font-size: 0.65rem; padding: 1px 6px; border-radius: 10px; font-weight: 800;">${filteredActiveNotifs.length}</span>
                            </button>
                            <button id="briefing-tab-history" type="button" onclick="switchBriefingTab('history')" class="nav-btn" style="padding: 4px 12px; font-size: 0.78rem; border-radius: 20px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; border: 1px solid ${currentTab === 'history' ? '#cba6f7' : 'rgba(255,255,255,0.1)'}; background: ${currentTab === 'history' ? 'rgba(203, 166, 247, 0.2)' : 'rgba(255,255,255,0.03)'}; color: ${currentTab === 'history' ? '#cba6f7' : 'rgba(255,255,255,0.7)'};">
                                📜 Erledigt / Archiv
                                <span style="background: rgba(255,255,255,0.15); color: #cdd6f4; font-size: 0.65rem; padding: 1px 6px; border-radius: 10px; font-weight: 700;">${filteredHistoryNotifs.length}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Aktive Rückfragen Tab -->
                    <div id="briefing-section-active" style="display: ${currentTab === 'active' ? 'flex' : 'none'}; flex-direction: column; gap: 0;">
            `;

            if (filteredActiveNotifs.length > 0) {
                filteredActiveNotifs.forEach(n => {
                    html += getNotificationCardHtml(n, null, true);
                });
            } else if (currentFilter !== 'all') {
                html += `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 36px 20px; background: rgba(24, 24, 37, 0.6); border: 1px solid rgba(203, 166, 247, 0.2); border-radius: 14px;">
                        <span style="font-size: 2.4rem; line-height: 1;">${selectedAgent ? selectedAgent.avatar : '🤖'}</span>
                        <div>
                            <strong style="font-size: 1.05rem; color: #cdd6f4; display: block; margin-bottom: 4px;">Keine offenen Rückfragen für ${escapeHtml(selectedAgent ? selectedAgent.name : 'diesen Agenten')}</strong>
                            <p style="font-size: 0.8rem; color: rgba(255, 255, 255, 0.7); max-width: 380px; margin: 0 auto;">
                                Dieser Agent hat zurzeit keine offenen Entscheidungen oder Handlungsbedarf.
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 6px;">
                            <button type="button" onclick="switchBriefingAgentFilter('all')" class="nav-btn" style="padding: 6px 14px; font-size: 0.78rem; background: rgba(203, 166, 247, 0.2); color: #cba6f7; border: 1px solid rgba(203, 166, 247, 0.4); border-radius: 8px; cursor: pointer; font-weight: 600;">
                                ✨ Alle Agenten anzeigen
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 36px 20px; background: rgba(24, 24, 37, 0.6); border: 1px solid rgba(166, 227, 161, 0.25); border-radius: 14px;">
                        <span style="font-size: 2.4rem; line-height: 1;">✨</span>
                        <div>
                            <strong style="font-size: 1.05rem; color: #a6e3a1; display: block; margin-bottom: 4px;">Keine offenen Rückfragen</strong>
                            <p style="font-size: 0.8rem; color: rgba(255, 255, 255, 0.7); max-width: 380px; margin: 0 auto;">
                                Deine Agenten arbeiten autonom im Hintergrund. Wenn eine Entscheidung oder Bestätigung erforderlich ist, findest du sie hier.
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 6px;">
                            <button type="button" onclick="switchMobileView('chat')" class="nav-btn" style="padding: 6px 14px; font-size: 0.78rem; background: rgba(203, 166, 247, 0.15); color: #cba6f7; border: 1px solid rgba(203, 166, 247, 0.35); border-radius: 8px; cursor: pointer; font-weight: 600;">
                                💬 Chat öffnen
                            </button>
                        </div>
                    </div>
                `;
            }

            html += `
                    </div>

                    <!-- Historie / Erledigt Tab -->
                    <div id="briefing-section-history" style="display: ${currentTab === 'history' ? 'flex' : 'none'}; flex-direction: column; gap: 0;">
            `;

            if (filteredHistoryNotifs.length > 0) {
                filteredHistoryNotifs.forEach(n => {
                    html += getNotificationCardHtml(n, null, true);
                });
            } else if (currentFilter !== 'all') {
                html += `
                    <div style="padding: 24px; text-align: center; color: rgba(255, 255, 255, 0.65); font-size: 0.82rem; background: rgba(24, 24, 37, 0.4); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <span>Keine archivierten Briefing-Meldungen für <strong>${escapeHtml(selectedAgent ? selectedAgent.name : 'diesen Agenten')}</strong> vorhanden.</span>
                        <button type="button" onclick="switchBriefingAgentFilter('all')" class="nav-btn" style="padding: 4px 10px; font-size: 0.72rem; background: rgba(255,255,255,0.06); color: #cdd6f4; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; cursor: pointer;">
                            ✨ Alle anzeigen
                        </button>
                    </div>
                `;
            } else {
                html += `
                    <div style="padding: 24px; text-align: center; color: rgba(255, 255, 255, 0.5); font-size: 0.82rem; background: rgba(24, 24, 37, 0.4); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 12px;">
                        <span>Keine archivierten Briefing-Meldungen vorhanden.</span>
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


        window.renderBriefingWidget = renderBriefingWidget;



        function switchBriefingAgentFilter(agentId) {
            window.currentBriefingAgentFilter = agentId;
            const container = document.getElementById('widget-briefing') || window.lastBriefingContainer;
            if (window.lastBriefingWidgets && container) {
                renderBriefingWidget(window.lastBriefingWidgets, container);
            }
        }


        window.switchBriefingAgentFilter = switchBriefingAgentFilter;



        function switchBriefingTab(tab) {
            window.currentBriefingTab = tab;
            const container = document.getElementById('widget-briefing') || window.lastBriefingContainer;
            if (window.lastBriefingWidgets && container) {
                renderBriefingWidget(window.lastBriefingWidgets, container);
                return;
            }
            const activeSec = document.getElementById('briefing-section-active');
            const histSec = document.getElementById('briefing-section-history');
            const activeBtn = document.getElementById('briefing-tab-active');
            const histBtn = document.getElementById('briefing-tab-history');
            if (activeSec) activeSec.style.display = tab === 'active' ? 'flex' : 'none';
            if (histSec) histSec.style.display = tab === 'history' ? 'flex' : 'none';
            if (activeBtn) {
                if (tab === 'active') {
                    activeBtn.style.border = '1px solid #cba6f7';
                    activeBtn.style.background = 'rgba(203, 166, 247, 0.2)';
                    activeBtn.style.color = '#cba6f7';
                } else {
                    activeBtn.style.border = '1px solid rgba(255,255,255,0.1)';
                    activeBtn.style.background = 'rgba(255,255,255,0.03)';
                    activeBtn.style.color = 'rgba(255,255,255,0.7)';
                }
            }
            if (histBtn) {
                if (tab === 'history') {
                    histBtn.style.border = '1px solid #cba6f7';
                    histBtn.style.background = 'rgba(203, 166, 247, 0.2)';
                    histBtn.style.color = '#cba6f7';
                } else {
                    histBtn.style.border = '1px solid rgba(255,255,255,0.1)';
                    histBtn.style.background = 'rgba(255,255,255,0.03)';
                    histBtn.style.color = 'rgba(255,255,255,0.7)';
                }
            }
        }


        window.switchBriefingTab = switchBriefingTab;



        function switchArbeitstischNotifTab(tab) {
            window.currentArbeitstischNotifTab = tab;
            const relSec = document.getElementById('arbeitstisch-notif-section-relevant');
            const logSec = document.getElementById('arbeitstisch-notif-section-log');
            const relBtn = document.getElementById('arbeitstisch-tab-relevant');
            const logBtn = document.getElementById('arbeitstisch-tab-log');
            if (relSec) relSec.style.display = tab === 'relevant' ? 'flex' : 'none';
            if (logSec) logSec.style.display = tab === 'log' ? 'flex' : 'none';
            if (relBtn) {
                if (tab === 'relevant') relBtn.classList.add('active');
                else relBtn.classList.remove('active');
            }
            if (logBtn) {
                if (tab === 'log') logBtn.classList.add('active');
                else logBtn.classList.remove('active');
            }
        }


        window.switchArbeitstischNotifTab = switchArbeitstischNotifTab;



        function toggleArbeitstischNotifExpand(notifId, event) {
            if (event) {
                if (event.target.closest('button') || event.target.closest('a') || event.target.closest('input')) {
                    return;
                }
            }
            const detailsEl = document.getElementById(`notif-details-${notifId}`);
            const chevronEl = document.getElementById(`notif-chevron-${notifId}`);
            if (detailsEl) {
                const isHidden = detailsEl.style.display === 'none' || !detailsEl.style.display;
                detailsEl.style.display = isHidden ? 'flex' : 'none';
                if (chevronEl) {
                    chevronEl.textContent = isHidden ? '▴' : '▾';
                }
                if (isHidden) {
                    setTimeout(() => {
                        const notifBox = document.getElementById(`notif-box-${notifId}`);
                        if (notifBox) {
                            notifBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }, 60);
                }
            }
        }


        window.toggleArbeitstischNotifExpand = toggleArbeitstischNotifExpand;



        window.activeProjectDetailId = null;