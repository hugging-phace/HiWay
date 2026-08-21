const { contextBridge, ipcRenderer } = require('electron');
const { createXlsx } = require('@litejs/xlsx');

contextBridge.exposeInMainWorld('hiwayAPI', {
  platform: process.platform,
  getUsers: () => ipcRenderer.invoke('api:getUsers'),
  saveUsers: (users) => ipcRenderer.invoke('api:saveUsers', users),
  getData: () => ipcRenderer.invoke('api:getData'),
  saveData: (data) => ipcRenderer.invoke('api:saveData', data),
  saveBackup: (data, suggestedName) => ipcRenderer.invoke('api:saveBackup', data, suggestedName),
  showNotification: (title, body) => ipcRenderer.invoke('api:showNotification', title, body),
  openBackup: () => ipcRenderer.invoke('api:openBackup'),
  windowAction: (action) => ipcRenderer.invoke('api:windowAction', action),
  isMaximized: () => ipcRenderer.invoke('api:isMaximized'),
  onMaximized: (cb) => ipcRenderer.on('window:maximize', () => cb()),
  onUnmaximized: (cb) => ipcRenderer.on('window:unmaximize', () => cb()),
  setTitleBarOverlay: (options) => ipcRenderer.invoke('api:setTitleBarOverlay', options),
  focusFix: () => ipcRenderer.invoke('api:focusFix')
});

contextBridge.exposeInMainWorld('createXlsx', (workbook) => createXlsx(workbook));
