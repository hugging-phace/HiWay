const { contextBridge, ipcRenderer } = require('electron');
const { createXlsx } = require('@litejs/xlsx');

contextBridge.exposeInMainWorld('hiwayAPI', {
  platform: process.platform,
  getUsers: () => ipcRenderer.invoke('api:getUsers'),
  saveUsers: (users) => ipcRenderer.invoke('api:saveUsers', users),
  getData: () => ipcRenderer.invoke('api:getData'),
  saveData: (data) => ipcRenderer.invoke('api:saveData', data)
});

contextBridge.exposeInMainWorld('createXlsx', (workbook) => createXlsx(workbook));
