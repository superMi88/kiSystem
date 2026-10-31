// ==========================================================================
// SPA Router for kiSystem
// Provides clean, bookmarkable URLs and browser history (back/forward)
// ==========================================================================

(function() {
    let isHandlingNavigation = false;
    let isInitialized = false;

    // View to URL mapping
    const VIEW_TO_PATH = {
        'chat': '/chat',
        'calendar': '/kalender',
        'dashboard': '/kalender',
        'briefing': '/briefing',
        'projects': '/projekte',
        'memory': '/gedaechtnis',
        'locations': '/orte',
        'photos': '/fotos',
        'docs': '/dokumente',
        'media': '/medien',
        'mail': '/mail',
        'timer': '/timer',
        'history': '/verlauf',
        'settings': '/einstellungen',
        'tasks': '/projekte',
        'journal': '/kalender'
    };

    function parsePath(pathname) {
        if (!pathname || pathname === '/' || pathname === '/index.html') {
            return { type: 'root', path: '/' };
        }

        const clean = pathname.replace(/^\/+|\/+$/g, '');
        const segments = clean.split('/');
        const first = segments[0]?.toLowerCase();
        const param = segments[1] ? decodeURIComponent(segments.slice(1).join('/')) : null;

        if (first === 'chat') {
            return { type: 'chat', id: param };
        }
        if (first === 'kalender' || first === 'calendar') {
            return { type: 'calendar', date: param };
        }
        if (first === 'mail' || first === 'mails') {
            return { type: 'mail', id: param ? Number(param) : null };
        }
        if (first === 'projekte' || first === 'projects') {
            return { type: 'projects', id: param ? (isNaN(Number(param)) ? param : Number(param)) : null };
        }
        if (first === 'gedaechtnis' || first === 'memory' || first === 'personen') {
            return { type: 'memory', id: param };
        }
        if (first === 'orte' || first === 'locations') {
            return { type: 'locations', id: param };
        }
        if (first === 'fotos' || first === 'photos') {
            return { type: 'photos', id: param };
        }
        if (first === 'dokumente' || first === 'docs') {
            return { type: 'docs', id: param };
        }
        if (first === 'medien' || first === 'media') {
            return { type: 'media', id: param };
        }
        if (first === 'briefing') {
            return { type: 'briefing' };
        }
        if (first === 'timer' || first === 'wecker') {
            return { type: 'timer' };
        }
        if (first === 'verlauf' || first === 'history') {
            return { type: 'history' };
        }
        if (first === 'einstellungen' || first === 'settings') {
            return { type: 'settings' };
        }

        return { type: 'unknown', raw: pathname };
    }

    function getCurrentStateUrl() {
        if (document.body.classList.contains('mail-read-active') && window.currentReadMailId) {
            return `/mail/${window.currentReadMailId}`;
        }
        if (window.activeProjectDetailId) {
            return `/projekte/${window.activeProjectDetailId}`;
        }
        const histSec = document.getElementById('history-section');
        if (histSec && histSec.style.display !== 'none') {
            return '/verlauf';
        }
        const setSec = document.getElementById('settings-section');
        if (setSec && setSec.style.display !== 'none') {
            return '/einstellungen';
        }

        const currentView = window.lastActiveView || (document.body.classList.contains('view-chat') ? 'chat' : 'calendar');
        if (currentView === 'chat') {
            return window.currentConversationId ? `/chat/${window.currentConversationId}` : '/chat';
        }
        return VIEW_TO_PATH[currentView] || '/kalender';
    }

    async function applyRoute(route, { fromPopState = false, initial = false } = {}) {
        isHandlingNavigation = true;
        try {
            switch (route.type) {
                case 'chat': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof showSection === 'function') {
                        showSection('chat');
                    }
                    if (typeof switchMobileView === 'function') {
                        switchMobileView('chat');
                    }
                    if (route.id) {
                        if (String(window.currentConversationId || '') !== String(route.id)) {
                            if (typeof loadConversation === 'function') {
                                await loadConversation(route.id);
                            }
                        }
                    } else if (fromPopState && window.currentConversationId) {
                        window.currentConversationId = null;
                        const box = document.getElementById('chat-box');
                        if (box) {
                            box.innerHTML = '<div class="message ai">Ein neuer Chat wurde gestartet. Wie kann ich dir helfen?</div>';
                        }
                    }
                    break;
                }

                case 'calendar': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('calendar');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('calendar');
                    }
                    if (route.date && typeof jumpToTimelineDate === 'function') {
                        setTimeout(() => {
                            jumpToTimelineDate(route.date);
                        }, 100);
                    }
                    break;
                }

                case 'mail': {
                    if (route.id) {
                        if (typeof openMailReadModal === 'function') {
                            await openMailReadModal(route.id);
                        }
                    } else {
                        if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                            closeMailReadModal(true);
                        }
                        if (typeof focusWidget === 'function') {
                            focusWidget('mail');
                        } else if (typeof switchMobileView === 'function') {
                            switchMobileView('mail');
                        }
                    }
                    break;
                }

                case 'projects': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (route.id) {
                        if (typeof openProjectDetailPage === 'function') {
                            openProjectDetailPage(route.id);
                        }
                    } else {
                        if (window.activeProjectDetailId && typeof closeProjectDetail === 'function') {
                            closeProjectDetail();
                        } else {
                            if (typeof focusWidget === 'function') {
                                focusWidget('projects');
                            } else if (typeof switchMobileView === 'function') {
                                switchMobileView('projects');
                            }
                        }
                    }
                    break;
                }

                case 'memory': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('memory');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('memory');
                    }
                    break;
                }

                case 'locations': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('locations');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('locations');
                    }
                    break;
                }

                case 'photos': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('photos');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('photos');
                    }
                    break;
                }

                case 'docs': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('docs');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('docs');
                    }
                    break;
                }

                case 'media': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('media');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('media');
                    }
                    break;
                }

                case 'briefing': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('briefing');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('briefing');
                    }
                    break;
                }

                case 'timer': {
                    if (document.body.classList.contains('mail-read-active') && typeof closeMailReadModal === 'function') {
                        closeMailReadModal(true);
                    }
                    if (typeof focusWidget === 'function') {
                        focusWidget('timer');
                    } else if (typeof switchMobileView === 'function') {
                        switchMobileView('timer');
                    }
                    break;
                }

                case 'history': {
                    if (typeof showSection === 'function') {
                        showSection('history');
                        if (typeof loadHistory === 'function') loadHistory();
                    }
                    break;
                }

                case 'settings': {
                    if (typeof showSection === 'function') {
                        showSection('settings');
                    }
                    break;
                }

                case 'root': {
                    if (window.location.hash === '#chat') {
                        if (typeof switchMobileView === 'function') switchMobileView('chat');
                    } else if (window.location.hash === '#plugins') {
                        if (typeof switchMobileView === 'function') switchMobileView('dashboard');
                    } else if (!initial) {
                        if (typeof switchMobileView === 'function') switchMobileView('calendar');
                    }
                    break;
                }
            }
        } finally {
            isHandlingNavigation = false;
        }
    }

    function updateUrl(targetPath, { replace = false } = {}) {
        if (!isInitialized || isHandlingNavigation) return;
        if (!targetPath) targetPath = getCurrentStateUrl();

        if (window.location.pathname === targetPath) return;

        try {
            if (window.location.protocol.startsWith('http')) {
                if (replace) {
                    window.history.replaceState({ path: targetPath }, '', targetPath);
                } else {
                    window.history.pushState({ path: targetPath }, '', targetPath);
                }
            }
        } catch (e) {
            console.warn('History pushState error:', e);
        }
    }

    function onViewChanged(viewName, params = {}) {
        if (!isInitialized || isHandlingNavigation) return;

        let targetPath = VIEW_TO_PATH[viewName] || `/${viewName}`;
        if (viewName === 'chat' && (params.conversationId || window.currentConversationId)) {
            targetPath = `/chat/${params.conversationId || window.currentConversationId}`;
        } else if (viewName === 'mail' && (params.mailId || window.currentReadMailId)) {
            targetPath = `/mail/${params.mailId || window.currentReadMailId}`;
        } else if (viewName === 'projects' && (params.projectId || window.activeProjectDetailId)) {
            targetPath = `/projekte/${params.projectId || window.activeProjectDetailId}`;
        } else if (viewName === 'calendar' && params.date) {
            targetPath = `/kalender/${params.date}`;
        }

        updateUrl(targetPath, { replace: !!params.replace });
    }

    async function init() {
        if (isInitialized) return;
        isInitialized = true;

        window.addEventListener('popstate', (ev) => {
            const currentRoute = parsePath(window.location.pathname);
            applyRoute(currentRoute, { fromPopState: true });
        });

        const initialRoute = parsePath(window.location.pathname);
        if (initialRoute.type !== 'root' || window.location.hash) {
            await applyRoute(initialRoute, { initial: true });
        }
    }

    window.AppRouter = {
        init,
        updateUrl,
        onViewChanged,
        parsePath,
        applyRoute,
        getCurrentStateUrl
    };
})();
