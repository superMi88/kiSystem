const { app, BrowserWindow, Tray, Menu, screen, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;
let tray;
let dropZoneWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  console.log('Erstelle Fenster...');

  mainWindow = new BrowserWindow({
    width: 450,
    height: height,
    x: width - 450,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false, // Auf false gesetzt, damit man sieht, ob es da ist
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Öffne DevTools im Entwicklungsmodus
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Lade die URL des Express-Servers mit Retry-Logik
  const loadURL = () => {
    mainWindow.loadURL('http://localhost:3001').then(() => {
      console.log('Erfolgreich geladen!');
    }).catch(err => {
      console.log('Server noch nicht bereit (Port 3001), versuche es in 1 Sekunde erneut...');
      setTimeout(loadURL, 1000);
    });
  };

  loadURL();

  // Wenn der Inhalt fertig geladen ist
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Inhalt geladen.');
    if (mainWindow.isVisible()) {
      mainWindow.webContents.executeJavaScript('document.body.classList.add("active")');
    }
  });

  // Animation Trigger
  mainWindow.on('show', () => {
    console.log('Fenster wird angezeigt...');
    // Wir stellen sicher, dass die Klasse erst nach dem Show gesetzt wird
    mainWindow.webContents.executeJavaScript('document.body.classList.add("active")');
  });

  mainWindow.on('hide', () => {
    console.log('Fenster versteckt.');
    mainWindow.webContents.executeJavaScript('document.body.classList.remove("active")');
  });

  // Schließen wenn man außerhalb klickt (Fokus verliert)
  mainWindow.on('blur', () => {
    console.log('Fokus verloren, verstecke Fenster...');
    hideWindowWithAnimation();
  });
}

function createDropZoneWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  dropZoneWindow = new BrowserWindow({
    width: 100,
    height: height, // Ganze Höhe
    x: width - 100,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Höchste Ebene für Sichtbarkeit
  dropZoneWindow.setAlwaysOnTop(true, 'screen-saver');

  dropZoneWindow.loadFile(path.join(__dirname, 'public/dropzone.html'));
  
  if (isDev) {
    dropZoneWindow.webContents.openDevTools({ mode: 'detach' });
  }

  dropZoneWindow.showInactive();
  
  // Verhindere, dass das Fenster Fokus klaut
  dropZoneWindow.setIgnoreMouseEvents(false);
}

// IPC für DropZone-Größe
ipcMain.on('resize-dropzone', (event, expand) => {
  if (dropZoneWindow) {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    if (expand) {
      dropZoneWindow.setBounds({
        width: 250, // Breiter beim Ausklappen
        height: height,
        x: width - 250,
        y: 0
      });
    } else {
      dropZoneWindow.setBounds({
        width: 100,
        height: height,
        x: width - 100,
        y: 0
      });
    }
  }
});

function hideWindowWithAnimation() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.webContents.executeJavaScript('document.body.classList.remove("active")');
    setTimeout(() => {
      if (mainWindow) mainWindow.hide();
    }, 400); // 400ms entspricht der CSS Transition
  }
}

// IPC zum Verstecken des Fensters
ipcMain.on('hide-window', () => {
  console.log('Verstecke Fenster über IPC...');
  hideWindowWithAnimation();
});

ipcMain.on('files-dropped', (event, filePaths) => {
  console.log('Dateien im DropZone empfangen:', filePaths);
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.webContents.send('process-dropped-files', filePaths);
  }
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
        }
      },
      { type: 'separator' },
      { label: 'DevTools öffnen', click: () => mainWindow.webContents.openDevTools({ mode: 'detach' }) },
      { type: 'separator' },
      { label: 'Beenden', click: () => app.quit() }
    ]);

    tray.setToolTip('kiSystem - Gemini Light');
    tray.setContextMenu(contextMenu);

    // Klick auf das Icon toggelt das Fenster
    tray.on('click', () => {
      console.log('Tray Icon geklickt.');
      if (mainWindow.isVisible()) {
        hideWindowWithAnimation();
      } else {
        mainWindow.show();
      }
    });
  } catch (err) {
    console.error('Fehler beim Erstellen des Tray-Icons:', err);
  }
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  createDropZoneWindow();

  // Automatisch anzeigen beim Start für bessere Rückmeldung
  setTimeout(() => {
    console.log('Automatischer Start-Show...');
    mainWindow.show();
  }, 2000);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
