

        // ==========================================
        // E-Mail System (Web.de & Gmail) Client Logic
        // ==========================================
        let activeMailAccountFilter = null;


        let activeMailCategoryFilter = null;


        let currentMailSearchQuery = '';


        let currentReadMailId = null;


        let currentReadMailData = null;



        function filterMailByAccount(accountId) {
            activeMailAccountFilter = accountId !== null ? Number(accountId) : null;
            loadTopWidgets();
        }


        window.filterMailByAccount = filterMailByAccount;



        function filterMailByCategory(category) {
            activeMailCategoryFilter = category && category !== 'all' && category !== 'Alle' ? category : null;
            if (typeof loadTopWidgets === 'function') {
                loadTopWidgets();
            } else if (window.lastMailData && window.lastMailContainer) {
                renderMailWidget(window.lastMailData, window.lastMailContainer);
            }
        }


        window.filterMailByCategory = filterMailByCategory;

        window.toggleMailFilter = function() {
            window.mailFilterOpen = !window.mailFilterOpen;
            if (!window.mailFilterOpen) {
                activeMailAccountFilter = null;
                activeMailCategoryFilter = null;
            }
            const btn = document.getElementById('header-mail-filter-btn');
            if (btn) {
                if (window.mailFilterOpen) btn.classList.add('active');
                else btn.classList.remove('active');
            }
            const filterContainer = document.getElementById('mail-filter-container');
            if (filterContainer) {
                filterContainer.style.display = window.mailFilterOpen ? 'flex' : 'none';
            }
            if (!window.mailFilterOpen) {
                if (typeof loadTopWidgets === 'function') {
                    loadTopWidgets();
                } else if (window.lastMailData && window.lastMailContainer) {
                    renderMailWidget(window.lastMailData, window.lastMailContainer);
                }
            }
        };




        function filterMailBySearch(query) {
            currentMailSearchQuery = query || '';
            loadTopWidgets();
        }


        window.filterMailBySearch = filterMailBySearch;



        function renderMailWidget(data, container) {
            window.lastMailData = data;
            window.lastMailContainer = container;

            const accounts = data.accounts || [];
            const rawEmails = data.emails || [];
            const categories = data.categories || [];

            // 1. Filter nach Konto
            let filteredEmails = rawEmails;
            if (activeMailAccountFilter !== null) {
                filteredEmails = filteredEmails.filter(e => Number(e.accountId) === Number(activeMailAccountFilter));
            }

            // 2. Filter nach Kategorie (unterstützt kommaseparierte Mehrfach-Kategorien)
            if (activeMailCategoryFilter !== null) {
                const targetCat = activeMailCategoryFilter.toLowerCase().trim();
                filteredEmails = filteredEmails.filter(e => {
                    if (!e.category) return false;
                    const cats = e.category.split(',').map(c => c.trim().toLowerCase());
                    return cats.includes(targetCat);
                });
            }

            // 3. Filter nach Textsuche
            if (currentMailSearchQuery && currentMailSearchQuery.trim()) {
                const q = currentMailSearchQuery.toLowerCase().trim();
                filteredEmails = filteredEmails.filter(e => 
                    (e.subject && e.subject.toLowerCase().includes(q)) ||
                    (e.from && e.from.toLowerCase().includes(q)) ||
                    (e.fromName && e.fromName.toLowerCase().includes(q)) ||
                    (e.personName && e.personName.toLowerCase().includes(q)) ||
                    (e.category && e.category.toLowerCase().includes(q)) ||
                    (e.snippet && e.snippet.toLowerCase().includes(q)) ||
                    (e.accountEmail && e.accountEmail.toLowerCase().includes(q))
                );
            }

            let html = `<div style="text-align: left; padding: 0 0 15px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 10px;">`;

            // 1. Empty State falls keine Konten
            if (accounts.length === 0) {
                html += `
                    <div style="padding: 20px 15px; text-align: center; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; margin-top: 5px;">
                        <div style="font-size: 2rem; margin-bottom: 8px;">📬</div>
                        <strong style="color: var(--accent); font-size: 0.9rem; display: block; margin-bottom: 4px;">Noch kein E-Mail-Konto hinterlegt</strong>
                        <p style="font-size: 0.75rem; opacity: 0.7; margin: 0 0 12px 0; line-height: 1.4;">Verbinde deine Web.de- oder Gmail-Adresse, um E-Mails direkt in der App zu lesen und zu beantworten.</p>
                        <button onclick="openMailAccountFormModal()" class="save" style="padding: 8px 16px; font-size: 0.8rem; border-radius: 6px; border: none; cursor: pointer; background: var(--accent); color: #11111b; font-weight: bold;">
                            ➕ Web.de / Gmail Konto verbinden
                        </button>
                    </div>
                </div>`;
                container.innerHTML = html;
                return;
            }

            const isMailFilterOpen = Boolean(window.mailFilterOpen);
            const mailFilterBtn = document.getElementById('header-mail-filter-btn');
            if (mailFilterBtn) {
                if (isMailFilterOpen) mailFilterBtn.classList.add('active');
                else mailFilterBtn.classList.remove('active');
            }

            html += `<div id="mail-filter-container" class="mail-filter-container" style="display: ${isMailFilterOpen ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">`;

            // 2. Postfach-Pills (Konto-Filter)
            html += `<div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 3px; scrollbar-width: none;">`;
            const allActiveStyle = activeMailAccountFilter === null ? 'background: var(--accent); color: #11111b; font-weight: bold; border-color: var(--accent);' : 'background: rgba(255,255,255,0.04); color: var(--text); border-color: rgba(255,255,255,0.1);';
            html += `<button onclick="filterMailByAccount(null)" class="nav-btn" style="flex: 0 0 auto; height: 28px; font-size: 0.78rem; padding: 0 11px; border-radius: 14px; ${allActiveStyle}">Alle Konten (${rawEmails.length})</button>`;
            
            accounts.forEach(acc => {
                const isSelected = Number(activeMailAccountFilter) === Number(acc.id);
                const color = acc.color || '#89b4fa';
                const pillStyle = isSelected ? `background: ${color}; color: #11111b; font-weight: bold; border-color: ${color};` : `background: rgba(255,255,255,0.04); color: var(--text); border-color: rgba(255,255,255,0.1);`;
                const icon = acc.email.toLowerCase().includes('web.de') ? '🟠' : (acc.email.toLowerCase().includes('gmail') ? '🔴' : '✉️');
                html += `<button onclick="filterMailByAccount(${acc.id})" class="nav-btn" style="flex: 0 0 auto; height: 28px; font-size: 0.78rem; padding: 0 11px; border-radius: 14px; ${pillStyle}">${icon} ${escapeHtml(acc.email)}</button>`;
            });
            html += `</div>`;

            // 3. Kategorie-Pills
            // Alle Kategorien aus data.categories und aus den aktuellen E-Mails zusammenfassen
            const catMap = new Map();
            (categories || []).forEach(cat => {
                const name = typeof cat === 'object' ? cat.name : cat;
                const icon = (typeof cat === 'object' && cat.icon) ? cat.icon : '🏷️';
                if (name) catMap.set(name.toLowerCase().trim(), { name, icon });
            });
            rawEmails.forEach(e => {
                if (e.category) {
                    e.category.split(',').forEach(c => {
                        const trimmed = c.trim();
                        if (trimmed && !catMap.has(trimmed.toLowerCase())) {
                            const icon = trimmed.toLowerCase().includes('wichtig') ? '⭐' : (trimmed.toLowerCase().includes('persönlich') || trimmed.toLowerCase().includes('privat') ? '👤' : (trimmed.toLowerCase().includes('termin') ? '📅' : (trimmed.toLowerCase().includes('rechnung') ? '🧾' : (trimmed.toLowerCase().includes('finanz') ? '💰' : (trimmed.toLowerCase().includes('arbeit') ? '💼' : (trimmed.toLowerCase().includes('newsletter') ? '📰' : (trimmed.toLowerCase().includes('spam') ? '🚫' : '🏷️')))))));
                            catMap.set(trimmed.toLowerCase(), { name: trimmed, icon });
                        }
                    });
                }
            });
            const allAvailableCategories = Array.from(catMap.values());

            if (allAvailableCategories.length > 0) {
                html += `<div style="display: flex; gap: 5px; overflow-x: auto; padding-bottom: 3px; scrollbar-width: none;">`;
                const isAllCatSelected = activeMailCategoryFilter === null;
                const allCatStyle = isAllCatSelected ? 'background: rgba(137, 180, 250, 0.25); color: var(--accent); font-weight: bold; border: 1px solid var(--accent);' : 'background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.06);';
                html += `<button onclick="filterMailByCategory(null)" class="nav-btn" style="flex: 0 0 auto; height: 26px; font-size: 0.74rem; padding: 0 9px; border-radius: 8px; ${allCatStyle}">🏷️ Alle</button>`;
                
                allAvailableCategories.forEach(cat => {
                    const catName = cat.name;
                    const catIcon = cat.icon || '🏷️';
                    const isCatSelected = activeMailCategoryFilter && activeMailCategoryFilter.toLowerCase().trim() === catName.toLowerCase().trim();
                    const catStyle = isCatSelected ? 'background: rgba(137, 180, 250, 0.25); color: var(--accent); font-weight: bold; border: 1px solid var(--accent);' : 'background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.06);';
                    html += `<button onclick="filterMailByCategory('${escapeHtml(catName)}')" class="nav-btn" style="flex: 0 0 auto; height: 26px; font-size: 0.74rem; padding: 0 9px; border-radius: 8px; ${catStyle}">${catIcon} ${escapeHtml(catName)}</button>`;
                });
                html += `</div>`;
            }
            html += `</div>`; // closes mail-filter-container

            // 4. Emails List
            if (filteredEmails.length === 0) {
                html += `
                    <div style="padding: 24px 15px; text-align: center; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.12); border-radius: 8px; margin: 10px 0;">
                        <span style="font-size: 1.6rem; display: block; margin-bottom: 6px;">📬</span>
                        <p style="font-size: 0.85rem; opacity: 0.75; margin: 0 0 12px 0;">Keine passenden E-Mails im Posteingang vorhanden.</p>
                        <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                            <button type="button" onclick="injectTestMail('question')" class="nav-btn" style="padding: 6px 12px; font-size: 0.74rem; background: rgba(203, 166, 247, 0.15); color: #cba6f7; border: 1px solid rgba(203, 166, 247, 0.35); border-radius: 6px; cursor: pointer; font-weight: 600;" title="Erzeugt eine Test-Mail mit Terminanfrage (z.B. Keramik bemalen)">
                                🧪 Test-Terminanfrage einspielen
                            </button>
                            <button type="button" onclick="injectTestMail('spam')" class="nav-btn" style="padding: 6px 12px; font-size: 0.74rem; background: rgba(166, 227, 161, 0.12); color: #a6e3a1; border: 1px solid rgba(166, 227, 161, 0.3); border-radius: 6px; cursor: pointer; font-weight: 600;" title="Erzeugt eine Test-Werbemail, die vom Agenten gefiltert wird">
                                🛡️ Test-Werbung (Filterung)
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `<div style="display: flex; flex-direction: column; gap: 7px;">`;
                filteredEmails.forEach(e => {
                    const escSubject = escapeHtml(e.subject || '(Kein Betreff)').replace(/'/g, "\\'");
                    const unreadBadge = !e.isRead ? `<span style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent); display: inline-block; margin-right: 5px; flex-shrink: 0;" title="Ungelesen"></span>` : '';
                    const unreadBg = !e.isRead ? 'rgba(137, 180, 250, 0.08)' : 'rgba(255,255,255,0.02)';
                    const unreadBorder = !e.isRead ? 'rgba(137, 180, 250, 0.25)' : 'rgba(255,255,255,0.05)';
                    const subjectWeight = !e.isRead ? '700' : '500';
                    const subjectColor = !e.isRead ? '#ffffff' : 'var(--text)';

                    const accColor = e.accountColor || '#89b4fa';
                    const accIcon = e.accountEmail.toLowerCase().includes('web.de') ? '🟠' : (e.accountEmail.toLowerCase().includes('gmail') ? '🔴' : '✉️');

                    const dateObj = new Date(e.date);
                    const isToday = getLocalDateString(dateObj) === getLocalDateString();
                    const dateStr = isToday ? dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

                    const attachBadge = e.hasAttachments ? ` <span style="font-size: 0.75rem;" title="Mit Anhang">📎</span>` : '';

                    // Person Badge (nur anzeigen, wenn zugeordnet)
                    let personHtml = '';
                    if (e.personId && e.personName) {
                        personHtml = `
                            <span onclick="event.stopPropagation(); openPersonProfileModal(${e.personId})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.74rem; font-weight: 700; color: #cba6f7; background: rgba(203, 166, 247, 0.12); border: 1px solid rgba(203, 166, 247, 0.3); padding: 2px 7px; border-radius: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(203, 166, 247, 0.25)'" onmouseout="this.style.background='rgba(203, 166, 247, 0.12)'" title="Personenprofil im Gedächtnis öffnen">
                                👤 ${escapeHtml(e.personName)}
                            </span>
                        `;
                    }

                    // Kategorie-Badges (nur anzeigen, wenn vorhanden)
                    let catHtml = '';
                    const mailCats = (e.category || '').split(',').map(c => c.trim()).filter(Boolean);
                    if (mailCats.length > 0) {
                        catHtml = `<div style="display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;">`;
                        mailCats.forEach(catName => {
                            const matchedCat = categories.find(c => (typeof c === 'object' ? c.name : c).toLowerCase() === catName.toLowerCase());
                            const catIcon = (matchedCat && typeof matchedCat === 'object' && matchedCat.icon) ? matchedCat.icon : '🏷️';
                            catHtml += `
                                <span onclick="event.stopPropagation(); filterMailByCategory('${escapeHtml(catName)}')" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.72rem; color: var(--accent); background: rgba(137, 180, 250, 0.08); border: 1px solid rgba(137, 180, 250, 0.2); padding: 2px 7px; border-radius: 6px; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.background='rgba(137, 180, 250, 0.2)'" onmouseout="this.style.background='rgba(137, 180, 250, 0.08)'" title="Nach dieser Kategorie filtern">
                                    ${catIcon} ${escapeHtml(catName)}
                                </span>
                            `;
                        });
                        catHtml += `</div>`;
                    }

                    // Agent Chat Icon-Button oben rechts (falls Agent Run vorhanden)
                    let agentChatBtnHtml = '';
                    if (e.agentRunId) {
                        agentChatBtnHtml = `
                            <button type="button" class="nav-btn" onclick="openAgentChatForMail(event, ${e.id}, '${e.agentRunId}')" style="width: 22px; height: 22px; padding: 0; display: inline-flex; align-items: center; justify-content: center; background: rgba(203, 166, 247, 0.15); color: #cba6f7; border: 1px solid rgba(203, 166, 247, 0.4); border-radius: 6px; cursor: pointer; transition: all 0.15s; flex-shrink: 0;" onmouseover="this.style.background='rgba(203, 166, 247, 0.3)'" onmouseout="this.style.background='rgba(203, 166, 247, 0.15)'" title="Agent-Chat öffnen">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </button>
                        `;
                    }

                    const metaTagsHtml = (personHtml || catHtml) ? `
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            ${personHtml}
                            ${catHtml}
                        </div>
                    ` : '';

                    const mailContent = `
                        <div class="mail-item-card" data-mail-card-id="${e.id}" style="display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 8px; background: ${unreadBg}; border: 1px solid ${unreadBorder}; border-left: 3.5px solid ${accColor}; cursor: pointer; width: 100%; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='${unreadBg}'">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                                    ${unreadBadge}
                                    <span style="font-size: 0.92rem; font-weight: 600; color: ${subjectColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${escapeHtml(e.fromName || e.from)}
                                    </span>
                                    ${attachBadge}
                                </div>
                                <div style="display: flex; align-items: center; gap: 5px; flex-shrink: 0;">
                                    <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 10px; background: rgba(255,255,255,0.05); color: ${accColor}; border: 1px solid ${accColor};" title="Empfangen auf: ${escapeHtml(e.accountEmail)}">
                                        ${accIcon} ${escapeHtml(e.accountEmail)}
                                    </span>
                                    ${agentChatBtnHtml}
                                    <span style="font-size: 0.74rem; opacity: 0.6; margin-left: 2px;">${dateStr}</span>
                                </div>
                            </div>

                            <div style="font-size: 0.88rem; font-weight: ${subjectWeight}; color: ${subjectColor}; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
                                ${escapeHtml(e.subject || '(Kein Betreff)')}
                            </div>

                            <!-- Person & Kategorie Meta Tags (nur wenn vorhanden) -->
                            ${metaTagsHtml}

                            ${e.snippet ? `<div style="font-size: 0.80rem; opacity: 0.72; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(e.snippet)}</div>` : ''}
                        </div>
                    `;
                    const escMailSubject = escapeHtml(e.subject || '(Kein Betreff)').replace(/"/g, '&quot;');
                    const extraMailData = `data-mail-id="${e.id}" data-mail-subject="${escMailSubject}" data-mail-is-read="${!!e.isRead}" data-mail-category="${escapeHtml(e.category || '').replace(/"/g, '&quot;')}" data-mail-person-id="${e.personId || ''}"`;
                    html += renderSwipeLinkWrapper(mailContent, e.subject || '(Kein Betreff)', 'mail', e.id, '', '', '', extraMailData);
                });
                html += `</div>`;
            }

            html += `</div>`;
            container.innerHTML = html;
        }



        async function syncAllMailsManual(fullSync = false) {
            const syncBtn = document.getElementById('mail-sync-btn');
            const headerSyncBtn = document.getElementById('header-mail-sync-btn');
            const fullSyncBtn = document.getElementById('mail-settings-fullsync-btn');
            
            if (headerSyncBtn) {
                headerSyncBtn.classList.add('spin-anim');
            }
            if (fullSync) {
                if (fullSyncBtn) {
                    fullSyncBtn.disabled = true;
                    fullSyncBtn.innerHTML = '⏳ Voll-Sync läuft...';
                }
            } else {
                if (syncBtn) {
                    syncBtn.innerHTML = '⏳ Rufe ab...';
                    syncBtn.style.opacity = '0.7';
                }
            }

            try {
                const res = await fetch(getApiUrl('/api/mail/sync'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullSync })
                });
                const data = await res.json();
                if (data && data.success) {
                    console.log(`[Mail] Sync beendet. ${data.totalSynced} E-Mails synchronisiert.`);
                    if (fullSync) {
                        alert(`✅ Voll-Synchronisation erfolgreich abgeschlossen!\n\n${data.totalSynced} E-Mails synchronisiert.`);
                    }
                }
            } catch (err) {
                console.error("[Mail] Sync Fehler:", err);
                if (fullSync) {
                    alert(`Fehler beim Voll-Sync: ${err.message}`);
                }
            } finally {
                if (headerSyncBtn) {
                    headerSyncBtn.classList.remove('spin-anim');
                }
                if (syncBtn) {
                    syncBtn.innerHTML = '🔄 Sync';
                    syncBtn.style.opacity = '1';
                }
                if (fullSyncBtn) {
                    fullSyncBtn.disabled = false;
                    fullSyncBtn.innerHTML = '⚡ Voll-Sync starten';
                }
                loadTopWidgets();
            }
        }


        window.syncAllMailsManual = syncAllMailsManual;



        async function toggleSingleMailReadStatus(id, isRead) {
            try {
                if (isRead) {
                    dismissMailNotification(id);
                }
                await fetch(getApiUrl(`/api/mail/messages/${id}/read`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isRead })
                });
                loadTopWidgets();
            } catch (e) {
                console.error("[Mail] Fehler beim Ändern des Gelesen-Status:", e);
            }
        }


        window.toggleSingleMailReadStatus = toggleSingleMailReadStatus;



        // ==========================================
        // Mail Dark Mode & Gmail-Style Auto-Fit Engine
        // ==========================================
        let mailViewDarkMode = true;


        let mailBodyResizeObserver = null;



        function parseEmailColor(str) {
            if (!str || typeof str !== 'string') return null;
            str = str.trim().toLowerCase();
            if (str === 'transparent' || str === 'inherit' || str === 'initial' || str === 'none') return null;
            if (str === 'white') return { r: 255, g: 255, b: 255, a: 1 };
            if (str === 'black') return { r: 0, g: 0, b: 0, a: 1 };

            // Hex format #rgb, #rgba, #rrggbb, #rrggbbaa
            const hexMatch = str.match(/^#([0-9a-f]{3,8})$/i);
            if (hexMatch) {
                let h = hexMatch[1];
                if (h.length === 3 || h.length === 4) {
                    h = h.split('').map(c => c + c).join('');
                }
                const r = parseInt(h.substring(0, 2), 16);
                const g = parseInt(h.substring(2, 4), 16);
                const b = parseInt(h.substring(4, 6), 16);
                const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
                return { r, g, b, a };
            }

            // RGB / RGBA format
            const rgbMatch = str.match(/rgba?\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]+([\d.]+))?\s*\)/i);
            if (rgbMatch) {
                return {
                    r: parseInt(rgbMatch[1], 10),
                    g: parseInt(rgbMatch[2], 10),
                    b: parseInt(rgbMatch[3], 10),
                    a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1
                };
            }
            return null;
        }



        function getEmailColorMetrics(color) {
            if (!color || color.a < 0.15) return { brightness: 0, saturation: 0, isTransparent: true };
            const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
            const max = Math.max(color.r, color.g, color.b);
            const min = Math.min(color.r, color.g, color.b);
            const saturation = max === 0 ? 0 : (max - min) / max;
            return { brightness, saturation, isTransparent: false };
        }



        function applyEmailDarkMode(containerEl, isDark = true) {
            if (!containerEl) return;
            const bodyContainer = document.getElementById('mail-read-body');
            if (bodyContainer) {
                if (isDark) {
                    bodyContainer.classList.remove('original-theme');
                    bodyContainer.style.background = '#14141e';
                    bodyContainer.style.color = '#cdd6f4';
                } else {
                    bodyContainer.classList.add('original-theme');
                    bodyContainer.style.background = '#ffffff';
                    bodyContainer.style.color = '#1f2328';
                }
            }

            const elements = containerEl.querySelectorAll('*');
            elements.forEach(el => {
                if (!el.dataset.emailProcessed) {
                    el.dataset.emailProcessed = 'true';
                    if (el.style.backgroundColor) el.dataset.origBg = el.style.backgroundColor;
                    if (el.style.background) el.dataset.origBackground = el.style.background;
                    if (el.style.color) el.dataset.origColor = el.style.color;
                    if (el.style.borderColor) el.dataset.origBorder = el.style.borderColor;
                    if (el.hasAttribute('bgcolor')) el.dataset.origBgcolor = el.getAttribute('bgcolor');
                    if (el.hasAttribute('color')) el.dataset.origColorAttr = el.getAttribute('color');
                }

                if (!isDark) {
                    // Revert to original
                    if (el.dataset.origBg) el.style.backgroundColor = el.dataset.origBg;
                    else el.style.removeProperty('background-color');
                    if (el.dataset.origBackground) el.style.background = el.dataset.origBackground;
                    else el.style.removeProperty('background');
                    if (el.dataset.origColor) el.style.color = el.dataset.origColor;
                    else el.style.removeProperty('color');
                    if (el.dataset.origBorder) el.style.borderColor = el.dataset.origBorder;
                    else el.style.removeProperty('border-color');
                    if (el.dataset.origBgcolor) el.setAttribute('bgcolor', el.dataset.origBgcolor);
                    if (el.dataset.origColorAttr) el.setAttribute('color', el.dataset.origColorAttr);
                    return;
                }

                // 1. bgcolor Attribute (Legacy HTML email tables)
                if (el.hasAttribute('bgcolor')) {
                    const c = parseEmailColor(el.getAttribute('bgcolor'));
                    const m = getEmailColorMetrics(c);
                    if (m.brightness > 140 || (m.brightness > 115 && m.saturation < 0.35)) {
                        const hasRadius = (el.style.borderRadius && parseFloat(el.style.borderRadius) > 0) || (el.getAttribute('style') && el.getAttribute('style').includes('border-radius'));
                        if (hasRadius) {
                            el.setAttribute('bgcolor', '#1e1e28');
                            el.style.backgroundColor = '#1e1e28';
                        } else {
                            el.setAttribute('bgcolor', 'transparent');
                            el.style.backgroundColor = 'transparent';
                        }
                    }
                }

                // 2. Background Color (Inline style)
                const bgStr = el.style.backgroundColor || el.style.background;
                if (bgStr) {
                    const c = parseEmailColor(bgStr);
                    const m = getEmailColorMetrics(c);
                    if (!m.isTransparent) {
                        if (m.brightness > 140 || (m.brightness > 115 && m.saturation < 0.35)) {
                            // Check if this is a card with rounded corners
                            const hasRadius = (el.style.borderRadius && parseFloat(el.style.borderRadius) > 0) || (el.getAttribute('style') && el.getAttribute('style').includes('border-radius'));
                            if (hasRadius) {
                                el.style.backgroundColor = '#1e1e28';
                            } else {
                                el.style.backgroundColor = 'transparent';
                            }
                        }
                    }
                }

                // 3. Text Color (Font tags and inline style)
                if (el.hasAttribute('color')) {
                    const c = parseEmailColor(el.getAttribute('color'));
                    const m = getEmailColorMetrics(c);
                    if (!m.isTransparent && m.brightness < 135) {
                        el.setAttribute('color', '#cdd6f4');
                        el.style.color = '#cdd6f4';
                    }
                }

                const colorStr = el.style.color;
                if (colorStr) {
                    const c = parseEmailColor(colorStr);
                    const m = getEmailColorMetrics(c);
                    if (!m.isTransparent) {
                        if (m.brightness < 135 || (m.brightness < 160 && m.saturation < 0.25)) {
                            const isHeader = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'TH'].includes(el.tagName);
                            el.style.color = isHeader ? '#ffffff' : '#cdd6f4';
                        }
                    }
                }

                // 4. Links Legibility
                if (el.tagName === 'A') {
                    const c = parseEmailColor(el.style.color);
                    const m = getEmailColorMetrics(c);
                    if (m.brightness < 130) {
                        el.style.color = 'var(--accent, #89b4fa)';
                    }
                }

                // 5. Borders: NEVER add borders to layout elements!
                if (el.getAttribute('border') === '0') {
                    el.style.border = 'none';
                    el.style.borderColor = 'transparent';
                } else if (el.style.borderColor) {
                    const c = parseEmailColor(el.style.borderColor);
                    const m = getEmailColorMetrics(c);
                    if (!m.isTransparent && m.brightness > 160) {
                        el.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }
                }

                // 6. Font size normalization: Ensure no tiny text inside email, but preserve zero-pixel spacers
                if (el.style.fontSize) {
                    const fs = el.style.fontSize.trim().toLowerCase();
                    const val = parseFloat(fs);
                    if (val >= 4 && ((fs.endsWith('px') && val < 13) || (fs.endsWith('pt') && val < 9.5) || (fs.endsWith('rem') && val < 0.8))) {
                        el.style.fontSize = '13.5px';
                    }
                }
                if (el.tagName === 'FONT' && el.getAttribute('size')) {
                    const sizeVal = parseInt(el.getAttribute('size'), 10);
                    if (sizeVal > 0 && sizeVal <= 2) {
                        el.removeAttribute('size');
                        el.style.fontSize = '13.5px';
                    }
                }
            });
        }


        window.applyEmailDarkMode = applyEmailDarkMode;



        function normalizeEmailDimensions(containerEl, availableWidth) {
            if (!containerEl || !availableWidth || availableWidth <= 50) return;

            // 1. Images: Guarantee they never exceed viewport width and keep natural proportions
            containerEl.querySelectorAll('img').forEach(img => {
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.boxSizing = 'border-box';
                if (img.style.minWidth && parseFloat(img.style.minWidth) > availableWidth) {
                    img.style.minWidth = '0';
                }
                const attrW = img.getAttribute('width');
                if (attrW && !attrW.includes('%') && parseInt(attrW, 10) > availableWidth) {
                    img.setAttribute('width', '100%');
                }
                if (img.style.width && img.style.width.endsWith('px') && parseFloat(img.style.width) > availableWidth) {
                    img.style.width = '100%';
                }
            });

            // 2. Tables: Prevent desktop fixed-width tables (e.g. 600px/640px) from overflowing
            containerEl.querySelectorAll('table').forEach(tbl => {
                tbl.style.maxWidth = '100%';
                tbl.style.boxSizing = 'border-box';
                const attrW = tbl.getAttribute('width');
                if (attrW && !attrW.includes('%') && parseInt(attrW, 10) > availableWidth) {
                    tbl.setAttribute('width', '100%');
                }
                if (tbl.style.width && tbl.style.width.endsWith('px') && parseFloat(tbl.style.width) > availableWidth) {
                    tbl.style.width = '100%';
                }
                if (tbl.style.minWidth && parseFloat(tbl.style.minWidth) > availableWidth) {
                    tbl.style.minWidth = '0';
                }
            });

            // 3. Divs, cells and centers
            containerEl.querySelectorAll('div, td, th, center').forEach(el => {
                el.style.boxSizing = 'border-box';
                if (el.style.minWidth && parseFloat(el.style.minWidth) > availableWidth) {
                    el.style.minWidth = '0';
                }
                if (el.style.width && el.style.width.endsWith('px') && parseFloat(el.style.width) > availableWidth) {
                    el.style.width = '100%';
                    el.style.maxWidth = '100%';
                }
                if ((el.tagName === 'TD' || el.tagName === 'TH') && el.parentElement && el.parentElement.children.length === 1) {
                    const attrW = el.getAttribute('width');
                    if (attrW && !attrW.includes('%') && parseInt(attrW, 10) > availableWidth) {
                        el.setAttribute('width', '100%');
                    }
                }
            });
        }


        window.normalizeEmailDimensions = normalizeEmailDimensions;



        function autoFitEmailContent() {
            const bodyEl = document.getElementById('mail-read-body');
            const contentEl = document.getElementById('mail-read-content');
            if (!bodyEl || !contentEl) return;

            contentEl.style.zoom = '';
            contentEl.style.transform = '';
            contentEl.style.transformOrigin = '0 0';

            const availableWidth = bodyEl.clientWidth;
            if (availableWidth <= 50) return;

            // Normalize layout elements first so responsive and single-column emails adapt naturally
            normalizeEmailDimensions(contentEl, availableWidth);

            const contentWidth = contentEl.scrollWidth;

            // Only scale down if stubbornly wide multi-column tables still exceed screen width
            if (contentWidth > availableWidth + 2) {
                const scale = Math.floor((availableWidth / contentWidth) * 1000) / 1000;
                if (scale < 1 && scale > 0.2) {
                    contentEl.style.zoom = scale;
                }
                bodyEl.style.overflowX = 'hidden';
            } else {
                bodyEl.style.overflowX = 'visible';
            }
        }


        window.autoFitEmailContent = autoFitEmailContent;



        function setupMailBodyResizeObserver() {
            if (mailBodyResizeObserver) return;
            const bodyEl = document.getElementById('mail-read-body');
            if (bodyEl && window.ResizeObserver) {
                mailBodyResizeObserver = new ResizeObserver(() => {
                    autoFitEmailContent();
                });
                mailBodyResizeObserver.observe(bodyEl);
            }
        }



        function updateMailThemeBtnUI(isDark) {
            const btns = [
                document.getElementById('mail-read-theme-btn'),
                document.getElementById('desktop-mail-read-theme-btn')
            ].filter(Boolean);

            btns.forEach(themeBtn => {
                if (isDark) {
                    themeBtn.title = 'Ansicht: Dunkelmodus aktiv (Klicken für Originalansicht)';
                    themeBtn.setAttribute('aria-label', 'Originalansicht aktivieren');
                    themeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
                    themeBtn.style.color = 'var(--text)';
                } else {
                    themeBtn.title = 'Ansicht: Originalansicht aktiv (Klicken für Dunkelmodus)';
                    themeBtn.setAttribute('aria-label', 'Dunkelmodus aktivieren');
                    themeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
                    themeBtn.style.color = '#f9e2af';
                }
            });
        }


        window.updateMailThemeBtnUI = updateMailThemeBtnUI;



        function toggleMailViewTheme() {
            mailViewDarkMode = !mailViewDarkMode;
            const contentEl = document.getElementById('mail-read-content') || document.getElementById('mail-read-body');
            if (contentEl) {
                applyEmailDarkMode(contentEl, mailViewDarkMode);
                autoFitEmailContent();
            }
            updateMailThemeBtnUI(mailViewDarkMode);
        }


        window.toggleMailViewTheme = toggleMailViewTheme;



        function linkCurrentReadMailToChat() {
            if (!currentReadMailData && !currentReadMailId) return;
            const subj = (currentReadMailData && currentReadMailData.subject) ? currentReadMailData.subject : 'E-Mail';
            insertEntityLinkIntoChat(subj, 'mail', currentReadMailId);
            if (document.body.classList.contains('mobile-mode')) {
                switchMobileView('chat');
            }
        }


        window.linkCurrentReadMailToChat = linkCurrentReadMailToChat;



        let mailOriginView = null;


        window.isClosingMailReadModal = false;



        async function openMailReadModal(id, explicitOrigin = null) {
            currentReadMailId = id;
            dismissMailNotification(id);

            // Determine and remember the origin view before switching
            if (explicitOrigin) {
                mailOriginView = explicitOrigin;
            } else if (document.body.classList.contains('view-dashboard') || (typeof lastActiveView !== 'undefined' && lastActiveView === 'dashboard')) {
                mailOriginView = 'dashboard';
            } else if (document.body.classList.contains('view-chat') || (typeof lastActiveView !== 'undefined' && lastActiveView === 'chat')) {
                mailOriginView = 'chat';
            } else if (document.body.classList.contains('view-calendar') || (typeof lastActiveView !== 'undefined' && lastActiveView === 'calendar')) {
                mailOriginView = 'calendar';
            } else if (document.body.classList.contains('view-projects') || (typeof lastActiveView !== 'undefined' && lastActiveView === 'projects')) {
                mailOriginView = 'projects';
            } else if (document.body.classList.contains('view-memory') || (typeof lastActiveView !== 'undefined' && lastActiveView === 'memory')) {
                mailOriginView = 'memory';
            } else {
                mailOriginView = 'mail';
            }

            // Active page state
            document.body.classList.add('mail-read-active');
            document.body.classList.remove('modal-active');

            // Automatisch in die Mail-Ansicht wechseln
            if (typeof focusWidget === 'function') {
                focusWidget('mail');
            }

            // Mobile Top Bar Header anpassen
            const defaultBar = document.getElementById('header-mail-default-bar');
            const searchBar = document.getElementById('header-mail-search-bar');
            const readBar = document.getElementById('header-mail-read-bar');
            if (defaultBar) defaultBar.style.display = 'none';
            if (searchBar) searchBar.style.display = 'none';
            if (readBar) readBar.style.display = 'flex';

            // Back-Button Tooltip & Titel dynamisch anpassen
            const backTitle = mailOriginView === 'dashboard' ? 'Zurück zu Heute' : (mailOriginView !== 'mail' ? `Zurück zu ${mailOriginView}` : 'Zurück zum Posteingang');
            const mobBackBtn = document.querySelector('#header-mail-read-bar button[onclick="closeMailReadModal()"]');
            if (mobBackBtn) {
                mobBackBtn.title = backTitle;
                mobBackBtn.setAttribute('aria-label', backTitle);
            }

            // Desktop Top Panel Header anpassen
            const desktopActions = document.getElementById('desktop-mail-read-actions');
            const desktopBackBtn = document.getElementById('desktop-mail-back-btn');
            if (desktopActions) desktopActions.style.display = 'flex';
            if (desktopBackBtn) {
                desktopBackBtn.style.display = 'inline-flex';
                desktopBackBtn.title = backTitle;
                desktopBackBtn.setAttribute('aria-label', backTitle);
            }
            const titleEl = document.getElementById('plugin-view-title');
            if (titleEl) titleEl.textContent = 'E-Mail lesen';

            // Update URL via AppRouter
            if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                window.AppRouter.updateUrl(`/mail/${id}`);
            }

            // Nach oben scrollen
            const topPanel = document.querySelector('.top-panel');
            if (topPanel) topPanel.scrollTop = 0;

            // Spezielles Handling für Test-Benachrichtigung (ID -1)
            if (id === -1 || id === '-1') {
                const modal = document.getElementById('mail-read-modal');
                const badgeEl = document.getElementById('mail-read-account-badge');
                const personBadgeEl = document.getElementById('mail-read-person-badge');
                const catContainer = document.getElementById('mail-read-categories-container');
                const readToggleBtn = document.getElementById('mail-read-toggle-read-btn');
                const replyBtn = document.getElementById('mail-read-reply-btn');
                const linkBtn = document.getElementById('mail-read-link-btn');
                const subjectEl = document.getElementById('mail-read-subject');
                const fromEl = document.getElementById('mail-read-from');
                const toEl = document.getElementById('mail-read-to');
                const dateEl = document.getElementById('mail-read-date');
                const bodyEl = document.getElementById('mail-read-body');
                const contentEl = document.getElementById('mail-read-content') || bodyEl;

                if (badgeEl) {
                    badgeEl.style.display = 'none';
                }
                if (personBadgeEl) personBadgeEl.innerHTML = '';
                if (catContainer) catContainer.innerHTML = '<span style="font-size: 0.68rem; color: var(--accent); background: rgba(137, 180, 250, 0.12); border: 1px solid rgba(137, 180, 250, 0.25); padding: 1px 6px; border-radius: 6px;">🔔 Push Test</span>';
                if (readToggleBtn) readToggleBtn.style.display = 'none';
                if (replyBtn) replyBtn.style.display = 'none';
                if (linkBtn) linkBtn.style.display = 'none';
                const testAgentPanel = document.getElementById('mail-read-agent-panel');
                if (testAgentPanel) testAgentPanel.style.display = 'none';
                if (subjectEl) subjectEl.textContent = '🎉 Test-Benachrichtigung für neue E-Mails';
                if (fromEl) fromEl.textContent = 'kiSystem Support <support@kisystem.app>';
                if (toEl) toEl.textContent = 'Du';
                if (dateEl) dateEl.textContent = new Date().toLocaleString('de-DE');
                if (contentEl) {
                    contentEl.innerHTML = `
                        <div style="padding: 12px; background: rgba(137, 180, 250, 0.1); border-radius: 8px; border: 1px solid rgba(137, 180, 250, 0.3); margin-bottom: 12px;">
                            <strong style="color: var(--accent); font-size: 0.95rem; display: block; margin-bottom: 6px;">✅ Push-Benachrichtigungen funktionieren einwandfrei!</strong>
                            <p style="margin: 0; font-size: 0.85rem; line-height: 1.45; color: #cdd6f4;">
                                Beim Antippen einer Push-Benachrichtigung auf deinem Smartphone gelangst du direkt in die E-Mail-Detailansicht und dein Posteingang wird geöffnet.
                            </p>
                        </div>
                    `;
                    autoFitEmailContent();
                }
                if (modal) modal.style.display = 'flex';
                document.body.classList.add('mail-read-active');
                document.body.classList.remove('modal-active');
                return;
            }

            try {
                const res = await fetch(getApiUrl(`/api/mail/messages/${id}`));
                if (!res.ok) {
                    alert("E-Mail konnte nicht geladen werden.");
                    return;
                }
                const mail = await res.json();
                currentReadMailData = mail;

                const modal = document.getElementById('mail-read-modal');
                const badgeEl = document.getElementById('mail-read-account-badge');
                const personBadgeEl = document.getElementById('mail-read-person-badge');
                const readToggleBtn = document.getElementById('mail-read-toggle-read-btn');
                const replyBtn = document.getElementById('mail-read-reply-btn');
                const linkBtn = document.getElementById('mail-read-link-btn');
                const subjectEl = document.getElementById('mail-read-subject');
                const fromEl = document.getElementById('mail-read-from');
                const toEl = document.getElementById('mail-read-to');
                const dateEl = document.getElementById('mail-read-date');
                const bodyEl = document.getElementById('mail-read-body');
                const contentEl = document.getElementById('mail-read-content') || bodyEl;

                if (readToggleBtn) readToggleBtn.style.display = 'inline-flex';
                if (replyBtn) replyBtn.style.display = 'inline-flex';
                if (linkBtn) linkBtn.style.display = 'inline-flex';

                // Agent Run Header-Buttons
                const agentRunBtns = [
                    document.getElementById('mail-read-agent-run-btn'),
                    document.getElementById('desktop-mail-read-agent-run-btn')
                ].filter(Boolean);
                agentRunBtns.forEach(btn => {
                    btn.style.display = 'inline-flex';
                    if (mail.agentRunId || mail.agentRun) {
                        btn.title = 'Agent Run ansehen';
                        btn.style.color = '#cba6f7';
                    } else {
                        btn.title = 'Agent Run starten';
                        btn.style.color = 'var(--text)';
                    }
                    btn.onclick = () => openAgentRunForCurrentMail();
                });

                // Agent Run Badge im Mail-Header (oben ausgeblendet, da unten detailliert im Agent-Panel sichtbar)
                const agentBadgeEl = document.getElementById('mail-read-agent-run-badge');
                if (agentBadgeEl) {
                    agentBadgeEl.style.display = 'none';
                }

                // Agent-Analyse & Gedankengang Panel
                const agentPanel = document.getElementById('mail-read-agent-panel');
                const agentReasoningText = document.getElementById('mail-read-agent-reasoning-text');
                const agentChatLink = document.getElementById('mail-read-agent-chat-link');
                if (agentPanel && agentReasoningText) {
                    if (mail.agentRunId || mail.agentRun) {
                        agentPanel.style.display = 'block';
                        const summary = mail.agentRun?.summary || mail.agentRunSummary;
                        if (summary) {
                            agentReasoningText.innerHTML = `<strong>Gedankengang:</strong> ${escapeHtml(summary)}`;
                        } else {
                            agentReasoningText.innerHTML = `<em>Der Agent hat diese E-Mail analysiert. Klicke auf den Button, um den vollständigen Chatverlauf einzusehen.</em>`;
                        }
                        if (agentChatLink) {
                            agentChatLink.style.display = 'inline-flex';
                            agentChatLink.title = 'Zum Chatverlauf wechseln';
                            agentChatLink.innerHTML = `
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                            `;
                            agentChatLink.onclick = () => openAgentRunForCurrentMail();
                        }
                    } else {
                        agentPanel.style.display = 'block';
                        agentReasoningText.innerHTML = `<span style="opacity: 0.75;">Diese E-Mail wurde noch nicht von einem Agenten analysiert.</span>`;
                        if (agentChatLink) {
                            agentChatLink.style.display = 'inline-flex';
                            agentChatLink.title = 'Jetzt von Agent analysieren lassen';
                            agentChatLink.innerHTML = `
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                            `;
                            agentChatLink.onclick = () => startAgentRunForCurrentMail();
                        }
                    }
                }

                const acc = mail.account || {};
                const accColor = acc.color || '#89b4fa';
                const accIcon = (acc.email || '').toLowerCase().includes('web.de') ? '🟠' : ((acc.email || '').toLowerCase().includes('gmail') ? '🔴' : '✉️');

                if (badgeEl) {
                    badgeEl.style.display = 'none';
                }

                // Person Badge
                if (personBadgeEl) {
                    if (mail.person) {
                        const pName = mail.person.name || mail.person.aliases?.[0]?.name || 'Person';
                        personBadgeEl.style.display = 'inline-flex';
                        personBadgeEl.innerHTML = `
                            <span onclick="openPersonProfileModal(${mail.person.id}); closeMailReadModal();" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; font-weight: 700; color: #cba6f7; background: rgba(203, 166, 247, 0.15); border: 1px solid rgba(203, 166, 247, 0.3); padding: 2px 8px; border-radius: 10px; cursor: pointer;" title="Profil im Gedächtnis öffnen">
                                👤 ${escapeHtml(pName)}
                            </span>
                        `;
                    } else {
                        personBadgeEl.innerHTML = '';
                        personBadgeEl.style.display = 'none';
                    }
                }

                // Kategorien Badges Container im Read-Modal
                const catWrapper = document.getElementById('mail-read-categories-wrapper');
                const catContainer = document.getElementById('mail-read-categories-container');
                if (catContainer) {
                    try {
                        const mailCats = (mail.category || '').split(',').map(c => c.trim()).filter(Boolean);
                        
                        if (mailCats.length === 0) {
                            catContainer.innerHTML = '';
                            if (catWrapper) catWrapper.style.display = 'none';
                        } else {
                            if (catWrapper) catWrapper.style.display = 'inline-flex';
                            const catRes = await fetch(getApiUrl('/api/mail/categories'));
                            const customCats = catRes.ok ? await catRes.json() : [];
                            catContainer.innerHTML = mailCats.map(catName => {
                                const matchedCat = customCats.find(c => c.name.toLowerCase() === catName.toLowerCase());
                                const icon = (matchedCat && matchedCat.icon) ? matchedCat.icon : '🏷️';
                                return `
                                    <span onclick="filterMailByCategory('${escapeHtml(catName)}'); closeMailReadModal();" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.72rem; color: var(--accent); background: rgba(137, 180, 250, 0.12); border: 1px solid rgba(137, 180, 250, 0.25); padding: 2px 7px; border-radius: 6px; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.background='rgba(137, 180, 250, 0.25)'" onmouseout="this.style.background='rgba(137, 180, 250, 0.12)'" title="Nach '${escapeHtml(catName)}' filtern">
                                        ${icon} ${escapeHtml(catName)}
                                    </span>
                                ` ;
                            }).join('');
                        }
                    } catch (err) {
                        console.error("Fehler beim Laden der Kategorien für Read Modal:", err);
                    }
                }

                // Gelesen-Toggle Button UI aktualisieren
                updateMailReadToggleBtnUI(mail.isRead);

                if (subjectEl) subjectEl.textContent = mail.subject || '(Kein Betreff)';
                if (fromEl) fromEl.textContent = mail.fromName ? `${mail.fromName} <${mail.from}>` : mail.from;
                if (toEl) toEl.textContent = mail.to || '';
                
                if (dateEl) {
                    const dateObj = new Date(mail.date);
                    dateEl.textContent = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                }

                // Sicher bereinigter Inhalt mit Dark Mode & Auto-Fit
                if (contentEl) {
                    if (mail.bodyHtml && mail.bodyHtml.trim()) {
                        contentEl.innerHTML = mail.bodyHtml;
                    } else {
                        contentEl.innerHTML = `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0; word-break: break-word;">${escapeHtml(mail.bodyText || 'Kein Inhalt.')}</pre>`;
                    }

                    // Reset theme toggle button to dark mode (default)
                    mailViewDarkMode = true;
                    updateMailThemeBtnUI(true);

                    // Apply smart Gmail-style dark mode
                    applyEmailDarkMode(contentEl, true);

                    // Setup resize observer for dynamic screen width changes
                    setupMailBodyResizeObserver();

                    // Monitor images inside email to recalculate scale on image load
                    contentEl.querySelectorAll('img').forEach(img => {
                        if (!img.complete) {
                            img.addEventListener('load', () => autoFitEmailContent(), { once: true });
                            img.addEventListener('error', () => autoFitEmailContent(), { once: true });
                        }
                    });

                    // Auto-fit content to screen width so horizontal scrolling is completely eliminated
                    autoFitEmailContent();
                    requestAnimationFrame(() => autoFitEmailContent());
                    setTimeout(() => autoFitEmailContent(), 100);
                }

                const linkBtns = [
                    document.getElementById('mail-read-link-btn'),
                    document.getElementById('desktop-mail-read-link-btn')
                ].filter(Boolean);
                linkBtns.forEach(btn => {
                    btn.onclick = () => linkCurrentReadMailToChat();
                });

                if (modal) modal.style.display = 'flex';
                document.body.classList.add('mail-read-active');
                document.body.classList.remove('modal-active');

                // Aktualisiere Widgets im Hintergrund (gelesen-Status aktualisiert Badge)
                loadTopWidgets();
            } catch (err) {
                console.error("[Mail] Fehler beim Öffnen der E-Mail:", err);
                alert("Fehler beim Laden der E-Mail.");
            }
        }


        window.openMailReadModal = openMailReadModal;



        function updateMailReadToggleBtnUI(isRead) {
            const btns = [
                document.getElementById('mail-read-toggle-read-btn'),
                document.getElementById('desktop-mail-read-toggle-btn')
            ].filter(Boolean);

            btns.forEach(readToggleBtn => {
                if (isRead) {
                    readToggleBtn.title = 'Als ungelesen markieren';
                    readToggleBtn.setAttribute('aria-label', 'Als ungelesen markieren');
                    readToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
                    readToggleBtn.style.color = 'var(--text)';
                } else {
                    readToggleBtn.title = 'Als gelesen markieren';
                    readToggleBtn.setAttribute('aria-label', 'Als gelesen markieren');
                    readToggleBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"></path><polyline points="22,6 12,13 2,6"></polyline><polyline points="16 19 19 22 24 17"></polyline></svg>`;
                    readToggleBtn.style.color = 'var(--on)';
                }
            });
        }


        window.updateMailReadToggleBtnUI = updateMailReadToggleBtnUI;



        async function toggleCurrentMailReadStatus() {
            if (!currentReadMailId || !currentReadMailData) return;
            const newStatus = !currentReadMailData.isRead;
            await toggleSingleMailReadStatus(currentReadMailId, newStatus);
            currentReadMailData.isRead = newStatus;
            updateMailReadToggleBtnUI(newStatus);
        }


        window.toggleCurrentMailReadStatus = toggleCurrentMailReadStatus;



        async function openAgentRunForCurrentMail() {
            if (!currentReadMailData) return;
            let agentRunId = currentReadMailData.agentRunId || currentReadMailData.agentRun?.id;
            if (!agentRunId) {
                try {
                    const res = await fetch(getApiUrl(`/api/agent-runs/mail/${currentReadMailData.id}`));
                    if (res.ok) {
                        const data = await res.json();
                        if (data.agentRun) {
                            agentRunId = data.agentRun.id;
                        }
                    }
                } catch (_) {}
            }
            if (agentRunId) {
                if (typeof closeMailReadModal === 'function') {
                    closeMailReadModal();
                }
                await loadConversation(agentRunId);
            } else {
                startAgentRunForCurrentMail();
            }
        }


        window.openAgentRunForCurrentMail = openAgentRunForCurrentMail;



        async function startAgentRunForCurrentMail() {
            if (!currentReadMailData) return;
            const mailId = currentReadMailData.id;
            const badgeEl = document.getElementById('mail-read-agent-run-badge');
            if (badgeEl) {
                badgeEl.innerHTML = `<span style="font-size: 0.72rem; color: #cba6f7; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;">⏳ Agent Run läuft...</span>`;
            }
            try {
                const res = await fetch(getApiUrl(`/api/agent-runs/mail/${mailId}`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ force: true })
                });
                const data = await res.json();
                if (data.success && data.conversationId) {
                    if (typeof closeMailReadModal === 'function') {
                        closeMailReadModal();
                    }
                    await loadConversation(data.conversationId);
                } else {
                    alert("Agent Run konnte nicht gestartet werden: " + (data.error || "Unbekannter Fehler"));
                }
            } catch (err) {
                console.error("Fehler beim Starten des Agent Runs:", err);
                alert("Fehler beim Starten des Agent Runs: " + err.message);
            }
        }


        window.startAgentRunForCurrentMail = startAgentRunForCurrentMail;



        window.loadAgentRun = async function(convId) {
            await loadConversation(convId);
        };



        async function openAgentChatForMail(event, mailId, agentRunId) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            if (!agentRunId) {
                try {
                    const res = await fetch(getApiUrl(`/api/agent-runs/mail/${mailId}`));
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.agentRun) {
                            agentRunId = data.agentRun.id;
                        }
                    }
                } catch (e) {
                    console.error("Fehler beim Abrufen des Agent Runs:", e);
                }
            }
            if (agentRunId) {
                if (typeof closeMailReadModal === 'function') {
                    closeMailReadModal();
                }
                await loadConversation(agentRunId);
            } else {
                await startAgentRunForMailItem(event, mailId);
            }
        }


        window.openAgentChatForMail = openAgentChatForMail;



        async function startAgentRunForMailItem(event, mailId) {
            if (event) {
                event.stopPropagation();
                event.preventDefault();
            }
            const btn = event ? event.currentTarget : null;
            const originalHtml = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ Analyse...';
            }
            try {
                const res = await fetch(getApiUrl(`/api/agent-runs/mail/${mailId}`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ force: true })
                });
                const data = await res.json();
                if (data.success && data.conversationId) {
                    if (typeof closeMailReadModal === 'function') {
                        closeMailReadModal();
                    }
                    await loadConversation(data.conversationId);
                } else {
                    alert("Agent Run konnte nicht gestartet werden: " + (data.error || "Unbekannter Fehler"));
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = originalHtml;
                    }
                }
            } catch (err) {
                console.error("Fehler beim Starten des Agent Runs:", err);
                alert("Fehler beim Starten des Agent Runs: " + err.message);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            }
        }


        window.startAgentRunForMailItem = startAgentRunForMailItem;



        async function handleNotificationAction(event, notifId, label, action, replyText) {
            if (event) event.stopPropagation();
            const btn = event ? event.currentTarget : null;
            const originalHtml = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ Wird ausgeführt...';
            }

            try {
                const res = await fetch(getApiUrl(`/api/notifications/${notifId}/respond`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label, action, replyText })
                });
                const data = await res.json();
                if (btn) {
                    btn.innerHTML = '✅ Erledigt';
                }
                if (data && data.notification && data.notification.conversationId === currentConversationId) {
                    if (action === 'reply' || replyText) {
                        addMessage(replyText || label, true);
                    }
                    if (data.aiResponse && data.aiResponse.text) {
                        addMessage(data.aiResponse.text, false, null, [], null, data.aiResponse.notification);
                    }
                }
                setTimeout(() => {
                    loadTopWidgets();
                    if (isElectron && ipcRenderer) {
                        ipcRenderer.send('widgets-updated');
                    }
                }, 350);
            } catch (err) {
                console.error("Fehler beim Beantworten der Benachrichtigung:", err);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                }
            }
        }


        window.handleNotificationAction = handleNotificationAction;



        async function dismissNotification(event, notifId) {
            if (event) {
                event.stopPropagation();
                const cardEl = event.target?.closest ? event.target.closest('.chat-notification-card') : null;
                if (cardEl) {
                    cardEl.classList.add('dismissed');
                    const statusContainer = cardEl.querySelector('.chat-notification-status-container');
                    if (statusContainer) {
                        statusContainer.innerHTML = '<span class="chat-notification-status" style="background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.6);">✕ Geschlossen</span>';
                    }
                    cardEl.querySelectorAll('.chat-notification-btn').forEach(b => b.disabled = true);
                }
            }
            try {
                await fetch(getApiUrl(`/api/notifications/${notifId}/dismiss`), {
                    method: 'POST'
                });
                loadTopWidgets();
                if (isElectron && ipcRenderer) {
                    ipcRenderer.send('widgets-updated');
                }
            } catch (err) {
                console.error("Fehler beim Schließen der Benachrichtigung:", err);
            }
        }


        window.dismissNotification = dismissNotification;



        async function openNotificationConversation(event, conversationId) {
            if (event) event.stopPropagation();
            if (!conversationId) return;
            await loadConversation(conversationId);
        }


        window.openNotificationConversation = openNotificationConversation;



        // ==========================================
        // Person Selection Dialog Logic (Single & Multi-Mail)
        // ==========================================
        let currentPersonModalMailIds = [];


        let cachedPeopleList = [];


        let currentPersonIdForHighlight = null;



        async function openMailPersonSelectModal(mailIds) {
            if (!mailIds) return;
            currentPersonModalMailIds = Array.isArray(mailIds) ? mailIds.map(Number) : [Number(mailIds)];
            if (currentPersonModalMailIds.length === 0) return;

            const modal = document.getElementById('mail-person-modal');
            const mailInfoEl = document.getElementById('mail-person-modal-mail-info');
            const searchInput = document.getElementById('mail-person-search-input');
            const listEl = document.getElementById('mail-person-modal-list');
            const createContainer = document.getElementById('mail-person-modal-create-container');

            if (!modal) return;

            if (searchInput) searchInput.value = '';
            if (createContainer) createContainer.style.display = 'none';
            if (listEl) listEl.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 15px 0;">⏳ Lade Personen...</p>';

            modal.style.display = 'flex';
            document.body.classList.add('modal-active');
            setTimeout(() => searchInput && searchInput.focus(), 60);

            try {
                currentPersonIdForHighlight = null;
                if (currentPersonModalMailIds.length === 1) {
                    const singleId = currentPersonModalMailIds[0];
                    const mailRes = await fetch(getApiUrl(`/api/mail/messages/${singleId}`));
                    if (mailRes.ok) {
                        const mailData = await mailRes.json();
                        currentPersonIdForHighlight = mailData.personId ? Number(mailData.personId) : null;
                        if (mailInfoEl) {
                            const fromStr = mailData.fromName ? `${mailData.fromName} <${mailData.from}>` : mailData.from;
                            mailInfoEl.innerHTML = `<strong>E-Mail:</strong> ${escapeHtml(mailData.subject || '(Kein Betreff)')}<br><span style="opacity: 0.7;">Von: ${escapeHtml(fromStr)}</span>`;
                        }
                    }
                } else {
                    if (mailInfoEl) {
                        mailInfoEl.innerHTML = `<strong>${currentPersonModalMailIds.length} E-Mails ausgewählt:</strong> Person für alle gewählten E-Mails zuordnen`;
                    }
                }

                // Fetch People list
                const peopleRes = await fetch(getApiUrl('/api/memory/people'));
                if (peopleRes.ok) {
                    cachedPeopleList = await peopleRes.json();
                } else {
                    cachedPeopleList = [];
                }

                filterMailPersonList('');
            } catch (err) {
                console.error("[Mail] Fehler beim Laden der Personenauswahl:", err);
                if (listEl) listEl.innerHTML = '<p style="font-size: 0.75rem; color: var(--off); text-align: center;">Fehler beim Laden der Personen.</p>';
            }
        }


        window.openMailPersonSelectModal = openMailPersonSelectModal;



        function filterMailPersonList(searchQuery = '') {
            const listEl = document.getElementById('mail-person-modal-list');
            const createContainer = document.getElementById('mail-person-modal-create-container');
            const createBtn = document.getElementById('mail-person-modal-create-btn');
            if (!listEl) return;

            const q = (searchQuery || '').toLowerCase().trim();

            const filtered = cachedPeopleList.filter(p => {
                if (!q) return true;
                if (p.name && p.name.toLowerCase().includes(q)) return true;
                if (p.email && p.email.toLowerCase().includes(q)) return true;
                if (p.emails && p.emails.toLowerCase().includes(q)) return true;
                if (p.aliases && p.aliases.some(a => a.toLowerCase().includes(q))) return true;
                return false;
            });

            let html = '';

            // Option Zuordnung aufheben
            html += `
                <div onclick="assignPersonToMail(null)" class="mail-select-dialog-item mail-select-remove-item">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1rem;">❌</span>
                        <div>
                            <div style="font-weight: 700; font-size: 0.82rem;">Zuordnung aufheben</div>
                            <div style="font-size: 0.68rem; opacity: 0.8;">Person von der E-Mail / den ausgewählten E-Mails trennen</div>
                        </div>
                    </div>
                </div>
            `;

            if (filtered.length === 0) {
                html += `<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 15px 0;">Keine passende Person gefunden.</p>`;
            } else {
                filtered.forEach(p => {
                    const isSelected = currentPersonIdForHighlight === Number(p.id);
                    const selectedClass = isSelected ? 'selected' : '';
                    const avatarIcon = p.isOwner ? '👑' : '👤';
                    const emailSubtitle = p.email || (p.aliases && p.aliases.length > 0 ? p.aliases.join(', ') : '');

                    html += `
                        <div onclick="assignPersonToMail(${p.id}, '${escapeHtml(p.name).replace(/'/g, "\\'")}')" class="mail-select-dialog-item mail-person-dialog-item ${selectedClass}">
                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                <div style="width: 32px; height: 32px; border-radius: 50%; background: ${p.isOwner ? 'rgba(249, 226, 175, 0.15)' : 'rgba(203, 166, 247, 0.15)'}; color: ${p.isOwner ? '#f9e2af' : '#cba6f7'}; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; border: 1px solid ${p.isOwner ? 'rgba(249, 226, 175, 0.3)' : 'rgba(203, 166, 247, 0.3)'};">
                                    ${avatarIcon}
                                </div>
                                <div style="display: flex; flex-direction: column; min-width: 0;">
                                    <span style="font-size: 0.82rem; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${escapeHtml(p.name)}
                                    </span>
                                    ${emailSubtitle ? `<span style="font-size: 0.68rem; opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(emailSubtitle)}</span>` : ''}
                                </div>
                            </div>
                            <div class="mail-checkbox-box" style="${isSelected ? 'background: #cba6f7; border-color: #cba6f7; color: #11111b;' : ''}">
                                ${isSelected ? '✓' : ''}
                            </div>
                        </div>
                    `;
                });
            }

            listEl.innerHTML = html;

            // Quick Create Person button
            if (createContainer && createBtn) {
                if (q.length > 0 && !cachedPeopleList.some(p => p.name.toLowerCase() === q)) {
                    createContainer.style.display = 'block';
                    createBtn.innerHTML = `➕ "<strong>${escapeHtml(q)}</strong>" als neue Person anlegen & verknüpfen`;
                } else {
                    createContainer.style.display = 'none';
                }
            }
        }


        window.filterMailPersonList = filterMailPersonList;



        async function assignPersonToMail(personId, personName = null) {
            if (!currentPersonModalMailIds || currentPersonModalMailIds.length === 0) return;
            const pId = personId !== null && personId !== undefined ? Number(personId) : null;

            try {
                if (currentSelectionType === 'task') {
                    await Promise.all(currentPersonModalMailIds.map(id => callTool('aktualisiere_aufgabe', { id: String(id), personId: pId })));
                } else {
                    const res = await fetch(getApiUrl('/api/mail/messages/batch-person'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: currentPersonModalMailIds, personId: pId })
                    });
                    if (!res.ok) {
                        alert("Fehler beim Verknüpfen der Person.");
                        return;
                    }
                }

                closeMailPersonModal();
                exitSelectionMode();
                loadTopWidgets();

                const readModal = document.getElementById('mail-read-modal');
                if (readModal && readModal.style.display === 'flex' && currentReadMailId && currentPersonModalMailIds.includes(currentReadMailId)) {
                    openMailReadModal(currentReadMailId);
                }
            } catch (err) {
                console.error("[Mail] Fehler beim Zuweisen der Person:", err);
                alert("Fehler beim Zuweisen der Person.");
            }
        }


        window.assignPersonToMail = assignPersonToMail;



        async function createAndLinkPersonFromSearch() {
            const searchInput = document.getElementById('mail-person-search-input');
            const name = searchInput ? searchInput.value.trim() : '';
            if (!name || currentPersonModalMailIds.length === 0) return;

            try {
                const newP = await callTool('erstelle_person', { name });
                if (newP && newP.personId) {
                    await assignPersonToMail(newP.personId, name);
                } else {
                    alert("Person konnte nicht erstellt werden.");
                }
            } catch (err) {
                console.error("[Mail] Fehler beim Erstellen der Person:", err);
                alert("Fehler beim Erstellen der Person.");
            }
        }


        window.createAndLinkPersonFromSearch = createAndLinkPersonFromSearch;



        function closeMailPersonModal() {
            const modal = document.getElementById('mail-person-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
            currentPersonModalMailIds = [];
            currentPersonIdForHighlight = null;
        }


        window.closeMailPersonModal = closeMailPersonModal;



        // ==========================================
        // Category Multi-Select Dialog Logic (Single & Multi-Mail)
        // ==========================================
        let currentCategoryModalMailIds = [];


        let cachedCategoriesList = [];


        let selectedCategoryNames = new Set();



        async function openMailCategorySelectModal(mailIds) {
            if (!mailIds) return;
            currentCategoryModalMailIds = Array.isArray(mailIds) ? mailIds.map(Number) : [Number(mailIds)];
            if (currentCategoryModalMailIds.length === 0) return;

            const modal = document.getElementById('mail-category-modal');
            const mailInfoEl = document.getElementById('mail-category-modal-mail-info');
            const searchInput = document.getElementById('mail-category-search-input');
            const listEl = document.getElementById('mail-category-modal-list');
            const createContainer = document.getElementById('mail-category-modal-create-container');

            if (!modal) return;

            if (searchInput) searchInput.value = '';
            if (createContainer) createContainer.style.display = 'none';
            if (listEl) listEl.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 15px 0;">⏳ Lade Kategorien...</p>';

            modal.style.display = 'flex';
            document.body.classList.add('modal-active');
            setTimeout(() => searchInput && searchInput.focus(), 60);

            try {
                selectedCategoryNames = new Set();
                
                if (currentCategoryModalMailIds.length === 1) {
                    const singleId = currentCategoryModalMailIds[0];
                    const mailRes = await fetch(getApiUrl(`/api/mail/messages/${singleId}`));
                    if (mailRes.ok) {
                        const mailData = await mailRes.json();
                        if (mailInfoEl) {
                            mailInfoEl.innerHTML = `<strong>E-Mail:</strong> ${escapeHtml(mailData.subject || '(Kein Betreff)')}`;
                        }
                        const rawCat = mailData.category || '';
                        rawCat.split(',').map(c => c.trim()).filter(Boolean).forEach(c => selectedCategoryNames.add(c));
                    }
                } else {
                    if (mailInfoEl) {
                        mailInfoEl.innerHTML = `<strong>${currentCategoryModalMailIds.length} E-Mails ausgewählt:</strong> Kategorien für alle gewählten E-Mails festlegen`;
                    }
                    currentCategoryModalMailIds.forEach(id => {
                        const card = document.querySelector(`.swipe-link-item[data-link-id="${id}"], .swipe-link-item[data-mail-id="${id}"]`);
                        if (card && card.dataset.mailCategory) {
                            card.dataset.mailCategory.split(',').map(c => c.trim()).filter(Boolean).forEach(c => selectedCategoryNames.add(c));
                        }
                    });
                }

                // Fetch Categories
                const catRes = await fetch(getApiUrl('/api/mail/categories'));
                if (catRes.ok) {
                    cachedCategoriesList = await catRes.json();
                } else {
                    cachedCategoriesList = [];
                }

                filterMailCategoryList('');
            } catch (err) {
                console.error("[Mail] Fehler beim Laden der Kategorien:", err);
                if (listEl) listEl.innerHTML = '<p style="font-size: 0.75rem; color: var(--off); text-align: center;">Fehler beim Laden der Kategorien.</p>';
            }
        }


        window.openMailCategorySelectModal = openMailCategorySelectModal;



        function filterMailCategoryList(searchQuery = '') {
            const listEl = document.getElementById('mail-category-modal-list');
            const createContainer = document.getElementById('mail-category-modal-create-container');
            const createBtn = document.getElementById('mail-category-modal-create-btn');
            if (!listEl) return;

            const q = (searchQuery || '').toLowerCase().trim();

            const filtered = cachedCategoriesList.filter(c => {
                if (!q) return true;
                return c.name && c.name.toLowerCase().includes(q);
            });

            let html = '';

            if (filtered.length === 0 && cachedCategoriesList.length === 0) {
                html += `
                    <div style="padding: 15px; text-align: center; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px;">
                        <span style="font-size: 1.5rem;">🏷️</span>
                        <p style="font-size: 0.78rem; opacity: 0.8; margin: 6px 0;">Noch keine Kategorien angelegt.</p>
                        <p style="font-size: 0.7rem; opacity: 0.5; margin: 0;">Tippe einen Namen in das Suchfeld oben, um direkt eine Kategorie anzulegen.</p>
                    </div>
                `;
            } else if (filtered.length === 0) {
                html += `<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 15px 0;">Keine passende Kategorie gefunden.</p>`;
            } else {
                filtered.forEach(cat => {
                    const isSelected = selectedCategoryNames.has(cat.name);
                    const selectedClass = isSelected ? 'selected' : '';
                    const icon = cat.icon || '🏷️';

                    html += `
                        <div onclick="toggleCategoryInModal('${escapeHtml(cat.name).replace(/'/g, "\\'")}')" class="mail-select-dialog-item ${selectedClass}">
                            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                <span style="font-size: 1.1rem; flex-shrink: 0;">${icon}</span>
                                <span style="font-size: 0.85rem; font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${escapeHtml(cat.name)}
                                </span>
                            </div>
                            <div class="mail-checkbox-box">
                                ${isSelected ? '✓' : ''}
                            </div>
                        </div>
                    `;
                });
            }

            listEl.innerHTML = html;

            // Quick Create Category button
            if (createContainer && createBtn) {
                if (q.length > 0 && !cachedCategoriesList.some(c => c.name.toLowerCase() === q)) {
                    createContainer.style.display = 'block';
                    createBtn.innerHTML = `➕ Kategorie "<strong>${escapeHtml(q)}</strong>" neu anlegen & auswählen`;
                } else {
                    createContainer.style.display = 'none';
                }
            }
        }


        window.filterMailCategoryList = filterMailCategoryList;



        function toggleCategoryInModal(catName) {
            if (selectedCategoryNames.has(catName)) {
                selectedCategoryNames.delete(catName);
            } else {
                selectedCategoryNames.add(catName);
            }
            const searchInput = document.getElementById('mail-category-search-input');
            filterMailCategoryList(searchInput ? searchInput.value : '');
        }


        window.toggleCategoryInModal = toggleCategoryInModal;



        function clearAllMailCategories() {
            selectedCategoryNames.clear();
            const searchInput = document.getElementById('mail-category-search-input');
            filterMailCategoryList(searchInput ? searchInput.value : '');
        }


        window.clearAllMailCategories = clearAllMailCategories;



        async function createAndSelectNewCategory() {
            const searchInput = document.getElementById('mail-category-search-input');
            const name = searchInput ? searchInput.value.trim() : '';
            if (!name) return;

            try {
                const res = await fetch(getApiUrl('/api/mail/categories'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, icon: '🏷️' })
                });

                if (res.ok) {
                    const newCat = await res.json();
                    cachedCategoriesList.push(newCat);
                    selectedCategoryNames.add(newCat.name);
                    if (searchInput) searchInput.value = '';
                    filterMailCategoryList('');
                } else {
                    const errData = await res.json();
                    alert(errData.error || "Fehler beim Anlegen der Kategorie.");
                }
            } catch (err) {
                console.error("[Mail] Fehler beim Anlegen der Kategorie:", err);
                alert("Fehler beim Anlegen der Kategorie.");
            }
        }


        window.createAndSelectNewCategory = createAndSelectNewCategory;



        async function saveMailCategorySelection() {
            if (!currentCategoryModalMailIds || currentCategoryModalMailIds.length === 0) return;
            const categoriesArray = Array.from(selectedCategoryNames);

            try {
                const res = await fetch(getApiUrl('/api/mail/messages/batch-category'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: currentCategoryModalMailIds, category: categoriesArray })
                });

                if (res.ok) {
                    closeMailCategoryModal();
                    exitSelectionMode();
                    loadTopWidgets();

                    const readModal = document.getElementById('mail-read-modal');
                    if (readModal && readModal.style.display === 'flex' && currentReadMailId && currentCategoryModalMailIds.includes(currentReadMailId)) {
                        openMailReadModal(currentReadMailId);
                    }
                } else {
                    alert("Fehler beim Speichern der Kategorien.");
                }
            } catch (err) {
                console.error("[Mail] Fehler beim Speichern der Kategorien:", err);
                alert("Fehler beim Speichern der Kategorien.");
            }
        }


        window.saveMailCategorySelection = saveMailCategorySelection;



        function closeMailCategoryModal() {
            const modal = document.getElementById('mail-category-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
            currentCategoryModalMailIds = [];
            selectedCategoryNames.clear();
        }


        window.closeMailCategoryModal = closeMailCategoryModal;



        function promptChangeMailCategory(mailId) {
            openMailCategorySelectModal(mailId);
        }


        window.promptChangeMailCategory = promptChangeMailCategory;



        function promptLinkPersonToMail(mailId) {
            openMailPersonSelectModal(mailId);
        }


        window.promptLinkPersonToMail = promptLinkPersonToMail;



        function closeMailReadModal(fromPopState = false) {
            if (isClosingMailReadModal) return;
            isClosingMailReadModal = true;
            try {
                const modal = document.getElementById('mail-read-modal');
                if (modal) modal.style.display = 'none';
                document.body.classList.remove('mail-read-active');
                document.body.classList.remove('modal-active');
                currentReadMailId = null;
                currentReadMailData = null;
                mailViewDarkMode = true;
                updateMailThemeBtnUI(true);

                // Contextual header toggling (Mobile)
                const defaultBar = document.getElementById('header-mail-default-bar');
                const searchBar = document.getElementById('header-mail-search-bar');
                const readBar = document.getElementById('header-mail-read-bar');
                if (readBar) readBar.style.display = 'none';
                if (currentMailSearchQuery && searchBar) {
                    searchBar.style.display = 'flex';
                    if (defaultBar) defaultBar.style.display = 'none';
                } else if (defaultBar) {
                    defaultBar.style.display = 'flex';
                    if (searchBar) searchBar.style.display = 'none';
                }

                // Desktop controls
                const desktopActions = document.getElementById('desktop-mail-read-actions');
                const desktopBackBtn = document.getElementById('desktop-mail-back-btn');
                if (desktopActions) desktopActions.style.display = 'none';
                if (desktopBackBtn) desktopBackBtn.style.display = 'none';
                const titleEl = document.getElementById('plugin-view-title');
                if (titleEl) titleEl.textContent = 'E-Mails (Posteingang)';

                // Return to origin view if different from 'mail' (e.g. Arbeitstisch)
                const targetView = mailOriginView;
                mailOriginView = null;
                if (targetView && targetView !== 'mail') {
                    if (typeof focusWidget === 'function') {
                        focusWidget(targetView);
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView(targetView);
                    }
                } else {
                    if (window.AppRouter && typeof window.AppRouter.updateUrl === 'function') {
                        window.AppRouter.updateUrl('/mail');
                    }
                }
            } finally {
                isClosingMailReadModal = false;
            }
        }


        window.closeMailReadModal = closeMailReadModal;



        function openReplyFromReadModal() {
            const id = currentReadMailId;
            closeMailReadModal();
            if (id) {
                openMailComposeModal(id);
            }
        }


        window.openReplyFromReadModal = openReplyFromReadModal;



        let currentComposeAttachments = [];

        function renderComposeAttachments() {
            const container = document.getElementById('mail-compose-attachments-container');
            const countEl = document.getElementById('mail-compose-attachments-count');
            if (!container) return;

            if (!currentComposeAttachments || currentComposeAttachments.length === 0) {
                container.innerHTML = '<span id="mail-compose-no-attachments" style="font-size: 0.75rem; color: rgba(255,255,255,0.4);">Keine Anhänge</span>';
                if (countEl) countEl.textContent = '';
                return;
            }

            if (countEl) countEl.textContent = `${currentComposeAttachments.length} Datei(en)`;
            container.innerHTML = currentComposeAttachments.map((att, idx) => {
                const name = typeof att === 'string' ? att : (att.filename || att.name || 'Anhang');
                return `
                    <span style="background: rgba(137, 180, 250, 0.18); color: #89b4fa; border: 1px solid rgba(137, 180, 250, 0.4); border-radius: 6px; padding: 2px 8px; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 6px; font-weight: 600;">
                        <span>📎 ${escapeHtml(name)}</span>
                        <button type="button" onclick="removeComposeAttachment(${idx})" style="background: none; border: none; color: #f38ba8; cursor: pointer; padding: 0; font-size: 0.8rem; line-height: 1;" title="Anhang entfernen">✕</button>
                    </span>
                `;
            }).join('');
        }

        window.removeComposeAttachment = function(idx) {
            currentComposeAttachments.splice(idx, 1);
            renderComposeAttachments();
        };

        async function openMailComposeModal(replyToId = null, defaultAccountId = null, initialData = null) {
            window.mailComposeIsEditMode = Boolean(initialData);
            window.currentEditCardData = initialData || null;
            if (initialData?.cardEl) window.currentEditCardElement = initialData.cardEl;

            const modal = document.getElementById('mail-compose-modal');
            const titleEl = document.getElementById('mail-compose-title');
            const accSelect = document.getElementById('mail-compose-account-select');
            const toInput = document.getElementById('mail-compose-to');
            const subjectInput = document.getElementById('mail-compose-subject');
            const bodyInput = document.getElementById('mail-compose-body');
            const inReplyToInput = document.getElementById('mail-compose-in-reply-to');
            const statusEl = document.getElementById('mail-compose-status');
            const notifIdInput = document.getElementById('mail-compose-notification-id');

            if (statusEl) statusEl.style.display = 'none';
            if (notifIdInput) notifIdInput.value = initialData?.notificationId || '';

            currentComposeAttachments = initialData?.attachments ? [...initialData.attachments] : [];
            renderComposeAttachments();

            // Konten laden und Dropdown befüllen
            try {
                const res = await fetch(getApiUrl('/api/mail/accounts'));
                const accounts = await res.json();
                
                if (!accounts || accounts.length === 0) {
                    alert("Bitte richte zuerst mindestens ein E-Mail-Konto ein.");
                    openMailAccountFormModal();
                    return;
                }

                if (accSelect) {
                    accSelect.innerHTML = '';
                    accounts.forEach(a => {
                        const opt = document.createElement('option');
                        opt.value = a.id;
                        opt.textContent = `${a.name} (${a.email})`;
                        accSelect.appendChild(opt);
                    });
                }

                const sendBtn = document.getElementById('mail-compose-send-btn');
                if (initialData) {
                    if (titleEl) titleEl.textContent = '✏️ E-Mail-Entwurf bearbeiten';
                    if (sendBtn) {
                        sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Speichern';
                    }
                    if (initialData.accountId && accSelect) accSelect.value = initialData.accountId;
                    if (toInput) toInput.value = initialData.to || '';
                    if (subjectInput) subjectInput.value = initialData.subject || '';
                    if (inReplyToInput) inReplyToInput.value = initialData.inReplyTo || '';
                    if (bodyInput) {
                        bodyInput.value = initialData.body || '';
                        setTimeout(() => bodyInput.focus(), 50);
                    }
                } else if (replyToId) {
                    // Antwort auf E-Mail
                    const mRes = await fetch(getApiUrl(`/api/mail/messages/${replyToId}`));
                    if (mRes.ok) {
                        const mail = await mRes.json();
                        if (titleEl) titleEl.textContent = `↩️ Antwort an ${mail.fromName || mail.from}`;
                        if (sendBtn) {
                            sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Senden';
                        }
                        if (accSelect) accSelect.value = mail.accountId;
                        
                        // Absender-Adresse aus "Name <email>" extrahieren falls vorhanden
                        let replyToAddr = mail.from;
                        const match = mail.from.match(/<([^>]+)>/);
                        if (match) replyToAddr = match[1];

                        if (toInput) toInput.value = replyToAddr;
                        if (subjectInput) {
                            subjectInput.value = mail.subject.startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`;
                        }
                        if (inReplyToInput) inReplyToInput.value = mail.messageId || '';
                        if (bodyInput) {
                            bodyInput.value = '';
                            setTimeout(() => bodyInput.focus(), 50);
                        }
                    }
                } else {
                    // Neue E-Mail
                    if (titleEl) titleEl.textContent = '✍️ Neue E-Mail verfassen';
                    if (sendBtn) {
                        sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Senden';
                    }
                    if (defaultAccountId && accSelect) accSelect.value = defaultAccountId;
                    if (toInput) toInput.value = '';
                    if (subjectInput) subjectInput.value = '';
                    if (inReplyToInput) inReplyToInput.value = '';
                    if (bodyInput) bodyInput.value = '';
                    setTimeout(() => toInput && toInput.focus(), 50);
                }

                if (modal) modal.style.display = 'flex';
                document.body.classList.add('modal-active');
            } catch (err) {
                console.error("[Mail] Fehler beim Öffnen des Composers:", err);
                alert("Fehler beim Öffnen des E-Mail-Editors.");
            }
        }


        window.openMailComposeModal = openMailComposeModal;



        function closeMailComposeModal() {
            const modal = document.getElementById('mail-compose-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
            window.mailComposeIsEditMode = false;
            window.currentEditCardElement = null;
            window.currentEditCardData = null;
        }


        window.closeMailComposeModal = closeMailComposeModal;



        async function sendComposedEmail() {
            const accSelect = document.getElementById('mail-compose-account-select');
            const toInput = document.getElementById('mail-compose-to');
            const subjectInput = document.getElementById('mail-compose-subject');
            const bodyInput = document.getElementById('mail-compose-body');
            const inReplyToInput = document.getElementById('mail-compose-in-reply-to');
            const statusEl = document.getElementById('mail-compose-status');
            const sendBtn = document.getElementById('mail-compose-send-btn');
            const notifIdInput = document.getElementById('mail-compose-notification-id');
            const titleEl = document.getElementById('mail-compose-title');

            const isEditMode = Boolean(
                window.mailComposeIsEditMode || 
                (titleEl && titleEl.textContent.includes('bearbeiten')) ||
                Boolean(notifIdInput && notifIdInput.value.trim()) ||
                Boolean(window.currentEditCardElement)
            );

            const accountId = accSelect ? accSelect.value : null;
            const to = toInput ? toInput.value.trim() : '';
            const subject = subjectInput ? subjectInput.value.trim() : '';
            const body = bodyInput ? bodyInput.value.trim() : '';
            const inReplyTo = inReplyToInput ? inReplyToInput.value.trim() : undefined;
            const notificationId = notifIdInput ? notifIdInput.value.trim() : undefined;

            if (!accountId || !to || !subject || !body) {
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                    statusEl.style.color = 'var(--off)';
                    statusEl.textContent = 'Bitte alle Felder (Empfänger, Betreff, Nachricht) ausfüllen.';
                }
                return;
            }

            // ==========================================
            // BEARBEITUNG EINES ENTWURFS (NUR SPEICHERN!)
            // Senden ist in der Bearbeitungsmaske nicht möglich, erst danach auf der Karte!
            // ==========================================
            if (isEditMode) {
                if (sendBtn) {
                    sendBtn.disabled = true;
                    sendBtn.innerHTML = '⏳ Speichern...';
                }
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = 'rgba(137, 180, 250, 0.15)';
                    statusEl.style.color = 'var(--accent)';
                    statusEl.textContent = 'Entwurf wird gespeichert...';
                }

                try {
                    const selectedOpt = accSelect && accSelect.selectedOptions ? accSelect.selectedOptions[0] : null;
                    const selectedAccountText = selectedOpt ? selectedOpt.textContent : '';
                    const accMatch = selectedAccountText.match(/^(.+?)\s*\((.+?)\)$/);
                    const selectedAccountName = accMatch ? accMatch[1].trim() : (selectedOpt ? selectedOpt.textContent : '');
                    const selectedAccountEmail = accMatch ? accMatch[2].trim() : '';
                    const selectedFromStr = selectedAccountName && selectedAccountEmail && selectedAccountName !== selectedAccountEmail
                        ? `${selectedAccountName} <${selectedAccountEmail}>`
                        : (selectedAccountEmail || selectedAccountName);

                    let updatedNotif = null;

                    // 1. Wenn eine notificationId vorhanden ist, in DB aktualisieren
                    if (notificationId) {
                        try {
                            const notifRes = await fetch(getApiUrl(`/api/notifications/${notificationId}`));
                            let actData = {};
                            if (notifRes.ok) {
                                const notif = await notifRes.json();
                                actData = notif.actionData;
                                if (typeof actData === 'string') {
                                    try { actData = JSON.parse(actData); } catch (_) {}
                                }
                            }
                            actData = actData || {};
                            const isReply = actData.actionType === 'send_mail_reply' || Boolean(actData.replyData);
                            const dataKey = isReply ? 'replyData' : 'mailData';

                            actData[dataKey] = {
                                ...(actData[dataKey] || {}),
                                to,
                                subject,
                                body,
                                attachments: currentComposeAttachments,
                                accountId: Number(accountId),
                                accountName: selectedAccountName,
                                fromEmail: selectedAccountEmail,
                                from: selectedFromStr
                            };

                            const updateRes = await fetch(getApiUrl(`/api/notifications/${notificationId}`), {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    title: `✉️ ${subject}`,
                                    actionData: actData
                                })
                            });
                            if (updateRes.ok) {
                                const patchData = await updateRes.json();
                                updatedNotif = patchData.notification || { id: Number(notificationId) };
                            }
                        } catch (e) {
                            console.warn("[Mail] Konnte bestehende Notification nicht patchen:", e);
                        }
                    }

                    // 2. Wenn Notification noch nicht in DB existiert (z. B. aus Chat geparst), jetzt in DB anlegen
                    if (!updatedNotif) {
                        try {
                            const targetConvId = (typeof currentConversationId !== 'undefined' ? currentConversationId : null) || window.currentEditCardData?.conversationId || null;
                            const createRes = await fetch(getApiUrl('/api/notifications'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    title: `✉️ ${subject}`,
                                    message: body,
                                    type: 'action_required',
                                    priority: 'normal',
                                    conversationId: targetConvId,
                                    actionData: {
                                        actionType: 'send_mail_reply',
                                        replyData: {
                                            mailId: window.currentEditCardData?.mailId || 0,
                                            to,
                                            subject,
                                            body,
                                            attachments: currentComposeAttachments,
                                            accountId: Number(accountId),
                                            from: selectedFromStr,
                                            fromEmail: selectedAccountEmail,
                                            accountName: selectedAccountName
                                        }
                                    },
                                    buttons: [
                                        { label: 'Ja, Antwort senden', action: 'execute_action', style: 'primary' }
                                    ]
                                })
                            });
                            if (createRes.ok) {
                                updatedNotif = await createRes.json();
                                if (notifIdInput) notifIdInput.value = updatedNotif.id;
                            }
                        } catch (e) {
                            console.warn("[Mail] Konnte neue Notification für Entwurf nicht anlegen:", e);
                        }
                    }

                    // 3. Karten im DOM (im Chat und im Briefing) sofort visuell aktualisieren
                    const targetCards = [];
                    if (window.currentEditCardElement) targetCards.push(window.currentEditCardElement);
                    if (notificationId) {
                        const byId = document.querySelector(`[data-notification-id="${notificationId}"]`);
                        if (byId && !targetCards.includes(byId)) targetCards.push(byId);
                    }
                    if (updatedNotif?.id) {
                        const byNewId = document.querySelector(`[data-notification-id="${updatedNotif.id}"]`);
                        if (byNewId && !targetCards.includes(byNewId)) targetCards.push(byNewId);
                    }

                    targetCards.forEach(targetCard => {
                        if (updatedNotif?.id) {
                            targetCard.setAttribute('data-notification-id', String(updatedNotif.id));
                            targetCard.querySelectorAll('.chat-notification-btn').forEach(b => {
                                const currentClick = b.getAttribute('onclick') || '';
                                b.setAttribute('onclick', currentClick.replace(/handleChatNotificationClick\(this,\s*(?:null|''|\d+)/, `handleChatNotificationClick(this, ${updatedNotif.id}`));
                            });
                        }
                        const toVal = targetCard.querySelector('.mail-draft-to-val');
                        if (toVal) {
                            toVal.textContent = to;
                            const toRow = targetCard.querySelector('.mail-draft-to-row');
                            if (toRow) toRow.style.display = 'block';
                        }
                        const subVal = targetCard.querySelector('.mail-draft-subject-val');
                        if (subVal) {
                            subVal.textContent = subject;
                            const subRow = targetCard.querySelector('.mail-draft-subject-row');
                            if (subRow) subRow.style.display = 'block';
                        }
                        const bodyVal = targetCard.querySelector('.mail-draft-body-val') || targetCard.querySelector('.action-preview-box div[style*="white-space: pre-wrap"]');
                        if (bodyVal) bodyVal.textContent = body;
                        const fromVal = targetCard.querySelector('.mail-draft-from-val');
                        if (fromVal) {
                            fromVal.textContent = selectedFromStr;
                            const vonRow = targetCard.querySelector('.mail-draft-von-row');
                            if (vonRow) {
                                vonRow.style.display = 'block';
                                vonRow.setAttribute('data-account-id', String(accountId));
                            }
                        }
                    });

                    closeMailComposeModal();
                    if (typeof loadTopWidgets === 'function') loadTopWidgets();
                    if (typeof currentConversationId !== 'undefined' && currentConversationId && typeof loadConversationNotifications === 'function') {
                        loadConversationNotifications(currentConversationId);
                    }
                } catch (err) {
                    console.error("Fehler beim Speichern des Entwurfs:", err);
                    if (statusEl) {
                        statusEl.style.display = 'block';
                        statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                        statusEl.style.color = 'var(--off)';
                        statusEl.textContent = `Fehler beim Speichern: ${err.message || 'Speichern fehlgeschlagen'}`;
                    }
                } finally {
                    if (sendBtn) {
                        sendBtn.disabled = false;
                        sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Speichern';
                    }
                }
                return;
            }

            // ==========================================
            // NORMALES VERFASSEN & SOFORTIGES SENDEN (NUR FÜR NEUE MAILS)
            // ==========================================
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '⏳ Senden...';
            }

            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = 'rgba(137, 180, 250, 0.15)';
                statusEl.style.color = 'var(--accent)';
                statusEl.textContent = 'E-Mail wird über SMTP gesendet...';
            }

            try {
                const res = await fetch(getApiUrl('/api/mail/send'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accountId: Number(accountId),
                        to,
                        subject,
                        body,
                        inReplyTo,
                        attachments: currentComposeAttachments
                    })
                });

                const result = await res.json();
                if (res.ok && result.success) {
                    alert("✅ E-Mail erfolgreich gesendet!");
                    closeMailComposeModal();
                    if (typeof loadTopWidgets === 'function') loadTopWidgets();
                } else {
                    if (statusEl) {
                        statusEl.style.display = 'block';
                        statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                        statusEl.style.color = 'var(--off)';
                        statusEl.textContent = `Fehler beim Senden: ${result.error || 'Unbekannter Fehler'}`;
                    }
                }
            } catch (err) {
                console.error("Fehler beim Senden der E-Mail:", err);
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                    statusEl.style.color = 'var(--off)';
                    statusEl.textContent = `Fehler: ${err.message || 'Verbindung fehlgeschlagen'}`;
                }
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Senden';
                }
            }
        }

        window.sendComposedEmail = sendComposedEmail;



        // Mail Einstellungen Modal & Verwaltung
        async function openMailSettingsModal() {
            const modal = document.getElementById('mail-settings-modal');
            if (!modal) return;

            modal.style.display = 'flex';
            document.body.classList.add('modal-active');

            initMailPushSettings();
            loadMailSettingsCategories();
            loadMailSettingsAccounts();
        }


        window.openMailSettingsModal = openMailSettingsModal;


        window.openMailAccountsModal = openMailSettingsModal;



        function closeMailSettingsModal() {
            const modal = document.getElementById('mail-settings-modal');
            if (modal) modal.style.display = 'none';
            document.body.classList.remove('modal-active');
        }


        window.closeMailSettingsModal = closeMailSettingsModal;


        window.closeMailAccountsModal = closeMailSettingsModal;



        function initMailPushSettings() {
            const pushToggle = document.getElementById('mail-settings-push-toggle');
            if (pushToggle) {
                const isEnabled = localStorage.getItem('mail_notifications_enabled') !== 'false';
                pushToggle.checked = isEnabled;
            }
        }



        async function toggleMailPushNotifications(enabled) {
            localStorage.setItem('mail_notifications_enabled', enabled ? 'true' : 'false');
            if (enabled) {
                requestNotificationPermissions();
            }
            if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.setMailNotificationsEnabled === 'function') {
                window.AndroidWidgetInterface.setMailNotificationsEnabled(enabled);
            } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.setMailNotificationsEnabled === 'function') {
                window.Capacitor.Plugins.WidgetSettings.setMailNotificationsEnabled({ enabled });
            }
            console.log("[Mail] Push-Benachrichtigungen:", enabled ? "Aktiviert" : "Deaktiviert");
        }


        window.toggleMailPushNotifications = toggleMailPushNotifications;



        async function sendTestMailPushNotification() {
            const statusEl = document.getElementById('mail-push-test-status');
            if (statusEl) {
                statusEl.textContent = '⏳ Sende Test...';
                statusEl.style.color = 'var(--accent)';
            }

            try {
                requestNotificationPermissions();

                let notificationTriggered = false;

                if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.showTestMailNotification === 'function') {
                    window.AndroidWidgetInterface.showTestMailNotification();
                    notificationTriggered = true;
                } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.showTestMailNotification === 'function') {
                    window.Capacitor.Plugins.WidgetSettings.showTestMailNotification();
                    notificationTriggered = true;
                }

                // Fallback / Server API Test
                const res = await fetch(getApiUrl('/api/mail/notifications/test'), { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (!notificationTriggered && 'Notification' in window && Notification.permission === 'granted') {
                        try {
                            new Notification(data.testMail.subject, {
                                body: data.testMail.snippet,
                                icon: '/icon.png'
                            });
                        } catch (e) {
                            console.error("Web notification error:", e);
                        }
                    }
                }

                if (statusEl) {
                    statusEl.textContent = '✅ Benachrichtigung gesendet!';
                    statusEl.style.color = '#a6e3a1';
                    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
                }
            } catch (err) {
                console.error("[Mail] Test-Benachrichtigung Fehler:", err);
                if (statusEl) {
                    statusEl.textContent = '❌ Fehler beim Senden.';
                    statusEl.style.color = 'var(--off)';
                }
            }
        }


        window.sendTestMailPushNotification = sendTestMailPushNotification;



        async function injectTestMail(preset = 'question') {
            const statusEl = document.getElementById('mail-test-inject-status');
            if (statusEl) {
                statusEl.textContent = '⏳ Erzeuge Test-Mail & starte KI-Analyse...';
                statusEl.style.color = '#cba6f7';
            }
            try {
                const res = await fetch(getApiUrl('/api/mail/test-inject'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preset })
                });
                const data = await res.json();
                if (data && data.success) {
                    if (statusEl) {
                        statusEl.textContent = `✅ Test-Mail #${data.email.id} erstellt! Agent analysiert...`;
                        statusEl.style.color = '#a6e3a1';
                    }
                    setTimeout(() => {
                        loadTopWidgets();
                    }, 800);
                    setTimeout(() => {
                        loadTopWidgets();
                        if (statusEl) statusEl.textContent = '✨ Analyse abgeschlossen! Siehe Agent-Briefing / Mail.';
                    }, 4000);
                } else {
                    if (statusEl) {
                        statusEl.textContent = '❌ Fehler: ' + (data.error || 'Unbekannt');
                        statusEl.style.color = 'var(--off)';
                    }
                }
            } catch (err) {
                console.error("[Mail] Test-Inject Fehler:", err);
                if (statusEl) {
                    statusEl.textContent = '❌ Netzwerkfehler: ' + err.message;
                    statusEl.style.color = 'var(--off)';
                }
            }
        }


        window.injectTestMail = injectTestMail;



        async function loadMailSettingsCategories() {
            const listEl = document.getElementById('mail-settings-categories-list');
            if (!listEl) return;
            listEl.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.5; text-align: center; margin: 8px 0;">Lade Kategorien...</p>';

            try {
                const res = await fetch(getApiUrl('/api/mail/categories'));
                const categories = await res.json();
                listEl.innerHTML = '';

                if (!categories || categories.length === 0) {
                    listEl.innerHTML = `
                        <div style="padding: 10px; text-align: center; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px; font-size: 0.75rem; opacity: 0.6;">
                            Noch keine Kategorien vorhanden.
                        </div>
                    `;
                    return;
                }

                categories.forEach(cat => {
                    const card = document.createElement('div');
                    card.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; gap: 8px;';
                    card.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <span style="font-size: 1rem;">${escapeHtml(cat.icon || '🏷️')}</span>
                            <strong style="font-size: 0.82rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(cat.name)}</strong>
                        </div>
                        <button onclick="deleteMailCategory(${cat.id})" style="background: transparent; border: none; color: var(--off); cursor: pointer; font-size: 0.85rem; padding: 2px 4px;" title="Kategorie löschen">🗑️</button>
                    `;
                    listEl.appendChild(card);
                });
            } catch (e) {
                listEl.innerHTML = '<p style="font-size: 0.75rem; color: var(--off);">Fehler beim Laden der Kategorien.</p>';
            }
        }


        window.loadMailSettingsCategories = loadMailSettingsCategories;



        async function createMailCategory() {
            const nameInput = document.getElementById('mail-cat-name-input');
            const iconInput = document.getElementById('mail-cat-icon-input');
            const name = nameInput ? nameInput.value.trim() : '';
            const icon = iconInput ? iconInput.value.trim() : '🏷️';

            if (!name) {
                alert("Bitte einen Namen für die Kategorie eingeben.");
                return;
            }

            try {
                const res = await fetch(getApiUrl('/api/mail/categories'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, icon: icon || '🏷️' })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert(`Fehler: ${err.error || 'Konnte Kategorie nicht erstellen.'}`);
                    return;
                }
                if (nameInput) nameInput.value = '';
                if (iconInput) iconInput.value = '🏷️';
                loadMailSettingsCategories();
                loadTopWidgets();
            } catch (e) {
                alert("Fehler beim Erstellen der Kategorie.");
            }
        }


        window.createMailCategory = createMailCategory;



        async function deleteMailCategory(id) {
            if (!confirm("Möchtest du diese Kategorie wirklich löschen?")) return;
            try {
                const res = await fetch(getApiUrl(`/api/mail/categories/${id}`), { method: 'DELETE' });
                if (res.ok) {
                    loadMailSettingsCategories();
                    loadTopWidgets();
                } else {
                    alert("Fehler beim Löschen der Kategorie.");
                }
            } catch (e) {
                alert("Fehler beim Löschen der Kategorie.");
            }
        }


        window.deleteMailCategory = deleteMailCategory;



        async function loadMailSettingsAccounts() {
            const listEl = document.getElementById('mail-settings-accounts-list');
            if (!listEl) return;

            listEl.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.5; text-align: center; margin: 8px 0;">Lade Konten...</p>';

            try {
                const res = await fetch(getApiUrl('/api/mail/accounts'));
                const accounts = await res.json();

                listEl.innerHTML = '';
                if (!accounts || accounts.length === 0) {
                    listEl.innerHTML = '<p style="font-size: 0.75rem; opacity: 0.6; text-align: center; margin: 10px 0;">Keine Konten hinterlegt.</p>';
                } else {
                    accounts.forEach(acc => {
                        const icon = acc.email.toLowerCase().includes('web.de') ? '🟠' : (acc.email.toLowerCase().includes('gmail') ? '🔴' : '✉️');
                        const card = document.createElement('div');
                        card.style.cssText = `background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-left: 3.5px solid ${acc.color || '#89b4fa'}; border-radius: 8px; padding: 9px 11px; display: flex; justify-content: space-between; align-items: center; gap: 10px;`;
                        
                        card.innerHTML = `
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 0.85rem;">${icon}</span>
                                    <strong style="font-size: 0.82rem; color: var(--text);">${escapeHtml(acc.name)}</strong>
                                </div>
                                <div style="font-size: 0.72rem; opacity: 0.7; color: var(--accent); margin-top: 1px;">${escapeHtml(acc.email)}</div>
                                <div style="font-size: 0.65rem; opacity: 0.4; margin-top: 1px;">IMAP: ${escapeHtml(acc.imapHost)} | SMTP: ${escapeHtml(acc.smtpHost)}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <button onclick="testExistingAccount(${acc.id})" class="nav-btn" style="padding: 4px 7px; font-size: 0.68rem;" title="Verbindung prüfen">🔍 Testen</button>
                                <button onclick="deleteMailAccount(${acc.id})" style="background: transparent; border: none; color: var(--off); cursor: pointer; font-size: 0.85rem; padding: 3px;" title="Konto löschen">🗑️</button>
                            </div>
                        `;
                        listEl.appendChild(card);
                    });
                }
            } catch (err) {
                console.error("[Mail] Fehler beim Laden der Konten:", err);
                listEl.innerHTML = '<p style="font-size: 0.75rem; color: var(--off);">Fehler beim Laden der Konten.</p>';
            }
        }


        window.loadMailSettingsAccounts = loadMailSettingsAccounts;



        async function deleteMailAccount(id) {
            if (!confirm("Möchtest du dieses E-Mail-Konto und die zugehörigen gespeicherten E-Mails wirklich entfernen?")) return;
            try {
                const res = await fetch(getApiUrl(`/api/mail/accounts/${id}`), { method: 'DELETE' });
                if (res.ok) {
                    loadMailSettingsAccounts();
                    loadTopWidgets();
                } else {
                    alert("Fehler beim Löschen des Kontos.");
                }
            } catch (e) {
                alert("Fehler beim Löschen des Kontos.");
            }
        }


        window.deleteMailAccount = deleteMailAccount;



        function openMailAccountFormModal(accountId = null) {
            const modal = document.getElementById('mail-account-form-modal');
            const titleEl = document.getElementById('mail-account-form-title');
            const idInput = document.getElementById('mail-form-account-id');
            const presetSelect = document.getElementById('mail-form-preset');
            const nameInput = document.getElementById('mail-form-name');
            const emailInput = document.getElementById('mail-form-email');
            const passwordInput = document.getElementById('mail-form-password');
            const statusEl = document.getElementById('mail-form-status');

            if (statusEl) statusEl.style.display = 'none';

            if (idInput) idInput.value = accountId || '';
            if (titleEl) titleEl.textContent = accountId ? 'E-Mail-Konto bearbeiten' : 'E-Mail-Konto hinzufügen';
            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (passwordInput) passwordInput.value = '';

            if (presetSelect) {
                presetSelect.value = 'webde';
                handleMailPresetChange('webde');
            }

            if (modal) modal.style.display = 'flex';
            document.body.classList.add('modal-active');
        }


        window.openMailAccountFormModal = openMailAccountFormModal;



        function closeMailAccountFormModal() {
            const modal = document.getElementById('mail-account-form-modal');
            if (modal) modal.style.display = 'none';
            // If settings modal was open, keep modal-active
            const settingsModal = document.getElementById('mail-settings-modal');
            if (!settingsModal || settingsModal.style.display === 'none') {
                document.body.classList.remove('modal-active');
            }
        }


        window.closeMailAccountFormModal = closeMailAccountFormModal;



        function handleMailPresetChange(preset) {
            const imapHost = document.getElementById('mail-form-imap-host');
            const imapPort = document.getElementById('mail-form-imap-port');
            const smtpHost = document.getElementById('mail-form-smtp-host');
            const smtpPort = document.getElementById('mail-form-smtp-port');
            const hintEl = document.getElementById('mail-preset-hint');
            const nameInput = document.getElementById('mail-form-name');
            const emailInput = document.getElementById('mail-form-email');

            if (preset === 'webde') {
                if (imapHost) imapHost.value = 'imap.web.de';
                if (imapPort) imapPort.value = '993';
                if (smtpHost) smtpHost.value = 'smtp.web.de';
                if (smtpPort) smtpPort.value = '587';
                if (hintEl) hintEl.innerHTML = '💡 <strong>Web.de:</strong> Bitte in deinen Web.de-Einstellungen unter <em>"Einstellungen > POP3/IMAP Abruf"</em> den externen Zugriff aktivieren.';
                if (nameInput && !nameInput.value) nameInput.value = 'Web.de';
                if (emailInput) emailInput.placeholder = 'max.mustermann@web.de';
            } else if (preset === 'gmail') {
                if (imapHost) imapHost.value = 'imap.gmail.com';
                if (imapPort) imapPort.value = '993';
                if (smtpHost) smtpHost.value = 'smtp.gmail.com';
                if (smtpPort) smtpPort.value = '465';
                if (hintEl) hintEl.innerHTML = '💡 <strong>Gmail:</strong> Google verlangt ein <strong>App-Passwort</strong>. Erstelle eins unter <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color: var(--accent); text-decoration: underline;">myaccount.google.com/apppasswords</a>.';
                if (nameInput && !nameInput.value) nameInput.value = 'Google Mail';
                if (emailInput) emailInput.placeholder = 'mein.name@gmail.com';
            } else {
                if (hintEl) hintEl.innerHTML = '⚙️ Trage die IMAP- und SMTP-Serverdaten deines E-Mail-Anbieters manuell ein.';
            }
        }


        window.handleMailPresetChange = handleMailPresetChange;



        async function testCurrentAccountConnection() {
            const emailInput = document.getElementById('mail-form-email');
            const passwordInput = document.getElementById('mail-form-password');
            const imapHostInput = document.getElementById('mail-form-imap-host');
            const imapPortInput = document.getElementById('mail-form-imap-port');
            const statusEl = document.getElementById('mail-form-status');

            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';
            const imapHost = imapHostInput ? imapHostInput.value.trim() : '';
            const imapPort = imapPortInput ? Number(imapPortInput.value) : 993;

            if (!email || !password || !imapHost) {
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                    statusEl.style.color = 'var(--off)';
                    statusEl.textContent = 'Bitte E-Mail, Passwort und IMAP-Host ausfüllen.';
                }
                return;
            }

            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = 'rgba(137, 180, 250, 0.15)';
                statusEl.style.color = 'var(--accent)';
                statusEl.textContent = '⏳ Verbindung wird getestet...';
            }

            try {
                const res = await fetch(getApiUrl('/api/mail/accounts/test'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, imapHost, imapPort, imapTls: true })
                });
                const result = await res.json();
                if (result.success) {
                    statusEl.style.background = 'rgba(166, 227, 161, 0.15)';
                    statusEl.style.color = 'var(--on)';
                    statusEl.textContent = `✅ ${result.message}`;
                } else {
                    statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                    statusEl.style.color = 'var(--off)';
                    statusEl.textContent = `❌ ${result.message}`;
                }
            } catch (err) {
                statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                statusEl.style.color = 'var(--off)';
                statusEl.textContent = `❌ Fehler: ${err.message}`;
            }
        }


        window.testCurrentAccountConnection = testCurrentAccountConnection;



        async function testExistingAccount(id) {
            try {
                const res = await callTool('verwalte_mail_konten', { aktion: 'test', kontoId: Number(id) });
                if (res && res.status === 'success') {
                    alert(`✅ Verbindungstest erfolgreich!\n\n${res.message}`);
                } else {
                    alert(`❌ Verbindungstest fehlgeschlagen:\n\n${res?.message || 'Unbekannter Fehler'}`);
                }
            } catch (err) {
                alert(`Fehler: ${err.message}`);
            }
        }


        window.testExistingAccount = testExistingAccount;



        async function saveMailAccountForm() {
            const idInput = document.getElementById('mail-form-account-id');
            const nameInput = document.getElementById('mail-form-name');
            const emailInput = document.getElementById('mail-form-email');
            const passwordInput = document.getElementById('mail-form-password');
            const imapHostInput = document.getElementById('mail-form-imap-host');
            const imapPortInput = document.getElementById('mail-form-imap-port');
            const smtpHostInput = document.getElementById('mail-form-smtp-host');
            const smtpPortInput = document.getElementById('mail-form-smtp-port');
            const statusEl = document.getElementById('mail-form-status');

            const id = idInput ? idInput.value : '';
            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';
            const imapHost = imapHostInput ? imapHostInput.value.trim() : '';
            const imapPort = imapPortInput ? Number(imapPortInput.value) : 993;
            const smtpHost = smtpHostInput ? smtpHostInput.value.trim() : '';
            const smtpPort = smtpPortInput ? Number(smtpPortInput.value) : 587;

            if (!name || !email || !password || !imapHost || !smtpHost) {
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                    statusEl.style.color = 'var(--off)';
                    statusEl.textContent = 'Bitte alle Pflichtfelder ausfüllen.';
                }
                return;
            }

            const payload = {
                name,
                email,
                password,
                imapHost,
                imapPort,
                imapTls: true,
                smtpHost,
                smtpPort,
                smtpTls: true,
                color: email.toLowerCase().includes('web.de') ? '#fab387' : (email.toLowerCase().includes('gmail') ? '#f38ba8' : '#89b4fa')
            };

            try {
                const url = id ? getApiUrl(`/api/mail/accounts/${id}`) : getApiUrl('/api/mail/accounts');
                const method = id ? 'PUT' : 'POST';

                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    closeMailAccountFormModal();
                    openMailAccountsModal();
                    loadTopWidgets();
                    // Initial sync auslösen
                    syncAllMailsManual();
                } else {
                    const err = await res.json();
                    if (statusEl) {
                        statusEl.style.display = 'block';
                        statusEl.style.background = 'rgba(243, 139, 168, 0.15)';
                        statusEl.style.color = 'var(--off)';
                        statusEl.textContent = `Fehler beim Speichern: ${err.error || 'Unbekannt'}`;
                    }
                }
            } catch (err) {
                console.error("[Mail] Speicher-Fehler:", err);
            }
        }


        window.saveMailAccountForm = saveMailAccountForm;



        // Notes and Tasks JS Modals Logic
        const noteModal = document.getElementById('note-modal');


        const noteIdInput = document.getElementById('note-id-input');


        const noteProjectIdInput = document.getElementById('note-project-id-input');


        const noteTitleInput = document.getElementById('note-title-input');


        const noteContentInput = document.getElementById('note-content-input');


        const noteModalTitle = document.getElementById('note-modal-title');



        window.openNoteModal = function(id = null, title = '', content = '', projectId = null) {
            noteIdInput.value = id || '';
            noteProjectIdInput.value = projectId || '';
            noteTitleInput.value = title;
            noteContentInput.value = content;
            noteModalTitle.textContent = id ? 'Notiz bearbeiten' : 'Notiz erstellen';
            noteModal.style.display = 'block';
            document.body.classList.add('modal-active');
        };



        let lastNotifiedForegroundMailId = Number(localStorage.getItem('last_foreground_mail_id') || 0);



        function getUnifiedLastMailId() {
            let id = lastNotifiedForegroundMailId;
            try {
                if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.getLastNotifiedMailId === 'function') {
                    const androidId = Number(window.AndroidWidgetInterface.getLastNotifiedMailId());
                    if (!isNaN(androidId) && androidId > id) {
                        id = androidId;
                    }
                }
            } catch (_) {}
            return id;
        }



        function setUnifiedLastMailId(id) {
            lastNotifiedForegroundMailId = id;
            localStorage.setItem('last_foreground_mail_id', String(id));
            try {
                if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.setLastNotifiedMailId === 'function') {
                    window.AndroidWidgetInterface.setLastNotifiedMailId(id);
                } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.setLastNotifiedMailId === 'function') {
                    window.Capacitor.Plugins.WidgetSettings.setLastNotifiedMailId({ id });
                }
            } catch (_) {}
        }



        function showMailPushNotification(fromName, subject, snippet, mailId, accountEmail) {
            if (localStorage.getItem('mail_notifications_enabled') === 'false') return;

            const sender = (fromName && fromName.trim() && fromName !== 'Unbekannt') ? fromName.trim() : 'Neue E-Mail';
            const mailSubject = (subject && subject.trim()) ? subject.trim() : '(Kein Betreff)';
            const preview = snippet ? snippet.trim() : '';

            if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.showMailNotification === 'function') {
                window.AndroidWidgetInterface.showMailNotification(sender, mailSubject, preview, mailId, accountEmail || '');
            } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.showMailNotification === 'function') {
                window.Capacitor.Plugins.WidgetSettings.showMailNotification({
                    fromName: sender,
                    subject: mailSubject,
                    snippet: preview,
                    mailId: mailId,
                    accountEmail: accountEmail || ''
                });
            } else if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification(`📧 ${sender}: ${mailSubject}`, {
                        body: preview,
                        icon: '/icon.png'
                    });
                } catch (e) {
                    console.error("Web notification error:", e);
                }
            }
        }


        window.showMailPushNotification = showMailPushNotification;



        async function checkMailNotificationsForeground(isInitialCheck = false) {
            if (localStorage.getItem('mail_notifications_enabled') === 'false') return;

            try {
                let currentLastId = getUnifiedLastMailId();

                const endpoint = currentLastId > 0
                    ? `/api/mail/notifications/latest?sinceId=${currentLastId}`
                    : `/api/mail/notifications/latest`;

                const res = await fetch(getApiUrl(endpoint));
                if (!res.ok) return;

                const data = await res.json();
                const newEmails = data.newEmails || [];

                if (data.unreadCount === 0) {
                    dismissAllMailNotifications();
                }

                const maxId = Math.max(
                    currentLastId,
                    ...(newEmails.map(m => m.id)),
                    data.latestMailId || 0
                );

                // Wenn initialer Check beim App-Start:
                // Keine alten Mails aufpoppen lassen, sondern nur die ID synchronisieren!
                if (isInitialCheck || currentLastId === 0) {
                    if (maxId > currentLastId) {
                        setUnifiedLastMailId(maxId);
                    }
                    return;
                }

                if (newEmails.length > 0) {
                    // Wenn App im Vordergrund sichtbar ist: KEINE laute Android-System-Benachrichtigung!
                    // Stattdessen leise die Widgets und Badges aktualisieren.
                    const isAppVisible = !document.hidden;

                    if (!isAppVisible) {
                        newEmails.forEach(mail => {
                            showMailPushNotification(
                                mail.fromName || mail.from,
                                mail.subject,
                                mail.snippet,
                                mail.id,
                                mail.accountEmail
                            );
                        });
                    } else {
                        // Leise UI-Aktualisierung
                        loadTopWidgets();
                    }

                    setUnifiedLastMailId(maxId);
                } else if (data.latestMailId && data.latestMailId > currentLastId) {
                    setUnifiedLastMailId(data.latestMailId);
                }
            } catch (err) {
                // Background check error ignored
            }
        }


        window.checkMailNotificationsForeground = checkMailNotificationsForeground;



        function requestNotificationPermissions() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().catch(e => console.error("Notification permission error:", e));
            }
            if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.requestNotificationPermission === 'function') {
                window.AndroidWidgetInterface.requestNotificationPermission();
            } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.requestNotificationPermission === 'function') {
                window.Capacitor.Plugins.WidgetSettings.requestNotificationPermission();
            }
        }



