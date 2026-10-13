

        // =========================================================================
        // Swipe-to-Link Touch & Drag Engine
        // =========================================================================
        // =========================================================================
        // Long-Press Context Menu & Swipe-to-Link Engine
        // =========================================================================
        let activeSwipeItem = null;


        let activeSwipeWrapper = null;


        let activeSwipeBg = null;


        let swipeStartX = 0;


        let swipeStartY = 0;


        let swipeCurrentX = 0;


        let swipeCurrentY = 0;


        let isSwipeGestureActive = false;


        let isScrollLockedOut = false;


        let swipeThresholdCrossed = false;


        let lastSwipeTime = 0;


        let longPressTimer = null;


        let activeLongPressTarget = null;


        let activeContextMenuEl = null;


        let activeContextMenuBackdrop = null;


        let isLongPressActive = false;



        const SWIPE_LINK_THRESHOLD = 60;

 // px threshold to trigger linking
        const SWIPE_MAX_OFFSET = 110;

 // maximum visual pull distance
        const LONG_PRESS_DURATION = 650;

 // ms to trigger context menu

        function closeContextMenu() {
            if (activeContextMenuEl) {
                activeContextMenuEl.remove();
                activeContextMenuEl = null;
            }
            if (activeContextMenuBackdrop) {
                activeContextMenuBackdrop.remove();
                activeContextMenuBackdrop = null;
            }
            if (activeLongPressTarget) {
                activeLongPressTarget.classList.remove('long-press-active');
                activeLongPressTarget = null;
            }
            isLongPressActive = false;
        }


        window.closeContextMenu = closeContextMenu;



        function openContextMenuForElement(itemEl, clickX, clickY) {
            closeContextMenu();
            if (!itemEl) return;

            const contextData = itemEl.dataset;
            const type = contextData.contextType || contextData.linkType;
            if (!type) return;

            const id = contextData.linkId || contextData.mailId || contextData.taskId || contextData.eventId || contextData.personId || contextData.timerId || contextData.noteId || contextData.projectId || contextData.dayDate || contextData.date;

            if (id !== undefined && id !== null) {
                startSelectionMode(type, id, contextData);
                isLongPressActive = true;
                lastSwipeTime = Date.now();
                return;
            }

            // Trigger haptic feedback
            if (navigator.vibrate) navigator.vibrate(35);
            itemEl.classList.add('long-press-active');
            activeLongPressTarget = itemEl;
            isLongPressActive = true;

            // Create Backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'context-menu-backdrop';
            backdrop.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                closeContextMenu();
            });
            backdrop.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                closeContextMenu();
            }, { passive: true });
            document.body.appendChild(backdrop);
            activeContextMenuBackdrop = backdrop;

            // Create Menu container
            const menu = document.createElement('div');
            menu.className = 'entity-context-menu';

            // Populate actions by type
            let actions = [];

            if (type === 'task') {
                const taskId = contextData.taskId || contextData.linkId;
                const taskTitle = contextData.taskTitle || contextData.linkLabel || '';
                const taskNotes = contextData.taskNotes || '';
                const taskDue = contextData.taskDue || '';
                const taskList = contextData.taskList || 'Standard';
                const taskRec = contextData.taskRecurrence || 'none';
                const taskProj = contextData.taskProjectId ? Number(contextData.taskProjectId) : (contextData.projectId ? Number(contextData.projectId) : null);
                const taskCompleted = contextData.taskCompleted === 'true';

                actions = [
                    {
                        icon: '👁️',
                        label: 'Details anzeigen',
                        onClick: () => {
                            openTaskDetailModal(taskId, taskTitle, taskNotes, taskDue, taskList, taskRec, taskProj, taskCompleted);
                        }
                    },
                    {
                        icon: '✏️',
                        label: 'Bearbeiten',
                        onClick: () => {
                            editTask(taskId, taskTitle, taskNotes, taskDue, taskList, taskRec, taskProj);
                        }
                    },
                    {
                        icon: '🔗',
                        label: 'In Chat verlinken',
                        className: 'accent',
                        onClick: () => {
                            insertEntityLinkIntoChat(taskTitle, 'task', taskId);
                        }
                    },
                    {
                        icon: '✖️',
                        label: 'Aufgabe löschen',
                        className: 'danger',
                        onClick: () => {
                            deleteTask(taskId);
                        }
                    }
                ];
            } else if (type === 'event') {
                const eventId = contextData.eventId || contextData.linkId;
                const eventTitle = contextData.eventTitle || contextData.linkLabel || '';
                const eventDate = contextData.eventDate || '';
                const isRec = contextData.eventIsRec === 'true';
                const isBirthday = contextData.eventIsBirthday === 'true';
                const personId = contextData.personId;

                actions = [
                    {
                        icon: '👁️',
                        label: 'Details anzeigen',
                        onClick: () => {
                            if (isBirthday && personId) {
                                openPersonProfileModal(Number(personId));
                            } else {
                                openEventDetailModalFromData(contextData);
                            }
                        }
                    }
                ];

                if (!isBirthday) {
                    actions.push({
                        icon: '✏️',
                        label: 'Bearbeiten',
                        onClick: () => {
                            openEventEditModal(
                                eventId,
                                eventTitle,
                                contextData.eventStart || '',
                                contextData.eventEnd || '',
                                contextData.eventIsAllday === 'true',
                                contextData.eventFuzzy || '',
                                contextData.eventDesc || '',
                                isRec,
                                eventDate
                            );
                        }
                    });
                }

                actions.push({
                    icon: '🔗',
                    label: isBirthday ? 'Person in Chat verlinken' : 'In Chat verlinken',
                    className: 'accent',
                    onClick: () => {
                        if (isBirthday && personId) {
                            insertEntityLinkIntoChat(eventTitle, 'person', personId);
                        } else {
                            insertEntityLinkIntoChat(eventTitle, 'event', eventId);
                        }
                    }
                });

                if (!isBirthday) {
                    actions.push({
                        icon: '✖️',
                        label: 'Termin löschen',
                        className: 'danger',
                        onClick: () => {
                            deleteCalendarEvent(eventId, eventDate, isRec);
                        }
                    });
                }
            } else if (type === 'journal') {
                const jId = contextData.journalId || contextData.linkId;
                const jTitle = contextData.journalTitle || contextData.linkLabel || 'Tagebucheintrag';
                const jDate = contextData.journalDate || '';

                actions = [
                    {
                        icon: '🔗',
                        label: 'In Chat verlinken',
                        className: 'accent',
                        onClick: () => {
                            insertEntityLinkIntoChat(jTitle, 'journal', jId);
                        }
                    },
                    {
                        icon: '✖️',
                        label: 'Eintrag löschen',
                        className: 'danger',
                        onClick: () => {
                            deleteJournalEntry(jId, jDate);
                        }
                    }
                ];
            } else if (type === 'timer') {
                const timerId = Number(contextData.timerId || contextData.linkId);
                const timerTitle = contextData.timerTitle || contextData.linkLabel || 'Timer';

                actions = [
                    {
                        icon: '👁️',
                        label: 'Details anzeigen',
                        onClick: () => {
                            openTimerDetailModalFromData(contextData);
                        }
                    },
                    {
                        icon: '✏️',
                        label: 'Timer anpassen',
                        onClick: () => {
                            openTimerDetailModalFromData(contextData);
                        }
                    },
                    {
                        icon: '🔗',
                        label: 'In Chat verlinken',
                        className: 'accent',
                        onClick: () => {
                            insertEntityLinkIntoChat(timerTitle, 'timer', timerId);
                        }
                    },
                    {
                        icon: '⏹️',
                        label: 'Timer löschen',
                        className: 'danger',
                        onClick: () => {
                            stopAlarmSound();
                            cancelScheduledTimerAlarm(timerId);
                            callTool('loesche_timer', { id: timerId });
                        }
                    }
                ];
            } else if (type === 'day') {
                const dayDate = contextData.dayDate || contextData.linkId || '';
                const dayLabel = contextData.dayLabel || contextData.linkLabel || dayDate;

                actions = [
                    {
                        icon: '🔗',
                        label: 'Tag in Chat verlinken',
                        className: 'accent',
                        onClick: () => {
                            insertEntityLinkIntoChat(dayLabel, 'day', dayDate);
                        }
                    },
                    {
                        icon: '➕',
                        label: 'Neuer Termin an diesem Tag',
                        onClick: () => {
                            openEventEditModal(null, '', dayDate ? `${dayDate}T10:00:00` : '', dayDate ? `${dayDate}T11:00:00` : '', false, '', '', false, dayDate);
                        }
                    },
                    {
                        icon: '📋',
                        label: 'Neue Aufgabe an diesem Tag',
                        onClick: () => {
                            openTaskModal(null, '', '', dayDate, 'Standard', 'none', null);
                        }
                    }
                ];
            } else if (type === 'project') {
                const projId = Number(contextData.projectId || contextData.linkId);
                const projName = contextData.projectName || contextData.linkLabel || 'Projekt';

                actions = [
                    {
                        icon: '✏️',
                        label: 'Projekt bearbeiten',
                        onClick: () => {
                            openProjectModal(projId, projName);
                        }
                    },
                    {
                        icon: '➕',
                        label: 'Neue Aufgabe',
                        onClick: () => {
                            openTaskModal(null, '', '', '', '', 'none', projId);
                        }
                    },
                    {
                        icon: '📝',
                        label: 'Neue Notiz',
                        onClick: () => {
                            openNoteModal(null, '', '', projId);
                        }
                    },
                    {
                        icon: '🔗',
                        label: 'In Chat verlinken',
                        className: 'accent',
                        onClick: () => {
                            insertEntityLinkIntoChat(projName, 'project', projId);
                        }
                    },
                    {
                        icon: '✖️',
                        label: 'Projekt löschen',
                        className: 'danger',
                        onClick: () => {
                            deleteProject(projId);
                        }
                    }
                ];
            } else if (type === 'note') {
                const noteId = Number(contextData.noteId || contextData.linkId);
                const noteTitle = contextData.noteTitle || contextData.linkLabel || 'Notiz';
                const noteContent = contextData.noteContent || '';
                const noteProj = contextData.projectId ? Number(contextData.projectId) : null;

                actions = [
                    {
                        icon: '✏️',
                        label: 'Bearbeiten',
                        onClick: () => {
                            openNoteModal(noteId, noteTitle, noteContent, noteProj);
                        }
                    },
                    {
                        icon: '🔗',
                        label: 'In Chat verlinken',
                        className: 'accent',
                        onClick: () => {
                            insertEntityLinkIntoChat(noteTitle, 'note', noteId);
                        }
                    },
                    {
                        icon: '✖️',
                        label: 'Löschen',
                        className: 'danger',
                        onClick: () => {
                            deleteNote(noteId);
                        }
                    }
                ];
            } else if (type === 'person') {
                const personId = Number(contextData.personId || contextData.linkId);
                const personName = contextData.personName || contextData.linkLabel || 'Person';
                const isOwner = contextData.personIsOwner === 'true';
                const isFavorite = contextData.personIsFavorite === 'true';

                actions = [
                    {
                        icon: '👁️',
                        label: 'Profil & Details',
                        onClick: () => {
                            openPersonProfileModal(personId);
                        }
                    },
                    {
                        icon: '✏️',
                        label: 'Bearbeiten',
                        onClick: () => {
                            openPersonProfileModal(personId);
                        }
                    }
                ];

                if (!isOwner) {
                    actions.push({
                        icon: isFavorite ? '⭐' : '☆',
                        label: isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen',
                        className: isFavorite ? 'accent' : '',
                        onClick: () => {
                            togglePersonFavorite(personId, !isFavorite);
                        }
                    });
                }

                actions.push({
                    icon: '🔗',
                    label: 'In Chat verlinken',
                    className: 'accent',
                    onClick: () => {
                        insertEntityLinkIntoChat(personName, 'person', personId);
                    }
                });

                if (!isOwner) {
                    actions.push({
                        icon: '✖️',
                        label: 'Person löschen',
                        className: 'danger',
                        onClick: () => {
                            deletePerson(personId);
                        }
                    });
                }
            } else if (type === 'mail') {
                const mailId = Number(contextData.mailId || contextData.linkId);
                if (mailId) {
                    startMailSelectionMode(mailId);
                    isLongPressActive = true;
                    lastSwipeTime = Date.now();
                    closeContextMenu();
                    return;
                }
            }

            if (actions.length === 0) {
                closeContextMenu();
                return;
            }

            actions.forEach(act => {
                const btn = document.createElement('button');
                btn.className = `context-menu-item ${act.className || ''}`;
                btn.innerHTML = `<span class="menu-item-icon">${act.icon}</span> <span>${escapeHtml(act.label)}</span>`;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    closeContextMenu();
                    lastSwipeTime = Date.now();
                    act.onClick();
                });
                menu.appendChild(btn);
            });

            document.body.appendChild(menu);
            activeContextMenuEl = menu;

            // Positioning: Calculate coordinates relative to item or click
            const rect = itemEl.getBoundingClientRect();
            const menuWidth = 190;
            const menuHeight = actions.length * 36 + 20;
            const vpWidth = window.innerWidth;
            const vpHeight = window.innerHeight;

            let left = clickX ? (clickX - 30) : (rect.left + 20);
            let top = rect.bottom + 6;

            // Boundary checks
            if (left < 10) left = 10;
            if (left + menuWidth > vpWidth - 10) left = Math.max(10, vpWidth - menuWidth - 10);

            if (top + menuHeight > vpHeight - 15) {
                // Open above the card instead
                top = Math.max(10, rect.top - menuHeight - 6);
            }

            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
        }



        let activeSwipeMessage = null;


        let swipeMsgStartX = 0;


        let swipeMsgStartY = 0;


        let isMsgSwipeActive = false;


        let msgSwipeThresholdCrossed = false;



        function handleSwipeStart(e) {
            if (e.type === 'mousedown' && e.button !== 0) return;
            
            const touch = e.touches ? e.touches[0] : e;
            const target = e.target;

            // Only ignore when interacting directly with explicit form elements or clickable tags
            if (target.closest('button, input, select, textarea, a, .clickable-tag, .reply-cancel-btn, .task-checkbox, summary')) {
                return;
            }

            // Check if user is touching a chat message (for swipe-to-reply)
            const msgItem = target.closest('.message');
            const swipeLinkItem = target.closest('.swipe-link-item');

            if (msgItem && !swipeLinkItem) {
                activeSwipeMessage = msgItem;
                swipeMsgStartX = touch.clientX;
                swipeMsgStartY = touch.clientY;
                isMsgSwipeActive = false;
                msgSwipeThresholdCrossed = false;
                isScrollLockedOut = false;

                if (e.type === 'mousedown') {
                    document.addEventListener('mousemove', handleSwipeMove, { passive: false });
                    document.addEventListener('mouseup', handleSwipeEnd);
                } else if (e.type === 'touchstart') {
                    window.addEventListener('touchmove', handleSwipeMove, { passive: false });
                }
                return;
            }

            if (!swipeLinkItem) return;

            activeSwipeItem = swipeLinkItem;
            activeSwipeWrapper = swipeLinkItem.closest('.swipe-link-wrapper');
            activeSwipeBg = activeSwipeWrapper ? activeSwipeWrapper.querySelector('.swipe-link-bg') : null;
            
            swipeStartX = touch.clientX;
            swipeStartY = touch.clientY;
            swipeCurrentX = touch.clientX;
            swipeCurrentY = touch.clientY;
            isSwipeGestureActive = false;
            isScrollLockedOut = false;
            swipeThresholdCrossed = false;

            // Start Long-Press detection
            if (longPressTimer) clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                if (!isSwipeGestureActive && !isScrollLockedOut && activeSwipeItem) {
                    openContextMenuForElement(activeSwipeItem, swipeStartX, swipeStartY);
                }
            }, LONG_PRESS_DURATION);

            if (e.type === 'mousedown') {
                document.addEventListener('mousemove', handleSwipeMove, { passive: false });
                document.addEventListener('mouseup', handleSwipeEnd);
            } else if (e.type === 'touchstart') {
                window.addEventListener('touchmove', handleSwipeMove, { passive: false });
            }
        }



        function handleSwipeMove(e) {
            if (!activeSwipeMessage && !activeSwipeItem) return;

            const touch = e.touches ? e.touches[0] : e;

            // 1. Message Swipe-to-Reply Handling
            if (activeSwipeMessage) {
                const deltaX = touch.clientX - swipeMsgStartX;
                const deltaY = touch.clientY - swipeMsgStartY;

                // If user moves vertically even slightly (> 5px), lock out swipe immediately for smooth native scroll
                if (!isMsgSwipeActive) {
                    if (Math.abs(deltaY) > 5) {
                        activeSwipeMessage = null;
                        window.removeEventListener('touchmove', handleSwipeMove);
                        return;
                    } else if (deltaX < -28 && Math.abs(deltaX) > Math.abs(deltaY) * 2.5) {
                        isMsgSwipeActive = true;
                        activeSwipeMessage.classList.add('swiping');
                    }
                }

                if (isMsgSwipeActive) {
                    if (e.cancelable) e.preventDefault();
                    const clampedOffset = Math.min(0, Math.max(-80, deltaX));
                    activeSwipeMessage.style.transform = `translateX(${clampedOffset}px)`;

                    const indicator = activeSwipeMessage.querySelector('.message-swipe-reply-indicator');
                    if (indicator) {
                        if (Math.abs(clampedOffset) >= 50) {
                            if (!msgSwipeThresholdCrossed) {
                                msgSwipeThresholdCrossed = true;
                                if (navigator.vibrate) navigator.vibrate(20);
                            }
                            indicator.classList.add('active');
                        } else {
                            msgSwipeThresholdCrossed = false;
                            indicator.classList.remove('active');
                        }
                    }
                }
                return;
            }

            // 2. Swipe-to-Link Handling (Swiping RIGHT to link into chat)
            if (!activeSwipeItem) return;
            swipeCurrentX = touch.clientX;
            swipeCurrentY = touch.clientY;

            const deltaX = swipeCurrentX - swipeStartX;
            const deltaY = swipeCurrentY - swipeStartY;

            // If user moves beyond 4px in any direction, cancel long-press immediately
            if (Math.hypot(deltaX, deltaY) > 4) {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }

            // If context menu is already open, do not swipe
            if (isLongPressActive) return;

            // Determine if gesture is horizontal swipe to the right or vertical scroll
            if (!isSwipeGestureActive && !isScrollLockedOut) {
                // If user moves vertically significantly more than horizontally, lock out swipe for smooth native scroll
                if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
                    isScrollLockedOut = true;
                    activeSwipeItem = null;
                    window.removeEventListener('touchmove', handleSwipeMove);
                    return;
                } else if (deltaX > 28 && Math.abs(deltaX) > Math.abs(deltaY) * 2.0) {
                    isSwipeGestureActive = true;
                    activeSwipeItem.classList.add('swiping');
                }
            }

            if (isSwipeGestureActive) {
                if (e.cancelable) e.preventDefault();

                const clampedOffset = Math.max(0, Math.min(SWIPE_MAX_OFFSET, deltaX));
                activeSwipeItem.style.transform = `translateX(${clampedOffset}px)`;

                const absOffset = Math.abs(clampedOffset);
                const progress = Math.min(1, absOffset / SWIPE_LINK_THRESHOLD);

                if (activeSwipeBg) {
                    activeSwipeBg.style.opacity = progress;
                    if (absOffset >= SWIPE_LINK_THRESHOLD) {
                        if (!swipeThresholdCrossed) {
                            swipeThresholdCrossed = true;
                            if (navigator.vibrate) navigator.vibrate(20);
                        }
                        activeSwipeBg.classList.add('active');
                    } else {
                        swipeThresholdCrossed = false;
                        activeSwipeBg.classList.remove('active');
                    }
                }
            }
        }



        function handleSwipeEnd(e) {
            window.removeEventListener('touchmove', handleSwipeMove);
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (e.type === 'mouseup') {
                document.removeEventListener('mousemove', handleSwipeMove);
                document.removeEventListener('mouseup', handleSwipeEnd);
            }

            // 1. End Message Swipe
            if (activeSwipeMessage) {
                const msg = activeSwipeMessage;
                const wasMsgSwiping = isMsgSwipeActive;
                const msgTriggered = msgSwipeThresholdCrossed;

                msg.classList.remove('swiping');
                msg.style.transform = '';

                const indicator = msg.querySelector('.message-swipe-reply-indicator');
                if (indicator) indicator.classList.remove('active');

                if (wasMsgSwiping) {
                    lastSwipeTime = Date.now();
                }

                if (wasMsgSwiping && msgTriggered) {
                    startChatReply(msg);
                }

                activeSwipeMessage = null;
                isMsgSwipeActive = false;
                msgSwipeThresholdCrossed = false;
                isScrollLockedOut = false;
                return;
            }

            // 2. End Swipe-to-Link
            if (!activeSwipeItem) {
                isScrollLockedOut = false;
                return;
            }

            const item = activeSwipeItem;
            const wrapper = activeSwipeWrapper;
            const bg = activeSwipeBg;
            const wasSwiping = isSwipeGestureActive;
            const triggered = swipeThresholdCrossed;

            item.classList.remove('swiping');
            item.style.transform = '';

            if (wasSwiping || isLongPressActive) {
                lastSwipeTime = Date.now();
            }
            isLongPressActive = false;

            if (wasSwiping && triggered) {
                const label = item.dataset.linkLabel || '';
                const type = item.dataset.linkType || 'item';
                const id = item.dataset.linkId || '';
                
                if (label && id) {
                    insertEntityLinkIntoChat(label, type, id);
                    if (wrapper) {
                        wrapper.classList.add('swipe-linked-flash');
                        setTimeout(() => wrapper.classList.remove('swipe-linked-flash'), 600);
                    }
                }
            }

            if (bg) {
                setTimeout(() => {
                    bg.style.opacity = '0';
                    bg.classList.remove('active');
                }, 200);
            }

            activeSwipeItem = null;
            activeSwipeWrapper = null;
            activeSwipeBg = null;
            isSwipeGestureActive = false;
            isScrollLockedOut = false;
            swipeThresholdCrossed = false;
        }



        // Suppress click events if a swipe gesture or long-press was just completed
        window.addEventListener('click', (e) => {
            // If in selection mode, handle item toggling immediately without threshold delay
            if (currentSelectionType !== null) {
                let targetItem = e.target.closest(`.swipe-link-item[data-context-type="${currentSelectionType}"], .swipe-link-item[data-link-type="${currentSelectionType}"]`);
                if (!targetItem) {
                    targetItem = e.target.closest('.swipe-link-item');
                }
                if (targetItem) {
                    const type = targetItem.dataset.contextType || targetItem.dataset.linkType;
                    const id = targetItem.dataset.linkId || targetItem.dataset.mailId || targetItem.dataset.taskId || targetItem.dataset.eventId || targetItem.dataset.personId || targetItem.dataset.timerId || targetItem.dataset.noteId || targetItem.dataset.projectId || targetItem.dataset.dayDate || targetItem.dataset.date;
                    if (type === currentSelectionType) {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleSelectionItem(type, id, targetItem.dataset);
                        return;
                    }
                }
            }

            if (Date.now() - lastSwipeTime < 350) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }

            // Direct click handlers for item tap & reply quote tap
            if (e.target.closest('button, input, select, textarea, a, .pill-close, .task-checkbox, .clickable-tag, .reply-cancel-btn, summary, details, .travel-transit-accordion, .travel-item-extra')) {
                return;
            }

            const replyQuote = e.target.closest('.chat-reply-quote');
            if (replyQuote) {
                e.stopPropagation();
                e.preventDefault();
                const targetId = replyQuote.getAttribute('data-target-msg-id');
                if (targetId) {
                    scrollToMessage(targetId);
                }
                return;
            }

            const item = e.target.closest('.swipe-link-item');
            if (item) {
                const type = item.dataset.contextType || item.dataset.linkType;
                const id = item.dataset.linkId || item.dataset.mailId || item.dataset.taskId || item.dataset.eventId || item.dataset.personId || item.dataset.timerId || item.dataset.noteId || item.dataset.projectId || item.dataset.dayDate || item.dataset.date;
                if (!type) return;

                if (type === 'task') {
                    openTaskDetailModalFromData(item.dataset);
                } else if (type === 'event') {
                    if (item.dataset.eventIsBirthday === 'true' && item.dataset.personId) {
                        openPersonProfileModal(Number(item.dataset.personId));
                    } else {
                        openEventDetailModalFromData(item.dataset);
                    }
                } else if (type === 'timer') {
                    openTimerDetailModalFromData(item.dataset);
                } else if (type === 'person') {
                    openPersonProfileModal(Number(item.dataset.personId || id));
                } else if (type === 'project') {
                    toggleProjectCollapse(item.dataset.projectId || id);
                } else if (type === 'note') {
                    openNoteModal(Number(item.dataset.noteId || id), item.dataset.noteTitle, item.dataset.noteContent, item.dataset.projectId ? Number(item.dataset.projectId) : null);
                } else if (type === 'mail') {
                    openMailReadModal(Number(item.dataset.mailId || id));
                } else if (type === 'day') {
                    focusWidget('calendar');
                    jumpToTimelineDate(id || item.dataset.dayDate || item.dataset.date || 'today');
                }
            }
        }, true);



        // Close context menu on scroll
        window.addEventListener('scroll', () => closeContextMenu(), true);



        window.addEventListener('touchstart', handleSwipeStart, { passive: true });


        window.addEventListener('touchend', handleSwipeEnd, { passive: true });


        window.addEventListener('touchcancel', handleSwipeEnd, { passive: true });


        window.addEventListener('mousedown', handleSwipeStart);



        function renderSwipeLinkWrapper(innerHtml, label, type, id, extraClasses = '', extraStyles = '', wrapperStyles = '', extraDataAttrs = '') {
            const escLabel = escapeHtml(label || '').replace(/"/g, '&quot;');
            const isSel = (typeof isItemSelected === 'function') && isItemSelected(type, id);
            const selClass = isSel ? 'is-selected' : '';
            return `
                <div class="swipe-link-wrapper" style="${wrapperStyles}">
                    <div class="swipe-link-bg">
                        <span class="swipe-link-icon">🔗</span>
                        <span class="swipe-link-text">Link</span>
                    </div>
                    <div class="swipe-link-item ${extraClasses} ${selClass}" data-swipe-link="true" data-context-type="${type}" data-link-label="${escLabel}" data-link-type="${type}" data-link-id="${id}" ${extraDataAttrs} style="${extraStyles}">
                        ${innerHtml}
                    </div>
                </div>
            `;
        }


        window.renderSwipeLinkWrapper = renderSwipeLinkWrapper;



        // ==========================================
        // Universal Multi-Selection System
        // ==========================================
        let currentSelectionType = null;


        let selectedItemIds = new Set();


        let selectedItemMeta = new Map();



        function isItemSelected(type, id) {
            if (!currentSelectionType || currentSelectionType !== type || id === undefined || id === null) return false;
            return selectedItemIds.has(id) || selectedItemIds.has(String(id)) || (!isNaN(Number(id)) && selectedItemIds.has(Number(id)));
        }


        window.isItemSelected = isItemSelected;



        function startSelectionMode(type, id, extraData = {}) {
            if (!type || id === undefined || id === null) return;
            const normId = !isNaN(Number(id)) && String(id).trim() !== '' ? Number(id) : String(id);

            if (currentSelectionType !== type) {
                selectedItemIds.clear();
                selectedItemMeta.clear();
            }

            currentSelectionType = type;
            selectedItemIds.add(normId);
            const label = extraData.linkLabel || extraData.taskTitle || extraData.eventTitle || extraData.mailSubject || extraData.noteTitle || extraData.personName || extraData.timerTitle || extraData.journalTitle || extraData.projectName || 'Element';
            selectedItemMeta.set(normId, { label, type, extraData });

            if (navigator.vibrate) navigator.vibrate(30);
            updateSelectionUI();
        }


        window.startSelectionMode = startSelectionMode;


        window.startMailSelectionMode = (id) => startSelectionMode('mail', id);



        function toggleSelectionItem(type, id, extraData = {}) {
            if (!type || id === undefined || id === null) return;
            const normId = !isNaN(Number(id)) && String(id).trim() !== '' ? Number(id) : String(id);

            if (currentSelectionType !== type) {
                startSelectionMode(type, id, extraData);
                return;
            }

            const isAlreadySelected = selectedItemIds.has(normId) ||
                selectedItemIds.has(String(normId)) ||
                (!isNaN(Number(normId)) && selectedItemIds.has(Number(normId)));

            if (isAlreadySelected) {
                selectedItemIds.delete(normId);
                selectedItemIds.delete(String(normId));
                if (!isNaN(Number(normId))) selectedItemIds.delete(Number(normId));
                selectedItemMeta.delete(normId);
                selectedItemMeta.delete(String(normId));
                if (!isNaN(Number(normId))) selectedItemMeta.delete(Number(normId));
            } else {
                selectedItemIds.add(normId);
                const label = extraData.linkLabel || extraData.taskTitle || extraData.eventTitle || extraData.mailSubject || extraData.noteTitle || extraData.personName || extraData.timerTitle || extraData.journalTitle || extraData.projectName || 'Element';
                selectedItemMeta.set(normId, { label, type, extraData });
                if (navigator.vibrate) navigator.vibrate(20);
            }

            if (selectedItemIds.size === 0) {
                exitSelectionMode();
                return;
            }

            updateSelectionUI();
        }


        window.toggleSelectionItem = toggleSelectionItem;


        window.toggleMailSelection = (id) => toggleSelectionItem('mail', id);



        function exitSelectionMode() {
            currentSelectionType = null;
            selectedItemIds.clear();
            selectedItemMeta.clear();
            document.body.classList.remove('entity-selection-active', 'mail-selection-active');

            document.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));

            const normalNav = document.getElementById('normal-nav-buttons');
            const selBar = document.getElementById('universal-selection-action-bar');
            if (normalNav) normalNav.style.display = 'grid';
            if (selBar) {
                selBar.style.display = 'none';
                selBar.innerHTML = '';
            }
        }


        window.exitSelectionMode = exitSelectionMode;


        window.exitMailSelectionMode = exitSelectionMode;



        function updateSelectionUI() {
            if (!currentSelectionType || selectedItemIds.size === 0) {
                exitSelectionMode();
                return;
            }

            document.body.classList.add('entity-selection-active');
            if (currentSelectionType === 'mail') {
                document.body.classList.add('mail-selection-active');
            } else {
                document.body.classList.remove('mail-selection-active');
            }

            const normalNav = document.getElementById('normal-nav-buttons');
            const selBar = document.getElementById('universal-selection-action-bar');

            if (normalNav) normalNav.style.display = 'none';
            if (selBar) {
                selBar.style.display = 'grid';
                renderSelectionActionBar(currentSelectionType, selectedItemIds.size);
            }

            document.querySelectorAll('.swipe-link-item').forEach(item => {
                const itemType = item.dataset.contextType || item.dataset.linkType;
                const itemIdRaw = item.dataset.linkId || item.dataset.mailId || item.dataset.taskId || item.dataset.eventId || item.dataset.personId || item.dataset.timerId || item.dataset.noteId || item.dataset.projectId || item.dataset.dayDate || item.dataset.date;

                const isSel = (itemType === currentSelectionType) && (
                    selectedItemIds.has(itemIdRaw) ||
                    selectedItemIds.has(String(itemIdRaw)) ||
                    (!isNaN(Number(itemIdRaw)) && selectedItemIds.has(Number(itemIdRaw)))
                );

                if (isSel) {
                    item.classList.add('is-selected');
                } else {
                    item.classList.remove('is-selected');
                }
            });
        }


        window.updateSelectionUI = updateSelectionUI;


        window.updateMailSelectionUI = updateSelectionUI;



        function renderSelectionActionBar(type, count) {
            const selBar = document.getElementById('universal-selection-action-bar');
            if (!selBar) return;

            // Clean Lucide SVG icons matching the main navigation bar
            const ICONS = {
                cancel: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
                tag: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`,
                person: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`,
                link: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
                trash: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
                check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
                playPause: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
                reset: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
                star: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
                eventPlus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="14" x2="12" y2="18"></line><line x1="10" y1="16" x2="14" y2="16"></line></svg>`,
                taskPlus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
                focus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>`
            };

            const cancelBtnHtml = `
                <button type="button" onclick="exitSelectionMode()" class="plugin-nav-btn sel-action-btn cancel-btn" title="Auswahl aufheben">
                    ${ICONS.cancel}
                    <span class="badge" style="display: flex;">${count}</span>
                </button>
            `;

            const normType = String(type || '').toLowerCase().trim();
            let options = [];

            if (normType === 'mail') {
                options = [
                    `<button type="button" onclick="openCategoryModalForSelection()" class="plugin-nav-btn sel-action-btn" title="Kategorie(n) zuweisen">${ICONS.tag}</button>`,
                    `<button type="button" onclick="openPersonModalForSelection()" class="plugin-nav-btn sel-action-btn" title="Person zuordnen">${ICONS.person}</button>`,
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="deleteSelectionItems()" class="plugin-nav-btn sel-action-btn delete-btn" title="Ausgewählte E-Mails löschen">${ICONS.trash}</button>`
                ];
            } else if (normType === 'task' || normType === 'tasks') {
                options = [
                    `<button type="button" onclick="toggleTasksCompletionForSelection()" class="plugin-nav-btn sel-action-btn" title="Aufgaben als erledigt / offen markieren">${ICONS.check}</button>`,
                    `<button type="button" onclick="openPersonModalForSelection()" class="plugin-nav-btn sel-action-btn" title="Person zuordnen">${ICONS.person}</button>`,
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="deleteSelectionItems()" class="plugin-nav-btn sel-action-btn delete-btn" title="Ausgewählte Aufgaben löschen">${ICONS.trash}</button>`
                ];
            } else if (normType === 'event' || normType === 'calendar') {
                options = [
                    `<button type="button" onclick="openPersonModalForSelection()" class="plugin-nav-btn sel-action-btn" title="Person verknüpfen">${ICONS.person}</button>`,
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="deleteSelectionItems()" class="plugin-nav-btn sel-action-btn delete-btn" title="Ausgewählte Termine löschen">${ICONS.trash}</button>`
                ];
            } else if (normType === 'timer') {
                options = [
                    `<button type="button" onclick="toggleTimersForSelection()" class="plugin-nav-btn sel-action-btn" title="Timer starten / pausieren">${ICONS.playPause}</button>`,
                    `<button type="button" onclick="resetTimersForSelection()" class="plugin-nav-btn sel-action-btn" title="Timer zurücksetzen">${ICONS.reset}</button>`,
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="deleteSelectionItems()" class="plugin-nav-btn sel-action-btn delete-btn" title="Ausgewählte Timer löschen">${ICONS.trash}</button>`
                ];
            } else if (normType === 'person' || normType === 'memory') {
                options = [
                    `<button type="button" onclick="toggleFavoriteForSelection()" class="plugin-nav-btn sel-action-btn" title="Zu Favoriten hinzufügen / entfernen">${ICONS.star}</button>`,
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="deleteSelectionItems()" class="plugin-nav-btn sel-action-btn delete-btn" title="Ausgewählte Personen löschen">${ICONS.trash}</button>`
                ];
            } else if (normType === 'day') {
                options = [
                    `<button type="button" onclick="openNewEventForSelectedDay()" class="plugin-nav-btn sel-action-btn" title="Neuer Termin an diesem Tag">${ICONS.eventPlus}</button>`,
                    `<button type="button" onclick="openNewTaskForSelectedDay()" class="plugin-nav-btn sel-action-btn" title="Neue Aufgabe an diesem Tag">${ICONS.taskPlus}</button>`,
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Tag(e) im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="jumpToSelectedDay()" class="plugin-nav-btn sel-action-btn" title="Zum Tag in der Timeline scrollen">${ICONS.focus}</button>`
                ];
            } else if (normType === 'note' || normType === 'journal' || normType === 'project') {
                options = [
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="deleteSelectionItems()" class="plugin-nav-btn sel-action-btn delete-btn" title="Löschen">${ICONS.trash}</button>`
                ];
            } else {
                // Generischer Fallback für beliebige andere Entitätstypen
                options = [
                    `<button type="button" onclick="linkSelectionIntoChat()" class="plugin-nav-btn sel-action-btn" title="Im Chat verlinken">${ICONS.link}</button>`,
                    `<button type="button" onclick="deleteSelectionItems()" class="plugin-nav-btn sel-action-btn delete-btn" title="Löschen">${ICONS.trash}</button>`
                ];
            }

            // Exakt 6 Slots wie im normalen Nav-Menü:
            // Slot 1: Immer Abbruch-Button ganz links
            // Slot 2 bis (6 - options.length): Lücke / Abstand
            // Letzte Slots: Aktionen rechtsbündig
            const gapCount = Math.max(0, 5 - options.length);
            const gapHtml = '<div class="sel-slot-spacer"></div>'.repeat(gapCount);

            selBar.innerHTML = cancelBtnHtml + gapHtml + options.join('');
        }



        // ==========================================
        // Action Handlers across Entity Types
        // ==========================================
        function openNewEventForSelectedDay() {
            if (selectedItemIds.size === 0) return;
            const firstId = Array.from(selectedItemIds)[0];
            const meta = selectedItemMeta.get(firstId) || {};
            const dayDate = meta?.extraData?.dayDate || meta?.extraData?.date || String(firstId);
            exitSelectionMode();
            openEventEditModal(null, '', dayDate ? `${dayDate}T10:00:00` : '', dayDate ? `${dayDate}T11:00:00` : '', false, '', '', false, dayDate);
        }


        window.openNewEventForSelectedDay = openNewEventForSelectedDay;



        function openNewTaskForSelectedDay() {
            if (selectedItemIds.size === 0) return;
            const firstId = Array.from(selectedItemIds)[0];
            const meta = selectedItemMeta.get(firstId) || {};
            const dayDate = meta?.extraData?.dayDate || meta?.extraData?.date || String(firstId);
            exitSelectionMode();
            openTaskModal(null, '', '', dayDate, 'Standard', 'none', null);
        }


        window.openNewTaskForSelectedDay = openNewTaskForSelectedDay;



        function jumpToSelectedDay() {
            if (selectedItemIds.size === 0) return;
            const firstId = Array.from(selectedItemIds)[0];
            const meta = selectedItemMeta.get(firstId) || {};
            const dayDate = meta?.extraData?.dayDate || meta?.extraData?.date || String(firstId);
            exitSelectionMode();
            if (typeof jumpToTimelineDate === 'function') {
                jumpToTimelineDate(dayDate);
            }
        }


        window.jumpToSelectedDay = jumpToSelectedDay;



        function linkSelectionIntoChat() {
            if (selectedItemIds.size === 0) return;
            selectedItemIds.forEach(id => {
                const meta = selectedItemMeta.get(id) || {};
                const label = meta.label || 'Element';
                const type = meta.type || currentSelectionType || 'item';
                insertEntityLinkIntoChat(label, type, id);
            });
            exitSelectionMode();
            if (document.body.classList.contains('mobile-mode')) {
                switchMobileView('chat');
            }
        }


        window.linkSelectionIntoChat = linkSelectionIntoChat;


        window.linkSelectedMailsIntoChat = linkSelectionIntoChat;



        async function toggleSelectionReadStatus() {
            if (selectedItemIds.size === 0 || currentSelectionType !== 'mail') return;
            const ids = Array.from(selectedItemIds).map(Number);
            try {
                let anyUnread = false;
                ids.forEach(id => {
                    const card = document.querySelector(`.swipe-link-item[data-link-id="${id}"], .swipe-link-item[data-mail-id="${id}"]`);
                    if (card && card.dataset.mailIsRead === 'false') anyUnread = true;
                });
                const newReadStatus = anyUnread;

                const res = await fetch(getApiUrl('/api/mail/messages/batch-read'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids, isRead: newReadStatus })
                });
                if (res.ok) {
                    if (newReadStatus) {
                        ids.forEach(id => dismissMailNotification(id));
                    }
                    exitSelectionMode();
                    loadTopWidgets();
                }
            } catch (err) {
                console.error("Fehler beim Ändern des Gelesen-Status:", err);
            }
        }


        window.toggleSelectionReadStatus = toggleSelectionReadStatus;


        window.toggleSelectedMailsReadStatus = toggleSelectionReadStatus;



        async function toggleTasksCompletionForSelection() {
            if (selectedItemIds.size === 0 || currentSelectionType !== 'task') return;
            const ids = Array.from(selectedItemIds);
            try {
                let anyIncomplete = false;
                ids.forEach(id => {
                    const el = document.querySelector(`.swipe-link-item[data-link-id="${id}"], .swipe-link-item[data-task-id="${id}"]`);
                    if (el && el.dataset.taskCompleted !== 'true') anyIncomplete = true;
                });
                const newCompleted = anyIncomplete;

                await Promise.all(ids.map(id => callTool('aktualisiere_aufgabe', { id: String(id), completed: newCompleted })));
                exitSelectionMode();
                loadTopWidgets();
            } catch (err) {
                console.error("Fehler beim Aktualisieren der Aufgaben:", err);
                alert("Fehler beim Aktualisieren der Aufgaben.");
            }
        }


        window.toggleTasksCompletionForSelection = toggleTasksCompletionForSelection;



        async function toggleFavoriteForSelection() {
            if (selectedItemIds.size === 0 || currentSelectionType !== 'person') return;
            const ids = Array.from(selectedItemIds).map(Number).filter(n => !isNaN(n));
            try {
                let anyNonFavorite = false;
                ids.forEach(id => {
                    const el = document.querySelector(`.swipe-link-item[data-link-id="${id}"], .swipe-link-item[data-person-id="${id}"]`);
                    if (el) {
                        if (el.dataset.personIsFavorite !== 'true') anyNonFavorite = true;
                    } else if (currentMemoryPeopleList) {
                        const p = currentMemoryPeopleList.find(x => Number(x.id) === Number(id));
                        if (p && !p.isFavorite) anyNonFavorite = true;
                    }
                });
                const newFavStatus = anyNonFavorite;

                const res = await fetch(getApiUrl('/api/memory/people/batch-favorite'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids, isFavorite: newFavStatus })
                });

                if (res.ok) {
                    if (currentMemoryPeopleList && currentMemoryPeopleList.length > 0) {
                        ids.forEach(id => {
                            const p = currentMemoryPeopleList.find(x => Number(x.id) === Number(id));
                            if (p) p.isFavorite = newFavStatus;
                        });
                        renderFilteredPeopleList();
                    }
                    if (navigator.vibrate) navigator.vibrate(25);
                    exitSelectionMode();
                    loadTopWidgets();
                } else {
                    const err = await res.json();
                    alert("Fehler beim Aktualisieren des Favoritenstatus: " + (err.error || "Unbekannter Fehler"));
                }
            } catch (err) {
                console.error("Fehler beim Umschalten der Favoriten:", err);
                alert("Fehler beim Umschalten der Favoriten: " + err.message);
            }
        }


        window.toggleFavoriteForSelection = toggleFavoriteForSelection;


        window.toggleSelectedPeopleFavorite = toggleFavoriteForSelection;



        function toggleTimersForSelection() {
            if (selectedItemIds.size === 0 || currentSelectionType !== 'timer') return;
            selectedItemIds.forEach(id => {
                if (typeof toggleTimer === 'function') toggleTimer(Number(id));
            });
            exitSelectionMode();
        }


        window.toggleTimersForSelection = toggleTimersForSelection;



        function resetTimersForSelection() {
            if (selectedItemIds.size === 0 || currentSelectionType !== 'timer') return;
            selectedItemIds.forEach(id => {
                if (typeof resetTimer === 'function') resetTimer(Number(id));
            });
            exitSelectionMode();
        }


        window.resetTimersForSelection = resetTimersForSelection;



        async function deleteSelectionItems() {
            if (selectedItemIds.size === 0) return;
            const count = selectedItemIds.size;
            const typeName = currentSelectionType === 'mail' ? 'E-Mail(s)' : (currentSelectionType === 'task' ? 'Aufgabe(n)' : (currentSelectionType === 'event' ? 'Termin(e)' : (currentSelectionType === 'timer' ? 'Timer' : (currentSelectionType === 'person' ? 'Person(en)' : 'Element(e)'))));
            if (!confirm(`Möchtest du die ${count} ausgewählte(n) ${typeName} wirklich löschen?`)) return;

            const ids = Array.from(selectedItemIds);
            const type = currentSelectionType;

            try {
                if (type === 'mail') {
                    await fetch(getApiUrl('/api/mail/messages/batch-delete'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: ids.map(Number) })
                    });
                } else if (type === 'task') {
                    await Promise.all(ids.map(id => callTool('loesche_aufgabe', { id: String(id) })));
                } else if (type === 'note') {
                    await Promise.all(ids.map(id => callTool('loesche_notiz', { id: Number(id) })));
                } else if (type === 'timer') {
                    ids.forEach(id => {
                        stopAlarmSound();
                        cancelScheduledTimerAlarm(Number(id));
                    });
                    await Promise.all(ids.map(id => callTool('loesche_timer', { id: Number(id) })));
                } else if (type === 'person') {
                    await Promise.all(ids.map(id => typeof window.deletePerson === 'function' ? window.deletePerson(Number(id)) : null));
                } else if (type === 'event') {
                    await Promise.all(ids.map(id => {
                        const meta = selectedItemMeta.get(id);
                        const eventDate = meta?.extraData?.eventDate || '';
                        const isRec = meta?.extraData?.eventIsRec === 'true';
                        return typeof deleteCalendarEvent === 'function' ? deleteCalendarEvent(id, eventDate, isRec) : null;
                    }));
                } else if (type === 'journal') {
                    await Promise.all(ids.map(id => {
                        const meta = selectedItemMeta.get(id);
                        const jDate = meta?.extraData?.journalDate || '';
                        return typeof deleteJournalEntry === 'function' ? deleteJournalEntry(id, jDate) : null;
                    }));
                }

                exitSelectionMode();
                loadTopWidgets();
            } catch (err) {
                console.error("Fehler beim Löschen:", err);
                alert("Fehler beim Löschen der Elemente.");
            }
        }


        window.deleteSelectionItems = deleteSelectionItems;


        window.deleteSelectedMails = deleteSelectionItems;



        function openCategoryModalForSelection() {
            if (selectedItemIds.size === 0) return;
            openMailCategorySelectModal(Array.from(selectedItemIds));
        }


        window.openCategoryModalForSelection = openCategoryModalForSelection;



        function openPersonModalForSelection() {
            if (selectedItemIds.size === 0) return;
            openMailPersonSelectModal(Array.from(selectedItemIds));
        }


        window.openPersonModalForSelection = openPersonModalForSelection;