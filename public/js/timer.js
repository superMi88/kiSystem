

        function updateAllCountdowns() {
            document.querySelectorAll('.timer-card').forEach(card => {
                const createdTime = new Date(card.dataset.created).getTime();
                const expiresTime = new Date(card.dataset.expires).getTime();
                const now = Date.now();
                const total = expiresTime - createdTime;
                const remaining = expiresTime - now;

                const countdownEl = card.querySelector('.timer-countdown');
                const progressBar = card.querySelector('.timer-progress-bar');
                const timerId = parseInt(card.id.split('-').pop());
                const titleEl = card.querySelector('span');
                const timerTitle = titleEl ? titleEl.textContent : "Timer";

                if (remaining <= 0) {
                    countdownEl.textContent = "ABGELAUFEN!";
                    countdownEl.style.color = "var(--off)";
                    progressBar.style.width = "100%";
                    progressBar.style.background = "var(--off)";
                    card.style.borderColor = "rgba(243, 139, 168, 0.4)";
                    card.style.background = "rgba(243, 139, 168, 0.05)";
                    card.style.animation = "pulse 1.5s infinite";
                    
                    if (!card.querySelector('.dismiss-btn')) {
                        const dismissBtn = document.createElement('button');
                        dismissBtn.className = 'dismiss-btn';
                        dismissBtn.textContent = 'Bestätigen';
                        dismissBtn.style.cssText = "margin-top: 8px; width: 100%; padding: 6px 8px; background: var(--off); color: #11111b; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: bold; transition: all 0.2s;";
                        dismissBtn.onmouseover = () => { dismissBtn.style.filter = 'brightness(1.1)'; };
                        dismissBtn.onmouseout = () => { dismissBtn.style.filter = 'none'; };
                        dismissBtn.onclick = () => {
                            stopAlarmSound();
                            cancelScheduledTimerAlarm(timerId);
                            callTool('quittiere_timer', { id: timerId });
                        };
                        card.appendChild(dismissBtn);
                        
                        showTimerNotification("Timer abgelaufen! ⏰", `Timer "${timerTitle}" ist abgelaufen.`, timerId);
                        playAlarmSound();
                        const alarmInterval = setInterval(() => {
                            if (document.getElementById(card.id) && card.querySelector('.dismiss-btn')) {
                                playAlarmSound();
                            } else {
                                clearInterval(alarmInterval);
                            }
                        }, 3000);
                    }
                } else {
                    if (!card.dataset.scheduled) {
                        card.dataset.scheduled = "true";
                        if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.scheduleTimerAlarm === 'function') {
                            window.AndroidWidgetInterface.scheduleTimerAlarm(timerId, timerTitle, expiresTime);
                        } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings && typeof window.Capacitor.Plugins.WidgetSettings.scheduleTimerAlarm === 'function') {
                            window.Capacitor.Plugins.WidgetSettings.scheduleTimerAlarm({ timerId, title: timerTitle, triggerAtMillis: expiresTime });
                        }
                    }

                    const secs = Math.floor((remaining / 1000) % 60);
                    const mins = Math.floor((remaining / 1000 / 60) % 60);
                    const hours = Math.floor((remaining / 1000 / 60 / 60) % 24);
                    const days = Math.floor(remaining / 1000 / 60 / 60 / 24);

                    let timeStr = "";
                    if (days > 0) timeStr += `${days}d `;
                    timeStr += `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

                    countdownEl.textContent = timeStr;

                    const elapsed = now - createdTime;
                    const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
                    progressBar.style.width = `${percent}%`;
                }
            });
            updateTimerBadge();
        }