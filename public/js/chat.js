

        // =========================================================================
        // Chat Swipe-to-Reply & Jump Helpers
        // =========================================================================
        let activeChatReply = null;



        function startChatReply(msgEl) {
            if (!msgEl) return;
            const msgId = msgEl.id || msgEl.getAttribute('data-msg-id');
            const isUser = msgEl.classList.contains('user');
            const roleLabel = isUser ? 'Du' : 'KI';
            
            // Extract snippet text
            let text = msgEl.getAttribute('data-msg-text') || '';
            if (!text) {
                const textDiv = msgEl.querySelector('div:not(.chat-reply-quote):not(.message-swipe-reply-indicator)');
                text = textDiv ? textDiv.innerText : msgEl.innerText;
            }
            const cleanSnippet = text.replace(/<[^>]*>/g, '').trim().substring(0, 90);

            activeChatReply = {
                id: msgId,
                author: roleLabel,
                text: cleanSnippet
            };

            const replyBar = document.getElementById('chat-reply-preview-bar');
            const authorLabel = document.getElementById('reply-author-label');
            const snippetText = document.getElementById('reply-snippet-text');

            if (replyBar && authorLabel && snippetText) {
                authorLabel.textContent = roleLabel;
                snippetText.textContent = cleanSnippet || '...';
                replyBar.style.display = 'flex';
            }

            if (navigator.vibrate) navigator.vibrate(25);

            const input = document.getElementById('user-input');
            if (input) input.focus();
        }


        window.startChatReply = startChatReply;



        function cancelChatReply() {
            activeChatReply = null;
            const replyBar = document.getElementById('chat-reply-preview-bar');
            if (replyBar) replyBar.style.display = 'none';
        }


        window.cancelChatReply = cancelChatReply;



        function scrollToMessage(msgId) {
            if (!msgId) return;
            const target = document.getElementById(msgId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.remove('message-highlight-pulse');
                void target.offsetWidth; // Force reflow
                target.classList.add('message-highlight-pulse');
                setTimeout(() => {
                    target.classList.remove('message-highlight-pulse');
                }, 2200);
            }
        }


        window.scrollToMessage = scrollToMessage;



        function renderMarkdown(text) {
            if (!text) return "";

            const codeBlocks = [];
            // 1. Extract triple-backtick code blocks using safe tokens without underscores
            let processed = text.replace(/```([a-zA-Z0-9_\-#+.]*)\r?\n?([\s\S]*?)```/g, (match, lang, code) => {
                const placeholder = `@@@CODEBLOCK${codeBlocks.length}@@@`;
                codeBlocks.push({ lang: (lang || '').trim() || 'text', code: code.replace(/^\n+|\n+$/g, '') });
                return placeholder;
            });

            // Clean up any legacy corrupted placeholders if present in old texts
            processed = processed.replace(/_CODEBLOCK\d+_/g, '');
            processed = processed.replace(/___CODE_BLOCK_\d+___/g, '');

            let html = escapeHtml(processed);
            
            // Entity-Links: [Label](app://type/id)
            const linkRegex = /\[([^\]]+)\]\((app:\/\/([a-zA-Z0-9_\-]+)\/([a-zA-Z0-9_\-:]+))\)/g;
            const fallbackLinkConfigs = {
                day: { icon: '📅', color: 'rgba(137, 180, 250, 0.15)', borderColor: '#89b4fa' },
                pause: { icon: '☕', color: 'rgba(249, 226, 175, 0.15)', borderColor: '#f9e2af' },
                travel: { icon: '🗺️', color: 'rgba(166, 227, 161, 0.15)', borderColor: '#a6e3a1' }
            };
            html = html.replace(linkRegex, (match, label, url, type, id) => {
                const config = entityConfigs[type] || fallbackLinkConfigs[type] || { icon: '🔗', color: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' };
                return `<span class="entity-link entity-${type}" data-type="${type}" data-id="${id}" style="background: ${config.color}; border: 1px solid ${config.borderColor}; color: ${config.borderColor}; cursor: pointer;" onclick="handleEntityClick(event, '${type}', '${id}')"><span>${config.icon}</span>${label}</span>`;
            });

            // Bold (**text**) -> Render slightly larger and bold for a premium look
            html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong style="font-weight: 800; font-size: 1.05em; color: #ffffff;">$1</strong>');
            // Italic (*text* or _text_)
            html = html.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
            html = html.replace(/_([\s\S]+?)_/g, '<em>$1</em>');
            // Inline Code (`code`)
            html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; color: var(--accent);">$1</code>');
            // Newlines to <br>
            html = html.replace(/\n/g, '<br>');

            // ⚙️ Ausgeführte Aktionen Spoiler in interaktives HTML-Accordion verwandeln
            const actionsSpoilerRegex = /&gt;\s*⚙️\s*<strong[^>]*>Ausgeführte Aktionen \((\d+)\)<\/strong>\s*<em>\(Klicken zum Aufklappen\)<\/em><br>\|\|<br>([\s\S]*?)<br>\|\|/g;
            html = html.replace(actionsSpoilerRegex, (m, count, inner) => {
                return `
                    <details class="chat-actions-details">
                        <summary class="chat-actions-summary">
                            <span class="chat-actions-icon">⚙️</span>
                            <span class="chat-actions-title">Ausgeführte Aktionen (${count})</span>
                            <span class="chat-actions-hint">Klicken zum Aufklappen</span>
                        </summary>
                        <div class="chat-actions-body">${inner}</div>
                    </details>
                `;
            });

            // Allgemeine Spoilers || ... || unterstützen
            html = html.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="chat-spoiler" onclick="this.classList.toggle(\'revealed\')" title="Klicken zum Aufklappen">$1</span>');

            // Re-insert code blocks with syntax wrapper and copy button
            codeBlocks.forEach((cb, idx) => {
                const placeholder = `@@@CODEBLOCK${idx}@@@`;
                const cleanLang = escapeHtml(cb.lang || 'code');
                const cleanCode = escapeHtml(cb.code);
                const blockHtml = `
                    <div class="chat-code-block">
                        <div class="chat-code-header">
                            <span class="chat-code-lang">${cleanLang}</span>
                            <button class="chat-code-copy-btn" onclick="copyCodeBlock(this)" title="Code kopieren">
                                📋 Kopieren
                            </button>
                        </div>
                        <pre class="chat-code-pre"><code class="chat-code-content">${cleanCode}</code></pre>
                    </div>
                `;
                html = html.split(placeholder).join(blockHtml);
            });

            return html;
        }



        
        // ==========================================================================
        // Chat Notification Card & Interactive Action Handlers
        // ==========================================================================
        let currentConversationNotifications = [];



        function parseNotificationFromText(text) {
            if (!text || !text.includes('erstelle_benachrichtigung')) return null;

            const regex = /erstelle_benachrichtigung\(([\s\S]+?)\)/;
            const match = text.match(regex);
            if (!match) return null;

            const argsStr = match[1];

            const getParam = (key) => {
                const m = argsStr.match(new RegExp(key + ':\\s*"((?:[^"\\\\]|\\\\.)*)"'));
                if (m) {
                    try {
                        return JSON.parse('"' + m[1] + '"');
                    } catch (e) {
                        return m[1];
                    }
                }
                return null;
            };

            const title = getParam('titel') || getParam('title') || 'Benachrichtigung';
            const message = getParam('nachricht') || getParam('message') || '';
            const type = getParam('typ') || getParam('type') || 'question';
            const conversationId = getParam('conversationId') || null;

            let buttons = null;
            const btnMatch = argsStr.match(/buttons:\s*(\[[\s\S]*?\])(?:,\s*[a-zA-Z0-9]+:|\s*$)/);
            if (btnMatch) {
                try {
                    buttons = JSON.parse(btnMatch[1]);
                } catch (e) {
                    try {
                        buttons = eval('(' + btnMatch[1] + ')');
                    } catch (e2) {}
                }
            }

            if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
                if (type === 'question') {
                    buttons = [
                        { label: 'Ja, abschicken', action: 'reply', replyText: 'Ja, bitte abschicken', style: 'primary' },
                        { label: 'Nein, abbrechen', action: 'dismiss', replyText: 'Nein, abbrechen', style: 'secondary' }
                    ];
                }
            }

            return {
                id: null,
                title,
                message,
                type,
                buttons,
                conversationId,
                isDismissed: false,
                selectedButton: null
            };
        }



        function hexToRgba(hex, alpha = 1) {
            if (!hex) return `rgba(137, 180, 250, ${alpha})`;
            let c = String(hex).replace('#', '');
            if (c.length === 3) c = c.split('').map(x => x + x).join('');
            const num = parseInt(c, 16);
            if (isNaN(num)) return `rgba(137, 180, 250, ${alpha})`;
            const r = (num >> 16) & 255;
            const g = (num >> 8) & 255;
            const b = num & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }



        function getNotifAgentInfo(notif) {
            if (!notif) return { id: 'unknown', name: 'KI-Agent', avatar: '🤖', color: '#89b4fa' };
            let rawName = (notif.agentName || '').trim();
            let avatar = (notif.agentAvatar && notif.agentAvatar !== '??') ? notif.agentAvatar : '';
            let color = notif.agentColor || '';

            // Check against currentAgentSettings
            if (typeof currentAgentSettings === 'object' && currentAgentSettings) {
                // Pass 1: Prioritize matching configured agent by name
                if (rawName) {
                    const cleanR = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    for (const [key, conf] of Object.entries(currentAgentSettings)) {
                        if (!conf) continue;
                        const cleanC = (conf.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (cleanC && cleanR && (cleanC === cleanR || cleanR.includes(cleanC) || cleanC.includes(cleanR))) {
                            return {
                                id: key,
                                name: conf.name || rawName,
                                avatar: (avatar || conf.avatar || '🤖').replace(/^\?\?$/, '🤖'),
                                color: color || conf.color || '#89b4fa'
                            };
                        }
                    }
                }

                // Pass 2: Match by trigger or sourceType if no specific name match
                for (const [key, conf] of Object.entries(currentAgentSettings)) {
                    if (!conf) continue;
                    const matchesTrigger = Boolean(notif.sourceType && conf.trigger === notif.sourceType);
                    const matchesMail = Boolean(notif.sourceType === 'mail' && (conf.id === 'mail' || key === 'mail'));
                    const matchesRoute = Boolean((notif.sourceType === 'route_planner' || notif.sourceType === 'calendar') && (conf.id === 'routenplaner' || key === 'routenplaner'));
                    const matchesDiscord = Boolean(notif.sourceType === 'discord' && (conf.id === 'discord' || key === 'discord'));

                    if (matchesTrigger || matchesMail || matchesRoute || matchesDiscord) {
                        return {
                            id: key,
                            name: conf.name || rawName || 'Agent',
                            avatar: (avatar || conf.avatar || '🤖').replace(/^\?\?$/, '🤖'),
                            color: color || conf.color || '#89b4fa'
                        };
                    }
                }
            }

            // Fallback if not matched in currentAgentSettings
            let name = rawName;
            if (!name) {
                if (notif.sourceType === 'mail') name = 'E-Mail Agent';
                else if (notif.sourceType === 'route_planner') name = 'Routenplaner Agent';
                else if (notif.sourceType === 'discord') name = 'Discord Bot';
                else name = 'KI-Agent';
            }

            const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (!avatar) {
                if (id.includes('mail')) avatar = '✉️';
                else if (id.includes('route')) avatar = '🗺️';
                else if (id.includes('discord')) avatar = '💬';
                else avatar = '🤖';
            }
            if (!color) {
                if (id.includes('mail')) color = '#fab387';
                else if (id.includes('route')) color = '#a6e3a1';
                else if (id.includes('discord')) color = '#5865F2';
                else color = '#89b4fa';
            }

            return { id, name, avatar, color };
        }


        window.getNotifAgentInfo = getNotifAgentInfo;



        function getNotificationCardHtml(notif, convId) {
            const notifType = notif.type || 'info';
            const dismissedClass = notif.isDismissed ? ' dismissed' : '';
            const notifId = notif.id ? String(notif.id) : '';
            const targetConvId = convId || notif.conversationId || '';

            // Agent Color & Avatar Resolution
            const agentInfo = getNotifAgentInfo(notif);
            const agentColor = agentInfo.color;
            const agentAvatar = agentInfo.avatar;

            let typeBadgeText = 'ℹ️ Information';
            let badgeBg = hexToRgba(agentColor, 0.15);
            let badgeColor = agentColor;

            if (notifType === 'question') {
                typeBadgeText = '❓ Frage & Bestätigung';
            } else if (notifType === 'action_required') {
                typeBadgeText = '⚡ Handlungsbedarf';
            }

            const agentLabel = notif.agentName || agentInfo.name;
            const agentBadgeHtml = `
                <span class="chat-agent-badge" style="font-size: 0.7rem; background: ${hexToRgba(agentColor, 0.18)}; color: #ffffff; padding: 2px 8px; border-radius: 6px; font-weight: 700; border: 1px solid ${hexToRgba(agentColor, 0.45)}; display: inline-flex; align-items: center; gap: 4px;">
                    <span style="font-size: 0.85rem;">${agentAvatar}</span>
                    <span>${escapeHtml(agentLabel)}</span>
                </span>
            `;

            let timeStr = '';
            if (notif.createdAt) {
                const notifDate = new Date(notif.createdAt);
                const todayStr = getLocalDateString();
                timeStr = getLocalDateString(notifDate) === todayStr
                    ? notifDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
                    : notifDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            }

            let buttonsList = [];
            if (notif.buttons) {
                try {
                    buttonsList = typeof notif.buttons === 'string' ? JSON.parse(notif.buttons) : notif.buttons;
                } catch (e) {
                    buttonsList = [];
                }
            }

            const escTitle = escapeHtml(notif.title || 'Benachrichtigung');

            // Structured action preview (Event / Task / Mail)
            let actionPreviewHtml = '';
            let actionData = notif.actionData;
            if (typeof actionData === 'string') {
                try { actionData = JSON.parse(actionData); } catch (e) {}
            }

            let messageBodyHtml = '';
            const rawMsg = notif.message || '';

            if (actionData && actionData.actionType) {
                // If message contains redundant bullet points (Termin, Aufgabe, Datum, Uhrzeit, etc.) or embedded codeblocks:
                const hasDuplicateBullets = /•\s*\*\*(Termin|Aufgabe|Datum|Uhrzeit|Fälligkeit|Ort|Notiz|Beschreibung)\*\*/i.test(rawMsg);
                const hasCodeBlockReply = /```/.test(rawMsg) || /_CODEBLOCK/i.test(rawMsg);

                if (hasDuplicateBullets || hasCodeBlockReply) {
                    const mailSummary = notif.reasoning || 'In der E-Mail wurde um diese Aktion gebeten.';
                    let actionPrompt = 'Soll diese Aktion ausgeführt werden?';
                    if (actionData.actionType === 'create_event') {
                        actionPrompt = 'Soll dieser Termin in deinen Kalender eingetragen werden?';
                    } else if (actionData.actionType === 'create_task') {
                        actionPrompt = 'Soll diese Aufgabe für dich angelegt werden?';
                    } else if (actionData.actionType === 'send_mail_reply') {
                        actionPrompt = 'Ich habe folgenden Antwortentwurf vorbereitet. Soll ich diese Antwort so abschicken oder möchtest du sie im Editor anpassen?';
                    }

                    messageBodyHtml = `
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px;">
                            <div style="font-size: 0.7rem; font-weight: 700; color: #89b4fa; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                                <span>✉️ Inhalt / Anlass der E-Mail</span>
                            </div>
                            <div style="font-size: 0.8rem; line-height: 1.45; color: rgba(255, 255, 255, 0.9); background: rgba(137, 180, 250, 0.07); border-left: 3px solid #89b4fa; padding: 6px 10px; border-radius: 4px;">
                                ${renderMarkdown(mailSummary)}
                            </div>
                            <div style="font-size: 0.78rem; font-weight: 600; color: rgba(255, 255, 255, 0.85); margin-top: 3px;">
                                ${actionPrompt}
                            </div>
                        </div>
                    `;
                } else {
                    messageBodyHtml = renderMarkdown(rawMsg);
                }
            } else {
                messageBodyHtml = renderMarkdown(rawMsg);
            }

            if (actionData && actionData.actionType) {
                if (actionData.actionType === 'create_event' && actionData.eventData) {
                    const ev = actionData.eventData;
                    const timeText = ev.isAllDay ? 'Ganztägig' : (ev.startTime ? (ev.endTime ? `${ev.startTime} – ${ev.endTime} Uhr` : `ab ${ev.startTime} Uhr`) : 'Uhrzeit offen');
                    actionPreviewHtml = `
                        <div class="action-preview-box" style="margin-top: 8px; background: rgba(0,0,0,0.35); border: 1px solid ${hexToRgba(agentColor, 0.4)}; border-left: 4px solid ${agentColor}; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px;">
                            <div style="font-size: 0.72rem; font-weight: 700; color: ${agentColor}; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                                <span>📅 Kalendereintrag (Wird erst nach "Ja" fest angelegt)</span>
                            </div>
                            <div style="font-weight: 700; font-size: 0.9rem; color: #ffffff;">${escapeHtml(ev.title)}</div>
                            <div style="font-size: 0.76rem; color: #cdd6f4; display: flex; gap: 12px; flex-wrap: wrap;">
                                <span>📆 <strong>${escapeHtml(ev.date)}</strong></span>
                                <span>⏰ <strong>${escapeHtml(timeText)}</strong></span>
                                ${ev.location ? `<span>📍 ${escapeHtml(ev.location)}</span>` : ''}
                            </div>
                            ${ev.description ? `<div style="font-size: 0.72rem; color: #a6adc8; margin-top: 2px;">${escapeHtml(ev.description)}</div>` : ''}
                        </div>
                    `;
                } else if (actionData.actionType === 'create_task' && actionData.taskData) {
                    const td = actionData.taskData;
                    actionPreviewHtml = `
                        <div class="action-preview-box" style="margin-top: 8px; background: rgba(0,0,0,0.35); border: 1px solid ${hexToRgba(agentColor, 0.4)}; border-left: 4px solid ${agentColor}; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px;">
                            <div style="font-size: 0.72rem; font-weight: 700; color: ${agentColor}; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                                <span>📝 Aufgabe / To-Do (Wird erst nach "Ja" angelegt)</span>
                            </div>
                            <div style="font-weight: 700; font-size: 0.9rem; color: #ffffff;">${escapeHtml(td.title)}</div>
                            ${td.dueDate ? `<div style="font-size: 0.76rem; color: #cdd6f4;">⏰ Fällig am: <strong>${escapeHtml(td.dueDate)}</strong></div>` : ''}
                            ${td.notes ? `<div style="font-size: 0.72rem; color: #a6adc8; margin-top: 2px;">${escapeHtml(td.notes)}</div>` : ''}
                        </div>
                    `;
                } else if (actionData.actionType === 'send_mail_reply' && actionData.replyData) {
                    const rd = actionData.replyData;
                    actionPreviewHtml = `
                        <div class="action-preview-box" style="margin-top: 8px; background: rgba(0,0,0,0.35); border: 1px solid ${hexToRgba(agentColor, 0.4)}; border-left: 4px solid ${agentColor}; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px;">
                            <div style="font-size: 0.72rem; font-weight: 700; color: ${agentColor}; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                                <span>✉️ E-Mail-Antwort (Wird erst nach "Ja" versendet)</span>
                            </div>
                            <div style="font-size: 0.76rem; color: #cdd6f4;"><strong>An:</strong> ${escapeHtml(rd.to)}</div>
                            <div style="font-size: 0.76rem; color: #cdd6f4;"><strong>Betreff:</strong> ${escapeHtml(rd.subject)}</div>
                            <div style="font-size: 0.74rem; color: #ffffff; white-space: pre-wrap; background: rgba(255,255,255,0.03); padding: 6px 8px; border-radius: 6px; margin-top: 4px; border: 1px solid rgba(255,255,255,0.05);">${escapeHtml(rd.body)}</div>
                        </div>
                    `;
                }
            }

            let buttonsHtml = '';
            if (Array.isArray(buttonsList) && buttonsList.length > 0) {
                buttonsList.forEach((btn, idx) => {
                    const escLabel = escapeHtml(btn.label || 'Auswählen');
                    const btnAction = btn.action || 'reply';
                    const rawReply = btn.replyText || btn.label || '';
                    const isSelected = notif.selectedButton === btn.label;
                    const isDisabled = notif.isDismissed;
                    const isPrimary = btn.style === 'primary' || btnAction === 'execute_action';
                    const btnClass = 'chat-notification-btn ' + (isSelected ? 'selected ' : (isPrimary ? 'primary' : 'secondary'));

                    const clickAttr = !isDisabled 
                        ? 'onclick="handleChatNotificationClick(this, ' + (notif.id || 'null') + ', \'' + escLabel + '\', \'' + btnAction + '\', decodeURIComponent(\'' + encodeURIComponent(rawReply) + '\'), \'' + targetConvId + '\')"'
                        : 'disabled';

                    const labelDisplay = isSelected ? ('🔘 ' + escLabel + ' (Ausgewählt)') : escLabel;

                    let customBtnStyle = '';
                    if (isPrimary && !isDisabled && !isSelected) {
                        customBtnStyle = `style="background: ${agentColor} !important; color: #11111b !important; font-weight: 700; border: none !important; box-shadow: 0 4px 14px ${hexToRgba(agentColor, 0.45)} !important;"`;
                    }

                    buttonsHtml += '<button type="button" class="' + btnClass + '" ' + customBtnStyle + ' ' + clickAttr + ' ' + (isDisabled ? 'disabled' : '') + '>' + labelDisplay + '</button>';
                });
            }

            let statusHtml = '';
            if (notif.isDismissed) {
                if (notif.selectedButton) {
                    statusHtml = '<span class="chat-notification-status" style="background: rgba(166, 227, 161, 0.15); color: #a6e3a1; border: 1px solid rgba(166, 227, 161, 0.3);">✅ Ausgeführt / Beantwortet: "' + escapeHtml(notif.selectedButton) + '"</span>';
                } else {
                    statusHtml = '<span class="chat-notification-status" style="background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.6);">✕ Geschlossen</span>';
                }
            } else if (notif.id) {
                statusHtml = '<button type="button" onclick="dismissNotification(event, ' + notif.id + ')" title="Benachrichtigung schließen" style="background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; padding: 2px 6px; font-size: 0.85rem; line-height: 1; border-radius: 4px; transition: color 0.2s;" onmouseover="this.style.color=\'#f38ba8\'" onmouseout="this.style.color=\'rgba(255,255,255,0.4)\'">✕</button>';
            }

            // Quick Links
            const mailLinkBtn = (notif.sourceType === 'mail' && notif.sourceId) 
                ? '<button type="button" onclick="event.stopPropagation(); openMailReadModal(' + notif.sourceId + ', \'dashboard\')" class="nav-btn" style="padding: 3px 8px; font-size: 0.72rem; background: rgba(137, 180, 250, 0.12); color: var(--accent); border: 1px solid rgba(137, 180, 250, 0.3); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Verknüpfte E-Mail öffnen">✉️ Zur E-Mail ➔</button>' 
                : '';

            const chatLinkBtn = (notif.conversationId || targetConvId) 
                ? '<button type="button" onclick="event.stopPropagation(); loadAgentRun(\'' + (notif.conversationId || targetConvId) + '\')" class="nav-btn" style="padding: 3px 8px; font-size: 0.72rem; background: rgba(203, 166, 247, 0.15); color: #cba6f7; border: 1px solid rgba(203, 166, 247, 0.35); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Agent Run Chatverlauf öffnen">💬 Agent-Chat ➔</button>' 
                : '';

            let linksHtml = '';
            if (mailLinkBtn || chatLinkBtn) {
                linksHtml = '<div class="chat-notification-links" style="display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.05);">' + chatLinkBtn + mailLinkBtn + '</div>';
            }

            const cardStyle = notif.isDismissed
                ? `border-left: 5px solid ${agentColor}88 !important;`
                : `border-left: 5px solid ${agentColor} !important; border-color: ${hexToRgba(agentColor, 0.45)} !important; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 0 18px ${hexToRgba(agentColor, 0.22)} !important;`;

            return `
                <div class="chat-notification-card type-${notifType}${dismissedClass}" style="${cardStyle}" ${notifId ? `data-notification-id="${notifId}"` : ''}>
                    <div class="chat-notification-header">
                        <div class="chat-notification-title-wrap">
                            <span class="chat-notification-badge" style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${hexToRgba(agentColor, 0.3)};">${typeBadgeText}</span>
                            ${agentBadgeHtml}
                            <span class="chat-notification-title">${escTitle}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                            ${timeStr ? `<span class="chat-notification-meta" style="font-size: 0.72rem; opacity: 0.65;">${timeStr}</span>` : ''}
                            <div class="chat-notification-status-container">${statusHtml}</div>
                        </div>
                    </div>
                    <div class="chat-notification-body">
                        ${messageBodyHtml}
                        ${actionPreviewHtml}
                    </div>
                    ${buttonsHtml ? `<div class="chat-notification-actions">${buttonsHtml}</div>` : ''}
                    ${linksHtml}
                </div>
            `;
        }


        window.getNotificationCardHtml = getNotificationCardHtml;



        function createNotificationCardElement(notif, convId) {
            const temp = document.createElement('div');
            temp.innerHTML = getNotificationCardHtml(notif, convId).trim();
            return temp.firstElementChild;
        }



        async function handleChatNotificationClick(btnEl, notifId, label, action, replyText, conversationId) {
            const cardEl = btnEl.closest('.chat-notification-card');
            if (cardEl) {
                cardEl.querySelectorAll('.chat-notification-btn').forEach(b => b.disabled = true);
            }
            const originalText = btnEl.innerHTML;
            btnEl.innerHTML = '⏳ Wird ausgeführt...';

            const targetConvId = conversationId || currentConversationId;

            try {
                let data = null;
                if (notifId) {
                    const res = await fetch(getApiUrl('/api/notifications/' + notifId + '/respond'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label, action, replyText })
                    });
                    data = await res.json();
                    if (!res.ok || data.error) {
                        throw new Error(data.error || 'Fehler beim Ausführen der Aktion');
                    }
                } else if (targetConvId) {
                    const res = await fetch(getApiUrl('/api/agent-runs/' + targetConvId + '/continue'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: replyText || label })
                    });
                    data = await res.json();
                    if (!res.ok || data.error) {
                        throw new Error(data.error || 'Fehler beim Ausführen der Aktion');
                    }
                }

                btnEl.classList.add('selected');
                btnEl.innerHTML = '🔘 ' + label + ' (Ausgewählt)';

                if (cardEl) {
                    cardEl.classList.add('dismissed');
                    const statusContainer = cardEl.querySelector('.chat-notification-status-container');
                    if (statusContainer) {
                        statusContainer.innerHTML = '<span class="chat-notification-status" style="background: rgba(166, 227, 161, 0.15); color: #a6e3a1; border: 1px solid rgba(166, 227, 161, 0.3);">✅ Ausgeführt: "' + escapeHtml(label) + '"</span>';
                    }
                }

                // If secure direct execution created an event or task, refresh those views immediately
                if (data?.executedAction) {
                    if (data.executedAction.type === 'event_created') {
                        if (typeof fetchCalendarEvents === 'function') fetchCalendarEvents();
                        if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
                    } else if (data.executedAction.type === 'task_created') {
                        if (typeof fetchTasks === 'function') fetchTasks();
                    }
                    if (typeof addMessage === 'function' && targetConvId && currentConversationId === targetConvId) {
                        addMessage(data.executedAction.message, false);
                    }
                }

                if (targetConvId && currentConversationId === targetConvId) {
                    const userMsgText = replyText || label;
                    addMessage(userMsgText, true);

                    const aiResp = data?.aiResponse || data;
                    if (aiResp && aiResp.text) {
                        addMessage(aiResp.text, false, null, [], null, aiResp.notification);
                    }
                }

                setTimeout(() => {
                    loadTopWidgets();
                    if (isElectron && ipcRenderer) {
                        ipcRenderer.send('widgets-updated');
                    }
                }, 400);
            } catch (err) {
                console.error("Fehler bei Benachrichtigungs-Aktion:", err);
                btnEl.innerHTML = originalText;
                if (cardEl) {
                    cardEl.querySelectorAll('.chat-notification-btn').forEach(b => b.disabled = false);
                }
                alert("Fehler bei der Ausführung: " + (err.message || err));
            }
        }


        window.handleChatNotificationClick = handleChatNotificationClick;



        let messageIdCounter = 1;



        function addMessage(text, isUser, widget = null, attachments = [], replyTo = null, notification = null) {
            const msg = document.createElement('div');
            const msgId = `msg-${Date.now()}-${messageIdCounter++}`;
            msg.id = msgId;
            msg.className = `message ${isUser ? 'user' : 'ai'}`;
            msg.setAttribute('data-msg-id', msgId);
            msg.setAttribute('data-msg-role', isUser ? 'user' : 'ai');
            msg.setAttribute('data-msg-text', text || '');

            // Swipe indicator for replying
            const swipeIndicator = document.createElement('div');
            swipeIndicator.className = 'message-swipe-reply-indicator';
            swipeIndicator.textContent = '↩️';
            msg.appendChild(swipeIndicator);

            // Render reply quote if replying to a message
            if (replyTo && replyTo.id) {
                const quoteCard = document.createElement('div');
                quoteCard.className = 'chat-reply-quote';
                quoteCard.setAttribute('data-target-msg-id', replyTo.id);
                quoteCard.innerHTML = `
                    <div class="reply-quote-author">↩️ Antwort auf ${escapeHtml(replyTo.author || 'Nachricht')}</div>
                    <div class="reply-quote-text">${escapeHtml(replyTo.text || '')}</div>
                `;
                quoteCard.onclick = (e) => {
                    e.stopPropagation();
                    scrollToMessage(replyTo.id);
                };
                msg.appendChild(quoteCard);
            }
            
            if (attachments && attachments.length > 0) {
                const attachmentsDiv = document.createElement('div');
                attachmentsDiv.style.display = 'flex';
                attachmentsDiv.style.flexWrap = 'wrap';
                attachmentsDiv.style.gap = '8px';
                attachmentsDiv.style.marginBottom = text ? '8px' : '0';
                
                attachments.forEach(file => {
                    if (file.isImage) {
                        const img = document.createElement('img');
                        img.src = `data:${file.mimeType};base64,${file.base64}`;
                        img.style.maxWidth = '100%';
                        img.style.maxHeight = '150px';
                        img.style.borderRadius = '6px';
                        img.style.objectFit = 'contain';
                        img.style.border = '1px solid rgba(255,255,255,0.1)';
                        attachmentsDiv.appendChild(img);
                    } else {
                        const fileChip = document.createElement('div');
                        fileChip.style.background = 'rgba(0,0,0,0.2)';
                        fileChip.style.padding = '6px 10px';
                        fileChip.style.borderRadius = '6px';
                        fileChip.style.fontSize = '0.75rem';
                        fileChip.style.border = '1px solid rgba(255,255,255,0.1)';
                        fileChip.textContent = '📎 ' + file.name;
                        attachmentsDiv.appendChild(fileChip);
                    }
                });
                msg.appendChild(attachmentsDiv);
            }
            
            if (text) {
                const textDiv = document.createElement('div');
                textDiv.innerHTML = renderMarkdown(text);
                msg.appendChild(textDiv);

                // Inline Notification Box für Fragen / Bestätigungen im Chat rendern
                if (!isUser) {
                    let notifObj = notification;
                    if (!notifObj && typeof currentConversationNotifications !== 'undefined' && currentConversationNotifications.length > 0) {
                        notifObj = currentConversationNotifications.find(n => {
                            if (n._rendered) return false;
                            if (n.title && text.includes(n.title)) return true;
                            if (n.message && text.includes(n.message.slice(0, 30))) return true;
                            return false;
                        });
                        if (notifObj) notifObj._rendered = true;
                    }
                    if (!notifObj) {
                        notifObj = parseNotificationFromText(text);
                        if (notifObj && typeof currentConversationNotifications !== 'undefined' && currentConversationNotifications.length > 0) {
                            const dbMatch = currentConversationNotifications.find(n => n.title === notifObj.title || (notifObj.conversationId && n.conversationId === notifObj.conversationId));
                            if (dbMatch) {
                                notifObj.id = dbMatch.id;
                                notifObj.isDismissed = dbMatch.isDismissed;
                                notifObj.selectedButton = dbMatch.selectedButton;
                                dbMatch._rendered = true;
                            }
                        }
                    }
                    if (notifObj) {
                        const notifCard = createNotificationCardElement(notifObj, currentConversationId);
                        msg.appendChild(notifCard);
                    }
                }

                const copyBtn = document.createElement('button');
                copyBtn.className = 'message-copy-btn';
                copyBtn.setAttribute('title', 'Nachricht kopieren');
                copyBtn.innerHTML = '📋';
                copyBtn.onclick = (e) => {
                    e.stopPropagation();
                    copyMessageText(copyBtn);
                };
                msg.appendChild(copyBtn);
            }

            chatBox.appendChild(msg);

            if (widget) {
                renderWidget(widget, chatBox);
            }

            chatBox.scrollTop = chatBox.scrollHeight;
        }



        function renderWidget(data, container) {
            const widgetDiv = document.createElement('div');
            widgetDiv.className = 'widget';

            if (data.type === 'calendar_widget') {
                widgetDiv.classList.add('calendar-widget');
                widgetDiv.style.background = 'transparent';
                widgetDiv.style.border = 'none';
                widgetDiv.style.padding = '0';
                widgetDiv.style.boxShadow = 'none';
                
                const dateStr = new Date(data.date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
                
                let html = `<div class="calendar-day-box" style="display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.015); border-top: 1px solid rgba(255, 255, 255, 0.08); border-bottom: 1px solid rgba(255, 255, 255, 0.08); border-left: none; border-right: none; border-radius: 0; box-shadow: none; width: 100%; margin-bottom: 12px;">`;
                html += `<div style="flex: 1; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;">`;
                html += `<div style="font-size: 0.85rem; font-weight: bold; color: var(--accent); border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">📅 Termine für ${dateStr}</div>`;
                
                if (data.events.length === 0) {
                    html += `<p style="font-size:0.8rem; opacity:0.6; margin: 5px 0;">Keine Termine für diesen Tag.</p>`;
                } else {
                    html += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
                    data.events.forEach(ev => {
                        if (ev.isTask) {
                            const escTitle = escapeHtml(ev.title).replace(/'/g, "\\'");
                            const escNotes = escapeHtml(ev.description || '').replace(/'/g, "\\'");
                            const escListTitle = escapeHtml(ev.listTitle || '').replace(/'/g, "\\'");
                            const recurrenceVal = ev.recurrence || 'none';
                            const isRecurring = ev.recurring || false;
                            const repeatBadge = isRecurring ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrend: ${ev.recurrence}">🔄</span>` : '';
                            
                            let personsHtml = "";
                            if (ev.persons && ev.persons.length > 0) {
                                ev.persons.forEach(p => {
                                    personsHtml += `
                                        <span onclick="openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='var(--accent)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='rgba(255,255,255,0.7)'">
                                          👤 ${escapeHtml(p.name)}
                                        </span>
                                    `;
                                });
                            }

                            const rawTaskId = ev.id.replace('task-', '');
                            const checkedAttr = ev.completed ? 'checked' : '';
                            const textStyle = ev.completed ? 'text-decoration: line-through; opacity: 0.5;' : '';

                            const taskContent = `
                                <div class="task-item" style="font-size: 0.8rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 8px; border-radius: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); width: 100%;">
                                    <div style="display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0;">
                                        <input type="checkbox" class="task-checkbox" data-task-id="${rawTaskId}" data-tasklist-id="${ev.listTitle || 'Standard'}" onchange="completeTask(this)" ${checkedAttr} style="margin-top: 3px;">
                                        <div style="line-height: 1.4; color: var(--text); overflow: hidden; text-overflow: ellipsis; word-break: break-word; flex: 1; ${textStyle}">
                                            <strong>[Aufgabe]</strong> ${escapeHtml(ev.title)}
                                            ${repeatBadge}
                                            ${personsHtml}
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                        <button onclick="editTask(${rawTaskId}, '${escTitle}', '${escNotes}', '${ev.time || ''}', '${escListTitle}', '${recurrenceVal}')" style="background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 0.75rem; padding: 2px 4px; display: inline-flex; align-items: center; justify-content: center;" title="Bearbeiten">✏️</button>
                                        <button onclick="deleteTask(${rawTaskId})" style="background: transparent; border: none; color: var(--off); cursor: pointer; font-size: 0.75rem; padding: 2px 4px; display: inline-flex; align-items: center; justify-content: center;" title="Löschen">✖</button>
                                    </div>
                                </div>
                            `;
                            html += renderSwipeLinkWrapper(taskContent, ev.title, 'task', rawTaskId);
                        } else {
                            const isRec = ev.recurring || ev.isRecurring;
                            const repeatBadge = isRec ? ` <span style="font-size: 0.7rem; color: var(--accent); opacity: 0.85;" title="Wiederkehrender Termin">🔄</span>` : '';
                            const rescheduleBadge = ev.originalStart ? ` <span style="background: rgba(249, 226, 175, 0.15); color: #f9e2af; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; text-transform: uppercase;" title="Dieser Termin wurde verschoben">verschoben</span>` : '';
                            const originalTimeText = ev.originalStart ? ` <span style="font-size: 0.7rem; opacity: 0.65; color: #f9e2af;">(ursprünglich: ${new Date(ev.originalStart).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})} ${new Date(ev.originalStart).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})})</span>` : '';
                            const targetDate = ev.occurrenceDate || ev.time.split('T')[0];
                            
                            const cancelStyle = ev.isCancelled ? 'color: var(--off); text-decoration: line-through;' : '';
                            const titleCancelStyle = ev.isCancelled ? 'color: var(--off); font-weight: 500;' : 'font-weight: 500;';
                            const reasonHtml = (ev.isCancelled && ev.cancellationReason) ? ` <span style="font-size: 0.75rem; color: var(--off); text-decoration: none; font-style: italic;">(${escapeHtml(ev.cancellationReason)})</span>` : (ev.isCancelled ? ' <span style="font-size: 0.75rem; color: var(--off); text-decoration: none; font-style: italic;">(Ausgefallen)</span>' : '');
                            const escTitle = escapeHtml(ev.title).replace(/'/g, "\\'");

                            const timeBadgeHtml = getEventTimeBadge(ev);

                            let personsHtml = "";
                            if (ev.persons && ev.persons.length > 0) {
                                ev.persons.forEach(p => {
                                    personsHtml += `
                                        <span onclick="openPersonProfileModal(${p.id})" style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.7rem; background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.7); padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='var(--accent)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='rgba(255,255,255,0.7)'">
                                          👤 ${escapeHtml(p.name)}
                                        </span>
                                    `;
                                });
                            }

                            let birthdayStyle = "border-bottom: 1px solid rgba(255,255,255,0.02); padding: 4px 0;";
                            if (ev.isBirthday) {
                                birthdayStyle = "background: rgba(245, 194, 231, 0.08); border: 1px solid rgba(245, 194, 231, 0.2); border-left: 3px solid #f5c2e7; padding: 6px 8px; border-radius: 6px; margin: 2px 0;";
                            }

                            const eventContent = `
                                <div style="font-size: 0.8rem; display: flex; justify-content: space-between; align-items: flex-start; width: 100%; ${birthdayStyle} ${cancelStyle}">
                                    <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                             <span style="${titleCancelStyle}">${escapeHtml(ev.title)}</span>
                                             ${repeatBadge}
                                             ${rescheduleBadge}
                                             ${originalTimeText}
                                             ${reasonHtml}
                                         </div>
                                         <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px;">
                                             ${timeBadgeHtml}
                                             ${personsHtml}
                                         </div>
                                         ${ev.description ? `<div style="font-size: 0.75rem; opacity: 0.6; margin-top: 4px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(ev.description)}</div>` : ''}
                                     </div>
                                     <div style="display: flex; align-items: center; gap: 4px; align-self: center; margin-left: 8px;">
                                         ${!ev.isBirthday ? `
                                             <button onclick="deleteCalendarEvent('${ev.id}', '${targetDate}', ${isRec})" style="background: transparent; border: none; color: var(--off); cursor: pointer; font-size: 0.85rem; padding: 2px 6px;" title="Termin löschen">✖</button>
                                         ` : ''}
                                     </div>
                                 </div>
                             `;
                             const linkType = ev.isBirthday && ev.persons && ev.persons.length > 0 ? 'person' : 'event';
                             const linkId = ev.isBirthday && ev.persons && ev.persons.length > 0 ? ev.persons[0].id : ev.id;
                             html += renderSwipeLinkWrapper(eventContent, ev.title, linkType, linkId);
                         }
                     });
                     html += `</div>`;
                 }
                 html += `</div></div>`;
                 widgetDiv.innerHTML = html;
             } else if (data.status === 'auth_required') {
                 widgetDiv.innerHTML = `
                     <p style="font-size:0.85rem; margin:0;">${data.message}</p>
                     <a href="${data.url}" target="_blank" class="auth-btn">Google Kalender verbinden</a>
                 `;
             } else if (data.type === 'image_widget') {
                 widgetDiv.classList.add('image-widget');
                 widgetDiv.innerHTML = `
                     <img src="${data.url}" class="generated-image" alt="${data.prompt}">
                     <div class="image-caption">"${data.prompt}"</div>
                 `;
             }

             container.appendChild(widgetDiv);
         }



         async function sendMessage() {
             const text = userInput.value.trim();
             
             // Collect linked items from the pills bar
             const pillsBar = document.getElementById('linked-pills-bar');
             const links = [];
             if (pillsBar) {
                 const pills = pillsBar.querySelectorAll('.link-pill');
                 pills.forEach(pill => {
                     const label = pill.getAttribute('data-label');
                     const url = pill.getAttribute('data-url');
                     links.push(`[${label}](${url})`);
                 });
             }

             if (!text && attachedFiles.length === 0 && links.length === 0) return;

             if (document.body.classList.contains('mobile-mode')) {
                 switchMobileView('chat');
             }

             // Save active reply before clearing
             const replyToSend = activeChatReply ? { ...activeChatReply } : null;
             cancelChatReply();

             // Construct userDisplayMessage to show in the chat bubble (including links so they render as badges)
             let userDisplayMessage = text;
             if (links.length > 0) {
                 userDisplayMessage += (userDisplayMessage ? '\n\n' : '') + 'Verlinkte Referenzen:\n' + links.join('\n');
             }

             const attachmentsToSend = [...attachedFiles];
             addMessage(userDisplayMessage, true, null, attachmentsToSend, replyToSend);
             userInput.value = '';
             autoResizeInput();

             // Construct exact text to send to the backend
             let textToSend = text;
             if (replyToSend) {
                 textToSend = `[Antwort auf Nachricht von ${replyToSend.author}: "${replyToSend.text}"]\n\n` + textToSend;
             }
             if (links.length > 0) {
                 textToSend += (textToSend ? '\n\n' : '') + 'Verlinkte Referenzen:\n' + links.join('\n');
             }

             // Clear the linked pills bar
             if (pillsBar) {
                 pillsBar.innerHTML = '';
                 updateLinkedPillsBarVisibility();
             }

             console.log("Sende Nachricht mit Anhängen:", attachmentsToSend.length);
             attachedFiles = [];
             renderAttachments();

             const thinkingDiv = document.createElement('div');
             thinkingDiv.className = 'message ai thinking';
             thinkingDiv.innerHTML = `
                 <div class="thinking-header">
                     Gemini denkt nach
                     <div class="thinking-dots"><span></span><span></span><span></span></div>
                 </div>
                 <div class="thinking-tools-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
             `;
             chatBox.appendChild(thinkingDiv);
             chatBox.scrollTop = chatBox.scrollHeight;

            const thinkingToolsList = thinkingDiv.querySelector('.thinking-tools-list');

            const toolFriendlyNames = {
                'suche_im_gedaechtnis': 'Semantische Suche im Gedächtnis',
                'hole_person_info': 'Profil & Fakten abrufen',
                'aktualisiere_person_biografie': 'Biografie aktualisieren',
                'fuege_person_fakt_hinzu': 'Fakt hinzufügen',
                'loesche_person_fakt': 'Fakt löschen',
                'erstelle_timer': 'Timer erstellen',
                'loesche_timer': 'Timer abbrechen',
                'quittiere_timer': 'Timer quittieren',
                'fuege_termin_hinzu': 'Termin eintragen'
            };

            let renderedToolsCount = 0;
            const pollInterval = setInterval(async () => {
                try {
                    const pollRes = await fetch(getApiUrl('/chat/active-tools'));
                    if (!pollRes.ok) return;
                    const activeTools = await pollRes.json();
                    
                    if (activeTools.length > renderedToolsCount) {
                        for (let i = renderedToolsCount; i < activeTools.length; i++) {
                            const t = activeTools[i];
                            const friendlyName = toolFriendlyNames[t.name] || t.name;
                            
                            const toolItem = document.createElement('div');
                            toolItem.className = 'live-tool-item';
                            toolItem.innerHTML = `⚙️ ${friendlyName}: <span class="live-tool-name">${t.name}</span>`;
                            thinkingToolsList.appendChild(toolItem);
                            chatBox.scrollTop = chatBox.scrollHeight;
                        }
                        renderedToolsCount = activeTools.length;
                    }
                } catch (pollErr) {
                    console.error("Fehler beim Polling der aktiven Tools:", pollErr);
                }
            }, 300);

            try {
                const res = await fetch(getApiUrl('/chat'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        message: textToSend,
                        attachments: attachmentsToSend,
                        conversationId: currentConversationId 
                    })
                });
                const data = await res.json();
                
                clearInterval(pollInterval);
                thinkingDiv.remove();

                currentConversationId = data.conversationId;
                addMessage(data.text, false, data.widget);
                loadTopWidgets();
                if (isElectron && ipcRenderer) {
                    ipcRenderer.send('widgets-updated');
                }
            } catch (e) {
                clearInterval(pollInterval);
                thinkingDiv.remove();
                addMessage("Fehler beim Senden der Nachricht.", false);
            }
        }



        let isTimelineLoadingPast = false;


        let isTimelineLoadingFuture = false;


        let timelineOldestLoadedDateStr = null;


        let timelineNewestLoadedDateStr = null;


        let timelineCanScrollPast = true;


        let timelineCanScrollFuture = true;



        function getEventTimeBadge(ev) {
            if (ev.isAllDay) {
                return `<span class="timeline-time-badge event-time-badge" style="background: rgba(149, 165, 166, 0.15); color: #bdc3c7; border-color: rgba(149, 165, 166, 0.3);">Ganztägig</span>`;
            }
            if (ev.fuzzyTime) {
                let fStyle = '';
                if (ev.fuzzyTime === "morgens") fStyle = "background: rgba(241, 196, 15, 0.15); color: #f1c40f; border-color: rgba(241, 196, 15, 0.3);";
                else if (ev.fuzzyTime === "vormittag") fStyle = "background: rgba(230, 126, 34, 0.15); color: #e67e22; border-color: rgba(230, 126, 34, 0.3);";
                else if (ev.fuzzyTime === "mittags") fStyle = "background: rgba(46, 204, 113, 0.15); color: #2ecc71; border-color: rgba(46, 204, 113, 0.3);";
                else if (ev.fuzzyTime === "nachmittag") fStyle = "background: rgba(52, 152, 219, 0.15); color: #3498db; border-color: rgba(52, 152, 219, 0.3);";
                else if (ev.fuzzyTime === "abends") fStyle = "background: rgba(155, 89, 182, 0.15); color: #9b59b6; border-color: rgba(155, 89, 182, 0.3);";
                return `<span class="timeline-time-badge event-time-badge" style="${fStyle}">${escapeHtml(ev.fuzzyTime)}</span>`;
            }
            const eventTime = ev.time || ev.start;
            if (!eventTime) return '';
            const start = new Date(eventTime);
            if (isNaN(start.getTime())) return '';
            const formatTime = (d) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            const startStr = formatTime(start);
            const eventEndTime = ev.endTime || ev.end;
            let endStr = '';
            if (eventEndTime) {
                const end = new Date(eventEndTime);
                if (!isNaN(end.getTime()) && end.getTime() > start.getTime()) {
                    if (start.toDateString() === end.toDateString()) {
                        endStr = formatTime(end);
                    } else {
                        endStr = `${end.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})} ${formatTime(end)}`;
                    }
                }
            }
            const text = endStr ? `${startStr} – ${endStr} Uhr` : `${startStr} Uhr`;
            return `<span class="timeline-time-badge event-time-badge">${text}</span>`;
        }



        function getElementTopRelativeToParent(element, parent) {
            let top = 0;
            let curr = element;
            while (curr && curr !== parent && curr !== document.body) {
                top += curr.offsetTop || 0;
                curr = curr.offsetParent;
            }
            return top;
        }



        if (plusBtn && fileInput) {
            plusBtn.onclick = (e) => {
                e.preventDefault();
                fileInput.click();
            };

            fileInput.onchange = async () => {
                const files = fileInput.files;
                if (files && files.length > 0) {
                    for (const file of files) {
                        await addAttachmentFromFile(file);
                    }
                }
                fileInput.value = ''; // Reset
            };
        }



        async function addAttachmentFromFile(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result.split(',')[1];
                    const mimeType = file.type || 'application/octet-stream';
                    const attachment = {
                        name: file.name,
                        base64: base64,
                        mimeType: mimeType,
                        isImage: mimeType.startsWith('image/')
                    };
                    attachedFiles.push(attachment);
                    renderAttachments();
                    resolve();
                };
                reader.onerror = (err) => {
                    console.error("FileReader error:", err);
                    resolve();
                };
                reader.readAsDataURL(file);
            });
        }



        // Mobile chat navigation proxies
        const mobNavNew = document.getElementById('mobile-nav-new');


        const mobNavHistory = document.getElementById('mobile-nav-history');


        if (mobNavNew) {
            mobNavNew.onclick = () => {
                const navNew = document.getElementById('nav-new');
                if (navNew) navNew.click();
            };
        }


        if (mobNavHistory) {
            mobNavHistory.onclick = () => {
                const navHistory = document.getElementById('nav-history');
                if (navHistory) navHistory.click();
            };
        }



        if (isElectron && ipcRenderer) {
            ipcRenderer.on('settings-updated', () => {
                console.log('Empfange settings-updated Event. Lade Widgets neu...');
                loadTopWidgets();
            });

            ipcRenderer.on('reload-widgets', () => {
                console.log('Empfange reload-widgets Event. Lade Widgets neu...');
                loadTopWidgets();
            });
        }



        // Routing basierend auf URL-Hash und Initialisierung von mobile-mode
        if (isPluginsView) {
            switchMobileView('dashboard');
        } else {
            switchMobileView('dashboard');
        }



        // Wenn wir nicht in Electron laufen, machen wir die Seite direkt aktiv/sichtbar
        if (!isElectron) {
            document.body.classList.add('active');
            document.body.classList.add('mobile-mode');
            // Auf Handys/Webbrowsern wollen wir auch keinen transparenten Hintergrund
            document.documentElement.style.setProperty('background', '#11111b', 'important');
            document.body.style.setProperty('background', '#11111b', 'important');
        }

// Chat Send Button & Input Listeners
if (sendBtn) {
    sendBtn.onclick = sendMessage;
}
if (userInput) {
    userInput.addEventListener('input', autoResizeInput);
}
