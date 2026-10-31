

        // =========================================================================
        // Mail Accounts Cache for Draft Cards
        // =========================================================================
        window.systemMailAccounts = window.systemMailAccounts || [];
        async function ensureSystemMailAccounts() {
            if (window.systemMailAccounts && window.systemMailAccounts.length > 0) return window.systemMailAccounts;
            try {
                const apiUrl = typeof getApiUrl === 'function' ? getApiUrl('/api/mail/accounts') : '/api/mail/accounts';
                const res = await fetch(apiUrl);
                if (res.ok) {
                    window.systemMailAccounts = await res.json();
                    document.querySelectorAll('.mail-draft-preview').forEach(card => {
                        const vonRow = card.querySelector('.mail-draft-von-row');
                        if (vonRow && (vonRow.getAttribute('data-empty') === 'true' || !vonRow.innerText.trim())) {
                            const accId = vonRow.getAttribute('data-account-id');
                            const acc = (accId ? window.systemMailAccounts.find(a => a.id === Number(accId)) : null) || window.systemMailAccounts[0];
                            if (acc) {
                                const fromDisplay = acc.name && acc.name !== acc.email ? `${acc.name} <${acc.email}>` : acc.email;
                                vonRow.innerHTML = `<strong style="color: #89b4fa;">Von:</strong> <span style="color: #ffffff;">${escapeHtml(fromDisplay)}</span>`;
                                vonRow.removeAttribute('data-empty');
                                vonRow.style.display = 'block';
                            }
                        }
                    });
                    return window.systemMailAccounts;
                }
            } catch (_) {}
            return [];
        }
        ensureSystemMailAccounts();

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
                travel: { icon: '🗺️', color: 'rgba(166, 227, 161, 0.15)', borderColor: '#a6e3a1' },
                media: { icon: '📁', color: 'rgba(249, 226, 175, 0.15)', borderColor: '#f9e2af' },
                file: { icon: '📁', color: 'rgba(249, 226, 175, 0.15)', borderColor: '#f9e2af' }
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



        function extractToolCallFromText(text) {
            const toolNames = ['schlage_mail_vor', 'schlage_mail_antwort_vor', 'schlage_termin_vor', 'schlage_aufgabe_vor', 'erstelle_benachrichtigung'];
            for (const tool of toolNames) {
                const marker = tool + '(';
                const idx = text.indexOf(marker);
                if (idx !== -1) {
                    let start = idx + marker.length;
                    let depth = 1;
                    let inQuote = false;
                    let quoteChar = '';
                    let end = start;
                    while (end < text.length && depth > 0) {
                        const c = text[end];
                        if (inQuote) {
                            if (c === '\\') {
                                end += 2;
                                continue;
                            } else if (c === quoteChar) {
                                inQuote = false;
                            }
                        } else {
                            if (c === '"' || c === "'") {
                                inQuote = true;
                                quoteChar = c;
                            } else if (c === '(') {
                                depth++;
                            } else if (c === ')') {
                                depth--;
                            }
                        }
                        end++;
                    }
                    return {
                        toolName: tool,
                        argsStr: text.substring(start, depth === 0 ? end - 1 : end)
                    };
                }
            }
            return null;
        }

        function parseNotificationFromText(text) {
            if (!text) return null;
            const extracted = extractToolCallFromText(text);
            if (!extracted) return null;

            const { toolName, argsStr } = extracted;

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

            const getArrayParam = (key) => {
                const m = argsStr.match(new RegExp(key + ':\\s*(\\[[^\\]]*\\])'));
                if (m) {
                    try {
                        return JSON.parse(m[1]);
                    } catch (e) {
                        try { return eval('(' + m[1] + ')'); } catch (_) {}
                    }
                }
                return [];
            };

            const title = getParam('betreff') || getParam('titel') || getParam('title') || (toolName.includes('mail') ? 'E-Mail-Entwurf' : 'Benachrichtigung');
            const mailBody = getParam('inhalt') || getParam('antwortText') || '';
            const to = getParam('empfaenger') || getParam('to') || '';
            const begruendung = getParam('begruendung') || '';
            const type = getParam('typ') || getParam('type') || (toolName.includes('mail') ? 'action_required' : 'question');
            const conversationId = getParam('conversationId') || currentConversationId || null;
            const attachments = getArrayParam('anhaenge') || getArrayParam('attachments') || [];
            const kontoId = getParam('kontoId') || (argsStr.match(/kontoId:\s*([0-9]+)/) ? Number(argsStr.match(/kontoId:\s*([0-9]+)/)[1]) : null);
            const fromArg = getParam('absender') || getParam('from') || '';

            let message = '';
            if (toolName.includes('mail')) {
                message = begruendung
                    ? `**Inhalt / Kontext:**\n${begruendung}\n\nIch habe folgenden E-Mail-Entwurf vorbereitet. Soll ich diesen Entwurf abschicken oder möchtest du ihn im Editor anpassen?`
                    : (to ? `Ich habe folgenden E-Mail-Entwurf für **${to}** vorbereitet. Soll ich diese E-Mail so abschicken oder möchtest du sie im Editor anpassen?` : 'Ich habe folgenden E-Mail-Entwurf vorbereitet. Soll ich diese E-Mail so abschicken oder möchtest du sie im Editor anpassen?');
            } else {
                message = getParam('nachricht') || getParam('message') || begruendung || '';
            }

            // Falls 'message' im Tool-Aufruf gekürzt oder nicht enthalten war, den Haupttext vor der Aktionszusammenfassung nutzen:
            if (!message && text) {
                const clean = text.replace(/>\s*⚙️\s*\*\*Ausgeführte Aktionen[\s\S]*$/i, '').trim();
                if (clean) {
                    message = clean;
                }
            }

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
                if (toolName.includes('mail') || title.toLowerCase().includes('mail') || title.toLowerCase().includes('entwurf')) {
                    buttons = [
                        { label: 'Ja, abschicken', action: 'reply', replyText: 'Ja, bitte abschicken', style: 'primary' },
                        { label: 'Bearbeiten', action: 'open_composer', style: 'secondary' },
                        { label: 'Nein, abbrechen', action: 'dismiss', replyText: 'Nein, abbrechen', style: 'secondary' }
                    ];
                } else if (type === 'question') {
                    buttons = [
                        { label: 'Ja, abschicken', action: 'reply', replyText: 'Ja, bitte abschicken', style: 'primary' },
                        { label: 'Nein, abbrechen', action: 'dismiss', replyText: 'Nein, abbrechen', style: 'secondary' }
                    ];
                }
            }

            let actionData = null;
            if (toolName === 'schlage_mail_vor' || toolName === 'schlage_mail_antwort_vor' || (title && title.toLowerCase().includes('mail'))) {
                let senderAccount = null;
                if (window.systemMailAccounts && window.systemMailAccounts.length > 0) {
                    if (kontoId) {
                        senderAccount = window.systemMailAccounts.find(a => a.id === Number(kontoId));
                    }
                    if (!senderAccount) {
                        senderAccount = window.systemMailAccounts[0];
                    }
                }
                const fromDisplay = fromArg || (senderAccount ? (senderAccount.name && senderAccount.name !== senderAccount.email ? `${senderAccount.name} <${senderAccount.email}>` : senderAccount.email) : '');

                actionData = {
                    actionType: 'send_mail',
                    mailData: {
                        to: to,
                        subject: title,
                        body: mailBody || message,
                        attachments: attachments,
                        accountId: kontoId || senderAccount?.id || null,
                        from: fromDisplay || null,
                        fromEmail: senderAccount?.email || null,
                        accountName: senderAccount?.name || null
                    }
                };
            }

            return {
                id: null,
                title,
                message,
                reasoning: begruendung || null,
                type,
                buttons,
                actionData,
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



        const CANONICAL_AGENTS = {
            mail: {
                id: 'mail',
                name: 'E-Mail Agent',
                avatar: '✉️',
                color: '#fab387',
                trigger: 'mail'
            },
            discord: {
                id: 'discord',
                name: 'Discord Bot Agent',
                avatar: '🌐',
                color: '#89b4fa',
                trigger: 'discord'
            },
            default: {
                id: 'default',
                name: 'Haupt-Assistent (Web / App)',
                avatar: '🤖',
                color: '#cba6f7',
                trigger: 'manual'
            }
        };
        window.CANONICAL_AGENTS = CANONICAL_AGENTS;

        function getNotifAgentInfo(notif) {
            const getConf = (key) => {
                const base = CANONICAL_AGENTS[key] || CANONICAL_AGENTS.default;
                if (typeof currentAgentSettings === 'object' && currentAgentSettings && currentAgentSettings[key]) {
                    const c = currentAgentSettings[key];
                    return {
                        id: key,
                        name: c.name || base.name,
                        avatar: (c.avatar || base.avatar).replace(/^\?\?$/, '🤖'),
                        color: c.color || base.color
                    };
                }
                return { ...base };
            };

            if (!notif) return getConf('default');

            const rawName = (notif.agentName || '').trim().toLowerCase();
            const sourceType = (notif.sourceType || '').trim().toLowerCase();
            const title = (notif.title || '').toLowerCase();

            // 1. Discord Bot Agent
            if (sourceType === 'discord' || rawName.includes('discord') || title.includes('discord') || title.includes('ankündigung')) {
                return getConf('discord');
            }

            // 2. Haupt-Assistent (Web / App) Priority
            if (sourceType === 'system' || rawName.includes('haupt') || rawName.includes('main') || rawName.includes('assistent') || notif.agentAvatar === '🤖') {
                return getConf('default');
            }

            // 3. E-Mail Agent (strictly incoming emails, mail responses, or mail triage)
            let actionData = notif.actionData;
            if (typeof actionData === 'string') {
                try { actionData = JSON.parse(actionData); } catch (e) {}
            }
            const isMailReplyAction = Boolean(actionData && (actionData.actionType === 'send_mail_reply' || actionData.actionType === 'mail_reply'));
            const isExplicitMailAgent = rawName === 'e-mail agent' || rawName === 'e-mail-agent' || rawName === 'mail agent' || rawName === 'mail';
            const isIncomingMailTriage = sourceType === 'mail' && !title.includes('bewerbung');

            if (isIncomingMailTriage || isMailReplyAction || isExplicitMailAgent) {
                return getConf('mail');
            }

            // 3. Haupt-Assistent (Web / App)
            // Route planning, calendar, chat tasks, applications (Bewerbungen), user questions, system tasks
            return getConf('default');
        }
        window.getNotifAgentInfo = getNotifAgentInfo;

        function getNotifOriginInfo(notif, resolvedAgentId) {
            if (!notif) return { label: 'Haupt-Assistent', badge: '🤖 System' };

            const sourceType = (notif.sourceType || '').trim().toLowerCase();
            const title = (notif.title || '').toLowerCase();

            let actionData = notif.actionData;
            if (typeof actionData === 'string') {
                try { actionData = JSON.parse(actionData); } catch (e) {}
            }
            const actionType = actionData?.actionType || '';

            if (resolvedAgentId === 'discord' || sourceType === 'discord') {
                return { label: 'Discord Server', badge: '🌐 Discord Bot' };
            }

            if (resolvedAgentId === 'mail' || sourceType === 'mail') {
                if (actionType === 'send_mail_reply' || title.includes('antwort')) {
                    return { label: 'E-Mail Antwort', badge: '✉️ Postfach' };
                }
                return { label: 'E-Mail Eingang', badge: '✉️ Postfach' };
            }

            if (sourceType === 'route_planner' || sourceType === 'route_planner_location' || title.includes('route') || title.includes('standort')) {
                return { label: 'Routen- & Wegezeit', badge: '🗺️ Routenplaner' };
            }

            if (sourceType === 'calendar' || actionType === 'create_event' || title.includes('termin')) {
                return { label: 'Kalender / Termine', badge: '📅 Kalender' };
            }

            if (sourceType === 'task' || actionType === 'create_task' || title.includes('aufgabe')) {
                return { label: 'Aufgaben / To-Dos', badge: '📋 Aufgabe' };
            }

            if (actionType === 'send_mail' || title.includes('bewerbung') || title.includes('entwurf')) {
                return { label: 'Chat / Entwurf', badge: '✍️ Entwurf' };
            }

            if (sourceType === 'chat' || notif.conversationId) {
                return { label: 'Chat / Manuell', badge: '💬 Chat' };
            }

            return { label: 'Haupt-Assistent', badge: '🤖 Assistent' };
        }
        window.getNotifOriginInfo = getNotifOriginInfo;

        function getNotificationCardHtml(notif, convId, isBriefing = false) {
            const notifType = notif.type || 'info';
            const dismissedClass = notif.isDismissed ? ' dismissed' : '';
            const notifId = notif.id ? String(notif.id) : '';
            const targetConvId = convId || notif.conversationId || '';

            // Agent Color & Avatar Resolution (strictly canonical 3 agents)
            const agentInfo = getNotifAgentInfo(notif);
            const agentColor = agentInfo.color;
            const agentAvatar = agentInfo.avatar;

            // Profilbild / Avatar oben links
            const isImgAvatar = typeof agentAvatar === 'string' && (agentAvatar.startsWith('/') || agentAvatar.startsWith('http') || agentAvatar.startsWith('data:') || /\.(png|jpe?g|webp|svg)$/i.test(agentAvatar));
            const avatarElHtml = isImgAvatar
                ? `<img src="${agentAvatar}" alt="${escapeHtml(agentInfo.name)}" class="chat-notification-avatar" style="width: 24px; height: 24px; min-width: 24px; border-radius: 50%; object-fit: cover; display: block; border: 1.5px solid ${hexToRgba(agentColor, 0.5)}; flex-shrink: 0;" title="${escapeHtml(agentInfo.name)}">`
                : `<span class="chat-notification-avatar" style="width: 24px; height: 24px; min-width: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${hexToRgba(agentColor, 0.18)}; border: 1.5px solid ${hexToRgba(agentColor, 0.5)}; font-size: 0.82rem; line-height: 1; flex-shrink: 0;" title="${escapeHtml(agentInfo.name)}">${agentAvatar}</span>`;

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

            // Quick Links - Kreis-Buttons mit Icon (Mail & Agent-Chat)
            const mailId = notif.sourceId || (actionData && (actionData.mailId || actionData.emailId || (actionData.replyData && actionData.replyData.mailId)));
            const mailLinkBtn = mailId
                ? `<button type="button" onclick="event.stopPropagation(); openMailReadModal(${JSON.stringify(mailId)}, 'dashboard')" class="briefing-circle-btn mail-circle-btn" title="Verknüpfte E-Mail öffnen">${googleIcon('mail', '14px', 'fill: #89b4fa;')}</button>`
                : '';

            const conversationRunId = notif.conversationId || targetConvId || (actionData && actionData.conversationId);
            const chatLinkBtn = conversationRunId
                ? `<button type="button" onclick="event.stopPropagation(); loadAgentRun('${conversationRunId}')" class="briefing-circle-btn chat-circle-btn" title="Agent-Chatverlauf öffnen">${googleIcon('chat', '14px', 'fill: #cba6f7;')}</button>`
                : (mailId ? `<button type="button" onclick="event.stopPropagation(); openAgentChatForMail(event, ${JSON.stringify(mailId)})" class="briefing-circle-btn chat-circle-btn" title="Agent-Chatverlauf öffnen">${googleIcon('chat', '14px', 'fill: #cba6f7;')}</button>` : '');

            // Erkennung für Aktionen (Mail, Kalender, Aufgabe)
            const isEventAction = Boolean(actionData && actionData.actionType === 'create_event');
            const isTaskAction = Boolean(actionData && actionData.actionType === 'create_task');
            const isMailAction = Boolean(actionData && (actionData.actionType === 'send_mail' || actionData.actionType === 'send_mail_reply'));

            const isMailSendProposal = Boolean(
                !isEventAction && !isTaskAction && (
                    isMailAction
                    || (actionData && (actionData.mailData || actionData.replyData))
                    || ((notif.title && (notif.title.toLowerCase().includes('mail') || notif.title.toLowerCase().includes('entwurf')))
                        && Array.isArray(buttonsList) && buttonsList.some(b => b.action === 'execute_action' || (b.label && (b.label.toLowerCase().includes('abschicken') || b.label.toLowerCase().includes('senden')))))
                )
            );

            // Erkennung für Kalendereintrags-Vorschlag
            const isEventProposal = Boolean(
                isEventAction
                || (actionData && actionData.eventData)
                || (notif.title && (notif.title.toLowerCase().includes('terminvorschlag') || notif.title.toLowerCase().includes('termin')) && Array.isArray(buttonsList) && buttonsList.some(b => b.action === 'execute_action'))
            );

            const isProposalCard = isMailSendProposal || isEventProposal;

            let messageBodyHtml = '';
            const rawMsg = (notif.message || '').trim();

            if (isProposalCard) {
                // Bei Vorschlägen (Mail, Kalender) soll KEIN doppelter Einleitungstext oder Frage oben stehen
                messageBodyHtml = '';
            } else if (actionData && actionData.actionType) {
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

            // Subtle Edit-Icon Button für Aktionen
            const editMailBtn = (isMailSendProposal && !notif.isDismissed)
                ? `<button type="button" onclick="event.stopPropagation(); openComposeFromNotification('${notifId}', this.closest('.chat-notification-card'))" class="briefing-circle-btn edit-circle-btn" title="E-Mail im Editor bearbeiten">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                </button>`
                : '';

            const editEventBtn = (isEventProposal && !notif.isDismissed)
                ? `<button type="button" onclick="event.stopPropagation(); openEventEditFromNotification('${notifId}', this.closest('.chat-notification-card'))" class="briefing-circle-btn edit-circle-btn" title="Termin im Kalender bearbeiten">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                </button>`
                : '';

            // Subtle Dismiss/Cancel Button innerhalb des Vorschlags
            const dismissProposalBtn = (!notif.isDismissed && notif.id)
                ? `<button type="button" onclick="dismissNotification(event, ${notif.id})" class="briefing-circle-btn dismiss-circle-btn" title="Vorschlag abbrechen / verwerfen">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>`
                : '';

            // Senden-Icon Button für Mail-Vorschlag
            let mailSendBtnHtml = '';
            if (isMailSendProposal && !notif.isDismissed && Array.isArray(buttonsList) && buttonsList.length > 0) {
                const sendBtn = buttonsList.find(b => b.action === 'execute_action' || (b.label && (b.label.toLowerCase().includes('abschicken') || b.label.toLowerCase().includes('senden')))) || buttonsList[0];
                if (sendBtn) {
                    const escSendLabel = escapeHtml(sendBtn.label || 'Abschicken');
                    const btnAction = sendBtn.action || 'execute_action';
                    const rawReply = sendBtn.replyText || sendBtn.label || '';
                    const clickAttr = `onclick="handleChatNotificationClick(this, ${notif.id || 'null'}, '${escSendLabel}', '${btnAction}', decodeURIComponent('${encodeURIComponent(rawReply)}'), '${targetConvId}')"`;
                    mailSendBtnHtml = `
                        <button type="button" class="chat-notification-btn chat-notification-send-icon-btn" ${clickAttr} title="${escSendLabel}" style="width: 36px; height: 36px; min-width: 36px; min-height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${agentColor} !important; color: #11111b !important; border: none !important; cursor: pointer; box-shadow: 0 4px 14px ${hexToRgba(agentColor, 0.45)}; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="margin-left: -1px; margin-top: 1px;">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor"></polygon>
                            </svg>
                        </button>
                    `;
                }
            }

            // Anlegen-Icon Button für Kalender-Vorschlag
            let eventConfirmBtnHtml = '';
            if (isEventProposal && !notif.isDismissed && Array.isArray(buttonsList) && buttonsList.length > 0) {
                const confirmBtn = buttonsList.find(b => b.action === 'execute_action' || (b.label && (b.label.toLowerCase().includes('anlegen') || b.label.toLowerCase().includes('bestätigen') || b.label.toLowerCase().includes('eintragen')))) || buttonsList[0];
                if (confirmBtn) {
                    const escConfirmLabel = escapeHtml(confirmBtn.label || 'Termin anlegen');
                    const btnAction = confirmBtn.action || 'execute_action';
                    const rawReply = confirmBtn.replyText || confirmBtn.label || '';
                    const clickAttr = `onclick="handleChatNotificationClick(this, ${notif.id || 'null'}, '${escConfirmLabel}', '${btnAction}', decodeURIComponent('${encodeURIComponent(rawReply)}'), '${targetConvId}')"`;
                    eventConfirmBtnHtml = `
                        <button type="button" class="chat-notification-btn chat-notification-send-icon-btn" ${clickAttr} title="${escConfirmLabel}" style="width: 36px; height: 36px; min-width: 36px; min-height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: ${agentColor} !important; color: #11111b !important; border: none !important; cursor: pointer; box-shadow: 0 4px 14px ${hexToRgba(agentColor, 0.45)}; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                                <path d="M9 16l2 2 4-4"></path>
                            </svg>
                        </button>
                    `;
                }
            }

            // Status-Badge / Close-Button
            let statusHtml = '';
            if (notif.isDismissed) {
                if (notif.selectedButton) {
                    statusHtml = '<span class="chat-notification-status" style="background: rgba(166, 227, 161, 0.15); color: #a6e3a1; border: 1px solid rgba(166, 227, 161, 0.3);">✅ Ausgeführt: "' + escapeHtml(notif.selectedButton) + '"</span>';
                } else {
                    statusHtml = '<span class="chat-notification-status" style="background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.6);">✕ Geschlossen</span>';
                }
            } else if (!isProposalCard && notif.id) {
                statusHtml = '<button type="button" onclick="dismissNotification(event, ' + notif.id + ')" title="Benachrichtigung schließen / verwerfen" style="background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; padding: 2px 6px; font-size: 0.85rem; line-height: 1; border-radius: 4px; transition: color 0.2s;" onmouseover="this.style.color=\'#f38ba8\'" onmouseout="this.style.color=\'rgba(255,255,255,0.4)\'">✕</button>';
            }

            // Anhänge erkennen und Vorschau-Chips rendern
            const attachmentsList = (actionData && (actionData.mailData?.attachments || actionData.replyData?.attachments || actionData.attachments)) || [];
            if (attachmentsList.length === 0 && rawMsg) {
                const matches = rawMsg.match(/[a-zA-Z0-9_\-\u00C0-\u017F]+\.(?:txt|pdf|docx?|xlsx?|png|jpe?g|svg)/gi);
                if (matches) {
                    matches.forEach(f => {
                        if (!attachmentsList.includes(f)) attachmentsList.push(f);
                    });
                }
            }
            let attChipsHtml = '';
            if (attachmentsList && attachmentsList.length > 0) {
                const chips = attachmentsList.map(a => {
                    const name = typeof a === 'string' ? a : (a.filename || a.name || 'Anhang');
                    return `<span style="background: rgba(137, 180, 250, 0.16); color: #89b4fa; border: 1px solid rgba(137, 180, 250, 0.35); border-radius: 6px; padding: 2px 8px; font-size: 0.73rem; display: inline-flex; align-items: center; gap: 5px; font-weight: 600;"><span style="font-size: 0.85rem;">📎</span><span>${escapeHtml(name)}</span></span>`;
                }).join(' ');
                attChipsHtml = `
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-size: 0.74rem; color: #a6adc8; font-weight: 700;">Anhang:</span>
                        ${chips}
                    </div>
                `;
            }

            if (actionData && actionData.actionType) {
                if (actionData.actionType === 'create_event' && actionData.eventData) {
                    const ev = actionData.eventData;
                    const timeText = ev.isAllDay ? 'Ganztägig' : (ev.startTime ? (ev.endTime ? `${ev.startTime} – ${ev.endTime} Uhr` : `ab ${ev.startTime} Uhr`) : 'Uhrzeit offen');
                    const eventTopActions = `
                        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 8px;">
                            ${chatLinkBtn}
                            ${mailLinkBtn}
                            ${editEventBtn}
                            ${dismissProposalBtn}
                            <div class="chat-notification-status-container">${notif.isDismissed ? statusHtml : ''}</div>
                        </div>
                    `;
                    actionPreviewHtml = `
                        <div class="action-preview-box" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 8px; width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                    <div style="flex-shrink: 0;" title="${escapeHtml(agentInfo.name)}">
                                        ${avatarElHtml}
                                    </div>
                                    <div style="font-size: 0.74rem; font-weight: 700; color: ${agentColor}; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                                        <span>📅 Kalendereintrag (Vorschlag)</span>
                                    </div>
                                </div>
                                ${eventTopActions}
                            </div>
                            <div style="font-weight: 700; font-size: 0.95rem; color: #ffffff; text-align: left; margin-top: 2px;">${escapeHtml(ev.title)}</div>
                            <div style="font-size: 0.78rem; color: #cdd6f4; display: flex; gap: 12px; flex-wrap: wrap; text-align: left; justify-content: flex-start;">
                                <span>📆 <strong>${escapeHtml(ev.date)}</strong></span>
                                <span>⏰ <strong>${escapeHtml(timeText)}</strong></span>
                                ${ev.location ? `<span>📍 ${escapeHtml(ev.location)}</span>` : ''}
                            </div>
                            ${ev.description ? `<div style="font-size: 0.74rem; color: #a6adc8; margin-top: 2px; text-align: left; line-height: 1.45;">${escapeHtml(ev.description)}</div>` : ''}
                            ${eventConfirmBtnHtml ? `
                                <div style="display: flex; justify-content: flex-end; width: 100%; margin-top: 4px;">
                                    ${eventConfirmBtnHtml}
                                </div>
                            ` : ''}
                        </div>
                    `;
                } else if (actionData.actionType === 'create_task' && actionData.taskData) {
                    const td = actionData.taskData;
                    const taskTopActions = `
                        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 8px;">
                            ${chatLinkBtn}
                            ${mailLinkBtn}
                            ${dismissProposalBtn}
                            <div class="chat-notification-status-container">${notif.isDismissed ? statusHtml : ''}</div>
                        </div>
                    `;
                    actionPreviewHtml = `
                        <div class="action-preview-box" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 8px; width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                    <div style="flex-shrink: 0;" title="${escapeHtml(agentInfo.name)}">
                                        ${avatarElHtml}
                                    </div>
                                    <div style="font-size: 0.74rem; font-weight: 700; color: ${agentColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                                        <span>📝 Aufgabe / To-Do</span>
                                    </div>
                                </div>
                                ${taskTopActions}
                            </div>
                            <div style="font-weight: 700; font-size: 0.95rem; color: #ffffff;">${escapeHtml(td.title)}</div>
                            ${td.dueDate ? `<div style="font-size: 0.76rem; color: #cdd6f4;">⏰ Fällig am: <strong>${escapeHtml(td.dueDate)}</strong></div>` : ''}
                            ${td.notes ? `<div style="font-size: 0.72rem; color: #a6adc8; margin-top: 2px;">${escapeHtml(td.notes)}</div>` : ''}
                        </div>
                    `;
                } else if ((actionData.actionType === 'send_mail_reply' || actionData.actionType === 'send_mail' || isMailSendProposal) && (actionData.replyData || actionData.mailData)) {
                    const rd = actionData.mailData || actionData.replyData;
                    let fromDisplay = rd.from || '';
                    if (!fromDisplay && (rd.accountName || rd.fromEmail)) {
                        fromDisplay = rd.accountName && rd.fromEmail && rd.accountName !== rd.fromEmail
                            ? `${rd.accountName} <${rd.fromEmail}>`
                            : (rd.fromEmail || rd.accountName);
                    }
                    if (!fromDisplay && window.systemMailAccounts && window.systemMailAccounts.length > 0) {
                        const acc = (rd.accountId ? window.systemMailAccounts.find(a => a.id === Number(rd.accountId)) : null) || window.systemMailAccounts[0];
                        if (acc) {
                            fromDisplay = acc.name && acc.name !== acc.email ? `${acc.name} <${acc.email}>` : acc.email;
                        }
                    }

                    const mailTopActions = `
                        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 8px;">
                            ${chatLinkBtn}
                            ${mailLinkBtn}
                            ${editMailBtn}
                            ${dismissProposalBtn}
                            <div class="chat-notification-status-container">${notif.isDismissed ? statusHtml : ''}</div>
                        </div>
                    `;

                    const hasBottomBar = Boolean(attChipsHtml || mailSendBtnHtml);
                    const mailBottomRow = hasBottomBar
                        ? `<div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; width: 100%; padding-top: 2px;">
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; flex: 1;">
                                ${attChipsHtml || ''}
                            </div>
                            ${mailSendBtnHtml ? `<div style="flex-shrink: 0; margin-left: auto;">${mailSendBtnHtml}</div>` : ''}
                           </div>`
                        : '';

                    actionPreviewHtml = `
                        <div class="mail-draft-preview" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 8px; margin-top: 2px; width: 100%;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; width: 100%; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding: 2px 0 8px 0;">
                                <div style="display: flex; align-items: flex-start; gap: 10px; min-width: 0; flex: 1;">
                                    <div style="padding-top: 1px; flex-shrink: 0;" title="${escapeHtml(agentInfo.name)}">
                                        ${avatarElHtml}
                                    </div>
                                    <div style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 4px; font-size: 0.82rem; min-width: 0; flex: 1;">
                                        ${fromDisplay
                                            ? `<div class="mail-draft-von-row" data-account-id="${rd.accountId || ''}" style="color: #cdd6f4;"><strong style="color: #89b4fa;">Von:</strong> <span style="color: #ffffff;">${escapeHtml(fromDisplay)}</span></div>`
                                            : `<div class="mail-draft-von-row" data-account-id="${rd.accountId || ''}" data-empty="true" style="display: none; color: #cdd6f4;"></div>`
                                        }
                                        ${rd.to ? `<div><strong style="color: #89b4fa;">An:</strong> <span style="color: #ffffff;">${escapeHtml(rd.to)}</span></div>` : ''}
                                        ${rd.subject ? `<div><strong style="color: #89b4fa;">Betreff:</strong> <span style="color: #ffffff; font-weight: 600;">${escapeHtml(rd.subject)}</span></div>` : ''}
                                    </div>
                                </div>
                                ${mailTopActions}
                            </div>
                            ${rd.body ? `<div style="font-size: 0.84rem; line-height: 1.6; color: #ffffff; white-space: pre-wrap; word-break: break-word; overflow-wrap: break-word; padding: 6px 0 10px 0; ${hasBottomBar ? 'border-bottom: 1px solid rgba(255, 255, 255, 0.08);' : ''} width: 100%;">${escapeHtml(rd.body)}</div>` : ''}
                            ${mailBottomRow}
                        </div>
                    `;
                }
            }

            if (attChipsHtml && !actionPreviewHtml.includes('📎')) {
                if (actionPreviewHtml) {
                    actionPreviewHtml += `<div style="margin-top: 8px;">${attChipsHtml}</div>`;
                } else {
                    messageBodyHtml += `<div style="margin-top: 8px;">${attChipsHtml}</div>`;
                }
            }

            let buttonsHtml = '';
            if (isProposalCard) {
                // Bei Vorschlägen (Mail, Kalender) befinden sich alle Aktionen direkt im Kasten!
                buttonsHtml = '';
            } else if (Array.isArray(buttonsList) && buttonsList.length > 0) {
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

            const briefingCardStyle = `
                border-left: none !important;
                border-right: none !important;
                border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                background: transparent !important;
                padding: 16px 4px !important;
                margin: 0 !important;
                text-align: left !important;
            `;

            const defaultCardStyle = notif.isDismissed
                ? `border-left: 5px solid ${agentColor}88 !important; text-align: left !important;`
                : `border-left: 5px solid ${agentColor} !important; border-color: ${hexToRgba(agentColor, 0.45)} !important; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 0 18px ${hexToRgba(agentColor, 0.22)} !important; text-align: left !important;`;

            const cardStyle = isBriefing ? briefingCardStyle : defaultCardStyle;
            const cardClass = `chat-notification-card type-${notifType}${dismissedClass} ${isBriefing ? 'is-briefing-view' : ''}`;

            // Dynamischer, sauberer Titel ohne "Entwurf" oder "Terminvorschlag"
            let cardDisplayTitle = escTitle;
            if (isMailAction) {
                const md = actionData?.mailData || actionData?.replyData;
                if (md?.subject) {
                    cardDisplayTitle = '✉️ ' + escapeHtml(md.subject);
                } else if (md?.to) {
                    cardDisplayTitle = '✉️ E-Mail an ' + escapeHtml(md.to);
                } else {
                    cardDisplayTitle = actionData?.actionType === 'send_mail_reply' ? '✉️ Antwort' : '✉️ E-Mail';
                }
            } else if (isEventAction && actionData?.eventData?.title) {
                cardDisplayTitle = '📅 ' + escapeHtml(actionData.eventData.title);
            } else if (isTaskAction && actionData?.taskData?.title) {
                cardDisplayTitle = '📋 ' + escapeHtml(actionData.taskData.title);
            } else {
                cardDisplayTitle = cardDisplayTitle
                    .replace(/\s*-\s*entwurf/gi, '')
                    .replace(/^✉️\s*E-Mail-Entwurf/gi, '✉️ E-Mail')
                    .replace(/\s*entwurf/gi, '')
                    .replace(/^📅\s*Terminvorschlag:\s*/gi, '📅 ')
                    .replace(/^📋\s*Aufgabenvorschlag:\s*/gi, '📋 ')
                    .trim();
            }

            return `
                <div class="${cardClass}" style="${cardStyle}" ${notifId ? `data-notification-id="${notifId}"` : ''}>
                    ${!isProposalCard ? `
                        <div class="chat-notification-header" style="${isBriefing ? 'border-bottom: none; padding-bottom: 4px;' : ''} display: flex; justify-content: space-between; align-items: center; text-align: left; width: 100%;">
                            <div class="chat-notification-title-wrap" style="display: flex; flex-direction: row; align-items: center; justify-content: flex-start; text-align: left; gap: 8px; min-width: 0; flex: 1;">
                                ${avatarElHtml}
                                <span class="chat-notification-title" style="font-weight: 700; font-size: 0.95rem; color: #ffffff; line-height: 1.35; text-align: left; min-width: 0; word-break: break-word;">${cardDisplayTitle}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 8px;">
                                ${chatLinkBtn}
                                ${mailLinkBtn}
                                ${timeStr ? `<span class="chat-notification-meta" style="font-size: 0.72rem; opacity: 0.65; white-space: nowrap;">${timeStr}</span>` : ''}
                                <div class="chat-notification-status-container">${statusHtml}</div>
                            </div>
                        </div>
                    ` : ''}
                    <div class="chat-notification-body" style="text-align: left; width: 100%;">
                        ${messageBodyHtml}
                        ${actionPreviewHtml}
                    </div>
                    ${buttonsHtml ? `<div class="chat-notification-actions">${buttonsHtml}</div>` : ''}
                </div>
            `;
        }

        window.getNotificationCardHtml = getNotificationCardHtml;



        function createNotificationCardElement(notif, convId) {
            const temp = document.createElement('div');
            temp.innerHTML = getNotificationCardHtml(notif, convId).trim();
            return temp.firstElementChild;
        }



        async function openComposeFromNotification(notifId, cardEl, replyText) {
            let notif = null;
            if (typeof currentConversationNotifications !== 'undefined') {
                notif = currentConversationNotifications.find(n => String(n.id) === String(notifId));
            }
            if (!notif && notifId) {
                try {
                    const r = await fetch(getApiUrl(`/api/notifications/${notifId}`));
                    if (r.ok) notif = await r.json();
                } catch (_) {}
            }

            let to = '';
            let subject = '';
            let body = '';
            let attachments = [];
            let accountId = null;

            let actionData = notif?.actionData;
            if (typeof actionData === 'string') {
                try { actionData = JSON.parse(actionData); } catch (_) {}
            }

            const mailData = actionData?.mailData || actionData?.replyData;
            if (mailData) {
                to = mailData.to || '';
                subject = mailData.subject || '';
                body = mailData.body || '';
                accountId = mailData.accountId || null;
                if (Array.isArray(mailData.attachments)) {
                    attachments = [...mailData.attachments];
                }
            }

            const rawMsg = notif?.message || (cardEl ? cardEl.querySelector('.chat-notification-body')?.innerText : '') || '';
            if (!to) {
                const mTo = rawMsg.match(/(?:Empf[äa]nger|An):\s*([^\n\r*<]+)/i);
                if (mTo) to = mTo[1].trim();
            }
            if (!subject) {
                const mSub = rawMsg.match(/Betreff:\s*([^\n\r*]+)/i);
                if (mSub) subject = mSub[1].trim();
            }
            if (!body && cardEl) {
                const previewBody = cardEl.querySelector('.action-preview-box div[style*="white-space: pre-wrap"]');
                if (previewBody) {
                    body = previewBody.innerText.trim();
                }
            }
            if (!body && rawMsg) {
                if (rawMsg.includes('--------------------------------------------------')) {
                    const parts = rawMsg.split('--------------------------------------------------');
                    if (parts.length >= 3) {
                        body = parts[1].replace(/\*\*Absender[^\n]+\n/g, '').replace(/\*\*Empf[^\n]+\n/g, '').replace(/\*\*Betreff[^\n]+\n/g, '').trim();
                    }
                }
                if (!body) body = rawMsg;
            }

            if (attachments.length === 0 && rawMsg) {
                const matches = rawMsg.match(/[a-zA-Z0-9_\-\u00C0-\u017F]+\.(?:txt|pdf|docx?|xlsx?|png|jpe?g|svg)/gi);
                if (matches) {
                    matches.forEach(f => {
                        if (!attachments.includes(f)) attachments.push(f);
                    });
                }
            }

            const replyToId = actionData?.replyData?.mailId || (notif?.sourceType === 'mail' && notif?.sourceId ? Number(notif.sourceId) : null) || (replyText && !isNaN(Number(replyText)) ? Number(replyText) : null);

            if (!accountId && cardEl) {
                const vonRow = cardEl.querySelector('.mail-draft-von-row');
                if (vonRow && vonRow.getAttribute('data-account-id')) {
                    accountId = Number(vonRow.getAttribute('data-account-id')) || null;
                }
            }
            if (!accountId && window.systemMailAccounts && window.systemMailAccounts.length > 0) {
                accountId = window.systemMailAccounts[0].id;
            }

            if (typeof openMailComposeModal === 'function') {
                openMailComposeModal(replyToId, accountId, {
                    to,
                    subject,
                    body,
                    attachments,
                    accountId,
                    notificationId: notifId
                });
            }
        }
        window.openComposeFromNotification = openComposeFromNotification;
        async function openEventEditFromNotification(notifId, cardEl) {
            let notif = null;
            if (typeof currentConversationNotifications !== 'undefined') {
                notif = currentConversationNotifications.find(n => String(n.id) === String(notifId));
            }
            if (!notif && notifId) {
                try {
                    const r = await fetch(getApiUrl(`/api/notifications/${notifId}`));
                    if (r.ok) notif = await r.json();
                } catch (_) {}
            }

            let actionData = notif?.actionData;
            if (typeof actionData === 'string') {
                try { actionData = JSON.parse(actionData); } catch (_) {}
            }

            const ev = actionData?.eventData || {};
            const title = ev.title || (cardEl ? cardEl.querySelector('.action-preview-box div[style*="font-weight: 700; font-size: 0.95rem"]')?.innerText : '') || '';
            const dateVal = ev.date || getLocalDateString();
            const startTime = ev.startTime || '10:00';
            const endTime = ev.endTime || '11:00';
            const isAllDay = !!ev.isAllDay;
            const desc = ev.description || '';
            const location = ev.location || '';

            const startIso = isAllDay ? `${dateVal}T00:00:00` : `${dateVal}T${startTime}:00`;
            const endIso = isAllDay ? `${dateVal}T23:59:59` : `${dateVal}T${endTime}:00`;

            window.editingEventProposalNotifId = notifId;
            window.pendingEventNotificationDismiss = null;

            if (typeof window.openEventEditModal === 'function') {
                window.openEventEditModal(null, title, startIso, endIso, isAllDay, '', desc, false, dateVal, false, location);
            } else if (typeof openEventEditModal === 'function') {
                openEventEditModal(null, title, startIso, endIso, isAllDay, '', desc, false, dateVal, false, location);
            }

            const dateInput = document.getElementById('event-edit-date-input');
            if (dateInput && dateVal) dateInput.value = dateVal;
            const sTimeInput = document.getElementById('event-edit-start-time');
            if (sTimeInput && startTime) sTimeInput.value = startTime;
            const eTimeInput = document.getElementById('event-edit-end-time');
            if (eTimeInput && endTime) eTimeInput.value = endTime;
            const modalTitle = document.getElementById("event-edit-modal-title");
            if (modalTitle) modalTitle.textContent = "Termin-Vorschlag bearbeiten";
            const locInput = document.getElementById("event-edit-location-input");
            if (locInput) locInput.value = location;
        }
        window.openEventEditFromNotification = openEventEditFromNotification;
        



        async function handleChatNotificationClick(btnEl, notifId, label, action, replyText, conversationId) {
            const cardEl = btnEl.closest('.chat-notification-card');
                        if (action === 'edit_event' || action === 'open_event_editor') {
                openEventEditFromNotification(notifId, cardEl);
                return;
            }
if (action === 'open_composer' || action === 'edit_mail') {
                openComposeFromNotification(notifId, cardEl, replyText);
                return;
            }

            if (cardEl) {
                cardEl.querySelectorAll('.chat-notification-btn').forEach(b => b.disabled = true);
            }
            const isSendIconBtn = btnEl.classList.contains('chat-notification-send-icon-btn');
            const originalText = btnEl.innerHTML;
            btnEl.innerHTML = isSendIconBtn ? '<span style="font-size: 1rem; line-height: 1;">⏳</span>' : '⏳ Wird ausgeführt...';

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
                if (isSendIconBtn) {
                    btnEl.innerHTML = '<span style="font-size: 1.1rem; line-height: 1; color: #11111b; font-weight: bold;">✓</span>';
                    btnEl.style.background = '#a6e3a1 !important';
                    btnEl.style.boxShadow = '0 4px 14px rgba(166, 227, 161, 0.4) !important';
                } else {
                    btnEl.innerHTML = '🔘 ' + label + ' (Ausgewählt)';
                }

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
            let cleanText = text || '';
            let notifCard = null;

            if (text) {
                // Inline Notification Box für Fragen / Bestätigungen im Chat rendern
                if (!isUser) {
                    let notifObj = notification;
                    if (!notifObj && typeof currentConversationNotifications !== 'undefined' && currentConversationNotifications.length > 0) {
                        notifObj = currentConversationNotifications.find(n => {
                            if (n._rendered) return false;
                            if (n.title && text.includes(n.title)) return true;
                            if (n.message && text.includes(n.message.slice(0, 30))) return true;
                            // Mail-Entwurf / Mail-Aktion in diesem Text erkennen
                            if (text.includes('schlage_mail_vor') || text.includes('schlage_mail_antwort_vor')) {
                                let act = n.actionData;
                                if (typeof act === 'string') {
                                    try { act = JSON.parse(act); } catch (_) {}
                                }
                                if (act && (act.actionType === 'send_mail' || act.actionType === 'send_mail_reply')) return true;
                            }
                            if (text.includes('schlage_termin_vor')) {
                                let act = n.actionData;
                                if (typeof act === 'string') {
                                    try { act = JSON.parse(act); } catch (_) {}
                                }
                                if (act && act.actionType === 'create_event') return true;
                            }
                            if (text.includes('schlage_aufgabe_vor')) {
                                let act = n.actionData;
                                if (typeof act === 'string') {
                                    try { act = JSON.parse(act); } catch (_) {}
                                }
                                if (act && act.actionType === 'create_task') return true;
                            }
                            return false;
                        });
                        if (notifObj) {
                            if (typeof notifObj.actionData === 'string') {
                                try { notifObj.actionData = JSON.parse(notifObj.actionData); } catch (_) {}
                            }
                            notifObj._rendered = true;
                        }
                    }
                    if (!notifObj) {
                        notifObj = parseNotificationFromText(text);
                        if (notifObj && typeof currentConversationNotifications !== 'undefined' && currentConversationNotifications.length > 0) {
                            const dbMatch = currentConversationNotifications.find(n => {
                                if (n._rendered) return false;
                                if (n.title && notifObj.title && (n.title === notifObj.title || n.title.includes(notifObj.title) || notifObj.title.includes(n.title))) return true;
                                if (notifObj.actionData && n.actionData) {
                                    let nAct = typeof n.actionData === 'string' ? JSON.parse(n.actionData) : n.actionData;
                                    if (nAct && nAct.actionType === notifObj.actionData.actionType) return true;
                                }
                                if (n.sourceType === 'mail' && (notifObj.actionData?.actionType?.includes('mail') || (notifObj.title && notifObj.title.toLowerCase().includes('mail')))) return true;
                                if (notifObj.conversationId && n.conversationId === notifObj.conversationId) return true;
                                return false;
                            });
                            if (dbMatch) {
                                let dbAct = dbMatch.actionData;
                                if (typeof dbAct === 'string') {
                                    try { dbAct = JSON.parse(dbAct); } catch (_) {}
                                }
                                notifObj = {
                                    ...notifObj,
                                    ...dbMatch,
                                    id: dbMatch.id,
                                    title: dbMatch.title || notifObj.title,
                                    message: dbMatch.message || notifObj.message,
                                    actionData: dbAct || dbMatch.actionData || notifObj.actionData,
                                    isDismissed: dbMatch.isDismissed,
                                    selectedButton: dbMatch.selectedButton
                                };
                                dbMatch._rendered = true;
                            }
                        }
                    }

                    const isMailDraftCard = notifObj && (
                        (notifObj.actionData && (notifObj.actionData.actionType === 'send_mail' || notifObj.actionData.actionType === 'send_mail_reply')) ||
                        (notifObj.title && (notifObj.title.toLowerCase().includes('mail') || notifObj.title.toLowerCase().includes('entwurf')))
                    );
                    if (isMailDraftCard) {
                        cleanText = cleanText.replace(/\*{0,2}E-Mail-Inhalt:?\*{0,2}\s*(?:\r?\n\s*>[^\n]*)+/gi, '').replace(/\n{3,}/g, '\n\n').trim();
                    }

                    if (cleanText.trim().length > 0) {
                        const textDiv = document.createElement('div');
                        textDiv.innerHTML = renderMarkdown(cleanText);
                        msg.appendChild(textDiv);
                    }

                    if (notifObj) {
                        notifCard = createNotificationCardElement(notifObj, currentConversationId);
                    }
                } else {
                    const textDiv = document.createElement('div');
                    textDiv.innerHTML = renderMarkdown(text);
                    msg.appendChild(textDiv);
                }

                if (cleanText.trim().length > 0) {
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
            }

            const hasMsgContent = (cleanText && cleanText.trim().length > 0) || (attachments && attachments.length > 0) || (replyTo && replyTo.id);
            if (hasMsgContent) {
                msg.setAttribute('data-msg-text', cleanText || '');
                chatBox.appendChild(msg);
            }

            if (notifCard) {
                chatBox.appendChild(notifCard);
            }

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
                            const targetDate = ev.occurrenceDate || (ev.time ? (typeof ev.time === 'string' ? ev.time.split('T')[0] : new Date(ev.time).toISOString().split('T')[0]) : (ev.start ? new Date(ev.start).toISOString().split('T')[0] : ''));
                            
                            const cancelStyle = ev.isCancelled ? 'color: var(--off); text-decoration: line-through;' : '';
                            const titleCancelStyle = ev.isCancelled ? 'color: var(--off); font-weight: 500;' : 'font-weight: 500;';
                            const reasonHtml = (ev.isCancelled && ev.cancellationReason) ? ` <span style="font-size: 0.75rem; color: var(--off); text-decoration: none; font-style: italic;">(${escapeHtml(ev.cancellationReason)})</span>` : (ev.isCancelled ? ' <span style="font-size: 0.75rem; color: var(--off); text-decoration: none; font-style: italic;">(Ausgefallen)</span>' : '');
                            const escTitle = escapeHtml(ev.title).replace(/'/g, "\\'");
                            const timeBadgeHtml = (typeof window.getEventTimeBadge === 'function') ? window.getEventTimeBadge(ev) : '';

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

            let res;
            try {
                res = await fetch(getApiUrl('/chat'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        message: textToSend,
                        attachments: attachmentsToSend,
                        conversationId: currentConversationId 
                    })
                });
            } catch (networkErr) {
                clearInterval(pollInterval);
                thinkingDiv.remove();
                addMessage("Fehler beim Senden der Nachricht: Netzwerkverbindung fehlgeschlagen.", false);
                return;
            }

            clearInterval(pollInterval);
            thinkingDiv.remove();

            if (!res.ok) {
                let errMsg = "Fehler beim Verarbeiten der Nachricht auf dem Server.";
                try {
                    const errData = await res.json();
                    if (errData && errData.error) errMsg = errData.error;
                } catch (_) {}
                addMessage(errMsg, false);
                return;
            }

            try {
                const data = await res.json();
                currentConversationId = data.conversationId;
                if (Array.isArray(data.notifications) && data.notifications.length > 0) {
                    currentConversationNotifications = data.notifications;
                    currentConversationNotifications.forEach(n => n._rendered = false);
                } else if (data.notification) {
                    currentConversationNotifications = [data.notification];
                }
                addMessage(data.text, false, data.widget, [], null, data.notification);
                if (typeof loadTopWidgets === 'function') {
                    loadTopWidgets();
                }
                if (isElectron && ipcRenderer) {
                    ipcRenderer.send('widgets-updated');
                }
            } catch (renderErr) {
                console.error("Fehler beim Anzeigen der Antwort im Chat:", renderErr);
            }
        }



        let isTimelineLoadingPast = false;


        let isTimelineLoadingFuture = false;


        let timelineOldestLoadedDateStr = null;


        let timelineNewestLoadedDateStr = null;


        let timelineCanScrollPast = true;


        let timelineCanScrollFuture = true;



        function getElementTopRelativeToParent(element, parent) {
            let top = 0;
            let curr = element;
            while (curr && curr !== parent && curr !== document.body) {
                top += curr.offsetTop || 0;
                curr = curr.offsetParent;
            }
            return top;
        }



        if (plusBtn) {
            plusBtn.onclick = (e) => {
                e.preventDefault();
                if (typeof toggleChatAttachmentMenu === 'function') {
                    toggleChatAttachmentMenu(e);
                } else if (fileInput) {
                    fileInput.click();
                }
            };
        }

        if (fileInput) {
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
