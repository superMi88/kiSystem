

        // Settings laden
        async function loadSettings() {
            try {
                let settings = { hotkey: 'Ctrl+Shift+Space', autostart: false };
                try {
                    const res = await fetch(getApiUrl('/settings'));
                    if (res.ok) {
                        settings = await res.json();
                    }
                } catch (err) {
                    console.warn("Konnte Einstellungen nicht vom Server laden:", err);
                }
                
                currentHotkey = settings.hotkey || 'Ctrl+Shift+Space';
                tempHotkey = currentHotkey;
                hotkeyBtn.textContent = currentHotkey;
                
                const autostartCheckbox = document.getElementById('autostart-checkbox');
                if (autostartCheckbox) {
                    autostartCheckbox.checked = settings.autostart === true;
                }
                
                const modelSelect = document.getElementById('settings-ai-model');
                if (modelSelect) {
                    modelSelect.value = settings.aiModel || 'gemini-3.5-flash';
                }

                try {
                    const pRes = await fetch(getApiUrl('/settings/plugins'));
                    if (pRes.ok) {
                        const plugins = await pRes.json();
                        if (typeof renderPluginsSettings === 'function') {
                            renderPluginsSettings(plugins);
                        }
                    }
                } catch (err) {
                    console.warn("Konnte Plugins-Liste nicht vom Server laden:", err);
                }

                // Registrierte KI-Tools Übersicht laden
                if (typeof loadRegisteredToolsOverview === 'function') {
                    loadRegisteredToolsOverview();
                }
                if (typeof loadAgentSettingsUI === 'function') {
                    loadAgentSettingsUI();
                }
            } catch (e) {
                console.error("Fehler beim Laden der Einstellungen:", e);
            }
            syncWidgetSettings();
        }



        function getWidgetSettingsPlugin() {
            if (!window.Capacitor) return null;
            if (window.Capacitor.Plugins && window.Capacitor.Plugins.WidgetSettings) {
                return window.Capacitor.Plugins.WidgetSettings;
            }
            if (typeof window.Capacitor.registerPlugin === 'function') {
                try {
                    const plugin = window.Capacitor.registerPlugin('WidgetSettings');
                    if (!window.Capacitor.Plugins) window.Capacitor.Plugins = {};
                    window.Capacitor.Plugins.WidgetSettings = plugin;
                    return plugin;
                } catch (e) {
                    console.error("Fehler beim Registrieren von WidgetSettings Plugin:", e);
                }
            }
            return null;
        }



        function syncWidgetSettings() {
            const serverUrl = getServerUrl();
            const username = localStorage.getItem('api_username') || '';
            const password = localStorage.getItem('api_password') || '';

            if (!username) {
                console.warn("syncWidgetSettings: Kein Benutzername vorhanden, abgebrochen um Ausloeschen der native SharedPreferences zu verhindern.");
                return;
            }

            localStorage.setItem('api_server_url', serverUrl);
            localStorage.setItem('api_username', username);
            localStorage.setItem('api_password', password);

            if (window.AndroidWidgetInterface && typeof window.AndroidWidgetInterface.saveWidgetSettings === 'function') {
                try {
                    window.AndroidWidgetInterface.saveWidgetSettings(username, password, serverUrl);
                    console.log("Direct AndroidWidgetInterface sync success:", username);
                } catch (e) {
                    console.error("AndroidWidgetInterface error:", e);
                }
            }

            const plugin = getWidgetSettingsPlugin();
            if (plugin) {
                try {
                    plugin.saveSettings({
                        username: username,
                        password: password,
                        serverUrl: serverUrl,
                        api_username: username,
                        api_password: password,
                        server_url: serverUrl
                    });
                } catch (e) {
                    console.error("Widget-Settings Sync Fehler:", e);
                }
            } else if (window.Capacitor) {
                setTimeout(syncWidgetSettings, 500);
            }
        }