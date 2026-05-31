const { app, BrowserWindow, Tray, Menu, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const fs = require('fs');

const settingsPath = path.join(__dirname, 'settings.json');

function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {
    console.error('Fehler beim Lesen der Einstellungen:', e);
  }
  return { hotkey: 'Ctrl+Shift+Space', disabledPlugins: [] };
}

let isHiding = false;

function toggleWindow() {
  if (!mainWindow) return;
  
  if (isHiding) {
    // Wenn das Fenster gerade schließt, brechen wir das Schließen ab,
    // zeigen es sofort wieder an und stellen die aktive Klasse wieder her.
    console.log('Abbruch des Schließens. Zeige beide Fenster sofort wieder an.');
    isHiding = false;
    mainWindow.show();
    if (pluginsWindow) pluginsWindow.show();
    mainWindow.webContents.executeJavaScript('document.body.classList.add("active")');
    if (pluginsWindow) pluginsWindow.webContents.executeJavaScript('document.body.classList.add("active")');
    return;
  }
  
  if (mainWindow.isVisible()) {
    hideWindowWithAnimation();
  } else {
    mainWindow.show();
    if (pluginsWindow) pluginsWindow.show();
    setTimeout(() => {
      if (mainWindow) mainWindow.webContents.executeJavaScript('document.body.classList.add("active")');
      if (pluginsWindow) pluginsWindow.webContents.executeJavaScript('document.body.classList.add("active")');
    }, 50);
  }
}

function registerGlobalHotkey() {
  const settings = getSettings();
  const hotkey = settings.hotkey || 'Ctrl+Shift+Space';
  
  // Zuerst alle entregistrieren, um Konflikte zu vermeiden
  globalShortcut.unregisterAll();
  
  console.log(`Versuche globalen Hotkey zu registrieren: ${hotkey}`);
  try {
    const ret = globalShortcut.register(hotkey, () => {
      console.log(`Hotkey ${hotkey} gedrückt!`);
      toggleWindow();
    });
    
    if (!ret) {
      console.error(`Hotkey-Registrierung fehlgeschlagen für: ${hotkey}`);
    } else {
      console.log(`Hotkey erfolgreich registriert!`);
    }
  } catch (err) {
    console.error(`Fehler bei Hotkey-Registrierung:`, err);
  }
}

// IPC für Hotkey Neu-Registrierung
ipcMain.on('reload-hotkey', () => {
  console.log('Neu-Registrierung des Hotkeys angefordert...');
  registerGlobalHotkey();
  if (mainWindow) mainWindow.webContents.send('settings-updated');
  if (pluginsWindow) pluginsWindow.webContents.send('settings-updated');
});

// IPC zum Testen von Hotkeys vor dem Speichern
ipcMain.handle('register-hotkey-test', async (event, hotkey) => {
  try {
    console.log(`Testen des Hotkeys: ${hotkey}`);
    
    // Falls leer oder ungültig
    if (!hotkey) {
      return { success: false, error: 'Keine Tastenkombination angegeben.' };
    }

    // Prüfen ob bereits registriert
    const isRegistered = globalShortcut.isRegistered(hotkey);
    if (isRegistered) {
      // Wenn es unser eigener Hotkey ist, ist es in Ordnung
      const currentHotkey = getSettings().hotkey;
      if (hotkey.toLowerCase() === currentHotkey.toLowerCase()) {
        return { success: true };
      }
      return { success: false, error: 'Tastenkombination ist bereits belegt.' };
    }
    
    // Versuchsweise registrieren und sofort wieder freigeben
    const success = globalShortcut.register(hotkey, () => {});
    if (success) {
      globalShortcut.unregister(hotkey);
      // Den regulären Hotkey wiederherstellen
      registerGlobalHotkey();
      return { success: true };
    } else {
      return { success: false, error: 'Tastenkombination konnte nicht registriert werden.' };
    }
  } catch (err) {
    return { success: false, error: err.message || 'Ungültige Tastenkombination.' };
  }
});

let mainWindow;
let pluginsWindow;
let tray;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  console.log('Erstelle beide Fenster...');

  // 1. Chat-Fenster (Rechts, 450px)
  mainWindow = new BrowserWindow({
    width: 450,
    height: height,
    x: width - 450,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 2. Plugins-Fenster (Links, 450px)
  pluginsWindow = new BrowserWindow({
    width: 450,
    height: height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Öffne DevTools im Entwicklungsmodus
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    pluginsWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Lade die URL des Express-Servers mit Retry-Logik und verschiedenen Hashes
  const loadURL = () => {
    Promise.all([
      mainWindow.loadURL('http://localhost:3001/#chat'),
      pluginsWindow.loadURL('http://localhost:3001/#plugins')
    ]).then(() => {
      console.log('Beide Fenster erfolgreich geladen!');
    }).catch(err => {
      console.log('Server noch nicht bereit, versuche es erneut...');
      setTimeout(loadURL, 1000);
    });
  };

  loadURL();

  // Wenn der Inhalt fertig geladen ist
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Chat-Inhalt geladen.');
    if (mainWindow.isVisible()) {
      mainWindow.webContents.executeJavaScript('document.body.classList.add("active")');
    }
  });

  pluginsWindow.webContents.on('did-finish-load', () => {
    console.log('Plugins-Inhalt geladen.');
    if (pluginsWindow.isVisible()) {
      pluginsWindow.webContents.executeJavaScript('document.body.classList.add("active")');
    }
  });

  // Animation Trigger für Chat
  mainWindow.on('show', () => {
    console.log('Chat-Fenster wird angezeigt...');
    mainWindow.webContents.executeJavaScript('document.body.classList.add("active")');
    mainWindow.focus();
  });

  mainWindow.on('hide', () => {
    console.log('Chat-Fenster versteckt.');
    mainWindow.webContents.executeJavaScript('document.body.classList.remove("active")');
  });

  // Animation Trigger für Plugins
  pluginsWindow.on('show', () => {
    console.log('Plugins-Fenster wird angezeigt...');
    pluginsWindow.webContents.executeJavaScript('document.body.classList.add("active")');
  });

  pluginsWindow.on('hide', () => {
    console.log('Plugins-Fenster versteckt.');
    pluginsWindow.webContents.executeJavaScript('document.body.classList.remove("active")');
  });

  // Schließen wenn man außerhalb klickt (Fokus verliert an Fremdanwendung)
  const handleBlur = () => {
    setTimeout(() => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      if (focusedWin !== mainWindow && focusedWin !== pluginsWindow) {
        console.log('Fokus verloren an externe App, verstecke beide Fenster...');
        hideWindowWithAnimation();
      }
    }, 100);
  };

  mainWindow.on('blur', handleBlur);
  pluginsWindow.on('blur', handleBlur);
}

function hideWindowWithAnimation() {
  if (mainWindow && mainWindow.isVisible() && !isHiding) {
    isHiding = true;
    mainWindow.webContents.executeJavaScript('document.body.classList.remove("active")');
    if (pluginsWindow) pluginsWindow.webContents.executeJavaScript('document.body.classList.remove("active")');
    setTimeout(() => {
      if (isHiding) {
        if (mainWindow) mainWindow.hide();
        if (pluginsWindow) pluginsWindow.hide();
      }
      isHiding = false;
    }, 400); // 400ms entspricht der CSS Transition
  }
}

// IPC zum Verstecken des Fensters
ipcMain.on('hide-window', () => {
  console.log('Verstecke Fenster über IPC...');
  hideWindowWithAnimation();
});

function createTray() {
  const iconPath = path.join(__dirname, 'public/icon.png'); 
  console.log('Erstelle Tray mit Icon:', iconPath);
  
  try {
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Anzeigen', click: () => {
          console.log('Tray Menu: Anzeigen geklickt');
          if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.show();
          }
          if (pluginsWindow && !pluginsWindow.isVisible()) {
            pluginsWindow.show();
          }
        }
      },
      { type: 'separator' },
      { label: 'DevTools öffnen', click: () => {
          if (mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
          if (pluginsWindow) pluginsWindow.webContents.openDevTools({ mode: 'detach' });
        }
      },
      { type: 'separator' },
      { label: 'Beenden', click: () => app.quit() }
    ]);

    tray.setToolTip('kiSystem - Gemini Light');
    tray.setContextMenu(contextMenu);

    // Klick auf das Icon toggelt das Fenster
    tray.on('click', () => {
      console.log('Tray Icon geklickt.');
      toggleWindow();
    });
  } catch (err) {
    console.error('Fehler beim Erstellen des Tray-Icons:', err);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerGlobalHotkey(); // Globaler Hotkey registrieren beim Start

  // Automatisch anzeigen beim Start für bessere Rückmeldung
  setTimeout(() => {
    console.log('Automatischer Start-Show...');
    mainWindow.show();
  }, 2000);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  // Alle globalen Hotkeys entregistrieren
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
