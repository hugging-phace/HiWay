const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', path.join(app.getPath('appData'), 'hiway'));
const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'hiway-data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const usersFile = path.join(dataDir, 'users.json');
const dataFile = path.join(dataDir, 'appdata.json');

if (process.platform === 'win32') app.setAppUserModelId('com.onward.hiway');

function readJSON(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const iconPath = path.join(__dirname, 'build/icon.png');
let mainWindow = null;

function getAllData() {
  let raw = readJSON(dataFile, {});
  if (raw && (Array.isArray(raw.tasks) || Array.isArray(raw.projects) || raw.theme)) {
    raw = { _legacy: raw };
  }
  return raw;
}

function saveAllData(data) {
  writeJSON(dataFile, data);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: Math.min(1400, width - 100),
    height: Math.min(900, height - 100),
    minWidth: 1000,
    minHeight: 700,
    title: 'Onward',
    titleBarStyle: 'default',
    trafficLightPosition: undefined,
    transparent: false,
    frame: true,
    roundedCorners: true,
    titleBarOverlay: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0c15',
    show: false,
    icon: process.platform === 'darwin' ? undefined : iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      allowRunningInsecureContent: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  win.on('maximize', () => win.webContents.send('window:maximize'));
  win.on('unmaximize', () => win.webContents.send('window:unmaximize'));

  mainWindow = win;
  win.on('closed', () => { mainWindow = null; });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('api:getUsers', () => readJSON(usersFile, {}));
ipcMain.handle('api:saveUsers', (event, users) => { writeJSON(usersFile, users); return true; });
ipcMain.handle('api:getData', () => getAllData());
ipcMain.handle('api:saveData', (event, data) => { saveAllData(data); return true; });

ipcMain.handle('api:showNotification', (event, title, body) => {
  try {
    if (Notification.isSupported && Notification.isSupported()) {
      new Notification({ title, body, icon: iconPath }).show();
    }
  } catch (e) {}
  return true;
});

ipcMain.handle('api:saveBackup', async (event, data, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Onward backup',
    defaultPath: suggestedName || `onward-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON backups', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { canceled: true };
  fs.writeFileSync(filePath, data);
  return { canceled: false, filePath };
});

ipcMain.handle('api:openBackup', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Restore Onward backup',
    filters: [{ name: 'JSON backups', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths || !filePaths.length) return { canceled: true };
  const filePath = filePaths[0];
  const data = fs.readFileSync(filePath, 'utf-8');
  return { canceled: false, filePath, data };
});

ipcMain.handle('api:windowAction', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.maximize();
  else if (action === 'unmaximize') win.unmaximize();
  else if (action === 'close') win.close();
});

ipcMain.handle('api:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

ipcMain.handle('api:setTitleBarOverlay', (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    if (win && process.platform === 'win32' && win.setTitleBarOverlay) {
      win.setTitleBarOverlay(options);
    }
  } catch (e) {}
  return true;
});
