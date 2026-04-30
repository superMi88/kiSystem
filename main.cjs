const { app, BrowserWindow, Tray, Menu, screen } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;
let tray;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  // Side Panel Window
  mainWindow = new BrowserWindow({
    width: 450,
    height: height,
    x: width - 450,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Lade die URL des Express-Servers
  mainWindow.loadURL('http://localhost:3001');

  // Animation Trigger
  mainWindow.on('show', () => {
    mainWindow.webContents.executeJavaScript('document.body.classList.add("active")');
  });

  // Verstecken, wenn der Fokus verloren geht
  mainWindow.on('blur', () => {
    mainWindow.webContents.executeJavaScript('document.body.classList.remove("active")');
    setTimeout(() => {
      mainWindow.hide();
    }, 400); // Warte bis Animation fertig ist
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'public/icon.png'); 
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Anzeigen', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() }
  ]);

  tray.setToolTip('kiSystem - Gemini Light');
  tray.setContextMenu(contextMenu);

  // Klick auf das Icon toggelt das Fenster
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
