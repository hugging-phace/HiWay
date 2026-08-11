const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'hiway-data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const usersFile = path.join(dataDir, 'users.json');
const dataFile = path.join(dataDir, 'appdata.json');

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

const iconFile = process.platform === 'darwin' ? 'build/icon-mac.png' : 'build/icon.png';
const iconPath = path.join(__dirname, iconFile);

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1400, width - 100),
    height: Math.min(900, height - 100),
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    transparent: false,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0c15',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      allowRunningInsecureContent: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  if (app.dock) app.dock.setIcon(iconPath);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('api:getUsers', () => readJSON(usersFile, {}));
ipcMain.handle('api:saveUsers', (event, users) => { writeJSON(usersFile, users); return true; });
ipcMain.handle('api:getData', () => readJSON(dataFile, {}));
ipcMain.handle('api:saveData', (event, data) => { writeJSON(dataFile, data); return true; });
